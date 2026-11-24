import { describe, expect, it } from "vitest";
import {
  buildScenario,
  computeFire,
  createUnit,
  firepowerFactors,
  factorProduct,
  moveSpeedMps,
  newGameState,
  parseBranchPack,
  parseRulePack,
  parseToePack,
  parseWeaponPack,
  resolveTurn,
  Rng,
  type GameState,
  type NewUnit,
  type SimContext,
  type Unit,
  volleyLoaded,
} from "../src/index.js";
import { loadPacks, loadScenarioJson, unitOf, unwrap, wideCtx } from "./helpers.js";

/**
 * 線形戦術の時代の違い(ユーザー判断 2026-11。docs/research/napoleonic-mechanics-review.md の A〜E):
 * 15分のターン、横隊の遅い機動と旋回・正面の変換、隊形の乱れ、斉射(最初の斉射・撃ち始める距離・弾薬)、士気の削り合い
 */
const packs = loadPacks();
const rules = unwrap(parseRulePack(packs.rules.napoleonic));
const nap: SimContext = {
  ...wideCtx,
  rules,
  branches: unwrap(parseBranchPack(packs.branches.napoleonic)),
  weapons: unwrap(parseWeaponPack(packs.weapons.napoleonic)),
  toes: unwrap(parseToePack(packs.toes.napoleonic)),
  turnSeconds: rules.time!.turnSeconds,
  stepSeconds: rules.time!.stepSeconds,
};
const ww2 = wideCtx;

const unit = (id: string, side: string, toe: string, branch: string, x: number, y: number, extra: Partial<NewUnit> = {}): NewUnit => ({
  id, side, toe, branch, pos: { x, y }, facing: side === "fr" ? 90 : 270, stance: "standard", formation: "deployed", ...extra,
});
const frLine = (x: number, y = 3000, extra: Partial<NewUnit> = {}) => unit("fr", "fr", "nap-fr-line-bde", "line_infantry", x, y, extra);
const coLine = (x: number, y = 3000, extra: Partial<NewUnit> = {}) => unit("co", "co", "nap-at-line-bde", "line_infantry", x, y, extra);
const run = (s: GameState, orders: Parameters<typeof resolveTurn>[1] = []) => resolveTurn(s, orders, nap);

