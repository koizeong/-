import { decide, DEFAULT_AI, type AiConfig } from "@brigade/ai";
import type { AttachmentInfo, CustomStart, DevelopmentInfo, GameRecord, ModifiersByUnit, MovePreview, ScenarioDetail, ScenarioInfo, ScenarioSummary, TurnOutcome, UnitSymbols } from "@brigade/protocol";
import {
  airSectorGrid,
  autoCompose,
  buildScenario,
  presetScenario,
  customizeScenario,
  customizeScenarioSides,
  customizableUnits,
  findBridges,
  stateContext,
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
  type PackSet,
  type SideCustomization,
  type ParseResult,
  type RejectedHqCommand,
  type RejectedOrder,
  type SideView,
  type SideVictory,
  type UnitOrder,
  ownVictory,
  publicVictory,
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
    /** 始め方(編成の選択・装備編成・AIの陣営のおまかせ編成)。scenario はすでにそれを当てたもの。記録に残す */
    private readonly how: StartOptions = {},
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
    return {
      version: 1,
      scenarioId: this.scenario.def.id,
      side: this.humanSide,
      seed: this.seed,
      scenarioHash: this.scenario.hash,
      turns: structuredClone(this.turns),
      ...(this.how.preset ? { preset: this.how.preset } : {}),
      ...(this.how.custom ? { custom: structuredClone(this.how.custom) } : {}),
      ...(this.how.aiAuto ? { aiAuto: this.how.aiAuto } : {}),
    };
  }

  /**
   * 記録から試合を作り直す(続きから)。記録の命令でターンを解決し直すので、データが同じなら保存したときと同じ状態になる。
   * 最後に解決したターンの結果も返す。装備編成の記録なら、scenario は記録の差し替えで読み込んだもの(startScenario)を渡す
   */
  static resume(scenario: LoadedScenario, record: GameRecord, ai: AiConfig = DEFAULT_AI): { match: Match; last: TurnOutcome | null; sameData: boolean } {
    if (record.scenarioId !== scenario.def.id) throw new Error(`記録のシナリオ(${record.scenarioId})が違います`);
    const match = new Match(scenario, record.side, record.seed, ai, startOptionsOf(record));
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

  /** 霧のかかっていない今の状態(サーバーの中だけで使う。キャンペーンで、戦闘の結果を持ち越すのに) */
  fullState(): GameState {
    return this.state;
  }

  /**
   * 移動の命令の下書きから経路を見積もる(人間の陣営のユニットだけ)。阻止圏は、人間の陣営が知っている敵だけから示す(霧)
   */
  preview(unitId: string, waypoints: readonly { x: number; y: number }[], moveMode?: "march" | "combat"): MovePreview | null {
    return sidePreview(this.scenario, this.state, this.humanSide, unitId, waypoints, moveMode);
  }

  /** 人間の陣営のユニットにいま効いている補正(自軍のことなので霧はかからない) */
  modifiers(): ModifiersByUnit {
    return sideModifiers(this.scenario, this.state, this.humanSide);
  }

  /** 両陣営に公開してよい静的な情報 */
  info(): ScenarioInfo {
    return sideInfo(this.scenario, this.state, this.humanSide);
  }
  /**
   * 人間の命令を受け取り、AIの命令と合わせて1ターンを解決する。
   * 人間が出せるのは自陣営のユニットへの命令と、自陣営の司令部コマンドだけ(ほかは弾く)。
   */
  submit(turn: number, orders: readonly UnitOrder[], hqCommands: readonly HqCommand[]): TurnOutcome {
    if (this.over) throw new Error("試合は終わっています");
    if (turn !== this.state.turn) throw new Error(`今は ${this.state.turn} ターン目です(${turn} ターン目の命令は受け付けません)`);
    this.turns.push({
      orders: structuredClone([...orders]),
      hqCommands: structuredClone([...hqCommands]),
    });

    const own = new Set(this.state.units.filter((u) => u.side === this.humanSide).map((u) => u.id));
    const forbiddenOrders: RejectedOrder[] = [];
    const humanOrders = orders.filter((o) => {
      if (own.has(o.unitId)) return true;
      forbiddenOrders.push({
        unitId: o.unitId,
        reason: "自陣営のユニットではありません",
      });
      return false;
    });
    const forbiddenHq: RejectedHqCommand[] = [];
    const humanHq = hqCommands.filter((c) => {
      if (c.side === this.humanSide) return true;
      forbiddenHq.push({
        command: c,
        reason: "自陣営の司令部コマンドではありません",
      });
      return false;
    });

    const aiDecisions = this.aiSides.map((side) => decide(viewForSide(this.state, side), this.scenario.ctx, this.ai, this.seed));
    const r = resolveTurn(this.state, [...humanOrders, ...aiDecisions.flatMap((d) => d.orders)], this.scenario.ctx, [...humanHq, ...aiDecisions.flatMap((d) => d.hqCommands)]);
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

/** ある陣営の補正(自軍のことなので霧はかからない) */
export function sideModifiers(scenario: LoadedScenario, state: GameState, side: string): ModifiersByUnit {
  return Object.fromEntries(state.units.filter((u) => u.side === side).map((u) => [u.id, unitModifiers(u, scenario.ctx)]));
}

/**
 * 移動の命令の下書きから経路を見積もる(その陣営のユニットだけ)。阻止圏は、その陣営が知っている敵だけから示す(霧)
 */
export function sidePreview(
  scenario: LoadedScenario,
  state: GameState,
  side: string,
  unitId: string,
  waypoints: readonly { x: number; y: number }[],
  moveMode?: "march" | "combat",
): MovePreview | null {
  const u = state.units.find((x) => x.id === unitId && x.side === side && x.strength > 0);
  if (!u) return null;
  // 壊れた橋は通れない(実際の解決と同じ道路網で見積もる)
  const ctx = stateContext(scenario.ctx, state);
  const p = previewMove(u, { waypoints, ...(moveMode ? { moveMode } : {}) }, state.turn, ctx);
  return {
    ...p,
    zones: zoneWarnings(p, viewForSide(state, side).contacts, ctx),
  };
}

/** 試合の静的な情報(ある陣営から見たもの。射程などはその陣営の部隊だけ) */
export function sideInfo(scenario: LoadedScenario, state: GameState, side: string): ScenarioInfo {
  const { def, ctx } = scenario;
  const rules = ctx.rules;
  const air = ctx.scenario.air[side];
  const artilleryRanges: Record<string, number> = {};
  const directRanges: Record<string, number> = {};
  // 盤上の部隊に加えて、後から来る増援と、マップの外で待つ空挺部隊も(降りた・着いた後に砲撃の要請や射程の表示に使う)
  const toeOf = new Map<string, string>();
  for (const r of [...ctx.scenario.reinforcements, ...ctx.scenario.airborne]) if (r.side === side) toeOf.set(r.id, r.toe);
  for (const u of state.units) if (u.side === side) toeOf.set(u.id, u.toe);
  for (const [id, toe] of toeOf) {
    const u = { id, toe };
    const r = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
    if (r > 0) artilleryRanges[u.id] = r;
    const dr = toeDirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
    if (dr > 0) directRanges[u.id] = dr;
  }
  return {
    id: def.id,
    name: def.name,
    ...(def.description !== undefined ? { description: def.description } : {}),
    mySide: side,
    sides: def.sides,
    ...(def.historicalOutcome ? { historicalOutcome: def.historicalOutcome } : {}),
    map: def.map,
    roads: def.roads,
    objectives: ctx.scenario.objectives,
    victory: Object.fromEntries(Object.entries(ctx.scenario.victory).map(([s, v]) => [s, hideEnemyUnits(s === side ? ownVictory(v, state.secrets?.[s]) : publicVictory(v), sideUnitIds(scenario, side))])),
    terrainNames: Object.fromEntries(Object.entries(rules.terrain).map(([id, t]) => [id, t.name])),
    stances: Object.entries(rules.stances).map(([id, s]) => ({
      id,
      name: s.name,
      lastStand: s.lastStand,
      immobile: s.immobile,
      ...(s.effectTurns !== undefined ? { effectTurns: s.effectTurns } : {}),
      ...(s.branches ? { branches: s.branches } : {}),
      shape: s.shape,
      frontageMultiplier: s.frontageMultiplier,
    })),
    defaultStance: rules.defaultStance,
    branchNames: Object.fromEntries(Object.entries(ctx.branches.branches).map(([id, b]) => [id, b.name])),
    toeNames: Object.fromEntries(Object.entries(ctx.toes.toes).map(([id, t]) => [id, t.name])),
    attachments: attachmentsOf(ctx, toeOf.values()),
    unitNames: Object.fromEntries(
      [...def.units, ...def.rules.reinforcements, ...def.rules.airborne].filter((u) => u.side === side && u.name).map((u) => [u.id, u.name!]),
    ),
    symbols: unitSymbols(ctx),
    darkTurns: ctx.scenario.darkTurns,
    fogDensity: ctx.fogDensity ?? rules.fog.default,
    fogDensityName: rules.fog.levels[ctx.fogDensity ?? rules.fog.default]?.name ?? ctx.fogDensity ?? rules.fog.default,
    commandPoints: ctx.scenario.commandPoints[side] ?? null,
    maxTurns: ctx.scenario.maxTurns,
    night: ctx.scenario.night,
    turnSeconds: ctx.turnSeconds,
    startHour: def.time.startHour ?? 0,
    ...(def.time.startDate ? { startDate: def.time.startDate } : {}),
    weatherNames: Object.fromEntries(Object.entries(rules.weather.types).map(([id, w]) => [id, w.name])),
    air: {
      strike: !!air?.strike,
      airlift: !!air?.airlift,
      fighters: !!air?.fighters,
    },
    airSectors: airSectorGrid(ctx),
    naval: ctx.scenario.naval[side] ? { rangeFromSeaM: ctx.scenario.naval[side]!.gunfire.rangeFromSeaM } : null,
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
    fireBlockedUnderFire: rules.combat.counterBattery?.blockWhenUnderFire ?? false,
    directRanges,
    shakenBelow: rules.morale.shakenBelow,
    bridges: findBridges(ctx).map((b) => ({
      id: b.id,
      x: b.pos.x,
      y: b.pos.y,
    })),
    bridgeRules: {
      workRangeM: rules.bridges.workRangeM,
      repairHours: rules.bridges.repairHours,
      repairClearM: rules.bridges.repairClearM,
      demolitionSuccess: rules.bridges.demolitionSuccess,
    },
    airborne: ctx.scenario.airborne
      .filter((a) => a.side === side)
      .map((a) => ({
        id: a.id,
        toeName: ctx.toes.toes[a.toe]!.name,
        availableFromTurn: a.availableFromTurn,
      })),
    lastStand: {
      gaugePerOrder: rules.lastStand.gaugePerOrder,
      moraleRecoveryPenaltyPerPoint: rules.lastStand.moraleRecoveryPenaltyPerPoint,
      moraleRecoveryFloor: rules.lastStand.moraleRecoveryFloor,
      decayPerTurn: rules.lastStand.decayPerTurn,
    },
  };
}

/** 試合の始め方(編成の選択・装備編成・AIの陣営のおまかせ編成の方針) */
export interface StartOptions {
  preset?: string;
  custom?: CustomStart;
  aiAuto?: string;
}

/** 記録から始め方を取り出す */
export function startOptionsOf(r: { preset?: string; custom?: CustomStart; aiAuto?: string }): StartOptions {
  return { ...(r.preset ? { preset: r.preset } : {}), ...(r.custom ? { custom: r.custom } : {}), ...(r.aiAuto ? { aiAuto: r.aiAuto } : {}) };
}

/**
 * 試合を始めるシナリオ。装備編成があれば、持ち込みと差し替えを入れて読み込み直す(サーバーが検証する。上限・兵科・参照)
 */
export function startScenario(original: LoadedScenario, packs: PackSet, side: string, how: StartOptions = {}): ParseResult<LoadedScenario> {
  const { custom, aiAuto, preset } = how;
  // 編成の選択(史実の編成など):部隊の編成表とパックを替えて読み込み直し、それを元にする
  let scenario = original;
  if (preset) {
    const p = presetScenario(original.def, preset);
    const b = p.ok ? buildScenario(p.value, packs) : p;
    if (!b.ok) return b;
    scenario = b.value;
  }
  if (aiAuto) {
    // AIの陣営(差し替えてよい陣営のうち人間でないもの)をおまかせ編成にする。同じデータ・同じ方針なら同じ編成になる
    const { def, ctx } = scenario;
    const dev = ctx.rules.development;
    if (!dev?.autoStyles[aiAuto]) return { ok: false, errors: [`おまかせ編成の方針 "${aiAuto}" がありません`] };
    const perSide: Record<string, SideCustomization> = {};
    if (custom) perSide[side] = { bundle: custom.bundle, subs: custom.substitutions, attachments: custom.attachments ?? [] };
    const toeOf = new Map([...def.units.map((u) => [u.id, u.toe] as const), ...def.rules.reinforcements.map((r) => [r.id, r.toe] as const)]);
    for (const s of Object.keys(def.customization)) {
      if (s === side) continue;
      const units = customizableUnits(def, s).map((id) => ({ id, toe: toeOf.get(id)! }));
      const a = autoCompose(dev, ctx.weapons, ctx.toes, ctx.branches, units, def.customization[s]!.budgetMultiplier, aiAuto)!;
      perSide[s] = { bundle: a.bundle, subs: a.substitutions };
    }
    const r = customizeScenarioSides(def, packs, perSide);
    return r.ok ? { ok: true, value: r.value.scenario } : r;
  }
  if (!custom) return { ok: true, value: scenario };
  const r = customizeScenario(scenario.def, packs, side, custom.bundle, custom.substitutions, custom.attachments ?? []);
  return r.ok ? { ok: true, value: r.value.scenario } : r;
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
    sides: def.sides.map((s) => ({
      id: s.id,
      name: s.name,
      units: scenario.units.filter((u) => u.side === s.id).length,
    })),
    maxTurns: ctx.scenario.maxTurns,
    days: nights + 1,
    ...(def.time.startDate ? { startDate: def.time.startDate } : {}),
    objectives: ctx.scenario.objectives.map((o) => ({
      id: o.id,
      name: o.name,
    })),
    // 一覧は試合の前の作戦命令の情報(どちらの陣営にも同じ)なので、護送する部隊の ID はそのまま(試合の中では相手の ID を隠す)
    victory: Object.fromEntries(Object.entries(ctx.scenario.victory).map(([s, v]) => [s, publicVictory(v)])),
    hash: scenario.hash,
    customizableSides: ctx.rules.development ? Object.keys(def.customization) : [],
    presets: Object.entries(def.presets).map(([id, p]) => ({ id, name: p.name, ...(p.description ? { description: p.description } : {}) })),
  };
}

/** シナリオ選択・部隊編成の画面に渡す、1つのシナリオの詳しい情報。部隊は選んだ陣営のものだけ(霧) */
export function scenarioDetail(scenario: LoadedScenario, side: string): ScenarioDetail {
  const { def, ctx } = scenario;
  const describe = (toe: string) => {
    const t = ctx.toes.toes[toe]!;
    return { toe, toeName: t.name, branch: t.branch, branchName: ctx.branches.branches[t.branch]?.name ?? t.branch };
  };
  // 表示名(シナリオに書いたものだけ)
  const names = new Map([...def.units, ...def.rules.reinforcements, ...def.rules.airborne].filter((u) => u.name).map((u) => [u.id, u.name!]));
  const nameOf = (id: string) => (names.has(id) ? { name: names.get(id)! } : {});
  return {
    id: def.id,
    name: def.name,
    side,
    map: def.map,
    roads: def.roads,
    objectives: ctx.scenario.objectives,
    terrainNames: Object.fromEntries(Object.entries(ctx.rules.terrain).map(([id, t]) => [id, t.name])),
    units: [
      ...scenario.units.filter((u) => u.side === side).map((u) => ({ id: u.id, ...nameOf(u.id), ...describe(u.toe), x: u.pos.x, y: u.pos.y, facing: u.facing })),
      ...ctx.scenario.reinforcements.filter((r) => r.side === side).map((r) => ({ id: r.id, ...nameOf(r.id), ...describe(r.toe), x: r.x, y: r.y, facing: r.facing, reinforcementTurn: r.turn })),
      ...ctx.scenario.airborne.filter((r) => r.side === side).map((r) => ({ id: r.id, ...nameOf(r.id), ...describe(r.toe), airborneFromTurn: r.availableFromTurn })),
    ],
    formations: Object.fromEntries(
      Object.entries(def.formations)
        .filter(([, f]) => f.side === side)
        .map(([id, f]) => [id, { name: f.name, ...(f.parent !== undefined ? { parent: f.parent } : {}), units: f.units }]),
    ),
    symbols: unitSymbols(ctx),
  };
}

/** 配属された中隊の内訳(自陣営の部隊の編成表だけ。敵の配属は見せない) */
function attachmentsOf(ctx: LoadedScenario["ctx"], toeIds: Iterable<string>): Record<string, AttachmentInfo[]> {
  const out: Record<string, AttachmentInfo[]> = {};
  for (const id of new Set(toeIds)) {
    const t = ctx.toes.toes[id];
    if (!t) continue;
    const total = t.elements.reduce((s, e) => s + e.count * e.hitPoints, 0);
    const list = t.elements
      .filter((e) => e.attachedFrom)
      .map((e) => ({
        name: e.name.replace(/[(（][^()（）]*から配属[)）]$/, ""),
        count: e.count,
        from: e.attachedFrom!.unit,
        branch: e.attachedFrom!.branch,
        fromToeName: ctx.toes.toes[e.attachedFrom!.toe]?.name ?? e.attachedFrom!.toe,
        armored: !!e.armored,
        share: total > 0 ? (e.count * e.hitPoints) / total : 0,
      }));
    if (list.length) out[id] = list;
  }
  return out;
}

/** 兵科記号の材料(兵科パックの symbol と、編成表の symbol) */
function unitSymbols(ctx: LoadedScenario["ctx"]): UnitSymbols {
  return {
    branches: Object.fromEntries(Object.entries(ctx.branches.branches).map(([id, b]) => [id, b.symbol])),
    toes: Object.fromEntries(
      Object.entries(ctx.toes.toes).map(([id, t]) => [id, { ...(t.symbol?.echelon ? { echelon: t.symbol.echelon } : {}), modifiers: t.symbol?.modifiers ?? [] }]),
    ),
  };
}

/** 装備編成の画面に渡す情報。ルールパックに開発の決まりがなければ null */
export function developmentInfo(scenario: LoadedScenario): DevelopmentInfo | null {
  const { def, ctx } = scenario;
  if (!ctx.rules.development) return null;
  const sides: DevelopmentInfo["sides"] = {};
  for (const s of def.sides) {
    const c = def.customization[s.id];
    if (!c) continue;
    const ids = new Set(customizableUnits(def, s.id));
    sides[s.id] = {
      name: s.name,
      budgetMultiplier: c.budgetMultiplier,
      units: [
        ...def.units.filter((u) => ids.has(u.id)).map((u) => ({ id: u.id, toe: u.toe })),
        ...def.rules.reinforcements.filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, toe: r.toe, reinforcementTurn: r.turn })),
      ],
    };
  }
  return {
    scenarioId: def.id,
    scenarioName: def.name,
    development: ctx.rules.development,
    weapons: ctx.weapons,
    toes: ctx.toes,
    branchNames: Object.fromEntries(Object.entries(ctx.branches.branches).map(([id, b]) => [id, b.name])),
    sides,
    formations: def.formations,
  };
}

/** 陣営の部隊の ID(初めからいる部隊と増援・空挺) */
function sideUnitIds(scenario: LoadedScenario, side: string): Set<string> {
  const { ctx } = scenario;
  return new Set([
    ...scenario.units.filter((u) => u.side === side).map((u) => u.id),
    ...ctx.scenario.reinforcements.filter((r) => r.side === side).map((r) => r.id),
    ...ctx.scenario.airborne.filter((r) => r.side === side).map((r) => r.id),
  ]);
}

/** 霧:勝利条件に書かれた相手の部隊の ID を "enemy" に置き換える(敵の本当の ID は送らない) */
function hideEnemyUnits(v: SideVictory, own: Set<string>): SideVictory {
  return {
    ...v,
    conditions: v.conditions.map((c) => ((c.type === "unitReach" || c.type === "unitLoss") && !own.has(c.unit) ? { ...c, unit: "enemy" } : c)),
  };
}
