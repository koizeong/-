import { campaignToes, neighbors, unitPower, stageRng, type CampaignEnv, type CampaignOrder, type CampaignState } from "./campaign.js";
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
  const value = (region: string) =>
    1 + Object.values(def.victory).reduce((t, v) => t + v.conditions.reduce((u, c) => u + (c.type === "region" && c.region === region ? c.points : 0), 0), 0);
  const hostile = (region: string) => state.control[region] !== side || enemyPower(region) > 0;
  // 攻めに出る戦力比:期限が迫るほど、勝利点で負けているほど低い
  const progress = Math.min(1, (state.stage - 1) / Math.max(1, def.calendar.stages - 1));
  const points = (s: string) => (def.victory[s]?.conditions ?? []).reduce((t, c) => t + (c.type === "region" && state.control[c.region] === s ? c.points : 0), 0);
  const behind = enemySides.some((e) => points(e) > points(side));
  const needRatio = (ATTACK_RATIO + (ATTACK_RATIO_LATE - ATTACK_RATIO) * progress) * (behind ? BEHIND_FACTOR : 1);
  const front = new Set(Object.keys(def.regions).filter((r) => state.control[r] === side && neighbors(def, r).some(hostile)));

  const orders: CampaignOrder[] = [];
  const regions = [...new Set(Object.values(state.formations).filter((f) => f.side === side).map((f) => f.region))].sort();
  for (const region of regions) {
    const mine = formationsIn(region, side).sort((a, b) => power(b) - power(a) || (a < b ? -1 : 1));
    // 守りに残す:攻める先を除いた隣の敵のうち、いちばん大きな戦力の7割まで(隣に敵がいれば最低1つ)。残りが手の空いた戦力
    const split = (except: string | null) => {
      const threat = Math.max(0, ...neighbors(def, region).filter((r) => r !== except).map(enemyPower));
      let kept = 0;
      const free: string[] = [];
      for (const f of mine) {
        if (threat > 0 && (kept < threat * HOLD_SHARE || kept === 0)) kept += power(f);
        else free.push(f);
      }
      return free;
    };
    // 攻める:隣の敵の地域で、手の空いた戦力で勝てそうな所(価値 × 戦力比が大きい所)。攻める先の敵は、攻めれば足止めできるので守りの勘定から外す
    const targets = neighbors(def, region)
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
    for (const n of neighbors(def, r).sort()) {
      if (prev.has(n) || state.control[n] !== side) continue;
      prev.set(n, r);
      queue.push(n);
    }
  }
  return null;
}
