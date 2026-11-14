import type { SimContext } from "../context.js";
import { distance, type Vec2 } from "../geometry.js";
import { isShip } from "../naval.js";
import type { TaskForceRules } from "../rulepack.js";
import type { Unit } from "../unit.js";
import type { SeaOrder } from "./orders.js";
import { squadronMembers, type SeaOrderRejection, type SquadronState, type Squadrons } from "./squadron.js";

/**
 * 任務部隊(docs/naval-design.md の13。ユーザー判断)。シナリオの上級部隊のうち、2つ以上の戦隊を隷下に持つもの。
 * 配備を命じると、隷下の戦隊が基準の戦隊からの持ち場につく(単縦の戦列なら順に後ろへつながる)。
 * 配備・役割・基準の戦隊の大きな変針は信号で隷下に伝わり、届くまでの間は前のまま動く(信号の遅れ)。
 * 戦隊に個別に針路・交戦を命じると、その戦隊は持ち場を外れる(任務部隊の命令の join で戻す)。
 * 役割(戦策):水雷戦隊は敵の艦が見えると持ち場を離れて雷撃し、撃ち終えると持ち場へ戻る
 */
export interface TaskForceMember {
  /** 持ち場:基準の戦隊の針路から見た方位と距離。単縦の戦列では前の戦隊の後ろ(after) */
  slot: { bearingDeg: number; distM: number } | { after: string };
  role: string;
  /** 役割で持ち場を離れている(水雷戦隊の突撃) */
  sortie?: boolean;
}

export interface TaskForceState {
  side: string;
  /** 基準の戦隊 */
  guide: string;
  /** 配備の型(ルールパックの naval.taskForces.dispositions)。なければ持ち場なし(隷下は各自の命令で動く) */
  disposition?: string;
  /** 命じた役割(書かなかった戦隊は艦種から決める) */
  roles: Record<string, string>;
  /** 持ち場についている戦隊 */
  members: Record<string, TaskForceMember>;
  /** 隷下の戦隊が合わせている基準の戦隊の針路(信号が届くまで前の針路のまま) */
  refCourse: number;
  /** 届く前の変針の信号 */
  signal?: { course: number; atSec: number };
  /** 作ったときに空母がいた(空母の任務部隊) */
  carrier?: boolean;
  /** 届く前の任務部隊の命令(配備・役割・基準の戦隊・持ち場に戻す戦隊) */
  pending?: { atSec: number; disposition?: string | null; guide?: string; roles?: Record<string, string>; join?: string[] }[];
}

export type TaskForces = Record<string, TaskForceState>;

export type TaskForceEvent =
  | { unitId: string; type: "tfSortie"; taskForce: string; squadron: string }
  | { unitId: string; type: "tfReturn"; taskForce: string; squadron: string }
  | { unitId: string; type: "tfSignal"; taskForce: string; what: "disposition" | "course" };

function rulesOf(ctx: SimContext): TaskForceRules | undefined {
  return ctx.rules.naval?.taskForces;
}

/** 任務部隊の隷下の戦隊(シナリオの上級部隊の並び順。今いる戦隊だけ) */
export function taskForceChildren(tfId: string, squadrons: Squadrons, ctx: SimContext): string[] {
  return Object.entries(ctx.formations ?? {})
    .filter(([id, f]) => f.parent === tfId && squadrons[id])
    .map(([id]) => id);
}

/**
 * 任務部隊をそろえる:2つ以上の戦隊を隷下に持つ上級部隊を任務部隊にする。いなくなった戦隊を外し、基準の戦隊が沈めば次の戦隊に替える。
 * 任務部隊の決まりのないルールパックでは作らない
 */
