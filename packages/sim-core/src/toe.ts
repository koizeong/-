import { z } from "zod";
import { parseWith, type ParseResult } from "./rulepack.js";
import { weaponMaxRange, weaponPenetrationAt, weaponPowerAt, type Weapon, type WeaponPack } from "./weapon.js";

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
  /**
   * 装甲の要素(戦車中隊など)。どれかの要素に true があると、その編成表は「装甲の部分」と「非装甲の部分」を分けて持つ:
   * 撃たれると武器の効果(非装甲・装甲)に応じてそれぞれが減り、減った部分の武器は撃てなくなる。
   * 機関銃は随伴歩兵を削れても戦車は削れず、歩兵がいなくなった戦車連隊には対戦車の武器しか効かない。
   * どの要素にもなければ、編成表の armorRatio で按分する(半装軌車の歩兵など、要素を分けられないもの)
   */
  armored: z.boolean().optional(),
  /**
   * 装甲の厚さ(mm、傾斜を含めた実質の厚さ)。正面・側面・背後(省略は側面と同じ)。書くと、貫通力を持つ武器の効き目が
   * 貫通力 ÷ 装甲 で決まる。装甲の要素(armored)に書く
   */
  armorMm: z.object({ front: z.number().positive(), side: z.number().positive(), rear: z.number().positive().optional() }).optional(),
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
  /**
   * 正面幅(m)。展開したときに受け持つ帯の幅(frontage.ts)。阻止圏・射撃の距離と向き・戦闘正面幅・砲撃の当たり方に効く。
   * 省略は0(点として扱う)
   */
  frontageM: z.number().min(0).default(0),
  /** 揚陸能力(川・海のセルを渡れる。陸上は車両と同じ扱い。省略は false) */
  amphibious: z.boolean().default(false),
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

/**
 * 装甲の要素が耐久に占める割合(装甲の部分と非装甲の部分を分けて持つ編成表だけ)。分けない編成表は null
 */
export function toeArmoredShare(toe: Toe): number | null {
  if (!toe.elements.some((e) => e.armored)) return null;
  const total = toeHitPoints(toe);
  return total > 0 ? toe.elements.filter((e) => e.armored).reduce((s, e) => s + e.count * e.hitPoints, 0) / total : null;
}

/** 満員のときの耐久の合計 */
export function toeHitPoints(toe: Toe): number {
  return toe.elements.reduce((s, e) => s + e.count * e.hitPoints, 0);
}

/** 装甲化率 armorRatio の目標に対する武器の効果 */
export function weaponEffectAgainst(w: Weapon, armorRatio: number, armoredFactor = 1): number {
  return w.effectiveness.soft * (1 - armorRatio) + w.effectiveness.armored * armoredFactor * armorRatio;
}

export interface PenetrationRules {
  lowRatio: number;
  highRatio: number;
  minFactor: number;
}

/** 貫通力 ÷ 装甲 の比から、装甲の部分への効き目の倍率(lowRatio 以下で minFactor、highRatio 以上で1) */
export function penetrationFactor(penetrationMm: number, armorMm: number, r: PenetrationRules): number {
  const ratio = penetrationMm / armorMm;
  if (ratio >= r.highRatio) return 1;
  if (ratio <= r.lowRatio) return r.minFactor;
  return r.minFactor + ((1 - r.minFactor) * (ratio - r.lowRatio)) / (r.highRatio - r.lowRatio);
}

const armorCache = new WeakMap<Toe, { front: number; side: number; rear: number } | null>();
/**
 * 編成表の装甲の厚さ(装甲の要素の厚さを、耐久で重みづけした平均。正面・側面・背後)。どの要素にも書かれていなければ null
 */
export function toeArmorMm(toe: Toe): { front: number; side: number; rear: number } | null {
  if (armorCache.has(toe)) return armorCache.get(toe)!;
  let w = 0;
  const sum = { front: 0, side: 0, rear: 0 };
  for (const e of toe.elements) {
    if (!e.armorMm) continue;
    const k = e.count * e.hitPoints;
    w += k;
    sum.front += e.armorMm.front * k;
    sum.side += e.armorMm.side * k;
    sum.rear += (e.armorMm.rear ?? e.armorMm.side) * k;
  }
  const out = w > 0 ? { front: sum.front / w, side: sum.side / w, rear: sum.rear / w } : null;
  armorCache.set(toe, out);
  return out;
}

/** 貫通力を書いた直接射撃の武器を持つか */
export function toeHasPenetration(toe: Toe, weapons: WeaponPack): boolean {
  return toe.elements.some((e) => e.weapons.some((ref) => weapons.weapons[ref.weapon]!.bands.some((b) => b.penetrationMm !== undefined)));
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
export function toeFire(
  toe: Toe,
  weapons: WeaponPack,
  d: number,
  armorRatio: number,
  indirect: boolean,
  /** 要素ごとの火力の倍率(装甲・非装甲の部分の残り具合。省略は1) */
  elementWeight?: (e: ToeElement) => number,
  /** 撃たれる面の装甲の厚さ(mm)と貫通の規則。貫通力を持つ武器の、装甲の部分への効き目に効く */
  armor?: { mm: number; rules: PenetrationRules },
): { firepower: number; suppression: number } {
  let total = 0;
  let weighted = 0;
  for (const e of toe.elements) {
    const k = elementWeight ? elementWeight(e) : 1;
    if (k <= 0) continue;
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (w.indirect !== indirect) continue;
      const power = weaponPowerAt(w, d);
      if (power === 0) continue;
      const pen = armor ? weaponPenetrationAt(w, d) : undefined;
      const effect = pen === undefined ? weaponEffectAgainst(w, armorRatio) : weaponEffectAgainst(w, armorRatio, penetrationFactor(pen, armor!.mm, armor!.rules));
      const f = k * e.count * ref.count * power * effect;
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
