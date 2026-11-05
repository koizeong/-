import { describe, expect, it } from "vitest";
import { createUnit, startScenario, viewForSide, type SimContext } from "../src/index.js";
import { ctx, ger, inf } from "./helpers.js";

describe("始めから位置を知られている部隊(knownAtStart)", () => {
  it("相手の地図に、兵種まで分かった最後に見た位置として載る(見えてはいない)", () => {
    const c: SimContext = { ...ctx, scenario: { ...ctx.scenario, knownAtStart: [{ side: "de", unitId: "us1" }] } };
    const s = startScenario([createUnit(inf("us1", 100, 100)), createUnit(ger("de1", 1900, 900))], 1, c);
    const v = viewForSide(s, "de");
    expect(v.contacts).toHaveLength(1);
    expect(v.contacts[0]).toMatchObject({ currentLevel: 0, bestLevel: 2, branch: "infantry", pos: { x: 100, y: 100 } });
    expect(viewForSide(s, "us").contacts).toHaveLength(0);
  });
});
