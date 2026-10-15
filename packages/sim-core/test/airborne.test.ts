import { describe, expect, it } from "vitest";
import { createUnit, resolveTurn, startScenario, viewForSide, type HqCommand, type NewUnit, type SimContext } from "../src/index.js";
import { ger, inf, rules, unitOf, wideCtx } from "./helpers.js";

const AB = rules.air.airborne;
/** us に空挺連隊が1個(2ターン目から降下可)。de の航空戦力の重みで制空権を変える */
const ctxWith = (weather = "clear", deControl = 0): SimContext => ({
  ...wideCtx,
  scenario: {
    ...wideCtx.scenario,
    weather: { ...wideCtx.scenario.weather, initial: weather },
    air: { us: { initialControl: 1 }, ...(deControl > 0 ? { de: { initialControl: deControl } } : {}) },
    airborne: [{ id: "abn", side: "us", toe: "airborne_regiment", availableFromTurn: 2 }],
  },
});
const start = (ctx: SimContext, ...units: NewUnit[]) => startScenario(units.map(createUnit), 1, ctx);
const drop = (target = { x: 5000, y: 5000 }): HqCommand => ({ side: "us", type: "airborneDrop", unitId: "abn", target });

describe("空挺降下", () => {
  it("要請した次のターンの始めに、降下地点のまわりに散らばって、展開途中の状態で降りる(少し戦力を失う)", () => {
    const ctx = ctxWith();
    const s = start(ctx, inf("a", 1000, 1000), ger("g", 9500, 9500));
    expect(viewForSide(s, "us").airborneReady).toEqual(["abn"]);
    const r1 = resolveTurn(s, [], ctx, [drop()]);
    expect(r1.rejectedHqCommands).toEqual([]);
    expect(r1.state.units.some((u) => u.id === "abn")).toBe(false);
    expect(viewForSide(r1.state, "us").airborneReady).toEqual([]);
    const r2 = resolveTurn(r1.state, [], ctx);
    const landed = r2.hqEvents.find((e) => e.type === "airborneLanded")!;
    expect(landed).toBeDefined();
    expect(Math.hypot(landed.at.x - 5000, landed.at.y - 5000)).toBeLessThanOrEqual(AB.scatterM + 1e-6);
    expect(landed.strengthLoss).toBeGreaterThanOrEqual(AB.lossMin - 1e-9);
    expect(landed.strengthLoss).toBeLessThanOrEqual(AB.lossMax + 1e-9);
    // 降りた最初のターンの初めは展開途中(1ターンで展開を終える)
    expect(r2.tracks.abn![0]).toMatchObject({ x: landed.at.x, y: landed.at.y });
    expect(unitOf(r2.state, "abn").formation).toBe("deployed");
    expect(r2.events.some((e) => e.unitId === "abn" && e.type === "formationChanged" && e.to === "deployed")).toBe(true);
    // 敵には、ほかの部隊と同じく探知で見える(降下したこと自体は伝わらない)
    expect(r2.hqEvents.filter((e) => e.side === "de")).toEqual([]);
  });

  it("近くに敵がいる地点へ降りると、さらに戦力を失う", () => {
    const ctx = ctxWith();
    const s = start(ctx, inf("a", 1000, 1000), ger("g", 5200, 5000, { formation: "deployed" }));
    const r2 = resolveTurn(resolveTurn(s, [], ctx, [drop()]).state, [], ctx);
    const landed = r2.hqEvents.find((e) => e.type === "airborneLanded")!;
    expect(landed.strengthLoss).toBeGreaterThanOrEqual(AB.lossMin + AB.enemyNearLoss - 1e-9);
  });

  it("悪天候なら中止され、待機に戻る(また要請できる)", () => {
    const ctx = ctxWith("fog");
    const s = start(ctx, inf("a", 1000, 1000));
    const r2 = resolveTurn(resolveTurn(s, [], ctx, [drop()]).state, [], ctx);
    expect(r2.hqEvents.some((e) => e.type === "airAborted" && e.kind === "airborneDrop")).toBe(true);
    expect(r2.state.units.some((u) => u.id === "abn")).toBe(false);
    expect(viewForSide(r2.state, "us").airborneReady).toEqual(["abn"]);
  });

  it("制空権がないと輸送機が迎撃されやすく、迎撃されると大きく散らばり、大きな損害を受けて降りる", () => {
    const ctx = ctxWith("clear", 999);
    let intercepted = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = startScenario([createUnit(inf("a", 1000, 1000))], seed, ctx);
      const r2 = resolveTurn(resolveTurn(s, [], ctx, [drop()]).state, [], ctx);
      const landed = r2.hqEvents.find((e) => e.type === "airborneLanded")!;
      expect(landed).toBeDefined(); // 迎撃されても中止はしない
      if (landed.intercepted) {
        intercepted++;
        expect(landed.strengthLoss).toBeGreaterThanOrEqual(AB.interceptedLoss - 1e-9);
        expect(Math.hypot(landed.at.x - 5000, landed.at.y - 5000)).toBeLessThanOrEqual(AB.interceptedScatterM + 1e-6);
      }
    }
    expect(intercepted).toBeGreaterThan(5);
  });

  it("要請できない:使えるターンより前・同じ部隊を2回・降りられない地形・マップの外", () => {
    const ctx = ctxWith();
    const early: SimContext = { ...ctx, scenario: { ...ctx.scenario, airborne: [{ ...ctx.scenario.airborne[0]!, availableFromTurn: 5 }] } };
    const s = start(early, inf("a", 1000, 1000));
    expect(resolveTurn(s, [], early, [drop()]).rejectedHqCommands[0]?.reason).toContain("5 ターン目から");
    const s2 = start(ctx, inf("a", 1000, 1000));
    expect(resolveTurn(s2, [], ctx, [drop(), drop({ x: 6000, y: 6000 })]).rejectedHqCommands).toHaveLength(1);
    expect(resolveTurn(s2, [], ctx, [drop({ x: -10, y: 5000 })]).rejectedHqCommands[0]?.reason).toContain("マップの外");
  });

  it("降りた空挺部隊は損耗率の分母(総戦力)に加わり、降下で失った分は損耗に数える", () => {
    const ctx = ctxWith();
    const s = start(ctx, inf("a", 1000, 1000), ger("g", 9500, 9500));
    const before = s.forceTotals.us!;
    const r2 = resolveTurn(resolveTurn(s, [], ctx, [drop()]).state, [], ctx);
    const hp = r2.state.forceTotals.us! - before;
    expect(hp).toBeGreaterThan(0);
    const landed = r2.hqEvents.find((e) => e.type === "airborneLanded")!;
    expect(r2.state.ownLoss.us).toBeCloseTo((landed.strengthLoss * hp) / r2.state.forceTotals.us!, 6);
  });
});

