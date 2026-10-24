import { objectivePoints, ownVictory, publicVictory, requiredObjectives, type SideVictory, type SimContext, type VictoryTier } from "@brigade/sim-core";

/**
 * AIが見る勝利条件の要点(段階ごと)。勝利点制の条件から読み取る:
 * required = 満たすべき条件の目標、minWeight = 勝利点の下限、minEnemyLoss・maxOwnLoss = 満たすべき損耗の条件
 */
export interface TierGoals {
  required: string[];
  minWeight: number;
  minEnemyLoss?: number;
  maxOwnLoss?: number;
}

export interface SideGoals {
  decisive: TierGoals;
  limited: TierGoals;
  urgency: number;
  victory: SideVictory;
}

function tierGoals(v: SideVictory, t: VictoryTier): TierGoals {
  const reqs = t.requires.map((id) => v.conditions.find((c) => c.id === id)).filter((c) => c !== undefined);
  const enemy = reqs.flatMap((c) => (c.type === "enemyLoss" ? [c.min] : []));
  const own = reqs.flatMap((c) => (c.type === "ownLoss" ? [c.max] : []));
  return {
    required: requiredObjectives(v, t),
    minWeight: t.minPoints,
    ...(enemy.length ? { minEnemyLoss: Math.max(...enemy) } : {}),
    ...(own.length ? { maxOwnLoss: Math.min(...own) } : {}),
  };
}

/**
 * 陣営の勝利条件の要点。自陣営なら引いた秘密の副目標(mySecrets)も入れる。
 * mySecrets を渡さなければ、相手にも見える条件だけ(相手の秘密の副目標は、AIにも見えない)
 */
export function sideGoals(ctx: SimContext, side: string, mySecrets?: readonly string[]): SideGoals | undefined {
  const raw = ctx.scenario.victory[side];
  if (!raw) return undefined;
  const v = mySecrets ? ownVictory(raw, mySecrets) : publicVictory(raw);
  return { decisive: tierGoals(v, v.decisive), limited: tierGoals(v, v.limited), urgency: v.urgency, victory: v };
}

/** 陣営ごとの勝利条件の要点 */
export function allGoals(ctx: SimContext): [string, SideGoals][] {
  return Object.keys(ctx.scenario.victory).map((s) => [s, sideGoals(ctx, s)!]);
}

/** 目標を保持して得られる勝利点(その陣営の条件から) */
export function pointsOf(g: SideGoals | undefined, objectiveId: string): number {
  return g ? objectivePoints(g.victory, objectiveId) : 0;
}
