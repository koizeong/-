import { describe, expect, it } from "vitest";
import { applyBundle, buildTemplate, designWeapon, parseCustomBundle, toeCost, weaponCost, type RegimentTemplate } from "../src/index.js";
import { loadPacks, unwrap } from "./helpers.js";

const packs = loadPacks();
const rules = packs.rules["ww1-korea"]!;
const dev = rules.development!;
const weapons = packs.weapons["ww1-korea-generic"]!;
const toes = packs.toes["ww1-korea-generic"]!;
const branches = packs.branches["ww1-korea"]!;

describe("点数", () => {
  it("射程が長く火力の大きい武器ほど点が高い(小銃 < 機関銃 < 戦車砲 < 駆逐戦車の主砲)", () => {
    const c = (id: string) => weaponCost(weapons.weapons[id]!, dev.cost);
    expect(c("small_arms")).toBeLessThan(c("machine_gun"));
    expect(c("machine_gun")).toBeLessThan(c("tank_gun"));
    expect(c("tank_gun")).toBeLessThan(c("td_gun"));
  });

  it("編成表の点数:戦車連隊は歩兵連隊より高い", () => {
    const c = (id: string) => toeCost(toes.toes[id]!, weapons, dev.cost);
    expect(c("infantry_regiment")).toBeGreaterThan(0);
    expect(c("panzer_regiment")).toBeGreaterThan(c("infantry_regiment"));
  });
});

describe("武器の開発", () => {
  it("基準の値のままなら、元の武器と同じ性能", () => {
    const w = unwrap(designWeapon({ name: "基準", archetype: "gun", params: {} }, dev));
    expect(w.bands).toEqual(dev.archetypes["gun"]!.reference.bands);
  });

  it("期待挙動:口径・砲身長を上げると貫通力が上がり、弾が重くなり、点数が上がる", () => {
    const base = unwrap(designWeapon({ name: "75mm", archetype: "gun", params: {} }, dev));
    const big = unwrap(designWeapon({ name: "88mm 長砲身", archetype: "gun", params: { caliberMm: 88, lengthCal: 71 } }, dev));
    expect(big.bands[0]!.penetrationMm!).toBeGreaterThan(base.bands[0]!.penetrationMm! * 1.5);
    expect(big.ammoPerMin).toBeGreaterThan(base.ammoPerMin);
    expect(weaponCost(big, dev.cost)).toBeGreaterThan(weaponCost(base, dev.cost));
  });

  it("時代の上限を超える値・ない型・調整できない値は誤り", () => {
    expect(designWeapon({ name: "x", archetype: "gun", params: { caliberMm: 128 } }, dev).ok).toBe(false);
    expect(designWeapon({ name: "x", archetype: "laser", params: {} }, dev).ok).toBe(false);
    expect(designWeapon({ name: "x", archetype: "gun", params: { rateRpm: 600 } }, dev).ok).toBe(false);
  });
});

describe("連隊テンプレート", () => {
  const tpl = (over: Partial<RegimentTemplate> = {}): RegimentTemplate => ({
    name: "重戦車連隊",
    baseToe: "panzer_regiment",
    elements: [{ name: "重戦車中隊", count: 4, hitPoints: 100, armored: true, armorMm: { front: 120, side: 60 }, weapons: [{ weapon: "user:g88", count: 4 }] }],
    ...over,
  });
  const bundle = { version: 1 as const, designs: { g88: { name: "88mm砲", archetype: "gun", params: { caliberMm: 88, lengthCal: 56 } } }, templates: { heavy: tpl() } };

  it("開発した武器を載せたテンプレートが、user: の編成表になる(兵科・補給は元の編成表から)", () => {
    const r = unwrap(applyBundle(unwrap(parseCustomBundle(bundle)), dev, weapons, toes, branches));
    expect(r.weapons.weapons["user:g88"]!.name).toBe("88mm砲");
    const t = r.toes.toes["user:heavy"]!;
    expect(t.branch).toBe("armor");
    expect(t.supply).toEqual(toes.toes["panzer_regiment"]!.supply);
    expect(t.elements[0]!.weapons[0]!.weapon).toBe("user:g88");
  });

  it("上限(要素の数・耐久・装甲厚)を超えるテンプレートと、ない武器を指すテンプレートは誤り", () => {
    const w = unwrap(applyBundle(unwrap(parseCustomBundle({ ...bundle, templates: {} })), dev, weapons, toes, branches)).weapons;
    const el = tpl().elements[0]!;
    expect(buildTemplate(tpl({ elements: [{ ...el, count: dev.template.maxElements + 1 }] }), toes, w, branches, dev).ok).toBe(false);
    expect(buildTemplate(tpl({ elements: [{ ...el, hitPoints: 1000 }] }), toes, w, branches, dev).ok).toBe(false);
    expect(buildTemplate(tpl({ elements: [{ ...el, armorMm: { front: 500, side: 60 } }] }), toes, w, branches, dev).ok).toBe(false);
    expect(buildTemplate(tpl({ elements: [{ ...el, weapons: [{ weapon: "user:none", count: 1 }] }] }), toes, w, branches, dev).ok).toBe(false);
    expect(buildTemplate(tpl({ baseToe: "nope" }), toes, w, branches, dev).ok).toBe(false);
    expect(buildTemplate(tpl(), toes, w, branches, dev).ok).toBe(true);
  });
});
