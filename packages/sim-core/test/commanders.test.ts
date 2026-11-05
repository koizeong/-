import { describe, expect, it } from "vitest";
import { applyFire, buildScenario, commanderAiCaution, commanderEffect, createUnit, firepowerFactors, newGameState, resolveTurn, type SimContext } from "../src/index.js";
import { ctx, ger, inf, loadPacks, loadScenarioJson, wideCtx } from "./helpers.js";

const withCommanders = (c: SimContext, commanders: NonNullable<SimContext["commanders"]>, extra: Partial<SimContext> = {}): SimContext => ({
  ...c,
  commanders,
  formations: { div: { side: "us", units: ["a", "b"] } },
  ...extra,
});

describe("指揮官", () => {
  it("部隊の指揮官の特性はその部隊に、上級部隊の指揮官の特性は隷下に半分の強さで効く", () => {
    const c = withCommanders(ctx, [
      { id: "c1", name: "甲大佐", side: "us", unitId: "a", traits: ["aggressive"], fictional: true },
      { id: "c2", name: "乙少将", side: "us", formationId: "div", traits: ["aggressive"], fictional: true },
    ]);
    const a = createUnit(inf("a", 100, 100));
    const b = createUnit(inf("b", 200, 100));
    expect(commanderEffect(a, "firepower", c)).toBeCloseTo(1.05 * 1.025, 6);
    expect(commanderEffect(b, "firepower", c)).toBeCloseTo(1.025, 6);
    expect(firepowerFactors(a, c).find((f) => f.id === "commander")?.label).toContain("甲大佐");
    // 倒れた指揮官は効かない
    expect(commanderEffect(a, "firepower", { ...c, lostCommanders: new Set(["c1", "c2"]) })).toBe(1);
  });

  it("特性の効く部隊を選ぶ(砲術家は艦艇だけ)。粘り強い指揮官の部隊は士気が崩れにくい", () => {
    const c = withCommanders(ctx, [{ id: "c1", name: "丙", side: "us", unitId: "a", traits: ["gunnery", "tenacious"], fictional: true }]);
    const a = createUnit(inf("a", 100, 100));
    expect(commanderEffect(a, "firepower", c)).toBe(1);
    const hit = (cc: SimContext) => {
      const u = createUnit(inf("a", 100, 100));
      applyFire(new Map([["a", u]]), [{ attackerId: "x", targetId: "a", aspect: "front", damage: 0.1 }], cc);
      return u.morale;
    };
    expect(hit(c)).toBeGreaterThan(hit(ctx));
  });

  it("大きな損害を受けた部隊の指揮官は倒れることがあり、効果が消えて部隊の士気が下がる", () => {
    const rules = { ...wideCtx.rules, commanders: { ...wideCtx.rules.commanders!, casualty: { threshold: 0, chancePerLoss: 1000, moraleLoss: 0.1 } } };
    const c = withCommanders({ ...wideCtx, rules, turnSeconds: 1800 }, [{ id: "c1", name: "丁", side: "us", unitId: "a", traits: ["tenacious"], fictional: true }]);
    const s = newGameState([createUnit(inf("a", 1000, 5000, { formation: "deployed" })), createUnit(ger("e", 1400, 5000, { formation: "deployed", branch: "armor" }))], 1);
    const r = resolveTurn(s, [], c);
    const lost = r.events.find((e) => e.type === "commanderLost");
    expect(lost).toMatchObject({ unitId: "a", commanderId: "c1", name: "丁" });
    expect(r.state.commandersLost).toEqual(["c1"]);
    // 次のターンからは効かない
    const r2 = resolveTurn(r.state, [], c);
    expect(r2.events.filter((e) => e.type === "commanderLost")).toHaveLength(0);
  });

  it("AI の癖は陣営の最上位の指揮官の特性から(猛将は攻撃的、慎重は慎重)", () => {
    const c = withCommanders(ctx, [
      { id: "top", name: "総司令", side: "us", formationId: "div", traits: ["cautious", "methodical"], fictional: true },
      { id: "c1", name: "連隊長", side: "us", unitId: "a", traits: ["reckless"], fictional: true },
    ]);
    expect(commanderAiCaution("us", c)).toBeCloseTo(0.3, 6);
    expect(commanderAiCaution("de", c)).toBe(0);
  });

  it("シナリオファイルの指揮官の参照を確かめる", () => {
    const base = loadScenarioJson("test-symmetric") as Record<string, unknown>;
    const ok = buildScenario({ ...base, commanders: [{ id: "c", name: "某", side: "us", unitId: "us-inf1", traits: ["inspiring"] }] }, loadPacks());
    expect(ok.ok).toBe(true);
    const bad = buildScenario({ ...base, commanders: [{ id: "c", name: "某", side: "us", unitId: "nobody", traits: ["no_such"] }] }, loadPacks());
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join("\n")).toMatch(/部隊 "nobody"[\s\S]*特性 "no_such"/);
  });
});

describe("架空の指揮官の自動の割り当て", () => {
  const build = (id: string, extra: Record<string, unknown> = {}) => {
    const r = buildScenario({ ...(loadScenarioJson(id) as Record<string, unknown>), ...extra }, loadPacks());
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return r.value.ctx.commanders ?? [];
  };
  it("指揮官を書かなかった部隊・上級部隊に、国ごとの名前・規模の階級・2〜3の特性で付け、同じシナリオなら毎回同じ人", () => {
    const a = build("bastogne-1944-12-19");
    const b = build("bastogne-1944-12-19");
    expect(a).toEqual(b);
    const unitCmd = a.filter((c) => c.unitId);
    expect(unitCmd.length).toBeGreaterThan(5);
    for (const c of a) {
      expect(c.fictional).toBe(true);
      expect(c.traits.length).toBeGreaterThanOrEqual(2);
      expect(c.traits.length).toBeLessThanOrEqual(3);
      // 気性は1人に1つまで
      expect(c.traits.filter((t) => ["aggressive", "cautious", "reckless", "methodical"].includes(t)).length).toBeLessThanOrEqual(1);
    }
    // 独軍は独の名前(名・姓)、上級部隊にも付く
    expect(a.find((c) => c.side === "de" && c.unitId)?.name).toMatch(/・/);
    expect(a.some((c) => c.formationId)).toBe(true);
  });
  it("シナリオに書いた指揮官の部隊には付けず、autoCommanders: false なら付けない", () => {
    const base = loadScenarioJson("test-symmetric") as { units: { id: string }[] };
    const written = build("test-symmetric", { autoCommanders: true, commanders: [{ id: "x", name: "某", side: "us", unitId: base.units[0]!.id, traits: [] }] });
    expect(written.filter((c) => c.unitId === base.units[0]!.id)).toHaveLength(1);
    expect(build("test-symmetric")).toEqual([]);
  });
});
