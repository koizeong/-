import { z } from "zod";
import type { SimContext } from "./context.js";
import { distance } from "./geometry.js";
import { parseWith, type ParseResult } from "./rulepack.js";
import type { Unit } from "./unit.js";

/**
 * 勝利の条件(勝利点制)。陣営ごとに条件を並べ、条件ごとに勝利点を与える。段階(決定的・限定的)は、勝利点の合計
 * (minPoints)と、満たさなければならない条件(requires)で決める。判定は最終ターン終了時。
 * - hold:目標を保持する。perTurn なら、保持していたターンの割合だけ点がたまる(最後のターンに奪うだけの戦い方を防ぐ)。
 *   満たした扱いは、終わったときに保持していること
 * - holdUntil:turn ターン目が終わるまで、敵にその目標を一度も保持させない(遅滞戦)
 * - enemyLoss:敵の損耗率が min 以上 / ownLoss:自軍の損耗率が max 以下
 * - lossRatio:自軍の損耗率が、敵の損耗率の max 倍以下(敵より損耗を抑える。どちらも損耗がなければ満たさない)
 */
const pointsField = z.number().min(0).default(0);
export const VictoryConditionSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().min(1), type: z.literal("hold"), objective: z.string().min(1), points: pointsField, perTurn: z.boolean().default(false) }),
  z.object({ id: z.string().min(1), type: z.literal("holdUntil"), objective: z.string().min(1), turn: z.number().int().positive(), points: pointsField }),
  z.object({ id: z.string().min(1), type: z.literal("enemyLoss"), min: z.number().min(0).max(1), points: pointsField }),
  z.object({ id: z.string().min(1), type: z.literal("ownLoss"), max: z.number().min(0).max(1), points: pointsField }),
  z.object({ id: z.string().min(1), type: z.literal("lossRatio"), max: z.number().positive(), points: pointsField }),
]);
export type VictoryCondition = z.infer<typeof VictoryConditionSchema>;

const VictoryTierSchema = z.object({
  /** 勝利点の合計がこれ以上 */
  minPoints: z.number().min(0).default(0),
  /** 満たさなければならない条件の ID */
  requires: z.array(z.string()).default([]),
});
export type VictoryTier = z.infer<typeof VictoryTierSchema>;

/**
 * 旧い形(段階ごとに required・minWeight・minEnemyLoss・maxOwnLoss)を勝利点制に読み替える。
 * 目標ごとに hold の条件(勝利点 = 目標の重み)を作り、required はその条件を requires に、minWeight は minPoints に、
 * 損耗の条件は勝利点0の条件にして requires に入れる。判定は旧い形とまったく同じになる
 */
export function legacyVictory(objectives: readonly { id: string; weight: number }[], side: Record<string, unknown>): Record<string, unknown> {
  if ("conditions" in side) return side;
  const conditions: Record<string, unknown>[] = objectives.map((o) => ({ id: `hold:${o.id}`, type: "hold", objective: o.id, points: o.weight }));
  const tier = (name: string) => {
    const t = (side[name] ?? {}) as { required?: string[]; minWeight?: number; minEnemyLoss?: number; maxOwnLoss?: number };
    const requires: string[] = [];
    for (const id of t.required ?? []) {
      // 目標の一覧にない ID も条件にして、検証で「目標がありません」と知らせる
      if (!conditions.some((c) => c.id === `hold:${id}`)) conditions.push({ id: `hold:${id}`, type: "hold", objective: id, points: 0 });
      requires.push(`hold:${id}`);
    }
    if (t.minEnemyLoss !== undefined) {
      conditions.push({ id: `enemyLoss:${name}`, type: "enemyLoss", min: t.minEnemyLoss, points: 0 });
      requires.push(`enemyLoss:${name}`);
    }
    if (t.maxOwnLoss !== undefined) {
      conditions.push({ id: `ownLoss:${name}`, type: "ownLoss", max: t.maxOwnLoss, points: 0 });
      requires.push(`ownLoss:${name}`);
    }
    return { minPoints: t.minWeight ?? 0, requires };
  };
  const { decisive: _d, limited: _l, ...rest } = side;
  return { ...rest, conditions, decisive: tier("decisive"), limited: tier("limited") };
}

