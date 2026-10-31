import { isGameOver, resolveTurn, viewForSide, type GameState, type SimContext, type VictoryResult } from "@brigade/sim-core";
import { decide, DEFAULT_AI, type AiConfig } from "./decide.js";

export interface SideStats {
  /** 残った戦力の合計(開始時のユニット数を1ずつとして) */
  strengthLeft: number;
  unitsLost: number;
  ordersRejected: number;
  /** 試合に出たユニットの数(増援を含む) */
  units: number;
  /** 失った戦力の割合(加わったときの戦力に対して。除去されたものは0で、戦場から離脱したものは離脱したときの戦力で数える) */
  lossShare: number;
  /** 潰走した回数 */
  routs: number;
  /** 終わったときに戦えなくなっていたユニット(除去・潰走中・戦力が加わったときの半分未満)の数 */
  broken: number;
}

export interface MatchOutcome {
  result: VictoryResult;
  turns: number;
  final: GameState;
  stats: Record<string, SideStats>;
}

/**
 * AI同士の対戦を規定ターンまで回す。各陣営のAIは自陣営のビューだけを見て決める。
 * 同じ開始状態・同じ設定なら、結果は同じ(決定論)。
 */
export function runMatch(start: GameState, ctx: SimContext, ais: Record<string, AiConfig> = {}, seed = 0): MatchOutcome {
  const sides = [...new Set(start.units.map((u) => u.side))].sort();
  const initialCount = Object.fromEntries(sides.map((s) => [s, start.units.filter((u) => u.side === s).length]));
  const rejected = Object.fromEntries(sides.map((s) => [s, 0]));
  const routs = Object.fromEntries(sides.map((s) => [s, 0]));
  const seen = new Map(start.units.map((u) => [u.id, u.side]));
  // 加わったときの戦力(弱った状態で始まる部隊・増援は、その戦力から数える)
  const first = new Map(start.units.map((u) => [u.id, u.strength]));
  // 戦場から離脱した(転用された)部隊の、離脱したときの戦力。失ったものとは数えない
  const withdrawn = new Map<string, number>();
  let state = start;
  let result: VictoryResult | null = null;
  let turns = 0;
  while (!isGameOver(state, ctx)) {
    const decisions = sides.map((s) => decide(viewForSide(state, s), ctx, ais[s] ?? DEFAULT_AI, seed));
    const r = resolveTurn(
      state,
      decisions.flatMap((d) => d.orders),
      ctx,
      decisions.flatMap((d) => d.hqCommands),
    );
    for (const o of r.rejectedOrders) {
      const side = state.units.find((u) => u.id === o.unitId)?.side;
      if (side) rejected[side]!++;
    }
    for (const c of r.rejectedHqCommands) rejected[c.command.side] = (rejected[c.command.side] ?? 0) + 1;
    for (const u of r.state.units) if (!first.has(u.id)) first.set(u.id, u.strength);
    for (const u of [...r.state.units, ...r.destroyed]) seen.set(u.id, u.side);
    for (const e of r.events) {
      if (e.type === "withdrawn") withdrawn.set(e.unitId, state.units.find((u) => u.id === e.unitId)?.strength ?? 0);
      if (e.type !== "routed") continue;
      const side = seen.get(e.unitId);
      if (side) routs[side] = (routs[side] ?? 0) + 1;
    }
    state = r.state;
    result = r.result;
    turns++;
  }
  const stats: Record<string, SideStats> = {};
  for (const s of sides) {
    const alive = state.units.filter((u) => u.side === s);
    const ids = [...seen].filter(([, x]) => x === s).map(([id]) => id);
    const units = ids.length;
    const strengthLeft = alive.reduce((sum, u) => sum + u.strength, 0);
    const leftField = ids.filter((id) => withdrawn.has(id));
    const keptByWithdrawal = leftField.reduce((sum, id) => sum + withdrawn.get(id)!, 0);
    const strengthIn = ids.reduce((sum, id) => sum + (first.get(id) ?? 1), 0);
    stats[s] = {
      strengthLeft,
      unitsLost: initialCount[s]! - alive.length,
      ordersRejected: rejected[s]!,
      units,
      lossShare: strengthIn > 0 ? 1 - (strengthLeft + keptByWithdrawal) / strengthIn : 0,
      routs: routs[s] ?? 0,
      broken: units - alive.length - leftField.length + alive.filter((u) => u.routed || u.strength < 0.5 * (first.get(u.id) ?? 1)).length,
    };
  }
  return { result: result!, turns, final: state, stats };
}

