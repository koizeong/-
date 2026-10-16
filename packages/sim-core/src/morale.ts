import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";
import type { IntelState } from "./intel.js";
import { planRoute } from "./pathfinding.js";
import { isOutOfStock, mobilityOf } from "./supply.js";
import { stanceOf } from "./stance.js";
import type { Unit } from "./unit.js";

export type MoraleEvent = { unitId: string; type: "routed" | "rallied" };

/**
 * 1小ステップ分の士気の結果(units を書き換える)。射撃の適用後に呼ぶ。
 * - 潰走:士気が routBelow 未満になったら、命令を捨てて敵から離れる方向へ行軍で下がる
 * - 立ち直り:潰走中に士気が rallyAbove 以上に戻ったら止まり、命令を受け付ける
 * - 回復:このステップに撃たれておらず携行備蓄があれば回復。陣地と縦深で速くなり、陣営の「死守の重み」で遅くなる
 * - 潰走しない姿勢(死守)なら、士気が routBelow を下回っても踏みとどまる
 * @param recoveryMultiplier 陣営ごとの回復の倍率(死守の重み)
 */
export function updateMorale(
  units: Unit[],
  hit: ReadonlySet<string>,
  intel: IntelState,
  ctx: SimContext,
  recoveryMultiplier: (side: string) => number = () => 1,
): MoraleEvent[] {
  const m = ctx.rules.morale;
  const minutes = ctx.stepSeconds / 60;
  const events: MoraleEvent[] = [];

  for (const u of units) {
    if (u.strength <= 0) continue;

    // 撃たれている・備蓄が尽きた・包囲されている間は、士気が回復しない
    if (!hit.has(u.id) && !isOutOfStock(u, ctx) && u.encircledTurns === 0) {
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
      const stanceRecovery = stanceOf(u, ctx.rules).moraleRecoveryMultiplier;
      u.morale = Math.min(1, u.morale + m.recoveryPerMin * minutes * bonus * recoveryMultiplier(u.side) * stanceRecovery);
    }

    if (!u.routed && u.morale < m.routBelow && !stanceOf(u, ctx.rules).neverRouts) {
      u.routed = true;
      u.conditional = null;
      // 潰走すると姿勢は崩れて標準に戻る(切替中の姿勢も取り消す)。
      // 伏撃・死守などの動かない姿勢が残ると、退却できずにその場で撃たれ続けてしまう
      u.stance = ctx.rules.defaultStance;
      u.pendingStance = null;
      u.stanceTurns = 0;
      u.deployAfterStop = false;
      u.moveMode = "march";
      u.facingOnArrival = null;
      const to = retreatPoint(u, units, intel, ctx);
      u.route = (to && planRoute(u.pos, [to], "march", ctx, mobilityOf(u, ctx))) || [];
      events.push({ unitId: u.id, type: "routed" });
    } else if (u.routed && u.morale >= m.rallyAbove) {
      u.routed = false;
      u.route = [];
      events.push({ unitId: u.id, type: "rallied" });
    } else if (u.routed && u.route.length === 0 && enemySeenWithin(u, units, intel, ctx.rules.contactRangeM)) {
      // 退却し終えても、見えている敵が迫ってきたら、さらに下がる(追撃されても止まって撃たれ続けない)
      const to = retreatPoint(u, units, intel, ctx);
      u.route = (to && planRoute(u.pos, [to], "march", ctx, mobilityOf(u, ctx))) || [];
    }
  }
  return events;
}

/** 自陣営が今見ている敵が、この距離以内にいるか */
function enemySeenWithin(u: Unit, units: readonly Unit[], intel: IntelState, d: number): boolean {
  const seen = intel[u.side]?.entries ?? {};
  return units.some((e) => e.side !== u.side && e.strength > 0 && (seen[e.id]?.currentLevel ?? 0) > 0 && distance(e.pos, u.pos) <= d);
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
  // 敵とほぼ同じ地点(1m未満)にいるときは、方向が丸め誤差で決まってしまうので、自分の正面の反対へ下がる
  const back = ((u.facing + 180) * Math.PI) / 180;
  const [ux, uy] = len >= 1 ? [dx / len, dy / len] : [Math.sin(back), Math.cos(back)];
  const d = ctx.rules.morale.routRetreatDistanceM;
  return {
    x: Math.min(ctx.terrain.widthM, Math.max(0, u.pos.x + ux * d)),
    y: Math.min(ctx.terrain.heightM, Math.max(0, u.pos.y + uy * d)),
  };
}
