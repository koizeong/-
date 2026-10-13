import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";
import type { MoveMode } from "./unit.js";

/** 経路上の点。onRoad はこの点へ向かう区間が道路であることを示す */
export interface RoutePoint {
  x: number;
  y: number;
  onRoad?: boolean;
}

/** 地形の移動速度倍率 */
function terrainMult(p: Vec2, ctx: SimContext): number {
  return ctx.rules.terrain[ctx.terrain.terrainAt(p)]!.speedMultiplier;
}

/**
 * 原野を直線で進むときの所要時間(倍率1で進んだときの距離に換算した値、m)。
 * セルの1/4ごとに地形を見て積み上げる。
 */
export function offRoadCost(a: Vec2, b: Vec2, ctx: SimContext): number {
  const d = distance(a, b);
  if (d === 0) return 0;
  const n = Math.max(1, Math.ceil(d / (ctx.terrain.cellSizeM / 4)));
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    cost += d / n / terrainMult({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ctx);
  }
  return cost;
}

/**
 * 経由点を順にたどる経路を作る(設計:目的地をタップすると経路は道路・地形から自動生成)。
 * 行軍は道路を使え、戦闘移動は原野だけを進む。
 */
export function planRoute(from: Vec2, waypoints: readonly Vec2[], mode: MoveMode, ctx: SimContext): RoutePoint[] {
  const route: RoutePoint[] = [];
  let cur = from;
  for (const w of waypoints) {
    route.push(...planLeg(cur, w, mode, ctx));
    cur = w;
  }
  return route;
}

/** セルごとの「1mあたりの時間」(速度倍率の逆数)。地形とルールパックの組ごとに1回だけ計算する */
const inverseSpeedCache = new WeakMap<object, WeakMap<object, Float64Array>>();
function inverseSpeedGrid(ctx: SimContext): Float64Array {
  const byRules = inverseSpeedCache.get(ctx.terrain) ?? inverseSpeedCache.set(ctx.terrain, new WeakMap()).get(ctx.terrain)!;
  let inv = byRules.get(ctx.rules);
  if (!inv) {
    const { cols, rows } = ctx.terrain;
    inv = new Float64Array(cols * rows);
    for (let i = 0; i < inv.length; i++) inv[i] = 1 / terrainMult(ctx.terrain.cellCenter(i % cols, Math.floor(i / cols)), ctx);
    byRules.set(ctx.rules, inv);
  }
  return inv;
}

