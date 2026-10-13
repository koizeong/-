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
  const diff = angleBetween(bearing(defenderPos, attackerPos), defenderFacing);
  if (diff <= rules.frontHalfArcDeg) return "front";
  if (diff >= 180 - rules.rearHalfArcDeg) return "rear";
  return "flank";
}

export function aspectDamageMultiplier(aspect: Aspect, rules: FacingRules): number {
  return rules.damageMultiplier[aspect];
}
