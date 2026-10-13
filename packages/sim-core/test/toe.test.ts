import { describe, expect, it } from "vitest";
import { toeDirectFirepower, toeDirectMaxRange, toeHitPoints, weaponEffectAgainst, weaponPowerAt } from "../src/index.js";
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
  it("耐久は要素の合計", () => {
    expect(toeHitPoints(infantry)).toBe(9 * 100 + 3 * 60);
  });

  it("武器の効果は目標の装甲化率で按分する", () => {
    const tankGun = weapons.weapons.tank_gun!;
    expect(weaponEffectAgainst(tankGun, 0)).toBe(tankGun.effectiveness.soft);
    expect(weaponEffectAgainst(tankGun, 1)).toBe(tankGun.effectiveness.armored);
    expect(weaponEffectAgainst(tankGun, armor.armorRatio)).toBeCloseTo(
      tankGun.effectiveness.soft * (1 - armor.armorRatio) + tankGun.effectiveness.armored * armor.armorRatio,
    );
  });

  it("装甲化率が高い目標ほど、歩兵の火力は効かない", () => {
    const at = (r: number) => toeDirectFirepower(infantry, weapons, 500, r);
    expect(at(0)).toBeGreaterThan(at(armor.armorRatio));
    expect(at(armor.armorRatio)).toBeGreaterThan(at(td.armorRatio));
  });

  it("火力は距離が離れるほど下がり、直接射撃の最大射程の外では0", () => {
    const near = toeDirectFirepower(infantry, weapons, 200, 0);
    const mid = toeDirectFirepower(infantry, weapons, 800, 0);
    const max = toeDirectMaxRange(infantry, weapons);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(0);
    expect(toeDirectFirepower(infantry, weapons, max + 1, 0)).toBe(0);
  });

  it("対戦車火力の差:戦車駆逐は装甲目標に強く、歩兵は装甲目標に弱い", () => {
    expect(toeDirectFirepower(td, weapons, 1000, 1)).toBeGreaterThan(toeDirectFirepower(td, weapons, 1000, 0));
    expect(toeDirectFirepower(infantry, weapons, 1000, 1)).toBeLessThan(toeDirectFirepower(infantry, weapons, 1000, 0));
  });

  it("間接射撃の武器は直接射撃の火力・射程に含めない", () => {
    expect(toeDirectMaxRange(artillery, weapons)).toBe(1000); // 自衛用の小火器だけ
    expect(toeDirectFirepower(artillery, weapons, 5000, 0)).toBe(0);
  });
});
