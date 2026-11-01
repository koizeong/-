import { describe, expect, it } from "vitest";
import { createUnit, startScenario, viewForSide, type SimContext } from "@brigade/sim-core";
import { decide, escapePlan, ESCAPE_OWN_LOSS } from "../src/index.js";
import { symCtx, symDepots, symUnits } from "./fixtures.js";

const route = { side: "us", x: 500, y: 5000, fromTurn: 1 };
const ctx: SimContext = { ...symCtx, scenario: { ...symCtx.scenario, escapeRoutes: [route] } };

/** us-inf1 を脱出路の上に、us-inf2 を離れた所に置いたビュー。ownLoss で負けの具合を決める */
function setup(ownLoss: number, enemyAt?: { x: number; y: number }) {
  const s = startScenario(symUnits().filter((u) => u.id === "us-inf1" || u.id === "us-inf2").map(createUnit), 1, ctx, symDepots);
  const v = viewForSide(s, "us");
  v.own.find((u) => u.id === "us-inf1")!.pos = { x: 500, y: 5100 };
  v.own.find((u) => u.id === "us-inf2")!.pos = { x: 3000, y: 5000 };
  v.ownLoss = ownLoss;
  v.contacts = enemyAt ? [{ contactId: "c1", currentLevel: 3, bestLevel: 3, pos: enemyAt, lastSeenTime: v.time, branch: "infantry", estimatedStrength: 0.9 }] : [];
  return v;
}

describe("AI の撤退(脱出路)", () => {
  it("負けが込んでいて脱出路が開いていれば、脱出路の上の部隊を撤退させ、ほかの部隊を脱出路へ向かわせる", () => {
    const p = escapePlan(setup(ESCAPE_OWN_LOSS + 0.1), ctx)!;
    expect(p.hq).toEqual([{ side: "us", type: "retreat", unitId: "us-inf1" }]);
    expect(p.orders.find((o) => o.unitId === "us-inf2")?.waypoints).toEqual([{ x: 500, y: 5000 }]);
  });

  it("負けていなければ撤退しない。すでに撤退を始めていれば、残りも撤退させる", () => {
    expect(escapePlan(setup(0.1), ctx)).toBeNull();
    const v = setup(0.1);
    v.retreated = true;
    expect(escapePlan(v, ctx)?.hq.map((c) => c.type === "retreat" && c.unitId)).toEqual(["us-inf1"]);
  });

  it("脱出路の上でも、近くに敵が見えていれば撤退しない(その場で待つ)", () => {
    const p = escapePlan(setup(ESCAPE_OWN_LOSS + 0.1, { x: 1200, y: 5100 }), ctx)!;
    expect(p.hq).toEqual([]);
    expect(p.hold).toContain("us-inf1");
  });

  it("脱出路がまだ開いていない・ない戦闘では撤退しない", () => {
    const later: SimContext = { ...ctx, scenario: { ...ctx.scenario, escapeRoutes: [{ ...route, fromTurn: 99 }] } };
    expect(escapePlan(setup(0.9), later)).toBeNull();
    expect(escapePlan(setup(0.9), symCtx)).toBeNull();
  });

  it("decide も撤退の司令部コマンドを出す", () => {
    expect(decide(setup(0.9), ctx, { caution: 0.5, noise: 0 }).hqCommands).toContainEqual({ side: "us", type: "retreat", unitId: "us-inf1" });
  });
});
