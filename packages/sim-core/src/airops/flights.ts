import { antiAirOf } from "../air.js";
import { armorNow, armoredDamageFraction } from "../armor.js";
import { formationDamageTaken, moraleStateDamageTaken, type FireResult } from "../combat.js";
import type { SimContext } from "../context.js";
import { frontCoverage, frontOf } from "../frontage.js";
import { bearing, distance, type Vec2 } from "../geometry.js";
import { airSectorGrid } from "../hq.js";
import { recordSighting, type IntelState } from "../intel.js";
import type { Rng } from "../rng.js";
import { stanceOf } from "../stance.js";
import { toeHitPoints, weaponEffectAgainst, type Toe } from "../toe.js";
import { trainingOf } from "../training.js";
import type { Unit } from "../unit.js";
import { weaponPowerAt } from "../weapon.js";
import type { AirForceState, AirOpsState, AirPhoto, AirTask } from "./plan.js";
import type { AirForce, AirMissionKind } from "./rules.js";
import { baseFlyable } from "./weather.js";

/**
 * 盤上の飛行(docs/air-design.md の4)。計画の割り当ては、戦場の上に着く時刻に合わせて地図の端から入る編隊になる。
 * 編隊は陸の部隊(Unit)ではなく、航空司令部の状態に持つ(勝敗・損耗の分母・探知に入らない)。
 * 戦闘機は近くの敵の編隊を襲い、攻撃の編隊は目標を叩き(対空砲に撃たれる)、偵察機は見つけた敵を記録し、時間がたてば帰る
 */
export interface Flight {
  id: string;
  force: string;
  side: string;
  squadron: string;
  toe: string;
  mission: AirMissionKind;
  aircraft: number;
  pos: Vec2;
  entry: Vec2;
  station: Vec2;
  phase: "inbound" | "station" | "outbound";
  onStationSec: number;
  offStationSec: number;
  /** 攻撃を始めた時刻(攻撃は strikeMinutes で終わる)と、爆弾を捨てて帰ったか */
  strikeFromSec?: number;
  aborted?: boolean;
  /** 空戦をした秒(弾と燃料で、1回の出撃で空戦できる時間には限りがある。flight.combatMinutes) */
  combatSec?: number;
  /** 上空援護する部隊・要請 */
  unitId?: string;
  requestId?: string;
  /** 護衛している攻撃の編隊(AIR4) */
  escortOf?: string;
  /** 帰って報告する分:敵に与えた損害(戦力の割合の合計)・損害を与えた敵の部隊・空戦で落とした機数(端数込み)・誤って撃った味方の部隊 */
  dealt?: number;
  hit?: string[];
  kills?: number;
  friendly?: string[];
  friendlyDamage?: number;
  /** 撮った写真(持ち帰って判読するまで陣営の情報に入らない。落とされれば失う) */
  photo?: AirPhoto["units"];
  photoAt?: number;
}

export type FlightEvent =
  | { side: string; type: "airArrived"; flight: string; mission: AirMissionKind; at: Vec2 }
  | { side: string; type: "airAttack"; flight: string; mission: AirMissionKind; at: Vec2; aircraft: number }
  | { side: string; type: "airLoss"; flight: string; lost: number; cause: "airCombat" | "flak" }
  | { side: string; type: "airAbort"; flight: string }
  | { side: string; type: "airPhoto"; flight: string; found: number; takenAt: number }
  /** 帰った編隊の報告(誇張を含む。本当の戦果ではない) */
  | { side: string; type: "airClaim"; flight: string; mission: AirMissionKind; claimedHits: number; claimedDamage: number; claimedKills: number }
  /** 味方の編隊に撃たれた自軍の部隊(地上から分かる) */
  | { side: string; type: "airFratricide"; flight: string; units: string[]; damage: number };

const STRIKE: readonly AirMissionKind[] = ["support", "interdiction", "armedRecon", "onCall"];
const FIGHTER_WORK: readonly AirMissionKind[] = ["patrol", "escort", "cover"];

