import type { SimContext } from "../context.js";
import type { Vec2 } from "../geometry.js";
import { airSectorOf } from "../hq.js";
import type { AirForce } from "./rules.js";
import { cycleMinutes, type AirForceState, type AirTask } from "./plan.js";

/**
 * 要請(docs/air-design.md の3)。地上の指揮官は要請するだけで、航空司令部が今日の計画の中から応えるかを決める。
 * - 事前計画の近接支援(support):来てほしいターンの preplanLeadTurns ターン前までに出す。その時刻に戦場の上にいる攻撃の割り当てのうち、
 *   阻止攻撃・武装偵察(航空司令部の都合の任務)を回す。回せる割合の上限は方針の acceptRequests。その時刻に回せなければ、2ターンまで遅らせる。だめなら断る
 * - 即応(onCall):その空域に、今か1時間の内に上空待機の割り当てがあれば、それを向ける。なければ断る
 * - 偵察(recon):偵察の割り当てを向ける(写真は判読してから届く。AIR4)
 * - 空輸(airlift):輸送機の割り当てを向ける
 * 要請は1日の枠を使う(指揮ポイントとは別枠)。断られても枠は使う(頼んだ手間)
 */

export type AirRequestKind = "support" | "onCall" | "recon" | "airlift";

export interface AirRequest {
  id: string;
  kind: AirRequestKind;
  target: Vec2;
  /** 事前計画の来てほしいターン */
  turn?: number;
  /** 空輸の受け取る部隊 */
  unitId?: string;
  /** pending:次の昼の計画を待っている(夜に出した翌朝の事前計画) */
  status: "accepted" | "delayed" | "refused" | "pending";
  reason?: string;
  /** 応える割り当て */
  taskIds: string[];
  /** 戦場の上に着く時刻(秒) */
  etaSec?: number;
}

const DIVERTIBLE: readonly string[] = ["interdiction", "armedRecon"];
/** 即応の待機を向けられる、今から先の時間(秒) */
const ON_CALL_WINDOW_SEC = 3600;
/** 事前計画を遅らせてよいターン数 */
const DELAY_TURNS = 2;

export function decideRequest(
  force: AirForce,
  st: AirForceState,
  req: { kind: AirRequestKind; target: Vec2; turn?: number; unitId?: string },
  id: string,
  now: { turn: number; turnStartSec: number; timeSec: number },
  ctx: SimContext,
  /** 前の晩に出した事前計画(出したときに間に合っていた)は、前もって出す決まりを見ない */
  opts: { skipLead?: boolean } = {},
): AirRequest {
  const out: AirRequest = { id, ...req, status: "refused", taskIds: [] };
  const lead = ctx.rules.airOps?.requests.preplanLeadTurns ?? 2;
  const free = (t: AirTask) => !t.requestId && t.onStationSec >= now.timeSec;
  const roleOf = (t: AirTask) => ctx.toes.toes[force.squadrons.find((s) => s.id === t.squadron)!.toe]!.air!.role;
  const canDo = (t: AirTask, mission: string) => (ctx.rules.airOps!.roles[roleOf(t)]?.missions ?? []).includes(mission as never);
  const take = (tasks: AirTask[], mission: AirTask["mission"]) => {
    for (const t of tasks) {
      t.requestId = id;
      t.mission = mission;
      t.target = { ...req.target };
      delete t.sector;
      out.taskIds.push(t.id);
    }
    out.etaSec = Math.min(...tasks.map((t) => t.onStationSec));
  };
  if (req.kind === "support") {
    const want = req.turn ?? now.turn + lead;
    if (!opts.skipLead && want < now.turn + lead) {
      out.reason = `事前計画は ${lead} ターン前までに出してください`;
      return out;
    }
    // 方針で回せる上限:今日の攻撃の割り当てのうち acceptRequests の割合まで
    const attack = st.plan.filter((t) => canDo(t, "support"));
    const already = attack.filter((t) => t.requestId).length;
    const cap = Math.floor(attack.length * force.doctrine.acceptRequests) - already;
    if (cap <= 0) {
      out.reason = "航空司令部の方針で、今日はこれ以上の近接支援に回せない";
      return out;
    }
    for (let k = 0; k <= DELAY_TURNS; k++) {
      const from = now.turnStartSec + (want - now.turn + k) * ctx.turnSeconds;
      const to = from + ctx.turnSeconds;
      const pick = st.plan.filter((t) => free(t) && canDo(t, "support") && DIVERTIBLE.includes(t.mission) && t.onStationSec >= from && t.onStationSec < to).slice(0, Math.min(cap, 2));
      if (pick.length) {
        take(pick, "support");
        out.status = k === 0 ? "accepted" : "delayed";
        if (k > 0) out.reason = `${k} ターン遅れる`;
        return out;
      }
    }
    out.reason = "その時刻に回せる攻撃の編隊がない";
    return out;
  }
  if (req.kind === "onCall") {
    const sector = airSectorOf(req.target, ctx);
    const pick = st.plan
      .filter((t) => free(t) && t.mission === "onCall" && t.sector === sector && t.onStationSec <= now.timeSec + ON_CALL_WINDOW_SEC)
      .sort((a, b) => a.onStationSec - b.onStationSec)
      .slice(0, 1);
    // すでに空域の上にいる即応の待機(着いてから離れるまでの間)も向けられる
    const overhead = st.plan.filter((t) => !t.requestId && t.mission === "onCall" && t.sector === sector && t.onStationSec < now.timeSec && t.offStationSec > now.timeSec).slice(0, 1);
    const use = overhead.length ? overhead : pick;
    if (!use.length) {
      out.reason = "その空域に即応の待機がいない";
      return out;
    }
    take(use, "onCall");
    out.status = "accepted";
    return out;
  }
  const mission = req.kind === "recon" ? "recon" : "airlift";
  const pick = st.plan.filter((t) => free(t) && t.mission === mission).sort((a, b) => a.onStationSec - b.onStationSec).slice(0, 1);
  if (!pick.length) {
    out.reason = mission === "recon" ? "偵察の編隊が残っていない" : "輸送機が残っていない";
    return out;
  }
  take(pick, mission);
  out.status = "accepted";
  return out;
}

/** 戦場の上に着くまでの分(基地からの行き) */
export function transitMinutes(force: AirForce, squadronId: string, ctx: SimContext): number {
  return cycleMinutes(force, squadronId, ctx).transit;
}
