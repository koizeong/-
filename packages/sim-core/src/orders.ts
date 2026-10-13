import type { Vec2 } from "./geometry.js";
import type { RulePack } from "./rulepack.js";
import type { MoveMode, Unit } from "./unit.js";

/**
 * 1ユニットへの命令(設計ルール9)。省略した項目は前ターンの値を保持する。
 * 条件付き命令は、霧(探知)を実装する段階で追加する。
 */
export interface UnitOrder {
  unitId: string;
  /** 経由点(最後が目的地)。空配列なら停止。省略すると残りの経由点を保持 */
  waypoints?: Vec2[];
  /** 到着後の正面方向(度)。null で「進行方向のまま」。目的地と組で指定するもので、waypoints だけを送ると null になる */
  facingOnArrival?: number | null;
  moveMode?: MoveMode;
  /** 姿勢。変更には1ターンかかる */
  stance?: string;
  deployAfterStop?: boolean;
}

export interface RejectedOrder {
  unitId: string;
  reason: string;
}

/** 命令を検証してユニットに反映する(units は書き換える)。 */
export function applyOrders(units: Map<string, Unit>, orders: readonly UnitOrder[], rules: RulePack): RejectedOrder[] {
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
    if (o.waypoints !== undefined) {
      u.route = o.waypoints.map((p) => ({ ...p }));
      u.facingOnArrival = o.facingOnArrival ?? null;
    } else if (o.facingOnArrival !== undefined) {
      u.facingOnArrival = o.facingOnArrival;
    }
    if (o.moveMode !== undefined) u.moveMode = o.moveMode;
    if (o.deployAfterStop !== undefined) u.deployAfterStop = o.deployAfterStop;
    if (o.stance !== undefined) {
      // 今の姿勢に戻す命令は切替の取り消し
      u.pendingStance = o.stance === u.stance ? null : o.stance;
    }
  }
  return rejected;
}

function validate(o: UnitOrder, units: Map<string, Unit>, rules: RulePack, seen: Set<string>): string | null {
  if (!units.has(o.unitId)) return "存在しないユニットです";
  if (seen.has(o.unitId)) return "同じユニットへの命令が重複しています";
  if (o.waypoints?.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return "経由点の座標が不正です";
  if (o.facingOnArrival != null && !Number.isFinite(o.facingOnArrival)) return "正面方向が不正です";
  if (o.stance !== undefined && !(o.stance in rules.stances)) return `未定義の姿勢です: ${o.stance}`;
  return null;
}
