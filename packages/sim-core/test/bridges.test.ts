import { describe, expect, it } from "vitest";
import {
  createUnit,
  currentSupplyRoutes,
  findBridges,
  parseRoadNetwork,
  parseTerrainMap,
  planRoute,
  resolveTurn,
  RoadNetwork,
  routeCrossesClosed,
  startScenario,
  TerrainMap,
  withBridges,
  type GameState,
  type HqCommand,
  type NewUnit,
  type SimContext,
} from "../src/index.js";
import { ger, inf, unitOf, unwrap, wideCtx } from "./helpers.js";

/**
 * 10km四方の平地に、x=5000〜5250 の南北の大河。橋は北(y=7125)と南(y=2125)の2本。
 * 西岸の w1/w2 と東岸の e1/e2 を、それぞれ岸に沿った道路でもつなぐ
 */
function riverCtx(kind: "river" | "large_river" = "large_river", rules: Partial<SimContext["rules"]["bridges"]> = {}): SimContext {
  const rows = Array.from({ length: 40 }, () => Array.from({ length: 40 }, (_, c) => (c === 20 ? "~" : ".")).join(""));
  const roads = new RoadNetwork(
    unwrap(
      parseRoadNetwork({
        nodes: { w1: { x: 4500, y: 7125 }, e1: { x: 5750, y: 7125 }, w2: { x: 4500, y: 2125 }, e2: { x: 5750, y: 2125 } },
        edges: [
          { from: "w1", to: "e1", capacityTPerHour: 100 },
          { from: "w2", to: "e2", capacityTPerHour: 100 },
          { from: "w1", to: "w2", capacityTPerHour: 100 },
          { from: "e1", to: "e2", capacityTPerHour: 100 },
        ],
      }),
    ),
  );
  return {
    ...wideCtx,
    rules: { ...wideCtx.rules, bridges: { ...wideCtx.rules.bridges, ...rules } },
    terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", "~": kind }, rows }))),
    roads,
    scenario: {
      ...wideCtx.scenario,
      air: { us: { strike: { groups: 1, replacementPerDay: 0, weapon: "ground_attack_aircraft", count: 12, strikeMinutes: 10 } } },
    },
  };
}
const start = (ctx: SimContext, ...units: NewUnit[]) => startScenario(units.map(createUnit), 1, ctx);
const demolish = (bridgeId = "w1~e1"): HqCommand => ({ side: "us", type: "demolishBridge", bridgeId });
const repair = (bridgeId = "w1~e1"): HqCommand => ({ side: "us", type: "repairBridge", bridgeId });

