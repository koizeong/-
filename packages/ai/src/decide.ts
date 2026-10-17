import {
  attackAspect,
  isStanceSpent,
  bearing,
  isNightTurn,
  mobilityOf,
  navalInRange,
  Rng,
  terrainSpeed,
  distance,
  toeIndirectMaxRange,
  usesFuel,
  type HqCommand,
  type OwnUnitView,
  type SideView,
  type SimContext,
  type Unit,
  type UnitOrder,
  type Vec2,
} from "@brigade/sim-core";
import { ASSAULT_STANCE, assaultRole, DANGER_CLOSE_MARGIN_M, planAssault, type AssaultPlan, type AssaultRole } from "./assault.js";
import { assess, awayFrom, clampToMap, directRange, nearestThreat, threatNear, type Assessment } from "./assess.js";
import { breakoutPoint, exposureFactor } from "./exposure.js";

/** AIの性格。難易度は判断の精度と慎重さで調整する(企画書12章) */
export interface AiConfig {
  /** 慎重さ(0〜1)。高いほど早めに下がり、敵の多い場所を避ける */
  caution: number;
  /** 判断のぶれ(0なら常に最善の点の行動を選ぶ)。点数に ±noise の揺らぎを加える */
  noise: number;
}

export const DEFAULT_AI: AiConfig = { caution: 0.5, noise: 0.15 };

export interface AiDecision {
  orders: UnitOrder[];
  hqCommands: HqCommand[];
}

type Action =
  /** enemyHeld:敵が押さえている目標(奪うには守備隊とぶつかる)。role:総攻撃に加わっているときの、このターンの役割 */
  | { kind: "seize" | "hold"; objectiveId: string; dest: Vec2; score: number; enemyHeld?: boolean; role?: AssaultRole; allOut?: boolean; via?: Vec2 }
  | { kind: "engage"; contactId: string; dest: Vec2; score: number }
  /** 潰走中の敵を追い、退路の先に回り込む */
  | { kind: "pursue"; contactId: string; dest: Vec2; score: number }
  /** 後手からの一撃:前進してきた敵へ、待っていた部隊が反撃に出る(姿勢は変えない) */
  | { kind: "counter"; contactId: string; dest: Vec2; score: number }
  /** 敵を囲む4か所のうちの1か所(slotId)へ回り込む。1か所に1部隊 */
  | { kind: "encircle"; contactId: string; slotId: string; dest: Vec2; score: number }
  | { kind: "withdraw"; dest: Vec2; score: number }
  | { kind: "support"; dest: Vec2; score: number };

/** 敵がこの距離以内にいれば、行軍(縦隊)ではなく戦闘移動で進む */
const COMBAT_MOVE_WITHIN_M = 3000;
/** 目的地にこの距離まで近ければ「着いている」とみなす */
const ARRIVED_M = 150;
/** 守っている目標からこの距離以内に敵が見えていれば「迫っている」とみなす(死守を使う条件) */
const LAST_STAND_THREAT_M = 2000;
/** 伏撃で待ち構える:この距離以内に敵が見えている(近づいてくる)とき */
const AMBUSH_WATCH_M = 4000;
/** 伏撃に入るのは、まだこの距離より近くに敵がいないとき(撃ち合いが始まってからでは遅い) */
const AMBUSH_TOO_CLOSE_M = 700;
/** 側面攻撃の対象にする敵の距離 */
const ENGAGE_WITHIN_M = 4000;
/** 制空権がこの割合を下回っていれば、制空任務を多めに出す */
const AIR_CONTEST_BELOW = 0.4;
/** 斥候は1ターンにこの回数まで */
const PATROLS_PER_TURN = 1;
/** 目標のこの距離以内に敵が見えていれば、斥候は出さない(もう分かっている) */
const PATROL_SEEN_NEAR_M = 1500;
/** 航空偵察をするのは、制空権がこの割合以上のとき */
const AIR_RECON_MIN_CONTROL = 0.4;
/** 空挺降下をするのは、制空権がこの割合以上のとき(輸送機が迎撃されにくい) */
const AIRBORNE_MIN_CONTROL = 0.5;
/** 空挺降下の降下先は、この距離以内に敵が見えていない目標 */
const AIRBORNE_CLEAR_M = 2000;
/** 近接航空支援を要請するのは、制空権がこの割合以上のとき(迎撃されにくく、効果が出る) */
const CAS_MIN_CONTROL = 0.35;
/** 夜襲の対象にする敵の距離 */
const NIGHT_ATTACK_WITHIN_M = 2000;
/** 後手からの一撃:この距離以内に、前進してきた敵が見えていれば反撃に出る */
const COUNTER_WITHIN_M = 3000;
/** 予備:守っている目標からこの距離以内に敵が見えていなければ、予備の姿勢で休ませる */
const RESERVE_CLEAR_M = 3000;
/** 準備砲撃からの突撃:自軍の砲撃が着弾するターンに、この距離以内の部隊が目標へ詰める */
const ASSAULT_WITHIN_M = 4000;
/** 強襲に切り替える敵との距離(m)。切替のターンに詰め、次のターンに触れる距離 */
const ASSAULT_CONTACT_M = 3000;
/** 準備砲撃からの突撃:目標からこの距離まで詰める(着弾範囲の外で、直接射撃が届く距離) */
const ASSAULT_STANDOFF_M = 700;
/** 消耗抑制:この距離以内に敵が見えていれば、後方へ下がって距離を取る */
const PRESERVE_KEEP_AWAY_M = 2500;
/** 消耗抑制:勝利条件に欠かせない目標からこの距離以内にいる部隊は、守りについているとみなして下げない */
const PRESERVE_GUARD_M = 1500;
/** 追撃:この距離以内に見えている潰走中の敵を追う(勝利条件に敵の損耗があれば、意欲に応じて PURSUE_WITHIN_ATTRITION_M まで広げる) */
const PURSUE_WITHIN_M = 4000;
const PURSUE_WITHIN_ATTRITION_M = 6000;
/** 追撃:潰走中の敵の、この距離だけ先(退路側)へ回り込む */
const PURSUE_BEYOND_M = 800;
/** 包囲:この距離以内の敵を囲みに行く */
const ENCIRCLE_WITHIN_M = 5000;
/** 包囲:敵の周りのこの距離に4部隊を置く(阻止圏500mがつながり、包囲の判定が成り立つ距離) */
const ENCIRCLE_RING_M = 650;
/** 包囲:近くにこの数以上の味方(砲兵以外)がいるときだけ囲みに行く */
const ENCIRCLE_MIN_UNITS = 3;
/** 包囲:回り込み先からこの距離以内にほかの敵がいれば、そこへは行かない(敵中に入らない) */
const ENCIRCLE_SLOT_CLEAR_M = 1000;
/** 包囲:同じ敵を囲む部隊が1つ増えるごとに、残りの回り込み先の価値をこの割合だけ上げる */
const ENCIRCLE_SYNERGY = 0.6;
/**
 * 守備隊:自陣営の目標の中にいる部隊が、そこを守り続ける点の下限(目標の価値に掛ける。敵が近ければさらに上がる)。
 * これがないと、村を取ってもすぐ次の目標へ動いて空にし、敵に取り返される
 */
