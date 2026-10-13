import { z } from "zod";

/**
 * 時代ルールパック。時代ごとに変わる数値はここに置き、コードに直書きしない。
 * 項目は機能を実装するたびに足していく。
 */
export const FacingRulesSchema = z
  .object({
    /** 正面とみなす半角(度)。攻撃方向と正面の差がこれ以下なら「前」 */
    frontHalfArcDeg: z.number().min(0).max(180),
    /** 背面とみなす半角(度)。真後ろからの差がこれ以下なら「背面」 */
    rearHalfArcDeg: z.number().min(0).max(180),
    /** 受ける損害への倍率 */
    damageMultiplier: z.object({
      front: z.number().positive(),
      flank: z.number().positive(),
      rear: z.number().positive(),
    }),
  })
  .refine((f) => f.frontHalfArcDeg + f.rearHalfArcDeg <= 180, {
    message: "frontHalfArcDeg と rearHalfArcDeg の合計は180以下にしてください(正面と背面が重なります)",
  });

export const TerrainRulesSchema = z.object({
  name: z.string().min(1),
  /** この地形で築ける陣地レベルの基本上限 */
  entrenchmentCap: z.number().int(),
  /** 移動速度への倍率 */
  speedMultiplier: z.number().positive(),
  /** この地形にいる目標を探知できる距離への倍率(森林・町は小さい) */
  concealment: z.number().positive(),
});

export const StanceRulesSchema = z.object({
  name: z.string().min(1),
  /** 陣地レベル上限への加減 */
  entrenchmentCapModifier: z.number().int(),
  /** 観測側として:探知距離への倍率 */
  visionMultiplier: z.number().positive(),
  /** 目標側として:探知される距離への倍率(小さいほど見つかりにくい) */
  signatureMultiplier: z.number().positive(),
  /** 観測側として:規模推定の誤差への倍率 */
  estimateErrorMultiplier: z.number().min(0),
  /** 与える損害への倍率 */
  firepowerMultiplier: z.number().min(0),
  /** 受ける損害への倍率 */
  damageTakenMultiplier: z.number().positive(),
  /** 弾薬消費への倍率 */
  ammoConsumptionMultiplier: z.number().min(0),
});

export const SupplyRulesSchema = z.object({
  /** 弾薬が切れたときに残る火力の割合 */
  outOfAmmoFirepowerMultiplier: z.number().min(0).max(1),
  /** 携行備蓄(弾薬、または燃料を使うユニットの燃料)が切れている間の士気低下(1分あたり) */
  outOfStockMoraleLossPerMin: z.number().min(0),
  /** 戦闘移動の燃料消費の倍率(行軍に対して) */
  combatMoveFuelMultiplier: z.number().min(0),
  /** 戦闘移動しながら撃つときの弾薬消費の倍率 */
  combatMoveAmmoMultiplier: z.number().min(0),
});

export const CombatRulesSchema = z.object({
  /** 火力(損害ポイント/分)から実際の損害への換算係数 */
  damageScale: z.number().positive(),
  /** 損害の揺らぎ(0.15 なら ±15%) */
  damageSpread: z.number().min(0).lt(1),
  /** 戦闘移動しながら撃つときの火力の倍率 */
  combatMoveFirepowerMultiplier: z.number().min(0),
  /** 撃たれた側の隊形による損害の倍率(縦隊は不利) */
  formationDamageTaken: z.object({
    column: z.number().positive(),
    deploying: z.number().positive(),
    deployed: z.number().positive(),
  }),
  /** 陣地レベルごとの受ける損害の倍率。minLevel から maxLevel まで順に並べる */
  entrenchmentDamageTaken: z.array(z.number().positive()).min(1),
  /** 損害1(耐久に対する割合)を各ゲージにどれだけ振り分けるか。時代で比重が変わる */
  gaugeWeights: z.object({
    strength: z.number().min(0),
    suppression: z.number().min(0),
    morale: z.number().min(0),
  }),
  /** 制圧ゲージ1(満タン)のときに失う火力の割合 */
  suppressionFirepowerPenalty: z.number().min(0).max(1),
  /** 制圧ゲージの回復(1分あたり) */
  suppressionRecoveryPerMin: z.number().min(0),
});

export const DetectionRulesSchema = z
  .object({
    /** 基本視程(m)。これに天候・地形・姿勢などの倍率をかけたものが探知距離 */
    baseRangeM: z.number().positive(),
    /** 探知距離のこの割合以内なら兵種まで判明 */
    typeIdentifiedRatio: z.number().gt(0).max(1),
    /** 探知距離のこの割合以内なら規模・装備まで判明 */
    fullyIdentifiedRatio: z.number().gt(0).max(1),
    /** 規模推定の誤差(0.2 なら ±20%) */
    sizeEstimateError: z.number().min(0).lt(1),
  })
  .refine((d) => d.fullyIdentifiedRatio <= d.typeIdentifiedRatio, {
    message: "fullyIdentifiedRatio は typeIdentifiedRatio 以下にしてください",
  });

export const EntrenchmentRulesSchema = z
  .object({
    minLevel: z.number().int(),
    maxLevel: z.number().int(),
  })
  .refine((e) => e.minLevel <= e.maxLevel, { message: "minLevel は maxLevel 以下にしてください" });

export const RulePackSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 数値の根拠や仮置きであることのメモ(JSONにはコメントが書けないため) */
    notes: z.string().optional(),
    facing: FacingRulesSchema,
    /** 戦闘移動の速度(行軍速度に対する比) */
    combatMoveSpeedRatio: z.number().positive(),
    entrenchment: EntrenchmentRulesSchema,
    detection: DetectionRulesSchema,
    /** このユニット自身が敵を探知し、かつこの距離(m)以内なら「接敵」。縦隊は停止して展開を始める */
    contactRangeM: z.number().positive(),
    combat: CombatRulesSchema,
    supply: SupplyRulesSchema,
    terrain: z.record(z.string(), TerrainRulesSchema),
    stances: z.record(z.string(), StanceRulesSchema),
    /** 新規ユニットの姿勢であり、姿勢切替中のターンに扱う姿勢 */
    defaultStance: z.string(),
  })
  .refine((r) => r.defaultStance in r.stances, {
    message: "defaultStance が stances に定義されていません",
    path: ["defaultStance"],
  })
  .refine((r) => r.combat.entrenchmentDamageTaken.length === r.entrenchment.maxLevel - r.entrenchment.minLevel + 1, {
    message: "陣地レベルの数(minLevel〜maxLevel)と同じ個数にしてください",
    path: ["combat", "entrenchmentDamageTaken"],
  });

export type FacingRules = z.infer<typeof FacingRulesSchema>;
export type TerrainRules = z.infer<typeof TerrainRulesSchema>;
export type StanceRules = z.infer<typeof StanceRulesSchema>;
export type DetectionRules = z.infer<typeof DetectionRulesSchema>;
export type CombatRules = z.infer<typeof CombatRulesSchema>;
export type SupplyRules = z.infer<typeof SupplyRulesSchema>;
export type RulePack = z.infer<typeof RulePackSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** スキーマで検証する。壊れたデータは「どこが・なぜ」を並べて返す。 */
export function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): ParseResult<T> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(ルート)"}: ${i.message}`),
  };
}

export function parseRulePack(input: unknown): ParseResult<RulePack> {
  return parseWith(RulePackSchema, input);
}
