import { distance, escapeTarget, estimateEnemyLoss, onEscapeRoute, type HqCommand, type SeaOrder, type SideView, type SimContext, type UnitOrder } from "@brigade/sim-core";

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
  if (!view.retreated && !losingBadly(view)) return null;
  const { enemyClearM } = ctx.rules.escape;
  const enemies = view.contacts.filter((c) => c.currentLevel > 0 && !c.destroyed);
  const orders: UnitOrder[] = [];
  const hq: HqCommand[] = [];
  const hold: string[] = [];
  for (const u of [...view.own].filter((x) => x.strength > 0).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const route = [...routes].sort((p, q) => distance(escapeTarget(p, u.pos, ctx), u.pos) - distance(escapeTarget(q, u.pos, ctx), u.pos))[0]!;
    const near = enemies.some((c) => distance(c.pos, u.pos) <= enemyClearM);
    if (onEscapeRoute(route, u.pos, ctx)) {
      if (!near) hq.push({ side: view.side, type: "retreat", unitId: u.id });
      hold.push(u.id);
      continue;
    }
    // 潰走中の部隊は命令を受け付けない(自分で下がる)
    if (u.routed) continue;
    // 敵が近ければ展開したまま、いなければ縦隊で急ぐ
    const to = escapeTarget(route, u.pos, ctx);
    orders.push({ unitId: u.id, waypoints: [{ x: to.x, y: to.y }], moveMode: near ? "combat" : "march", facingOnArrival: null });
  }
  return { orders, hq, hold };
}

/** 負けが込んでいる(自軍の損耗が ESCAPE_OWN_LOSS 以上で、敵の損耗の見積もりの1.5倍以上) */
function losingBadly(view: SideView): boolean {
  return view.ownLoss >= ESCAPE_OWN_LOSS && view.ownLoss >= ESCAPE_LOSS_RATIO * estimateEnemyLoss(view.contacts);
}

/**
 * 海戦の撤退:負けが込んでいるか、すでに撤退を始めていれば、戦隊を全速で脱出路(自陣営の後ろの地図の端)へ向かわせ(撃ち合いはやめる)、
 * 脱出路の上で近くに見えている敵のいない艦と、その艦に載っている航空隊から撤退させる。撤退しないなら null
 */
export function navalEscapePlan(view: SideView, ctx: SimContext): { seaOrders: SeaOrder[]; hq: HqCommand[] } | null {
  const routes = ctx.scenario.escapeRoutes.filter((e) => e.side === view.side && view.turn >= e.fromTurn);
  if (routes.length === 0 || !view.squadrons) return null;
  if (!view.retreated && !losingBadly(view)) return null;
  const { enemyClearM } = ctx.rules.escape;
  const enemies = view.contacts.filter((c) => c.currentLevel > 0 && !c.destroyed);
  const seaOrders: SeaOrder[] = [];
  const hq: HqCommand[] = [];
  const byId = new Map(view.own.map((u) => [u.id, u]));
  for (const [id, sq] of Object.entries(view.squadrons).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    // 退避群は心得で脱出路へ退き、着けば自分で去る
    if (sq.side !== view.side || sq.retiring) continue;
    const ships = sq.ships.map((x) => byId.get(x)).filter((u): u is NonNullable<typeof u> => u !== undefined && u.strength > 0);
    const lead = ships[0];
    if (!lead) continue;
    const route = [...routes].sort((p, q) => distance(escapeTarget(p, lead.pos, ctx), lead.pos) - distance(escapeTarget(q, lead.pos, ctx), lead.pos))[0]!;
    seaOrders.push({ squadron: id, toward: escapeTarget(route, lead.pos, ctx), speed: "flank", engage: null });
    for (const u of ships) {
      if (!onEscapeRoute(route, u.pos, ctx) || enemies.some((c) => distance(c.pos, u.pos) <= enemyClearM)) continue;
      hq.push({ side: view.side, type: "retreat", unitId: u.id });
      // 母艦に載っている(待機・積み直し中の)航空隊も一緒に去る
      for (const g of view.own) if (g.air && g.air.baseId === u.id && (g.air.status === "ready" || g.air.status === "rearming") && g.strength > 0) hq.push({ side: view.side, type: "retreat", unitId: g.id });
    }
  }
  return { seaOrders, hq };
}
