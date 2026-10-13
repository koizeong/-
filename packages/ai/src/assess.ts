import { distance, toeDirectMaxRange, type ContactView, type SideView, type SimContext, type Vec2 } from "@brigade/sim-core";

/** AIが見る盤面の評価。入力は陣営のビュー(霧を通した情報)と、公開の静的データ(地図・ルール・シナリオ)だけ */
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
}

/** 情報の鮮度:この秒数より古いゴーストは脅威として数えない */
const STALE_AFTER_TURNS = 2;

export function assess(view: SideView, ctx: SimContext): Assessment {
  const { scenario } = ctx;
  const mine = scenario.victory[view.side];
  const enemySides = Object.keys(scenario.victory).filter((s) => s !== view.side);

  // 勝利条件に「重みの合計のしきい値」があれば、重みを持つ目標の価値を上げる
  // (自陣営が届かせるため・敵に届かせないため)。必須の目標だけを見ていると、ほかの目標を手放してしまう
  const usesWeight = (t: { minWeight: number }) => t.minWeight > 0;
  const weightImportance =
    1 +
    (mine && (usesWeight(mine.decisive) || usesWeight(mine.limited)) ? 2 : 0) +
    (enemySides.some((s) => usesWeight(scenario.victory[s]!.decisive) || usesWeight(scenario.victory[s]!.limited)) ? 2 : 0);

  const objectiveValue = new Map<string, number>();
  for (const o of scenario.objectives) {
    let v = o.weight * weightImportance;
    if (mine?.decisive.required.includes(o.id)) v += 5;
    if (mine?.limited.required.includes(o.id)) v += 3;
    // 敵が必要とする目標は、守る価値が上がる
    for (const s of enemySides) {
      const e = scenario.victory[s]!;
      if (e.decisive.required.includes(o.id)) v += 4;
      if (e.limited.required.includes(o.id)) v += 2;
    }
    objectiveValue.set(o.id, v);
  }

  const freshAfter = view.time - STALE_AFTER_TURNS * ctx.turnSeconds;
  const threats = view.contacts.filter((c) => !c.destroyed && c.lastSeenTime >= freshAfter);

  // 必要な部隊数:1部隊 + 近くの敵の推定戦力に応じて(最大4)
  const objectiveNeed = new Map<string, number>();
  for (const o of scenario.objectives) {
    objectiveNeed.set(o.id, Math.min(4, 1 + Math.round(threatNear(o, threats, 3000) * 1.5)));
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
  return { side: view.side, objectiveValue, objectiveNeed, engageScale, threats, enemyCentroid, rear, restPoint };
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
