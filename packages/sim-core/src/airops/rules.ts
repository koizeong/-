import { z } from "zod";

/**
 * 空の作り直し(docs/air-design.md)のデータの形。ルールパックの `airOps` と、シナリオの `airForces`。
 * 数値はすべてデータに置く(仮置きは TODO(要裏取り))
 */

/** 機種の役割(編成表の air.role)。strike・scout は海の盤上の航空隊のもの */
export const AIR_ROLES = ["fighter", "fighterBomber", "diveBomber", "attack", "bomber", "recon", "transport", "strike", "scout"] as const;
export type AirRole = (typeof AIR_ROLES)[number];

/** 任務 */
export const AIR_MISSIONS = ["patrol", "escort", "cover", "onCall", "support", "interdiction", "armedRecon", "recon", "airlift"] as const;
export type AirMissionKind = (typeof AIR_MISSIONS)[number];

/**
 * ルールパックの airOps。roles:役割ごとの、1日の出撃の上限・積み直しの分・編隊の機数・空域にいられる分・就ける任務。
 * 1機の1回の出撃にかかる時間 = 行き帰り(基地からの距離 ÷ 巡航の速さ × 2)+ 空域にいる時間 + 積み直し。
 * 1日の出撃の回数は、昼の長さをこれで割った数(上限 maxSortiesPerDay)
 */
export const AirOpsRulesSchema = z.object({
  notes: z.string().optional(),
  effectsNotes: z.string().optional(),
  flightNotes: z.string().optional(),
  roles: z.record(
    z.string(),
    z.object({
      maxSortiesPerDay: z.number().positive(),
      turnaroundMinutes: z.number().min(0),
      flightSize: z.number().int().min(1),
      stationMinutes: z.number().positive(),
      missions: z.array(z.enum(AIR_MISSIONS)).min(1),
    }),
  ),
  /**
   * 盤上の飛行(AIR3)。interceptRadiusM:戦闘機が敵の編隊に襲いかかる距離。airCombatScale:空戦の損害の物差し(相手の対空の力 × 分 × これ ÷ 1機の耐久 = 失う機数)。
   * strikeMinutes:攻撃にかける分(この間、目標のまわり strikeRadiusM に損害)。flakRadiusM・flakScale:攻撃中・低空の編隊を撃つ対空砲の届く距離と損害の物差し。
   * abortChance:攻撃の編隊が戦闘機に襲われたとき、爆弾を捨てて帰る確率(1分ごと)。sightM:地上の部隊・編隊から敵の編隊が見える距離。
   * visionM:空から地上の部隊を見つける距離(機種の air.visionM がなければ)
   */
  flight: z
    .object({
      interceptRadiusM: z.number().positive(),
      airCombatScale: z.number().min(0),
      strikeMinutes: z.number().positive(),
      strikeRadiusM: z.number().positive(),
      flakRadiusM: z.number().positive(),
      flakScale: z.number().min(0),
      abortChance: z.number().min(0).max(1),
      /** 1回の出撃で空戦できる分(弾と燃料の限り) */
      combatMinutes: z.number().positive().default(5),
      sightM: z.number().positive(),
      visionM: z.number().positive(),
    })
    .default({ interceptRadiusM: 8000, airCombatScale: 0.05, strikeMinutes: 5, strikeRadiusM: 600, flakRadiusM: 2500, flakScale: 0.01, abortChance: 0.15, combatMinutes: 5, sightM: 15000, visionM: 6000 }),
  /**
   * 効果(AIR4)。fratricide:攻撃の範囲にいる自軍の部隊が受ける損害の倍率(base)に、前線の印 marked・事前計画の近接支援 preplanned を掛ける。
   * misidentify:要請のない攻撃の編隊が、選んだ敵から withinM の内の自軍の部隊を誤って狙う確率(印のある部隊は markedMultiplier を掛ける)。
   * markVisibility:前線の印を出した部隊を、敵の編隊が見つける距離の倍率。photoDelayMinutes:偵察の写真が判読されて届くまでの分。
   * claimInflation:編隊が帰って報告する戦果の誇張の幅(実際の何倍か)。escortWindowMinutes:護衛が付く攻撃の編隊の、戦場に着く時刻の差の上限
   */
  effects: z
    .object({
      fratricide: z.object({ base: z.number().min(0), marked: z.number().min(0), preplanned: z.number().min(0) }),
      misidentify: z.object({ chance: z.number().min(0).max(1), markedMultiplier: z.number().min(0), withinM: z.number().min(0) }),
      markVisibility: z.number().positive(),
      photoDelayMinutes: z.number().min(0),
      claimInflation: z.object({ min: z.number().min(0), max: z.number().min(0) }),
      escortWindowMinutes: z.number().min(0),
    })
    .default({
      fratricide: { base: 0.5, marked: 0.3, preplanned: 0.6 },
      misidentify: { chance: 0.15, markedMultiplier: 0.3, withinM: 1500 },
      markVisibility: 1.5,
      photoDelayMinutes: 120,
      claimInflation: { min: 1.5, max: 3 },
      escortWindowMinutes: 15,
    }),
  /**
   * 天候の予報(AIR5)。leadTurns ターン先まで。先のターンほど外れやすい(1ターン先ごとに errorPerTurn、上限 maxError の確率で、天候の並びの隣にずれる)
   */
  forecast: z
    .object({
      leadTurns: z.number().int().min(0),
      errorPerTurn: z.number().min(0).max(1),
      maxError: z.number().min(0).max(1),
    })
    .default({ leadTurns: 9, errorPerTurn: 0.04, maxError: 0.35 }),
  /** 要請(AIR2):事前計画は、来てほしいターンの何ターン前までに出すか。即応の待機がいない空域への即応は断る */
  requests: z
    .object({
      preplanLeadTurns: z.number().int().min(0).default(2),
    })
    .default({}),
});
export type AirOpsRules = z.infer<typeof AirOpsRulesSchema>;

