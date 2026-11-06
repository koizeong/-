import { inRange, type CampaignAirOrder } from "./air.js";
import { campaignToes, inPort, isSea, moves, suppliedRegions, unitPower, stageRng, type CampaignEnv, type CampaignOrder, type CampaignState, type StagePlan } from "./campaign.js";
import type { CampaignDef } from "./schema.js";

/** 攻めに出るのに要る、攻める戦力 ÷ 相手の地域の戦力(始め)。終わりに近づくほど下がり、最後は ATTACK_RATIO_LATE */
const ATTACK_RATIO = 1.3;
const ATTACK_RATIO_LATE = 0.8;
/** 勝利点で負けているときに、攻めに出る閾値に掛ける倍率(追い込まれた側は危険を冒す) */
const BEHIND_FACTOR = 0.8;
/** 敵が隣にいる地域に残しておく戦力(隣の敵のいちばん大きな戦力に対する割合) */
const HOLD_SHARE = 0.7;

/**
 * 作戦の層の AI:師団・旅団ごとに、地域を守るか、隣の地域へ攻めるか、前線へ寄せるかを決める。
 * 隣に敵がいる地域には、敵の7割ほどの戦力を残して守り、残りで勝てそうな隣の地域を攻める。攻めに出る戦力比は、
 * 始めは1.3倍、キャンペーンの終わりに近づくほど下げ(期限が迫れば危険を冒す)、勝利点で負けていればさらに下げる。
 * 価値の高い地域(勝利条件の地域)を先に狙う。前線にいない師団・旅団は、いちばん近い前線の地域へ寄せる。
 * 今は相手の師団・旅団の居場所が見えている前提(作戦の層の霧はまだない)
 */
