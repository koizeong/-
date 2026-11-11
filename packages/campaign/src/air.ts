import type { CampaignDef } from "./schema.js";
import type { CampaignBattle, CampaignState, StagePlan, StageReport, UnitState } from "./campaign.js";
import type { LandAirUnit } from "./naval.js";

/**
 * キャンペーンの航空隊(作戦の層)。航空基地に置いた航空隊を、段階ごとに次のどれかに出す:
 * cap(基地の範囲の上空を守り、敵の戦略の任務を迎え撃つ。命令しなければこれ)、units(地域の敵部隊の戦力・士気を削る)、
 * supply(地域の敵部隊の携行備蓄と、その段階の補充を削る)、airfield(敵の航空基地の編隊を地上で壊す)、
 * battle(その地域の戦闘に出る:戦術の戦闘で司令部コマンドの航空作戦に使える編隊になる)、rebase(ほかの航空基地へ移る)。
 * 届くのは基地から rangeKm 以内の地域だけ。数値の決まりはキャンペーンの rules.air(仮置き)
 */

export type AirMission = "cap" | "units" | "supply" | "airfield" | "battle" | "rebase";
export const AIR_MISSIONS: readonly AirMission[] = ["cap", "units", "supply", "airfield", "battle", "rebase"];

/** 航空隊の今の状態(編隊の数は失った分だけ減る。小数のこともある) */
export interface WingState {
  side: string;
  base: string;
  fighters: number;
  strike: number;
}

export interface CampaignAirOrder {
  wing: string;
  mission: AirMission;
  /** 任務の地域(cap のほかは要る) */
  region?: string;
  /**
   * 戦闘に出す割合(battle のときだけ。0〜1、省略は全部)。戦術の戦闘では航空司令部の allotment に min = max で渡す(キャンペーンの裁量。ユーザー判断)。
   * 出さなかった分は、その戦闘で失わない
   */
  share?: number;
}

/** 段階の航空の記録 */
export interface AirReport {
  wing: string;
  side: string;
  mission: AirMission;
  region?: string;
  /** 出た編隊の数 */
  sent: { fighters: number; strike: number };
  /** 失った編隊の数(迎撃・対空砲・戦術の戦闘) */
  lost: { fighters: number; strike: number };
  /** 迎え撃って落とした敵の編隊の数(cap の航空隊) */
  kills?: number;
  /** 戦略の任務の効き目(届いた攻撃機の編隊の数と、与えた損害) */
  effect?: { groups: number; units?: number; strength?: number; morale?: number; stock?: number; cut?: number; destroyed?: number };
}

