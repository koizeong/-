import type { Vec2 } from "./geometry.js";
import type { SimContext } from "./context.js";
import { planRoute } from "./pathfinding.js";
import type { RulePack } from "./rulepack.js";
import type { MoveMode, Unit } from "./unit.js";

/** 命令の中身。省略した項目は前ターンの値を保持する */
export interface OrderBody {
  /** 経由点(最後が目的地)。空配列なら停止。省略すると残りの経由点を保持 */
  waypoints?: Vec2[];
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
export function applyOrders(units: Map<string, Unit>, orders: readonly UnitOrder[], ctx: SimContext): RejectedOrder[] {
  const { rules } = ctx;
  const rejected: RejectedOrder[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    const reason = validate(o, units, rules, seen);
    if (reason) {
      rejected.push({ unitId: o.unitId, reason });
      continue;
    }
    seen.add(o.unitId);
    const u = units.get(o.unitId)!;
    applyOrderBody(u, o, ctx);
    if (o.conditional !== undefined) u.conditional = o.conditional === null ? null : structuredClone(o.conditional);
  }
  return rejected;
}

/** 命令の中身をユニットに反映する。経由点の間の経路は、その時点の位置と移動モードから作る */
export function applyOrderBody(u: Unit, o: OrderBody, ctx: SimContext): void {
  if (o.moveMode !== undefined) u.moveMode = o.moveMode;
  if (o.waypoints !== undefined) {
    u.route = planRoute(u.pos, o.waypoints, u.moveMode, ctx);
    u.facingOnArrival = o.facingOnArrival ?? null;
  } else if (o.facingOnArrival !== undefined) {
    u.facingOnArrival = o.facingOnArrival;
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
  if (units.get(o.unitId)!.routed) return "潰走中のため命令を受け付けません";
  const body = validateBody(o, rules);
  if (body) return body;
  if (o.conditional) {
    const { when, then } = o.conditional;
    if (when.type === "enemyDetected" && !(Number.isFinite(when.withinM) && when.withinM > 0)) {
      return "条件付き命令:距離が不正です";
    }
    if (when.type === "strengthBelow" && !(when.threshold > 0 && when.threshold <= 1)) {
      return "条件付き命令:しきい値は0より大きく1以下にしてください";
    }
    const r = validateBody(then, rules);
    if (r) return `条件付き命令:${r}`;
  }
  return null;
}

function validateBody(o: OrderBody, rules: RulePack): string | null {
  if (o.waypoints?.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "経由点の座標が不正です";
  if (o.facingOnArrival != null && !Number.isFinite(o.facingOnArrival)) return "正面方向が不正です";
  if (o.stance !== undefined && !(o.stance in rules.stances)) return `未定義の姿勢です: ${o.stance}`;
  return null;
}
