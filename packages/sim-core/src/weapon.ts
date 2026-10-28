import { z } from "zod";
import { parseWith, type ParseResult } from "./rulepack.js";

/** 射程帯。maxRangeM までの距離で power を発揮する(近い帯から順に並べる) */
export const RangeBandSchema = z.object({
  maxRangeM: z.number().positive(),
  /** 1分あたりの火力(損害ポイント) */
  power: z.number().min(0),
  /**
   * この距離帯での装甲の貫通力(mm、均質圧延鋼板)。書くと、装甲の厚さ(編成表の armorMm)を持つ目標への効き目が
   * 貫通力 ÷ 装甲 で決まる(ルールパックの combat.penetration)。省略すると、これまでどおり effectiveness.armored だけ
   */
  penetrationMm: z.number().positive().optional(),
});

export const WeaponSchema = z
  .object({
    name: z.string().min(1),
    bands: z.array(RangeBandSchema).min(1),
    /**
     * 目標への効果倍率。非装甲(soft)と装甲(armored)の2つを持ち、
     * 実際の効果は目標の装甲化率で按分する
     */
    effectiveness: z.object({ soft: z.number().min(0), armored: z.number().min(0) }),
    /** 間接射撃(砲兵など)。直接射撃の戦闘解決では撃たない */
    indirect: z.boolean(),
    /** 撃っている間の弾薬消費(トン/分、1門・1挺あたり) */
    ammoPerMin: z.number().min(0),
    /** 制圧のしやすさ(殺傷力に対する、制圧への効きの倍率。省略は1)。機関銃・砲兵は大きく、戦車砲は小さい */
    suppression: z.number().min(0).default(1),
    /** 対空の力(航空機に対して。省略は0)。対空砲を持つ部隊のまわりで空襲すると、機を失い効果が下がる */
    antiAir: z.number().min(0).default(0),
    /**
     * 陣地に強い(0〜1。省略は0)。この武器の火力については、目標の陣地の守り(受ける損害の陣地の倍率)をこの割合だけ打ち消す。
     * 火炎放射器、突撃砲・歩兵砲の直接照準の榴弾(トーチカ・機関銃座を潰す)
     */
    entrenchmentPierce: z.number().min(0).max(1).default(0),
    /** 曲射(省略は false)。直接射撃だが、間の部隊にさえぎられない(擲弾筒・迫撃砲など、弧を描いて届く) */
    arcing: z.boolean().default(false),
  })
  .superRefine((w, ctx) => {
    for (let i = 1; i < w.bands.length; i++) {
      if (w.bands[i]!.maxRangeM <= w.bands[i - 1]!.maxRangeM) {
        ctx.addIssue({ code: "custom", path: ["bands", i], message: "射程帯は近い順に、maxRangeM が増えるように並べてください" });
      }
    }
  });

/** 装甲の厚さ(mm、傾斜を含めた実質の厚さ)。編成表の要素の armorMm と同じ形 */
export const ArmorMmSchema = z.object({
  front: z.number().positive(),
  side: z.number().positive(),
  rear: z.number().positive().optional(),
  turretFront: z.number().positive().optional(),
  turretSide: z.number().positive().optional(),
});

/** 装備品の種類(表示・一覧の並べ方に使う。ルールには効かない) */
export const EQUIPMENT_CATEGORIES = [
  "rifle",
  "smg",
  "lmg",
  "hmg",
  "mortar",
  "at_rifle",
  "at_launcher",
  "flamethrower",
  "infantry_gun",
  "at_gun",
  "field_gun",
  "howitzer",
  "heavy_artillery",
  "rocket_artillery",
  "aa_gun",
  "tank",
  "assault_gun",
  "tank_destroyer",
  "spg",
  "armored_car",
  "halftrack",
  "truck",
  "prime_mover",
  "other",
] as const;

