import { enemyLossRatio, forceNow, ownLossRatio } from "./attrition.js";
import { toeHitPoints } from "./toe.js";
import { checkZones, holdingZones, type HoldingZone } from "./breakthrough.js";
import { isEncircled } from "./encirclement.js";
import { applyFire, computeFire, targetsInRange } from "./combat.js";
import { forgetStaleGhosts } from "./fog-density.js";
import { fatigueSpeedMultiplier, updateFatigue } from "./fatigue.js";
import type { SimContext } from "./context.js";
import type { Depot } from "./depot.js";
import { detectionLevel, isInfiltrating, type DetectionLevel } from "./detection.js";
import { distanceToFront, frontageOf, frontOf, unitDistance } from "./frontage.js";
import { bearing, distance, normalizeBearing, type Vec2 } from "./geometry.js";
import { cloneIntel, recordSighting, updateIntel, type IntelState } from "./intel.js";
import { applyOrderBody, applyOrders, type Condition, type RejectedOrder, type UnitOrder } from "./orders.js";
import { airEffect, applyAirDrop, computeAirStrike, computeCloseSupport, interceptChance, strikeWindow, updateAirControl } from "./air.js";
import {
  computeIndirectFire,
  scheduleHqCommands,
  type AirMission,
  type AirSorties,
  computeNavalGunfire,
  initialAirborneReady,
  initialNavalLeft,
  type NavalMission,
  initialAirControl,
  type AirborneReady,
  initialAirSorties,
  type FireMission,
  type HqCommand,
  type RejectedHqCommand,
} from "./hq.js";
import { updateMorale } from "./morale.js";
import { terrainSpeed, type RoutePoint } from "./pathfinding.js";
import { captureDepots, currentSupplyRoutes, distributeSupply, type SupplyRoute } from "./resupply.js";
import { advanceWeather, airAllowed, initialWeather, weatherVisibility, type WeatherState } from "./weather.js";
import { evaluateVictory, initialHolders, isNightTurn, updateHolders, type ObjectiveHolders, type VictoryResult } from "./scenario.js";
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
  /** これから解決するターンの天候(両陣営に公開) */
  weather: WeatherState;
  /** 予約済みの空襲・空輸 */
  airMissions: AirMission[];
  /** 陣営ごとの、その日の残りの出撃回数 */
  airSortiesLeft: AirSorties;
  /** 陣営ごとの制空権の割合(航空戦力を持つ陣営どうしで合計1。両陣営に公開) */
  airControl: Record<string, number>;
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
    weather: { ...weather },
    airMissions: [],
    airSortiesLeft: {},
    airControl: {},
    airborneReady: {},
    navalMissions: [],
    navalLeft: {},
    patrolsLeft: {},
    supplyRoutes: {},
    phase: "day",
    lastStand: {},
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
  /** 制空任務の結果、自陣営の制空権の割合が control になった */
  | { t: number; side: string; type: "airSuperiority"; control: number }
  /** 航空任務が迎撃されて失敗した */
  | { t: number; side: string; type: "airIntercepted"; kind: AirMission["kind"] | "closeAirSupport"; target: Vec2 }
  /** 斥候が戻った(found は見つけた敵の数、caught は斥候が見つかったか) */
  | { t: number; side: string; type: "patrol"; unitId: string; target: Vec2; found: number; caught: boolean }
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
  | { t: number; side: string; type: "airDrop"; target: Vec2; receiver: string | null; ammoT: number; fuelT: number };

/** 陣営に関わる公開イベント(目標の奪取など)。ユニットのイベントとは別に、両陣営へ送る */
export type PublicEvent =
  | { t: number; type: "objectiveCaptured"; objectiveId: string; from: string | null; to: string }
  /** 次のターンの天候が変わった */
  | { t: number; type: "weatherChanged"; from: string; to: string };

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
  /** 規定ターンを終えたら勝敗。それまでは null(途中で決着はつけない) */
  result: VictoryResult | null;
}