/** 陣営ごとの勝利条件 */
export const SideVictorySchema = z.object({
  conditions: z.array(VictoryConditionSchema).default([]),
  decisive: VictoryTierSchema,
  limited: VictoryTierSchema,
  /**
   * 急ぎ度(0〜1、省略は0):どれだけ時間に追われているか(上級司令部の期限・時刻表の厳しさ)。
   * AIは、勝利条件に欠かせない目標へ遮二無二の突撃をかけ始める時期をこれで決める
   * (1 なら最初から、0.5 なら後半から、0 なら終わり間際だけ)。時間に余裕があれば、持続できる攻勢で削る
   */
  urgency: z.number().min(0).max(1).default(0),
});
export type SideVictory = z.infer<typeof SideVictorySchema>;

/** 勝利条件を読む(旧い形も)。テストや生成器で使う */
export function sideVictory(objectives: readonly { id: string; weight: number }[], input: Record<string, unknown>): SideVictory {
  return SideVictorySchema.parse(legacyVictory(objectives, input));
}

/** 読み込む前に、旧い形の勝利条件を勝利点制へ読み替える */
function migrateVictory(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const s = input as { objectives?: { id: string; weight: number }[]; victory?: Record<string, Record<string, unknown>> };
  if (!s.victory || typeof s.victory !== "object") return input;
  const objectives = Array.isArray(s.objectives) ? s.objectives : [];
  return { ...s, victory: Object.fromEntries(Object.entries(s.victory).map(([side, v]) => [side, v && typeof v === "object" ? legacyVictory(objectives, v) : v])) };
}

/**
 * シナリオの勝利条件(企画書9章:目標達成型・非対称・段階的)。
 * 判定は最終ターン終了時。途中で決着はつけない。
 */
