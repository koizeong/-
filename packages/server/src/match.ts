import { decide, DEFAULT_AI, type AiConfig } from "@brigade/ai";
import type { GameRecord, ModifiersByUnit, MovePreview, ScenarioInfo, ScenarioSummary, TurnOutcome } from "@brigade/protocol";
import {
  airSectorGrid,
  isGameOver,
  isNightTurn,
  previewMove,
  replayForSide,
  resolveTurn,
  toeDirectMaxRange,
  toeIndirectMaxRange,
  unitModifiers,
  viewForSide,
  zoneWarnings,
  type GameState,
  type HqCommand,
  type LoadedScenario,
  type RejectedHqCommand,
  type RejectedOrder,
  type SideView,
  type UnitOrder,
} from "@brigade/sim-core";

/**
 * 人間1人 対 AI の試合。サーバー権威:人間の命令とAIの命令を集めて sim-core で同時に解決し、
 * 人間には自陣営のビューと再生データだけを返す。WebSocket から切り離した純粋なクラス。
 */
export class Match {
  private state: GameState;
  readonly aiSides: string[];
  /** 解決したターンごとの人間の命令(セーブデータ) */
  private readonly turns: GameRecord["turns"] = [];

  constructor(
    private readonly scenario: LoadedScenario,
    readonly humanSide: string,
    private readonly seed: number,
    private readonly ai: AiConfig = DEFAULT_AI,
  ) {
    const sides = scenario.def.sides.map((s) => s.id);
    if (!sides.includes(humanSide)) throw new Error(`陣営 "${humanSide}" はこのシナリオにありません`);
    this.aiSides = sides.filter((s) => s !== humanSide);
    this.state = scenario.start(seed);
  }

  get turn(): number {
    return this.state.turn;
  }

  get over(): boolean {
    return isGameOver(this.state, this.scenario.ctx);
  }

  /** 試合の記録(セーブデータ) */
  record(): GameRecord {
    return { version: 1, scenarioId: this.scenario.def.id, side: this.humanSide, seed: this.seed, scenarioHash: this.scenario.hash, turns: structuredClone(this.turns) };
  }

  /**
   * 記録から試合を作り直す(続きから)。記録の命令でターンを解決し直すので、データが同じなら保存したときと同じ状態になる。
   * 最後に解決したターンの結果も返す
   */
  static resume(scenario: LoadedScenario, record: GameRecord, ai: AiConfig = DEFAULT_AI): { match: Match; last: TurnOutcome | null; sameData: boolean } {
    if (record.scenarioId !== scenario.def.id) throw new Error(`記録のシナリオ(${record.scenarioId})が違います`);
    const match = new Match(scenario, record.side, record.seed, ai);
    let last: TurnOutcome | null = null;
    for (const t of record.turns) {
      if (match.over) break;
      last = match.submit(match.turn, t.orders, t.hqCommands);
    }
    return { match, last, sameData: record.scenarioHash === scenario.hash };
  }

  view(): SideView {
    return viewForSide(this.state, this.humanSide);
  }

  /**
   * 移動の命令の下書きから経路を見積もる(人間の陣営のユニットだけ)。阻止圏は、人間の陣営が知っている敵だけから示す(霧)
   */
  preview(unitId: string, waypoints: readonly { x: number; y: number }[], moveMode?: "march" | "combat"): MovePreview | null {
    const u = this.state.units.find((x) => x.id === unitId && x.side === this.humanSide && x.strength > 0);
    if (!u) return null;
    const p = previewMove(u, { waypoints, ...(moveMode ? { moveMode } : {}) }, this.state.turn, this.scenario.ctx);
    return { ...p, zones: zoneWarnings(p, viewForSide(this.state, this.humanSide).contacts, this.scenario.ctx) };
  }

  /** 人間の陣営のユニットにいま効いている補正(自軍のことなので霧はかからない) */
  modifiers(): ModifiersByUnit {
    return Object.fromEntries(this.state.units.filter((u) => u.side === this.humanSide).map((u) => [u.id, unitModifiers(u, this.scenario.ctx)]));
  }

