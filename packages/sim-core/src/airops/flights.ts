import { antiAirOf } from "../air.js";
import { armorNow, armoredDamageFraction } from "../armor.js";
import { formationDamageTaken, moraleStateDamageTaken, type FireResult } from "../combat.js";
import type { SimContext } from "../context.js";
import { frontCoverage, frontOf } from "../frontage.js";
import { bearing, distance, type Vec2 } from "../geometry.js";
import { recordSighting, type IntelState } from "../intel.js";
import type { Rng } from "../rng.js";
import { stanceOf } from "../stance.js";
import { toeHitPoints, weaponEffectAgainst, type Toe } from "../toe.js";
import { trainingOf } from "../training.js";
import type { Unit } from "../unit.js";
import { weaponPowerAt } from "../weapon.js";
import { cycleMinutes, freeAircraft, pickSquadron, squadronSpec, type AirForceState, type AirOpsState, type AirPhoto, type AirTask } from "./plan.js";
import { makeSortie } from "./requests.js";
import type { AirForce, AirMissionKind } from "./rules.js";
import { baseFlyable } from "./weather.js";

/**
 * 盤上の飛行(docs/air-design.md の4)。出撃(要請・護衛・迎撃)は、戦場の上に着く時刻に合わせて地図の端から入る編隊になる。
 * 編隊は陸の部隊(Unit)ではなく、航空司令部の状態に持つ(勝敗・損耗の分母・探知に入らない)。
 * 攻撃の編隊は要請の地点を叩き(対空砲に撃たれる)、戦闘機は護衛する編隊に付いて飛ぶか、迎え撃つ敵の編隊を追う。
 * 偵察機は見つけた敵を写真に撮り、輸送機は空輸を落とし、時間がたてば帰る
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
  /** 応えている要請と、空輸を受け取る部隊 */
  requestId?: string;
  unitId?: string;
  /** 護衛している攻撃の編隊・追っている敵の編隊 */
  escortOf?: string;
  chase?: string;
  /** 空輸を落としたか */
  dropped?: boolean;
  /** 帰って報告する分:敵に与えた損害(戦力の割合の合計)・損害を与えた敵の部隊・空戦で落とした機数(端数込み) */
  dealt?: number;
  hit?: string[];
  kills?: number;
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
  /** 空輸を受け取った部隊(弾薬・燃料のトン) */
  | { side: string; type: "airSupplied"; flight: string; at: Vec2; deliveries: { unitId: string; ammoT: number; fuelT: number }[] }
  /** 敵の編隊を迎え撃つ戦闘機が飛び立った */
  | { side: string; type: "airScramble"; flight: string; chase: string };

const STRIKE: readonly AirMissionKind[] = ["support"];
const FIGHTER_WORK: readonly AirMissionKind[] = ["escort", "intercept"];
/** 戦闘機が迎え撃つ敵の任務 */
const INTERCEPTED: readonly AirMissionKind[] = ["support", "recon", "airlift"];

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

/** 編隊の行き先(戦場の上の点):追う敵の編隊・護衛する編隊が飛んでいればその位置、なければ目標の地点、それもなければ地図の真ん中 */
function stationOf(task: AirTask, all: readonly Flight[], ctx: SimContext): Vec2 {
  const other = all.find((f) => f.id === (task.chase ?? task.escortOf));
  if (other) return { ...other.pos };
  if (task.target) return { ...task.target };
  return { x: ctx.terrain.widthM / 2, y: ctx.terrain.heightM / 2 };
}

