import { z } from "zod";
import type { BranchPack } from "./branch.js";
import { parseWith, type DevelopmentRules, type ParseResult } from "./rulepack.js";
import { checkToe } from "./toe-summary.js";
import { ToeElementSchema, type Toe, type ToePack } from "./toe.js";
import { WeaponSchema, type Weapon, type WeaponPack } from "./weapon.js";

/**
 * 装備編成:武器の開発(ルールパックの武器の型から、調整できる値を動かして自分の武器を作る)と、
 * 連隊テンプレート(元の編成表の要素を、自分の武器と既存の武器で組み直した編成表)。
 * 開発した武器は設計(型と値)だけを持ち、性能はいつもルールパックの式から計算し直す(書き換えた性能を持ち込めない)
 */

/** 利用者の武器・編成表のIDの頭(パックの武器・編成表と重ならないように) */
export const USER_PREFIX = "user:";

export const WeaponDesignSchema = z.object({
  name: z.string().min(1).max(60),
  /** ルールパックの development.archetypes のキー */
  archetype: z.string().min(1),
  /** 調整する値(書かなければ基準の値) */
  params: z.record(z.string(), z.number()).default({}),
});

export const RegimentTemplateSchema = z.object({
  name: z.string().min(1).max(60),
  /** 元の編成表(兵科・補給・正面幅などを受け継ぎ、要素だけを組み直す) */
  baseToe: z.string().min(1),
  elements: z.array(ToeElementSchema).min(1),
});

/** 利用者が持ち込む装備編成のひとまとまり(ブラウザに保存し、ファイルに書き出し、試合の記録にも入れる) */
export const CustomBundleSchema = z.object({
  version: z.literal(1),
  designs: z.record(z.string(), WeaponDesignSchema).default({}),
  templates: z.record(z.string(), RegimentTemplateSchema).default({}),
});

export type WeaponDesign = z.infer<typeof WeaponDesignSchema>;
export type RegimentTemplate = z.infer<typeof RegimentTemplateSchema>;
export type CustomBundle = z.infer<typeof CustomBundleSchema>;
export type DevelopmentCost = DevelopmentRules["cost"];

export function parseCustomBundle(input: unknown): ParseResult<CustomBundle> {
  return parseWith(CustomBundleSchema, input);
}

/** 武器の点数(ルールパックの式。DevelopmentRulesSchema の cost の説明を参照) */
export function weaponCost(w: Weapon, c: DevelopmentCost): number {
  let integral = 0;
  let from = 0;
  for (const b of w.bands) {
    integral += b.power * ((b.maxRangeM - from) / 1000);
    from = b.maxRangeM;
  }
  const effect = w.effectiveness.soft * c.softWeight + w.effectiveness.armored * c.armoredWeight;
  const pen = Math.max(0, ...w.bands.map((b) => b.penetrationMm ?? 0));
  return integral * effect * c.firepowerPerKm * (w.indirect ? c.indirectMultiplier : 1) + pen * c.penetrationPerMm + w.antiAir * c.antiAirPoint;
}

/** 編成表の点数(ルールパックの式)。参照の切れた武器は0点で数える(先に checkToe で直す) */
export function toeCost(toe: Toe, weapons: WeaponPack, c: DevelopmentCost): number {
  let sum = 0;
  for (const e of toe.elements) {
    const armor = e.armorMm ? (e.armorMm.front + e.armorMm.side + (e.armorMm.rear ?? e.armorMm.side)) / 3 : 0;
    let each = c.elementBase + e.hitPoints * c.hitPoint + armor * c.armorPerMm;
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon];
      if (w) each += weaponCost(w, c) * ref.count;
    }
    sum += e.count * each;
  }
  return sum + toe.supply.ammoCapacityT * c.ammoPerT + toe.supply.fuelCapacityT * c.fuelPerT;
}

