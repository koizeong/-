import { describe, expect, it } from "vitest";
import { offRoadCost, planRoute, resolveTurn, type RoutePoint } from "../src/index.js";
import { branches, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

/** 経路の所要時間(倍率1換算の距離) */
function routeCost(from: { x: number; y: number }, route: RoutePoint[]): number {
  let cost = 0;
  let cur = from;
  for (const p of route) {
    cost += p.onRoad ? Math.hypot(p.x - cur.x, p.y - cur.y) / rules.roadSpeedMultiplier : offRoadCost(cur, p, wideCtx);
    cur = p;
  }
  return cost;
}

describe("経路探索", () => {
  it("地形が一様なら、目的地へ一直線", () => {
    expect(planRoute({ x: 1000, y: 1000 }, [{ x: 3000, y: 2500 }], "combat", wideCtx)).toEqual([{ x: 3000, y: 2500 }]);
  });

  it("遅い地形(森林)は、迂回した方が早ければ迂回する", () => {
    // 森林は 5000〜6000m 四方。その西から東へ横切る
    const from = { x: 4500, y: 5500 };
    const to = { x: 6500, y: 5500 };
    const route = planRoute(from, [to], "combat", wideCtx);
    expect(route.length).toBeGreaterThan(1);
    expect(route.at(-1)).toEqual(to);
    expect(routeCost(from, route)).toBeLessThan(offRoadCost(from, to, wideCtx));
  });

  it("行軍は道路が早ければ道路を使い、戦闘移動は道路を使わない", () => {
    // 幹線道路は y=5000。500m 離れた線上を東西に移動する
    const from = { x: 1000, y: 4500 };
    const to = { x: 9000, y: 4500 };
    const march = planRoute(from, [to], "march", wideCtx);
    const combat = planRoute(from, [to], "combat", wideCtx);
    expect(march.some((p) => p.onRoad)).toBe(true);
    expect(routeCost(from, march)).toBeLessThan(offRoadCost(from, to, wideCtx));
    expect(combat).toEqual([to]);
  });

  it("道路が遠回りなら、行軍でも使わない", () => {
    // 道路から 2km 離れている。道路へ寄るより直進が早い
    expect(planRoute({ x: 1000, y: 3000 }, [{ x: 9000, y: 3000 }], "march", wideCtx)).toEqual([{ x: 9000, y: 3000 }]);
  });

  it("経由点を順に通る", () => {
    const w1 = { x: 2000, y: 2000 };
    const w2 = { x: 2000, y: 3000 };
    const route = planRoute({ x: 1000, y: 1000 }, [w1, w2], "combat", wideCtx);
    expect(route).toEqual([w1, w2]);
  });

  it("行軍で道路を進むと、道路の速度で動く", () => {
    const r = resolveTurn(state(inf("a", 1000, 5000)), [{ unitId: "a", waypoints: [{ x: 9000, y: 5000 }] }], wideCtx);
    const perTurn = branches.branches.infantry!.marchSpeedMpm * rules.roadSpeedMultiplier * 30;
    expect(unitOf(r.state, "a").pos.x).toBeCloseTo(1000 + perTurn, 0);
    expect(unitOf(r.state, "a").pos.y).toBeCloseTo(5000);
  });

  it("同じ入力からは同じ経路になる", () => {
    const a = planRoute({ x: 4500, y: 5500 }, [{ x: 6500, y: 5500 }], "combat", wideCtx);
    const b = planRoute({ x: 4500, y: 5500 }, [{ x: 6500, y: 5500 }], "combat", wideCtx);
    expect(a).toEqual(b);
  });
});
