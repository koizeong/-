import { applyFire, computeFire, targetsInRange } from "./combat.js";
import type { SimContext } from "./context.js";
import type { Depot } from "./depot.js";
import { detectionLevel, type DetectionLevel } from "./detection.js";
import { bearing, distance, normalizeBearing, type Vec2 } from "./geometry.js";
import { cloneIntel, updateIntel, type IntelState } from "./intel.js";
import { applyOrderBody, applyOrders, type Condition, type RejectedOrder, type UnitOrder } from "./orders.js";
import { computeIndirectFire, scheduleHqCommands, type FireMission, type HqCommand, type RejectedHqCommand } from "./hq.js";
import { updateMorale } from "./morale.js";
import type { RoutePoint } from "./pathfinding.js";
import { captureDepots, distributeSupply } from "./resupply.js";
import { evaluateVictory, initialHolders, updateHolders, type ObjectiveHolders, type VictoryResult } from "./scenario.js";
import { Rng, type RngState } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { consumeAmmo, consumeFuel, fuelRangeM, isOutOfStock } from "./supply.js";
import { cloneUnit, type Unit } from "./unit.js";

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
  rngState: RngState;
}

export function newGameState(
  units: readonly Unit[],
  seed: number,
  depots: readonly Depot[] = [],
  objectives: ObjectiveHolders = {},
): GameState {
  return {
    objectives: { ...objectives },
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
  | { t: number; unitId: string; type: "destroyed" };

/** 陣営に関わる公開イベント(目標の奪取など)。ユニットのイベントとは別に、両陣営へ送る */
export type PublicEvent = { t: number; type: "objectiveCaptured"; objectiveId: string; from: string | null; to: string };

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
  /** 規定ターンを終えたら勝敗。それまでは null(途中で決着はつけない) */
  result: VictoryResult | null;
}

/** シナリオの開始状態を作る(目標の保持はシナリオの初期値) */
export function startScenario(units: readonly Unit[], seed: number, ctx: SimContext, depots: readonly Depot[] = []): GameState {
  return newGameState(units, seed, depots, initialHolders(ctx.scenario));
}

export function isGameOver(state: GameState, ctx: SimContext): boolean {
  return state.turn > ctx.scenario.maxTurns;
}

/** シナリオのデータ同士の参照が切れていないかを調べる */
export function validateContext(ctx: SimContext, units: readonly Unit[], depots: readonly Depot[] = []): string[] {
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
      : ctx.rules.terrain[ctx.terrain.terrainAt(u.pos)]!.speedMultiplier;
  return (branch.marchSpeedMpm / 60) * modeRatio * ground;
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
  const contextErrors = validateContext(ctx, state.units, state.depots);
  if (contextErrors.length) throw new Error(`シナリオデータが不正です:\n${contextErrors.join("\n")}`);
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
  const rejectedOrders = applyOrders(byId, orders, ctx, spend);
  // 司令部コマンドは次のターンに着弾する。今のターンに着弾するのは前のターンまでに予約した分
  const scheduled = scheduleHqCommands(hqCommands, byId, state.turn, ctx, spend);
  const activeMissions = state.fireMissions.filter((m) => m.turn === state.turn);
  const laterMissions = state.fireMissions.filter((m) => m.turn > state.turn);
  const intel = cloneIntel(state.intel);
  const rng = Rng.fromState(state.rngState);

  const events: TurnEvent[] = [];
  const tracks: Record<string, TrackPoint[]> = {};
  const startedDeployed = new Map(units.map((u) => [u.id, u.formation === "deployed"]));
  const moved = new Set<string>();
  let movedThisStep = new Set<string>();
  const outOfFuelReported = new Set<string>();
  const t0 = state.time;

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
      if (u.conditional && !u.routed && conditionMet(u, u.conditional.when, enemies, sideLevels)) {
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
      if (!triggered && !u.routed && u.formation === "column") {
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
    const results = computeFire(units, ctx, rng, movedThisStep);
    // 弾薬は、撃ったユニットごとに射程内の目標から消費量を出す(撃つ前の状態で判定)
    const firers = new Set(results.map((r) => r.attackerId));
    for (const u of units) {
      if (firers.has(u.id)) consumeAmmo(u, targetsInRange(u, units, ctx), movedThisStep.has(u.id), ctx);
    }
    for (const r of results) {
      const target = byId.get(r.targetId)!;
      events.push({ t, unitId: r.attackerId, type: "fired", at: { ...target.pos } });
    }
    // 間接射撃(予約済みの砲撃)。着弾範囲内は敵味方を問わない
    const indirect = computeIndirectFire(activeMissions, units, byId, ctx, rng, movedThisStep);
    for (const m of indirect.fired) events.push({ t, unitId: m.unitId, type: "fired", at: { ...m.target } });
    const hits = applyFire(byId, [...results, ...indirect.results], ctx);
    for (const [unitId, ch] of hits) events.push({ t, unitId, type: "hit", ...ch });
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
      if (u.deployProgressSec >= ctx.turnSeconds) setFormation(u, "deployed", tEnd);
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

  return {
    state: {
      turn: state.turn + 1,
      time: tTurnEnd,
      units: survivors,
      intel,
      depots,
      fireMissions: [...laterMissions, ...scheduled.missions].filter((m) => alive.has(m.unitId)),
      objectives,
      rngState: rng.getState(),
    },
    events,
    tracks,
    detections,
    rejectedOrders,
    rejectedHqCommands: scheduled.rejected,
    destroyed,
    publicEvents,
    result,
  };
}
