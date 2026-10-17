import { describe, expect, it } from "vitest";
import { effectiveStance, entrenchmentCap, isStanceSpent, resolveTurn, stanceOf } from "../src/index.js";
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
      [{ unitId: "a", stance: "reserve", moveMode: "combat", waypoints: [{ x: 0, y: 5000 }] }],
      ctx,
    );
    const r2 = resolveTurn(r1.state, [], ctx);
    const a = unitOf(r2.state, "a");
    expect(a.stance).toBe("reserve");
    expect(a.moveMode).toBe("combat");
    expect(a.route).toEqual([{ x: 0, y: 5000 }]);
  });

  it("今の姿勢を命じると切替は取り消される", () => {
    const s0 = state(inf("a", 0, 0, { stance: "defense" }));
    const r = resolveTurn(s0, [{ unitId: "a", stance: "defense" }], ctx);
    expect(r.events.filter((e) => e.type === "stanceChanged")).toEqual([]);
  });
});

describe("強襲は短い間だけ効く", () => {
  const ATTACK = rules.stances.attack!;
  it("切替が終わってから effectTurns ターンだけ効き、息切れするとその場で標準の姿勢に戻る", () => {
    expect(ATTACK.effectTurns).toBe(1);
    expect(ATTACK.revertWhenSpent).toBe(true);
    let s = resolveTurn(state(inf("a", 1000, 1000)), [{ unitId: "a", stance: "attack" }], ctx).state; // 切替中
    const a1 = unitOf(s, "a");
    expect(a1.stance).toBe("attack");
    expect(isStanceSpent(a1, rules)).toBe(false);
    expect(stanceOf(a1, rules).breakthroughMultiplier).toBe(ATTACK.breakthroughMultiplier);
    const r = resolveTurn(s, [], ctx); // 効いているターン
    s = r.state;
    expect(r.events.some((e) => e.unitId === "a" && e.type === "stanceSpent")).toBe(true);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "stanceChanged" && e.to === rules.defaultStance)).toBe(true);
    const a2 = unitOf(s, "a");
    expect(a2.stance).toBe(rules.defaultStance);
    expect(stanceOf(a2, rules).breakthroughMultiplier).toBe(1);
  });

  it("息切れして標準に戻った後は、また強襲に切り替えられる", () => {
    let s = state(inf("a", 1000, 1000));
    for (let i = 0; i < 2; i++) s = resolveTurn(s, i === 0 ? [{ unitId: "a", stance: "attack" }] : [], ctx).state;
    expect(unitOf(s, "a").stance).toBe(rules.defaultStance);
    s = resolveTurn(s, [{ unitId: "a", stance: "attack" }], ctx).state;
    expect(unitOf(s, "a").stance).toBe("attack");
    expect(isStanceSpent(unitOf(s, "a"), rules)).toBe(false);
  });

  it("効果の続くターン数のない姿勢は、息切れしない", () => {
    let s = resolveTurn(state(inf("a", 1000, 1000)), [{ unitId: "a", stance: "defense" }], ctx).state;
    for (let i = 0; i < 5; i++) s = resolveTurn(s, [], ctx).state;
    expect(isStanceSpent(unitOf(s, "a"), rules)).toBe(false);
  });
});
