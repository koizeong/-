import type { SimContext } from "../context.js";
import { Rng } from "../rng.js";
import { distance, type Vec2 } from "../geometry.js";
import { airSectorKeys, airSectorOf } from "../hq.js";
import type { IntelState } from "../intel.js";
import { isDarkTurn, isNightTurn } from "../scenario.js";
import type { Unit } from "../unit.js";
import type { AirForce, AirMissionKind } from "./rules.js";
import type { AirRequest } from "./requests.js";
import type { Flight } from "./flights.js";
import type { WeatherState } from "../weather.js";
import { forecastFlyable, initialBaseWeather, type AirForecast } from "./weather.js";

/**
 * 航空司令部の1日の計画(docs/air-design.md の1・2)。航空司令部は別の指揮系統なので、両陣営とも AI が割り当てる。
 * 使える情報は陣営の霧の情報だけ(敵の本当の位置は使わない)
 */

/** 1回の出撃(1つの編隊の1回の飛行)の割り当て */
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
  /** 空域(哨戒・即応・武装偵察・偵察)。空域のキー */
  sector?: string;
  /** 上空援護する自軍の部隊 */
  unitId?: string;
  /** 要請に応えた割り当て(AIR2) */
  requestId?: string;
  /** 要請の目標の地点 */
  target?: Vec2;
}