const GARRISON_HOLD = 1.5;
/** 消耗した部隊(動揺・戦力が尽きかけ)の、攻める候補の点の倍率(下がって立て直す方を選ばせる) */
const WORN_DOWN_FACTOR = 0.15;
/** 包囲されかけたときに下がる点の大きさ(全方位をふさがれて1。目標を守る点より大きくなるように) */
const BREAKOUT_SCORE = 40;

/** 文字列から32bitのシードを作る(FNV-1a) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 陣営のビューから、その陣営の命令と司令部コマンドを決める(効用ベース)。
 * 入力に敵の本当の位置は含まれない(視界のチートをしない)。同じ入力からは同じ出力になる。
 */
export function decide(view: SideView, ctx: SimContext, config: AiConfig = DEFAULT_AI, seed = 0): AiDecision {
  const a = assess(view, ctx);
  // 敵が押さえている目標への総攻撃の段取り(集結 → 準備砲撃 → 一斉に突入)
  const plan = view.phase === "night" ? null : planAssault(view, a, ctx, seed);
  // 揺らぎはシード・ターン・陣営から決まる(同じ入力なら同じ決定)
  const rng = Rng.fromSeed(hash(`${seed}:${view.turn}:${view.side}`));
  const units = [...view.own].filter((u) => u.strength > 0 && !u.routed).sort((x, y) => (x.id < y.id ? -1 : 1));
  const planned: { order: UnitOrder; priority: number }[] = [];

  // 砲兵は別扱い
  for (const u of units.filter((x) => isArtillery(x, ctx))) {
    const o = artilleryOrder(u, a, view, ctx);
    if (o) planned.push({ order: o, priority: 1 });
  }

  // 部隊ごとの候補と判断のぶれ(乱数は部隊のID順・候補の順に先に引く。決める順番に結果が左右されないように)
  // 勝利条件に消耗抑制があれば、意欲に応じて慎重になる(早めに下がる・敵の多い場所を避ける)
  const cautious: AiConfig = { ...config, caution: config.caution + (1 - config.caution) * a.preserveDrive };
  const pool = units
    .filter((u) => !isArtillery(u, ctx))
    .map((u) => ({
      u,
      options: candidates(u, a, view, ctx, cautious, plan).map((action) => ({ action, jitter: 1 + config.noise * (2 * rng.next() - 1) })),
    }));

  // 全部隊・全候補の中から、点の高い組み合わせを順に決める。
  // 同じ目標への割り当ては、必要な部隊数までは少しずつ、超えたら大きく割り引く
  const assigned = new Map<string, number>();
  const adjusted = (action: Action, jitter: number) => {
    // 包囲の回り込み先は1か所に1部隊(2部隊目以降は行かない)。
    // 包囲は1部隊では成り立たないので、同じ敵を囲む部隊がすでにいるほど、残りの回り込み先の価値が上がる
    if (action.kind === "encircle") {
      if (assigned.has(action.slotId)) return 0;
      return action.score * jitter * (1 + ENCIRCLE_SYNERGY * (assigned.get(`ring:${action.contactId}`) ?? 0));
    }
    if (!("objectiveId" in action)) return action.score * jitter;
    const n = assigned.get(action.objectiveId) ?? 0;
    // 総攻撃の目標には、加わる部隊を全部送る(ばらばらに突っ込ませない)
    const need =
      action.kind === "seize" && action.role ? plan!.slots.size : (a.objectiveNeed.get(action.objectiveId) ?? 1) + (action.kind === "seize" ? 1 : 0);
    return action.score * jitter * (n < need ? 1 / (1 + 0.3 * n) : 0.15 / (1 + n));
  };
  while (pool.length > 0) {
    let pick: { i: number; action: Action; score: number } | null = null;
    pool.forEach((p, i) => {
      for (const { action, jitter } of p.options) {
        const s = adjusted(action, jitter);
        if (!pick || s > pick.score) pick = { i, action, score: s };
      }
    });
    if (!pick) break;
    const { i, action } = pick as { i: number; action: Action; score: number };
    const u = pool[i]!.u;
    pool.splice(i, 1);
    if ("objectiveId" in action) assigned.set(action.objectiveId, (assigned.get(action.objectiveId) ?? 0) + 1);
    if (action.kind === "encircle") {
      assigned.set(action.slotId, 1);
      assigned.set(`ring:${action.contactId}`, (assigned.get(`ring:${action.contactId}`) ?? 0) + 1);
    }
    // 夜:夜間行動は成否にかかわらず士気を大きく削るので、夜襲と、敵のいない目標の確保にだけ使う。
    // ほかのユニットは命令を出さずに休ませる(夜は夜間行動命令を出したユニットしか動かない)
    if (view.phase === "night" && !(action.kind === "engage" || (action.kind === "seize" && u.morale >= 0.7))) continue;
    const o = toOrder(u, action, a, ctx, view.phase === "night");
    if (o) planned.push({ order: o, priority: priorityOf(o, action) });
  }
  // 候補のない部隊(pool に残らない)は命令を出さない

  // 次のターンが夜なら、砲撃も航空も要請しない(夜は使えない)
  // 総攻撃の準備砲撃を先に置く(指揮ポイントが足りないときに落とさない)
  const hq = [
    ...(isNightTurn(ctx.scenario, view.turn + 1) ? [] : [...fireMissions(view, a, ctx, plan), ...navalCommands(view, a, ctx), ...airCommands(view, a, ctx)]),
    ...patrolCommands(view, a, ctx),
  ];
  return fitToCommandPoints(planned, hq, ctx.scenario.commandPoints[view.side]);
}

/**
 * 斥候(1ターンに PATROLS_PER_TURN 回まで。その日の残りの回数の範囲で)。敵が保持している目標で、今は見えていないものを、
 * 届く範囲にいるいちばん近い部隊(砲兵・潰走中を除く)から探る
 */
function patrolCommands(view: SideView, a: Assessment, ctx: SimContext): HqCommand[] {
  const pr = ctx.rules.patrol;
  const out: HqCommand[] = [];
  const used = new Set<string>();
  const limit = Math.min(PATROLS_PER_TURN, view.patrolsLeft ?? pr.perDay);
  const targets = ctx.scenario.objectives
    .filter((o) => {
      const h = view.objectives[o.id];
      return h !== undefined && h !== null && h !== view.side && !a.threats.some((c) => c.currentLevel > 0 && distance(c.pos, o) <= PATROL_SEEN_NEAR_M);
    })
    .sort((p, q) => (a.objectiveValue.get(q.id) ?? 0) - (a.objectiveValue.get(p.id) ?? 0) || (p.id < q.id ? -1 : 1));
  for (const o of targets) {
    if (out.length >= limit) break;
    const src = view.own
      .filter((u) => u.strength > 0 && !u.routed && !isArtillery(u, ctx) && !used.has(u.id) && distance(u.pos, o) <= pr.maxRangeM)
      .sort((p, q) => distance(p.pos, o) - distance(q.pos, o) || (p.id < q.id ? -1 : 1))[0];
    if (!src) continue;
    used.add(src.id);
    out.push({ side: view.side, type: "patrol", unitId: src.id, target: { x: o.x, y: o.y } });
  }
  return out;
}

