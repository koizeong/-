import { describe, expect, it } from "vitest";
import { checkToe, toeFire, toeHitPoints, weaponPenetrationAt, type Toe } from "../src/index.js";
import { loadPacks } from "./helpers.js";

/**
 * 国ごとの装備品パック(実数の編成表)が、汎用の編成表と強さの桁がそろっているかを確かめる(docs/research/equipment-calibration.md)。
 * 実数の部隊は汎用の抽象の部隊より人員が多いことがあるので、幅は広め(半分〜3倍)
 */
const packs = loadPacks();
const weapons = { id: "*", weapons: Object.assign({}, ...Object.values(packs.weapons).map((w) => w.weapons)) };
const branches = { id: "*", branches: Object.assign({}, ...Object.values(packs.branches).map((b) => b.branches)) };
const toes: Record<string, Toe> = Object.assign({}, ...Object.values(packs.toes).map((t) => t.toes));
const fire = (id: string, d: number, armored = 0, indirect = false) => toeFire(toes[id]!, weapons, d, armored, indirect).firepower;

/** [国の編成表, 比べる汎用の編成表, 比べる量] */
const PAIRS: [string, string, "soft300" | "armored500" | "indirect"][] = [
  ["de-ir-1939", "infantry_regiment", "soft300"],
  ["de-gr-1944", "infantry_regiment", "soft300"],
  ["de-vgr-1944", "infantry_regiment", "soft300"],
  ["de-ir-1918", "infantry_regiment", "soft300"],
  ["de-panther-abt-1944", "tank_battalion", "armored500"],
  ["de-pz4-abt-1944", "tank_battalion", "armored500"],
  ["de-pz-abt-1940", "tank_battalion", "armored500"],
  ["de-stug-brigade-1944", "tank_destroyer_battalion", "armored500"],
  ["de-jgpz-abt-1944", "tank_destroyer_battalion", "armored500"],
  ["de-pzgr-bn-1944", "mechanized_infantry_battalion", "soft300"],
  ["de-art-abt-lefh18", "artillery_battalion", "indirect"],
  ["de-art-abt-sfh18", "artillery_battalion", "indirect"],
  ["us-ir-1944", "infantry_regiment", "soft300"],
  ["us-ir-1918", "infantry_regiment", "soft300"],
  ["us-tank-bn-1944", "tank_battalion", "armored500"],
  ["us-tank-bn-1945", "tank_battalion", "armored500"],
  ["us-tank-bn-1950-m26", "tank_battalion", "armored500"],
  ["us-tank-bn-1950-e8", "tank_battalion", "armored500"],
  ["us-td-bn-m10", "tank_destroyer_battalion", "armored500"],
  ["us-td-bn-m18", "tank_destroyer_battalion", "armored500"],
  ["us-td-bn-m36", "tank_destroyer_battalion", "armored500"],
  ["us-armd-inf-bn-1944", "mechanized_infantry_battalion", "soft300"],
  ["us-fa-bn-105", "artillery_battalion", "indirect"],
  ["us-fa-bn-155", "artillery_battalion", "indirect"],
  ["su-rifle-regt-1942", "infantry_regiment", "soft300"],
  ["su-rifle-regt-1944", "infantry_regiment", "soft300"],
  ["su-tank-bde-1942", "armor_combat_command", "armored500"],
  ["su-tank-bde-1944", "armor_combat_command", "armored500"],
  ["su-heavy-tank-regt-1944", "tank_battalion", "armored500"],
  ["su-sp-regt-su76", "tank_destroyer_battalion", "armored500"],
  ["su-sp-regt-su85", "tank_destroyer_battalion", "armored500"],
  ["su-art-bn-zis3", "artillery_battalion", "indirect"],
  ["su-art-bn-m30", "artillery_battalion", "indirect"],
  ["uk-inf-bn-1944", "infantry_battalion", "soft300"],
  ["uk-inf-bde-1944", "infantry_regiment", "soft300"],
  ["uk-inf-bn-1941", "infantry_battalion", "soft300"],
  ["uk-armd-regt-1944", "tank_battalion", "armored500"],
  ["uk-churchill-regt-1944", "tank_battalion", "armored500"],
  ["uk-matilda-bn-1941", "tank_battalion", "armored500"],
  ["uk-atk-regt-1944", "tank_destroyer_battalion", "armored500"],
  ["uk-field-regt-25pdr", "artillery_battalion", "indirect"],
  ["jp-inf-regt-1941", "infantry_regiment", "soft300"],
  ["jp-inf-regt-1944", "infantry_regiment", "soft300"],
  ["jp-tank-regt-1941", "tank_battalion", "armored500"],
  ["jp-tank-regt-1944", "tank_battalion", "armored500"],
  ["us-pir-1944", "airborne_regiment", "soft300"],
  ["us-armd-team-1944", "armored_task_force", "armored500"],
  ["us-cc-1944", "armor_combat_command", "armored500"],
  ["de-pz-regt-1944", "panzer_regiment", "armored500"],
  ["de-pz-lehr-130-1944", "panzer_regiment", "armored500"],
  ["de-pzgr-regt-1944", "panzergrenadier_regiment", "soft300"],
  ["de-pzgr-regt-1944-spw", "panzergrenadier_regiment", "soft300"],
  ["de-fjr-1944", "volksgrenadier_regiment", "soft300"],
];
const measure = (id: string, m: (typeof PAIRS)[number][2]) => (m === "soft300" ? fire(id, 300) : m === "armored500" ? fire(id, 500, 1) : fire(id, 5000, 0, true));

