import { z } from "zod";
import { CustomBundleSchema } from "@brigade/sim-core";
import type {
  CustomBundle,
  DevelopmentRules,
  ToePack,
  WeaponPack,
  HqCommand,
  Objective,
  RejectedHqCommand,
  RejectedOrder,
  RoadNetworkDef,
  RoutePreview,
  SideReplay,
  SideView,
  SideVictory,
  TerrainMapDef,
  UnitModifiers,
  UnitOrder,
  VictoryResult,
  ZoneWarning,
} from "@brigade/sim-core";

/**
 * サーバーとクライアントの間のメッセージ(WebSocket、JSON)。
 * サーバーは権威(設計ルール2)。クライアントに送るのは、その陣営に見える情報と、両陣営に公開の静的な情報だけ(設計ルール3)。
 */

/** 試合の静的な情報(両陣営に公開してよいものだけ) */
/** 配属された中隊の内訳(表示用) */
export interface AttachmentInfo {
  /** 中隊の名前(元の編成表の要素の名前) */
  name: string;
  count: number;
  /** 元の部隊の ID・兵科・編成表の名前 */
  from: string;
  branch: string;
  fromToeName: string;
  /** 装甲の中隊か(護衛が効く) */
  armored: boolean;
  /** 部隊の耐久のうち、この中隊が占める割合 */
  share: number;
}

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
  /** 陣営ごとの勝利条件(勝利点制。条件と、段階ごとの勝利点の下限・満たすべき条件) */
  victory: Record<string, SideVictory>;
  /** 名前の表(表示用) */
  terrainNames: Record<string, string>;
  /** 姿勢。lastStand は死守の重みに数える姿勢、immobile は移動できない姿勢(表示用) */
  /** effectTurns:効果の続くターン数(省略は無期限。過ぎると息切れ) */
  /** branches:取れる兵科(省略はすべて)。shape:地図に描く形。frontageMultiplier:正面幅の倍率 */
  stances: { id: string; name: string; lastStand: boolean; immobile: boolean; effectTurns?: number; branches?: string[]; shape: "line" | "wedge" | "ring"; frontageMultiplier: number }[];
  defaultStance: string;
  branchNames: Record<string, string>;
  toeNames: Record<string, string>;
  /**
   * 自陣営の部隊の編成表に配属された中隊(編成表ID → 配属の一覧)。歩兵直協の戦車・突撃砲など。
   * 中隊は部隊の一部として撃ち、撃たれる(装甲の部分は近くの敵から歩兵が護衛する)。地図の印とユニットの欄の内訳に使う
   */
  attachments: Record<string, AttachmentInfo[]>;
  /** 自陣営の部隊の表示名(部隊ID → 名前。シナリオに書いたものだけ。ないものは ID を出す) */
  unitNames: Record<string, string>;
  /** 地図に描く兵科記号(兵科ごとの印と、編成表ごとの規模・重ねる印) */
  symbols: UnitSymbols;
  /** 暗い時間のターン(昼のターンだが暗い。夜明け前・夜襲など。表示用) */
  darkTurns: { from: number; to: number }[];
  fogDensity: string;
  /** 情報の霧の濃さの名前(表示用) */
  fogDensityName: string;
  /** 1ターンに使える指揮ポイント(null は無制限) */
  commandPoints: number | null;
  maxTurns: number;
  night: { turn: number; hours: number; everyTurns?: number | undefined } | null;
  /** 1日目の日付(YYYY-MM-DD。表示用。なければ日付を出さない) */
  startDate?: string;
  /** 史実の結末(結果の画面で比べる)。史実のないシナリオ(演習)にはない */
  historicalOutcome?: { winner: string | null; level: "decisive" | "limited" | "draw"; summary: string };
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
  /** 対砲兵戦:前のターンに撃たれた砲兵は砲撃を要請できない(ルールパックの combat.counterBattery) */
  fireBlockedUnderFire: boolean;
  /** 自陣営のユニットの直接射撃の射程(m)。ユニットID → 射程(表示用) */
  directRanges: Record<string, number>;
  /** 自陣営の空挺部隊(マップの外で待機。司令部コマンドで降ろす) */
  airborne: { id: string; toeName: string; availableFromTurn: number }[];
  /** 地図の橋(水の地形を横切る道路の区間。両陣営に公開)と、爆破・修理の条件(表示用) */
  bridges: { id: string; x: number; y: number }[];
  bridgeRules: { workRangeM: number; repairHours: number; repairClearM: number; demolitionSuccess: number };
  /** この士気未満は動揺(表示用) */
  shakenBelow: number;
  /** 死守の重みの効き方(表示用) */
  lastStand: { gaugePerOrder: number; moraleRecoveryPenaltyPerPoint: number; moraleRecoveryFloor: number; decayPerTurn: number };
}