const ScenarioRulesObject = z
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
      SideVictorySchema,
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
        /** 天候の並び(悪い → 良い)。省略はルールパックの並び。雨・雪などルールパックの並びにない天候を使うときに書く */
        order: z.array(z.string()).min(1).optional(),
        /** 初めの地面の状態(ぬかるみ・積雪、0〜1)。省略は0 */
        ground: z.object({ mud: z.number().min(0).max(1).default(0), snow: z.number().min(0).max(1).default(0) }).optional(),
      })
      .default({ initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 }),
    /** 陣営ごとの航空戦力(マップ外)。書かれていない陣営は使えない */
    air: z
      .record(
        z.string(),
        z.object({
          /**
           * 攻撃機(空襲・近接航空支援・補給線への攻撃)。groups は編隊の数で、1日の出撃枠は
           * 編隊の数 × ルールパックの sortiesPerGroupPerDay。迎撃・対空砲で失った編隊は持ち越す。毎朝 replacementPerDay だけ補充する(開始時の数まで)
           */
          strike: z
            .object({
              groups: z.number().min(0),
              replacementPerDay: z.number().min(0).default(0),
              /** 1回の出撃の武器(武器パックのキー)と機数 */
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
          /** 戦闘機(制空任務・護衛・航空偵察)。編隊の数と補充は攻撃機と同じ扱い */
          fighters: z.object({ groups: z.number().min(0), replacementPerDay: z.number().min(0).default(0) }).optional(),
          /** 制空任務を出していない空域の制空権の重み(陣営どうしの比で割合になる。省略は1 = 等分。2陣営なら50%) */
          baseControl: z.number().min(0).optional(),
        }),
      )
      .default({}),
    /** 制空権を持つ空域の分け方(地図を cols × rows に等分)。省略はルールパックの air.sectors */
    airSectors: z.object({ cols: z.number().int().min(1), rows: z.number().int().min(1) }).optional(),
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
     * 暗い時間(昼のターンとして1時間ごとに解くが、見通しは夜と同じ。航空は使えない)。夜通しの戦いを1時間ごとに解くシナリオ
     * (エドソンの丘の2晩の夜襲など)で、夜間フェイズの代わりに使う。from〜to のターン(両端を含む)
     */
    darkTurns: z.array(z.object({ from: z.number().int().positive(), to: z.number().int().positive() })).default([]),
    /**
     * 投降しない陣営:包囲されても士気を失わず、籠城の限界・逃げ場を失った潰走でも投降しない(最後まで戦う)。
     * 島の守備隊のように、はじめから海に囲まれて孤立し、投降をほとんどしなかった軍(硫黄島の日本軍など)に使う
     */
    noSurrender: z.array(z.string().min(1)).default([]),
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
          /** 練度(ルールパックの training.levels のキー)。省略はルールパックの既定 */
          training: z.string().optional(),
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
    /** 初めから壊れている橋(橋のID = 道路の区間の "from~to")。どの区間が橋かは地図から決まる(bridges.ts) */
    destroyedBridges: z.array(z.string().min(1)).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.night && s.night.turn > s.maxTurns) ctx.addIssue({ code: "custom", path: ["night", "turn"], message: "夜間フェイズが規定ターンの外です" });
    for (const [i, r] of s.reinforcements.entries()) {
      if (r.turn > s.maxTurns) ctx.addIssue({ code: "custom", path: ["reinforcements", i, "turn"], message: "増援の到着が規定ターンの外です" });
    }
    const ids = new Set(s.objectives.map((o) => o.id));
    if (ids.size !== s.objectives.length) ctx.addIssue({ code: "custom", path: ["objectives"], message: "目標のIDが重複しています" });
    for (const [side, v] of Object.entries(s.victory)) {
      const condIds = new Set<string>();
      for (const [i, c] of v.conditions.entries()) {
        if (condIds.has(c.id)) ctx.addIssue({ code: "custom", path: ["victory", side, "conditions", i, "id"], message: `条件のIDが重複しています: ${c.id}` });
        condIds.add(c.id);
        if ((c.type === "hold" || c.type === "holdUntil") && !ids.has(c.objective)) {
          ctx.addIssue({ code: "custom", path: ["victory", side, "conditions", i, "objective"], message: `目標 "${c.objective}" がありません` });
        }
        if (c.type === "holdUntil" && c.turn > s.maxTurns) ctx.addIssue({ code: "custom", path: ["victory", side, "conditions", i, "turn"], message: "期限が規定ターンの外です" });
      }
      for (const tier of ["decisive", "limited"] as const) {
        for (const id of v[tier].requires) {
          if (!condIds.has(id)) ctx.addIssue({ code: "custom", path: ["victory", side, tier, "requires"], message: `条件 "${id}" がありません` });
        }
      }
    }
  });

/** シナリオの決まり。旧い形の勝利条件も読める(読み込むときに勝利点制へ読み替える) */
export const ScenarioRulesSchema = z.preprocess(migrateVictory, ScenarioRulesObject);

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
    darkTurns: [],
    noSurrender: [],
    reinforcements: [],
    withdrawals: [],
    airborne: [],
    destroyedBridges: [],
  };
}

/** そのターンが夜間フェイズか */
export function isNightTurn(scenario: Pick<ScenarioRules, "night">, turn: number): boolean {
  const n = scenario.night;
  if (!n) return false;
  if (n.everyTurns === undefined) return n.turn === turn;
  return turn >= n.turn && (turn - n.turn) % n.everyTurns === 0;
}

/** そのターンが暗い時間か(昼のターンだが、見通しは夜と同じで航空は使えない) */
export function isDarkTurn(scenario: Pick<ScenarioRules, "darkTurns">, turn: number): boolean {
  return scenario.darkTurns.some((d) => turn >= d.from && turn <= d.to);
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

/** 目標の範囲内にいる、陣営ごとの部隊の数(戦力があり、潰走していないもの) */
export function objectiveCounts(o: { x: number; y: number; radiusM: number }, units: readonly Unit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const u of units) {
    if (u.strength <= 0 || u.routed || distance(u.pos, o) > o.radiusM) continue;
    counts.set(u.side, (counts.get(u.side) ?? 0) + 1);
  }
  return counts;
}

