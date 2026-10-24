import { distance, estimateEnemyLoss, toeDirectMaxRange, type ContactView, type SideView, type SimContext, type Vec2 } from "@brigade/sim-core";
import { pointsOf, sideGoals } from "./goals.js";

/** AIが見る盤面の評価。入力は陣営のビュー(霧を通した情報)と、公開の静的データ(地図・ルール・シナリオ)だけ */
/** 目標の範囲のこの距離外までにいる敵は、目標に入ってきうるとみなして、守りに要る部隊の数に数える */
const OBJECTIVE_THREAT_MARGIN_M = 1500;

/** 残りのターンがこれ以下なら、急ぎ度にかかわらず遮二無二の突撃をかけてよい(終わり間際) */
export const ALL_OUT_LATE_TURNS = 8;

export interface Assessment {
  side: string;
  /** 自陣営にとっての目標の価値(奪う・守る) */
  objectiveValue: Map<string, number>;
  /** 側面攻撃・夜襲の点の大きさ(目標の価値の平均に合わせ、目標と比べられるようにする) */
  engageScale: number;
  /** 目標ごとに必要な部隊数の見積もり(近くの敵の推定戦力から)。これを超えて送る価値は小さい */
  objectiveNeed: Map<string, number>;
  /** 今見えている、または最近見た敵(撃破確認済みは除く) */
  threats: ContactView[];
  /** 敵がいると考える方向の中心 */
  enemyCentroid: Vec2;
  /** 自陣営の後方の基準点(自軍ユニットの重心を、敵と反対側へずらした点) */
  rear: Vec2;
  /** 弱ったユニットが下がって休む場所(自陣営の集積所のうち敵から最も遠いもの。なければ後方) */
  restPoint: Vec2;
  /**
   * 敵を削る意欲(0〜1)。自陣営の勝利条件に「敵の損耗率」があるときだけ0より大きく、
   * 見積もった敵の損耗率がいちばん高いしきい値に届くまでの残りの割合。目標の保持だけで勝敗が決まるシナリオでは0
   */
  attritionDrive: number;
  /** 急ぎ度から見て、勝利条件に欠かせない目標へ遮二無二の突撃をかけてよい時期か */
  urgent: boolean;
  /**
   * 消耗を抑える意欲(0〜1)。自陣営の勝利条件に「自軍の損耗率が○%以下」があるときだけ0より大きい。
   * 損耗がなくても 0.5、ゆるい方のしきい値に近づくほど1へ上がる。目標の保持・撃滅のシナリオでは0
   */
  preserveDrive: number;
}

/** 情報の鮮度:この秒数より古いゴーストは脅威として数えない */
const STALE_AFTER_TURNS = 2;