/**
 * 試合の記録(セーブデータ)。sim-core は決定論なので、シナリオ・陣営・シードと毎ターンの人間の命令があれば、
 * 同じ試合を再生して同じ状態に戻せる。AIの命令は記録しない(同じ入力からは同じ命令になる)
 */
export interface GameRecord {
  version: 1;
  scenarioId: string;
  side: string;
  seed: number;
  /** シナリオと使うパックの中身のハッシュ。違えば、データが変わったので結果が保存したときと違うことがある */
  scenarioHash: string;
  /** 解決したターンごとの人間の命令と司令部コマンド(1ターン目から順に) */
  turns: { orders: UnitOrder[]; hqCommands: HqCommand[] }[];
  /** 装備編成(持ち込んだ武器・テンプレートと部隊の差し替え)。記録を再生するときも同じ差し替えで始める */
  custom?: CustomStart;
  /** AIの陣営をおまかせ編成にした方針(ルールパックの development.autoStyles のキー) */
  aiAuto?: string;
  /** 編成の選択(シナリオの presets のキー。例 "historical" = 史実の編成) */
  preset?: string;
}

/**
 * オンライン対戦の記録(両陣営の命令)。命令の中身は相手に見せないので、試合が終わってからだけ渡す。
 * turns は陣営ごとの人間の命令(AI が受け持ったターンの陣営は入らない)
 */
export interface OnlineRecord {
  version: 1;
  kind: "online";
  scenarioId: string;
  seed: number;
  scenarioHash: string;
  turns: Record<string, { orders: UnitOrder[]; hqCommands: HqCommand[] }>[];
  custom: Record<string, CustomStart>;
  preset?: string;
}

/** オンライン対戦の部屋の様子(両者に送る。命令の中身は含めない) */
export interface RoomStatus {
  code: string;
  scenarioId: string;
  started: boolean;
  over: boolean;
  turn: number;
  /** 1ターンの制限時間(秒。0は制限なし)と、このターンの残り(秒。制限がなければ null) */
  timeLimitSec: number;
  remainingSec: number | null;
  seats: { side: string; taken: boolean; connected: boolean; ai: boolean; submitted: boolean }[];
}

/** 装備編成をして始める:持ち込み(開発した武器・連隊テンプレート)と、部隊ID → テンプレートのID */
export interface CustomStart {
  bundle: CustomBundle;
  substitutions: Record<string, string>;
  /** 配属(戦いの前に、部隊 from の要素 element の中隊を1つ、部隊 to に付ける) */
  attachments?: { from: string; element: number; to: string }[];
}

/** 開始画面に出すシナリオの概要(両陣営に公開の情報だけ) */
export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  sides: { id: string; name: string; units: number }[];
  maxTurns: number;
  /** 何日にわたるか(夜のターンの数 + 1) */
  days: number;
  startDate?: string;
  objectives: { id: string; name: string }[];
  victory: ScenarioInfo["victory"];
  hash: string;
  /** 装備編成で部隊を差し替えられる陣営(なければ空) */
  customizableSides: string[];
  /** 編成の選択(例 史実の編成)。なければ空 */
  presets: { id: string; name: string; description?: string }[];
}

/**
 * シナリオ選択・部隊編成の画面に渡す、1つのシナリオの詳しい情報(GET /api/scenario?id=<ID>&side=<陣営>&preset=<編成の選択>)。
 * 地図・道路・目標は両陣営に公開。部隊は選んだ陣営のものだけ(敵の配置は霧の内側なので含めない)
 */
