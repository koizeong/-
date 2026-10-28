import { describe, expect, it } from "vitest";
import { checkToe, toeFire, toeHitPoints, type Toe } from "../src/index.js";
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
});
