import type { BranchPack } from "./branch.js";
import type { RulePack } from "./rulepack.js";
import type { TerrainMap } from "./terrain.js";

export interface SimContext {
  rules: RulePack;
  branches: BranchPack;
  terrain: TerrainMap;
  /** 1ターンの長さ(秒)。シナリオのパラメーター */
  turnSeconds: number;
  /** 戦闘フェイズの小ステップ(秒) */
  stepSeconds: number;
  /** 天候・昼夜による視程の倍率。シナリオがターンごとに与える */
  visibilityMultiplier: number;
}
