import { z } from "zod";
import type { BranchPack } from "./branch.js";
import type { SimContext } from "./context.js";
import type { Depot } from "./depot.js";
import { RoadNetwork, RoadNetworkSchema } from "./roads.js";
import { parseWith, type ParseResult, type RulePack } from "./rulepack.js";
import { ScenarioRulesSchema } from "./scenario.js";
import { mobilityOf } from "./supply.js";
import { TerrainMap, TerrainMapSchema } from "./terrain.js";
import type { ToePack } from "./toe.js";
import { startScenario, validateContext, validatePacks, type GameState } from "./turn.js";
import { createUnit, type Unit } from "./unit.js";
import type { WeaponPack } from "./weapon.js";
import { terrainSpeed } from "./pathfinding.js";

/** 初期配置の部隊。兵科は省略すると編成表の兵科 */
const UnitPlacementSchema = z.object({
  id: z.string().min(1),
  side: z.string().min(1),
  toe: z.string().min(1),
  branch: z.string().min(1).optional(),
  x: z.number(),
  y: z.number(),
  facing: z.number(),
  stance: z.string().optional(),
  formation: z.enum(["column", "deploying", "deployed"]).optional(),
  entrenchment: z.number().int().optional(),
  ammo: z.number().min(0).max(1).optional(),
  fuel: z.number().min(0).max(1).optional(),
  fatigue: z.number().min(0).max(1).optional(),
});

/**
 * シナリオファイル。地図・道路・部隊・集積所・目標・天候・航空・夜・増援を1つにまとめる。
 * 使うパック(ルール・兵科・武器・編成表)はIDで参照する。
 */
export const ScenarioFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  /** 史実の数値の出典や、仮置きであることのメモ */
  notes: z.string().optional(),
  packs: z.object({
    rules: z.string(),
    branches: z.string(),
    weapons: z.string(),
    toe: z.string(),
  }),
  sides: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).min(2),
  time: z.object({
    /** 昼の1ターンの長さ(秒) */
    turnSeconds: z.number().positive(),
    /** 戦闘フェイズの小ステップ(秒) */
    stepSeconds: z.number().positive(),
    /** 1ターン目の開始時刻(時。表示用) */
    startHour: z.number().min(0).lt(24).optional(),
  }),
  visibilityMultiplier: z.number().positive().default(1),
  /** 霧の濃度の既定値(ルールパックの fog.levels のキー)。試合ごとに上書きできる。省略はルールパックの既定 */
  fogDensity: z.string().optional(),
  map: TerrainMapSchema,
  roads: RoadNetworkSchema.default({ nodes: {}, edges: [] }),
  rules: ScenarioRulesSchema,
  units: z.array(UnitPlacementSchema),
  depots: z
    .array(
      z.object({
        id: z.string().min(1),
        side: z.string().min(1),
        nodeId: z.string().min(1),
        ammoT: z.number().min(0),
        fuelT: z.number().min(0),
      }),
    )
    .default([]),
});

export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;

/** 読み込み済みのパック(IDごと) */
export interface PackSet {
  rules: Record<string, RulePack>;
  branches: Record<string, BranchPack>;
  weapons: Record<string, WeaponPack>;
  toes: Record<string, ToePack>;
}

export interface LoadedScenario {
  def: ScenarioFile;
  ctx: SimContext;
  units: Unit[];
  depots: Depot[];
  /** シナリオと使うパックの中身から計算したハッシュ(オンライン対戦で構成を照合する) */
  hash: string;
  /** シードを決めて開始状態を作る */
  start(seed: number): GameState;
}

/**
 * シナリオファイルを検証し、実行用の文脈と開始状態を作る。ファイルは読まない(純粋な関数)。
 * 壊れていれば、形式の誤りと参照切れを「どこが・なぜ」の形でまとめて返す。
 */
