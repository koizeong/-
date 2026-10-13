import { describe, expect, it } from "vitest";
import {
  createUnit,
  newGameState,
  parseRoadNetwork,
  resolveTurn,
  RoadNetwork,
  viewForSide,
  type Depot,
  type GameState,
  type NewUnit,
} from "../src/index.js";
import { bypassRoads, ger, inf, unitOf, unwrap, wideCtx } from "./helpers.js";

const usDepot = (over: Partial<Depot> = {}): Depot => ({ id: "us-dump", side: "us", nodeId: "n0", ammoT: 500, fuelT: 500, ...over });
const game = (units: NewUnit[], depots: Depot[]) => newGameState(units.map(createUnit), 1, depots);
function run(s: GameState, turns: number, ctx = wideCtx): GameState {
  let cur = s;
  for (let i = 0; i < turns; i++) cur = resolveTurn(cur, [], ctx).state;
  return cur;
}

describe("補給路からの補給", () => {
  it("味方の集積所から道路を通って届き、集積所の在庫が減る", () => {
    const r = resolveTurn(game([inf("a", 9500, 5200, { ammo: 0.5 })], [usDepot()]), [], wideCtx);
    const a = unitOf(r.state, "a");
    expect(a.ammo).toBeCloseTo(1);
    expect(a.supplied).toBe(true);
    expect(r.state.depots[0]!.ammoT).toBeCloseTo(500 - 30);
    expect(r.events.some((e) => e.type === "resupplied" && e.unitId === "a")).toBe(true);
  });

  it("道路から遠すぎるユニットには届かない", () => {
    const r = resolveTurn(game([inf("a", 9500, 8000, { ammo: 0.5 })], [usDepot()]), [], wideCtx);
    expect(unitOf(r.state, "a").ammo).toBe(0.5);
    expect(unitOf(r.state, "a").supplied).toBe(false);
    expect(r.events.some((e) => e.type === "supplyStatus" && e.unitId === "a" && !e.supplied)).toBe(true);
  });

  it("道路の輸送能力は陣営で共有し、経路の短いユニットから使う", () => {
    // 1ターン(30分)に10トンしか通らない細い道
    const thin = new RoadNetwork(
      unwrap(
        parseRoadNetwork({
          nodes: { s: { x: 0, y: 5000 }, m: { x: 1000, y: 5000 }, e: { x: 9000, y: 5000 } },
          edges: [
            { from: "s", to: "m", capacityTPerHour: 20 },
            { from: "m", to: "e", capacityTPerHour: 20 },
          ],
        }),
      ),
    );
    const ctx = { ...wideCtx, roads: thin };
    const r = resolveTurn(game([inf("near", 1000, 5100, { ammo: 0.5 }), inf("far", 9000, 5100, { ammo: 0.5 })], [usDepot({ nodeId: "s" })]), [], ctx);
    const near = unitOf(r.state, "near").ammo;
    const far = unitOf(r.state, "far").ammo;
    expect(near).toBeGreaterThan(0.5);
    expect(far).toBe(0.5);
    // 届いた量 = 輸送能力10トン × 距離による減衰
    const decay = 1 / (1 + 1000 / wideCtx.rules.supply.distanceScaleM);
    expect((near - 0.5) * 60).toBeCloseTo(10 * decay);
  });

  it("集積所から遠いほど、届く量が減る", () => {
    const thin = new RoadNetwork(unwrap(parseRoadNetwork({ nodes: { s: { x: 0, y: 5000 }, e: { x: 9000, y: 5000 } }, edges: [{ from: "s", to: "e", capacityTPerHour: 20 }] })));
    const thinNear = new RoadNetwork(unwrap(parseRoadNetwork({ nodes: { s: { x: 0, y: 5000 }, e: { x: 1000, y: 5000 } }, edges: [{ from: "s", to: "e", capacityTPerHour: 20 }] })));
    const got = (roads: RoadNetwork, x: number) =>
      unitOf(resolveTurn(game([inf("a", x, 5100, { ammo: 0.5 })], [usDepot({ nodeId: "s" })]), [], { ...wideCtx, roads }).state, "a").ammo;
    expect(got(thinNear, 1000)).toBeGreaterThan(got(thin, 9000));
  });

  it("近くの集積所の在庫が尽きたら、次の集積所から届ける", () => {
    const r = resolveTurn(
      game(
        [inf("a", 9900, 5100, { ammo: 0.5 }), inf("b", 9950, 5100, { ammo: 0.5 })],
        [usDepot({ id: "small", nodeId: "n9", ammoT: 10, fuelT: 0 }), usDepot({ id: "big", nodeId: "n0" })],
      ),
      [],
      wideCtx,
    );
    const small = r.state.depots.find((d) => d.id === "small")!;
    const big = r.state.depots.find((d) => d.id === "big")!;
    expect(small.ammoT).toBeCloseTo(0);
    expect(big.ammoT).toBeLessThan(500);
    expect(unitOf(r.state, "b").ammo).toBeCloseTo(1);
  });
});

