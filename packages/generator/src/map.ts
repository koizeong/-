import { Rng } from "@brigade/sim-core";
import type { Biome } from "./biome.js";
import { quantileAbove, valueNoise } from "./noise.js";

/**
 * 自動生成の地図:起伏 → 川 → 森 → 町 → 道路の順に作る。シードが同じなら同じ地図になる(設計ルール1)。
 * 地図はシナリオファイルの map(rows[0] が北端)と roads の形で返す。橋は道路が川を横切る所に、sim-core が自動で見つける
 */

export type Role = "open" | "wood" | "wood2" | "town" | "hill" | "peak" | "river" | "bigRiver";

export interface MapParams {
  seed: number;
  widthM: number;
  heightM: number;
  cellSizeM: number;
  biome: Biome;
  /** 両軍の向き合う軸。ew:西と東の端に配置帯、ns:南と北。省略はシードで決める */
  axis?: "ew" | "ns";
}

export interface Town {
  id: string;
  name: string;
  x: number;
  y: number;
  /** 町のマスの数 */
  cells: number;
  /** 道路のノード(町の真ん中) */
  nodeId: string;
}

export interface GeneratedMap {
  map: { cellSizeM: number; legend: Record<string, string>; rows: string[] };
  roads: { nodes: Record<string, { x: number; y: number; name?: string }>; edges: { from: string; to: string; capacityTPerHour: number }[] };
  towns: Town[];
  axis: "ew" | "ns";
  /** 配置帯の端の道路の入口(side 0 = 西・南、1 = 東・北) */
  entries: { side: 0 | 1; nodeId: string; x: number; y: number }[];
  /** 役割ごとのマス(行ごと)。公平さの判定などに使う */
  roles: Role[][];
}

const LEGEND_CHAR: Record<Role, string> = { open: ".", wood: "F", wood2: "P", town: "T", hill: "H", peak: "X", river: "~", bigRiver: "W" };
/** 道路を引くときの、地形ごとの手間(大きいほど避ける)。水は橋になる */
const ROAD_COST: Record<Role, number> = { open: 1, wood: 2.2, wood2: 1.5, town: 0.8, hill: 3, peak: Infinity, river: 7, bigRiver: 14 };

