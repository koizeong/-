import { describe, expect, it } from "vitest";
import { autoCompose, customizeScenario, designWeapon, toeFire, toeHitPoints, USER_PREFIX } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "./helpers.js";

const packs = loadPacks();
const dev = packs.rules["ww1-korea"]!.development!;
const weapons = packs.weapons["ww1-korea-generic"]!;
const toes = packs.toes["ww1-korea-generic"]!;
const branches = packs.branches["ww1-korea"]!;
const units = [
  { id: "inf1", toe: "infantry_regiment" },
  { id: "inf2", toe: "infantry_regiment" },
  { id: "arm", toe: "armor_combat_command" },
  { id: "art", toe: "artillery_battalion" },
  { id: "rec", toe: "recon_squadron" },
];

describe("おまかせ編成", () => {
  it("点数の上限の中で組み、同じ条件なら同じ編成になる", () => {
    for (const style of Object.keys(dev.autoStyles)) {
      const a = autoCompose(dev, weapons, toes, branches, units, 1, style)!;
      expect(a.budget.used).toBeLessThanOrEqual(a.budget.limit + 1e-9);
      expect(Object.keys(a.substitutions).length).toBeGreaterThan(0);
      expect(autoCompose(dev, weapons, toes, branches, units, 1, style)).toEqual(a);
    }
    expect(autoCompose(dev, weapons, toes, branches, units, 1, "nope")).toBeNull();
  });

  it("期待挙動:方針どおりに伸びる(対戦車重視は対装甲の火力、粘り強さは耐久が、均衡より伸びる)", () => {
    const totals = (style: string) => {
      const a = autoCompose(dev, weapons, toes, branches, units, 1, style)!;
      const W = { id: "w", weapons: { ...weapons.weapons } };
      for (const [id, d] of Object.entries(a.bundle.designs)) W.weapons[USER_PREFIX + id] = unwrap(designWeapon(d, dev));
      let armored = 0;
      let hp = 0;
      for (const u of units) {
        const t = a.substitutions[u.id] ? { ...toes.toes[u.toe]!, elements: a.bundle.templates[a.substitutions[u.id]!]!.elements } : toes.toes[u.toe]!;
        armored += toeFire(t, W, 300, 1, false).firepower;
        hp += toeHitPoints(t);
      }
      return { armored, hp };
    };
    const balanced = totals("balanced");
    expect(totals("antitank").armored).toBeGreaterThan(balanced.armored);
    expect(totals("endurance").hp).toBeGreaterThan(balanced.hp);
  });

  it("結果はそのまま差し替えに使える(サーバーと同じ検証を通る)", () => {
    const input = { ...(loadScenarioJson("test-symmetric") as Record<string, unknown>), customization: { us: { units: "all" } } };
    const sc = unwrap(customizeScenario(input, packs, "us", { version: 1, designs: {}, templates: {} }, {})).scenario;
    const us = sc.def.units.filter((u) => u.side === "us").map((u) => ({ id: u.id, toe: u.toe }));
    const a = autoCompose(dev, sc.ctx.weapons, sc.ctx.toes, sc.ctx.branches, us, 1, "antitank")!;
    const r = customizeScenario(input, packs, "us", a.bundle, a.substitutions);
    expect(r.ok).toBe(true);
  });
});