/** いちばん多い陣営(同数で並べば null:拮抗) */
function majority(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  let tie = false;
  for (const [side, n] of counts) {
    if (n > bestN) {
      best = side;
      bestN = n;
      tie = false;
    } else if (n === bestN) tie = true;
  }
  return tie ? null : best;
}

/** 拮抗している目標(範囲内に複数の陣営がいて、部隊の数が同じ)。拮抗している目標の範囲内では、どちらも補給を受けられない */
export function contestedObjectives(units: readonly Unit[], ctx: SimContext): ScenarioRules["objectives"] {
  return ctx.scenario.objectives.filter((o) => {
    const counts = objectiveCounts(o, units);
    return counts.size >= 2 && majority(counts) === null;
  });
}

/**
 * 目標の保持を更新する。範囲内の部隊(戦力あり・潰走していない)の数が多い陣営が押さえる。
 * 誰もいない・同数で拮抗しているときは、前の保持者のまま。変わった目標を返す。
 */
export function updateHolders(holders: ObjectiveHolders, units: readonly Unit[], ctx: SimContext): { id: string; from: string | null; to: string }[] {
  const changes: { id: string; from: string | null; to: string }[] = [];
  for (const o of ctx.scenario.objectives) {
    const side = majority(objectiveCounts(o, units));
    if (side === null) continue;
    const from = holders[o.id] ?? null;
    if (from !== side) {
      holders[o.id] = side;
      changes.push({ id: o.id, from, to: side });
    }
  }
  return changes;
}

export type VictoryLevel = "decisive" | "limited" | "none";

/** 目標の保持の記録(勝利点の判定用。保持は両陣営に公開なので、記録も公開してよい) */
export interface ObjectiveLog {
  /** 目標 → 陣営 → 保持してターンを終えた回数 */
  turnsHeld: Record<string, Record<string, number>>;
  /** 目標 → 陣営 → はじめて保持してターンを終えたターン(開始時の保持は0) */
  firstHeld: Record<string, Record<string, number>>;
}

export function initialObjectiveLog(holders: ObjectiveHolders): ObjectiveLog {
  const firstHeld: ObjectiveLog["firstHeld"] = {};
  for (const [id, h] of Object.entries(holders)) if (h) firstHeld[id] = { [h]: 0 };
  return { turnsHeld: {}, firstHeld };
}

/** ターンを終えたときの保持を記録に足す(新しい記録を返す) */
export function updateObjectiveLog(log: ObjectiveLog, holders: ObjectiveHolders, turn: number): ObjectiveLog {
  const next: ObjectiveLog = { turnsHeld: structuredClone(log.turnsHeld), firstHeld: structuredClone(log.firstHeld) };
  for (const [id, h] of Object.entries(holders)) {
    if (!h) continue;
    const t = (next.turnsHeld[id] ??= {});
    t[h] = (t[h] ?? 0) + 1;
    const f = (next.firstHeld[id] ??= {});
    f[h] ??= turn;
  }
  return next;
}

export interface ConditionResult {
  id: string;
  met: boolean;
  points: number;
}

export interface VictoryResult {
  /** 勝った陣営(引き分けなら null) */
  winner: string | null;
  /** 勝者の段階。引き分けなら "draw" */
  level: "decisive" | "limited" | "draw";
  /** heldWeight:保持している目標の重みの合計(表示用)。points:勝利点の合計。conditions:条件ごとの結果 */
  perSide: Record<string, { heldWeight: number; enemyLoss: number; ownLoss: number; points: number; conditions: ConditionResult[]; level: VictoryLevel }>;
}

