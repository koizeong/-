import type { SimContext } from "./context.js";
import { bearing, normalizeBearing, type Vec2 } from "./geometry.js";
import type { NavalFormation } from "./rulepack.js";
import type { Unit } from "./unit.js";

/**
 * 海戦:艦艇の戦隊(編成表の naval)。戦隊1つが1ユニットで、陣形(単縦陣・単横陣・輪形陣など。ルールパックの naval.formations)を持つ。
 * 行軍の縦隊・展開はなく、いつも撃てる。向き(facing)は針路で、陣形ごとに、撃つ・受ける方位(艦首・舷側・艦尾)で倍率が変わる
 */

export function isNaval(u: Pick<Unit, "toe">, ctx: Pick<SimContext, "toes">): boolean {
  return !!ctx.toes.toes[u.toe]?.naval;
}

/** 今効いている陣形(変えている途中なら前の陣形)。ルールパックに naval がなければ undefined */
export function navalFormationOf(u: Unit, ctx: Pick<SimContext, "rules">): NavalFormation | undefined {
  const n = ctx.rules.naval;
  if (!n) return undefined;
  return n.formations[u.navalFormation ?? n.defaultFormation] ?? n.formations[n.defaultFormation];
}

export function navalFormationId(u: Unit, ctx: Pick<SimContext, "rules">): string | undefined {
  const n = ctx.rules.naval;
  if (!n) return undefined;
  return u.navalFormation !== undefined && u.navalFormation in n.formations ? u.navalFormation : n.defaultFormation;
}

/** 陣形を変える命令を受ける(今の陣形と同じなら、変えている途中の取り消し) */
export function orderNavalFormation(u: Unit, to: string, ctx: Pick<SimContext, "rules">): void {
  const n = ctx.rules.naval!;
  if (to === navalFormationId(u, ctx)) {
    delete u.navalChange;
    return;
  }
  if (n.changeSeconds <= 0) {
    u.navalFormation = to;
    delete u.navalChange;
    return;
  }
  u.navalChange = { to, leftSec: n.changeSeconds };
}

/** 陣形を変える時間を進める。変え終わったら新しい陣形のID を返す */
export function advanceNavalFormation(u: Unit, dt: number): string | null {
  if (!u.navalChange) return null;
  u.navalChange.leftSec -= dt;
  if (u.navalChange.leftSec > 1e-9) return null;
  u.navalFormation = u.navalChange.to;
  delete u.navalChange;
  return u.navalFormation;
}

/** 針路 facing の艦から見て、点 p がどの方位(艦首・舷側・艦尾)にあるか */
export function navalArc(facing: number, from: Vec2, p: Vec2, ctx: Pick<SimContext, "rules">): "bow" | "beam" | "stern" {
  const n = ctx.rules.naval;
  const rel = normalizeBearing(bearing(from, p) - facing);
  const off = rel > 180 ? 360 - rel : rel; // 艦首から何度離れているか(0〜180)
  if (off <= (n?.bowHalfArcDeg ?? 45)) return "bow";
  if (off >= 180 - (n?.sternHalfArcDeg ?? 45)) return "stern";
  return "beam";
}

/** 魚雷が残っているか(艦艇の戦隊で、撃った時間がルールパックの上限に届いていない) */
export function hasTorpedoes(u: Unit, ctx: Pick<SimContext, "rules">): boolean {
  return (u.torpedoSecUsed ?? 0) < (ctx.rules.naval?.torpedoSalvoMinutes ?? 0) * 60;
}

/** 撃つ側の陣形の、目標の方位への火力の倍率と、受ける側の陣形の、撃ってきた方位への損害の倍率 */
export function navalFireMultipliers(a: Unit, target: Unit, aPt: Vec2, tPt: Vec2, ctx: SimContext): { fire: number; fireArc?: "bow" | "beam" | "stern"; taken: number; takenArc?: "bow" | "beam" | "stern" } {
  const out: { fire: number; fireArc?: "bow" | "beam" | "stern"; taken: number; takenArc?: "bow" | "beam" | "stern" } = { fire: 1, taken: 1 };
  if (isNaval(a, ctx)) {
    const f = navalFormationOf(a, ctx);
    if (f) {
      out.fireArc = navalArc(a.facing, aPt, tPt, ctx);
      out.fire = f.fire[out.fireArc];
    }
  }
  if (isNaval(target, ctx)) {
    const f = navalFormationOf(target, ctx);
    if (f) {
      out.takenArc = navalArc(target.facing, tPt, aPt, ctx);
      out.taken = f.damageTaken[out.takenArc];
    }
  }
  return out;
}
