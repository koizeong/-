import { trainingOf } from "./training.js";
import { enemyLossRatio, forceNow, ownLossRatio } from "./attrition.js";
import { toeHitPoints } from "./toe.js";
import { checkZones, holdingZones, type HoldingZone } from "./breakthrough.js";
import { isEncircled } from "./encirclement.js";
import { applyFire, computeFire, targetsInRange, type Factor, type FireResult, type GaugeChange } from "./combat.js";
import type { Aspect } from "./facing.js";
import { forgetStaleGhosts } from "./fog-density.js";
import { fatigueSpeedMultiplier, updateFatigue } from "./fatigue.js";
import type { SimContext } from "./context.js";
import type { Depot } from "./depot.js";
import { detectionLevel, isInfiltrating, type DetectionLevel } from "./detection.js";
import { distanceToFront, frontageOf, frontOf, nearestOnFront, unitDistance } from "./frontage.js";
import { angleBetween, bearing, distance, normalizeBearing, type Vec2 } from "./geometry.js";
import { cloneIntel, recordSighting, sidesOf, updateIntel, type IntelState } from "./intel.js";
import { applyDeferredOrder, applyOrderBody, applyOrders, type Condition, type RejectedOrder, type UnitOrder } from "./orders.js";
import { airEffect, applyAirDrop, computeAirStrike, computeCloseSupport, dogfightLosses, flakPoints, flakResult, interceptChance, strikeWindow, updateAirControl, type AirPresence } from "./air.js";
import {
  computeIndirectFire,
  scheduleHqCommands,
  type AirMission,
  type AirSorties,
  type AirGroups,
  type AirPools,
  type AirControl,
  type CloseAirSupport,
  type Interdiction,
  airControlAt,
  airSectorOf,
  dailyAirSorties,
  initialAirGroups,
  missionCost,
  replenishAirGroups,
  computeNavalGunfire,
  initialAirborneReady,
  initialNavalLeft,
  type NavalMission,
  baseAirControl,
  type AirborneReady,
  initialAirSorties,
  type FireMission,
  type HqCommand,
  type RejectedHqCommand,
} from "./hq.js";
import { updateMorale } from "./morale.js";
import { planRoute, terrainSpeed, type RoutePoint } from "./pathfinding.js";
import { moveSpeedMps } from "./route-preview.js";
import { findBridges, initialBridges, nearBridge, routeCrossesClosed, withBridges, type BridgeStates } from "./bridges.js";
import { captureDepots, currentSupplyRoutes, distributeSupply, type SupplyRoute } from "./resupply.js";
import { advanceGround, advanceWeather, airAllowed, groundSpeedMultiplier, initialGround, initialWeather, weatherVisibility, type GroundState, type WeatherState } from "./weather.js";
import { drawSecrets, evaluateVictory, initialHolders, initialObjectiveLog, updateObjectiveLog, type ObjectiveLog, isDarkTurn, isNightTurn, updateHolders, type ObjectiveHolders, type VictoryResult } from "./scenario.js";
import { Rng, type RngState } from "./rng.js";
import { effectiveStance, isStanceSpent, stanceOf } from "./stance.js";
import { consumeAmmo, consumeFuel, fuelRangeM, isOutOfStock, mobilityOf } from "./supply.js";
import { cloneUnit, createUnit, type Unit } from "./unit.js";

export interface GameState {
  turn: number;
  /** シナリオ開始からの経過時間(秒) */
  time: number;
  units: Unit[];
  /** 陣営ごとの敵情報 */
  intel: IntelState;
  /** 司令部・集積所 */
  depots: Depot[];
  /** 予約済みの砲撃(着弾するターンを持つ) */
  fireMissions: FireMission[];
  /** 目標地点の保持陣営(両陣営に公開) */
  objectives: ObjectiveHolders;
  /** 目標の保持の記録(勝利点の判定用。省略は開始時の保持から始める) */
  objectiveLog?: ObjectiveLog;
  /** 陣営ごとの、引いた秘密の副目標の ID(霧のフィルタでは自陣営の分だけ見せる) */
  secrets?: Record<string, string[]>;
  /** これから解決するターンの天候(両陣営に公開) */
  weather: WeatherState;
  /** 予約済みの空襲・空輸 */
  airMissions: AirMission[];
  /** 陣営ごとの、その日の残りの出撃枠 */
  airSortiesLeft: AirSorties;
  /** 陣営ごとの、残っている編隊の数(失った分は持ち越す) */
  airGroups: AirGroups;
  /** 空域ごとの制空権の割合(航空戦力を持つ陣営どうしで合計1。両陣営に公開) */
  airControl: AirControl;
  /** 補給線への攻撃の効果(道路の輸送力の低下)が続いているもの */
  interdictions: Interdiction[];
  /** 陣営ごとの、待機中の空挺部隊(まだ降りていない・予約していない) */
  airborneReady: AirborneReady;
  /** 予約済みの艦砲射撃と、陣営ごとのその日の残りの回数 */
  navalMissions: NavalMission[];
  navalLeft: Record<string, number>;
  /** ユニットID → 直前の補給で使った補給路(つながっていたユニットだけ) */
  supplyRoutes: Record<string, SupplyRoute>;
  /** 陣営ごとの、その日の残りの斥候の回数(載っていない陣営は満タン) */
  patrolsLeft: Record<string, number>;
  /** これから解決するターンが昼か夜か(両陣営に公開) */
  phase: "day" | "night";
  /** 陣営ごとの、これまでに加わった総戦力(開始時 + 到着した増援。編成表の耐久 × 戦力)。損耗率の分母 */
  forceTotals: Record<string, number>;
  /** 陣営ごとの、自陣営の損耗率(ターン終了時の値。霧のフィルタでは自陣営の分だけ見せる) */
  ownLoss: Record<string, number>;
  /** 陣営ごとの「死守の重み」。死守を命じるとたまり、ターンごとに抜ける。重いほど陣営全体の士気の回復が遅い */
  lastStand: Record<string, number>;
  /** 橋の状態(壊れたかは両陣営に公開。修理の進み具合は修理する陣営だけ)。載っていない橋は無事 */
  bridges: BridgeStates;
  /** 地面の状態(ぬかるみ・積雪。両陣営に公開)。これから解決するターンの移動に効く */
  ground: GroundState;
  rngState: RngState;
}

export function newGameState(
  units: readonly Unit[],
  seed: number,
  depots: readonly Depot[] = [],
  objectives: ObjectiveHolders = {},
  weather: WeatherState = { current: "clear", since: 0 },
): GameState {
  return {
    objectives: { ...objectives },
    objectiveLog: initialObjectiveLog(objectives),
    weather: { ...weather },
    airMissions: [],
    airSortiesLeft: {},
    airGroups: {},
    airControl: {},
    interdictions: [],
    airborneReady: {},
    navalMissions: [],
    navalLeft: {},
    patrolsLeft: {},
    supplyRoutes: {},
    phase: "day",
    lastStand: {},
    bridges: {},
    ground: { mud: 0, snow: 0 },
    forceTotals: {},
    ownLoss: {},
    turn: 1,
    time: 0,
    units: units.map(cloneUnit),
    intel: {},
    depots: depots.map((d) => ({ ...d })),
    fireMissions: [],
    rngState: Rng.fromSeed(seed).getState(),
  };
}

/** 再生用の軌跡の1点 */
export interface TrackPoint {
  t: number;
  x: number;
  y: number;
  facing: number;
}

export type TurnEvent =
  | { t: number; unitId: string; type: "arrived" }
  | { t: number; unitId: string; type: "formationChanged"; from: Unit["formation"]; to: Unit["formation"] }
  | { t: number; unitId: string; type: "stanceChanged"; from: string; to: string }
  | { t: number; unitId: string; type: "entrenchmentChanged"; from: number; to: number }
  /** このユニットが新たに敵と接触した */
  | { t: number; unitId: string; type: "contact" }
  | { t: number; unitId: string; type: "conditionalTriggered"; condition: Condition["type"] }
  /** このユニットが撃った(at は目標の位置。目標のIDは霧のため載せない) */
  | { t: number; unitId: string; type: "fired"; at: Vec2 }
  /** このユニットが撃たれた。各ゲージの変化量 */
  | { t: number; unitId: string; type: "hit"; strength: number; suppression: number; morale: number }
  /** 燃料切れで動けなかった(ターンに1回まで) */
  | { t: number; unitId: string; type: "outOfFuel" }
  /** 対砲兵戦:砲撃の最中に撃たれ、このターンの残りの砲撃をやめた */
  | { t: number; unitId: string; type: "fireHalted" }
  /** 敵の阻止圏で止められた(ターンに1回まで。相手のIDは霧のため載せない) */
  | { t: number; unitId: string; type: "blocked" }
  /** このユニットが敵の阻止圏を突破した(相手ごとにターンに1回) */
  | { t: number; unitId: string; type: "breakthrough" }
  /** このユニットの阻止圏が敵に突破された(相手ごとにターンに1回) */
  | { t: number; unitId: string; type: "breached" }
  /** このユニットが敵の集積所を奪った */
  | { t: number; unitId: string; type: "depotCaptured"; depotId: string }
  /** 補給路のつながりが変わった */
  | { t: number; unitId: string; type: "supplyStatus"; supplied: boolean }
  /** 戦場から去った(別の方面への転用など。損耗ではない) */
  | { t: number; unitId: string; type: "withdrawn" }
  /** 姿勢の効果が切れた(強襲の息切れ) */
  | { t: number; unitId: string; type: "stanceSpent"; stance: string }
  /** ターン終了時の補給で受け取った量(トン) */
  | { t: number; unitId: string; type: "resupplied"; ammoT: number; fuelT: number }
  | { t: number; unitId: string; type: "routed" }
  | { t: number; unitId: string; type: "rallied" }
  /** 敵に取りつかれたまま崩れ、逃げ遅れ・捕虜で戦力を失った */
  | { t: number; unitId: string; type: "overrun" }
  /** 敵の阻止圏に包囲されている(ターン終了時。士気を失う) */
  | { t: number; unitId: string; type: "encircled"; morale: number }
  /** 潰走中に包囲され、投降した(ターン終了時。このあと除去される) */
  | { t: number; unitId: string; type: "surrendered" }
  /** 戦力0で除去された(ターン終了時) */
  | { t: number; unitId: string; type: "destroyed" }
  /** 夜間行動の士気コスト(夜の終わり) */
  | { t: number; unitId: string; type: "nightStrain"; morale: number }
  /** 増援として到着した(ターン終了時。次のターンから命令できる) */
  | { t: number; unitId: string; type: "reinforced" };

/** 司令部コマンドの結果。要請した陣営にだけ伝える */
export type HqEvent =
  | { t: number; side: string; type: "airAborted"; kind: AirMission["kind"] | "closeAirSupport"; target: Vec2; weather: string }
  | { t: number; side: string; type: "airStrike"; target: Vec2 }
  /** 制空任務の結果、空域 sector の自陣営の制空権の割合が control になった */
  | { t: number; side: string; type: "airSuperiority"; sector: string; control: number }
  /** 空域 sector で空戦になり、戦闘機の編隊を lostGroups 失った */
  | { t: number; side: string; type: "dogfight"; sector: string; lostGroups: number }
  /** 対空砲に撃たれ、攻撃機の編隊を lostGroups 失った */
  | { t: number; side: string; type: "flak"; kind: AirMission["kind"] | "closeAirSupport"; target: Vec2; lostGroups: number }
  /** 補給線への攻撃が始まった */
  | { t: number; side: string; type: "interdiction"; target: Vec2 }
  /** 航空任務が迎撃されて失敗した */
  | { t: number; side: string; type: "airIntercepted"; kind: AirMission["kind"] | "closeAirSupport"; target: Vec2 }
  /** 斥候が戻った(found は見つけた敵の数、caught は斥候が見つかったか) */
  | { t: number; side: string; type: "patrol"; unitId: string; target: Vec2; found: number; caught: boolean; failed?: boolean }
  /** 航空偵察で撮影した(found は見つけた敵の数) */
  | { t: number; side: string; type: "airRecon"; target: Vec2; found: number }
  /** 艦砲射撃が始まった */
  | { t: number; side: string; type: "navalGunfire"; target: Vec2 }
  /** 近接航空支援が飛来した */
  | { t: number; side: string; type: "closeAirSupport"; unitId: string }
  /** 空挺部隊が降りた(at は降りた地点、strengthLoss は降下で失った戦力) */
  | { t: number; side: string; type: "airborneLanded"; unitId: string; at: Vec2; strengthLoss: number; intercepted: boolean }
  /** 死守していたユニットを失い、陣営の全ユニットの士気が下がった */
  | { t: number; side: string; type: "lastStandLost"; unitId: string; morale: number }
  | { t: number; side: string; type: "airDrop"; target: Vec2; receiver: string | null; ammoT: number; fuelT: number }
  /** 橋の爆破(success:成功したか。reason:頼んだ後に橋のそばの部隊がいなくなったなど、試せなかった理由) */
  | { t: number; side: string; type: "bridgeDemolition"; bridgeId: string; success: boolean; reason?: string }
  /** 橋の修理を始めた */
  | { t: number; side: string; type: "bridgeRepairStarted"; bridgeId: string }
  /** 対砲兵戦:敵の砲兵が砲撃を撃ち始め、その位置(at)を標定した */
  | { t: number; side: string; type: "batteryLocated"; at: Vec2 };

