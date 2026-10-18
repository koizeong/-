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

describe("砲兵の集中射撃", () => {
  it("期待挙動:2個の砲兵で同じ地点を撃つと、撃ち始めは1個ずつの合計より損害が大きい", async () => {
    const { computeIndirectFire } = await import("../src/index.js");
    const mf = wideCtx.rules.combat.massedFire!;
    const target = createUnit(ger("t", 6000, 6000, { formation: "deployed" }));
    const gun = (id: string, y: number) => createUnit(inf(id, 1000, y, { branch: "artillery", toe: "artillery_battalion", formation: "deployed" }));
    const g1 = gun("g1", 1000);
    const g2 = gun("g2", 1200);
    const units = [g1, g2, target];
    const byId = new Map(units.map((u) => [u.id, u]));
    const mission = (unitId: string) => ({ side: "us", unitId, target: { x: 6000, y: 6000 }, turn: 1 });
    const one = computeIndirectFire([mission("g1")], units, byId, wideCtx, Rng.fromSeed(1), new Set(), 0);
    const both = computeIndirectFire([mission("g1"), mission("g2")], units, byId, wideCtx, Rng.fromSeed(1), new Set(), 0);
    const k = 1 + mf.perExtraBattery;
    expect(both.massing.size).toBe(2);
    expect(both.results[0]!.damage / one.results[0]!.damage).toBeCloseTo(k, 1);
    // 撃ち始めの時間を過ぎると上乗せはない
    const later = computeIndirectFire([mission("g1"), mission("g2")], units, byId, wideCtx, Rng.fromSeed(1), new Set(), mf.firstMinutes + 1);
    expect(later.massing.size).toBe(0);
  });
});
