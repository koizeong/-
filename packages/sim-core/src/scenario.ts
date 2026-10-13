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
    /**
     * 陣営(プレイヤー)ごとの、1ターンに使える指揮ポイント。中身のある命令1つ・司令部コマンド1つで1ずつ使う。
     * 書かれていない陣営は無制限
     */
    commandPoints: z.record(z.string(), z.number().int().min(0)).default({}),
    /**
     * 天候の推移。ターンごとに変わりうるが、現実離れしてコロコロ変わらないよう、
     * 変化は低い確率で隣の状態へだけ起こり、一度変わったら minHoursBetweenChanges の間は変わらない
     */
    weather: z
      .object({
        initial: z.string(),
        /** 1時間あたりに変化する確率(0なら変わらない) */
        changeChancePerHour: z.number().min(0).max(1),
        minHoursBetweenChanges: z.number().min(0),
        /** 変化したときに、良くなる方向へ変わる確率 */
        improveChance: z.number().min(0).max(1),
      })
      .default({ initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 }),
    /** 陣営ごとの航空戦力(マップ外)。書かれていない陣営は使えない */
    air: z
      .record(
        z.string(),
        z.object({
          strike: z
            .object({
              sortiesPerDay: z.number().int().min(0),
              /** 攻撃機の武器(武器パックのキー)と機数 */
              weapon: z.string(),
              count: z.number().int().positive(),
              /** 1回の空襲が続く時間(分)。ターン中のランダムな時刻から始まる */
              strikeMinutes: z.number().positive(),
            })
            .optional(),
          airlift: z
            .object({
              sortiesPerDay: z.number().int().min(0),
              /** 1回で投下する量(トン) */
              ammoT: z.number().min(0),
              fuelT: z.number().min(0),
            })
            .optional(),
        }),
      )
      .default({}),
    /**
     * 夜間フェイズ。turn のターンを夜(長さ hours 時間)として解決する。
     * 夜は補給・休息・増援到着・浸透移動・夜襲だけが起きる(砲撃・航空なし)
     */
    night: z.object({ turn: z.number().int().positive(), hours: z.number().positive() }).nullable().default(null),
    /** 増援:turn のターンの始めに、指定の位置に現れる */
    reinforcements: z
      .array(
        z.object({
          turn: z.number().int().min(2),
          id: z.string().min(1),
          side: z.string().min(1),
          /** 省略すると編成表の兵科 */
          branch: z.string().min(1).optional(),
          toe: z.string().min(1),
          x: z.number(),
          y: z.number(),
          facing: z.number(),
          stance: z.string().optional(),
        }),
      )
      .default([]),
  })
  .superRefine((s, ctx) => {
    if (s.night && s.night.turn > s.maxTurns) ctx.addIssue({ code: "custom", path: ["night", "turn"], message: "夜間フェイズが規定ターンの外です" });
    for (const [i, r] of s.reinforcements.entries()) {
      if (r.turn > s.maxTurns) ctx.addIssue({ code: "custom", path: ["reinforcements", i, "turn"], message: "増援の到着が規定ターンの外です" });
    }
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
  return {
    maxTurns,
    objectives: [],
    victory: {},
    commandPoints: {},
    weather: { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 },
    air: {},
    night: null,
    reinforcements: [],
  };
}

/** そのターンが夜間フェイズか */
export function isNightTurn(scenario: ScenarioRules, turn: number): boolean {
  return scenario.night?.turn === turn;
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