/** 陣営に関わる公開イベント(目標の奪取など)。ユニットのイベントとは別に、両陣営へ送る */
export type PublicEvent =
  | { t: number; type: "objectiveCaptured"; objectiveId: string; from: string | null; to: string }
  /** 次のターンの天候が変わった */
  | { t: number; type: "weatherChanged"; from: string; to: string }
  /** 橋が落ちた(爆破・空襲)。次のターンから通れない */
  | { t: number; type: "bridgeDestroyed"; bridgeId: string; by: "demolition" | "airStrike" }
  /** 橋の修理が終わった。次のターンから通れる */
  | { t: number; type: "bridgeRepaired"; bridgeId: string };

/** 直接射撃の1回分(小ステップごと)。再生の表示用。霧のフィルタで陣営ごとに絞る */
export interface Shot {
  t: number;
  attackerId: string;
  targetId: string;
}

/** 砲撃・空襲の着弾(小ステップごと)。再生の表示用 */
export interface Impact {
  t: number;
  /** 要請した陣営 */
  side: string;
  kind: "artillery" | "air";
  x: number;
  y: number;
  radiusM: number;
  /** 着弾が見えた(聞こえた)陣営。要請した陣営と、近く(基本視程以内)に部隊がいた陣営 */
  seenBy: string[];
}

/** このターンの、直接射撃の撃ち合い1組(撃った部隊 → 撃たれた部隊)の合計。画面の戦況まとめ用 */
export interface Engagement {
  attackerId: string;
  targetId: string;
  /** 撃たれた部隊が失った戦力・士気(0〜1。同じ目標を撃った部隊のあいだで、損害の割合で分けたもの) */
  strength: number;
  morale: number;
  /** いちばん多く損害を与えた面 */
  aspect: Aspect;
  /** この組にかかった、その場の倍率(撃たれた面・後手の一撃・伏撃の初撃・夜襲・戦闘正面幅など。損害で重みをつけた平均) */
  situational: Factor[];
}

/** このターンの砲撃・空襲・近接航空支援・艦砲射撃・補給線への攻撃1回分の結果。画面用 */
export interface StrikeReport {
  side: string;
  kind: "artillery" | "airStrike" | "interdiction" | "closeAirSupport" | "naval";
  /** 着弾の中心(近接航空支援は支援した部隊の位置) */
  target: Vec2;
  /** 撃った砲兵・支援した部隊 */
  unitId?: string;
  /** 効果にかかった倍率(制空権・対空砲) */
  effect: Factor[];
  /** 損害を受けた部隊(味方への誤射も含む) */
  hits: { unitId: string; strength: number; morale: number }[];
}

export interface TurnResult {
  state: GameState;
  events: TurnEvent[];
  tracks: Record<string, TrackPoint[]>;
  shots: Shot[];
  impacts: Impact[];
  /** [陣営][敵ユニットID] → 小ステップごとの探知段階(tracks と同じ長さ)。霧のフィルタに使う */
  detections: Record<string, Record<string, DetectionLevel[]>>;
  rejectedOrders: RejectedOrder[];
  rejectedHqCommands: RejectedHqCommand[];
  /** このターンに除去されたユニット(除去時点の状態)。state.units には含まれない */
  destroyed: Unit[];
  publicEvents: PublicEvent[];
  hqEvents: HqEvent[];
  /** 直接射撃の撃ち合いの組ごとの合計(霧のフィルタを通してから見せる) */
  engagements: Engagement[];
  /** 砲撃・空襲などの1回ごとの結果(霧のフィルタを通してから見せる) */
  strikes: StrikeReport[];
  /** 規定ターンを終えたら勝敗。それまでは null(途中で決着はつけない) */
  result: VictoryResult | null;
}

/**
 * その時点の状態を反映した文脈:壊れた橋を道路網から外し、地面の状態を入れる。ターンの解決と、経路の見積もりで同じものを使う
 */
export function stateContext(ctx: SimContext, state: Pick<GameState, "bridges" | "ground">): SimContext {
  return { ...withBridges(ctx, state.bridges), ground: state.ground ?? { mud: 0, snow: 0 } };
}

/** シナリオの開始状態を作る(目標の保持はシナリオの初期値) */
export function startScenario(units: readonly Unit[], seed: number, ctx: SimContext, depots: readonly Depot[] = []): GameState {
  const s = newGameState(units, seed, depots, initialHolders(ctx.scenario), initialWeather(ctx));
  s.airSortiesLeft = initialAirSorties(ctx);
  s.airGroups = initialAirGroups(ctx);
  s.airControl = baseAirControl(ctx);
  s.airborneReady = initialAirborneReady(ctx);
  s.navalLeft = initialNavalLeft(ctx);
  s.patrolsLeft = Object.fromEntries(Object.keys(ctx.scenario.victory).map((side) => [side, ctx.rules.patrol.perDay]));
  s.forceTotals = forceNow(s.units, ctx);
  s.supplyRoutes = currentSupplyRoutes(s.units, s.depots, ctx);
  s.phase = isNightTurn(ctx.scenario, 1) ? "night" : "day";
  s.bridges = initialBridges(ctx);
  s.ground = initialGround(ctx);
  const secrets = drawSecrets(ctx.scenario, seed);
  if (Object.keys(secrets).length > 0) s.secrets = secrets;
  s.supplyRoutes = currentSupplyRoutes(s.units, s.depots, withBridges(ctx, s.bridges));
  return s;
}

/** 潰走して下がろうとしたのに、ターンの間にこの距離しか動けなかったら、逃げ場を失ったとみなす */
const TRAPPED_WITHIN_M = 50;

export function isGameOver(state: GameState, ctx: SimContext): boolean {
  return state.turn > ctx.scenario.maxTurns;
}

/** シナリオのデータ同士の参照が切れていないかを調べる */
export function validateContext(ctx: SimContext, units: readonly Unit[], depots: readonly Depot[] = [], turn = 1): string[] {
  const errors: string[] = validatePacks(ctx);
  const { rules, branches, terrain } = ctx;
  if (!Number.isInteger(ctx.turnSeconds / ctx.stepSeconds) || ctx.stepSeconds <= 0) {
    errors.push(`turnSeconds(${ctx.turnSeconds}) が stepSeconds(${ctx.stepSeconds}) で割り切れません`);
  }
  for (const id of terrain.terrainIds()) {
    if (!(id in rules.terrain)) errors.push(`マップの地形 "${id}" がルールパックにありません`);
  }
  for (const u of units) {
    if (!(u.branch in branches.branches)) errors.push(`${u.id}: 兵科 "${u.branch}" が兵科パックにありません`);
    if (!(u.stance in rules.stances)) errors.push(`${u.id}: 姿勢 "${u.stance}" がルールパックにありません`);
    if (u.training !== undefined && !(u.training in rules.training.levels)) errors.push(`${u.id}: 練度 "${u.training}" がルールパックにありません`);
    const toe = ctx.toes.toes[u.toe];
    if (!toe) errors.push(`${u.id}: 編成表 "${u.toe}" が編成パックにありません`);
    else if (toe.branch !== u.branch) errors.push(`${u.id}: 兵科 "${u.branch}" が編成表の兵科 "${toe.branch}" と一致しません`);
  }
  for (const d of depots) {
    if (!ctx.roads.hasNode(d.nodeId)) errors.push(`集積所 ${d.id}: 道路ノード "${d.nodeId}" がありません`);
  }
  for (const [side, a] of Object.entries(ctx.scenario.air)) {
    if (a.strike && !(a.strike.weapon in ctx.weapons.weapons)) errors.push(`${side} の空襲の武器 "${a.strike.weapon}" が武器パックにありません`);
  }
  const nightCfg = ctx.scenario.night;
  if (nightCfg && !Number.isInteger((nightCfg.hours * 3600) / rules.night.stepSeconds)) {
    errors.push(`夜の長さ(${nightCfg.hours}時間)が夜の刻み(${rules.night.stepSeconds}秒)で割り切れません`);
  }
  const ids = new Set(units.map((u) => u.id));
  // まだ到着していない増援だけを調べる(到着済みのものは units に入っている)
  for (const r of ctx.scenario.reinforcements.filter((x) => x.turn > turn)) {
    if (ids.has(r.id)) errors.push(`増援 ${r.id}: IDが既存のユニットと重複しています`);
    ids.add(r.id);
    const toe = ctx.toes.toes[r.toe];
    if (!toe) errors.push(`増援 ${r.id}: 編成表 "${r.toe}" が編成パックにありません`);
    else if (r.branch !== undefined && toe.branch !== r.branch) errors.push(`増援 ${r.id}: 兵科 "${r.branch}" が編成表の兵科 "${toe.branch}" と一致しません`);
    if (r.training !== undefined && !(r.training in rules.training.levels)) errors.push(`増援 ${r.id}: 練度 "${r.training}" がルールパックにありません`);
  }
  if (ctx.fogDensity !== undefined && !(ctx.fogDensity in rules.fog.levels)) {
    errors.push(`霧の濃度 "${ctx.fogDensity}" がルールパックにありません`);
  }
  for (const w of ctx.scenario.weather.allowed ?? []) {
    if (!(w in rules.weather.types)) errors.push(`シナリオの天候の幅 "${w}" がルールパックにありません`);
  }
  for (const e of ctx.scenario.weather.schedule ?? []) {
    for (const w of [e.weather, ...(e.allowed ?? [])]) if (!(w in rules.weather.types)) errors.push(`天候の予定(${e.turn}ターン目)の "${w}" がルールパックにありません`);
  }
  // 離脱は開始時だけ調べる(去った・失われたユニットは、その後のターンには残っていない)
  if (turn <= 1) {
    for (const w of ctx.scenario.withdrawals) {
      if (!ids.has(w.id)) errors.push(`離脱 ${w.id}: そのIDのユニット・増援がありません`);
    }
  }
  if (!(ctx.scenario.weather.initial in rules.weather.types)) {
    errors.push(`シナリオの天候 "${ctx.scenario.weather.initial}" がルールパックにありません`);
  }
  return errors;
}

/** パック同士(編成表 → 武器・兵科)の参照を調べる */
export function validatePacks(ctx: SimContext): string[] {
  const errors: string[] = [];
  for (const [id, toe] of Object.entries(ctx.toes.toes)) {
    if (!(toe.branch in ctx.branches.branches)) errors.push(`編成表 ${id}: 兵科 "${toe.branch}" が兵科パックにありません`);
    for (const e of toe.elements) {
      for (const ref of e.weapons) {
        if (!(ref.weapon in ctx.weapons.weapons)) errors.push(`編成表 ${id} / ${e.name}: 武器 "${ref.weapon}" が武器パックにありません`);
      }
    }
  }
  return errors;
}

/** 今いる地形・兵科・姿勢から決まる陣地レベルの上限 */
export function entrenchmentCap(u: Unit, ctx: SimContext): number {
  const { rules } = ctx;
  const terrain = rules.terrain[ctx.terrain.terrainAt(u.pos)]!;
  const branch = ctx.branches.branches[u.branch]!;
  const stance = stanceOf(u, rules);
  const cap = terrain.entrenchmentCap + branch.entrenchmentCapModifier + stance.entrenchmentCapModifier;
  return Math.min(rules.entrenchment.maxLevel, Math.max(rules.entrenchment.minLevel, cap));
}

const speedMps = moveSpeedMps;

/** 追撃で、行き先にこの距離まで来たら着いたとみなす(m) */
const PURSUIT_ARRIVED_M = 50;
/** 追撃で、敵が動いて行き先がこの距離以上ずれたら経路を引き直す(m) */
const PURSUIT_REPLAN_M = 100;

/** 展開したまま動く速さ(m/秒)。帯の旋回で、翼の端が動く速さに使う */
function deployedSpeedMps(u: Unit, ctx: SimContext): number {
  const branch = ctx.branches.branches[u.branch]!;
  const ground = terrainSpeed(ctx.terrain.terrainAt(u.pos), mobilityOf(u, ctx), ctx);
  return (branch.marchSpeedMpm / 60) * ctx.rules.combatMoveSpeedRatio * ground * groundSpeedMultiplier(ctx, mobilityOf(u, ctx), false) * fatigueSpeedMultiplier(u, ctx);
}

