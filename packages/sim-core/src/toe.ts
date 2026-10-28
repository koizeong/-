import { z } from "zod";
import { parseWith, type ParseResult } from "./rulepack.js";
import { ArmorMmSchema, weaponMaxRange, weaponPenetrationAt, weaponPowerAt, type EquipmentCatalog, type Weapon, type WeaponPack } from "./weapon.js";

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
   * 戦いの前に別の部隊から配属された中隊(歩兵直協の戦車・突撃砲など)。from は元の部隊の ID、branch は元の部隊の兵科(地図の印に使う)。
   * 戦闘の計算はほかの要素と同じ(部隊の一部として撃ち、撃たれる)。表示と、配属の内訳を出すのに使う
   */
  attachedFrom: z.object({ unit: z.string().min(1), branch: z.string().min(1), toe: z.string().min(1) }).optional(),
  /**
   * 装甲の厚さ(mm、傾斜を含めた実質の厚さ)。正面・側面・背後(省略は側面と同じ)。書くと、貫通力を持つ武器の効き目が
   * 貫通力 ÷ 装甲 で決まる。装甲の要素(armored)に書く。
   * 砲塔(turretFront・turretSide)を書くと、当たる弾のうちルールパックの combat.penetration.turretShare の割合が砲塔に当たる
   * (砲塔の背後は砲塔の側面と同じ)。書かなければ車体だけ(固定戦闘室の駆逐戦車など)
   */
  armorMm: ArmorMmSchema.optional(),
  /**
   * 人員と装備品(実数の定数。1要素あたり)。書くと、撃つ武器・耐久・装甲は装備品の一覧(武器パックの equipment)から出す
   * (resolveElement)。weapons に書いた武器は装備品の武器に足す。hitPoints・armored・armorMm を書けば、それが勝つ
   */
  personnel: z.number().int().min(0).optional(),
  equipment: z.array(z.object({ item: z.string().min(1), count: z.number().int().positive() })).optional(),
});

/** 読み込むときの要素:人員・装備品で書くなら、武器と耐久は省ける */
const ToeElementInputSchema = ToeElementSchema.extend({
  hitPoints: z.number().positive().optional(),
  weapons: z.array(z.object({ weapon: z.string().min(1), count: z.number().int().positive() })).default([]),
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
  /**
   * 地図に描く兵科記号の補い(表示だけ。ルールには効かない)。echelon:規模の印(中隊 I・大隊 II・連隊 III・旅団 X)。
   * modifiers:兵科の印に重ねる印(空挺=翼、グライダー、機械化=楕円、自動車化、水陸両用=波、装甲=楕円)
   */
  symbol: z
    .object({
      echelon: z.enum(["company", "battalion", "regiment", "brigade"]).optional(),
      modifiers: z.array(z.enum(["airborne", "glider", "mechanized", "motorized", "amphibious", "armored"])).default([]),
    })
    .optional(),
});

export const ToePackSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  toes: z.record(z.string(), ToeSchema),
});

const ToePackInputSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  toes: z.record(z.string(), ToeSchema.extend({ elements: z.array(ToeElementInputSchema).min(1) })),
});
type ToeElementInput = z.infer<typeof ToeElementInputSchema>;

export type ToeElement = z.infer<typeof ToeElementSchema>;
export type Toe = z.infer<typeof ToeSchema>;
export type ToePack = z.infer<typeof ToePackSchema>;

/**
 * 編成表のパックを読む。人員・装備品で書いた要素は、装備品の一覧(catalog)から武器・耐久・装甲を出す。
 * 装備品を使うのに catalog を渡さなければ誤り
 */
export function parseToePack(input: unknown, catalog?: EquipmentCatalog): ParseResult<ToePack> {
  const raw = parseWith(ToePackInputSchema, input);
  if (!raw.ok) return raw;
  const errors: string[] = [];
  const toes: Record<string, unknown> = {};
  for (const [id, t] of Object.entries(raw.value.toes)) {
    toes[id] = { ...t, elements: t.elements.map((e, i) => resolveElement(e, catalog, (m) => errors.push(`toes.${id}.elements.${i}: ${m}`))) };
  }
  if (errors.length) return { ok: false, errors };
  return parseWith(ToePackSchema, { ...raw.value, toes });
}

