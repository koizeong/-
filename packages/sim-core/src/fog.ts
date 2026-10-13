import { contactView, type ContactView } from "./intel.js";
import type { DetectionLevel } from "./detection.js";
import type { GameState, TrackPoint, TurnEvent, TurnResult } from "./turn.js";
import type { Depot } from "./depot.js";
import type { FireMission } from "./hq.js";
import type { Unit } from "./unit.js";

/**
 * 霧のフィルタ(設計ルール3)。サーバーはこれを通したものだけをクライアントに送る。
 * 敵ユニットの本当のIDは出さず、陣営ごとの contactId に置き換える。
 */
/** 自軍ユニット。敵の本当のIDを含む内部項目は外す */
export type OwnUnitView = Omit<Unit, "inContactWith">;

export interface SideView {
  side: string;
  turn: number;
  time: number;
  own: OwnUnitView[];
  /** 自軍の集積所だけ。敵の集積所は見せない */
  depots: Depot[];
  /** 自陣営が予約した砲撃 */
  fireMissions: FireMission[];
  contacts: ContactView[];
}

export function viewForSide(state: GameState, side: string): SideView {
  const entries = state.intel[side]?.entries ?? {};
  return {
    side,
    turn: state.turn,
    time: state.time,
    own: state.units
      .filter((u) => u.side === side)
      .map(({ inContactWith: _hidden, ...rest }) => structuredClone(rest)),
    depots: state.depots.filter((d) => d.side === side).map((d) => ({ ...d })),
    fireMissions: state.fireMissions.filter((m) => m.side === side).map((m) => ({ ...m, target: { ...m.target } })),
    contacts: Object.values(entries)
      .map(contactView)
      .sort((a, b) => (a.contactId < b.contactId ? -1 : 1)),
  };
}

export interface ContactTrackPoint {
  t: number;
  x: number;
  y: number;
  level: DetectionLevel;
  /** 規模まで見えているときだけ */
  facing?: number;
}

export interface SideReplay {
  /** 自軍ユニットの軌跡(ユニットIDごと) */
  own: Record<string, TrackPoint[]>;
  /** 敵の軌跡(contactIdごと)。見えていた瞬間の点だけを含む */
  contacts: Record<string, ContactTrackPoint[]>;
  /** 自軍ユニットのイベントだけ */
  events: TurnEvent[];
}

export function replayForSide(result: TurnResult, side: string): SideReplay {
  const { state } = result;
  const ownIds = new Set(state.units.filter((u) => u.side === side).map((u) => u.id));
  const own: SideReplay["own"] = {};
  const contacts: SideReplay["contacts"] = {};
  const entries = state.intel[side]?.entries ?? {};
  const levels = result.detections[side] ?? {};

  for (const [unitId, track] of Object.entries(result.tracks)) {
    if (ownIds.has(unitId)) {
      own[unitId] = track.map((p) => ({ ...p }));
      continue;
    }
    const entry = entries[unitId];
    const perStep = levels[unitId];
    if (!entry || !perStep) continue;
    const points: ContactTrackPoint[] = [];
    track.forEach((p, i) => {
      const level = perStep[i] ?? 0;
      if (level === 0) return;
      const point: ContactTrackPoint = { t: p.t, x: p.x, y: p.y, level };
      if (level >= 3) point.facing = p.facing;
      points.push(point);
    });
    if (points.length) contacts[entry.contactId] = points;
  }
  return { own, contacts, events: result.events.filter((e) => ownIds.has(e.unitId)) };
}
