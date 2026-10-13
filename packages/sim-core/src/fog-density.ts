import type { SimContext } from "./context.js";
import type { IntelState } from "./intel.js";

/** 今の試合の霧の濃度の設定 */
export function fogLevel(ctx: SimContext) {
  const fog = ctx.rules.fog;
  return fog.levels[ctx.fogDensity ?? fog.default]!;
}

/**
 * 古くなったゴースト(見失った敵)を忘れる(intel を書き換える)。今見えている敵は忘れない。
 * 忘れると、その敵について分かっていた兵種などの情報も消える。
 */
export function forgetStaleGhosts(intel: IntelState, now: number, ctx: SimContext): void {
  const hours = fogLevel(ctx).ghostHours;
  if (hours === null) return;
  for (const si of Object.values(intel)) {
    for (const [id, e] of Object.entries(si.entries)) {
      if (e.currentLevel === 0 && now - e.lastSeenTime > hours * 3600) delete si.entries[id];
    }
  }
}
