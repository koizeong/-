import { describe, expect, it } from "vitest";
import { computeFire, createUnit, Rng, type SimContext } from "../src/index.js";
import { ger, inf, rules, wideCtx } from "./helpers.js";

/**
 * 兵科どうしの相性(ナポレオン戦争・百年戦争のルールパックで使う):
 * 姿勢の damageTakenFromBranch(方陣は騎兵に強く、密集しているので歩兵・砲兵の射撃に脆い)と、
 * combat.pursuitByBranch(騎兵は潰走した相手を斬り立てる)
 */
const square = { ...rules.stances.standard!, name: "方陣", damageTakenFromBranch: { armor: 0.25, infantry: 1.5 } };
const ctxWith: SimContext = {
  ...wideCtx,
  rules: { ...rules, stances: { ...rules.stances, square }, combat: { ...rules.combat, pursuitByBranch: { armor: 2.5 } } },
};

const damage = (attackerBranch: string, stance: string, routed = false) => {
  const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90, branch: attackerBranch }));
  const t = createUnit(inf("t", 1300, 1000, { formation: "deployed", stance, facing: 270 }));
  t.routed = routed;
  return computeFire([a, t], ctxWith, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
};

describe("兵科どうしの相性", () => {
  it("期待挙動:方陣は騎兵(ここでは機甲で代える)から受ける損害が小さく、歩兵の射撃からは大きい", () => {
    expect(damage("armor", "square") / damage("armor", "standard")).toBeCloseTo(0.25, 5);
    expect(damage("infantry", "square") / damage("infantry", "standard")).toBeCloseTo(1.5, 5);
  });

  it("期待挙動:追撃の兵科は潰走した相手に大きな損害を与え、ほかの兵科は変わらない", () => {
    const k = (branch: string) => damage(branch, "standard", true) / damage(branch, "standard", false);
    expect(k("armor") / k("infantry")).toBeCloseTo(2.5, 5);
  });

  it("書かないルールパック(WWI〜朝鮮戦争)では、相性はかからない", () => {
    const plain = (branch: string, routed: boolean) => {
      const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90, branch }));
      const t = createUnit(inf("t", 1300, 1000, { formation: "deployed", facing: 270 }));
      t.routed = routed;
      return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(plain("armor", true) / plain("armor", false)).toBeCloseTo(plain("infantry", true) / plain("infantry", false), 5);
  });
});
