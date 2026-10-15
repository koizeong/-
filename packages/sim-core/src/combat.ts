import type { SimContext } from "./context.js";
import { fatigueFirepowerMultiplier } from "./fatigue.js";
import { detectionLevel } from "./detection.js";
import { aspectDamageMultiplier, attackAspect, type Aspect } from "./facing.js";
import { distance } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeDirectMaxRange, toeFire, toeHitPoints } from "./toe.js";
import { canAttack, type Unit } from "./unit.js";

export interface FireResult {
  attackerId: string;
  targetId: string;
  /** 直接射撃なら攻撃された面。間接射撃は向きの倍率がかからないので "indirect" */
  aspect: Aspect | "indirect";
  /** 目標の耐久に対する損害の割合(ゲージへの振り分け前) */
  damage: number;
  /** 士気への打撃の倍率(夜襲など。省略は1) */
  moraleMultiplier?: number;
  /** 制圧への効きの倍率(武器の制圧のしやすさ。省略は1) */
  suppressionMultiplier?: number;
}

export interface GaugeChange {
  strength: number;
  suppression: number;
  morale: number;
}

/**
 * 制圧による火力の倍率。装甲化率が高いほど落ちにくい(ハッチを閉めても撃てる)。
 * その代わり装甲は、制圧されると視界が大きく落ちる(detection.ts)
 */
export function suppressionFirepowerMultiplier(u: Unit, ctx: SimContext): number {
  const c = ctx.rules.combat;
  const armor = ctx.toes.toes[u.toe]!.armorRatio;
  return 1 - u.suppression * c.suppressionFirepowerPenalty * (1 - armor * c.armorSuppression.firepowerRelief);
}

/**
 * 後手からの一撃(反撃の好機)の倍率。前のターンに動かなかった部隊が、このターンに動いて(反撃に出て)、
 * 前のターンに前進していた敵を攻めるときに上がる。姿勢(予備)でさらに上がる
 */
export function counterattackMultiplier(a: Unit, target: Unit, ctx: SimContext, kind: "firepower" | "breakthrough", movingNow: boolean): number {
  if (a.movedLastTurn || !movingNow || !target.movedLastTurn) return 1;
  const c = ctx.rules.counterattack;
  return (kind === "firepower" ? c.firepowerMultiplier : c.breakthroughMultiplier) * stanceOf(a, ctx.rules).counterattackMultiplier;
}

/** 士気の状態による受ける損害の倍率。動揺・潰走しているユニットは大きな損害を受ける(直接射撃・砲撃・空襲に共通) */
export function moraleStateDamageTaken(u: Unit, ctx: SimContext): number {
  const m = ctx.rules.combat.moraleStateDamageTaken;
  if (u.routed) return m.routed;
  if (u.morale < ctx.rules.morale.shakenBelow) return m.shaken;
  return 1;
}

/**
 * 直接射撃の目標:自分で探知していて、直接射撃の射程内にいる敵すべて(ID順)。
 */
