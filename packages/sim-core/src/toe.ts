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
  /** 携行備蓄の上限と燃料消費。装備編成の「補給量スロット」ができるまでは編成表に直接書く */
  supply: z
    .object({
      ammoCapacityT: z.number().min(0),
      fuelCapacityT: z.number().min(0),
      /** 移動1kmあたりの燃料消費(トン)。0なら燃料を使わない(徒歩) */
      fuelPerKmT: z.number().min(0),
    })
    .refine((s) => s.fuelPerKmT === 0 || s.fuelCapacityT > 0, {
      message: "燃料を使う編成(fuelPerKmT > 0)は fuelCapacityT も 0 より大きくしてください",
    }),
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
  return toeFire(toe, weapons, d, armorRatio, false).firepower;
}

/**
 * 火力と、その火力の制圧のしやすさ(武器ごとの suppression を火力で重みづけした平均)。
 * indirect で直接射撃・間接射撃を選ぶ
 */
export function toeFire(toe: Toe, weapons: WeaponPack, d: number, armorRatio: number, indirect: boolean): { firepower: number; suppression: number } {
  let total = 0;
  let weighted = 0;
  for (const e of toe.elements) {
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (w.indirect !== indirect) continue;
      const power = weaponPowerAt(w, d);
      if (power === 0) continue;
      const f = e.count * ref.count * power * weaponEffectAgainst(w, armorRatio);
      total += f;
      weighted += f * w.suppression;
    }
  }
  return { firepower: total, suppression: total > 0 ? weighted / total : 1 };
}

/** 直接射撃の最大射程(直接射撃の武器がなければ0) */
export function toeDirectMaxRange(toe: Toe, weapons: WeaponPack): number {
  return maxRange(toe, weapons, false);
}

/** 間接射撃の最大射程(間接射撃の武器がなければ0) */
export function toeIndirectMaxRange(toe: Toe, weapons: WeaponPack): number {
  return maxRange(toe, weapons, true);
}

function maxRange(toe: Toe, weapons: WeaponPack, indirect: boolean): number {
  let max = 0;
  for (const e of toe.elements) {
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (w.indirect === indirect) max = Math.max(max, weaponMaxRange(w));
    }
  }
  return max;
}

/** 満員のときに、距離 d の地点へ撃ち込む1分あたりの間接射撃の火力(装甲化率 armorRatio の目標に対して) */
export function toeIndirectFirepower(toe: Toe, weapons: WeaponPack, d: number, armorRatio: number): number {
  return toeFire(toe, weapons, d, armorRatio, true).firepower;
}

/** 間接射撃で撃っている間の弾薬消費(トン/分)。射程内の武器だけ */
export function toeIndirectAmmoPerMin(toe: Toe, weapons: WeaponPack, d: number): number {
  let total = 0;
  for (const e of toe.elements) {
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (w.indirect && weaponMaxRange(w) >= d) total += e.count * ref.count * w.ammoPerMin;
    }
  }
  return total;
}