export function ensureTaskForces(prev: TaskForces | undefined, squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, ctx: SimContext): TaskForces {
  const out: TaskForces = structuredClone(prev ?? {});
  if (!rulesOf(ctx)) return {};
  const parents = new Set(Object.values(ctx.formations ?? {}).map((f) => f.parent).filter((p): p is string => !!p));
  for (const tfId of [...parents].sort()) {
    if (squadrons[tfId]) continue;
    const kids = taskForceChildren(tfId, squadrons, ctx);
    if (kids.length < 2 && !out[tfId]) continue;
    if (kids.length === 0) {
      delete out[tfId];
      continue;
    }
    const tf = out[tfId];
    if (!tf) {
      const guide = kids[0]!;
      const carrier = kids.some((k) => squadronMembers(squadrons[k]!, byId).some((u) => !!ctx.toes.toes[u.toe]?.carrier));
      out[tfId] = { side: squadrons[guide]!.side, guide, roles: {}, members: {}, refCourse: squadrons[guide]!.course, ...(carrier ? { carrier: true } : {}) };
      continue;
    }
    let changed = false;
    for (const id of Object.keys(tf.members))
      if (!squadrons[id] || squadrons[id]!.retiring) {
        delete tf.members[id];
        changed = true;
      }
    if (!squadrons[tf.guide] || squadrons[tf.guide]!.retiring) {
      const next = kids.find((k) => !squadrons[k]!.retiring && roleOf(tf, k, squadrons, byId, ctx) !== rulesOf(ctx)!.defaultRoles.torpedo) ?? kids.find((k) => !squadrons[k]!.retiring) ?? kids[0]!;
      tf.guide = next;
      delete tf.members[next];
      if (tf.disposition) clearStation(squadrons[next]!);
      tf.refCourse = squadrons[next]!.course;
      changed = true;
    }
    if (changed && tf.disposition) assignStations(tfId, tf, Object.keys(tf.members), squadrons, byId, ctx);
  }
  return out;
}

/** 戦隊の役割:命じた役割か、艦種から(空母・魚雷を持つ駆逐艦の戦隊・ほか) */
export function roleOf(tf: TaskForceState, sqId: string, squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, ctx: SimContext): string {
  const r = rulesOf(ctx)!;
  if (tf.roles[sqId]) return tf.roles[sqId]!;
  const ships = squadronMembers(squadrons[sqId]!, byId);
  const toes = ships.map((u) => ctx.toes.toes[u.toe]);
  if (toes.some((t) => t?.carrier)) return r.defaultRoles.carrier;
  const types = toes.map((t) => t?.ship?.type ?? "");
  if (types.some((x) => x === "destroyer") && types.every((x) => x === "destroyer" || x === "light_cruiser") && ships.some((u) => hasTubes(u, ctx))) return r.defaultRoles.torpedo;
  return r.defaultRoles.main;
}

function hasTubes(u: Unit, ctx: SimContext): boolean {
  return (ctx.toes.toes[u.toe]?.ship?.batteries ?? []).some((b) => !!ctx.weapons.weapons[b.weapon]?.torpedoRun);
}

/** 今すぐ撃てる魚雷のある艦がいるか(撃ち尽くしていない・次発装填の途中でない) */
function torpedoesReady(ships: readonly Unit[], now: number, ctx: SimContext): boolean {
  return ships.some((u) => hasTubes(u, ctx) && (!u.torpedoLoad || (u.torpedoLoad.salvosLeft > 0 && u.torpedoLoad.readyAt <= now)));
}

function torpedoReach(ships: readonly Unit[], ctx: SimContext): number {
  let r = 0;
  for (const u of ships) for (const b of ctx.toes.toes[u.toe]?.ship?.batteries ?? []) r = Math.max(r, ctx.weapons.weapons[b.weapon]?.torpedoRun?.rangeM ?? 0);
  return r;
}

function clearStation(sq: SquadronState) {
  delete sq.station;
  delete sq.follow;
}

