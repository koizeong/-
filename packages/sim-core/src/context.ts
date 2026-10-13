import type { BranchPack } from "./branch.js";
import type { RulePack } from "./rulepack.js";
import type { RoadNetwork } from "./roads.js";
import type { ScenarioRules } from "./scenario.js";
import type { TerrainMap } from "./terrain.js";
import type { ToePack } from "./toe.js";
import type { WeaponPack } from "./weapon.js";

export interface SimContext {
  rules: RulePack;
  branches: BranchPack;
  weapons: WeaponPack;
  toes: ToePack;
  terrain: TerrainMap;
  roads: RoadNetwork;
  /** 目標地点・勝利条件・規定ターン数 */
  scenario: ScenarioRules;
  /** 1ターンの長さ(秒)。シナリオのパラメーター */
  turnSeconds: number;
  /** 戦闘フェイズの小ステップ(秒) */
  stepSeconds: number;
  /** 基本の視程の倍率。天候と昼夜の倍率は、ターンの解決時にこれにかける */
  visibilityMultiplier: number;
  /** 解決中のターンが昼か夜か(ターンの解決時に設定する。省略は昼) */
  phase?: "day" | "night";
  /** 展開にかかる時間(秒)。夜間フェイズでも昼の1ターン分のまま(省略は turnSeconds) */
  deploySeconds?: number;
}
