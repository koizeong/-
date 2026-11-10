import type { SimContext } from "../context.js";
import { airSectorKeys } from "../hq.js";
import type { HqCommand, RejectedHqCommand } from "../hq.js";
import { dayOfTurn } from "../scenario.js";
import type { GameState } from "../turn.js";
import { isDayStart, planDay, type AirOpsState } from "./plan.js";

/**
 * 航空司令部への命令(哨戒の空域・上空援護の配属)を受ける。自陣営の航空司令部・自陣営の部隊・ある空域だけ。
 * 次の昼の計画から効く(今日の計画は変えない)。弾いた命令を返す
 */
export function applyAirOpsCommands(airOps: AirOpsState, commands: readonly HqCommand[], state: Pick<GameState, "units">, ctx: SimContext): RejectedHqCommand[] {
  const rejected: RejectedHqCommand[] = [];
  const keys = new Set(airSectorKeys(ctx));
  for (const c of commands) {
    if (c.type !== "airPatrol" && c.type !== "airCover") continue;
    const force = ctx.scenario.airForces.find((f) => f.id === c.force);
    const st = airOps[c.force];
    if (!force || !st || force.side !== c.side) {
      rejected.push({ command: c, reason: "自陣営の航空司令部ではありません" });
      continue;
    }
    if (c.type === "airPatrol") {
      const bad = c.sectors.find((k) => !keys.has(k));
      if (bad) {
        rejected.push({ command: c, reason: `空域 ${bad} はありません` });
        continue;
      }
      st.patrolSectors = [...new Set(c.sectors)];
      continue;
    }
    const u = state.units.find((x) => x.id === c.unitId);
    if (!u || u.side !== c.side || u.strength <= 0) {
      rejected.push({ command: c, reason: "自陣営の部隊ではありません" });
      continue;
    }
    st.cover = c.on ? [...new Set([...st.cover, c.unitId])] : st.cover.filter((x) => x !== c.unitId);
  }
  return rejected;
}

/** 昼の始めのターンなら、航空司令部ごとにその日の計画を作り、要請の枠を戻す(同じ日は作り直さない) */
export function dailyAirPlans(airOps: AirOpsState, state: Pick<GameState, "turn" | "time" | "units" | "intel">, ctx: SimContext): AirOpsState {
  if (!isDayStart(state.turn, ctx)) return airOps;
  const day = dayOfTurn(ctx.scenario, state.turn);
  const out: AirOpsState = { ...airOps };
  for (const f of ctx.scenario.airForces) {
    const st = out[f.id];
    if (!st || st.planDay === day) continue;
    out[f.id] = { ...st, plan: planDay(f, st, day, state.turn, state.time, f.side, state.units, state.intel, ctx), planDay: day, requestsLeft: f.requestsPerDay };
  }
  return out;
}
