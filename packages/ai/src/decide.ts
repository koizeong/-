import {
  attackAspect,
  bearing,
  isNightTurn,
  mobilityOf,
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
import { assess, awayFrom, clampToMap, directRange, nearestThreat, threatNear, type Assessment } from "./assess.js";

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
  | { kind: "seize" | "hold"; objectiveId: string; dest: Vec2; score: number }
  | { kind: "engage"; contactId: string; dest: Vec2; score: number }
  /** 潰走中の敵を追い、退路の先に回り込む */
  | { kind: "pursue"; contactId: string; dest: Vec2; score: number }
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
/** 夜襲の対象にする敵の距離 */
const NIGHT_ATTACK_WITHIN_M = 2000;
/** 追撃:この距離以内に見えている潰走中の敵を追う */
const PURSUE_WITHIN_M = 2000;
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
  // 揺らぎはシード・ターン・陣営から決まる(同じ入力なら同じ決定)
  const rng = Rng.fromSeed(hash(`${seed}:${view.turn}:${view.side}`));
  const units = [...view.own].filter((u) => u.strength > 0 && !u.routed).sort((x, y) => (x.id < y.id ? -1 : 1));
  const planned: { order: UnitOrder; priority: number }[] = [];

  // 砲兵は別扱い
  for (const u of units.filter((x) => isArtillery(x, ctx))) {
    const o = artilleryOrder(u, a, ctx);
    if (o) planned.push({ order: o, priority: 1 });
  }

  // 部隊ごとの候補と判断のぶれ(乱数は部隊のID順・候補の順に先に引く。決める順番に結果が左右されないように)
  const pool = units
    .filter((u) => !isArtillery(u, ctx))
    .map((u) => ({
      u,
      options: candidates(u, a, view, ctx, config).map((action) => ({ action, jitter: 1 + config.noise * (2 * rng.next() - 1) })),
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
    const need = (a.objectiveNeed.get(action.objectiveId) ?? 1) + (action.kind === "seize" ? 1 : 0);
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
  const hq = isNightTurn(ctx.scenario, view.turn + 1) ? [] : [...fireMissions(view, a, ctx), ...airCommands(view, a, ctx)];
  return fitToCommandPoints(planned, hq, ctx.scenario.commandPoints[view.side]);
}

/**
 * 空襲と空輸(それぞれ1ターンに1回まで)。今の天候が航空を許すときだけ要請する
 * (天候はすぐには変わらないので、次のターンも飛べる見込みが高い)。
 */
function airCommands(view: SideView, a: Assessment, ctx: SimContext): HqCommand[] {
  if (!ctx.rules.weather.types[view.weather]?.airAllowed) return [];
  const out: HqCommand[] = [];
  const pending = (kind: string) => view.airMissions.some((m) => m.kind === kind);

  if (view.airSortiesLeft.airStrike > 0 && !pending("airStrike")) {
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

function candidates(u: OwnUnitView, a: Assessment, view: SideView, ctx: SimContext, config: AiConfig): Action[] {
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
      // 守る:敵が近いほど急ぐ
      out.push({ kind: "hold", objectiveId: o.id, dest: { x: o.x, y: o.y }, score: value * near(o) * (0.6 + danger) });
    } else {
      // 奪う:敵が多いほど、慎重なほど点が下がる
      const odds = ready / (ready + danger * (0.5 + config.caution));
      out.push({ kind: "seize", objectiveId: o.id, dest: { x: o.x, y: o.y }, score: value * near(o) * odds * 1.2 });
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
    out.push({ kind: "engage", contactId: c.contactId, dest, score: a.engageScale * near(c.pos) * (ready - est + 0.5) });
  }

  if (!night) out.push(...pursueAndEncircle(u, ready, a, view, ctx));

  // 弱っていれば、自陣営の集積所(なければ後方)へ下がって休む。慎重なほど早く。
  // 戦力は補充されないので、判断は主に回復できるもの(士気・制圧・弾薬)で行う
  const m = ctx.rules.morale;
  const shaken = u.morale < m.shakenBelow + 0.1 * config.caution;
  const spent = u.strength < 0.25 + 0.1 * config.caution;
  const dry = u.ammo < 0.1 && a.threats.length > 0;
  const pinned = u.suppression > 0.7 - 0.2 * config.caution;
  const exhausted = u.fatigue > 0.8 - 0.1 * config.caution;
  if (shaken || spent || dry || pinned || exhausted) {
    const dest = a.restPoint;
    const urgency = (shaken ? 1 : 0) + (spent ? 1 : 0) + (dry ? 1 : 0) + (pinned ? 0.5 : 0) + (exhausted ? 0.5 : 0);
    out.push({ kind: "withdraw", dest, score: 10 * urgency * (0.5 + config.caution) });
  }
  return out;
}


function toOrder(u: OwnUnitView, action: Action, a: Assessment, ctx: SimContext, night: boolean): UnitOrder | null {
  const nearestEnemy = nearestThreat(action.dest, a.threats);
  const enemyDir = nearestEnemy?.pos ?? a.enemyCentroid;
  const facing = bearing(action.dest, enemyDir);
  const enemyClose = a.threats.some((c) => distance(c.pos, u.pos) < COMBAT_MOVE_WITHIN_M || distance(c.pos, action.dest) < COMBAT_MOVE_WITHIN_M);

  const arrived = distance(u.pos, action.dest) <= ARRIVED_M;
  // 死守は連発すると全軍の士気の回復が遅くなるので、勝利条件に欠かせない目標を守っていて、
  // 敵が迫っているときだけ使う。それ以外の守備は標準
  const lastStandId = Object.entries(ctx.rules.stances).find(([, s]) => s.lastStand)?.[0];
  const victory = ctx.scenario.victory[a.side];
  const required = action.kind === "hold" && !!victory && (victory.decisive.required.includes(action.objectiveId) || victory.limited.required.includes(action.objectiveId));
  const threatened = action.kind === "hold" && a.threats.some((c) => distance(c.pos, action.dest) <= LAST_STAND_THREAT_M);
  // 一度死守したら、同じ目標を守っている間は解かない(敵が見えたり消えたりするたびに切り替えると、死守の重みが無駄にたまる)
  const alreadyHolding = u.stance === lastStandId || u.pendingStance === lastStandId;
  const lastStand = !!lastStandId && required && arrived && (threatened || alreadyHolding);
  const ambush = !lastStand && wantsAmbush(u, action, a, ctx, arrived);
  const stance =
    u.branch === "recon"
      ? "recon"
      : lastStand
        ? lastStandId
        : ambush
          ? ambush
          : action.kind === "engage" || action.kind === "seize" || action.kind === "pursue"
            ? "attack"
            : "standard";
  let usableStance = stance in ctx.rules.stances ? stance : ctx.rules.defaultStance;

  const order: UnitOrder = { unitId: u.id };
  // 夜は、目的地つきの命令を出さないと動かないので、同じ目的地でも出し直す
  const goingThere = !night && u.route.length > 0 && distance(u.route[u.route.length - 1]!, action.dest) <= ARRIVED_M;
  if (arrived) {
    if (u.route.length > 0) order.waypoints = [];
    if (u.formation === "column") order.deployAfterStop = true;
  } else if (!goingThere) {
    order.waypoints = [action.dest];
    order.facingOnArrival = facing;
    // 撤退は行軍(縦隊で速く)。敵が近い前進は展開したまま。
    // 夜は、夜襲だけが戦闘移動で、ほかは浸透移動(行軍)
    order.moveMode = night
      ? action.kind === "engage"
        ? "combat"
        : "march"
      : action.kind === "withdraw" || !enemyClose
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
    if (c.routed && d <= PURSUE_WITHIN_M) {
      const k = Math.max(d, 1);
      const dest = clampToMap({ x: c.pos.x + ((c.pos.x - u.pos.x) / k) * PURSUE_BEYOND_M, y: c.pos.y + ((c.pos.y - u.pos.y) / k) * PURSUE_BEYOND_M }, ctx);
      out.push({ kind: "pursue", contactId: c.contactId, dest, score: a.engageScale * near(c.pos) * ready * 2 });
    }
    if (d > ENCIRCLE_WITHIN_M) continue;
    // 囲むのは、その場に展開して踏みとどまっている弱った敵だけ(下がっている敵・潰走中の敵は動き続けて囲めず、
    // 目標から部隊を引きはがすだけになる。潰走中の敵は追撃で扱う)
    const weak = c.estimatedStrength !== undefined && c.estimatedStrength < 0.5;
    if (!weak || c.routed || c.formation !== "deployed") continue;
    // 囲むには3部隊以上が要る(4か所のうち3か所がふさがれば、残りは阻止圏と地形でふさがりやすい)
    const helpers = view.own.filter((f) => !f.routed && f.strength > 0 && !isArtillery(f, ctx) && distance(f.pos, c.pos) <= ENCIRCLE_WITHIN_M).length;
    if (helpers < ENCIRCLE_MIN_UNITS) continue;
    const bonus = 2.5;
    // 4か所は、敵から見て自陣営の方向(正面)を基準に、正面・右・背後・左
    const base = bearing(c.pos, a.rear);
    for (let k = 0; k < 4; k++) {
      const rad = ((base + 90 * k) * Math.PI) / 180;
      const slot = { x: c.pos.x + Math.sin(rad) * ENCIRCLE_RING_M, y: c.pos.y + Math.cos(rad) * ENCIRCLE_RING_M };
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
function artilleryOrder(u: OwnUnitView, a: Assessment, ctx: SimContext): UnitOrder | null {
  const range = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
  const inRange = a.threats.some((c) => distance(c.pos, u.pos) <= range);
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
function fireMissions(view: SideView, a: Assessment, ctx: SimContext): HqCommand[] {
  const cmds: HqCommand[] = [];
  const safety = ctx.rules.combat.indirectImpactRadiusM + 800;
  const taken = new Set<string>();
  for (const u of [...view.own].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (u.strength <= 0 || u.routed || !isArtillery(u, ctx)) continue;
    if (view.fireMissions.some((m) => m.unitId === u.id)) continue;
    const range = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
    let target: { pos: Vec2; value: number; id: string } | null = null;
    for (const c of a.threats) {
      if (taken.has(c.contactId) || distance(c.pos, u.pos) > range) continue;
      if (view.own.some((f) => distance(f.pos, c.pos) < safety)) continue;
      // 価値:推定規模 × 自陣営の目標への近さ × 情報の新しさ
      const nearObjective = Math.max(0, ...ctx.scenario.objectives.map((o) => 1 / (1 + distance(o, c.pos) / 3000)));
      const fresh = c.currentLevel > 0 ? 1 : 0.5;
      const value = (c.estimatedStrength ?? 0.7) * (0.5 + nearObjective) * fresh;
      if (!target || value > target.value) target = { pos: c.pos, value, id: c.contactId };
    }
    if (target) {
      taken.add(target.id);
      cmds.push({ side: view.side, type: "fireMission", unitId: u.id, target: { ...target.pos } });
    }
  }
  return cmds;
}
