import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";

/**
 * 見通し(LOS)。a と b の地面から eyeHeightM の高さの2点を直線で結び、
 * 間にあるセルの「標高 + 遮蔽物の高さ」が直線より高ければ見えない。
 * a と b のいるセルそのものは判定に含めない(森の縁にいれば外は見える。森の奥からは見えない)。
 * a と b を入れ替えても結果は同じ。
 */
export function hasLineOfSight(a: Vec2, b: Vec2, ctx: SimContext): boolean {
  const { terrain, rules } = ctx;
  const eye = rules.detection.eyeHeightM;
  const elev = (p: Vec2) => rules.terrain[terrain.terrainAt(p)]!.elevationM;
  const ha = elev(a) + eye;
  const hb = elev(b) + eye;
  const d = distance(a, b);
  const n = Math.ceil(d / (terrain.cellSizeM / 2));
  // a と b のいるセル(境目に立っていれば、接するセルすべて)
  const own = new Set([...cellsAt(a, terrain.cellSizeM), ...cellsAt(b, terrain.cellSizeM)].map(([c, r]) => `${c},${r}`));
  const size = terrain.cellSizeM;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    // 点がセルの境目に乗っていたら両側のセルを見る(境目の点を片側に寄せると、左右で判定が変わるため)
    const line = ha + (hb - ha) * t;
    for (const [col, row] of cellsAt(p, size)) {
      if (col < 0 || row < 0 || col >= terrain.cols || row >= terrain.rows || own.has(`${col},${row}`)) continue;
      const r = rules.terrain[terrain.terrainAt(terrain.cellCenter(col, row))]!;
      if (r.elevationM + r.obstacleHeightM > line) return false;
    }
  }
  return true;
}

/** 点を含むセル。境目に乗っていれば両側(角なら4つ) */
function cellsAt(p: Vec2, size: number): [number, number][] {
  const cols = onBoundary(p.x, size) ? [Math.round(p.x / size) - 1, Math.round(p.x / size)] : [Math.floor(p.x / size)];
  const rows = onBoundary(p.y, size) ? [Math.round(p.y / size) - 1, Math.round(p.y / size)] : [Math.floor(p.y / size)];
  return cols.flatMap((c) => rows.map((r) => [c, r] as [number, number]));
}

function onBoundary(v: number, size: number): boolean {
  const k = v / size;
  return Math.abs(k - Math.round(k)) < 1e-9;
}
