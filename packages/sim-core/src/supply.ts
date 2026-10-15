import type { SimContext } from "./context.js";
import { distance } from "./geometry.js";
import { effectiveStance } from "./stance.js";
import type { Unit } from "./unit.js";
import { weaponMaxRange } from "./weapon.js";

/** 移動の種別:燃料を使う編成は車両、使わない編成は徒歩、揚陸能力のある編成は揚陸(川・海も渡れる) */
export type Mobility = "foot" | "vehicle" | "amphibious";

export function mobilityOf(u: Unit, ctx: SimContext): Mobility {
  if (ctx.toes.toes[u.toe]!.amphibious) return "amphibious";
  return usesFuel(u, ctx) ? "vehicle" : "foot";
}

/** 燃料を使うユニットか(徒歩なら false) */
export function usesFuel(u: Unit, ctx: SimContext): boolean {
  return ctx.toes.toes[u.toe]!.supply.fuelPerKmT > 0;
}

/** 移動1mあたりの燃料消費(トン) */
function fuelPerMeterT(u: Unit, ctx: SimContext): number {
  const perKm = ctx.toes.toes[u.toe]!.supply.fuelPerKmT;
  const mode = u.moveMode === "combat" ? ctx.rules.supply.combatMoveFuelMultiplier : 1;
  return (perKm / 1000) * mode;
}

/** 今の燃料で進める距離(m)。燃料を使わないユニットは無制限 */
export function fuelRangeM(u: Unit, ctx: SimContext): number {
  const rate = fuelPerMeterT(u, ctx);
  if (rate === 0) return Infinity;
  return (u.fuel * ctx.toes.toes[u.toe]!.supply.fuelCapacityT) / rate;
}

/** d メートル進んだ分の燃料を減らす */
export function consumeFuel(u: Unit, d: number, ctx: SimContext): void {
  const rate = fuelPerMeterT(u, ctx);
  if (rate === 0 || d <= 0) return;
  const cap = ctx.toes.toes[u.toe]!.supply.fuelCapacityT;
  u.fuel = Math.max(0, u.fuel - (d * rate) / cap);
}

/**
 * このステップに撃った分の弾薬を減らす。
 * 目標が射程内にある武器だけが撃つ(直接射撃のみ)。弾薬が切れていれば何もしない。
 */
export function consumeAmmo(a: Unit, targets: readonly Unit[], moved: boolean, ctx: SimContext): void {
  if (a.ammo <= 0 || targets.length === 0) return;
  const toe = ctx.toes.toes[a.toe]!;
  const cap = toe.supply.ammoCapacityT;
  if (cap === 0) return;
  const nearest = Math.min(...targets.map((t) => distance(a.pos, t.pos)));
  let perMin = 0;
  for (const e of toe.elements) {
    for (const ref of e.weapons) {
      const w = ctx.weapons.weapons[ref.weapon]!;
      if (w.indirect || weaponMaxRange(w) < nearest) continue;
      perMin += e.count * ref.count * w.ammoPerMin;
    }
  }
  const { rules } = ctx;
  const used =
    perMin *
    (ctx.stepSeconds / 60) *
    rules.stances[effectiveStance(a, rules)]!.ammoConsumptionMultiplier *
    (moved ? rules.supply.combatMoveAmmoMultiplier : 1);
  a.ammo = Math.max(0, a.ammo - used / cap);
}

/** 携行備蓄が切れているか(弾薬、または燃料を使うユニットの燃料) */
export function isOutOfStock(u: Unit, ctx: SimContext): boolean {
  return u.ammo <= 0 || (usesFuel(u, ctx) && u.fuel <= 0);
}
