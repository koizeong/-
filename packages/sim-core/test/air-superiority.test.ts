import { describe, expect, it } from "vitest";
import { createUnit, interceptChance, airEffect, resolveTurn, startScenario, updateAirControl, viewForSide, type HqCommand, type NewUnit, type SimContext } from "../src/index.js";
import { ger, inf, rules, unitOf, wideCtx } from "./helpers.js";

const S = rules.air.superiority;
const strikeCfg = { groups: 4.5, replacementPerDay: 0, weapon: "ground_attack_aircraft", count: 12, strikeMinutes: 10 };
const SORTIES = 9; // 4.5編隊 × 1日2回
/** 両陣営に航空戦力がある晴天の文脈。initial で開始時の制空権の重みを変える */
const ctxWith = (usControl = 1, deControl = 1, weather = "clear"): SimContext => ({
  ...wideCtx,
  scenario: {
    ...wideCtx.scenario,
    weather: { ...wideCtx.scenario.weather, initial: weather },
    air: {
      us: { strike: strikeCfg, fighters: { groups: 4.5, replacementPerDay: 0 }, baseControl: usControl },
      de: { strike: strikeCfg, fighters: { groups: 4.5, replacementPerDay: 0 }, baseControl: deControl },
    },
  },
});
const start = (ctx: SimContext, ...units: NewUnit[]) => startScenario(units.map(createUnit), 1, ctx);
/** 中央の空域(3×3 の真ん中 "1,1")への制空任務 */
const MID = { x: 5000, y: 5000 };
const fighters = (side: string, n: number, at = MID): HqCommand[] => Array.from({ length: n }, () => ({ side, type: "airSuperiority", target: at }));

describe("制空権", () => {
  it("開始時の制空権の割合は、陣営どうしの重みの比(合計1)", () => {
    const s = start(ctxWith(3, 1), inf("a", 1000, 1000));
    for (const shares of Object.values(s.airControl)) {
      expect(shares.us).toBeCloseTo(0.75);
      expect(shares.de).toBeCloseTo(0.25);
    }
    expect(Object.keys(s.airControl)).toHaveLength(9); // 3×3 の空域
  });

  it("制空任務を出した空域だけ、次のターンに割合が自陣営へ動く(合計1を保つ。ほかの空域は変わらない)", () => {
    const ctx = ctxWith();
    const s = start(ctx, inf("a", 1000, 1000), ger("g", 9000, 9000));
    const r1 = resolveTurn(s, [], ctx, [...fighters("us", 2)]);
    expect(r1.state.airControl["1,1"]!.us).toBeCloseTo(0.5); // 要請したターンにはまだ動かない
    const r2 = resolveTurn(r1.state, [], ctx);
    const mid = r2.state.airControl["1,1"]!;
    expect(mid.us).toBeCloseTo(updateAirControl({ "1,1": { us: 0.5, de: 0.5 } }, { "1,1": { us: 2 } }, ctx)["1,1"]!.us!);
    expect(mid.us! + mid.de!).toBeCloseTo(1);
    expect(mid.us).toBeGreaterThan(0.5);
    expect(r2.state.airControl["0,0"]!.us).toBeCloseTo(0.5);
    expect(r2.hqEvents.some((e) => e.type === "airSuperiority" && e.side === "us" && e.sector === "1,1")).toBe(true);
    expect(r2.state.airSortiesLeft.us!.fighter).toBe(SORTIES - 2);
    // 両陣営に公開(自陣営のビューに、空域ごとの自陣営の割合が出る。真ん中は4番目)
    expect(viewForSide(r2.state, "de").airControl[4]).toBeCloseTo(mid.de!);
  });

  it("悪天候の間は制空任務が中止され、割合も出撃回数も変わらない", () => {
    const ctx = ctxWith(1, 1, "fog");
    const r1 = resolveTurn(start(ctx, inf("a", 1000, 1000)), [], ctx, fighters("us", 2));
    const r2 = resolveTurn(r1.state, [], ctx);
    expect(r2.state.airControl["1,1"]!.us).toBeCloseTo(0.5);
    expect(r2.state.airSortiesLeft.us!.fighter).toBe(SORTIES);
  });

  it("制空権が低いほど航空任務は迎撃されやすく、届いても効果が落ちる", () => {
    expect(interceptChance(1, wideCtx)).toBe(0);
    expect(interceptChance(0, wideCtx)).toBeCloseTo(S.interceptMax);
    expect(airEffect(1, wideCtx)).toBe(1);
    expect(airEffect(0, wideCtx)).toBeCloseTo(S.effectAtNoControl);
    // 制空権がほぼない側の空襲は、何回か迎撃される
    const ctx = ctxWith(0.01, 0.99);
    let intercepted = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = startScenario([createUnit(inf("a", 1000, 1000)), createUnit(ger("g", 6000, 6000))], seed, ctx);
      const r = resolveTurn(resolveTurn(s, [], ctx, [{ side: "us", type: "airStrike", target: { x: 6000, y: 6000 } }]).state, [], ctx);
      if (r.hqEvents.some((e) => e.type === "airIntercepted")) intercepted++;
    }
    expect(intercepted).toBeGreaterThan(5);
    expect(intercepted).toBeLessThan(20);
  });
});

describe("近接航空支援", () => {
  const cs = rules.air.closeSupport;
  const supportCase = (ctx: SimContext, extra: NewUnit[] = []) => {
    // 味方 a の 1km 東に見えている敵 g、遠く(5km)に見えている敵 far
    const s = start(ctx, inf("a", 2000, 2000, { formation: "deployed", facing: 90 }), ger("g", 3000, 2000, { formation: "deployed", facing: 270 }), ...extra);
    const seen = resolveTurn(s, [], ctx).state; // 見えている状態にする
    return resolveTurn(seen, [], ctx, [{ side: "us", type: "closeAirSupport", unitId: "a" }]);
  };

  it("要請したターンのうちに、遅れて飛来し、支援する味方の近くの見えている敵を叩く", () => {
    const ctx = ctxWith(1, 0.0001);
    const r = supportCase(ctx);
    const arrived = r.hqEvents.find((e) => e.type === "closeAirSupport");
    expect(arrived).toBeDefined();
    expect(arrived!.t - (r.state.time - ctx.turnSeconds)).toBeCloseTo((cs.delayMinutes + 1) * 60);
    expect(r.state.airSortiesLeft.us!.attack).toBe(SORTIES - 1);
    // 飛来の前後で、g への損害が増える(同じ状況で要請しなかった場合と比べる)
    const s = start(ctx, inf("a", 2000, 2000, { formation: "deployed", facing: 90 }), ger("g", 3000, 2000, { formation: "deployed", facing: 270 }));
    const without = resolveTurn(resolveTurn(s, [], ctx).state, [], ctx);
    expect(unitOf(r.state, "g").strength).toBeLessThan(unitOf(without.state, "g").strength);
    // 味方は撃たない
    expect(unitOf(r.state, "a").strength).toBeCloseTo(unitOf(without.state, "a").strength);
  });

  it("悪天候なら中止され、出撃回数は減らない", () => {
    const ctx = ctxWith(1, 0.0001, "fog");
    const r = supportCase(ctx);
    expect(r.hqEvents.some((e) => e.type === "airAborted" && e.kind === "closeAirSupport")).toBe(true);
    expect(r.state.airSortiesLeft.us!.attack).toBe(SORTIES);
  });
});
