import { bearing, distance, isStanceSpent, lossBand, toeIndirectMaxRange, type LossBand, type OwnUnitView, type SideView, type SimContext, type UnitOrder } from "@brigade/sim-core";
import type { Assessment } from "./assess.js";

/** 押している撃ち合いの相手が、この距離以内にいれば詰める(阻止圏の外から1ターンで取りつける距離) */
export const PRESS_RANGE_M = 800;
/** 詰めるのに要る、自分の状態(戦力・制圧) */
const PRESS_MIN_STRENGTH = 0.5;
const PRESS_MAX_SUPPRESSION = 0.5;
/** この段以上の陣地にいる部隊は、陣地を捨ててまで詰めない */
const PRESS_MAX_ENTRENCHMENT = 2;
/** 消耗を抑えたい意欲がこれ以上なら詰めない */
const PRESS_MAX_PRESERVE = 0.75;
/** 詰める命令の優先度(指揮ポイントが足りないときに、移動の命令より先に残す) */
export const PRESS_PRIORITY = 25;

const BAND: Record<LossBand, number> = { slight: 0, light: 1, moderate: 2, heavy: 3 };

/** 肉薄に使える姿勢(ルールパックの combat.assault.stances のうち、その部隊の兵科が取れる最初のもの) */
function assaultStanceFor(u: OwnUnitView, ctx: SimContext): string | null {
  const a = ctx.rules.combat.assault;
  if (!a) return null;
  return a.stances.find((id) => {
    const st = ctx.rules.stances[id];
    return !!st && (!st.branches || st.branches.includes(u.branch));
  }) ?? null;
}

/**
 * 攻め気:前のターンの撃ち合いで押していた(軽微より大きい損害を与え、相手からはほとんど撃ち返されなかった=制圧されている様子の)相手が近くにいれば、
 * 肉薄の姿勢(強襲など)に切り替え、効いているターンにその相手へ取りつく。
 * 敵の制圧・士気は霧で見えないので、自分の撃ち合いの結果(SideView.fireBalance)だけで判断する。
 * 自陣営の目標を守っている部隊と、固い陣地にいる部隊は詰めない(持ち場を守る)。
 * 部隊ID → 命令(姿勢の切り替え、または取りつく移動)
 */
export function pressOrders(view: SideView, a: Assessment, ctx: SimContext, skip: ReadonlySet<string>): Map<string, UnitOrder> {
  const out = new Map<string, UnitOrder>();
  if (!ctx.rules.combat.assault || view.phase === "night" || a.preserveDrive >= PRESS_MAX_PRESERVE) return out;
  const m = ctx.rules.morale;
  const contacts = new Map(view.contacts.filter((c) => c.currentLevel > 0 && !c.destroyed && !c.routed).map((c) => [c.contactId, c]));
  for (const u of [...view.own].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (skip.has(u.id) || u.routed || u.strength < PRESS_MIN_STRENGTH || u.suppression >= PRESS_MAX_SUPPRESSION || u.morale < m.shakenBelow) continue;
    if (u.formation !== "deployed" || toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons) > 0) continue;
    // 自陣営の目標を守っている部隊・固い陣地にいる部隊は、持ち場を離れて詰めない(守り手が飛び出すと陣地の輪に穴があく)
    if (u.entrenchment >= PRESS_MAX_ENTRENCHMENT) continue;
    if (ctx.scenario.objectives.some((o) => view.objectives[o.id] === view.side && distance(u.pos, o) <= o.radiusM)) continue;
    const stance = assaultStanceFor(u, ctx);
    if (!stance) continue;
    const target = (view.fireBalance ?? [])
      .filter((b) => b.ownId === u.id && b.dealt !== null && BAND[b.dealt] >= BAND.light && BAND[lossBand(b.taken)] === BAND.slight)
      .map((b) => contacts.get(b.contactId))
      .filter((c): c is NonNullable<typeof c> => !!c && distance(c.pos, u.pos) <= PRESS_RANGE_M)
      .sort((p, q) => distance(p.pos, u.pos) - distance(q.pos, u.pos) || (p.contactId < q.contactId ? -1 : 1))[0];
    if (!target) continue;
    const active = u.stance === stance && u.pendingStance === null;
    if (active && !isStanceSpent(u, ctx.rules)) {
      // 効いている:相手へ取りつく(阻止圏の中は肉薄の距離まで判定なしで近づける)
      out.set(u.id, { unitId: u.id, waypoints: [{ ...target.pos }], moveMode: "combat", facingOnArrival: bearing(u.pos, target.pos) });
    } else if (!active && u.pendingStance !== stance) {
      // まだ:次のターンに効くよう切り替える(息切れした強襲は、別の姿勢に戻してからでないと使えないので触らない)
      out.set(u.id, { unitId: u.id, stance });
    }
  }
  return out;
}
