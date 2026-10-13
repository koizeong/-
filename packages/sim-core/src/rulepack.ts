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
});

export const StanceRulesSchema = z.object({
  name: z.string().min(1),
  /** 陣地レベル上限への加減 */
  entrenchmentCapModifier: z.number().int(),
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
    terrain: z.record(z.string(), TerrainRulesSchema),
    stances: z.record(z.string(), StanceRulesSchema),
    /** 新規ユニットの姿勢であり、姿勢切替中のターンに扱う姿勢 */
    defaultStance: z.string(),
  })
  .refine((r) => r.defaultStance in r.stances, {
    message: "defaultStance が stances に定義されていません",
    path: ["defaultStance"],
  });

export type FacingRules = z.infer<typeof FacingRulesSchema>;
export type TerrainRules = z.infer<typeof TerrainRulesSchema>;
export type StanceRules = z.infer<typeof StanceRulesSchema>;
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
