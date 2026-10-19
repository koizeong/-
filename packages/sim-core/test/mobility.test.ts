import { describe, expect, it } from "vitest";
import {
  parseRoadNetwork,
  parseTerrainMap,
  planRoute,
  resolveTurn,
  RoadNetwork,
  TerrainMap,
  type SimContext,
} from "../src/index.js";
import { inf, state, unitOf, unwrap, wideCtx } from "./helpers.js";

/** 10km四方の平地に、x=5000〜5250 の南北の帯(川 or 大河)を通す。橋は y=5125 */
function riverCtx(kind: "river" | "large_river", bridge: boolean): SimContext {
  const rows = Array.from({ length: 40 }, () => Array.from({ length: 40 }, (_, c) => (c === 20 ? "~" : ".")).join(""));
  const roads = bridge
    ? new RoadNetwork(unwrap(parseRoadNetwork({ nodes: { w: { x: 4875, y: 5125 }, e: { x: 5375, y: 5125 } }, edges: [{ from: "w", to: "e", capacityTPerHour: 100 }] })))
    : RoadNetwork.empty();
  return {
    ...wideCtx,
    terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", "~": kind }, rows }))),
    roads,
  };
}

describe("川(渡河できる)", () => {
  it("徒歩も車両も渡れるが、遅い(車両はもっと遅い)", () => {
    const ctx = riverCtx("river", false);
    const cross = (branch: string) => {
      const r = resolveTurn(state(inf("a", 4900, 2000, { branch })), [{ unitId: "a", waypoints: [{ x: 6500, y: 2000 }], moveMode: "march" }], ctx);
      return unitOf(r.state, "a").pos.x - 4900;
    };
    const plain = (branch: string) => {
      const r = resolveTurn(state(inf("a", 1000, 2000, { branch })), [{ unitId: "a", waypoints: [{ x: 2600, y: 2000 }], moveMode: "march" }], wideCtx);
      return unitOf(r.state, "a").pos.x - 1000;
    };
    // 歩兵は 1600m を平地なら1ターンで進みきるが、幅250mの川を挟むと届かない。川は越えている
    expect(plain("infantry")).toBeCloseTo(1600);
    expect(cross("infantry")).toBeLessThan(1600);
    expect(cross("infantry")).toBeGreaterThan(350);
    // 機甲も渡れる
    expect(cross("armor")).toBeGreaterThan(100);
  });
});

describe("大河・海(渡河できない)", () => {
  it("橋がなければ、向こう岸への命令は「到達できない地点です」として弾く(指揮ポイントも使わない)", () => {
    const ctx: SimContext = { ...riverCtx("large_river", false), scenario: { ...wideCtx.scenario, commandPoints: { us: 1 } } };
    const r = resolveTurn(
      state(inf("a", 4000, 2000), inf("b", 3000, 2000)),
      [
        { unitId: "a", waypoints: [{ x: 6000, y: 2000 }] },
        { unitId: "b", waypoints: [{ x: 3000, y: 3000 }] },
      ],
      ctx,
    );
    expect(r.rejectedOrders).toEqual([{ unitId: "a", reason: "到達できない地点です" }]);
    expect(unitOf(r.state, "b").pos).toEqual({ x: 3000, y: 3000 });
  });

  it("川の中そのものへの命令も届かない", () => {
    expect(planRoute({ x: 4000, y: 2000 }, [{ x: 5125, y: 2000 }], "march", riverCtx("large_river", true))).toBeNull();
  });

  it("橋があれば、行軍で橋を通って渡る。戦闘移動(道路を使わない)では渡れない", () => {
    const ctx = riverCtx("large_river", true);
    const march = planRoute({ x: 4000, y: 2000 }, [{ x: 6000, y: 2000 }], "march", ctx, "vehicle");
    expect(march).not.toBeNull();
    expect(march!.some((p) => p.onRoad)).toBe(true);
    // 経路は橋(y=5125)を通る
    expect(march!.some((p) => Math.abs(p.y - 5125) < 1)).toBe(true);
    expect(planRoute({ x: 4000, y: 2000 }, [{ x: 6000, y: 2000 }], "combat", ctx, "vehicle")).toBeNull();
  });

  it("実際に動かすと、橋を渡って向こう岸に着き、川のセルには入らない", () => {
    const ctx = riverCtx("large_river", true);
    let s = state(inf("t", 4000, 4500, { branch: "armor" }));
    s = resolveTurn(s, [{ unitId: "t", waypoints: [{ x: 6500, y: 4500 }] }], ctx).state;
    for (let i = 0; i < 3 && unitOf(s, "t").route.length > 0; i++) s = resolveTurn(s, [], ctx).state;
    expect(unitOf(s, "t").pos).toEqual({ x: 6500, y: 4500 });
  });

  it("条件付き命令の行き先が届かなければ、その場にとどまる", () => {
    const ctx = riverCtx("large_river", false);
    const s = state(inf("a", 4000, 2000));
    s.units[0]!.strength = 0.3;
    const r = resolveTurn(s, [{ unitId: "a", conditional: { when: { type: "strengthBelow", threshold: 0.5 }, then: { waypoints: [{ x: 7000, y: 2000 }] } } }], ctx);
    expect(r.events.some((e) => e.type === "conditionalTriggered")).toBe(true);
    expect(unitOf(r.state, "a").pos).toEqual({ x: 4000, y: 2000 });
  });
});

describe("斜めの継ぎ目", () => {
  it("期待挙動:斜めに並んだ幅1セルの大河(運河)は、角のすき間をすり抜けて渡れない", () => {
    // 左下から右上へ、斜めに1セルずつ並んだ大河
    const rows = Array.from({ length: 20 }, (_, r) => Array.from({ length: 20 }, (_, c) => (c === 19 - r ? "~" : ".")).join(""));
    const ctx: SimContext = {
      ...wideCtx,
      terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", "~": "large_river" }, rows }))),
      roads: RoadNetwork.empty(),
    };
    expect(planRoute({ x: 500, y: 500 }, [{ x: 4500, y: 4500 }], "combat", ctx)).toBeNull();
  });
});
