import { describe, expect, it } from "vitest";
import { applyBundle, buildTemplate, customizeScenario, customizeScenarioSides, designWeapon, parseCustomBundle, toeCost, weaponCost, type RegimentTemplate } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "./helpers.js";

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

describe("部隊の差し替え(customizeScenario)", () => {
  const input = { ...(loadScenarioJson("test-symmetric") as Record<string, unknown>), customization: { us: { units: ["us-inf1", "us-arm"], budgetMultiplier: 1.1 } } };
  const light: RegimentTemplate = {
    name: "軽歩兵連隊",
    baseToe: "infantry_regiment",
    elements: [{ name: "小銃中隊", count: 9, hitPoints: 100, weapons: [{ weapon: "small_arms", count: 4 }, { weapon: "user:mg", count: 1 }] }],
  };
  const bundle = unwrap(parseCustomBundle({ version: 1, designs: { mg: { name: "高速機関銃", archetype: "machine_gun", params: { rateRpm: 1200 } } }, templates: { light } }));

  it("許された部隊をテンプレートに差し替えて始められる(ほかの部隊・相手の陣営はそのまま)", () => {
    const r = unwrap(customizeScenario(input, packs, "us", bundle, { "us-inf1": "light" }));
    const s = r.scenario.start(1);
    expect(s.units.find((u) => u.id === "us-inf1")!.toe).toBe("user:light");
    expect(s.units.find((u) => u.id === "us-inf2")!.toe).toBe("infantry_regiment");
    expect(r.scenario.ctx.weapons.weapons["user:mg"]!.name).toBe("高速機関銃");
    expect(r.budget.used).toBeLessThanOrEqual(r.budget.limit);
    // 持ち込みの中身が違えばハッシュも違う
    const plain = unwrap(customizeScenario(input, packs, "us", bundle, {}));
    expect(plain.scenario.hash).not.toBe(r.scenario.hash);
  });

  it("許されていない部隊・兵科の違うテンプレート・許されていない陣営・点数の超過は誤り", () => {
    expect(customizeScenario(input, packs, "us", bundle, { "us-inf2": "light" }).ok).toBe(false);
    expect(customizeScenario(input, packs, "us", bundle, { "us-arm": "light" }).ok).toBe(false);
    expect(customizeScenario(input, packs, "de", bundle, {}).ok).toBe(false);
    const heavy: RegimentTemplate = { ...light, elements: [{ ...light.elements[0]!, count: 16, weapons: [{ weapon: "user:mg", count: 8 }] }] };
    const r = customizeScenario(input, packs, "us", { ...bundle, templates: { heavy } }, { "us-inf1": "heavy" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("点数が上限を超えています");
  });
});

describe("両陣営の装備編成(オンライン対戦)", () => {
  it("両陣営が同じIDのテンプレートを持ち込んでも重ならず、それぞれの部隊に入る", () => {
    const input = { ...(loadScenarioJson("test-symmetric") as Record<string, unknown>), customization: { us: { units: "all" }, de: { units: "all" } } };
    const el = toes.toes["infantry_regiment"]!.elements;
    const mk = (n: number) =>
      unwrap(
        parseCustomBundle({
          version: 1,
          designs: { mg: { name: `機関銃${n}`, archetype: "machine_gun", params: { rateRpm: 500 + n * 100 } } },
          templates: { t: { name: `連隊${n}`, baseToe: "infantry_regiment", elements: [{ ...el[0]!, count: 8, weapons: [{ weapon: "user:mg", count: 1 }] }] } },
        }),
      );
    const r = unwrap(customizeScenarioSides(input, packs, { us: { bundle: mk(1), subs: { "us-inf1": "t" } }, de: { bundle: mk(2), subs: { "de-inf1": "t" } } }));
    const s = r.scenario.start(1);
    expect(s.units.find((u) => u.id === "us-inf1")!.toe).toBe("user:us:t");
    expect(s.units.find((u) => u.id === "de-inf1")!.toe).toBe("user:de:t");
    expect(r.scenario.ctx.toes.toes["user:de:t"]!.elements[0]!.weapons[0]!.weapon).toBe("user:de:mg");
    expect(r.scenario.ctx.weapons.weapons["user:us:mg"]!.name).toBe("機関銃1");
    // 相手の陣営の部隊は差し替えられない
    expect(customizeScenarioSides(input, packs, { us: { bundle: mk(1), subs: { "de-inf1": "t" } } }).ok).toBe(false);
  });
});
