import { armorNow, armoredDamageFraction } from "./armor.js";
import { moraleStateDamageTaken, type FireResult } from "./combat.js";
import type { SimContext } from "./context.js";
import { frontCoverage, frontOf } from "./frontage.js";
import { distance, type Vec2 } from "./geometry.js";
import type { AirControl, AirMission } from "./hq.js";
import type { Rng } from "./rng.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeHitPoints, weaponEffectAgainst } from "./toe.js";
import type { Unit } from "./unit.js";
import { weaponPowerAt } from "./weapon.js";

/** 空襲の時間帯:ターン中のランダムなステップから strikeMinutes の間。乱数はミッションごとに1回 */
export function strikeWindow(ctx: SimContext, side: string, rng: Rng): { from: number; to: number } {
  const steps = ctx.turnSeconds / ctx.stepSeconds;
  const minutes = ctx.scenario.air[side]!.strike!.strikeMinutes;
  const len = Math.max(1, Math.min(steps, Math.round((minutes * 60) / ctx.stepSeconds)));
  const from = Math.floor(rng.next() * (steps - len + 1));
  return { from, to: from + len };
}

/**
 * 1小ステップ分の空襲の損害。範囲内のユニットは敵味方を問わない(誤射あり)。向きの倍率はかからない。
 * 補給線への攻撃は、範囲(radiusM)と叩く相手(only:行軍中の敵の縦隊)を変えて使う
 */