export interface AirUpkeepReport {
  /** 基地を失って移った航空隊・移る先がなく失われた航空隊・着いた増援 */
  rebased: { wing: string; to: string }[];
  destroyed: string[];
  arrivals: { wing: string; base: string }[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 始めからいる航空隊 */
export function startWings(def: CampaignDef): Record<string, WingState> {
  return Object.fromEntries(def.airWings.filter((w) => (w.arriveStage ?? 1) <= 1).map((w) => [w.id, { side: w.side, base: w.base, fighters: w.fighters, strike: w.strike }]));
}

/** 2つの地域の距離(km。作戦地図の位置から) */
export function distanceKm(def: CampaignDef, a: string, b: string): number {
  const p = def.regions[a];
  const q = def.regions[b];
  if (!p || !q) return Infinity;
  return Math.hypot(p.x - q.x, p.y - q.y);
}

export const wingDef = (def: CampaignDef, id: string) => def.airWings.find((w) => w.id === id);

/** 航空隊の基地から届くか */
export function inRange(def: CampaignDef, state: CampaignState, wing: string, region: string): boolean {
  const w = state.wings?.[wing];
  const d = wingDef(def, wing);
  return !!w && !!d && distanceKm(def, w.base, region) <= d.rangeKm + 1e-9;
}

/** 航空の命令を確かめる(自陣営の航空隊で、任務の地域が届く所)。誤りの文を返す */
export function checkAirOrders(def: CampaignDef, state: CampaignState, side: string, orders: readonly CampaignAirOrder[], plan: StagePlan | null): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    const w = state.wings?.[o.wing];
    if (!w) {
      errors.push(`航空隊 "${o.wing}" がありません`);
      continue;
    }
    if (w.side !== side) {
      errors.push(`"${o.wing}" は自陣営の航空隊ではありません`);
      continue;
    }
    if (seen.has(o.wing)) errors.push(`"${o.wing}" に命令が2つあります`);
    seen.add(o.wing);
    if (!AIR_MISSIONS.includes(o.mission)) {
      errors.push(`"${o.wing}" の任務 "${String(o.mission)}" はありません`);
      continue;
    }
    if (o.share !== undefined && (o.mission !== "battle" || !(o.share > 0 && o.share <= 1))) errors.push(`"${o.wing}" の出す割合は、戦闘に出すときだけ 0〜1 で書けます`);
    if (o.mission === "cap") continue;
    if (!o.region || !def.regions[o.region]) {
      errors.push(`"${o.wing}" の任務の地域がありません`);
      continue;
    }
    if (!inRange(def, state, o.wing, o.region)) {
      errors.push(`"${o.wing}" は ${def.regions[o.region]!.name} に届きません(航続距離の外)`);
      continue;
    }
    if ((o.mission === "units" || o.mission === "supply" || o.mission === "airfield") && w.strike <= 0) errors.push(`"${o.wing}" には攻撃機がありません`);
    if (o.mission === "airfield" && (!def.regions[o.region]!.airbase || state.control[o.region] === side)) errors.push(`${def.regions[o.region]!.name} は敵の航空基地ではありません`);
    if (o.mission === "rebase" && (!def.regions[o.region]!.airbase || state.control[o.region] !== side)) errors.push(`${def.regions[o.region]!.name} は自陣営の航空基地ではありません`);
    if (o.mission === "battle" && !plan?.battles.some((b) => b.region === o.region && (b.sides[side]?.units.length ?? 0) > 0)) errors.push(`${def.regions[o.region]!.name} には自陣営の出る戦闘がありません`);
  }
  return errors;
}

/**
 * 航空の命令を段階の割り出しに当てる:戦闘に出る航空隊を、戦闘ごとに記す。
 * def・state を渡すと、海域の敵の艦隊への部隊攻撃(units)は海戦になる(空母の艦載機と同じ盤上の航空隊で艦を1隻ずつ叩く):
 * その海域で海戦があればそれに加わり、なければ「艦隊への空襲」の海戦を作る(攻め手は航空隊だけ)
 */
