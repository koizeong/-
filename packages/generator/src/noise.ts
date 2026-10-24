import { Rng } from "@brigade/sim-core";

/**
 * 値ノイズ(格子点に乱数を置き、間をなめらかに補間する)。octaves 回、細かい格子を重ねる。
 * 決まったシードから毎回同じ値になる。戻り値はマスごとの値(行ごと、0〜1)
 */
export function valueNoise(cols: number, rows: number, scaleCells: number, rng: Rng, octaves = 3): number[][] {
  const out = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  let amp = 1;
  let total = 0;
  let scale = Math.max(1, scaleCells);
  for (let o = 0; o < octaves; o++) {
    const gw = Math.ceil(cols / scale) + 2;
    const gh = Math.ceil(rows / scale) + 2;
    const grid = Array.from({ length: gh }, () => Array.from({ length: gw }, () => rng.next()));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gx = c / scale;
        const gy = r / scale;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const sx = smooth(gx - x0);
        const sy = smooth(gy - y0);
        const top = lerp(grid[y0]![x0]!, grid[y0]![x0 + 1]!, sx);
        const bottom = lerp(grid[y0 + 1]![x0]!, grid[y0 + 1]![x0 + 1]!, sx);
        out[r]![c]! += lerp(top, bottom, sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    scale = Math.max(1, scale / 2);
  }
  for (const row of out) for (let c = 0; c < cols; c++) row[c] = row[c]! / total;
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 値の上位 fraction の境目(この値より大きいマスが fraction の割合になる) */
export function quantileAbove(values: number[][], fraction: number): number {
  if (fraction <= 0) return Infinity;
  const flat = values.flat().sort((a, b) => b - a);
  const i = Math.min(flat.length - 1, Math.max(0, Math.floor(flat.length * fraction) - 1));
  return flat[i]!;
}
