import type { SimContext } from "./context.js";
import { toeArmoredShare, type Toe, type ToeElement } from "./toe.js";
import type { Unit } from "./unit.js";

/**
 * 装甲の部分と非装甲の部分を分けて持つ編成表(戦車中隊と随伴歩兵の混成など)の扱い。
 * 撃たれると、武器の効果(非装甲・装甲)と今の割合に応じて、それぞれの部分が減る。減った部分の武器は撃てなくなる。
 * 分けない編成表は、これまでどおり編成表の armorRatio で按分する
 */

const shareCache = new WeakMap<Toe, number | null>();
function baseShare(toe: Toe): number | null {
  if (!shareCache.has(toe)) shareCache.set(toe, toeArmoredShare(toe));
  return shareCache.get(toe)!;
}

/** 今の装甲化率(撃たれたときの武器の効果・制圧の影響・突破の力に使う) */
export function armorNow(u: Unit, ctx: SimContext): number {
  const toe = ctx.toes.toes[u.toe]!;
  const b = baseShare(toe);
  return b === null ? toe.armorRatio : (u.armoredShare ?? b);
}

/** 要素ごとの火力の倍率(残っている部分の割合。満員のときの割合なら1)。分けない編成表は undefined */
export function elementWeight(u: Unit, ctx: SimContext): ((e: ToeElement) => number) | undefined {
  const b = baseShare(ctx.toes.toes[u.toe]!);
  if (b === null) return undefined;
  const r = u.armoredShare ?? b;
  const armored = b > 0 ? r / b : 0;
  const soft = b < 1 ? (1 - r) / (1 - b) : 0;
  return (e) => (e.armored ? armored : soft);
}

/**
 * 損害のうち、装甲の部分に当たる割合。soft・armored は、非装甲・装甲の目標に対する火力(または効果)。
 * 分けない編成表なら undefined
 */
export function armoredDamageFraction(t: Unit, ctx: SimContext, soft: number, armored: number): number | undefined {
  const b = baseShare(ctx.toes.toes[t.toe]!);
  if (b === null) return undefined;
  const r = t.armoredShare ?? b;
  const a = armored * r;
  const s = soft * (1 - r);
  return a + s > 0 ? a / (a + s) : r;
}

/**
 * 戦力の損失を、装甲の部分と非装甲の部分に分けて適用する(t を書き換える)。実際に減った戦力を返す。
 * なくなった部分に当たった分は消える(随伴歩兵がいなくなった戦車連隊を、機関銃でいくら撃っても減らない)
 */
export function applySplitLoss(t: Unit, ctx: SimContext, loss: number, fraction: number | undefined): number {
  const before = t.strength;
  if (fraction === undefined) {
    t.strength = Math.max(0, t.strength - loss);
    return before - t.strength;
  }
  const r = t.armoredShare ?? baseShare(ctx.toes.toes[t.toe]!) ?? 0;
  const armoredLeft = Math.max(0, before * r - loss * fraction);
  const softLeft = Math.max(0, before * (1 - r) - loss * (1 - fraction));
  t.strength = Math.min(1, armoredLeft + softLeft);
  if (t.strength > 0) t.armoredShare = armoredLeft / (armoredLeft + softLeft);
  return before - t.strength;
}