/** 出撃が地図の端から入る時刻 */
function entryTime(task: AirTask, force: AirForce, all: readonly Flight[], units: readonly Unit[], ctx: SimContext): number {
  const sq = force.squadrons.find((s) => s.id === task.squadron)!;
  const entry = edgePoint(baseBearing(force, sq.base, units, ctx), ctx);
  return task.onStationSec - distance(entry, stationOf(task, all, ctx)) / speedMps(ctx.toes.toes[sq.toe]!);
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
  // 1:迎え撃つ:見えている敵の攻撃・偵察・輸送の編隊と、警戒の網(電探・監視哨)にかかった、地図の端に warningMinutes の内に入ってくる敵の出撃ごとに、
  //   まだ追う出撃がなければ、出せる戦闘機を1編隊出す(自動)
  if (flyable) {
    const flying = forces.flatMap((f) => airOps[f.id]?.flights ?? []);
    for (const force of forces) {
      const st = airOps[force.id];
      if (!st) continue;
      st.launched ??= [];
      const seen = visibleFlights(airOps, force.side, units, ctx)
        .filter((e) => e.side !== force.side && INTERCEPTED.includes(e.mission) && e.phase !== "outbound" && e.aircraft > 0)
        .map((e) => ({ id: e.id, target: e.station }));
      const coming = forces
        .filter((f) => f.side !== force.side)
        .flatMap((f) => (airOps[f.id]?.sorties ?? []).filter((x) => INTERCEPTED.includes(x.mission) && entryTime(x, f, flying, units, ctx) <= t + r.warningMinutes * 60).map((x) => ({ id: x.id, target: x.target })));
      for (const e of [...seen, ...coming].sort((x, y) => (x.id < y.id ? -1 : 1))) {
        const id = `${force.id}:i:${e.id}`;
        if (st.launched.includes(id) || st.sorties.some((x) => x.id === id)) continue;
        const pick = pickSquadron(force, st, "intercept", t, ctx);
        if (!pick) break;
        if (!baseFlyable(airOps, force.id, squadronSpec(force, pick.id, ctx).sq.base, ctx)) continue;
        const size = squadronSpec(force, pick.id, ctx).role?.flightSize ?? 4;
        makeSortie(force, st, "intercept", pick.id, Math.min(pick.free, size), t + cycleMinutes(force, pick.id, ctx).transit * 60, id, ctx, { chase: e.id, ...(e.target ? { target: { ...e.target } } : {}) });
        out.events.push({ side: force.side, type: "airScramble", flight: id, chase: e.id });
      }
    }
  }
  // 2:新しい編隊を出す(戦場の上に着く時刻に合わせて地図の端から。遅れて出す編隊は、地図の中の道のりを先に済ませておく)
  for (const force of forces) {
    const st = airOps[force.id];
    if (!st) continue;
    st.flights ??= [];
    st.launched ??= [];
    const flying = forces.flatMap((f) => airOps[f.id]?.flights ?? []);
    for (const task of [...st.sorties]) {
      if (st.launched.includes(task.id)) continue;
      const sq = force.squadrons.find((s) => s.id === task.squadron)!;
      const toe = ctx.toes.toes[sq.toe]!;
      const station = stationOf(task, flying, ctx);
      const entry = edgePoint(baseBearing(force, sq.base, units, ctx), ctx);
      const inMap = distance(entry, station) / speedMps(toe);
      if (t < task.onStationSec - inMap) continue;
      st.launched.push(task.id);
      st.sorties = st.sorties.filter((x) => x.id !== task.id);
      // 戦場か基地の天候が悪ければ飛ばない(AIR5)。空の時間が過ぎた出撃も
      if (!flyable || !baseFlyable(airOps, force.id, sq.base, ctx) || task.offStationSec <= t) continue;
      const aircraft = Math.min(task.aircraft, freeAircraft(st, task.squadron, t));
      if (aircraft <= 0) continue;
      const sqState = st.squadrons[task.squadron];
      if (sqState) sqState.sorties = (sqState.sorties ?? 0) + aircraft;
      const late = Math.max(0, t - (task.onStationSec - inMap));
      st.flights.push({
        id: task.id,
        force: force.id,
        side: force.side,
        squadron: task.squadron,
        toe: sq.toe,
        mission: task.mission,
        aircraft,
        pos: moveToward(entry, station, late * speedMps(toe)),
        entry,
        station,
        phase: "inbound",
        onStationSec: task.onStationSec,
        offStationSec: task.offStationSec,
        ...(task.requestId ? { requestId: task.requestId } : {}),
        ...(task.unitId ? { unitId: task.unitId } : {}),
        ...(task.escortOf ? { escortOf: task.escortOf } : {}),
        ...(task.chase ? { chase: task.chase } : {}),
      });
    }
  }
  const all = forces.flatMap((f) => airOps[f.id]?.flights ?? []).sort((a, b) => (a.id < b.id ? -1 : 1));
  // 3:動かす(戦場の天候が崩れたら、飛んでいる編隊は帰る)
  for (const f of all) {
    if (!flyable && f.phase !== "outbound") f.phase = "outbound";
    const toe = ctx.toes.toes[f.toe]!;
    const step = speedMps(toe) * dt;
    // 護衛:護衛する攻撃の編隊に付いて飛ぶ。その編隊が帰るか落ちれば、護衛も帰る(まだ飛び立っていなければ、目標の地点へ先に向かう)
    // 迎撃:追う敵の編隊へ向かう。その編隊が帰るか落ちれば帰る
    const otherId = f.phase === "outbound" ? undefined : (f.escortOf ?? f.chase);
    if (otherId) {
      const other = all.find((x) => x.id === otherId);
      const started = forces.some((x) => (airOps[x.id]?.launched ?? []).includes(otherId));
      if (!other || other.aircraft <= 0 || other.phase === "outbound") {
        if (started) f.phase = "outbound";
      } else {
        f.station = { ...other.pos };
        f.pos = moveToward(f.pos, other.pos, step);
        if (f.phase === "inbound" && distance(f.pos, other.pos) < 1) f.phase = "station";
        if (t >= f.offStationSec) f.phase = "outbound";
        continue;
      }
    }
    if (f.phase === "inbound") {
      f.pos = moveToward(f.pos, f.station, step);
      if (distance(f.pos, f.station) < 1) {
        f.phase = "station";
        out.events.push({ side: f.side, type: "airArrived", flight: f.id, mission: f.mission, at: { ...f.pos } });
      }
    } else if (f.phase === "station") {
      const strikeDone = f.strikeFromSec !== undefined && t - f.strikeFromSec >= r.strikeMinutes * 60;
      if (t >= f.offStationSec || f.aborted || strikeDone || f.dropped) f.phase = "outbound";
    } else {
      f.pos = moveToward(f.pos, f.entry, step);
    }
  }
  // 4:空戦(戦闘機の仕事の編隊は、近くの敵の編隊に襲いかかる。襲われた側も撃ち返す)
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
  // 5:攻撃・偵察・空輸と対空砲
  for (const f of all) {
    if (f.aircraft <= 0 || f.phase !== "station" || f.aborted) continue;
    const toe = ctx.toes.toes[f.toe]!;
    const force = forces.find((x) => x.id === f.force)!;
    if (f.mission === "recon") {
      // 写真に撮る(持ち帰って判読するまで、陣営の情報には入らない)
      const vision = toe.air?.visionM ?? r.visionM;
      for (const u of units) {
        if (u.side === f.side || u.strength <= 0 || distance(u.pos, f.pos) > vision) continue;
        f.photo ??= [];
        const snap = { id: u.id, pos: { ...u.pos }, branch: u.branch, routed: u.routed, movedLastTurn: u.movedLastTurn };
        const i = f.photo.findIndex((x) => x.id === u.id);
        if (i >= 0) f.photo[i] = snap;
        else f.photo.push(snap);
        f.photoAt = t;
      }
      continue;
    }
    if (f.mission === "airlift") {
      if (f.dropped) continue;
      f.dropped = true;
      const deliveries = dropSupplies(f, units, ctx);
      out.events.push({ side: f.side, type: "airSupplied", flight: f.id, at: { ...f.station }, deliveries });
      continue;
    }
    if (!STRIKE.includes(f.mission)) continue;
    if (f.strikeFromSec === undefined) {
      f.strikeFromSec = t;
      out.events.push({ side: f.side, type: "airAttack", flight: f.id, mission: f.mission, at: { ...f.station }, aircraft: f.aircraft });
    }
    if (t - f.strikeFromSec >= r.strikeMinutes * 60) continue;
    // 対空砲:攻撃している間、まわりの敵の対空の力に撃たれる
    const flak = units.filter((u) => u.side !== f.side && u.strength > 0 && distance(u.pos, f.station) <= r.flakRadiusM).reduce((s, u) => s + antiAirOf(u, ctx), 0);
    if (flak > 0) losses.set(f.id, (losses.get(f.id) ?? 0) + (flak * r.flakScale * minutes * rng.spread(ctx.rules.combat.damageSpread)) / aircraftHp(toe));
    // 攻撃:範囲の敵の部隊(味方撃ちは表さない。ユーザー判断)
    const fire = flightStrike(f, toe, units, ctx, rng, force, minutes);
    for (const x of fire) {
      f.dealt = (f.dealt ?? 0) + x.damage;
      f.hit ??= [];
      if (!f.hit.includes(x.targetId)) f.hit.push(x.targetId);
    }
    out.fire.push(...fire);
  }
  // 6:損害を機数に(端数は確率で)。失った機は飛行隊から引く
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
  // 7:帰り着いた・全機を失った編隊を消す。帰り着いた編隊は戦果を報告し(誇張する)、写真を判読に回し、基地へ戻って積み直す(行き + 積み直しの分は出せない)
  for (const force of forces) {
    const st = airOps[force.id];
    if (!st?.flights) continue;
    for (const f of st.flights) {
      const gone = f.aircraft <= 0;
      const home = !gone && f.phase === "outbound" && distance(f.pos, f.entry) < 1;
      if (!gone && !home) continue;
      if (!home) continue;
      const { transit, turnaround } = cycleMinutes(force, f.squadron, ctx);
      const sq = st.squadrons[f.squadron];
      if (sq) {
        sq.recovering = [...(sq.recovering ?? []).filter((x) => x.until > t), { n: f.aircraft, until: t + (transit + turnaround) * 60 }];
      }
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
    if (t.side === f.side || t.strength <= 0 || ctx.toes.toes[t.toe]?.air) continue;
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
    const points = f.aircraft * fp * skill * covered * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
    const frac = armoredDamageFraction(t, ctx, soft / fp, armored / fp);
    out.push({ attackerId: `air:${f.side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: supp / fp, ...(frac !== undefined ? { armoredFraction: frac } : {}) });
  }
  return out;
}

/**
 * 空輸を落とす(units を書き換える)。受け取る部隊を先に、落とした地点の近く(rules.air.dropRadiusM)の自軍の部隊へ、近い順に不足分を配る。
 * 1機で運ぶ量は機種の air.payloadT(なければ flight.airliftPayloadT)。弾薬と燃料に半分ずつ。余りは失われる
 */
function dropSupplies(f: Flight, units: readonly Unit[], ctx: SimContext): { unitId: string; ammoT: number; fuelT: number }[] {
  const toe = ctx.toes.toes[f.toe]!;
  const total = f.aircraft * (toe.air?.payloadT ?? ctx.rules.airOps!.flight.airliftPayloadT);
  let ammoLeft = total / 2;
  let fuelLeft = total / 2;
  const near = units
    .filter((u) => u.side === f.side && u.strength > 0 && (u.id === f.unitId || distance(u.pos, f.station) <= ctx.rules.air.dropRadiusM))
    .sort((a, b) => Number(b.id === f.unitId) - Number(a.id === f.unitId) || distance(a.pos, f.station) - distance(b.pos, f.station) || (a.id < b.id ? -1 : 1));
  const out: { unitId: string; ammoT: number; fuelT: number }[] = [];
  for (const u of near) {
    const cap = ctx.toes.toes[u.toe]!.supply;
    const ammoT = Math.min(ammoLeft, (1 - u.ammo) * cap.ammoCapacityT);
    const fuelT = Math.min(fuelLeft, (1 - u.fuel) * cap.fuelCapacityT);
    if (cap.ammoCapacityT > 0) u.ammo = Math.min(1, u.ammo + ammoT / cap.ammoCapacityT);
    if (cap.fuelCapacityT > 0) u.fuel = Math.min(1, u.fuel + fuelT / cap.fuelCapacityT);
    ammoLeft -= ammoT;
    fuelLeft -= fuelT;
    if (ammoT > 0 || fuelT > 0) out.push({ unitId: u.id, ammoT, fuelT });
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