export function campaignOrders(def: CampaignDef, state: CampaignState, side: string, env: CampaignEnv): CampaignOrder[] {
  const toes = campaignToes(def, env);
  const rng = stageRng(state, side);
  const power = (f: string) =>
    Object.values(state.units)
      .filter((u) => u.formation === f)
      .reduce((t, u) => t + unitPower(env, toes, u), 0);
  const formationsIn = (region: string, s: string) =>
    Object.entries(state.formations)
      .filter(([, f]) => f.region === region && f.side === s)
      .map(([id]) => id)
      .sort();
  const enemySides = def.sides.map((s) => s.id).filter((s) => s !== side);
  const enemyPower = (region: string) => enemySides.reduce((t, s) => t + formationsIn(region, s).reduce((u, f) => u + power(f), 0), 0);
  // 海域は、港の補給の源や海を渡る増援が通るなら、それだけ値打ちがある
  const seaLane = (region: string) => (Object.values(def.regions).some((g) => g.supplyVia === region) || def.formations.some((f) => f.via === region) ? 2 : 0);
  const value = (region: string) =>
    1 + seaLane(region) + Object.values(def.victory).reduce((t, v) => t + v.conditions.reduce((u, c) => u + (c.type === "region" && c.region === region ? c.points : 0), 0), 0);
  const hostile = (region: string) => state.control[region] !== side || enemyPower(region) > 0;
  // 攻めに出る戦力比:期限が迫るほど、勝利点で負けているほど低い
  const progress = Math.min(1, (state.stage - 1) / Math.max(1, def.calendar.stages - 1));
  const points = (s: string) => (def.victory[s]?.conditions ?? []).reduce((t, c) => t + (c.type === "region" && state.control[c.region] === s ? c.points : 0), 0);
  const behind = enemySides.some((e) => points(e) > points(side));
  const needRatio = (ATTACK_RATIO + (ATTACK_RATIO_LATE - ATTACK_RATIO) * progress) * (behind ? BEHIND_FACTOR : 1);
  const front = new Set(Object.keys(def.regions).filter((r) => state.control[r] === side && moves(def, r).some(hostile)));

  const orders: CampaignOrder[] = [];
  // 傷ついた艦隊(艦の戦力の平均が navalRetireBelow 未満)は、港にいなければいちばん近い港の海域へ下がる(港では修理を受ける)
  const reach = suppliedRegions(def, state, side);
  const retiring = new Set<string>();
  for (const [id, f] of Object.entries(state.formations).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (f.side !== side || !isSea(def, f.region)) continue;
    const ships = Object.values(state.units).filter((u) => u.formation === id);
    const avg = ships.reduce((t, u) => t + u.strength, 0) / Math.max(1, ships.length);
    if (avg >= def.rules.navalRetireBelow) continue;
    retiring.add(id);
    if (inPort(def, state, side, f.region, reach)) continue;
    const step = towardPort(def, state, side, f.region, reach);
    if (step) orders.push({ formation: id, to: step });
  }
  const regions = [...new Set(Object.values(state.formations).filter((f) => f.side === side).map((f) => f.region))].sort();
  for (const region of regions) {
    const mine = formationsIn(region, side)
      .filter((f) => !retiring.has(f))
      .sort((a, b) => power(b) - power(a) || (a < b ? -1 : 1));
    // 守りに残す:攻める先を除いた隣の敵のうち、いちばん大きな戦力の7割まで(隣に敵がいれば最低1つ)。残りが手の空いた戦力
    const split = (except: string | null) => {
      const threat = Math.max(0, ...moves(def, region).filter((r) => r !== except).map(enemyPower));
      let kept = 0;
      const free: string[] = [];
      for (const f of mine) {
        if (threat > 0 && (kept < threat * HOLD_SHARE || kept === 0)) kept += power(f);
        else free.push(f);
      }
      return free;
    };
    // 攻める:隣の敵の地域で、手の空いた戦力で勝てそうな所(価値 × 戦力比が大きい所)。攻める先の敵は、攻めれば足止めできるので守りの勘定から外す
    const targets = moves(def, region)
      .filter(hostile)
      .map((r) => {
        const free = split(r);
        const ratio = free.reduce((t, f) => t + power(f), 0) / Math.max(1, enemyPower(r));
        return { r, free, ratio, score: value(r) * Math.min(3, ratio) * (0.9 + 0.2 * rng.next()) };
      })
      .filter((t) => t.free.length > 0 && t.ratio >= needRatio)
      .sort((a, b) => b.score - a.score || (a.r < b.r ? -1 : 1));
    if (targets[0]) {
      for (const f of targets[0].free) orders.push({ formation: f, to: targets[0].r });
      continue;
    }
    // 前線にいなければ、いちばん近い前線の地域へ寄せる(自陣営の地域をたどる)
    const free = split(null);
    if (free.length && !front.has(region)) {
      const step = towardFront(def, state, side, region, front);
      if (step) for (const f of free) orders.push({ formation: f, to: step });
    }
  }
  return orders;
}

/** 海域をたどって(敵の艦隊のいない所を)、いちばん近い港の海域へ向かう最初の一歩。なければ null */
function towardPort(def: CampaignDef, state: CampaignState, side: string, from: string, reach: Set<string>): string | null {
  const enemyIn = (r: string) => Object.values(state.formations).some((f) => f.region === r && f.side !== side);
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const r = queue.shift()!;
    if (r !== from && inPort(def, state, side, r, reach)) {
      let step = r;
      while (prev.get(step) !== from) step = prev.get(step)!;
      return step;
    }
    for (const n of moves(def, r).sort()) {
      if (prev.has(n) || enemyIn(n)) continue;
      prev.set(n, r);
      queue.push(n);
    }
  }
  return null;
}

/** 自陣営の地域をたどって、いちばん近い前線の地域へ向かう最初の一歩 */
function towardFront(def: CampaignDef, state: CampaignState, side: string, from: string, front: Set<string>): string | null {
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const r = queue.shift()!;
    if (front.has(r) && r !== from) {
      let step = r;
      while (prev.get(step) !== from) step = prev.get(step)!;
      return step;
    }
    for (const n of moves(def, r).sort()) {
      if (prev.has(n) || (isSea(def, n) ? state.control[n] != null && state.control[n] !== side : state.control[n] !== side)) continue;
      prev.set(n, r);
      queue.push(n);
    }
  }
  return null;
}