describe("遮断と迂回", () => {
  // a は東端で g と撃ち合う。弾薬は少なめで始める
  const fighters = (): NewUnit[] => [
    inf("a", 9500, 5000, { formation: "deployed", facing: 180, ammo: 0.15 }),
    ger("g", 9500, 4400, { formation: "deployed", facing: 0 }),
  ];
  // 幹線の中ほど n5 に居座るドイツ軍(近くに米軍はいない)
  const blocker = ger("block", 5000, 5300, { formation: "deployed" });

  it("期待挙動:補給路を断たれた部隊は、時間とともに弱体化する", () => {
    const connected = run(game(fighters(), [usDepot()]), 3);
    const cut = run(game([...fighters(), blocker], [usDepot()]), 3);
    const ac = unitOf(connected, "a");
    const ax = unitOf(cut, "a");
    expect(ac.supplied).toBe(true);
    expect(ax.supplied).toBe(false);
    expect(ax.ammo).toBe(0);
    expect(ac.ammo).toBeGreaterThan(0.5);
    // 弾薬切れで士気が下がり、火力も落ちるので相手に与える損害が減る
    expect(ax.morale).toBeLessThan(ac.morale);
    expect(1 - unitOf(cut, "g").strength).toBeLessThan((1 - unitOf(connected, "g").strength) * 0.8);
  });

  it("迂回路があれば、遮断されても補給が届く", () => {
    const s = run(game([...fighters(), blocker], [usDepot()]), 3, { ...wideCtx, roads: bypassRoads });
    expect(unitOf(s, "a").supplied).toBe(true);
    expect(unitOf(s, "a").ammo).toBeGreaterThan(0.5);
  });

  it("味方も近くにいるノードは押さえられていない(通れる)", () => {
    const s = run(game([...fighters(), blocker, inf("guard", 5000, 4700)], [usDepot()]), 1);
    expect(unitOf(s, "a").supplied).toBe(true);
  });
});

describe("集積所の奪取", () => {
  it("期待挙動:敵の集積所を奪うと、その備蓄で燃料が回復する", () => {
    const s0 = game([ger("t", 10000, 5300, { branch: "armor", fuel: 0.2 })], [usDepot({ nodeId: "n10", fuelT: 100 })]);
    const r = resolveTurn(s0, [], wideCtx);
    const depot = r.state.depots[0]!;
    expect(depot.side).toBe("de");
    expect(r.events.some((e) => e.type === "depotCaptured" && e.unitId === "t")).toBe(true);
    expect(unitOf(r.state, "t").fuel).toBeCloseTo(1);
    expect(depot.fuelT).toBeCloseTo(100 - 24);
  });

  it("味方が守っている集積所は奪われない", () => {
    const s0 = game([ger("t", 10000, 5300, { branch: "armor" }), inf("guard", 10000, 4800)], [usDepot({ nodeId: "n10" })]);
    expect(resolveTurn(s0, [], wideCtx).state.depots[0]!.side).toBe("us");
  });

  it("霧:陣営のビューには自軍の集積所だけが入る", () => {
    const s0 = game([inf("a", 1000, 1000), ger("g", 9000, 9000)], [usDepot(), { id: "de-dump", side: "de", nodeId: "n10", ammoT: 100, fuelT: 100 }]);
    const v = viewForSide(s0, "us");
    expect(v.depots.map((d) => d.id)).toEqual(["us-dump"]);
  });
});
