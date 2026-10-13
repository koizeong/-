import { z } from "zod";
import { parseWith, type ParseResult } from "./rulepack.js";

/**
 * 兵科の定義。
 * 速度は本来 TO&E と装備から導出する(設計ルール5)。編成表のスキーマができるまでの仮置き。
 */
export const BranchSchema = z.object({
  name: z.string().min(1),
  /** 行軍速度(m/分)。戦闘移動はこれにルールパックの combatMoveSpeedRatio をかける */
  marchSpeedMpm: z.number().positive(),
  /** 陣地レベル上限への加減 */
  entrenchmentCapModifier: z.number().int(),
});

export const BranchPackSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  branches: z.record(z.string(), BranchSchema),
});

export type Branch = z.infer<typeof BranchSchema>;
export type BranchPack = z.infer<typeof BranchPackSchema>;

export function parseBranchPack(input: unknown): ParseResult<BranchPack> {
  return parseWith(BranchPackSchema, input);
}
