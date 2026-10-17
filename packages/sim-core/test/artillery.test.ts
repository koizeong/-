import { describe, expect, it } from "vitest";
import { canBreakThrough, computeFire, createUnit, holdingZones, Rng, type SimContext } from "../src/index.js";
import { ger, inf, wideCtx } from "./helpers.js";

/** 砲兵の兵科の倍率を1に戻した文脈(比べる用) */
const plainArtillery = (c: SimContext): SimContext => {
  const art = c.branches.branches["artillery"]!;
  return { ...c, branches: { ...c.branches, branches: { ...c.branches.branches, artillery: { ...art, holdingMultiplier: 1, directDamageTakenMultiplier: 1 } } } };
};

describe("砲兵の脆さ(兵科の倍率)", () => {
  it("期待挙動:陣地を築いた砲兵でも、歩兵連隊の前進は止められない(倍率がなければ止めてしまう)", () => {
    const gunline = createUnit(inf("g", 3000, 3000, { branch: "artillery", formation: "deployed", facing: 270, entrenchment: 3 }));
    const mover = createUnit(ger("m", 2400, 3000, { formation: "deployed", facing: 90 }));
    expect(wideCtx.branches.branches["artillery"]!.holdingMultiplier).toBeLessThan(1);
    expect(canBreakThrough(mover, holdingZones([gunline], wideCtx)[0]!, wideCtx)).toBe(true);
    const plain = plainArtillery(wideCtx);
    expect(canBreakThrough(mover, holdingZones([gunline], plain)[0]!, plain)).toBe(false);
  });

  it("期待挙動:砲兵は直接射撃で受ける損害が大きい(取りつかれると砲と砲員がむき出し)", () => {
    const hit = (ctx: SimContext) => {
      const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }));
      const t = createUnit(inf("t", 1400, 1000, { branch: "artillery", formation: "deployed", facing: 270 }));
      return computeFire([a, t], ctx, Rng.fromSeed(1), new Set()).find((r) => r.targetId === "t")!.damage;
    };
    const k = wideCtx.branches.branches["artillery"]!.directDamageTakenMultiplier;
    expect(k).toBeGreaterThan(1);
    expect(hit(wideCtx) / hit(plainArtillery(wideCtx))).toBeCloseTo(k, 5);
  });
});
