import { createUnit, parseRoadNetwork, parseTerrainMap, resolveTurn, RoadNetwork, startScenario, TerrainMap, viewForSide, type SimContext } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide } from "../src/index.js";
import { ger, inf, unwrap, wideCtx } from "../../sim-core/test/helpers.js";

/** 10km四方の平地に x=5000〜5250 の南北の大河。橋は y=5125 の1本 */
function riverCtx(objectives: SimContext["scenario"]["objectives"] = []): SimContext {
  const rows = Array.from({ length: 40 }, () => Array.from({ length: 40 }, (_, c) => (c === 20 ? "~" : ".")).join(""));
  return {
    ...wideCtx,
    terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", "~": "large_river" }, rows }))),
    roads: new RoadNetwork(unwrap(parseRoadNetwork({ nodes: { w: { x: 4500, y: 5125 }, e: { x: 5750, y: 5125 } }, edges: [{ from: "w", to: "e", capacityTPerHour: 100 }] }))),
    scenario: { ...wideCtx.scenario, objectives },
  };
}
const ai = { caution: 0.5, noise: 0 };

describe("AIの橋の扱い", () => {
  it("守る側は、向こう岸から敵が近づき、向こう岸に味方も取りに行く目標もなければ橋を落とす", () => {
    const ctx = riverCtx();
    let s = startScenario([createUnit(inf("g", 4400, 5125, { formation: "deployed" })), createUnit(ger("e", 7000, 5125))], 1, ctx);
    s = resolveTurn(s, [], ctx).state;
    const d = decide(viewForSide(s, "us"), ctx, ai);
    expect(d.hqCommands).toContainEqual({ side: "us", type: "demolishBridge", bridgeId: "w~e" });
  });

  it("向こう岸に取りに行く目標があれば、橋は落とさない(自分も渡る必要がある)", () => {
    const ctx = riverCtx([{ id: "t", name: "町", x: 8000, y: 5125, radiusM: 500, weight: 1, initialHolder: "de" }]);
    let s = startScenario([createUnit(inf("g", 4400, 5125, { formation: "deployed" })), createUnit(ger("e", 7000, 5125))], 1, ctx);
    s = resolveTurn(s, [], ctx).state;
    const d = decide(viewForSide(s, "us"), ctx, ai);
    expect(d.hqCommands.some((c) => c.type === "demolishBridge")).toBe(false);
  });

  it("壊れた橋のそばに敵がいなければ修理を頼む", () => {
    const ctx: SimContext = { ...riverCtx(), scenario: { ...riverCtx().scenario, destroyedBridges: ["w~e"] } };
    const s = startScenario([createUnit(inf("g", 4400, 5125))], 1, ctx);
    expect(decide(viewForSide(s, "us"), ctx, ai).hqCommands).toContainEqual({ side: "us", type: "repairBridge", bridgeId: "w~e" });
  });
});
