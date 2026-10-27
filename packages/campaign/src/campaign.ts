import { runMatch } from "@brigade/ai";
import { generateScenario, type Biome, type ForceUnit, type GeneratorData, type MapSize } from "@brigade/generator";
import { buildScenario, Rng, toeHitPoints, type LoadedScenario, type PackSet, type Toe, type VictoryResult } from "@brigade/sim-core";
import type { CampaignDef } from "./schema.js";

/** キャンペーンを解くのに要るもの(パック・生成の決まり・地形の傾向) */
export interface CampaignEnv {
  packs: PackSet;
  generator: GeneratorData;
  biomes: Record<string, Biome>;
}

/** 部隊の持ち越す状態。xp は経験の点(練度が上がる) */
export interface UnitState {
  formation: string;
  side: string;
  toe: string;
  strength: number;
  morale: number;
  ammo: number;
  fuel: number;
  fatigue: number;
  training: string;
  xp: number;
}

export interface CampaignState {
  /** これから解く段階(1始まり) */
  stage: number;
  seed: number;
  control: Record<string, string | null>;
  /** 師団・旅団の居場所(壊滅した師団・旅団は消える) */
  formations: Record<string, { side: string; region: string }>;
  /** 生き残っている部隊 */
  units: Record<string, UnitState>;
  /** 陣営ごとの、始めの総戦力と失った戦力(編成表の耐久 × 戦力) */
  forceTotals: Record<string, number>;
  lost: Record<string, number>;
  history: StageReport[];
  /** 終わっていれば勝敗 */
  result?: CampaignResult;
}

/** 師団・旅団への命令:動く先(今の地域か、つながった地域) */
export interface CampaignOrder {
  formation: string;
  to: string;
}

/** 段階の戦闘。attacker は攻める陣営(遭遇戦なら null) */
export interface CampaignBattle {
  id: string;
  region: string;
  mission: "attack-defense" | "encounter";
  attacker: string | null;
  /** 陣営ごとの、戦闘に出る師団・旅団と部隊 */
  sides: Record<string, { formations: string[]; units: string[] }>;
  /** 戦う前にいた地域(負けたときに戻る) */
  from: Record<string, string>;
}

/** 段階の割り出し:命令の後の居場所と、戦闘・無血での奪取 */
export interface StagePlan {
  stage: number;
  positions: Record<string, string>;
  battles: CampaignBattle[];
  captures: { region: string; side: string }[];
}

/** 1つの戦闘の決着(戦術の戦闘の結果と、終わったときの部隊) */
export interface BattleOutcome {
  winner: string | null;
  level: "decisive" | "limited" | "draw";
  units: Record<string, { strength: number; morale: number; ammo: number; fuel: number; fatigue: number }>;
  played: boolean;
}

export interface StageReport {
  stage: number;
  date: string;
  battles: { id: string; region: string; mission: string; attacker: string | null; winner: string | null; level: string; played: boolean; losses: Record<string, number> }[];
  captures: { region: string; side: string }[];
  /** 包囲されて壊滅・投降した師団・旅団 */
  destroyed: string[];
  /** この段階の終わりに着いた増援(次の段階から動ける) */
  arrivals?: { formation: string; region: string }[];
}

export interface CampaignResult {
  winner: string | null;
  level: "decisive" | "limited" | "draw";
  perSide: Record<string, { points: number; lossRatio: number; met: Record<string, boolean>; level: "decisive" | "limited" | "none" }>;
}

/** 編成表(キャンペーンの編成のパックを重ねたもの) */
export function campaignToes(def: CampaignDef, env: CampaignEnv): Record<string, Toe> {
  const era = env.generator.eras[def.era];
  if (!era) throw new Error(`編成 "${def.era}" がありません`);
  const ids = Array.isArray(era.toe) ? era.toe : [era.toe];
  return Object.assign({}, ...ids.map((p) => env.packs.toes[p]?.toes ?? {}));
}

/**
 * 部隊の戦力の目安(作戦の AI と画面で使う):編成表の耐久 × 戦力 × 士気の半分 × 練度の質。
 * 練度の質は、ルールパックの練度の火力の倍率 ÷ 受ける士気の損害の倍率(未熟 0.5・標準 1・古参 1.35 ほど)
 */