export function computeAirStrike(
  m: AirMission,
  units: readonly Unit[],
  ctx: SimContext,
  rng: Rng,
  effect = 1,
  opts: { radiusM?: number; only?: (u: Unit) => boolean } = {},
): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const cfg = ctx.scenario.air[m.side]!.strike!;
  const w = ctx.weapons.weapons[cfg.weapon]!;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  for (const t of [...units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (t.strength <= 0 || (opts.only && !opts.only(t))) continue;
    // 着弾範囲にかかった帯(正面幅)の割合だけ効く
    const covered = frontCoverage(frontOf(t, ctx), m.target, opts.radiusM ?? rules.air.strikeRadiusM);
    if (covered <= 0) continue;
    const tToe = ctx.toes.toes[t.toe]!;
    const firepower = cfg.count * weaponPowerAt(w, 0) * weaponEffectAgainst(w, armorNow(t, ctx)) * effect;
    const taken =
      c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
      c.formationDamageTaken[t.formation] *
        rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
      stanceOf(t, rules).damageTakenMultiplier *
      moraleStateDamageTaken(t, ctx);
    const points = firepower * covered * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
    const frac = armoredDamageFraction(t, ctx, w.effectiveness.soft, w.effectiveness.armored);
    results.push({ attackerId: `air:${m.side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: w.suppression, ...(frac !== undefined ? { armoredFraction: frac } : {}) });
  }
  return results;
}

/** 制空権の割合による、空襲・近接航空支援の効果の倍率 */
export function airEffect(control: number, ctx: SimContext): number {
  const e = ctx.rules.air.superiority.effectAtNoControl;
  return e + (1 - e) * control;
}

/**
 * 航空任務が迎撃される確率:その空域の制空権の割合が低いほど高く、護衛が多いほど低い
 * (interceptMax × (1 − 制空権) ÷ (1 + escortInterceptReduction × 護衛の出撃数))
 */
export function interceptChance(control: number, ctx: SimContext, escort = 0): number {
  const a = ctx.rules.air;
  return (a.superiority.interceptMax * (1 - control)) / (1 + a.escortInterceptReduction * escort);
}

/** 空域ごとの戦闘機の数(空域キー → 陣営 → 出撃数。護衛は重みをかけた数) */
export type AirPresence = Record<string, Record<string, number>>;

/**
 * 空域ごとの制空権を動かす(合計1を保つ)。戦闘機がいた空域だけ、基準の割合から出撃数の比へ learningRate の割合だけ近づく。
 * 誰も飛ばなかった空域は基準のまま
 */
export function updateAirControl(control: AirControl, presence: AirPresence, ctx: SimContext): AirControl {
  const k = ctx.rules.air.superiority.learningRate;
  const out: AirControl = {};
  for (const [sector, shares] of Object.entries(control)) {
    const here = presence[sector] ?? {};
    const total = Object.values(here).reduce((s, n) => s + n, 0);
    out[sector] = total <= 0 ? { ...shares } : Object.fromEntries(Object.entries(shares).map(([side, c]) => [side, (1 - k) * c + (k * (here[side] ?? 0)) / total]));
  }
  return out;
}

/**
 * 空戦:同じ空域に両陣営の戦闘機がいれば、陣営ごとに失う編隊の数。
 * 相手の出撃数 × dogfightLossPerSortie × 相手の割合(数で勝る側は失いにくい)
 */
export function dogfightLosses(here: Record<string, number>, ctx: SimContext): Record<string, number> {
  const total = Object.values(here).reduce((s, n) => s + n, 0);
  const out: Record<string, number> = {};
  for (const [side, own] of Object.entries(here)) {
    const enemy = total - own;
    if (enemy > 0 && own > 0) out[side] = enemy * ctx.rules.air.dogfightLossPerSortie * (enemy / total);
  }
  return out;
}

/** ユニットの対空の力(編成表の武器の antiAir の合計 × 戦力) */
export function antiAirOf(u: Unit, ctx: SimContext): number {
  const toe = ctx.toes.toes[u.toe]!;
  let s = 0;
  for (const e of toe.elements) for (const ref of e.weapons) s += e.count * ref.count * (ctx.weapons.weapons[ref.weapon]?.antiAir ?? 0);
  return s * u.strength;
}

/** 地点のまわり(flak.radiusM 以内)の、side の敵の対空の力の合計 */
export function flakPoints(side: string, at: Vec2, units: readonly Unit[], ctx: SimContext): number {
  const r = ctx.rules.air.flak.radiusM;
  return units.filter((u) => u.side !== side && u.strength > 0 && distance(u.pos, at) <= r).reduce((s, u) => s + antiAirOf(u, ctx), 0);
}

/** 対空砲の結果:失う編隊の数と、効果の倍率 */
export function flakResult(points: number, ctx: SimContext): { lostGroups: number; effect: number } {
  const f = ctx.rules.air.flak;
  return { lostGroups: Math.min(f.maxLossGroups, points * f.lossPerPoint), effect: 1 / (1 + points * f.effectPerPoint) };
}

/**
 * 1小ステップ分の近接航空支援の損害。支援する味方の近く(closeSupport.radiusM 以内)にいる、
 * 要請した陣営に見えている敵に、火力を均等に分ける(味方とは調整しているので誤射はない)
 */
export function computeCloseSupport(side: string, supported: Unit, units: readonly Unit[], seen: (u: Unit) => boolean, ctx: SimContext, rng: Rng, effect: number): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const cfg = ctx.scenario.air[side]!.strike!;
  const w = ctx.weapons.weapons[cfg.weapon]!;
  const minutes = ctx.stepSeconds / 60;
  const targets = [...units]
    .filter((t) => t.side !== side && t.strength > 0 && distance(t.pos, supported.pos) <= rules.air.closeSupport.radiusM && seen(t))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const results: FireResult[] = [];
  for (const t of targets) {
    const tToe = ctx.toes.toes[t.toe]!;
    const firepower = (cfg.count * weaponPowerAt(w, 0) * weaponEffectAgainst(w, armorNow(t, ctx)) * effect) / targets.length;
    const taken =
      c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
      c.formationDamageTaken[t.formation] *
      rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
      stanceOf(t, rules).damageTakenMultiplier *
      moraleStateDamageTaken(t, ctx);
    const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
    const frac = armoredDamageFraction(t, ctx, w.effectiveness.soft, w.effectiveness.armored);
    results.push({ attackerId: `air:${side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: w.suppression, ...(frac !== undefined ? { armoredFraction: frac } : {}) });
  }
  return results;
}

export interface AirDropResult {
  /** 受け取った陣営(誰もいなければ null) */
  receiver: string | null;
  deliveries: { unitId: string; ammoT: number; fuelT: number }[];
}

/**
 * 空輸の投下(units を書き換える)。投下地点の近くにいる自軍ユニットへ、近い順に不足分を配る。
 * 近くに自軍がいなくて敵だけがいれば、敵が受け取る。余りは失われる。
 */
export function applyAirDrop(m: AirMission, units: Unit[], ctx: SimContext): AirDropResult {
  const cfg = ctx.scenario.air[m.side]!.airlift!;
  const near = units
    .filter((u) => u.strength > 0 && distance(u.pos, m.target) <= ctx.rules.air.dropRadiusM)
    .sort((a, b) => distance(a.pos, m.target) - distance(b.pos, m.target) || (a.id < b.id ? -1 : 1));
  const own = near.filter((u) => u.side === m.side);
  const recipients = own.length > 0 ? own : near;
  const receiver = recipients[0]?.side ?? null;
  let ammoLeft = cfg.ammoT;
  let fuelLeft = cfg.fuelT;
  const deliveries: AirDropResult["deliveries"] = [];
  for (const u of recipients.filter((x) => x.side === receiver)) {
    const cap = ctx.toes.toes[u.toe]!.supply;
    const ammoT = Math.min(ammoLeft, (1 - u.ammo) * cap.ammoCapacityT);
    const fuelT = Math.min(fuelLeft, (1 - u.fuel) * cap.fuelCapacityT);
    if (cap.ammoCapacityT > 0) u.ammo = Math.min(1, u.ammo + ammoT / cap.ammoCapacityT);
    if (cap.fuelCapacityT > 0) u.fuel = Math.min(1, u.fuel + fuelT / cap.fuelCapacityT);
    ammoLeft -= ammoT;
    fuelLeft -= fuelT;
    if (ammoT > 0 || fuelT > 0) deliveries.push({ unitId: u.id, ammoT, fuelT });
  }
  return { receiver, deliveries };
}
