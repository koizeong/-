import type { RulePack } from "./rulepack.js";
import type { Unit } from "./unit.js";

/** 効果の計算に使う姿勢。切替中は defaultStance(標準)扱い */
export function effectiveStance(u: Unit, rules: RulePack): string {
  return u.pendingStance !== null ? rules.defaultStance : u.stance;
}

/** 姿勢の効果が切れているか(効果の続くターン数を過ぎた)。切替中は標準扱いなので切れていない */
export function isStanceSpent(u: Pick<Unit, "stance" | "pendingStance" | "stanceTurns">, rules: RulePack): boolean {
  if (u.pendingStance !== null) return false;
  const st = rules.stances[u.stance]!;
  return st.effectTurns !== undefined && u.stanceTurns >= st.effectTurns;
}

/** 効果の計算に使う姿勢の定義(息切れしていれば spent で上書きしたもの) */
export function stanceOf(u: Unit, rules: RulePack): RulePack["stances"][string] {
  const st = rules.stances[effectiveStance(u, rules)]!;
  if (!isStanceSpent(u, rules) || !st.spent) return st;
  // spent に書かれていない項目(undefined)は元の値のまま
  const overrides = Object.fromEntries(Object.entries(st.spent).filter(([, v]) => v !== undefined));
  return { ...st, ...overrides };
}
