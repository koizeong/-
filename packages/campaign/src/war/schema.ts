import { z } from "zod";

/**
 * 戦争の定義(docs/war-design.md)。いくつかの戦線(戦役の時期を持つ)に兵力を分け、1か月ごとに収入・開発・生産・配分・戦線の解決をする。
 * 数値はどれもゲームの手触りのための仮置き(TODO(要裏取り))
 */

const id = z.string().min(1);
const month = z.string().regex(/^\d{4}-\d{2}$/);

/** 資源:工業力・人的資源・燃料 */
export const ResourcesSchema = z.object({
  industry: z.number().min(0).default(0),
  manpower: z.number().min(0).default(0),
  fuel: z.number().min(0).default(0),
});
export type Resources = z.infer<typeof ResourcesSchema>;
export const RESOURCE_KEYS = ["industry", "manpower", "fuel"] as const;

/** 戦略地域:持ち主に毎月の資源と勝利点をもたらす。front のものは前線の動きで持ち主が変わる */
export const WarRegionSchema = z.object({
  name: z.string().min(1),
  /** 始めの持ち主 */
  owner: id,
  yields: ResourcesSchema.default({}),
  /** 月ごとの資源の増減(本国の動員・疎開の工場の立ち上がり)。その月から、yields に足す(負もよい) */
  schedule: z.array(z.object({ from: month, add: z.object({ industry: z.number().default(0), manpower: z.number().default(0), fuel: z.number().default(0) }) })).default([]),
  /** 勝利点(戦争の終わりに、持っている陣営のもの) */
  vp: z.number().min(0).default(0),
  /** この陣営の首都(取られると決定的な負け) */
  capitalOf: id.optional(),
  /** 地図に描く位置(0〜100。表示用) */
  mapX: z.number().default(50),
  mapY: z.number().default(50),
});
export type WarRegion = z.infer<typeof WarRegionSchema>;

/** 戦線:並んだ戦略地域(sides[0] の後方 → sides[1] の後方)の間に前線がある */
export const FrontSchema = z.object({
  name: z.string().min(1),
  /** 並んだ地域。前線は boundary 番目の地域の手前(0..boundary-1 が sides[0]、boundary.. が sides[1]) */
  regions: z.array(id).min(2),
  /** 始めの前線の位置 */
  boundary: z.number().int().min(0),
  /** 戦線が開く月(それまでは戦えない。省略は始めから)。開く前に置いた軍団は守備隊として、開いたときにそのまま戦う */
  opens: month.optional(),
  /** 戦線が閉じる月(省略は終わりまで) */
  closes: month.optional(),
  /**
   * 戦線の広さと地形の倍率(力の比に掛ける。守り手に有利な山・砂漠の補給の苦しさ)。supply は陣営ごとの補給の倍率
   * (北アフリカの枢軸は地中海を渡る補給で弱い)
   */
  defenseMultiplier: z.number().positive().default(1),
  supply: z.record(id, z.number().positive()).default({}),
  /** 機甲の力の倍率(広い平原は機甲が効く・山とボカージュは効かない) */
  armorMultiplier: z.number().positive().default(1),
  /** この戦線に並べられる軍団の数の目安(陣営ごと。広さ。省略はなし)。超えた分は rules.overCapShare の割合だけ力に数える(第2線・予備) */
  maxCorps: z.number().int().positive().optional(),
  /** 史実の戦役の時期(W3 で戦役の地図で解く。それまでは目安の表示) */
  campaigns: z.array(z.object({ campaignId: id, from: month, to: month, note: z.string().optional() })).default([]),
  /** 地図に描く線の向き(表示用) */
  mapAxis: z.enum(["horizontal", "vertical"]).default("horizontal"),
});
export type Front = z.infer<typeof FrontSchema>;

/** 軍団・航空軍の型 */
export const UnitTemplateSchema = z.object({
  name: z.string().min(1),
  side: id,
  kind: z.enum(["infantry", "armor", "air"]),
  /** 力(攻め・守り)。航空軍は同じ戦線の陸の力の倍率に効く(air.supportPerUnit) */
  attack: z.number().min(0),
  defense: z.number().min(0),
  cost: ResourcesSchema,
  /** 完成までの月数 */
  months: z.number().int().min(0),
  /** 攻勢の1か月に使う燃料 */
  fuelPerAttack: z.number().min(0).default(0),
  /** 作れる最初の月(米の参戦など。省略は始めから) */
  availableFrom: month.optional(),
  /** 開く系統樹の項目(省略は始めから作れる) */
  requires: id.optional(),
  /** 戦役・作戦で使う編成表(W3 のつなぎ。表示用) */
  toe: z.array(id).default([]),
  notes: z.string().optional(),
});
export type UnitTemplate = z.infer<typeof UnitTemplateSchema>;

/** 系統樹の項目 */
export const TechSchema = z.object({
  name: z.string().min(1),
  side: id,
  /** 研究の点 */
  cost: z.number().positive(),
  requires: z.array(id).default([]),
  /** 研究を始められる最初の月(史実の時期より早すぎないように) */
  earliest: month.optional(),
  /** 開く軍団の型 */
  unlocks: z.array(id).default([]),
  /** 種類ごとの力の倍率(例:機甲 1.1) */
  boost: z.object({ infantry: z.number().positive().default(1), armor: z.number().positive().default(1), air: z.number().positive().default(1) }).partial().default({}),
  notes: z.string().optional(),
});
export type Tech = z.infer<typeof TechSchema>;

