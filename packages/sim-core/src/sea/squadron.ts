import type { SimContext } from "../context.js";
import { bearing, distance, type Vec2 } from "../geometry.js";
import type { IntelState } from "../intel.js";
import { isShip } from "../naval.js";
import type { Unit } from "../unit.js";
import type { SeaBand, SeaOrder, SeaReaction, SeaSpeed } from "./orders.js";

/**
 * 戦隊の状態(docs/naval-design.md の2・3)。命令の中身と、先頭の艦の航跡を持つ。
 * ships は列の順(先頭が旗艦=先導の艦)。上級部隊の戦隊の ID はその上級部隊の ID、1隻の戦隊は艦の ID
 */
export interface SquadronState {
  side: string;
  ships: string[];
  /** もとの上級部隊(切り離した艦の1隻の戦隊が戻る先) */
  parent?: string;
  course: number;
  toward?: Vec2;
  follow?: string;
  /** 哨戒(警戒配備の艦):点を順に回る */
  patrol?: { points: Vec2[]; next: number };
  speed: SeaSpeed;
  turnMode: "succession" | "together";
  /** 単縦陣で航跡をたどっているか(一斉回頭の後は false=梯陣。逐次回頭か陣形を命じ直すと組み直す) */
  inLine: boolean;
  formation: string;
  formationChange?: { to: string; leftSec: number };
  /** 交戦:目標は敵の艦の本当の ID(霧のフィルタで接触の ID に替えて見せる) */
  engage?: { target: string; band: SeaBand };
  /** 反応(条件付きの命令。発動すると消える) */
  reaction?: SeaReaction;
  fire: "free" | "hold";
  torpedoes: "free" | "hold" | "turnAway";
  smoke: boolean;
  evade: boolean;
  /** 先頭の艦の航跡(古い順)。後ろの艦はこの上で間隔ぶん後ろの点を追う */
  trail: Vec2[];
  /**
   * 退避群:落伍した艦・戦列を離れた艦の戦隊。落伍艦の心得(steerRetiring)で、脱出路か敵から離れる向きへ自動で退く。
   * プレイヤーが命令を出すと手で指揮する戦隊に戻る(retiring が消える)
   */
  retiring?: boolean;
  /** 落伍した主力艦(戦艦・巡洋艦・空母)に、この戦隊の駆逐艦を1隻付けて退かせる */
  escortCripples?: boolean;
}

export type Squadrons = Record<string, SquadronState>;

/** 艦の直に属する上級部隊(最初に名前の出てくる上級部隊) */
function formationOf(unitId: string, ctx: Pick<SimContext, "formations">): string | undefined {
  for (const [fid, f] of Object.entries(ctx.formations ?? {})) if (f.units.includes(unitId)) return fid;
  return undefined;
}

/** 戦隊の艦(生きているもの、列の順) */
export function squadronMembers(sq: SquadronState, byId: ReadonlyMap<string, Unit>): Unit[] {
  return sq.ships.flatMap((id) => {
    const u = byId.get(id);
    return u && u.strength > 0 ? [u] : [];
  });
}

/** 艦の属する戦隊の ID */
export function squadronOfShip(squadrons: Squadrons, shipId: string): string | undefined {
  for (const [id, sq] of Object.entries(squadrons)) if (sq.ships.includes(shipId)) return id;
  return undefined;
}

/**
 * 戦隊をそろえる:まだ戦隊に入っていない艦(試合の始め・増援)を、上級部隊の戦隊か1隻の戦隊に入れる。沈んだ艦を外し、空の戦隊を消す。
 * 新しい戦隊の針路は先導の艦の向き、速力は巡航、陣形は先導の艦のシナリオの陣形か既定
 */