export function targetsInRange(attacker: Unit, units: readonly Unit[], ctx: SimContext, night?: NightFire): Unit[] {
  const range = toeDirectMaxRange(ctx.toes.toes[attacker.toe]!, ctx.weapons);
  return units
    .filter(
      (e) =>
        e.side !== attacker.side &&
        e.strength > 0 &&
        distance(attacker.pos, e.pos) <= range &&
        detectionLevel(attacker, e, ctx) > 0 &&
        (!night || night.attackers.has(attacker.id) || night.attackers.has(e.id)),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 夜間フェイズの撃ち合いの条件。夜襲する部隊(attackers)とその相手のあいだでだけ撃ち合う。
 * それ以外の部隊どうしは夜は撃たない
 */
export interface NightFire {
  attackers: ReadonlySet<string>;
}

/**
 * 1小ステップ分の直接射撃を計算する。全員がステップ開始時の状態で同時に撃つ(結果はまだ適用しない)。
 * 火力は射程内の目標すべてに均等に分ける。各目標への火力は、その目標との距離と装甲化率で決まる。
 * @param movedThisStep このステップに移動したユニット(戦闘移動中の射撃は火力が下がる)
 * @param breached 突破したユニット → 突破された相手。その相手への損害が上がる
 * @param firepowerBonus 撃つ側ごとの火力の上乗せ(伏撃の初撃)
 */
export function computeFire(
  units: readonly Unit[],
  ctx: SimContext,
  rng: Rng,
  movedThisStep: ReadonlySet<string>,
  night?: NightFire,
  breached?: ReadonlyMap<string, ReadonlySet<string>>,
  /** 撃つ側ごとの火力の上乗せ(伏撃の初撃など。省略は1) */
  firepowerBonus: (a: Unit) => number = () => 1,
  /** このターンに動いたユニット(後手からの一撃の判定に使う。省略は誰も動いていない) */
  movedThisTurn: ReadonlySet<string> = new Set(),
): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  const sorted = [...units].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const a of sorted) {
    if (!canAttack(a) || a.strength <= 0) continue;
    const targets = targetsInRange(a, sorted, ctx, night);
    if (targets.length === 0) continue;

    const aToe = ctx.toes.toes[a.toe]!;
    const share = 1 / targets.length;
    const attackerFactor =
      a.strength *
      suppressionFirepowerMultiplier(a, ctx) *
      rules.stances[effectiveStance(a, rules)]!.firepowerMultiplier *
      (movedThisStep.has(a.id) ? c.combatMoveFirepowerMultiplier : 1) *
      (a.ammo <= 0 ? rules.supply.outOfAmmoFirepowerMultiplier : 1) *
      (a.morale < rules.morale.shakenBelow ? rules.morale.shakenFirepowerMultiplier : 1) *
      fatigueFirepowerMultiplier(a, ctx) *
      firepowerBonus(a);

    for (const target of targets) {
      const tToe = ctx.toes.toes[target.toe]!;
      const d = distance(a.pos, target.pos);
      // 夜襲:夜襲する側は火力が落ちるが、相手の陣地の効果を減らす。士気への打撃は双方とも大きい
      const nightAttacking = night?.attackers.has(a.id) ?? false;
      const na = rules.night.nightAttack;
      const fire = toeFire(aToe, ctx.weapons, d, tToe.armorRatio, false);
      const firepower =
        fire.firepower * attackerFactor * share * (nightAttacking ? na.firepowerMultiplier : 1) *
        counterattackMultiplier(a, target, ctx, "firepower", movedThisTurn.has(a.id));
      if (firepower <= 0) continue;

      const dug = c.entrenchmentDamageTaken[target.entrenchment - rules.entrenchment.minLevel]!;
      const aspect = attackAspect(target.pos, target.facing, a.pos, rules.facing);
      const taken =
        aspectDamageMultiplier(aspect, rules.facing) *
        // 伏撃は側面・背後を突かれると脆い
        (aspect === "front" ? 1 : stanceOf(target, rules).flankRearDamageTakenMultiplier) *
        (nightAttacking ? 1 - (1 - dug) * na.entrenchmentEffectRetained : dug) *
        c.formationDamageTaken[target.formation] *
        rules.terrain[ctx.terrain.terrainAt(target.pos)]!.damageTakenMultiplier *
        rules.stances[effectiveStance(target, rules)]!.damageTakenMultiplier *
        moraleStateDamageTaken(target, ctx) *
        (breached?.get(a.id)?.has(target.id) ? rules.breakthrough.breachedDamageMultiplier : 1);

      const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
      const result: FireResult = {
        attackerId: a.id,
        targetId: target.id,
        aspect,
        damage: points / toeHitPoints(tToe),
        suppressionMultiplier: fire.suppression,
      };
      if (night) result.moraleMultiplier = na.moraleDamageMultiplier;
      results.push(result);
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
    // 潰走中は落伍・投降で、戦力を多く失う。死守は崩れても踏みとどまる分、戦力を多く失う
    const st = stanceOf(t, ctx.rules);
    const m = ctx.rules.morale;
    const holdOn = t.morale < m.routBelow ? st.brokenStrengthWeightMultiplier : t.morale < m.shakenBelow ? st.shakenStrengthWeightMultiplier : 1;
    const strengthWeight = w.strength * (t.routed ? ctx.rules.combat.routedStrengthWeightMultiplier : 1) * holdOn;
    t.strength = clamp01(t.strength - r.damage * strengthWeight);
    t.suppression = clamp01(t.suppression + r.damage * w.suppression * (r.suppressionMultiplier ?? 1));
    t.morale = clamp01(t.morale - r.damage * w.morale * (r.moraleMultiplier ?? 1));
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
