import type { SimContext } from "./context.js";
import type { ContactView } from "./intel.js";
import { toeHitPoints } from "./toe.js";
import type { Unit } from "./unit.js";

/**
 * 損耗(勝利条件の「敵の損耗率」に使う)。
 * 陣営の総戦力 = 編成表の耐久 × 戦力 の合計。損耗率 = これまでに加わった総戦力(開始時 + 到着した増援)のうち、失われた割合。
 * 壊滅・投降した部隊は全部、生き残った部隊も減った分を数える。
 */

/** 陣営ごとの今の総戦力 */
export function forceNow(units: readonly Unit[], ctx: SimContext): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of units) out[u.side] = (out[u.side] ?? 0) + toeHitPoints(ctx.toes.toes[u.toe]!) * Math.max(0, u.strength);
  return out;
}

/** side から見た敵(ほかの陣営すべて)の損耗率 */
export function enemyLossRatio(side: string, totals: Record<string, number>, now: Record<string, number>): number {
  let total = 0;
  let left = 0;
  for (const [s, t] of Object.entries(totals)) {
    if (s === side) continue;
    total += t;
    left += now[s] ?? 0;
  }
  return total > 0 ? Math.max(0, 1 - left / total) : 0;
}

/** 自陣営の損耗率 */
export function ownLossRatio(side: string, totals: Record<string, number>, now: Record<string, number>): number {
  const t = totals[side] ?? 0;
  return t > 0 ? Math.max(0, 1 - (now[side] ?? 0) / t) : 0;
}

/**
 * 霧の内側から見積もる敵の損耗率(プレイヤーの画面とAIが使う。正確な値はサーバーだけが持つ)。
 * 見つけたことのある敵それぞれについて、撃破を確認していれば1、規模の推定があれば 1 − 推定戦力、なければ0とし、平均をとる
 */
export function estimateEnemyLoss(contacts: readonly ContactView[]): number {
  if (contacts.length === 0) return 0;
  let s = 0;
  for (const c of contacts) s += c.destroyed ? 1 : c.estimatedStrength !== undefined ? Math.max(0, 1 - c.estimatedStrength) : 0;
  return s / contacts.length;
}