/**
 * 艦砲射撃(1ターンに1回まで)。海から届く範囲で、見えている敵のうち推定規模が大きく、味方から離れたものを撃つ
 */
function navalCommands(view: SideView, a: Assessment, ctx: SimContext): HqCommand[] {
  if (!ctx.scenario.naval[view.side] || view.navalLeft - view.navalMissions.length <= 0) return [];
  const safety = ctx.rules.combat.indirectImpactRadiusM + (a.attritionDrive > 0 ? DANGER_CLOSE_MARGIN_M : 800);
  let target: { pos: Vec2; value: number } | null = null;
  for (const c of a.threats) {
    if (c.currentLevel === 0 || view.own.some((f) => distance(f.pos, c.pos) < safety) || !navalInRange(view.side, c.pos, ctx)) continue;
    const value = (c.estimatedStrength ?? 0.7) * (c.formation === "deployed" ? 1.2 : 1);
    if (!target || value > target.value) target = { pos: c.pos, value };
  }
  return target ? [{ side: view.side, type: "navalGunfire", target: { ...target.pos } }] : [];
}

/**
 * 空襲と空輸(それぞれ1ターンに1回まで)。今の天候が航空を許すときだけ要請する
 * (天候はすぐには変わらないので、次のターンも飛べる見込みが高い)。
 */
function airCommands(view: SideView, a: Assessment, ctx: SimContext): HqCommand[] {
  if (!ctx.rules.weather.types[view.weather]?.airAllowed) return [];
  const out: HqCommand[] = [];
  const pending = (kind: string) => view.airMissions.some((m) => m.kind === kind);
  const cfg = ctx.scenario.air[view.side];

  // 制空任務:飛べる天候なら毎ターン出す。制空権で劣っていて余裕があれば2回
  const pendingFighters = view.airMissions.filter((m) => m.kind === "airSuperiority").length;
  const fighters = Math.min(view.airSortiesLeft.airSuperiority - pendingFighters, view.airControl < AIR_CONTEST_BELOW ? 2 : 1);
  for (let i = 0; cfg?.fighters && i < fighters; i++) out.push({ side: view.side, type: "airSuperiority" });

  // 近接航空支援:制空権がある程度あれば、近くにいちばん多くの敵が見えている味方のために要請する(このターンのうちに飛来)。
  // 交戦中の味方がいるターンは、計画的な空襲より優先する
  const strikeLeft = view.airSortiesLeft.airStrike - view.airMissions.filter((m) => m.kind === "airStrike").length;
  let supported: { id: string; threat: number } | null = null;
  if (cfg?.strike && view.phase === "day" && strikeLeft > 0 && view.airControl >= CAS_MIN_CONTROL) {
    for (const u of [...view.own].sort((x, y) => (x.id < y.id ? -1 : 1))) {
      if (u.strength <= 0 || u.routed) continue;
      const threat = threatNear(u.pos, a.threats.filter((c) => c.currentLevel > 0), ctx.rules.air.closeSupport.radiusM);
      if (threat > 0 && (!supported || threat > supported.threat)) supported = { id: u.id, threat };
    }
    if (supported) out.push({ side: view.side, type: "closeAirSupport", unitId: supported.id });
  }

  // 航空偵察:制空権がある程度あれば、敵がいそうなのに今は見えていない場所を撮影する
  // (敵が保持している目標のうち価値の高いもの。なければ敵の重心のあたり)
  if (cfg?.recon && view.airControl >= AIR_RECON_MIN_CONTROL && view.airSortiesLeft.airRecon - view.airMissions.filter((m) => m.kind === "airRecon").length > 0) {
    const r = ctx.rules.air.recon.radiusM;
    const unseen = (p: Vec2) => !a.threats.some((c) => c.currentLevel > 0 && distance(c.pos, p) <= r * 0.5);
    const held = ctx.scenario.objectives
      .filter((o) => { const h = view.objectives[o.id]; return h !== undefined && h !== null && h !== view.side && unseen(o); })
      .sort((p, q) => (a.objectiveValue.get(q.id) ?? 0) - (a.objectiveValue.get(p.id) ?? 0) || (p.id < q.id ? -1 : 1))[0];
    const spot = held ? { x: held.x, y: held.y } : unseen(a.enemyCentroid) ? a.enemyCentroid : null;
    if (spot) out.push({ side: view.side, type: "airRecon", target: { ...spot } });
  }

  // 空挺降下:制空権がある程度あれば、待機中の空挺部隊を、近くに敵が見えていない目標
  // (自陣営がまだ持っていないもののうち、価値のいちばん高いもの)へ降ろす
  if (view.airControl >= AIRBORNE_MIN_CONTROL) {
    const scheduled = new Set(view.airMissions.filter((m) => m.kind === "airborneDrop").map((m) => m.unitId));
    const taken = new Set<string>();
    for (const id of view.airborneReady.filter((x) => !scheduled.has(x)).sort()) {
      const def = ctx.scenario.airborne.find((x) => x.id === id);
      if (!def || view.turn + 1 < def.availableFromTurn) continue;
      const target = ctx.scenario.objectives
        .filter((o) => view.objectives[o.id] !== view.side && !taken.has(o.id) && !a.threats.some((c) => distance(c.pos, o) <= AIRBORNE_CLEAR_M))
        .sort((p, q) => (a.objectiveValue.get(q.id) ?? 0) - (a.objectiveValue.get(p.id) ?? 0) || (p.id < q.id ? -1 : 1))[0];
      if (!target) continue;
      taken.add(target.id);
      out.push({ side: view.side, type: "airborneDrop", unitId: id, target: { x: target.x, y: target.y } });
    }
  }

  if (!supported && view.airSortiesLeft.airStrike > 0 && !pending("airStrike")) {
    const safety = ctx.rules.air.strikeRadiusM + 800;
    let target: { pos: Vec2; value: number } | null = null;
    for (const c of a.threats) {
      if (c.currentLevel === 0 || view.own.some((f) => distance(f.pos, c.pos) < safety)) continue;
      // 装甲目標を重く見る(空襲は装甲にも効く)
      const armored = c.branch === "armor" || c.branch === "tank_destroyer" ? 1.5 : 1;
      const value = (c.estimatedStrength ?? 0.7) * armored;
      if (!target || value > target.value) target = { pos: c.pos, value };
    }
    if (target) out.push({ side: view.side, type: "airStrike", target: { ...target.pos } });
  }

  if (view.airSortiesLeft.airDrop > 0 && !pending("airDrop")) {
    const radius = ctx.rules.air.dropRadiusM;
    const needy = view.own
      .filter((u) => u.strength > 0 && !u.supplied && (u.ammo < 0.4 || (usesFuel(u as Unit, ctx) && u.fuel < 0.4)))
      .filter((u) => !a.threats.some((c) => distance(c.pos, u.pos) < radius))
      .sort((x, y) => x.ammo + x.fuel - (y.ammo + y.fuel) || (x.id < y.id ? -1 : 1))[0];
    if (needy) out.push({ side: view.side, type: "airDrop", target: { ...needy.pos } });
  }
  return out;
}

