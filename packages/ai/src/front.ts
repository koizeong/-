import { distance, type ContactView, type OwnUnitView, type SimContext, type Vec2 } from "@brigade/sim-core";
import { centroid, clampToMap } from "./assess.js";

/**
 * 前線の見積もり(AI用)。霧を通した敵の情報だけを使う。
 *
 * - 前線:自軍の部隊の正面の向きの平均(そろっていなければ、自軍の重心から敵の重心への向き)を軸にとり、いちばん前に出ている部隊から FRONT_DEPTH_M 以内の部隊を前線の部隊とする。
 *   前線の部隊の横の広がり(正面幅を含む)の両端が、左右の翼
 * - 回り込み:前線の翼より外側を、前線の深さより前に出すぎずに動いている敵(前のターンに動いた敵)と、
 *   前線より後ろへ入り込んだ敵。翼ごとにまとめる
 * - 翼の守り:自軍の戦力が敵より大きく劣っていなければ、回り込んでくる敵と翼の端の間へ部隊を回し、翼を折り曲げてふさぐ
 */

/** いちばん前の部隊からこの深さ(m)までの部隊を前線の部隊とする */
const FRONT_DEPTH_M = 1200;
/** 前線の深さよりこの距離(m)以上前にいる敵は、翼の外にいても敵の前線の一部とみなす(回り込みではない) */
const FLANK_AHEAD_M = 2000;
/** 翼の端からこの距離(m)以上外にいる敵だけを、翼の外にいるとみなす(端とほぼ同じ横の位置の敵は、正面の敵) */
const FLANK_OUTSIDE_M = 250;
/** 前線の部隊からこの距離(m)以内の敵だけを回り込みとして見る */
const FLANK_WATCH_M = 6000;
/** 前線の深さよりこの距離(m)以上後ろにいる敵は、横の位置にかかわらず入り込んだ敵とみなす */
const BEHIND_M = 1000;
/** 翼の守りの位置:翼の端から回り込む敵の方へ、この距離(m)まで出る */
const GUARD_REACH_M = 1500;
/** 翼の守りの位置:回り込む敵からこの距離(m)は空ける(撃ち合いの距離で待ち受ける) */
const GUARD_STANDOFF_M = 800;
/** 正面の向きの平均の長さがこの割合(0〜1)未満なら、向きがそろっていないとみなす */
const FACING_AGREEMENT = 0.5;
/** 自軍の戦力が敵のこの割合以上なら、翼を守りに部隊を回す(下回れば、囲まれる前に下がる方に任せる) */
export const FLANK_GUARD_MIN_RATIO = 0.6;

export interface Flank {
  /** 左右(軸から見て)。"left" | "right" */
  side: "left" | "right";
  /** 翼の端の部隊の位置 */
  anchor: Vec2;
  /** 回り込んでくる敵 */
  flankers: ContactView[];
  /** 回り込んでくる敵の推定戦力の合計(規模不明は 0.7) */
  strength: number;
  /** 翼の守りにつく位置 */
  guard: Vec2;
}

export interface FrontLine {
  /** 敵の方向の単位ベクトル */
  axis: Vec2;
  /** 前線の部隊の ID */
  units: string[];
  /** 自軍の戦力の合計と、見えている(最近見た)敵の推定戦力の合計の比 */
  ratio: number;
  /** 回り込まれている翼(なければ空) */
  flanks: Flank[];
}

/** 前線の部隊になりうる(砲兵・潰走中を除く) */
function lineUnits(own: readonly OwnUnitView[], isArtillery: (u: OwnUnitView) => boolean): OwnUnitView[] {
  return own.filter((u) => u.strength > 0 && !u.routed && !isArtillery(u));
}