export function generateMap(p: MapParams): GeneratedMap {
  const rng = Rng.fromSeed(p.seed);
  const b = p.biome;
  const cols = Math.max(8, Math.round(p.widthM / p.cellSizeM));
  const rows = Math.max(8, Math.round(p.heightM / p.cellSizeM));
  const axis: "ew" | "ns" = p.axis ?? (rng.next() < 0.5 ? "ew" : "ns");
  const scale = b.noiseScaleM / p.cellSizeM;
  const cell = p.cellSizeM;
  const center = (c: number, r: number) => ({ x: (c + 0.5) * cell, y: (rows - r - 0.5) * cell });
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;

  // 起伏と森
  const elevation = valueNoise(cols, rows, scale, rng);
  const woods = valueNoise(cols, rows, scale * 0.7, rng);
  const woods2 = valueNoise(cols, rows, scale * 0.6, rng);
  const peakAt = quantileAbove(elevation, b.peak);
  const hillAt = quantileAbove(elevation, b.hill + b.peak);
  const woodAt = quantileAbove(woods, b.wood);
  const wood2At = b.terrain.wood2 ? quantileAbove(woods2, b.wood2) : Infinity;
  const roles: Role[][] = elevation.map((row, r) =>
    row.map((e, c) => (e >= peakAt ? "peak" : e >= hillAt ? "hill" : woods[r]![c]! >= woodAt ? "wood" : woods2[r]![c]! >= wood2At ? "wood2" : "open")),
  );

  // 川:端から反対の端へ、ゆらぎのある線で引く。前線に沿う向き(両軍の間を横切る)を多めに
  const riverCount = intBetween(rng, b.rivers[0], b.rivers[1]);
  for (let i = 0; i < riverCount; i++) {
    const across = rng.next() < 0.65; // 両軍の間を横切る(配置帯と平行に流れる)
    const alongX = (axis === "ew") !== across; // 川が西から東へ流れるか
    const big = rng.next() < b.bigRiverChance;
    const pts = alongX
      ? meander({ x: 0, y: rng.range(0.2, 0.8) * rows }, { x: cols - 1, y: rng.range(0.2, 0.8) * rows }, rng)
      : meander({ x: rng.range(0.2, 0.8) * cols, y: 0 }, { x: rng.range(0.2, 0.8) * cols, y: rows - 1 }, rng);
    for (const [c, r] of rasterize(pts)) {
      if (!inside(c, r)) continue;
      roles[r]![c] = big ? "bigRiver" : "river";
      if (big) {
        const [dc, dr] = alongX ? [0, 1] : [1, 0];
        if (inside(c + dc, r + dr)) roles[r + dr]![c + dc] = "bigRiver";
      }
    }
  }

  // 町:平地を中心に、互いに離して置く。川のそばを少し好む
  const area = (p.widthM * p.heightM) / 1e8;
  const townCount = Math.max(2, Math.round(rng.range(b.townsPer100km2[0], b.townsPer100km2[1]) * area));
  const minGap = Math.max(1500, Math.sqrt((p.widthM * p.heightM) / townCount) * 0.6);
  const candidates: { c: number; r: number; score: number }[] = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const role = roles[r]![c]!;
      if (role === "peak" || role === "river" || role === "bigRiver") continue;
      const nearWater = neighbors(c, r, 2).some(([x, y]) => inside(x, y) && (roles[y]![x] === "river" || roles[y]![x] === "bigRiver"));
      candidates.push({ c, r, score: rng.next() + (role === "open" ? 0.4 : 0) + (nearWater ? 0.3 : 0) });
    }
  }
  candidates.sort((a, b2) => b2.score - a.score);
  const towns: Town[] = [];
  for (const cand of candidates) {
    if (towns.length >= townCount) break;
    const pos = center(cand.c, cand.r);
    if (towns.some((t) => Math.hypot(t.x - pos.x, t.y - pos.y) < minGap)) continue;
    const size = intBetween(rng, b.townCells[0], b.townCells[1]);
    // 町の広がり:真ん中から隣のマスへ広げる(水・峻険な高地には広げない)
    const grown: [number, number][] = [[cand.c, cand.r]];
    roles[cand.r]![cand.c] = "town";
    for (let tries = 0; grown.length < size && tries < size * 8; tries++) {
      const [gc, gr] = grown[Math.floor(rng.next() * grown.length)]!;
      const [nc, nr] = neighbors(gc, gr, 1)[Math.floor(rng.next() * 8)]!;
      if (!inside(nc, nr) || ["town", "river", "bigRiver", "peak"].includes(roles[nr]![nc]!)) continue;
      roles[nr]![nc] = "town";
      grown.push([nc, nr]);
    }
    const n = towns.length;
    towns.push({ id: `town${n + 1}`, name: b.townNames[n] ?? `町${n + 1}`, ...pos, cells: grown.length, nodeId: nodeKey(cand.c, cand.r) });
  }

  // 道路:町と、配置帯の端の入口を結ぶ。最小全域木に近道を足し、地形の手間の少ない経路を引く(前に引いた道路は安く、合流しやすい)
  const nodes: GeneratedMap["roads"]["nodes"] = {};
  const edges: GeneratedMap["roads"]["edges"] = [];
  const edgeSet = new Set<string>();
  const roadCells = new Set<string>();
  const entries: GeneratedMap["entries"] = [];
  const dry = (c: number, r: number) => inside(c, r) && !["river", "bigRiver", "peak"].includes(roles[r]![c]!);
  for (const side of [0, 1] as const) {
    const n = intBetween(rng, 1, 2);
    for (let k = 0; k < n; k++) {
      // 端のマスで、水・峻険な高地でない所を探す
      for (let tries = 0; tries < 20; tries++) {
        const t = rng.range(0.15, 0.85);
        const [c, r] = axis === "ew" ? [side === 0 ? 0 : cols - 1, Math.floor(t * rows)] : [Math.floor(t * cols), side === 0 ? rows - 1 : 0];
        if (!dry(c, r) || entries.some((e) => e.nodeId === nodeKey(c, r))) continue;
        entries.push({ side, nodeId: nodeKey(c, r), ...center(c, r) });
        break;
      }
    }
  }
  const sites = [...towns.map((t) => ({ key: t.nodeId, ...t })), ...entries.map((e) => ({ key: e.nodeId, ...e }))];
  for (const s of sites) nodes[s.key] = { x: s.x, y: s.y, ...("name" in s ? { name: s.name } : {}) };
  const links = spanningLinks(sites, rng, b.extraRoads);
  for (const link of links) {
    const from = cellOf(sites[link.a]!, cell, rows);
    const to = cellOf(sites[link.b]!, cell, rows);
    const path = cheapestPath(from, to, cols, rows, (c, r) => (roadCells.has(nodeKey(c, r)) ? 0.5 : ROAD_COST[roles[r]![c]!]));
    if (!path) continue;
    for (const [c, r] of path) roadCells.add(nodeKey(c, r));
    const kept = roadNodes(path, dry);
    for (let i = 0; i + 1 < kept.length; i++) {
      const [c1, r1] = kept[i]!;
      const [c2, r2] = kept[i + 1]!;
      const k1 = nodeKey(c1, r1);
      const k2 = nodeKey(c2, r2);
      nodes[k1] ??= center(c1, r1);
      nodes[k2] ??= center(c2, r2);
      const id = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      if (edgeSet.has(id)) continue;
      edgeSet.add(id);
      edges.push({ from: k1, to: k2, capacityTPerHour: link.main ? b.roadCapacity.main : b.roadCapacity.minor });
    }
  }

  // 地形の文字と legend(使った役割だけ)
  const used = new Set(roles.flat());
  const legend: Record<string, string> = {};
  for (const role of used) legend[LEGEND_CHAR[role]] = role === "wood2" ? b.terrain.wood2! : b.terrain[role];
  return {
    map: { cellSizeM: cell, legend, rows: roles.map((row) => row.map((role) => LEGEND_CHAR[role]).join("")) },
    roads: { nodes, edges },
    towns,
    axis,
    entries,
    roles,
  };
}