export interface SeriesSummary {
  games: number;
  /** 陣営ごとの勝ち数と、引き分けの数 */
  wins: Record<string, number>;
  draws: number;
  /** 陣営ごとの勝率(引き分けを除かない、全試合に対する割合) */
  winRate: Record<string, number>;
  /** 勝ち方の内訳("de:decisive" など) */
  byLevel: Record<string, number>;
  /** 決着の度合い:陣営ごとの1試合あたりの平均(失った戦力の割合・潰走の回数・戦えなくなったユニットの割合) */
  decisiveness: Record<string, { lossShare: number; routs: number; brokenShare: number }>;
  outcomes: MatchOutcome[];
}

/** シードを変えて何試合も回し、勝率と勝ち方の内訳を出す(バランスの偏りの検出用) */
export function runSeries(
  makeStart: (seed: number) => GameState,
  ctx: SimContext,
  seeds: readonly number[],
  ais: Record<string, AiConfig> = {},
): SeriesSummary {
  const outcomes = seeds.map((seed) => runMatch(makeStart(seed), ctx, ais, seed));
  const sides = Object.keys(ctx.scenario.victory).sort();
  const wins = Object.fromEntries(sides.map((s) => [s, 0]));
  const byLevel: Record<string, number> = {};
  let draws = 0;
  for (const o of outcomes) {
    const key = o.result.winner ? `${o.result.winner}:${o.result.level}` : "draw";
    byLevel[key] = (byLevel[key] ?? 0) + 1;
    if (o.result.winner) wins[o.result.winner] = (wins[o.result.winner] ?? 0) + 1;
    else draws++;
  }
  const winRate = Object.fromEntries(Object.entries(wins).map(([s, w]) => [s, w / outcomes.length]));
  const avg = (f: (o: MatchOutcome) => number) => outcomes.reduce((sum, o) => sum + f(o), 0) / Math.max(1, outcomes.length);
  const decisiveness = Object.fromEntries(
    sides.map((s) => [
      s,
      {
        lossShare: avg((o) => o.stats[s]?.lossShare ?? 0),
        routs: avg((o) => o.stats[s]?.routs ?? 0),
        brokenShare: avg((o) => (o.stats[s] && o.stats[s].units > 0 ? o.stats[s].broken / o.stats[s].units : 0)),
      },
    ]),
  );
  return { games: outcomes.length, wins, draws, winRate, byLevel, decisiveness, outcomes };
}

/**
 * バランスの偏りの判定:勝敗がついた試合のうち、どこかの陣営の勝ちの割合が [1 - maxWinRate, maxWinRate] の外なら、その陣営を返す。
 * 引き分けは除く(引き分けが多いと、両陣営とも全試合に対する勝率が低く出て、偏りと区別できないため)。
 * AI同士の自動対戦で、シナリオや数値の調整が一方に偏っていないかを見るのに使う。
 */
export function imbalance(summary: SeriesSummary, maxWinRate = 0.75): { side: string; winRate: number }[] {
  const decided = summary.games - summary.draws;
  if (decided === 0) return [];
  const out: { side: string; winRate: number }[] = [];
  for (const [side, w] of Object.entries(summary.wins)) {
    const rate = w / decided;
    if (rate > maxWinRate || rate < 1 - maxWinRate) out.push({ side, winRate: rate });
  }
  return out;
}
