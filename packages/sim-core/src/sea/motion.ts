import type { SimContext } from "../context.js";
import { bearing, distance, normalizeBearing, type Vec2 } from "../geometry.js";
import { floodingSpeedMultiplier } from "../gunnery.js";
import type { IntelState } from "../intel.js";
import { shipSpeedMultiplier } from "../naval.js";
import { terrainSpeed } from "../pathfinding.js";
import type { ShipHandling } from "../rulepack.js";
import type { Unit } from "../unit.js";
import { toeIndirectMaxRange } from "../toe.js";
import { hullSpeedMultiplier } from "./damage.js";
import { bandMeters, reform, sideOf, spacingOf, squadronMembers, straightTrail, type SquadronState, type Squadrons } from "./squadron.js";

/**
 * 艦の動き(docs/naval-design.md の3)。小ステップの中を SUB_SEC 秒刻みで進める。
 * - 旋回の速さ = 速さ ÷ (旋回の直径 ÷ 2)。加減速は艦種ごとのノット毎分
 * - 単縦陣:先頭の艦は航跡を残し、k 番目の艦は航跡の上で先頭から k × 間隔だけ後ろの点を追う(逐次回頭)
 * - 一斉回頭の後(梯陣):全艦が戦隊の針路へ同時に向く
 * - 単横陣・輪形陣:戦隊の針路から見た持ち場へ寄る
 * - 前方の艦から舵を切って離れ、陸へは進まない
 */
const SUB_SEC = 10;
const KNOT = 0.514444;
/** 航跡の点の間隔(m) */
const TRAIL_STEP_M = 100;
/** 後ろの艦が狙う、持ち場より先の航跡の点までの距離(m) */
const LOOKAHEAD_M = 300;
/** 陸を避けるために前を見る距離(m) */
const LAND_LOOKAHEAD_M = 1500;

export function handlingOf(u: Unit, ctx: SimContext): ShipHandling {
  const m = ctx.rules.naval!.motion!;
  const ship = ctx.toes.toes[u.toe]?.ship;
  const base = (ship && m.handling.byType[ship.type]) || m.handling.default;
  return ship?.turnDiameterM ? { ...base, turnDiameterM: ship.turnDiameterM } : base;
}

/** 艦の今の最大速力(m/秒):艦級の速さに、損傷・浸水・動力の停止の倍率を掛ける */
export function maxSpeedMps(u: Unit, ctx: SimContext): number {
  const toe = ctx.toes.toes[u.toe]!;
  const base = (toe.speedMpm ?? ctx.branches.branches[u.branch]?.marchSpeedMpm ?? 0) / 60;
  if (u.hull) return base * hullSpeedMultiplier(u, ctx);
  return base * shipSpeedMultiplier(u, ctx) * floodingSpeedMultiplier(u, ctx);
}

/** 戦隊の主砲の最大射程(m。交戦の距離の帯の物差し) */
export function squadronMainRange(members: readonly Unit[], ctx: SimContext): number {
  let best = 0;
  for (const u of members) {
    const toe = ctx.toes.toes[u.toe]!;
    for (const b of toe.ship?.batteries ?? []) {
      const w = ctx.weapons.weapons[b.weapon];
      if (!w || w.torpedo || !w.naval) continue;
      best = Math.max(best, w.bands.at(-1)?.maxRangeM ?? 0);
    }
  }
  return best || Math.max(0, ...members.map((u) => toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons)));
}

function isSea(p: Vec2, ctx: SimContext): boolean {
  if (p.x < 0 || p.y < 0 || p.x > ctx.terrain.widthM || p.y > ctx.terrain.heightM) return false;
  return terrainSpeed(ctx.terrain.terrainAt(p), "naval", ctx) > 0;
}

/** 方位 heading へ LAND_LOOKAHEAD_M 先までが海か */
function clearAhead(p: Vec2, heading: number, ctx: SimContext, len = LAND_LOOKAHEAD_M): boolean {
  const rad = (heading * Math.PI) / 180;
  for (let d = 250; d <= len; d += 250) if (!isSea({ x: p.x + Math.sin(rad) * d, y: p.y + Math.cos(rad) * d }, ctx)) return false;
  return true;
}

/** 望む針路に近い、前方が海の針路(どこもふさがっていれば望む針路のまま) */
function avoidLand(p: Vec2, desired: number, ctx: SimContext): number {
  if (clearAhead(p, desired, ctx)) return desired;
  for (let k = 15; k <= 180; k += 15) {
    for (const h of [desired + k, desired - k]) if (clearAhead(p, h, ctx)) return normalizeBearing(h);
  }
  return desired;
}

