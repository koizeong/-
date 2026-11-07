import { flagshipOf, type Unit } from "@brigade/sim-core";
import { bearing, distance, terrainSpeed, type SideView, type SimContext, type UnitOrder, type Vec2 } from "@brigade/sim-core";

/**
 * 海戦の AI:艦艇の戦隊と航空隊の命令。陸の部隊とは別に決める(陸の判断には渡さない)。
 * - 空母:輪形陣で、敵の水上部隊が近ければ離れる
 * - 水上の戦隊:単縦陣で、知っている敵の艦艇を追う。弱れば退く。敵が見えなければ、取っていない目標へ向かう
 * - 戦闘機:空母ごとに1隊は上空直衛、残りは攻撃隊の護衛
 * - 攻撃機:行動半径の内の、見えている敵の艦艇(なければ部隊)を攻撃
 * - 索敵機:敵の艦艇が見えていなければ、敵のいそうな方へ索敵
 */

/** 空母が離れ始める、敵の水上部隊との距離(m) */
export const CARRIER_STANDOFF_M = 35000;
/** 空母のいる側の水上の戦隊が、空母から離れて敵の艦艇を追う距離の上限(m)。これより遠い敵は追わず、空母の護衛につく */
const ESCORT_ENGAGE_M = 50000;
/** 護衛が空母から離れすぎたとみなす距離(m) */
const ESCORT_STATION_M = 12000;
/** 水上の戦隊が退く戦力 */
const RETIRE_BELOW = 0.35;
/** 退くときに下がる距離(m) */
const RETIRE_STEP_M = 15000;
/** 総ターンのこの割合を過ぎたら、空母を見つけていなくても見えている艦を攻撃隊で叩く */
const LATE_SHARE = 0.75;
/** 索敵機どうしの扇の間隔(度。前に見た艦艇の辺りを探し直すとき)と、何も知らないときに索敵機を広げる扇の広さ(度) */
const SCOUT_SPREAD_DEG = 25;
const SEARCH_ARC_DEG = 160;
/** 水上の戦隊が、敵を舷側に置いて回り込む距離(m。これより遠ければ詰める)と、詰めすぎない距離(m) */
const ENGAGE_RANGE_M = 14000;
const MIN_GUN_RANGE_M = 8000;
/** 敵の艦の群れとみなす広さ(m) */
const ENEMY_GROUP_M = 15000;
/** 見積もりで敵の艦の戦力のこの割合を下回れば退く */
const OUTGUNNED = 0.6;
/** 攻撃の目標にする、少し前に見た敵の古さの上限(秒)。空母は5時間前に見たものでも狙う(攻撃隊は自分の目で探しながら向かう) */
const RECENT_S = 5400;
const RECENT_CARRIER_S = 18000;
/** 敵を探しに行くとき、地図の真ん中を越えて敵の側へ進む距離(m) */
const SEARCH_BEYOND_M = 20000;

type Own = SideView["own"][number];

export function isNavalUnit(u: Own, ctx: SimContext): boolean {
  return !!ctx.toes.toes[u.toe]?.naval;
}
export function isAirUnit(u: Own, ctx: SimContext): boolean {
  return !!ctx.toes.toes[u.toe]?.air;
}

/** 艦艇が入れる地点か */
function navigable(p: Vec2, ctx: SimContext): boolean {
  if (p.x < 0 || p.y < 0 || p.x > ctx.terrain.cols * ctx.terrain.cellSizeM || p.y > ctx.terrain.rows * ctx.terrain.cellSizeM) return false;
  return terrainSpeed(ctx.terrain.terrainAt(p), "naval", ctx) > 0;
}

/** from から、away と反対の向きへ dist 進んだ地点(海の上に収まらなければ、左右へ振って探す。見つからなければ null) */
/** 艦の取れる動き(naval.stances)のうち、候補の順で最初にあるもの。なければ標準 */
function shipMove(prefer: string[], ctx: SimContext): string {
  return prefer.find((x) => ctx.rules.naval?.stances?.includes(x)) ?? ctx.rules.defaultStance;
}

