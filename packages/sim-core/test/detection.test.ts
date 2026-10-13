import { describe, expect, it } from "vitest";
import { createUnit, detectionLevel, newGameState, resolveTurn, type SimContext } from "../src/index.js";
import { ger, inf, rules, state, wideCtx } from "./helpers.js";

const base = rules.detection.baseRangeM;
const typeR = base * rules.detection.typeIdentifiedRatio;
const fullR = base * rules.detection.fullyIdentifiedRatio;

const level = (obs: Parameters<typeof inf>[3], tgtX: number, ctx: SimContext = wideCtx, tgt: Parameters<typeof inf>[3] = {}) =>
  detectionLevel(createUnit(inf("o", 1000, 1000, obs)), createUnit(ger("t", 1000 + tgtX, 1000, tgt)), ctx);

describe("探知の段階", () => {
  it("距離に応じて 規模判明 → 兵種判明 → 反応あり → 未探知", () => {
    expect(level({}, fullR - 1)).toBe(3);
    expect(level({}, typeR - 1)).toBe(2);
    expect(level({}, base - 1)).toBe(1);
    expect(level({}, base + 1)).toBe(0);
  });

  it("期待挙動:偵察重視のユニットは標準より遠くの敵を発見できる", () => {
    const d = base * 1.3;
    expect(level({}, d)).toBe(0);
    expect(level({ stance: "recon" }, d)).toBe(1);
  });

  it("期待挙動:姿勢の切り替え中は標準扱い(偵察重視への切替中は視界が広がらない)", () => {
    const d = base * 1.3;
    const switching = createUnit(inf("o", 1000, 1000));
    switching.pendingStance = "recon";
    expect(detectionLevel(switching, createUnit(ger("t", 1000 + d, 1000)), wideCtx)).toBe(0);
    // 偵察重視から別の姿勢へ切替中も、旧姿勢の効果を失う
    const leaving = createUnit(inf("o", 1000, 1000, { stance: "recon" }));
    leaving.pendingStance = "defense";
    expect(detectionLevel(leaving, createUnit(ger("t", 1000 + d, 1000)), wideCtx)).toBe(0);
  });

  it("偵察部隊(兵科)は遠くまで見える", () => {
    const d = base * 1.3;
    expect(level({ branch: "recon" }, d)).toBe(1);
  });

  it("森林の中の目標は見つけにくい", () => {
    const obs = createUnit(inf("o", 5500, 3500));
    const d = base * 0.8; // 平地なら反応あり
    const inForest = createUnit(ger("t", 5500, 3500 + 2000)); // (5500, 5500) は森林
    expect(detectionLevel(obs, createUnit(ger("t", 5500 - d, 3500)), wideCtx)).toBe(1);
    expect(d).toBeLessThan(2000 / rules.terrain.forest!.concealment);
    expect(detectionLevel(obs, inForest, wideCtx)).toBe(0);
  });

  it("夜・悪天候(視程の倍率)で探知距離が縮む", () => {
    const night = { ...wideCtx, visibilityMultiplier: 0.5 };
    expect(level({}, base * 0.8)).toBe(1);
    expect(level({}, base * 0.8, night)).toBe(0);
  });
});

describe("陣営の敵情報", () => {
  it("見失うと最後に見た位置がゴーストとして残り、判明した兵種は忘れない", () => {
    // 敵は兵種判明の距離から、東へ行軍して視界の外へ出る
    const s0 = state(inf("a", 1000, 5000), ger("g", 1000 + typeR - 100, 5000, { branch: "armor" }));
    const r = resolveTurn(s0, [{ unitId: "g", waypoints: [{ x: 9900, y: 5000 }] }], wideCtx);
    const e = r.state.intel.us!.entries.g!;
    expect(e.currentLevel).toBe(0);
    expect(e.bestLevel).toBe(2);
    expect(e.branch).toBe("armor");
    expect(e.lastSeenPos.x).toBeLessThan(1000 + base + 1);
    expect(e.lastSeenPos.x).toBeGreaterThan(1000 + base - 250);
    expect(e.lastSeenTime).toBeGreaterThan(0);
    expect(e.lastSeenTime).toBeLessThan(1800);
  });

  it("規模推定の誤差は ±20% 以内で、同じシードなら同じ値になる", () => {
    const make = (seed: number) =>
      newGameState([createUnit(inf("a", 1000, 1000)), createUnit(ger("g", 1500, 1000))], seed);
    const est = (seed: number) => resolveTurn(make(seed), [], wideCtx).state.intel.us!.entries.g!.lastEstimatedStrength!;
    const values = Array.from({ length: 20 }, (_, i) => est(i + 1));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(1 - rules.detection.sizeEstimateError);
      expect(v).toBeLessThanOrEqual(1 + rules.detection.sizeEstimateError);
    }
    expect(new Set(values).size).toBeGreaterThan(1);
    expect(est(5)).toBe(est(5));
  });

  it("偵察重視の観測者は規模推定の誤差が小さい", () => {
    const limit = rules.detection.sizeEstimateError * rules.stances.recon!.estimateErrorMultiplier;
    for (let seed = 1; seed <= 20; seed++) {
      const s0 = newGameState([createUnit(inf("a", 1000, 1000, { stance: "recon" })), createUnit(ger("g", 1500, 1000))], seed);
      const v = resolveTurn(s0, [], wideCtx).state.intel.us!.entries.g!.lastEstimatedStrength!;
      expect(Math.abs(v - 1)).toBeLessThanOrEqual(limit + 1e-12);
    }
  });

  it("推定倍率は一度引いたら固定され、次のターンも変わらない", () => {
    const r1 = resolveTurn(state(inf("a", 1000, 1000), ger("g", 1500, 1000)), [], wideCtx);
    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(r2.state.intel.us!.entries.g!.estimateFactor).toBe(r1.state.intel.us!.entries.g!.estimateFactor);
  });
});

