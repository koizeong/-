import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, viewForSide, type HqCommand } from "@brigade/sim-core";
import { decide } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

/** 航空司令部の試験(data/scenarios/test-air.json。対称の試験シナリオ+両陣営の航空司令部。史実ではない) */
const sc = unwrap(buildScenario(loadScenarioJson("test-air"), loadPacks()));

describe("地上の AI から航空司令部への要請(AIR7)", () => {
  it("AI 同士で数ターン:要請を出し、枠を超えて弾かれることはなく、即応か予約が飛ぶ", () => {
    let s = sc.start(1);
    const sides = sc.def.sides.map((x) => x.id);
    const sent: HqCommand[] = [];
    const rejected: string[] = [];
    const requestEvents: { side: string; status: string }[] = [];
    for (let k = 0; k < 6; k++) {
      const decisions = sides.map((side) => decide(viewForSide(s, side), sc.ctx));
      const hq = decisions.flatMap((d) => d.hqCommands);
      sent.push(...hq);
      const r = resolveTurn(s, decisions.flatMap((d) => d.orders), sc.ctx, hq);
      for (const c of r.rejectedHqCommands) if (c.command.type.startsWith("air")) rejected.push(`${c.command.type}: ${c.reason}`);
      for (const e of r.hqEvents) if (e.type === "airRequest") requestEvents.push({ side: e.side, status: e.request.status });
      s = r.state;
    }
    expect(rejected).toEqual([]);
    expect(sent.some((c) => c.type === "airRequest")).toBe(true);
    expect(requestEvents.some((e) => e.status === "accepted" || e.status === "flown" || e.status === "scheduled")).toBe(true);
    // 両陣営とも1日の枠の内
    for (const side of sides) expect(sent.filter((c) => c.type === "airRequest" && c.side === side).length).toBeLessThanOrEqual(sc.ctx.scenario.airForces.find((f) => f.side === side)!.requestsPerDay);
  });
});
