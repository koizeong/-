import { describe, expect, it } from "vitest";
import { resolveTurn, type HqCommand, type SimContext } from "../src/index.js";
import { ger, inf, state, unitOf, wideCtx } from "./helpers.js";

const ctx: SimContext = { ...wideCtx, scenario: { ...wideCtx.scenario, commandPoints: { us: 2 } } };

describe("指揮ポイント", () => {
  it("上限を超えた命令は、送られてきた順に後ろから弾く", () => {
    const r = resolveTurn(
      state(inf("a", 1000, 1000), inf("b", 2000, 1000), inf("c", 3000, 1000)),
      [
        { unitId: "a", waypoints: [{ x: 1000, y: 2000 }] },
        { unitId: "b", waypoints: [{ x: 2000, y: 2000 }] },
        { unitId: "c", waypoints: [{ x: 3000, y: 2000 }] },
      ],
      ctx,
    );
    expect(r.rejectedOrders).toEqual([{ unitId: "c", reason: "指揮ポイントが足りません" }]);
    expect(unitOf(r.state, "c").pos).toEqual({ x: 3000, y: 1000 });
  });

  it("司令部コマンドも同じポイントを使い、命令のあとに数える", () => {
    const fire: HqCommand = { side: "us", type: "fireMission", unitId: "art", target: { x: 6000, y: 6000 } };
    const r = resolveTurn(
      state(inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" }), inf("a", 2000, 1000), inf("b", 3000, 1000)),
      [{ unitId: "a", stance: "defense" }, { unitId: "b", stance: "defense" }],
      ctx,
      [fire],
    );
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["指揮ポイントが足りません"]);
  });

  it("中身のない命令と、不正で弾かれた命令はポイントを使わない。上限のない陣営は無制限", () => {
    const r = resolveTurn(
      state(inf("a", 1000, 1000), inf("b", 2000, 1000), ger("g", 9000, 9000), ger("h", 9000, 8000), ger("k", 9000, 7000)),
      [
        { unitId: "a" },
        { unitId: "ghost", stance: "defense" },
        { unitId: "a", stance: "defense" },
        { unitId: "b", stance: "defense" },
        { unitId: "g", stance: "defense" },
        { unitId: "h", stance: "defense" },
        { unitId: "k", stance: "defense" },
      ],
      ctx,
    );
    expect(r.rejectedOrders.map((x) => x.unitId)).toEqual(["ghost"]);
  });
});