/** 命令の優先度。撤退が最優先、移動を伴う命令が次、姿勢や条件付き命令だけの変更は後回し */
function priorityOf(o: UnitOrder, action: Action): number {
  if (action.kind === "withdraw") return 1000 + action.score;
  return o.waypoints !== undefined ? 10 + action.score : action.score * 0.5;
}

/**
 * 指揮ポイントの上限に収める。砲撃要請にはポイントの1/4(最低1)までを回し、
 * 残りを優先度の高い命令から使う。余れば砲撃要請に回す。
 */
function fitToCommandPoints(
  planned: { order: UnitOrder; priority: number }[],
  hq: HqCommand[],
  points: number | undefined,
): AiDecision {
  if (points === undefined) return { orders: planned.map((p) => p.order), hqCommands: hq };
  const hqReserve = Math.min(hq.length, Math.max(1, Math.floor(points / 4)));
  const orders = [...planned]
    .sort((x, y) => y.priority - x.priority || (x.order.unitId < y.order.unitId ? -1 : 1))
    .slice(0, Math.max(0, points - hqReserve))
    .map((p) => p.order);
  return { orders, hqCommands: hq.slice(0, Math.max(0, points - orders.length)) };
}

function isArtillery(u: OwnUnitView, ctx: SimContext): boolean {
  return toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons) > 0;
}

/** 戦える状態か(0〜1) */
function readiness(u: OwnUnitView, ctx: SimContext): number {
  const fuel = usesFuel(u as Unit, ctx) && u.fuel < 0.1 ? 0.2 : 1;
  const ammo = u.ammo < 0.1 ? 0.3 : 1;
  return u.strength * u.morale * (1 - 0.5 * u.suppression) * (1 - 0.5 * u.fatigue) * fuel * ammo;
}

function candidates(u: OwnUnitView, a: Assessment, view: SideView, ctx: SimContext, config: AiConfig, plan: AssaultPlan | null): Action[] {
  const victory = ctx.scenario.victory[view.side];
  const requiredByMe = (id: string) => !!victory && (victory.decisive.required.includes(id) || victory.limited.required.includes(id));
  const out: Action[] = [];
  const ready = readiness(u, ctx);
  const dist = (p: Vec2) => distance(u.pos, p);
  // 遠いほど価値が下がる(10kmで半分)
  const near = (p: Vec2) => 1 / (1 + dist(p) / 10000);

  const night = view.phase === "night";
  for (const o of ctx.scenario.objectives) {
    const value = a.objectiveValue.get(o.id) ?? 0;
    const holder = view.objectives[o.id];
    const danger = threatNear(o, a.threats, 2500);
    // 夜は、敵のいる目標を取りに行かない(取りに行くなら浸透移動で、敵のいない目標だけ)
    if (night && holder !== view.side && danger > 0) continue;
    if (holder === view.side) {
      // 守る:敵が近いほど急ぐ。すでに中にいる部隊は、空にすると取り返されるので、守り続ける方を重く見る
      const inside = dist(o) <= o.radiusM;
      // 守る位置:すでに目標の範囲の中にいれば、その場で陣地を築く(中心へ向かい続けると、町に入り込んだ敵の前で
      // 陣地のないまま撃たれ続ける)。外にいれば、範囲の縁まで入る
      const holdAt = inside ? { ...u.pos } : toward(o, u.pos, o.radiusM * 0.8, ctx);
      out.push({ kind: "hold", objectiveId: o.id, dest: holdAt, score: value * near(o) * ((inside ? GARRISON_HOLD : 0.6) + danger) });
    } else {
      // 奪う:敵が多いほど、慎重なほど点が下がる
      const odds = ready / (ready + danger * (0.5 + config.caution));
      // 消耗を抑えたい陣営は、勝利条件に欠かせない目標でなければ奪いに出ていかない(意欲に応じて価値を下げる)
      const restraint = requiredByMe(o.id) ? 1 : (1 - a.preserveDrive) ** 2;
      // 敵の損耗を狙う陣営は、自軍の砲撃がこのターンに着弾する目標へは、着弾範囲の外まで詰めて待つ(味方の砲撃に入らない)
      const barraged = a.attritionDrive > 0 && view.fireMissions.some((m) => m.turn === view.turn && distance(m.target, o) <= ctx.rules.combat.indirectImpactRadiusM);
      const dest = barraged ? standoff(u.pos, o, ctx) : { x: o.x, y: o.y };
      const enemyHeld = !!holder && holder !== view.side;
      // 持続できる攻勢:動揺した部隊は攻めるのをやめて下がり、立て直す(押し続けるのは遮二無二の突撃のときだけ)。
      // 押し続けると、崩れるまで撃たれて損害が膨らむ
      const shaken = u.morale < ctx.rules.morale.shakenBelow;
      if (shaken && enemyHeld && !(plan && plan.objectiveId === o.id && plan.allOut) && !requiredByMe(o.id)) continue;
      if (plan && plan.objectiveId === o.id && plan.slots.has(u.id)) {
        if (shaken && !plan.allOut) continue;
        // 総攻撃:集結点で待つ → 砲撃の着弾中は着弾範囲の外で待つ → 強襲が効いているターンに突入
        // 点は上げる(集結の途中で別の目標に気が移らないように)。勝ち目の見積もり(odds)は集結した全体で戦うので使わない
        const role = assaultRole(u, plan, ctx);
        // 取りついた部隊:遮二無二の突撃ならその場で強襲に切り替え、持続できる攻勢なら標準の姿勢のまま詰める
        const at =
          role === "storm" || (role === "press" && !plan.allOut)
            ? { x: o.x, y: o.y }
            : role === "press"
              ? { ...u.pos }
              : role === "wait"
                ? standoff(u.pos, o, ctx)
                : plan.slots.get(u.id)!;
        const via = role === "ring" ? plan.via.get(u.id) : undefined;
        out.push({ kind: "seize", objectiveId: o.id, dest: at, score: value * near(o) * 1.5 * restraint, enemyHeld, role, allOut: plan.allOut, ...(via ? { via } : {}) });
        continue;
      }
      out.push({ kind: "seize", objectiveId: o.id, dest, score: value * near(o) * odds * 1.2 * restraint, enemyHeld });
    }
  }

  // 近くに見えている敵を側面から攻める(自分より弱そうなとき)。敵陣の奥へは行かない
  for (const c of a.threats) {
    if (c.currentLevel === 0 || dist(c.pos) > (night ? NIGHT_ATTACK_WITHIN_M : ENGAGE_WITHIN_M)) continue;
    const est = c.estimatedStrength ?? 0.7;
    // 夜襲は、近くにいる、はっきり弱い敵にだけ仕掛ける
    if (est > ready * (night ? 0.6 : 1.2 - config.caution * 0.6)) continue;
    const standoff = night ? 300 : Math.min(directRange(u.toe, ctx) * 0.6, 800);
    const at = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return clampToMap({ x: c.pos.x + Math.sin(rad) * standoff, y: c.pos.y + Math.cos(rad) * standoff }, ctx);
    };
    // 向きが分かっていれば、左右の側面のうち自分に近い方へ回り込む(同じ距離なら自陣営の後方に近い方。
    // 敵と同じ地点にいるときに左右を固定で選ぶと、鏡写しの状況で左右が入れ替わるため)。分からなければ正対する
    const dest =
      c.facing === undefined
        ? at(bearing(c.pos, u.pos))
        : [at(c.facing + 90), at(c.facing - 90)].sort((p, q) => dist(p) - dist(q) || distance(p, a.rear) - distance(q, a.rear))[0]!;
    // 勝利条件に敵の損耗があれば、側面攻撃も積極的に
    out.push({ kind: "engage", contactId: c.contactId, dest, score: a.engageScale * near(c.pos) * (ready - est + 0.5) * (1 + a.attritionDrive) * (1 - a.preserveDrive) });
  }

  if (!night) out.push(...pursueAndEncircle(u, ready, a, view, ctx), ...assaultAfterBarrage(u, ready, a, view, ctx), ...counterattack(u, ready, a, ctx));

  // 弱っていれば、自陣営の集積所(なければ後方)へ下がって休む。慎重なほど早く。
  // 戦力は補充されないので、判断は主に回復できるもの(士気・制圧・弾薬)で行う
  const m = ctx.rules.morale;
  const shaken = u.morale < m.shakenBelow + 0.1 * config.caution;
  const spent = u.strength < 0.25 + 0.1 * config.caution;
  const dry = u.ammo < 0.1 && a.threats.length > 0;
  const pinned = u.suppression > 0.7 - 0.2 * config.caution;
  const exhausted = u.fatigue > 0.8 - 0.1 * config.caution;
  // 消耗を抑えたい陣営は、近くに敵がいれば後方へ下がって距離を取る。
  // ただし勝利条件に欠かせない目標を守っている部隊は下がらない(目標を明け渡すと勝てないため)
  const guarding = ctx.scenario.objectives.some((o) => requiredByMe(o.id) && distance(u.pos, o) <= PRESERVE_GUARD_M);
  if (a.preserveDrive > 0 && !guarding && threatNear(u.pos, a.threats, PRESERVE_KEEP_AWAY_M) > 0) {
    out.push({ kind: "withdraw", dest: a.restPoint, score: 10 * a.preserveDrive });
  }
  // 消耗した部隊(動揺・戦力が尽きかけ)は、攻める点を大きく下げ、下がって立て直す方を選ばせる。
  // 消耗した大隊を攻撃に戻し続けると、崩れるまで撃たれて全滅する。押し続けるのは遮二無二の突撃のときだけ。
  // 守り(陣地に入っている部隊)は下げない(持ち場を空けると、そこから崩れる)
  if (shaken || spent) {
    for (const x of out) {
      if (x.kind === "withdraw" || x.kind === "hold" || (x.kind === "seize" && x.allOut)) continue;
      x.score *= WORN_DOWN_FACTOR;
    }
  }
  if (shaken || spent || dry || pinned || exhausted) {
    const dest = a.restPoint;
    const urgency = (shaken ? 1 : 0) + (spent ? 1 : 0) + (dry ? 1 : 0) + (pinned ? 0.5 : 0) + (exhausted ? 0.5 : 0);
    out.push({ kind: "withdraw", dest, score: 10 * urgency * (0.5 + config.caution) });
  }

  // 突出を避ける:行き先のまわりに味方より敵が多い攻めの行動は、点を下げる(1部隊だけで敵中へ出ていって囲まれないように)。
  // 総攻撃の段取り(集結・包囲の輪・突入)は、まとまって動くので下げない
  for (const x of out) {
    if (x.kind === "hold" || x.kind === "withdraw" || x.kind === "support" || (x.kind === "seize" && x.role)) continue;
    x.score *= exposureFactor(u, x.dest, view.own, a.threats, ctx);
  }
  // 包囲されかけ:抜けられる方向が少なくなったら、空いている方向から後方へ下がる。
  // 勝利条件に欠かせない目標の中で守っている部隊は下がらない(籠城する)
  const garrison = ctx.scenario.objectives.some((o) => requiredByMe(o.id) && distance(u.pos, o) <= o.radiusM);
  const breakout = night || garrison ? null : breakoutPoint(u, a.threats, a.rear, ctx);
  if (breakout) out.push({ kind: "withdraw", dest: breakout.dest, score: BREAKOUT_SCORE * breakout.closed * (0.5 + config.caution) });
  return out;
}


