import { closestSegmentPoints, distance, frontEnds, type ContactView, type OwnUnitView, type SimContext, type Vec2 } from "@brigade/sim-core";
import { clampToMap } from "./assess.js";

/**
 * 包囲と突出の見積もり(AI用)。霧を通した敵の情報(見えている・最近見た敵)だけを使う。
 *
 * - 包囲されかけ:16方向へ ESCAPE_M の退路をたどり、敵の帯から(阻止圏 + 寄ってこられる距離)以内をかすめずに
 *   抜けられる方向がいくつあるか。少なければ、空いている方向から下がる
 * - 突出:行き先のまわりに、味方より敵が多いか。行き先そのものが囲まれかけの場所か
 */

/** 退路を調べる方向の数 */
const DIRECTIONS = 16;
/** 退路の長さ(m) */
const ESCAPE_M = 4000;
/** 敵がこの距離だけ寄ってこられるとみなして、阻止圏に足す(1ターンに展開したまま進める距離の目安) */
const CLOSING_MARGIN_M = 1000;
/** 抜けられる方向がこれ以下なら「包囲されかけ」 */
export const OPEN_DIRECTIONS_MIN = 6;
/** 突出の見積もりで、行き先のまわりの敵と味方を数える範囲(m) */
const SUPPORT_RADIUS_M = 3000;
/** 突出した行き先の点の下限の倍率 */
const EXPOSED_FLOOR = 0.15;
/** 囲まれかけの場所へ向かうときの倍率 */
const CLOSED_DEST_FACTOR = 0.4;

/** 阻止圏を持ちうる敵(潰走中は持たない。縦隊でもすぐ展開できるので数える) */
function blockers(threats: readonly ContactView[]): ContactView[] {
  return threats.filter((c) => !c.destroyed && !c.routed);
}

/** 方向 k の退路の終点 */
function rayEnd(p: Vec2, k: number): Vec2 {
  // 東回り・西回りを同じ式で出す(sin の符号だけが変わるので、左右を入れ替えた状況で鏡写しの値になる)
  const j = k <= DIRECTIONS / 2 ? k : k - DIRECTIONS;
  const rad = (2 * Math.PI * j) / DIRECTIONS;
  return { x: p.x + Math.sin(rad) * ESCAPE_M, y: p.y + Math.cos(rad) * ESCAPE_M };
}

/** 退路 p → end が敵 c の帯(推定)から reach 以内をかすめるか */
function crosses(p: Vec2, end: Vec2, c: ContactView, reach: number): boolean {
  const width = c.facing !== undefined ? (c.frontageM ?? 0) : 0;
  const [b0, b1] = frontEnds({ pos: c.pos, facing: c.facing ?? 0, width });
  const [q, r] = closestSegmentPoints(p, end, b0, b1);
  // すでに阻止圏の中にいる敵は、その場から離れる向きなら抜けられる(近づく向きだけをふさぐ)
  if (distance(q, p) < 1e-6) return distance(end, c.pos) < distance(p, c.pos);
  return distance(q, r) < reach;
}

/** p から抜けられる方向(終点のリスト。マップの外へ出る方向も抜けられるとみなす) */
export function openDirections(p: Vec2, threats: readonly ContactView[], ctx: SimContext): Vec2[] {
  const reach = ctx.rules.breakthrough.zoneRadiusM + CLOSING_MARGIN_M;
  const enemies = blockers(threats).filter((c) => distance(c.pos, p) <= ESCAPE_M + reach + (c.frontageM ?? 0));
  const open: Vec2[] = [];
  for (let k = 0; k < DIRECTIONS; k++) {
    const end = rayEnd(p, k);
    if (!enemies.some((c) => crosses(p, end, c, reach))) open.push(end);
  }
  return open;
}

/**
 * 包囲されかけていれば、下がる先(抜けられる方向のうち、自陣営の後方に近いもの)。囲まれかけていなければ null。
 * どの方向もふさがれていれば、後方へ向かって突破を試みる
 */
export function breakoutPoint(u: OwnUnitView, threats: readonly ContactView[], rear: Vec2, ctx: SimContext): { dest: Vec2; closed: number } | null {
  const open = openDirections(u.pos, threats, ctx);
  if (open.length > OPEN_DIRECTIONS_MIN) return null;
  const closed = 1 - open.length / DIRECTIONS;
  if (open.length === 0) return { dest: clampToMap(rear, ctx), closed };
  // 後方に近い方向。同じなら、マップの中央の線に近い方(左右を入れ替えた状況で鏡写しに選ぶ)
  const mid = ctx.terrain.widthM / 2;
  const best = [...open].sort((p, q) => distance(p, rear) - distance(q, rear) || Math.abs(p.x - mid) - Math.abs(q.x - mid) || p.y - q.y)[0]!;
  return { dest: clampToMap(best, ctx), closed };
}

/**
 * 行き先の突出の度合い(0〜1の倍率)。行き先のまわりの敵の数が味方(自分を除く)+1 を超えるほど下がる。
 * 行き先そのものが囲まれかけの場所なら、さらに下げる
 */
export function exposureFactor(u: OwnUnitView, dest: Vec2, own: readonly OwnUnitView[], threats: readonly ContactView[], ctx: SimContext): number {
  const enemies = blockers(threats).filter((c) => distance(c.pos, dest) <= SUPPORT_RADIUS_M).length;
  const friends = own.filter((f) => f.id !== u.id && f.strength > 0 && !f.routed && distance(f.pos, dest) <= SUPPORT_RADIUS_M).length;
  let k = enemies > friends + 1 ? (friends + 1) / enemies : 1;
  // 味方がそれ以上にいれば、囲まれる前に味方がふさぐとみなす
  if (enemies >= 2 && enemies > friends && openDirections(dest, threats, ctx).length <= OPEN_DIRECTIONS_MIN) k *= CLOSED_DEST_FACTOR;
  return Math.max(EXPOSED_FLOOR, k);
}