const nodeKey = (c: number, r: number) => `n${c}_${r}`;
const intBetween = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng.next() * (hi - lo + 1));
const cellOf = (p: { x: number; y: number }, cell: number, rows: number): [number, number] => [Math.floor(p.x / cell), rows - 1 - Math.floor(p.y / cell)];

function neighbors(c: number, r: number, d: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) if (dc || dr) out.push([c + dc, r + dr]);
  return out;
}

/** 2点の間のゆらぎのある線(中点を横へずらすことを繰り返す) */
function meander(a: { x: number; y: number }, b: { x: number; y: number }, rng: Rng, depth = 5): { x: number; y: number }[] {
  let pts = [a, b];
  let amp = 0.22;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]!];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const off = (rng.next() - 0.5) * 2 * amp * len;
      next.push({ x: (p.x + q.x) / 2 + (-(q.y - p.y) / (len || 1)) * off, y: (p.y + q.y) / 2 + ((q.x - p.x) / (len || 1)) * off }, q);
    }
    pts = next;
    amp *= 0.8;
  }
  return pts;
}

/** 線をマスに直す。斜めに進むときは間のマスも埋める(川が斜めに途切れないように) */
function rasterize(pts: { x: number; y: number }[]): [number, number][] {
  const out: [number, number][] = [];
  let last: [number, number] | null = null;
  const push = (c: number, r: number) => {
    if (last && last[0] === c && last[1] === r) return;
    if (last && last[0] !== c && last[1] !== r) out.push([c, last[1]]);
    out.push([c, r]);
    last = [c, r];
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) * 2));
    for (let k = 0; k <= n; k++) push(Math.floor(p.x + ((q.x - p.x) * k) / n), Math.floor(p.y + ((q.y - p.y) * k) / n));
  }
  return out;
}

