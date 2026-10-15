import { describe, expect, it } from "vitest";
import { createUnit, replayForSide, resolveTurn, startScenario, viewForSide, type GameState, type HqCommand, type NewUnit, type SimContext } from "../src/index.js";
import { ger, inf, unitOf, wideCtx } from "./helpers.js";

const ctxWith = (initial: string): SimContext => ({
  ...wideCtx,
  scenario: {
    ...wideCtx.scenario,
    weather: { ...wideCtx.scenario.weather, initial },
    air: {
      us: {
        strike: { sortiesPerDay: 2, weapon: "ground_attack_aircraft", count: 12, strikeMinutes: 10 },
        airlift: { sortiesPerDay: 2, ammoT: 40, fuelT: 20 },
      },
    },
  },
});
const clear = ctxWith("clear");
const fog = ctxWith("fog");
const start = (ctx: SimContext, ...units: NewUnit[]) => startScenario(units.map(createUnit), 1, ctx);
const strike = (target = { x: 6000, y: 6000 }): HqCommand => ({ side: "us", type: "airStrike", target });
const drop = (target: { x: number; y: number }): HqCommand => ({ side: "us", type: "airDrop", target });
const twoTurns = (s: GameState, ctx: SimContext, cmds: HqCommand[]) => {
  const r1 = resolveTurn(s, [], ctx, cmds);
  return { r1, r2: resolveTurn(r1.state, [], ctx) };
};

describe("空襲", () => {
  it("要請した次のターンに、ターン中の一部の時間に集中して損害を与える(装甲目標にも効く)", () => {
    const { r1, r2 } = twoTurns(start(clear, inf("a", 1000, 1000), ger("t", 6000, 6000, { branch: "tank_destroyer", formation: "deployed" })), clear, [strike()]);
    expect(unitOf(r1.state, "t").strength).toBe(1);
    expect(unitOf(r2.state, "t").strength).toBeLessThan(1);
    const hits = r2.events.filter((e) => e.unitId === "t" && e.type === "hit");
    expect(hits.length).toBe(10); // 10分 = 10ステップ
    expect(r2.hqEvents.filter((e) => e.type === "airStrike")).toHaveLength(1);
    expect(r2.state.airSortiesLeft.us!.airStrike).toBe(1);
  });

  it("期待挙動:悪天候の間は空襲が来ない(中止され、出撃回数は減らない)", () => {
    const { r2 } = twoTurns(start(fog, inf("a", 1000, 1000), ger("t", 6000, 6000)), fog, [strike()]);
    expect(unitOf(r2.state, "t").strength).toBe(1);
    expect(r2.hqEvents).toEqual([{ t: 1800, side: "us", type: "airAborted", kind: "airStrike", target: { x: 6000, y: 6000 }, weather: "fog" }]);
    expect(r2.state.airSortiesLeft.us!.airStrike).toBe(2);
  });

  it("誤射あり:範囲内の味方も損害を受ける", () => {
    const { r2 } = twoTurns(start(clear, inf("friend", 6100, 6000)), clear, [strike()]);
    expect(unitOf(r2.state, "friend").strength).toBeLessThan(1);
  });

  it("出撃回数を超える要請と、航空戦力のない陣営の要請は弾く", () => {
    const r = resolveTurn(start(clear, inf("a", 1000, 1000), ger("g", 9000, 9000)), [], clear, [
      strike(),
      strike(),
      strike(),
      { side: "de", type: "airStrike", target: { x: 1000, y: 1000 } },
    ]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["今日の出撃回数を使い切っています", "この陣営は使えません"]);
  });
});

describe("空輸", () => {
  it("投下地点の近くの自軍に、近い順に不足分を配る", () => {
    const { r2 } = twoTurns(start(clear, inf("a", 3000, 3000, { ammo: 0.5 }), inf("b", 3500, 3000, { ammo: 0.5 })), clear, [drop({ x: 3000, y: 3000 })]);
    expect(unitOf(r2.state, "a").ammo).toBeCloseTo(1); // 30トン
    expect(unitOf(r2.state, "b").ammo).toBeCloseTo(0.5 + 10 / 60); // 残りの10トン
    expect(r2.hqEvents).toContainEqual(expect.objectContaining({ type: "airDrop", receiver: "us", ammoT: 40 }));
  });

  it("期待挙動:補給路を断たれた部隊も、晴れれば空輸で持ち直す(悪天候では届かない)", () => {
    const besieged = (ctx: SimContext) =>
      twoTurns(start(ctx, inf("a", 3000, 3000, { ammo: 0, formation: "deployed" })), ctx, [drop({ x: 3000, y: 3000 })]).r2.state;
    const inClear = unitOf(besieged(clear), "a");
    const inFog = unitOf(besieged(fog), "a");
    expect(inFog.ammo).toBe(0);
    expect(inClear.ammo).toBeGreaterThan(0.5);
    // 弾薬が戻ったので、そのターンの終わりからは士気が下がらない
    expect(inClear.morale).toBeGreaterThanOrEqual(inFog.morale);
  });

  it("投下地点の近くに敵しかいなければ、敵が受け取る", () => {
    const { r2 } = twoTurns(start(clear, inf("a", 1000, 1000), ger("g", 6000, 6000, { ammo: 0.2 })), clear, [drop({ x: 6000, y: 6000 })]);
    expect(unitOf(r2.state, "g").ammo).toBeGreaterThan(0.2);
    expect(r2.hqEvents).toContainEqual(expect.objectContaining({ type: "airDrop", receiver: "de" }));
  });

  it("霧:司令部の結果は要請した陣営にだけ伝わり、残りの出撃回数は自陣営のビューに出る", () => {
    const { r2 } = twoTurns(start(clear, inf("a", 1000, 1000), ger("g", 9000, 9000)), clear, [strike()]);
    expect(replayForSide(r2, "us").hqEvents).toHaveLength(1);
    expect(replayForSide(r2, "de").hqEvents).toEqual([]);
    expect(viewForSide(r2.state, "us").airSortiesLeft).toEqual({ airStrike: 1, airDrop: 2, airSuperiority: 0, airRecon: 0 });
    expect(viewForSide(r2.state, "de").airSortiesLeft).toEqual({ airStrike: 0, airDrop: 0, airSuperiority: 0, airRecon: 0 });
  });
});
