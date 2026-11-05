import { describe, expect, it } from "vitest";
import { createUnit, newGameState, parseTerrainMap, resolveTurn, TerrainMap, type NewUnit, type SimContext } from "../src/index.js";
import { ctx as baseCtx, toes, unwrap, withoutFatigue } from "./helpers.js";

/** 250m セル × 40列 × 8行(10km × 2km)。西の 32列が海、東の 8列が陸 */
const terrain = new TerrainMap(
  unwrap(parseTerrainMap({ cellSizeM: 250, legend: { "~": "sea", ".": "plain" }, rows: Array.from({ length: 8 }, () => "~".repeat(32) + ".".repeat(8)) })),
);
const ship = {
  name: "試験の戦隊",
  branch: "naval",
  armorRatio: 0.5,
  frontageM: 0,
  naval: true,
  speedMpm: 600,
  supply: { ammoCapacityT: 100, fuelCapacityT: 1000, fuelPerKmT: 0.5 },
  elements: [{ name: "艦", count: 4, hitPoints: 500, weapons: [{ weapon: "machine_gun", count: 2 }] }],
};
const ctx: SimContext = withoutFatigue({ ...baseCtx, terrain, turnSeconds: 1800, toes: { ...toes, toes: { ...toes.toes, test_ship: ship as never } } });

const sq = (id: string, x: number, y: number, extra: Partial<NewUnit> = {}): NewUnit => ({ id, side: "us", branch: "naval", toe: "test_ship", pos: { x, y }, facing: 90, stance: "standard", ...extra });
const infantry = (id: string, x: number, y: number): NewUnit => ({ id, side: "us", branch: "infantry", toe: "infantry_regiment", pos: { x, y }, facing: 270, stance: "standard" });

describe("海戦の土台:艦艇の戦隊", () => {
  it("海の上を艦級の速さで進み、行軍でも縦隊にならず撃てる隊形のまま、針路を向く", () => {
    const s = newGameState([createUnit(sq("a", 1125, 1125))], 1);
    const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: 7125, y: 1125 }], moveMode: "march" }], ctx);
    const a = r.state.units[0]!;
    // 600m/分 × 30分 = 18km 進めるので、6km 先に着く
    expect(a.pos.x).toBeCloseTo(7125, 0);
    expect(a.formation).toBe("deployed");
    expect(a.facing).toBeCloseTo(90, 0);
    // 6km を 600m/分 で → 10分。途中の位置で速さを確かめる
    const halfway = r.tracks["a"]!.find((p) => p.t === s.time + 300)!;
    expect(halfway.x).toBeCloseTo(1125 + 3000, -1);
  });

  it("艦艇は陸に上がれず、陸の部隊は海に入れない(届かない命令は弾く)", () => {
    const s = newGameState([createUnit(sq("a", 1125, 1125)), createUnit(infantry("i", 9125, 1125))], 1);
    const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: 9625, y: 1125 }] }, { unitId: "i", waypoints: [{ x: 4125, y: 1125 }] }], ctx);
    expect(r.rejectedOrders.map((o) => o.unitId).sort()).toEqual(["a", "i"]);
  });

  it("陣形は変えるのに15分かかり、変えている間は前の陣形のまま。輪形陣は遅い", () => {
    const s = newGameState([createUnit(sq("a", 1125, 1125)), createUnit(sq("b", 1125, 1625))], 1);
    const r = resolveTurn(s, [{ unitId: "a", navalFormation: "ring", waypoints: [{ x: 7625, y: 1125 }] }, { unitId: "b", waypoints: [{ x: 7625, y: 1625 }] }], ctx);
    const a = r.state.units.find((u) => u.id === "a")!;
    expect(a.navalFormation).toBe("ring");
    expect(a.navalChange).toBeUndefined();
    expect(r.events.find((e) => e.type === "navalFormationChanged")).toMatchObject({ unitId: "a", to: "ring", t: s.time + 900 });
    // 変え終わるまでは同じ速さ、その後は輪形陣の 0.85 倍
    const at = (id: string, t: number) => r.tracks[id]!.find((p) => p.t === s.time + t)!.x;
    expect(at("a", 600)).toBeCloseTo(at("b", 600), 0);
    expect(at("b", 600 + 300) - at("b", 600)).toBeGreaterThan(at("a", 900 + 300) - at("a", 900) + 1);
  });

  it("陣形は艦艇の戦隊だけが取れる", () => {
    const s = newGameState([createUnit(infantry("i", 9125, 1125))], 1);
    const r = resolveTurn(s, [{ unitId: "i", navalFormation: "ring" }], ctx);
    expect(r.rejectedOrders[0]!.reason).toContain("艦艇");
    const t = resolveTurn(newGameState([createUnit(sq("a", 1125, 1125))], 1), [{ unitId: "a", navalFormation: "zigzag" }], ctx);
    expect(t.rejectedOrders[0]!.reason).toContain("未定義の陣形");
  });

  it("艦艇の戦隊は阻止圏を持たず、行き合った敵の戦隊に進路をふさがれない", () => {
    const enemy = createUnit(sq("e", 4125, 1125, { side: "de", facing: 270 }));
    const s = newGameState([createUnit(sq("a", 1125, 1125)), enemy], 1);
    const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: 7125, y: 1125 }] }], ctx);
    expect(r.events.some((e) => e.type === "blocked")).toBe(false);
    expect(r.state.units.find((u) => u.id === "a")!.pos.x).toBeCloseTo(7125, 0);
  });
});
