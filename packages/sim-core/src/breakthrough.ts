import { counterattackMultiplier } from "./combat.js";
import type { SimContext } from "./context.js";
import { isInfiltrating } from "./detection.js";
import { aspectDamageMultiplier, attackAspect } from "./facing.js";
import { distance, type Vec2 } from "./geometry.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeHitPoints } from "./toe.js";
import { cloneUnit, type Unit } from "./unit.js";

/**
 * 阻止圏:展開済みで潰走していないユニットが周囲に持つ。
 * 敵の阻止圏の中で、そのユニットに近づく動き(すり抜け・通過・肉薄)は、突破判定に勝たないとできない。
 * 離れる動きは止められない。
 */
export interface HoldingZone {
  /**
   * ステップ開始時のユニットの写し。処理順で結果が変わらないよう、ステップの間は固定する
   * (同じステップで先に動いたユニットの陣地が0に戻っても、阻止の力はステップ開始時のまま)
   */
  unit: Unit;
  pos: Vec2;
  facing: number;
}

/** ステップ開始時点の阻止圏の一覧 */
export function holdingZones(units: readonly Unit[]): HoldingZone[] {
  return units
    .filter((u) => u.formation === "deployed" && !u.routed && u.strength > 0)
    .map((u) => {
      const snap = cloneUnit(u);
      return { unit: snap, pos: snap.pos, facing: snap.facing };
    });
}

/**
 * 士気・制圧による力の倍率(突破する側・阻止する側に共通)。
 * 阻止する側(holding)は、陣地のレベルに応じて制圧の影響が小さくなる
 */
function conditionFactor(u: Unit, ctx: SimContext, holding = false): number {
  const b = ctx.rules.breakthrough;
  const shield = holding ? Math.max(0, 1 - b.entrenchedSuppressionShield * (u.entrenchment - ctx.rules.entrenchment.minLevel)) : 1;
  return (1 - u.suppression * b.suppressionPenalty * shield) * (u.morale < ctx.rules.morale.shakenBelow ? b.shakenMultiplier : 1);
}

/**
 * 突破する側の力:規模(耐久)× 装甲化率の補正 × 状態 × 移動の仕方 × 姿勢。
 * 損害を無視する姿勢(強襲)なら、自分の制圧・動揺で力が下がらない
 */
export function breakthroughPower(u: Unit, ctx: SimContext): number {
  const b = ctx.rules.breakthrough;
  const toe = ctx.toes.toes[u.toe]!;
  const stance = stanceOf(u, ctx.rules);
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
  return (toeHitPoints(toe) * u.strength * dug * conditionFactor(u, ctx, true)) / aspectDamageMultiplier(aspect, rules.facing);
}

/** 突破判定(決定的):力の比がしきい値以上なら突破できる。from は突く位置(省略は今の位置) */
export function canBreakThrough(mover: Unit, zone: HoldingZone, ctx: SimContext, from: Vec2 = mover.pos): boolean {
  const hold = holdingPower(zone, from, ctx);
  if (hold <= 0) return true;
  // 後手からの一撃:前進してきた敵へ、待っていた部隊が反撃に出るなら突破しやすい(突破を試みる部隊は動いている)
  const counter = counterattackMultiplier(mover, zone.unit, ctx, "breakthrough", true);
  return (breakthroughPower(mover, ctx) * counter) / hold >= ctx.rules.breakthrough.ratioThreshold;
}

/**
 * 阻止圏の判定の余裕(m)。座標の丸め誤差(左右を入れ替えた計算などで 1e-12 m 程度ずれる)で、
 * 縁ちょうどの判定が揺れないようにする
 */
export const ZONE_EPSILON_M = 1e-6;

export type ZoneCheck = { blockedBy: Unit } | { blockedBy: null; breaching: Unit[] };

/**
 * from → to の動きを、敵の阻止圏で判定する。
 * 阻止圏の中でその敵に近づく動きだけが判定の対象。1つでも突破できなければ止まる。
 * 潰走中のユニットも判定する(離れる動きは止めないので逃げられるが、敵中は突っ切れない。包囲されれば投降する)
 */
export function checkZones(mover: Unit, from: Vec2, to: Vec2, zones: readonly HoldingZone[], ctx: SimContext): ZoneCheck {
  const breaching: Unit[] = [];
  const r = ctx.rules.breakthrough.zoneRadiusM;
  for (const z of zones) {
    if (z.unit.side === mover.side || z.unit.strength <= 0) continue;
    const dTo = distance(to, z.pos);
    if (dTo >= r - ZONE_EPSILON_M || dTo >= distance(from, z.pos) - ZONE_EPSILON_M) continue;
    if (!canBreakThrough(mover, z, ctx)) return { blockedBy: z.unit };
    breaching.push(z.unit);
  }
  return { blockedBy: null, breaching };
}
