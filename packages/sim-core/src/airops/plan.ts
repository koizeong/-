import type { SimContext } from "../context.js";
import { Rng } from "../rng.js";
import type { Vec2 } from "../geometry.js";
import { isNightTurn } from "../scenario.js";
import type { AirForce, AirMissionKind } from "./rules.js";
import type { AirRequest } from "./requests.js";
import type { Flight } from "./flights.js";
import type { WeatherState } from "../weather.js";
import { initialBaseWeather, type AirForecast } from "./weather.js";

/**
 * 航空司令部の状態(docs/air-design.md)。ユーザー判断で、1日の計画はやめた:攻撃機は要請(即応・予約)でだけ飛び、
 * 戦闘機は攻撃機に護衛として付くか、敵の編隊が来たら迎え撃つ(自動)。
 */

/** 1回の出撃(1つの編隊の1回の飛行)。要請・護衛・迎撃から作る */
export interface AirTask {
  id: string;
  force: string;
  squadron: string;
  mission: AirMissionKind;
  /** 編隊の機数 */
  aircraft: number;
  /** 戦場の上に着く時刻と、離れる時刻(秒) */
  onStationSec: number;
  offStationSec: number;
  /** 応えた要請 */
  requestId?: string;
  /** 目標の地点と、空輸を受け取る部隊 */
  target?: Vec2;
  unitId?: string;
  /** 護衛する出撃(護衛)・追う敵の編隊(迎撃) */
  escortOf?: string;
  chase?: string;
}

export interface AirForceState {
  side: string;
  /** 飛行隊ごとの使える機数(失った分は引いてある)と失った機数・飛んだ出撃数、帰ってきて積み直し中の機(until まで使えない) */
  squadrons: Record<string, { aircraft: number; lost: number; sorties?: number; recovering?: { n: number; until: number }[] }>;
  /** 今日の要請の残り(朝に戻る) */
  requestsLeft: number;
  /** 要請(予約は飛ぶまで残る) */
  requests: AirRequest[];
  /** 予定の出撃(飛び立つ前と、飛んでいるもの) */
  sorties: AirTask[];
  /** 要請の枠を戻した日 */
  day: number;
  /** 飛んでいる編隊と、もう出した出撃 */
  flights?: Flight[];
  launched?: string[];
  /** 判読中の偵察の写真(readyAt に陣営の情報へ入る) */
  photos?: AirPhoto[];
  /** この戦場に回ってきた割合(シナリオの allotment から引いた値) */
  share?: number;
  /** 基地の天候(基地に weather を書いたときだけ)と、気象班の予報 */
  baseWeather?: Record<string, WeatherState>;
  forecast?: AirForecast;
}

/** 偵察の写真:撮った時刻の敵の部隊の様子(判読が済むまで陣営の情報に入らない) */
export interface AirPhoto {
  flight: string;
  takenAt: number;
  readyAt: number;
  units: { id: string; pos: Vec2; branch: string; routed: boolean; movedLastTurn: boolean }[];
}

export type AirOpsState = Record<string, AirForceState>;

export function initialAirOps(ctx: SimContext, seed = 0): AirOpsState {
  const out: AirOpsState = {};
  ctx.scenario.airForces.forEach((f, k) => {
    // この戦場に回ってくる割合(戦闘ごとの運)。種から航空司令部ごとに別の列で引く
    const share = f.allotment ? f.allotment.min + (f.allotment.max - f.allotment.min) * Rng.fromSeed((Math.imul(seed + 1, 0x9e3779b9) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0).next() : 1;
    out[f.id] = {
      side: f.side,
      ...(f.allotment ? { share } : {}),
      squadrons: Object.fromEntries(f.squadrons.map((s) => [s.id, { aircraft: Math.round(s.aircraft * share), lost: 0 }])),
      requestsLeft: f.requestsPerDay,
      requests: [],
      sorties: [],
      day: 0,
      ...(initialBaseWeather(f) ? { baseWeather: initialBaseWeather(f)! } : {}),
    };
  });
  return out;
}

/** turn が昼の始め(最初のターンか、夜のターンの次)か */
export function isDayStart(turn: number, ctx: SimContext): boolean {
  if (isNightTurn(ctx.scenario, turn)) return false;
  return turn === 1 || isNightTurn(ctx.scenario, turn - 1);
}

/** 飛行隊の機種の役割と巡航の速さ(m/分) */
export function squadronSpec(force: AirForce, squadronId: string, ctx: SimContext) {
  const sq = force.squadrons.find((s) => s.id === squadronId)!;
  const toe = ctx.toes.toes[sq.toe]!;
  const air = toe.air!;
  const role = ctx.rules.airOps!.roles[air.role];
  const base = force.bases.find((b) => b.id === sq.base)!;
  return { sq, toe, air, role, base };
}

/** 1機の1回の出撃にかかる分(行き = 基地からの距離 ÷ 巡航の速さ、空域にいる時間、積み直し) */
export function cycleMinutes(force: AirForce, squadronId: string, ctx: SimContext): { transit: number; cycle: number; station: number; turnaround: number } {
  const { air, role, base } = squadronSpec(force, squadronId, ctx);
  const transit = base.distanceM / air.speedMpm;
  const station = role?.stationMinutes ?? 30;
  const turnaround = role?.turnaroundMinutes ?? 60;
  return { transit, station, turnaround, cycle: 2 * transit + station + turnaround };
}

/** 飛行隊の、今出せる機数(使える機から、飛んでいる・飛ぶ予定の機と積み直し中の機を引く) */
export function freeAircraft(st: AirForceState, squadronId: string, t: number): number {
  const sq = st.squadrons[squadronId];
  if (!sq) return 0;
  const committed = st.sorties.filter((s) => s.squadron === squadronId && !(st.launched ?? []).includes(s.id)).reduce((n, s) => n + s.aircraft, 0);
  const airborne = (st.flights ?? []).filter((f) => f.squadron === squadronId).reduce((n, f) => n + f.aircraft, 0);
  const recovering = (sq.recovering ?? []).filter((r) => r.until > t).reduce((n, r) => n + r.n, 0);
  return Math.max(0, sq.aircraft - committed - airborne - recovering);
}

/** 任務 mission に就ける飛行隊のうち、今出せる機がいちばん多いもの(同じなら定義の順) */
export function pickSquadron(force: AirForce, st: AirForceState, mission: AirMissionKind, t: number, ctx: SimContext): { id: string; free: number } | null {
  let best: { id: string; free: number } | null = null;
  for (const sq of force.squadrons) {
    const { role } = squadronSpec(force, sq.id, ctx);
    if (!role?.missions.includes(mission)) continue;
    const free = freeAircraft(st, sq.id, t);
    if (free > 0 && (!best || free > best.free)) best = { id: sq.id, free };
  }
  return best;
}