export function unitPower(env: CampaignEnv, toes: Record<string, Toe>, u: Pick<UnitState, "toe" | "strength" | "morale" | "training">): number {
  const toe = toes[u.toe];
  if (!toe) return 0;
  const lv = env.packs.rules[env.generator.rules]?.training?.levels?.[u.training];
  const quality = lv ? lv.firepowerMultiplier / Math.max(0.1, lv.moraleDamageTakenMultiplier) : 1;
  return toeHitPoints(toe) * u.strength * (0.5 + 0.5 * u.morale) * quality;
}

const hpOf = (toes: Record<string, Toe>, u: { toe: string; strength: number }) => (toes[u.toe] ? toeHitPoints(toes[u.toe]!) * u.strength : 0);

export function startCampaign(def: CampaignDef, env: CampaignEnv, seed: number): CampaignState {
  const toes = campaignToes(def, env);
  const units: Record<string, UnitState> = {};
  for (const f of def.formations) {
    for (const u of f.units) if (!toes[u.toe]) throw new Error(`編成表 "${u.toe}" がありません(${f.id})`);
    if ((f.arriveStage ?? 1) > 1) continue;
    Object.assign(units, unitsOf(def, f));
  }
  const forceTotals: Record<string, number> = {};
  for (const u of Object.values(units)) forceTotals[u.side] = (forceTotals[u.side] ?? 0) + hpOf(toes, u);
  return {
    stage: 1,
    seed,
    control: Object.fromEntries(Object.keys(def.regions).map((r) => [r, def.control[r] ?? null])),
    formations: Object.fromEntries(def.formations.filter((f) => (f.arriveStage ?? 1) <= 1).map((f) => [f.id, { side: f.side, region: f.region }])),
    units,
    forceTotals,
    lost: Object.fromEntries(def.sides.map((s) => [s.id, 0])),
    history: [],
  };
}

/** 師団・旅団の隷下の部隊の、始めの状態 */
function unitsOf(def: CampaignDef, f: CampaignDef["formations"][number]): Record<string, UnitState> {
  return Object.fromEntries(
    f.units.map((u) => [
      u.id,
      { formation: f.id, side: f.side, toe: u.toe, strength: u.strength ?? 1, morale: 1, ammo: 1, fuel: 1, fatigue: 0, training: u.training ?? def.rules.experience.levels[1] ?? def.rules.experience.levels[0]!, xp: 0 },
    ]),
  );
}

/** 地域のつながり */
export function neighbors(def: CampaignDef, region: string): string[] {
  return def.links.flatMap((l) => (l.a === region ? [l.b] : l.b === region ? [l.a] : []));
}

