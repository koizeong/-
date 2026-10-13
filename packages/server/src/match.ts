import { decide, DEFAULT_AI, type AiConfig } from "@brigade/ai";
import type { ScenarioInfo, TurnOutcome } from "@brigade/protocol";
import {
  isGameOver,
  replayForSide,
  resolveTurn,
  toeIndirectMaxRange,
  viewForSide,
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

  view(): SideView {
    return viewForSide(this.state, this.humanSide);
  }

  /** 両陣営に公開してよい静的な情報 */
  info(): ScenarioInfo {
    const { def, ctx } = this.scenario;
    const rules = ctx.rules;
    const air = ctx.scenario.air[this.humanSide];
    const artilleryRanges: Record<string, number> = {};
    for (const u of this.state.units.filter((x) => x.side === this.humanSide)) {
      const r = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
      if (r > 0) artilleryRanges[u.id] = r;
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
      terrainNames: Object.fromEntries(Object.entries(rules.terrain).map(([id, t]) => [id, t.name])),
      stances: Object.entries(rules.stances).map(([id, s]) => ({ id, name: s.name })),
      defaultStance: rules.defaultStance,
      branchNames: Object.fromEntries(Object.entries(ctx.branches.branches).map(([id, b]) => [id, b.name])),
      toeNames: Object.fromEntries(Object.entries(ctx.toes.toes).map(([id, t]) => [id, t.name])),
      fogDensity: ctx.fogDensity ?? rules.fog.default,
      commandPoints: ctx.scenario.commandPoints[this.humanSide] ?? null,
      maxTurns: ctx.scenario.maxTurns,
      night: ctx.scenario.night,
      turnSeconds: ctx.turnSeconds,
      startHour: def.time.startHour ?? 0,
      weatherNames: Object.fromEntries(Object.entries(rules.weather.types).map(([id, w]) => [id, w.name])),
      air: { strike: !!air?.strike, airlift: !!air?.airlift },
      ranges: {
        indirectImpactRadiusM: rules.combat.indirectImpactRadiusM,
        strikeRadiusM: rules.air.strikeRadiusM,
        dropRadiusM: rules.air.dropRadiusM,
      },
      artilleryRanges,
    };
  }

  /**
   * 人間の命令を受け取り、AIの命令と合わせて1ターンを解決する。
   * 人間が出せるのは自陣営のユニットへの命令と、自陣営の司令部コマンドだけ(ほかは弾く)。
   */
  submit(turn: number, orders: readonly UnitOrder[], hqCommands: readonly HqCommand[]): TurnOutcome {
    if (this.over) throw new Error("試合は終わっています");
    if (turn !== this.state.turn) throw new Error(`今は ${this.state.turn} ターン目です(${turn} ターン目の命令は受け付けません)`);

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
