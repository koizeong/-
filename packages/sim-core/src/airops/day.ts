import type { SimContext } from "../context.js";
import type { HqCommand, RejectedHqCommand } from "../hq.js";
import { dayOfTurn, isDarkTurn, isNightTurn } from "../scenario.js";
import type { GameState } from "../turn.js";
import { airAllowed, type WeatherState } from "../weather.js";
import { isDayStart, squadronSpec, type AirOpsState } from "./plan.js";
import { decideRequest, launchScheduled, type AirRequest } from "./requests.js";
import type { AirForce } from "./rules.js";
import { baseFlyable } from "./weather.js";

/** 要請の結果(要請した陣営にだけ伝える) */
export interface AirRequestEvent {
  side: string;
  force: string;
  request: AirRequest;
}

type Now = { turn: number; turnStartSec: number; timeSec: number };

/** 飛べない理由(飛べれば null):夜・暗い時間、戦場の天候、飛行隊の基地の天候 */
function flyableReason(airOps: AirOpsState, force: AirForce, turn: number, weather: WeatherState | undefined, ctx: SimContext): (squadron: string) => string | null {
  return (squadron) => {
    if (isNightTurn(ctx.scenario, turn) || isDarkTurn(ctx.scenario, turn)) return "夜(暗い時間)は飛べない";
    if (weather && !airAllowed(weather, ctx)) return "戦場の天候が悪く飛べない";
    if (!baseFlyable(airOps, force.id, squadronSpec(force, squadron, ctx).sq.base, ctx)) return "基地の天候が悪く飛べない";
    return null;
  };
}

/**
 * 航空司令部への要請を受ける。自陣営の航空司令部だけ。要請は1日の枠を使い(断られても使う)、
 * 即応はその場で飛ぶか断られ、予約は来てほしいターンを待つ
 */
export function applyAirOpsCommands(
  airOps: AirOpsState,
  commands: readonly HqCommand[],
  state: Pick<GameState, "units"> & Partial<Pick<GameState, "weather">>,
  now: Now,
  ctx: SimContext,
): { rejected: RejectedHqCommand[]; requests: AirRequestEvent[] } {
  const rejected: RejectedHqCommand[] = [];
  const requests: AirRequestEvent[] = [];
  for (const c of commands) {
    if (c.type !== "airRequest") continue;
    const force = ctx.scenario.airForces.find((f) => f.id === c.force);
    const st = airOps[c.force];
    if (!force || !st || force.side !== c.side) {
      rejected.push({ command: c, reason: "自陣営の航空司令部ではありません" });
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
    const r = decideRequest(force, st, req, id, now, ctx, flyableReason(airOps, force, now.turn, state.weather, ctx));
    st.requests.push(r);
    requests.push({ side: c.side, force: c.force, request: r });
  }
  return { rejected, requests };
}

/**
 * ターンの始めの航空司令部:昼の始めなら要請の枠を戻し(同じ日は戻さない)、済んだ要請を片付ける。
 * それから、このターンを待っていた予約を飛ばす(飛べなければ取りやめ)。変わった要請は events へ
 */
export function airTurnStart(
  airOps: AirOpsState,
  state: Pick<GameState, "turn" | "time"> & Partial<Pick<GameState, "weather">>,
  ctx: SimContext,
  events: AirRequestEvent[] = [],
): AirOpsState {
  const out: AirOpsState = { ...airOps };
  const dayStart = isDayStart(state.turn, ctx);
  const day = dayOfTurn(ctx.scenario, state.turn);
  for (const f of ctx.scenario.airForces) {
    const st0 = out[f.id];
    if (!st0) continue;
    const st = { ...st0 };
    if (dayStart && st.day !== day) {
      st.day = day;
      st.requestsLeft = f.requestsPerDay;
      st.requests = st.requests.filter((r) => r.status === "scheduled");
      // もう飛んでいない出撃の印は要らない(護衛・迎撃が追う編隊の ID だけ残す)
      const keep = new Set([...(st.flights ?? []).flatMap((x) => [x.id, x.escortOf, x.chase]), ...st.sorties.flatMap((x) => [x.escortOf, x.chase])].filter((x): x is string => !!x));
      st.launched = (st.launched ?? []).filter((x) => keep.has(x));
    }
    for (const r of launchScheduled(f, st, state.turn, state.time, flyableReason(out, f, state.turn, state.weather, ctx), ctx)) events.push({ side: f.side, force: f.id, request: r });
    out[f.id] = st;
  }
  return out;
}