export function assignAir(plan: StagePlan, orders: Record<string, readonly CampaignAirOrder[]>, def?: CampaignDef, state?: CampaignState): StagePlan {
  const toSea = (o: CampaignAirOrder, side: string) => {
    if (!def || !state || o.mission !== "units" || !o.region || !def.regions[o.region]?.sea || !def.naval) return false;
    return Object.entries(plan.positions).some(([f, r]) => r === o.region && state.formations[f] && state.formations[f]!.side !== side && Object.values(state.units).some((u) => u.formation === f));
  };
  // 海域の艦隊への部隊攻撃は、海戦に出る命令に直す
  orders = Object.fromEntries(Object.entries(orders).map(([side, list]) => [side, list.map((o) => (toSea(o, side) ? { ...o, mission: "battle" as const } : o))]));
  const raids: CampaignBattle[] = [];
  if (def && state) {
    for (const [side, list] of Object.entries(orders)) {
      for (const o of list) {
        if (o.mission !== "battle" || !o.region || !def.regions[o.region]?.sea) continue;
        if (plan.battles.some((b) => b.region === o.region) || raids.some((b) => b.region === o.region && b.attacker === side)) continue;
        const enemy = def.sides.map((x) => x.id).find((x) => x !== side)!;
        const fleets = Object.keys(plan.positions)
          .filter((f) => plan.positions[f] === o.region && state.formations[f]?.side === enemy)
          .filter((f) => Object.values(state.units).some((u) => u.formation === f))
          .sort();
        if (!fleets.length) continue;
        const units = Object.entries(state.units)
          .filter(([, u]) => fleets.includes(u.formation))
          .map(([id]) => id)
          .sort();
        raids.push({
          id: `s${plan.stage}-${o.region}-air-${side}`,
          region: o.region,
          mission: "naval",
          attacker: side,
          airRaid: true,
          sides: { [side]: { formations: [], units: [] }, [enemy]: { formations: fleets, units } },
          from: Object.fromEntries(fleets.map((f) => [f, state.formations[f]!.region])),
        });
      }
    }
  }
  const battles = [...plan.battles, ...raids].map((b): CampaignBattle => {
    const air: Record<string, string[]> = {};
    const airShare: Record<string, number> = {};
    for (const [side, list] of Object.entries(orders)) {
      const sent = list.filter((o) => o.mission === "battle" && o.region === b.region);
      const ids = sent.map((o) => o.wing).sort();
      if (ids.length && b.sides[side]) air[side] = ids;
      for (const o of sent) if (b.sides[side] && o.share !== undefined && o.share < 1) airShare[o.wing] = o.share;
    }
    const { air: _old, airShare: _oldShare, ...rest } = b;
    return Object.keys(air).length ? { ...rest, air, ...(Object.keys(airShare).length ? { airShare } : {}) } : rest;
  });
  return { ...plan, battles, air: Object.fromEntries(Object.entries(orders).map(([s, l]) => [s, l.map((o) => ({ ...o }))])) };
}

/** 航空司令部で渡すときの、航空司令部・飛行隊の ID(損耗を戻すのに使う) */
export const campaignForceId = (side: string) => `camp-${side}`;
const squadronId = (wing: string, kind: "f" | "s") => `${wing}-${kind}`;

/**
 * 戦闘に出る航空隊を、戦術の戦闘の航空司令部(rules.airForces)に直す(キャンペーンの rules.air.airOps があり、陸の戦闘のときだけ)。
 * 陣営ごとに1つの航空司令部、航空隊ごとに戦闘機・攻撃機の飛行隊。基地は航空隊の基地の地域で、距離と方位は作戦地図の位置から。
 * 航空隊ごとの出す割合は飛行隊の機数に掛ける(同じ陣営で割合が違っても扱えるように、allotment は 1 にする)
 */
export function battleAirForces(def: CampaignDef, state: CampaignState, battle: CampaignBattle): { airForces: Record<string, unknown>[]; packs: string[] } | null {
  const ops = def.rules.air.airOps;
  if (!ops || battle.mission === "naval" || !battle.air) return null;
  const at = def.regions[battle.region]!;
  const airForces: Record<string, unknown>[] = [];
  for (const [side, ids] of Object.entries(battle.air)) {
    const bases: Record<string, unknown>[] = [];
    const squadrons: Record<string, unknown>[] = [];
    for (const id of ids) {
      const w = state.wings?.[id];
      const d = wingDef(def, id);
      if (!w || !d) continue;
      const share = battle.airShare?.[id] ?? 1;
      const base = def.regions[w.base]!;
      if (!bases.some((b) => b.id === w.base)) {
        // 地図の真ん中から見た基地の方位(北が0度・東が90度。作戦地図の y は北が大きい)
        const deg = (Math.atan2(base.x - at.x, base.y - at.y) * 180) / Math.PI;
        bases.push({ id: w.base, name: base.name, distanceM: Math.round(distanceKm(def, w.base, battle.region) * 1000), bearingDeg: Math.round((deg + 360) % 360) });
      }
      const f = Math.round(w.fighters * share * ops.aircraftPerGroup.fighter);
      const s = Math.round(w.strike * share * ops.aircraftPerGroup.strike);
      if (f > 0) squadrons.push({ id: squadronId(id, "f"), name: `${d.name}(戦闘機)`, toe: ops.fighterToe, base: w.base, aircraft: f });
      if (s > 0) squadrons.push({ id: squadronId(id, "s"), name: `${d.name}(攻撃機)`, toe: ops.strikeToe, base: w.base, aircraft: s });
    }
    if (!squadrons.length) continue;
    airForces.push({
      id: campaignForceId(side),
      side,
      name: `${def.sides.find((s) => s.id === side)?.name ?? side}の航空隊`,
      bases,
      squadrons,
      requestsPerDay: ops.requestsPerDay,
      notes: "キャンペーンの航空隊(packages/campaign/src/air.ts の battleAirForces)。出す割合は航空の命令で決めた",
    });
  }
  return airForces.length ? { airForces, packs: ops.packs } : null;
}