/**
 * シナリオの航空司令部(盤の外。陣営ごと。別の指揮系統なので、プレイヤーの陣営でも AI が割り当てる)。
 * doctrine.weights:任務ごとの重み(割り当ての配分)。acceptRequests:要請を受ける度合い(0〜1)。
 * bases:基地。distanceM は戦場(地図の真ん中)までの距離(m)。squadrons:飛行隊(機種の編成表・機数・練度・基地)。
 * requestsPerDay:地上の指揮官が出せる要請の1日の枠(指揮ポイントとは別。ユーザー判断)
 */
export const AirForceSchema = z.object({
  id: z.string().min(1),
  side: z.string().min(1),
  name: z.string().min(1),
  doctrine: z.object({
    weights: z.record(z.enum(AIR_MISSIONS), z.number().min(0)),
    acceptRequests: z.number().min(0).max(1).default(0.7),
  }),
  /**
   * 基地。bearingDeg は地図の真ん中から見た基地の方位(省略は陣営の部隊の重心の方)。
   * weather:基地の天候(戦場と別。AIR5)。書けば、シナリオの天候と同じ確率で別に移り変わり、予定 schedule があればそれに従う。省略は戦場と同じ
   */
  bases: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        distanceM: z.number().min(0),
        bearingDeg: z.number().optional(),
        weather: z
          .object({
            initial: z.string(),
            allowed: z.array(z.string()).optional(),
            schedule: z.array(z.object({ turn: z.number().int().min(2), weather: z.string(), allowed: z.array(z.string()).optional() })).optional(),
          })
          .optional(),
      }),
    )
    .min(1),
  squadrons: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        toe: z.string().min(1),
        base: z.string().min(1),
        aircraft: z.number().int().min(1),
        training: z.enum(["green", "regular", "veteran", "elite"]).optional(),
      }),
    )
    .min(1),
  requestsPerDay: z.number().int().min(0).default(4),
  /**
   * この戦場に回ってくる割合(戦闘ごとの運。ユーザー判断)。航空軍団は戦線全体を受け持つので、飛行隊の機数のうちこの戦場に使えるのは一部。
   * 試合の始めに min〜max から引く(試合の種で決まり、主の乱数列は使わない)。省略は全部。キャンペーンの戦闘では、作戦の層で決めた値を min = max で渡す
   */
  allotment: z.object({ min: z.number().min(0).max(1), max: z.number().min(0).max(1) }).refine((a) => a.min <= a.max, "allotment.min は max 以下").optional(),
  /** 出典・仮置きの覚え書き */
  notes: z.string().optional(),
});
export type AirForce = z.infer<typeof AirForceSchema>;