export const WarDefSchema = z.object({
  id,
  name: z.string().min(1),
  description: z.string().optional(),
  notes: z.string().optional(),
  sides: z.tuple([z.object({ id, name: z.string() }), z.object({ id, name: z.string() })]),
  calendar: z.object({ start: month, months: z.number().int().positive() }),
  regions: z.record(id, WarRegionSchema),
  fronts: z.record(id, FrontSchema),
  templates: z.record(id, UnitTemplateSchema),
  tech: z.record(id, TechSchema).default({}),
  start: z.object({
    /** 始めの軍団:型・戦線(省略は予備)・数・戦力 */
    forces: z.array(z.object({ template: id, front: id.optional(), count: z.number().int().positive().default(1), strength: z.number().min(0).max(1).default(1) })),
    stock: z.record(id, ResourcesSchema),
    researched: z.record(id, z.array(id)).default({}),
  }),
  rules: z
    .object({
      /** 戦線どうしの移動にかかる月数(既定。予備から戦線へも) */
      transferMonths: z.number().int().min(0).default(1),
      /** 研究に回す工業力の割合の上限 */
      maxResearchShare: z.number().min(0).max(1).default(0.4),
      /** 工業力1あたりの研究の点 */
      researchPerIndustry: z.number().min(0).default(1),
      /** 前線が1地域動く力の比 / 2地域動く力の比 */
      advanceRatio: z.number().positive().default(1.5),
      breakthroughRatio: z.number().positive().default(3),
      /** 1か月の戦いの損耗の基本(戦力の割合。力の比で配る) */
      attrition: z.number().min(0).max(1).default(0.08),
      /** 守勢の戦線の損耗の倍率 */
      quietAttrition: z.number().min(0).max(1).default(0.3),
      /** 補充:戦力1あたりの値段(型の値段の割合) */
      replacementShare: z.number().min(0).default(0.6),
      /** 1か月に補充で戻せる戦力の上限 */
      replacementPerMonth: z.number().min(0).max(1).default(0.25),
      /** 燃料が足りない攻勢の機甲の力の倍率 */
      noFuelArmorMultiplier: z.number().min(0).max(1).default(0.4),
      /** 航空軍1つあたりの陸の力の上乗せ(その戦線の陸の力に足す割合。上限 airCap) */
      airSupportPerUnit: z.number().min(0).default(0.05),
      airCap: z.number().min(0).default(0.4),
      /** 守り手が、次に失う地域がもとから自分の地域(本国・祖国)なら、守りの力にこの倍率(祖国の防衛) */
      homeDefense: z.number().positive().default(1),
      /** 戦線の広さの目安(maxCorps)を超えた軍団の力の割合(第2線・予備として後から効く) */
      overCapShare: z.number().min(0).max(1).default(0.35),
      /** 損耗の運の幅(±) */
      spread: z.number().min(0).max(1).default(0.15),
      /** 戦争の終わりの勝利点の差で、決定的・限定的 */
      decisiveVp: z.number().min(0).default(20),
      limitedVp: z.number().min(0).default(5),
    })
    .default({}),
});
export type WarDef = z.infer<typeof WarDefSchema>;

/** 戦争の定義を読む。参照の誤りも並べる */
export function parseWarDef(input: unknown): { ok: true; value: WarDef } | { ok: false; errors: string[] } {
  const r = WarDefSchema.safeParse(input);
  if (!r.success) return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const d = r.data;
  const errors: string[] = [];
  const sides = new Set(d.sides.map((s) => s.id));
  for (const [rid, reg] of Object.entries(d.regions)) {
    if (!sides.has(reg.owner)) errors.push(`regions.${rid}.owner: 陣営 "${reg.owner}" がありません`);
    if (reg.capitalOf && !sides.has(reg.capitalOf)) errors.push(`regions.${rid}.capitalOf: 陣営 "${reg.capitalOf}" がありません`);
  }
  for (const [fid, f] of Object.entries(d.fronts)) {
    for (const r of f.regions) if (!d.regions[r]) errors.push(`fronts.${fid}.regions: 地域 "${r}" がありません`);
    if (f.boundary > f.regions.length) errors.push(`fronts.${fid}.boundary: 地域の数を超えています`);
    for (const s of Object.keys(f.supply)) if (!sides.has(s)) errors.push(`fronts.${fid}.supply: 陣営 "${s}" がありません`);
  }
  for (const [tid, t] of Object.entries(d.templates)) {
    if (!sides.has(t.side)) errors.push(`templates.${tid}.side: 陣営 "${t.side}" がありません`);
    if (t.requires && !d.tech[t.requires]) errors.push(`templates.${tid}.requires: 系統樹の項目 "${t.requires}" がありません`);
  }
  for (const [tid, t] of Object.entries(d.tech)) {
    for (const r of t.requires) if (!d.tech[r]) errors.push(`tech.${tid}.requires: "${r}" がありません`);
    for (const u of t.unlocks) if (!d.templates[u]) errors.push(`tech.${tid}.unlocks: 型 "${u}" がありません`);
  }
  d.start.forces.forEach((f, i) => {
    if (!d.templates[f.template]) errors.push(`start.forces.${i}.template: 型 "${f.template}" がありません`);
    if (f.front && !d.fronts[f.front]) errors.push(`start.forces.${i}.front: 戦線 "${f.front}" がありません`);
  });
  for (const s of Object.keys(d.start.stock)) if (!sides.has(s)) errors.push(`start.stock.${s}: 陣営がありません`);
  return errors.length ? { ok: false, errors } : { ok: true, value: d };
}