export interface ScenarioDetail {
  id: string;
  name: string;
  side: string;
  map: TerrainMapDef;
  roads: RoadNetworkDef;
  objectives: Objective[];
  terrainNames: Record<string, string>;
  /**
   * 選んだ陣営の部隊。初めからいる部隊と増援(reinforcementTurn に到着するターン)と、
   * マップの外で待機する空挺部隊(airborneFromTurn から降ろせる。位置は降下地点しだいなので x・y は持たない)
   */
  units: { id: string; name?: string; toe: string; toeName: string; branch: string; branchName: string; x?: number; y?: number; facing?: number; reinforcementTurn?: number; airborneFromTurn?: number }[];
  /** 選んだ陣営の上級部隊(階層の木) */
  formations: Record<string, { name: string; parent?: string | undefined; units: string[] }>;
  symbols: UnitSymbols;
}

/** 兵科記号の材料。branches:兵科 → 基本の印、toes:編成表 → 規模と重ねる印(データの symbol) */
export interface UnitSymbols {
  branches: Record<string, string>;
  toes: Record<string, { echelon?: string; modifiers: string[] }>;
}

/**
 * 装備と編制の図鑑(GET /api/catalog)。読み込んだすべての武器パックの装備品と、すべての編成表(人員・装備品で書いたものは
 * 要素ごとに personnel・equipment・group を持つ)。装備品の札・線図の編制表に使う。両陣営に公開の情報(シナリオに関わらない)
 */
export interface CatalogResponse {
  /** 国の表示名(装備品の nation のキー) */
  nations: Record<string, string>;
  equipment: Record<string, CatalogEquipment>;
  weapons: Record<string, CatalogWeapon>;
  toes: Record<string, CatalogToe>;
  branchNames: Record<string, string>;
  symbols: UnitSymbols;
}

export interface CatalogEquipment {
  name: string;
  short?: string;
  nation?: string;
  years?: { from: number; to?: number | undefined };
  category: string;
  weapons: { weapon: string; count: number }[];
  crew: number;
  hitPoints: number;
  armored: boolean;
  armorMm?: { front: number; side: number; rear?: number | undefined; turretFront?: number | undefined; turretSide?: number | undefined };
  specs: Record<string, string | number>;
  description?: string;
  /** この装備品を使っている編成表の ID */
  usedBy: string[];
}

export interface CatalogWeapon {
  name: string;
  bands: { maxRangeM: number; power: number; penetrationMm?: number | undefined }[];
  indirect: boolean;
  arcing: boolean;
  effectiveness: { soft: number; armored: number };
}

export interface CatalogToe {
  name: string;
  branch: string;
  /** 国(ID の頭 de- などから。汎用は generic) */
  nation: string;
  /** 人員・装備品で書いた実数の編成表か */
  real: boolean;
  hitPoints: number;
  elements: {
    name: string;
    count: number;
    hitPoints: number;
    weapons: { weapon: string; count: number }[];
    armored: boolean;
    personnel?: number;
    equipment?: { item: string; count: number }[];
    group?: string;
    groupCount?: number;
    attachedFrom?: { unit: string; branch: string; toe: string };
  }[];
}

/**
 * 装備編成の画面に渡す情報(GET /api/development?scenario=<ID>)。シナリオのルールパックの開発の決まりと、
 * シナリオで使う武器・編成表(テンプレートの元・載せる武器)、陣営ごとの差し替えられる部隊
 */
export interface DevelopmentInfo {
  scenarioId: string;
  scenarioName: string;
  development: DevelopmentRules;
  weapons: WeaponPack;
  toes: ToePack;
  branchNames: Record<string, string>;
  sides: Record<string, { name: string; budgetMultiplier: number; units: { id: string; toe: string; reinforcementTurn?: number }[] }>;
  /** 上級部隊(階層の木) */
  formations: Record<string, { name: string; side: string; parent?: string | undefined; units: string[] }>;
}