describe("橋", () => {
  it("水の地形を横切る道路の区間が橋になる(岸に沿った道路は橋ではない)", () => {
    const bridges = findBridges(riverCtx());
    expect(bridges.map((b) => b.id)).toEqual(["w1~e1", "w2~e2"]);
    expect(bridges[0]!.pos.x).toBeGreaterThanOrEqual(5000);
    expect(bridges[0]!.pos.x).toBeLessThanOrEqual(5250);
  });

  it("橋のそばの部隊が爆破を頼むと、ターンの終わりに落ち、次のターンから車両はもう一方の橋へ迂回する", () => {
    const ctx = riverCtx("large_river", { demolitionSuccess: 1 });
    const r = resolveTurn(start(ctx, inf("a", 4500, 7125)), [], ctx, [demolish()]);
    expect(r.rejectedHqCommands).toEqual([]);
    expect(r.state.bridges["w1~e1"]!.destroyed).toBe(true);
    expect(r.publicEvents.some((e) => e.type === "bridgeDestroyed" && e.bridgeId === "w1~e1")).toBe(true);
    // 北の橋を渡れば近いが、落ちたので南の橋を通る
    const bridged = withBridges(ctx, r.state.bridges);
    const route = planRoute({ x: 4000, y: 7500 }, [{ x: 6500, y: 7500 }], "march", bridged, "vehicle")!;
    expect(route.some((p) => Math.abs(p.y - 2125) < 1)).toBe(true);
    expect(routeCrossesClosed({ x: 4000, y: 7500 }, route, bridged)).toBe(false);
  });

  it("期待挙動:両方の橋を落とすと、大河の向こうへは渡れない(命令は届かない)", () => {
    const ctx = riverCtx("large_river", { demolitionSuccess: 1 });
    let s = start(ctx, inf("a", 4500, 7125), inf("b", 4500, 2125), inf("c", 3000, 5000, { branch: "armor" }));
    s = resolveTurn(s, [], ctx, [demolish("w1~e1"), demolish("w2~e2")]).state;
    const r = resolveTurn(s, [{ unitId: "c", waypoints: [{ x: 7000, y: 5000 }], moveMode: "march" }], ctx);
    expect(r.rejectedOrders).toEqual([{ unitId: "c", reason: "到達できない地点です" }]);
  });

  it("前のターンに橋を渡る経路を引いていた部隊は、橋が落ちたら引き直す(落ちた橋を道路として渡らない)", () => {
    const ctx = riverCtx("large_river", { demolitionSuccess: 1 });
    // 機甲は東へ北の橋を渡る経路を引く。同じターンに守備の部隊が橋を落とす
    let s = start(ctx, inf("t", 2000, 7125, { branch: "armor", formation: "column", moveMode: "march" }), inf("g", 4600, 7400));
    s = resolveTurn(s, [{ unitId: "t", waypoints: [{ x: 7000, y: 7125 }] }], ctx, [demolish()]).state;
    expect(s.bridges["w1~e1"]!.destroyed).toBe(true);
    for (let i = 0; i < 4; i++) s = resolveTurn(s, [], ctx).state;
    // 大河のセルには入らず、南の橋を回る
    const t = unitOf(s, "t");
    const onWater = t.pos.x > 5000 && t.pos.x < 5250 && Math.abs(t.pos.y - 7125) < 200;
    expect(onWater).toBe(false);
    expect(t.route.every((p) => !(Math.abs(p.y - 7125) < 1 && p.x > 5000 && p.x < 5300))).toBe(true);
  });

  it("橋から遠い所からは爆破を頼めない", () => {
    const ctx = riverCtx();
    const r = resolveTurn(start(ctx, inf("a", 1000, 1000)), [], ctx, [demolish()]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual([`橋から${ctx.rules.bridges.workRangeM}m以内に自軍の部隊がいません`]);
    expect(r.state.bridges["w1~e1"]!.destroyed).toBe(false);
  });

  it("期待挙動:橋が落ちると、その橋を通っていた補給路が切れる", () => {
    const ctx = riverCtx("large_river", { demolitionSuccess: 1 });
    const depots = [{ id: "d", side: "us", nodeId: "w1", ammoT: 100, fuelT: 100 }];
    const units = [createUnit(inf("a", 5750, 7125)), createUnit(inf("b", 4600, 7400))];
    expect(currentSupplyRoutes(units, depots, ctx)["a"]).toBeDefined();
    // 北の橋だけを落とすと、南の橋を回る(長くなる)
    const north = withBridges(ctx, { "w1~e1": { destroyed: true } });
    const detour = currentSupplyRoutes(units, depots, north)["a"];
    expect(detour).toBeDefined();
    // 両方落とすと切れる
    const both = withBridges(ctx, { "w1~e1": { destroyed: true }, "w2~e2": { destroyed: true } });
    expect(currentSupplyRoutes(units, depots, both)["a"]).toBeUndefined();
  });

  it("修理は、橋のそばに自軍がいて近くに敵がいないあいだだけ進み、所定の時間で直る", () => {
    const ctx: SimContext = { ...riverCtx("large_river", { repairHours: 3 }), scenario: { ...riverCtx().scenario, destroyedBridges: ["w1~e1"] } };
    let s: GameState = start(ctx, inf("a", 4500, 7125));
    expect(s.bridges["w1~e1"]!.destroyed).toBe(true);
    const r = resolveTurn(s, [], ctx, [repair()]);
    expect(r.hqEvents.some((e) => e.type === "bridgeRepairStarted")).toBe(true);
    s = r.state;
    // 頼んだターンは進まず、次のターンから1ターンずつ
    expect(s.bridges["w1~e1"]!.repair!.progressSec).toBe(0);
    const turns = (3 * 3600) / ctx.turnSeconds;
    for (let i = 0; i < turns - 1; i++) s = resolveTurn(s, [], ctx).state;
    expect(s.bridges["w1~e1"]!.destroyed).toBe(true);
    const done = resolveTurn(s, [], ctx);
    expect(done.state.bridges["w1~e1"]).toEqual({ destroyed: false });
    expect(done.publicEvents.some((e) => e.type === "bridgeRepaired")).toBe(true);
  });

  it("期待挙動:近くに敵がいると修理が進まない", () => {
    const ctx: SimContext = { ...riverCtx("large_river", { repairHours: 3 }), scenario: { ...riverCtx().scenario, destroyedBridges: ["w1~e1"] } };
    let s = start(ctx, inf("a", 4500, 7125), ger("e", 6500, 7125));
    s = resolveTurn(s, [], ctx, [repair()]).state;
    for (let i = 0; i < 4; i++) s = resolveTurn(s, [], ctx).state;
    expect(s.bridges["w1~e1"]!.destroyed).toBe(true);
    expect(s.bridges["w1~e1"]!.repair!.progressSec).toBe(0);
  });

  it("空襲で、着弾範囲の中の橋が確率で落ちる", () => {
    const ctx = riverCtx("large_river", { airStrikeChance: 1 });
    let s = start(ctx, inf("a", 1000, 1000));
    s = resolveTurn(s, [], ctx, [{ side: "us", type: "airStrike", target: { x: 5125, y: 7125 } }]).state;
    const r = resolveTurn(s, [], ctx);
    expect(r.state.bridges["w1~e1"]!.destroyed).toBe(true);
    expect(r.state.bridges["w2~e2"]!.destroyed).toBe(false);
    expect(r.publicEvents.some((e) => e.type === "bridgeDestroyed" && e.by === "airStrike")).toBe(true);
  });
});