/**
 * 帯(正面幅)を持つユニットか。展開済みで潰走していないユニットは、向きを変えるのに旋回の時間がかかる
 * (縦隊・展開中・潰走中は点として扱い、向きはすぐ変わる)
 */
function wheels(u: Unit, ctx: SimContext): boolean {
  return u.formation === "deployed" && !u.routed && frontageOf(u, ctx) > 0;
}

/**
 * 向き from から desired へ回る角度(度、時計回りが正。-180〜180)。ちょうど反対向きのときは 180
 * (回る向きは決めない。帯を持つユニットは横に回らず、その場で回れ右をする)
 */
function turnAngle(from: number, desired: number, _pos: Vec2, _ctx: SimContext): number {
  const d = normalizeBearing(desired - from);
  if (Math.abs(d - 180) < 1e-9) return 180;
  return d > 180 ? d - 360 : d;
}

function lerp(a: Vec2, b: Vec2, k: number): Vec2 {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * 1ターンを解決する。入力の state は変更しない。
 * 小ステップごとに 移動 → 探知 → 反応(条件付き命令・接敵) → 直接射撃 の順に処理する。
 * 携行備蓄(弾薬・燃料)は移動と射撃で減り、ターン終了時に補給路から補充される。間接射撃は未実装。
 */
export function resolveTurn(
  state: GameState,
  orders: readonly UnitOrder[],
  ctx: SimContext,
  hqCommands: readonly HqCommand[] = [],
): TurnResult {
  const contextErrors = validateContext(ctx, state.units, state.depots, state.turn);
  if (!(state.weather.current in ctx.rules.weather.types)) contextErrors.push(`天候 "${state.weather.current}" がルールパックにありません`);
  if (contextErrors.length) throw new Error(`シナリオデータが不正です:\n${contextErrors.join("\n")}`);
  // このターンの条件(天候・昼夜)を反映した文脈。夜間フェイズは長さと刻みが変わるが、展開にかかる時間は昼の1ターン分のまま
  const night = isNightTurn(ctx.scenario, state.turn);
  ctx = {
    ...ctx,
    visibilityMultiplier:
      ctx.visibilityMultiplier * weatherVisibility(state.weather, ctx) * (night || isDarkTurn(ctx.scenario, state.turn) ? ctx.rules.night.visibilityMultiplier : 1),
    phase: night ? "night" : "day",
    deploySeconds: ctx.turnSeconds,
    ...(night ? { turnSeconds: ctx.scenario.night!.hours * 3600, stepSeconds: ctx.rules.night.stepSeconds } : {}),
  };
  if (isGameOver(state, ctx)) throw new Error(`規定ターン(${ctx.scenario.maxTurns})を過ぎています`);
  // 壊れた橋は、このターンの行軍の道路・補給路から外す。地面の状態(ぬかるみ・積雪)は移動の速さに効く
  ctx = stateContext(ctx, state);

  // 処理順で結果が変わらないよう、ID順に固定する
  const units = state.units.map(cloneUnit).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // 前のターンまでに引いた経路が、その後に落ちた橋を渡るなら、同じ行き先へ引き直す(届かなければ止まる)
  for (const u of units) {
    if (u.route.length > 0 && routeCrossesClosed(u.pos, u.route, ctx)) {
      u.route = planRoute(u.pos, [u.route.at(-1)!], u.moveMode, ctx, mobilityOf(u, ctx)) ?? [];
    }
  }
  const byId = new Map(units.map((u) => [u.id, u]));
  // 指揮ポイント:陣営ごとに、命令 → 司令部コマンドの順に、送られてきた順で使う
  const cpLeft = new Map(Object.entries(ctx.scenario.commandPoints));
  const spend = (side: string) => {
    const left = cpLeft.get(side);
    if (left === undefined) return true;
    if (left <= 0) return false;
    cpLeft.set(side, left - 1);
    return true;
  };
  const acceptedOrders: UnitOrder[] = [];
  // 練度による命令の遅れ(昼だけ):遅れのある部隊の命令は、遅れの分だけ経ってから効かせる。それまでは前の命令のまま動く
  const orderDelay = (u: Unit) => (night ? 0 : trainingOf(u, ctx.rules).orderDelayMinutes * 60);
  const deferredOrders: UnitOrder[] = [];
  const rejectedOrders = applyOrders(byId, orders, ctx, spend, acceptedOrders, state.intel, (u) => orderDelay(u) > 0, deferredOrders);
  // 死守の重み:死守への切替を命じた分だけたまる。このターンの士気の回復は、たまった後の重みで遅くなる
  const lastStand: Record<string, number> = { ...state.lastStand };
  for (const o of acceptedOrders) {
    const u = byId.get(o.unitId)!;
    // 遅れて効く命令の死守も、命じた時点で数える
    const switching = u.pendingStance === o.stance || (deferredOrders.includes(o) && u.stance !== o.stance);
    if (o.stance !== undefined && switching && ctx.rules.stances[o.stance]!.lastStand) {
      lastStand[u.side] = (lastStand[u.side] ?? 0) + ctx.rules.lastStand.gaugePerOrder;
    }
  }
  const ls = ctx.rules.lastStand;
  const moraleRecovery = (side: string) => Math.max(ls.moraleRecoveryFloor, 1 - (lastStand[side] ?? 0) * ls.moraleRecoveryPenaltyPerPoint);
  // 夜間フェイズに行動するのは、このターン(夜)に目的地つきの命令(夜間行動命令)を受けたユニットだけ。
  // 昼から引き継いだ経路や移動モードでは夜は動かない(誤って夜襲に突入しないように)
  if (night) {
    ctx = { ...ctx, nightActors: new Set(acceptedOrders.filter((o) => (o.waypoints?.length ?? 0) > 0 || o.pursue != null).map((o) => o.unitId)) };
  }
  // 司令部コマンドは次のターンに着弾する。今のターンに着弾するのは前のターンまでに予約した分
  const scheduled = scheduleHqCommands(hqCommands, byId, state.turn, ctx, spend, {
    left: state.airSortiesLeft,
    pending: state.airMissions,
    airborneReady: state.airborneReady,
  }, { left: state.navalLeft, pending: state.navalMissions }, state.patrolsLeft, (side, target) =>
    Object.values(state.intel[side]?.entries ?? {}).some(
      (e) => e.currentLevel > 0 && !e.confirmedDestroyed && distance(e.lastSeenPos, target) <= ctx.rules.combat.indirectImpactRadiusM,
    ), state.bridges);
  // 艦砲射撃:このターンに着弾するのは前のターンまでに予約した分(夜は撃たない。要請の時点で弾いているが念のため)
  const activeNaval = night ? [] : state.navalMissions.filter((m) => m.turn === state.turn);
  const laterNaval = state.navalMissions.filter((m) => m.turn > state.turn);
  const navalLeft = { ...state.navalLeft };
  for (const m of activeNaval) navalLeft[m.side] = (navalLeft[m.side] ?? 0) - 1;
  // 空挺部隊:予約した部隊は待機から外す(天候で中止になれば戻す)
  const airborneReady: AirborneReady = structuredClone(state.airborneReady);
  for (const m of scheduled.airMissions.filter((x) => x.kind === "airborneDrop")) {
    airborneReady[m.side] = (airborneReady[m.side] ?? []).filter((id) => id !== m.unitId);
  }
  // 夜間フェイズには砲撃しない(要請の時点で弾いているが、念のため)
  // 観測射撃(このターンに要請し、このターンのうちに着弾する)も加える
  const activeMissions = night ? [] : [...state.fireMissions.filter((m) => m.turn === state.turn), ...scheduled.missions.filter((m) => m.turn === state.turn)];
  const laterMissions = state.fireMissions.filter((m) => m.turn > state.turn);

  // 航空:このターンの天候で飛べなければ中止(出撃枠は使わない)。飛べば出撃枠を使う
  const hqEvents: HqEvent[] = [];
  const airSortiesLeft: AirSorties = structuredClone(state.airSortiesLeft);
  const airGroups: AirGroups = Object.keys(state.airGroups).length ? structuredClone(state.airGroups) : initialAirGroups(ctx);
  const laterAir = state.airMissions.filter((m) => m.turn > state.turn);
  const flyable = !night && airAllowed(state.weather, ctx);
  const rng = Rng.fromState(state.rngState);
  const spendSorties = (side: string, cost: AirPools) => {
    const p = (airSortiesLeft[side] ??= { fighter: 0, attack: 0, transport: 0 });
    p.fighter -= cost.fighter;
    p.attack -= cost.attack;
    p.transport -= cost.transport;
  };
  /** 失った編隊(持ち越す) */
  const loseGroups = (side: string, kind: "fighters" | "attack", n: number) => {
    const g = (airGroups[side] ??= { fighters: 0, attack: 0 });
    g[kind] = Math.max(0, g[kind] - n);
  };
  const due = state.airMissions.filter((x) => x.turn === state.turn);
  const flyingDue: AirMission[] = [];
  for (const m of due) {
    if (!flyable) {
      hqEvents.push({ t: state.time, side: m.side, type: "airAborted", kind: m.kind, target: { ...m.target }, weather: state.weather.current });
      if (m.kind === "airborneDrop") (airborneReady[m.side] ??= []).push(m.unitId!);
      continue;
    }
    spendSorties(m.side, missionCost(m.kind, m.escort));
    flyingDue.push(m);
  }
  // 近接航空支援はこのターンに要請して、このターンに飛ぶ
  const casFlying: CloseAirSupport[] = [];
  for (const c of scheduled.closeSupport) {
    const at = byId.get(c.unitId)!.pos;
    if (!flyable) {
      hqEvents.push({ t: state.time, side: c.side, type: "airAborted", kind: "closeAirSupport", target: { ...at }, weather: state.weather.current });
      continue;
    }
    spendSorties(c.side, missionCost("closeAirSupport", c.escort));
    casFlying.push(c);
  }
  // 1) 空域ごとの戦闘機(制空任務と護衛)。同じ空域に両陣営がいれば空戦になり、双方が編隊を失う。
  //    そのあと、戦闘機がいた空域の制空権が出撃数の比へ動く(このターンの空襲・空輸より先に効く)。
  //    制空権は持ち越さない:どの空域も毎ターン基準の割合(2陣営なら50%)から始まる
  let airControl: AirControl = baseAirControl(ctx);
  const presence: AirPresence = {};
  const addPresence = (at: Vec2, side: string, n: number) => {
    if (n <= 0) return;
    const k = airSectorOf(at, ctx);
    const here = (presence[k] ??= {});
    here[side] = (here[side] ?? 0) + n;
  };
  const escortWeight = ctx.rules.air.escortPresenceWeight;
  for (const m of flyingDue) {
    if (m.kind === "airSuperiority") addPresence(m.target, m.side, 1);
    else addPresence(m.target, m.side, (m.escort ?? 0) * escortWeight);
  }
  for (const c of casFlying) addPresence(byId.get(c.unitId)!.pos, c.side, (c.escort ?? 0) * escortWeight);
  for (const sector of Object.keys(presence).sort()) {
    const losses = dogfightLosses(presence[sector]!, ctx);
    for (const side of Object.keys(losses).sort()) {
      loseGroups(side, "fighters", losses[side]!);
      hqEvents.push({ t: state.time, side, type: "dogfight", sector, lostGroups: losses[side]! });
    }
  }
  airControl = updateAirControl(airControl, presence, ctx);
  for (const sector of Object.keys(presence).sort()) {
    for (const side of Object.keys(presence[sector]!).sort()) {
      if (flyingDue.some((m) => m.side === side && m.kind === "airSuperiority" && airSectorOf(m.target, ctx) === sector)) {
        hqEvents.push({ t: state.time, side, type: "airSuperiority", sector, control: airControl[sector]?.[side] ?? 0 });
      }
    }
  }
  // 迎撃:その空域の制空権が低いほど、護衛が少ないほど、航空任務が迎撃されて失敗する(出撃枠は使う)。迎撃の可能性がなければ乱数を引かない
  const intercepted = (side: string, at: Vec2, escort = 0) => {
    const p = interceptChance(airControlAt(airControl, side, at, ctx), ctx, escort);
    return p > 0 && rng.next() < p;
  };
  /** 対空砲:目標のまわりの敵の対空の力に応じて、攻撃機の編隊を失い、効果が下がる。効果の倍率を返す */
  const underFlak = (side: string, kind: AirMission["kind"] | "closeAirSupport", at: Vec2): number => {
    const pts = flakPoints(side, at, units, ctx);
    if (pts <= 0) return 1;
    const f = flakResult(pts, ctx);
    loseGroups(side, "attack", f.lostGroups);
    hqEvents.push({ t: state.time, side, type: "flak", kind, target: { ...at }, lostGroups: f.lostGroups });
    return f.effect;
  };
  const flakEffect = new Map<AirMission | CloseAirSupport, number>();
  // 2) 空襲・空輸・補給線への攻撃
  const flying: AirMission[] = [];
  for (const m of flyingDue.filter((x) => x.kind === "airStrike" || x.kind === "airDrop" || x.kind === "interdiction")) {
    if (intercepted(m.side, m.target, m.escort ?? 0)) {
      if (m.kind !== "airDrop") loseGroups(m.side, "attack", ctx.rules.air.interceptLossGroups);
      hqEvents.push({ t: state.time, side: m.side, type: "airIntercepted", kind: m.kind, target: { ...m.target } });
      continue;
    }
    if (m.kind !== "airDrop") flakEffect.set(m, underFlak(m.side, m.kind, m.target));
    flying.push(m);
  }
  // 3) 航空偵察:ターン中のどこかの時刻に撮影する(時刻はミッションごとに乱数を1回)
  const reconSteps = ctx.turnSeconds / ctx.stepSeconds;
  const reconFlights: { m: AirMission; step: number }[] = [];
  for (const m of flyingDue.filter((x) => x.kind === "airRecon")) {
    if (intercepted(m.side, m.target)) {
      loseGroups(m.side, "fighters", ctx.rules.air.interceptLossGroups);
      hqEvents.push({ t: state.time, side: m.side, type: "airIntercepted", kind: m.kind, target: { ...m.target } });
      continue;
    }
    reconFlights.push({ m, step: Math.floor(rng.next() * reconSteps) });
  }
  // 補給線への攻撃の効果(道路の輸送力の低下)は、durationHours の間続く
  const interdictions: Interdiction[] = [
    ...state.interdictions.filter((x) => x.until > state.time),
    ...flying.filter((m) => m.kind === "interdiction").map((m) => ({ side: m.side, target: { ...m.target }, until: state.time + ctx.rules.air.interdiction.durationHours * 3600 })),
  ];

  const patrolsLeft = { ...state.patrolsLeft };
  for (const p of scheduled.patrols) patrolsLeft[p.side] = (patrolsLeft[p.side] ?? ctx.rules.patrol.perDay) - 1;
  // 斥候:扇形の半分の距離に応じて、そのターンのうちに遅れて結果が出る
  const patrols = scheduled.patrols.map((p) => {
    const d = ctx.rules.patrol.maxRangeM / 2;
    const delay = Math.round((d / 1000) * ctx.rules.patrol.minutesPerKm * 60 / ctx.stepSeconds);
    return { p, step: Math.min(reconSteps - 1, Math.max(0, delay)) };
  });

  // 4) 空挺降下:次のターンの始め(このターンの始め)に、降下地点のまわりに散らばって降りる。展開途中の状態で、少し戦力を失う。
  // 迎撃されたら中止ではなく、大きく散らばり、大きな損害を受けて降りる。悪天候なら中止して待機に戻す
  const ab = ctx.rules.air.airborne;
  /** このターンに降りた空挺部隊(損耗率の分母に、満員時の戦力を足す。降下で失った分は損耗に数える) */
  const landedAirborne: Unit[] = [];
  // 降下地点の近くの敵は、このターンに降りる前の配置で判定する(処理順で、後から降りる側だけ不利にならないように)
  const beforeLanding = units.filter((e) => e.strength > 0).map((e) => ({ side: e.side, pos: { ...e.pos } }));
  for (const m of flyingDue.filter((x) => x.kind === "airborneDrop")) {
    const def = ctx.scenario.airborne.find((a) => a.id === m.unitId)!;
    const wasIntercepted = intercepted(m.side, m.target);
    const scatter = wasIntercepted ? ab.interceptedScatterM : ab.scatterM;
    let pos: Vec2 = { ...m.target };
    for (let i = 0; i < 8; i++) {
      const ang = rng.next() * 2 * Math.PI;
      const d = Math.sqrt(rng.next()) * scatter;
      const p = {
        x: Math.min(ctx.terrain.widthM, Math.max(0, m.target.x + Math.sin(ang) * d)),
        y: Math.min(ctx.terrain.heightM, Math.max(0, m.target.y + Math.cos(ang) * d)),
      };
      if (terrainSpeed(ctx.terrain.terrainAt(p), "foot", ctx) > 0) {
        pos = p;
        break;
      }
    }
    let loss = wasIntercepted ? ab.interceptedLoss : ab.lossMin + (ab.lossMax - ab.lossMin) * rng.next();
    if (beforeLanding.some((e) => e.side !== m.side && distance(e.pos, pos) <= ab.enemyNearM)) loss += ab.enemyNearLoss;
    const u = createUnit({
      id: def.id,
      side: def.side,
      branch: def.branch ?? ctx.toes.toes[def.toe]!.branch,
      toe: def.toe,
      pos,
      facing: 0,
      stance: def.stance ?? ctx.rules.defaultStance,
      formation: "deploying",
    });
    u.strength = Math.max(0.05, 1 - loss);
    units.push(u);
    byId.set(u.id, u);
    landedAirborne.push(u);
    hqEvents.push({ t: state.time, side: m.side, type: "airborneLanded", unitId: u.id, at: { ...pos }, strengthLoss: 1 - u.strength, intercepted: wasIntercepted });
  }
  units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 5) 近接航空支援:このターンのうちに、要請から delayMinutes 後に飛来し、strikeMinutes の間叩く
  const cs = ctx.rules.air.closeSupport;
  const csFrom = Math.round((cs.delayMinutes * 60) / ctx.stepSeconds);
  const csTo = csFrom + Math.max(1, Math.round((cs.strikeMinutes * 60) / ctx.stepSeconds));
  const closeSupport: CloseAirSupport[] = [];
  for (const c of casFlying) {
    const at = byId.get(c.unitId)!.pos;
    if (intercepted(c.side, at, c.escort ?? 0)) {
      loseGroups(c.side, "attack", ctx.rules.air.interceptLossGroups);
      hqEvents.push({ t: state.time, side: c.side, type: "airIntercepted", kind: "closeAirSupport", target: { ...at } });
      continue;
    }
    flakEffect.set(c, underFlak(c.side, "closeAirSupport", at));
    closeSupport.push(c);
  }
  const intel = cloneIntel(state.intel);
  // 夜襲する部隊:夜間フェイズの始めに、戦闘移動で動こうとしている部隊。夜のあいだ夜襲を続ける
  const nightFire = night
    ? { attackers: new Set(units.filter((u) => ctx.nightActors!.has(u.id) && u.moveMode === "combat" && !u.routed).map((u) => u.id)) }
    : undefined;
  // 空襲の時間帯(ミッションごとに乱数を1回)
  const strikes = flying.filter((m) => m.kind === "airStrike" || m.kind === "interdiction").map((m) => ({ m, window: strikeWindow(ctx, m.side, rng) }));

  const events: TurnEvent[] = [];
  const tracks: Record<string, TrackPoint[]> = {};
  const shots: Shot[] = [];
  const impacts: Impact[] = [];
  // 戦況まとめ:撃ち合いの組ごと・砲撃や空襲の1回ごとに、与えた損害を足し上げる
  const engagementTally = new Map<string, { e: Engagement; byAspect: Record<string, number>; factors: Map<string, { label: string; sum: number; weight: number }>; weight: number }>();
  const strikeTally = new Map<string, { r: StrikeReport; hits: Map<string, { strength: number; morale: number }> }>();
  /** 射撃の結果ごとの出どころ(砲撃・空襲など。直接射撃は持たない) */
  const sourceOf = new Map<FireResult, Omit<StrikeReport, "hits"> & { key: string }>();
  const airEffectFactors = (side: string, at: Vec2, flak: number): Factor[] => {
    const control = airControlAt(airControl, side, at, ctx);
    const out: Factor[] = [];
    const e = airEffect(control, ctx);
    if (e !== 1) out.push({ id: "airControl", label: `制空権 ${Math.round(control * 100)}%`, value: e });
    if (flak !== 1) out.push({ id: "flak", label: "対空砲", value: flak });
    return out;
  };
  /** 砲撃・空襲が撃たれたことを記録する(何にも当たらなかったときも「効果なし」として見せるため) */
  const noteStrike = (src: Omit<StrikeReport, "hits"> & { key: string }) => {
    if (strikeTally.has(src.key)) return;
    const { key, ...report } = src;
    strikeTally.set(key, { r: { ...report, hits: [] }, hits: new Map() });
  };
  /** 適用した損害を、出どころ(撃ち合いの組・砲撃や空襲の1回)ごとに分けて足す */
  const tally = (results: readonly FireResult[], hits: ReadonlyMap<string, GaugeChange>) => {
    const total = new Map<string, number>();
    for (const r of results) total.set(r.targetId, (total.get(r.targetId) ?? 0) + r.damage);
    for (const r of results) {
      const ch = hits.get(r.targetId);
      const sum = total.get(r.targetId) ?? 0;
      if (!ch || sum <= 0 || r.damage <= 0) continue;
      const share = r.damage / sum;
      const strength = -ch.strength * share;
      const morale = -ch.morale * share;
      const src = sourceOf.get(r);
      if (src) {
        const { key, ...report } = src;
        const t = strikeTally.get(key) ?? { r: { ...report, hits: [] }, hits: new Map() };
        const h = t.hits.get(r.targetId) ?? { strength: 0, morale: 0 };
        h.strength += strength;
        h.morale += morale;
        t.hits.set(r.targetId, h);
        strikeTally.set(key, t);
        continue;
      }
      if (r.aspect === "indirect") continue;
      const key = `${r.attackerId}>${r.targetId}`;
      const t = engagementTally.get(key) ?? {
        e: { attackerId: r.attackerId, targetId: r.targetId, strength: 0, morale: 0, aspect: r.aspect, situational: [] },
        byAspect: {} as Record<string, number>,
        factors: new Map(),
        weight: 0,
      };
      t.e.strength += strength;
      t.e.morale += morale;
      t.byAspect[r.aspect] = (t.byAspect[r.aspect] ?? 0) + r.damage;
      t.weight += r.damage;
      for (const f of r.situational ?? []) {
        const a = t.factors.get(f.id) ?? { label: f.label, sum: 0, weight: 0 };
        a.sum += f.value * r.damage;
        a.weight += r.damage;
        t.factors.set(f.id, a);
      }
      engagementTally.set(key, t);
    }
  };
  /** 着弾が見えた陣営:要請した陣営と、基本視程以内に部隊がいた陣営 */
  const impactSeenBy = (side: string, at: Vec2) => {
    const sides = new Set([side]);
    for (const u of units) if (u.strength > 0 && distance(u.pos, at) <= ctx.rules.detection.baseRangeM) sides.add(u.side);
    return [...sides].sort();
  };
  const startedDeployed = new Map(units.map((u) => [u.id, u.formation === "deployed"]));
  const moved = new Set<string>();
  /** 追撃で最後に経路を引いた行き先(ユニットID → 行き先)。行き先が PURSUIT_REPLAN_M 以上ずれたら引き直す */
  const pursuitPlanned = new Map<string, Vec2>();
  /** このターンに並行移動・小さな向きの直しだけをしたユニット(陣地は失わないが、このターンは築き進めない) */
  const shifted = new Set<string>();
  let movedThisStep = new Set<string>();
  const outOfFuelReported = new Set<string>();
  /** このターンに撃ったユニット(撃たずにターンを終えたユニットは、露呈が解ける) */
  const firedThisTurn = new Set<string>();
  /** このターンに撃たれたユニット(次のターンの砲撃の要請を止める) */
  const hitThisTurn = new Set<string>();
  /** このターンに砲撃を撃ち始めた砲兵(標定の判定は1回の砲撃につき1度) */
  const batteryOpened = new Set<string>();
  /** 撃ち合いの組ごとの、このターンに撃ち始めた時刻(先手の時間の判定) */
  const firstShotAt = new Map<string, number>();
  /** 伏撃で隠れた状態から撃ち始めた時刻 */
  const openingSince = new Map<string, number>();
  const blockedReported = new Set<string>();
  /** ターンの始めの位置(逃げ場を失った潰走の判定に使う) */
  const startPos = new Map(units.map((u) => [u.id, { ...u.pos }]));
  /** 突破したユニット → 突破された相手。そのターンの残りは、その相手への与ダメージが上がる */
  const breached = new Map<string, Set<string>>();
  const breachShock = new Map<string, number>();
  /** ステップ開始時点の阻止圏 */
  let zones: HoldingZone[] = [];
  const t0 = state.time;
  /** 夜間フェイズで、移動と夜襲を行える時間内か(昼は常に true) */
  const activeAt = (tEnd: number) => !night || tEnd - t0 <= ctx.rules.night.activeHours * 3600;

  const setFormation = (u: Unit, to: Unit["formation"], t: number) => {
    if (u.formation === to) return;
    events.push({ t, unitId: u.id, type: "formationChanged", from: u.formation, to });
    u.formation = to;
    u.deployProgressSec = 0;
  };
  const setEntrenchment = (u: Unit, to: number, t: number) => {
    if (u.entrenchment === to) return;
    events.push({ t, unitId: u.id, type: "entrenchmentChanged", from: u.entrenchment, to });
    u.entrenchment = to;
  };
  const detections: TurnResult["detections"] = {};
  const record = (u: Unit, t: number) => {
    (tracks[u.id] ??= []).push({ t, x: u.pos.x, y: u.pos.y, facing: u.facing });
  };
  const detect = (t: number) => {
    const levels = updateIntel(intel, units, t, ctx, rng);
    for (const [side, byTarget] of Object.entries(levels)) {
      const d = (detections[side] ??= {});
      for (const [targetId, level] of Object.entries(byTarget)) (d[targetId] ??= []).push(level);
    }
    return levels;
  };

  /** 探知の結果に反応する:条件付き命令 → 接敵による展開 */
  const react = (t: number, levels: Record<string, Record<string, DetectionLevel>>) => {
    for (const u of units) {
      const enemies = units.filter((e) => e.side !== u.side);
      const sideLevels = levels[u.side] ?? {};

      let triggered = false;
      // 条件付き命令は夜は発動しない(夜に動くのは夜間行動命令を出したユニットだけ)。翌朝まで保留する
      if (u.conditional && !u.routed && !night && conditionMet(u, u.conditional.when, enemies, sideLevels)) {
        events.push({ t, unitId: u.id, type: "conditionalTriggered", condition: u.conditional.when.type });
        applyOrderBody(u, u.conditional.then, ctx);
        u.conditional = null;
        triggered = true;
      }

      const inContact = enemies
        .filter((e) => unitDistance(u, e, ctx) <= ctx.rules.contactRangeM && detectionLevel(u, e, ctx) > 0)
        .map((e) => e.id);
      const isNew = inContact.some((id) => !u.inContactWith.includes(id));
      u.inContactWith = inContact;
      if (!isNew) continue;
      events.push({ t, unitId: u.id, type: "contact" });
      // 偶発的な接敵:縦隊は停止して展開を始める。
      // 同じ瞬間に条件付き命令が発動していれば、プレイヤーの指示を優先する
      // 浸透移動中(夜の行軍)は止まらない
      if (!triggered && !u.routed && u.formation === "column" && !isInfiltrating(u, ctx)) {
        u.route = [];
        u.deployAfterStop = false;
        setFormation(u, "deploying", t);
      }
    }
  };

  for (const u of units) record(u, t0);
  react(t0, detect(t0));

  /** 直接射撃。全員がステップ時点の状態で同時に撃ち、まとめて適用する */
  const fire = (t: number) => {
    // 夜は、活動時間を過ぎたら夜襲も終わる(夜襲以外は夜は撃ち合わない)
    const fireRule = nightFire && !activeAt(t) ? { attackers: new Set<string>() } : nightFire;
    // 伏撃の初撃:隠れた状態から撃ち始めてから一定時間は火力が上がる
    const opening = (a: Unit) => {
      const st = stanceOf(a, ctx.rules);
      if (st.openingFireMultiplier === 1) return 1;
      const since = openingSince.get(a.id);
      if (since === undefined) return a.revealed ? 1 : st.openingFireMultiplier;
      return t - since < st.openingFireMinutes * 60 ? st.openingFireMultiplier : 1;
    };
    // 敵陣に入り込んでいる部隊:このターンに突破し、今も敵の阻止圏(展開済み・潰走していない敵)の中にいる
    const R = ctx.rules.breakthrough.zoneRadiusM;
    const exposed = new Set(
      ctx.rules.breakthrough.penetratorExposed
        ? [...breached.keys()].filter((id) => {
            const u = byId.get(id)!;
            return units.some((e) => e.side !== u.side && e.strength > 0 && !e.routed && e.formation === "deployed" && distanceToFront(frontOf(e, ctx), u.pos) < R);
          })
        : [],
    );
    // 先手の時間:組ごとに、このターンに撃ち始めた時刻を覚えておく
    const sw = ctx.rules.combat.surprise;
    const surpriseOpen = (a: Unit, target: Unit) => {
      const since = firstShotAt.get(`${a.id}>${target.id}`);
      return since === undefined || (sw !== undefined && t - since < sw.durationMinutes * 60);
    };
    const results = computeFire(units, ctx, rng, movedThisStep, fireRule, exposed, opening, moved, surpriseOpen);
    for (const r of results) if (!firstShotAt.has(`${r.attackerId}>${r.targetId}`)) firstShotAt.set(`${r.attackerId}>${r.targetId}`, t - ctx.stepSeconds);
    // 弾薬は、撃ったユニットごとに射程内の目標から消費量を出す(撃つ前の状態で判定)
    const firers = new Set(results.map((r) => r.attackerId));
    // 撃ったユニットは位置が露呈する(伏撃の見つかりにくさが消える)。初撃の時刻を覚えておく
    for (const id of firers) {
      const u = byId.get(id)!;
      firedThisTurn.add(id);
      if (!u.revealed && stanceOf(u, ctx.rules).revealOnFire) openingSince.set(id, t);
      u.revealed = true;
    }
    for (const u of units) {
      if (firers.has(u.id)) consumeAmmo(u, targetsInRange(u, units, ctx, fireRule), movedThisStep.has(u.id), ctx);
    }
    for (const r of results) {
      const target = byId.get(r.targetId)!;
      events.push({ t, unitId: r.attackerId, type: "fired", at: { ...target.pos } });
      shots.push({ t, attackerId: r.attackerId, targetId: r.targetId });
    }
    // 間接射撃(予約済みの砲撃)。着弾範囲内は敵味方を問わない
    // 対砲兵戦:このターンに撃たれた砲兵は、残りの砲撃をやめる
    const firing = ctx.rules.combat.counterBattery?.blockWhenUnderFire ? activeMissions.filter((m) => !hitThisTurn.has(m.unitId)) : activeMissions;
    const indirect = computeIndirectFire(firing, units, byId, ctx, rng, movedThisStep, (t - t0) / 60 - ctx.stepSeconds / 60);
    const artSource = (m: FireMission) => {
      const k = indirect.massing.get(m);
      return { key: `art:${m.unitId}:${m.turn}`, side: m.side, kind: "artillery" as const, target: { ...m.target }, unitId: m.unitId, effect: k ? [{ id: "massed", label: "集中射撃(撃ち始め)", value: k }] : [] };
    };
    for (const m of indirect.fired) noteStrike(artSource(m));
    for (const r of indirect.results) {
      const m = indirect.fired.find((x) => x.unitId === r.attackerId);
      if (m) sourceOf.set(r, artSource(m));
    }
    // 対砲兵戦:砲撃を撃ち始めた砲兵は、ある確率で敵に位置を標定される(兵種つきで敵の地図に残る)
    const cb = ctx.rules.combat.counterBattery;
    for (const m of indirect.fired) {
      if (!cb || batteryOpened.has(m.unitId)) continue;
      batteryOpened.add(m.unitId);
      if (rng.next() >= cb.revealChance) continue;
      const a = byId.get(m.unitId)!;
      for (const side of sidesOf(units)) {
        if (side === a.side) continue;
        recordSighting(intel, side, a, t);
        hqEvents.push({ t, side, type: "batteryLocated", at: { ...a.pos } });
      }
    }
    for (const m of indirect.fired) {
      events.push({ t, unitId: m.unitId, type: "fired", at: { ...m.target } });
      const radiusM = ctx.rules.combat.indirectImpactRadiusM;
      impacts.push({ t, side: m.side, kind: "artillery", x: m.target.x, y: m.target.y, radiusM, seenBy: impactSeenBy(m.side, m.target) });
    }
    // 空襲:時間帯に入っているものだけ
    const stepIndex = Math.round((t - t0) / ctx.stepSeconds) - 1;
    const air = strikes
      .filter((s) => stepIndex >= s.window.from && stepIndex < s.window.to)
      .flatMap((s) => {
        const interdict = s.m.kind === "interdiction";
        if (stepIndex === s.window.from) hqEvents.push({ t, side: s.m.side, type: interdict ? "interdiction" : "airStrike", target: { ...s.m.target } });
        const tg = s.m.target;
        const radiusM = interdict ? ctx.rules.air.interdiction.radiusM : ctx.rules.air.strikeRadiusM;
        impacts.push({ t, side: s.m.side, kind: "air", x: tg.x, y: tg.y, radiusM, seenBy: impactSeenBy(s.m.side, tg) });
        const effect = airEffect(airControlAt(airControl, s.m.side, tg, ctx), ctx) * (flakEffect.get(s.m) ?? 1);
        // 補給線への攻撃は、範囲を行軍している敵の縦隊だけを叩く
        const res = computeAirStrike(s.m, units, ctx, rng, effect, interdict ? { radiusM, only: (u) => u.side !== s.m.side && u.formation === "column" } : {});
        const src = { key: `air:${strikes.indexOf(s)}`, side: s.m.side, kind: s.m.kind as "airStrike" | "interdiction", target: { ...tg }, effect: airEffectFactors(s.m.side, tg, flakEffect.get(s.m) ?? 1) };
        noteStrike(src);
        for (const r of res) sourceOf.set(r, src);
        return res;
      });
    // 艦砲射撃:1ターンかけて着弾する(砲撃と同じ)
    for (const m of activeNaval) {
      if (stepIndex === 0) hqEvents.push({ t, side: m.side, type: "navalGunfire", target: { ...m.target } });
      impacts.push({ t, side: m.side, kind: "artillery", x: m.target.x, y: m.target.y, radiusM: ctx.rules.combat.indirectImpactRadiusM, seenBy: impactSeenBy(m.side, m.target) });
      const res = computeNavalGunfire(m, units, ctx, rng);
      const src = { key: `naval:${activeNaval.indexOf(m)}`, side: m.side, kind: "naval" as const, target: { ...m.target }, effect: [] };
      noteStrike(src);
      for (const r of res) sourceOf.set(r, src);
      air.push(...res);
    }
    // 近接航空支援:飛来している間、支援する味方の近くの、見えている敵を叩く
    for (const c of closeSupport) {
      if (stepIndex < csFrom || stepIndex >= csTo) continue;
      const supported = byId.get(c.unitId);
      if (!supported || supported.strength <= 0) continue;
      if (stepIndex === csFrom) hqEvents.push({ t, side: c.side, type: "closeAirSupport", unitId: c.unitId });
      const seen = (u: Unit) => (intel[c.side]?.entries[u.id]?.currentLevel ?? 0) > 0;
      const res = computeCloseSupport(c.side, supported, units, seen, ctx, rng, airEffect(airControlAt(airControl, c.side, supported.pos, ctx), ctx) * (flakEffect.get(c) ?? 1));
      const src = {
        key: `cas:${closeSupport.indexOf(c)}`,
        side: c.side,
        kind: "closeAirSupport" as const,
        target: { ...supported.pos },
        unitId: c.unitId,
        effect: airEffectFactors(c.side, supported.pos, flakEffect.get(c) ?? 1),
      };
      noteStrike(src);
      for (const r of res) {
        const tg = byId.get(r.targetId)!;
        impacts.push({ t, side: c.side, kind: "air", x: tg.pos.x, y: tg.pos.y, radiusM: 200, seenBy: impactSeenBy(c.side, tg.pos) });
        sourceOf.set(r, src);
      }
      air.push(...res);
    }
    const all = [...results, ...indirect.results, ...air];
    const hits = applyFire(byId, all, ctx);
    tally(all, hits);
    sourceOf.clear();
    for (const [unitId, ch] of hits) {
      events.push({ t, unitId, type: "hit", ...ch });
      // 砲撃の最中に撃たれた砲兵は、残りの砲撃をやめる(知らせは1度だけ)
      if (ctx.rules.combat.counterBattery?.blockWhenUnderFire && !hitThisTurn.has(unitId) && batteryOpened.has(unitId) && activeMissions.some((m) => m.unitId === unitId))
        events.push({ t, unitId, type: "fireHalted" });
      hitThisTurn.add(unitId);
    }
    // 疲労:動いた・撃った(直接射撃・砲撃)・撃たれた分だけたまり、休んでいれば回復する
    updateFatigue(
      units,
      { moved: movedThisStep, fired: new Set([...firers, ...indirect.fired.map((m) => m.unitId)]), hit: new Set(hits.keys()), nightActors: ctx.nightActors },
      ctx,
    );
    // 制圧は、このステップに撃たれなかったユニットだけが回復する
    const recovery = ctx.rules.combat.suppressionRecoveryPerMin * (ctx.stepSeconds / 60);
    for (const u of units) if (!hits.has(u.id)) u.suppression = Math.max(0, u.suppression - recovery);
    // 携行備蓄が切れている間は士気が下がる
    const moraleLoss = ctx.rules.supply.outOfStockMoraleLossPerMin * (ctx.stepSeconds / 60);
    for (const u of units) if (isOutOfStock(u, ctx)) u.morale = Math.max(0, u.morale - moraleLoss);
    for (const e of updateMorale(units, new Set(hits.keys()), intel, ctx, moraleRecovery)) events.push({ t, ...e });
  };

  const steps = ctx.turnSeconds / ctx.stepSeconds;
  for (let s = 0; s < steps; s++) {
    const tEnd = t0 + (s + 1) * ctx.stepSeconds;
    // 遅れて効く命令:遅れの時刻に達したら、その時点の位置から経路を引き直して効かせる
    for (let i = deferredOrders.length - 1; i >= 0; i--) {
      const o = deferredOrders[i]!;
      const u = byId.get(o.unitId);
      if (!u || u.strength <= 0 || u.routed) {
        deferredOrders.splice(i, 1);
        continue;
      }
      if (t0 + s * ctx.stepSeconds >= t0 + orderDelay(u)) {
        applyDeferredOrder(u, o, ctx);
        deferredOrders.splice(i, 1);
      }
    }
    movedThisStep = new Set();
    zones = holdingZones(units, ctx);
    for (const u of units) {
      stepUnit(u, tEnd);
      record(u, tEnd);
    }
    for (const [id, loss] of breachShock) {
      const v = byId.get(id);
      if (v) v.morale = Math.max(0, v.morale - loss);
    }
    breachShock.clear();
    react(tEnd, detect(tEnd));
    photograph(s, tEnd);
    scout(s, tEnd);
    fire(tEnd);
  }

  /**
   * 航空偵察の撮影。範囲内の敵を、地形の隠蔽と姿勢の見つかりにくさに応じた確率で、兵種まで見つける。
   * 見つけた敵は、撮影した時刻の写真として霧の情報に残る
   */
  function photograph(stepIndex: number, t: number) {
    const r = ctx.rules.air.recon;
    for (const f of reconFlights.filter((x) => x.step === stepIndex)) {
      let found = 0;
      for (const e of units) {
        if (e.side === f.m.side || e.strength <= 0 || distance(e.pos, f.m.target) > r.radiusM) continue;
        const st = stanceOf(e, ctx.rules);
        const signature = st.revealOnFire && e.revealed ? 1 : st.signatureMultiplier;
        const chance = r.detectChance * ctx.rules.terrain[ctx.terrain.terrainAt(e.pos)]!.concealment * signature;
        if (rng.next() >= chance) continue;
        recordSighting(intel, f.m.side, e, t);
        found++;
      }
      hqEvents.push({ t, side: f.m.side, type: "airRecon", target: { ...f.m.target }, found });
    }
  }

  /**
   * 斥候。探る範囲の敵を、地形の隠蔽・姿勢の見つかりにくさ・視程に応じた確率で、兵種まで見つける
   * (偵察の兵科・偵察重視の部隊から出せば見つけやすい)。範囲に敵がいれば斥候が見つかることがあり、
   * 出した部隊が小さな損害を受け、敵にその部隊の位置を知られる
   */
  function scout(stepIndex: number, t: number) {
    const pr = ctx.rules.patrol;
    for (const { p } of patrols.filter((x) => x.step === stepIndex)) {
      const src = byId.get(p.unitId);
      if (!src || src.strength <= 0) continue;
      const scoutish =
        ctx.branches.branches[src.branch]!.visionMultiplier > 1 || stanceOf(src, ctx.rules).visionMultiplier > 1 ? pr.reconBonus : 1;
      const vis = Math.min(1, ctx.visibilityMultiplier);
      // 出した部隊を要に、選んだ方向へ広がる扇形の中の敵
      const near = units.filter(
        (e) => e.side !== p.side && e.strength > 0 && distance(src.pos, e.pos) <= pr.maxRangeM && angleBetween(bearing(src.pos, e.pos), p.bearing) <= pr.halfAngleDeg,
      );
      // 何もつかめずに戻ってくることがある(このときは見つけない。見つかる危険は変わらない)
      const failed = rng.next() < pr.failChance;
      let found = 0;
      for (const e of failed ? [] : near) {
        const st = stanceOf(e, ctx.rules);
        const signature = st.revealOnFire && e.revealed ? 1 : st.signatureMultiplier;
        const chance = Math.min(1, pr.detectChance * ctx.rules.terrain[ctx.terrain.terrainAt(e.pos)]!.concealment * signature * scoutish * vis);
        if (rng.next() >= chance) continue;
        recordSighting(intel, p.side, e, t);
        found++;
      }
      let caught = false;
      if (near.length > 0 && rng.next() < pr.caughtChance) {
        caught = true;
        src.strength = Math.max(0, src.strength - pr.caughtStrengthLoss);
        src.morale = Math.max(0, src.morale - pr.caughtMoraleLoss);
        for (const side of [...new Set(near.map((e) => e.side))].sort()) recordSighting(intel, side, src, t);
      }
      hqEvents.push({ t, side: p.side, type: "patrol", unitId: p.unitId, target: { ...p.target }, found, caught, ...(failed ? { failed } : {}) });
    }
  }

  function stepUnit(u: Unit, tEnd: number) {
    const dt = ctx.stepSeconds;
    // 夜は、夜間行動命令を受けたユニット(と潰走中のユニット)だけが動く。活動時間を過ぎたら誰も動かない(経由点は残る)
    const nightIdle = night && !u.routed && !ctx.nightActors!.has(u.id);
    if (!activeAt(tEnd) || nightIdle) {
      // その場での展開は移動ではないので、夜でも始められる
      if (u.formation === "column" && u.deployAfterStop) {
        setFormation(u, "deploying", tEnd - dt);
        u.deployAfterStop = false;
      }
      if (u.formation === "deploying") {
        u.deployProgressSec += dt;
        if (u.deployProgressSec >= (ctx.deploySeconds ?? ctx.turnSeconds)) setFormation(u, "deployed", tEnd);
      }
      return;
    }
    updatePursuit(u);
    // 燃料切れのユニットは動けない(経由点は残り、補給されれば再び動く)
    const fuelLeft = fuelRangeM(u, ctx);
    if (u.route.length > 0 && fuelLeft <= 0 && !outOfFuelReported.has(u.id)) {
      outOfFuelReported.add(u.id);
      events.push({ t: tEnd - dt, unitId: u.id, type: "outOfFuel" });
    }
    // 死守・伏撃の間は動かない(経路は残る。姿勢を変えれば次のターンから動く)
    const wantsMove = u.route.length > 0 && fuelLeft > 0 && !stanceOf(u, ctx.rules).immobile;

    // 止まっている帯を持つユニットが、到着後の向きへまだ回りきっていなければ、その場で旋回する(動いたうちに入る)
    if (!wantsMove && u.route.length === 0 && u.facingOnArrival !== null && wheels(u, ctx) && !stanceOf(u, ctx.rules).immobile) {
      if (Math.abs(turnAngle(u.facing, u.facingOnArrival, u.pos, ctx)) >= 1e-6) {
        // 小さな向きの直しは陣地を失わない
        if (smallTurn(u, u.facingOnArrival)) shifted.add(u.id);
        else markMoved(u, tEnd);
        turnToward(u, u.facingOnArrival, dt);
      }
    }

    if (wantsMove && u.moveMode === "march") {
      // 行軍を始めると自動で縦隊になる(展開中なら展開を放棄)
      setFormation(u, "column", tEnd - dt);
      moveAlongRoute(u, dt, tEnd);
      return;
    }
    if (wantsMove && u.formation === "deployed") {
      moveAlongRoute(u, dt, tEnd);
      return;
    }
    // ここに来るのは「停止中」か「縦隊・展開中のユニットへの戦闘移動」。
    // 戦闘移動は展開した隊形のまま動くので、まずその場で展開する。
    const shouldStartDeploy = u.formation === "column" && (u.deployAfterStop || wantsMove);
    if (shouldStartDeploy) {
      setFormation(u, "deploying", tEnd - dt);
      u.deployAfterStop = false;
    }
    if (u.formation === "deploying") {
      u.deployProgressSec += dt;
      // 展開完了までは1ターン(設計ルール10)
      if (u.deployProgressSec >= (ctx.deploySeconds ?? ctx.turnSeconds)) setFormation(u, "deployed", tEnd);
    }
  }

  /** 追撃をやめる。縦隊なら止まったところで展開する */
  function endPursuit(u: Unit) {
    delete u.pursuing;
    u.route = [];
    if (u.formation === "column") u.deployAfterStop = true;
  }

  /**
   * 追撃:選んだ敵の今の位置(見えていなければ最後に見た位置)を目的地にして、経路を引き直す。
   * 見えている敵が阻止圏を持っていれば、その帯の肉薄の距離(closeAssaultM)手前まで詰めて、敵の方を向く。
   * 最後に見た位置まで来ても見つからない・撃破・投降したら追撃をやめる(潰走している敵は追い続ける)
   */
  function updatePursuit(u: Unit) {
    if (u.pursuing === undefined) return;
    const found = Object.entries(intel[u.side]?.entries ?? {}).find(([, e]) => e.contactId === u.pursuing);
    const target = found ? byId.get(found[0]) : undefined;
    if (!found || found[1].confirmedDestroyed || !target || target.strength <= 0) return endPursuit(u);
    const e = found[1];
    let dest: Vec2;
    let face: Vec2;
    if (e.currentLevel > 0) {
      const near = nearestOnFront(frontOf(target, ctx), u.pos);
      const stop = target.formation === "deployed" && !target.routed ? ctx.rules.breakthrough.closeAssaultM : 0;
      const d = distance(u.pos, near);
      if (d <= stop + PURSUIT_ARRIVED_M) {
        // 取りついた:止まって敵の方を向く(追撃は続け、敵が動けばまた追う)
        u.route = [];
        if (d > 0) u.facingOnArrival = bearing(u.pos, near);
        return;
      }
      dest = lerp(near, u.pos, stop / d);
      face = near;
    } else {
      dest = e.lastSeenPos;
      // 最後に見た位置まで来ても見つからなければ、追撃をやめる
      if (distance(u.pos, dest) <= PURSUIT_ARRIVED_M) return endPursuit(u);
      face = dest;
    }
    const last = pursuitPlanned.get(u.id);
    if (!last || u.route.length === 0 || distance(last, dest) > PURSUIT_REPLAN_M) {
      u.route = planRoute(u.pos, [dest], u.moveMode, ctx, mobilityOf(u, ctx)) ?? [];
      pursuitPlanned.set(u.id, dest);
    }
    if (distance(dest, face) > 1) u.facingOnArrival = bearing(dest, face);
    else if (distance(u.pos, face) > 1) u.facingOnArrival = bearing(u.pos, face);
  }

  /** 動いた(陣地は0に戻る。旋回も動いたうちに入る) */
  function markMoved(u: Unit, tEnd: number) {
    movedThisStep.add(u.id);
    if (!moved.has(u.id)) {
      moved.add(u.id);
      setEntrenchment(u, ctx.rules.entrenchment.minLevel, tEnd - ctx.stepSeconds);
    }
  }

  /**
   * 向きを desired へ変える。帯を持つユニットは、翼の端が展開したままの速さで動くので、
   * 角速度は 速さ ÷ (正面幅 / 2)。timeLeft 秒のうちに回りきれなければ途中まで回る。使った秒数を返す
   */
  function turnToward(u: Unit, desired: number, timeLeft: number): number {
    if (!wheels(u, ctx)) {
      u.facing = normalizeBearing(desired);
      return 0;
    }
    const diff = turnAngle(u.facing, desired, u.pos, ctx);
    if (Math.abs(diff) < 1e-6) return 0;
    // ちょうど反対向き:横に回らず、その場で回れ右をする(どちら回りかを決めようがなく、横隊もそうして向きを変える)
    if (Math.abs(diff) >= 180 - 1e-9) {
      u.facing = normalizeBearing(desired);
      return 0;
    }
    const v = deployedSpeedMps(u, ctx);
    if (v <= 0) return timeLeft;
    const half = frontageOf(u, ctx) / 2;
    const need = ((Math.abs(diff) * Math.PI) / 180) * (half / v);
    if (need <= timeLeft) {
      u.facing = normalizeBearing(desired);
      return need;
    }
    u.facing = normalizeBearing(u.facing + Math.sign(diff) * (((timeLeft * v) / half) * 180) / Math.PI);
    return timeLeft;
  }

  /** 経路の残りの道のり(m) */
  function routeLength(u: Unit): number {
    let len = 0;
    let p: Vec2 = u.pos;
    for (const q of u.route) {
      len += distance(p, q);
      p = q;
    }
    return len;
  }

  /** 小さな向きの直しか(並行移動の向きの範囲内) */
  function smallTurn(u: Unit, desired: number): boolean {
    const maxDeg = ctx.rules.frontage.shiftMaxTurnDeg;
    return maxDeg !== undefined && ctx.rules.frontage.shiftMaxM !== undefined && Math.abs(turnAngle(u.facing, desired, u.pos, ctx)) <= maxDeg;
  }

  /** 並行移動か:帯を持つユニットの、短い道のりで向きが大きく変わらない移動 */
  function isShift(u: Unit): boolean {
    const maxM = ctx.rules.frontage.shiftMaxM;
    return wheels(u, ctx) && maxM !== undefined && routeLength(u) <= maxM && smallTurn(u, u.facingOnArrival ?? u.facing);
  }

  /**
   * 動いている間の向き:進む方向を向く。ただし帯を持つユニットが、到着後の向きから90度より後ろへ下がるときは、
   * 到着後の向きを保ったまま下がる(敵に正面を向けたまま後退する)
   */
  function movingFacing(u: Unit, target: Vec2): number {
    const travel = bearing(u.pos, target);
    if (u.facingOnArrival === null || !wheels(u, ctx)) return travel;
    return Math.abs(turnAngle(u.facingOnArrival, travel, u.pos, ctx)) > 90 ? normalizeBearing(u.facingOnArrival) : travel;
  }

  /** dt 秒だけ経路に沿って進む。区間ごとに速度を出し直す。燃料が尽きればそこで止まる */
  function moveAlongRoute(u: Unit, dt: number, tEnd: number) {
    // 並行移動は向きを保ったままずれる。陣地は失わない(動いたうちに入れない)
    const shift = isShift(u);
    if (shift) {
      movedThisStep.add(u.id);
      shifted.add(u.id);
    } else markMoved(u, tEnd);
    let timeLeft = dt;
    let fuelLeft = fuelRangeM(u, ctx);
    let traveled = 0;
    // 阻止圏の判定は短い区切りごとに行う(すり抜けを見逃さないように)
    const checkStepM = ctx.rules.breakthrough.zoneRadiusM / 10;
    while (timeLeft > 0 && fuelLeft > 0 && u.route.length > 0) {
      const target = u.route[0]!;
      const d = distance(u.pos, target);
      // 帯を持つユニットは、進みながら少しずつ向きを変える(旋回しつつ移動)。並行移動は向きを保つ
      const desired = d > 0 && !shift ? movingFacing(u, target) : null;
      let speed = speedMps(u, target, ctx);
      // 入れない地形に入り込んでいたら動けない(経路探索は避けるので、通常は起きない)
      if (speed <= 0) break;
      const len = Math.min(d, checkStepM);
      const next = len >= d ? { x: target.x, y: target.y } : lerp(u.pos, target, len / d);
      const zone = checkZones(u, u.pos, next, zones, ctx);
      if (zone.blockedBy) {
        // 突破できない:ここで止まる。経路は残すので次のステップ・次のターンに再挑戦する
        if (!blockedReported.has(u.id)) {
          blockedReported.add(u.id);
          events.push({ t: tEnd - timeLeft, unitId: u.id, type: "blocked" });
        }
        // 止められても、その場で向きは変えられる
        if (desired !== null) turnToward(u, desired, timeLeft);
        break;
      }
      for (const z of zone.breaching) {
        const set = breached.get(u.id) ?? new Set<string>();
        if (!set.has(z.id)) {
          set.add(z.id);
          breached.set(u.id, set);
          events.push({ t: tEnd - timeLeft, unitId: u.id, type: "breakthrough" });
          events.push({ t: tEnd - timeLeft, unitId: z.id, type: "breached" });
          // 突破された側は士気が少し下がる(その場では崩れない。崩れるのは後方を断たれた後)。
          // 処理順で結果が変わらないよう、移動がすべて終わってからまとめて適用する
          breachShock.set(z.id, (breachShock.get(z.id) ?? 0) + ctx.rules.breakthrough.breachedMoraleLoss);
        }
      }
      if (zone.approaching) speed *= ctx.rules.breakthrough.zoneSpeedMultiplier * stanceOf(u, ctx.rules).zoneSpeedMultiplier;
      const go = Math.min(len, timeLeft * speed, fuelLeft);
      if (go >= d) {
        u.pos = { x: target.x, y: target.y };
        u.route.shift();
      } else if (d > 0) {
        u.pos = lerp(u.pos, target, go / d);
      }
      traveled += go;
      fuelLeft -= go;
      // 時間か燃料で区切りの途中までしか進めなかったら、このステップはここまで
      // 進んだ時間のぶんだけ回る
      if (desired !== null) turnToward(u, desired, Math.min(timeLeft, go / speed));
      if (go < len) break;
      timeLeft -= go / speed;
    }
    consumeFuel(u, traveled, ctx);
    if (u.route.length === 0) {
      events.push({ t: tEnd, unitId: u.id, type: "arrived" });
      // 到着後の向きへ。帯を持つユニットは残りの時間で旋回し、回りきれなければ次のステップ以降も回り続ける
      if (u.facingOnArrival !== null) turnToward(u, u.facingOnArrival, Math.max(0, timeLeft));
      // 行軍が終わっても縦隊のまま。展開するのは指示があるときだけ
      if (u.formation === "column" && u.deployAfterStop) {
        setFormation(u, "deploying", tEnd);
        u.deployAfterStop = false;
      }
    }
  }

  function conditionMet(
    u: Unit,
    c: Condition,
    enemies: readonly Unit[],
    sideLevels: Record<string, DetectionLevel>,
  ): boolean {
    switch (c.type) {
      case "enemyDetected":
        return enemies.some((e) => (sideLevels[e.id] ?? 0) > 0 && unitDistance(u, e, ctx) <= c.withinM);
      case "strengthBelow":
        return u.strength < c.threshold;
    }
  }

  const tTurnEnd = t0 + ctx.turnSeconds;

  // 夜間行動(浸透移動・夜襲)の士気コスト:成否にかかわらず、夜の終わりに大きく削る(休息で回復した後に差し引く)
  if (night) {
    for (const u of units) {
      if (!ctx.nightActors!.has(u.id) || u.strength <= 0) continue;
      const before = u.morale;
      u.morale = Math.max(0, u.morale - ctx.rules.night.actionMoraleCost);
      events.push({ t: tTurnEnd, unitId: u.id, type: "nightStrain", morale: u.morale - before });
    }
  }

  // 空輸の投下(補給路からの補給より先)
  for (const m of flying.filter((x) => x.kind === "airDrop")) {
    const drop = applyAirDrop(m, units, ctx);
    const ammoT = drop.deliveries.reduce((s, d) => s + d.ammoT, 0);
    const fuelT = drop.deliveries.reduce((s, d) => s + d.fuelT, 0);
    hqEvents.push({ t: tTurnEnd, side: m.side, type: "airDrop", target: { ...m.target }, receiver: drop.receiver, ammoT, fuelT });
    for (const d of drop.deliveries) events.push({ t: tTurnEnd, unitId: d.unitId, type: "resupplied", ammoT: d.ammoT, fuelT: d.fuelT });
  }

  // 補給:集積所の奪取 → 補給路からの補給
  const depots = state.depots.map((d) => ({ ...d }));
  for (const c of captureDepots(depots, units, ctx)) {
    events.push({ t: tTurnEnd, unitId: c.unitId, type: "depotCaptured", depotId: c.depotId });
  }
  const supplyRoutes: Record<string, SupplyRoute> = {};
  for (const d of distributeSupply(units, depots, ctx, interdictions)) {
    if (d.route) supplyRoutes[d.unitId] = d.route;
    const u = byId.get(d.unitId)!;
    if (u.supplied !== d.supplied) events.push({ t: tTurnEnd, unitId: u.id, type: "supplyStatus", supplied: d.supplied });
    u.supplied = d.supplied;
    if (d.ammoT > 0 || d.fuelT > 0) events.push({ t: tTurnEnd, unitId: u.id, type: "resupplied", ammoT: d.ammoT, fuelT: d.fuelT });
  }

  for (const u of units) {
    // 姿勢の切替はターン終了時に完了する
    // (このターンに効いていた姿勢は、効いたターン数を1つ進める。切り替わったら0から数え直す)
    if (u.pendingStance === null) {
      const wasSpent = isStanceSpent(u, ctx.rules);
      u.stanceTurns++;
      if (!wasSpent && isStanceSpent(u, ctx.rules)) {
        events.push({ t: tTurnEnd, unitId: u.id, type: "stanceSpent", stance: u.stance });
        // 息切れしたら標準に戻る姿勢(強襲):その場で既定の姿勢に戻す(もう一度強襲するには、また切り替える)
        if (ctx.rules.stances[u.stance]!.revertWhenSpent && u.stance !== ctx.rules.defaultStance) {
          events.push({ t: tTurnEnd, unitId: u.id, type: "stanceChanged", from: u.stance, to: ctx.rules.defaultStance });
          u.stance = ctx.rules.defaultStance;
          u.stanceTurns = 0;
        }
      }
    } else {
      events.push({ t: tTurnEnd, unitId: u.id, type: "stanceChanged", from: u.stance, to: u.pendingStance });
      u.stance = u.pendingStance;
      u.pendingStance = null;
      u.stanceTurns = 0;
      // 死守・伏撃に入ったら、残りの経路は捨てる(その場に留まる)。潰走中の退却の経路は捨てない
      if (ctx.rules.stances[u.stance]!.immobile && !u.routed) u.route = [];
    }
    // 露呈:このターンに撃たなかったユニットは、また隠れる
    u.revealed = firedThisTurn.has(u.id);
    // 後手からの一撃の判定用:このターンに動いたか
    u.movedLastTurn = moved.has(u.id);
    if (hitThisTurn.has(u.id)) u.underFire = true;
    else delete u.underFire;
    // 陣地:展開済みのまま動かなかったターンだけ、動かずにいた時間が積み上がり、その時間で段が決まる
    // (hoursToLevel がなければ1ターンごとに1段)。上限は切替後の姿勢で判定。動けば0に戻る
    const cap = entrenchmentCap(u, ctx);
    // 並行移動・小さな向きの直しだけなら、陣地はそのまま(このターンは築き進めない)
    const held = u.formation === "deployed" && startedDeployed.get(u.id) === true && !moved.has(u.id) && !shifted.has(u.id);
    const ent = ctx.rules.entrenchment;
    if (held) u.dugInSeconds += ctx.turnSeconds;
    else if (moved.has(u.id) || u.formation !== "deployed") u.dugInSeconds = 0;
    const byTime = ent.hoursToLevel ? ent.minLevel + ent.hoursToLevel.filter((h) => u.dugInSeconds >= h * 3600).length : u.entrenchment + 1;
    // 開始時から築いてあった陣地は、動かない限り保つ
    const next = held ? Math.max(u.entrenchment, byTime) : u.formation === "deployed" ? u.entrenchment : ent.minLevel;
    setEntrenchment(u, Math.min(cap, Math.max(ent.minLevel, next)), tTurnEnd);
  }

  // 見えている敵の「前のターンに動いたか」を、いま記録した値(このターンに動いたか)に更新する
  for (const si of Object.values(intel)) {
    for (const u of units) {
      const e = si.entries[u.id];
      if (e && e.currentLevel >= 2) e.lastSeenMoved = u.movedLastTurn;
    }
  }

  // 包囲:全員の判定をそろえてから適用する(処理順で結果が変わらないように)。
  // 包囲されると士気を失い(包囲が続く間は回復しない)、潰走中に包囲されていれば投降して消滅する。
  // 籠城の限界:潰走していなくても(死守していても)、士気か弾薬が尽きれば投降する
  const enc = ctx.rules.encirclement;
  const endZones = holdingZones(units, ctx);
  const encircled = new Set(units.filter((u) => u.strength > 0 && isEncircled(u, endZones, ctx)).map((u) => u.id));
  // 逃げ場を失った潰走:潰走して下がろうとしたが、敵の阻止圏に阻まれて一歩も動けなかった。
  // 囲みに隙間があっても、退路をふさがれて撃たれ続けているので、包囲と同じく投降までのターンを数える
  for (const u of units) {
    const from = startPos.get(u.id);
    if (u.strength > 0 && u.routed && blockedReported.has(u.id) && from && distance(from, u.pos) < TRAPPED_WITHIN_M) encircled.add(u.id);
    // 孤立して弾も尽きた:補給路から切れ、弾薬も尽きた部隊は、囲まれていなくても戦い続けられない。
    // 包囲と同じく士気を失い、投降までのターンを数える(弾薬が尽きているので、数え終われば投降する)
    if (u.strength > 0 && !u.supplied && u.ammo <= enc.surrenderAmmoBelow) encircled.add(u.id);
  }
  const noSurrender = new Set(ctx.scenario.noSurrender);
  for (const u of units) {
    if (u.strength <= 0) continue;
    if (!encircled.has(u.id) || noSurrender.has(u.side)) {
      // 囲みが途切れても、すぐには数え直さない(1ターン隙間が開いただけで投降が遠のかないように)
      u.encircledTurns = enc.releasePerTurn === undefined ? 0 : Math.max(0, u.encircledTurns - enc.releasePerTurn);
      continue;
    }
    u.encircledTurns++;
    const longEnough = u.encircledTurns >= enc.surrenderAfterTurns;
    if (u.routed && longEnough) {
      u.strength = 0;
      events.push({ t: tTurnEnd, unitId: u.id, type: "surrendered" });
      continue;
    }
    const before = u.morale;
    u.morale = Math.max(0, u.morale - enc.moraleLoss * stanceOf(u, ctx.rules).encirclementMoraleMultiplier);
    events.push({ t: tTurnEnd, unitId: u.id, type: "encircled", morale: u.morale - before });
    if (longEnough && (u.morale <= enc.surrenderMoraleBelow || u.ammo <= enc.surrenderAmmoBelow)) {
      u.strength = 0;
      events.push({ t: tTurnEnd, unitId: u.id, type: "surrendered" });
    }
  }

  // 霧の濃度に応じて、古くなったゴーストを忘れる
  forgetStaleGhosts(intel, tTurnEnd, ctx);

  // 戦力0のユニットを除去する。その瞬間を見ていた陣営には撃破を伝え、見ていなければゴーストのまま
  const destroyed = units.filter((u) => u.strength <= 0);
  // 死守していたユニットを失うと、その陣営の全ユニットの士気が下がる
  for (const u of destroyed.filter((x) => stanceOf(x, ctx.rules).lastStand)) {
    for (const f of units) if (f.side === u.side && f.strength > 0) f.morale = Math.max(0, f.morale - ls.lossMoraleShock);
    hqEvents.push({ t: tTurnEnd, side: u.side, type: "lastStandLost", unitId: u.id, morale: -ls.lossMoraleShock });
  }
  for (const u of destroyed) {
    events.push({ t: tTurnEnd, unitId: u.id, type: "destroyed" });
    for (const si of Object.values(intel)) {
      const e = si.entries[u.id];
      if (!e) continue;
      if (e.currentLevel > 0) e.confirmedDestroyed = true;
      e.currentLevel = 0;
    }
  }
  const survivors = units.filter((u) => u.strength > 0);
  const alive = new Set(survivors.map((u) => u.id));

  // 損耗率の分母:開始時の総戦力(newGameState から始めた試合では、最初に解決するターンの開始時の値)に、到着した増援を足していく
  const forceTotals: Record<string, number> = { ...forceNow(state.units, ctx), ...state.forceTotals };
  for (const u of landedAirborne) forceTotals[u.side] = (forceTotals[u.side] ?? 0) + toeHitPoints(ctx.toes.toes[u.toe]!);
  // 増援:次のターンの始めに到着する部隊を置く
  for (const r of ctx.scenario.reinforcements.filter((x) => x.turn === state.turn + 1)) {
    forceTotals[r.side] = (forceTotals[r.side] ?? 0) + toeHitPoints(ctx.toes.toes[r.toe]!);
    survivors.push(
      createUnit({
        id: r.id,
        side: r.side,
        branch: r.branch ?? ctx.toes.toes[r.toe]!.branch,
        toe: r.toe,
        pos: { x: r.x, y: r.y },
        facing: r.facing,
        stance: r.stance ?? ctx.rules.defaultStance,
        ...(r.training !== undefined ? { training: r.training } : {}),
      }),
    );
    events.push({ t: tTurnEnd, unitId: r.id, type: "reinforced" });
  }
  // 戦場からの離脱:次のターンの始めに去る部隊を除く(損耗ではないので、残っていた戦力を分母からも除く)
  for (const w of ctx.scenario.withdrawals.filter((x) => x.turn === state.turn + 1)) {
    const i = survivors.findIndex((u) => u.id === w.id);
    if (i < 0) continue;
    const u = survivors[i]!;
    forceTotals[u.side] = (forceTotals[u.side] ?? 0) - toeHitPoints(ctx.toes.toes[u.toe]!) * u.strength;
    survivors.splice(i, 1);
    events.push({ t: tTurnEnd, unitId: u.id, type: "withdrawn" });
  }
  survivors.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // 目標の保持と勝敗(規定ターンを終えたときだけ判定)
  const objectives = { ...state.objectives };
  const publicEvents: PublicEvent[] = updateHolders(objectives, survivors, ctx).map((c) => ({
    t: tTurnEnd,
    type: "objectiveCaptured",
    objectiveId: c.id,
    from: c.from,
    to: c.to,
  }));
  const now = forceNow(survivors, ctx);
  const sides = Object.keys(forceTotals);
  const ownLoss = Object.fromEntries(sides.map((s) => [s, ownLossRatio(s, forceTotals, now)]));
  const enemyLoss = Object.fromEntries(Object.keys(ctx.scenario.victory).map((s) => [s, enemyLossRatio(s, forceTotals, now)]));
  const objectiveLog = updateObjectiveLog(state.objectiveLog ?? initialObjectiveLog(state.objectives), objectives, state.turn);
  const result = state.turn >= ctx.scenario.maxTurns ? evaluateVictory(objectives, ctx, enemyLoss, ownLoss, objectiveLog, state.secrets, survivors) : null;

  // 橋:修理の進み → このターンに頼まれた爆破・修理 → 空襲で落ちた橋。どれも次のターンから効く
  const bridges: BridgeStates = structuredClone(state.bridges ?? {});
  const br = ctx.rules.bridges;
  const bridgeList = findBridges(ctx);
  const bridgeOf = (id: string) => bridgeList.find((b) => b.id === id)!;
  for (const b of bridgeList) {
    const st = bridges[b.id];
    if (!st?.repair) continue;
    const { side } = st.repair;
    // 橋のそばに自軍がいて、近くに敵がいないあいだだけ進む
    if (!nearBridge(b, survivors, side, br.workRangeM) || nearBridge(b, survivors, side, br.repairClearM, false)) continue;
    st.repair.progressSec += ctx.turnSeconds;
    if (st.repair.progressSec >= br.repairHours * 3600) {
      bridges[b.id] = { destroyed: false };
      publicEvents.push({ t: tTurnEnd, type: "bridgeRepaired", bridgeId: b.id });
    }
  }
  for (const w of scheduled.bridgeWorks) {
    const b = bridgeOf(w.bridgeId);
    const st = (bridges[b.id] ??= { destroyed: false });
    if (w.kind === "repair") {
      if (!st.destroyed) continue;
      st.repair = { side: w.side, progressSec: 0 };
      hqEvents.push({ t: tTurnEnd, side: w.side, type: "bridgeRepairStarted", bridgeId: b.id });
      continue;
    }
    if (st.destroyed) continue;
    // 頼んだ後に橋のそばの部隊がいなくなれば、試せない
    if (!nearBridge(b, survivors, w.side, br.workRangeM)) {
      hqEvents.push({ t: tTurnEnd, side: w.side, type: "bridgeDemolition", bridgeId: b.id, success: false, reason: "橋のそばに自軍の部隊がいなくなった" });
      continue;
    }
    const success = rng.next() < br.demolitionSuccess;
    hqEvents.push({ t: tTurnEnd, side: w.side, type: "bridgeDemolition", bridgeId: b.id, success });
    if (success) {
      bridges[b.id] = { destroyed: true };
      publicEvents.push({ t: tTurnEnd, type: "bridgeDestroyed", bridgeId: b.id, by: "demolition" });
    }
  }
  for (const m of flying.filter((x) => x.kind === "airStrike")) {
    for (const b of bridgeList) {
      if (bridges[b.id]?.destroyed || distance(b.pos, m.target) > ctx.rules.air.strikeRadiusM) continue;
      if (rng.next() < br.airStrikeChance * (flakEffect.get(m) ?? 1)) {
        bridges[b.id] = { destroyed: true };
        publicEvents.push({ t: tTurnEnd, type: "bridgeDestroyed", bridgeId: b.id, by: "airStrike" });
      }
    }
  }

  // 次のターンの天候
  const weather = { ...state.weather };
  const before = weather.current;
  if (advanceWeather(weather, tTurnEnd, ctx.turnSeconds / 3600, ctx, rng, state.turn + 1)) {
    publicEvents.push({ t: tTurnEnd, type: "weatherChanged", from: before, to: weather.current });
  }

  return {
    state: {
      turn: state.turn + 1,
      time: tTurnEnd,
      units: survivors,
      intel,
      depots,
      fireMissions: [...laterMissions, ...scheduled.missions.filter((m) => m.turn > state.turn)].filter((m) => alive.has(m.unitId)),
      objectives,
      objectiveLog,
      ...(state.secrets ? { secrets: state.secrets } : {}),
      weather,
      airMissions: [...laterAir, ...scheduled.airMissions],
      // 夜が明けたら、1日ごとの回数(航空の出撃・艦砲射撃・斥候)が戻る。航空は補充した後の編隊の数から出撃枠を作る
      airSortiesLeft: night ? dailyAirSorties(replenishAirGroups(airGroups, ctx), ctx) : airSortiesLeft,
      airGroups: night ? replenishAirGroups(airGroups, ctx) : airGroups,
      airControl,
      interdictions: interdictions.filter((x) => x.until > tTurnEnd),
      airborneReady,
      navalMissions: [...laterNaval, ...scheduled.navalMissions],
      navalLeft: night ? initialNavalLeft(ctx) : navalLeft,
      patrolsLeft: night
        ? Object.fromEntries([...new Set([...Object.keys(ctx.scenario.victory), ...Object.keys(patrolsLeft)])].map((side) => [side, ctx.rules.patrol.perDay]))
        : patrolsLeft,
      supplyRoutes: Object.fromEntries(Object.entries(supplyRoutes).filter(([id]) => survivors.some((u) => u.id === id))),
      // 死守の重みはターンごとに抜ける
      forceTotals,
      ownLoss,
      lastStand: Object.fromEntries(Object.entries(lastStand).map(([side, g]) => [side, Math.max(0, g - ls.decayPerTurn)])),
      bridges,
      // このターンの天候が続いた分だけ、地面がぬかるむ・雪が積もる(乾く・解ける)
      ground: advanceGround(state.ground ?? { mud: 0, snow: 0 }, state.weather.current, ctx.turnSeconds / 3600, ctx),
      phase: isNightTurn(ctx.scenario, state.turn + 1) ? "night" : "day",
      rngState: rng.getState(),
    },
    events,
    tracks,
    shots,
    impacts,
    detections,
    rejectedOrders,
    rejectedHqCommands: scheduled.rejected,
    destroyed,
    publicEvents,
    hqEvents,
    engagements: [...engagementTally.values()].map(({ e, byAspect, factors }) => ({
      ...e,
      aspect: (Object.entries(byAspect).sort((p, q) => q[1] - p[1])[0]?.[0] ?? e.aspect) as Aspect,
      situational: [...factors.entries()]
        .map(([id, f]) => ({ id, label: f.label, value: f.sum / f.weight }))
        // 一部の射撃にだけかかった倍率は、組全体ではその割合だけ効いたとみなす(損害で重みをつけた平均。かからなかった射撃は1)
        .map((f) => ({ ...f, value: 1 + (f.value - 1) * (factors.get(f.id)!.weight / (engagementTally.get(`${e.attackerId}>${e.targetId}`)!.weight || 1)) }))
        .filter((f) => Math.abs(f.value - 1) > 0.005),
    })),
    strikes: [...strikeTally.values()].map(({ r, hits }) => ({ ...r, hits: [...hits.entries()].map(([unitId, h]) => ({ unitId, ...h })) })),
    result,
  };
}
