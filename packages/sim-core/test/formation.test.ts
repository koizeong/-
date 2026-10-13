import { describe, expect, it } from "vitest";
import { resolveTurn } from "../src/index.js";
import { ctx, inf, state, unitOf } from "./helpers.js";

describe("隊形と展開", () => {
  it("停止中の縦隊に「停止後に展開」を指示すると、そのターンの終わりに展開済みになる", () => {
    const r = resolveTurn(state(inf("a", 100, 100)), [{ unitId: "a", deployAfterStop: true }], ctx);
    const a = unitOf(r.state, "a");
    expect(a.formation).toBe("deployed");
    expect(a.deployAfterStop).toBe(false);
  });

  it("行軍が終わっても、指示がなければ縦隊のまま", () => {
    const r = resolveTurn(state(inf("a", 100, 100)), [{ unitId: "a", waypoints: [{ x: 300, y: 100 }] }], ctx);
    expect(unitOf(r.state, "a").formation).toBe("column");
  });

  it("行軍後に展開すると、停止から1ターンかかる(次ターンの途中で完了)", () => {
    // 行軍 60m/分 で 600m → 10分で到着、そこから30分で展開完了
    const r1 = resolveTurn(
      state(inf("a", 100, 100)),
      [{ unitId: "a", waypoints: [{ x: 700, y: 100 }], deployAfterStop: true }],
      ctx,
    );
    expect(unitOf(r1.state, "a").formation).toBe("deploying");
    const r2 = resolveTurn(r1.state, [], ctx);
    const done = r2.events.find((e) => e.type === "formationChanged" && e.to === "deployed");
    expect(unitOf(r2.state, "a").formation).toBe("deployed");
    expect(done?.t).toBe(600 + 1800);
  });

  it("縦隊に戦闘移動を命じると、まずその場で1ターンかけて展開してから動く", () => {
    const order = [{ unitId: "a", waypoints: [{ x: 1900, y: 100 }], moveMode: "combat" as const }];
    const r1 = resolveTurn(state(inf("a", 100, 100)), order, ctx);
    expect(unitOf(r1.state, "a").pos).toEqual({ x: 100, y: 100 });
    expect(unitOf(r1.state, "a").formation).toBe("deployed");
    const r2 = resolveTurn(r1.state, [], ctx);
    expect(unitOf(r2.state, "a").pos.x).toBeGreaterThan(100);
    expect(unitOf(r2.state, "a").formation).toBe("deployed");
  });

  it("展開中に行軍を命じると、展開を放棄して縦隊で動く", () => {
    const r1 = resolveTurn(
      state(inf("a", 100, 100)),
      [{ unitId: "a", waypoints: [{ x: 700, y: 100 }], deployAfterStop: true }],
      ctx,
    );
    expect(unitOf(r1.state, "a").formation).toBe("deploying");
    const r2 = resolveTurn(r1.state, [{ unitId: "a", waypoints: [{ x: 700, y: 400 }] }], ctx);
    expect(unitOf(r2.state, "a").formation).toBe("column");
    expect(unitOf(r2.state, "a").pos).toEqual({ x: 700, y: 400 });
  });
});
