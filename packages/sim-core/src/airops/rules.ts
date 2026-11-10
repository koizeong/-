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
  bases: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), distanceM: z.number().min(0) })).min(1),
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
  /** 出典・仮置きの覚え書き */
  notes: z.string().optional(),
});
export type AirForce = z.infer<typeof AirForceSchema>;