/** 敵を探しに行く先:最後に見た敵の艦(撃破を確かめていないもの)。なければ、自陣営の艦の重心から地図の真ん中を越えた先 SEARCH_BEYOND_M */
function searchPoint(u: Own, view: SideView, ctx: SimContext): Vec2 | null {
  const ghost = view.contacts
    .filter((c) => c.branch === "naval" && !c.destroyed)
    .sort((p, q) => q.lastSeenTime - p.lastSeenTime || distance(p.pos, u.pos) - distance(q.pos, u.pos) || (p.contactId < q.contactId ? -1 : 1))[0];
  if (ghost && distance(ghost.pos, u.pos) > 2000) return { x: ghost.pos.x, y: ghost.pos.y };
  const ships = view.own.filter((x) => isNavalUnit(x, ctx) && x.strength > 0);
  const c = { x: ctx.terrain.widthM / 2, y: ctx.terrain.heightM / 2 };
  const g = { x: ships.reduce((t, x) => t + x.pos.x, 0) / ships.length, y: ships.reduce((t, x) => t + x.pos.y, 0) / ships.length };
  const d = distance(g, c);
  const p = d > 1 ? { x: c.x + ((c.x - g.x) / d) * SEARCH_BEYOND_M, y: c.y + ((c.y - g.y) / d) * SEARCH_BEYOND_M } : c;
  const clamp = { x: Math.max(1000, Math.min(ctx.terrain.widthM - 1000, p.x)), y: Math.max(1000, Math.min(ctx.terrain.heightM - 1000, p.y)) };
  return navigable(clamp, ctx) ? clamp : navigable(c, ctx) ? c : null;
}

function retreatPoint(from: Vec2, away: Vec2, dist: number, ctx: SimContext): Vec2 | null {
  const b = bearing(away, from);
  for (const turn of [0, 30, -30, 60, -60, 90, -90]) {
    const rad = ((b + turn) * Math.PI) / 180;
    const p = { x: from.x + Math.sin(rad) * dist, y: from.y + Math.cos(rad) * dist };
    if (navigable(p, ctx)) return p;
  }
  return null;
}

function formationOrder(u: Own, want: string, ctx: SimContext): string | undefined {
  if (!ctx.rules.naval || !(want in ctx.rules.naval.formations)) return undefined;
  const now = u.navalChange?.to ?? u.navalFormation ?? ctx.rules.naval.defaultFormation;
  return now === want ? undefined : want;
}