/** 戦闘に出る航空隊を、戦術の戦闘のシナリオの航空戦力(rules.air の陣営ごと)に直す */
export function battleAirRules(def: CampaignDef, state: CampaignState, battle: CampaignBattle): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [side, ids] of Object.entries(battle.air ?? {})) {
    const wings = ids.map((id) => ({ s: state.wings?.[id], d: wingDef(def, id) })).filter((x) => x.s && x.d);
    const strike = round2(wings.reduce((t, x) => t + x.s!.strike, 0));
    const fighters = round2(wings.reduce((t, x) => t + x.s!.fighters, 0));
    const lead = wings.find((x) => x.s!.strike > 0)?.d ?? wings[0]?.d;
    if (strike <= 0 && fighters <= 0) continue;
    out[side] = {
      ...(strike > 0 ? { strike: { groups: strike, replacementPerDay: 0, weapon: lead?.weapon ?? def.rules.air.weapon, count: lead?.count ?? def.rules.air.count, strikeMinutes: 10 } } : {}),
      ...(fighters > 0 ? { fighters: { groups: fighters, replacementPerDay: 0 } } : {}),
    };
  }
  return out;
}

/**
 * 戦術の戦闘で失った編隊を、出た航空隊に戻す(戦闘の終わりの編隊の数 ÷ 始めの数を、航空隊ごとに掛ける)。
 * final は戦闘の終わりの状態の airGroups(陣営ごとの戦闘機・攻撃機の編隊の数)
 */
