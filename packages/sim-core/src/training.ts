import type { RulePack } from "./rulepack.js";
import type { Unit } from "./unit.js";

/** 部隊の練度の効果(指定がなければルールパックの既定の段階) */
export function trainingOf(u: Pick<Unit, "training">, rules: RulePack): RulePack["training"]["levels"][string] {
  return rules.training.levels[u.training ?? rules.training.default]!;
}