/**
 * 人員・装備品で書いた要素から、撃つ武器・耐久・装甲を出す。
 * 武器:装備品ごとの武器 × 数(書いた weapons はその後ろに足す)。耐久:人員 × 1人あたりの耐久 + 車両の耐久 × 数。
 * 装甲:装甲の装備品(armored)があれば装甲の要素。装甲の厚さは、装甲の装備品のうちいちばん薄い値(面ごと)
 */
export function resolveElement(e: ToeElementInput, catalog: EquipmentCatalog | undefined, error: (m: string) => void): ToeElement | ToeElementInput {
  if (!e.equipment && e.personnel === undefined) {
    if (e.hitPoints === undefined) error("hitPoints か、人員(personnel)・装備品(equipment)を書いてください");
    return e;
  }
  if (!catalog) {
    error("人員・装備品で書いた要素には、装備品の一覧(武器パックの equipment)が要ります");
    return e;
  }
  const weapons = new Map<string, number>();
  let vehicleHp = 0;
  const armoredItems: { armorMm?: ToeElement["armorMm"] }[] = [];
  for (const ref of e.equipment ?? []) {
    const item = catalog.items[ref.item];
    if (!item) {
      error(`装備品 "${ref.item}" がありません`);
      continue;
    }
    for (const w of item.weapons) weapons.set(w.weapon, (weapons.get(w.weapon) ?? 0) + w.count * ref.count);
    vehicleHp += item.hitPoints * ref.count;
    if (item.armored) armoredItems.push(item);
  }
  for (const w of e.weapons) weapons.set(w.weapon, (weapons.get(w.weapon) ?? 0) + w.count);
  const hitPoints = e.hitPoints ?? (e.personnel ?? 0) * catalog.personnelHitPoints + vehicleHp;
  if (!(hitPoints > 0)) error("耐久が0です(人員か、耐久を持つ装備品を書いてください)");
  const armored = e.armored ?? armoredItems.length > 0;
  const withArmor = armoredItems.filter((x) => x.armorMm).map((x) => x.armorMm!);
  const thinnest = (k: "front" | "side" | "rear" | "turretFront" | "turretSide") => {
    const v = withArmor.map((a) => (k === "rear" ? (a.rear ?? a.side) : a[k]));
    return v.every((x) => x !== undefined) && v.length ? Math.min(...(v as number[])) : undefined;
  };
  const derivedArmor = withArmor.length
    ? {
        front: thinnest("front")!,
        side: thinnest("side")!,
        rear: thinnest("rear")!,
        ...(thinnest("turretFront") !== undefined ? { turretFront: thinnest("turretFront")! } : {}),
        ...(thinnest("turretSide") !== undefined ? { turretSide: thinnest("turretSide")! } : {}),
      }
    : undefined;
  const armorMm = e.armorMm ?? (armored ? derivedArmor : undefined);
  return {
    ...e,
    weapons: [...weapons].map(([weapon, count]) => ({ weapon, count })),
    hitPoints,
    ...(armored ? { armored } : {}),
    ...(armorMm ? { armorMm } : {}),
  };
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
  /** 当たる弾のうち砲塔に当たる割合(砲塔の厚さを書いた要素だけ。省略は0) */
  turretShare?: number | undefined;
}

/** 貫通力 ÷ 装甲 の比から、装甲の部分への効き目の倍率(lowRatio 以下で minFactor、highRatio 以上で1) */
export function penetrationFactor(penetrationMm: number, armorMm: number, r: PenetrationRules): number {
  const ratio = penetrationMm / armorMm;
  if (ratio >= r.highRatio) return 1;
  if (ratio <= r.lowRatio) return r.minFactor;
  return r.minFactor + ((1 - r.minFactor) * (ratio - r.lowRatio)) / (r.highRatio - r.lowRatio);
}

export type ArmorFace = "front" | "side" | "rear";
/** 装甲の要素1種類の厚さ(mm。車体と砲塔)と、その要素の重み(数 × 耐久) */
export interface ArmorPlate {
  front: number;
  side: number;
  rear: number;
  /** 砲塔の正面・側面・背後(砲塔がなければ undefined) */
  turret?: { front: number; side: number; rear: number };
  weight: number;
}

