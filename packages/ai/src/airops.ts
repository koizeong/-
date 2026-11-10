import { airSectorOf, distance, forecastFlyable, isNightTurn, type HqCommand, type SideView, type SimContext, type Vec2 } from "@brigade/sim-core";
import type { AssaultPlan } from "./assault.js";
import { threatNear, type Assessment } from "./assess.js";

/**
 * 地上の AI から航空司令部への働きかけ(docs/air-design.md・AIR7)。航空司令部の割り当ては sim-core の航空司令部(AI)が決めるので、
 * 地上の AI がするのは、人間と同じ司令部コマンドを出すことだけ:
 * - 即応:交戦中の味方の近くに見えている敵がいて、その空域で上空待機の編隊が待っていれば向ける
 * - 事前計画の近接支援:総攻撃の目標へ、前もって(予報で飛べるターンに)頼んでおく
 * - 偵察:敵が1つも見えていなければ、敵の重心のあたりを撮ってもらう(1日1回)
 * - 前線の印:敵と接している部隊は、自陣営の攻撃の編隊が飛ぶ日には印を出す(誤射を減らす)。離れたらやめる
 * - 上空援護:敵の編隊を見たら、いちばん強い装甲の部隊に戦闘機を付けてもらう(1つだけ)
 * 要請は1日の枠を、その日の残りのターンにならして使う。指揮ポイントは使わない(別枠。ユーザー判断)
 */

/** 交戦中とみる距離(m) */
const CONTACT_M = 2500;
/** 即応の待機を向けられる、今から先の秒(sim-core の decideRequest と同じ) */
const ON_CALL_WINDOW_SEC = 3600;

export function airOpsCommands(view: SideView, a: Assessment, ctx: SimContext, plan: AssaultPlan | null): HqCommand[] {
  if (!view.airOps || !ctx.rules.airOps) return [];
  const out: HqCommand[] = [];
  const rules = ctx.rules.airOps;
  const seen = a.threats.filter((c) => c.currentLevel > 0);
  const lead = rules.requests.preplanLeadTurns;
  const safety = rules.flight.strikeRadiusM + 400;
  const clearOfOwn = (p: Vec2) => !view.own.some((u) => u.strength > 0 && distance(u.pos, p) < safety);
  // その日の残りの昼のターン
  let turnsToday = 1;
  for (let t = view.turn + 1; t <= ctx.scenario.maxTurns && !isNightTurn(ctx.scenario, t); t++) turnsToday++;
  const forces = ctx.scenario.airForces.filter((f) => f.side === view.side);
  for (const force of forces) {
    const st = view.airOps[force.id];
    if (!st) continue;
    let budget = Math.min(st.requestsLeft, Math.ceil(st.requestsLeft / turnsToday));
    const request = (c: Omit<Extract<HqCommand, { type: "airRequest" }>, "side" | "type" | "force">) => {
      out.push({ side: view.side, type: "airRequest", force: force.id, ...c });
      budget--;
    };
    // 即応:見えている敵のうち、味方と接していて、空域に待機の編隊がいるもの(敵の推定戦力が大きい順)
    if (budget > 0) {
      const waiting = new Set(
        st.plan.filter((t) => t.mission === "onCall" && !t.requestId && t.sector && t.offStationSec > view.time && t.onStationSec <= view.time + ON_CALL_WINDOW_SEC).map((t) => t.sector!),
      );
      const target = seen
        .filter((c) => view.own.some((u) => u.strength > 0 && distance(u.pos, c.pos) <= CONTACT_M) && clearOfOwn(c.pos) && waiting.has(airSectorOf(c.pos, ctx)))
        .sort((x, y) => (y.estimatedStrength ?? 0.7) * armorWeight(y.branch) - (x.estimatedStrength ?? 0.7) * armorWeight(x.branch) || (x.contactId < y.contactId ? -1 : 1))[0];
      if (target) request({ kind: "onCall", target: { ...target.pos } });
    }
    // 事前計画の近接支援:総攻撃の目標へ。予報で飛べるターンを選ぶ(同じ目標にはまだ頼んでいないときだけ)
    if (budget > 0 && plan && plan.mode === "assault") {
      const asked = st.requests.some((r) => r.kind === "support" && r.status !== "refused" && distance(r.target, plan.target) < 1500);
      const base = force.squadrons[0]?.base ?? "";
      const turn = [lead + 1, lead + 2, lead + 3].map((k) => view.turn + k).find((t) => !isNightTurn(ctx.scenario, t) && t <= ctx.scenario.maxTurns && forecastFlyable(st, base, view.turn, { current: view.weather, since: 0 }, t, ctx));
      if (!asked && turn !== undefined) request({ kind: "support", target: { ...plan.target }, turn });
    }
    // 偵察:敵が1つも見えていなければ(1日1回)
    if (budget > 0 && seen.length === 0 && !st.requests.some((r) => r.kind === "recon") && st.plan.some((t) => t.mission === "recon" && !t.requestId && t.onStationSec >= view.time)) {
      request({ kind: "recon", target: { ...a.enemyCentroid } });
    }
    // 上空援護:敵の編隊を見たら、いちばん強い装甲の部隊(1つだけ。次の昼から)
    if ((view.enemyFlights?.length ?? 0) > 0 && st.cover.length === 0) {
      const armor = view.own
        .filter((u) => u.strength > 0 && !u.routed && (u.branch === "armor" || u.branch === "tank_destroyer"))
        .sort((x, y) => y.strength - x.strength || (x.id < y.id ? -1 : 1))[0];
      if (armor) out.push({ side: view.side, type: "airCover", force: force.id, unitId: armor.id, on: true });
    }
  }
  // 前線の印:自陣営の攻撃の編隊が今日飛ぶなら、敵と接している部隊は印を出す。離れたらやめる
  const strikesToday = forces.some((f) => (view.airOps![f.id]?.plan ?? []).some((t) => ["support", "onCall", "interdiction", "armedRecon"].includes(t.mission) && t.offStationSec > view.time));
  const markWithin = rules.effects.misidentify.withinM * 1.5;
  for (const u of [...view.own].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (u.strength <= 0) continue;
    const contact = threatNear(u.pos, seen, markWithin) > 0;
    const want = strikesToday && contact;
    if (want !== !!u.airMarked) out.push({ side: view.side, type: "airMark", unitId: u.id, on: want });
  }
  return out;
}

function armorWeight(branch: string | undefined): number {
  return branch === "armor" || branch === "tank_destroyer" ? 1.5 : 1;
}
