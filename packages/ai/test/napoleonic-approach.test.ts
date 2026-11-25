import { buildScenario, viewForSide } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide, DEFAULT_AI } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

/**
 * 接近の隊形(ルールパックの姿勢の approach。docs/research/napoleonic-mechanics-review.md の6):
 * 敵が接敵の距離より遠い間は大隊の縦隊で寄り、近づいてから横隊・突撃縦隊に展開する(操典の行軍 → 接近 → 展開)
 */
describe("AI の接近の隊形(ナポレオン戦争)", () => {
  const sc = unwrap(buildScenario(loadScenarioJson("pratzen-1805-12-02"), loadPacks()));
  const s = sc.start(1);
  const approach = Object.entries(sc.ctx.rules.stances).find(([, st]) => st.approach)![0];

  it("ルールパックに接近の隊形がある(予備・大隊の縦隊)", () => {
    expect(approach).toBe("reserve");
  });

  it("期待挙動:敵が遠ければ、動く歩兵は接近の隊形を取る。敵が近ければ取らない", () => {
    const v = viewForSide(s, "fr");
    const far = decide(v, sc.ctx, DEFAULT_AI, 1).orders.filter((o) => (o.waypoints?.length ?? 0) > 0 && v.own.find((u) => u.id === o.unitId)?.branch.includes("infantry"));
    expect(far.length).toBeGreaterThan(0);
    expect(far.some((o) => o.stance === approach)).toBe(true);
    // すべての敵を、それぞれの歩兵のすぐ前(300m)に見えていることにする
    const near = viewForSide(s, "fr");
    near.contacts = near.own
      .filter((u) => u.branch.includes("infantry"))
      .map((u, i) => ({ contactId: `e${i}`, currentLevel: 3, bestLevel: 3, pos: { x: u.pos.x + 300, y: u.pos.y }, lastSeenTime: near.time, branch: "line_infantry", estimatedStrength: 1 }));
    const close = decide(near, sc.ctx, DEFAULT_AI, 1).orders;
    expect(close.some((o) => o.stance === approach)).toBe(false);
  });
});
