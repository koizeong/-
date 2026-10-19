import { describe, expect, it } from "vitest";
import { advanceGround, advanceWeather, planRoute, Rng, resolveTurn, type SimContext } from "../src/index.js";
import { inf, state, unitOf, wideCtx, withoutFatigue } from "./helpers.js";

const flat = withoutFatigue(wideCtx);

describe("地面の状態(ぬかるみ・積雪)", () => {
  it("雨が続くとぬかるみがたまり、晴れても少しずつしか乾かない", () => {
    let g = { mud: 0, snow: 0 };
    for (let h = 0; h < 10; h++) g = advanceGround(g, "rain", 1, flat);
    expect(g.mud).toBeCloseTo(10 * flat.rules.ground.weather["rain"]!.mudPerHour);
    const wet = g.mud;
    g = advanceGround(g, "clear", 6, flat);
    expect(g.mud).toBeGreaterThan(0);
    expect(g.mud).toBeLessThan(wet);
    // 雪は積雪をためる
    expect(advanceGround({ mud: 0, snow: 0 }, "snow", 5, flat).snow).toBeGreaterThan(0);
    // 霧(書かれていない天候)は変えない
    expect(advanceGround({ mud: 0.3, snow: 0.2 }, "fog", 5, flat)).toEqual({ mud: 0.3, snow: 0.2 });
  });

  it("ターンを進めると、その天候の分だけ地面の状態が変わる", () => {
    const s = state(inf("a", 1000, 1000));
    s.weather = { current: "rain", since: 0 };
    const r = resolveTurn(s, [], flat);
    expect(r.state.ground.mud).toBeCloseTo(flat.rules.ground.weather["rain"]!.mudPerHour * (flat.turnSeconds / 3600));
  });

  it("期待挙動:ぬかるみでは道路以外の車両がいちばん遅くなり、道路の行軍はあまり落ちない", () => {
    const go = (mud: number, branch: string, onRoad: boolean) => {
      const s = state(inf("a", 1000, onRoad ? 5000 : 2000, { branch, formation: "column", moveMode: "march" }));
      s.ground = { mud, snow: 0 };
      const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: 9000, y: onRoad ? 5000 : 2000 }] }], flat);
      return unitOf(r.state, "a").pos.x - 1000;
    };
    const ratio = (branch: string, onRoad: boolean) => go(1, branch, onRoad) / go(0, branch, onRoad);
    expect(ratio("armor", false)).toBeCloseTo(1 - flat.rules.ground.mud.vehicle, 1);
    expect(ratio("infantry", false)).toBeCloseTo(1 - flat.rules.ground.mud.foot, 1);
    expect(ratio("armor", true)).toBeGreaterThan(ratio("armor", false));
  });

  it("期待挙動:ぬかるむと、車両は遠回りでも道路を選ぶようになる", () => {
    const route = (mud: number) => planRoute({ x: 1000, y: 3500 }, [{ x: 9000, y: 3500 }], "march", { ...flat, ground: { mud, snow: 0 } }, "vehicle")!;
    expect(route(0).some((p) => p.onRoad)).toBe(false);
    expect(route(1).some((p) => p.onRoad)).toBe(true);
  });
});

describe("雨・雪とシナリオの天候の並び", () => {
  const ctxWith = (weather: Partial<SimContext["scenario"]["weather"]>): SimContext => ({
    ...flat,
    scenario: { ...flat.scenario, weather: { ...flat.scenario.weather, changeChancePerHour: 1, minHoursBetweenChanges: 0, improveChance: 0, ...weather } },
  });
  it("ルールパックの並びには雨・雪は入らない(既存のシナリオの天候の動きは変わらない)", () => {
    expect(flat.rules.weather.order).toEqual(["fog", "overcast", "clear"]);
    const w = { current: "clear", since: 0 };
    advanceWeather(w, 3600, 1, ctxWith({}), Rng.fromSeed(1));
    expect(w.current).toBe("overcast");
  });
  it("シナリオが自分の並びを書けば、雨へ変わる。並びにない天候からは変わらない", () => {
    const w = { current: "overcast", since: 0 };
    advanceWeather(w, 3600, 1, ctxWith({ order: ["rain", "overcast", "clear"] }), Rng.fromSeed(1));
    expect(w.current).toBe("rain");
    const snow = { current: "snow", since: 0 };
    expect(advanceWeather(snow, 3600, 1, ctxWith({}), Rng.fromSeed(1))).toBe(false);
  });
});
