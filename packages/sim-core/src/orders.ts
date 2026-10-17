import type { Vec2 } from "./geometry.js";
import type { SimContext } from "./context.js";
import { planRoute, type RoutePoint } from "./pathfinding.js";
import { mobilityOf } from "./supply.js";
import type { RulePack } from "./rulepack.js";
import { stanceOf } from "./stance.js";
import type { IntelState } from "./intel.js";
import type { MoveMode, Unit } from "./unit.js";

/** 命令の中身。省略した項目は前ターンの値を保持する */
export interface OrderBody {
  /** 経由点(最後が目的地)。空配列なら停止。省略すると残りの経由点を保持 */
  waypoints?: Vec2[];
  /**
   * 目的地として敵の部隊を選ぶ(追撃)。値はその陣営から見た敵の contactId。選んだ敵の今の位置(見えていなければ
   * 最後に見た位置)へ、ターンの途中も経路を引き直して追う。null で取りやめ。waypoints と同時には使えない
   */
  pursue?: string | null;
  /** 到着後の正面方向(度)。null で「進行方向のまま」。目的地と組で指定するもので、waypoints だけを送ると null になる */
  facingOnArrival?: number | null;
  moveMode?: MoveMode;
  /** 姿勢。変更には1ターンかかる */
  stance?: string;
  deployAfterStop?: boolean;
}

export type Condition =
  /** 自陣営が探知している敵が、このユニットから withinM 以内にいる */
  | { type: "enemyDetected"; withinM: number }
  /** 戦力ゲージが threshold を下回った */
  | { type: "strengthBelow"; threshold: number };

/** 条件付き命令。条件を満たした瞬間に then を1回だけ実行し、消える */
export interface ConditionalOrder {
  when: Condition;
  then: OrderBody;
}

/** 1ユニットへの命令(設計ルール9) */
export interface UnitOrder extends OrderBody {
  unitId: string;
  /** 条件付き命令(1ユニット1つ)。null で取り消し、省略で保持 */
  conditional?: ConditionalOrder | null;
}

export interface RejectedOrder {
  unitId: string;
  reason: string;
}

/** 命令を検証してユニットに反映する(units は書き換える)。 */
/** 中身のある命令か(unitId 以外の項目を1つでも持つ)。中身のない命令は指揮ポイントを使わず、何もしない */
export function hasContent(o: UnitOrder): boolean {
  return Object.keys(o).some((k) => k !== "unitId" && (o as unknown as Record<string, unknown>)[k] !== undefined);
}

/**
 * 命令を検証してユニットに反映する(units は書き換える)。
 * spend は陣営の指揮ポイントを1使う関数で、足りなければ false を返す(その命令は弾く)。
 */
export function applyOrders(
  units: Map<string, Unit>,
  orders: readonly UnitOrder[],
  ctx: SimContext,
  spend: (side: string) => boolean = () => true,
  accepted: UnitOrder[] = [],
  /** 追撃の相手(contactId)が、その陣営の知っている敵かを確かめるのに使う */
  intel: IntelState = {},
): RejectedOrder[] {
  const { rules } = ctx;
  const rejected: RejectedOrder[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (!hasContent(o)) continue;
    const reason = validate(o, units, rules, seen) ?? validatePursuit(o, units, intel);
    if (reason) {
      rejected.push({ unitId: o.unitId, reason });
      continue;
    }
    const u = units.get(o.unitId)!;
    // 経路を先に作り、届かない地点への命令は弾く(指揮ポイントは使わない)
    let route: RoutePoint[] | undefined;
    if (o.waypoints && o.waypoints.length > 0) {
      const planned = planRoute(u.pos, o.waypoints, o.moveMode ?? u.moveMode, ctx, mobilityOf(u, ctx));
      if (!planned) {
        rejected.push({ unitId: o.unitId, reason: "到達できない地点です" });
        continue;
      }
      route = planned;
    }
    if (!spend(u.side)) {
      rejected.push({ unitId: o.unitId, reason: "指揮ポイントが足りません" });
      continue;
    }
    seen.add(o.unitId);
    applyOrderBody(u, o, ctx, route);
    accepted.push(o);
    if (o.conditional !== undefined) u.conditional = o.conditional === null ? null : structuredClone(o.conditional);
  }
  return rejected;
}

