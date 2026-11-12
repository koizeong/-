import type { OwnUnitView, SideView, SimContext } from "@brigade/sim-core";
import type { Assessment } from "./assess.js";
import { isArtilleryUnit } from "./assault.js";
import { sideGoals } from "./goals.js";

/**
 * 防勢の陣営の陣地の堅守(ユーザー判断)。
 * 防勢 = 勝利条件の保持の条件(hold・holdUntil)の目標が、どれも始めから自陣営のもの。取りに行く目標がなく、守るだけの陣営
 * (生成の攻撃と防御・突破の守る側、キャンペーンの攻撃と防御の守る側、チピョンニの米軍など)。
 * 防勢の陣営の、陣地に入った(展開して陣地1以上の)部隊は、その場を動かずに守る。陣地にいない予備は今どおり逆襲・穴埋めに動く。
 * ただし勝機があれば(見えている敵の推定戦力の OFFENSIVE_RATIO 倍以上の戦力があれば)、堅守をやめて今の判断で攻勢に出る。
 * 守る目標を敵に取られたときも、取り返しに出るので堅守をやめる(エドソンの丘で、堅守のままでは取られた丘を取り返せなかった)。
 * 撃ち合いで押している相手に取りつく攻め気(press.ts)・撤退(escape.ts)は、堅守より先に効く
 */

/** 勝機の目安:自軍の戦力の合計が、見えている敵の推定戦力の合計の何倍あれば攻勢に出るか(仮置き) */
export const OFFENSIVE_RATIO = 2;

/** 保持の条件(hold・holdUntil)の目標。突破を阻む条件(exitShare の side)は取りに行く目標ではないので数えない */
function heldObjectives(ctx: SimContext, side: string): string[] {
  const g = sideGoals(ctx, side);
  if (!g) return [];
  const ids = new Set<string>();
  for (const c of g.victory.conditions) if ((c.type === "hold" || c.type === "holdUntil") && "objective" in c && typeof c.objective === "string") ids.add(c.objective);
  return [...ids];
}

/** 防勢の陣営か(保持の条件の目標がどれも始めから自陣営のもので、1つ以上ある) */
export function defensiveSide(ctx: SimContext, side: string): boolean {
  const ids = heldObjectives(ctx, side);
  return ids.length > 0 && ids.every((id) => ctx.scenario.objectives.find((o) => o.id === id)?.initialHolder === side);
}

/** 守る目標のどれかを敵に取られたか(取り返しに出るので、堅守をやめる) */
export function objectiveLost(view: SideView, ctx: SimContext): boolean {
  return heldObjectives(ctx, view.side).some((id) => {
    const h = view.objectives[id];
    return h !== undefined && h !== null && h !== view.side;
  });
}

/** 勝機があるか:見えている敵がいて、自軍の戦力の合計がその推定戦力の OFFENSIVE_RATIO 倍以上 */
export function offensiveChance(view: SideView, a: Assessment, ctx: SimContext): boolean {
  if (a.threats.length === 0) return false;
  const own = view.own.filter((u) => u.strength > 0 && !u.routed && !isArtilleryUnit(u, ctx)).reduce((t, u) => t + u.strength, 0);
  const enemy = a.threats.reduce((t, c) => t + (c.estimatedStrength ?? 0.7), 0);
  return own >= OFFENSIVE_RATIO * enemy;
}

/** 堅守する部隊(防勢の陣営で勝機がないときの、陣地に入った部隊)。命令を出さずにその場で守らせる */
export function holdFastUnits(view: SideView, a: Assessment, ctx: SimContext): Set<string> {
  if (!defensiveSide(ctx, view.side) || offensiveChance(view, a, ctx) || objectiveLost(view, ctx)) return new Set();
  const held = (u: OwnUnitView) => u.strength > 0 && !u.routed && !isArtilleryUnit(u, ctx) && u.formation === "deployed" && u.entrenchment >= 1;
  return new Set(view.own.filter(held).map((u) => u.id));
}
