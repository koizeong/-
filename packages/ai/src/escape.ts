import { distance, estimateEnemyLoss, type HqCommand, type SideView, type SimContext, type UnitOrder } from "@brigade/sim-core";

/** 撤退を考える自軍の損耗(これ以上で、敵の損耗の見積もりの ESCAPE_LOSS_RATIO 倍以上なら、負けを認めて部隊を残す) */
export const ESCAPE_OWN_LOSS = 0.35;
const ESCAPE_LOSS_RATIO = 1.5;
/** 脱出路へ向かう部隊の命令の優先度(ほかの命令より先に残す) */
export const ESCAPE_PRIORITY = 40;

export interface EscapePlan {
  orders: UnitOrder[];
  hq: HqCommand[];
  /** 脱出路の上で待つ部隊(ほかの命令を出さず、その場にとどめる) */
  hold: string[];
}

/**
 * 撤退:自陣営の脱出路(シナリオの escapeRoutes。キャンペーンの戦闘)が開いていて、負けが込んでいる
 * (自軍の損耗が ESCAPE_OWN_LOSS 以上で、敵の損耗の見積もりの1.5倍以上)か、すでに撤退を始めているなら、
 * 部隊を脱出路へ向かわせ、脱出路の上で近くに見えている敵のいない部隊から撤退させる(撤退すると負けは決まるが、部隊は残る)。
 * 撤退しないなら null
 */
export function escapePlan(view: SideView, ctx: SimContext): EscapePlan | null {
  const routes = ctx.scenario.escapeRoutes.filter((e) => e.side === view.side && view.turn >= e.fromTurn);
  if (routes.length === 0) return null;
  const losing = view.ownLoss >= ESCAPE_OWN_LOSS && view.ownLoss >= ESCAPE_LOSS_RATIO * estimateEnemyLoss(view.contacts);
  if (!view.retreated && !losing) return null;
  const { radiusM, enemyClearM } = ctx.rules.escape;
  const enemies = view.contacts.filter((c) => c.currentLevel > 0 && !c.destroyed);
  const orders: UnitOrder[] = [];
  const hq: HqCommand[] = [];
  const hold: string[] = [];
  for (const u of [...view.own].filter((x) => x.strength > 0).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const route = [...routes].sort((p, q) => distance(p, u.pos) - distance(q, u.pos))[0]!;
    const near = enemies.some((c) => distance(c.pos, u.pos) <= enemyClearM);
    if (distance(route, u.pos) <= radiusM) {
      if (!near) hq.push({ side: view.side, type: "retreat", unitId: u.id });
      hold.push(u.id);
      continue;
    }
    // 潰走中の部隊は命令を受け付けない(自分で下がる)
    if (u.routed) continue;
    // 敵が近ければ展開したまま、いなければ縦隊で急ぐ
    orders.push({ unitId: u.id, waypoints: [{ x: route.x, y: route.y }], moveMode: near ? "combat" : "march", facingOnArrival: null });
  }
  return { orders, hq, hold };
}
