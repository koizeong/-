import type { SimContext } from "./context.js";
import type { DetectionLevel } from "./detection.js";
import { bearing, distance, normalizeBearing, type Vec2 } from "./geometry.js";
import { cloneIntel, updateIntel, type IntelState } from "./intel.js";
import { applyOrders, type RejectedOrder, type UnitOrder } from "./orders.js";
import { Rng, type RngState } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { cloneUnit, type Unit } from "./unit.js";

export interface GameState {
  turn: number;
  /** シナリオ開始からの経過時間(秒) */
  time: number;
  units: Unit[];
  /** 陣営ごとの敵情報 */
  intel: IntelState;
  rngState: RngState;
}

export function newGameState(units: readonly Unit[], seed: number): GameState {
  return { turn: 1, time: 0, units: units.map(cloneUnit), intel: {}, rngState: Rng.fromSeed(seed).getState() };
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
  | { t: number; unitId: string; type: "entrenchmentChanged"; from: number; to: number };

export interface TurnResult {
  state: GameState;
  events: TurnEvent[];
  tracks: Record<string, TrackPoint[]>;
  /** [陣営][敵ユニットID] → 小ステップごとの探知段階(tracks と同じ長さ)。霧のフィルタに使う */
  detections: Record<string, Record<string, DetectionLevel[]>>;
  rejectedOrders: RejectedOrder[];
}

/** シナリオのデータ同士の参照が切れていないかを調べる */
export function validateContext(ctx: SimContext, units: readonly Unit[]): string[] {
  const errors: string[] = [];
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

/** 移動速度(m/秒)。地形は今いるセルで判定する */
function speedMps(u: Unit, ctx: SimContext): number {
  const branch = ctx.branches.branches[u.branch]!;
  const terrain = ctx.rules.terrain[ctx.terrain.terrainAt(u.pos)]!;
  const modeRatio = u.moveMode === "combat" ? ctx.rules.combatMoveSpeedRatio : 1;
  return (branch.marchSpeedMpm / 60) * modeRatio * terrain.speedMultiplier;
}

/**
 * 1ターンを解決する。入力の state は変更しない。
 * 現段階では移動・隊形・陣地・姿勢のみ(戦闘・霧・補給は未実装)。
 */
export function resolveTurn(state: GameState, orders: readonly UnitOrder[], ctx: SimContext): TurnResult {
  const contextErrors = validateContext(ctx, state.units);
  if (contextErrors.length) throw new Error(`シナリオデータが不正です:\n${contextErrors.join("\n")}`);

  // 処理順で結果が変わらないよう、ID順に固定する
  const units = state.units.map(cloneUnit).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(units.map((u) => [u.id, u]));
  const rejectedOrders = applyOrders(byId, orders, ctx.rules);
  const intel = cloneIntel(state.intel);
  const rng = Rng.fromState(state.rngState);

  const events: TurnEvent[] = [];
  const tracks: Record<string, TrackPoint[]> = {};
  const startedDeployed = new Map(units.map((u) => [u.id, u.formation === "deployed"]));
  const moved = new Set<string>();
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
  };

  for (const u of units) record(u, t0);
  detect(t0);

  const steps = ctx.turnSeconds / ctx.stepSeconds;
  for (let s = 0; s < steps; s++) {
    const tEnd = t0 + (s + 1) * ctx.stepSeconds;
    for (const u of units) {
      stepUnit(u, tEnd);
      record(u, tEnd);
    }
    detect(tEnd);
  }

  function stepUnit(u: Unit, tEnd: number) {
    const dt = ctx.stepSeconds;
    const wantsMove = u.route.length > 0;

    if (wantsMove && u.moveMode === "march") {
      // 行軍を始めると自動で縦隊になる(展開中なら展開を放棄)
      setFormation(u, "column", tEnd - dt);
      moveAlongRoute(u, speedMps(u, ctx) * dt, tEnd);
      return;
    }
    if (wantsMove && u.formation === "deployed") {
      moveAlongRoute(u, speedMps(u, ctx) * dt, tEnd);
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

  function moveAlongRoute(u: Unit, budget: number, tEnd: number) {
    if (!moved.has(u.id)) {
      moved.add(u.id);
      setEntrenchment(u, ctx.rules.entrenchment.minLevel, tEnd - ctx.stepSeconds);
    }
    let left = budget;
    while (left > 0 && u.route.length > 0) {
      const target: Vec2 = u.route[0]!;
      const d = distance(u.pos, target);
      if (d > 0) u.facing = bearing(u.pos, target);
      if (d <= left) {
        u.pos = { ...target };
        u.route.shift();
        left -= d;
      } else {
        const k = left / d;
        u.pos = { x: u.pos.x + (target.x - u.pos.x) * k, y: u.pos.y + (target.y - u.pos.y) * k };
        left = 0;
      }
    }
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

  const tTurnEnd = t0 + ctx.turnSeconds;
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

  return {
    state: { turn: state.turn + 1, time: tTurnEnd, units, intel, rngState: rng.getState() },
    events,
    tracks,
    detections,
    rejectedOrders,
  };
}