export function navalAirOrders(view: SideView, ctx: SimContext): UnitOrder[] {
  const out: UnitOrder[] = [];
  const own = view.own.filter((u) => u.strength > 0 && !u.routed).sort((p, q) => (p.id < q.id ? -1 : 1));
  const seen = view.contacts.filter((c) => c.currentLevel > 0);
  const enemyShips = seen.filter((c) => c.branch === "naval");
  /** 少し前までに見た敵の艦艇(索敵をやめる判断に使う) */
  const recentShips = view.contacts.filter((c) => c.branch === "naval" && (c.currentLevel > 0 || view.time - c.lastSeenTime <= RECENT_S));
  const isAirContact = (c: SideView["contacts"][number]) => c.branch === "air_group";
  // 1) 艦艇の戦隊
  const ownCarriers = own.filter((x) => isNavalUnit(x, ctx) && ctx.toes.toes[x.toe]!.carrier);
  /** 水上の戦隊が護衛する空母(いちばん近い味方の空母) */
  const myCarrier = (u: Own) => [...ownCarriers].sort((p, q) => distance(p.pos, u.pos) - distance(q.pos, u.pos) || (p.id < q.id ? -1 : 1))[0];
  // 1隻ずつの艦は、戦隊の旗艦にだけ命令する(ほかの艦は持ち場につく)
  const ownById = new Map(view.own.map((x) => [x.id, x as unknown as Unit]));
  for (const u of own.filter((x) => isNavalUnit(x, ctx) && flagshipOf(x as unknown as Unit, ownById, ctx).id === x.id)) {
    const toe = ctx.toes.toes[u.toe]!;
    const nearest = [...enemyShips].sort((p, q) => distance(p.pos, u.pos) - distance(q.pos, u.pos) || (p.contactId < q.contactId ? -1 : 1))[0];
    const o: UnitOrder = { unitId: u.id };
    // 艦の動き(回避運動・煙幕):退くときは煙幕(なければ回避)、敵の水上艦に迫られた空母は回避、それ以外は標準
    let move: string | undefined = ctx.rules.defaultStance;
    if (toe.carrier) {
      const f = formationOrder(u, "ring", ctx);
      if (f) o.navalFormation = f;
      if (nearest && distance(nearest.pos, u.pos) < CARRIER_STANDOFF_M) {
        const p = retreatPoint(u.pos, nearest.pos, RETIRE_STEP_M, ctx);
        if (p) o.waypoints = [p];
        move = shipMove(["evade"], ctx);
      }
    } else {
      const f = formationOrder(u, "line_ahead", ctx);
      if (f) o.navalFormation = f;
      // 戦隊の艦(旗艦と、ついて来る艦)と、近くの見えている敵の艦の数・戦力の見積もり
      const mates = own.filter((x) => isNavalUnit(x, ctx) && flagshipOf(x as unknown as Unit, ownById, ctx).id === u.id);
      const ourPower = mates.reduce((t, x) => t + x.strength, 0);
      const theirPower = nearest
        ? enemyShips.filter((c) => distance(c.pos, nearest.pos) <= ENEMY_GROUP_M).reduce((t, c) => t + (c.estimatedStrength ?? 1), 0)
        : 0;
      const destroyersOnly = mates.every((x) => ctx.toes.toes[x.toe]!.ship?.type === "destroyer");
      const weak = mates.reduce((t, x) => t + x.strength, 0) / Math.max(1, mates.length) < RETIRE_BELOW;
      if (nearest && (weak || ourPower < theirPower * OUTGUNNED)) {
        // 退く:傷ついたか、見積もりで負けている。煙幕を張って下がる
        const p = retreatPoint(u.pos, nearest.pos, RETIRE_STEP_M, ctx);
        if (p) o.waypoints = [p];
        move = shipMove(["smoke", "evade"], ctx);
      } else if (nearest && (!myCarrier(u) || distance(nearest.pos, u.pos) <= ESCORT_ENGAGE_M)) {
        const d = distance(nearest.pos, u.pos);
        if (destroyersOnly && (view.phase === "night" || view.dark)) {
          // 駆逐艦の夜襲:雷撃の距離まで詰める(魚雷は届けば自動で撃つ)
          if (u.pursuing !== nearest.contactId) o.pursue = nearest.contactId;
          // 射程いっぱいから撃ったら反転して離れる(撃ち合いに巻き込まれない)
          const tubes = (toe.ship?.batteries ?? []).some((b) => !!ctx.weapons.weapons[b.weapon]?.torpedoRun);
          if (!u.torpedoTurnAway && ctx.rules.naval?.torpedoes && tubes) o.torpedoTurnAway = true;
        } else if (d <= ENGAGE_RANGE_M) {
          // 主砲の射程の内:敵を舷側に置くように回り込む(今の距離を保ち、針路を大きく変えない側へ)
          const p = beamPoint(u, nearest.pos, Math.max(MIN_GUN_RANGE_M, d), ctx, myCarrier(u)?.pos);
          if (p) o.waypoints = [p];
        } else if (u.pursuing !== nearest.contactId) o.pursue = nearest.contactId;
      } else if (myCarrier(u)) {
        // 空母の護衛:空母のそばに戻る
        const cv = myCarrier(u)!;
        if (distance(cv.pos, u.pos) > ESCORT_STATION_M) o.waypoints = [{ x: cv.pos.x, y: cv.pos.y }];
        else if (u.pursuing !== undefined) o.pursue = null;
      } else if (u.route.length === 0 && u.pursuing === undefined) {
        // 敵の艦艇が見えなければ、取っていない目標(海の上)へ
        const goal = ctx.scenario.objectives
          .filter((ob) => view.objectives[ob.id] !== view.side && navigable(ob, ctx))
          .sort((p, q) => distance(p, u.pos) - distance(q, u.pos) || (p.id < q.id ? -1 : 1))[0];
        if (goal && distance(goal, u.pos) > goal.radiusM / 2) o.waypoints = [{ x: goal.x, y: goal.y }];
        else if (!goal) {
          // 目標もなければ敵を探しに出る:最後に見た敵の艦か、なければ海の真ん中を越えて敵の側へ
          const p = searchPoint(u, view, ctx);
          if (p) o.waypoints = [p];
        }
      }
    }
    if (move !== undefined && move !== u.stance && (ctx.rules.naval?.stances?.includes(move) ?? false)) o.stance = move;
    if (Object.keys(o).length > 1) out.push(o);
  }
  // 2) 航空隊(夜は出さない)
  if (view.phase === "night" || view.dark || !ctx.rules.airGroups) return out;
  const groups = own.filter((x) => isAirUnit(x, ctx));
  const basePos = (g: Own): Vec2 | undefined => {
    const a = g.air;
    if (!a) return undefined;
    if (a.baseId !== undefined) return view.own.find((x) => x.id === a.baseId && x.strength > 0)?.pos;
    return a.basePos;
  };
  const baseUsable = (g: Own) => {
    const a = g.air;
    if (!a) return false;
    if (a.baseId === undefined) return !!a.basePos;
    const b = view.own.find((x) => x.id === a.baseId);
    const maxFire = ctx.rules.airGroups!.carrierOpsMaxFire;
    // 火災の大きい母艦からは発艦できない
    if (b && maxFire !== undefined && (b.shipDamage?.fire ?? 0) > maxFire) return false;
    return !!b && b.strength >= ctx.rules.airGroups!.carrierOpsMinStrength;
  };
  const ready = groups.filter((g) => g.air?.status === "ready" && baseUsable(g));
  const carriers = own.filter((x) => isNavalUnit(x, ctx) && ctx.toes.toes[x.toe]!.carrier);
  // 上空直衛:空母ごとに1隊(飛んでいるものも数える)
  const covered = new Set(groups.filter((g) => g.air?.status === "cap" && g.air.overId).map((g) => g.air!.overId!));
  const fighters = ready.filter((g) => ctx.toes.toes[g.toe]!.air!.role === "fighter");
  for (const cv of carriers) {
    if (covered.has(cv.id)) continue;
    const f = fighters.find((g) => g.air!.baseId === cv.id) ?? fighters[0];
    if (!f) break;
    fighters.splice(fighters.indexOf(f), 1);
    covered.add(cv.id);
    out.push({ unitId: f.id, air: { kind: "cap", over: cv.id } });
  }
  // 攻撃:行動半径の内の、見えている敵の艦艇(航空隊でないもの)。なければ部隊。空母を先に
  const candidates = (g: Own) => {
    const from = basePos(g);
    if (!from) return [];
    const r = ctx.toes.toes[g.toe]!.air!.radiusM;
    // 今見えているか、少し前(RECENT_S 以内)に見た敵(索敵機が見つけて帰ってきた後でも、攻撃隊は自分の目で探しながら向かう)
    // 陸の部隊(島の守備隊など、ほとんど動かない)は、いつ見たものでもよい
    const pool = view.contacts.filter(
      (c) =>
        !isAirContact(c) &&
        !c.destroyed &&
        c.bestLevel >= 2 &&
        (c.currentLevel > 0 || c.branch !== "naval" || view.time - c.lastSeenTime <= (c.carrier ? RECENT_CARRIER_S : RECENT_S)) &&
        distance(from, c.pos) <= r,
    );
    const carriers = pool.filter((c) => c.carrier);
    const ships = pool.filter((c) => c.branch === "naval");
    const land = pool.filter((c) => c.branch !== "naval");
    // 魚雷の隊は艦だけを狙う。敵の空母を見つけていない間は、艦攻・艦爆を艦に使わず温存する(陸の目標は叩く)。総ターンの後半からは見えている艦も叩く
    const torpedo = groupOrdnance(g, ctx) === "torpedo";
    const late = view.turn >= ctx.scenario.maxTurns * LATE_SHARE;
    const list = carriers.length ? carriers : late ? (ships.length ? ships : torpedo ? [] : land) : torpedo ? [] : land;
    return [...list].sort((p, q) => distance(p.pos, from) - distance(q.pos, from) || (p.contactId < q.contactId ? -1 : 1));
  };
  // 飛行隊を目標に振り分ける:このターンに出す隊を、向ける隊のいちばん少ない目標へ(同じなら近い方)。1隻に攻撃が集まりすぎないように
  const assigned = new Map<string, number>();
  const strikeTargets: string[] = [];
  for (const g of ready.filter((x) => ctx.toes.toes[x.toe]!.air!.role === "strike")) {
    const t = [...candidates(g)].sort((p, q) => (assigned.get(p.contactId) ?? 0) - (assigned.get(q.contactId) ?? 0))[0];
    if (!t) continue;
    out.push({ unitId: g.id, air: { kind: "strike", target: t.contactId } });
    assigned.set(t.contactId, (assigned.get(t.contactId) ?? 0) + 1);
    strikeTargets.push(t.contactId);
  }
  // 残りの戦闘機は攻撃隊の護衛(攻撃隊の目標へ、順に)
  if (strikeTargets.length) {
    fighters.forEach((f, i) => {
      const id = strikeTargets[i % strikeTargets.length]!;
      const target = view.contacts.find((c) => c.contactId === id)!;
      const from = basePos(f);
      if (from && distance(from, target.pos) <= ctx.toes.toes[f.toe]!.air!.radiusM) out.push({ unitId: f.id, air: { kind: "strike", target: id } });
    });
  }
  // 索敵:敵の艦艇が見えていなければ、敵のいそうな方へ扇に広げて
  // 敵の空母を少し前までに見ていなければ、索敵を続ける(艦艇だけ見えていても空母を探す)
  const recentCarrier = view.contacts.some((c) => c.carrier && !c.destroyed && (c.currentLevel > 0 || view.time - c.lastSeenTime <= RECENT_S));
  if (recentShips.length === 0 || !recentCarrier) {
    const scouts = ready.filter((g) => ctx.toes.toes[g.toe]!.air!.role === "scout");
    // 前に見た敵の艦艇(空母を先に。古くても)があれば、その辺りを探し直す。なければ敵のいそうな方
    const lastShip = [...view.contacts.filter((c) => c.branch === "naval" && !c.destroyed && (c.carrier || recentShips.length === 0))].sort(
      (p, q) => Number(!!q.carrier) - Number(!!p.carrier) || q.lastSeenTime - p.lastSeenTime || (p.contactId < q.contactId ? -1 : 1),
    )[0];
    const toward = lastShip?.pos ?? enemyGuess(view, ctx);
    scouts.forEach((g, i) => {
      const from = basePos(g);
      if (!from) return;
      const r = ctx.toes.toes[g.toe]!.air!.radiusM * 0.85;
      // ターンごとに向きを振って、扇の外も順に探る(0°・-30°・+30°・-60°・+60° の順)。前に見た艦艇を探し直すときは振らない
      // 前に見た艦艇がなければ、敵のいそうな方を中心に SEARCH_ARC_DEG の扇へ索敵機を等分に広げ、ターンごとに少しずらす
      const sweep = lastShip ? 0 : ([0, -15, 15][(view.turn - 1) % 3] ?? 0);
      const spread = lastShip ? SCOUT_SPREAD_DEG : SEARCH_ARC_DEG / Math.max(1, scouts.length);
      const b = bearing(from, toward) + sweep + (i - (scouts.length - 1) / 2) * spread;
      const rad = (b * Math.PI) / 180;
      const w = ctx.terrain.cols * ctx.terrain.cellSizeM;
      const h = ctx.terrain.rows * ctx.terrain.cellSizeM;
      const p = { x: Math.max(0, Math.min(w, from.x + Math.sin(rad) * r)), y: Math.max(0, Math.min(h, from.y + Math.cos(rad) * r)) };
      out.push({ unitId: g.id, air: { kind: "search", point: p } });
    });
  }
  return out;
}

