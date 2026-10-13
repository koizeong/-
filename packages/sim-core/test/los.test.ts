import { describe, expect, it } from "vitest";
import {
  computeFire,
  createUnit,
  detectionLevel,
  hasLineOfSight,
  parseTerrainMap,
  planRoute,
  resolveTurn,
  RoadNetwork,
  Rng,
  TerrainMap,
  type SimContext,
} from "../src/index.js";
import { ger, inf, rules, state, unitOf, unwrap, wideCtx } from "./helpers.js";

/**
 * 10km四方の平地に、x=5000〜5250 の南北の帯を1本置いたマップ。道路はなし
 * (道路はどの地形でも通れるので、峻険な高地を横切る道路は「峠」になる)
 */
function bandCtx(kind: string): SimContext {
  const rows = Array.from({ length: 40 }, () => Array.from({ length: 40 }, (_, c) => (c === 20 ? "X" : ".")).join(""));
  return {
    ...wideCtx,
    roads: RoadNetwork.empty(),
    terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", X: kind }, rows }))),
  };
}
/** 一様な平地(比較の基準) */
const flat = bandCtx("plain");
/** 帯の西 1km と東 1km(帯の外のセルの中心) */
const W = { x: 4125, y: 5125 };
const E = { x: 6125, y: 5125 };

describe("見通し", () => {
  it("平地なら見通せる。森・峻険な高地の帯の向こうは見えない", () => {
    expect(hasLineOfSight(W, E, flat)).toBe(true);
    expect(hasLineOfSight(W, E, bandCtx("forest"))).toBe(false);
    expect(hasLineOfSight(W, E, bandCtx("impassable_high"))).toBe(false);
  });

  it("見通しは、観測者と目標を入れ替えても同じ", () => {
    for (const kind of ["forest", "hill", "impassable_high", "town"]) {
      const ctx = bandCtx(kind);
      for (const [a, b] of [[W, E], [{ x: 4875, y: 3125 }, E], [{ x: 5125, y: 5125 }, { x: 8125, y: 1125 }]] as const) {
        expect(hasLineOfSight(a, b, ctx)).toBe(hasLineOfSight(b, a, ctx));
      }
    }
  });

  it("森の縁にいれば外が見え、森の奥からは見えない", () => {
    const forest = bandCtx("forest");
    // 帯は1セル幅なので、帯の中にいるユニットは自分のセルが帯 = 縁。外が見える
    expect(hasLineOfSight({ x: 5125, y: 5125 }, E, forest)).toBe(true);
    // 広いマップの森林(5000〜6000m四方)の奥から外へは見えない
    expect(hasLineOfSight({ x: 5375, y: 5375 }, { x: 5375, y: 4125 }, wideCtx)).toBe(false);
  });

  it("見通しのない敵は探知できない(探知距離の内側でも)", () => {
    const forest = bandCtx("forest");
    const o = createUnit(inf("o", W.x, W.y));
    const t = createUnit(ger("t", E.x, E.y));
    expect(detectionLevel(o, t, flat)).toBeGreaterThan(0);
    expect(detectionLevel(o, t, forest)).toBe(0);
  });

  it("見通しのない敵には直接射撃できないが、砲撃は当たる", () => {
    const ridge = bandCtx("impassable_high");
    const a = createUnit(ger("a", 4875, 5125, { formation: "deployed" }));
    const t = createUnit(inf("t", 5375, 5125, { formation: "deployed" }));
    // 500m先だが、間の峻険な高地(標高150m)で見えない
    expect(computeFire([a, t], ridge, Rng.fromSeed(1), new Set())).toEqual([]);
    const art = inf("art", 2125, 5125, { branch: "artillery", formation: "deployed" });
    const r1 = resolveTurn(state(art, ger("g", 7125, 5125)), [], ridge, [{ side: "us", type: "fireMission", unitId: "art", target: { x: 7125, y: 5125 } }]);
    const r2 = resolveTurn(r1.state, [], ridge);
    expect(unitOf(r2.state, "g").strength).toBeLessThan(1);
  });
});

describe("高地", () => {
  const hill = bandCtx("hill");
  const H = { x: 5125, y: 5125 };

  it("高地からは探知距離が伸びる", () => {
    const d = rules.detection.baseRangeM * 1.15; // 平地からは届かず、高地(1.3倍)からは届く
    const t = createUnit(ger("t", H.x + d, H.y));
    expect(detectionLevel(createUnit(inf("o", H.x, H.y)), t, flat)).toBe(0);
    expect(detectionLevel(createUnit(inf("o", H.x, H.y)), t, hill)).toBeGreaterThan(0);
  });

  it("高地からは、低地の森の向こうまで見渡せる", () => {
    // 西から: 高地(5000〜5250) → 平地 → 森(6000〜6250) → 平地の目標
    const rows = Array.from({ length: 40 }, () => Array.from({ length: 40 }, (_, c) => (c === 20 ? "H" : c === 24 ? "F" : ".")).join(""));
    const ctx = { ...flat, terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", H: "hill", F: "forest" }, rows }))) };
    const target = { x: 7125, y: 5125 };
    expect(hasLineOfSight(H, target, ctx)).toBe(true);
    // 平地から同じ森越しには見えない
    expect(hasLineOfSight({ x: 5375, y: 5125 }, target, ctx)).toBe(false);
  });

  it("高地にいるユニットは、受ける損害が減る", () => {
    const shot = (ctx: SimContext) => {
      const a = createUnit(ger("a", 5625, 5125, { formation: "deployed" }));
      const t = createUnit(inf("t", H.x, H.y, { formation: "deployed", facing: 90 }));
      return computeFire([a, t], ctx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(shot(hill) / shot(flat)).toBeCloseTo(rules.terrain.hill!.damageTakenMultiplier);
  });
});

describe("峻険な高地(侵入不可)", () => {
  it("道路が横切っていれば、そこは峠として通れる", () => {
    const ridgeWithRoad = { ...bandCtx("impassable_high"), roads: wideCtx.roads }; // y=5000 の幹線道路
    const route = planRoute(W, [E], "march", ridgeWithRoad);
    expect(route).not.toBeNull();
    expect(route!.some((p) => p.onRoad)).toBe(true);
  });

  it("中には入れず、帯の向こうへは届かない(帯がマップを貫いている)", () => {
    const ridge = bandCtx("impassable_high");
    expect(planRoute(W, [E], "march", ridge)).toBeNull();
    expect(planRoute(W, [{ x: 5125, y: 5125 }], "march", ridge)).toBeNull();
  });

  it("途切れていれば、迂回して向こうへ行ける", () => {
    // 帯の南半分だけ
    const rows = Array.from({ length: 40 }, (_, r) => Array.from({ length: 40 }, (_, c) => (c === 20 && r >= 20 ? "X" : ".")).join(""));
    const ctx = { ...flat, terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", X: "impassable_high" }, rows }))) };
    const route = planRoute({ x: 4125, y: 2125 }, [{ x: 6125, y: 2125 }], "march", ctx);
    expect(route).not.toBeNull();
    expect(Math.max(...route!.map((p) => p.y))).toBeGreaterThanOrEqual(5000);
  });
});
