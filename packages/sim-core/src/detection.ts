import { commanderEffect } from "./commanders.js";
import { isAirborne, isAirGroup } from "./air-groups.js";
import { isNaval, isShip } from "./naval.js";
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
  // 夜の海戦:撃った艦は発砲の光(照明弾・探照灯も)で見える
  const flash = rules.naval?.flashRangeM !== undefined && target.revealed && isNaval(observer, ctx) && isNaval(target, ctx) ? rules.naval.flashRangeM : 0;
  return Math.max(
    flash,
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
    shipSighting(observer, target, ctx, !!obsAir),
  );
}

/**
 * 動いているかによる見つかりやすさ。艦(naval.sighting のあるとき)は速さ(航跡)で決め、海の上の艦から見るときは陸影にまぎれる分を掛ける。
 * それ以外は陸と同じ:動いている目標は見つかりやすい(止まって待つ側が先に見つける)
 */
function shipSighting(observer: Unit, target: Unit, ctx: SimContext, fromAir: boolean): number {
  const s = ctx.rules.naval?.sighting;
  if (!s || !isShip(target, ctx)) return target.route.length > 0 ? ctx.rules.detection.movingSignatureMultiplier : 1;
  // 航跡が効くのは暗いとき(夜・悪天候で視界が darkBelow 以下)。昼は止まった艦も檣楼・艦影で見える
  const knots = (target.speedMps ?? 0) * 1.943844;
  let k = ctx.visibilityMultiplier <= s.darkBelow ? interpolate(s.wake, knots) : 1;
  if (s.landBackdrop && !fromAir && isNaval(observer, ctx) && landBehind(observer.pos, target.pos, s.landBackdrop.rangeM, ctx)) k *= s.landBackdrop.visualMultiplier;
  return k;
}

function interpolate(table: { knots: number; multiplier: number }[], x: number): number {
  if (x <= table[0]!.knots) return table[0]!.multiplier;
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]!;
    const b = table[i]!;
    if (x <= b.knots) return a.multiplier + ((b.multiplier - a.multiplier) * (x - a.knots)) / (b.knots - a.knots || 1);
  }
  return table[table.length - 1]!.multiplier;
}

/** 陸(水でない地形)のセルか */
function isLand(p: { x: number; y: number }, ctx: SimContext): boolean {
  return !ctx.rules.terrain[ctx.terrain.terrainAt(p)]?.water;
}

/** 見る位置から目標の向こう rangeM 以内に陸があるか(陸影) */
function landBehind(from: { x: number; y: number }, to: { x: number; y: number }, rangeM: number, ctx: SimContext): boolean {
  const d = distance(from, to);
  if (d <= 0) return false;
  const ux = (to.x - from.x) / d;
  const uy = (to.y - from.y) / d;
  const step = Math.max(100, ctx.terrain.cellSizeM / 2);
  for (let s = step; s <= rangeM; s += step) if (isLand({ x: to.x + ux * s, y: to.y + uy * s }, ctx)) return true;
  return false;
}

/** 間に陸のセルがあるか(電探の陰) */
function landBetween(from: { x: number; y: number }, to: { x: number; y: number }, ctx: SimContext): boolean {
  const d = distance(from, to);
  const step = Math.max(100, ctx.terrain.cellSizeM / 2);
  for (let s = step; s < d - step; s += step) if (isLand({ x: from.x + ((to.x - from.x) * s) / d, y: from.y + ((to.y - from.y) * s) / d }, ctx)) return true;
  return false;
}

/** 電探の届く距離(陸の近くの目標は反射にまぎれ、間に陸があれば届かない)。陸の上の目標(飛行場など)には陸の決まりを使わない */
function radarReach(observer: Unit, target: Unit, from: { x: number; y: number }, to: { x: number; y: number }, radar: number, ctx: SimContext): number {
  const land = ctx.rules.naval?.sighting?.radarLand;
  if (!land || !isNaval(target, ctx) || isLand(to, ctx)) return radar;
  if (land.blocks && landBetween(from, to, ctx)) return 0;
  const near = ctx.terrain.distanceToTerrain(to, (id) => !ctx.rules.terrain[id]?.water, land.nearLandM);
  return Number.isFinite(near) ? radar * land.clutterMultiplier : radar;
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
    const d = distance(from, to);
    if (d <= radar && (isAirGroup(target, ctx) || d <= radarReach(observer, target, from, to, radar, ctx))) return 1;
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
