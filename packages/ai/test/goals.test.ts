import { parseScenarioRules, type SimContext } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { unwrap } from "../../sim-core/test/helpers.js";
import { pointsOf, sideGoals } from "../src/goals.js";
import { symCtx } from "./fixtures.js";

describe("AIが見る勝利条件", () => {
  const scenario = unwrap(
    parseScenarioRules({
      maxTurns: 3,
      objectives: [{ id: "a", name: "a", x: 1000, y: 1000, radiusM: 300, weight: 1, initialHolder: null }],
      victory: {
        us: { conditions: [], decisive: { minPoints: 9 }, limited: { minPoints: 1 }, secretPool: { count: 1, options: [{ id: "sa", type: "hold", objective: "a", points: 4 }] } },
        de: { conditions: [{ id: "x", type: "hold", objective: "a", points: 2, secret: true }], decisive: { minPoints: 9 }, limited: { minPoints: 1 } },
      },
    }),
  );
  const ctx: SimContext = { ...symCtx, scenario };

  it("自陣営の秘密の副目標は目標の価値に入る。相手の秘密の副目標はAIにも見えない", () => {
    expect(pointsOf(sideGoals(ctx, "us", ["sa"]), "a")).toBe(4);
    expect(pointsOf(sideGoals(ctx, "us"), "a")).toBe(0);
    expect(pointsOf(sideGoals(ctx, "de"), "a")).toBe(0);
    expect(pointsOf(sideGoals(ctx, "de", []), "a")).toBe(2);
  });
});