/** 持ち場を割り当てる(ids の戦隊を、配備の型の持ち場へ。役割の合う持ち場から順に) */
function assignStations(tfId: string, tf: TaskForceState, ids: readonly string[], squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, ctx: SimContext) {
  const r = rulesOf(ctx)!;
  for (const id of Object.keys(tf.members)) clearStation(squadrons[id]!);
  tf.members = {};
  const d = tf.disposition ? r.dispositions[tf.disposition] : undefined;
  if (!d) return;
  const order = taskForceChildren(tfId, squadrons, ctx);
  // 警戒配備でまだ敵に気づいていない戦隊(哨戒中)は、戦隊への命令と同じく配備の信号も受けない
  const unready = (k: string) => {
    const lead = byId.get(squadrons[k]!.ships[0] ?? "");
    return !!lead?.unready && !lead.unready.alarmed;
  };
  const list = order.filter((k) => ids.includes(k) && k !== tf.guide && !squadrons[k]!.retiring && !unready(k));
  if (d.kind === "column") {
    let prev = tf.guide;
    for (const id of list) {
      const sq = squadrons[id]!;
      tf.members[id] = { slot: { after: prev }, role: roleOf(tf, id, squadrons, byId, ctx) };
      takeStation(sq, tf.members[id]!, tfId);
      prev = id;
    }
    return;
  }
  const used = new Set<number>();
  let spill = 0;
  const slots = d.slots;
  for (const id of list) {
    const role = roleOf(tf, id, squadrons, byId, ctx);
    const pick = (f: (s: (typeof slots)[number]) => boolean) => slots.findIndex((s, i) => !used.has(i) && f(s));
    let i = pick((s) => s.role === role);
    if (i < 0) i = pick((s) => !s.role);
    if (i < 0) i = pick(() => true);
    let slot: { bearingDeg: number; distM: number };
    if (i >= 0) {
      used.add(i);
      slot = { bearingDeg: slots[i]!.bearingDeg, distM: slots[i]!.distM };
    } else slot = { bearingDeg: 180, distM: 3000 + 2000 * spill++ };
    tf.members[id] = { slot, role };
    takeStation(squadrons[id]!, tf.members[id]!, tfId);
  }
}

function takeStation(sq: SquadronState, m: TaskForceMember, tfId: string) {
  delete sq.toward;
  delete sq.patrol;
  delete sq.engage;
  delete sq.follow;
  delete sq.station;
  if ("after" in m.slot) sq.follow = m.slot.after;
  else sq.station = { taskForce: tfId, bearingDeg: m.slot.bearingDeg, distM: m.slot.distM };
}

/** 任務部隊の命令が隷下に届くまでの秒(陣営の信号の手段・夜・寄り合いの艦隊) */
export function signalDelaySec(side: string, dark: boolean, ctx: SimContext): number {
  const r = rulesOf(ctx);
  if (!r) return 0;
  const sig = ctx.scenario.navalSignals?.[side];
  let s = sig?.radio ? r.signals.radioSec : r.signals.flagSec;
  if (dark) s *= r.signals.nightMultiplier;
  if (sig?.mixed) s *= r.signals.mixedMultiplier;
  return s;
}

/** 戦隊の命令のうち、針路・交戦を変えるもの(持ち場を外れる) */
function steers(o: SeaOrder): boolean {
  return o.course !== undefined || o.toward !== undefined || o.follow !== undefined || !!o.engage;
}

/**
 * 任務部隊の命令を受ける。針路・速力・陣形・交戦は基準の戦隊への命令に、撃ち方・煙幕・回避運動は隷下の全戦隊への命令に直して返す(すぐ効く)。
 * 配備・役割・基準の戦隊・持ち場に戻す戦隊は、信号の遅れの後に効く。戦隊への個別の針路・交戦の命令は、その戦隊を持ち場から外す
 */
