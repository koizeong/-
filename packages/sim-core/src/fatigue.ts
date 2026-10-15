import type { SimContext } from "./context.js";
import { effectiveStance } from "./stance.js";
import type { Unit } from "./unit.js";

/** 疲れているほど遅くなる(速度への倍率) */
export function fatigueSpeedMultiplier(u: Unit, ctx: SimContext): number {
  return 1 - u.fatigue * ctx.rules.fatigue.speedPenalty;
}

/** 疲れているほど火力が落ちる(火力への倍率) */
export function fatigueFirepowerMultiplier(u: Unit, ctx: SimContext): number {
  return 1 - u.fatigue * ctx.rules.fatigue.firepowerPenalty;
}

/**
 * 1小ステップ分の疲労の増減(units を書き換える)。
 * 動いた(行軍・戦闘移動)・撃った・撃たれた分だけたまり、夜間行動は上乗せ。
 * 動かず、撃たず、撃たれていなければ回復する。
 */
export function updateFatigue(
  units: readonly Unit[],
  activity: { moved: ReadonlySet<string>; fired: ReadonlySet<string>; hit: ReadonlySet<string>; nightActors?: ReadonlySet<string> | undefined },
  ctx: SimContext,
): void {
  const f = ctx.rules.fatigue;
  const hours = ctx.stepSeconds / 3600;
  for (const u of units) {
    if (u.strength <= 0) continue;
    const moved = activity.moved.has(u.id);
    const fired = activity.fired.has(u.id);
    const hit = activity.hit.has(u.id);
    let delta = 0;
    if (moved) delta += u.moveMode === "combat" ? f.combatMovePerHour : f.marchPerHour;
    if (fired) delta += f.firingPerHour;
    if (hit) delta += f.underFirePerHour;
    if ((moved || fired) && activity.nightActors?.has(u.id)) delta += f.nightActionPerHour;
    // 姿勢(強襲など)で、たまり方だけが変わる
    delta *= ctx.rules.stances[effectiveStance(u, ctx.rules)]!.fatigueMultiplier;
    // 休息の回復は姿勢(予備)で速くなる
    if (!moved && !fired && !hit) delta -= f.restPerHour * ctx.rules.stances[effectiveStance(u, ctx.rules)]!.fatigueRecoveryMultiplier;
    u.fatigue = Math.min(1, Math.max(0, u.fatigue + delta * hours));
  }
}
