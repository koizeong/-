/**
 * 平面幾何。単位はメートル。
 * 方位は度で持ち、北(+y)を0として時計回り(東=90)。
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** 方位を [0, 360) に正規化する */
export function normalizeBearing(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** a から b を見た方位(度)。a と b が同じ点なら 0。 */
export function bearing(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return normalizeBearing((Math.atan2(dx, dy) * 180) / Math.PI);
}

/** 2つの方位の差の大きさ。[0, 180] */
export function angleBetween(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b));
  return d > 180 ? 360 - d : d;
}
