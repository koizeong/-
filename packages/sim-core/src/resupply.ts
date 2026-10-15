import type { SimContext } from "./context.js";
import type { Depot } from "./depot.js";
import { distance, type Vec2 } from "./geometry.js";
import type { RoadEdge } from "./roads.js";
import type { Unit } from "./unit.js";

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** side から見て、その地点が敵に押さえられているか(敵だけが controlRangeM 以内にいる) */
export function isControlledByEnemy(p: Vec2, side: string, units: readonly Unit[], ctx: SimContext): boolean {
  const r = ctx.rules.supply.controlRangeM;
  let enemy = false;
  for (const u of units) {
    if (u.strength <= 0 || distance(u.pos, p) > r) continue;
    if (u.side === side) return false;
    enemy = true;
  }
  return enemy;
}

export interface DepotCapture {
  depotId: string;
  from: string;
  to: string;
  /** 奪ったユニット(集積所に最も近い敵) */
  unitId: string;
}

/** 敵に押さえられた集積所を奪う(depots を書き換える)。残りの備蓄は奪った側のものになる */
export function captureDepots(depots: Depot[], units: readonly Unit[], ctx: SimContext): DepotCapture[] {
  const captures: DepotCapture[] = [];
  for (const d of [...depots].sort(byId)) {
    const p = ctx.roads.pos(d.nodeId);
    if (!isControlledByEnemy(p, d.side, units, ctx)) continue;
    const taker = units
      .filter((u) => u.side !== d.side && u.strength > 0)
      .sort((a, b) => distance(a.pos, p) - distance(b.pos, p) || byId(a, b))[0]!;
    captures.push({ depotId: d.id, from: d.side, to: taker.side, unitId: taker.id });
    d.side = taker.side;
  }
  return captures;
}

/** ユニットへの補給路(届けた集積所から、ユニットの最寄りの道路ノードまで) */
export interface SupplyRoute {
  depotId: string;
  /** 通った道路(RoadNetwork のエッジの添字。集積所の側から順に) */
  edges: number[];
  /** ユニットが道路に出るノード */
  accessNodeId: string;
}

export interface SupplyDelivery {
  unitId: string;
  supplied: boolean;
  ammoT: number;
  fuelT: number;
  /** 補給路(つながっていなければ null) */
  route: SupplyRoute | null;
}

/**
 * ターン終了時の補給(units と depots を書き換える)。
 * 陣営ごとに、敵に押さえられていないノードだけを通る最短経路で、在庫のある味方の集積所から届ける。
 * 届く量は 経路上の残り輸送能力の最小値 × 距離による減衰 と、集積所の在庫で制限する。
 * 道路の輸送能力は陣営内で共有し、経路の短いユニットから順に使う(優先度はMVPでは扱わない)。
 */
export function distributeSupply(units: Unit[], depots: Depot[], ctx: SimContext): SupplyDelivery[] {
  const { roads } = ctx;
  const rules = ctx.rules.supply;
  const hours = ctx.turnSeconds / 3600;
  const deliveries: SupplyDelivery[] = [];
  const sides = [...new Set(units.map((u) => u.side))].sort();

  for (const side of sides) {
    const blocked = new Set(roads.nodeIds.filter((id) => isControlledByEnemy(roads.pos(id), side, units, ctx)));
    const open = (id: string) => !blocked.has(id);
    const remaining = new Map<number, number>();
    const capLeft = (e: RoadEdge) => remaining.get(e.index) ?? e.capacityTPerHour * hours;
    const ownDepots = () => depots.filter((d) => d.side === side).sort(byId);
    const stocked = () => ownDepots().filter((d) => d.ammoT > 0 || d.fuelT > 0);

    // 経路の短い順に並べる(在庫の有無に関わらず、味方の集積所とつながっているか)
    const candidates = units
      .filter((u) => u.side === side && u.strength > 0)
      .map((u) => {
        const access = roads.nearestNode(u.pos, rules.accessRangeM, open);
        const path = access ? roads.shortestPath(stocked().map((d) => d.nodeId), access, open) : null;
        return { u, access, lengthM: path?.lengthM ?? Infinity };
      })
      .sort((a, b) => a.lengthM - b.lengthM || byId(a.u, b.u));

    for (const { u, access } of candidates) {
      // 前のユニットで在庫が尽きた集積所があり得るので、経路は毎回引き直す
      const path = access ? roads.shortestPath(stocked().map((d) => d.nodeId), access, open) : null;
      if (!path) {
        deliveries.push({ unitId: u.id, supplied: false, ammoT: 0, fuelT: 0, route: null });
        continue;
      }
      const depot = stocked().find((d) => d.nodeId === path.source)!;
      const cap = ctx.toes.toes[u.toe]!.supply;
      let ammoT = Math.min((1 - u.ammo) * cap.ammoCapacityT, depot.ammoT);
      let fuelT = Math.min((1 - u.fuel) * cap.fuelCapacityT, depot.fuelT);

      const decay = 1 / (1 + path.lengthM / rules.distanceScaleM);
      const bottleneck = Math.min(Infinity, ...path.edges.map(capLeft));
      const maxT = bottleneck * decay;
      if (ammoT + fuelT > maxT) {
        const k = maxT / (ammoT + fuelT);
        ammoT *= k;
        fuelT *= k;
      }
      // 減衰で失われる分も道路の輸送能力を使う
      const used = (ammoT + fuelT) / decay;
      for (const e of path.edges) remaining.set(e.index, capLeft(e) - used);
      depot.ammoT -= ammoT;
      depot.fuelT -= fuelT;
      if (cap.ammoCapacityT > 0) u.ammo = Math.min(1, u.ammo + ammoT / cap.ammoCapacityT);
      if (cap.fuelCapacityT > 0) u.fuel = Math.min(1, u.fuel + fuelT / cap.fuelCapacityT);
      deliveries.push({ unitId: u.id, supplied: true, ammoT, fuelT, route: { depotId: depot.id, edges: path.edges.map((e) => e.index), accessNodeId: access! } });
    }
  }
  return deliveries;
}

/** 今の状態での補給路(units と depots は書き換えない)。ユニットID → 補給路(つながっているものだけ) */
export function currentSupplyRoutes(units: readonly Unit[], depots: readonly Depot[], ctx: SimContext): Record<string, SupplyRoute> {
  const out: Record<string, SupplyRoute> = {};
  const copies = units.map((u) => ({ ...u, pos: { ...u.pos } }));
  for (const d of distributeSupply(copies, depots.map((x) => ({ ...x })), ctx)) if (d.route) out[d.unitId] = d.route;
  return out;
}