describe("国ごとの装備品パック", () => {
  it("どの編成表も参照が切れていない(装備品から出した武器・兵科)", () => {
    for (const id of Object.keys(toes).filter((k) => /^(de|us|su|uk|jp)-/.test(k))) {
      const errors = checkToe(toes[id]!, weapons, branches).filter((x) => x.level === "error");
      expect(errors, id).toEqual([]);
    }
  });

  it.each(PAIRS)("%s の強さは汎用の %s の半分〜3倍(%s)", (id, generic, m) => {
    const r = measure(id, m) / measure(generic, m);
    expect(r).toBeGreaterThan(0.5);
    expect(r).toBeLessThan(3);
    const hp = toeHitPoints(toes[id]!) / toeHitPoints(toes[generic]!);
    expect(hp).toBeGreaterThan(0.4);
    expect(hp).toBeLessThan(3);
  });

  it("期待挙動:パンターは IV号 H型より正面の装甲が厚く、対装甲の火力も同じかそれ以上", () => {
    const panther = toes["de-panther-abt-1944"]!.elements.find((e) => e.armored)!;
    const pz4 = toes["de-pz4-abt-1944"]!.elements.find((e) => e.armored)!;
    expect(panther.armorMm!.front).toBeGreaterThan(pz4.armorMm!.front);
    expect(fire("de-panther-abt-1944", 1000, 1)).toBeGreaterThanOrEqual(fire("de-pz4-abt-1944", 1000, 1));
  });

  it("期待挙動:1944年の擲弾兵連隊は、1939年の歩兵連隊より人員が少ないが、近くの対装甲の火力(パンツァーファウスト・シュレック)は強い", () => {
    expect(toeHitPoints(toes["de-gr-1944"]!)).toBeLessThan(toeHitPoints(toes["de-ir-1939"]!));
    expect(fire("de-gr-1944", 50, 1)).toBeGreaterThan(fire("de-ir-1939", 50, 1));
  });

  it("期待挙動:朝鮮の M26 は 1944年の M4 より正面の装甲が厚く、1000m の対装甲の火力も強い", () => {
    const m26 = toes["us-tank-bn-1950-m26"]!.elements.find((e) => e.armored)!;
    const m4 = toes["us-tank-bn-1944"]!.elements.find((e) => e.armored)!;
    expect(m26.armorMm!.front).toBeGreaterThan(m4.armorMm!.front);
    expect(fire("us-tank-bn-1950-m26", 1000, 1)).toBeGreaterThan(fire("us-tank-bn-1944", 1000, 1));
  });

  it("期待挙動:M18 の大隊は M36 の大隊より対装甲の火力が弱く、装甲も薄い", () => {
    expect(fire("us-td-bn-m18", 1000, 1)).toBeLessThan(fire("us-td-bn-m36", 1000, 1));
    const m18 = toes["us-td-bn-m18"]!.elements.find((e) => e.armored)!;
    const m36 = toes["us-td-bn-m36"]!.elements.find((e) => e.armored)!;
    expect(m18.armorMm!.front).toBeLessThan(m36.armorMm!.front);
  });

  it("期待挙動:1944年の米歩兵連隊はバズーカと57mm で、1918年の連隊より近くの対装甲の火力がずっと強い", () => {
    expect(fire("us-ir-1944", 50, 1)).toBeGreaterThan(fire("us-ir-1918", 50, 1) * 3);
  });

  it("期待挙動:1944年の狙撃兵連隊は短機関銃が多く、100m では1942年の連隊より強いが 300m では弱い", () => {
    expect(fire("su-rifle-regt-1944", 100)).toBeGreaterThan(fire("su-rifle-regt-1942", 100));
    expect(fire("su-rifle-regt-1944", 300)).toBeLessThan(fire("su-rifle-regt-1942", 300));
  });

  it("期待挙動:T-34-85 の旅団は1942年の T-34 の旅団より 1000m の対装甲の火力が強い", () => {
    expect(fire("su-tank-bde-1944", 1000, 1)).toBeGreaterThan(fire("su-tank-bde-1942", 1000, 1));
  });

  it("期待挙動:チャーチル VII はクロムウェルより正面が厚く、ファイアフライのいる機甲連隊は 1000m の対装甲の火力が強い", () => {
    const churchill = toes["uk-churchill-regt-1944"]!.elements.find((e) => e.name.includes("チャーチル"))!;
    const cromwell = toes["uk-armd-regt-1944"]!.elements.find((e) => e.name.includes("クロムウェル"))!;
    expect(churchill.armorMm!.front).toBeGreaterThan(cromwell.armorMm!.front);
    expect(fire("uk-armd-regt-1944", 1000, 1)).toBeGreaterThan(fire("uk-churchill-regt-1944", 1000, 1));
  });

  it("期待挙動:新砲塔チハの 47mm は九七式中戦車の短砲身 57mm より 500m でよく貫く。独立速射砲大隊(牽引の47mm 18門)は自走の戦車駆逐大隊よりずっと弱い", () => {
    expect(weaponPenetrationAt(weapons.weapons["jp-type1-tank47"]!, 500)!).toBeGreaterThan(weaponPenetrationAt(weapons.weapons["jp-type97-57"]!, 500)!);
    expect(fire("jp-at-bn-1944", 500, 1)).toBeLessThan(fire("tank_destroyer_battalion", 500, 1) * 0.5);
  });

  it("期待挙動:日本の歩兵連隊(1941)は擲弾筒・軽機が多く、150m の火力は汎用の歩兵連隊より強い", () => {
    expect(fire("jp-inf-regt-1941", 150)).toBeGreaterThan(fire("infantry_regiment", 150));
  });
});