function toOrder(u: OwnUnitView, action: Action, a: Assessment, ctx: SimContext, night: boolean): UnitOrder | null {
  const nearestEnemy = nearestThreat(action.dest, a.threats);
  const enemyDir = nearestEnemy?.pos ?? a.enemyCentroid;
  const facing = bearing(action.dest, enemyDir);
  // 撃たれている(制圧を受けている)部隊は、敵が見えていなくても敵の近くにいる(町の中・霧の中)。縦隊で動くと撃ち返せず損害が大きい
  const enemyClose =
    u.suppression > 0.05 || a.threats.some((c) => distance(c.pos, u.pos) < COMBAT_MOVE_WITHIN_M || distance(c.pos, action.dest) < COMBAT_MOVE_WITHIN_M);

  const arrived = distance(u.pos, action.dest) <= ARRIVED_M;
  // 死守は連発すると全軍の士気の回復が遅くなるので、勝利条件に欠かせない目標を守っていて、
  // 敵が迫っているときだけ使う。それ以外の守備は標準
  const lastStandId = Object.entries(ctx.rules.stances).find(([, s]) => s.lastStand)?.[0];
  const victory = ctx.scenario.victory[a.side];
  const required = action.kind === "hold" && !!victory && (victory.decisive.required.includes(action.objectiveId) || victory.limited.required.includes(action.objectiveId));
  const threatened = action.kind === "hold" && a.threats.some((c) => distance(c.pos, action.dest) <= LAST_STAND_THREAT_M);
  // 一度死守したら、同じ目標を守っている間は解かない(敵が見えたり消えたりするたびに切り替えると、死守の重みが無駄にたまる)
  const alreadyHolding = u.stance === lastStandId || u.pendingStance === lastStandId;
  // 消耗を抑えたい陣営は死守しない(崩れると戦力を大きく失うため)
  const lastStand = !!lastStandId && a.preserveDrive === 0 && required && arrived && (threatened || alreadyHolding);
  const ambush = !lastStand && wantsAmbush(u, action, a, ctx, arrived);
  // 予備:後方の目標を守っていて近くに敵がいなければ、予備の姿勢で休ませ、反撃に備える
  const reserveId = Object.entries(ctx.rules.stances).find(([, s]) => s.counterattackMultiplier > 1)?.[0];
  const reserve =
    !lastStand && !ambush && !!reserveId && action.kind === "hold" && !a.threats.some((c) => distance(c.pos, action.dest) <= RESERVE_CLEAR_M) ? reserveId : null;
  const stance =
    lastStand
      ? lastStandId
      : ambush
        ? ambush
        : reserve
          ? reserve
          : action.kind === "counter"
            ? u.pendingStance ?? u.stance
            : (action.kind === "engage" || action.kind === "seize" || action.kind === "pursue") &&
              allOutWorth(action, a, ctx) &&
              assaultNow(
                u,
                // 総攻撃では、砲撃の着弾中(wait)と、守備隊に取りついた部隊(press)が切り替えて突入のターンに効かせる。集結中(stage)は切り替えない。
                // それ以外は、敵が近いか、撃ち合いに行く地点・敵が押さえている目標(見えない守備隊がいる)が近いとき
                action.kind === "seize" && action.role && action.role !== "storm"
                  ? action.role === "wait" || action.role === "press"
                  : a.threats.some((c) => distance(c.pos, u.pos) <= ASSAULT_CONTACT_M) ||
                      ((action.kind === "engage" || (action.kind === "seize" && !!action.enemyHeld)) && distance(action.dest, u.pos) <= ASSAULT_CONTACT_M),
                ctx,
              )
          ? ASSAULT_STANCE
          : "standard";
  let usableStance = stance in ctx.rules.stances ? stance : ctx.rules.defaultStance;

  const order: UnitOrder = { unitId: u.id };
  // 夜は、目的地つきの命令を出さないと動かないので、同じ目的地でも出し直す
  const goingThere = !night && u.route.length > 0 && distance(u.route[u.route.length - 1]!, action.dest) <= ARRIVED_M;
  if (arrived) {
    if (u.route.length > 0) order.waypoints = [];
    if (u.formation === "column") order.deployAfterStop = true;
  } else if (!goingThere) {
    // 包囲の位置へは、目標の近くを突っ切らないよう外回りを経由する
    order.waypoints = action.kind === "seize" && action.via ? [action.via, action.dest] : [action.dest];
    order.facingOnArrival = facing;
    // 敵が近ければ、前進も撤退も展開したまま(撃たれながら縦隊で下がると、接敵で止まって展開し直すのを繰り返し、撃ち返せずに損害が膨らむ)。
    // 夜は、夜襲だけが戦闘移動で、ほかは浸透移動(行軍)
    order.moveMode = night
      ? action.kind === "engage"
        ? "combat"
        : "march"
      : !enemyClose
        ? "march"
        : "combat";
    order.deployAfterStop = action.kind !== "withdraw";
  }
  // 動かない姿勢(死守・伏撃)のまま動かそうとしているなら、動ける姿勢に切り替える(切替中は標準扱いで動ける)
  if ((order.waypoints?.length ?? 0) > 0 && ctx.rules.stances[usableStance]!.immobile) usableStance = ctx.rules.defaultStance;
  if (usableStance !== u.stance && usableStance !== u.pendingStance) order.stance = usableStance;

  // 守備隊は、損害が大きくなったら下がる(死守は踏みとどまる)
  if (action.kind === "hold" && !lastStand && !u.conditional) {
    // 伏撃など動かない姿勢でも下がれるよう、姿勢も標準に戻す(切替中は標準扱いで動ける)
    order.conditional = {
      when: { type: "strengthBelow", threshold: 0.4 },
      then: { waypoints: [awayFrom(action.dest, enemyDir, 3000, ctx)], moveMode: "march", stance: ctx.rules.defaultStance },
    };
  }
  return Object.keys(order).length > 1 ? order : null;
}

