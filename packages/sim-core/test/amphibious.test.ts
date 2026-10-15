import { describe, expect, it } from "vitest";
import {
  computeFire,
  createUnit,
  parseTerrainMap,
  planRoute,
  resolveTurn,
  Rng,
  startScenario,
  TerrainMap,
  viewForSide,
  type HqCommand,
  type NewUnit,
  type SimContext,
} from "../src/index.js";
import { ctx as baseCtx, ger, inf, rules, unitOf, unwrap } from "./helpers.js";

/**
 * 1km セル × 20 × 10(20km × 10km)。西の 4 列(x < 4000)が海、その東が平地の海岸
 */
const coast = new TerrainMap(
  unwrap(parseTerrainMap({ cellSizeM: 1000, legend: { W: "large_river", ".": "plain" }, rows: Array.from({ length: 10 }, () => "WWWW................") })),
);
const ctx: SimContext = { ...baseCtx, terrain: coast };
const marine = (id: string, x: number, y: number, extra: Partial<NewUnit> = {}) => inf(id, x, y, { toe: "amphibious_infantry_regiment", ...extra });

describe("揚陸能力のある部隊", () => {
  it("海を渡れる(揚陸能力のない部隊は海へ入れない)", () => {
    expect(planRoute({ x: 500, y: 5000 }, [{ x: 8000, y: 5000 }], "march", ctx, "amphibious")).not.toBeNull();
    expect(planRoute({ x: 6000, y: 5000 }, [{ x: 1500, y: 5000 }], "march", ctx, "foot")).toBeNull();
    // 海の上から海岸へ上陸する
    const r = resolveTurn(startScenario([createUnit(marine("m", 3500, 5000))], 1, ctx), [{ unitId: "m", waypoints: [{ x: 8000, y: 5000 }] }], ctx);
    expect(r.rejectedOrders).toEqual([]);
    expect(unitOf(r.state, "m").pos.x).toBeGreaterThan(4000);
  });

  it("海の上は遅く、無防備(受ける損害が大きい)", () => {
    const go = (x: number) =>
      unitOf(resolveTurn(startScenario([createUnit(marine("m", x, 5000))], 1, ctx), [{ unitId: "m", waypoints: [{ x: x + 3000, y: 5000 }] }], ctx).state, "m").pos.x - x;
    expect(go(300)).toBeLessThan(go(10000)); // 海の上(x=300〜)と陸の上(x=10000〜)
    const hit = (x: number) => {
      const a = createUnit(ger("a", x + 500, 5000, { formation: "deployed", facing: 270 }));
      const t = createUnit(marine("t", x, 5000, { formation: "deployed", facing: 90 }));
      return computeFire([a, t], ctx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(hit(3500) / hit(9500)).toBeCloseTo(rules.terrain.large_river!.damageTakenMultiplier);
  });
});

describe("艦砲射撃", () => {
  const navalCtx: SimContext = {
    ...ctx,
    scenario: { ...ctx.scenario, naval: { us: { gunfire: { missionsPerDay: 2, weapon: "naval_gun", count: 6, rangeFromSeaM: 6000 } } } },
  };
  const fire = (target: { x: number; y: number }): HqCommand => ({ side: "us", type: "navalGunfire", target });

  it("要請した次のターンに、1ターンかけて着弾する(誤射あり)", () => {
    const s = startScenario([createUnit(marine("m", 2000, 5000)), createUnit(ger("g", 7000, 5000, { formation: "deployed" }))], 1, navalCtx);
    const r1 = resolveTurn(s, [], navalCtx, [fire({ x: 7000, y: 5000 })]);
    expect(r1.rejectedHqCommands).toEqual([]);
    expect(unitOf(r1.state, "g").strength).toBe(1);
    expect(viewForSide(r1.state, "us").navalMissions).toHaveLength(1);
    const r2 = resolveTurn(r1.state, [], navalCtx);
    expect(unitOf(r2.state, "g").strength).toBeLessThan(1);
    expect(r2.events.filter((e) => e.unitId === "g" && e.type === "hit").length).toBe(30);
    expect(r2.hqEvents.some((e) => e.type === "navalGunfire")).toBe(true);
    expect(r2.state.navalLeft.us).toBe(1);
  });

  it("海から遠い地点には届かない。持っていない陣営は使えない", () => {
    const s = startScenario([createUnit(marine("m", 2000, 5000))], 1, navalCtx);
    expect(resolveTurn(s, [], navalCtx, [fire({ x: 15000, y: 5000 })]).rejectedHqCommands[0]?.reason).toContain("海から遠すぎます");
    expect(resolveTurn(s, [], navalCtx, [{ side: "de", type: "navalGunfire", target: { x: 7000, y: 5000 } }]).rejectedHqCommands[0]?.reason).toContain("使えません");
  });
});
