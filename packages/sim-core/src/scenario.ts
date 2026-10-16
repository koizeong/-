import { z } from "zod";
import type { SimContext } from "./context.js";
import { distance } from "./geometry.js";
import { parseWith, type ParseResult } from "./rulepack.js";
import type { Unit } from "./unit.js";

/**
 * 勝利の段階の条件:必須の目標をすべて保持し、かつ保持している目標の重みの合計が minWeight 以上。
 * minEnemyLoss があれば、敵の損耗率(敵の総戦力のうち失われた割合)がそれ以上であることも求める
 * (撃滅・漸減を狙うシナリオ)。maxOwnLoss があれば、自軍の損耗率がそれ以下であることも求める(消耗抑制)
 */
const VictoryTierSchema = z.object({
  required: z.array(z.string()).default([]),
  minWeight: z.number().min(0).default(0),
  minEnemyLoss: z.number().min(0).max(1).optional(),
  maxOwnLoss: z.number().min(0).max(1).optional(),
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
        /** この日にありうる天候(省略はすべて)。史実で天候の幅が分かっている日に使う */
        allowed: z.array(z.string()).optional(),
        /**
         * 天候の予定(複数日のシナリオで、史実の天候の移り変わりを決める)。turn のターンの始めに weather にし、
         * allowed があれば、そこから先にありうる天候をそれに替える
         */
        schedule: z.array(z.object({ turn: z.number().int().min(2), weather: z.string(), allowed: z.array(z.string()).optional() })).optional(),
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
          /** 制空任務(戦闘機)の1日の出撃回数 */
          fighters: z.object({ sortiesPerDay: z.number().int().min(0) }).optional(),
          /** 航空偵察の1日の出撃回数 */
          recon: z.object({ sortiesPerDay: z.number().int().min(0) }).optional(),
          /** 開始時の制空権の重み(陣営どうしの比で割合になる。省略は1) */
          initialControl: z.number().min(0).optional(),
        }),
      )
      .default({}),
    /** 陣営ごとの海上戦力(マップ外)。書かれていない陣営は使えない */
    naval: z
      .record(
        z.string(),
        z.object({
          /** 艦砲射撃:要請した次のターンに、1ターンかけて着弾する(砲撃と同じ。誤射あり) */
          gunfire: z.object({
            missionsPerDay: z.number().int().min(0),
            /** 艦砲(武器パックのキー)と門数 */
            weapon: z.string(),
            count: z.number().int().positive(),
            /** 海(navigable な地形)からこの距離(m)以内の地点にだけ届く */
            rangeFromSeaM: z.number().positive(),
          }),
        }),
      )
      .default({}),
    /**
     * 夜間フェイズ。turn のターンを夜(長さ hours 時間)として解決する。
     * everyTurns があれば、そこから everyTurns ターンごとに夜が来る(複数日のシナリオ。昼のターン数 + 夜1ターン)。
     * 夜は補給・休息・増援到着・浸透移動・夜襲だけが起きる(砲撃・航空なし)。夜が明けると、1日ごとの回数(航空・艦砲・斥候)が戻る
     */
    night: z
      .object({ turn: z.number().int().positive(), hours: z.number().positive(), everyTurns: z.number().int().min(2).optional() })
      .nullable()
      .default(null),
    /**
     * 戦場からの離脱:turn のターンの始めに、そのユニットがマップから去る(史実で別の方面へ転用された部隊など)。
     * 損耗ではない(去った時点で残っていた戦力は、損耗率の分母からも除く)。すでに失われていれば何もしない
     */
    withdrawals: z.array(z.object({ turn: z.number().int().min(2), id: z.string().min(1) })).default([]),
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
    /**
     * 空挺部隊:マップの外で待機し、司令部コマンド「空挺降下」で、選んだ地点へ次のターンの始めに降りる。
     * availableFromTurn のターンから要請できる
     */
    airborne: z
      .array(
        z.object({
          id: z.string().min(1),
          side: z.string().min(1),
          /** 省略すると編成表の兵科 */
          branch: z.string().min(1).optional(),
          toe: z.string().min(1),
          stance: z.string().optional(),
          availableFromTurn: z.number().int().min(1).default(1),
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
    naval: {},
    night: null,
    reinforcements: [],
    withdrawals: [],
    airborne: [],
  };
}

/** そのターンが夜間フェイズか */
export function isNightTurn(scenario: Pick<ScenarioRules, "night">, turn: number): boolean {
  const n = scenario.night;
  if (!n) return false;
  if (n.everyTurns === undefined) return n.turn === turn;
  return turn >= n.turn && (turn - n.turn) % n.everyTurns === 0;
}

/** そのターンが何日目か(1始まり。夜のターンはその日の終わりに数える) */
export function dayOfTurn(scenario: Pick<ScenarioRules, "night">, turn: number): number {
  const n = scenario.night;
  if (!n || turn <= n.turn) return 1;
  if (n.everyTurns === undefined) return 2;
  return 2 + Math.floor((turn - n.turn - 1) / n.everyTurns);
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
  perSide: Record<string, { heldWeight: number; enemyLoss: number; ownLoss: number; level: VictoryLevel }>;
}

/**
 * 勝敗を判定する。両陣営の到達段階を比べ、高い方の勝ち。同じなら引き分け。
 * @param enemyLoss 陣営ごとの、敵の損耗率(省略は0)
 * @param ownLoss 陣営ごとの、自軍の損耗率(省略は0)
 */
export function evaluateVictory(
  holders: ObjectiveHolders,
  ctx: SimContext,
  enemyLoss: Record<string, number> = {},
  ownLoss: Record<string, number> = {},
): VictoryResult {
  const { scenario } = ctx;
  const perSide: VictoryResult["perSide"] = {};
  for (const [side, v] of Object.entries(scenario.victory)) {
    const held = new Set(scenario.objectives.filter((o) => holders[o.id] === side).map((o) => o.id));
    const heldWeight = scenario.objectives.filter((o) => held.has(o.id)).reduce((s, o) => s + o.weight, 0);
    const loss = enemyLoss[side] ?? 0;
    const own = ownLoss[side] ?? 0;
    const meets = (t: { required: string[]; minWeight: number; minEnemyLoss?: number | undefined; maxOwnLoss?: number | undefined }) =>
      t.required.every((id) => held.has(id)) && heldWeight >= t.minWeight && loss >= (t.minEnemyLoss ?? 0) && own <= (t.maxOwnLoss ?? 1);
    perSide[side] = { heldWeight, enemyLoss: loss, ownLoss: own, level: meets(v.decisive) ? "decisive" : meets(v.limited) ? "limited" : "none" };
  }
  const rank = { decisive: 2, limited: 1, none: 0 } as const;
  const ranked = Object.entries(perSide).sort((a, b) => rank[b[1].level] - rank[a[1].level] || (a[0] < b[0] ? -1 : 1));
  const [first, second] = ranked;
  if (!first || first[1].level === "none" || (second && rank[second[1].level] === rank[first[1].level])) {
    return { winner: null, level: "draw", perSide };
  }
  return { winner: first[0], level: first[1].level as "decisive" | "limited", perSide };
}
