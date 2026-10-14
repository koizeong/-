import type { SimContext } from "./context.js";
import { isInfiltrating } from "./detection.js";
import { aspectDamageMultiplier, attackAspect } from "./facing.js";
import { distance, type Vec2 } from "./geometry.js";
import { effectiveStance } from "./stance.js";
import { toeHitPoints } from "./toe.js";
import type { Unit } from "./unit.js";

/**
 * 阻止圏:展開済みで潰走していないユニットが周囲に持つ。
 * 敵の阻止圏の中で、そのユニットに近づく動き(すり抜け・通過・肉薄)は、突破判定に勝たないとできない。
 * 離れる動きは止められない。
 */
export interface HoldingZone {
  unit: Unit;
  /** ステップ開始時の位置と向き(処理順で結果が変わらないよう、ステップの間は固定する) */
  pos: Vec2;
  facing: number;
}

/** ステップ開始時点の阻止圏の一覧 */
export function holdingZones(units: readonly Unit[]): HoldingZone[] {
  return units
    .filter((u) => u.formation === "deployed" && !u.routed && u.strength > 0)
    .map((u) => ({ unit: u, pos: { ...u.pos }, facing: u.facing }));
}

/** 士気・制圧による力の倍率(突破する側・阻止する側に共通) */
function conditionFactor(u: Unit, ctx: SimContext): number {
  const b = ctx.rules.breakthrough;
  return (1 - u.suppression * b.suppressionPenalty) * (u.morale < ctx.rules.morale.shakenBelow ? b.shakenMultiplier : 1);
}

/**
 * 突破する側の力:規模(耐久)× 装甲化率の補正 × 状態 × 移動の仕方 × 姿勢。
 * 損害を無視する姿勢(強襲)なら、自分の制圧・動揺で力が下がらない
 */
export function breakthroughPower(u: Unit, ctx: SimContext): number {
  const b = ctx.rules.breakthrough;
  const toe = ctx.toes.toes[u.toe]!;
  const stance = ctx.rules.stances[effectiveStance(u, ctx.rules)]!;
  const mode = isInfiltrating(u, ctx) ? b.infiltrationMultiplier : u.formation === "column" ? b.columnMultiplier : 1;
  const condition = stance.breakthroughIgnoresDamage ? 1 : conditionFactor(u, ctx);
  return toeHitPoints(toe) * u.strength * (1 + b.armorBonus * toe.armorRatio) * condition * mode * stance.breakthroughMultiplier;
}

/** 阻止する側の力:規模(耐久)× 陣地 × 状態 ÷ 突かれた面(側面・背後は弱い) */
export function holdingPower(zone: HoldingZone, from: Vec2, ctx: SimContext): number {
  const { rules } = ctx;
  const u = zone.unit;
  const toe = ctx.toes.toes[u.toe]!;
  const dug = rules.breakthrough.entrenchmentMultiplier[u.entrenchment - rules.entrenchment.minLevel]!;
  const aspect = attackAspect(zone.pos, zone.facing, from, rules.facing);
  return (toeHitPoints(toe) * u.strength * dug * conditionFactor(u, ctx)) / aspectDamageMultiplier(aspect, rules.facing);
}

/** 突破判定(決定的):力の比がしきい値以上なら突破できる */
export function canBreakThrough(mover: Unit, zone: HoldingZone, ctx: SimContext): boolean {
  const hold = holdingPower(zone, mover.pos, ctx);
  if (hold <= 0) return true;
  return breakthroughPower(mover, ctx) / hold >= ctx.rules.breakthrough.ratioThreshold;
}

export type ZoneCheck = { blockedBy: Unit } | { blockedBy: null; breaching: Unit[] };

/**
 * from → to の動きを、敵の阻止圏で判定する。
 * 阻止圏の中でその敵に近づく動きだけが判定の対象。1つでも突破できなければ止まる。
 * 潰走中のユニットは判定しない(逃げる動きを止めない)
 */
export function checkZones(mover: Unit, from: Vec2, to: Vec2, zones: readonly HoldingZone[], ctx: SimContext): ZoneCheck {
  const breaching: Unit[] = [];
  if (mover.routed) return { blockedBy: null, breaching };
  const r = ctx.rules.breakthrough.zoneRadiusM;
  for (const z of zones) {
    if (z.unit.side === mover.side || z.unit.strength <= 0) continue;
    const dTo = distance(to, z.pos);
    if (dTo >= r || dTo >= distance(from, z.pos)) continue;
    if (!canBreakThrough(mover, z, ctx)) return { blockedBy: z.unit };
    breaching.push(z.unit);
  }
  return { blockedBy: null, breaching };
}