export function applyTaskForceOrders(
  tfs: TaskForces,
  orders: readonly SeaOrder[],
  squadrons: Squadrons,
  byId: ReadonlyMap<string, Unit>,
  now: number,
  dark: boolean,
  ctx: SimContext,
): { forwarded: SeaOrder[]; rejected: SeaOrderRejection[]; rest: SeaOrder[] } {
  const forwarded: SeaOrder[] = [];
  const rejected: SeaOrderRejection[] = [];
  const rest: SeaOrder[] = [];
  const r = rulesOf(ctx);
  for (const o of orders) {
    const tf = squadrons[o.squadron] ? undefined : tfs[o.squadron];
    if (!tf || !r) {
      rest.push(o);
      continue;
    }
    const kids = taskForceChildren(o.squadron, squadrons, ctx);
    if (o.guide !== undefined && !kids.includes(o.guide)) {
      rejected.push({ order: o, reason: "基準の戦隊は、任務部隊の隷下の戦隊から選びます" });
      continue;
    }
    if (o.disposition && !r.dispositions[o.disposition]) {
      rejected.push({ order: o, reason: `配備 "${o.disposition}" はありません` });
      continue;
    }
    const badRole = Object.entries(o.roles ?? {}).find(([k, v]) => !kids.includes(k) || !r.roles[v]);
    if (badRole) {
      rejected.push({ order: o, reason: `役割 ${badRole[0]}=${badRole[1]} は使えません` });
      continue;
    }
    const badJoin = (o.join ?? []).find((k) => !kids.includes(k));
    if (badJoin) {
      rejected.push({ order: o, reason: `${badJoin} は任務部隊の隷下の戦隊ではありません` });
      continue;
    }
    // 基準の戦隊への命令(基準の戦隊を替えるなら新しい基準の戦隊へ)
    const guide = o.guide ?? tf.guide;
    const g: SeaOrder = { squadron: guide };
    for (const k of ["course", "toward", "follow", "speed", "turn", "formation", "engage", "torpedoes", "reaction"] as const) if (o[k] !== undefined) (g as Record<string, unknown>)[k] = o[k];
    if (Object.keys(g).length > 1) forwarded.push(g);
    for (const id of new Set([guide, ...kids])) {
      const all: SeaOrder = { squadron: id };
      if (o.fire !== undefined) all.fire = o.fire;
      if (o.smoke !== undefined) all.smoke = o.smoke;
      if (o.evade !== undefined) all.evade = o.evade;
      if (Object.keys(all).length > 1) forwarded.push(all);
    }
    if (o.disposition !== undefined || o.guide !== undefined || o.roles || o.join) {
      const delay = signalDelaySec(tf.side, dark, ctx);
      (tf.pending ??= []).push({
        atSec: now + delay,
        ...(o.disposition !== undefined ? { disposition: o.disposition } : {}),
        ...(o.guide !== undefined ? { guide: o.guide } : {}),
        ...(o.roles ? { roles: { ...o.roles } } : {}),
        ...(o.join ? { join: [...o.join] } : {}),
      });
      if (delay <= 0) settlePending(o.squadron, tf, squadrons, byId, now, ctx);
    }
  }
  // 戦隊への個別の針路・交戦の命令は、その戦隊を持ち場から外す
  for (const o of rest) {
    if (!steers(o)) continue;
    for (const [tfId, tf] of Object.entries(tfs)) {
      if (!tf.members[o.squadron]) continue;
      delete tf.members[o.squadron];
      delete squadrons[o.squadron]!.station;
      if (tf.disposition && rulesOf(ctx)!.dispositions[tf.disposition]?.kind === "column") assignStations(tfId, tf, Object.keys(tf.members), squadrons, byId, ctx);
    }
  }
  return { forwarded, rejected, rest };
}

/** 届いた任務部隊の命令を効かせる */
function settlePending(tfId: string, tf: TaskForceState, squadrons: Squadrons, byId: ReadonlyMap<string, Unit>, now: number, ctx: SimContext): boolean {
  let any = false;
  while (tf.pending?.length && tf.pending[0]!.atSec <= now) {
    const p = tf.pending.shift()!;
    any = true;
    const before = Object.keys(tf.members);
    if (p.guide && squadrons[p.guide]) {
      tf.guide = p.guide;
      clearStation(squadrons[p.guide]!);
      tf.refCourse = squadrons[p.guide]!.course;
    }
    if (p.roles) Object.assign(tf.roles, p.roles);
    let ids = before;
    if (p.disposition !== undefined) {
      if (p.disposition === null) {
        for (const id of before) clearStation(squadrons[id]!);
        tf.members = {};
        delete tf.disposition;
        continue;
      }
      tf.disposition = p.disposition;
      // 配備を命じると、外れていた戦隊も含めて全部の戦隊が持ち場につく
      ids = taskForceChildren(tfId, squadrons, ctx);
      tf.refCourse = squadrons[tf.guide]?.course ?? tf.refCourse;
    }
    if (p.join) ids = [...new Set([...ids, ...p.join])];
    if (tf.disposition) assignStations(tfId, tf, ids, squadrons, byId, ctx);
  }
  if (tf.pending && tf.pending.length === 0) delete tf.pending;
  return any;
}

/**
 * 任務部隊の1刻み:届いた命令を効かせ、基準の戦隊の変針を信号で隷下へ伝え、役割で動く(水雷戦隊の突撃と帰投)。
 * levels は陣営ごとの今見えている敵の段階
 */
