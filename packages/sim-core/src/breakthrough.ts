import { armorNow } from "./armor.js";
import { counterattackMultiplier } from "./combat.js";
import type { SimContext } from "./context.js";
import { isInfiltrating } from "./detection.js";
import { aspectDamageMultiplier, attackAspect } from "./facing.js";
import { distanceToFront, frontageOf, frontDistance, nearestOnFront } from "./frontage.js";
import { distance, type Vec2 } from "./geometry.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeHitPoints } from "./toe.js";
import { trainingOf } from "./training.js";
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
  /** 正面幅(m)。阻止圏はこの帯から zoneRadiusM の範囲(幅0なら円) */
  width: number;
}

/** ステップ開始時点の阻止圏の一覧 */
export function holdingZones(units: readonly Unit[], ctx: SimContext): HoldingZone[] {
  return units
    .filter((u) => u.formation === "deployed" && !u.routed && u.strength > 0)
    .map((u) => {
      const snap = cloneUnit(u);
      return { unit: snap, pos: snap.pos, facing: snap.facing, width: frontageOf(snap, ctx) };
    });
}

/** 点 p と阻止圏の帯との距離(阻止圏は、この距離が zoneRadiusM 未満の範囲) */
export function zoneDistance(zone: HoldingZone, p: Vec2): number {
  return distanceToFront(zone, p);
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
  return toeHitPoints(toe) * u.strength * (1 + b.armorBonus * armorNow(u, ctx)) * condition * mode * stance.breakthroughMultiplier * trainingOf(u, ctx.rules).breakthroughMultiplier;
}

/** 阻止する側の力:規模(耐久)× 陣地 × 状態 ÷ 突かれた面(側面・背後は弱い) */
export function holdingPower(zone: HoldingZone, from: Vec2, ctx: SimContext): number {
  const { rules } = ctx;
  const u = zone.unit;
  const toe = ctx.toes.toes[u.toe]!;
  const dug = rules.breakthrough.entrenchmentMultiplier[u.entrenchment - rules.entrenchment.minLevel]!;
  // 突かれた面は、帯の上でいちばん近い点から見る(帯の正面に並んでいれば正面、帯の端の横なら側面)
  const aspect = attackAspect(nearestOnFront(zone, from), zone.facing, from, rules.facing);
  const branch = ctx.branches.branches[u.branch]!;
  return (
    (toeHitPoints(toe) * u.strength * dug * conditionFactor(u, ctx, true) * trainingOf(u, rules).breakthroughMultiplier * branch.holdingMultiplier) /
    aspectDamageMultiplier(aspect, rules.facing)
  );
}

/**
 * 同じ阻止圏に押し入ろうとしている味方(戦力の集中に加わる部隊)。ステップ開始時の写し(zones)から選ぶ:
 * 突破する部隊と同じ陣営・展開済み・その敵から concentrationRadiusM 以内・次の経由点への向きがその敵の方を向いている
 */