export interface AirForceState {
  side: string;
  /** 飛行隊ごとの使える機数と、失った機数 */
  squadrons: Record<string, { aircraft: number; lost: number; sorties?: number }>;
  /** プレイヤー(と地上の AI)が決めた制空の哨戒の空域。空なら航空司令部が決める */
  patrolSectors: string[];
  /** 上空援護に配属された自軍の部隊 */
  cover: string[];
  /** 今日の要請の残り */
  requestsLeft: number;
  /** 今日の要請(と、翌朝を待つ事前計画) */
  requests: AirRequest[];
  /** 今日の計画と、計画した日 */
  plan: AirTask[];
  planDay: number;
  /** 飛んでいる編隊と、もう出した(出そうとした)割り当て(AIR3) */
  flights?: Flight[];
  launched?: string[];
  /** 判読中の偵察の写真(AIR4。readyAt に陣営の情報へ入る) */
  photos?: AirPhoto[];
  /** この戦場に回ってきた割合(シナリオの allotment から引いた値) */
  share?: number;
  /** 基地の天候(基地に weather を書いたときだけ)と、気象班の予報(AIR5) */
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
      patrolSectors: [],
      cover: [],
      requestsLeft: f.requestsPerDay,
      requests: [],
      plan: [],
      planDay: 0,
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

/** turn から始まる昼のうち、飛べる(暗くない)時間帯(秒)。[開始, 終わり] の組の並び */
export function daylightWindows(turn: number, startSec: number, ctx: SimContext, flyable: (turn: number) => boolean = () => true): [number, number][] {
  const out: [number, number][] = [];
  let t = startSec;
  for (let k = turn; k <= ctx.scenario.maxTurns && !isNightTurn(ctx.scenario, k); k++) {
    if (!isDarkTurn(ctx.scenario, k) && flyable(k)) {
      const last = out.at(-1);
      if (last && last[1] === t) last[1] = t + ctx.turnSeconds;
      else out.push([t, t + ctx.turnSeconds]);
    }
    t += ctx.turnSeconds;
  }
  return out;
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

/** 1機の1回の出撃にかかる分(行き帰り + 空域にいる時間 + 積み直し) */
export function cycleMinutes(force: AirForce, squadronId: string, ctx: SimContext): { transit: number; cycle: number; station: number } {
  const { air, role, base } = squadronSpec(force, squadronId, ctx);
  const transit = base.distanceM / air.speedMpm;
  const station = role?.stationMinutes ?? 30;
  return { transit, station, cycle: 2 * transit + station + (role?.turnaroundMinutes ?? 60) };
}

/**
 * 1日の計画:飛行隊ごとに、昼の時間に回せる出撃(編隊 × 回数)を数え、方針の重みで任務に配る(端数は大きい順)。
 * 出撃は時刻の順に並べ、任務は時刻に散らす(同じ任務が朝に固まらない)。乱数は使わない
 */
export function planDay(force: AirForce, st: AirForceState, day: number, turn: number, startSec: number, side: string, units: readonly Unit[], intel: IntelState, ctx: SimContext, weather?: WeatherState): AirTask[] {
  const rules = ctx.rules.airOps;
  if (!rules) return [];
  if (daylightWindows(turn, startSec, ctx).length === 0) return [];
  // 使える空域:哨戒は決めた空域か、自軍の部隊のいる空域のうち敵に近いもの。武装偵察は敵のいる空域
  const own = units.filter((u) => u.side === side && u.strength > 0 && !ctx.toes.toes[u.toe]?.air);
  const enemies = Object.values(intel[side]?.entries ?? {}).filter((e) => !e.confirmedDestroyed && e.bestLevel > 0);
  const front = frontSectors(own, enemies.map((e) => e.lastSeenPos), ctx);
  // 敵のいる空域(知らなければ、自軍の部隊の重心から遠い側の空域=敵の後方の見当)
  const known = [...new Set(enemies.map((e) => airSectorOf(e.lastSeenPos, ctx)))].sort();
  const enemySectors = known.length ? known : farSectors(own, ctx);
  const patrol = st.patrolSectors.length ? st.patrolSectors : front.slice(0, 2);
  const cover = st.cover.filter((id) => own.some((u) => u.id === id));
  const tasks: AirTask[] = [];
  for (const sq of force.squadrons) {
    const { role, air } = squadronSpec(force, sq.id, ctx);
    if (!role) continue;
    const ready = st.squadrons[sq.id]?.aircraft ?? 0;
    if (ready <= 0) continue;
    const { transit, station, cycle } = cycleMinutes(force, sq.id, ctx);
    // 飛べる見込みの時間帯(戦場と基地の予報。AIR5)
    const windows = daylightWindows(turn, startSec, ctx, (k) => !weather || forecastFlyable(st, sq.base, turn, weather, k, ctx));
    const daylight = windows.reduce((t, [a, b]) => t + (b - a), 0) / 60;
    if (daylight <= 0) continue;
    const perAircraft = Math.min(role.maxSortiesPerDay, Math.floor((daylight - 2 * transit - station) / cycle) + 1);
    if (perAircraft <= 0) continue;
    const flights = Math.max(1, Math.floor(ready / role.flightSize));
    const flightSize = Math.min(role.flightSize, ready);
    const slots = flights * perAircraft;
    // 任務の重み(この役割が就けるもの。空域や部隊がない任務は除く)
    const usable = role.missions.filter((m) => {
      if (m === "patrol") return patrol.length > 0;
      if (m === "cover") return cover.length > 0;
      if (m === "onCall") return front.length > 0;
      if (m === "armedRecon" || m === "interdiction") return enemySectors.length > 0 || front.length > 0;
      if (m === "support" || m === "airlift") return false; // 要請に応える分(AIR2)
      return true;
    });
    const weights = usable.map((m) => force.doctrine.weights[m] ?? 0);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const counts = apportion(slots, weights);
    // 時刻の順の出撃に、任務を散らして並べる
    const order = interleave(usable, counts);
    let k = 0;
    for (let f = 0; f < flights; f++) {
      for (let n = 0; n < perAircraft; n++) {
        const mission = order[k++]!;
        // 飛行隊の編隊は時刻をずらして出る(出撃1回分の時間を編隊の数で割る)
        const depart = n * cycle + (f * cycle) / flights;
        const onStation = minuteToSec(windows, depart + transit);
        if (onStation === null) continue;
        const t: AirTask = {
          id: `${force.id}:${sq.id}:d${day}:${f}:${n}`,
          force: force.id,
          squadron: sq.id,
          mission,
          aircraft: flightSize,
          onStationSec: onStation,
          offStationSec: onStation + station * 60,
        };
        if (mission === "patrol") t.sector = patrol[(f + n) % patrol.length]!;
        if (mission === "onCall") t.sector = front[(f + n) % front.length]!;
        if (mission === "armedRecon" || mission === "interdiction") t.sector = (enemySectors.length ? enemySectors : front)[(f + n) % (enemySectors.length || front.length)]!;
        if (mission === "recon") t.sector = (enemySectors.length ? enemySectors : airSectorKeys(ctx))[(f + n) % (enemySectors.length || airSectorKeys(ctx).length)]!;
        if (mission === "cover") t.unitId = cover[(f + n) % cover.length]!;
        void air;
        tasks.push(t);
      }
    }
  }
  return tasks.sort((a, b) => a.onStationSec - b.onStationSec || (a.id < b.id ? -1 : 1));
}

/** 昼の時間帯を通した分(0 から数える)を、時刻(秒)に直す。昼を過ぎていれば null */
function minuteToSec(windows: [number, number][], minute: number): number | null {
  let left = minute * 60;
  for (const [a, b] of windows) {
    if (left < b - a) return a + left;
    left -= b - a;
  }
  return null;
}

/** n を重みで配る(端数は大きい順。合計は n) */
export function apportion(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (n * w) / total);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]!++;
    left--;
  }
  return out;
}