/** 敵の推定戦力(見えている敵の平均)がこれ未満なら、弱っているとみなす */
const WEAK_ENEMY = 0.5;

/**
 * 遮二無二の突撃(強襲)に値するか。強襲は崩れるまでに多くの損害を払うので、払う価値のあるときだけ使い、
 * それ以外は標準の姿勢で持続できる攻勢をかける(崩れそうなら下がる)。
 * - 総攻撃の役割があれば、総攻撃の判断(残りのターンが少ない・守備隊が弱っている)に従う
 * - 追撃:潰走中の敵を叩く好機なので強襲。敵の損耗を狙う陣営も強襲を惜しまない
 * - それ以外の奪取:勝利条件に欠かせない目標で急ぎ度から見て時期が来ている、または行き先の近くの敵が弱っている
 * - 側面攻撃:行き先の近くの敵が弱っている
 */
function allOutWorth(action: Action, a: Assessment, ctx: SimContext): boolean {
  // 敵の損耗を狙う陣営は、損害を与えること自体が目的なので強襲を惜しまない
  if (action.kind === "pursue" || a.attritionDrive > 0) return true;
  if (action.kind === "seize" && action.role) return !!action.allOut;
  const near = a.threats.filter((c) => c.currentLevel > 0 && c.estimatedStrength !== undefined && distance(c.pos, action.dest) <= ASSAULT_STANDOFF_M + ctx.rules.breakthrough.zoneRadiusM);
  const weak = near.length > 0 && near.reduce((t, c) => t + c.estimatedStrength!, 0) / near.length < WEAK_ENEMY;
  // 勝利条件に欠かせない目標は、急ぎ度から見て時期が来ていれば
  if (action.kind === "seize" && a.urgent) {
    const victory = ctx.scenario.victory[a.side];
    if (victory && (victory.decisive.required.includes(action.objectiveId) || victory.limited.required.includes(action.objectiveId))) return true;
  }
  return weak;
}

/**
 * 強襲に切り替えるか。強襲は切替に1ターンかかり、効くのは effectTurns ターンだけなので、
 * 敵が近く(次のターンに触れそうな距離)なってから切り替える。
 * 切替中・効いている間はそのまま。息切れしたら標準に戻す(戻さないと、次の強襲に使えない)
 */
function assaultNow(u: OwnUnitView, contactNear: boolean, ctx: SimContext): boolean {
  if (!(ASSAULT_STANCE in ctx.rules.stances)) return false;
  if (u.pendingStance === ASSAULT_STANCE) return true;
  if (u.stance === ASSAULT_STANCE && u.pendingStance === null) return !isStanceSpent(u, ctx.rules);
  return contactNear;
}

/**
 * 追撃と包囲の候補(昼だけ)。
 * - 追撃:潰走中の敵(兵種まで見えていれば分かる)の退路の先へ回り込む。潰走中の敵は受ける損害が大きく、
 *   阻止圏も持たないので、追いつけば大きく削れる
 * - 包囲:その場に展開して踏みとどまっている弱った(推定戦力5割未満)敵を、周りの4か所から囲む。近くに味方が3部隊以上いるときだけ
 *   (1〜2部隊では囲めず、目標から部隊を引きはがすだけになる)。
 *   回り込み先が通れない地形・マップの外・ほかの敵の近くなら、そこへは行かない
 */