const armorCache = new WeakMap<Toe, ArmorPlate[] | null>();
/**
 * 編成表の装甲の要素ごとの厚さ(正面・側面・背後)と重み。どの要素にも書かれていなければ null。
 * 厚さは平均しない(パンターとIV号の混成なら、75mm砲はIV号だけを抜く。平均の厚さでは両方とも抜きにくくなってしまう)
 */
export function toeArmorPlates(toe: Toe): ArmorPlate[] | null {
  if (armorCache.has(toe)) return armorCache.get(toe)!;
  const out: ArmorPlate[] = [];
  for (const e of toe.elements) {
    if (!e.armorMm) continue;
    const a = e.armorMm;
    const turret = a.turretFront !== undefined ? { front: a.turretFront, side: a.turretSide ?? a.turretFront, rear: a.turretSide ?? a.turretFront } : undefined;
    out.push({ front: a.front, side: a.side, rear: a.rear ?? a.side, ...(turret ? { turret } : {}), weight: e.count * e.hitPoints });
  }
  const r = out.length > 0 ? out : null;
  armorCache.set(toe, r);
  return r;
}

/** 装甲の厚さの、重みつきの平均(表示用。正面・側面・背後)。どの要素にも書かれていなければ null */
export function toeArmorMm(toe: Toe): { front: number; side: number; rear: number } | null {
  const plates = toeArmorPlates(toe);
  if (!plates) return null;
  const w = plates.reduce((a, p) => a + p.weight, 0);
  const avg = (f: ArmorFace) => plates.reduce((a, p) => a + p[f] * p.weight, 0) / w;
  return { front: avg("front"), side: avg("side"), rear: avg("rear") };
}

/**
 * 貫通力 pen の武器の、装甲の部分への効き目の倍率(要素ごとの倍率を重みで平均)。
 * 砲塔のある要素は、車体と砲塔の倍率を turretShare で按分する
 */
export function platesPenetrationFactor(pen: number, plates: readonly ArmorPlate[], face: ArmorFace, r: PenetrationRules): number {
  const share = r.turretShare ?? 0;
  let w = 0;
  let sum = 0;
  for (const p of plates) {
    w += p.weight;
    const hull = penetrationFactor(pen, p[face], r);
    sum += (p.turret && share > 0 ? hull * (1 - share) + penetrationFactor(pen, p.turret[face], r) * share : hull) * p.weight;
  }
  return w > 0 ? sum / w : 1;
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
 * pierce:陣地に強い武器の entrenchmentPierce を火力で重みづけした平均。arcing:火力のうち曲射の武器の割合。
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
  /** 目標の装甲の要素ごとの厚さ・撃たれる面・貫通の規則。貫通力を持つ武器の、装甲の部分への効き目に効く */
  armor?: { plates: readonly ArmorPlate[]; face: ArmorFace; rules: PenetrationRules },
): { firepower: number; suppression: number; pierce: number; arcing: number } {
  let total = 0;
  let weighted = 0;
  let pierce = 0;
  let arcing = 0;
  for (const e of toe.elements) {
    const k = elementWeight ? elementWeight(e) : 1;
    if (k <= 0) continue;
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon]!;
      if (w.indirect !== indirect) continue;
      const power = weaponPowerAt(w, d);
      if (power === 0) continue;
      const pen = armor ? weaponPenetrationAt(w, d) : undefined;
      const effect = pen === undefined ? weaponEffectAgainst(w, armorRatio) : weaponEffectAgainst(w, armorRatio, platesPenetrationFactor(pen, armor!.plates, armor!.face, armor!.rules));
      const f = k * e.count * ref.count * power * effect;
      total += f;
      weighted += f * w.suppression;
      pierce += f * w.entrenchmentPierce;
      if (w.arcing) arcing += f;
    }
  }
  return { firepower: total, suppression: total > 0 ? weighted / total : 1, pierce: total > 0 ? pierce / total : 0, arcing: total > 0 ? arcing / total : 0 };
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
