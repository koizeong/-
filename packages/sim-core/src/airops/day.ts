import type { SimContext } from "../context.js";
import { airSectorKeys } from "../hq.js";
import type { HqCommand, RejectedHqCommand } from "../hq.js";
import { dayOfTurn } from "../scenario.js";
import type { GameState } from "../turn.js";
import { isDayStart, planDay, type AirOpsState } from "./plan.js";
import { decideRequest, type AirRequest } from "./requests.js";

/** 要請の結果(要請した陣営にだけ伝える) */
export interface AirRequestEvent {
  side: string;
  force: string;
  request: AirRequest;
}

type Now = { turn: number; turnStartSec: number; timeSec: number };

/**
 * 航空司令部への命令を受ける。自陣営の航空司令部・自陣営の部隊・ある空域だけ。
 * 哨戒の空域・上空援護の配属は次の昼の計画から効く。要請は1日の枠を使い、航空司令部がその場で受ける・遅らせる・断るを決める
 * (翌朝の事前計画は、夜のうちは待ちにして、朝の計画を作ったときに決める)
 */
export function applyAirOpsCommands(
  airOps: AirOpsState,
  commands: readonly HqCommand[],
  state: Pick<GameState, "units">,
  now: Now,
  ctx: SimContext,
): { rejected: RejectedHqCommand[]; requests: AirRequestEvent[] } {
  const rejected: RejectedHqCommand[] = [];
  const requests: AirRequestEvent[] = [];
  const keys = new Set(airSectorKeys(ctx));
  for (const c of commands) {
    if (c.type !== "airPatrol" && c.type !== "airCover" && c.type !== "airRequest") continue;
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
    if (c.type === "airCover") {
      const u = state.units.find((x) => x.id === c.unitId);
      if (!u || u.side !== c.side || u.strength <= 0) {
        rejected.push({ command: c, reason: "自陣営の部隊ではありません" });
        continue;
      }
      st.cover = c.on ? [...new Set([...st.cover, c.unitId])] : st.cover.filter((x) => x !== c.unitId);
      continue;
    }
    if (st.requestsLeft <= 0) {
      rejected.push({ command: c, reason: "今日の要請の枠を使い切りました" });
      continue;
    }
    if (c.kind === "airlift") {
      const u = state.units.find((x) => x.id === c.unitId);
      if (!u || u.side !== c.side) {
        rejected.push({ command: c, reason: "空輸を受け取る自陣営の部隊を選んでください" });
        continue;
      }
    }
    st.requestsLeft--;
    const id = `${c.force}:r${now.turn}:${st.requests.length}`;
    const req = { kind: c.kind, target: { ...c.target }, ...(c.turn !== undefined ? { turn: c.turn } : {}), ...(c.unitId !== undefined ? { unitId: c.unitId } : {}) };
    // 今日の計画が届かない(夜・翌朝のターン)の事前計画は、朝の計画を待つ
    const coveredUntil = st.plan.length ? Math.max(...st.plan.map((t) => t.offStationSec)) : now.timeSec;
    const wantSec = c.turn !== undefined ? now.turnStartSec + (c.turn - now.turn) * ctx.turnSeconds : now.timeSec;
    const r: AirRequest =
      c.kind === "support" && c.turn !== undefined && wantSec > coveredUntil
        ? { id, ...req, status: "pending", taskIds: [] }
        : decideRequest(force, st, req, id, now, ctx);
    st.requests.push(r);
    requests.push({ side: c.side, force: c.force, request: r });
  }
  return { rejected, requests };
}

/**
 * 昼の始めのターンなら、航空司令部ごとにその日の計画を作り、要請の枠を戻す(同じ日は作り直さない)。
 * 夜のうちに出した翌朝の事前計画は、計画を作った後に決める
 */
export function dailyAirPlans(airOps: AirOpsState, state: Pick<GameState, "turn" | "time" | "units" | "intel">, ctx: SimContext, events: AirRequestEvent[] = []): AirOpsState {
  if (!isDayStart(state.turn, ctx)) return airOps;
  const day = dayOfTurn(ctx.scenario, state.turn);
  const out: AirOpsState = { ...airOps };
  for (const f of ctx.scenario.airForces) {
    const st = out[f.id];
    if (!st || st.planDay === day) continue;
    const pending = st.requests.filter((r) => r.status === "pending");
    const next = { ...st, plan: planDay(f, st, day, state.turn, state.time, f.side, state.units, state.intel, ctx), planDay: day, requestsLeft: f.requestsPerDay, requests: [] as AirRequest[] };
    for (const p of pending) {
      const r = decideRequest(f, next, { kind: p.kind, target: p.target, ...(p.turn !== undefined ? { turn: p.turn } : {}), ...(p.unitId !== undefined ? { unitId: p.unitId } : {}) }, p.id, { turn: state.turn, turnStartSec: state.time, timeSec: state.time }, ctx, { skipLead: true });
      next.requests.push(r);
      events.push({ side: f.side, force: f.id, request: r });
    }
    out[f.id] = next;
  }
  return out;
}