/** 戦闘機の編隊が攻撃機の編隊のこの倍より多い航空隊は、上空を守る(cap) */
const FIGHTER_HEAVY = 1.5;
/** 届く戦闘があるときに、攻撃機の航空隊を戦略の任務に回す割合 */
const STRATEGIC_SHARE = 0.3;
/** 航空基地を叩くのに要る、基地の敵の編隊の数 */
const AIRFIELD_MIN_GROUPS = 1;

/**
 * 作戦の層の AI の航空の命令(段階の割り出しの後で決める)。
 * 戦闘機の多い航空隊は上空を守り、攻撃機のある航空隊は、届く範囲に自陣営の出る戦闘があればいちばん大きな戦闘へ出る(戦闘ごとに順に振り分ける。
 * 3割ほどは戦略の任務へ)。戦闘がなければ、届く敵の航空基地に編隊が多ければそこを、なければ敵部隊のいちばん多い地域の部隊か補給を叩く
 */
export function campaignAirOrders(def: CampaignDef, state: CampaignState, side: string, plan: StagePlan, env: CampaignEnv): CampaignAirOrder[] {
  const wings = state.wings ?? {};
  const toes = campaignToes(def, env);
  const rng = stageRng(state, `${side}:air`);
  const enemyAt = (region: string) =>
    Object.entries(plan.positions)
      .filter(([f, r]) => r === region && state.formations[f] && state.formations[f]!.side !== side)
      .reduce((t, [f]) => t + Object.values(state.units).filter((u) => u.formation === f).reduce((x, u) => x + unitPower(env, toes, u), 0), 0);
  const battles = plan.battles
    .filter((b) => (b.sides[side]?.units.length ?? 0) > 0)
    .map((b) => ({ b, weight: enemyAt(b.region) }))
    .sort((x, y) => y.weight - x.weight || (x.b.id < y.b.id ? -1 : 1));
  const used = new Map<string, number>();
  const orders: CampaignAirOrder[] = [];
  for (const id of Object.keys(wings).sort()) {
    const w = wings[id]!;
    if (w.side !== side) continue;
    if (w.strike <= 0 || w.fighters > w.strike * FIGHTER_HEAVY) {
      orders.push({ wing: id, mission: "cap" });
      continue;
    }
    // 届く戦闘があっても、3割ほどは戦略の任務に回す(敵の部隊・補給・航空基地を削る)
    const reach = battles.filter((x) => inRange(def, state, id, x.b.region)).sort((x, y) => (used.get(x.b.id) ?? 0) - (used.get(y.b.id) ?? 0));
    if (reach[0] && rng.next() >= STRATEGIC_SHARE) {
      used.set(reach[0].b.id, (used.get(reach[0].b.id) ?? 0) + 1);
      orders.push({ wing: id, mission: "battle", region: reach[0].b.region });
      continue;
    }
    const airfield = Object.keys(def.regions)
      .filter((r) => def.regions[r]!.airbase && state.control[r] !== side && inRange(def, state, id, r))
      .map((r) => ({ r, groups: Object.values(wings).filter((x) => x.side !== side && x.base === r).reduce((t, x) => t + x.fighters + x.strike, 0) }))
      .filter((x) => x.groups >= AIRFIELD_MIN_GROUPS)
      .sort((a, b) => b.groups - a.groups || (a.r < b.r ? -1 : 1))[0];
    if (airfield && rng.next() < 0.5) {
      orders.push({ wing: id, mission: "airfield", region: airfield.r });
      continue;
    }
    const target = Object.keys(def.regions)
      .filter((r) => inRange(def, state, id, r) && enemyAt(r) > 0)
      .sort((a, b) => enemyAt(b) - enemyAt(a) || (a < b ? -1 : 1))[0];
    if (target) orders.push({ wing: id, mission: rng.next() < 0.6 ? "units" : "supply", region: target });
    else orders.push({ wing: id, mission: "cap" });
  }
  return orders;
}