export function assess(view: SideView, ctx: SimContext): Assessment {
  const { scenario } = ctx;
  const mine = sideGoals(ctx, view.side);
  const enemySides = Object.keys(scenario.victory).filter((s) => s !== view.side);
  const enemyGoals = enemySides.map((s) => sideGoals(ctx, s)!);

  // 勝利条件に「重みの合計のしきい値」があれば、重みを持つ目標の価値を上げる
  // (自陣営が届かせるため・敵に届かせないため)。必須の目標だけを見ていると、ほかの目標を手放してしまう
  const usesWeight = (t: { minWeight: number }) => t.minWeight > 0;
  const weightImportance =
    1 +
    (mine && (usesWeight(mine.decisive) || usesWeight(mine.limited)) ? 2 : 0) +
    (enemyGoals.some((e) => usesWeight(e.decisive) || usesWeight(e.limited)) ? 2 : 0);

  const objectiveValue = new Map<string, number>();
  for (const o of scenario.objectives) {
    // 目標の勝利点(どちらかの陣営の条件で、いちばん大きいもの。旧い形のシナリオでは目標の重み)
    let v = Math.max(pointsOf(mine, o.id), ...enemyGoals.map((e) => pointsOf(e, o.id))) * weightImportance;
    if (mine?.decisive.required.includes(o.id)) v += 5;
    if (mine?.limited.required.includes(o.id)) v += 3;
    // 敵が必要とする目標は、守る価値が上がる
    for (const e of enemyGoals) {
      if (e.decisive.required.includes(o.id)) v += 4;
      if (e.limited.required.includes(o.id)) v += 2;
    }
    objectiveValue.set(o.id, v);
  }

  const freshAfter = view.time - STALE_AFTER_TURNS * ctx.turnSeconds;
  const threats = view.contacts.filter((c) => !c.destroyed && c.lastSeenTime >= freshAfter);

  // 必要な部隊数:1部隊 + 近くの敵の推定戦力に応じて(最大4)。
  // 目標は範囲内の部隊の数が多い陣営が押さえる(同数なら拮抗して補給が止まる)ので、近くに見えている敵の部隊の数より1つ多くは置く
  const objectiveNeed = new Map<string, number>();
  for (const o of scenario.objectives) {
    const byStrength = Math.min(4, 1 + Math.round(threatNear(o, threats, 3000) * 1.5));
    const enemiesNear = threats.filter((c) => distance(c.pos, o) <= o.radiusM + OBJECTIVE_THREAT_MARGIN_M).length;
    objectiveNeed.set(o.id, Math.max(byStrength, enemiesNear + 1));
  }

  const own = view.own.filter((u) => u.strength > 0);
  const ownCentroid = centroid(own.map((u) => u.pos)) ?? { x: ctx.terrain.widthM / 2, y: ctx.terrain.heightM / 2 };
  const enemyObjectives = scenario.objectives.filter((o) => {
    const h = view.objectives[o.id];
    return h !== undefined && h !== null && h !== view.side;
  });
  const enemyCentroid =
    centroid(threats.map((c) => c.pos)) ??
    centroid(enemyObjectives.map((o) => ({ x: o.x, y: o.y }))) ??
    { x: ctx.terrain.widthM - ownCentroid.x, y: ctx.terrain.heightM - ownCentroid.y };

  const rear = awayFrom(ownCentroid, enemyCentroid, 3000, ctx);
  const depots = view.depots.map((d) => ctx.roads.pos(d.nodeId));
  const restPoint = depots.sort((p, q) => distance(q, enemyCentroid) - distance(p, enemyCentroid))[0] ?? rear;
  const values = [...objectiveValue.values()];
  const engageScale = values.length ? Math.max(2, (0.6 * values.reduce((s, v) => s + v, 0)) / values.length) : 2;
  // 敵を削る意欲:勝利条件の損耗のしきい値(いちばん高いもの)まで、見積もった敵の損耗率がどれだけ足りないか
  const lossTargets = mine ? [mine.limited.minEnemyLoss, mine.decisive.minEnemyLoss].filter((x): x is number => x !== undefined && x > 0) : [];
  const lossTarget = lossTargets.length ? Math.max(...lossTargets) : 0;
  const attritionDrive = lossTarget > 0 ? Math.min(1, Math.max(0, (lossTarget - estimateEnemyLoss(view.contacts)) / lossTarget)) : 0;
  // 消耗を抑える意欲:自軍の損耗率が、ゆるい方のしきい値(限定的勝利の上限)にどれだけ近いか
  const ownLimits = mine ? [mine.limited.maxOwnLoss, mine.decisive.maxOwnLoss].filter((x): x is number => x !== undefined && x > 0) : [];
  const ownLimit = ownLimits.length ? Math.max(...ownLimits) : 0;
  const preserveDrive = ownLimit > 0 ? Math.min(1, 0.5 + (0.5 * view.ownLoss) / ownLimit) : 0;
  // 遮二無二の突撃をかけ始める時期:残りのターンが「終わり間際(ALL_OUT_LATE_TURNS)+ 急ぎ度 × シナリオの長さ」以下
  const remaining = scenario.maxTurns - view.turn + 1;
  const urgent = remaining <= ALL_OUT_LATE_TURNS + (mine?.urgency ?? 0) * scenario.maxTurns;
  return { side: view.side, objectiveValue, objectiveNeed, engageScale, threats, enemyCentroid, rear, restPoint, attritionDrive, preserveDrive, urgent };
}

export function centroid(ps: readonly Vec2[]): Vec2 | null {
  if (ps.length === 0) return null;
  return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
}

/** from から、away と反対の方向へ d メートル進んだ点(マップ内に収める) */
export function awayFrom(from: Vec2, away: Vec2, d: number, ctx: SimContext): Vec2 {
  const dx = from.x - away.x;
  const dy = from.y - away.y;
  const len = Math.hypot(dx, dy) || 1;
  return clampToMap({ x: from.x + (dx / len) * d, y: from.y + (dy / len) * d }, ctx);
}

export function clampToMap(p: Vec2, ctx: SimContext): Vec2 {
  const m = 50;
  return {
    x: Math.min(ctx.terrain.widthM - m, Math.max(m, p.x)),
    y: Math.min(ctx.terrain.heightM - m, Math.max(m, p.y)),
  };
}

/** 位置 p の近く(radius 以内)に見えている敵の推定戦力の合計(規模不明は 0.7 とみなす) */
export function threatNear(p: Vec2, threats: readonly ContactView[], radius: number): number {
  let s = 0;
  for (const c of threats) if (distance(c.pos, p) <= radius) s += c.estimatedStrength ?? 0.7;
  return s;
}

export function nearestThreat(p: Vec2, threats: readonly ContactView[]): ContactView | null {
  let best: ContactView | null = null;
  for (const c of threats) if (!best || distance(c.pos, p) < distance(best.pos, p)) best = c;
  return best;
}

/** 直接射撃の射程(編成表から) */
export function directRange(toe: string, ctx: SimContext): number {
  return toeDirectMaxRange(ctx.toes.toes[toe]!, ctx.weapons);
}