export function stepTaskForces(
  tfs: TaskForces,
  squadrons: Squadrons,
  byId: ReadonlyMap<string, Unit>,
  levels: Record<string, Record<string, number>>,
  now: number,
  dark: boolean,
  ctx: SimContext,
): TaskForceEvent[] {
  const r = rulesOf(ctx);
  if (!r) return [];
  const events: TaskForceEvent[] = [];
  for (const [tfId, tf] of Object.entries(tfs).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const guide = squadrons[tf.guide];
    const lead = guide ? squadronMembers(guide, byId)[0] : undefined;
    if (!guide || !lead) continue;
    if (settlePending(tfId, tf, squadrons, byId, now, ctx) && tf.disposition) events.push({ unitId: lead.id, type: "tfSignal", taskForce: tfId, what: "disposition" });
    // 変針の信号:基準の戦隊が courseChangeDeg を超えて変針したら、遅れて隷下に伝わる
    if (tf.signal && tf.signal.atSec <= now) {
      tf.refCourse = tf.signal.course;
      delete tf.signal;
      if (Object.keys(tf.members).length) events.push({ unitId: lead.id, type: "tfSignal", taskForce: tfId, what: "course" });
    }
    const diff = Math.abs(((guide.course - tf.refCourse + 540) % 360) - 180);
    if (!tf.signal && diff > r.signals.courseChangeDeg) {
      const delay = signalDelaySec(tf.side, dark, ctx);
      if (delay <= 0) tf.refCourse = guide.course;
      else tf.signal = { course: guide.course, atSec: now + delay };
    } else if (tf.signal && Math.abs(((guide.course - tf.signal.course + 540) % 360) - 180) > r.signals.courseChangeDeg) {
      // 信号の届く前にまた変針した:新しい針路で出し直す(届く時刻は前の信号のまま)
      tf.signal.course = guide.course;
    }
    // 役割:水雷戦隊の突撃と帰投
    for (const [id, m] of Object.entries(tf.members)) {
      const sq = squadrons[id];
      const role = r.roles[m.role];
      if (!sq || !role?.torpedoAttackM) continue;
      const ships = squadronMembers(sq, byId);
      const sl = ships[0];
      if (!sl) continue;
      const ready = torpedoesReady(ships, now, ctx);
      if (!m.sortie) {
        if (!ready) continue;
        const seen = [...byId.values()]
          .filter((e) => e.side !== sq.side && e.strength > 0 && isShip(e, ctx) && (levels[sq.side]?.[e.id] ?? 0) > 0 && distance(e.pos, sl.pos) <= role.torpedoAttackM!)
          .sort((a, b) => distance(a.pos, sl.pos) - distance(b.pos, sl.pos) || (a.id < b.id ? -1 : 1))[0];
        if (!seen) continue;
        const reach = torpedoReach(ships, ctx);
        delete sq.station;
        delete sq.follow;
        sq.engage = { target: seen.id, band: { minM: reach * role.torpedoBand.min, maxM: reach * role.torpedoBand.max } };
        sq.torpedoes = "turnAway";
        sq.speed = "battle";
        m.sortie = true;
        events.push({ unitId: sl.id, type: "tfSortie", taskForce: tfId, squadron: id });
      } else {
        const target = sq.engage ? byId.get(sq.engage.target) : undefined;
        if (ready && target && target.strength > 0) continue;
        delete sq.engage;
        m.sortie = false;
        takeStation(sq, m, tfId);
        events.push({ unitId: sl.id, type: "tfReturn", taskForce: tfId, squadron: id });
      }
    }
  }
  return events;
}

/** 持ち場の位置(基準の戦隊の先導の艦と、隷下が合わせている針路から) */
export function stationPointOf(tf: TaskForceState, slot: { bearingDeg: number; distM: number }, guideLead: Vec2): Vec2 {
  const rad = ((tf.refCourse + slot.bearingDeg) * Math.PI) / 180;
  return { x: guideLead.x + Math.sin(rad) * slot.distM, y: guideLead.y + Math.cos(rad) * slot.distM };
}

/** 艦隊の命令の陣営(戦隊か任務部隊の陣営。サーバーが人間の命令を選り分けるのに使う) */
export function seaOrderSide(state: { squadrons?: Squadrons; taskForces?: TaskForces }, id: string): string | undefined {
  return state.squadrons?.[id]?.side ?? state.taskForces?.[id]?.side;
}
