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
  /** 観測側として:探知距離への倍率(偵察部隊は大きい) */
  visionMultiplier: z.number().positive(),
  /**
   * 阻止の力への倍率(省略は1)。砲兵のように、陣地を築いても機動部隊の前進を止める力のない兵科は小さくする
   */
  holdingMultiplier: z.number().min(0).default(1),
  /**
   * 直接射撃で受ける損害への倍率(省略は1)。近距離で撃ち合う編成になっていない兵科(砲兵:砲と砲員がむき出し)は大きくする
   */
  directDamageTakenMultiplier: z.number().positive().default(1),
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
