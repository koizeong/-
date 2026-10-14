import { describe, expect, it } from "vitest";
import { computeFire, createUnit, resolveTurn, Rng, startScenario, viewForSide, type SimContext } from "../src/index.js";
import { branches, ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const F = rules.fatigue;
const fatigueAfter = (orders: Parameters<typeof resolveTurn>[1], extra = {}) =>
  unitOf(resolveTurn(state(inf("a", 1000, 2000, { formation: "deployed", ...extra })), orders, wideCtx).state, "a").fatigue;

describe("疲労", () => {
  it("行軍は疲労が小さく、戦闘移動は大きい(1ターン動き続けたとき)", () => {
    const march = fatigueAfter([{ unitId: "a", waypoints: [{ x: 9000, y: 2000 }], moveMode: "march" }]);
    const combat = fatigueAfter([{ unitId: "a", waypoints: [{ x: 9000, y: 2000 }], moveMode: "combat" }]);
    expect(march).toBeCloseTo(F.marchPerHour * 0.5);
    expect(combat).toBeCloseTo(F.combatMovePerHour * 0.5);
    expect(combat).toBeGreaterThan(march);
  });

  it("強襲の姿勢は疲労のたまり方が大きい(回復は変わらない)", () => {
    const order = [{ unitId: "a", waypoints: [{ x: 9000, y: 2000 }], moveMode: "combat" as const }];
    expect(fatigueAfter(order, { stance: "attack" })).toBeCloseTo(fatigueAfter(order) * rules.stances.attack!.fatigueMultiplier);
    expect(fatigueAfter([], { fatigue: 0.5, stance: "attack" })).toBeCloseTo(0.5 - F.restPerHour * 0.5);
  });

  it("撃ち合うとたまり、休めば抜ける", () => {
    const r = resolveTurn(state(inf("a", 1000, 2000, { formation: "deployed", facing: 90 }), ger("g", 1500, 2000, { formation: "deployed", facing: 270 })), [], wideCtx);
    expect(unitOf(r.state, "a").fatigue).toBeCloseTo((F.firingPerHour + F.underFirePerHour) * 0.5);
    expect(fatigueAfter([], { fatigue: 0.5 })).toBeCloseTo(0.5 - F.restPerHour * 0.5);
  });

  it("疲れているほど遅い", () => {
    const go = (fatigue: number) =>
      unitOf(resolveTurn(state(inf("a", 1000, 2000, { fatigue })), [{ unitId: "a", waypoints: [{ x: 9000, y: 2000 }] }], wideCtx).state, "a").pos.x - 1000;
    const fresh = go(0);
    const tired = go(0.8);
    expect(fresh).toBeGreaterThan(tired);
    // 疲労0.8なら、最初の速度は (1 - 0.8 × 速度の低下) 倍
    expect(tired / (branches.branches.infantry!.marchSpeedMpm * 30)).toBeLessThan(1 - 0.8 * F.speedPenalty + 0.05);
  });

  it("疲れているほど火力が落ちる", () => {
    const fire = (fatigue: number) => {
      const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", fatigue }));
      const t = createUnit(inf("t", 1500, 1000));
      return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(fire(1) / fire(0)).toBeCloseTo(1 - F.firepowerPenalty);
  });

  it("夜間行動は疲労が上乗せされ、夜の休息では大きく回復する", () => {
    const nightCtx: SimContext = { ...wideCtx, scenario: { ...wideCtx.scenario, maxTurns: 2, night: { turn: 2, hours: 14 } } };
    const dusk = resolveTurn(startScenario([createUnit(inf("mover", 1000, 2000)), createUnit(inf("sleeper", 1000, 8000, { fatigue: 0.6 }))], 1, nightCtx), [], nightCtx).state;
    const r = resolveTurn(dusk, [{ unitId: "mover", waypoints: [{ x: 9000, y: 2000 }] }], nightCtx);
    // 4時間の浸透移動(行軍 + 夜間行動) → 残り10時間の休息
    const expected = Math.max(0, (F.marchPerHour + F.nightActionPerHour) * 4 - F.restPerHour * 10);
    expect(unitOf(r.state, "mover").fatigue).toBeCloseTo(expected);
    expect(unitOf(r.state, "sleeper").fatigue).toBeCloseTo(Math.max(0, unitOf(dusk, "sleeper").fatigue - F.restPerHour * 14));
  });

  it("自軍の疲労は見え、敵の疲労は見えない", () => {
    const s = state(inf("a", 1000, 1000, { fatigue: 0.4 }), ger("g", 1300, 1000, { fatigue: 0.7 }));
    const seen = resolveTurn(s, [], wideCtx).state;
    const v = viewForSide(seen, "us");
    expect(v.own[0]!.fatigue).toBeGreaterThan(0);
    expect(JSON.stringify(v.contacts)).not.toContain("fatigue");
  });
});