/** 空域の真ん中 */
function sectorCenter(key: string, ctx: SimContext): Vec2 {
  const { cols, rows } = airSectorGrid(ctx);
  const [c, r] = key.split(",").map(Number);
  return { x: ((c! + 0.5) * ctx.terrain.widthM) / cols, y: ((r! + 0.5) * ctx.terrain.heightM) / rows };
}

/** 地図の真ん中から方位 deg へ進んで、地図の縁にぶつかる点 */
function edgePoint(deg: number, ctx: SimContext): Vec2 {
  const cx = ctx.terrain.widthM / 2;
  const cy = ctx.terrain.heightM / 2;
  const dx = Math.sin((deg * Math.PI) / 180);
  const dy = Math.cos((deg * Math.PI) / 180);
  const kx = dx === 0 ? Infinity : (dx > 0 ? ctx.terrain.widthM - cx : -cx) / dx;
  const ky = dy === 0 ? Infinity : (dy > 0 ? ctx.terrain.heightM - cy : -cy) / dy;
  const k = Math.min(kx, ky);
  return { x: cx + dx * k, y: cy + dy * k };
}

/** 基地の方位(書いていなければ、陣営の部隊の重心の方) */
function baseBearing(force: AirForce, baseId: string, units: readonly Unit[], ctx: SimContext): number {
  const b = force.bases.find((x) => x.id === baseId)!;
  if (b.bearingDeg !== undefined) return b.bearingDeg;
  const own = units.filter((u) => u.side === force.side && u.strength > 0);
  const c = { x: ctx.terrain.widthM / 2, y: ctx.terrain.heightM / 2 };
  if (own.length === 0) return 0;
  const g = { x: own.reduce((t, u) => t + u.pos.x, 0) / own.length, y: own.reduce((t, u) => t + u.pos.y, 0) / own.length };
  return distance(g, c) < 1 ? 0 : bearing(c, g);
}

function speedMps(toe: Toe): number {
  return (toe.air?.speedMpm ?? 3000) / 60;
}

function moveToward(p: Vec2, to: Vec2, dist: number): Vec2 {
  const d = distance(p, to);
  if (d <= dist || d < 1e-6) return { ...to };
  return { x: p.x + ((to.x - p.x) * dist) / d, y: p.y + ((to.y - p.y) * dist) / d };
}

/** 編隊の行き先(戦場の上の点) */
function stationOf(task: AirTask, force: AirForce, units: readonly Unit[], intel: IntelState, ctx: SimContext): Vec2 {
  if (task.target) return { ...task.target };
  if (task.mission === "cover" && task.unitId) {
    const u = units.find((x) => x.id === task.unitId);
    if (u) return { ...u.pos };
  }
  const center = task.sector ? sectorCenter(task.sector, ctx) : { x: ctx.terrain.widthM / 2, y: ctx.terrain.heightM / 2 };
  if (task.mission === "interdiction") {
    // 阻止攻撃:空域の中で知っている敵のうち、真ん中にいちばん近いもの(なければ空域の真ん中)
    const known = Object.values(intel[force.side]?.entries ?? {}).filter((e) => !e.confirmedDestroyed && e.bestLevel > 0);
    const near = known.sort((a, b) => distance(a.lastSeenPos, center) - distance(b.lastSeenPos, center))[0];
    if (near && distance(near.lastSeenPos, center) < Math.max(ctx.terrain.widthM, ctx.terrain.heightM) / 3) return { ...near.lastSeenPos };
  }
  return center;
}

/** 1機の耐久(編成表は1機あたり) */
function aircraftHp(toe: Toe): number {
  return Math.max(0.1, toeHitPoints(toe));
}

/** 1機の対空の力(機銃・機関砲の antiAir) */
function aircraftAntiAir(toe: Toe, ctx: SimContext): number {
  let s = 0;
  for (const e of toe.elements) for (const ref of e.weapons) s += e.count * ref.count * (ctx.weapons.weapons[ref.weapon]?.antiAir ?? 0);
  return s;
}

