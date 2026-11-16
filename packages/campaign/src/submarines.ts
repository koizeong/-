import type { Rng } from "@brigade/sim-core";
import type { Toe } from "@brigade/sim-core";
import { distanceKm } from "./air.js";
import type { CampaignState, StageReport, UnitState } from "./campaign.js";
import type { CampaignDef } from "./schema.js";

/**
 * 潜水艦の群れ(作戦の層。ユーザー判断)。命令はなく、段階ごとに自動で動く:
 * 港(base)を自陣営が押さえていれば、rangeKm 以内の海域にいる敵の艦隊のうち、いちばん大きな艦隊を狙う。
 * 1隻ごとに attackPerBoat × effectiveness の確率で魚雷を当て、当たった艦は排水量に応じて戦力を失う(戦力が尽きれば沈む)。
 * 駆逐艦のいる艦隊を攻めると、1回ごとに escortLoss の確率で潜水艦を1隻失う。数値はキャンペーンの rules.submarines(仮置き)
 */

export interface SubState {
  side: string;
  base: string;
  boats: number;
}

export interface SubReport {
  group: string;
  side: string;
  region: string;
  formation: string;
  hits: number;
  sunk: string[];
  lostBoats: number;
}

/** 始めからいる潜水艦の群れ */
export function startSubs(def: CampaignDef): Record<string, SubState> | undefined {
  if (!def.submarines.length) return undefined;
  return Object.fromEntries(def.submarines.filter((g) => (g.arriveStage ?? 1) <= 1).map((g) => [g.id, { side: g.side, base: g.base, boats: g.boats }]));
}

/** 潜水艦の群れが働くか(港を自陣営が押さえ、敵がいない) */
function active(state: CampaignState, g: SubState): boolean {
  return state.control[g.base] === g.side && !Object.values(state.formations).some((f) => f.region === g.base && f.side !== g.side);
}

/** 段階の潜水艦の攻撃(state を書き換える)。沈んだ艦は消し、失った戦力は lose で数える */
export function resolveSubmarines(
  def: CampaignDef,
  state: CampaignState,
  toes: Record<string, Toe>,
  rng: Rng,
  hp: (u: UnitState) => number,
  lose: (side: string, hp: number) => void,
  report: StageReport,
): void {
  const r = def.rules.submarines;
  const subs = state.subs ?? {};
  const ships = (f: string) => Object.entries(state.units).filter(([, u]) => u.formation === f && !u.base && toes[u.toe]?.ship);
  const weight = (u: UnitState) => (toes[u.toe]?.ship?.displacementT ?? 1000) * u.strength;
  for (const id of Object.keys(subs).sort()) {
    const g = subs[id]!;
    const d = def.submarines.find((x) => x.id === id);
    if (!d || g.boats <= 0 || !active(state, g)) continue;
    const target = Object.entries(state.formations)
      .filter(([f, x]) => x.side !== g.side && def.regions[x.region]?.sea && distanceKm(def, g.base, x.region) <= d.rangeKm + 1e-9 && ships(f).length > 0)
      .map(([f, x]) => ({ f, region: x.region, w: ships(f).reduce((t, [, u]) => t + weight(u), 0) }))
      .sort((a, b) => b.w - a.w || (a.f < b.f ? -1 : 1))[0];
    if (!target) continue;
    const escorted = ships(target.f).some(([, u]) => toes[u.toe]?.ship?.type === "destroyer");
    let hits = 0;
    let lostBoats = 0;
    const sunk: string[] = [];
    const boats = Math.floor(g.boats + 1e-9);
    for (let i = 0; i < boats; i++) {
      if (rng.next() >= r.attackPerBoat * d.effectiveness) continue;
      const list = ships(target.f);
      if (!list.length) break;
      // 狙う艦:大きな艦ほど狙われやすい(排水量 × 戦力の重み)
      const total = list.reduce((t, [, u]) => t + weight(u), 0);
      let pick = rng.next() * total;
      let [uid, u] = list[0]!;
      for (const [k, x] of list) {
        pick -= weight(x);
        if (pick <= 0) {
          [uid, u] = [k, x];
          break;
        }
      }
      const disp = toes[u.toe]?.ship?.displacementT ?? r.refDisplacementT;
      const loss = Math.min(0.9, r.hitStrength * Math.pow(r.refDisplacementT / disp, r.hitExp));
      const before = hp(u);
      u.strength = Math.max(0, u.strength - loss);
      hits++;
      if (u.strength < 0.05) {
        lose(u.side, before);
        delete state.units[uid];
        sunk.push(uid);
      } else lose(u.side, before - hp(u));
      if (escorted && rng.next() < r.escortLoss) lostBoats++;
    }
    g.boats = Math.max(0, g.boats - lostBoats);
    if (hits || lostBoats) (report.submarines ??= []).push({ group: id, side: g.side, region: target.region, formation: target.f, hits, sunk, lostBoats });
  }
}

/** 海を渡って来る増援(via の海域)が、届く敵の潜水艦の群れから失う戦力の割合 */
export function convoySubLoss(def: CampaignDef, state: CampaignState, side: string, via: string): number {
  const r = def.rules.submarines;
  let loss = 0;
  for (const [id, g] of Object.entries(state.subs ?? {})) {
    const d = def.submarines.find((x) => x.id === id);
    if (!d || g.side === side || g.boats <= 0 || !active(state, g) || distanceKm(def, g.base, via) > d.rangeKm + 1e-9) continue;
    loss += g.boats * d.effectiveness * r.convoyLossPerBoat;
  }
  return Math.min(r.convoyMax, loss);
}

/** 段階の終わりに着く潜水艦の群れの増援 */
export function arriveSubs(def: CampaignDef, state: CampaignState, nextStage: number): void {
  for (const d of def.submarines) {
    if ((d.arriveStage ?? 1) !== nextStage || state.subs?.[d.id]) continue;
    (state.subs ??= {})[d.id] = { side: d.side, base: d.base, boats: d.boats };
  }
}
