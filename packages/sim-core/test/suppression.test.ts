import { describe, expect, it } from "vitest";
import { toeArmoredShare, computeFire, createUnit, detectionRange, Rng, suppressionFirepowerMultiplier, toeFire } from "../src/index.js";
import { ger, inf, rules, toes, weapons, wideCtx } from "./helpers.js";

/** 1回の射撃で、損害1あたりにかかる制圧の効き */
function suppressionPerDamage(attacker: ReturnType<typeof ger>) {
  const a = createUnit(attacker);
  const t = createUnit(inf("t", 1700, 1000, { formation: "deployed", facing: 270 }));
  return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === a.id)!.suppressionMultiplier!;
}

describe("武器ごとの制圧のしやすさ", () => {
  it("機関銃は小銃より、砲兵は戦車砲より制圧が効く", () => {
    const w = weapons.weapons;
    expect(w.machine_gun!.suppression).toBeGreaterThan(w.small_arms!.suppression);
    expect(w.howitzer!.suppression).toBeGreaterThan(w.tank_gun!.suppression);
  });

  it("同じ損害でも、戦車部隊の射撃は歩兵の射撃より制圧が小さい", () => {
    const infantry = suppressionPerDamage(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }));
    const panzer = suppressionPerDamage(ger("a", 1000, 1000, { formation: "deployed", facing: 90, branch: "armor", toe: "panzer_regiment" }));
    expect(panzer).toBeLessThan(infantry);
  });

  it("編成の制圧のしやすさは、武器ごとの値を火力で重みづけした平均", () => {
    const art = toeFire(toes.toes.artillery_battalion!, weapons, 5000, 0, true);
    expect(art.suppression).toBeCloseTo(weapons.weapons.howitzer!.suppression);
  });
});

describe("装甲化率と制圧の影響", () => {
  const A = rules.combat.armorSuppression;
  const suppressed = (extra: Parameters<typeof inf>[3]) => {
    const u = createUnit(inf("u", 1000, 1000, extra));
    u.suppression = 1;
    return u;
  };

  it("制圧された装甲は、歩兵ほど火力が落ちない(ハッチを閉めても撃てる)", () => {
    const infantry = suppressionFirepowerMultiplier(suppressed({}), wideCtx);
    const panzer = suppressionFirepowerMultiplier(suppressed({ branch: "armor", toe: "panzer_regiment" }), wideCtx);
    expect(infantry).toBeCloseTo(1 - rules.combat.suppressionFirepowerPenalty);
    expect(panzer).toBeGreaterThan(infantry);
  });

  it("制圧された装甲は視界が大きく落ちる。歩兵の視界は変わらない", () => {
    const target = createUnit(ger("t", 2000, 1000));
    const range = (extra: Parameters<typeof inf>[3], s: number) => {
      const u = createUnit(inf("u", 1000, 1000, extra));
      u.suppression = s;
      return detectionRange(u, target, wideCtx);
    };
    const armor = { branch: "armor", toe: "panzer_regiment" };
    expect(range({}, 1)).toBeCloseTo(range({}, 0));
    // 装甲と非装甲を分けて持つ編成表は、装甲の要素が耐久に占める割合が装甲化率になる
    expect(range(armor, 1) / range(armor, 0)).toBeCloseTo(1 - toeArmoredShare(toes.toes.panzer_regiment!)! * A.visionPenalty);
  });
});