/** 結ぶ組:最小全域木(幹線)と、近い組を extra の割合で足したもの(脇道) */
function spanningLinks(sites: { x: number; y: number }[], rng: Rng, extra: number): { a: number; b: number; main: boolean }[] {
  const n = sites.length;
  if (n < 2) return [];
  const d = (i: number, j: number) => Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.y - sites[j]!.y);
  const inTree = new Set([0]);
  const links: { a: number; b: number; main: boolean }[] = [];
  while (inTree.size < n) {
    let best: [number, number, number] | null = null;
    for (const i of inTree) for (let j = 0; j < n; j++) if (!inTree.has(j) && (!best || d(i, j) < best[2])) best = [i, j, d(i, j)];
    inTree.add(best![1]);
    links.push({ a: best![0], b: best![1], main: true });
  }
  const has = (i: number, j: number) => links.some((l) => (l.a === i && l.b === j) || (l.a === j && l.b === i));
  for (let i = 0; i < n; i++) {
    const nearest = [...Array(n).keys()].filter((j) => j !== i && !has(i, j)).sort((x, y) => d(i, x) - d(i, y))[0];
    if (nearest !== undefined && rng.next() < extra) links.push({ a: i, b: nearest, main: false });
  }
  return links;
}

/** マスの格子の上の、手間の合計がいちばん小さい道(8方向。斜めは √2 倍) */
function cheapestPath(from: [number, number], to: [number, number], cols: number, rows: number, cost: (c: number, r: number) => number): [number, number][] | null {
  const idx = (c: number, r: number) => r * cols + c;
  const dist = new Float64Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  const open = new MinHeap();
  dist[idx(...from)] = 0;
  open.push(0, idx(...from));
  const goal = idx(...to);
  const h = (c: number, r: number) => Math.hypot(c - to[0], r - to[1]) * 0.5;
  while (open.size > 0) {
    const cur = open.pop()!;
    if (cur === goal) break;
    const c = cur % cols;
    const r = Math.floor(cur / cols);
    for (const [nc, nr] of neighbors(c, r, 1)) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const k = cost(nc, nr);
      if (!Number.isFinite(k)) continue;
      const nd = dist[cur]! + k * (nc !== c && nr !== r ? Math.SQRT2 : 1);
      const ni = idx(nc, nr);
      if (nd < dist[ni]!) {
        dist[ni] = nd;
        prev[ni] = cur;
        open.push(nd + h(nc, nr), ni);
      }
    }
  }
  if (!Number.isFinite(dist[goal]!)) return null;
  const path: [number, number][] = [];
  for (let i = goal; i >= 0; i = prev[i]!) path.push([i % cols, Math.floor(i / cols)]);
  return path.reverse();
}

/** 道路のノードにするマス:乾いたマスだけ(水の上にノードを置かない。水を横切る区間が橋になる)。曲がり角・水の手前と向こう・数マスおき */
function roadNodes(path: [number, number][], dry: (c: number, r: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let since = 0;
  for (let i = 0; i < path.length; i++) {
    const [c, r] = path[i]!;
    if (!dry(c, r)) continue;
    const first = i === 0;
    const lastCell = i === path.length - 1;
    const prev = path[i - 1];
    const next = path[i + 1];
    const turn = prev && next && (next[0] - c !== c - prev[0] || next[1] - r !== r - prev[1]);
    const bank = (prev && !dry(...prev)) || (next && !dry(...next));
    since++;
    if (first || lastCell || bank || (turn && since >= 2) || since >= 5) {
      out.push([c, r]);
      since = 0;
    }
  }
  return out;
}

/** 小さな最小ヒープ(道を探すため) */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= this.keys[i]!) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number | undefined {
    if (this.keys.length === 0) return undefined;
    const top = this.vals[0];
    const lk = this.keys.pop()!;
    const lv = this.vals.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lk;
      this.vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!) m = l;
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.vals[a], this.vals[b]] = [this.vals[b]!, this.vals[a]!];
  }
}
