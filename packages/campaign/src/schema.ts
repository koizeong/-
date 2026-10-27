import { z } from "zod";

/**
 * キャンペーン(作戦の層)のデータ。地域を点、道路・鉄道を線でつないだ作戦地図の上で、師団・旅団(部隊の集まり)を動かす。
 * 地域でぶつかると、そこの地形の傾向で戦術の戦闘(連隊規模)を自動生成して戦う。1段階は数日
 */

const id = z.string().min(1);

/** 勝利の条件(キャンペーンの終わりに判定)。region:その地域を自陣営が押さえている。lossRatio:自陣営の損耗率が敵の max 倍以下 */
const CampaignConditionSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("region"), region: id, points: z.number().min(0).default(0) }),
  z.object({ id, type: z.literal("lossRatio"), max: z.number().positive(), points: z.number().min(0).default(0) }),
]);
export type CampaignCondition = z.infer<typeof CampaignConditionSchema>;

const TierSchema = z.object({ minPoints: z.number().min(0).default(0), requires: z.array(z.string()).default([]) });

export const CampaignDefSchema = z
  .object({
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    notes: z.string().optional(),
    /** 戦術の戦闘の生成に使う編成(data/generators/missions.json の eras のキー)。陣営はその並び */
    era: id,
    sides: z.tuple([z.object({ id, name: z.string() }), z.object({ id, name: z.string() })]),
    calendar: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      daysPerStage: z.number().int().positive(),
      /** この数の段階を解いたら終わる */
      stages: z.number().int().positive(),
    }),
    /**
     * 地域。x・y は作戦地図の上の位置(km。表示用)。biome は戦術の戦闘の地形の傾向。
     * supply はその陣営の補給の源(港・鉄道の終点)。押さえていれば、そこから自陣営の地域をたどって補給が届く
     */
    regions: z.record(id, z.object({ name: z.string().min(1), x: z.number(), y: z.number(), biome: id, supply: id.optional() })),
    links: z.array(z.object({ a: id, b: id, kind: z.enum(["road", "rail", "track"]).default("road") })),
    /** 始めの地域の持ち主(書かない地域は誰のものでもない) */
    control: z.record(id, id.nullable()).default({}),
    /** 師団・旅団。units は隷下の連隊・大隊(戦術の戦闘に出る部隊。編成表のキー) */
    formations: z.array(
      z.object({
        id,
        side: id,
        name: z.string().min(1),
        region: id,
        /** 後から来る増援:この段階の始めに region へ着く(region がそのとき敵のものなら、自陣営の補給の源へ)。書かなければ始めからいる */
        arriveStage: z.number().int().min(1).optional(),
        units: z
          .array(z.object({ id, toe: id, training: z.string().optional(), strength: z.number().gt(0).max(1).optional() }))
          .min(1),
      }),
    ),
    /** 史実の結末(結果の画面で比べる。史実のキャンペーンだけ) */
    historicalOutcome: z.object({ winner: id.nullable(), level: z.enum(["decisive", "limited", "draw"]), summary: z.string() }).optional(),
    victory: z.record(id, z.object({ conditions: z.array(CampaignConditionSchema).default([]), decisive: TierSchema, limited: TierSchema })),
    /** キャンペーンの決まり(数値は仮置き。キャンペーンごとに変えられる) */
    rules: z
      .object({
        /** 補給の届く部隊が、段階ごとに取り戻す戦力(補充)と士気 */
        replacementPerStage: z.number().min(0).max(1).default(0.05),
        moraleRecoveryPerStage: z.number().min(0).max(1).default(0.3),
        /** 補給の届かない部隊の、段階ごとの携行備蓄の減り */
        unsuppliedStockLoss: z.number().min(0).max(1).default(0.3),
        /** 1つの戦闘に出る部隊の上限(陣営ごと。超えた分は予備として戦わない) */
        maxUnitsPerBattle: z.number().int().positive().default(8),
        /** 決定的に負けた側の部隊が、さらに失う戦力の割合(潰走・落伍) */
        decisiveExtraLoss: z.number().min(0).max(1).default(0.1),
        /** 経験:勝った戦闘ごとの点(決定的なら decisive)。練度が上がるまでの点(練度の並びの順) */
        experience: z
          .object({ win: z.number().min(0).default(1), decisive: z.number().min(0).default(2), levels: z.array(id).min(1), thresholds: z.array(z.number().positive()) })
          .default({ win: 1, decisive: 2, levels: ["green", "regular", "veteran", "elite"], thresholds: [2, 5, 9] }),
      })
      .default({}),
  })
  .superRefine((c, ctx) => {
    const regions = new Set(Object.keys(c.regions));
    const sides = new Set(c.sides.map((s) => s.id));
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    for (const [i, l] of c.links.entries()) for (const r of [l.a, l.b]) if (!regions.has(r)) issue(["links", i], `地域 "${r}" がありません`);
    for (const [r, s] of Object.entries(c.control)) {
      if (!regions.has(r)) issue(["control", r], `地域 "${r}" がありません`);
      if (s !== null && !sides.has(s)) issue(["control", r], `陣営 "${s}" がありません`);
    }
    for (const [r, g] of Object.entries(c.regions)) if (g.supply && !sides.has(g.supply)) issue(["regions", r, "supply"], `陣営 "${g.supply}" がありません`);
    const unitIds = new Set<string>();
    for (const [i, f] of c.formations.entries()) {
      if (!regions.has(f.region)) issue(["formations", i, "region"], `地域 "${f.region}" がありません`);
      if (!sides.has(f.side)) issue(["formations", i, "side"], `陣営 "${f.side}" がありません`);
      for (const u of f.units) {
        if (unitIds.has(u.id)) issue(["formations", i, "units"], `部隊の ID "${u.id}" が重複しています`);
        unitIds.add(u.id);
      }
    }
    for (const [s, v] of Object.entries(c.victory)) {
      if (!sides.has(s)) issue(["victory", s], `陣営 "${s}" がありません`);
      const ids = new Set(v.conditions.map((x) => x.id));
      for (const x of v.conditions) if (x.type === "region" && !regions.has(x.region)) issue(["victory", s], `地域 "${x.region}" がありません`);
      for (const t of ["decisive", "limited"] as const) for (const r of v[t].requires) if (!ids.has(r)) issue(["victory", s, t], `条件 "${r}" がありません`);
    }
  });

export type CampaignDef = z.infer<typeof CampaignDefSchema>;
