import { describe, expect, it } from "vitest";
import { buildScenario, computeFire, createUnit, detectionRange, resolveTurn, Rng, trainingOf } from "../src/index.js";
import { ger, inf, loadPacks, loadScenarioJson, rules, state, unitOf, unwrap, wideCtx } from "./helpers.js";

const R = rules.breakthrough.zoneRadiusM;
const C = rules.breakthrough.closeAssaultM;
const dist = (p: { x: number; y: number }, x: number, y: number) => Math.hypot(p.x - x, p.y - y);
/** 陣地3の歩兵連隊(東から来る敵に正面を向ける)。同じ規模の攻め手では突破できない */
const holder = () => inf("d", 3000, 3000, { formation: "deployed", facing: 90, entrenchment: 3 });

describe("肉薄(阻止圏の中で、攻める相手には近づける)", () => {
  it("守備隊そのものを攻める動きは、突破判定に勝てなくても肉薄の距離まで近づける(それより内へは入れない)", () => {
    expect(C).toBeGreaterThan(0);
    const s0 = state(holder(), ger("a", 3000 + R + 300, 3000, { formation: "deployed" }));
    let s = s0;
    for (let i = 0; i < 3; i++) s = resolveTurn(s, i === 0 ? [{ unitId: "a", waypoints: [{ x: 3000, y: 3000 }], moveMode: "combat" }] : [], wideCtx).state;
    const d = dist(unitOf(s, "a").pos, 3000, 3000);
    expect(d).toBeLessThan(R);
    expect(d).toBeGreaterThanOrEqual(C - 1);
  });

  it("守備隊の脇を抜けて別の場所へ向かう動き(すり抜け)は、これまでどおり阻止圏の縁で止まる", () => {
    const s0 = state(holder(), ger("a", 3000 + R + 300, 3200, { formation: "deployed" }));
    const r = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 1000, y: 3200 }], moveMode: "combat" }], wideCtx);
    expect(dist(unitOf(r.state, "a").pos, 3000, 3000)).toBeGreaterThanOrEqual(R - 1);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "blocked")).toBe(true);
  });

  it("肉薄すると近距離の撃ち合いになり、阻止圏の縁で止まるより双方の損害が大きい", () => {
    const fireAt = (x: number) => {
      const units = [createUnit(holder()), createUnit(ger("a", x, 3000, { formation: "deployed", facing: 270 }))];
      return computeFire(units, wideCtx, Rng.fromSeed(1), new Set()).reduce((s, r) => s + r.damage, 0);
    };
    expect(fireAt(3000 + C + 10)).toBeGreaterThan(fireAt(3000 + R + 10) * 1.5);
  });
});

describe("動いている部隊は見つかりやすい", () => {
  it("経路を持って動いている目標は、止まっている目標より遠くから見つかる", () => {
    const obs = createUnit(inf("o", 1000, 1000, { formation: "deployed" }));
    const still = createUnit(ger("t", 3000, 1000, { formation: "deployed" }));
    const moving = createUnit(ger("t", 3000, 1000, { formation: "deployed" }));
    moving.route = [{ x: 2000, y: 1000 }];
    expect(detectionRange(obs, moving, wideCtx)).toBeCloseTo(detectionRange(obs, still, wideCtx) * rules.detection.movingSignatureMultiplier);
    expect(rules.detection.movingSignatureMultiplier).toBeGreaterThan(1);
  });
});

describe("練度", () => {
  const pair = (training?: string) => [
    createUnit(inf("d", 3000, 3000, { formation: "deployed", facing: 90 })),
    createUnit(ger("a", 3300, 3000, { formation: "deployed", facing: 270, ...(training ? { training } : {}) })),
  ];
  const fireOf = (training?: string) => computeFire(pair(training), wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;

  it("未熟な部隊は火力が低く、精鋭は高い(指定のない部隊は既定の段階)", () => {
    expect(trainingOf({}, rules)).toBe(rules.training.levels[rules.training.default]);
    expect(fireOf("green")).toBeLessThan(fireOf());
    expect(fireOf("elite")).toBeGreaterThan(fireOf());
  });

  it("未熟な部隊は、同じ損害でも士気が大きく減る", () => {
    expect(rules.training.levels.green!.moraleDamageTakenMultiplier).toBeGreaterThan(1);
    const hit = (training?: string) => {
      const s0 = state(inf("d", 3000, 3000, { formation: "deployed", facing: 90, ...(training ? { training } : {}) }), ger("a", 3300, 3000, { formation: "deployed", facing: 270 }));
      return 1 - unitOf(resolveTurn(s0, [], wideCtx).state, "d").morale;
    };
    expect(hit("green")).toBeGreaterThan(hit());
  });

  it("シナリオで指定した練度がルールパックになければ、読み込みで弾く", () => {
    const def = loadScenarioJson("test-symmetric") as { units: Record<string, unknown>[] };
    def.units[0]!.training = "no-such-level";
    const r = buildScenario(def, loadPacks());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("練度");
    // 正しい段階なら読み込める
    def.units[0]!.training = "green";
    expect(unwrap(buildScenario(def, loadPacks())).units[0]!.training).toBe("green");
  });
});
