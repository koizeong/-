import type { SideVictory, VictoryCondition, VictoryTier } from "@brigade/sim-core";

/** 勝利条件の文章(作戦の選択・作戦命令・戦況・結果の画面で使う) */

type Named = { id: string; name: string }[];

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 部隊の呼び名(陣営の接頭辞を外す)。相手の部隊はサーバーが "enemy" に置き換えて送る(霧) */
const unitLabel = (id: string) => (id === "enemy" ? "敵の護送部隊" : id.endsWith("-convoy") ? "護送部隊" : id.replace(/^[a-z]+-/, ""));

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
    case "unitReach":
      return `${unitLabel(c.unit)}を${name(c.objective)}まで送り届ける(戦力 ${pct(c.minStrength)}以上で)`;
    case "unitLoss":
      return `${unitLabel(c.unit)}を撃破する(戦力を${pct(1 - c.minLoss)}以下に)`;
    case "exitShare": {
      const exits = c.objectives.map(name).join("・");
      const who = c.side ? "敵の" : "";
      if (c.min !== undefined && c.max === undefined) return `${who}総戦力の${pct(c.min)}以上を${exits}へ抜けさせる`;
      if (c.max !== undefined && c.min === undefined) return `${who}総戦力の${pct(c.max)}より多くを${exits}へ抜けさせない`;
      return `${who}総戦力のうち${exits}へ抜ける割合を${pct(c.min ?? 0)}〜${pct(c.max ?? 1)}に`;
    }
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