/** 任務を、数の比を保ちながら交互に並べる */
function interleave<T>(kinds: readonly T[], counts: readonly number[]): T[] {
  const total = counts.reduce((a, b) => a + b, 0);
  const used = counts.map(() => 0);
  const out: T[] = [];
  for (let k = 0; k < total; k++) {
    // いちばん遅れている(使った割合が小さい)任務を選ぶ
    let best = -1;
    let bestLag = Infinity;
    for (let i = 0; i < kinds.length; i++) {
      if (used[i]! >= counts[i]!) continue;
      const lag = used[i]! / counts[i]!;
      if (lag < bestLag) {
        bestLag = lag;
        best = i;
      }
    }
    used[best]!++;
    out.push(kinds[best]!);
  }
  return out;
}

/** 自軍の部隊のいる空域を、敵(知っている位置)に近い順に */
function frontSectors(own: readonly Unit[], enemies: readonly Vec2[], ctx: SimContext): string[] {
  const near = new Map<string, number>();
  for (const u of own) {
    const key = airSectorOf(u.pos, ctx);
    const d = enemies.length ? Math.min(...enemies.map((e) => distance(e, u.pos))) : Infinity;
    near.set(key, Math.min(near.get(key) ?? Infinity, d));
  }
  return [...near.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);
}

/** 自軍の部隊の重心から遠い空域(地図の真ん中より向こうのもの。遠い順) */
function farSectors(own: readonly Unit[], ctx: SimContext): string[] {
  if (own.length === 0) return [];
  const g = { x: own.reduce((t, u) => t + u.pos.x, 0) / own.length, y: own.reduce((t, u) => t + u.pos.y, 0) / own.length };
  const c = { x: ctx.terrain.widthM / 2, y: ctx.terrain.heightM / 2 };
  const center = (k: string) => {
    const [cc, rr] = k.split(",").map(Number);
    const keys = airSectorKeys(ctx);
    const cols = Math.max(...keys.map((x) => Number(x.split(",")[0]))) + 1;
    const rows = Math.max(...keys.map((x) => Number(x.split(",")[1]))) + 1;
    return { x: ((cc! + 0.5) * ctx.terrain.widthM) / cols, y: ((rr! + 0.5) * ctx.terrain.heightM) / rows };
  };
  const dg = distance(g, c);
  return airSectorKeys(ctx)
    .filter((k) => distance(center(k), g) > dg)
    .sort((a, b) => distance(center(b), g) - distance(center(a), g) || (a < b ? -1 : 1));
}
