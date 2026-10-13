import { describe, expect, it } from "vitest";
import { parseBranchPack, parseTerrainMap, validateContext } from "../src/index.js";
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

  it("兵科・姿勢の参照切れを指摘する", () => {
    const errors = validateContext(ctx, [
      { branch: "cavalry", stance: "standard", id: "u1" },
      { branch: "infantry", stance: "berserk", id: "u2" },
    ] as never);
    expect(errors).toHaveLength(2);
  });
});
