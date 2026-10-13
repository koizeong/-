import type { RulePack } from "./rulepack.js";
import type { Unit } from "./unit.js";

/** 効果の計算に使う姿勢。切替中は defaultStance(標準)扱い */
export function effectiveStance(u: Unit, rules: RulePack): string {
  return u.pendingStance !== null ? rules.defaultStance : u.stance;
}