/** 段階の日付(YYYY-MM-DD) */
export function stageDate(def: CampaignDef, stage: number): string {
  const d = new Date(`${def.calendar.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (stage - 1) * def.calendar.daysPerStage);
  return d.toISOString().slice(0, 10);
}

const formationUnits = (state: CampaignState, f: string) => Object.entries(state.units).filter(([, u]) => u.formation === f).map(([id]) => id);

/** 命令を確かめる(自陣営の師団・旅団で、動く先が今の地域かつながった地域)。誤りの文を返す */
export function checkOrders(def: CampaignDef, state: CampaignState, side: string, orders: readonly CampaignOrder[]): string[] {
  const errors: string[] = [];
  for (const o of orders) {
    const f = state.formations[o.formation];
    if (!f) errors.push(`師団・旅団 "${o.formation}" がありません`);
    else if (f.side !== side) errors.push(`"${o.formation}" は自陣営の師団・旅団ではありません`);
    else if (o.to !== f.region && !neighbors(def, f.region).includes(o.to)) errors.push(`"${o.formation}" は ${o.to} へ動けません(つながっていない)`);
  }
  return errors;
}

/**
 * 段階の割り出し:両陣営の命令で動かし、同じ地域に両陣営の師団・旅団がいれば戦闘にする。
 * そこにもともといて動かなかった側が守り、入ってきた側が攻める(両方が入ってきたら遭遇戦)。
 * 片方だけが入った相手の地域は、戦わずに手に入る
 */
export function planStage(def: CampaignDef, state: CampaignState, orders: Record<string, readonly CampaignOrder[]>): StagePlan {
  const positions: Record<string, string> = Object.fromEntries(Object.entries(state.formations).map(([id, f]) => [id, f.region]));
  for (const [side, list] of Object.entries(orders)) {
    if (checkOrders(def, state, side, list).length > 0) throw new Error(checkOrders(def, state, side, list).join("\n"));
    for (const o of list) positions[o.formation] = o.to;
  }
  const battles: CampaignBattle[] = [];
  const captures: StagePlan["captures"] = [];
  const [a, b] = def.sides.map((s) => s.id) as [string, string];
  for (const region of Object.keys(def.regions).sort()) {
    const here = (side: string) => Object.keys(positions).filter((f) => positions[f] === region && state.formations[f]!.side === side && formationUnits(state, f).length > 0).sort();
    const fa = here(a);
    const fb = here(b);
    if (fa.length && fb.length) {
      const stayed = (fs: string[]) => fs.every((f) => state.formations[f]!.region === region);
      const attacker = stayed(fa) && !stayed(fb) ? b : stayed(fb) && !stayed(fa) ? a : null;
      const pickUnits = (fs: string[]) =>
        fs
          .flatMap((f) => formationUnits(state, f))
          .sort((x, y) => state.units[y]!.strength - state.units[x]!.strength || (x < y ? -1 : 1))
          .slice(0, def.rules.maxUnitsPerBattle);
      battles.push({
        id: `s${state.stage}-${region}`,
        region,
        mission: attacker ? "attack-defense" : "encounter",
        attacker,
        sides: { [a]: { formations: fa, units: pickUnits(fa) }, [b]: { formations: fb, units: pickUnits(fb) } },
        from: Object.fromEntries([...fa, ...fb].map((f) => [f, state.formations[f]!.region])),
      });
    } else {
      const only = fa.length ? a : fb.length ? b : null;
      if (only && state.control[region] !== only) captures.push({ region, side: only });
    }
  }
  return { stage: state.stage, positions, battles, captures };
}

/** 戦闘の大きさ(出る部隊の数から) */
function battleSize(n: number): MapSize {
  return n <= 5 ? "s" : n <= 8 ? "m" : "l";
}

/** 戦闘の乱数の種(キャンペーンの種・段階・地域から決まる) */
function battleSeed(state: CampaignState, battle: CampaignBattle): number {
  let h = (state.seed * 2654435761) >>> 0;
  for (const ch of battle.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % 1_000_000;
}

/**
 * 戦闘の戦術シナリオ(シナリオファイルの形)。地域の地形の傾向で地図を作り、出る部隊を持ち越した状態のまま置く。
 * ID は camp:キャンペーン:段階:地域
 */
export function battleScenarioFile(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv): Record<string, unknown> {
  // 生成器は編成(era)の陣営の並びで置くので、その並びで渡す
  const era = env.generator.eras[def.era];
  if (!era || !era.sides.every((s) => def.sides.some((d) => d.id === s.id))) throw new Error(`キャンペーンの陣営が編成 "${def.era}" の陣営と合いません`);
  const sideIds = era.sides.map((s) => s.id);
  const forces = sideIds.map((s) =>
    battle.sides[s]!.units.map((id): ForceUnit => {
      const u = state.units[id]!;
      return { id, toe: u.toe, strength: Math.max(0.01, u.strength), morale: u.morale, ammo: u.ammo, fuel: u.fuel, fatigue: u.fatigue, training: u.training };
    }),
  ) as [ForceUnit[], ForceUnit[]];
  const n = Math.max(forces[0].length, forces[1].length);
  const region = def.regions[battle.region]!;
  const g = generateScenario(
    { mission: battle.mission, biome: region.biome, size: battleSize(n), era: def.era, seed: battleSeed(state, battle) },
    env.generator,
    env.biomes,
    env.packs,
    {
      forces,
      ...(battle.attacker ? { attacker: sideIds.indexOf(battle.attacker) as 0 | 1 } : {}),
      cards: [],
      noSecrets: true,
      id: `camp:${def.id}:${state.stage}:${battle.region}`,
      name: `${region.name}の戦い(${stageDate(def, state.stage)})`,
    },
  );
  return g.file;
}

export function battleScenario(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv): LoadedScenario {
  const r = buildScenario(battleScenarioFile(def, state, battle, env), env.packs);
  if (!r.ok) throw new Error(`戦闘 ${battle.id} のシナリオが作れません:\n${r.errors.join("\n")}`);
  return r.value;
}

/** 戦術の戦闘の結果を、キャンペーンの決着に直す(出た部隊の終わったときの状態) */
export function outcomeOf(result: VictoryResult, finalUnits: readonly { id: string; strength: number; morale: number; ammo: number; fuel: number; fatigue: number }[], played: boolean): BattleOutcome {
  return {
    winner: result.winner,
    level: result.level,
    units: Object.fromEntries(finalUnits.map((u) => [u.id, { strength: u.strength, morale: u.morale, ammo: u.ammo, fuel: u.fuel, fatigue: u.fatigue }])),
    played,
  };
}

/** 指揮しない戦闘を、戦術の AI 同士で最後まで解く */
export function autoResolve(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv): BattleOutcome {
  const sc = battleScenario(def, state, battle, env);
  const seed = battleSeed(state, battle);
  const out = runMatch(sc.start(seed), sc.ctx, {}, seed);
  return outcomeOf(out.result, out.final.units, false);
}

/**
 * 段階を解く:割り出した戦闘のうち、指揮した戦闘は played の決着を使い、残りは AI 同士で解く。
 * 結果を持ち越し(戦力・士気・携行備蓄・経験と練度)、地域の持ち主と居場所を変え(負けた側は下がり、下がる先がなければ壊滅)、
 * 補給と補充を当てて、次の段階の状態を返す。最後の段階なら勝敗も
 */
export function resolveStage(
  def: CampaignDef,
  state: CampaignState,
  plan: StagePlan,
  env: CampaignEnv,
  played: Record<string, BattleOutcome> = {},
): CampaignState {
  const toes = campaignToes(def, env);
  const next: CampaignState = structuredClone(state);
  const report: StageReport = { stage: state.stage, date: stageDate(def, state.stage), battles: [], captures: [], destroyed: [] };
  for (const [f, r] of Object.entries(plan.positions)) if (next.formations[f]) next.formations[f]!.region = r;
  const sideIds = def.sides.map((s) => s.id);
  const other = (s: string) => sideIds.find((x) => x !== s)!;
  const lose = (side: string, hp: number) => (next.lost[side] = (next.lost[side] ?? 0) + hp);

  for (const battle of plan.battles) {
    const outcome = played[battle.id] ?? autoResolve(def, state, battle, env);
    const losses: Record<string, number> = Object.fromEntries(sideIds.map((s) => [s, 0]));
    // 出た部隊の状態を持ち越す(いなくなった部隊は壊滅・投降)
    for (const s of sideIds) {
      for (const id of battle.sides[s]!.units) {
        const u = next.units[id]!;
        const before = hpOf(toes, u);
        const f = outcome.units[id];
        if (!f || f.strength <= 0) {
          delete next.units[id];
          losses[s]! += before;
          continue;
        }
        Object.assign(u, { strength: f.strength, morale: f.morale, ammo: f.ammo, fuel: f.fuel, fatigue: f.fatigue });
        // 決定的に負けた側は、潰走・落伍でさらに失う
        if (outcome.level === "decisive" && outcome.winner && outcome.winner !== s) u.strength *= 1 - def.rules.decisiveExtraLoss;
        losses[s]! += before - hpOf(toes, u);
      }
      lose(s, losses[s]!);
    }
    // 経験と練度:勝った側の出た部隊
    if (outcome.winner) {
      const xp = outcome.level === "decisive" ? def.rules.experience.decisive : def.rules.experience.win;
      for (const id of battle.sides[outcome.winner]!.units) {
        const u = next.units[id];
        if (!u) continue;
        u.xp += xp;
        u.training = trainingFor(def, u);
      }
    }
    // 地域の持ち主と居場所:攻めた側(遭遇戦なら勝った側)が勝てば地域を取り、負けた側は下がる。
    // 攻めた側が勝てなければ、攻めた側は元の地域へ戻る(遭遇戦の引き分けは両方が戻る)
    const winner = outcome.winner;
    const takes = winner && (battle.attacker === null || battle.attacker === winner);
    if (takes) {
      next.control[battle.region] = winner;
      for (const f of battle.sides[other(winner)]!.formations) retreat(def, next, f, battle.region, report);
    } else {
      const back = battle.attacker ? [battle.attacker] : sideIds;
      for (const s of back) for (const f of battle.sides[s]!.formations) if (next.formations[f]) next.formations[f]!.region = battle.from[f]!;
    }
    report.battles.push({ id: battle.id, region: battle.region, mission: battle.mission, attacker: battle.attacker, winner, level: outcome.level, played: outcome.played, losses });
  }
  for (const c of plan.captures) {
    next.control[c.region] = c.side;
    report.captures.push(c);
  }

  // 師団・旅団の部隊がいなくなったら消す
  for (const f of Object.keys(next.formations)) if (formationUnits(next, f).length === 0) delete next.formations[f];

  // 補給と補充:補給の源から自陣営の地域をたどって届く師団・旅団は、補充・士気の回復・携行備蓄の満タン。届かなければ備蓄が減る
  for (const s of sideIds) {
    const reach = suppliedRegions(def, next, s);
    for (const u of Object.values(next.units)) {
      if (u.side !== s) continue;
      const region = next.formations[u.formation]?.region;
      if (region && reach.has(region)) {
        const before = hpOf(toes, u);
        u.strength = Math.min(1, u.strength + def.rules.replacementPerStage);
        // 補充は失った戦力から差し引く(損耗率は、取り戻した分だけ下がる)
        lose(s, -(hpOf(toes, u) - before));
        u.morale = Math.min(1, u.morale + def.rules.moraleRecoveryPerStage);
        u.ammo = 1;
        u.fuel = 1;
        u.fatigue = 0;
      } else {
        u.ammo = Math.max(0.05, u.ammo - def.rules.unsuppliedStockLoss);
        u.fuel = Math.max(0.05, u.fuel - def.rules.unsuppliedStockLoss);
        u.fatigue = Math.max(0, u.fatigue - 0.5);
      }
    }
  }

  // 増援:次の段階の始めに着く師団・旅団。着く地域が敵のものか敵がいれば、自陣営の補給の源(補給の届く所)へ。どこもなければ来ない
  for (const f of def.formations) {
    if ((f.arriveStage ?? 1) !== state.stage + 1 || next.formations[f.id]) continue;
    const free = (r: string) => next.control[r] === f.side && !Object.values(next.formations).some((x) => x.region === r && x.side !== f.side);
    const region = free(f.region)
      ? f.region
      : Object.keys(def.regions)
          .filter((r) => def.regions[r]!.supply === f.side && free(r))
          .sort()[0];
    if (!region) continue;
    next.formations[f.id] = { side: f.side, region };
    const added = unitsOf(def, f);
    Object.assign(next.units, added);
    next.forceTotals[f.side] = (next.forceTotals[f.side] ?? 0) + Object.values(added).reduce((t, u) => t + hpOf(toes, u), 0);
    (report.arrivals ??= []).push({ formation: f.id, region });
  }

  next.history = [...state.history, report];
  next.stage = state.stage + 1;
  // 終わり:最後の段階を解いたか、どちらかの師団・旅団が全部いなくなって、これから来る増援もない
  const wiped = (s: string) => !Object.values(next.formations).some((f) => f.side === s) && !def.formations.some((f) => f.side === s && (f.arriveStage ?? 1) > next.stage);
  if (next.stage > def.calendar.stages || sideIds.some(wiped)) next.result = evaluateCampaign(def, next);
  return next;
}

/** 経験の点から練度を決める(練度は下がらない) */
function trainingFor(def: CampaignDef, u: UnitState): string {
  const { levels, thresholds } = def.rules.experience;
  let lv = levels.indexOf(u.training);
  if (lv < 0) return u.training;
  while (lv + 1 < levels.length && u.xp >= (thresholds[lv] ?? Infinity)) lv++;
  return levels[lv]!;
}

/** 下がる:負けた戦闘の地域から、自陣営の地域で敵のいない所へ(補給の源に近い方)。なければ包囲されて壊滅 */
function retreat(def: CampaignDef, state: CampaignState, formation: string, from: string, report: StageReport) {
  const f = state.formations[formation];
  if (!f) return;
  const enemyIn = (r: string) => Object.values(state.formations).some((x) => x.region === r && x.side !== f.side);
  const reach = suppliedRegions(def, state, f.side);
  const options = neighbors(def, from)
    .filter((r) => state.control[r] === f.side && !enemyIn(r))
    .sort((x, y) => Number(reach.has(y)) - Number(reach.has(x)) || (x < y ? -1 : 1));
  if (options[0]) {
    f.region = options[0];
    return;
  }
  for (const id of formationUnits(state, formation)) delete state.units[id];
  delete state.formations[formation];
  report.destroyed.push(formation);
}

/** 補給の届く地域:陣営が押さえている補給の源から、陣営の地域をたどって届く所 */
export function suppliedRegions(def: CampaignDef, state: CampaignState, side: string): Set<string> {
  const out = new Set<string>();
  const stack = Object.entries(def.regions)
    .filter(([r, g]) => g.supply === side && state.control[r] === side)
    .map(([r]) => r);
  for (const r of stack) out.add(r);
  while (stack.length) {
    const r = stack.pop()!;
    for (const n of neighbors(def, r)) {
      if (out.has(n) || state.control[n] !== side) continue;
      out.add(n);
      stack.push(n);
    }
  }
  return out;
}

/** キャンペーンの勝敗:両陣営の到達段階を比べ、高い方の勝ち */
export function evaluateCampaign(def: CampaignDef, state: CampaignState): CampaignResult {
  const sideIds = def.sides.map((s) => s.id);
  const ratio = (s: string) => (state.forceTotals[s] ? Math.max(0, state.lost[s] ?? 0) / state.forceTotals[s]! : 0);
  const perSide: CampaignResult["perSide"] = {};
  for (const s of sideIds) {
    const v = def.victory[s];
    const enemy = sideIds.find((x) => x !== s)!;
    const met: Record<string, boolean> = {};
    let points = 0;
    for (const c of v?.conditions ?? []) {
      const ok = c.type === "region" ? state.control[c.region] === s : ratio(enemy) > 0 && ratio(s) <= ratio(enemy) * c.max;
      met[c.id] = ok;
      if (ok) points += c.points;
    }
    const reaches = (t: { minPoints: number; requires: string[] }) => points >= t.minPoints && t.requires.every((r) => met[r]);
    // 陣営の師団・旅団が全部いなくなったら、その陣営は何も満たせない
    const alive = Object.values(state.formations).some((f) => f.side === s);
    const level = !alive || !v ? "none" : reaches(v.decisive) ? "decisive" : reaches(v.limited) ? "limited" : "none";
    perSide[s] = { points, lossRatio: ratio(s), met, level };
  }
  const rank = { decisive: 2, limited: 1, none: 0 } as const;
  const [x, y] = sideIds.map((s) => [s, perSide[s]!.level] as const) as [readonly [string, keyof typeof rank], readonly [string, keyof typeof rank]];
  if (rank[x[1]] === rank[y[1]]) return { winner: null, level: "draw", perSide };
  const w = rank[x[1]] > rank[y[1]] ? x : y;
  return { winner: w[0], level: w[1] as "decisive" | "limited", perSide };
}

/** 決まった種から、段階ごとの作戦の AI の揺らぎ */
export function stageRng(state: CampaignState, side: string): Rng {
  let h = (state.seed ^ (state.stage * 7919)) >>> 0;
  for (const ch of side) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return Rng.fromSeed(h);
}
