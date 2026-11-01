import { describe, expect, it } from "vitest";
import { isGameOver, parseScenarioRules, resolveTurn, type HqCommand, type ScenarioRules, type SimContext } from "../src/index.js";
import { ger, inf, state, unitOf, unwrap, wideCtx } from "./helpers.js";

/** 試験用のシナリオ(史実ではない)。中心(5000,5000)を us が持つ。規定は20ターン */
const rules = (extra: Record<string, unknown> = {}): ScenarioRules =>
  unwrap(
    parseScenarioRules({
      maxTurns: 20,
      objectives: [{ id: "center", name: "中心", x: 5000, y: 5000, radiusM: 500, weight: 1, initialHolder: "us" }],
      victory: { de: { decisive: { required: ["center"] }, limited: { minWeight: 1 } }, us: { decisive: { minWeight: 99 }, limited: { required: ["center"] } } },
      ...extra,
    }),
  );

describe("全滅で戦闘を終える", () => {
  it("片方の部隊が盤上からいなくなったら、増援が予定されていても、残った側の決定的勝利で終わる", () => {
    const ctx: SimContext = {
      ...wideCtx,
      scenario: rules({ reinforcements: [{ turn: 10, id: "de-late", side: "de", toe: "infantry_regiment", x: 9000, y: 5000, facing: 270 }] }),
    };
    const s = state(inf("a", 4000, 5000, { formation: "deployed", facing: 90 }), inf("b", 4000, 5600, { formation: "deployed", facing: 90 }), ger("g", 4400, 5000, { formation: "deployed", facing: 270 }));
    unitOf(s, "g").strength = 0.0005;
    const r = resolveTurn(s, [], ctx);
    expect(r.state.units.some((u) => u.side === "de")).toBe(false);
    expect(r.result).toMatchObject({ winner: "us", level: "decisive", reason: "annihilation" });
    expect(isGameOver(r.state, ctx)).toBe(true);
  });

  it("両軍が残っていれば、規定ターンまで終わらない", () => {
    const ctx: SimContext = { ...wideCtx, scenario: rules() };
    const r = resolveTurn(state(inf("a", 2000, 5000), ger("g", 8000, 5000)), [], ctx);
    expect(r.result).toBeNull();
    expect(isGameOver(r.state, ctx)).toBe(false);
  });
});

describe("脱出路と撤退", () => {
  const ctxWith = (fromTurn: number): SimContext => ({ ...wideCtx, scenario: rules({ escapeRoutes: [{ side: "us", x: 1000, y: 5000, fromTurn }] }) });
  const retreat = (unitId: string): HqCommand => ({ side: "us", type: "retreat", unitId });

  it("脱出路にいて近くに敵がいない部隊は、戦力を保ったまま戦場を去る。撤退した陣営は負け(相手の決定的勝利)", () => {
    const ctx = ctxWith(1);
    const s = state(inf("a", 1000, 5000), inf("b", 5000, 5000), ger("g", 9000, 5000));
    const r = resolveTurn(s, [], ctx, [retreat("a")]);
    expect(r.rejectedHqCommands).toEqual([]);
    expect(r.state.units.some((u) => u.id === "a")).toBe(false);
    expect(r.state.escaped?.map((u) => u.id)).toEqual(["a"]);
    expect(r.state.escaped?.[0]?.strength).toBeGreaterThan(0.99);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "retreated")).toBe(true);
    // まだ us の部隊が残っているので続く。最後の部隊も撤退すると終わり、de の決定的勝利
    expect(r.result).toBeNull();
    const s2 = r.state;
    unitOf(s2, "b").pos = { x: 1000, y: 5200 };
    const r2 = resolveTurn(s2, [], ctx, [retreat("b")]);
    expect(r2.rejectedHqCommands).toEqual([]);
    expect(r2.result).toMatchObject({ winner: "de", level: "decisive", reason: "retreat" });
    expect(isGameOver(r2.state, ctx)).toBe(true);
  });

  it("規定ターンまで戦っても、撤退した陣営の負け", () => {
    const ctx: SimContext = { ...wideCtx, scenario: rules({ maxTurns: 2, escapeRoutes: [{ side: "us", x: 1000, y: 5000, fromTurn: 1 }] }) };
    let s = resolveTurn(state(inf("a", 1000, 5000), inf("b", 5000, 5000), ger("g", 9000, 5000)), [], ctx, [retreat("a")]).state;
    const r = resolveTurn(s, [], ctx);
    expect(r.result).toMatchObject({ winner: "de", level: "decisive", reason: "retreat" });
  });

  it("脱出路が開く前・脱出路の外・近くに敵がいるときは撤退できない", () => {
    const reason = (ctx: SimContext, enemyX: number, x = 1000) =>
      resolveTurn(state(inf("a", x, 5000), ger("g", enemyX, 5000)), [], ctx, [retreat("a")]).rejectedHqCommands[0]?.reason;
    expect(reason(ctxWith(5), 9000)).toContain("開いていません");
    expect(reason(ctxWith(1), 9000, 3000)).toContain("脱出路の上にいません");
    expect(reason(ctxWith(1), 2000)).toContain("近くに敵");
  });
});