/** シナリオの開始状態を作る(目標の保持はシナリオの初期値) */
export function startScenario(units: readonly Unit[], seed: number, ctx: SimContext, depots: readonly Depot[] = []): GameState {
  const s = newGameState(units, seed, depots, initialHolders(ctx.scenario), initialWeather(ctx));
  s.airSortiesLeft = initialAirSorties(ctx);
  s.airControl = initialAirControl(ctx);
  s.airborneReady = initialAirborneReady(ctx);
  s.navalLeft = initialNavalLeft(ctx);
  s.patrolsLeft = Object.fromEntries(Object.keys(ctx.scenario.victory).map((side) => [side, ctx.rules.patrol.perDay]));
  s.forceTotals = forceNow(s.units, ctx);
  s.supplyRoutes = currentSupplyRoutes(s.units, s.depots, ctx);
  s.phase = isNightTurn(ctx.scenario, 1) ? "night" : "day";
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

/**
 * 移動速度(m/秒)。行軍で道路の区間を進むときは道路の倍率、それ以外は今いるセルの地形の倍率。
 */
function speedMps(u: Unit, toward: RoutePoint, ctx: SimContext): number {
  const branch = ctx.branches.branches[u.branch]!;
  const modeRatio = u.moveMode === "combat" ? ctx.rules.combatMoveSpeedRatio : 1;
  const ground =
    toward.onRoad && u.moveMode === "march"
      ? ctx.rules.roadSpeedMultiplier
      : terrainSpeed(ctx.terrain.terrainAt(u.pos), mobilityOf(u, ctx), ctx);
  const infiltration = ctx.phase === "night" && u.moveMode === "march" ? ctx.rules.night.infiltration.speedMultiplier : 1;
  // 潰走中は統制を失い、足が鈍る
  const routed = u.routed ? ctx.rules.morale.routedSpeedMultiplier : 1;
  return (branch.marchSpeedMpm / 60) * modeRatio * ground * infiltration * routed * fatigueSpeedMultiplier(u, ctx);
}

/** 展開したまま動く速さ(m/秒)。帯の旋回で、翼の端が動く速さに使う */
function deployedSpeedMps(u: Unit, ctx: SimContext): number {
  const branch = ctx.branches.branches[u.branch]!;
  const ground = terrainSpeed(ctx.terrain.terrainAt(u.pos), mobilityOf(u, ctx), ctx);
  return (branch.marchSpeedMpm / 60) * ctx.rules.combatMoveSpeedRatio * ground * fatigueSpeedMultiplier(u, ctx);
}

/**
 * 帯(正面幅)を持つユニットか。展開済みで潰走していないユニットは、向きを変えるのに旋回の時間がかかる
 * (縦隊・展開中・潰走中は点として扱い、向きはすぐ変わる)
 */
function wheels(u: Unit, ctx: SimContext): boolean {
  return u.formation === "deployed" && !u.routed && frontageOf(u, ctx) > 0;
}

/**
 * 向き from から desired へ回る角度(度、時計回りが正。-180〜180)。ちょうど反対向きのときは、
 * マップの中央より西にいれば時計回り、東なら反時計回り(左右を入れ替えた状況で鏡写しに回るように)
 */
function turnAngle(from: number, desired: number, pos: Vec2, ctx: SimContext): number {
  const d = normalizeBearing(desired - from);
  if (Math.abs(d - 180) < 1e-9) return pos.x < ctx.terrain.widthM / 2 ? 180 : -180;
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
    visibilityMultiplier: ctx.visibilityMultiplier * weatherVisibility(state.weather, ctx) * (night ? ctx.rules.night.visibilityMultiplier : 1),
    phase: night ? "night" : "day",
    deploySeconds: ctx.turnSeconds,
    ...(night ? { turnSeconds: ctx.scenario.night!.hours * 3600, stepSeconds: ctx.rules.night.stepSeconds } : {}),
  };
  if (isGameOver(state, ctx)) throw new Error(`規定ターン(${ctx.scenario.maxTurns})を過ぎています`);

  // 処理順で結果が変わらないよう、ID順に固定する
  const units = state.units.map(cloneUnit).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  const rejectedOrders = applyOrders(byId, orders, ctx, spend, acceptedOrders);
  // 死守の重み:死守への切替を命じた分だけたまる。このターンの士気の回復は、たまった後の重みで遅くなる
  const lastStand: Record<string, number> = { ...state.lastStand };
  for (const o of acceptedOrders) {
    const u = byId.get(o.unitId)!;
    if (o.stance !== undefined && u.pendingStance === o.stance && ctx.rules.stances[o.stance]!.lastStand) {
      lastStand[u.side] = (lastStand[u.side] ?? 0) + ctx.rules.lastStand.gaugePerOrder;
    }
  }
  const ls = ctx.rules.lastStand;
  const moraleRecovery = (side: string) => Math.max(ls.moraleRecoveryFloor, 1 - (lastStand[side] ?? 0) * ls.moraleRecoveryPenaltyPerPoint);
  // 夜間フェイズに行動するのは、このターン(夜)に目的地つきの命令(夜間行動命令)を受けたユニットだけ。
  // 昼から引き継いだ経路や移動モードでは夜は動かない(誤って夜襲に突入しないように)
  if (night) {
    ctx = { ...ctx, nightActors: new Set(acceptedOrders.filter((o) => (o.waypoints?.length ?? 0) > 0).map((o) => o.unitId)) };
  }
  // 司令部コマンドは次のターンに着弾する。今のターンに着弾するのは前のターンまでに予約した分
  const scheduled = scheduleHqCommands(hqCommands, byId, state.turn, ctx, spend, {
    left: state.airSortiesLeft,
    pending: state.airMissions,
    airborneReady: state.airborneReady,
  }, { left: state.navalLeft, pending: state.navalMissions }, state.patrolsLeft, (side, target) =>
    Object.values(state.intel[side]?.entries ?? {}).some(
      (e) => e.currentLevel > 0 && !e.confirmedDestroyed && distance(e.lastSeenPos, target) <= ctx.rules.combat.indirectImpactRadiusM,
    ));
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

  // 航空:このターンの天候で飛べなければ中止(出撃回数は使わない)。飛べば出撃回数を使う
  const hqEvents: HqEvent[] = [];
  const airSortiesLeft: AirSorties = structuredClone(state.airSortiesLeft);
  const laterAir = state.airMissions.filter((m) => m.turn > state.turn);
  const flyable = !night && airAllowed(state.weather, ctx);
  const rng = Rng.fromState(state.rngState);
  const sortiesOf = (side: string) => (airSortiesLeft[side] ??= { airStrike: 0, airDrop: 0, airSuperiority: 0, airRecon: 0 });
  const due = state.airMissions.filter((x) => x.turn === state.turn);
  // 1) 制空任務:出した分だけ、制空権の割合が自陣営へ動く(このターンの空襲・空輸より先に効く)
  let airControl: Record<string, number> = Object.keys(state.airControl).length ? { ...state.airControl } : initialAirControl(ctx);
  const fighterSorties: Record<string, number> = {};
  for (const m of due.filter((x) => x.kind === "airSuperiority")) {
    if (!flyable) {
      hqEvents.push({ t: state.time, side: m.side, type: "airAborted", kind: m.kind, target: { ...m.target }, weather: state.weather.current });
      continue;
    }
    sortiesOf(m.side).airSuperiority--;
    fighterSorties[m.side] = (fighterSorties[m.side] ?? 0) + 1;
  }
  if (Object.keys(fighterSorties).length) {
    airControl = updateAirControl(airControl, fighterSorties, ctx);
    for (const side of Object.keys(fighterSorties).sort()) hqEvents.push({ t: state.time, side, type: "airSuperiority", control: airControl[side] ?? 0 });
  }
  // 迎撃:制空権の割合が低いほど、航空任務が迎撃されて失敗する(出撃回数は使う)。迎撃の可能性がなければ乱数を引かない
  const intercepted = (side: string) => {
    const p = interceptChance(airControl[side] ?? 0, ctx);
    return p > 0 && rng.next() < p;
  };
  // 2) 空襲・空輸
  const flying: AirMission[] = [];
  for (const m of due.filter((x): x is AirMission & { kind: "airStrike" | "airDrop" } => x.kind === "airStrike" || x.kind === "airDrop")) {
    if (!flyable) {
      hqEvents.push({ t: state.time, side: m.side, type: "airAborted", kind: m.kind, target: { ...m.target }, weather: state.weather.current });
      continue;
    }
    sortiesOf(m.side)[m.kind]--;
    if (intercepted(m.side)) {
      hqEvents.push({ t: state.time, side: m.side, type: "airIntercepted", kind: m.kind, target: { ...m.target } });
      continue;
    }
    flying.push(m);
  }
  // 3) 航空偵察:ターン中のどこかの時刻に撮影する(時刻はミッションごとに乱数を1回)
  const reconSteps = ctx.turnSeconds / ctx.stepSeconds;
  const reconFlights: { m: AirMission; step: number }[] = [];
  for (const m of due.filter((x) => x.kind === "airRecon")) {
    if (!flyable) {
      hqEvents.push({ t: state.time, side: m.side, type: "airAborted", kind: m.kind, target: { ...m.target }, weather: state.weather.current });
      continue;
    }
    sortiesOf(m.side).airRecon--;
    if (intercepted(m.side)) {
      hqEvents.push({ t: state.time, side: m.side, type: "airIntercepted", kind: m.kind, target: { ...m.target } });
      continue;
    }
    reconFlights.push({ m, step: Math.floor(rng.next() * reconSteps) });
  }

  const patrolsLeft = { ...state.patrolsLeft };
  for (const p of scheduled.patrols) patrolsLeft[p.side] = (patrolsLeft[p.side] ?? ctx.rules.patrol.perDay) - 1;
  // 斥候:探る地点までの距離に応じて、そのターンのうちに遅れて結果が出る
  const patrols = scheduled.patrols.map((p) => {
    const d = distance(byId.get(p.unitId)!.pos, p.target);
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
  for (const m of due.filter((x) => x.kind === "airborneDrop")) {
    if (!flyable) {
      hqEvents.push({ t: state.time, side: m.side, type: "airAborted", kind: m.kind, target: { ...m.target }, weather: state.weather.current });
      (airborneReady[m.side] ??= []).push(m.unitId!);
      continue;
    }
    const def = ctx.scenario.airborne.find((a) => a.id === m.unitId)!;
    const wasIntercepted = intercepted(m.side);
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
  const closeSupport: { side: string; unitId: string }[] = [];
  for (const c of scheduled.closeSupport) {
    const at = byId.get(c.unitId)!.pos;
    if (!flyable) {
      hqEvents.push({ t: state.time, side: c.side, type: "airAborted", kind: "closeAirSupport", target: { ...at }, weather: state.weather.current });
      continue;
    }
    sortiesOf(c.side).airStrike--;
    if (intercepted(c.side)) {
      hqEvents.push({ t: state.time, side: c.side, type: "airIntercepted", kind: "closeAirSupport", target: { ...at } });
      continue;
    }
    closeSupport.push(c);
  }
  const intel = cloneIntel(state.intel);
  // 夜襲する部隊:夜間フェイズの始めに、戦闘移動で動こうとしている部隊。夜のあいだ夜襲を続ける
  const nightFire = night
    ? { attackers: new Set(units.filter((u) => ctx.nightActors!.has(u.id) && u.moveMode === "combat" && !u.routed).map((u) => u.id)) }
    : undefined;
  // 空襲の時間帯(ミッションごとに乱数を1回)
  const strikes = flying.filter((m) => m.kind === "airStrike").map((m) => ({ m, window: strikeWindow(ctx, m.side, rng) }));

  const events: TurnEvent[] = [];
  const tracks: Record<string, TrackPoint[]> = {};
  const shots: Shot[] = [];
  const impacts: Impact[] = [];
  /** 着弾が見えた陣営:要請した陣営と、基本視程以内に部隊がいた陣営 */
  const impactSeenBy = (side: string, at: Vec2) => {
    const sides = new Set([side]);
    for (const u of units) if (u.strength > 0 && distance(u.pos, at) <= ctx.rules.detection.baseRangeM) sides.add(u.side);
    return [...sides].sort();
  };
  const startedDeployed = new Map(units.map((u) => [u.id, u.formation === "deployed"]));
  const moved = new Set<string>();
  let movedThisStep = new Set<string>();
  const outOfFuelReported = new Set<string>();
  /** このターンに撃ったユニット(撃たずにターンを終えたユニットは、露呈が解ける) */
  const firedThisTurn = new Set<string>();
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
    const results = computeFire(units, ctx, rng, movedThisStep, fireRule, exposed, opening, moved);
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
    const indirect = computeIndirectFire(activeMissions, units, byId, ctx, rng, movedThisStep, (t - t0) / 60 - ctx.stepSeconds / 60);
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
        if (stepIndex === s.window.from) hqEvents.push({ t, side: s.m.side, type: "airStrike", target: { ...s.m.target } });
        const tg = s.m.target;
        impacts.push({ t, side: s.m.side, kind: "air", x: tg.x, y: tg.y, radiusM: ctx.rules.air.strikeRadiusM, seenBy: impactSeenBy(s.m.side, tg) });
        return computeAirStrike(s.m, units, ctx, rng, airEffect(airControl[s.m.side] ?? 0, ctx));
      });
    // 艦砲射撃:1ターンかけて着弾する(砲撃と同じ)
    for (const m of activeNaval) {
      if (stepIndex === 0) hqEvents.push({ t, side: m.side, type: "navalGunfire", target: { ...m.target } });
      impacts.push({ t, side: m.side, kind: "artillery", x: m.target.x, y: m.target.y, radiusM: ctx.rules.combat.indirectImpactRadiusM, seenBy: impactSeenBy(m.side, m.target) });
      air.push(...computeNavalGunfire(m, units, ctx, rng));
    }
    // 近接航空支援:飛来している間、支援する味方の近くの、見えている敵を叩く
    for (const c of closeSupport) {
      if (stepIndex < csFrom || stepIndex >= csTo) continue;
      const supported = byId.get(c.unitId);
      if (!supported || supported.strength <= 0) continue;
      if (stepIndex === csFrom) hqEvents.push({ t, side: c.side, type: "closeAirSupport", unitId: c.unitId });
      const seen = (u: Unit) => (intel[c.side]?.entries[u.id]?.currentLevel ?? 0) > 0;
      const res = computeCloseSupport(c.side, supported, units, seen, ctx, rng, airEffect(airControl[c.side] ?? 0, ctx));
      for (const r of res) {
        const tg = byId.get(r.targetId)!;
        impacts.push({ t, side: c.side, kind: "air", x: tg.pos.x, y: tg.pos.y, radiusM: 200, seenBy: impactSeenBy(c.side, tg.pos) });
      }
      air.push(...res);
    }
    const hits = applyFire(byId, [...results, ...indirect.results, ...air], ctx);
    for (const [unitId, ch] of hits) events.push({ t, unitId, type: "hit", ...ch });
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
      const near = units.filter((e) => e.side !== p.side && e.strength > 0 && distance(e.pos, p.target) <= pr.radiusM);
      let found = 0;
      for (const e of near) {
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
      hqEvents.push({ t, side: p.side, type: "patrol", unitId: p.unitId, target: { ...p.target }, found, caught });
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
        markMoved(u, tEnd);
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
    markMoved(u, tEnd);
    let timeLeft = dt;
    let fuelLeft = fuelRangeM(u, ctx);
    let traveled = 0;
    // 阻止圏の判定は短い区切りごとに行う(すり抜けを見逃さないように)
    const checkStepM = ctx.rules.breakthrough.zoneRadiusM / 10;
    while (timeLeft > 0 && fuelLeft > 0 && u.route.length > 0) {
      const target = u.route[0]!;
      const d = distance(u.pos, target);
      // 帯を持つユニットは、まず向きを変えてから進む(回りきれなければ、このステップは旋回だけ)
      if (d > 0) timeLeft -= turnToward(u, movingFacing(u, target), timeLeft);
      if (timeLeft <= 0) break;
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
      if (zone.approaching) speed *= ctx.rules.breakthrough.zoneSpeedMultiplier;
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
  for (const d of distributeSupply(units, depots, ctx)) {
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
    // 陣地:展開済みのまま動かなかったターンだけ、動かずにいた時間が積み上がり、その時間で段が決まる
    // (hoursToLevel がなければ1ターンごとに1段)。上限は切替後の姿勢で判定。動けば0に戻る
    const cap = entrenchmentCap(u, ctx);
    const held = u.formation === "deployed" && startedDeployed.get(u.id) === true && !moved.has(u.id);
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
  for (const u of units) {
    if (u.strength <= 0) continue;
    if (!encircled.has(u.id)) {
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
    u.morale = Math.max(0, u.morale - enc.moraleLoss);
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
  const result = state.turn >= ctx.scenario.maxTurns ? evaluateVictory(objectives, ctx, enemyLoss, ownLoss) : null;

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
      weather,
      airMissions: [...laterAir, ...scheduled.airMissions],
      // 夜が明けたら、1日ごとの回数(航空の出撃・艦砲射撃・斥候)が戻る
      airSortiesLeft: night ? initialAirSorties(ctx) : airSortiesLeft,
      airControl,
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
    result,
  };
}