/** 1つの条件を判定する */
export function evaluateCondition(
  c: VictoryCondition,
  side: string,
  holders: ObjectiveHolders,
  ctx: SimContext,
  enemyLoss: number,
  ownLoss: number,
  log?: ObjectiveLog,
): ConditionResult {
  const out = (met: boolean, points = met ? c.points : 0): ConditionResult => ({ id: c.id, met, points });
  switch (c.type) {
    case "hold": {
      const held = holders[c.objective] === side;
      if (!c.perTurn || !log) return out(held);
      const turns = log.turnsHeld[c.objective]?.[side] ?? 0;
      return out(held, (c.points * Math.min(turns, ctx.scenario.maxTurns)) / ctx.scenario.maxTurns);
    }
    case "holdUntil": {
      const first = log?.firstHeld[c.objective] ?? {};
      const lost = Object.entries(first).some(([s, t]) => s !== side && t <= c.turn);
      // 記録がなければ、終わったときに敵が持っていないかで見る
      const enemyHolds = !log && holders[c.objective] !== null && holders[c.objective] !== undefined && holders[c.objective] !== side;
      return out(!lost && !enemyHolds);
    }
    case "enemyLoss":
      return out(enemyLoss >= c.min);
    case "ownLoss":
      return out(ownLoss <= c.max);
    case "lossRatio":
      return out(enemyLoss > 0 && ownLoss <= enemyLoss * c.max);
  }
}

/** 段階に届いているか */
export function meetsTier(t: VictoryTier, points: number, results: readonly ConditionResult[]): boolean {
  return points >= t.minPoints - 1e-9 && t.requires.every((id) => results.find((r) => r.id === id)?.met === true);
}

/**
 * 勝敗を判定する。両陣営の到達段階を比べ、高い方の勝ち。同じなら引き分け。
 * @param enemyLoss 陣営ごとの、敵の損耗率(省略は0)
 * @param ownLoss 陣営ごとの、自軍の損耗率(省略は0)
 * @param log 目標の保持の記録(ターンごとにたまる点・期限までの保持に使う)
 */
export function evaluateVictory(
  holders: ObjectiveHolders,
  ctx: SimContext,
  enemyLoss: Record<string, number> = {},
  ownLoss: Record<string, number> = {},
  log?: ObjectiveLog,
): VictoryResult {
  const { scenario } = ctx;
  const perSide: VictoryResult["perSide"] = {};
  for (const [side, v] of Object.entries(scenario.victory)) {
    const heldWeight = scenario.objectives.filter((o) => holders[o.id] === side).reduce((s, o) => s + o.weight, 0);
    const loss = enemyLoss[side] ?? 0;
    const own = ownLoss[side] ?? 0;
    const conditions = v.conditions.map((c) => evaluateCondition(c, side, holders, ctx, loss, own, log));
    const points = conditions.reduce((s, r) => s + r.points, 0);
    const level = meetsTier(v.decisive, points, conditions) ? "decisive" : meetsTier(v.limited, points, conditions) ? "limited" : "none";
    perSide[side] = { heldWeight, enemyLoss: loss, ownLoss: own, points, conditions, level };
  }
  const rank = { decisive: 2, limited: 1, none: 0 } as const;
  const ranked = Object.entries(perSide).sort((a, b) => rank[b[1].level] - rank[a[1].level] || (a[0] < b[0] ? -1 : 1));
  const [first, second] = ranked;
  if (!first || first[1].level === "none" || (second && rank[second[1].level] === rank[first[1].level])) {
    return { winner: null, level: "draw", perSide };
  }
  return { winner: first[0], level: first[1].level as "decisive" | "limited", perSide };
}

/** 段階が満たすことを求める目標(requires に入っている hold・holdUntil の条件の目標) */
export function requiredObjectives(v: { conditions: readonly VictoryCondition[] }, tier: VictoryTier): string[] {
  return tier.requires.flatMap((id) => {
    const c = v.conditions.find((x) => x.id === id);
    return c && (c.type === "hold" || c.type === "holdUntil") ? [c.objective] : [];
  });
}

/** 目標を保持して得られる勝利点(hold・holdUntil の条件の合計) */
export function objectivePoints(v: { conditions: readonly VictoryCondition[] }, objectiveId: string): number {
  return v.conditions.reduce((s, c) => s + ((c.type === "hold" || c.type === "holdUntil") && c.objective === objectiveId ? c.points : 0), 0);
}