/** 設計から武器の性能を計算する。型がない・値が範囲の外なら誤り */
export function designWeapon(design: WeaponDesign, dev: DevelopmentRules): ParseResult<Weapon> {
  const arch = dev.archetypes[design.archetype];
  if (!arch) return { ok: false, errors: [`archetype: 武器の型 "${design.archetype}" がありません`] };
  const errors: string[] = [];
  for (const k of Object.keys(design.params)) if (!(k in arch.params)) errors.push(`params.${k}: この型では調整できません`);
  const value = (k: string) => design.params[k] ?? arch.params[k]!.default;
  for (const [k, p] of Object.entries(arch.params)) {
    const v = value(k);
    if (!Number.isFinite(v) || v < p.min || v > p.max) errors.push(`params.${k}: ${p.name}は ${p.min}〜${p.max}${p.unit} にしてください(${v})`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const k = { power: 1, range: 1, penetration: 1, ammoPerMin: 1, suppression: 1, antiAir: 1 };
  for (const e of arch.effects) k[e.target] *= (value(e.param) / arch.params[e.param]!.default) ** e.exponent;
  const r = arch.reference;
  const weapon = {
    name: design.name,
    bands: r.bands.map((b) => ({
      maxRangeM: Math.round(b.maxRangeM * k.range),
      power: round(b.power * k.power),
      ...(b.penetrationMm !== undefined ? { penetrationMm: Math.round(b.penetrationMm * k.penetration) } : {}),
    })),
    effectiveness: { ...r.effectiveness },
    indirect: r.indirect,
    ammoPerMin: round(r.ammoPerMin * k.ammoPerMin, 6),
    suppression: round(r.suppression * k.suppression),
    antiAir: round(r.antiAir * k.antiAir),
  };
  return parseWith(WeaponSchema, weapon);
}

const round = (x: number, digits = 3) => Math.round(x * 10 ** digits) / 10 ** digits;

/** テンプレートから編成表を作る(元の編成表の要素を入れ替える)。上限と参照を確かめる */
export function buildTemplate(t: RegimentTemplate, toes: ToePack, weapons: WeaponPack, branches: BranchPack, dev: DevelopmentRules): ParseResult<Toe> {
  const base = toes.toes[t.baseToe];
  if (!base) return { ok: false, errors: [`baseToe: 編成表 "${t.baseToe}" がありません`] };
  const lim = dev.template;
  const errors: string[] = [];
  const count = t.elements.reduce((s, e) => s + e.count, 0);
  if (count > lim.maxElements) errors.push(`elements: 要素の数は ${lim.maxElements} までです(${count})`);
  t.elements.forEach((e, i) => {
    if (e.hitPoints < lim.hitPoints.min || e.hitPoints > lim.hitPoints.max) errors.push(`elements.${i}.hitPoints: 耐久は ${lim.hitPoints.min}〜${lim.hitPoints.max} にしてください`);
    const n = e.weapons.reduce((s, r) => s + r.count, 0);
    if (n > lim.maxWeaponsPerElement) errors.push(`elements.${i}.weapons: 武器の数は ${lim.maxWeaponsPerElement} までです(${n})`);
    const a = e.armorMm;
    if (a && Math.max(a.front, a.side, a.rear ?? 0, a.turretFront ?? 0, a.turretSide ?? 0) > lim.maxArmorMm) errors.push(`elements.${i}.armorMm: 装甲厚は ${lim.maxArmorMm}mm までです`);
    if (a && !e.armored) errors.push(`elements.${i}.armorMm: 装甲厚は装甲の要素(armored)にだけ書けます`);
  });
  const toe: Toe = { ...base, name: t.name, elements: t.elements };
  for (const x of checkToe(toe, weapons, branches)) if (x.level === "error") errors.push(`${x.path}: ${x.message}`);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: toe };
}

/**
 * 装備編成をパックに重ねる。開発した武器は "user:<ID>"、テンプレートは "user:<ID>" の編成表になる。
 * テンプレートの武器は、パックの武器のIDか "user:<ID>"(開発した武器)で指す
 */
export function applyBundle(
  bundle: CustomBundle,
  dev: DevelopmentRules,
  weapons: WeaponPack,
  toes: ToePack,
  branches: BranchPack,
): ParseResult<{ weapons: WeaponPack; toes: ToePack }> {
  const errors: string[] = [];
  const outW: WeaponPack = { id: `${weapons.id}+user`, weapons: { ...weapons.weapons } };
  for (const [id, d] of Object.entries(bundle.designs)) {
    const r = designWeapon(d, dev);
    if (r.ok) outW.weapons[USER_PREFIX + id] = r.value;
    else errors.push(...r.errors.map((e) => `designs.${id}.${e}`));
  }
  const outT: ToePack = { id: `${toes.id}+user`, toes: { ...toes.toes } };
  for (const [id, t] of Object.entries(bundle.templates)) {
    const r = buildTemplate(t, toes, outW, branches, dev);
    if (r.ok) outT.toes[USER_PREFIX + id] = r.value;
    else errors.push(...r.errors.map((e) => `templates.${id}.${e}`));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { weapons: outW, toes: outT } };
}
