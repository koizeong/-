import type { SimContext } from "./context.js";
import { bearing, distance, normalizeBearing } from "./geometry.js";
import { trainingLevelId } from "./training.js";
import type { Unit } from "./unit.js";
import { toeHasVolley } from "./toe.js";

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

/** 斉射の武器の今の状態:装填して待った最初の斉射か、撃ち続けている分(分) */
export interface VolleyState {
  loaded: boolean;
  firingMinutes: number;
}

/** 時刻 t に撃つときの斉射の状態 */
export function volleyStateAt(u: Unit, t: number, ctx: SimContext): VolleyState {
  const loaded = volleyLoaded(u, t, ctx);
  return { loaded, firingMinutes: loaded || u.firingSinceSec === undefined ? 0 : Math.max(0, (t - u.firingSinceSec) / 60) };
}

/**
 * 斉射の武器の効きの倍率(装填して待った最初の斉射、その後の撃ち合いの練度ごとの効きと銃身の汚れ、天候)。
 * 斉射の決まり(combat.volley)がなければ1
 */
export function volleyMultiplier(u: Unit, state: VolleyState, ctx: SimContext): number {
  const v = ctx.rules.combat.volley;
  if (!v) return 1;
  const weather = ctx.weather !== undefined ? (v.weatherMultiplier[ctx.weather] ?? 1) : 1;
  if (state.loaded) return v.firstVolleyMultiplier * weather;
  const drill = v.sustainedByTraining[trainingLevelId(u, ctx.rules)] ?? 1;
  const fouling = Math.max(v.foulingFloor, 1 - v.foulingPerMin * state.firingMinutes);
  return drill * fouling * weather;
}

/** 操典どおりの斉射を保てる練度か(画面の再生の描き分け) */
export function controlledFire(u: Unit, ctx: SimContext): boolean {
  return !!ctx.rules.combat.volley?.controlledTraining.includes(trainingLevelId(u, ctx.rules));
}

/** 撃った部隊の斉射の時刻を記録する(撃ち合いの始めなら、撃ち始めの時刻も) */
export function markVolley(u: Unit, t: number, ctx: SimContext): void {
  if (volleyLoaded(u, t, ctx)) u.firingSinceSec = t;
  u.volleyFiredAt = t;
}

/**
 * 支援:後ろ(正面と反対の半分)の morale.support.rearM の内に、潰走していない味方の部隊がいるか(第2線)
 */
export function supported(u: Unit, units: readonly Unit[], ctx: SimContext): boolean {
  const s = ctx.rules.morale.support;
  if (!s) return false;
  return units.some((f) => {
    if (f === u || f.side !== u.side || f.strength <= 0 || f.routed) return false;
    const d = distance(u.pos, f.pos);
    if (d <= 1 || d > s.rearM) return false;
    const rel = normalizeBearing(bearing(u.pos, f.pos) - u.facing);
    return rel > 90 && rel < 270;
  });
}

/** 斉射の武器を持つ部隊か */
export function hasVolleyWeapon(u: Unit, ctx: SimContext): boolean {
  const toe = ctx.toes.toes[u.toe];
  return !!toe && toeHasVolley(toe, ctx.weapons);
}
