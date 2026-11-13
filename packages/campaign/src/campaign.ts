import { runMatch } from "@brigade/ai";
import { generateScenario, type Biome, type ForceUnit, type GeneratorData, type MapSize } from "@brigade/generator";
import { buildScenario, Rng, toeHitPoints, type LoadedScenario, type PackSet, type Toe, type VictoryResult } from "@brigade/sim-core";
import { addAirReport, airUpkeep, inRange, battleAirForces, battleAirRules, carryBattleAir, checkWingWeapons, resolveStrategicAir, startWings, type AirReport, type AirUpkeepReport, type CampaignAirOrder, type WingState } from "./air.js";
import { landAirUnits, navalBattleFile } from "./naval.js";
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
  /** 航空隊を載せる母艦(艦隊の空母の戦隊の部隊の id。母艦を失うと航空隊も失う) */
  base?: string;
  /** 艦の戦隊の名前(同じ艦隊で同じ名前の艦が1つの戦隊。海戦の上級部隊になる) */
  squadron?: string;
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
  /** 航空隊の今の状態(航空隊のないキャンペーン・旧い記録では空か省略) */
  wings?: Record<string, WingState>;
  /** 海を渡って来る増援のうち、海域を敵に押さえられて着くのが遅れている師団・旅団・艦隊 */
  delayed?: string[];
  /** 終わっていれば勝敗 */
  result?: CampaignResult;
  /** この段階の始めに、敵のいる地域へ上陸した師団・旅団(その地域で攻め手になる) */
  landed?: string[];
}

/** 師団・旅団への命令:動く先(今の地域か、つながった地域) */
export interface CampaignOrder {
  formation: string;
  to: string;
  /** 艦隊が、動いた先の海域に面した敵の飛行場の地域を艦砲射撃する(段階の終わりまでその海域に残れば) */
  bombard?: string;
}

/** 段階の戦闘。attacker は攻める陣営(遭遇戦なら null) */
export interface CampaignBattle {
  id: string;
  region: string;
  mission: "attack-defense" | "encounter" | "naval";
  attacker: string | null;
  /** 陣営ごとの、戦闘に出る師団・旅団と部隊 */
  sides: Record<string, { formations: string[]; units: string[] }>;
  /** 戦う前にいた地域(負けたときに戻る) */
  from: Record<string, string>;
  /** 陣営ごとの、この戦闘に出る航空隊 */
  air?: Record<string, string[]>;
  /** 航空隊ごとの、戦闘に出す割合(1 でないものだけ) */
  airShare?: Record<string, number>;
  /** 艦隊への空襲(陸の航空隊が海域の敵の艦隊を叩く海戦。攻め手は航空隊だけで、勝っても海域は取らない) */
  airRaid?: boolean;
}

/** 段階の割り出し:命令の後の居場所と、戦闘・無血での奪取 */
export interface StagePlan {
  stage: number;
  positions: Record<string, string>;
  battles: CampaignBattle[];
  captures: { region: string; side: string }[];
  /** 陣営ごとの航空の命令(assignAir で当てる) */
  air?: Record<string, CampaignAirOrder[]>;
  /** 飛行場への艦砲射撃の命令(艦隊と目標の地域) */
  bombard?: { formation: string; region: string }[];
}

/** 1つの戦闘の決着(戦術の戦闘の結果と、終わったときの部隊) */
export interface BattleOutcome {
  winner: string | null;
  level: "decisive" | "limited" | "draw";
  units: Record<string, { strength: number; morale: number; ammo: number; fuel: number; fatigue: number }>;
  played: boolean;
  /** 脱出路から撤退した部隊(戦力を保ったまま去ったので、決定的に負けた側の追加の損害を受けない) */
  escaped?: string[];
  /** 戦闘の終わりの、陣営ごとの編隊の数(出た航空隊の損耗を戻す) */
  airGroups?: Record<string, { fighters: number; attack: number }>;
  /** 航空司令部の飛行隊ごとの、失った機数(キー:航空司令部:飛行隊) */
  airLosses?: Record<string, number>;
}

