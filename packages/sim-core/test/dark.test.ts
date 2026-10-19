import { describe, expect, it } from "vitest";
import { createUnit, isDarkTurn, resolveTurn, startScenario, viewForSide, type SimContext } from "../src/index.js";
import { ger, inf, wideCtx } from "./helpers.js";

/** 暗い時間:昼のターンとして1時間ごとに解くが、見通しは夜と同じで、航空は使えない */
const ctx: SimContext = {
  ...wideCtx,
  scenario: {
    ...wideCtx.scenario,
    darkTurns: [{ from: 2, to: 3 }],
    air: { us: { strike: { groups: 1, replacementPerDay: 0, weapon: "ground_attack_aircraft", count: 12, strikeMinutes: 10 } } },
  },
};

describe("暗い時間(夜通しの戦いを1時間ごとに解く)", () => {
  it("指定のターンだけ暗い", () => {
    expect([1, 2, 3, 4].map((t) => isDarkTurn(ctx.scenario, t))).toEqual([false, true, true, false]);
  });

  it("期待挙動:暗い時間は敵が見えにくい(昼なら見える距離でも見えない)", () => {
    const s = startScenario([createUnit(inf("a", 1000, 3000, { formation: "deployed" })), createUnit(ger("e", 2500, 3000, { formation: "deployed" }))], 1, ctx);
    const day = resolveTurn(s, [], ctx);
    const seen = (st: typeof s) => viewForSide(st, "us").contacts.some((c) => c.currentLevel > 0);
    expect(seen(day.state)).toBe(true);
    const dark = resolveTurn(day.state, [], ctx);
    expect(dark.state.phase).toBe("day");
    expect(seen(dark.state)).toBe(false);
  });

  it("暗い時間には航空(空襲)は頼めない。砲撃は頼める", () => {
    const s = startScenario([createUnit(inf("a", 1000, 3000))], 1, ctx);
    const r = resolveTurn(s, [], ctx, [{ side: "us", type: "airStrike", target: { x: 5000, y: 5000 } }]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["暗い時間には航空は使えません"]);
  });
});