export function supportersOf(mover: Unit, zone: HoldingZone, zones: readonly HoldingZone[], ctx: SimContext): Unit[] {
  const b = ctx.rules.breakthrough;
  if (b.concentrationWeight <= 0 || b.concentrationRadiusM <= 0) return [];
  return zones
    .map((z) => z.unit)
    .filter((f) => {
      if (f.side !== mover.side || f.id === mover.id || f.strength <= 0 || f.routed || f.route.length === 0) return false;
      if (zoneDistance(zone, f.pos) > b.concentrationRadiusM) return false;
      // 次の経由点へ進むと、その敵に近づく(向きの内積が正)
      const next = f.route[0]!;
      const near = nearestOnFront(zone, f.pos);
      return (next.x - f.pos.x) * (near.x - f.pos.x) + (next.y - f.pos.y) * (near.y - f.pos.y) > 0;
    })
    .sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

/** 阻止圏を支え合う味方(守る側の集中):同じ陣営の、展開済みで潰走していない部隊で、その部隊から concentrationRadiusM 以内のもの */
export function backersOf(zone: HoldingZone, zones: readonly HoldingZone[], ctx: SimContext): HoldingZone[] {
  const b = ctx.rules.breakthrough;
  if (b.concentrationWeight <= 0 || b.concentrationRadiusM <= 0) return [];
  return zones
    .filter((z) => z.unit.side === zone.unit.side && z.unit.id !== zone.unit.id && z.unit.strength > 0 && frontDistance(z, zone) <= b.concentrationRadiusM)
    .sort((p, q) => (p.unit.id < q.unit.id ? -1 : p.unit.id > q.unit.id ? 1 : 0));
}

/**
 * 突破判定(決定的):力の比がしきい値以上なら突破できる。from は突く位置(省略は今の位置)。
 * 戦力の集中は双方に効く:supporters(同じ阻止圏に押し入ろうとしている味方)の突破の力と、
 * backers(その阻止圏を支える隣の味方)の阻止の力を、concentrationWeight の重みで足す
 */
export function canBreakThrough(
  mover: Unit,
  zone: HoldingZone,
  ctx: SimContext,
  from: Vec2 = mover.pos,
  supporters: readonly Unit[] = [],
  backers: readonly HoldingZone[] = [],
): boolean {
  const w = ctx.rules.breakthrough.concentrationWeight;
  const hold = holdingPower(zone, from, ctx) + backers.reduce((s, z) => s + holdingPower(z, from, ctx), 0) * w;
  if (hold <= 0) return true;
  // 後手からの一撃:前進してきた敵へ、待っていた部隊が反撃に出るなら突破しやすい(突破を試みる部隊は動いている)
  const counter = counterattackMultiplier(mover, zone.unit, ctx, "breakthrough", true);
  const support = supporters.reduce((s, f) => s + breakthroughPower(f, ctx), 0) * w;
  return (breakthroughPower(mover, ctx) * counter + support) / hold >= ctx.rules.breakthrough.ratioThreshold;
}

/**
 * 阻止圏の判定の余裕(m)。座標の丸め誤差(左右を入れ替えた計算などで 1e-12 m 程度ずれる)で、
 * 縁ちょうどの判定が揺れないようにする
 */
export const ZONE_EPSILON_M = 1e-6;

export type ZoneCheck = { blockedBy: Unit } | { blockedBy: null; breaching: Unit[]; approaching: boolean };

/**
 * from → to の動きを、敵の阻止圏で判定する。
 * 阻止圏の中でその敵に近づく動きだけが判定の対象。1つでも突破できなければ止まる。
 * 肉薄(closeAssaultM):目的地がその敵の阻止圏の中にあれば、敵から closeAssaultM までは判定なしで近づける(approaching)。
 * 潰走中のユニットも判定する(離れる動きは止めないので逃げられるが、敵中は突っ切れない。包囲されれば投降する)
 */
export function checkZones(mover: Unit, from: Vec2, to: Vec2, zones: readonly HoldingZone[], ctx: SimContext): ZoneCheck {
  const breaching: Unit[] = [];
  const b = ctx.rules.breakthrough;
  const r = b.zoneRadiusM;
  const dest = mover.route[mover.route.length - 1] ?? to;
  let approaching = false;
  for (const z of zones) {
    if (z.unit.side === mover.side || z.unit.strength <= 0) continue;
    const dTo = zoneDistance(z, to);
    if (dTo >= r - ZONE_EPSILON_M || dTo >= zoneDistance(z, from) - ZONE_EPSILON_M) continue;
    approaching = true;
    // 肉薄:その敵を攻める動き(目的地が阻止圏の中)は、肉薄の距離までは突破判定なし
    const inner = b.closeAssaultM > 0 && zoneDistance(z, dest) < r ? Math.min(r, b.closeAssaultM) : r;
    if (dTo >= inner - ZONE_EPSILON_M) continue;
    if (!canBreakThrough(mover, z, ctx, mover.pos, supportersOf(mover, z, zones, ctx), backersOf(z, zones, ctx))) return { blockedBy: z.unit };
    breaching.push(z.unit);
  }
  return { blockedBy: null, breaching, approaching };
}