/** 戦闘の終わりの航空司令部から、飛行隊ごとの失った機数を出す */
export function airLossesOf(airOps: Record<string, { squadrons: Record<string, { lost: number }> }> | undefined): Record<string, number> | undefined {
  if (!airOps) return undefined;
  const out: Record<string, number> = {};
  for (const [fid, st] of Object.entries(airOps)) for (const [sid, q] of Object.entries(st.squadrons)) if (q.lost > 0) out[`${fid}:${sid}`] = q.lost;
  return Object.keys(out).length ? out : undefined;
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
  /** 通る海域を敵に押さえられて、着くのが遅れた増援 */
  delayed?: string[];
  /** 飛行場への艦砲射撃(壊した敵の編隊の数) */
  bombardments?: { formation: string; region: string; share: number; groups: number }[];
  /** 夜の輸送(東京急行)で、敵に押さえられた海域を通って着いた増援と、失った戦力の割合 */
  expressed?: { formation: string; loss: number }[];
  /** 航空隊の任務と損耗、基地の移動・失われた航空隊・着いた航空隊 */
  air?: AirReport[];
  airUpkeep?: AirUpkeepReport;
}

export interface CampaignResult {
  winner: string | null;
  level: "decisive" | "limited" | "draw";
  perSide: Record<string, { points: number; lossRatio: number; met: Record<string, boolean>; level: "decisive" | "limited" | "none" }>;
}

/** 編成表(キャンペーンの編成のパックを重ねたもの) */
/** その段階の天候(予定がなければ undefined) */
export function stageWeather(def: CampaignDef, stage: number): string | undefined {
  return [...def.weather].filter((w) => w.stage <= stage).sort((a, b) => b.stage - a.stage)[0]?.weather;
}

/** その段階に航空機が飛べるか(戦術のルールパックの天候で決める。予定がなければ飛べる) */
export function stageFlyable(def: CampaignDef, stage: number, env: CampaignEnv): boolean {
  const w = stageWeather(def, stage);
  return w === undefined || env.packs.rules[env.generator.rules]?.weather.types[w]?.airAllowed !== false;
}

export function campaignToes(def: CampaignDef, env: CampaignEnv): Record<string, Toe> {
  const era = env.generator.eras[def.era];
  if (!era) throw new Error(`編成 "${def.era}" がありません`);
  const ids = [...(Array.isArray(era.toe) ? era.toe : [era.toe]), ...(def.naval?.toe ?? [])];
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
    const sea = !!def.regions[f.region]?.sea;
    for (const u of f.units) {
      const t = toes[u.toe];
      if (!t) throw new Error(`編成表 "${u.toe}" がありません(${f.id})`);
      if (sea !== !!(t.naval || t.air)) throw new Error(sea ? `艦隊 "${f.id}" の "${u.id}" は艦艇・航空隊ではありません` : `"${f.id}" の "${u.id}" は艦艇・航空隊なので、海域に置いてください`);
      if (t.air && !(u.base && toes[f.units.find((x) => x.id === u.base)?.toe ?? ""]?.carrier)) throw new Error(`航空隊 "${u.id}" の母艦(base)が、同じ艦隊の空母の戦隊ではありません`);
    }
    if ((f.arriveStage ?? 1) > 1) continue;
    Object.assign(units, unitsOf(def, f));
  }
  const weapons = Object.assign({}, ...[env.generator.eras[def.era]!.weapons].flat().map((p) => env.packs.weapons[p]?.weapons ?? {}));
  const wingErrors = checkWingWeapons(def, weapons);
  if (wingErrors.length) throw new Error(wingErrors.join("\n"));
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
    ...(def.airWings.length ? { wings: startWings(def) } : {}),
  };
}

/** 師団・旅団の隷下の部隊の、始めの状態 */
function unitsOf(def: CampaignDef, f: CampaignDef["formations"][number]): Record<string, UnitState> {
  return Object.fromEntries(
    f.units.map((u) => [
      u.id,
      {
        formation: f.id,
        side: f.side,
        toe: u.toe,
        strength: u.strength ?? 1,
        morale: 1,
        ammo: u.ammo ?? 1,
        fuel: u.fuel ?? 1,
        fatigue: 0,
        training: u.training ?? def.rules.experience.levels[1] ?? def.rules.experience.levels[0]!,
        xp: 0,
        ...(u.base ? { base: u.base } : {}),
        ...(u.squadron ? { squadron: u.squadron } : {}),
      },
    ]),
  );
}

/** 地域のつながり */
export function neighbors(def: CampaignDef, region: string): string[] {
  return def.links.flatMap((l) => (l.a === region ? [l.b] : l.b === region ? [l.a] : []));
}