export function buildScenario(input: unknown, packs: PackSet): ParseResult<LoadedScenario> {
  const parsed = parseWith(ScenarioFileSchema, input);
  if (!parsed.ok) return parsed;
  const def = parsed.value;
  const errors: string[] = [];

  const rules = packs.rules[def.packs.rules];
  const branches = packs.branches[def.packs.branches];
  const weapons = packs.weapons[def.packs.weapons];
  const toes = packs.toes[def.packs.toe];
  if (!rules) errors.push(`packs.rules: ルールパック "${def.packs.rules}" がありません`);
  if (!branches) errors.push(`packs.branches: 兵科パック "${def.packs.branches}" がありません`);
  if (!weapons) errors.push(`packs.weapons: 武器パック "${def.packs.weapons}" がありません`);
  if (!toes) errors.push(`packs.toe: 編成パック "${def.packs.toe}" がありません`);
  if (!rules || !branches || !weapons || !toes) return { ok: false, errors };

  const terrain = new TerrainMap(def.map);
  const ctx: SimContext = {
    rules,
    branches,
    weapons,
    toes,
    terrain,
    roads: new RoadNetwork(def.roads),
    scenario: def.rules,
    turnSeconds: def.time.turnSeconds,
    stepSeconds: def.time.stepSeconds,
    visibilityMultiplier: def.visibilityMultiplier,
    ...(def.fogDensity !== undefined ? { fogDensity: def.fogDensity } : {}),
  };

  // 陣営
  const sides = new Set(def.sides.map((s) => s.id));
  if (sides.size !== def.sides.length) errors.push("sides: 陣営のIDが重複しています");
  const checkSide = (path: string, side: string | null) => {
    if (side !== null && !sides.has(side)) errors.push(`${path}: 陣営 "${side}" が sides にありません`);
  };
  def.rules.objectives.forEach((o, i) => checkSide(`rules.objectives.${i}.initialHolder`, o.initialHolder));
  for (const side of Object.keys(def.rules.victory)) checkSide(`rules.victory.${side}`, side);
  for (const side of Object.keys(def.rules.commandPoints)) checkSide(`rules.commandPoints.${side}`, side);
  for (const side of Object.keys(def.rules.air)) checkSide(`rules.air.${side}`, side);
  def.rules.reinforcements.forEach((r, i) => checkSide(`rules.reinforcements.${i}.side`, r.side));
  def.depots.forEach((d, i) => checkSide(`depots.${i}.side`, d.side));

  // 部隊:編成表・陣営・姿勢・位置(マップの中で、その部隊が入れる地形)
  const units: Unit[] = [];
  const ids = new Set<string>();
  def.units.forEach((p, i) => {
    const path = `units.${i}(${p.id})`;
    if (ids.has(p.id)) errors.push(`${path}: IDが重複しています`);
    ids.add(p.id);
    checkSide(`${path}.side`, p.side);
    const toe = toes.toes[p.toe];
    if (!toe) {
      errors.push(`${path}.toe: 編成表 "${p.toe}" がありません`);
      return;
    }
    if (p.stance !== undefined && !(p.stance in rules.stances)) errors.push(`${path}.stance: 姿勢 "${p.stance}" がありません`);
    if (p.x < 0 || p.y < 0 || p.x > terrain.widthM || p.y > terrain.heightM) {
      errors.push(`${path}: 位置 (${p.x}, ${p.y}) がマップの外です`);
      return;
    }
    const u = createUnit({
      id: p.id,
      side: p.side,
      branch: p.branch ?? toe.branch,
      toe: p.toe,
      pos: { x: p.x, y: p.y },
      facing: p.facing,
      stance: p.stance ?? rules.defaultStance,
      ...(p.formation !== undefined ? { formation: p.formation } : {}),
      ...(p.entrenchment !== undefined ? { entrenchment: p.entrenchment } : {}),
      ...(p.ammo !== undefined ? { ammo: p.ammo } : {}),
      ...(p.fuel !== undefined ? { fuel: p.fuel } : {}),
      ...(p.fatigue !== undefined ? { fatigue: p.fatigue } : {}),
    });
    const terrainId = terrain.terrainAt(u.pos);
    if (terrainId in rules.terrain && terrainSpeed(terrainId, mobilityOf(u, ctx), ctx) <= 0) {
      errors.push(`${path}: 位置 (${p.x}, ${p.y}) は入れない地形(${rules.terrain[terrainId]!.name})です`);
    }
    units.push(u);
  });

  const depots: Depot[] = def.depots.map((d) => ({ ...d }));
  if (errors.length === 0) {
    errors.push(...validatePacks(ctx), ...validateContext(ctx, units, depots));
  }
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const hash = contentHash({ scenario: def, rules, branches, weapons, toes });
  return {
    ok: true,
    value: { def, ctx, units, depots, hash, start: (seed: number) => startScenario(units, seed, ctx, depots) },
  };
}

/**
 * 内容のハッシュ(キーの順序に依存しない)。FNV-1a を2系統回して64bit相当の16進文字列にする。
 * 改ざん防止ではなく、構成が同じかどうかの照合用。
 */
export function contentHash(value: unknown): string {
  const text = canonicalJson(value);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(",")}}`;
}
