import { describe, expect, it } from "vitest";
import {
  createUnit,
  estimateEnemyLoss,
  evaluateVictory,
  resolveTurn,
  startScenario,
  toeHitPoints,
  viewForSide,
  type SimContext,
} from "../src/index.js";
import { ger, inf, state, toes, unitOf, wideCtx } from "./helpers.js";

const HP = toeHitPoints(toes.toes.infantry_regiment!);

describe("損耗率", () => {
  it("生き残った部隊の減った分も、壊滅した部隊の全部も数える", () => {
    const s0 = state(inf("a", 1000, 2000), inf("b", 1000, 5000), ger("g", 9000, 9000));
    unitOf(s0, "a").strength = 0.5;
    unitOf(s0, "b").strength = 0; // ターン終了時に除去される
    const before = { us: 2 * HP, de: HP };
    const r = resolveTurn({ ...s0, forceTotals: before }, [], wideCtx);
    expect(r.state.units.some((u) => u.id === "b")).toBe(false);
    // 残りは a の半分だけ。損耗率は (2 − 0.5) / 2
    expect(r.state.ownLoss.us).toBeCloseTo(1 - (0.5 * HP) / (2 * HP));
    expect(r.state.ownLoss.de).toBeCloseTo(0);
  });

  it("到着した増援は総戦力に加わる(増援が来ただけでは損耗率は変わらない)", () => {
    const ctx: SimContext = {
      ...wideCtx,
      scenario: { ...wideCtx.scenario, reinforcements: [{ turn: 2, id: "relief", side: "us", toe: "infantry_regiment", x: 500, y: 500, facing: 90 }] },
    };
    const s0 = startScenario([createUnit(inf("a", 1000, 2000))], 1, ctx);
    unitOf(s0, "a").strength = 0.5;
    s0.forceTotals = { us: HP };
    const r = resolveTurn(s0, [], ctx);
    expect(r.state.units.some((u) => u.id === "relief")).toBe(true);
    expect(r.state.forceTotals.us).toBeCloseTo(2 * HP);
    expect(r.state.ownLoss.us).toBeCloseTo(1 - (0.5 * HP + HP) / (2 * HP));
  });

  it("勝利条件の敵の損耗率:しきい値に届いた側が勝つ", () => {
    const ctx: SimContext = {
      ...wideCtx,
      scenario: {
        ...wideCtx.scenario,
        victory: {
          us: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.5 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.25 }, urgency: 0 },
          de: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.5 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.25 }, urgency: 0 },
        },
      },
    };
    const r = evaluateVictory({}, ctx, { us: 0.3, de: 0.1 });
    expect(r.winner).toBe("us");
    expect(r.level).toBe("limited");
    expect(evaluateVictory({}, ctx, { us: 0.6, de: 0.3 }).level).toBe("decisive");
    expect(evaluateVictory({}, ctx, { us: 0.1, de: 0.1 }).level).toBe("draw");
  });

  it("勝利条件の自軍の損耗率(消耗抑制):損耗をしきい値以下に抑えた側が勝つ", () => {
    const ctx: SimContext = {
      ...wideCtx,
      scenario: {
        ...wideCtx.scenario,
        victory: {
          de: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.15 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.05 }, urgency: 0 },
          us: { decisive: { required: [], minWeight: 0, maxOwnLoss: 0.02 }, limited: { required: [], minWeight: 0, maxOwnLoss: 0.05 }, urgency: 0 },
        },
      },
    };
    // 西軍(us)の損耗率 = 東軍(de)から見た敵の損耗率
    const at = (usLoss: number) => evaluateVictory({}, ctx, { de: usLoss, us: 0 }, { us: usLoss, de: 0 });
    expect(at(0.01)).toMatchObject({ winner: "us", level: "decisive" });
    expect(at(0.04)).toMatchObject({ winner: "us", level: "limited" });
    expect(at(0.1)).toMatchObject({ winner: "de", level: "limited" });
    expect(at(0.2)).toMatchObject({ winner: "de", level: "decisive" });
  });

  it("霧:自陣営の損耗率は正確に見える。敵の損耗率は、見つけた敵の撃破と推定戦力から見積もる", () => {
    const s0 = state(inf("a", 1000, 2000), ger("g", 9000, 9000));
    unitOf(s0, "a").strength = 0.8;
    const r = resolveTurn({ ...s0, forceTotals: { us: HP, de: HP } }, [], wideCtx);
    const v = viewForSide(r.state, "us");
    expect(v.ownLoss).toBeCloseTo(0.2);
    expect(JSON.stringify(v)).not.toContain('"de":');
    expect(estimateEnemyLoss([])).toBe(0);
    expect(
      estimateEnemyLoss([
        { contactId: "c1", currentLevel: 3, bestLevel: 3, pos: { x: 0, y: 0 }, lastSeenTime: 0, estimatedStrength: 0.6 },
        { contactId: "c2", currentLevel: 0, bestLevel: 2, pos: { x: 0, y: 0 }, lastSeenTime: 0, destroyed: true },
        { contactId: "c3", currentLevel: 1, bestLevel: 1, pos: { x: 0, y: 0 }, lastSeenTime: 0 },
      ]),
    ).toBeCloseTo((0.4 + 1 + 0) / 3);
  });
});