/** 地域が海域か */
export const isSea = (def: CampaignDef, region: string) => !!def.regions[region]?.sea;

/** 動ける隣の地域:陸の師団・旅団は陸の地域へ、艦隊は海域へ */
export function moves(def: CampaignDef, region: string): string[] {
  return neighbors(def, region).filter((r) => isSea(def, r) === isSea(def, region));
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
    else if (o.to !== f.region && !moves(def, f.region).includes(o.to))
      errors.push(`"${o.formation}" は ${o.to} へ動けません(${neighbors(def, f.region).includes(o.to) ? "陸の部隊は海域へ、艦隊は陸へ入れない" : "つながっていない"})`);
    else if (o.bombard !== undefined && !bombardable(def, state, side, o.to).includes(o.bombard))
      errors.push(`"${o.formation}" は ${def.regions[o.bombard]?.name ?? o.bombard} を艦砲射撃できません(艦隊が入る海域に面した敵の飛行場だけ)`);
  }
  return errors;
}

/** 海域 sea にいる艦隊が艦砲射撃できる地域:その海域に面した、敵の持つ飛行場の地域 */
export function bombardable(def: CampaignDef, state: CampaignState, side: string, sea: string): string[] {
  if (!isSea(def, sea)) return [];
  return neighbors(def, sea).filter((r) => !isSea(def, r) && def.regions[r]!.airbase && state.control[r] != null && state.control[r] !== side).sort();
}

/**
 * 段階の割り出し:両陣営の命令で動かし、同じ地域に両陣営の師団・旅団がいれば戦闘にする。
 * そこにもともといて動かなかった側が守り、入ってきた側が攻める(両方が入ってきたら遭遇戦)。
 * 片方だけが入った相手の地域は、戦わずに手に入る
 */
export function planStage(def: CampaignDef, state: CampaignState, orders: Record<string, readonly CampaignOrder[]>): StagePlan {
  const positions: Record<string, string> = Object.fromEntries(Object.entries(state.formations).map(([id, f]) => [id, f.region]));
  const bombard: { formation: string; region: string }[] = [];
  for (const [side, list] of Object.entries(orders)) {
    if (checkOrders(def, state, side, list).length > 0) throw new Error(checkOrders(def, state, side, list).join("\n"));
    for (const o of list) {
      positions[o.formation] = o.to;
      if (o.bombard) bombard.push({ formation: o.formation, region: o.bombard });
    }
  }
  const battles: CampaignBattle[] = [];
  const captures: StagePlan["captures"] = [];
  const [a, b] = def.sides.map((s) => s.id) as [string, string];
  // すれ違い:同じつながりを互いに逆向きに動く両陣営の師団・旅団は、途中で出会って戦う。
  // 動いた部隊の戦力の多い側が押し通り(相手の元の地域で戦う)、少ない側の動いた部隊は元の地域で迎え撃つ(同じなら地域の ID の若い方で)
  const strengthOf = (fs: string[]) => fs.reduce((t, f) => t + formationUnits(state, f).reduce((u, id) => u + state.units[id]!.strength, 0), 0);
  const movers = Object.keys(positions).filter((f) => positions[f] !== state.formations[f]!.region && formationUnits(state, f).length > 0);
  const links = new Set(movers.map((f) => [state.formations[f]!.region, positions[f]!].sort().join("|")));
  for (const key of [...links].sort()) {
    const [r1, r2] = key.split("|") as [string, string];
    const along = (side: string, from: string, to: string) => movers.filter((f) => state.formations[f]!.side === side && state.formations[f]!.region === from && positions[f] === to).sort();
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const xs = along(x, r1, r2);
      const ys = along(y, r2, r1);
      if (xs.length === 0 || ys.length === 0) continue;
      const sx = strengthOf(xs);
      const sy = strengthOf(ys);
      // 押し通った側は行き先へ、押し返された側は元の地域に留まって守る
      const xWins = sx > sy || (sx === sy && r2 < r1);
      for (const f of xWins ? ys : xs) positions[f] = state.formations[f]!.region;
    }
  }
  for (const region of Object.keys(def.regions).sort()) {
    const here = (side: string) => Object.keys(positions).filter((f) => positions[f] === region && state.formations[f]!.side === side && formationUnits(state, f).length > 0).sort();
    const fa = here(a);
    const fb = here(b);
    if (fa.length && fb.length) {
      // そこにもともといて動かなかった師団・旅団が1つでもあれば守る側(別の地域から合流した味方も守る側に加わる)。
      // 上陸したばかりの師団は、そこにもともといた側ではない(攻め手になる)
      const stayed = (fs: string[]) => fs.some((f) => state.formations[f]!.region === region && !state.landed?.includes(f));
      const attacker = stayed(fa) && !stayed(fb) ? b : stayed(fb) && !stayed(fa) ? a : null;
      // 海戦は艦隊の全部が出る(母艦と航空隊を離さない)
      const sea = isSea(def, region);
      const pickUnits = (fs: string[]) =>
        fs
          .flatMap((f) => formationUnits(state, f))
          .sort((x, y) => state.units[y]!.strength - state.units[x]!.strength || (x < y ? -1 : 1))
          .slice(0, sea ? Infinity : def.rules.maxUnitsPerBattle);
      battles.push({
        id: `s${state.stage}-${region}`,
        region,
        mission: sea ? "naval" : attacker ? "attack-defense" : "encounter",
        attacker,
        sides: { [a]: { formations: fa, units: pickUnits(fa) }, [b]: { formations: fb, units: pickUnits(fb) } },
        from: Object.fromEntries([...fa, ...fb].map((f) => [f, state.formations[f]!.region])),
      });
    } else {
      const only = fa.length ? a : fb.length ? b : null;
      if (only && state.control[region] !== only) captures.push({ region, side: only });
    }
  }
  return { stage: state.stage, positions, battles, captures, ...(bombard.length ? { bombard } : {}) };
}

