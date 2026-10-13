import { describe, expect, it } from "vitest";
import { buildScenario, createUnit, detectionRange, resolveTurn, startScenario, type SimContext } from "../src/index.js";
import { ger, inf, loadPacks, loadScenarioJson, rules, wideCtx } from "./helpers.js";

const at = (fogDensity: string): SimContext => ({ ...wideCtx, fogDensity });
const L = rules.fog.levels;

describe("霧の濃度", () => {
  it("既定は中濃度。濃いほど探知距離が短い", () => {
    expect(rules.fog.default).toBe("medium");
    const o = createUnit(inf("o", 1000, 1000));
    const t = createUnit(ger("t", 2000, 1000));
    const range = (c: SimContext) => detectionRange(o, t, c);
    expect(range(wideCtx)).toBeCloseTo(range(at("medium")));
    expect(range(at("light"))).toBeCloseTo(range(at("medium")) * L.light!.detectionRangeMultiplier);
    expect(range(at("heavy"))).toBeCloseTo(range(at("medium")) * L.heavy!.detectionRangeMultiplier);
  });

  it("濃いほど規模推定の誤差が大きい", () => {
    const spread = (density: string) => {
      let max = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const c = at(density);
        const s = startScenario([createUnit(inf("a", 1000, 1000)), createUnit(ger("g", 1300, 1000))], seed, c);
        const v = resolveTurn(s, [], c).state.intel.us!.entries.g!.estimateFactor!;
        max = Math.max(max, Math.abs(v - 1));
      }
      return max;
    };
    const base = rules.detection.sizeEstimateError;
    expect(spread("light")).toBeLessThanOrEqual(base * L.light!.sizeEstimateErrorMultiplier + 1e-12);
    expect(spread("heavy")).toBeGreaterThan(base);
    expect(spread("heavy")).toBeLessThanOrEqual(base * L.heavy!.sizeEstimateErrorMultiplier + 1e-12);
  });

  it("見失った敵のゴーストは、濃度に応じた時間で忘れる(薄いなら忘れない)", () => {
    const remembered = (density: string, turns: number) => {
      const c = at(density);
      // 見える位置から、視界の外へ去る敵
      let s = startScenario([createUnit(inf("a", 1000, 5000)), createUnit(ger("g", 2500, 5000, { branch: "armor" }))], 1, c);
      s = resolveTurn(s, [{ unitId: "g", waypoints: [{ x: 9900, y: 9900 }] }], c).state;
      for (let i = 0; i < turns; i++) s = resolveTurn(s, [], c).state;
      return s.intel.us?.entries.g !== undefined;
    };
    // 3時間後(6ターン):濃いと忘れ、中・薄いは覚えている
    expect(remembered("heavy", 6)).toBe(false);
    expect(remembered("medium", 6)).toBe(true);
    // 7時間後(14ターン):中も忘れ、薄いは覚えている
    expect(remembered("medium", 14)).toBe(false);
    expect(remembered("light", 14)).toBe(true);
  });

  it("シナリオファイルで既定の濃度を指定でき、試合ごとに上書きできる。存在しない濃度はエラー", () => {
    const def = structuredClone(loadScenarioJson("test-symmetric")) as Record<string, unknown>;
    def.fogDensity = "heavy";
    const r = buildScenario(def, loadPacks());
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.value.ctx.fogDensity).toBe("heavy");
    const match = { ...r.value.ctx, fogDensity: "light" };
    expect(() => resolveTurn(r.value.start(1), [], match)).not.toThrow();
    expect(() => resolveTurn(r.value.start(1), [], { ...r.value.ctx, fogDensity: "pea-soup" })).toThrow("霧の濃度");
    def.fogDensity = "pea-soup";
    const bad = buildScenario(def, loadPacks());
    expect(bad.ok).toBe(false);
  });
});