/**
 * 敵を舷側に置く回り込みの行き先:敵を中心に、今の距離 r の円の上を 60° 回った所(針路を大きく変えない側)。海でなければ null
 */
function beamPoint(u: Own, target: Vec2, r: number, ctx: SimContext, home?: Vec2): Vec2 | null {
  const b = bearing(target, u.pos);
  const at = (deg: number) => ({ x: target.x + Math.sin((deg * Math.PI) / 180) * r, y: target.y + Math.cos((deg * Math.PI) / 180) * r });
  const turn = (p: Vec2) => {
    const d = Math.abs(((bearing(u.pos, p) - u.facing + 540) % 360) - 180);
    return d;
  };
  // 針路の変わり方がほぼ同じなら、味方の空母に近い側へ(左右どちらに回るかで偏らないように)
  const cands = [at(b + 60), at(b - 60)]
    .filter((p) => navigable(p, ctx))
    .sort((p, q) => (Math.abs(turn(p) - turn(q)) > 10 ? turn(p) - turn(q) : home ? distance(p, home) - distance(q, home) : 0));
  return cands[0] ?? null;
}

/** 航空隊の積んでいる爆弾・魚雷の種類(武器の airOrdnance。なければ undefined) */
function groupOrdnance(g: Own, ctx: SimContext): "bomb" | "torpedo" | undefined {
  for (const e of ctx.toes.toes[g.toe]!.elements) for (const w of e.weapons) {
    const o = ctx.weapons.weapons[w.weapon]?.airOrdnance;
    if (o) return o.kind;
  }
  return undefined;
}

/** 敵のいそうな所:知っている敵(ゴーストを含む)の重心。なければ、自軍から見て地図の中心の向こう側 */
function enemyGuess(view: SideView, ctx: SimContext): Vec2 {
  const known = view.contacts;
  if (known.length) return { x: known.reduce((s, c) => s + c.pos.x, 0) / known.length, y: known.reduce((s, c) => s + c.pos.y, 0) / known.length };
  const w = ctx.terrain.cols * ctx.terrain.cellSizeM;
  const h = ctx.terrain.rows * ctx.terrain.cellSizeM;
  const own = view.own.filter((u) => u.strength > 0);
  const cx = own.reduce((s, u) => s + u.pos.x, 0) / Math.max(1, own.length);
  const cy = own.reduce((s, u) => s + u.pos.y, 0) / Math.max(1, own.length);
  return { x: w - cx, y: h - cy };
}
