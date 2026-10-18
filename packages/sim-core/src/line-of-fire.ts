import type { SimContext } from "./context.js";
import { closestSegmentPoints, frontEnds, frontOf, nearestOnFront } from "./frontage.js";
import { distance, type Vec2 } from "./geometry.js";
import type { Unit } from "./unit.js";

/** ふさぎうる部隊の帯(1ステップの間に何度も使うので、先に作っておく) */
export interface LaneBlocker {
  unit: Unit;
  b0: Vec2;
  b1: Vec2;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 展開していて潰走していない部隊の帯(ふさぎうるもの)。帯の外接矩形を ±blockerHalfDepthM 広げておく */
export function laneBlockers(units: readonly Unit[], ctx: SimContext): LaneBlocker[] {
  const pad = ctx.rules.combat.lineOfFire?.blockerHalfDepthM ?? 0;
  return units
    .filter((o) => o.strength > 0 && !o.routed && o.formation === "deployed")
    .map((unit) => {
      const [b0, b1] = frontEnds(frontOf(unit, ctx));
      return { unit, b0, b1, minX: Math.min(b0.x, b1.x) - pad, maxX: Math.max(b0.x, b1.x) + pad, minY: Math.min(b0.y, b1.y) - pad, maxY: Math.max(b0.y, b1.y) + pad };
    });
}

/**
 * 射線(直接射撃だけ。砲撃・空襲は上から撃つので対象外)。
 * 撃つ側の帯の上の何点かから、撃たれる側の帯のいちばん近い点へ線を引き、間に展開した部隊(敵味方を問わない)の帯が
 * 横切っている線は「ふさがれている」とする。通っている線の割合だけ火力が届く(半分ふさがれたら半分)。
 * 高い所から撃つ線は、間の部隊の高さより上を通れば越えて撃てる(高さは見通しと同じく地形の標高)
 */
export function fireLaneOpen(a: Unit, target: Unit, units: readonly Unit[], ctx: SimContext, prepared?: readonly LaneBlocker[]): number {
  const lf = ctx.rules.combat.lineOfFire;
  if (!lf) return 1;
  const blockers = (prepared ?? laneBlockers(units, ctx)).filter((o) => o.unit !== a && o.unit !== target);
  if (blockers.length === 0) return 1;
  const elev = (p: Vec2) => ctx.rules.terrain[ctx.terrain.terrainAt(p)]!.elevationM;
  const aFront = frontOf(a, ctx);
  const tFront = frontOf(target, ctx);
  const [a0, a1] = frontEnds(aFront);
  const n = aFront.width > 0 ? Math.max(1, lf.samples) : 1;
  let open = 0;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const from = { x: a0.x + (a1.x - a0.x) * k, y: a0.y + (a1.y - a0.y) * k };
    const to = nearestOnFront(tFront, from);
    const len = distance(from, to);
    const hFrom = elev(from) + lf.unitHeightM;
    const hTo = elev(to) + lf.unitHeightM;
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    const blocked = blockers.some((o) => {
      // 外接矩形が重ならなければ、線から遠い
      if (o.maxX < minX || o.minX > maxX || o.maxY < minY || o.minY > maxY) return false;
      const [onLine, onBand] = closestSegmentPoints(from, to, o.b0, o.b1);
      if (distance(onLine, onBand) > lf.blockerHalfDepthM) return false;
      // 撃つ側・撃たれる側のすぐそば(隣に並んでいるだけ)は数えない
      const along = distance(from, onLine);
      if (along < lf.endClearanceM || len - along < lf.endClearanceM) return false;
      // 高さ:線がその地点で、間の部隊の高さより上を通れば越えて撃てる
      const lineHeight = hFrom + (hTo - hFrom) * (len > 0 ? along / len : 0);
      return lineHeight <= elev(onBand) + lf.unitHeightM + 1e-9;
    });
    if (!blocked) open++;
  }
  return open / n;
}
