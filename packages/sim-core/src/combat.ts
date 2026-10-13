import type { SimContext } from "./context.js";
import { detectionLevel } from "./detection.js";
import { aspectDamageMultiplier, attackAspect, type Aspect } from "./facing.js";
import { distance } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { toeDirectFirepower, toeDirectMaxRange, toeHitPoints } from "./toe.js";
import { canAttack, type Unit } from "./unit.js";

export interface FireResult {
  attackerId: string;
  targetId: string;
  /** 直接射撃なら攻撃された面。間接射撃は向きの倍率がかからないので "indirect" */
  aspect: Aspect | "indirect";
  /** 目標の耐久に対する損害の割合(ゲージへの振り分け前) */
  damage: number;
}

export interface GaugeChange {
  strength: number;
  suppression: number;
  morale: number;
}

/**
 * 直接射撃の目標:自分で探知していて、直接射撃の射程内にいる敵すべて(ID順)。
 */
export function targetsInRange(attacker: Unit, units: readonly Unit[], ctx: SimContext): Unit[] {
  const range = toeDirectMaxRange(ctx.toes.toes[attacker.toe]!, ctx.weapons);
  return units
    .filter(
      (e) =>
        e.side !== attacker.side &&
        e.strength > 0 &&
        distance(attacker.pos, e.pos) <= range &&
        detectionLevel(attacker, e, ctx) > 0,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 1小ステップ分の直接射撃を計算する。全員がステップ開始時の状態で同時に撃つ(結果はまだ適用しない)。
 * 火力は射程内の目標すべてに均等に分ける。各目標への火力は、その目標との距離と装甲化率で決まる。
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
    const targets = targetsInRange(a, sorted, ctx);
    if (targets.length === 0) continue;

    const aToe = ctx.toes.toes[a.toe]!;
    const share = 1 / targets.length;
    const attackerFactor =
      a.strength *
      (1 - a.suppression * c.suppressionFirepowerPenalty) *
      rules.stances[effectiveStance(a, rules)]!.firepowerMultiplier *
      (movedThisStep.has(a.id) ? c.combatMoveFirepowerMultiplier : 1) *
      (a.ammo <= 0 ? rules.supply.outOfAmmoFirepowerMultiplier : 1) *
      (a.morale < rules.morale.shakenBelow ? rules.morale.shakenFirepowerMultiplier : 1);

    for (const target of targets) {
      const tToe = ctx.toes.toes[target.toe]!;
      const d = distance(a.pos, target.pos);
      const firepower = toeDirectFirepower(aToe, ctx.weapons, d, tToe.armorRatio) * attackerFactor * share;
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