export function ensureSquadrons(prev: Squadrons | undefined, units: readonly Unit[], ctx: SimContext): Squadrons {
  const out: Squadrons = structuredClone(prev ?? {});
  const alive = new Set(units.filter((u) => u.strength > 0).map((u) => u.id));
  for (const [id, sq] of Object.entries(out)) {
    sq.ships = sq.ships.filter((s) => alive.has(s));
    if (sq.ships.length === 0) delete out[id];
  }
  const placed = new Set(Object.values(out).flatMap((sq) => sq.ships));
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx) && !placed.has(u.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  // 上級部隊の並び順(シナリオに書いた順)で戦隊に入れる
  const order = (u: Unit, fid: string | undefined) => (fid ? ctx.formations![fid]!.units.indexOf(u.id) : 0);
  const byFormation = new Map<string, { fid: string | undefined; list: Unit[] }>();
  for (const u of ships) {
    const fid = u.detached ? undefined : formationOf(u.id, ctx);
    const key = fid ?? u.id;
    const g = byFormation.get(key) ?? { fid, list: [] };
    g.list.push(u);
    byFormation.set(key, g);
  }
  for (const [key, { fid, list }] of [...byFormation.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    list.sort((a, b) => order(a, fid) - order(b, fid) || (a.id < b.id ? -1 : 1));
    const existing = out[key];
    if (existing) {
      existing.ships.push(...list.map((u) => u.id));
      continue;
    }
    const lead = list[0]!;
    const parent = lead.detached ? formationOf(lead.id, ctx) : undefined;
    out[key] = {
      side: lead.side,
      ships: list.map((u) => u.id),
      ...(parent ? { parent } : {}),
      course: lead.facing,
      ...(lead.patrol ? { patrol: { points: lead.patrol.points.map((p) => ({ ...p })), next: lead.patrol.next } } : {}),
      speed: "cruise",
      turnMode: "succession",
      inLine: true,
      formation: lead.navalFormation ?? ctx.rules.naval?.defaultFormation ?? "line_ahead",
      fire: "free",
      torpedoes: "free",
      smoke: false,
      evade: false,
      trail: straightTrail(lead.pos, lead.facing, list.length * spacingOf(ctx) + 2000),
    };
  }
  return out;
}

export function spacingOf(ctx: SimContext, formation?: string): number {
  const n = ctx.rules.naval;
  const st = formation ? n?.formations[formation]?.station : undefined;
  return st?.kind === "column" ? st.spacingM : (n?.motion?.columnSpacingM ?? 600);
}

/** p から heading の逆向きへ length のまっすぐな航跡(古い順) */
export function straightTrail(p: Vec2, heading: number, length: number): Vec2[] {
  const rad = (heading * Math.PI) / 180;
  const out: Vec2[] = [];
  for (let d = length; d > 0; d -= 200) out.push({ x: p.x - Math.sin(rad) * d, y: p.y - Math.cos(rad) * d });
  out.push({ ...p });
  return out;
}

export interface SeaOrderRejection {
  order: SeaOrder;
  reason: string;
}

/**
 * 戦隊の命令を受ける。自陣営の戦隊にだけ。交戦の目標は、陣営の霧の情報の接触 ID から本当の艦の ID に替える。
 * 警戒配備でまだ敵に気づいていない戦隊(先導の艦が unready)は命令を受けない。弾いた命令を返す
 */
export function applySeaOrders(
  squadrons: Squadrons,
  orders: readonly SeaOrder[],
  side: string | ((o: SeaOrder) => string | undefined),
  byId: ReadonlyMap<string, Unit>,
  intel: IntelState,
  ctx: SimContext,
): SeaOrderRejection[] {
  const rejected: SeaOrderRejection[] = [];
  for (const o of orders) {
    const sq = squadrons[o.squadron];
    const who = typeof side === "string" ? side : side(o);
    if (!sq || (who !== undefined && sq.side !== who)) {
      rejected.push({ order: o, reason: "自陣営の戦隊ではありません" });
      continue;
    }
    const lead = byId.get(sq.ships[0] ?? "");
    if (lead?.unready && !lead.unready.alarmed) {
      rejected.push({ order: o, reason: "警戒配備の戦隊は、敵に気づくまで命令を受けません" });
      continue;
    }
    const steer = [o.course !== undefined, o.toward !== undefined, o.follow !== undefined].filter(Boolean).length;
    if (steer > 1) {
      rejected.push({ order: o, reason: "針路・向かう点・後ろにつく戦隊は、どれか1つだけ" });
      continue;
    }
    if (o.follow !== undefined && (!squadrons[o.follow] || squadrons[o.follow]!.side !== sq.side || o.follow === o.squadron)) {
      rejected.push({ order: o, reason: "後ろにつく戦隊が自陣営にありません" });
      continue;
    }
    if (o.formation !== undefined && !(o.formation in (ctx.rules.naval?.formations ?? {}))) {
      rejected.push({ order: o, reason: `陣形 "${o.formation}" はありません` });
      continue;
    }
    let engageTarget: string | undefined;
    if (o.engage) {
      engageTarget = Object.entries(intel[sq.side]?.entries ?? {}).find(([, e]) => e.contactId === o.engage!.target)?.[0];
      if (!engageTarget) {
        rejected.push({ order: o, reason: "交戦の目標が見つかりません" });
        continue;
      }
    }
    // 退避群の戦隊に(自沈・護衛の切り替えのほかの)命令を出すと、手で指揮する戦隊に戻る
    if (Object.keys(o).some((k) => k !== "squadron" && k !== "scuttle" && k !== "escortCripples" && o[k as keyof SeaOrder] !== undefined)) delete sq.retiring;
    if (o.escortCripples !== undefined) sq.escortCripples = o.escortCripples;
    if (o.turn) sq.turnMode = o.turn;
    if (o.course !== undefined || o.toward !== undefined || o.follow !== undefined) {
      delete sq.toward;
      delete sq.follow;
      delete sq.patrol;
      if (o.course !== undefined) sq.course = ((o.course % 360) + 360) % 360;
      if (o.toward) sq.toward = { ...o.toward };
      if (o.follow) sq.follow = o.follow;
      // 一斉回頭:列のまま全艦が同時に向きを変える(梯陣になる)。逐次回頭を命じると単縦陣に組み直す
      if (sq.turnMode === "together") sq.inLine = false;
    }
    if (o.turn === "succession" && !sq.inLine) reform(sq, byId);
    if (o.speed) sq.speed = o.speed;
    if (o.formation !== undefined) {
      if (o.formation === sq.formation) delete sq.formationChange;
      else sq.formationChange = { to: o.formation, leftSec: ctx.rules.naval!.changeSeconds };
      if (!sq.inLine) reform(sq, byId);
    }
    if (o.engage === null) delete sq.engage;
    else if (o.engage && engageTarget) sq.engage = { target: engageTarget, band: o.engage.band };
    if (o.reaction === null) delete sq.reaction;
    else if (o.reaction) sq.reaction = structuredClone(o.reaction);
    if (o.fire) sq.fire = o.fire;
    if (o.torpedoes) sq.torpedoes = o.torpedoes;
    if (o.smoke !== undefined) sq.smoke = o.smoke;
    if (o.evade !== undefined) sq.evade = o.evade;
    for (const id of o.detach ?? []) detachShip(squadrons, o.squadron, id, byId, ctx);
    for (const id of o.rejoin ?? []) {
      const own = squadrons[id];
      if (!own || own.parent !== o.squadron || own.ships.length !== 1) continue;
      const u = byId.get(id);
      const tail = squadronMembers(sq, byId).at(-1);
      if (!u || !tail || distance(u.pos, tail.pos) > (ctx.rules.naval?.rejoinRadiusM ?? 1500) * 3) {
        rejected.push({ order: o, reason: `${id} は戦隊から遠すぎて戻れません` });
        continue;
      }
      delete squadrons[id];
      delete u.detached;
      sq.ships.push(id);
    }
  }
  return rejected;
}

/** 艦を戦隊から切り離して、1隻の戦隊にする(針路・速力は戦隊のまま) */
export function detachShip(squadrons: Squadrons, from: string, shipId: string, byId: ReadonlyMap<string, Unit>, ctx: SimContext): boolean {
  const sq = squadrons[from];
  const u = byId.get(shipId);
  if (!sq || !u || !sq.ships.includes(shipId) || sq.ships.length <= 1) return false;
  sq.ships = sq.ships.filter((s) => s !== shipId);
  u.detached = true;
  squadrons[shipId] = {
    ...structuredClone(sq),
    ships: [shipId],
    parent: sq.parent ?? from,
    inLine: true,
    trail: straightTrail(u.pos, u.facing, spacingOf(ctx) * 2),
  };
  delete squadrons[shipId]!.formationChange;
  return true;
}

/** 護衛を付ける主力艦の艦種(駆逐艦・護衛艦・補助艦のほか) */
const CAPITAL = new Set(["battleship", "battlecruiser", "heavy_cruiser", "light_cruiser", "carrier", "light_carrier"]);

/**
 * 艦を退避群にする(落伍・戦列離脱):戦隊に2隻以上いれば切り離して1隻の戦隊にし、退避群の印を付ける。
 * もとの戦隊が escortCripples で、退く艦が主力艦なら、もとの戦隊の駆逐艦を1隻(先導の艦を除く、列の後ろから)付ける。退避群の戦隊の ID を返す
 */
export function retireShip(squadrons: Squadrons, from: string, shipId: string, byId: ReadonlyMap<string, Unit>, ctx: SimContext): string | undefined {
  const sq = squadrons[from];
  if (!sq) return undefined;
  let own = from;
  if (sq.ships.length > 1) {
    if (!detachShip(squadrons, from, shipId, byId, ctx)) return undefined;
    own = shipId;
  }
  const r = squadrons[own]!;
  r.retiring = true;
  delete r.escortCripples;
  delete r.engage;
  delete r.follow;
  delete r.patrol;
  delete r.reaction;
  r.speed = "flank";
  const u = byId.get(shipId);
  if (own !== from && sq.escortCripples && u && CAPITAL.has(ctx.toes.toes[u.toe]?.ship?.type ?? "")) {
    const escort = squadronMembers(sq, byId)
      .slice(1)
      .reverse()
      .find((x) => ctx.toes.toes[x.toe]?.ship?.type === "destroyer");
    if (escort) {
      sq.ships = sq.ships.filter((s) => s !== escort.id);
      escort.detached = true;
      r.ships.push(escort.id);
    }
  }
  return own;
}

/**
 * 落伍艦の心得(小ステップごと):退避群の戦隊は、行き先 target(脱出路・引き揚げの点。なければ undefined)へ全速で向かう。
 * 行き先がなければ、見えているいちばん近い敵の艦から離れる向きへ走る(敵が見えなければ針路のまま)
 */
export function steerRetiring(squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, target: (lead: Unit) => Vec2 | undefined, enemyNear: (u: Unit) => Vec2 | undefined): void {
  for (const sq of Object.values(squadrons)) {
    if (!sq.retiring) continue;
    const lead = squadronMembers(sq, byId)[0];
    if (!lead) continue;
    sq.speed = "flank";
    const to = target(lead);
    if (to) {
      sq.toward = { ...to };
      continue;
    }
    const near = enemyNear(lead);
    if (near) {
      delete sq.toward;
      sq.course = bearing(near, lead.pos);
    }
  }
}

/** 梯陣の戦隊を単縦陣に組み直す:針路の向きでいちばん前の艦が先頭になり、前から順に並ぶ。航跡は新しい先頭からまっすぐ後ろへ */
export function reform(sq: SquadronState, byId: ReadonlyMap<string, Unit>): void {
  const rad = (sq.course * Math.PI) / 180;
  const ahead = (u: Unit) => u.pos.x * Math.sin(rad) + u.pos.y * Math.cos(rad);
  const members = squadronMembers(sq, byId).sort((a, b) => ahead(b) - ahead(a) || (a.id < b.id ? -1 : 1));
  sq.ships = [...members.map((u) => u.id), ...sq.ships.filter((id) => !members.some((u) => u.id === id))];
  sq.inLine = true;
  const lead = members[0];
  if (lead) sq.trail = straightTrail(lead.pos, lead.facing, members.length * 600 + 2000);
}

/** 交戦の距離の帯(m)。帯の名前は、戦隊の主砲の最大射程に対する割合 */
export function bandMeters(band: SeaBand, mainRangeM: number, ctx: SimContext): { min: number; max: number } {
  if (typeof band !== "string") return { min: band.minM, max: band.maxM };
  const b = ctx.rules.naval!.motion!.engageBands[band];
  return { min: b.min * mainRangeM, max: b.max * mainRangeM };
}

/** 方位 b から見て、点 p が右舷側か(右なら1、左なら-1) */
export function sideOf(from: Vec2, heading: number, p: Vec2): 1 | -1 {
  const rel = (((bearing(from, p) - heading) % 360) + 360) % 360;
  return rel < 180 ? 1 : -1;
}

export type SeaUpkeepEvent =
  | { unitId: string; type: "shipDetached"; reason: "straggle" | "breakOff" }
  | { unitId: string; type: "flagshipChanged"; from: string };

/**
 * 戦隊の手入れ(小ステップごと):
 * - 落伍:戦隊のいちばん速い艦の straggleSpeedRatio より遅くなった艦は、切り離して1隻の戦隊にする(同じ針路・行き先のまま)
 * - 先導の艦が沈んだ・離れたら、次の艦が先導を引き継ぐ(航跡はそのまま)
 * leads は戦隊ごとの前の先導の艦(呼ぶたびに更新する)
 */
export function seaUpkeep(squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, leads: Map<string, string>, maxSpeed: (u: Unit) => number, ctx: SimContext): SeaUpkeepEvent[] {
  const out: SeaUpkeepEvent[] = [];
  const ratio = ctx.rules.naval?.straggleSpeedRatio ?? 0.75;
  for (const id of Object.keys(squadrons).sort()) {
    const sq = squadrons[id];
    if (!sq) continue;
    const members = squadronMembers(sq, byId);
    // 退避群(落伍艦と護衛の駆逐艦)は、遅い艦に合わせて一緒に退くので、落伍させない
    if (members.length >= 2 && !sq.retiring) {
      const fastest = Math.max(...members.map(maxSpeed));
      for (const u of members) {
        if (maxSpeed(u) >= fastest * ratio) continue;
        if (retireShip(squadrons, id, u.id, byId, ctx)) out.push({ unitId: u.id, type: "shipDetached", reason: "straggle" });
      }
    }
    const lead = squadronMembers(sq, byId)[0];
    const prev = leads.get(id);
    if (lead && prev && prev !== lead.id) out.push({ unitId: lead.id, type: "flagshipChanged", from: prev });
    if (lead) leads.set(id, lead.id);
  }
  return out;
}

/**
 * 大破した艦は戦列を離れる(艦長の判断。naval.crew.breakOffBelow):戦力がこれを下回った艦は、敵の艦が breakOffContactM の内に見えていれば、
 * 戦隊から切り離して、敵から離れる向きへ全速で走る(1隻に1度だけ。その後は命令し直せる)。動力の止まった艦は離れられない。
 * enemyNear は、その艦が見えている、いちばん近い敵の艦の位置(なければ undefined)
 */
export function seaBreakOff(squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, enemyNear: (u: Unit) => Vec2 | undefined, stopped: (u: Unit) => boolean, ctx: SimContext): SeaUpkeepEvent[] {
  const c = ctx.rules.naval?.crew;
  const out: SeaUpkeepEvent[] = [];
  if (!c?.breakOffBelow) return out;
  for (const id of Object.keys(squadrons).sort()) {
    const sq = squadrons[id];
    if (!sq) continue;
    for (const u of squadronMembers(sq, byId)) {
      if (u.brokeOff || u.strength >= c.breakOffBelow || stopped(u)) continue;
      const near = enemyNear(u);
      if (!near) continue;
      u.brokeOff = true;
      const own = retireShip(squadrons, id, u.id, byId, ctx);
      if (!own) continue;
      const s = squadrons[own]!;
      delete s.toward;
      s.course = bearing(near, u.pos);
      out.push({ unitId: u.id, type: "shipDetached", reason: "breakOff" });
    }
  }
  return out;
}

/**
 * 戦隊の反応(条件付きの命令)を見て、条件を満たした戦隊の命令を変える。levels は陣営ごとのこの小ステップの探知の段階。
 * 発動した戦隊の ID と反応を返す(反応は消える)
 */
export function seaReactions(
  squadrons: Squadrons,
  byId: ReadonlyMap<string, Unit>,
  levels: Record<string, Record<string, number>>,
  intel: IntelState,
  ctx: SimContext,
): { squadron: string; lead: string; reaction: SeaReaction }[] {
  const out: { squadron: string; lead: string; reaction: SeaReaction }[] = [];
  for (const [id, sq] of Object.entries(squadrons).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const r = sq.reaction;
    if (!r) continue;
    const ships = squadronMembers(sq, byId);
    const lead = ships[0];
    if (!lead) continue;
    const seen = [...byId.values()]
      .filter((e) => e.side !== sq.side && e.strength > 0 && isShip(e, ctx) && (levels[sq.side]?.[e.id] ?? 0) > 0)
      .sort((a, b) => distance(a.pos, lead.pos) - distance(b.pos, lead.pos) || (a.id < b.id ? -1 : 1));
    const nearest = seen[0];
    const met = r.when.type === "enemyShipSeen" ? !!nearest && distance(nearest.pos, lead.pos) <= r.when.withinM : ships.some((u) => u.strength < (r.when as { below: number }).below);
    if (!met) continue;
    // 離れる向き:いちばん近い見えている敵(いなければ最後に知った敵の艦)から離れる。どちらもなければ反転
    const threat =
      nearest?.pos ??
      Object.entries(intel[sq.side]?.entries ?? {})
        .filter(([eid, e]) => !e.confirmedDestroyed && byId.get(eid) && isShip(byId.get(eid)!, ctx))
        .map(([, e]) => e.lastSeenPos)
        .sort((a, b) => distance(a, lead.pos) - distance(b, lead.pos))[0];
    if (r.then === "withdraw" || !nearest) {
      delete sq.toward;
      delete sq.follow;
      delete sq.patrol;
      delete sq.engage;
      sq.course = threat ? bearing(threat, lead.pos) : (sq.course + 180) % 360;
      sq.speed = "flank";
    } else {
      sq.engage = { target: nearest.id, band: r.then === "torpedoAttack" ? "close" : (r.band ?? "hold") };
      if (r.then === "torpedoAttack") sq.torpedoes = "turnAway";
      if (sq.speed === "stop" || sq.speed === "slow" || sq.speed === "cruise") sq.speed = "battle";
    }
    out.push({ squadron: id, lead: lead.id, reaction: r });
    delete sq.reaction;
  }
  return out;
}
