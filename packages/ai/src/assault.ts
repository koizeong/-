import { distance, isStanceSpent, toeIndirectMaxRange, type OwnUnitView, type SideView, type SimContext, type Vec2 } from "@brigade/sim-core";
import { ALL_OUT_LATE_TURNS, centroid, clampToMap, threatNear, type Assessment } from "./assess.js";

/**
 * 目標への総攻撃の段取り(陣営で1つ)。AIは状態を持たないので、毎ターンのビューから段階を読み直す。
 * 1. 集結:敵が押さえている目標の手前(STAGING_M)に、攻める部隊を横に並べて集める(ばらばらに突っ込まない)
 * 2. 準備砲撃:集まったら目標へ砲撃を要請する(次のターンに着弾)
 * 3. 待機:砲撃が着弾するターンは、着弾範囲の外で待ち、強襲に切り替える
 * 4. 突入:強襲が効いているターンに、全員で目標へ
 * 落とせなければ、強襲が息切れした部隊は標準に戻して集結点へ下がり、2から繰り返す。
 * 残りのターンが少ない・撃てる砲兵がいないときは、砲撃を待たずに突入する。
 *
 * 兵力に余裕があり時間も残っていれば、正面から攻めずに包囲する(siege)。目標のまわり(SIEGE_RING_M)に
 * 等間隔で部隊を置いて囲み、砲撃を続けて干上がらせる。守備隊が投降していなくなったら入る。
 * どちらを選ぶかのしきい値は試合と目標ごとに少し揺らす(毎回同じ攻め方にならないように)
 */
export interface AssaultPlan {
  mode: "assault" | "siege";
  objectiveId: string;
  target: Vec2;
  /** 攻める部隊の集結点・包囲の位置(部隊ID → 地点) */
  slots: Map<string, Vec2>;
  /** 包囲の位置へ回り込むときの経由点(部隊ID → 地点) */
  via: Map<string, Vec2>;
  /** 包囲:守備隊がいなくなった(見えている敵がいない)ので入る */
  garrisonGone: boolean;
  /** このターンに目標へ自軍の砲撃が着弾する */
  barrageNow: boolean;
  /** このターンに目標への砲撃を要請する */
  requestBarrage: boolean;
  /** 砲撃を待たずに突入する */
  direct: boolean;
  /**
   * 遮二無二の突撃(強襲の姿勢で、損害を顧みずに押す)か、持続できる攻勢(標準の姿勢で取りつき、崩れそうなら下がる)か。
   * 強襲は崩れるまでに多くの損害を払うので、払う価値のあるときだけ:勝利条件に欠かせない目標で急ぎ度から見て時期が来た、
   * 残りのターンが少ない、守備隊が弱っている(見えている守備隊の推定戦力が半分未満)。時間に余裕があれば、欠かせない目標でも
   * 持続できる攻勢で削る(毎日遮二無二に突撃すると、攻める側が先に尽きる。バストーニュの8日間で独軍の損耗が6割を超えた)
   */
  allOut: boolean;
}

