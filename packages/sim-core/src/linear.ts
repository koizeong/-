import type { SimContext } from "./context.js";
import { trainingLevelId } from "./training.js";
import type { Unit } from "./unit.js";

/**
 * 線形戦術の時代(ナポレオン戦争)の、隊形の秩序(乱れ)と斉射。ルールパックの cohesion・combat.volley があるときだけ効く
 * (二次大戦の散開した歩兵には整列も斉射もない)。docs/research/napoleonic-mechanics-review.md の C・D
 */

/** 乱れ(0〜1) */
export function disorderOf(u: Unit): number {
  return u.disorder ?? 0;
}

/** 乱れを足す(0〜1に収める) */
export function addDisorder(u: Unit, x: number, ctx: SimContext): void {
  if (!ctx.rules.cohesion || x <= 0 || u.strength <= 0) return;
  const v = Math.min(1, disorderOf(u) + x);
  if (v > 1e-3) u.disorder = v;
}

/** 乱れによる火力の倍率 */
export function disorderFirepowerMultiplier(u: Unit, ctx: SimContext): number {
  const c = ctx.rules.cohesion;
  return c ? 1 - c.firepowerPenalty * disorderOf(u) : 1;
}

/** 乱れによる受ける損害の倍率 */
export function disorderDamageTakenMultiplier(u: Unit, ctx: SimContext): number {
  const c = ctx.rules.cohesion;
  return c ? 1 + c.damageTakenIncrease * disorderOf(u) : 1;
}

/** 乱れによる、突撃に踏みとどまる落ち着きの倍率 */
export function disorderShockMultiplier(u: Unit, ctx: SimContext): number {
  const c = ctx.rules.cohesion;
  return c ? 1 - c.shockPenalty * disorderOf(u) : 1;
}

/** 動いて地形を越えた分の乱れ(展開した隊形だけ。縦隊は崩れずに抜ける) */
export function disorderFromMove(u: Unit, terrain: string, meters: number, ctx: SimContext): void {
  const c = ctx.rules.cohesion;
  if (!c || u.formation !== "deployed" || meters <= 0) return;
  addDisorder(u, ((c.terrainPer100m[terrain] ?? 0) * meters) / 100, ctx);
}

/** 1刻みの立て直し:このステップに動かなかった部隊だけ、整列し直す(撃たれている間は遅い) */
export function recoverDisorder(units: readonly Unit[], moved: ReadonlySet<string>, hit: ReadonlySet<string>, ctx: SimContext): void {
  const c = ctx.rules.cohesion;
  if (!c) return;
  const min = ctx.stepSeconds / 60;
  for (const u of units) {
    if (u.disorder === undefined || moved.has(u.id)) continue;
    const v = u.disorder - c.recoveryPerMin * min * (hit.has(u.id) ? c.underFireRecoveryMultiplier : 1);
    if (v <= 1e-3) delete u.disorder;
    else u.disorder = v;
  }
}

/** 撃ち始める距離(m。斉射の武器だけ)。決まりがなければ制限なし */
export function openFireRangeM(u: Unit, ctx: SimContext): number {
  const v = ctx.rules.combat.volley;
  if (!v) return Infinity;
  return v.openFireM[trainingLevelId(u, ctx.rules)] ?? Infinity;
}

/** 装填して待った最初の斉射か(時刻 t に撃つとき) */
export function volleyLoaded(u: Unit, t: number, ctx: SimContext): boolean {
  const v = ctx.rules.combat.volley;
  if (!v) return false;
  return u.volleyFiredAt === undefined || t - u.volleyFiredAt >= v.restoreMinutes * 60;
}
