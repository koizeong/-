import type { SimContext } from "./context.js";
import { detectionLevel } from "./detection.js";
import { aspectDamageMultiplier, attackAspect, type Aspect } from "./facing.js";
import { distance } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { toeDirectFirepower, toeDirectMaxRange, toeHitPoints, toeTargetMix } from "./toe.js";
import { canAttack, type Unit } from "./unit.js";

export interface FireResult {
  attackerId: string;
  targetId: string;
  aspect: Aspect;
  /** 目標の耐久に対する損害の割合(ゲージへの振り分け前) */
  damage: number;
}

export interface GaugeChange {
  strength: number;
  suppression: number;
  morale: number;
}

/**
 * 直接射撃の目標:自分で探知していて、直接射撃の射程内にいる最も近い敵(同距離ならID順)。
 */
export function pickTarget(attacker: Unit, units: readonly Unit[], ctx: SimContext): Unit | null {
  const range = toeDirectMaxRange(ctx.toes.toes[attacker.toe]!, ctx.weapons);
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const e of units) {
    if (e.side === attacker.side || e.strength <= 0) continue;
    const d = distance(attacker.pos, e.pos);
    if (d > range || d > bestD) continue;
    if (d === bestD && best && best.id < e.id) continue;
    if (detectionLevel(attacker, e, ctx) === 0) continue;
    best = e;
    bestD = d;
  }
  return best;
}

/**
 * 1小ステップ分の直接射撃を計算する。全員がステップ開始時の状態で同時に撃つ(結果はまだ適用しない)。
 * @param movedThisStep このステップに移動したユニット(戦闘移動中の射撃は火力が下がる)
 */
export function computeFire(
  units: readonly Unit[],
  ctx: SimContext,
  rng: Rng,
  movedThisStep: ReadonlySet<string>,
): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  const sorted = [...units].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const a of sorted) {
    if (!canAttack(a) || a.strength <= 0) continue;
    const target = pickTarget(a, sorted, ctx);
    if (!target) continue;

    const aToe = ctx.toes.toes[a.toe]!;
    const tToe = ctx.toes.toes[target.toe]!;
    const d = distance(a.pos, target.pos);
    const firepower =
      toeDirectFirepower(aToe, ctx.weapons, d, toeTargetMix(tToe)) *
      a.strength *
      (1 - a.suppression * c.suppressionFirepowerPenalty) *
      rules.stances[effectiveStance(a, rules)]!.firepowerMultiplier *
      (movedThisStep.has(a.id) ? c.combatMoveFirepowerMultiplier : 1);
    if (firepower <= 0) continue;

    const aspect = attackAspect(target.pos, target.facing, a.pos, rules.facing);
    const taken =
      aspectDamageMultiplier(aspect, rules.facing) *
      c.entrenchmentDamageTaken[target.entrenchment - rules.entrenchment.minLevel]! *
      c.formationDamageTaken[target.formation] *
      rules.stances[effectiveStance(target, rules)]!.damageTakenMultiplier;

    const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
    results.push({ attackerId: a.id, targetId: target.id, aspect, damage: points / toeHitPoints(tToe) });
  }
  return results;
}

/** 損害を3ゲージに振り分けて適用する(units を書き換える)。ユニットごとの変化量を返す */
export function applyFire(units: Map<string, Unit>, results: readonly FireResult[], ctx: SimContext): Map<string, GaugeChange> {
  const w = ctx.rules.combat.gaugeWeights;
  const changes = new Map<string, GaugeChange>();
  for (const r of results) {
    const t = units.get(r.targetId)!;
    const before = { strength: t.strength, suppression: t.suppression, morale: t.morale };
    t.strength = clamp01(t.strength - r.damage * w.strength);
    t.suppression = clamp01(t.suppression + r.damage * w.suppression);
    t.morale = clamp01(t.morale - r.damage * w.morale);
    const ch = changes.get(t.id) ?? { strength: 0, suppression: 0, morale: 0 };
    ch.strength += t.strength - before.strength;
    ch.suppression += t.suppression - before.suppression;
    ch.morale += t.morale - before.morale;
    changes.set(t.id, ch);
  }
  return changes;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
