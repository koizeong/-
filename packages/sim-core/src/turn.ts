import { applyFire, computeFire, targetsInRange } from "./combat.js";
import { forgetStaleGhosts } from "./fog-density.js";
import { fatigueSpeedMultiplier, updateFatigue } from "./fatigue.js";
import type { SimContext } from "./context.js";
import type { Depot } from "./depot.js";
import { detectionLevel, isInfiltrating, type DetectionLevel } from "./detection.js";
import { bearing, distance, normalizeBearing, type Vec2 } from "./geometry.js";
import { cloneIntel, updateIntel, type IntelState } from "./intel.js";
import { applyOrderBody, applyOrders, type Condition, type RejectedOrder, type UnitOrder } from "./orders.js";
import { applyAirDrop, computeAirStrike, strikeWindow } from "./air.js";
import {
  computeIndirectFire,
  scheduleHqCommands,
  type AirMission,
  type AirSorties,
  initialAirSorties,
  type FireMission,
  type HqCommand,
  type RejectedHqCommand,
} from "./hq.js";
import { updateMorale } from "./morale.js";
import { terrainSpeed, type RoutePoint } from "./pathfinding.js";
import { captureDepots, distributeSupply } from "./resupply.js";
import { advanceWeather, airAllowed, initialWeather, weatherVisibility, type WeatherState } from "./weather.js";
import { evaluateVictory, initialHolders, isNightTurn, updateHolders, type ObjectiveHolders, type VictoryResult } from "./scenario.js";
import { Rng, type RngState } from "./rng.js";
import { effectiveStance } from "./stance.js";
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
  /** これから解決するターンが昼か夜か(両陣営に公開) */
  phase: "day" | "night";
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
    phase: "day",
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
  /** このユニットが敵の集積所を奪った */
  | { t: number; unitId: string; type: "depotCaptured"; depotId: string }
  /** 補給路のつながりが変わった */
  | { t: number; unitId: string; type: "supplyStatus"; supplied: boolean }
  /** ターン終了時の補給で受け取った量(トン) */
  | { t: number; unitId: string; type: "resupplied"; ammoT: number; fuelT: number }
  | { t: number; unitId: string; type: "routed" }
  | { t: number; unitId: string; type: "rallied" }
  /** 戦力0で除去された(ターン終了時) */
  | { t: number; unitId: string; type: "destroyed" }
  /** 夜間行動の士気コスト(夜の終わり) */
  | { t: number; unitId: string; type: "nightStrain"; morale: number }
  /** 増援として到着した(ターン終了時。次のターンから命令できる) */
  | { t: number; unitId: string; type: "reinforced" };

/** 司令部コマンドの結果。要請した陣営にだけ伝える */
export type HqEvent =
  | { t: number; side: string; type: "airAborted"; kind: AirMission["kind"]; target: Vec2; weather: string }
  | { t: number; side: string; type: "airStrike"; target: Vec2 }
  | { t: number; side: string; type: "airDrop"; target: Vec2; receiver: string | null; ammoT: number; fuelT: number };

/** 陣営に関わる公開イベント(目標の奪取など)。ユニットのイベントとは別に、両陣営へ送る */
export type PublicEvent =
  | { t: number; type: "objectiveCaptured"; objectiveId: string; from: string | null; to: string }
  /** 次のターンの天候が変わった */
  | { t: number; type: "weatherChanged"; from: string; to: string };

