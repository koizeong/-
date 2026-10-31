import { breakthroughPower, holdingPower, type HoldingZone } from "./breakthrough.js";
import type { SimContext } from "./context.js";
import { frontageOf, unitDistance } from "./frontage.js";
import { effectiveStance, isStanceSpent, stanceOf } from "./stance.js";
import type { Unit } from "./unit.js";

export interface AssaultResult {
  attackerId: string;
  targetId: string;
  /** 守り手を陣地から追い出した */
  success: boolean;
}

/**
 * 肉薄(combat.assault):突撃の姿勢(assault.stances)の部隊が、弱った敵(制圧が minSuppression 以上か、動揺)に
 * rangeM まで迫ったら、陣地を奪い合う判定をする(1ターンに1部隊1回。done に記録する)。
 * 力の比(突破の力 ÷ 阻止の力。陣地・制圧・士気・突かれた面が効く)が ratioThreshold(固い陣地は entrenchmentRatioMultiplier 倍)以上なら、守り手は陣地を捨てて崩れる
 * (士気が潰走のしきい値を割り、取りつかれた分の戦力を失う。潰走しない姿勢なら、その場で戦力を失う)。
 * 届かなければ、攻め手が戦力・士気を失う(突撃が撃退された)。
 * 判定はステップの始めの状態で順に行う(攻め手のIDの順。同じ守り手を続けて攻めるときは、先の判定の結果を見る)
 */
export function resolveAssaults(units: readonly Unit[], done: Set<string>, ctx: SimContext): AssaultResult[] {
  const a = ctx.rules.combat.assault;
  if (!a) return [];
  const m = ctx.rules.morale;
  const out: AssaultResult[] = [];
  const live = (u: Unit) => u.strength > 0 && !u.routed;
  const attackers = units
    .filter((u) => live(u) && u.formation === "deployed" && !done.has(u.id) && a.stances.includes(effectiveStance(u, ctx.rules)) && !isStanceSpent(u, ctx.rules))
    .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  for (const u of attackers) {
    const weak = (t: Unit) => t.suppression >= a.minSuppression || t.morale < m.shakenBelow;
    const target = units
      .filter((t) => t.side !== u.side && live(t) && t.formation === "deployed" && weak(t))
      .map((t) => ({ t, d: unitDistance(u, t, ctx) }))
      .filter((x) => x.d <= a.rangeM)
      .sort((p, q) => p.d - q.d || (p.t.id < q.t.id ? -1 : 1))[0]?.t;
    if (!target) continue;
    done.add(u.id);
    const zone: HoldingZone = { unit: target, pos: target.pos, facing: target.facing, width: frontageOf(target, ctx) };
    const hold = holdingPower(zone, u.pos, ctx, u);
    // 固い陣地ほど、追い出すのに要る力の比が上がる
    const dugK = a.entrenchmentRatioMultiplier?.[target.entrenchment - ctx.rules.entrenchment.minLevel] ?? 1;
    const success = hold <= 0 || breakthroughPower(u, ctx) / hold >= a.ratioThreshold * dugK;
    if (success) {
      target.strength = Math.max(0, target.strength - a.defenderStrengthLoss);
      // 潰走しない姿勢(死守)は崩れずに踏みとどまり、その場で戦力を失う
      if (!stanceOf(target, ctx.rules).neverRouts) target.morale = Math.min(target.morale, m.routBelow - 1e-6);
      target.entrenchment = ctx.rules.entrenchment.minLevel;
      target.dugInSeconds = 0;
    } else {
      u.strength = Math.max(0, u.strength - a.attackerStrengthLoss);
      u.morale = Math.max(0, u.morale - a.attackerMoraleLoss);
    }
    out.push({ attackerId: u.id, targetId: target.id, success });
  }
  return out;
}
