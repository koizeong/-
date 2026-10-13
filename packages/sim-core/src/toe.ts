import { z } from "zod";
import { parseWith, type ParseResult } from "./rulepack.js";
import { weaponMaxRange, weaponPowerAt, type Weapon, type WeaponPack } from "./weapon.js";

/**
 * 編成表(TO&E)。ユニットの能力はここと武器データから導出する(設計ルール5)。
 * 要素(中隊など)の数と、要素ごとの武器・耐久、編成全体の装甲化率を持つ。
 */
export const ToeElementSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
  /** 1要素あたりの耐久(損害ポイント)。ユニット全体の耐久はこの合計 */
  hitPoints: z.number().positive(),
  weapons: z.array(z.object({ weapon: z.string().min(1), count: z.number().int().positive() })),
});

export const ToeSchema = z.object({
  name: z.string().min(1),
  /** 兵科ID(兵科パックのキー) */
  branch: z.string().min(1),
  /** 装甲化率(0〜1)。撃たれたときに、武器の装甲への効果がこの割合で効く */
  armorRatio: z.number().min(0).max(1),
  elements: z.array(ToeElementSchema).min(1),
});

export const ToePackSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  toes: z.record(z.string(), ToeSchema),
});

export type ToeElement = z.infer<typeof ToeElementSchema>;
export type Toe = z.infer<typeof ToeSchema>;
export type ToePack = z.infer<typeof ToePackSchema>;

export function parseToePack(input: unknown): ParseResult<ToePack> {
  return parseWith(ToePackSchema, input);
}

/** 満員のときの耐久の合計 */
export function toeHitPoints(toe: Toe): number {
  return toe.elements.reduce((s, e) => s + e.count * e.hitPoints, 0);
}

/** 装甲化率 armorRatio の目標に対する武器の効果 */
export function weaponEffectAgainst(w: Weapon, armorRatio: number): number {
  return w.effectiveness.soft * (1 - armorRatio) + w.effectiveness.armored * armorRatio;
}

/**
 * 満員のときに、距離 d で装甲化率 armorRatio の目標へ与える1分あたりの直接射撃の火力。
 * 武器ごとに「射程帯の火力 × 装甲化率で按分した効果」を合計する。
 */
export function toeDirectFirepower(toe: Toe, weapons: WeaponPack, d: number, armorRatio: number): number {
  let total = 0;
  for (const e of toe.elements) {
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (w.indirect) continue;
      const power = weaponPowerAt(w, d);
      if (power === 0) continue;
      total += e.count * ref.count * power * weaponEffectAgainst(w, armorRatio);
    }
  }
  return total;
}

/** 直接射撃の最大射程(直接射撃の武器がなければ0) */
export function toeDirectMaxRange(toe: Toe, weapons: WeaponPack): number {
  let max = 0;
  for (const e of toe.elements) {
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (!w.indirect) max = Math.max(max, weaponMaxRange(w));
    }
  }
  return max;
}