/** 航跡の上で、先頭(航跡の最後の点)から back メートル後ろの点 */
function trailPoint(trail: readonly Vec2[], lead: Vec2, back: number): Vec2 {
  let left = back;
  let prev = lead;
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i]!;
    const d = distance(prev, p);
    if (d >= left && d > 0) return { x: prev.x + ((p.x - prev.x) * left) / d, y: prev.y + ((p.y - prev.y) * left) / d };
    left -= d;
    prev = p;
  }
  return prev;
}

/** 回るときの舵の向き(右回りが正):目標の方位 desired へ、近いほうへ */
function turnDelta(from: number, desired: number): number {
  let d = normalizeBearing(desired) - normalizeBearing(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export interface SeaMoveInput {
  squadrons: Squadrons;
  units: readonly Unit[];
  byId: ReadonlyMap<string, Unit>;
  intel: IntelState;
  /** このステップの終わりの時刻(秒) */
  tEnd: number;
  dt: number;
  ctx: SimContext;
}

/** このステップの間、戦隊ごとに先導の艦の望む針路・速さを決め、全艦を動かす。動いた艦の ID を返す */
export function stepSquadrons(inp: SeaMoveInput): Set<string> {
  const { squadrons, byId, ctx, dt } = inp;
  const m = ctx.rules.naval!.motion!;
  const moved = new Set<string>();
  const start = new Map<string, Vec2>();
  for (const sq of Object.values(squadrons)) for (const u of squadronMembers(sq, byId)) start.set(u.id, { ...u.pos });
  // 陣形を変える時間
  for (const sq of Object.values(squadrons)) {
    if (!sq.formationChange) continue;
    sq.formationChange.leftSec -= dt;
    if (sq.formationChange.leftSec <= 1e-9) {
      sq.formation = sq.formationChange.to;
      delete sq.formationChange;
      if (!sq.inLine) reform(sq, byId);
    }
  }
  const ids = Object.keys(squadrons).sort();
  for (let t = 0; t < dt - 1e-9; t += SUB_SEC) {
    const h = Math.min(SUB_SEC, dt - t);
    const now = inp.tEnd - dt + t + h;
    for (const id of ids) {
      const sq = squadrons[id]!;
      const members = squadronMembers(sq, byId);
      if (members.length === 0) continue;
      const lead = members[0]!;
      // 陣形は艦にも写す(航空攻撃・対空の陣形の倍率は艦の navalFormation を見る)
      for (const u of members) u.navalFormation = sq.formation;
      // 戦隊の速さ:速力の段 × いちばん遅い艦の最大速力(2隻以上なら、後ろの艦が持ち場に追いつけるよう少し抑える)
      const slowest = Math.min(...members.map((u) => maxSpeedMps(u, ctx)));
      const margin = members.length > 1 && sq.speed !== "flank" ? (ctx.rules.naval!.stationSpeedMargin ?? 0.9) : 1;
      let fleetSpeed = m.speeds[sq.speed] * slowest * margin * (sq.evade ? m.evade.speedMultiplier : 1);
      const course = leadCourse(sq, lead, members, inp, now);
      if (sq.toward && distance(lead.pos, sq.toward) <= m.arriveM) {
        if (sq.patrol) {
          sq.patrol.next = (sq.patrol.next + 1) % sq.patrol.points.length;
          sq.toward = { ...sq.patrol.points[sq.patrol.next]! };
        } else {
          sq.course = lead.facing;
          delete sq.toward;
        }
      }
      if (sq.follow) {
        const other = squadrons[sq.follow];
        const tail = other ? squadronMembers(other, byId).at(-1) : undefined;
        if (tail) fleetSpeed = Math.min(fleetSpeed * 1.15, Math.max(0, (tail.speedMps ?? 0) + (distance(lead.pos, tail.pos) - spacingOf(ctx)) / 120));
      }
      const zig = sq.evade ? m.evade.swingDeg * Math.sin((2 * Math.PI * now) / (m.evade.periodMinutes * 60)) : 0;
      steer(lead, normalizeBearing(course + zig), fleetSpeed, h, inp);
      // 航跡を残す
      const last = sq.trail.at(-1);
      if (!last || distance(last, lead.pos) >= TRAIL_STEP_M) sq.trail.push({ ...lead.pos });
      const keep = members.length * spacingOf(ctx, sq.formation) + 3000;
      trimTrail(sq, lead.pos, keep);
      const station = ctx.rules.naval!.formations[sq.formation]?.station ?? { kind: "column" as const, spacingM: spacingOf(ctx) };
      for (let k = 1; k < members.length; k++) {
        const u = members[k]!;
        if (u.combing) continue;
        if (!sq.inLine) {
          // 梯陣:先導の艦と同じ針路・速さ
          steer(u, normalizeBearing(sq.course + zig), fleetSpeed, h, inp);
          continue;
        }
        if (station.kind === "column") {
          const spot = trailPoint(sq.trail, lead.pos, k * station.spacingM);
          const aim = trailPoint(sq.trail, lead.pos, Math.max(0, k * station.spacingM - LOOKAHEAD_M));
          const gap = distance(u.pos, spot);
          const ahead = Math.cos(((bearing(u.pos, spot) - u.facing) * Math.PI) / 180) >= 0 ? 1 : -1;
          const want = Math.max(0, (lead.speedMps ?? fleetSpeed) + (ahead * gap) / 60);
          steer(u, gap < 30 ? lead.facing : bearing(u.pos, aim), want, h, inp);
        } else {
          const spot = stationSpot(station, lead, sq.course, k);
          const gap = distance(u.pos, spot);
          const want = gap < 150 ? (lead.speedMps ?? fleetSpeed) : Math.min(maxSpeedMps(u, ctx), fleetSpeed + gap / 60);
          steer(u, gap < 150 ? sq.course : bearing(u.pos, spot), want, h, inp);
        }
      }
    }
    // 雷跡を避けている艦は、魚雷と同じ向きへ全速で
    for (const u of inp.units) if (u.combing && u.strength > 0) steer(u, u.combing.heading, maxSpeedMps(u, ctx), h, inp);
  }
  for (const [id, p] of start) {
    const u = byId.get(id)!;
    u.speedMps = distance(p, u.pos) / dt;
    if (distance(p, u.pos) > 1) moved.add(id);
  }
  return moved;
}

function trimTrail(sq: SquadronState, lead: Vec2, keep: number) {
  let len = 0;
  let prev = lead;
  for (let i = sq.trail.length - 1; i >= 0; i--) {
    len += distance(prev, sq.trail[i]!);
    prev = sq.trail[i]!;
    if (len > keep) {
      sq.trail.splice(0, i);
      return;
    }
  }
}

/** 単横陣・輪形陣の k 番目の艦の持ち場(戦隊の針路から見て) */
function stationSpot(station: { kind: "column" | "abreast" | "ring"; spacingM: number }, lead: Unit, course: number, k: number): Vec2 {
  const at = (deg: number, d: number) => ({ x: lead.pos.x + Math.sin((deg * Math.PI) / 180) * d, y: lead.pos.y + Math.cos((deg * Math.PI) / 180) * d });
  if (station.kind === "abreast") return at(course + (k % 2 === 1 ? 90 : -90), station.spacingM * Math.ceil(k / 2));
  return at(course + (360 * (k - 1)) / 8, station.spacingM);
}

/**
 * 先導の艦の望む針路:交戦の帯(目標が分かっていれば) → 後ろにつく戦隊 → 向かう点 → 命じた針路。陸は避ける。
 * 交戦の帯:遠ければ詰め、近ければ離れ、帯の中では目標を舷側に置く(今の針路に近いほうの舷)
 */
function leadCourse(sq: SquadronState, lead: Unit, members: readonly Unit[], inp: SeaMoveInput, now: number): number {
  const { ctx } = inp;
  let want = sq.course;
  const engaged = sq.engage ? engagePoint(sq, inp, now) : undefined;
  if (engaged && sq.engage) {
    const r = distance(lead.pos, engaged);
    const band = bandMeters(sq.engage.band, squadronMainRange(members, ctx), ctx);
    const to = bearing(lead.pos, engaged);
    const beam = normalizeBearing(to - 90 * sideOf(lead.pos, lead.facing, engaged));
    // 遠ければ、目標へ向けて 30° 振って詰める(前後の砲が向くように)。近すぎれば、目標を斜め後ろに置いて離れる
    if (r > band.max) want = normalizeBearing(to + Math.max(-30, Math.min(30, turnDelta(to, beam))));
    else if (r < band.min) want = normalizeBearing(to + 180 - 45 * sideOf(lead.pos, lead.facing, engaged));
    else want = beam;
  } else if (sq.follow) {
    const other = inp.squadrons[sq.follow];
    const tail = other ? squadronMembers(other, inp.byId).at(-1) : undefined;
    if (tail) want = bearing(lead.pos, trailPoint(other!.trail.length ? [...other!.trail, tail.pos] : [tail.pos], tail.pos, spacingOf(ctx)));
  } else if (sq.toward) {
    want = bearing(lead.pos, sq.toward);
  }
  // 交戦・後ろにつく・向かう点で決めた針路は、戦隊の針路にもする(梯陣・単横陣の艦がそろえる向き)
  if (engaged || sq.follow || sq.toward) sq.course = want;
  return avoidLand(lead.pos, want, ctx);
}

/** 交戦の目標の、陣営の知っている位置(今見えているか、見失って5分以内)。分からなければ undefined */
function engagePoint(sq: SquadronState, inp: SeaMoveInput, now: number): Vec2 | undefined {
  const e = inp.intel[sq.side]?.entries[sq.engage!.target];
  if (!e || e.confirmedDestroyed) return undefined;
  if (e.currentLevel > 0) return inp.byId.get(sq.engage!.target)?.pos ?? e.lastSeenPos;
  return now - e.lastSeenTime <= 300 ? e.lastSeenPos : undefined;
}

/** 1隻を h 秒動かす:望む針路へ旋回の速さの上限で回り、望む速さへ加減速の上限で近づける。前方の艦を避け、陸には入らない。
 * 舵の故障中は決まった向きに回り続け、司令塔をやられて指揮の乱れた艦は今の針路のまま進む */
function steer(u: Unit, desiredIn: number, wantSpeedIn: number, h: number, inp: SeaMoveInput) {
  const { ctx } = inp;
  let desired = desiredIn;
  let wantSpeed = wantSpeedIn;
  const jam = u.hull?.rudderJam;
  if (jam && jam.untilSec > inp.tEnd - inp.dt) {
    desired = normalizeBearing(u.facing + jam.dir * 90);
    wantSpeed = Math.max(wantSpeed, u.speedMps ?? 0);
  } else if (jam) delete u.hull!.rudderJam;
  else if ((u.hull?.conFusedSec ?? 0) > 0) desired = u.facing;
  const m = ctx.rules.naval!.motion!;
  const hd = handlingOf(u, ctx);
  const vmax = maxSpeedMps(u, ctx);
  let target = Math.min(vmax, Math.max(0, wantSpeed));
  let heading = desired;
  // 前方の艦を避ける(敵味方とも。真正面に近いほど大きく舵を切り、速さを落とす)
  for (const o of inp.units) {
    if (o.id === u.id || o.strength <= 0 || !ctx.toes.toes[o.toe]?.ship) continue;
    const d = distance(u.pos, o.pos);
    if (d > m.avoidM || d < 1) continue;
    const rel = turnDelta(u.facing, bearing(u.pos, o.pos));
    if (Math.abs(rel) > 50) continue;
    heading = normalizeBearing(u.facing - (rel >= 0 ? 35 : -35));
    target = Math.min(target, (u.speedMps ?? 0) * 0.6);
  }
  const v0 = u.speedMps ?? 0;
  const acc = ((target > v0 ? hd.accelKnPerMin : hd.decelKnPerMin) * KNOT) / 60;
  const v = target > v0 ? Math.min(target, v0 + acc * h) : Math.max(target, v0 - acc * h);
  // 旋回の速さ(度/秒)。止まりかけの艦はほとんど回れない
  const rate = (Math.max(v, 1) / (hd.turnDiameterM / 2)) * (180 / Math.PI);
  const d = turnDelta(u.facing, heading);
  u.facing = normalizeBearing(u.facing + Math.sign(d) * Math.min(Math.abs(d), rate * h));
  const rad = (u.facing * Math.PI) / 180;
  const next = { x: u.pos.x + Math.sin(rad) * v * h, y: u.pos.y + Math.cos(rad) * v * h };
  if (isSea(next, ctx)) {
    u.pos = next;
    u.speedMps = v;
  } else {
    u.speedMps = 0;
  }
}

/** 試合の始めに戦隊の航跡がなければ、先導の艦からまっすぐ後ろに引く */
export function seedTrail(sq: SquadronState, lead: Unit, ctx: SimContext): void {
  if (sq.trail.length === 0) sq.trail = straightTrail(lead.pos, lead.facing, sq.ships.length * spacingOf(ctx) + 2000);
}