/** 集結点:目標から自陣営の側へこの距離(阻止圏の外、着弾範囲の外) */
export const STAGING_M = 1200;
/** 集結点で横に並べる間隔 */
const SLOT_SPACING_M = 400;
/** この距離より遠い部隊は総攻撃に加えない */
const GROUP_WITHIN_M = 10000;
/** 守備隊の見積もり:目標からこの距離以内に見えている(最近見た)敵。見えていなければ1部隊ぶん(0.7)いるとみなす */
const GARRISON_WITHIN_M = 1500;
/** 総攻撃に加える部隊数:守備隊の推定規模の2倍 + 1(2〜4部隊) */
const MIN_GROUP = 2;
const MAX_GROUP = 4;
/** 集結点からこの距離以内なら「集まった」とみなす */
const ASSEMBLED_M = 500;
/** 攻める部隊のうち、この割合が集まったら砲撃を要請する */
const ASSEMBLED_FRACTION = 2 / 3;
/** 残りのターンがこれ以下なら、砲撃を待たずに突入する */
const LATE_TURNS = 3;
/** 包囲の輪の半径(阻止圏の外。隣どうしの阻止圏が重なって抜け道がなくなる距離) */
const SIEGE_RING_M = 650;
/** 包囲の位置へ回り込むときの外回りの半径 */
const SIEGE_OUTER_M = 1600;
/** 包囲に要る部隊数・残りターン数 */
const SIEGE_MIN_UNITS = 4;
const SIEGE_MIN_TURNS = 7;
const SIEGE_MAX_UNITS = 6;
/** 包囲を選ぶ兵力比(攻める部隊の戦える度合いの合計 ÷ 守備隊の推定規模)の中央値と揺らぎの幅 */
const SIEGE_RATIO = 2.0;
const SIEGE_RATIO_SPREAD = 1.0;
/**
 * 包囲するのは、守備隊の推定規模がこれ以下の目標だけ(2部隊ぶん程度)。大きな守備隊は干上がるまでに時間がかかり、
 * 4〜6部隊の輪では囲みきれない(全軍が市街のまわりに貼りついて、周りの村を放っておくことになる)。
 * 大きな守備隊は、周りの村を押さえて締め上げるか、正面から攻める
 */
const SIEGE_MAX_GARRISON = 1.5;
/** 敵の勝利条件に欠かせない目標の、守備隊の推定規模の下限(3部隊ぶん) */
const REQUIRED_GARRISON = 2.1;
/** 見えている守備隊の推定戦力(平均)がこれ未満なら、弱っているとみなして遮二無二の突撃にする */
const ALL_OUT_WEAK_GARRISON = 0.5;
/** 着弾範囲の外に、さらにこれだけ離れていれば味方への誤射は避けられる(危険を承知の近接支援) */
export const DANGER_CLOSE_MARGIN_M = 50;
/** 強襲の姿勢のID */
export const ASSAULT_STANCE = "attack";

export function isArtilleryUnit(u: OwnUnitView, ctx: SimContext): boolean {
  return toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons) > 0;
}

/** 強襲が効いている(切替が終わっていて、息切れしていない) */
export function assaulting(u: OwnUnitView, ctx: SimContext): boolean {
  return u.stance === ASSAULT_STANCE && u.pendingStance === null && !isStanceSpent(u, ctx.rules);
}