export type ClientMessage =
  | { type: "join"; scenarioId?: string; side?: string; seed?: number; resume?: GameRecord; custom?: CustomStart; aiAuto?: string; preset?: string }
  /** オンライン対戦:部屋を作る(陣営を選ぶ)・合言葉で入る(空いている陣営に座る)・鍵で戻る */
  | { type: "createRoom"; scenarioId: string; side: string; timeLimitSec: number; seed?: number; custom?: CustomStart; preset?: string }
  | { type: "joinRoom"; code: string; custom?: CustomStart }
  | { type: "rejoinRoom"; code: string; token: string }
  | { type: "submitTurn"; turn: number; orders: UnitOrder[]; hqCommands: HqCommand[] }
  /** 移動の命令の下書きから経路を見積もる(何度送ってもよい。試合の状態は変えない) */
  | { type: "preview"; requestId: number; unitId: string; waypoints: { x: number; y: number }[]; moveMode?: "march" | "combat" };

/** 経路の見積もり:sim-core の見積もりに、知っている敵の阻止圏に入る所を加えたもの */
export interface MovePreview extends RoutePreview {
  zones: ZoneWarning[];
}

export interface TurnOutcome {
  /** 解決したターン */
  turn: number;
  replay: SideReplay;
  rejectedOrders: RejectedOrder[];
  rejectedHqCommands: RejectedHqCommand[];
  /** 規定ターンを終えたら勝敗 */
  result: VictoryResult | null;
}

/** 自軍ユニットにいま効いている補正(ユニットID → 内訳。画面で見せる) */
export type ModifiersByUnit = Record<string, UnitModifiers>;

export type ServerMessage =
  /**
   * 試合の始まり(続きからのときは、記録を再生した後の状態)。resumed:再生したターンの数と、データが保存したときと同じか。
   * last:続きからのとき、最後に解決したターンの結果(戦況の欄に出す)
   */
  | { type: "welcome"; info: ScenarioInfo; view: SideView; modifiers: ModifiersByUnit; record?: GameRecord; resumed?: { turns: number; sameData: boolean }; last?: TurnOutcome }
  /** record:人間1人 対 AI の試合の記録(オンライン対戦では送らない。終わってから roomRecord で両陣営の分を送る) */
  | { type: "turnResolved"; outcome: TurnOutcome; view: SideView; modifiers: ModifiersByUnit; record?: GameRecord }
  /** オンライン対戦:部屋に座った(戻るための鍵と陣営)。部屋の様子。終わった試合の記録 */
  | { type: "roomJoined"; code: string; token: string; side: string; scenarioName: string }
  | { type: "roomStatus"; status: RoomStatus }
  | { type: "roomRecord"; record: OnlineRecord }
  | { type: "preview"; requestId: number; unitId: string; preview: MovePreview | null; error?: string }
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
  z.object({ side: z.string(), type: z.literal("demolishBridge"), bridgeId: z.string().max(200) }),
  z.object({ side: z.string(), type: z.literal("repairBridge"), bridgeId: z.string().max(200) }),
]);

/** 持ち込みの大きさの上限(武器・テンプレートの数) */
const MAX_CUSTOM_ENTRIES = 50;
export const CustomStartSchema = z.object({
  bundle: CustomBundleSchema.refine((b) => Object.keys(b.designs).length <= MAX_CUSTOM_ENTRIES && Object.keys(b.templates).length <= MAX_CUSTOM_ENTRIES, {
    message: `武器・テンプレートはそれぞれ ${MAX_CUSTOM_ENTRIES} 個までです`,
  }),
  substitutions: z.record(z.string().max(200), z.string().max(200)),
  attachments: z.array(z.object({ from: z.string().max(200), element: z.number().int().min(0).max(100), to: z.string().max(200) })).max(200).optional(),
});

export const GameRecordSchema = z.object({
  version: z.literal(1),
  scenarioId: z.string().max(200),
  side: z.string().max(64),
  seed: z.number().int(),
  scenarioHash: z.string().max(200),
  turns: z.array(z.object({ orders: z.array(UnitOrderSchema).max(200), hqCommands: z.array(HqCommandSchema).max(50) })).max(2000),
  custom: CustomStartSchema.optional(),
  aiAuto: z.string().max(64).optional(),
  preset: z.string().max(64).optional(),
});