describe("A:15分のターン", () => {
  it("ナポレオン戦争のルールパックの陸のターンは15分・小ステップ30秒、展開は5分", () => {
    expect(rules.time).toEqual({ turnSeconds: 900, stepSeconds: 30, deploySeconds: 300 });
  });

  it("ルールパックと違うターンの長さのシナリオは読み込まない(プラツェン高地は15分で読み込める)", () => {
    const file = JSON.parse(JSON.stringify(loadScenarioJson("pratzen-1805-12-02")));
    expect(buildScenario(file, packs).ok).toBe(true);
    file.time.turnSeconds = 3600;
    file.time.stepSeconds = 60;
    const r = buildScenario(file, packs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain("900 秒");
  });

  it("期待挙動:縦隊から横隊への展開は5分で済む(1ターン=15分を待たない)", () => {
    const s0 = newGameState([createUnit(frLine(1000, 3000, { formation: "column" }))], 1);
    const r = run(s0, [{ unitId: "fr", waypoints: [{ x: 1100, y: 3000 }], moveMode: "combat" }]);
    const ev = r.events.find((e) => e.type === "formationChanged" && e.to === "deployed");
    expect(ev).toBeDefined();
    expect(ev!.t - s0.time).toBeLessThanOrEqual(6 * 60);
  });
});

describe("B:横隊の機動と旋回", () => {
  it("期待挙動:横隊は縦隊・散兵より遅く進む(二次大戦の展開した歩兵には隊形ごとの速さがない)", () => {
    const at = (stance: string) => moveSpeedMps({ ...createUnit(frLine(1000, 3000, { stance })), moveMode: "combat" }, { x: 2000, y: 3000 }, nap);
    expect(at("standard")).toBeLessThan(at("attack") * 0.7);
    expect(at("standard")).toBeLessThan(at("ambush"));
    for (const st of Object.values(ww2.rules.stances)) expect(st.moveSpeedMultiplier).toBe(1);
  });

  it("期待挙動:横隊が90度向きを変えると、縦隊に崩して展開し直す(正面の変換:10分かかり、その間は展開中で乱れる)", () => {
    const s0 = newGameState([createUnit(frLine(1000))], 1);
    const r = run(s0, [{ unitId: "fr", facingOnArrival: 0 }]);
    const ev = r.events.find((e) => e.type === "changeFront");
    expect(ev).toBeDefined();
    const deployed = r.events.find((e) => e.type === "formationChanged" && e.to === "deployed");
    expect(deployed).toBeDefined();
    expect(deployed!.t - ev!.t).toBeGreaterThanOrEqual(9.5 * 60);
    const u = unitOf(r.state, "fr");
    expect(u.facing).toBeCloseTo(0, 3);
    // 立て直しは続くが、まだ整列しきっていないか、少なくとも乱れたことがある
    expect(r.events.some((e) => e.type === "formationChanged" && e.to === "deploying")).toBe(true);
  });

  it("期待挙動:45度までは旋回で回り、数分かかる。突撃縦隊は向きをすぐ変えられる", () => {
    const s0 = newGameState([createUnit(frLine(1000))], 1);
    const r = resolveTurn(s0, [{ unitId: "fr", facingOnArrival: 130 }], { ...nap, turnSeconds: 60, stepSeconds: 30 });
    const u = unitOf(r.state, "fr");
    expect(r.events.some((e) => e.type === "changeFront")).toBe(false);
    // 1分では回りきれない(40度の旋回に数分)
    expect(u.facing).toBeGreaterThan(90.5);
    expect(u.facing).toBeLessThan(129);
    const col = newGameState([createUnit(frLine(1000, 3000, { stance: "attack" }))], 1);
    const r2 = resolveTurn(col, [{ unitId: "fr", facingOnArrival: 0 }], { ...nap, turnSeconds: 60, stepSeconds: 30 });
    expect(unitOf(r2.state, "fr").facing).toBeCloseTo(0, 3);
    expect(r2.events.some((e) => e.type === "changeFront")).toBe(false);
  });
});

describe("C:隊形の乱れ", () => {
  it("期待挙動:横隊で森を抜けると乱れ、乱れた部隊は火力が落ち、止まっていれば整列し直す", () => {
    // 森(x・y とも 5000〜6000m)を横隊のまま東へ抜ける
    const s0 = newGameState([createUnit(frLine(4900, 5500))], 1);
    const r = run(s0, [{ unitId: "fr", waypoints: [{ x: 5150, y: 5500 }], moveMode: "combat" }]);
    const u = unitOf(r.state, "fr");
    expect(u.route.length).toBe(0);
    expect(u.disorder ?? 0).toBeGreaterThan(0.3);
    const fp = (x: Unit) => factorProduct(firepowerFactors(x, nap));
    expect(fp(u)).toBeLessThan(fp({ ...u, disorder: 0 }) * 0.9);
    // 止まって15分:整列し直す
    const r2 = run(r.state, []);
    expect(unitOf(r2.state, "fr").disorder ?? 0).toBeLessThan((u.disorder ?? 0) - 0.3);
  });

  it("縦隊のまま抜ければ乱れない。乱れの決まりのないルールパック(WWI〜朝鮮戦争)では乱れない", () => {
    const s0 = newGameState([createUnit(frLine(4900, 5500, { formation: "column" }))], 1);
    const r = run(s0, [{ unitId: "fr", waypoints: [{ x: 5400, y: 5500 }], moveMode: "march" }]);
    expect(unitOf(r.state, "fr").disorder ?? 0).toBe(0);
    expect(ww2.rules.cohesion).toBeUndefined();
  });
});

describe("D:斉射", () => {
  const fire = (a: NewUnit, t: NewUnit, loaded: boolean) =>
    computeFire([createUnit(a), createUnit(t)], nap, Rng.fromSeed(1), new Set(), undefined, undefined, undefined, undefined, undefined, undefined, () => loaded).find((r) => r.attackerId === a.id);

  it("期待挙動:装填して待った最初の斉射は、撃ち合いの続いた後の斉射より効く", () => {
    const first = fire(frLine(1000), coLine(1050), true)!;
    const later = fire(frLine(1000), coLine(1050), false)!;
    expect(first.damage / later.damage).toBeGreaterThan(1.5);
    expect(first.situational?.some((f) => f.id === "firstVolley")).toBe(true);
  });

  it("期待挙動:標準の練度は 150m では撃たずに待ち、未熟な部隊は撃ち始める", () => {
    // 撃つのは散兵(斉射でないライフル)だけ。マスケットの斉射は撃たない
    const regular = fire(frLine(1000), coLine(1150), true)?.damage ?? 0;
    const green = fire(frLine(1000, 3000, { training: "green" }), coLine(1150), true)?.damage ?? 0;
    expect(green).toBeGreaterThan(0);
    expect(regular).toBeLessThan(green * 0.3);
  });

  it("期待挙動:撃ち合いを続けると30分ほどで弾が尽き、撃てなくなる", () => {
    // 補給のない撃ち合い(集積所なし)。互いに 80m で撃ち合う
    let s = newGameState([createUnit(frLine(1000)), createUnit(coLine(1080))], 1);
    s = run(s).state;
    const after15 = unitOf(s, "fr").ammo;
    expect(after15).toBeLessThan(0.7);
    s = run(s).state;
    s = run(s).state;
    expect(unitOf(s, "fr").ammo).toBeLessThan(0.05);
  });

  it("期待挙動:撃った部隊は装填が乱れ、撃たずに5分待てば最初の斉射に戻る", () => {
    const s0 = newGameState([createUnit(frLine(1000)), createUnit(coLine(1080))], 1);
    const r = resolveTurn(s0, [], { ...nap, turnSeconds: 60, stepSeconds: 30 });
    const fr = unitOf(r.state, "fr");
    expect(fr.volleyFiredAt).toBeDefined();
    expect(volleyLoaded(fr, fr.volleyFiredAt! + 60, nap)).toBe(false);
    expect(volleyLoaded(fr, fr.volleyFiredAt! + 5 * 60, nap)).toBe(true);
  });
});

describe("E:士気の削り合い", () => {
  it("期待挙動:マスケットの近い距離の斉射は、戦力よりも士気を大きく削る", () => {
    // 50m の撃ち合いの1ターン
    const s0 = newGameState([createUnit(frLine(1000)), createUnit(coLine(1050))], 1);
    const r = resolveTurn(s0, [], { ...nap, turnSeconds: 120, stepSeconds: 30 });
    const co = unitOf(r.state, "co");
    const strengthLost = 1 - co.strength;
    const moraleLost = 1 - co.morale;
    expect(moraleLost).toBeGreaterThan(strengthLost * 15);
  });

  it("近い距離ほど士気への打撃が大きい(武器の距離帯の moraleEffect)", () => {
    const mk = (d: number) => {
      const r = computeFire([createUnit(frLine(1000, 3000, { training: "green" })), createUnit(coLine(1000 + d))], nap, Rng.fromSeed(1), new Set()).find((x) => x.attackerId === "fr")!;
      return r.moraleMultiplier ?? 1;
    };
    expect(mk(40)).toBeGreaterThan(mk(150) * 1.5);
  });
});
