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
/** 攻撃の目標にする、少し前に見た敵の古さの上限(秒)。空母は5時間前に見たものでも狙う(攻撃隊は自分の目で探しながら向かう) */
const RECENT_S = 5400;
const RECENT_CARRIER_S = 18000;

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
    if (toe.carrier) {
      const f = formationOrder(u, "ring", ctx);
      if (f) o.navalFormation = f;
      if (nearest && distance(nearest.pos, u.pos) < CARRIER_STANDOFF_M) {
        const p = retreatPoint(u.pos, nearest.pos, RETIRE_STEP_M, ctx);
        if (p) o.waypoints = [p];
      }
    } else {
      const f = formationOrder(u, "line_ahead", ctx);
      if (f) o.navalFormation = f;
      if (u.strength < RETIRE_BELOW && nearest) {
        const p = retreatPoint(u.pos, nearest.pos, RETIRE_STEP_M, ctx);
        if (p) o.waypoints = [p];
      } else if (nearest && (!myCarrier(u) || distance(nearest.pos, u.pos) <= ESCORT_ENGAGE_M)) {
        if (u.pursuing !== nearest.contactId) o.pursue = nearest.contactId;
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
      }
    }
    if (Object.keys(o).length > 1) out.push(o);
  }
  // 2) 航空隊(夜は出さない)
  if (view.phase === "night" || !ctx.rules.airGroups) return out;
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
    const list = carriers.length ? carriers : ships.length ? ships : pool;
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
  if (recentShips.length === 0) {
    const scouts = ready.filter((g) => ctx.toes.toes[g.toe]!.air!.role === "scout");
    // 前に見た敵の艦艇(空母を先に。古くても)があれば、その辺りを探し直す。なければ敵のいそうな方
    const lastShip = [...view.contacts.filter((c) => c.branch === "naval" && !c.destroyed)].sort(
      (p, q) => Number(!!q.carrier) - Number(!!p.carrier) || q.lastSeenTime - p.lastSeenTime || (p.contactId < q.contactId ? -1 : 1),
    )[0];
    const toward = lastShip?.pos ?? enemyGuess(view, ctx);
    scouts.forEach((g, i) => {
      const from = basePos(g);
      if (!from) return;
      const r = ctx.toes.toes[g.toe]!.air!.radiusM * 0.85;
      // ターンごとに向きを振って、扇の外も順に探る(0°・-30°・+30°・-60°・+60° の順)。前に見た艦艇を探し直すときは振らない
      const sweep = lastShip ? 0 : ([0, -30, 30, -60, 60][(view.turn - 1) % 5] ?? 0);
      const b = bearing(from, toward) + sweep + (i - (scouts.length - 1) / 2) * 15;
      const rad = (b * Math.PI) / 180;
      const w = ctx.terrain.cols * ctx.terrain.cellSizeM;
      const h = ctx.terrain.rows * ctx.terrain.cellSizeM;
      const p = { x: Math.max(0, Math.min(w, from.x + Math.sin(rad) * r)), y: Math.max(0, Math.min(h, from.y + Math.cos(rad) * r)) };
      out.push({ unitId: g.id, air: { kind: "search", point: p } });
    });
  }
  return out;
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