export const ClientMessageSchema = z.union([
  z.object({
    type: z.literal("join"),
    scenarioId: z.string().optional(),
    side: z.string().optional(),
    seed: z.number().int().optional(),
    resume: GameRecordSchema.optional(),
    custom: CustomStartSchema.optional(),
    aiAuto: z.string().max(64).optional(),
    preset: z.string().max(64).optional(),
  }),
  z.object({
    type: z.literal("createRoom"),
    scenarioId: z.string().max(200),
    side: z.string().max(64),
    timeLimitSec: z.number().int().min(0).max(3600),
    seed: z.number().int().optional(),
    custom: CustomStartSchema.optional(),
    preset: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal("joinRoom"), code: z.string().max(16), custom: CustomStartSchema.optional() }),
  z.object({ type: z.literal("rejoinRoom"), code: z.string().max(16), token: z.string().max(100) }),
  z.object({
    type: z.literal("submitTurn"),
    turn: z.number().int(),
    orders: z.array(UnitOrderSchema).max(200),
    hqCommands: z.array(HqCommandSchema).max(50),
  }),
  z.object({
    type: z.literal("preview"),
    requestId: z.number().int(),
    unitId: z.string().max(64),
    waypoints: z.array(Vec2Schema).min(1).max(20),
    moveMode: z.enum(["march", "combat"]).optional(),
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

// ---- 手引き(チュートリアル)。data/tutorials/*.json。サーバーが検証して GET /api/tutorials で配る ----

/** 手引きの1段が、次へ進む条件。省略すると「次へ」を押して進む */
export const TutorialUntilSchema = z.union([
  /** そのユニットを選んだ */
  z.object({ type: z.literal("select"), unitId: z.string() }),
  /** そのユニットへの命令の下書きに、その項目が入った(value を書けば、その値になった) */
  z.object({
    type: z.literal("order"),
    unitId: z.string(),
    field: z.enum(["waypoints", "moveMode", "stance", "conditional", "facingOnArrival", "deployAfterStop"]),
    value: z.union([z.string(), z.boolean()]).optional(),
  }),
  /** その種類の司令部コマンドを下書きに入れた */
  z.object({ type: z.literal("hq"), command: z.string() }),
  /** そのターンの作戦フェイズになった(ターン終了を押して、再生が終わった) */
  z.object({ type: z.literal("turn"), atLeast: z.number().int().min(2) }),
]);

export const TutorialStepSchema = z.object({
  title: z.string().min(1).max(60),
  text: z.string().min(1).max(1000),
  /** 光らせる画面の部品:data-testid の値 */
  highlight: z.string().max(80).optional(),
  /** 地図の上に印をつける地点(m)と、その名前 */
  mark: z.object({ x: z.number().finite(), y: z.number().finite(), label: z.string().max(30).optional() }).optional(),
  until: TutorialUntilSchema.optional(),
});

export const TutorialSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scenarioId: z.string(),
  side: z.string(),
  seed: z.number().int(),
  steps: z.array(TutorialStepSchema).min(1).max(60),
});

export type TutorialUntil = z.infer<typeof TutorialUntilSchema>;
export type TutorialStep = z.infer<typeof TutorialStepSchema>;
export type Tutorial = z.infer<typeof TutorialSchema>;

// ---- 編成エディターの HTTP の口(開発用。サーバーの /api/packs・/api/save) ----

/** data/ のパック1ファイル(ファイルに書かれたままの JSON) */
export interface PackFile {
  file: string;
  pack: unknown;
}

/** GET /api/packs の応答 */
export interface PacksResponse {
  rules: PackFile[];
  branches: PackFile[];
  weapons: PackFile[];
  toe: PackFile[];
}

/** エディターで書き換えられるパックの種類 */
export type EditablePackKind = "toe" | "weapons";

/** POST /api/save の本文 */
export interface SaveRequest {
  kind: EditablePackKind;
  file: string;
  pack: unknown;
}

export type SaveResponse = { ok: true } | { ok: false; errors: string[] };
