import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";
import type { Unit } from "./unit.js";

/**
 * 正面幅。展開済みのユニットは「点」ではなく、正面(facing)に対して横に伸びた帯(線分)を受け持つ。
 * 幅は編成表(frontageM)で決まり、戦力が frontage.reducedBelowStrength を割ると reducedMultiplier 倍に縮む。
 * 縦隊・展開途中のユニットは点として扱う(幅0)。
 * 距離・向き・見通しは、帯の上でいちばん近い点どうしで測る(幅0なら今までどおり中心どうし)
 */

/** 帯を持つもの(ユニットそのもの、または阻止圏の写し) */
export interface Front {
  pos: Vec2;
  facing: number;
  /** 正面幅(m)。0なら点 */
  width: number;
}

/** ユニットの正面幅(m) */
export function frontageOf(u: Unit, ctx: SimContext): number {
  if (u.formation !== "deployed") return 0;
  const base = ctx.toes.toes[u.toe]?.frontageM ?? 0;
  if (base <= 0) return 0;
  const f = ctx.rules.frontage;
  return u.strength < f.reducedBelowStrength ? base * f.reducedMultiplier : base;
}

export function frontOf(u: Unit, ctx: SimContext): Front {
  return { pos: u.pos, facing: u.facing, width: frontageOf(u, ctx) };
}

/** 帯の向き(正面に対して右向きの単位ベクトル) */
function lateral(facing: number): Vec2 {
  const r = (facing * Math.PI) / 180;
  return { x: Math.cos(r), y: -Math.sin(r) };
}

/** 帯の両端 */
export function frontEnds(f: Front): [Vec2, Vec2] {
  const l = lateral(f.facing);
  const h = f.width / 2;
  return [
    { x: f.pos.x - l.x * h, y: f.pos.y - l.y * h },
    { x: f.pos.x + l.x * h, y: f.pos.y + l.y * h },
  ];
}

/** 帯の上で p にいちばん近い点 */
export function nearestOnFront(f: Front, p: Vec2): Vec2 {
  if (f.width <= 0) return f.pos;
  const l = lateral(f.facing);
  const h = f.width / 2;
  const t = Math.max(-h, Math.min(h, (p.x - f.pos.x) * l.x + (p.y - f.pos.y) * l.y));
  return { x: f.pos.x + l.x * t, y: f.pos.y + l.y * t };
}

/** 点 p と帯の距離 */
export function distanceToFront(f: Front, p: Vec2): number {
  return distance(p, nearestOnFront(f, p));
}

/** 線分 a0-a1 の上で p にいちばん近い点 */
function nearestOnSegment(a0: Vec2, a1: Vec2, p: Vec2): Vec2 {
  const vx = a1.x - a0.x;
  const vy = a1.y - a0.y;
  const l2 = vx * vx + vy * vy;
  if (l2 === 0) return a0;
  const t = Math.max(0, Math.min(1, ((p.x - a0.x) * vx + (p.y - a0.y) * vy) / l2));
  return { x: a0.x + vx * t, y: a0.y + vy * t };
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** 2つの線分の交点(交わらなければ null。端で触れる・重なるときも null にして、端点の距離で扱う) */
function intersection(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): Vec2 | null {
  const d1 = cross(b0, b1, a0);
  const d2 = cross(b0, b1, a1);
  const d3 = cross(a0, a1, b0);
  const d4 = cross(a0, a1, b1);
  if (d1 * d2 < 0 && d3 * d4 < 0) {
    const t = d1 / (d1 - d2);
    return { x: a0.x + (a1.x - a0.x) * t, y: a0.y + (a1.y - a0.y) * t };
  }
  return null;
}

/** 線分どうしのいちばん近い点の組 [a 側, b 側] */
export function closestSegmentPoints(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): [Vec2, Vec2] {
  const x = intersection(a0, a1, b0, b1);
  if (x) return [x, x];
  const cands: [Vec2, Vec2][] = [
    [a0, nearestOnSegment(b0, b1, a0)],
    [a1, nearestOnSegment(b0, b1, a1)],
    [nearestOnSegment(a0, a1, b0), b0],
    [nearestOnSegment(a0, a1, b1), b1],
  ];
  const bd = Math.min(...cands.map((c) => distance(c[0], c[1])));
  const ties = cands.filter((c) => distance(c[0], c[1]) <= bd + 1e-6);
  if (ties.length === 1) return ties[0]!;
  // 同じ距離の組が複数(平行に重なる帯など)なら、その中央をとる。どの端を選ぶかで結果が変わらないように
  // (左右を入れ替えた状況では端の順番が入れ替わるので、端を選ぶと鏡写しにならない)
  const mid = { x: ties.reduce((s, c) => s + c[0].x, 0) / ties.length, y: ties.reduce((s, c) => s + c[0].y, 0) / ties.length };
  const pa = nearestOnSegment(a0, a1, mid);
  return [pa, nearestOnSegment(b0, b1, pa)];
}

/** 2つの帯のいちばん近い点の組 [a 側, b 側] */
export function closestFrontPoints(a: Front, b: Front): [Vec2, Vec2] {
  if (a.width <= 0 && b.width <= 0) return [a.pos, b.pos];
  if (a.width <= 0) return [a.pos, nearestOnFront(b, a.pos)];
  if (b.width <= 0) return [nearestOnFront(a, b.pos), b.pos];
  const [a0, a1] = frontEnds(a);
  const [b0, b1] = frontEnds(b);
  return closestSegmentPoints(a0, a1, b0, b1);
}

/** 2つの帯の距離 */
export function frontDistance(a: Front, b: Front): number {
  const [p, q] = closestFrontPoints(a, b);
  return distance(p, q);
}

/** 2つのユニットの帯のいちばん近い点の組 [a 側, b 側] */
export function unitClosestPoints(a: Unit, b: Unit, ctx: SimContext): [Vec2, Vec2] {
  return closestFrontPoints(frontOf(a, ctx), frontOf(b, ctx));
}

/** 2つのユニットの距離(帯どうし) */
export function unitDistance(a: Unit, b: Unit, ctx: SimContext): number {
  const [p, q] = unitClosestPoints(a, b, ctx);
  return distance(p, q);
}

/**
 * 着弾範囲(中心 c、半径 r)にかかる帯の割合(0〜1)。点なら範囲内で1、範囲外で0。
 * 砲撃・空襲は、帯のうち範囲にかかった割合だけ損害を与える(広く散った大きな部隊は一発で削られにくい)
 */
export function frontCoverage(f: Front, c: Vec2, r: number): number {
  if (f.width <= 0) return distance(f.pos, c) <= r ? 1 : 0;
  const l = lateral(f.facing);
  const h = f.width / 2;
  const dx = f.pos.x - c.x;
  const dy = f.pos.y - c.y;
  // |pos + t·l − c|² ≤ r² を t について解く
  const b = dx * l.x + dy * l.y;
  const disc = b * b - (dx * dx + dy * dy - r * r);
  if (disc < 0) return 0;
  const s = Math.sqrt(disc);
  const lo = Math.max(-h, -b - s);
  const hi = Math.min(h, -b + s);
  return hi > lo ? (hi - lo) / f.width : 0;
}
