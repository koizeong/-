import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";
import type { IntelState } from "./intel.js";
import { planRoute } from "./pathfinding.js";
import { isOutOfStock } from "./supply.js";
import type { Unit } from "./unit.js";

export type MoraleEvent = { unitId: string; type: "routed" | "rallied" };

/**
 * 1小ステップ分の士気の結果(units を書き換える)。射撃の適用後に呼ぶ。
 * - 潰走:士気が routBelow 未満になったら、命令を捨てて敵から離れる方向へ行軍で下がる
 * - 立ち直り:潰走中に士気が rallyAbove 以上に戻ったら止まり、命令を受け付ける
 * - 回復:このステップに撃たれておらず携行備蓄があれば回復。陣地と縦深で速くなる
 */
export function updateMorale(units: Unit[], hit: ReadonlySet<string>, intel: IntelState, ctx: SimContext): MoraleEvent[] {
  const m = ctx.rules.morale;
  const minutes = ctx.stepSeconds / 60;
  const events: MoraleEvent[] = [];

  for (const u of units) {
    if (u.strength <= 0) continue;

    if (!hit.has(u.id) && !isOutOfStock(u, ctx)) {
      const depth = units.some(
        (f) =>
          f !== u &&
          f.side === u.side &&
          f.strength > 0 &&
          !f.routed &&
          f.inContactWith.length === 0 &&
          distance(f.pos, u.pos) <= m.depthRangeM,
      );
      const bonus = 1 + u.entrenchment * m.entrenchmentRecoveryBonusPerLevel + (depth ? m.depthRecoveryBonus : 0);
      u.morale = Math.min(1, u.morale + m.recoveryPerMin * minutes * bonus);
    }

    if (!u.routed && u.morale < m.routBelow) {
      u.routed = true;
      u.conditional = null;
      u.deployAfterStop = false;
      u.moveMode = "march";
      u.facingOnArrival = null;
      const to = retreatPoint(u, units, intel, ctx);
      u.route = to ? planRoute(u.pos, [to], "march", ctx) : [];
      events.push({ unitId: u.id, type: "routed" });
    } else if (u.routed && u.morale >= m.rallyAbove) {
      u.routed = false;
      u.route = [];
      events.push({ unitId: u.id, type: "rallied" });
    }
  }
  return events;
}

/** 自陣営が今見ている最寄りの敵から、routRetreatDistanceM 離れる地点(マップ内に収める)。見えている敵がいなければ null */
function retreatPoint(u: Unit, units: readonly Unit[], intel: IntelState, ctx: SimContext): Vec2 | null {
  const seen = intel[u.side]?.entries ?? {};
  let nearest: Unit | null = null;
  for (const e of units) {
    if (e.side === u.side || e.strength <= 0 || (seen[e.id]?.currentLevel ?? 0) === 0) continue;
    if (!nearest || distance(u.pos, e.pos) < distance(u.pos, nearest.pos)) nearest = e;
  }
  if (!nearest) return null;
  const dx = u.pos.x - nearest.pos.x;
  const dy = u.pos.y - nearest.pos.y;
  const len = Math.hypot(dx, dy);
  // 敵と同じ地点にいるときは南へ下がる
  const [ux, uy] = len > 0 ? [dx / len, dy / len] : [0, -1];
  const d = ctx.rules.morale.routRetreatDistanceM;
  return {
    x: Math.min(ctx.terrain.widthM, Math.max(0, u.pos.x + ux * d)),
    y: Math.min(ctx.terrain.heightM, Math.max(0, u.pos.y + uy * d)),
  };
}
