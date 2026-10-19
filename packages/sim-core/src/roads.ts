import { z } from "zod";
import { distance, type Vec2 } from "./geometry.js";
import { parseWith, type ParseResult } from "./rulepack.js";

/**
 * 道路グラフ。ノードは交差点・町、エッジは道路(双方向)。
 * 補給の流れと、将来の経路探索に使う。
 */
export const RoadNetworkSchema = z
  .object({
    nodes: z.record(z.string(), z.object({ x: z.number(), y: z.number(), name: z.string().optional() })),
    edges: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        /** 輸送能力(トン/時) */
        capacityTPerHour: z.number().positive(),
      }),
    ),
  })
  .superRefine((r, ctx) => {
    r.edges.forEach((e, i) => {
      for (const end of ["from", "to"] as const) {
        if (!(e[end] in r.nodes)) ctx.addIssue({ code: "custom", path: ["edges", i, end], message: `ノード "${e[end]}" がありません` });
      }
      if (e.from === e.to) ctx.addIssue({ code: "custom", path: ["edges", i], message: "同じノード同士をつないでいます" });
    });
  });

export type RoadNetworkDef = z.infer<typeof RoadNetworkSchema>;

export function parseRoadNetwork(input: unknown): ParseResult<RoadNetworkDef> {
  return parseWith(RoadNetworkSchema, input);
}

export interface RoadEdge {
  /** エッジの識別子(配列の添字) */
  index: number;
  a: string;
  b: string;
  lengthM: number;
  capacityTPerHour: number;
}

export interface RoadPath {
  /** 出発ノード(補給源) */
  source: string;
  lengthM: number;
  edges: RoadEdge[];
}

export class RoadNetwork {
  readonly nodeIds: string[];
  private readonly adj = new Map<string, RoadEdge[]>();

  constructor(
    private readonly def: RoadNetworkDef,
    /** 通れない区間(壊れた橋)の添字 */
    readonly closed: ReadonlySet<number> = new Set(),
  ) {
    this.nodeIds = Object.keys(def.nodes).sort();
    for (const id of this.nodeIds) this.adj.set(id, []);
    def.edges.forEach((e, index) => {
      if (closed.has(index)) return;
      const edge: RoadEdge = {
        index,
        a: e.from,
        b: e.to,
        lengthM: distance(this.pos(e.from), this.pos(e.to)),
        capacityTPerHour: e.capacityTPerHour,
      };
      this.adj.get(e.from)!.push(edge);
      this.adj.get(e.to)!.push(edge);
    });
  }

  static empty(): RoadNetwork {
    return new RoadNetwork({ nodes: {}, edges: [] });
  }

  /** closed の区間(壊れた橋)を通れなくした道路網。同じ区間なら自分を返す */
  withClosedEdges(closed: ReadonlySet<number>): RoadNetwork {
    if (closed.size === this.closed.size && [...closed].every((i) => this.closed.has(i))) return this;
    return new RoadNetwork(this.def, closed);
  }

  /** 道路網の定義(通れない区間を外した道路網とも同じもの。計算の使い回しの鍵に使う) */
  get source(): RoadNetworkDef {
    return this.def;
  }

  /** すべての区間(通れない区間も含む。添字は定義の順) */
  allEdges(): readonly { index: number; from: string; to: string }[] {
    return this.def.edges.map((e, index) => ({ index, from: e.from, to: e.to }));
  }

  /** ノードにつながる道路 */
  edgesOf(id: string): readonly RoadEdge[] {
    return this.adj.get(id) ?? [];
  }

  hasNode(id: string): boolean {
    return id in this.def.nodes;
  }

  pos(id: string): Vec2 {
    const n = this.def.nodes[id];
    if (!n) throw new Error(`道路ノード "${id}" がありません`);
    return { x: n.x, y: n.y };
  }

  /** p から最も近い道路(区間)までの距離(m)。道路がなければ Infinity */
  distanceToRoad(p: Vec2): number {
    let best = Infinity;
    for (const [i, e] of this.def.edges.entries()) {
      if (this.closed.has(i)) continue;
      const a = this.pos(e.from);
      const b = this.pos(e.to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const k = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      best = Math.min(best, distance(p, { x: a.x + dx * k, y: a.y + dy * k }));
    }
    return best;
  }

  /** p から maxDistM 以内で、条件を満たす最も近いノード(同距離ならID順) */
  nearestNode(p: Vec2, maxDistM: number, accept: (id: string) => boolean): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of this.nodeIds) {
      if (!accept(id)) continue;
      const d = distance(p, this.pos(id));
      if (d <= maxDistM && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  /**
   * sources のいずれかから target までの最短経路。open が false のノードは通れない(出発点・終点も)。
   * 同じ長さの経路はノードID順で決まる(決定論)。
   */
  shortestPath(sources: readonly string[], target: string, open: (id: string) => boolean): RoadPath | null {
    const dist = new Map<string, number>();
    const via = new Map<string, RoadEdge | null>();
    const origin = new Map<string, string>();
    for (const s of [...sources].sort()) {
      if (!open(s) || dist.has(s)) continue;
      dist.set(s, 0);
      via.set(s, null);
      origin.set(s, s);
    }
    const done = new Set<string>();
    for (;;) {
      let cur: string | null = null;
      let curD = Infinity;
      for (const [id, d] of dist) {
        if (!done.has(id) && (d < curD || (d === curD && cur !== null && id < cur))) {
          cur = id;
          curD = d;
        }
      }
      if (cur === null) return null;
      if (cur === target) break;
      done.add(cur);
      for (const e of this.adj.get(cur)!) {
        const next = e.a === cur ? e.b : e.a;
        if (done.has(next) || !open(next)) continue;
        const nd = curD + e.lengthM;
        if (nd < (dist.get(next) ?? Infinity)) {
          dist.set(next, nd);
          via.set(next, e);
          origin.set(next, origin.get(cur)!);
        }
      }
    }
    const edges: RoadEdge[] = [];
    for (let n = target, e = via.get(n); e; e = via.get(n)) {
      edges.unshift(e);
      n = e.a === n ? e.b : e.a;
    }
    return { source: origin.get(target)!, lengthM: dist.get(target)!, edges };
  }
}
