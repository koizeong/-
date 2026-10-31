import type { SimContext } from "./context.js";
import { closestSegmentPoints, distanceToFront, frontEnds, frontOf, nearestOnFront, unitDistance } from "./frontage.js";
import { distance, type Vec2 } from "./geometry.js";
import type { IntelState } from "./intel.js";
import { planRoute } from "./pathfinding.js";
import { isOutOfStock, mobilityOf } from "./supply.js";
import { stanceOf } from "./stance.js";
import type { Unit } from "./unit.js";

/** 損耗と潰走の回数による士気の上限(1 − lossCeilingFactor × 失った戦力 − routCeilingLoss × 潰走の回数) */
export function moraleCeiling(u: Unit, ctx: SimContext): number {
  const m = ctx.rules.morale;
  return Math.max(0, Math.min(1, 1 - m.lossCeilingFactor * (1 - u.strength) - m.routCeilingLoss * (u.routs ?? 0)));
}

export type MoraleEvent = { unitId: string; type: "routed" | "rallied" | "overrun" };

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
  // 蹂躙の判定は、このステップの始めに潰走していなかった敵で行う(同じステップに両方が崩れたとき、処理の順番で結果が変わらないように)
  const routedAtStart = new Set(units.filter((x) => x.routed).map((x) => x.id));

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
      // 損耗による上限:失った戦力の分だけ、戻れる士気が下がる(上限より高ければ下げはしない)
      const ceiling = Math.max(u.morale, moraleCeiling(u, ctx));
      u.morale = Math.min(ceiling, u.morale + m.recoveryPerMin * minutes * bonus * recoveryMultiplier(u.side) * stanceRecovery);
    }

    if (!u.routed && u.morale < m.routBelow && !stanceOf(u, ctx.rules).neverRouts) {
      u.routed = true;
      u.routs = (u.routs ?? 0) + 1;
      // 潰走の代償:重火器を捨て、落伍・捕虜が出る
      if (m.routStrengthLoss > 0) u.strength = Math.max(0, u.strength - m.routStrengthLoss);
      // 蹂躙:持ち場を守っている(動いていない)部隊が、敵に取りつかれたまま崩れると、逃げ遅れ・捕虜で戦力を失う
      if (m.overrunStrengthLoss > 0 && u.route.length === 0 && units.some((e) => e.side !== u.side && e.strength > 0 && !routedAtStart.has(e.id) && unitDistance(e, u, ctx) <= m.overrunRangeM)) {
        u.strength = Math.max(0, u.strength - m.overrunStrengthLoss);
        events.push({ unitId: u.id, type: "overrun" });
      }
      u.conditional = null;
      // 潰走すると姿勢は崩れて標準に戻る(切替中の姿勢も取り消す)。
      // 伏撃・死守などの動かない姿勢が残ると、退却できずにその場で撃たれ続けてしまう
      u.stance = ctx.rules.defaultStance;
      u.pendingStance = null;
      u.stanceTurns = 0;
      u.deployAfterStop = false;
      u.moveMode = "march";
      u.facingOnArrival = null;
      delete u.pursuing;
      const to = retreatPoint(u, units, intel, ctx);
      u.route = (to && planRoute(u.pos, [to], "march", ctx, mobilityOf(u, ctx))) || [];
      events.push({ unitId: u.id, type: "routed" });
    } else if (u.routed && u.morale >= m.rallyAbove) {
      u.routed = false;
      u.route = [];
      events.push({ unitId: u.id, type: "rallied" });
    } else if (u.routed && u.route.length === 0 && enemySeenWithin(u, units, intel, ctx.rules.contactRangeM, ctx)) {
      // 退却し終えても、見えている敵が迫ってきたら、さらに下がる(追撃されても止まって撃たれ続けない)
      const to = retreatPoint(u, units, intel, ctx);
      u.route = (to && planRoute(u.pos, [to], "march", ctx, mobilityOf(u, ctx))) || [];
    }
  }
  return events;
}

