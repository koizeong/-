import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";

/**
 * 橋:水の地形(ルールパックの terrain.*.water)を横切る道路の区間。地図と道路から決まるので、シナリオに書かなくてよい。
 * 壊れた橋の区間は、行軍の道路にも補給路にも使えない(ctx.roads から外す)。徒歩で渡れる川なら、道路を離れて遅く渡れる
 */
export interface Bridge {
  /** 道路の区間の "from~to" */
  id: string;
  /** 道路の区間の添字 */
  edge: number;
  from: string;
  to: string;
  /** 水の上の部分の真ん中(爆破・修理の距離はここから測る) */
  pos: Vec2;
}

/** 橋の状態。修理は、修理を頼んだ陣営と、進んだ時間(秒) */
export interface BridgeState {
  destroyed: boolean;
  repair?: { side: string; progressSec: number };
}
export type BridgeStates = Record<string, BridgeState>;

const cache = new WeakMap<object, WeakMap<object, Bridge[]>>();

/** 地図の橋(道路の区間の順)。同じ地図と道路なら計算は1回 */
export function findBridges(ctx: Pick<SimContext, "terrain" | "roads" | "rules">): Bridge[] {
  const byTerrain = cache.get(ctx.terrain) ?? cache.set(ctx.terrain, new WeakMap()).get(ctx.terrain)!;
  // 壊れた橋を外した道路網も、元の定義は同じ(区間の一覧 allEdges は外した区間も含む)
  const key = ctx.roads.source;
  const hit = byTerrain.get(key);
  if (hit) return hit;
  const out: Bridge[] = [];
  const step = ctx.terrain.cellSizeM / 4;
  for (const e of ctx.roads.allEdges()) {
    const a = ctx.roads.pos(e.from);
    const b = ctx.roads.pos(e.to);
    const n = Math.max(1, Math.ceil(distance(a, b) / step));
    let sx = 0;
    let sy = 0;
    let wet = 0;
    for (let i = 0; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      if (ctx.rules.terrain[ctx.terrain.terrainAt(p)]?.water) {
        sx += p.x;
        sy += p.y;
        wet++;
      }
    }
    if (wet > 0) out.push({ id: `${e.from}~${e.to}`, edge: e.index, from: e.from, to: e.to, pos: { x: sx / wet, y: sy / wet } });
  }
  byTerrain.set(key, out);
  return out;
}

/** シナリオの初めの橋の状態(書かれていない橋は無事) */
export function initialBridges(ctx: SimContext): BridgeStates {
  const destroyed = new Set(ctx.scenario.destroyedBridges);
  return Object.fromEntries(findBridges(ctx).map((b) => [b.id, { destroyed: destroyed.has(b.id) }]));
}

/** 壊れた橋の区間を通れなくした文脈 */
export function withBridges(ctx: SimContext, states: BridgeStates | undefined): SimContext {
  const closed = new Set(findBridges(ctx).filter((b) => states?.[b.id]?.destroyed).map((b) => b.edge));
  const roads = ctx.roads.withClosedEdges(closed);
  return roads === ctx.roads ? ctx : { ...ctx, roads };
}

/**
 * 経路が、壊れた橋(ctx.roads で通れない区間)を道路として渡るか。前のターンまでに引いた経路は、
 * その後に落ちた橋を渡ろうとすることがあるので、ターンの始めに確かめて引き直す
 */
export function routeCrossesClosed(from: Vec2, route: readonly { x: number; y: number; onRoad?: boolean }[], ctx: SimContext): boolean {
  if (ctx.roads.closed.size === 0) return false;
  const closed = findBridges(ctx).filter((b) => ctx.roads.closed.has(b.edge));
  let prev = from;
  for (const p of route) {
    if (p.onRoad) {
      const mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
      if (closed.some((b) => segmentDistance(mid, ctx.roads.pos(b.from), ctx.roads.pos(b.to)) < 1)) return true;
    }
    prev = p;
  }
  return false;
}

/** 橋から range 以内にいる、その陣営の潰走していない部隊があるか */
export function nearBridge(b: Bridge, units: readonly { side: string; pos: Vec2; strength: number; routed: boolean }[], side: string, range: number, sameSide = true): boolean {
  return units.some((u) => (sameSide ? u.side === side : u.side !== side) && u.strength > 0 && !u.routed && distance(u.pos, b.pos) <= range);
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return distance(p, { x: a.x + dx * k, y: a.y + dy * k });
}