export interface FlightStepResult {
  fire: FireResult[];
  events: FlightEvent[];
}

/**
 * 1小ステップの飛行:新しい編隊を地図の端に出し、動かし、空戦・対空砲・攻撃・偵察を解く。
 * 失った機は飛行隊の機数から引く(次の日の計画が小さくなる)。flyable が false(夜・暗い時間・天候)なら新しい編隊は出ない
 */
export function stepFlights(airOps: AirOpsState, units: readonly Unit[], intel: IntelState, t: number, dt: number, flyable: boolean, ctx: SimContext, rng: Rng): FlightStepResult {
  const r = ctx.rules.airOps!.flight;
  const out: FlightStepResult = { fire: [], events: [] };
  const minutes = dt / 60;
  const forces = ctx.scenario.airForces;
  const fx = ctx.rules.airOps!.effects;
  // 0:判読の済んだ写真を陣営の情報へ(地上や別の写真がもっと新しく見ていれば、そちらを残す)
  for (const force of forces) {
    const st = airOps[force.id];
    if (!st?.photos?.length) continue;
    for (const ph of st.photos.filter((p) => p.readyAt <= t)) {
      for (const u of ph.units) {
        const e = intel[force.side]?.entries[u.id];
        if (e && e.lastSeenTime >= ph.takenAt) continue;
        recordSighting(intel, force.side, u as unknown as Unit, ph.takenAt);
      }
      out.events.push({ side: force.side, type: "airPhoto", flight: ph.flight, found: ph.units.length, takenAt: ph.takenAt });
    }
    st.photos = st.photos.filter((p) => p.readyAt > t);
  }
  // 1:新しい編隊を出す
  for (const force of forces) {
    const st = airOps[force.id];
    if (!st) continue;
    st.flights ??= [];
    st.launched ??= [];
    for (const task of st.plan) {
      if (st.launched.includes(task.id) || task.offStationSec <= t) continue;
      const sq = force.squadrons.find((s) => s.id === task.squadron)!;
      const toe = ctx.toes.toes[sq.toe]!;
      const station = stationOf(task, force, units, intel, ctx);
      const entry = edgePoint(baseBearing(force, sq.base, units, ctx), ctx);
      const inMap = distance(entry, station) / speedMps(toe);
      if (t < task.onStationSec - inMap) continue;
      st.launched.push(task.id);
      // 戦場か基地の天候が悪ければ飛ばない(AIR5)
      if (!flyable || !baseFlyable(airOps, force.id, sq.base, ctx)) continue;
      const airborne = st.flights.filter((f) => f.squadron === task.squadron).reduce((n, f) => n + f.aircraft, 0);
      const free = (st.squadrons[task.squadron]?.aircraft ?? 0) - airborne;
      const aircraft = Math.min(task.aircraft, free);
      if (aircraft <= 0) continue;
      const sqState = st.squadrons[task.squadron];
      if (sqState) sqState.sorties = (sqState.sorties ?? 0) + aircraft;
      st.flights.push({
        id: task.id,
        force: force.id,
        side: force.side,
        squadron: task.squadron,
        toe: sq.toe,
        mission: task.mission,
        aircraft,
        pos: entry,
        entry,
        station,
        phase: "inbound",
        onStationSec: task.onStationSec,
        offStationSec: task.offStationSec,
        ...(task.unitId ? { unitId: task.unitId } : {}),
        ...(task.requestId ? { requestId: task.requestId } : {}),
      });
    }
  }
  const all = forces.flatMap((f) => airOps[f.id]?.flights ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
  // 2:動かす(戦場の天候が崩れたら、飛んでいる編隊は帰る)
  for (const f of all) {
    if (!flyable && f.phase !== "outbound") f.phase = "outbound";
    const toe = ctx.toes.toes[f.toe]!;
    const step = speedMps(toe) * dt;
    if (f.mission === "cover" && f.unitId) {
      const u = units.find((x) => x.id === f.unitId && x.strength > 0);
      if (u) f.station = { ...u.pos };
    }
    // 護衛:戦場に着く時刻の近い味方の攻撃の編隊に付いて飛ぶ。その編隊が帰るか落ちれば、護衛も帰る
    if (f.mission === "escort" && f.phase !== "outbound") {
      if (!f.escortOf) {
        const taken = new Set(all.filter((x) => x.escortOf).map((x) => x.escortOf));
        const ward = all
          .filter((x) => x.side === f.side && STRIKE.includes(x.mission) && x.phase !== "outbound" && x.aircraft > 0 && !taken.has(x.id) && Math.abs(x.onStationSec - f.onStationSec) <= fx.escortWindowMinutes * 60)
          .sort((a, b) => Math.abs(a.onStationSec - f.onStationSec) - Math.abs(b.onStationSec - f.onStationSec) || (a.id < b.id ? -1 : 1))[0];
        if (ward) f.escortOf = ward.id;
      }
      if (f.escortOf) {
        const ward = all.find((x) => x.id === f.escortOf);
        if (!ward || ward.aircraft <= 0 || ward.phase === "outbound") {
          f.phase = "outbound";
        } else {
          f.station = { ...ward.pos };
          f.pos = moveToward(f.pos, ward.pos, step);
          if (f.phase === "inbound" && distance(f.pos, ward.pos) < 1) f.phase = "station";
          continue;
        }
      }
    }
    if (f.phase === "inbound") {
      f.pos = moveToward(f.pos, f.station, step);
      if (distance(f.pos, f.station) < 1) {
        f.phase = "station";
        out.events.push({ side: f.side, type: "airArrived", flight: f.id, mission: f.mission, at: { ...f.pos } });
      }
    } else if (f.phase === "station") {
      if (f.mission === "cover") f.pos = moveToward(f.pos, f.station, step);
      const strikeDone = f.strikeFromSec !== undefined && t - f.strikeFromSec >= r.strikeMinutes * 60;
      if (t >= f.offStationSec || f.aborted || (STRIKE.includes(f.mission) && f.mission !== "onCall" && strikeDone) || (f.mission === "onCall" && strikeDone)) f.phase = "outbound";
    } else {
      f.pos = moveToward(f.pos, f.entry, step);
    }
  }
  // 3:空戦(戦闘機の仕事の編隊は、近くの敵の編隊に襲いかかる。襲われた側も撃ち返す)
  const losses = new Map<string, number>();
  // 誰が落としたか(実際に落ちた機を、撃った編隊に割り振って戦果にする)
  const shooters = new Map<string, Map<string, number>>();
  const credit = (target: string, by: string, amount: number) => {
    const m = shooters.get(target) ?? new Map<string, number>();
    m.set(by, (m.get(by) ?? 0) + amount);
    shooters.set(target, m);
  };
  for (const f of all) {
    if (f.aircraft <= 0 || !FIGHTER_WORK.includes(f.mission) || f.phase === "outbound" || (f.combatSec ?? 0) >= r.combatMinutes * 60) continue;
    const toe = ctx.toes.toes[f.toe]!;
    const enemy = all.filter((e) => e.side !== f.side && e.aircraft > 0 && distance(e.pos, f.pos) <= r.interceptRadiusM);
    if (enemy.length === 0) continue;
    f.combatSec = (f.combatSec ?? 0) + dt;
    const power = (f.aircraft * aircraftAntiAir(toe, ctx) * trainingOf({ training: ctx.scenario.airForces.find((x) => x.id === f.force)?.squadrons.find((s) => s.id === f.squadron)?.training ?? "regular" } as Unit, ctx.rules).firepowerMultiplier) / enemy.length;
    for (const e of enemy) {
      const eToe = ctx.toes.toes[e.toe]!;
      const lost = (power * r.airCombatScale * minutes * rng.spread(ctx.rules.combat.damageSpread)) / aircraftHp(eToe);
      losses.set(e.id, (losses.get(e.id) ?? 0) + lost);
      credit(e.id, f.id, lost);
      // 襲われた側も撃ち返す(攻撃機の旋回機銃・戦闘機どうし)
      const back = (e.aircraft * aircraftAntiAir(eToe, ctx) * r.airCombatScale * minutes * rng.spread(ctx.rules.combat.damageSpread)) / aircraftHp(toe) / Math.max(1, enemy.length);
      losses.set(f.id, (losses.get(f.id) ?? 0) + back);
      credit(f.id, e.id, back);
      // 攻撃の編隊は、襲われると爆弾を捨てて帰ることがある
      if (STRIKE.includes(e.mission) && e.phase !== "outbound" && e.strikeFromSec === undefined && rng.next() < r.abortChance * minutes) {
        e.aborted = true;
        out.events.push({ side: e.side, type: "airAbort", flight: e.id });
      }
    }
  }
  // 4:攻撃・偵察と対空砲
  for (const f of all) {
    if (f.aircraft <= 0 || f.phase !== "station" || f.aborted) continue;
    const toe = ctx.toes.toes[f.toe]!;
    const force = forces.find((x) => x.id === f.force)!;
    if (f.mission === "recon") {
      // 写真に撮る(持ち帰って判読するまで、陣営の情報には入らない)
      const vision = toe.air?.visionM ?? r.visionM;
      for (const u of units) {
        if (u.side === f.side || u.strength <= 0 || distance(u.pos, f.pos) > vision * (u.airMarked ? fx.markVisibility : 1)) continue;
        f.photo ??= [];
        const snap = { id: u.id, pos: { ...u.pos }, branch: u.branch, routed: u.routed, movedLastTurn: u.movedLastTurn };
        const i = f.photo.findIndex((x) => x.id === u.id);
        if (i >= 0) f.photo[i] = snap;
        else f.photo.push(snap);
        f.photoAt = t;
      }
      continue;
    }
    if (!STRIKE.includes(f.mission)) continue;
    // 即応の待機は、要請で目標を受けるか、待ち時間の終わりに空域の中の見つけた敵を叩く
    if (f.mission === "onCall" && !f.requestId && t < f.offStationSec - r.strikeMinutes * 60) continue;
    if (f.strikeFromSec === undefined) {
      // 目標:要請の地点はそのまま、ほかは近くに見つけた敵の部隊(なければ攻撃しない)
      if (!f.requestId) {
        // 武装偵察・阻止攻撃は空域を探し回る(空域の半分の広さ)、ほかは機種の目の届く距離
        const { cols, rows } = airSectorGrid(ctx);
        const roam = f.mission === "armedRecon" || f.mission === "interdiction" ? Math.hypot(ctx.terrain.widthM / cols, ctx.terrain.heightM / rows) / 2 : 0;
        const vision = Math.max(roam, toe.air?.visionM ?? r.visionM);
        // 前線の印を出した敵の部隊は、遠くからでも見える
        const seen = units.filter((u) => u.side !== f.side && u.strength > 0 && distance(u.pos, f.pos) <= vision * (u.airMarked ? fx.markVisibility : 1) && !ctx.toes.toes[u.toe]?.air);
        // 武装偵察・阻止攻撃は、動いている部隊(縦隊)を先に
        let target = seen.sort((a, b) => Number(b.route.length > 0) - Number(a.route.length > 0) || distance(a.pos, f.pos) - distance(b.pos, f.pos) || (a.id < b.id ? -1 : 1))[0];
        if (!target) {
          if (t >= f.offStationSec - r.strikeMinutes * 60) f.phase = "outbound";
          continue;
        }
        // 誤認:選んだ敵の近くの自軍の部隊を、敵と取り違えて狙う(印を出していれば取り違えにくい)
        const mistaken = units
          .filter((u) => u.side === f.side && u.strength > 0 && !ctx.toes.toes[u.toe]?.air && distance(u.pos, target!.pos) <= fx.misidentify.withinM)
          .sort((a, b) => distance(a.pos, target!.pos) - distance(b.pos, target!.pos) || (a.id < b.id ? -1 : 1))[0];
        if (mistaken && rng.next() < fx.misidentify.chance * (mistaken.airMarked ? fx.misidentify.markedMultiplier : 1)) target = mistaken;
        f.station = { ...target.pos };
        f.pos = { ...target.pos };
      }
      f.strikeFromSec = t;
      out.events.push({ side: f.side, type: "airAttack", flight: f.id, mission: f.mission, at: { ...f.station }, aircraft: f.aircraft });
    }
    if (t - f.strikeFromSec >= r.strikeMinutes * 60) continue;
    // 対空砲:攻撃している間、まわりの敵の対空の力に撃たれる
    const flak = units.filter((u) => u.side !== f.side && u.strength > 0 && distance(u.pos, f.station) <= r.flakRadiusM).reduce((s, u) => s + antiAirOf(u, ctx), 0);
    if (flak > 0) losses.set(f.id, (losses.get(f.id) ?? 0) + (flak * r.flakScale * minutes * rng.spread(ctx.rules.combat.damageSpread)) / aircraftHp(toe));
    // 攻撃:範囲の部隊は敵味方を問わない(自軍の部隊は fratricide の倍率で減らす)
    const fire = flightStrike(f, toe, units, ctx, rng, force, minutes);
    for (const x of fire) {
      const u = units.find((y) => y.id === x.targetId)!;
      if (u.side === f.side) {
        f.friendly ??= [];
        if (!f.friendly.includes(u.id)) f.friendly.push(u.id);
        f.friendlyDamage = (f.friendlyDamage ?? 0) + x.damage;
      } else {
        f.dealt = (f.dealt ?? 0) + x.damage;
        f.hit ??= [];
        if (!f.hit.includes(u.id)) f.hit.push(u.id);
      }
    }
    out.fire.push(...fire);
  }
  // 5:損害を機数に(端数は確率で)。失った機は飛行隊から引く
  for (const f of all) {
    const l = losses.get(f.id);
    if (!l) continue;
    const whole = Math.floor(l) + (rng.next() < l - Math.floor(l) ? 1 : 0);
    const lost = Math.min(f.aircraft, whole);
    if (lost <= 0) continue;
    f.aircraft -= lost;
    // 空戦で落ちた分を、撃った編隊に割り振る(対空砲の分は割り振らない)
    const by = shooters.get(f.id);
    if (by) {
      const total = l;
      const air = [...by.values()].reduce((a, b) => a + b, 0);
      for (const [id, amount] of by) {
        const g = all.find((x) => x.id === id);
        if (g) g.kills = (g.kills ?? 0) + (lost * amount) / Math.max(total, air);
      }
    }
    const sq = airOps[f.force]!.squadrons[f.squadron]!;
    sq.aircraft = Math.max(0, sq.aircraft - lost);
    sq.lost += lost;
    out.events.push({ side: f.side, type: "airLoss", flight: f.id, lost, cause: FIGHTER_WORK.some((m) => m === f.mission) || !f.strikeFromSec ? "airCombat" : "flak" });
  }
  // 6:帰り着いた・全機を失った編隊を消す。帰り着いた編隊は戦果を報告し(誇張する)、写真を判読に回す。味方撃ちは地上から分かる
  for (const force of forces) {
    const st = airOps[force.id];
    if (!st?.flights) continue;
    for (const f of st.flights) {
      const gone = f.aircraft <= 0;
      const home = !gone && f.phase === "outbound" && distance(f.pos, f.entry) < 1;
      if (!gone && !home) continue;
      if (f.friendly?.length) out.events.push({ side: f.side, type: "airFratricide", flight: f.id, units: [...f.friendly], damage: f.friendlyDamage ?? 0 });
      if (!home) continue;
      if ((f.hit?.length ?? 0) > 0 || (f.kills ?? 0) >= 0.5) {
        const k = fx.claimInflation.min + (fx.claimInflation.max - fx.claimInflation.min) * rng.next();
        out.events.push({
          side: f.side,
          type: "airClaim",
          flight: f.id,
          mission: f.mission,
          claimedHits: Math.round((f.hit?.length ?? 0) * k),
          claimedDamage: Math.round((f.dealt ?? 0) * k * 100) / 100,
          claimedKills: Math.round((f.kills ?? 0) * k),
        });
      }
      if (f.photo?.length) (st.photos ??= []).push({ flight: f.id, takenAt: f.photoAt!, readyAt: t + fx.photoDelayMinutes * 60, units: f.photo });
    }
    st.flights = st.flights.filter((f) => f.aircraft > 0 && !(f.phase === "outbound" && distance(f.pos, f.entry) < 1));
  }
  return out;
}

/** 攻撃の1小ステップの損害(機数 × 1機の武器の威力。範囲 strikeRadiusM に帯がかかった部隊) */
function flightStrike(f: Flight, toe: Toe, units: readonly Unit[], ctx: SimContext, rng: Rng, force: AirForce, minutes: number): FireResult[] {
  const r = ctx.rules.airOps!.flight;
  const c = ctx.rules.combat;
  const out: FireResult[] = [];
  const skill = trainingOf({ training: force.squadrons.find((s) => s.id === f.squadron)?.training ?? "regular" } as Unit, ctx.rules).firepowerMultiplier;
  const weapons = toe.elements.flatMap((e) => e.weapons.map((ref) => ({ w: ctx.weapons.weapons[ref.weapon]!, n: e.count * ref.count }))).filter((x) => x.w && weaponPowerAt(x.w, 0) > 0);
  for (const t of [...units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (t.strength <= 0 || ctx.toes.toes[t.toe]?.air) continue;
    const covered = frontCoverage(frontOf(t, ctx), f.station, r.strikeRadiusM);
    if (covered <= 0) continue;
    const tToe = ctx.toes.toes[t.toe]!;
    const armor = armorNow(t, ctx);
    let fp = 0;
    let supp = 0;
    let soft = 0;
    let armored = 0;
    for (const { w, n } of weapons) {
      const p = n * weaponPowerAt(w, 0) * weaponEffectAgainst(w, armor);
      fp += p;
      supp += p * w.suppression;
      soft += p * w.effectiveness.soft;
      armored += p * w.effectiveness.armored;
    }
    if (fp <= 0) continue;
    const taken =
      c.entrenchmentDamageTaken[t.entrenchment - ctx.rules.entrenchment.minLevel]! *
      formationDamageTaken(t, ctx) *
      ctx.rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
      stanceOf(t, ctx.rules).damageTakenMultiplier *
      moraleStateDamageTaken(t, ctx);
    // 自軍の部隊(爆弾の散らばり・取り違え):印を出していれば・事前計画の近接支援(地上と打ち合わせ済み)なら減る
    const fx = ctx.rules.airOps!.effects.fratricide;
    const own = t.side === f.side ? fx.base * (t.airMarked ? fx.marked : 1) * (f.requestId && f.mission === "support" ? fx.preplanned : 1) : 1;
    if (own <= 0) continue;
    const points = f.aircraft * fp * skill * covered * minutes * c.damageScale * taken * own * rng.spread(c.damageSpread);
    const frac = armoredDamageFraction(t, ctx, soft / fp, armored / fp);
    out.push({ attackerId: `air:${f.side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: supp / fp, ...(frac !== undefined ? { armoredFraction: frac } : {}) });
  }
  return out;
}

/** 陣営から見える編隊:自陣営の編隊と、地上の部隊・自陣営の編隊から sightM の内の敵の編隊 */
export function visibleFlights(airOps: AirOpsState | undefined, side: string, units: readonly Unit[], ctx: SimContext): Flight[] {
  if (!airOps) return [];
  const sight = ctx.rules.airOps?.flight.sightM ?? 15000;
  const all = Object.values(airOps).flatMap((st) => st.flights ?? []);
  const eyes = [...units.filter((u) => u.side === side && u.strength > 0).map((u) => u.pos), ...all.filter((f) => f.side === side).map((f) => f.pos)];
  return all.filter((f) => f.side === side || eyes.some((p) => distance(p, f.pos) <= sight)).map((f) => structuredClone(f));
}

export type { AirForceState };
