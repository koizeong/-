import { describe, expect, it } from "vitest";
import { createUnit, startScenario, viewForSide, type SideView } from "@brigade/sim-core";
import { assess, decide, PRESS_RANGE_M, pressOrders } from "../src/index.js";
import { symCtx, symDepots, symUnits } from "./fixtures.js";

/** 北西の開けた所に、展開した us-inf1 と、600m 先に見えている敵 c1 を置いたビュー */
function setup(balance: SideView["fireBalance"], tweak: (u: SideView["own"][number]) => void = () => {}) {
  const s = startScenario(symUnits().filter((u) => u.id === "us-inf1").map(createUnit), 1, symCtx, symDepots);
  const v = viewForSide(s, "us");
  const u = v.own[0]!;
  u.pos = { x: 2000, y: 9000 };
  u.formation = "deployed";
  tweak(u);
  v.contacts = [{ contactId: "c1", currentLevel: 3, bestLevel: 3, pos: { x: 2600, y: 9000 }, lastSeenTime: v.time, branch: "infantry", estimatedStrength: 0.8 }];
  v.fireBalance = balance;
  return { v, u };
}
const winning = [{ ownId: "us-inf1", contactId: "c1", dealt: "moderate" as const, taken: 0.002 }];

describe("攻め気(押している撃ち合いの相手に詰める)", () => {
  it("押していた相手が近くにいれば、強襲に切り替える", () => {
    const { v } = setup(winning);
    expect(pressOrders(v, assess(v, symCtx), symCtx, new Set()).get("us-inf1")).toEqual({ unitId: "us-inf1", stance: "attack" });
  });

  it("強襲が効いているターンは、その相手へ取りつく", () => {
    const { v } = setup(winning, (u) => {
      u.stance = "attack";
      u.pendingStance = null;
      u.stanceTurns = 0;
    });
    const o = pressOrders(v, assess(v, symCtx), symCtx, new Set()).get("us-inf1");
    expect(o?.waypoints).toEqual([{ x: 2600, y: 9000 }]);
    expect(o?.moveMode).toBe("combat");
  });

  it("押されていた・五分だった相手、遠い相手、自分が弱っているときは詰めない", () => {
    const none = (balance: SideView["fireBalance"], tweak?: (u: SideView["own"][number]) => void) => {
      const { v } = setup(balance, tweak);
      return pressOrders(v, assess(v, symCtx), symCtx, new Set()).has("us-inf1");
    };
    expect(none([{ ownId: "us-inf1", contactId: "c1", dealt: "light", taken: 0.02 }])).toBe(false);
    expect(none([{ ownId: "us-inf1", contactId: "c1", dealt: "light", taken: 0.005 }])).toBe(false);
    expect(none([{ ownId: "us-inf1", contactId: "c1", dealt: "slight", taken: 0 }])).toBe(false);
    expect(none(winning, (u) => (u.strength = 0.4))).toBe(false);
    expect(none(winning, (u) => (u.suppression = 0.8))).toBe(false);
    const far = setup(winning);
    far.v.contacts[0]!.pos = { x: 2000 + PRESS_RANGE_M + 200, y: 9000 };
    expect(pressOrders(far.v, assess(far.v, symCtx), symCtx, new Set()).has("us-inf1")).toBe(false);
  });

  it("自陣営の目標を守っている部隊・固い陣地にいる部隊は、持ち場を離れて詰めない", () => {
    const dug = setup(winning, (u) => (u.entrenchment = 2));
    expect(pressOrders(dug.v, assess(dug.v, symCtx), symCtx, new Set()).has("us-inf1")).toBe(false);
    const center = symCtx.scenario.objectives.find((o) => o.id === "center")!;
    const held = setup(winning, (u) => (u.pos = { x: center.x, y: center.y }));
    held.v.objectives.center = "us";
    held.v.contacts[0]!.pos = { x: center.x + 600, y: center.y };
    expect(pressOrders(held.v, assess(held.v, symCtx), symCtx, new Set()).has("us-inf1")).toBe(false);
  });

  it("decide の命令にも入る(姿勢の切り替え)", () => {
    const { v } = setup(winning);
    expect(decide(v, symCtx, { caution: 0.5, noise: 0 }).orders.find((o) => o.unitId === "us-inf1")?.stance).toBe("attack");
  });

  it("ビューの撃ち合いの優劣は、いま見えている敵との組だけ(霧)", () => {
    const s = startScenario(symUnits().filter((u) => u.id === "us-inf1" || u.id === "de-inf1").map(createUnit), 1, symCtx, symDepots);
    s.lastFire = [
      { attackerId: "us-inf1", targetId: "de-inf1", strength: 0.02 },
      { attackerId: "de-inf1", targetId: "us-inf1", strength: 0.004 },
    ];
    // まだ見つけていない
    expect(viewForSide(s, "us").fireBalance).toEqual([]);
    s.intel.us = { entries: { "de-inf1": { contactId: "c9", currentLevel: 2, bestLevel: 2, lastSeenPos: { x: 0, y: 0 }, lastSeenTime: 0 } as never } } as never;
    expect(viewForSide(s, "us").fireBalance).toEqual([{ ownId: "us-inf1", contactId: "c9", dealt: "moderate", taken: 0.004 }]);
  });
});
