import { describe, expect, it } from "vitest";
import { effectiveStance, entrenchmentCap, resolveTurn } from "../src/index.js";
import { ctx, inf, rules, state, unitOf } from "./helpers.js";

const FOREST = { x: 1500, y: 900 };

describe("姿勢", () => {
  it("切替には1ターンかかり、切替中は標準扱い", () => {
    const s0 = state(inf("a", FOREST.x, FOREST.y, { formation: "deployed", stance: "defense" }));
    const r = resolveTurn(s0, [{ unitId: "a", stance: "attack" }], ctx);
    expect(unitOf(r.state, "a").stance).toBe("attack");
    expect(r.events.some((e) => e.type === "stanceChanged" && e.from === "defense" && e.to === "attack")).toBe(true);

    // 切替中の状態を直接確かめる
    const switching = { ...unitOf(s0, "a"), pendingStance: "attack" };
    expect(effectiveStance(switching, rules)).toBe("standard");
    expect(entrenchmentCap(switching, ctx)).toBe(2); // 森林2 + 標準0(旧姿勢の防御+1は失う)
  });

  it("姿勢と経由点・移動モードは、命令しなければ次ターンも保持される", () => {
    const r1 = resolveTurn(
      state(inf("a", 0, 0)),
      [{ unitId: "a", stance: "recon", moveMode: "combat", waypoints: [{ x: 0, y: 5000 }] }],
      ctx,
    );
    const r2 = resolveTurn(r1.state, [], ctx);
    const a = unitOf(r2.state, "a");
    expect(a.stance).toBe("recon");
    expect(a.moveMode).toBe("combat");
    expect(a.route).toEqual([{ x: 0, y: 5000 }]);
  });

  it("今の姿勢を命じると切替は取り消される", () => {
    const s0 = state(inf("a", 0, 0, { stance: "defense" }));
    const r = resolveTurn(s0, [{ unitId: "a", stance: "defense" }], ctx);
    expect(r.events.filter((e) => e.type === "stanceChanged")).toEqual([]);
  });
});