/** 0〜1 の決まった値(文字列のハッシュ)。試合ごとの「気質」の揺らぎに使う */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function planAssault(view: SideView, a: Assessment, ctx: SimContext, seed = 0): AssaultPlan | null {
  // 敵の損耗を狙う陣営は、目標より敵を削るのが先(準備砲撃からの突撃は別の候補で行う)
  if (a.attritionDrive > 0) return null;
  const victory = ctx.scenario.victory[view.side];
  const required = (id: string) => !!victory && (victory.decisive.required.includes(id) || victory.limited.required.includes(id));
  const ownHeld = ctx.scenario.objectives.filter((o) => view.objectives[o.id] === view.side);
  // 攻める部隊:砲兵・潰走中を除き、自陣営の目標を守っていないもの
  const maneuver = view.own.filter(
    (u) => u.strength > 0 && !u.routed && !isArtilleryUnit(u, ctx) && !ownHeld.some((o) => distance(u.pos, o) <= o.radiusM),
  );
  const force = centroid(maneuver.map((u) => u.pos));
  if (!force) return null;
  // 敵の勝利条件に欠かせない目標は、見えていなくても大きな守備隊がいるとみなす(敵は必ず守る。市街の中は見えにくい)
  const enemyNeeds = (id: string) =>
    Object.entries(ctx.scenario.victory).some(([side, v]) => side !== view.side && (v.decisive.required.includes(id) || v.limited.required.includes(id)));
  const garrison = (o: Vec2 & { id?: string }) =>
    Math.max(o.id && enemyNeeds(o.id) ? REQUIRED_GARRISON : 0.7, threatNear(o, a.threats, GARRISON_WITHIN_M));
  // 狙う目標:敵が押さえている目標のうち、価値 × 近さ ÷ 守備隊の推定規模 が最大のもの(固い所より、落とせそうな所)。
  // 消耗を抑えたい陣営は、勝利条件に欠かせない目標だけ
  const target = ctx.scenario.objectives
    .filter((o) => {
      const h = view.objectives[o.id];
      return !!h && h !== view.side && (a.preserveDrive === 0 || required(o.id));
    })
    .map((o) => ({ o, score: (a.objectiveValue.get(o.id) ?? 0) / (1 + distance(force, o) / 10000) / garrison(o) }))
    .sort((p, q) => q.score - p.score || (p.o.id < q.o.id ? -1 : 1))[0]?.o;
  if (!target) return null;
  const remaining = ctx.scenario.maxTurns - view.turn + 1;
  const near = maneuver
    .filter((u) => distance(u.pos, target) <= GROUP_WITHIN_M)
    .sort((p, q) => distance(p.pos, target) - distance(q.pos, target) || (p.id < q.id ? -1 : 1));
  // 包囲か正面攻撃か:囲めるだけの部隊がいて、時間が残っていて、兵力に余裕があれば包囲
  const siegeGroup = near.slice(0, SIEGE_MAX_UNITS);
  const power = siegeGroup.reduce((s, u) => s + u.strength * u.morale, 0);
  const threshold = SIEGE_RATIO + (hash01(`${seed}:${view.side}:${target.id}`) - 0.5) * SIEGE_RATIO_SPREAD;
  const siege =
    siegeGroup.length >= SIEGE_MIN_UNITS && remaining >= SIEGE_MIN_TURNS && garrison(target) <= SIEGE_MAX_GARRISON && power / garrison(target) >= threshold;
  // 加える部隊:目標に近い順に、必要な数だけ
  const size = siege ? siegeGroup.length : Math.min(MAX_GROUP, Math.max(MIN_GROUP, Math.round(garrison(target) * 2) + 1));
  const group = near.slice(0, size).sort((p, q) => (p.id < q.id ? -1 : 1));
  if (group.length === 0) return null;

  // 集結点:目標から、攻める部隊の重心の方向へ STAGING_M。その左右に並べる
  const from = centroid(group.map((u) => u.pos))!;
  const len = Math.max(1, distance(from, target));
  const dir = { x: (from.x - target.x) / len, y: (from.y - target.y) / len };
  const perp = { x: -dir.y, y: dir.x };
  const slots = new Map<string, Vec2>();
  const via = new Map<string, Vec2>();
  if (siege) {
    // 輪の位置は、攻める側の正面から等間隔。近い部隊から近い位置へ(位置の角度順に、部隊を角度順に当てる)
    const base = Math.atan2(dir.x, dir.y);
    const angleOf = (p: Vec2) => {
      const t = Math.atan2(p.x - target.x, p.y - target.y) - base;
      return ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    };
    const byAngle = [...group].sort((p, q) => angleOf(p.pos) - angleOf(q.pos) || (p.id < q.id ? -1 : 1));
    byAngle.forEach((u, i) => {
      const t = base + (i * 2 * Math.PI) / group.length;
      const at = (r: number) => clampToMap({ x: target.x + Math.sin(t) * r, y: target.y + Math.cos(t) * r }, ctx);
      slots.set(u.id, at(SIEGE_RING_M));
      // 目標の近くを突っ切らないよう、外回りを経由する
      if (distance(u.pos, target) > SIEGE_OUTER_M * 0.8) via.set(u.id, at(SIEGE_OUTER_M));
    });
  } else {
    group.forEach((u, i) => {
      const off = (i - (group.length - 1) / 2) * SLOT_SPACING_M;
      slots.set(u.id, clampToMap({ x: target.x + dir.x * STAGING_M + perp.x * off, y: target.y + dir.y * STAGING_M + perp.y * off }, ctx));
    });
  }

  const impact = ctx.rules.combat.indirectImpactRadiusM;
  const onTarget = (m: { target: Vec2 }) => distance(m.target, target) <= impact;
  const barrageNow = view.fireMissions.some((m) => m.turn === view.turn && onTarget(m));
  const barragePending = view.fireMissions.some((m) => m.turn > view.turn && onTarget(m));
  // 撃てる砲兵:展開済みで、目標が射程内(陣地変換中の砲兵を待つと、いつまでも突入できない)
  const guns = view.own.filter(
    (u) => u.strength > 0 && !u.routed && u.formation === "deployed" && isArtilleryUnit(u, ctx) && distance(u.pos, target) <= toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons),
  );
  const direct = !siege && (remaining <= LATE_TURNS || guns.length === 0);
  // 突入中の味方がいる・味方が着弾範囲に近すぎるなら撃たない
  const storming = group.some((u) => assaulting(u, ctx) && distance(u.pos, target) <= 3000);
  const tooClose = view.own.some((f) => distance(f.pos, target) < impact + DANGER_CLOSE_MARGIN_M);
  const assembled = group.filter((u) => distance(u.pos, slots.get(u.id)!) <= ASSEMBLED_M || distance(u.pos, target) <= STAGING_M).length;
  // 包囲中は、囲んでいる間ずっと撃ち続ける(干上がらせる)
  const requestBarrage = siege
    ? !barragePending && !tooClose
    : !direct && !barrageNow && !barragePending && !storming && !tooClose && assembled >= Math.ceil(group.length * ASSEMBLED_FRACTION);
  // 守備隊がいなくなった:輪の近くまで来ているのに、目標のまわりに見えている敵がいない
  const garrisonGone =
    siege && group.some((u) => distance(u.pos, target) <= SIEGE_RING_M + 300) && threatNear(target, a.threats.filter((c) => c.currentLevel > 0), SIEGE_RING_M) === 0;
  const seenGarrison = a.threats.filter((c) => c.currentLevel > 0 && distance(c.pos, target) <= GARRISON_WITHIN_M && c.estimatedStrength !== undefined);
  const weak = seenGarrison.length > 0 && seenGarrison.reduce((t, c) => t + c.estimatedStrength!, 0) / seenGarrison.length < ALL_OUT_WEAK_GARRISON;
  // 勝利条件に欠かせない目標は、急ぎ度から見て時期が来ていれば遮二無二の突撃。それ以外は終わり間際か、守備隊が弱っているとき
  const allOut = (required(target.id) && a.urgent) || remaining <= ALL_OUT_LATE_TURNS || weak;
  return { mode: siege ? "siege" : "assault", objectiveId: target.id, target: { x: target.x, y: target.y }, slots, via, garrisonGone, barrageNow, requestBarrage, direct, allOut };
}