export function frontLine(
  own: readonly OwnUnitView[],
  threats: readonly ContactView[],
  enemyCentroid: Vec2,
  ctx: SimContext,
  isArtillery: (u: OwnUnitView) => boolean,
  frontageOf: (u: OwnUnitView) => number,
): FrontLine | null {
  const line = lineUnits(own, isArtillery);
  const enemies = threats.filter((c) => !c.destroyed && !c.routed);
  if (line.length === 0 || enemies.length === 0) return null;
  const origin = centroid(line.map((u) => u.pos))!;
  // 軸:展開している部隊の正面の向きの平均。回り込んでくる敵が敵の重心をずらしても、前線の向きは変わらない
  const deployed = line.filter((u) => u.formation === "deployed");
  let fx = 0;
  let fy = 0;
  for (const u of deployed) {
    // 東向きと西向きを同じ式で出す(-180〜180°にそろえ、sin の符号だけが変わるようにする。左右を入れ替えた状況で鏡写しの値になる)
    const deg = ((u.facing % 360) + 360) % 360;
    const rad = ((deg > 180 ? deg - 360 : deg) * Math.PI) / 180;
    fx += Math.sin(rad) * u.strength;
    fy += Math.cos(rad) * u.strength;
  }
  const weight = deployed.reduce((s, u) => s + u.strength, 0);
  let dx = fx;
  let dy = fy;
  if (weight <= 0 || Math.hypot(fx, fy) < FACING_AGREEMENT * weight) {
    dx = enemyCentroid.x - origin.x;
    dy = enemyCentroid.y - origin.y;
  }
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const axis = { x: dx / len, y: dy / len };
  const depth = (p: Vec2) => (p.x - origin.x) * axis.x + (p.y - origin.y) * axis.y;
  // 横の位置:軸の右手が正
  const lat = (p: Vec2) => (p.x - origin.x) * axis.y - (p.y - origin.y) * axis.x;

  const maxDepth = Math.max(...line.map((u) => depth(u.pos)));
  const front = line.filter((u) => depth(u.pos) >= maxDepth - FRONT_DEPTH_M);
  const frontDepth = front.reduce((s, u) => s + depth(u.pos), 0) / front.length;
  const edge = (u: OwnUnitView, sign: 1 | -1) => lat(u.pos) + (sign * frontageOf(u)) / 2;
  const ends = {
    right: front.reduce((b, u) => (edge(u, 1) > edge(b, 1) ? u : b)),
    left: front.reduce((b, u) => (edge(u, -1) < edge(b, -1) ? u : b)),
  };
  const latMax = edge(ends.right, 1);
  const latMin = edge(ends.left, -1);
  const center = (latMax + latMin) / 2;

  const ownStrength = line.reduce((s, u) => s + u.strength, 0);
  const enemyStrength = enemies.reduce((s, c) => s + (c.estimatedStrength ?? 0.7), 0);
  const ratio = enemyStrength > 0 ? ownStrength / enemyStrength : Infinity;

  const groups: Record<"left" | "right", ContactView[]> = { left: [], right: [] };
  for (const c of enemies) {
    if (c.currentLevel === 0) continue;
    if (!front.some((u) => distance(u.pos, c.pos) <= FLANK_WATCH_M)) continue;
    const d = depth(c.pos);
    const l = lat(c.pos);
    const behind = d < frontDepth - BEHIND_M;
    const outside = (l > latMax + FLANK_OUTSIDE_M || l < latMin - FLANK_OUTSIDE_M) && d <= frontDepth + FLANK_AHEAD_M;
    // 翼の外で止まっている敵は、ただ前線が広いだけかもしれない。動いてくる敵と、後ろへ入り込んだ敵を回り込みとみなす
    if (behind || (outside && c.movedLastTurn)) groups[l >= center ? "right" : "left"].push(c);
  }

  const flanks: Flank[] = [];
  for (const side of ["left", "right"] as const) {
    const flankers = groups[side];
    if (flankers.length === 0) continue;
    const anchor = ends[side].pos;
    const at = centroid(flankers.map((c) => c.pos))!;
    const gap = distance(anchor, at);
    const step = Math.max(0, Math.min(GUARD_REACH_M, gap - GUARD_STANDOFF_M));
    const guard = gap > 0 ? clampToMap({ x: anchor.x + ((at.x - anchor.x) / gap) * step, y: anchor.y + ((at.y - anchor.y) / gap) * step }, ctx) : { ...anchor };
    flanks.push({ side, anchor: { ...anchor }, flankers, strength: flankers.reduce((s, c) => s + (c.estimatedStrength ?? 0.7), 0), guard });
  }
  return { axis, units: front.map((u) => u.id), ratio, flanks };
}
