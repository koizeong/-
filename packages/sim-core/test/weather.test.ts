import { describe, expect, it } from "vitest";
import { advanceWeather, createUnit, resolveTurn, Rng, startScenario, viewForSide, type GameState, type SimContext } from "../src/index.js";
import { ger, inf, rules, wideCtx } from "./helpers.js";

const withWeather = (w: Partial<SimContext["scenario"]["weather"]>): SimContext => ({
  ...wideCtx,
  scenario: { ...wideCtx.scenario, weather: { ...wideCtx.scenario.weather, ...w } },
});
const ORDER = rules.weather.order;

/** 1日(14ターン)分の天候の移り変わり */
function day(ctx: SimContext, seed: number): string[] {
  let s: GameState = startScenario([createUnit(inf("a", 1000, 1000))], seed, ctx);
  const seq = [s.weather.current];
  for (let t = 0; t < 14; t++) {
    s = resolveTurn(s, [], ctx).state;
    seq.push(s.weather.current);
  }
  return seq;
}

describe("天候", () => {
  it("変化の確率が0なら、ずっと同じ", () => {
    expect(new Set(day(withWeather({ initial: "fog" }), 1))).toEqual(new Set(["fog"]));
  });

  it("変わるときは隣の状態へだけ(霧から一気に晴れにはならない)", () => {
    const ctx = withWeather({ initial: "overcast", changeChancePerHour: 0.9, minHoursBetweenChanges: 0 });
    for (let seed = 1; seed <= 20; seed++) {
      const seq = day(ctx, seed);
      for (let i = 1; i < seq.length; i++) {
        expect(Math.abs(ORDER.indexOf(seq[i]!) - ORDER.indexOf(seq[i - 1]!))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("一度変わったら、最短時間が過ぎるまでは変わらない", () => {
    const ctx = withWeather({ initial: "overcast", changeChancePerHour: 1, minHoursBetweenChanges: 3 });
    const seq = day(ctx, 1);
    const changes = seq.map((w, i) => (i > 0 && w !== seq[i - 1] ? i : -1)).filter((i) => i >= 0);
    expect(changes.length).toBeGreaterThan(1);
    for (let k = 1; k < changes.length; k++) expect(changes[k]! - changes[k - 1]!).toBeGreaterThanOrEqual(6); // 3時間 = 6ターン
  });

  it("現実的な設定では、1日の変化は数回まで", () => {
    const ctx = withWeather({ initial: "overcast", changeChancePerHour: 0.08, minHoursBetweenChanges: 3 });
    let total = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const seq = day(ctx, seed);
      const n = seq.filter((w, i) => i > 0 && w !== seq[i - 1]).length;
      expect(n).toBeLessThanOrEqual(3);
      total += n;
    }
    expect(total / 50).toBeLessThan(1);
    expect(total).toBeGreaterThan(0);
  });

  it("同じシードなら同じ推移になる", () => {
    const ctx = withWeather({ initial: "overcast", changeChancePerHour: 0.3, minHoursBetweenChanges: 1 });
    expect(day(ctx, 9)).toEqual(day(ctx, 9));
  });

  it("霧の日は探知距離が縮む", () => {
    const d = rules.detection.baseRangeM * 0.6;
    const seen = (initial: string) => {
      const ctx = withWeather({ initial });
      const r = resolveTurn(startScenario([createUnit(inf("a", 1000, 5000)), createUnit(ger("g", 1000 + d, 5000))], 1, ctx), [], ctx);
      return r.state.intel.us?.entries.g?.bestLevel ?? 0;
    };
    expect(seen("clear")).toBeGreaterThan(0);
    expect(seen("fog")).toBe(0);
  });

  it("天候は両陣営に公開され、変わったことは公開イベントで伝わる", () => {
    const ctx = withWeather({ initial: "overcast", changeChancePerHour: 1, minHoursBetweenChanges: 0 });
    const r = resolveTurn(startScenario([createUnit(inf("a", 1000, 1000)), createUnit(ger("g", 9000, 9000))], 1, ctx), [], ctx);
    expect(viewForSide(r.state, "de").weather).toBe(r.state.weather.current);
    expect(r.publicEvents.some((e) => e.type === "weatherChanged")).toBe(true);
  });

  it("変化の確率は1ターンの長さに応じて決まる(advanceWeather の単体)", () => {
    const ctx = withWeather({ initial: "overcast", changeChancePerHour: 0.5, minHoursBetweenChanges: 0 });
    let changed = 0;
    const rng = Rng.fromSeed(3);
    for (let i = 0; i < 2000; i++) if (advanceWeather({ current: "overcast", since: 0 }, 1800, 0.5, ctx, rng)) changed++;
    // 30分で変わる確率は 1 - 0.5^0.5 ≒ 0.29
    expect(changed / 2000).toBeCloseTo(1 - Math.sqrt(0.5), 1);
  });
});