export function carryBattleAir(
  state: CampaignState,
  battle: CampaignBattle,
  final: Record<string, { fighters: number; attack: number }> | undefined,
  reports: AirReport[],
  def?: CampaignDef,
  airLosses?: Record<string, number>,
  landAir?: { units: readonly LandAirUnit[]; final: Record<string, { strength: number }> },
): void {
  // 海戦に出た陸の航空隊:盤上の航空隊のユニットの、終わりの戦力から失った機数を出し、編隊の数に直して引く
  // (分けて出した隊 ID~n がまだ帰っていなければ、その分も残っているとみる)
  if (battle.mission === "naval" && landAir && def) {
    const per = def.rules.air.airOps?.aircraftPerGroup ?? { fighter: def.naval?.landAir.aircraftPerGroup ?? 12, strike: def.naval?.landAir.aircraftPerGroup ?? 12 };
    for (const [side, ids] of Object.entries(battle.air ?? {})) {
      for (const id of ids) {
        const w = state.wings?.[id];
        if (!w) continue;
        const lostPlanes = { fighter: 0, strike: 0 };
        for (const x of landAir.units.filter((u) => u.wing === id && u.kind !== "scout")) {
          const left = Object.entries(landAir.final)
            .filter(([k]) => k === x.id || k.startsWith(`${x.id}~`))
            .reduce((t, [, f]) => t + Math.max(0, f.strength), 0);
          lostPlanes[x.kind as "fighter" | "strike"] += x.planes * Math.max(0, 1 - Math.min(1, left / x.strength));
        }
        const share = battle.airShare?.[id] ?? 1;
        const lost = { fighters: round2(Math.min(w.fighters, lostPlanes.fighter / per.fighter)), strike: round2(Math.min(w.strike, lostPlanes.strike / per.strike)) };
        reports.push({ wing: id, side, mission: "battle", region: battle.region, sent: { fighters: round2(w.fighters * share), strike: round2(w.strike * share) }, lost });
        w.fighters = round2(w.fighters - lost.fighters);
        w.strike = round2(w.strike - lost.strike);
      }
    }
    return;
  }
  // 航空司令部で渡した戦闘:飛行隊ごとに失った機数を、編隊の数に直して引く
  if (def?.rules.air.airOps && battle.mission !== "naval") {
    const per = def.rules.air.airOps.aircraftPerGroup;
    for (const [side, ids] of Object.entries(battle.air ?? {})) {
      for (const id of ids) {
        const w = state.wings?.[id];
        if (!w) continue;
        const share = battle.airShare?.[id] ?? 1;
        const lost = {
          fighters: round2(Math.min(w.fighters, (airLosses?.[`${campaignForceId(side)}:${squadronId(id, "f")}`] ?? 0) / per.fighter)),
          strike: round2(Math.min(w.strike, (airLosses?.[`${campaignForceId(side)}:${squadronId(id, "s")}`] ?? 0) / per.strike)),
        };
        reports.push({ wing: id, side, mission: "battle", region: battle.region, sent: { fighters: round2(w.fighters * share), strike: round2(w.strike * share) }, lost });
        w.fighters = round2(w.fighters - lost.fighters);
        w.strike = round2(w.strike - lost.strike);
      }
    }
    return;
  }
  for (const [side, ids] of Object.entries(battle.air ?? {})) {
    const wings = ids.map((id) => [id, state.wings?.[id]] as const).filter((x): x is readonly [string, WingState] => !!x[1]);
    const f0 = wings.reduce((t, [, w]) => t + w.fighters, 0);
    const s0 = wings.reduce((t, [, w]) => t + w.strike, 0);
    const g = final?.[side];
    const fr = g && f0 > 0 ? Math.min(1, g.fighters / f0) : 1;
    const sr = g && s0 > 0 ? Math.min(1, g.attack / s0) : 1;
    for (const [id, w] of wings) {
      const lost = { fighters: round2(w.fighters * (1 - fr)), strike: round2(w.strike * (1 - sr)) };
      reports.push({ wing: id, side, mission: "battle", region: battle.region, sent: { fighters: round2(w.fighters), strike: round2(w.strike) }, lost });
      w.fighters = round2(w.fighters * fr);
      w.strike = round2(w.strike * sr);
    }
  }
}

/**
 * 戦略の任務を解く(段階の戦闘の後の居場所で)。迎撃:任務の地域に届く敵の cap の航空隊(命令のない航空隊も)の戦闘機が迎え撃つ。
 * 護衛の戦闘機(任務に出た航空隊の戦闘機)が相手をした分は攻撃機に届かず、残りが攻撃機を落とす。届いた攻撃機の数で効き目が決まる。
 * 返すのは、補給への攻撃で削った地域ごとの割合(その段階の補充と備蓄の戻りを減らす)と、壊された航空基地
 */
