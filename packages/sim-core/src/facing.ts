import { angleBetween, bearing, type Vec2 } from "./geometry.js";
import type { FacingRules } from "./rulepack.js";

export type Aspect = "front" | "flank" | "rear";

/**
 * 防御側から見て、攻撃がどの面から来たかを判定する。
 * @param defenderFacing 防御側の正面方位(度)
 */
export function attackAspect(
  defenderPos: Vec2,
  defenderFacing: number,
  attackerPos: Vec2,
  rules: FacingRules,
): Aspect {
  // ほぼ同じ地点(1m未満)に重なっているときは、方位が丸め誤差で決まってしまうので、正面とみなす
  if (Math.hypot(defenderPos.x - attackerPos.x, defenderPos.y - attackerPos.y) < 1) return "front";
  const diff = angleBetween(bearing(defenderPos, attackerPos), defenderFacing);
  if (diff <= rules.frontHalfArcDeg) return "front";
  if (diff >= 180 - rules.rearHalfArcDeg) return "rear";
  return "flank";
}

export function aspectDamageMultiplier(aspect: Aspect, rules: FacingRules): number {
  return rules.damageMultiplier[aspect];
}

/**
 * 装甲を考えた、撃たれた面の倍率。armoredFraction は損害のうち装甲の部分に当たる割合(0〜1)。
 * 装甲の部分には armoredDamageMultiplier、非装甲の部分には damageMultiplier を掛ける。
 * 返す armoredFraction は、面の倍率を掛けた後の装甲の部分の割合
 */
export function armoredAspect(aspect: Aspect, rules: FacingRules, armoredFraction: number): { multiplier: number; armoredFraction: number } {
  const soft = rules.damageMultiplier[aspect];
  const armored = (rules.armoredDamageMultiplier ?? rules.damageMultiplier)[aspect];
  const multiplier = soft * (1 - armoredFraction) + armored * armoredFraction;
  return { multiplier, armoredFraction: multiplier > 0 ? (armored * armoredFraction) / multiplier : armoredFraction };
}
