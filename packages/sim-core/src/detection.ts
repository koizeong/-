import { commanderEffect } from "./commanders.js";
import { isAirborne, isAirGroup } from "./air-groups.js";
import { isNaval } from "./naval.js";
import { trainingOf } from "./training.js";
import { armorNow } from "./armor.js";
import { unitClosestPoints } from "./frontage.js";
import { distance } from "./geometry.js";
import type { SimContext } from "./context.js";
import { fogLevel } from "./fog-density.js";
import { hasLineOfSight } from "./los.js";
import { effectiveStance, stanceOf } from "./stance.js";
import type { Unit } from "./unit.js";

/** 0:未探知 / 1:反応あり(位置のみ) / 2:兵種判明 / 3:規模・装備判明 */
export type DetectionLevel = 0 | 1 | 2 | 3;

/** observer が target を探知できる距離(m) */
export function detectionRange(observer: Unit, target: Unit, ctx: SimContext): number {
  const { rules } = ctx;
  const obsStance = stanceOf(observer, rules);
  const tgtStance = stanceOf(target, rules);
  const obsBranch = ctx.branches.branches[observer.branch]!;
  const tgtTerrain = rules.terrain[ctx.terrain.terrainAt(target.pos)]!;
  const obsTerrain = rules.terrain[ctx.terrain.terrainAt(observer.pos)]!;
  // 艦艇どうしは、檣楼の見張りで遠くまで見える(陸の探知の基本距離の代わり)。
  // 空から見る航空隊は編成表の air.visionM、飛んでいる航空隊を見つけるのは airGroups.detectRangeM
  const obsAir = ctx.toes.toes[observer.toe]?.air;
  const base = obsAir
    ? (obsAir.visionM ?? rules.airGroups?.defaultVisionM ?? rules.detection.baseRangeM)
    : ctx.toes.toes[target.toe]?.air
      ? (rules.airGroups?.detectRangeM ?? rules.detection.baseRangeM)
      : rules.naval && isNaval(observer, ctx) && isNaval(target, ctx)
        ? rules.naval.surfaceDetectionRangeM
        : rules.detection.baseRangeM;
  return (
    base *
    fogLevel(ctx).detectionRangeMultiplier *
    ctx.visibilityMultiplier *
    obsTerrain.observerVisionMultiplier *
    obsStance.visionMultiplier *
    obsBranch.visionMultiplier *
    trainingOf(observer, rules).visionMultiplier *
    commanderEffect(observer, "vision", ctx) *
    // 制圧された装甲はハッチを閉めるので、視界が落ちる
    (1 - observer.suppression * armorNow(observer, ctx) * rules.combat.armorSuppression.visionPenalty) *
    tgtTerrain.concealment *
    // 伏撃は、撃って位置が露呈している間は見つかりにくさが効かない
    (tgtStance.revealOnFire && target.revealed ? 1 : tgtStance.signatureMultiplier) *
    (isInfiltrating(target, ctx) ? rules.night.infiltration.signatureMultiplier : 1) *
    // 動いている目標は見つかりやすい(止まって待つ側が先に見つける)
    (target.route.length > 0 ? rules.detection.movingSignatureMultiplier : 1)
  );
}

/** 浸透移動中か(夜間フェイズに、夜間行動命令を受けて行軍で動いている) */
export function isInfiltrating(u: Unit, ctx: SimContext): boolean {
  return ctx.phase === "night" && u.moveMode === "march" && u.route.length > 0 && (ctx.nightActors?.has(u.id) ?? false);
}

export function detectionLevel(observer: Unit, target: Unit, ctx: SimContext): DetectionLevel {
  // 航空隊:基地で待っている間は見つけられず、見張りもしない(母艦・飛行場が見張る)
  const tAir = isAirGroup(target, ctx);
  if (tAir && !isAirborne(target)) return 0;
  if (isAirGroup(observer, ctx) && !isAirborne(observer)) return 0;
  const eyes = visualLevel(observer, target, ctx);
  // 電探:探知距離までの艦艇・飛んでいる航空隊は、夜・天候の視界によらず位置(反応)だけは分かる
  const radar = ctx.toes.toes[observer.toe]?.radarRangeM;
  if (eyes === 0 && radar !== undefined && (isNaval(target, ctx) || tAir)) {
    const [from, to] = unitClosestPoints(observer, target, ctx);
    if (distance(from, to) <= radar) return 1;
  }
  return eyes;
}

function visualLevel(observer: Unit, target: Unit, ctx: SimContext): DetectionLevel {
  const range = detectionRange(observer, target, ctx);
  // 距離と見通しは、帯(正面幅)の上でいちばん近い点どうしで測る
  const [from, to] = unitClosestPoints(observer, target, ctx);
  const d = distance(from, to);
  const { detection } = ctx.rules;
  if (d > range) return 0;
  // 見通しがなければ見えない(丘・森・町の向こう)。空から見る・空を見るときは見通しを問わない
  if (!isAirGroup(observer, ctx) && !isAirGroup(target, ctx) && !hasLineOfSight(from, to, ctx)) return 0;
  if (d <= range * detection.fullyIdentifiedRatio) return 3;
  if (d <= range * detection.typeIdentifiedRatio) return 2;
  if (d <= range) return 1;
  return 0;
}
