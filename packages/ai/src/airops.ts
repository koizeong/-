import { availableAircraft, distance, forecastFlyable, isDarkTurn, isNightTurn, pickSquadron, type HqCommand, type SideView, type SimContext, type Vec2 } from "@brigade/sim-core";
import type { AssaultPlan } from "./assault.js";
import type { Assessment } from "./assess.js";

/**
 * 地上の AI から航空司令部への要請(docs/air-design.md・AIR7)。人間と同じ司令部コマンドを出すだけ。要請は即応と予約だけ:
 * - 即応:交戦中の味方の近くに見えている敵がいて、今飛べて、出せる攻撃機があれば
 * - 予約の攻撃:総攻撃の目標へ、前もって(予報で飛べるターンに)頼んでおく
 * - 予約の偵察:敵が1つも見えていなければ、敵の重心のあたりを撮ってもらう(1日1回)
 * 戦闘機は航空司令部が護衛と迎撃に自動で出すので、頼まない。
 * 1日の枠があれば、その日の残りのターンにならして使う。枠がなければ、出せる攻撃機の編隊の数まで別々の敵へ即応を頼む(1ターンに3つまで)。
 * 要請に使われない攻撃機は、航空司令部が武装偵察に自動で出す。指揮ポイントは使わない(別枠。ユーザー判断)
 */

/** 交戦中とみる距離(m) */
const CONTACT_M = 2500;
/** 1ターンに頼む即応の上限(別々の敵へ。出せる攻撃機の編隊の数まで) */
const ONCALL_PER_TURN = 3;
export function airOpsCommands(view: SideView, a: Assessment, ctx: SimContext, _plan: AssaultPlan | null): HqCommand[] {
  if (!view.airOps || !ctx.rules.airOps) return [];
  const out: HqCommand[] = [];
  const rules = ctx.rules.airOps;
  const seen = a.threats.filter((c) => c.currentLevel > 0);
  const safety = rules.flight.strikeRadiusM + 400;
  const clearOfOwn = (p: Vec2) => !view.own.some((u) => u.strength > 0 && distance(u.pos, p) < safety);
  // その日の残りの昼のターン
  let turnsToday = 1;
  for (let t = view.turn + 1; t <= ctx.scenario.maxTurns && !isNightTurn(ctx.scenario, t); t++) turnsToday++;
  const forces = ctx.scenario.airForces.filter((f) => f.side === view.side);
  for (const force of forces) {
    const st = view.airOps[force.id];
    if (!st) continue;
    // 1日の枠があれば、その日の残りのターンにならす。枠がなければ、出せる攻撃機の編隊の数だけ
    let budget = st.requestsLeft !== undefined ? Math.min(st.requestsLeft, Math.ceil(st.requestsLeft / turnsToday)) : Infinity;
    const request = (c: Omit<Extract<HqCommand, { type: "airRequest" }>, "side" | "type" | "force">) => {
      out.push({ side: view.side, type: "airRequest", force: force.id, ...c });
      budget--;
    };
    const base = force.squadrons[0]?.base ?? "";
    const nowFlyable = !isNightTurn(ctx.scenario, view.turn) && !isDarkTurn(ctx.scenario, view.turn) && forecastFlyable(st, base, view.turn, { current: view.weather, since: 0 }, view.turn, ctx);
    // 即応:見えている敵のうち、味方と接しているもの(敵の推定戦力が大きい順)。今飛べて、出せる攻撃機があるときだけ
    if (budget > 0 && nowFlyable && pickSquadron(force, st, "support", view.time, ctx)) {
      // 出せる攻撃機の編隊の数(枠がなければ、その数まで別々の敵へ頼む)
      const slots = force.squadrons.reduce((n, sq) => {
        const role = ctx.rules.airOps!.roles[ctx.toes.toes[sq.toe]?.air?.role ?? ""];
        return role?.missions.includes("support") ? n + Math.floor(availableAircraft(force, st, sq.id, view.time, ctx) / role.flightSize) : n;
      }, 0);
      const targets = seen
        .filter((c) => view.own.some((u) => u.strength > 0 && distance(u.pos, c.pos) <= CONTACT_M) && clearOfOwn(c.pos))
        .sort((x, y) => (y.estimatedStrength ?? 0.7) * armorWeight(y.branch) - (x.estimatedStrength ?? 0.7) * armorWeight(x.branch) || (x.contactId < y.contactId ? -1 : 1));
      const picked: Vec2[] = [];
      for (const c of targets) {
        if (budget <= 0 || picked.length >= Math.min(slots, ONCALL_PER_TURN)) break;
        if (picked.some((p) => distance(p, c.pos) < 1500)) continue;
        picked.push(c.pos);
        request({ kind: "onCall", target: { ...c.pos } });
      }
    }
    // 偵察(即応):敵が1つも見えていなければ(1日1回)。偵察機がいて、今飛べるときだけ
    const hasRecon = force.squadrons.some((sq) => ctx.rules.airOps!.roles[ctx.toes.toes[sq.toe]?.air?.role ?? ""]?.missions.includes("recon"));
    if (budget > 0 && nowFlyable && hasRecon && seen.length === 0 && !st.requests.some((r) => r.kind === "recon")) request({ kind: "recon", target: { ...a.enemyCentroid } });
  }
  return out;
}

function armorWeight(branch: string | undefined): number {
  return branch === "armor" || branch === "tank_destroyer" || branch === "assault_gun" ? 1.5 : 1;
}
