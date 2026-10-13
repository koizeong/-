import { describe, expect, it } from "vitest";
import { resolveTurn, type ConditionalOrder } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const retreat: ConditionalOrder = {
  when: { type: "enemyDetected", withinM: 2500 },
  then: { waypoints: [{ x: 1000, y: 1000 }], moveMode: "march" },
};

describe("条件付き命令", () => {
  it("敵発見→後退:条件を満たすと代わりの命令を実行し、条件付き命令は消える", () => {
    // 展開済みで陣地にいる a に、敵が東から近づく
    const s0 = state(
      inf("a", 1000, 5000, { formation: "deployed", entrenchment: 1 }),
      ger("g", 1000 + 4000, 5000, { branch: "armor", formation: "deployed" }),
    );
    const r = resolveTurn(
      s0,
      [
        { unitId: "a", conditional: retreat },
        { unitId: "g", waypoints: [{ x: 1000, y: 5000 }], moveMode: "combat" },
      ],
      wideCtx,
    );
    const fired = r.events.find((e) => e.unitId === "a" && e.type === "conditionalTriggered");
    expect(fired).toBeDefined();
    const a = unitOf(r.state, "a");
    expect(a.conditional).toBeNull();
    expect(a.pos.y).toBeLessThan(5000);
    expect(a.formation).toBe("column");
    expect(a.entrenchment).toBe(0);
  });

  it("条件と接敵が同時なら、条件付き命令(プレイヤーの指示)を優先して後退する", () => {
    const s0 = state(inf("a", 1000, 5000), ger("g", 1000 + rules.contactRangeM - 100, 5000));
    const r = resolveTurn(
      s0,
      [{ unitId: "a", conditional: { ...retreat, when: { type: "enemyDetected", withinM: rules.contactRangeM } } }],
      wideCtx,
    );
    const a = unitOf(r.state, "a");
    expect(r.events.some((e) => e.unitId === "a" && e.type === "contact")).toBe(true);
    expect(a.formation).toBe("column");
    expect(a.pos.y).toBeLessThan(5000);
  });

  it("味方が探知した敵にも反応する(陣営で共有した探知)", () => {
    const dusk = { ...wideCtx, visibilityMultiplier: 0.5 }; // 視程 1500m
    const s0 = state(
      inf("a", 1000, 5000),
      inf("scout", 3000, 5000, { branch: "recon" }),
      ger("g", 3200, 5000),
    );
    const r = resolveTurn(s0, [{ unitId: "a", conditional: retreat }], dusk);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "conditionalTriggered")).toBe(true);
  });

  it("損害→撤退:戦力が しきい値 を下回ると発動する", () => {
    const s0 = state(inf("a", 3000, 3000));
    s0.units[0]!.strength = 0.4;
    const r = resolveTurn(
      s0,
      [{ unitId: "a", conditional: { when: { type: "strengthBelow", threshold: 0.5 }, then: { waypoints: [{ x: 3000, y: 1000 }] } } }],
      wideCtx,
    );
    expect(r.events.some((e) => e.unitId === "a" && e.type === "conditionalTriggered")).toBe(true);
    expect(unitOf(r.state, "a").pos.y).toBeLessThan(3000);
  });

  it("発動しなければ次ターンも保持され、null で取り消せる", () => {
    const r1 = resolveTurn(state(inf("a", 1000, 1000)), [{ unitId: "a", conditional: retreat }], wideCtx);
    expect(unitOf(r1.state, "a").conditional).toEqual(retreat);
    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(unitOf(r2.state, "a").conditional).toEqual(retreat);
    const r3 = resolveTurn(r2.state, [{ unitId: "a", conditional: null }], wideCtx);
    expect(unitOf(r3.state, "a").conditional).toBeNull();
  });

  it("不正な条件付き命令は弾く", () => {
    const r = resolveTurn(
      state(inf("a", 1000, 1000)),
      [{ unitId: "a", conditional: { when: { type: "strengthBelow", threshold: 1.5 }, then: {} } }],
      wideCtx,
    );
    expect(r.rejectedOrders).toHaveLength(1);
    expect(unitOf(r.state, "a").conditional).toBeNull();
  });
});