/** 自陣営が今見ている敵が、この距離以内にいるか */
function enemySeenWithin(u: Unit, units: readonly Unit[], intel: IntelState, d: number, ctx: SimContext): boolean {
  const seen = intel[u.side]?.entries ?? {};
  return units.some((e) => e.side !== u.side && e.strength > 0 && (seen[e.id]?.currentLevel ?? 0) > 0 && unitDistance(e, u, ctx) <= d);
}

/** 自陣営が今見ている最寄りの敵から、routRetreatDistanceM 離れる地点(マップ内に収める)。見えている敵がいなければ null */
function retreatPoint(u: Unit, units: readonly Unit[], intel: IntelState, ctx: SimContext): Vec2 | null {
  const seen = intel[u.side]?.entries ?? {};
  const enemies = units.filter((e) => e.side !== u.side && e.strength > 0 && (seen[e.id]?.currentLevel ?? 0) > 0);
  if (enemies.length === 0) return null;
  // 敵との距離・方向は、敵の帯の上でいちばん近い点から測る(正面幅)
  const fronts = new Map(enemies.map((e) => [e.id, frontOf(e, ctx)]));
  const toFront = (p: Vec2, e: Unit) => distanceToFront(fronts.get(e.id)!, p);
  const nearest = enemies.reduce((m, e) => (toFront(u.pos, e) < toFront(u.pos, m) ? e : m));
  const np = nearestOnFront(fronts.get(nearest.id)!, u.pos);
  const dx = u.pos.x - np.x;
  const dy = u.pos.y - np.y;
  const len = Math.hypot(dx, dy);
  // 敵とほぼ同じ地点(1m未満)にいるときは、方向が丸め誤差で決まってしまうので、自分の正面の反対へ下がる
  const back = ((u.facing + 180) * Math.PI) / 180;
  const [ux, uy] = len >= 1 ? [dx / len, dy / len] : [Math.sin(back), Math.cos(back)];
  const d = ctx.rules.morale.routRetreatDistanceM;
  const clamp = (p: Vec2) => ({ x: Math.min(ctx.terrain.widthM, Math.max(0, p.x)), y: Math.min(ctx.terrain.heightM, Math.max(0, p.y)) });
  // 退路の候補:いちばん近い敵の反対方向を基準に、16方向。見えている敵の阻止圏をかすめずに抜けられ、
  // 下がった先が敵からいちばん遠いものを選ぶ(囲まれかけているときに、別の敵の阻止圏へ突っ込まない)。
  // 同じ点なら基準の方向に近いもの(左右を入れ替えても同じ選び方になる)
  const zone = ctx.rules.breakthrough.zoneRadiusM;
  const passes = (to: Vec2, e: Unit) => {
    // 線分 u.pos → to と敵の帯との最短距離
    const [b0, b1] = frontEnds(fronts.get(e.id)!);
    const [p, q] = closestSegmentPoints(u.pos, to, b0, b1);
    return distance(p, q);
  };
  let best: { p: Vec2; score: number; dev: number } | null = null;
  const base = Math.atan2(ux, uy);
  for (let i = 0; i < 16; i++) {
    const k = i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * Math.ceil(i / 2);
    const ang = base + (k * Math.PI) / 8;
    const p = clamp({ x: u.pos.x + Math.sin(ang) * d, y: u.pos.y + Math.cos(ang) * d });
    const blocked = enemies.some((e) => e.formation === "deployed" && !e.routed && toFront(u.pos, e) >= zone && passes(p, e) < zone);
    const away = Math.min(...enemies.map((e) => toFront(p, e)));
    const score = (blocked ? 0 : 1e6) + away;
    const dev = Math.abs(k);
    if (!best || score > best.score + 1e-6 || (Math.abs(score - best.score) <= 1e-6 && dev < best.dev)) best = { p, score, dev };
  }
  return best!.p;
}