function pursueAndEncircle(u: OwnUnitView, ready: number, a: Assessment, view: SideView, ctx: SimContext): Action[] {
  const out: Action[] = [];
  const near = (p: Vec2) => 1 / (1 + distance(u.pos, p) / 10000);
  const mobility = mobilityOf(u as Unit, ctx);
  for (const c of a.threats) {
    if (c.currentLevel === 0 || c.destroyed) continue;
    const d = distance(u.pos, c.pos);
    // 勝利条件に敵の損耗があれば、意欲(attritionDrive)に応じて遠くまで、強く追う。
    // 消耗を抑えたいなら(preserveDrive)、追撃・包囲は控える
    const drive = a.attritionDrive;
    const restraint = 1 - a.preserveDrive;
    if (c.routed && d <= PURSUE_WITHIN_M + (PURSUE_WITHIN_ATTRITION_M - PURSUE_WITHIN_M) * drive) {
      const k = Math.max(d, 1);
      const dest = clampToMap({ x: c.pos.x + ((c.pos.x - u.pos.x) / k) * PURSUE_BEYOND_M, y: c.pos.y + ((c.pos.y - u.pos.y) / k) * PURSUE_BEYOND_M }, ctx);
      out.push({ kind: "pursue", contactId: c.contactId, dest, score: a.engageScale * near(c.pos) * ready * (2 + 2 * drive) * restraint });
    }
    if (d > ENCIRCLE_WITHIN_M) continue;
    // 囲むのは、その場に展開して踏みとどまっている弱った敵だけ(下がっている敵・潰走中の敵は動き続けて囲めず、
    // 目標から部隊を引きはがすだけになる。潰走中の敵は追撃で扱う)
    const weak = c.estimatedStrength !== undefined && c.estimatedStrength < 0.5;
    if (!weak || c.routed || c.formation !== "deployed") continue;
    // 囲むには3部隊以上が要る(4か所のうち3か所がふさがれば、残りは阻止圏と地形でふさがりやすい)
    const helpers = view.own.filter((f) => !f.routed && f.strength > 0 && !isArtillery(f, ctx) && distance(f.pos, c.pos) <= ENCIRCLE_WITHIN_M).length;
    if (helpers < ENCIRCLE_MIN_UNITS) continue;
    const bonus = 2.5 * (1 + drive) * restraint;
    // 4か所は、敵から見て自陣営の方向(正面)を基準に、正面・右・背後・左
    const base = bearing(c.pos, a.rear);
    for (let k = 0; k < 4; k++) {
      const rad = ((base + 90 * k) * Math.PI) / 180;
      // 正面幅が見えていれば、帯の横へ回る分だけ遠くに置く(帯の端から ENCIRCLE_RING_M)
      const half = (c.frontageM ?? 0) / 2;
      const across = c.facing === undefined ? 0 : Math.abs(Math.sin(rad - (c.facing * Math.PI) / 180));
      const ringM = ENCIRCLE_RING_M + half * across;
      const slot = { x: c.pos.x + Math.sin(rad) * ringM, y: c.pos.y + Math.cos(rad) * ringM };
      if (slot.x < 0 || slot.y < 0 || slot.x > ctx.terrain.widthM || slot.y > ctx.terrain.heightM) continue;
      if (terrainSpeed(ctx.terrain.terrainAt(slot), mobility, ctx) <= 0) continue;
      if (a.threats.some((o) => o !== c && distance(o.pos, slot) < ENCIRCLE_SLOT_CLEAR_M)) continue;
      // 同じ点の回り込み先が左右にあるときは、自陣営の後方に近い方を選ぶ(鏡写しの状況で左右を固定しないため)
      const tieBreak = 1 - distance(slot, a.rear) * 1e-9;
      out.push({ kind: "encircle", contactId: c.contactId, slotId: `${c.contactId}:${k}`, dest: slot, score: a.engageScale * near(slot) * ready * bonus * tieBreak });
    }
  }
  return out;
}

/**
 * 後手からの一撃。前のターンに動かなかった部隊が、前進してきた敵(前のターンに動いていた。兵種まで見えていれば分かる)
 * へ反撃に出る。反撃の好機には与える損害と突破の力が上がるので、自分より少し強そうな相手でも出る。
 * 消耗を抑えたい陣営は控える
 */
function counterattack(u: OwnUnitView, ready: number, a: Assessment, ctx: SimContext): Action[] {
  if (u.movedLastTurn || u.formation === "column" || ready < 0.5) return [];
  const out: Action[] = [];
  const near = (p: Vec2) => 1 / (1 + distance(u.pos, p) / 10000);
  const c = ctx.rules.counterattack;
  const edge = c.firepowerMultiplier * ctx.rules.stances[u.pendingStance ?? u.stance]!.counterattackMultiplier;
  for (const e of a.threats) {
    if (!e.movedLastTurn || e.currentLevel === 0 || e.routed || distance(u.pos, e.pos) > COUNTER_WITHIN_M) continue;
    const est = e.estimatedStrength ?? 0.7;
    if (est > ready * edge) continue;
    const dest = standoff(u.pos, e.pos, ctx);
    out.push({ kind: "counter", contactId: e.contactId, dest, score: a.engageScale * near(e.pos) * (ready * edge - est + 0.5) * 2 * (1 - a.preserveDrive) });
  }
  return out;
}

/** 目標 target から、自分の側へ ASSAULT_STANDOFF_M だけ手前の地点(着弾範囲の外で、直接射撃が届く距離) */
function standoff(from: Vec2, target: Vec2, ctx: SimContext): Vec2 {
  const d = Math.max(distance(from, target), 1);
  return clampToMap({ x: target.x + ((from.x - target.x) / d) * ASSAULT_STANDOFF_M, y: target.y + ((from.y - target.y) / d) * ASSAULT_STANDOFF_M }, ctx);
}

/**
 * 準備砲撃からの突撃(敵の損耗を狙う陣営だけ)。自軍の砲撃がこのターンに着弾する敵へ、着弾範囲の外
 * (ASSAULT_STANDOFF_M)まで強襲で詰める。砲撃で制圧されている間に距離を詰め、撃ち合いに入る。
 * 自分より強そうな相手でも詰める(陣取った守備隊を削るため)
 */
function assaultAfterBarrage(u: OwnUnitView, ready: number, a: Assessment, view: SideView, ctx: SimContext): Action[] {
  if (a.attritionDrive <= 0) return [];
  const out: Action[] = [];
  const near = (p: Vec2) => 1 / (1 + distance(u.pos, p) / 10000);
  const radius = ctx.rules.combat.indirectImpactRadiusM;
  for (const m of view.fireMissions.filter((x) => x.turn === view.turn)) {
    // 着弾地点にいる見えている敵。いなければ着弾地点そのもの(敵が保持している目標への探り撃ちなど)へ詰める
    const targets = a.threats.filter((c) => !c.destroyed && distance(c.pos, m.target) <= radius).map((c) => ({ id: c.contactId, pos: c.pos }));
    if (targets.length === 0) targets.push({ id: `barrage:${Math.round(m.target.x)},${Math.round(m.target.y)}`, pos: m.target });
    for (const c of targets) {
      if (distance(u.pos, c.pos) > ASSAULT_WITHIN_M) continue;
      const dest = standoff(u.pos, c.pos, ctx);
      out.push({ kind: "engage", contactId: c.id, dest, score: a.engageScale * near(c.pos) * ready * (1 + 2 * a.attritionDrive) });
    }
  }
  return out;
}

/**
 * 伏撃で待ち構えるか。伏撃の姿勢(撃つと露呈し、初撃が強い姿勢)の ID を返す。使わないなら null。
 * - 目標に陣取って守っていて(動かない)、展開している
 * - 敵が近づいてきている(AMBUSH_WATCH_M 以内に見えている)が、まだ撃ち合う距離ではない
 * - 見えている敵がすべて正面にいる(伏撃は側面・背後を突かれると脆い)
 * すでに伏撃に入っているなら、敵が近くても正面にいる限り解かない(切り替えには1ターンかかる)
 */