/** 命令の中身をユニットに反映する。経由点の間の経路は、その時点の位置と移動モードから作る */
export function applyOrderBody(u: Unit, o: OrderBody, ctx: SimContext, route?: RoutePoint[]): void {
  if (o.moveMode !== undefined) u.moveMode = o.moveMode;
  if (o.waypoints !== undefined) {
    // 届かない経由点(条件付き命令の発動時など)なら動かない
    u.route = route ?? planRoute(u.pos, o.waypoints, u.moveMode, ctx, mobilityOf(u, ctx)) ?? [];
    u.facingOnArrival = o.facingOnArrival ?? null;
  } else if (o.facingOnArrival !== undefined) {
    u.facingOnArrival = o.facingOnArrival;
  }
  // 追撃:経由点の代わりに敵の部隊を目的地にする(経路は解決のたびに引き直す)。経由点を指示すれば追撃はやめる
  if (o.pursue !== undefined && o.pursue !== null) {
    u.pursuing = o.pursue;
    u.route = [];
    u.facingOnArrival = null;
  } else if (o.pursue === null || o.waypoints !== undefined) {
    delete u.pursuing;
  }
  if (o.deployAfterStop !== undefined) u.deployAfterStop = o.deployAfterStop;
  if (o.stance !== undefined) {
    // 今の姿勢に戻す命令は切替の取り消し
    u.pendingStance = o.stance === u.stance ? null : o.stance;
  }
}

function validate(o: UnitOrder, units: Map<string, Unit>, rules: RulePack, seen: Set<string>): string | null {
  if (!units.has(o.unitId)) return "存在しないユニットです";
  if (seen.has(o.unitId)) return "同じユニットへの命令が重複しています";
  const u = units.get(o.unitId)!;
  if (u.routed) return "潰走中のため命令を受け付けません";
  const body = validateBody(o, rules);
  if (body) return body;
  // 死守・伏撃の間は動けない。動ける姿勢へ切り替える命令と一緒なら、切替中は標準扱いなので動ける
  const st = stanceOf(u, rules);
  const staysImmobile = o.stance === undefined || rules.stances[o.stance]!.immobile;
  if ((o.waypoints?.length ?? 0) > 0 && st.immobile && staysImmobile) return `${st.name}の間は移動できません(動ける姿勢に変える命令と一緒なら動けます)`;
  if (o.conditional) {
    const { when, then } = o.conditional;
    if (when.type === "enemyDetected" && !(Number.isFinite(when.withinM) && when.withinM > 0)) {
      return "条件付き命令:距離が不正です";
    }
    if (when.type === "strengthBelow" && !(when.threshold > 0 && when.threshold <= 1)) {
      return "条件付き命令:しきい値は0より大きく1以下にしてください";
    }
    if (then.pursue !== undefined) return "条件付き命令:追撃は使えません";
    const r = validateBody(then, rules);
    if (r) return `条件付き命令:${r}`;
  }
  return null;
}

/** 追撃の相手は、その陣営が知っている(撃破を確かめていない)敵でなければならない */
function validatePursuit(o: UnitOrder, units: Map<string, Unit>, intel: IntelState): string | null {
  if (o.pursue == null) return null;
  const side = units.get(o.unitId)!.side;
  const e = Object.values(intel[side]?.entries ?? {}).find((x) => x.contactId === o.pursue);
  if (!e || e.confirmedDestroyed) return "追撃する敵が見つかりません";
  return null;
}

function validateBody(o: OrderBody, rules: RulePack): string | null {
  if (o.pursue != null && o.waypoints !== undefined) return "追撃と経由点は同時に指定できません";
  if (o.waypoints?.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "経由点の座標が不正です";
  if (o.facingOnArrival != null && !Number.isFinite(o.facingOnArrival)) return "正面方向が不正です";
  if (o.stance !== undefined && !(o.stance in rules.stances)) return `未定義の姿勢です: ${o.stance}`;
  return null;
}
