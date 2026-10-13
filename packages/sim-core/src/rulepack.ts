import { z } from "zod";

/**
 * 時代ルールパック。時代ごとに変わる数値はここに置き、コードに直書きしない。
 * まずは向き判定だけ。項目は機能を実装するたびに足していく。
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

export const RulePackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** 数値の根拠や仮置きであることのメモ(JSONにはコメントが書けないため) */
  notes: z.string().optional(),
  facing: FacingRulesSchema,
});

export type FacingRules = z.infer<typeof FacingRulesSchema>;
export type RulePack = z.infer<typeof RulePackSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** 読み込んだJSONを検証する。壊れたデータは「どこが・なぜ」を並べて返す。 */
export function parseRulePack(input: unknown): ParseResult<RulePack> {
  const r = RulePackSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(ルート)"}: ${i.message}`),
  };
}
