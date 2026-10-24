import type { SideVictory, VictoryCondition, VictoryTier } from "@brigade/sim-core";

/** 勝利条件の文章(作戦の選択・作戦命令・戦況・結果の画面で使う) */

type Named = { id: string; name: string }[];

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 1つの条件の文 */
export function conditionText(c: VictoryCondition, objectives: Named): string {
  const name = (id: string) => objectives.find((o) => o.id === id)?.name ?? id;
  switch (c.type) {
    case "hold":
      return c.perTurn ? `${name(c.objective)}を保持(保持したターンの分だけ点がたまる)` : `${name(c.objective)}を保持`;
    case "holdUntil":
      return `${c.turn}ターン目まで${name(c.objective)}を敵に渡さない`;
    case "enemyLoss":
      return `敵の損耗 ${pct(c.min)}以上`;
    case "ownLoss":
      return `自軍の損耗 ${pct(c.max)}以下`;
    case "lossRatio":
      return c.max === 1 ? "敵より損耗を抑える" : `自軍の損耗を敵の損耗の${c.max}倍以下に抑える`;
  }
}

/** 段階の文:満たすべき条件と、勝利点の下限 */
export function tierText(v: SideVictory, t: VictoryTier, objectives: Named): string {
  const parts = t.requires.flatMap((id) => {
    const c = v.conditions.find((x) => x.id === id);
    return c ? [conditionText(c, objectives)] : [];
  });
  if (t.minPoints > 0) parts.push(`勝利点 ${t.minPoints} 以上`);
  return parts.join("、") || "—";
}

/** 勝利点を生む条件の一覧(「〜:3点」) */
export function pointsList(v: SideVictory, objectives: Named): { text: string; points: number }[] {
  return v.conditions.filter((c) => c.points > 0).map((c) => ({ text: conditionText(c, objectives), points: c.points }));
}

/** 段階ごとの、満たすべき損耗の条件(戦況の帯に出す) */
export function lossGoals(v: SideVictory): { tier: "limited" | "decisive"; enemyMin?: number; ownMax?: number }[] {
  return (["limited", "decisive"] as const).map((tier) => {
    const reqs = v[tier].requires.map((id) => v.conditions.find((c) => c.id === id));
    const enemy = reqs.flatMap((c) => (c?.type === "enemyLoss" ? [c.min] : []));
    const own = reqs.flatMap((c) => (c?.type === "ownLoss" ? [c.max] : []));
    return { tier, ...(enemy.length ? { enemyMin: Math.max(...enemy) } : {}), ...(own.length ? { ownMax: Math.min(...own) } : {}) };
  });
}
