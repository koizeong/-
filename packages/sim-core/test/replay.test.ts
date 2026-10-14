import { describe, expect, it } from "vitest";
import { replayForSide, resolveTurn, type SimContext } from "../src/index.js";
import { ger, inf, state, wideCtx } from "./helpers.js";

describe("再生用の撃ち合いと着弾(霧のフィルタつき)", () => {
  it("撃ち合いは、自軍が撃った線と、見えている敵から撃たれた線が届く。相手は contactId で表す", () => {
    const r = resolveTurn(state(inf("a", 1000, 2000, { formation: "deployed", facing: 90 }), ger("g", 1600, 2000, { formation: "deployed", facing: 270 })), [], wideCtx);
    const us = replayForSide(r, "us");
    expect(us.shots.some((s) => s.dir === "out" && s.ownId === "a")).toBe(true);
    expect(us.shots.some((s) => s.dir === "in" && s.ownId === "a")).toBe(true);
    expect(JSON.stringify(us.shots)).not.toContain('"g"');
  });

  it("見えていない敵から撃たれても、線は届かない(撃たれた事実は hit で届く)", () => {
    // 撃ち合った結果から us の探知の記録だけを消して、敵が見えていなかった場合を作る
    const r = resolveTurn(state(inf("a", 1000, 2000, { formation: "deployed", facing: 90 }), ger("g", 1600, 2000, { formation: "deployed", facing: 270 })), [], wideCtx);
    const blind = { ...r, detections: { ...r.detections, us: {} } };
    const us = replayForSide(blind, "us");
    expect(us.shots.some((s) => s.dir === "in")).toBe(false);
    expect(us.events.some((e) => e.type === "hit")).toBe(true);
  });

  it("砲撃の着弾は、要請した陣営と、近くに部隊がいる陣営にだけ見える", () => {
    const ctx: SimContext = wideCtx;
    let s = state(inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" }), ger("near", 8000, 1000, { formation: "deployed" }), ger("far", 8000, 9000, { formation: "deployed", side: "xx" }));
    s = resolveTurn(s, [], ctx, [{ side: "us", type: "fireMission", unitId: "art", target: { x: 8000, y: 1000 } }]).state;
    const r = resolveTurn(s, [], ctx);
    expect(replayForSide(r, "us").impacts.length).toBeGreaterThan(0);
    expect(replayForSide(r, "us").impacts.every((i) => i.own && i.kind === "artillery")).toBe(true);
    expect(replayForSide(r, "de").impacts.some((i) => !i.own)).toBe(true);
    expect(replayForSide(r, "xx").impacts).toEqual([]);
  });
});
