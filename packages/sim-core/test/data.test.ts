import { describe, expect, it } from "vitest";
import { parseBranchPack, parseTerrainMap, parseWeaponPack, validateContext, validatePacks } from "../src/index.js";
import { branches, ctx, rules } from "./helpers.js";

describe("同梱データ", () => {
  it("ルールパックと兵科パックがスキーマを通る", () => {
    expect(rules.defaultStance in rules.stances).toBe(true);
    expect(Object.keys(branches.branches)).toEqual(
      expect.arrayContaining(["infantry", "armor", "tank_destroyer", "artillery", "recon"]),
    );
  });

  it("陣地レベルの範囲は0〜3", () => {
    expect(rules.entrenchment).toEqual({ minLevel: 0, maxLevel: 3 });
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

  it("武器・編成表の参照切れと、射程帯の並び順を指摘する", () => {
    const badWeapon = parseWeaponPack({
      id: "x",
      weapons: {
        w: { name: "w", bands: [{ maxRangeM: 500, power: 1 }, { maxRangeM: 300, power: 1 }], effectiveness: {}, indirect: false },
      },
    });
    expect(badWeapon.ok).toBe(false);

    const errors = validatePacks({
      ...ctx,
      weapons: { id: "x", weapons: { w: { name: "w", bands: [{ maxRangeM: 1, power: 1 }], effectiveness: { soft: 1, bogus: 1 }, indirect: false } } },
      toes: {
        id: "x",
        toes: { t: { name: "t", branch: "infantry", elements: [{ name: "e", count: 1, targetClass: "soft", hitPoints: 1, weapons: [{ weapon: "nope", count: 1 }] }] } },
      },
    });
    expect(errors).toEqual([
      '武器 w: 対象クラス "armored" の効果がありません',
      '武器 w: 未定義の対象クラス "bogus"',
      '編成表 t / e: 武器 "nope" が武器パックにありません',
    ]);
  });

  it("同梱の武器・編成表は参照が切れていない", () => {
    expect(validatePacks(ctx)).toEqual([]);
  });
});