function wantsAmbush(u: OwnUnitView, action: Action, a: Assessment, ctx: SimContext, arrived: boolean): string | null {
  const id = Object.entries(ctx.rules.stances).find(([, s]) => s.revealOnFire && s.immobile && s.openingFireMultiplier > 1)?.[0];
  if (!id || action.kind !== "hold" || !arrived || u.formation === "column") return null;
  const watching = a.threats.filter((c) => distance(c.pos, u.pos) <= AMBUSH_WATCH_M);
  if (watching.length === 0) return null;
  const inAmbush = u.stance === id || u.pendingStance === id;
  if (!inAmbush && watching.some((c) => distance(c.pos, u.pos) < AMBUSH_TOO_CLOSE_M)) return null;
  const allInFront = watching.every((c) => attackAspect(u.pos, u.facing, c.pos, ctx.rules.facing) === "front");
  return allInFront ? id : null;
}

/**
 * 砲兵:前線から下がった位置に陣取る。撃てる目標があれば動かない。
 */
function artilleryOrder(u: OwnUnitView, a: Assessment, view: SideView, ctx: SimContext): UnitOrder | null {
  const range = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
  // 撃てる目標:見えている敵と、敵が押さえている目標(霧で敵が見えなくなるたびに陣地を変えると、撃てない時間ばかりになる)
  const enemyHeld = ctx.scenario.objectives.filter((o) => {
    const h = view.objectives[o.id];
    return h !== undefined && h !== null && h !== view.side;
  });
  const inRange = a.threats.some((c) => distance(c.pos, u.pos) <= range) || enemyHeld.some((o) => distance(o, u.pos) <= range);
  const tooClose = a.threats.some((c) => distance(c.pos, u.pos) < 3000);
  if (inRange && !tooClose) {
    if (u.route.length > 0) return { unitId: u.id, waypoints: [] };
    return u.formation === "column" ? { unitId: u.id, deployAfterStop: true } : null;
  }
  // 敵が近すぎれば下がり、遠すぎれば前へ(敵から射程の半分の距離へ)
  const dest = tooClose ? awayFrom(u.pos, a.enemyCentroid, 3000, ctx) : toward(a.enemyCentroid, a.rear, range * 0.5, ctx);
  if (u.route.length > 0 && distance(u.route[u.route.length - 1]!, dest) <= 500) return null;
  return { unitId: u.id, waypoints: [dest], moveMode: "march", deployAfterStop: true, facingOnArrival: bearing(dest, a.enemyCentroid) };
}

/** from から to の方向へ d メートル進んだ点 */
function toward(from: Vec2, to: Vec2, d: number, ctx: SimContext): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return clampToMap({ x: from.x + (dx / len) * Math.min(d, len), y: from.y + (dy / len) * Math.min(d, len) }, ctx);
}

/**
 * 砲撃要請:撃てる砲兵ごとに、射程内で最も価値の高い敵へ。
 * 着弾は次ターンなので、味方の近く(着弾半径 + 余裕)には撃たない(誤射を避ける)。
 */
function fireMissions(view: SideView, a: Assessment, ctx: SimContext, plan: AssaultPlan | null = null): HqCommand[] {
  const cmds: HqCommand[] = [];
  const busy = new Set(view.fireMissions.map((m) => m.unitId));
  // 総攻撃の準備砲撃:届く砲兵(展開済み・予約なし)をすべて目標へ
  if (plan?.requestBarrage) {
    for (const u of [...view.own].sort((x, y) => (x.id < y.id ? -1 : 1))) {
      if (u.strength <= 0 || u.routed || !isArtillery(u, ctx) || u.formation !== "deployed" || busy.has(u.id)) continue;
      if (distance(u.pos, plan.target) > toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons)) continue;
      busy.add(u.id);
      cmds.push({ side: view.side, type: "fireMission", unitId: u.id, target: { ...plan.target } });
    }
  }
  // 総攻撃の目標のまわりは、段取りに合わせて撃つ(突入する味方の上に落とさない)ので、ほかの理由では撃たない
  const nearPlan = (p: Vec2) => !!plan && distance(p, plan.target) <= ctx.rules.combat.indirectImpactRadiusM + ctx.rules.breakthrough.zoneRadiusM;
  // 味方の近くには撃たない。敵の損耗を狙う陣営は、着弾範囲のすぐ外の味方までは許す(危険を承知の近接支援。
  // 突撃する部隊は着弾範囲の外で止まり、阻止圏の縁より内へは入らないため)
  const safety = ctx.rules.combat.indirectImpactRadiusM + (a.attritionDrive > 0 ? DANGER_CLOSE_MARGIN_M : 800);
  // 敵の損耗を狙う陣営は、敵が保持している目標(保持者は公開)も、見えていなくても撃つ(敵がいるはずの場所への探り撃ち)
  const heldByEnemy =
    a.attritionDrive > 0
      ? ctx.scenario.objectives
          .filter((o) => { const h = view.objectives[o.id]; return h !== undefined && h !== null && h !== view.side; })
          .map((o) => ({ contactId: `objective:${o.id}`, pos: { x: o.x, y: o.y }, estimatedStrength: 0.7, currentLevel: 1, formation: "deployed" as const }))
      : [];
  const taken = new Set<string>();
  for (const u of [...view.own].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (u.strength <= 0 || u.routed || !isArtillery(u, ctx)) continue;
    if (busy.has(u.id)) continue;
    const range = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
    let target: { pos: Vec2; value: number; id: string } | null = null;
    for (const c of [...a.threats, ...heldByEnemy]) {
      if (taken.has(c.contactId) || distance(c.pos, u.pos) > range || nearPlan(c.pos)) continue;
      // 見えている敵と同じ場所の目標は二重に数えない
      if (c.contactId.startsWith("objective:") && a.threats.some((t) => distance(t.pos, c.pos) <= ctx.rules.combat.indirectImpactRadiusM)) continue;
      if (view.own.some((f) => distance(f.pos, c.pos) < safety)) continue;
      // 価値:推定規模 × 自陣営の目標への近さ × 情報の新しさ
      const nearObjective = Math.max(0, ...ctx.scenario.objectives.map((o) => 1 / (1 + distance(o, c.pos) / 3000)));
      const fresh = c.currentLevel > 0 ? 1 : 0.5;
      // 敵の損耗を狙う陣営は、その場に陣取った敵で、砲撃の後に味方が攻め込めるもの(機動部隊が近くにいる)を優先する
      const dug = c.formation === "deployed" ? 1 : 0;
      const supported = view.own.some((f) => !isArtillery(f, ctx) && !f.routed && f.strength > 0 && distance(f.pos, c.pos) <= ASSAULT_WITHIN_M) ? 1 : 0;
      const preparation = 1 + a.attritionDrive * (dug + supported);
      const value = (c.estimatedStrength ?? 0.7) * (0.5 + nearObjective) * fresh * preparation;
      if (!target || value > target.value) target = { pos: c.pos, value, id: c.contactId };
    }
    if (target) {
      taken.add(target.id);
      cmds.push({ side: view.side, type: "fireMission", unitId: u.id, target: { ...target.pos } });
    }
  }
  return cmds;
}
