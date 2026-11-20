import { buildScenario, viewForSide } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide, DEFAULT_AI } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

/** 騎兵への備え(ナポレオン戦争の叩き台 pratzen-1805-12-02):敵の騎兵が見えていれば、歩兵は「騎兵が近づいたら方陣」の条件付き命令を前もって出す */
describe("AI の騎兵への備え", () => {
  const sc = unwrap(buildScenario(loadScenarioJson("pratzen-1805-12-02"), loadPacks()));
  const s = sc.start(1);
  const view = (withCavalry: boolean) => {
    const v = viewForSide(s, "co");
    const u = v.own.find((x) => x.id === "ru-milo-1")!;
    if (withCavalry)
      v.contacts = [...v.contacts, { contactId: "cav1", currentLevel: 3, bestLevel: 3, pos: { x: u.pos.x - 1500, y: u.pos.y }, lastSeenTime: v.time, branch: "cavalry", estimatedStrength: 1 }];
    return v;
  };

  it("期待挙動:敵の騎兵が3km以内に見えていれば、歩兵に『騎兵が近づいたら方陣』の条件付き命令を出す", () => {
    const orders = decide(view(true), sc.ctx, DEFAULT_AI, 1).orders;
    const guarded = orders.filter((o) => o.conditional?.then.stance === "square");
    expect(guarded.length).toBeGreaterThan(0);
    expect(guarded[0]!.conditional!.when).toMatchObject({ type: "enemyDetected", branches: expect.arrayContaining(["cavalry"]) });
  });

  it("騎兵が見えていなければ出さない", () => {
    const orders = decide(view(false), sc.ctx, DEFAULT_AI, 1).orders;
    expect(orders.some((o) => o.conditional?.then.stance === "square")).toBe(false);
  });
});