/**
 * 装備品(小銃・機関銃・砲・戦車など1つ1つの品目)。編成表の要素は「人員と装備品の数」で書け、
 * 撃つ武器・耐久・装甲は装備品から出す(toe.ts の resolveElement)。
 * weapons:1つあたりに載せている武器(戦車なら主砲1・機関銃2)。hitPoints:車両そのものの耐久(人員の耐久は別に数える)。
 * crew:操作に要る人数(表示用。要素の人員に含めて書く)。armored:撃ち合いで装甲の部分として扱う(戦車・突撃砲など。
 * 半装軌車・装甲車のような薄い装甲の輸送車両は false にして、乗る歩兵と同じ扱い)
 */
export const EquipmentSchema = z.object({
  name: z.string().min(1),
  /** 短い名前(線図の箱など狭い所の表示用。省略は name) */
  short: z.string().optional(),
  /** 国(表示用。de・us・su・uk・jp など) */
  nation: z.string().optional(),
  /** 使われた年(表示・一覧の時代の絞り込み用) */
  years: z.object({ from: z.number().int(), to: z.number().int().optional() }).optional(),
  category: z.enum(EQUIPMENT_CATEGORIES),
  weapons: z.array(z.object({ weapon: z.string().min(1), count: z.number().int().positive() })).default([]),
  crew: z.number().int().min(0).default(0),
  hitPoints: z.number().min(0).default(0),
  armored: z.boolean().default(false),
  armorMm: ArmorMmSchema.optional(),
  /** 諸元(表示用。重量 t・速度 km/h・口径 mm など、自由な名前と値) */
  specs: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  description: z.string().optional(),
});

export const WeaponPackSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  weapons: z.record(z.string(), WeaponSchema),
  /** 装備品の一覧(編成表の要素を人員・装備品の数で書くときに使う) */
  equipment: z.record(z.string(), EquipmentSchema).optional(),
  /** 人員1人あたりの耐久(装備品で書いた要素の耐久 = 人員 × これ + 車両の耐久)。後ろのパックの値が勝つ */
  personnelHitPoints: z.number().positive().optional(),
});

export type Weapon = z.infer<typeof WeaponSchema>;
export type WeaponPack = z.infer<typeof WeaponPackSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;

/** 装備品の一覧(重ねた武器パックのもの)。personnelHitPoints は人員1人あたりの耐久 */
export interface EquipmentCatalog {
  items: Record<string, Equipment>;
  personnelHitPoints: number;
}

/** 人員1人あたりの耐久の既定(汎用の小銃中隊 約190人 ≒ 耐久100 に合わせた値。武器パックの personnelHitPoints で変えられる) */
export const DEFAULT_PERSONNEL_HIT_POINTS = 0.5;

/** 武器パックを重ねて、装備品の一覧を作る(後ろのパックが勝つ) */
export function equipmentCatalog(packs: readonly WeaponPack[]): EquipmentCatalog {
  const items: Record<string, Equipment> = {};
  let personnelHitPoints = DEFAULT_PERSONNEL_HIT_POINTS;
  for (const p of packs) {
    Object.assign(items, p.equipment ?? {});
    if (p.personnelHitPoints !== undefined) personnelHitPoints = p.personnelHitPoints;
  }
  return { items, personnelHitPoints };
}

export function parseWeaponPack(input: unknown): ParseResult<WeaponPack> {
  return parseWith(WeaponPackSchema, input);
}

/** 距離 d での貫通力(mm。書かれていない・射程外なら undefined) */
export function weaponPenetrationAt(w: Weapon, d: number): number | undefined {
  for (const b of w.bands) if (d <= b.maxRangeM) return b.penetrationMm;
  return undefined;
}

/** 距離 d での火力(射程外なら0) */
export function weaponPowerAt(w: Weapon, d: number): number {
  for (const b of w.bands) if (d <= b.maxRangeM) return b.power;
  return 0;
}

export function weaponMaxRange(w: Weapon): number {
  return w.bands[w.bands.length - 1]!.maxRangeM;
}