/**
 * 総攻撃に加わる部隊の、このターンの役割。
 * - storm:目標へ突入する(強襲が効いている・砲撃を待たない)
 * - press:突入して守備隊に取りついた(目標の阻止圏の近く)。集結点へ下がらずに撃ち合う
 *   (下がると、近づくまでに払った損害が無駄になり、守備隊は立ち直る)。遮二無二の突撃なら、その場で次の強襲に切り替える。
 *   持続できる攻勢なら、標準の姿勢のまま肉薄の距離まで詰める(砲撃の着弾を着弾範囲のすぐ外で待った部隊は、ここに入る)
 * - wait:砲撃の着弾中。着弾範囲の外で待ち、強襲に切り替える
 * - stage:集結点で待つ(標準の姿勢で)
 * - ring:包囲の位置につく(標準の姿勢で)
 */
export type AssaultRole = "storm" | "press" | "wait" | "stage" | "ring";

/** 目標からこの距離(阻止圏の半径に足す)以内まで突入した部隊は、取りついたとみなす */
const PRESS_MARGIN_M = 200;

export function assaultRole(u: OwnUnitView, plan: AssaultPlan, ctx: SimContext): AssaultRole {
  if (plan.mode === "siege") return plan.garrisonGone ? "storm" : "ring";
  if (plan.direct || assaulting(u, ctx)) return "storm";
  if (distance(u.pos, plan.target) <= ctx.rules.breakthrough.zoneRadiusM + PRESS_MARGIN_M) return "press";
  return plan.barrageNow ? "wait" : "stage";
}
