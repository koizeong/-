import { z } from "zod";
import type { SimContext } from "./context.js";
import { distance } from "./geometry.js";
import { parseWith, type ParseResult } from "./rulepack.js";
import type { Unit } from "./unit.js";

/** 勝利の段階の条件:必須の目標をすべて保持し、かつ保持している目標の重みの合計が minWeight 以上 */
const VictoryTierSchema = z.object({
  required: z.array(z.string()).default([]),
  minWeight: z.number().min(0).default(0),
});

/**
 * シナリオの勝利条件(企画書9章:目標達成型・非対称・段階的)。
 * 判定は最終ターン終了時。途中で決着はつけない。
 */
export const ScenarioRulesSchema = z
  .object({
    /** このターンを解決し終えたら終了 */
    maxTurns: z.number().int().positive(),
    objectives: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        x: z.number(),
        y: z.number(),
        /** この距離以内に、ある陣営のユニットだけがいれば、その陣営が押さえる */
        radiusM: z.number().positive(),
        weight: z.number().min(0),
        /** 開始時の保持陣営 */
        initialHolder: z.string().nullable(),
      }),
    ),
    victory: z.record(
      z.string(),
      z.object({
        decisive: VictoryTierSchema,
        limited: VictoryTierSchema,
      }),
    ),
  })
  .superRefine((s, ctx) => {
    const ids = new Set(s.objectives.map((o) => o.id));
    if (ids.size !== s.objectives.length) ctx.addIssue({ code: "custom", path: ["objectives"], message: "目標のIDが重複しています" });
    for (const [side, v] of Object.entries(s.victory)) {
      for (const tier of ["decisive", "limited"] as const) {
        for (const id of v[tier].required) {
          if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["victory", side, tier, "required"], message: `目標 "${id}" がありません` });
        }
      }
    }
  });

export type ScenarioRules = z.infer<typeof ScenarioRulesSchema>;
export type Objective = ScenarioRules["objectives"][number];

export function parseScenarioRules(input: unknown): ParseResult<ScenarioRules> {
  return parseWith(ScenarioRulesSchema, input);
}

export function emptyScenario(maxTurns = 999): ScenarioRules {
  return { maxTurns, objectives: [], victory: {} };
}

/** 目標ID → 保持陣営(null は未保持) */
export type ObjectiveHolders = Record<string, string | null>;

export function initialHolders(scenario: ScenarioRules): ObjectiveHolders {
  return Object.fromEntries(scenario.objectives.map((o) => [o.id, o.initialHolder]));
}

/**
 * 目標の保持を更新する。範囲内に1つの陣営のユニット(戦力あり・潰走していない)だけがいれば、その陣営が押さえる。
 * 誰もいない・取り合っているときは、前の保持者のまま。変わった目標を返す。
 */
export function updateHolders(holders: ObjectiveHolders, units: readonly Unit[], ctx: SimContext): { id: string; from: string | null; to: string }[] {
  const changes: { id: string; from: string | null; to: string }[] = [];
  for (const o of ctx.scenario.objectives) {
    const present = new Set(
      units.filter((u) => u.strength > 0 && !u.routed && distance(u.pos, o) <= o.radiusM).map((u) => u.side),
    );
    if (present.size !== 1) continue;
    const side = [...present][0]!;
    const from = holders[o.id] ?? null;
    if (from !== side) {
      holders[o.id] = side;
      changes.push({ id: o.id, from, to: side });
    }
  }
  return changes;
}

export type VictoryLevel = "decisive" | "limited" | "none";

export interface VictoryResult {
  /** 勝った陣営(引き分けなら null) */
  winner: string | null;
  /** 勝者の段階。引き分けなら "draw" */
  level: "decisive" | "limited" | "draw";
  perSide: Record<string, { heldWeight: number; level: VictoryLevel }>;
}

/** 勝敗を判定する。両陣営の到達段階を比べ、高い方の勝ち。同じなら引き分け */
export function evaluateVictory(holders: ObjectiveHolders, ctx: SimContext): VictoryResult {
  const { scenario } = ctx;
  const perSide: VictoryResult["perSide"] = {};
  for (const [side, v] of Object.entries(scenario.victory)) {
    const held = new Set(scenario.objectives.filter((o) => holders[o.id] === side).map((o) => o.id));
    const heldWeight = scenario.objectives.filter((o) => held.has(o.id)).reduce((s, o) => s + o.weight, 0);
    const meets = (t: { required: string[]; minWeight: number }) => t.required.every((id) => held.has(id)) && heldWeight >= t.minWeight;
    perSide[side] = { heldWeight, level: meets(v.decisive) ? "decisive" : meets(v.limited) ? "limited" : "none" };
  }
  const rank = { decisive: 2, limited: 1, none: 0 } as const;
  const ranked = Object.entries(perSide).sort((a, b) => rank[b[1].level] - rank[a[1].level] || (a[0] < b[0] ? -1 : 1));
  const [first, second] = ranked;
  if (!first || first[1].level === "none" || (second && rank[second[1].level] === rank[first[1].level])) {
    return { winner: null, level: "draw", perSide };
  }
  return { winner: first[0], level: first[1].level as "decisive" | "limited", perSide };
}