export interface TurnResult {
  state: GameState;
  events: TurnEvent[];
  tracks: Record<string, TrackPoint[]>;
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
  s.phase = isNightTurn(ctx.scenario, 1) ? "night" : "day";
  return s;
}

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
  }
  if (ctx.fogDensity !== undefined && !(ctx.fogDensity in rules.fog.levels)) {
    errors.push(`霧の濃度 "${ctx.fogDensity}" がルールパックにありません`);
  }
  for (const w of ctx.scenario.weather.allowed ?? []) {
    if (!(w in rules.weather.types)) errors.push(`シナリオの天候の幅 "${w}" がルールパックにありません`);
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
  const stance = rules.stances[effectiveStance(u, rules)]!;
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
  return (branch.marchSpeedMpm / 60) * modeRatio * ground * infiltration * fatigueSpeedMultiplier(u, ctx);
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
  // 夜間フェイズに行動するのは、このターン(夜)に目的地つきの命令(夜間行動命令)を受けたユニットだけ。
  // 昼から引き継いだ経路や移動モードでは夜は動かない(誤って夜襲に突入しないように)
  if (night) {
    ctx = { ...ctx, nightActors: new Set(acceptedOrders.filter((o) => (o.waypoints?.length ?? 0) > 0).map((o) => o.unitId)) };
  }
  // 司令部コマンドは次のターンに着弾する。今のターンに着弾するのは前のターンまでに予約した分
  const scheduled = scheduleHqCommands(hqCommands, byId, state.turn, ctx, spend, {
    left: state.airSortiesLeft,
    pending: state.airMissions,
  });
  // 夜間フェイズには砲撃しない(要請の時点で弾いているが、念のため)
  const activeMissions = night ? [] : state.fireMissions.filter((m) => m.turn === state.turn);
  const laterMissions = state.fireMissions.filter((m) => m.turn > state.turn);

  // 航空:このターンの天候で飛べなければ中止(出撃回数は使わない)。飛べば出撃回数を使う
  const hqEvents: HqEvent[] = [];
  const airSortiesLeft: AirSorties = structuredClone(state.airSortiesLeft);
  const laterAir = state.airMissions.filter((m) => m.turn > state.turn);
  const flying: AirMission[] = [];
  for (const m of state.airMissions.filter((x) => x.turn === state.turn)) {
    if (night || !airAllowed(state.weather, ctx)) {
      hqEvents.push({ t: state.time, side: m.side, type: "airAborted", kind: m.kind, target: { ...m.target }, weather: state.weather.current });
      continue;
    }
    const left = (airSortiesLeft[m.side] ??= { airStrike: 0, airDrop: 0 });
    left[m.kind]--;
    flying.push(m);
  }
  const intel = cloneIntel(state.intel);
  const rng = Rng.fromState(state.rngState);
  // 夜襲する部隊:夜間フェイズの始めに、戦闘移動で動こうとしている部隊。夜のあいだ夜襲を続ける
  const nightFire = night
    ? { attackers: new Set(units.filter((u) => ctx.nightActors!.has(u.id) && u.moveMode === "combat" && !u.routed).map((u) => u.id)) }
    : undefined;
  // 空襲の時間帯(ミッションごとに乱数を1回)
  const strikes = flying.filter((m) => m.kind === "airStrike").map((m) => ({ m, window: strikeWindow(ctx, m.side, rng) }));

  const events: TurnEvent[] = [];
  const tracks: Record<string, TrackPoint[]> = {};
  const startedDeployed = new Map(units.map((u) => [u.id, u.formation === "deployed"]));
  const moved = new Set<string>();
  let movedThisStep = new Set<string>();
  const outOfFuelReported = new Set<string>();
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
        .filter((e) => distance(u.pos, e.pos) <= ctx.rules.contactRangeM && detectionLevel(u, e, ctx) > 0)
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
    const results = computeFire(units, ctx, rng, movedThisStep, fireRule);
    // 弾薬は、撃ったユニットごとに射程内の目標から消費量を出す(撃つ前の状態で判定)
    const firers = new Set(results.map((r) => r.attackerId));
    for (const u of units) {
      if (firers.has(u.id)) consumeAmmo(u, targetsInRange(u, units, ctx, fireRule), movedThisStep.has(u.id), ctx);
    }
    for (const r of results) {
      const target = byId.get(r.targetId)!;
      events.push({ t, unitId: r.attackerId, type: "fired", at: { ...target.pos } });
    }
    // 間接射撃(予約済みの砲撃)。着弾範囲内は敵味方を問わない
    const indirect = computeIndirectFire(activeMissions, units, byId, ctx, rng, movedThisStep);
    for (const m of indirect.fired) events.push({ t, unitId: m.unitId, type: "fired", at: { ...m.target } });
    // 空襲:時間帯に入っているものだけ
    const stepIndex = Math.round((t - t0) / ctx.stepSeconds) - 1;
    const air = strikes
      .filter((s) => stepIndex >= s.window.from && stepIndex < s.window.to)
      .flatMap((s) => {
        if (stepIndex === s.window.from) hqEvents.push({ t, side: s.m.side, type: "airStrike", target: { ...s.m.target } });
        return computeAirStrike(s.m, units, ctx, rng);
      });
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
    for (const e of updateMorale(units, new Set(hits.keys()), intel, ctx)) events.push({ t, ...e });
  };

  const steps = ctx.turnSeconds / ctx.stepSeconds;
  for (let s = 0; s < steps; s++) {
    const tEnd = t0 + (s + 1) * ctx.stepSeconds;
    movedThisStep = new Set();
    for (const u of units) {
      stepUnit(u, tEnd);
      record(u, tEnd);
    }
    react(tEnd, detect(tEnd));
    fire(tEnd);
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
    const wantsMove = u.route.length > 0 && fuelLeft > 0;

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

  /** dt 秒だけ経路に沿って進む。区間ごとに速度を出し直す。燃料が尽きればそこで止まる */
  function moveAlongRoute(u: Unit, dt: number, tEnd: number) {
    movedThisStep.add(u.id);
    if (!moved.has(u.id)) {
      moved.add(u.id);
      setEntrenchment(u, ctx.rules.entrenchment.minLevel, tEnd - ctx.stepSeconds);
    }
    let timeLeft = dt;
    let fuelLeft = fuelRangeM(u, ctx);
    let traveled = 0;
    while (timeLeft > 0 && fuelLeft > 0 && u.route.length > 0) {
      const target = u.route[0]!;
      const d = distance(u.pos, target);
      if (d > 0) u.facing = bearing(u.pos, target);
      const speed = speedMps(u, target, ctx);
      // 入れない地形に入り込んでいたら動けない(経路探索は避けるので、通常は起きない)
      if (speed <= 0) break;
      const reach = Math.min(timeLeft * speed, fuelLeft);
      if (d <= reach) {
        u.pos = { x: target.x, y: target.y };
        u.route.shift();
        timeLeft -= d / speed;
        fuelLeft -= d;
        traveled += d;
      } else {
        const k = reach / d;
        u.pos = { x: u.pos.x + (target.x - u.pos.x) * k, y: u.pos.y + (target.y - u.pos.y) * k };
        traveled += reach;
        timeLeft = 0;
      }
    }
    consumeFuel(u, traveled, ctx);
    if (u.route.length === 0) {
      events.push({ t: tEnd, unitId: u.id, type: "arrived" });
      if (u.facingOnArrival !== null) u.facing = normalizeBearing(u.facingOnArrival);
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
        return enemies.some((e) => (sideLevels[e.id] ?? 0) > 0 && distance(u.pos, e.pos) <= c.withinM);
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
  for (const d of distributeSupply(units, depots, ctx)) {
    const u = byId.get(d.unitId)!;
    if (u.supplied !== d.supplied) events.push({ t: tTurnEnd, unitId: u.id, type: "supplyStatus", supplied: d.supplied });
    u.supplied = d.supplied;
    if (d.ammoT > 0 || d.fuelT > 0) events.push({ t: tTurnEnd, unitId: u.id, type: "resupplied", ammoT: d.ammoT, fuelT: d.fuelT });
  }

  for (const u of units) {
    // 姿勢の切替はターン終了時に完了する
    if (u.pendingStance !== null) {
      events.push({ t: tTurnEnd, unitId: u.id, type: "stanceChanged", from: u.stance, to: u.pendingStance });
      u.stance = u.pendingStance;
      u.pendingStance = null;
    }
    // 陣地:展開済みのまま動かなかったターンだけ1段上がる。上限は切替後の姿勢で判定
    const cap = entrenchmentCap(u, ctx);
    const held = u.formation === "deployed" && startedDeployed.get(u.id) === true && !moved.has(u.id);
    const next = held ? u.entrenchment + 1 : u.formation === "deployed" ? u.entrenchment : ctx.rules.entrenchment.minLevel;
    setEntrenchment(u, Math.min(cap, Math.max(ctx.rules.entrenchment.minLevel, next)), tTurnEnd);
  }

  // 霧の濃度に応じて、古くなったゴーストを忘れる
  forgetStaleGhosts(intel, tTurnEnd, ctx);

  // 戦力0のユニットを除去する。その瞬間を見ていた陣営には撃破を伝え、見ていなければゴーストのまま
  const destroyed = units.filter((u) => u.strength <= 0);
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

  // 増援:次のターンの始めに到着する部隊を置く
  for (const r of ctx.scenario.reinforcements.filter((x) => x.turn === state.turn + 1)) {
    survivors.push(
      createUnit({ id: r.id, side: r.side, branch: r.branch ?? ctx.toes.toes[r.toe]!.branch, toe: r.toe, pos: { x: r.x, y: r.y }, facing: r.facing, stance: r.stance ?? ctx.rules.defaultStance }),
    );
    events.push({ t: tTurnEnd, unitId: r.id, type: "reinforced" });
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
  const result = state.turn >= ctx.scenario.maxTurns ? evaluateVictory(objectives, ctx) : null;

  // 次のターンの天候
  const weather = { ...state.weather };
  const before = weather.current;
  if (advanceWeather(weather, tTurnEnd, ctx.turnSeconds / 3600, ctx, rng)) {
    publicEvents.push({ t: tTurnEnd, type: "weatherChanged", from: before, to: weather.current });
  }

  return {
    state: {
      turn: state.turn + 1,
      time: tTurnEnd,
      units: survivors,
      intel,
      depots,
      fireMissions: [...laterMissions, ...scheduled.missions].filter((m) => alive.has(m.unitId)),
      objectives,
      weather,
      airMissions: [...laterAir, ...scheduled.airMissions],
      airSortiesLeft,
      phase: isNightTurn(ctx.scenario, state.turn + 1) ? "night" : "day",
      rngState: rng.getState(),
    },
    events,
    tracks,
    detections,
    rejectedOrders,
    rejectedHqCommands: scheduled.rejected,
    destroyed,
    publicEvents,
    hqEvents,
    result,
  };
}
