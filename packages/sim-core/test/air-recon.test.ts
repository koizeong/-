import { describe, expect, it } from "vitest";
import { createUnit, resolveTurn, startScenario, viewForSide, type HqCommand, type NewUnit, type SimContext } from "../src/index.js";
import { ger, inf, rules, wideCtx } from "./helpers.js";

/** us だけが航空偵察を持つ(制空権は us が握っている) */
const ctxWith = (weather = "clear", detectChance?: number): SimContext => ({
  ...wideCtx,
  rules: detectChance === undefined ? wideCtx.rules : { ...wideCtx.rules, air: { ...wideCtx.rules.air, recon: { ...wideCtx.rules.air.recon, detectChance } } },
  scenario: { ...wideCtx.scenario, weather: { ...wideCtx.scenario.weather, initial: weather }, air: { us: { fighters: { groups: 1, replacementPerDay: 0 } } } },
});
const start = (ctx: SimContext, ...units: NewUnit[]) => startScenario(units.map(createUnit), 1, ctx);
const recon = (target = { x: 8000, y: 8000 }): HqCommand => ({ side: "us", type: "airRecon", target });

describe("航空偵察", () => {
  it("次のターンに撮影し、見つけた敵は兵種まで、撮影した時刻の写真(ゴースト)として残る", () => {
    const ctx = ctxWith("clear", 1);
    // 平地(隠蔽1)の遠い敵:地上からは見えない
    const s = start(ctx, inf("a", 1000, 1000), ger("g", 8000, 8000, { formation: "deployed" }));
    const r1 = resolveTurn(s, [], ctx, [recon()]);
    expect(viewForSide(r1.state, "us").contacts).toEqual([]);
    const r2 = resolveTurn(r1.state, [], ctx);
    const v = viewForSide(r2.state, "us");
    expect(v.contacts).toHaveLength(1);
    const c = v.contacts[0]!;
    expect(c.currentLevel).toBe(0); // 今は見えていない(写真)
    expect(c.bestLevel).toBe(2);
    expect(c.branch).toBe("infantry");
    expect(c.estimatedStrength).toBeUndefined(); // 規模は分からない
    expect(c.lastSeenTime).toBeGreaterThan(r1.state.time);
    expect(r2.hqEvents.find((e) => e.type === "airRecon")).toMatchObject({ found: 1 });
    expect(r2.state.airSortiesLeft.us!.fighter).toBe(1); // 偵察は戦闘機の枠を使う
    // 撮影は敵には伝わらない
    expect(r2.hqEvents.filter((e) => e.side === "de")).toEqual([]);
  });

  it("森の中や伏撃の部隊は写りにくい", () => {
    const found = (extra: Partial<NewUnit>, pos = { x: 8000, y: 8000 }) => {
      let n = 0;
      const ctx = ctxWith();
      for (let seed = 1; seed <= 40; seed++) {
        const s = startScenario([createUnit(inf("a", 1000, 1000)), createUnit(ger("g", pos.x, pos.y, { formation: "deployed", ...extra }))], seed, ctx);
        const r = resolveTurn(resolveTurn(s, [], ctx, [{ side: "us", type: "airRecon", target: pos }]).state, [], ctx);
        if (viewForSide(r.state, "us").contacts.length > 0) n++;
      }
      return n;
    };
    const open = found({});
    const forest = found({}, { x: 5500, y: 5500 }); // 5000〜6000 m 四方が森林
    const ambush = found({ stance: "ambush" });
    expect(open).toBeGreaterThan(forest);
    expect(open).toBeGreaterThan(ambush);
    expect(open / 40).toBeCloseTo(rules.air.recon.detectChance, 0);
  });

  it("悪天候なら中止され、出撃回数は減らない。範囲の外の敵は写らない", () => {
    const fog = ctxWith("fog", 1);
    const s = start(fog, inf("a", 1000, 1000), ger("g", 8000, 8000));
    const r2 = resolveTurn(resolveTurn(s, [], fog, [recon()]).state, [], fog);
    expect(r2.hqEvents.some((e) => e.type === "airAborted" && e.kind === "airRecon")).toBe(true);
    expect(r2.state.airSortiesLeft.us!.fighter).toBe(2);
    const clear = ctxWith("clear", 1);
    const far = start(clear, inf("a", 1000, 1000), ger("g", 8000, 8000));
    const r = resolveTurn(resolveTurn(far, [], clear, [recon({ x: 8000, y: 8000 - rules.air.recon.radiusM - 500 })]).state, [], clear);
    expect(viewForSide(r.state, "us").contacts).toEqual([]);
  });
});
