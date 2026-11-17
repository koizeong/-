import { describe, expect, it } from "vitest";
import { createUnit, startScenario, viewForSide, type SimContext } from "@brigade/sim-core";
import { decide, DEFAULT_AI } from "../src/index.js";
import { symCtx, symDepots, symUnits } from "./fixtures.js";

/**
 * 兵科どうしの相性の姿勢(方陣など):その姿勢で受ける損害が小さくなる兵科の敵が近くに見えていれば、守っている部隊はその姿勢を取る。
 * 試験シナリオのルールパックに、歩兵だけが取れる「方陣」(機甲からの損害 0.2)を足して確かめる
 */
const unit0 = symUnits().find((u) => u.id === "us-inf1")!;
const ctx: SimContext = {
  ...symCtx,
  rules: {
    ...symCtx.rules,
    // 死守は相性の姿勢より先に選ばれるので、ここでは外して相性の姿勢だけを確かめる
    stances: {
      ...Object.fromEntries(Object.entries(symCtx.rules.stances).filter(([, st]) => !st.lastStand)),
      square: { ...symCtx.rules.stances.standard!, name: "方陣", branches: [unit0.branch], damageTakenFromBranch: { armor: 0.2 } },
    },
  },
};

function orderWith(branch: string, distanceM: number) {
  const center = ctx.scenario.objectives.find((o) => o.id === "center")!;
  const s = startScenario([createUnit({ ...unit0, pos: { x: center.x, y: center.y } })], 1, ctx, symDepots);
  const v = viewForSide(s, "us");
  v.own[0]!.formation = "deployed";
  v.objectives.center = "us";
  v.contacts = [{ contactId: "c1", currentLevel: 3, bestLevel: 3, pos: { x: center.x + distanceM, y: center.y }, lastSeenTime: v.time, branch, estimatedStrength: 0.8 }];
  return decide(v, ctx, DEFAULT_AI, 1).orders.find((o) => o.unitId === "us-inf1");
}

describe("兵科どうしの相性の姿勢", () => {
  it("守っている歩兵は、近くに見えた機甲に方陣を組む", () => {
    expect(orderWith("armor", 400)?.stance).toBe("square");
  });
  it("相手が相性の悪くない兵科なら、遠ければ方陣を組まない", () => {
    expect(orderWith("infantry", 400)?.stance).not.toBe("square");
    expect(orderWith("armor", 1500)?.stance).not.toBe("square");
  });
});
