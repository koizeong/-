import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { runSeries } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

describe("海戦の AI(試験の海戦 test-naval)", () => {
  it("索敵機で敵を見つけ、攻撃隊を出して損害を与える。弾かれる命令を出さない", () => {
    const sc = unwrap(buildScenario(loadScenarioJson("test-naval"), loadPacks()));
    const s = runSeries(sc.start, sc.ctx, [1, 2]);
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
    // 両陣営とも損害を受けている(撃ち合い・空襲が起きている)
    expect(s.decisiveness["w"]!.lossShare).toBeGreaterThan(0.05);
    expect(s.decisiveness["e"]!.lossShare).toBeGreaterThan(0.05);
  }, 60000);
});
