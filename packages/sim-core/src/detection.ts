import { distance } from "./geometry.js";
import type { SimContext } from "./context.js";
import { effectiveStance } from "./stance.js";
import type { Unit } from "./unit.js";

/** 0:未探知 / 1:反応あり(位置のみ) / 2:兵種判明 / 3:規模・装備判明 */
export type DetectionLevel = 0 | 1 | 2 | 3;

/** observer が target を探知できる距離(m) */
export function detectionRange(observer: Unit, target: Unit, ctx: SimContext): number {
  const { rules } = ctx;
  const obsStance = rules.stances[effectiveStance(observer, rules)]!;
  const tgtStance = rules.stances[effectiveStance(target, rules)]!;
  const obsBranch = ctx.branches.branches[observer.branch]!;
  const tgtTerrain = rules.terrain[ctx.terrain.terrainAt(target.pos)]!;
  return (
    rules.detection.baseRangeM *
    ctx.visibilityMultiplier *
    obsStance.visionMultiplier *
    obsBranch.visionMultiplier *
    tgtTerrain.concealment *
    tgtStance.signatureMultiplier
  );
}

export function detectionLevel(observer: Unit, target: Unit, ctx: SimContext): DetectionLevel {
  const range = detectionRange(observer, target, ctx);
  const d = distance(observer.pos, target.pos);
  const { detection } = ctx.rules;
  if (d <= range * detection.fullyIdentifiedRatio) return 3;
  if (d <= range * detection.typeIdentifiedRatio) return 2;
  if (d <= range) return 1;
  return 0;
}
