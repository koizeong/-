import type { SimContext } from "../context.js";
import type { Vec2 } from "../geometry.js";
import type { AirForce, AirMissionKind } from "./rules.js";
import { cycleMinutes, freeAircraft, pickSquadron, squadronSpec, type AirForceState, type AirTask } from "./plan.js";

/**
 * 要請(docs/air-design.md)。ユーザー判断で、要請はすべて即応(予約はやめた):
 * 攻撃(onCall。前の予約の攻撃 support も同じ)・偵察(recon)・空輸(airlift)を、今すぐ、出せる機の編隊が基地から飛び立つ。
 * 戦場に着くのは基地からの行きの時間の後。出せる機がない・飛べなければ断る。
 * 攻撃の編隊には、出せる戦闘機が護衛として自動で付く。要請は1日の枠を使う(枠を書いたシナリオだけ。指揮ポイントとは別。断られても使う)。
 * 前の予約(scheduled)は古い記録のためにだけ残す(launchScheduled)
 */

export type AirRequestKind = "support" | "onCall" | "recon" | "airlift";

export interface AirRequest {
  id: string;
  kind: AirRequestKind;
  target: Vec2;
  /** 予約の来てほしいターン */
  turn?: number;
  /** 空輸を受け取る部隊 */
  unitId?: string;
  /** accepted:即応で飛んだ、scheduled:予約がそのターンを待っている、flown:予約が飛んだ、refused:断られた、cancelled:予約が取りやめになった */
  status: "accepted" | "scheduled" | "flown" | "refused" | "cancelled";
  reason?: string;
  /** 応える出撃 */
  taskIds: string[];
  /** 戦場の上に着く時刻(秒) */
  etaSec?: number;
}

/** 要請の種類から任務 */
export function requestMission(kind: AirRequestKind): AirMissionKind {
  return kind === "recon" ? "recon" : kind === "airlift" ? "airlift" : "support";
}

/** 出撃を作る(攻撃なら、出せる戦闘機を護衛に付ける)。作った出撃を返す */
export function makeSortie(
  force: AirForce,
  st: AirForceState,
  mission: AirMissionKind,
  squadron: string,
  aircraft: number,
  onStationSec: number,
  id: string,
  ctx: SimContext,
  extra: Partial<Pick<AirTask, "target" | "requestId" | "chase" | "escortOf" | "unitId">> = {},
): AirTask {
  const { station } = cycleMinutes(force, squadron, ctx);
  const task: AirTask = { id, force: force.id, squadron, mission, aircraft, onStationSec, offStationSec: onStationSec + station * 60, ...extra };
  st.sorties.push(task);
  if (mission === "support" || mission === "armedRecon") {
    const fighter = pickSquadron(force, st, "escort", onStationSec, ctx);
    if (fighter) {
      const size = squadronSpec(force, fighter.id, ctx).role?.flightSize ?? 4;
      const esc = Math.min(fighter.free, size);
      const { station: es } = cycleMinutes(force, fighter.id, ctx);
      st.sorties.push({ id: `${id}:esc`, force: force.id, squadron: fighter.id, mission: "escort", aircraft: esc, onStationSec, offStationSec: onStationSec + es * 60, escortOf: id, ...(extra.target ? { target: { ...extra.target } } : {}) });
    }
  }
  return task;
}

/** 出せる飛行隊から1編隊を出す(なければ null) */
function launchFor(force: AirForce, st: AirForceState, req: AirRequest, onStationOf: (squadron: string) => number, t: number, ctx: SimContext, pick = pickSquadron(force, st, requestMission(req.kind), t, ctx)): AirTask | null {
  const mission = requestMission(req.kind);
  if (!pick) return null;
  const size = squadronSpec(force, pick.id, ctx).role?.flightSize ?? 4;
  return makeSortie(force, st, mission, pick.id, Math.min(pick.free, size), onStationOf(pick.id), req.id, ctx, {
    target: { ...req.target },
    requestId: req.id,
    ...(req.unitId !== undefined ? { unitId: req.unitId } : {}),
  });
}

/** 要請を受ける(すべて即応:その場で飛ぶか断る。turn は見ない) */
export function decideRequest(
  force: AirForce,
  st: AirForceState,
  req: { kind: AirRequestKind; target: Vec2; turn?: number; unitId?: string },
  id: string,
  now: { turn: number; turnStartSec: number; timeSec: number },
  ctx: SimContext,
  /** 飛べない理由(飛べれば null) */
  flyable: (squadron: string) => string | null = () => null,
): AirRequest {
  const { turn: _turn, ...body } = req;
  const out: AirRequest = { id, ...body, status: "refused", taskIds: [] };
  const mission = requestMission(req.kind);
  const pick = pickSquadron(force, st, mission, now.timeSec, ctx);
  const blocked = pick ? flyable(pick.id) : null;
  if (blocked) {
    out.reason = blocked;
    return out;
  }
  const task = launchFor(force, st, out, (sq) => now.timeSec + cycleMinutes(force, sq, ctx).transit * 60, now.timeSec, ctx, pick);
  if (!task) {
    out.reason = mission === "recon" ? "出せる偵察機がない" : mission === "airlift" ? "出せる輸送機がない" : "出せる攻撃機がない";
    return out;
  }
  out.status = "accepted";
  out.taskIds = [task.id];
  out.etaSec = task.onStationSec;
  return out;
}

/**
 * そのターンの予約を飛ばす(ターンの始め)。昼で、戦場と基地の天候が飛べて、出せる機があれば飛ぶ。だめなら取りやめ。
 * 戦場に着くのはターンの始め(行きは前もって済ませておく)
 */
export function launchScheduled(
  force: AirForce,
  st: AirForceState,
  turn: number,
  turnStartSec: number,
  flyable: (squadron: string) => string | null,
  ctx: SimContext,
): AirRequest[] {
  const changed: AirRequest[] = [];
  for (const r of st.requests) {
    if (r.status !== "scheduled" || (r.turn ?? 0) > turn) continue;
    const mission = requestMission(r.kind);
    const pick = pickSquadron(force, st, mission, turnStartSec, ctx);
    const blocked = pick ? flyable(pick.id) : null;
    if (!pick || blocked) {
      r.status = "cancelled";
      r.reason = !pick ? "出せる機がない" : blocked!;
      changed.push(r);
      continue;
    }
    const task = launchFor(force, st, r, () => turnStartSec, turnStartSec, ctx, pick)!;
    r.status = "flown";
    r.taskIds = [task.id];
    r.etaSec = task.onStationSec;
    changed.push(r);
  }
  return changed;
}

/** 戦場の上に着くまでの分(基地からの行き) */
export function transitMinutes(force: AirForce, squadronId: string, ctx: SimContext): number {
  return cycleMinutes(force, squadronId, ctx).transit;
}

export { freeAircraft };
