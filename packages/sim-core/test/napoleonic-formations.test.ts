import { describe, expect, it } from "vitest";
import { computeFire, createUnit, newGameState, parseBranchPack, parseRulePack, parseToePack, parseWeaponPack, resolveTurn, Rng, screenOf, shockStandChance, smokeFireMultiplier, type NewUnit, type SimContext } from "../src/index.js";
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

describe("士気の衝撃(突撃)", () => {
  const cav = (x: number, facing = 90) => createUnit(unit("cav", "fr", "nap-fr-cuir-bde", "cavalry", x, { stance: "charge", facing }));
  const foot = (stance: string, facing = 270) => createUnit(unit("t", "co", "nap-at-line-bde", "line_infantry", 1080, { stance, facing }));
  const chance = (a: ReturnType<typeof cav>, t: ReturnType<typeof foot>) => shockStandChance(a, t, 1, nap);

  it("期待挙動:方陣は騎兵の突撃に踏みとどまり、散開した散兵は蹴散らされる", () => {
    expect(chance(cav(1000), foot("square"))).toBeGreaterThan(0.9);
    expect(chance(cav(1000), foot("ambush"))).toBeLessThan(0.15);
    expect(chance(cav(1000), foot("square"))).toBeGreaterThan(chance(cav(1000), foot("standard")));
  });

  it("期待挙動:横隊は側面・背後から突かれると崩れやすい", () => {
    // 守り手は北(0度)を向き、騎兵は東(側面)から
    const t = foot("standard", 0);
    expect(chance(cav(1000), t)).toBeLessThan(chance(cav(1000), foot("standard", 270)));
  });

  it("期待挙動:撃ち合いで制圧され士気の下がった守り手は、銃剣の突撃に崩れやすい", () => {
    const col = createUnit(unit("col", "fr", "nap-fr-line-bde", "line_infantry", 1000, { stance: "attack" }));
    const fresh = foot("standard");
    const worn = foot("standard");
    worn.morale = 0.5;
    worn.suppression = 0.6;
    expect(shockStandChance(col, worn, 1, nap)).toBeLessThan(shockStandChance(col, fresh, 1, nap));
  });

  it("期待挙動:騎兵の突撃を方陣で受けると、撃退されて騎兵が士気を失う(ターンを解く)", () => {
    const s0 = newGameState([createUnit(unit("t", "co", "nap-at-line-bde", "line_infantry", 1500, { stance: "square" })), createUnit(unit("cav", "fr", "nap-fr-cuir-bde", "cavalry", 900, { stance: "charge" }))], 1);
    const r = resolveTurn(s0, [{ unitId: "cav", waypoints: [{ x: 1500, y: 1000 }], moveMode: "combat" }], nap);
    const a = r.events.find((e) => e.type === "assault" && e.unitId === "cav");
    expect(a).toBeDefined();
    expect(unitOf(r.state, "t").routed).toBe(false);
  });
});

describe("硝煙と散兵の幕", () => {
  it("期待挙動:撃ち合いが続くと硝煙がたまって当たりが下がり、撃つのをやめると晴れる", () => {
    const s0 = newGameState([createUnit(unit("fr", "fr", "nap-fr-line-bde", "line_infantry", 1000)), createUnit(line(1090, "standard"))], 1);
    const r1 = resolveTurn(s0, [], nap);
    const a = unitOf(r1.state, "fr");
    expect(a.smoke ?? 0).toBeGreaterThan(0.3);
    expect(smokeFireMultiplier(a, unitOf(r1.state, "t"), nap)).toBeLessThan(0.9);
    // 撃ち合わない(離れた)まま1時間たつと晴れる
    const apart = { ...r1.state, units: r1.state.units.map((u) => (u.id === "t" ? { ...u, pos: { x: 5000, y: 1000 } } : u)) };
    const r2 = resolveTurn(apart, [], nap);
    expect(unitOf(r2.state, "fr").smoke ?? 0).toBeLessThan(0.05);
  });

  it("書かないルールパック(WWI〜朝鮮戦争)では硝煙はたまらない", () => {
    expect(wideCtx.rules.combat.smoke).toBeUndefined();
  });

  it("期待挙動:散兵の幕を張った部隊は、幕のない相手から遠くで撃たれる損害が小さい(近い距離・騎兵・方陣では効かない)", () => {
    const fr = (stance: string) => createUnit(unit("t", "fr", "nap-fr-light-bde", "line_infantry", 1180, { stance, facing: 270 }));
    // 180m から撃つのは、遠くから撃ち始める未熟な部隊(標準の練度は 120m まで撃たずに待つ。combat.volley.openFireM)
    const at = createUnit(unit("a", "co", "nap-at-line-bde", "line_infantry", 1000, { facing: 90, training: "green" }));
    expect(screenOf(fr("standard"), nap)).toBeGreaterThan(0.9);
    expect(screenOf(fr("square"), nap)).toBe(0);
    const screenK = (t: ReturnType<typeof fr>, shooter = at) =>
      computeFire([shooter, t], nap, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === shooter.id)!.situational?.find((f) => f.id === "screen")?.value ?? 1;
    // 遠く(180m)からの撃ち合い:幕が損害を減らす
    expect(screenK(fr("standard"))).toBeLessThan(0.7);
    // 方陣では幕を張らない
    expect(screenK(fr("square"))).toBe(1);
    // 近い距離(80m)では効かない
    const near = createUnit(unit("t", "fr", "nap-fr-light-bde", "line_infantry", 1080, { facing: 270 }));
    expect(screenK(near)).toBe(1);
    // 相手にも幕があれば打ち消し合う
    const grenz = createUnit(unit("a", "co", "nap-at-grenz-bde", "light_infantry", 1000, { facing: 90, training: "green" }));
    expect(screenK(fr("standard"), grenz)).toBe(1);
  });
});