/** 二分ヒープ(コストが同じなら番号の小さい方を先に出す:決定論) */
class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, id: number) {
    const a = this.items;
    a.push([cost, id]);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (!less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && less(a[l]!, a[m]!)) m = l;
        if (r < a.length && less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}
function less(x: [number, number], y: [number, number]): boolean {
  return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
}

const NEIGHBORS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/**
 * 1区間の経路。地形セルの中心と道路ノードをつないだグラフで、所要時間が最短の経路を探し(A*)、
 * 直線で行っても遅くならない区間は直線にまとめる。
 */
function planLeg(a: Vec2, b: Vec2, mode: MoveMode, ctx: SimContext): RoutePoint[] {
  const { terrain, roads, rules } = ctx;
  const useRoads = mode === "march";
  const cols = terrain.cols;
  const rows = terrain.rows;
  const size = terrain.cellSizeM;
  const nCells = cols * rows;
  const roadIds = useRoads ? roads.nodeIds : [];
  const START = nCells + roadIds.length;
  const GOAL = START + 1;
  const N = GOAL + 1;
  const roadIndex = new Map(roadIds.map((id, i) => [id, nCells + i]));

  const inv = inverseSpeedGrid(ctx);

  const px = new Float64Array(N);
  const py = new Float64Array(N);
  for (let i = 0; i < nCells; i++) {
    px[i] = ((i % cols) + 0.5) * size;
    py[i] = (Math.floor(i / cols) + 0.5) * size;
  }
  roadIds.forEach((id, k) => {
    const p = roads.pos(id);
    px[nCells + k] = p.x;
    py[nCells + k] = p.y;
  });
  px[START] = a.x;
  py[START] = a.y;
  px[GOAL] = b.x;
  py[GOAL] = b.y;
  const posOf = (n: number): Vec2 => ({ x: px[n]!, y: py[n]! });
  const cellIndex = (p: Vec2) => {
    const c = terrain.cellOf(p);
    return c.row * cols + c.col;
  };
  const startCell = cellIndex(a);
  const goalCell = cellIndex(b);

  // 道路ノードは、それを含むセルとつながる
  const roadsInCell = new Map<number, number[]>();
  for (const id of roadIds) {
    const c = cellIndex(roads.pos(id));
    (roadsInCell.get(c) ?? roadsInCell.set(c, []).get(c)!).push(roadIndex.get(id)!);
  }

  const maxMult = Math.max(...Object.values(rules.terrain).map((t) => t.speedMultiplier), useRoads ? rules.roadSpeedMultiplier : 0);
  const hScale = 1 / maxMult;

  const g = new Float64Array(N).fill(Infinity);
  const prevNode = new Int32Array(N).fill(-1);
  const prevRoad = new Uint8Array(N);
  const closed = new Uint8Array(N);
  const heap = new Heap();
  const relax = (from: number, to: number, cost: number, road: boolean) => {
    if (closed[to]) return;
    const ng = g[from]! + cost;
    if (ng < g[to]!) {
      g[to] = ng;
      prevNode[to] = from;
      prevRoad[to] = road ? 1 : 0;
      heap.push(ng + Math.hypot(px[to]! - b.x, py[to]! - b.y) * hScale, to);
    }
  };
  const link = (from: number, to: number) => relax(from, to, offRoadCost(posOf(from), posOf(to), ctx), false);

  g[START] = 0;
  heap.push(0, START);
  while (heap.size > 0) {
    const [, n] = heap.pop();
    if (closed[n]) continue;
    if (n === GOAL) break;
    closed[n] = 1;
    if (n === START) {
      link(n, startCell);
      if (startCell === goalCell) link(n, GOAL);
    } else if (n >= nCells) {
      // 道路ノード:含むセルへ降りる + 道路でつながるノードへ
      const id = roadIds[n - nCells]!;
      link(n, cellIndex(posOf(n)));
      for (const e of roads.edgesOf(id)) {
        relax(n, roadIndex.get(e.a === id ? e.b : e.a)!, e.lengthM / rules.roadSpeedMultiplier, true);
      }
    } else {
      const col = n % cols;
      const row = (n - col) / cols;
      for (const [dc, dr] of NEIGHBORS) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const to = r * cols + c;
        const d = dc !== 0 && dr !== 0 ? size * Math.SQRT2 : size;
        relax(n, to, d * 0.5 * (inv[n]! + inv[to]!), false);
      }
      for (const rn of roadsInCell.get(n) ?? []) link(n, rn);
      if (n === goalCell) link(n, GOAL);
    }
  }

  // GOAL から START までたどる
  const pts: RoutePoint[] = [];
  for (let n = GOAL; n !== START; n = prevNode[n]!) {
    pts.unshift(prevRoad[n] ? { x: px[n]!, y: py[n]!, onRoad: true } : { x: px[n]!, y: py[n]! });
  }
  return smooth(a, pts, ctx);
}

/**
 * 直線で行っても遅くならない区間をまとめる(道路の区間はまとめない)。
 * 地形が一様なら、出発点から目的地への一直線になる。
 */
function smooth(start: Vec2, pts: RoutePoint[], ctx: SimContext): RoutePoint[] {
  const all: RoutePoint[] = [{ x: start.x, y: start.y }, ...pts];
  const segCost = (i: number) =>
    all[i + 1]!.onRoad ? distance(all[i]!, all[i + 1]!) / ctx.rules.roadSpeedMultiplier : offRoadCost(all[i]!, all[i + 1]!, ctx);
  const out: RoutePoint[] = [];
  let i = 0;
  while (i < all.length - 1) {
    let best = i + 1;
    let along = 0;
    for (let j = i + 1; j < all.length; j++) {
      if (all[j]!.onRoad) break;
      along += segCost(j - 1);
      const straight = offRoadCost(all[i]!, all[j]!, ctx);
      if (straight <= along + 1e-6) best = j;
      // 直線が明らかに遅くなったら、それより先もまとめられないとみなして打ち切る(計算量を抑える)
      else if (straight > along * 1.05) break;
    }
    if (all[i + 1]!.onRoad) best = i + 1;
    out.push({ ...all[best]! });
    i = best;
  }
  return out;
}