export function resolveStrategicAir(
  def: CampaignDef,
  state: CampaignState,
  orders: Record<string, readonly CampaignAirOrder[]>,
  hp: (u: UnitState) => number,
  lose: (side: string, hp: number) => void,
  reports: AirReport[],
): { cut: Record<string, Record<string, number>>; damaged: Set<string> } {
  const r = def.rules.air;
  const wings = state.wings ?? {};
  const sideIds = def.sides.map((s) => s.id);
  const ordered = new Map<string, CampaignAirOrder>();
  for (const list of Object.values(orders)) for (const o of list) if (wings[o.wing]) ordered.set(o.wing, o);
  // 迎え撃つ戦闘機:cap(命令のない航空隊も)。迎撃のたびに減る
  const cap = Object.keys(wings)
    .filter((id) => (ordered.get(id)?.mission ?? "cap") === "cap" && wings[id]!.fighters > 0)
    .sort();
  const kills: Record<string, number> = {};
  const cut: Record<string, Record<string, number>> = {};
  const damaged = new Set<string>();
  const raids = [...ordered.values()]
    .filter((o) => o.mission === "units" || o.mission === "supply" || o.mission === "airfield")
    .sort((a, b) => sideIds.indexOf(wings[a.wing]!.side) - sideIds.indexOf(wings[b.wing]!.side) || (a.wing < b.wing ? -1 : 1));
  for (const o of raids) {
    const w = wings[o.wing]!;
    const region = o.region!;
    // 戦闘の結果、任務の地域が届かなくなった(基地を移った)ことはない。届くかは確かめ済み
    const defenders = cap.filter((id) => wings[id]!.side !== w.side && inRange(def, state, id, region));
    const D = defenders.reduce((t, id) => t + wings[id]!.fighters, 0);
    const S = w.strike;
    const E = w.fighters;
    const engaged = Math.min(D, E);
    const free = D - engaged;
    const escortLoss = Math.min(E, r.interceptKill * engaged * 0.5);
    const strikeLoss = Math.min(S, r.interceptKill * free + r.flakLoss * S);
    const defLoss = Math.min(D, r.interceptKill * engaged * 0.5 + r.interceptKill * 0.15 * Math.min(S, free));
    for (const id of defenders) {
      const share = D > 0 ? wings[id]!.fighters / D : 0;
      const l = defLoss * share;
      wings[id]!.fighters = round2(Math.max(0, wings[id]!.fighters - l));
      kills[id] = (kills[id] ?? 0) + (escortLoss + strikeLoss) * share;
    }
    w.fighters = round2(E - escortLoss);
    w.strike = round2(S - strikeLoss);
    const G = Math.max(0, S - strikeLoss);
    const effect: NonNullable<AirReport["effect"]> = { groups: round2(G) };
    if (o.mission === "airfield") {
      // 地上の編隊を壊す(基地にいる敵の航空隊に、編隊の数の割合で振り分ける)と、その段階の補充を止める
      const there = Object.keys(wings).filter((id) => wings[id]!.base === region && wings[id]!.side !== w.side && ordered.get(id)?.mission !== "rebase");
      const total = there.reduce((t, id) => t + wings[id]!.fighters + wings[id]!.strike, 0);
      const destroyed = Math.min(total, r.airfieldGroups * G);
      for (const id of there) {
        const x = wings[id]!;
        const k = total > 0 ? 1 - destroyed / total : 1;
        x.fighters = round2(x.fighters * k);
        x.strike = round2(x.strike * k);
      }
      if (G > 0) damaged.add(region);
      effect.destroyed = round2(destroyed);
    } else {
      const targets = Object.values(state.units).filter((u) => u.side !== w.side && state.formations[u.formation]?.region === region);
      const spread = Math.min(1, r.spreadUnits / Math.max(1, targets.length));
      effect.units = targets.length;
      if (o.mission === "units") {
        const ds = Math.min(r.maxUnitLoss, r.unitStrength * G * spread);
        const dm = r.unitMorale * G * spread;
        for (const u of targets) {
          const before = hp(u);
          u.strength = Math.max(0.01, u.strength * (1 - ds));
          u.morale = Math.max(0.1, u.morale - dm);
          lose(u.side, before - hp(u));
        }
        effect.strength = round2(ds);
        effect.morale = round2(dm);
      } else {
        const dk = r.supplyStock * G * spread;
        for (const u of targets) {
          u.ammo = Math.max(0.05, u.ammo - dk);
          u.fuel = Math.max(0.05, u.fuel - dk);
        }
        const enemy = sideIds.find((s) => s !== w.side)!;
        const c = ((cut[enemy] ??= {})[region] = Math.min(1, (cut[enemy]![region] ?? 0) + r.supplyCut * G));
        effect.stock = round2(dk);
        effect.cut = round2(c);
      }
    }
    reports.push({ wing: o.wing, side: w.side, mission: o.mission, region, sent: { fighters: round2(E), strike: round2(S) }, lost: { fighters: round2(escortLoss), strike: round2(strikeLoss) }, effect });
  }
  for (const id of cap) {
    if (!kills[id]) continue;
    reports.push({ wing: id, side: wings[id]!.side, mission: "cap", sent: { fighters: wings[id]!.fighters, strike: 0 }, lost: { fighters: 0, strike: 0 }, kills: round2(kills[id]!) });
  }
  return { cut, damaged };
}