/** 戦闘の大きさ(出る部隊の数から) */
/**
 * 戦闘の地図の大きさ(片方の陣営の部隊の数から)。部隊の多い戦闘は、1段階が2日以上あれば、
 * 夜を挟んだ2日にわたる広い戦場(特大)で戦う。1段階が1日なら大まで
 */
function battleSize(n: number, daysPerStage: number): MapSize {
  return n <= 5 ? "s" : n <= 8 ? "m" : daysPerStage >= 2 ? "xl" : "l";
}

/** 築城の地形ごとの、守る側の陣地の段(上に乗らなかった部隊は fallbackLevel)と、陣地ごとの横の幅(片側) */
const FORTIFY = {
  trench: { terrain: "trench", level: 4, fallbackLevel: 2, halfWidthM: 750 },
  cave: { terrain: "cave", level: 5, fallbackLevel: 3, halfWidthM: 500 },
} as const;

/** 戦闘の乱数の種(キャンペーンの種・段階・地域から決まる) */
export function battleSeed(state: CampaignState, battle: CampaignBattle): number {
  let h = (state.seed * 2654435761) >>> 0;
  for (const ch of battle.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % 1_000_000;
}

/**
 * 戦闘の戦術シナリオ(シナリオファイルの形)。地域の地形の傾向で地図を作り、出る部隊を持ち越した状態のまま置く。
 * ID は camp:キャンペーン:段階:地域
 */
export function battleScenarioFile(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv): Record<string, unknown> {
  if (battle.mission === "naval") return navalBattleFile(def, state, battle, env, battleSeed(state, battle));
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
  // 築城した地域:守る側(攻め手でない陣営)が築いた陣営なら、陣地に塹壕線・坑道陣地を敷く
  const defender = battle.attacker ? sideIds.find((s) => s !== battle.attacker) : undefined;
  const works = region.fortified && defender && (!region.fortified.side || region.fortified.side === defender) ? region.fortified.works : undefined;
  const fortify = works ? FORTIFY[works] : undefined;
  const g = generateScenario(
    { mission: battle.mission, biome: region.biome, size: battleSize(n, def.calendar.daysPerStage), era: def.era, seed: battleSeed(state, battle) },
    env.generator,
    env.biomes,
    env.packs,
    {
      forces,
      ...(battle.attacker ? { attacker: sideIds.indexOf(battle.attacker) as 0 | 1 } : {}),
      cards: [],
      ...(fortify ? { fortify } : {}),
      noSecrets: true,
      id: `camp:${def.id}:${state.stage}:${battle.region}`,
      name: `${region.name}の戦い(${stageDate(def, state.stage)})`,
    },
  );
  // 脱出路:総ターンの半分が過ぎた次のターンに、地図の端のどこか(通れる所)に陣営ごとに1つ開く(ユーザー判断:戦場の外へ抜ける道)。
  // 戦略地図の上で囲まれている陣営(下がる先の地域がない)には作らない
  const rules = g.file.rules as { maxTurns: number; escapeRoutes?: unknown[]; weather?: Record<string, unknown> };
  // キャンペーンの天候の予定があれば、戦闘の始めの天候にする
  const w = stageWeather(def, state.stage);
  if (w) rules.weather = { ...(rules.weather ?? {}), initial: w };
  const rng = Rng.fromSeed((battleSeed(state, battle) * 48271 + 11) >>> 0);
  const roles = g.map.roles;
  const cell = g.map.map.cellSizeM;
  const open: [number, number][] = [];
  const edge = (c: number, r: number) => r === 0 || r === roles.length - 1 || c === 0 || c === roles[0]!.length - 1;
  roles.forEach((row, r) => row.forEach((role, c) => edge(c, r) && role !== "peak" && role !== "river" && role !== "bigRiver" && open.push([c, r])));
  const fromTurn = Math.floor(rules.maxTurns / 2) + 1;
  rules.escapeRoutes = sideIds
    .filter((s) => !encircledAt(def, state, s, battle.region))
    .map((s) => {
      const [c, r] = open[Math.floor(rng.next() * open.length)]!;
      return { side: s, x: Math.round((c + 0.5) * cell), y: Math.round((roles.length - r - 0.5) * cell), fromTurn };
    });
  // 戦闘に出た航空隊は、その陣営の航空戦力になる。キャンペーンの rules.air.airOps があれば航空司令部(docs/air-design.md)として渡す
  const forcesAir = battleAirForces(def, state, battle);
  if (forcesAir) {
    (rules as { airForces?: unknown[] }).airForces = forcesAir.airForces;
    const packs = g.file.packs as { weapons: string | string[]; toe: string | string[] };
    for (const k of ["weapons", "toe"] as const) {
      const v = Array.isArray(packs[k]) ? (packs[k] as string[]) : [packs[k] as string];
      packs[k] = [...v, ...forcesAir.packs.filter((p) => !v.includes(p))];
    }
    return g.file;
  }
  const air = battleAirRules(def, state, battle);
  if (Object.keys(air).length) (rules as { air?: Record<string, unknown> }).air = { ...((rules as { air?: Record<string, unknown> }).air ?? {}), ...air };
  return g.file;
}

/** 戦略地図の上で囲まれているか:戦闘の地域の隣に、自陣営が押さえていて敵のいない地域がない(負けても下がる先がない) */
export function encircledAt(def: CampaignDef, state: CampaignState, side: string, region: string): boolean {
  const enemyIn = (r: string) => Object.values(state.formations).some((x) => x.region === r && x.side !== side);
  return !moves(def, region).some((r) => state.control[r] === side && !enemyIn(r));
}

export function battleScenario(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv): LoadedScenario {
  const r = buildScenario(battleScenarioFile(def, state, battle, env), env.packs);
  if (!r.ok) throw new Error(`戦闘 ${battle.id} のシナリオが作れません:\n${r.errors.join("\n")}`);
  return r.value;
}

/** 戦術の戦闘の結果を、キャンペーンの決着に直す(出た部隊の終わったときの状態) */
export function outcomeOf(
  result: VictoryResult,
  finalUnits: readonly { id: string; strength: number; morale: number; ammo: number; fuel: number; fatigue: number }[],
  played: boolean,
  escaped: readonly string[] = [],
  airGroups?: Record<string, { fighters: number; attack: number }>,
  airLosses?: Record<string, number>,
): BattleOutcome {
  return {
    ...(escaped.length ? { escaped: [...escaped] } : {}),
    ...(airLosses ? { airLosses: { ...airLosses } } : {}),
    ...(airGroups && Object.keys(airGroups).length ? { airGroups: structuredClone(airGroups) } : {}),
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
  const escaped = out.final.escaped ?? [];
  return outcomeOf(out.result, [...out.final.units, ...escaped], false, escaped.map((u) => u.id), out.final.airGroups, airLossesOf(out.final.airOps));
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
  delete next.landed;
  const report: StageReport = { stage: state.stage, date: stageDate(def, state.stage), battles: [], captures: [], destroyed: [] };
  for (const [f, r] of Object.entries(plan.positions)) if (next.formations[f]) next.formations[f]!.region = r;
  const sideIds = def.sides.map((s) => s.id);
  const other = (s: string) => sideIds.find((x) => x !== s)!;
  const lose = (side: string, hp: number) => (next.lost[side] = (next.lost[side] ?? 0) + hp);
  const airReports: AirReport[] = [];

  for (const battle of plan.battles) {
    const outcome = played[battle.id] ?? autoResolve(def, state, battle, env);
    const losses: Record<string, number> = Object.fromEntries(sideIds.map((s) => [s, 0]));
    carryBattleAir(next, battle, outcome.airGroups, airReports, def, outcome.airLosses, battle.mission === "naval" ? { units: landAirUnits(def, state, battle, env), final: outcome.units } : undefined);
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
        // (脱出路から撤退した部隊は、戦力を保ったまま去ったので失わない)
        if (outcome.level === "decisive" && outcome.winner && outcome.winner !== s && !outcome.escaped?.includes(id)) u.strength *= 1 - def.rules.decisiveExtraLoss;
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
      // 艦隊への空襲は、叩かれた艦隊が下がるだけ(航空隊は海域を押さえない)
      if (!battle.airRaid) next.control[battle.region] = winner;
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

  // 飛行場への艦砲射撃(夜):命じた艦隊が、段階の終わりにその海域に残っていれば(負けて下がっていなければ)、
  // 目標の飛行場の敵の航空隊の編隊を壊し、その段階の補充を止める
  const bombarded = new Set<string>();
  for (const b of plan.bombard ?? []) {
    const f = next.formations[b.formation];
    if (!f || f.region !== plan.positions[b.formation] || !bombardable(def, next, f.side, f.region).includes(b.region)) continue;
    const bw = def.rules.bombardment;
    const share = Math.min(
      bw.maxShare,
      Object.values(next.units)
        .filter((u) => u.formation === b.formation)
        .reduce((t, u) => t + (bw.weights[toes[u.toe]?.ship?.type ?? ""] ?? 0) * u.strength, 0),
    );
    if (share <= 0) continue;
    let groups = 0;
    for (const w of Object.values(next.wings ?? {})) {
      if (w.base !== b.region || w.side === f.side) continue;
      groups += (w.fighters + w.strike) * share;
      w.fighters = Math.round(w.fighters * (1 - share) * 100) / 100;
      w.strike = Math.round(w.strike * (1 - share) * 100) / 100;
    }
    bombarded.add(b.region);
    (report.bombardments ??= []).push({ formation: b.formation, region: b.region, share: Math.round(share * 100) / 100, groups: Math.round(groups * 100) / 100 });
  }

  // 母艦を失った航空隊は、降りる所がなく失われる
  for (const [id, u] of Object.entries(next.units)) {
    if (u.base && !next.units[u.base]) {
      lose(u.side, hpOf(toes, u));
      delete next.units[id];
    }
  }

  // 師団・旅団の部隊がいなくなったら消す
  for (const f of Object.keys(next.formations)) if (formationUnits(next, f).length === 0) delete next.formations[f];

  // 戦略の航空任務(戦闘の後の居場所で):地域の敵部隊・補給・航空基地への攻撃と迎撃
  // 飛べない天候の段階は、戦略の航空任務を出さない(航空隊は基地にいる)
  const airOrders = stageFlyable(def, state.stage, env) ? (plan.air ?? {}) : Object.fromEntries(Object.keys(plan.air ?? {}).map((s) => [s, []]));
  const { cut, damaged } = next.wings ? resolveStrategicAir(def, next, airOrders, (u) => hpOf(toes, u), lose, airReports) : { cut: {}, damaged: new Set<string>() };
  for (const r of bombarded) damaged.add(r);

  // 補給と補充:補給の源から自陣営の地域をたどって届く師団・旅団は、補充・士気の回復・携行備蓄の満タン。届かなければ備蓄が減る。
  // 補給を空から叩かれた地域(cut)は、その割合だけ補充と備蓄の戻りが減る
  for (const s of sideIds) {
    const reach = suppliedRegions(def, next, s);
    // 夜の輸送(東京急行)の陣営:敵に押さえられた海域でも敵の艦隊がいなければ、夜に少しだけ補給が届く
    const express = def.rules.nightExpress[s];
    const night = express ? suppliedRegions(def, next, s, true) : reach;
    for (const u of Object.values(next.units)) {
      if (u.side !== s) continue;
      const region = next.formations[u.formation]?.region;
      // 艦隊:港にいれば修理と補給、港の外では直らない(補給の届く海域なら弾薬・燃料だけ戻る)
      if (region && isSea(def, region)) {
        if (inPort(def, next, s, region, reach)) {
          const before = hpOf(toes, u);
          u.strength = Math.min(1, u.strength + def.rules.navalRepairPerStage);
          lose(s, -(hpOf(toes, u) - before));
          u.morale = Math.min(1, u.morale + def.rules.moraleRecoveryPerStage);
          u.ammo = 1;
          u.fuel = 1;
        } else if (reach.has(region)) {
          u.morale = Math.min(1, u.morale + def.rules.moraleRecoveryPerStage / 2);
          u.ammo = Math.max(u.ammo, 0.8);
          u.fuel = Math.max(u.fuel, 0.8);
        } else {
          u.ammo = Math.max(0.05, u.ammo - def.rules.unsuppliedStockLoss);
          u.fuel = Math.max(0.05, u.fuel - def.rules.unsuppliedStockLoss);
        }
        u.fatigue = 0;
        continue;
      }
      if (region && (reach.has(region) || night.has(region))) {
        const k = (1 - (cut[s]?.[region] ?? 0)) * (reach.has(region) ? 1 : (express?.supplyShare ?? 0));
        const before = hpOf(toes, u);
        u.strength = Math.min(1, u.strength + def.rules.replacementPerStage * k);
        // 補充は失った戦力から差し引く(損耗率は、取り戻した分だけ下がる)
        lose(s, -(hpOf(toes, u) - before));
        u.morale = Math.min(1, u.morale + def.rules.moraleRecoveryPerStage);
        // 陣営の備蓄の上限(燃料・弾薬の足りない陣営)より上には戻らない
        const cap = def.rules.stockCap[s];
        u.ammo = Math.max(u.ammo, Math.min(k, cap?.ammo ?? 1));
        u.fuel = Math.max(u.fuel, Math.min(k, cap?.fuel ?? 1));
        u.fatigue = 0;
      } else {
        u.ammo = Math.max(0.05, u.ammo - def.rules.unsuppliedStockLoss);
        u.fuel = Math.max(0.05, u.fuel - def.rules.unsuppliedStockLoss);
        u.fatigue = Math.max(0, u.fatigue - 0.5);
      }
    }
  }

  // 増援:次の段階の始めに着く師団・旅団。着く地域が敵のものか敵がいれば、自陣営の補給の源(補給の届く所)へ。どこもなければ来ない
  // 海を渡って来る増援は、通る海域を敵に押さえられていれば遅れる(押さえが解けた段階に着く)
  const delayed = new Set(state.delayed ?? []);
  for (const f of def.formations) {
    const due = (f.arriveStage ?? 1) === state.stage + 1 || delayed.has(f.id);
    if (!due || next.formations[f.id]) continue;
    delayed.delete(f.id);
    // 夜の輸送(東京急行):押さえられた海域でも敵の艦隊がいなければ着く。敵の航空隊が届く海域なら戦力を失う
    let expressLoss = 0;
    if (f.via && next.control[f.via] && next.control[f.via] !== f.side) {
      const ex = def.rules.nightExpress[f.side];
      const enemyFleet = Object.values(next.formations).some((x) => x.region === f.via && x.side !== f.side);
      if (!f.express || !ex || enemyFleet) {
        delayed.add(f.id);
        (report.delayed ??= []).push(f.id);
        continue;
      }
      const enemyAir = Object.entries(next.wings ?? {}).some(([id, w]) => w.side !== f.side && w.strike + w.fighters > 0 && inRange(def, next, id, f.via!));
      expressLoss = enemyAir ? ex.loss : 0;
      (report.expressed ??= []).push({ formation: f.id, loss: expressLoss });
    }
    // 運ぶ途中で失った戦力は損耗に数える(始めの戦力も総数に入れる)
    const arrive = (units: Record<string, UnitState>) => {
      if (expressLoss > 0)
        for (const u of Object.values(units)) {
          const before = hpOf(toes, u);
          u.strength = Math.max(0.01, u.strength * (1 - expressLoss));
          const lost = before - hpOf(toes, u);
          lose(f.side, lost);
          next.forceTotals[f.side] = (next.forceTotals[f.side] ?? 0) + lost;
        }
      return units;
    };
    // 上陸:敵の地域でも上がる。敵がいなければ押さえ、敵がいれば次の段階に上陸した側が攻め手になって戦う(負ければ下がる先がなく壊滅しうる)
    if (f.landing && !isSea(def, f.region)) {
      if (Object.values(next.formations).some((x) => x.region === f.region && x.side !== f.side)) (next.landed ??= []).push(f.id);
      else next.control[f.region] = f.side;
      next.formations[f.id] = { side: f.side, region: f.region };
      const landed = arrive(unitsOf(def, f));
      Object.assign(next.units, landed);
      next.forceTotals[f.side] = (next.forceTotals[f.side] ?? 0) + Object.values(landed).reduce((t, u) => t + hpOf(toes, u), 0);
      (report.arrivals ??= []).push({ formation: f.id, region: f.region });
      continue;
    }
    const sea = isSea(def, f.region);
    const free = (r: string) =>
      sea ? !Object.values(next.formations).some((x) => x.region === r && x.side !== f.side) : next.control[r] === f.side && !Object.values(next.formations).some((x) => x.region === r && x.side !== f.side);
    const region = free(f.region)
      ? f.region
      : Object.keys(def.regions)
          .filter((r) => (sea ? isSea(def, r) && next.control[r] === f.side : def.regions[r]!.supply === f.side) && free(r))
          .sort()[0];
    if (!region) continue;
    next.formations[f.id] = { side: f.side, region };
    const added = arrive(unitsOf(def, f));
    Object.assign(next.units, added);
    next.forceTotals[f.side] = (next.forceTotals[f.side] ?? 0) + Object.values(added).reduce((t, u) => t + hpOf(toes, u), 0);
    (report.arrivals ??= []).push({ formation: f.id, region });
  }

  if (next.wings) addAirReport(report, airReports, airUpkeep(def, next, airOrders, (s) => suppliedRegions(def, next, s), damaged, state.stage + 1));

  if (delayed.size) next.delayed = [...delayed].sort();
  else delete next.delayed;
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
  // 艦隊は、敵の艦隊のいない隣の海域へ(敵に押さえられていない所。自陣営の所が先)
  const sea = isSea(def, from);
  const options = moves(def, from)
    .filter((r) => (sea ? state.control[r] === f.side || state.control[r] == null : state.control[r] === f.side) && !enemyIn(r))
    .sort((x, y) => Number(reach.has(y)) - Number(reach.has(x)) || (x < y ? -1 : 1));
  if (options[0]) {
    f.region = options[0];
    return;
  }
  for (const id of formationUnits(state, formation)) delete state.units[id];
  delete state.formations[formation];
  report.destroyed.push(formation);
}

/** 艦隊が港にいるか:海域の隣に、陣営が押さえていて補給の届く港(port か補給の源)がある */
export function inPort(def: CampaignDef, state: CampaignState, side: string, zone: string, reach: Set<string> = suppliedRegions(def, state, side)): boolean {
  return neighbors(def, zone).some((r) => !isSea(def, r) && state.control[r] === side && reach.has(r) && (def.regions[r]!.port || def.regions[r]!.supply === side));
}

/** 補給の届く地域:陣営が押さえている補給の源から、陣営の地域をたどって届く所 */
export function suppliedRegions(def: CampaignDef, state: CampaignState, side: string, nightExpress = false): Set<string> {
  const out = new Set<string>();
  // 港の補給の源(supplyVia)は、その海域を敵に押さえられると働かない。海域は敵に押さえられていなければ通る(海上の補給路)。
  // nightExpress:敵に押さえられた海域も、敵の艦隊がいなければ通る(夜の輸送)
  const enemyFleet = (r: string) => Object.values(state.formations).some((f) => f.region === r && f.side !== side);
  const open = (r: string) =>
    isSea(def, r) ? state.control[r] == null || state.control[r] === side || (nightExpress && !enemyFleet(r)) : state.control[r] === side;
  const stack = Object.entries(def.regions)
    .filter(([r, g]) => g.supply === side && state.control[r] === side && (!g.supplyVia || open(g.supplyVia)))
    .map(([r]) => r);
  for (const r of stack) out.add(r);
  while (stack.length) {
    const r = stack.pop()!;
    for (const n of neighbors(def, r)) {
      if (out.has(n) || !open(n)) continue;
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
