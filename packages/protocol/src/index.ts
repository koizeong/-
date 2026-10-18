import { z } from "zod";
import type {
  HqCommand,
  Objective,
  RejectedHqCommand,
  RejectedOrder,
  RoadNetworkDef,
  SideReplay,
  SideView,
  TerrainMapDef,
  UnitOrder,
  VictoryResult,
} from "@brigade/sim-core";

/**
 * サーバーとクライアントの間のメッセージ(WebSocket、JSON)。
 * サーバーは権威(設計ルール2)。クライアントに送るのは、その陣営に見える情報と、両陣営に公開の静的な情報だけ(設計ルール3)。
 */

/** 試合の静的な情報(両陣営に公開してよいものだけ) */
export interface ScenarioInfo {
  id: string;
  name: string;
  description?: string;
  /** このクライアントの陣営 */
  mySide: string;
  sides: { id: string; name: string }[];
  map: TerrainMapDef;
  roads: RoadNetworkDef;
  objectives: Objective[];
  /** 勝利条件(両陣営に公開)。陣営ID → 決定的勝利・限定的勝利の条件 */
  victory: Record<string, Record<"decisive" | "limited", { required: string[]; minWeight: number; minEnemyLoss?: number | undefined; maxOwnLoss?: number | undefined }>>;
  /** 名前の表(表示用) */
  terrainNames: Record<string, string>;
  /** 姿勢。lastStand は死守の重みに数える姿勢、immobile は移動できない姿勢(表示用) */
  /** effectTurns:効果の続くターン数(省略は無期限。過ぎると息切れ) */
  stances: { id: string; name: string; lastStand: boolean; immobile: boolean; effectTurns?: number }[];
  defaultStance: string;
  branchNames: Record<string, string>;
  toeNames: Record<string, string>;
  fogDensity: string;
  /** 1ターンに使える指揮ポイント(null は無制限) */
  commandPoints: number | null;
  maxTurns: number;
  night: { turn: number; hours: number; everyTurns?: number | undefined } | null;
  /** 1日目の日付(YYYY-MM-DD。表示用。なければ日付を出さない) */
  startDate?: string;
  turnSeconds: number;
  startHour: number;
  weatherNames: Record<string, string>;
  /** 自陣営の航空戦力の有無 */
  air: { strike: boolean; airlift: boolean; fighters: boolean };
  /** 制空権を持つ空域の分け方(地図を cols × rows に等分。view.airControl はこの順:南の行から、西から東へ) */
  airSectors: { cols: number; rows: number };
  /** 自陣営の艦砲射撃(海からこの距離以内に届く)。使えなければ null */
  naval: { rangeFromSeaM: number } | null;
  /** 砲撃・空襲・空輸の範囲(表示用) */
  ranges: { indirectImpactRadiusM: number; strikeRadiusM: number; dropRadiusM: number; zoneRadiusM: number; closeSupportRadiusM: number; airborneScatterM: number; airReconRadiusM: number; patrolRangeM: number; patrolHalfAngleDeg: number; interdictionRadiusM: number };
  /** 正面幅(表示用):編成表ごとの幅(m)と、損耗で縮むしきい値・倍率 */
  frontage: { byToe: Record<string, number>; reducedBelowStrength: number; reducedMultiplier: number };
  /** 斥候の1日の回数(陣営ごと) */
  patrolsPerDay: number;
  /** 自陣営の砲兵ユニットの間接射撃の射程(m)。ユニットID → 射程 */
  artilleryRanges: Record<string, number>;
  /** 自陣営のユニットの直接射撃の射程(m)。ユニットID → 射程(表示用) */
  directRanges: Record<string, number>;
  /** 自陣営の空挺部隊(マップの外で待機。司令部コマンドで降ろす) */
  airborne: { id: string; toeName: string; availableFromTurn: number }[];
  /** この士気未満は動揺(表示用) */
  shakenBelow: number;
  /** 死守の重みの効き方(表示用) */
  lastStand: { gaugePerOrder: number; moraleRecoveryPenaltyPerPoint: number; moraleRecoveryFloor: number; decayPerTurn: number };
}

export type ClientMessage =
  | { type: "join"; scenarioId?: string; side?: string; seed?: number }
  | { type: "submitTurn"; turn: number; orders: UnitOrder[]; hqCommands: HqCommand[] };

export interface TurnOutcome {
  /** 解決したターン */
  turn: number;
  replay: SideReplay;
  rejectedOrders: RejectedOrder[];
  rejectedHqCommands: RejectedHqCommand[];
  /** 規定ターンを終えたら勝敗 */
  result: VictoryResult | null;
}

export type ServerMessage =
  | { type: "welcome"; info: ScenarioInfo; view: SideView }
  | { type: "turnResolved"; outcome: TurnOutcome; view: SideView }
  | { type: "error"; message: string };

// ---- クライアントから届くメッセージの検証(サーバー側で使う。クライアントは信用しない) ----

const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });

const OrderBodySchema = z.object({
  waypoints: z.array(Vec2Schema).max(20).optional(),
  pursue: z.string().max(64).nullable().optional(),
  facingOnArrival: z.number().finite().nullable().optional(),
  moveMode: z.enum(["march", "combat"]).optional(),
  stance: z.string().optional(),
  deployAfterStop: z.boolean().optional(),
});

const ConditionSchema = z.union([
  z.object({ type: z.literal("enemyDetected"), withinM: z.number().positive() }),
  z.object({ type: z.literal("strengthBelow"), threshold: z.number().gt(0).max(1) }),
]);

export const UnitOrderSchema = OrderBodySchema.extend({
  unitId: z.string(),
  conditional: z.object({ when: ConditionSchema, then: OrderBodySchema }).nullable().optional(),
});

export const HqCommandSchema = z.union([
  z.object({ side: z.string(), type: z.literal("fireMission"), unitId: z.string(), target: Vec2Schema }),
  z.object({ side: z.string(), type: z.literal("airStrike"), target: Vec2Schema, escort: z.number().int().min(0).max(20).optional() }),
  z.object({ side: z.string(), type: z.literal("interdiction"), target: Vec2Schema, escort: z.number().int().min(0).max(20).optional() }),
  z.object({ side: z.string(), type: z.literal("airDrop"), target: Vec2Schema }),
  z.object({ side: z.string(), type: z.literal("airSuperiority"), target: Vec2Schema }),
  z.object({ side: z.string(), type: z.literal("closeAirSupport"), unitId: z.string(), escort: z.number().int().min(0).max(20).optional() }),
  z.object({ side: z.string(), type: z.literal("airborneDrop"), unitId: z.string(), target: Vec2Schema }),
  z.object({ side: z.string(), type: z.literal("navalGunfire"), target: Vec2Schema }),
  z.object({ side: z.string(), type: z.literal("airRecon"), target: Vec2Schema }),
  z.object({ side: z.string(), type: z.literal("patrol"), unitId: z.string(), target: Vec2Schema }),
]);

export const ClientMessageSchema = z.union([
  z.object({ type: z.literal("join"), scenarioId: z.string().optional(), side: z.string().optional(), seed: z.number().int().optional() }),
  z.object({
    type: z.literal("submitTurn"),
    turn: z.number().int(),
    orders: z.array(UnitOrderSchema).max(200),
    hqCommands: z.array(HqCommandSchema).max(50),
  }),
]);

/** 受け取った文字列を検証する。壊れていれば理由を返す */
export function parseClientMessage(text: string): { ok: true; value: ClientMessage } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSONとして読めません" };
  }
  const r = ClientMessageSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, value: r.data as ClientMessage };
}