  /** 両陣営に公開してよい静的な情報 */
  info(): ScenarioInfo {
    const { def, ctx } = this.scenario;
    const rules = ctx.rules;
    const air = ctx.scenario.air[this.humanSide];
    const artilleryRanges: Record<string, number> = {};
    const directRanges: Record<string, number> = {};
    for (const u of this.state.units.filter((x) => x.side === this.humanSide)) {
      const r = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
      if (r > 0) artilleryRanges[u.id] = r;
      const dr = toeDirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
      if (dr > 0) directRanges[u.id] = dr;
    }
    return {
      id: def.id,
      name: def.name,
      ...(def.description !== undefined ? { description: def.description } : {}),
      mySide: this.humanSide,
      sides: def.sides,
      map: def.map,
      roads: def.roads,
      objectives: ctx.scenario.objectives,
      victory: ctx.scenario.victory,
      terrainNames: Object.fromEntries(Object.entries(rules.terrain).map(([id, t]) => [id, t.name])),
      stances: Object.entries(rules.stances).map(([id, s]) => ({
        id,
        name: s.name,
        lastStand: s.lastStand,
        immobile: s.immobile,
        ...(s.effectTurns !== undefined ? { effectTurns: s.effectTurns } : {}),
      })),
      defaultStance: rules.defaultStance,
      branchNames: Object.fromEntries(Object.entries(ctx.branches.branches).map(([id, b]) => [id, b.name])),
      toeNames: Object.fromEntries(Object.entries(ctx.toes.toes).map(([id, t]) => [id, t.name])),
      fogDensity: ctx.fogDensity ?? rules.fog.default,
      commandPoints: ctx.scenario.commandPoints[this.humanSide] ?? null,
      maxTurns: ctx.scenario.maxTurns,
      night: ctx.scenario.night,
      turnSeconds: ctx.turnSeconds,
      startHour: def.time.startHour ?? 0,
      ...(def.time.startDate ? { startDate: def.time.startDate } : {}),
      weatherNames: Object.fromEntries(Object.entries(rules.weather.types).map(([id, w]) => [id, w.name])),
      air: { strike: !!air?.strike, airlift: !!air?.airlift, fighters: !!air?.fighters },
      airSectors: airSectorGrid(ctx),
      naval: ctx.scenario.naval[this.humanSide] ? { rangeFromSeaM: ctx.scenario.naval[this.humanSide]!.gunfire.rangeFromSeaM } : null,
      ranges: {
        indirectImpactRadiusM: rules.combat.indirectImpactRadiusM,
        strikeRadiusM: rules.air.strikeRadiusM,
        dropRadiusM: rules.air.dropRadiusM,
        zoneRadiusM: rules.breakthrough.zoneRadiusM,
        closeSupportRadiusM: rules.air.closeSupport.radiusM,
        airborneScatterM: rules.air.airborne.scatterM,
        airReconRadiusM: rules.air.recon.radiusM,
        patrolRangeM: rules.patrol.maxRangeM,
        patrolHalfAngleDeg: rules.patrol.halfAngleDeg,
        interdictionRadiusM: rules.air.interdiction.radiusM,
      },
      frontage: {
        byToe: Object.fromEntries(Object.entries(ctx.toes.toes).map(([id, t]) => [id, t.frontageM])),
        reducedBelowStrength: rules.frontage.reducedBelowStrength,
        reducedMultiplier: rules.frontage.reducedMultiplier,
      },
      patrolsPerDay: rules.patrol.perDay,
      artilleryRanges,
      directRanges,
      shakenBelow: rules.morale.shakenBelow,
      airborne: ctx.scenario.airborne
        .filter((a) => a.side === this.humanSide)
        .map((a) => ({ id: a.id, toeName: ctx.toes.toes[a.toe]!.name, availableFromTurn: a.availableFromTurn })),
      lastStand: {
        gaugePerOrder: rules.lastStand.gaugePerOrder,
        moraleRecoveryPenaltyPerPoint: rules.lastStand.moraleRecoveryPenaltyPerPoint,
        moraleRecoveryFloor: rules.lastStand.moraleRecoveryFloor,
        decayPerTurn: rules.lastStand.decayPerTurn,
      },
    };
  }

  /**
   * 人間の命令を受け取り、AIの命令と合わせて1ターンを解決する。
   * 人間が出せるのは自陣営のユニットへの命令と、自陣営の司令部コマンドだけ(ほかは弾く)。
   */
  submit(turn: number, orders: readonly UnitOrder[], hqCommands: readonly HqCommand[]): TurnOutcome {
    if (this.over) throw new Error("試合は終わっています");
    if (turn !== this.state.turn) throw new Error(`今は ${this.state.turn} ターン目です(${turn} ターン目の命令は受け付けません)`);
    this.turns.push({ orders: structuredClone([...orders]), hqCommands: structuredClone([...hqCommands]) });

    const own = new Set(this.state.units.filter((u) => u.side === this.humanSide).map((u) => u.id));
    const forbiddenOrders: RejectedOrder[] = [];
    const humanOrders = orders.filter((o) => {
      if (own.has(o.unitId)) return true;
      forbiddenOrders.push({ unitId: o.unitId, reason: "自陣営のユニットではありません" });
      return false;
    });
    const forbiddenHq: RejectedHqCommand[] = [];
    const humanHq = hqCommands.filter((c) => {
      if (c.side === this.humanSide) return true;
      forbiddenHq.push({ command: c, reason: "自陣営の司令部コマンドではありません" });
      return false;
    });

    const aiDecisions = this.aiSides.map((side) => decide(viewForSide(this.state, side), this.scenario.ctx, this.ai, this.seed));
    const r = resolveTurn(
      this.state,
      [...humanOrders, ...aiDecisions.flatMap((d) => d.orders)],
      this.scenario.ctx,
      [...humanHq, ...aiDecisions.flatMap((d) => d.hqCommands)],
    );
    this.state = r.state;
    // 人間に返すのは、人間の命令・司令部コマンドへの結果だけ(AIの命令の結果は見せない)
    return {
      turn,
      replay: replayForSide(r, this.humanSide),
      rejectedOrders: [...forbiddenOrders, ...r.rejectedOrders.filter((x) => own.has(x.unitId))],
      rejectedHqCommands: [...forbiddenHq, ...r.rejectedHqCommands.filter((x) => x.command.side === this.humanSide)],
      result: r.result,
    };
  }
}

/** 開始画面に出すシナリオの概要 */
export function scenarioSummary(scenario: LoadedScenario): ScenarioSummary {
  const { def, ctx } = scenario;
  let nights = 0;
  for (let t = 1; t <= ctx.scenario.maxTurns; t++) if (isNightTurn(ctx.scenario, t)) nights++;
  return {
    id: def.id,
    name: def.name,
    ...(def.description ? { description: def.description } : {}),
    sides: def.sides.map((s) => ({ id: s.id, name: s.name, units: scenario.units.filter((u) => u.side === s.id).length })),
    maxTurns: ctx.scenario.maxTurns,
    days: nights + 1,
    ...(def.time.startDate ? { startDate: def.time.startDate } : {}),
    objectives: ctx.scenario.objectives.map((o) => ({ id: o.id, name: o.name })),
    victory: ctx.scenario.victory as ScenarioSummary["victory"],
    hash: scenario.hash,
  };
}
