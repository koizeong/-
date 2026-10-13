import { describe, expect, it } from "vitest";
import { toeDirectFirepower, toeDirectMaxRange, toeHitPoints, toeTargetMix, weaponPowerAt } from "../src/index.js";
import { toes, weapons } from "./helpers.js";

const infantry = toes.toes.infantry_regiment!;
const armor = toes.toes.armor_combat_command!;
const td = toes.toes.tank_destroyer_battalion!;
const artillery = toes.toes.artillery_battalion!;

describe("武器", () => {
  it("射程帯ごとの火力。射程外は0", () => {
    const mg = weapons.weapons.machine_gun!;
    expect(weaponPowerAt(mg, 100)).toBe(2.0);
    expect(weaponPowerAt(mg, 400)).toBe(2.0);
    expect(weaponPowerAt(mg, 401)).toBe(1.2);
    expect(weaponPowerAt(mg, 1800)).toBe(0.5);
    expect(weaponPowerAt(mg, 1801)).toBe(0);
  });
});

describe("編成表からの導出", () => {
  it("耐久は要素の合計、対象クラス構成は耐久の割合", () => {
    expect(toeHitPoints(infantry)).toBe(9 * 100 + 3 * 60);
    expect(toeTargetMix(infantry)).toEqual({ soft: 1 });
    const mix = toeTargetMix(armor);
    expect(mix.armored).toBeCloseTo(300 / 500);
    expect(mix.soft).toBeCloseTo(200 / 500);
  });

  it("火力は距離が離れるほど下がり、直接射撃の最大射程の外では0", () => {
    const soft = toeTargetMix(infantry);
    const near = toeDirectFirepower(infantry, weapons, 200, soft);
    const mid = toeDirectFirepower(infantry, weapons, 800, soft);
    const max = toeDirectMaxRange(infantry, weapons);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
    expect(toeDirectFirepower(infantry, weapons, max + 1, soft)).toBe(0);
  });

  it("対戦車火力の差:戦車駆逐は装甲目標に強く、歩兵は装甲目標に弱い", () => {
    const armored = toeTargetMix(td);
    const soft = toeTargetMix(infantry);
    expect(toeDirectFirepower(td, weapons, 1000, armored)).toBeGreaterThan(toeDirectFirepower(td, weapons, 1000, soft));
    expect(toeDirectFirepower(infantry, weapons, 1000, armored)).toBeLessThan(toeDirectFirepower(infantry, weapons, 1000, soft));
  });

  it("間接射撃の武器は直接射撃の火力・射程に含めない", () => {
    expect(toeDirectMaxRange(artillery, weapons)).toBe(1000); // 自衛用の小火器だけ
    expect(toeDirectFirepower(artillery, weapons, 5000, { soft: 1 })).toBe(0);
  });
});
