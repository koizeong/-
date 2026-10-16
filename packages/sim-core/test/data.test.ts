import { describe, expect, it } from "vitest";
import { parseBranchPack, parseTerrainMap, parseToePack, parseWeaponPack, validateContext, validatePacks } from "../src/index.js";
import { branches, ctx, rules } from "./helpers.js";

describe("同梱データ", () => {
  it("ルールパックと兵科パックがスキーマを通る", () => {
    expect(rules.defaultStance in rules.stances).toBe(true);
    expect(Object.keys(branches.branches)).toEqual(
      expect.arrayContaining(["infantry", "armor", "tank_destroyer", "artillery", "recon"]),
    );
  });

  it("陣地レベルの範囲は0〜3", () => {
    expect(rules.entrenchment).toMatchObject({ minLevel: 0, maxLevel: 3 });
    expect(rules.entrenchment.hoursToLevel).toHaveLength(3);
  });
});

describe("データ検証のエラー", () => {
  it("マップの行の長さ違いと、凡例にない文字を指摘する", () => {
    const r = parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain" }, rows: ["...", "..X", ".."] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes("rows.1") && e.includes('"X"'))).toBe(true);
    expect(r.errors.some((e) => e.includes("rows.2") && e.includes("行の長さ"))).toBe(true);
  });

  it("速度が負の兵科を弾く", () => {
    const r = parseBranchPack({
      id: "x",
      branches: { inf: { name: "歩兵", marchSpeedMpm: -1, entrenchmentCapModifier: 0 } },
    });
    expect(r.ok).toBe(false);
  });

  it("兵科・姿勢・編成表の参照切れを指摘する", () => {
    const errors = validateContext(ctx, [
      { id: "u1", branch: "cavalry", stance: "standard", toe: "infantry_regiment" },
      { id: "u2", branch: "infantry", stance: "berserk", toe: "infantry_regiment" },
      { id: "u3", branch: "infantry", stance: "standard", toe: "phantom" },
    ] as never);
    expect(errors).toEqual([
      'u1: 兵科 "cavalry" が兵科パックにありません',
      'u1: 兵科 "cavalry" が編成表の兵科 "infantry" と一致しません',
      'u2: 姿勢 "berserk" がルールパックにありません',
      'u3: 編成表 "phantom" が編成パックにありません',
    ]);
  });

  it("武器の射程帯の並び順と、効果の書き漏れを指摘する", () => {
    const unordered = parseWeaponPack({
      id: "x",
      weapons: {
        w: { name: "w", bands: [{ maxRangeM: 500, power: 1 }, { maxRangeM: 300, power: 1 }], effectiveness: { soft: 1, armored: 0 }, indirect: false, ammoPerMin: 0 },
      },
    });
    expect(unordered.ok).toBe(false);
    if (!unordered.ok) expect(unordered.errors[0]).toContain("weapons.w.bands.1");

    const noArmored = parseWeaponPack({
      id: "x",
      weapons: { w: { name: "w", bands: [{ maxRangeM: 500, power: 1 }], effectiveness: { soft: 1 }, indirect: false, ammoPerMin: 0 } },
    });
    expect(noArmored.ok).toBe(false);
    if (!noArmored.ok) expect(noArmored.errors[0]).toContain("weapons.w.effectiveness.armored");
  });

  it("燃料を使う編成に燃料の上限がなければ弾く", () => {
    const r = parseToePack({
      id: "x",
      toes: {
        t: { name: "t", branch: "armor", armorRatio: 1, supply: { ammoCapacityT: 1, fuelCapacityT: 0, fuelPerKmT: 0.1 }, elements: [{ name: "e", count: 1, hitPoints: 1, weapons: [] }] },
      },
    });
    expect(r.ok).toBe(false);
  });

  it("装甲化率は0〜1", () => {
    const r = parseToePack({
      id: "x",
      toes: { t: { name: "t", branch: "armor", armorRatio: 1.2, elements: [{ name: "e", count: 1, hitPoints: 1, weapons: [] }] } },
    });
    expect(r.ok).toBe(false);
  });

  it("編成表から武器・兵科への参照切れを指摘する", () => {
    const errors = validatePacks({
      ...ctx,
      toes: {
        id: "x",
        toes: {
          t: { name: "t", branch: "cavalry", armorRatio: 0, amphibious: false, frontageM: 0, supply: { ammoCapacityT: 1, fuelCapacityT: 0, fuelPerKmT: 0 }, elements: [{ name: "e", count: 1, hitPoints: 1, weapons: [{ weapon: "nope", count: 1 }] }] },
        },
      },
    });
    expect(errors).toEqual(['編成表 t: 兵科 "cavalry" が兵科パックにありません', '編成表 t / e: 武器 "nope" が武器パックにありません']);
  });

  it("同梱の武器・編成表は参照が切れていない", () => {
    expect(validatePacks(ctx)).toEqual([]);
  });
});
