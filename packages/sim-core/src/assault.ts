import { disorderShockMultiplier, hasVolleyWeapon } from "./linear.js";
import { isNaval } from "./naval.js";
import { breakthroughPower, holdingPower, type HoldingZone } from "./breakthrough.js";
import type { SimContext } from "./context.js";
import { frontageOf, unitDistance } from "./frontage.js";
import { attackAspect } from "./facing.js";
import type { Rng } from "./rng.js";
import { effectiveStance, isStanceSpent, stanceOf } from "./stance.js";
import type { Unit } from "./unit.js";

export interface AssaultResult {
  attackerId: string;
  targetId: string;
  /** 守り手を陣地から追い出した */
  success: boolean;
  /** 士気の衝撃で決めたときの、守り手が踏みとどまる見込み(0〜1) */
  standChance?: number;
}

/**
 * 肉薄(combat.assault):突撃の姿勢(assault.stances)の部隊が、弱った敵(制圧が minSuppression 以上か、動揺)に
 * rangeM まで迫ったら、陣地を奪い合う判定をする(1ターンに1部隊1回。done に記録する)。
 * 力の比(突破の力 ÷ 阻止の力。陣地・制圧・士気・突かれた面が効く)が ratioThreshold(固い陣地は entrenchmentRatioMultiplier 倍)以上なら、守り手は陣地を捨てて崩れる
 * (士気が潰走のしきい値を割り、取りつかれた分の戦力を失う。潰走しない姿勢なら、その場で戦力を失う)。
 * 届かなければ、攻め手が戦力・士気を失う(突撃が撃退された)。
 * 判定はステップの始めの状態で順に行う(攻め手のIDの順。同じ守り手を続けて攻めるときは、先の判定の結果を見る)
 */
export function resolveAssaults(
  units: readonly Unit[],
  done: Set<string>,
  ctx: SimContext,
  rng?: Rng,
  /** 守り手が装填して待っているか・斉射を使ったことの記録(combat.volley。近い距離の斉射で突撃を迎える。省略は誰も待っていない) */
  volley?: { loaded: (u: Unit) => boolean; fire: (u: Unit) => void },
): AssaultResult[] {
  const a = ctx.rules.combat.assault;
  if (!a) return [];
  const m = ctx.rules.morale;
  const out: AssaultResult[] = [];
  const live = (u: Unit) => u.strength > 0 && !u.routed;
  const attackers = units
    .filter((u) => live(u) && u.formation === "deployed" && !isNaval(u, ctx) && !done.has(u.id) && a.stances.includes(effectiveStance(u, ctx.rules)) && !isStanceSpent(u, ctx.rules))
    .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  for (const u of attackers) {
    // 士気の衝撃で決めるときは、弱った相手でなくても迫れば判定する(崩れるかは守り手の落ち着き次第)
    const weak = (t: Unit) => !!a.shock || t.suppression >= a.minSuppression || t.morale < m.shakenBelow;
    const target = units
      .filter((t) => t.side !== u.side && live(t) && t.formation === "deployed" && !isNaval(t, ctx) && weak(t))
      .map((t) => ({ t, d: unitDistance(u, t, ctx) }))
      .filter((x) => x.d <= a.rangeM)
      .sort((p, q) => p.d - q.d || (p.t.id < q.t.id ? -1 : 1))[0]?.t;
    if (!target) continue;
    done.add(u.id);
    const zone: HoldingZone = { unit: target, pos: target.pos, facing: target.facing, width: frontageOf(target, ctx) };
    const hold = holdingPower(zone, u.pos, ctx, u);
    // 固い陣地ほど、追い出すのに要る力の比が上がる
    const dugK = a.entrenchmentRatioMultiplier?.[target.entrenchment - ctx.rules.entrenchment.minLevel] ?? 1;
    const ratio = hold <= 0 ? Infinity : breakthroughPower(u, ctx) / hold;
    let standChance: number | undefined;
    let success: boolean;
    if (a.shock && rng) {
      // 装填して待っていた守り手は、近い距離の斉射で迎える(斉射を使い切る)
      const steady = !!volley && volley.loaded(target) && hasVolleyWeapon(target, ctx);
      standChance = shockStandChance(u, target, ratio / dugK, ctx, steady);
      if (steady) volley!.fire(target);
      success = rng.next() >= standChance;
    } else success = ratio >= a.ratioThreshold * dugK;
    if (success) {
      target.strength = Math.max(0, target.strength - a.defenderStrengthLoss);
      // 潰走しない姿勢(死守)は崩れずに踏みとどまり、その場で戦力を失う
      if (!stanceOf(target, ctx.rules).neverRouts) target.morale = Math.min(target.morale, m.routBelow - 1e-6);
      target.entrenchment = ctx.rules.entrenchment.minLevel;
      target.dugInSeconds = 0;
    } else {
      u.strength = Math.max(0, u.strength - a.attackerStrengthLoss);
      u.morale = Math.max(0, u.morale - (a.shock && standChance !== undefined ? a.shock.repulsedMoraleLoss : a.attackerMoraleLoss));
    }
    out.push({ attackerId: u.id, targetId: target.id, success, ...(standChance !== undefined ? { standChance } : {}) });
  }
  return out;
}

/**
 * 士気の衝撃:守り手が踏みとどまる見込み。落ち着き = 士気 ×(1 − 制圧の重み × 制圧)× 隊形の兵科ごとの倍率 × 突かれた面の倍率、
 * 勢い = 士気 ×(1 − 制圧の重み × 制圧)× 隊形の勢いの倍率 × 力の比^指数。見込み = 落ち着き^k ÷(落ち着き^k + 勢い^k)
 */
export function shockStandChance(attacker: Unit, defender: Unit, ratio: number, ctx: SimContext, steadyVolley = false): number {
  const s = ctx.rules.combat.assault!.shock!;
  const dSt = stanceOf(defender, ctx.rules);
  const aspect = dSt.ignoresFacing ? "front" : attackAspect(defender.pos, defender.facing, attacker.pos, ctx.rules.facing);
  const faceK = aspect === "rear" ? s.rearMultiplier : aspect === "flank" ? s.flankMultiplier : 1;
  const steady = Math.max(1e-3, defender.morale * (1 - s.suppressionWeight * defender.suppression) * (dSt.shockResistFromBranch[attacker.branch] ?? 1) * faceK * disorderShockMultiplier(defender, ctx) * (steadyVolley ? (ctx.rules.combat.volley?.shockSteadyMultiplier ?? 1) : 1));
  const r = Number.isFinite(ratio) ? Math.max(0.05, ratio) : 20;
  const impetus = Math.max(1e-3, attacker.morale * (1 - s.suppressionWeight * attacker.suppression) * stanceOf(attacker, ctx.rules).shockMultiplier * disorderShockMultiplier(attacker, ctx) * r ** s.ratioExponent);
  const k = s.sharpness;
  return steady ** k / (steady ** k + impetus ** k);
}