/**
 * 段階の終わりの航空隊:移る命令の航空隊は移り、基地を敵に取られた航空隊は近い自陣営の航空基地へ(なければ失われる)。
 * 補給の届く、壊されていない基地の航空隊は編隊を取り戻す(始めの数まで)。次の段階に着く航空隊を置く
 */
export function airUpkeep(
  def: CampaignDef,
  state: CampaignState,
  orders: Record<string, readonly CampaignAirOrder[]>,
  supplied: (side: string) => Set<string>,
  damaged: Set<string>,
  nextStage: number,
): AirUpkeepReport {
  const report: AirUpkeepReport = { rebased: [], destroyed: [], arrivals: [] };
  const wings = (state.wings ??= {});
  const enemyIn = (r: string, side: string) => Object.values(state.formations).some((f) => f.region === r && f.side !== side);
  const usable = (r: string, side: string) => !!def.regions[r]?.airbase && state.control[r] === side && !enemyIn(r, side);
  for (const list of Object.values(orders))
    for (const o of list) {
      const w = wings[o.wing];
      if (w && o.mission === "rebase" && o.region && usable(o.region, w.side)) {
        w.base = o.region;
        report.rebased.push({ wing: o.wing, to: o.region });
      }
    }
  for (const id of Object.keys(wings).sort()) {
    const w = wings[id]!;
    if (!usable(w.base, w.side)) {
      const reach = supplied(w.side);
      const to = Object.keys(def.regions)
        .filter((r) => usable(r, w.side))
        .sort((a, b) => Number(reach.has(b)) - Number(reach.has(a)) || distanceKm(def, w.base, a) - distanceKm(def, w.base, b) || (a < b ? -1 : 1))[0];
      if (!to) {
        delete wings[id];
        report.destroyed.push(id);
        continue;
      }
      w.base = to;
      report.rebased.push({ wing: id, to });
    }
    const d = wingDef(def, id);
    if (d && supplied(w.side).has(w.base) && !damaged.has(w.base)) {
      w.fighters = round2(Math.min(d.fighters, w.fighters + (d.fighters > 0 ? def.rules.air.replacementPerStage : 0)));
      w.strike = round2(Math.min(d.strike, w.strike + (d.strike > 0 ? def.rules.air.replacementPerStage : 0)));
    }
    if (w.fighters <= 0.01 && w.strike <= 0.01) {
      delete wings[id];
      report.destroyed.push(id);
    }
  }
  for (const d of def.airWings) {
    if ((d.arriveStage ?? 1) !== nextStage || wings[d.id]) continue;
    const reach = supplied(d.side);
    const base = usable(d.base, d.side)
      ? d.base
      : Object.keys(def.regions)
          .filter((r) => usable(r, d.side) && reach.has(r))
          .sort()[0];
    if (!base) continue;
    wings[d.id] = { side: d.side, base, fighters: d.fighters, strike: d.strike };
    report.arrivals.push({ wing: d.id, base });
  }
  return report;
}

/** 航空の記録を段階の記録に足す */
export function addAirReport(report: StageReport, air: AirReport[], upkeep: AirUpkeepReport): void {
  if (air.length) report.air = air;
  if (upkeep.rebased.length || upkeep.destroyed.length || upkeep.arrivals.length) report.airUpkeep = upkeep;
}

/** 航空隊の武器が、キャンペーンの編成の武器パックにあるか */
export function checkWingWeapons(def: CampaignDef, weapons: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const w of def.airWings) {
    const key = w.weapon ?? def.rules.air.weapon;
    if (w.strike > 0 && !weapons[key]) errors.push(`航空隊 "${w.id}" の武器 "${key}" がありません`);
  }
  return errors;
}
