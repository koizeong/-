import { describe, expect, it } from "vitest";
import { computeFire, createUnit, newGameState, parseBranchPack, parseRulePack, parseToePack, parseWeaponPack, resolveTurn, Rng, type NewUnit, type SimContext } from "../src/index.js";
import { loadPacks, unitOf, unwrap, wideCtx } from "./helpers.js";

/**
 * ナポレオン戦争の隊形(ルールパック napoleonic の姿勢):分単位の切替(changeMinutes)、隊形の密度・縦の深さ(density・depth)と
 * 武器の densityEffect・depthEffect(ぶどう弾は密集した隊形に、実体弾は縦に深い隊形に)、条件付き命令の兵科の絞り込み(騎兵が来たら方陣)
 */
const packs = loadPacks();
const nap: SimContext = {
  ...wideCtx,
  rules: unwrap(parseRulePack(packs.rules.napoleonic)),
  branches: unwrap(parseBranchPack(packs.branches.napoleonic)),
  weapons: unwrap(parseWeaponPack(packs.weapons.napoleonic)),
  toes: unwrap(parseToePack(packs.toes.napoleonic)),
};
const unit = (id: string, side: string, toe: string, branch: string, x: number, extra: Partial<NewUnit> = {}): NewUnit => ({
  id, side, toe, branch, pos: { x, y: 1000 }, facing: side === "fr" ? 90 : 270, stance: "standard", formation: "deployed", ...extra,
});
const bat = (x = 1000) => unit("bat", "fr", "nap-fr-art", "artillery", x);
const line = (x: number, stance: string) => unit("t", "co", "nap-at-line-bde", "line_infantry", x, { stance });

/** 撃つ部隊 a から目標 t への損害 */
const damage = (a: NewUnit, t: NewUnit) => computeFire([createUnit(a), createUnit(t)], nap, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === a.id)?.damage ?? 0;

describe("ナポレオン戦争の隊形", () => {
  it("期待挙動:ぶどう弾(近い距離)は方陣・縦隊に多く当たり、散開した散兵にはあまり当たらない", () => {
    const at = (stance: string) => damage(bat(), line(1250, stance));
    expect(at("square") / at("standard")).toBeGreaterThan(1.8);
    expect(at("attack") / at("standard")).toBeGreaterThan(1.5);
    expect(at("ambush") / at("standard")).toBeLessThan(0.6);
  });

  it("期待挙動:実体弾(遠い距離)は縦に深い縦隊を貫いて、横隊より多く倒す", () => {
    const at = (stance: string) => damage(bat(), line(1600, stance));
    expect(at("attack") / at("standard")).toBeGreaterThan(1.8);
  });

  it("期待挙動:マスケットの撃ち合いでも、散開した散兵は横隊より受ける損害が小さい", () => {
    const musket = (stance: string) => damage(unit("fr", "fr", "nap-fr-line-bde", "line_infantry", 1000), line(1080, stance));
    expect(musket("ambush")).toBeLessThan(musket("standard"));
  });

  it("書かない武器・ルールパック(WWI〜朝鮮戦争)では、密度はかからない(姿勢の density・depth は既定の1)", () => {
    const r = wideCtx.rules.stances;
    for (const st of Object.values(r)) {
      expect(st.density).toBe(1);
      expect(st.depth).toBe(1);
    }
  });

  it("期待挙動:隊形の切替はターンの途中で済む(横隊から方陣へ3分)", () => {
    const s0 = newGameState([createUnit(line(1500, "standard"))], 1);
    const r = resolveTurn(s0, [{ unitId: "t", stance: "square" }], nap);
    const ev = r.events.find((e) => e.type === "stanceChanged" && e.to === "square");
    expect(ev).toBeDefined();
    // ターンの始めから3分ほどで替わる(ターンの終わりではない)
    expect(ev!.t - s0.time).toBeLessThanOrEqual(4 * 60);
    expect(unitOf(r.state, "t").stance).toBe("square");
  });

  it("期待挙動:条件付き命令で、騎兵が近づいたときだけ方陣を組む(歩兵には組まない)", () => {
    const order = { unitId: "t", conditional: { when: { type: "enemyDetected" as const, withinM: 900, branches: ["cavalry", "light_cavalry"] }, then: { stance: "square" } } };
    const run = (enemy: NewUnit) => {
      const s0 = newGameState([createUnit(line(1500, "standard")), createUnit(enemy)], 1);
      return resolveTurn(s0, [order], nap);
    };
    const cav = run(unit("cav", "fr", "nap-fr-cuir-bde", "cavalry", 1000));
    expect(cav.events.some((e) => e.type === "conditionalTriggered" && e.unitId === "t")).toBe(true);
    const foot = run(unit("foot", "fr", "nap-fr-line-bde", "line_infantry", 1000));
    expect(foot.events.some((e) => e.type === "conditionalTriggered" && e.unitId === "t")).toBe(false);
  });
});
