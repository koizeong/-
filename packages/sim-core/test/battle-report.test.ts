import { describe, expect, it } from "vitest";
import { computeFire, createUnit, factorProduct, replayForSide, resolveTurn, Rng, unitModifiers, type HqCommand } from "../src/index.js";
import { ger, inf, state, unitOf, wideCtx } from "./helpers.js";

describe("いま効いている補正(画面用の内訳)", () => {
  it("陣地・姿勢・疲労などの倍率を、名前つきで並べる(1の要因は出さない)", () => {
    const fresh = unitModifiers(createUnit(inf("a", 1000, 1000)), wideCtx);
    expect(fresh.firepower.every((f) => f.value !== 1)).toBe(true);
    const dug = createUnit(inf("d", 1000, 1000, { formation: "deployed", entrenchment: 2 }));
    dug.fatigue = 0.5;
    const m = unitModifiers(dug, wideCtx);
    const ent = m.damageTaken.find((f) => f.id === "entrenchment")!;
    expect(ent.label).toBe("陣地 2");
    expect(ent.value).toBeLessThan(1);
    expect(m.firepower.find((f) => f.id === "fatigue")!.value).toBeLessThan(1);
  });

  it("内訳の積は、実際の直接射撃の損害の比と一致する(画面の数字と計算が食い違わない)", () => {
    const hit = (extra: object) => {
      const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }));
      const t = createUnit(inf("t", 1400, 1000, { formation: "deployed", facing: 270, ...extra }));
      const r = computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((x) => x.targetId === "t")!;
      return { damage: r.damage, k: factorProduct(unitModifiers(t, wideCtx).damageTaken) };
    };
    const plain = hit({});
    const dug = hit({ entrenchment: 3 });
    expect(dug.damage / plain.damage).toBeCloseTo(dug.k / plain.k, 6);
  });
});

describe("戦況まとめ:撃ち合いの組ごとの結果", () => {
  it("期待挙動:側面から撃てば、その組に「側面から」の倍率が付き、与えた損害は実際の減り方と一致する", () => {
    const s = state(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }), inf("t", 1400, 1000, { formation: "deployed", facing: 0 }));
    const r = resolveTurn(s, [], wideCtx);
    const e = r.engagements.find((x) => x.attackerId === "a" && x.targetId === "t")!;
    expect(e.aspect).toBe("flank");
    expect(e.situational.find((f) => f.id === "aspect")!.value).toBeGreaterThan(1);
    expect(e.strength).toBeCloseTo(1 - unitOf(r.state, "t").strength, 6);
  });

  it("霧:敵に与えた損害は段階だけ、自軍が受けた損害は正確に見せる", () => {
    const s = state(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }), inf("t", 1400, 1000, { formation: "deployed", facing: 270 }));
    const r = resolveTurn(s, [], wideCtx);
    const de = replayForSide(r, "de").engagements;
    const out = de.find((x) => x.dir === "out")!;
    expect(out.dir === "out" && ["slight", "light", "moderate", "heavy"].includes(out.dealt)).toBe(true);
    expect(JSON.stringify(out)).not.toContain('"t"');
    const us = replayForSide(r, "us").engagements.find((x) => x.dir === "in")!;
    expect(us.dir === "in" && us.strength).toBeCloseTo(1 - unitOf(r.state, "t").strength, 1);
  });
});

describe("戦況まとめ:砲撃・空襲の結果", () => {
  it("期待挙動:砲撃の1回ごとに、当たった部隊と損害がまとまる。要請した側には段階で見せる", () => {
    const mission: HqCommand = { side: "us", type: "fireMission", unitId: "art", target: { x: 6000, y: 6500 } };
    const s0 = state(inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" }), ger("g", 6000, 6500, { formation: "deployed" }));
    const r1 = resolveTurn(s0, [], wideCtx, [mission]);
    const r2 = resolveTurn(r1.state, [], wideCtx);
    const rep = r2.strikes.find((x) => x.kind === "artillery")!;
    expect(rep.unitId).toBe("art");
    expect(rep.hits.find((h) => h.unitId === "g")!.strength).toBeCloseTo(1 - unitOf(r2.state, "g").strength, 6);
    const seen = replayForSide(r2, "us").strikes[0]!;
    expect(seen.own).toBe(true);
    expect(seen.enemyHits.length + (seen.unobservedHits ? 1 : 0)).toBeGreaterThan(0);
    // 撃たれた側には、自軍の損害が正確に見える
    expect(replayForSide(r2, "de").strikes[0]!.ownHits[0]!.strength).toBeCloseTo(1 - unitOf(r2.state, "g").strength, 6);
  });

  it("何にも当たらなかった砲撃も「効果なし」として要請した側に見せる(敵には見せない)", () => {
    const mission: HqCommand = { side: "us", type: "fireMission", unitId: "art", target: { x: 3000, y: 6500 } };
    const s0 = state(inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" }), ger("g", 8000, 8000, { formation: "deployed" }));
    const r2 = resolveTurn(resolveTurn(s0, [], wideCtx, [mission]).state, [], wideCtx);
    const seen = replayForSide(r2, "us").strikes;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ own: true, kind: "artillery", enemyHits: [], ownHits: [], unobservedHits: false });
    expect(replayForSide(r2, "de").strikes).toEqual([]);
  });
});
