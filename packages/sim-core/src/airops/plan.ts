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
  squadrons: Record<string, { aircraft: number; lost: number; sorties?: number; today?: number; todayRecon?: number; recovering?: { n: number; until: number }[] }>;
  /** 今日の要請の残り(朝に戻る。枠のない航空司令部は持たない) */
  requestsLeft?: number;
  /** 要請(予約は飛ぶまで残る) */
  requests: AirRequest[];
  /** 予定の出撃(飛び立つ前と、飛んでいるもの) */
  sorties: AirTask[];
  /** 要請の枠を戻した日 */
  day: number;
  /** その日の昼の始めの時刻(秒。武装偵察を1日に散らすのに使う) */
  dayStartSec?: number;
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
  /** 地図全体を撮った写真か */
  wholeMap?: boolean;
  /** 写った部隊(phantom:いない部隊の報告=擬装・取り違え。ID は "phantom:" で始まる) */
  units: { id: string; pos: Vec2; branch: string; routed: boolean; movedLastTurn: boolean; phantom?: boolean }[];
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
      ...(f.requestsPerDay !== undefined ? { requestsLeft: f.requestsPerDay } : {}),
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

/** 飛行隊の行動半径(m。飛行隊の radiusM、なければ機種の air.radiusM、なければ無制限) */
export function squadronRadiusM(force: AirForce, squadronId: string, ctx: SimContext): number {
  const { sq, air } = squadronSpec(force, squadronId, ctx);
  return sq.radiusM ?? air.radiusM ?? Infinity;
}

/** 基地が行動半径の内か(外なら、その飛行隊は出せない。ルールパックに range があるときだけ見る) */
export function inRange(force: AirForce, squadronId: string, ctx: SimContext): boolean {
  if (!ctx.rules.airOps?.range) return true;
  return squadronSpec(force, squadronId, ctx).base.distanceM <= squadronRadiusM(force, squadronId, ctx);
}

/**
 * 1機の1回の出撃にかかる分(行き = 基地からの距離 ÷ 巡航の速さ、空域にいる時間、積み直し)。
 * 空域にいられる時間は、行動半径に近いほど短い(ルールパックの airOps.range。燃料の残り)
 */
export function cycleMinutes(force: AirForce, squadronId: string, ctx: SimContext): { transit: number; cycle: number; station: number; turnaround: number } {
  const { air, role, base } = squadronSpec(force, squadronId, ctx);
  const transit = base.distanceM / air.speedMpm;
  let station = role?.stationMinutes ?? 30;
  const range = ctx.rules.airOps?.range;
  const radius = squadronRadiusM(force, squadronId, ctx);
  if (range && Number.isFinite(radius) && radius > 0) {
    const r = base.distanceM / radius;
    if (r > range.fullStationShare) {
      const k = Math.min(1, (r - range.fullStationShare) / Math.max(1e-6, 1 - range.fullStationShare));
      station *= 1 - (1 - range.minStationShare) * k;
    }
  }
  const turnaround = role?.turnaroundMinutes ?? 60;
  return { transit, station, turnaround, cycle: 2 * transit + station + turnaround };
}

/** 1機が1日に出られる回数:役割の maxSortiesPerDay と、飛べる昼 ÷ 1回の出撃の時間(遠い基地ほど少ない)の小さいほう。どちらもなければ Infinity */
export function sortiesPerAircraftPerDay(force: AirForce, squadronId: string, ctx: SimContext): number {
  const max = squadronSpec(force, squadronId, ctx).role?.maxSortiesPerDay ?? Infinity;
  const day = ctx.rules.airOps?.flyingDayMinutes;
  const byTime = day ? day / cycleMinutes(force, squadronId, ctx).cycle : Infinity;
  return Math.min(max, byTime);
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

/**
 * 飛行隊がその日にまだ出せる出撃の数(機の延べ数)。役割の maxSortiesPerDay × 使える機数 − 今日出した数。上限がなければ Infinity。
 * 整備・搭乗員の休み・任務の準備で、1機が1日に飛べる回数には限りがある(合わせ込みは docs/air-design.md の末尾)
 */
export function sortiesLeftToday(force: AirForce, st: AirForceState, squadronId: string, ctx: SimContext): number {
  const per = sortiesPerAircraftPerDay(force, squadronId, ctx);
  const sq = st.squadrons[squadronId];
  if (!Number.isFinite(per) || !sq) return Infinity;
  return Math.max(0, Math.floor(sq.aircraft * per) - (sq.today ?? 0));
}

/** 今出せる機数(積み直し・飛んでいる機を引き、その日の出撃の上限も見る。行動半径の外の飛行隊は0) */
export function availableAircraft(force: AirForce, st: AirForceState, squadronId: string, t: number, ctx: SimContext): number {
  if (!inRange(force, squadronId, ctx)) return 0;
  return Math.min(freeAircraft(st, squadronId, t), sortiesLeftToday(force, st, squadronId, ctx));
}

/** 任務 mission に就ける飛行隊のうち、今出せる機がいちばん多いもの(同じなら定義の順) */
export function pickSquadron(force: AirForce, st: AirForceState, mission: AirMissionKind, t: number, ctx: SimContext, ok?: (squadronId: string) => boolean): { id: string; free: number } | null {
  let best: { id: string; free: number } | null = null;
  for (const sq of force.squadrons) {
    const { role } = squadronSpec(force, sq.id, ctx);
    if (!role?.missions.includes(mission)) continue;
    if (ok && !ok(sq.id)) continue;
    const free = availableAircraft(force, st, sq.id, t, ctx);
    if (free > 0 && (!best || free > best.free)) best = { id: sq.id, free };
  }
  return best;
}
