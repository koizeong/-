import { describe, expect, it } from "vitest";
import { applyFire, armoredDamageFraction, armorNow, computeFire, createUnit, elementWeight, Rng, toeFire, unitModifiers, updateMorale, type FireResult, type SimContext } from "../src/index.js";
import { frontToes, ger, inf, wideCtx } from "./helpers.js";

const acc = frontToes.toes["armor_combat_command"]!;
const hit = (ctx: SimContext, unit: ReturnType<typeof createUnit>, soft: number, armored: number, damage = 0.5) => {
  // 損害は武器の効果を今の装甲化率で按分した大きさ(実際の射撃と同じ)
  const k = armorNow(unit, ctx);
  const r: FireResult = { attackerId: "x", targetId: unit.id, aspect: "front", damage: damage * (soft * (1 - k) + armored * k), armoredFraction: armoredDamageFraction(unit, ctx, soft, armored)! };
  applyFire(new Map([[unit.id, unit]]), [r], ctx);
};

describe("装甲と非装甲を分けて持つ部隊(戦車中隊と随伴歩兵の混成)", () => {
  it("満員のときの装甲化率は、装甲の要素が耐久に占める割合", () => {
    const u = createUnit(inf("a", 1000, 1000, { branch: "armor", toe: "armor_combat_command" }));
    expect(armorNow(u, wideCtx)).toBeCloseTo(0.6);
  });

  it("期待挙動:機関銃は随伴歩兵だけを削り、歩兵がいなくなると戦車には効かない。対戦車の武器は戦車を削る", () => {
    const u = createUnit(inf("a", 1000, 1000, { branch: "armor", toe: "armor_combat_command" }));
    // 非装甲にだけ効く武器で撃ち続ける
    for (let i = 0; i < 400; i++) hit(wideCtx, u, 1, 0);
    expect(armorNow(u, wideCtx)).toBeGreaterThan(0.999);
    const before = u.strength;
    expect(before).toBeCloseTo(0.6, 2); // 戦車の部分(6割)だけが残る
    hit(wideCtx, u, 1, 0);
    expect(before - u.strength).toBeLessThan(1e-4); // ほとんど減らない
    hit(wideCtx, u, 0, 1);
    expect(u.strength).toBeLessThan(before); // 対戦車の武器なら減る
  });

  it("期待挙動:随伴歩兵を失うと、その歩兵の武器は撃てなくなる(戦車の武器は残る)", () => {
    const u = createUnit(inf("a", 1000, 1000, { branch: "armor", toe: "armor_combat_command" }));
    const full = toeFire(acc, wideCtx.weapons, 100, 0, false).firepower;
    for (let i = 0; i < 400; i++) hit(wideCtx, u, 1, 0);
    const w = elementWeight(u, wideCtx)!;
    const tanksOnly = toeFire(acc, wideCtx.weapons, 100, 0, false, w).firepower * u.strength;
    const tankElements = toeFire({ ...acc, elements: acc.elements.filter((e) => e.armored) }, wideCtx.weapons, 100, 0, false).firepower;
    expect(tanksOnly / tankElements).toBeCloseTo(1, 2);
    expect(tanksOnly).toBeLessThan(full);
  });

  it("期待挙動:撃ち合いでは、機関銃の多い歩兵は混成の部隊の随伴歩兵を削り、装甲化率を上げる", () => {
    const shooter = createUnit(ger("s", 1000, 1000, { formation: "deployed", facing: 90 }));
    const target = createUnit(inf("t", 1400, 1000, { branch: "armor", toe: "armor_combat_command", formation: "deployed", facing: 270 }));
    const res = computeFire([shooter, target], wideCtx, Rng.fromSeed(1), new Set()).filter((r) => r.targetId === "t");
    expect(res[0]!.armoredFraction).toBeLessThan(0.6);
    applyFire(new Map([["t", target]]), res, wideCtx);
    expect(armorNow(target, wideCtx)).toBeGreaterThan(0.6);
    expect(unitModifiers(target, wideCtx).armor).toBeGreaterThan(0.6);
  });
});

describe("損耗による士気の上限", () => {
  it("期待挙動:戦力を失った部隊は、休んでも士気が満タンに戻らない(1 − 係数 × 失った戦力まで)", () => {
    const k = wideCtx.rules.morale.lossCeilingFactor;
    expect(k).toBeGreaterThan(0);
    const u = createUnit(inf("a", 1000, 1000, { formation: "deployed" }));
    u.strength = 0.7;
    u.morale = 0.3;
    for (let i = 0; i < 2000; i++) updateMorale([u], new Set(), {}, wideCtx);
    expect(u.morale).toBeCloseTo(1 - k * 0.3, 6);
    expect(unitModifiers(u, wideCtx).moraleCeiling).toBeCloseTo(1 - k * 0.3, 6);
  });

  it("上限より高い士気を、上限まで下げはしない(撃たれて下がってから効く)", () => {
    const u = createUnit(inf("a", 1000, 1000));
    u.strength = 0.5;
    updateMorale([u], new Set(), {}, wideCtx);
    expect(u.morale).toBe(1);
  });
});

describe("直接射撃の士気への効き", () => {
  it("直接射撃に倍率が掛かる(仕組みだけ。データでは1倍)", () => {
    const ctx: SimContext = { ...wideCtx, rules: { ...wideCtx.rules, combat: { ...wideCtx.rules.combat, directFireMoraleMultiplier: 2 } } };
    const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }));
    const t = createUnit(inf("t", 1400, 1000, { formation: "deployed", facing: 270 }));
    expect(computeFire([a, t], ctx, Rng.fromSeed(1), new Set()).find((x) => x.targetId === "t")!.moraleMultiplier).toBe(2);
    expect(computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((x) => x.targetId === "t")!.moraleMultiplier).toBeUndefined();
  });
});
