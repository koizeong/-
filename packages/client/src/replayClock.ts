import type { SideReplay } from "@brigade/sim-core";

/**
 * 再生の時計。1ターン(1時間)を数秒で流すと、航空司令部の編隊の出撃(数分)は一瞬で過ぎて見えないので、
 * 編隊が飛んでいる時間帯だけゆっくり流す(表示だけ。ルールには関わらない)
 */

/** 時間を刻む幅(ゲームの秒) */
const BIN_S = 60;
/** 編隊が飛んでいる時間帯を何倍ゆっくり流すか */
const AIR_SLOW = 5;
/** ゆっくり流す分、再生全体を最大で何倍まで長くするか */
const MAX_STRETCH = 2.2;

interface Clock {
  t0: number;
  t1: number;
  /** 刻みごとの重みの累計(長さは刻みの数 + 1、0 から始まり 1 で終わる) */
  cum: number[];
  stretch: number;
}

const cache = new WeakMap<SideReplay, Clock>();

function bounds(rp: SideReplay): [number, number] {
  const any = Object.values(rp.own)[0];
  const t0 = any?.[0]?.t ?? 0;
  return [t0, any?.[any.length - 1]?.t ?? t0];
}

function clockOf(rp: SideReplay): Clock {
  const hit = cache.get(rp);
  if (hit) return hit;
  const [t0, t1] = bounds(rp);
  const n = Math.max(1, Math.ceil((t1 - t0) / BIN_S));
  const w = new Array<number>(n).fill(1);
  for (const f of rp.flights ?? []) {
    if (!f.points.length) continue;
    // 飛んでいた間と、撃墜の機が落ちきるまで(少し後ろまで)
    const a = Math.floor((f.points[0]!.t - t0) / BIN_S) - 1;
    const b = Math.ceil((f.points[f.points.length - 1]!.t - t0) / BIN_S) + 2;
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) w[i] = AIR_SLOW;
  }
  const total = w.reduce((x, y) => x + y, 0);
  const cum = [0];
  for (const x of w) cum.push(cum[cum.length - 1]! + x / total);
  const c = { t0, t1, cum, stretch: Math.min(MAX_STRETCH, total / n) };
  cache.set(rp, c);
  return c;
}

/** 再生の進み(0〜1)→ ゲームの時刻 */
export function replayTime(rp: SideReplay, progress: number): number {
  const c = clockOf(rp);
  if (c.t1 <= c.t0) return c.t0;
  const p = Math.min(1, Math.max(0, progress));
  let i = 0;
  while (i < c.cum.length - 2 && c.cum[i + 1]! < p) i++;
  const a = c.cum[i]!;
  const b = c.cum[i + 1]!;
  const k = b > a ? (p - a) / (b - a) : 0;
  return Math.min(c.t1, c.t0 + (i + k) * BIN_S);
}

/** 再生全体を何倍に延ばすか(編隊のいないターンは1) */
export function replayStretch(rp: SideReplay): number {
  return clockOf(rp).stretch;
}
