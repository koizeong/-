import { contactView, type ContactView } from "./intel.js";
import type { DetectionLevel } from "./detection.js";
import type { GameState, HqEvent, PublicEvent, TrackPoint, TurnEvent, TurnResult } from "./turn.js";
import type { Depot } from "./depot.js";
import type { AirMission, FireMission } from "./hq.js";
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
  /** 自陣営が予約した空襲・空輸と、今日の残りの出撃回数 */
  airMissions: AirMission[];
  airSortiesLeft: { airStrike: number; airDrop: number };
  /** 目標地点の保持陣営(両陣営に公開) */
  objectives: Record<string, string | null>;
  /** これから解決するターンの天候(両陣営に公開) */
  weather: string;
  /** これから解決するターンが昼か夜か(両陣営に公開) */
  phase: "day" | "night";
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
    objectives: { ...state.objectives },
    weather: state.weather.current,
    phase: state.phase,
    airMissions: state.airMissions.filter((m) => m.side === side).map((m) => ({ ...m, target: { ...m.target } })),
    airSortiesLeft: { ...(state.airSortiesLeft[side] ?? { airStrike: 0, airDrop: 0 }) },
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

/** 撃ち合いの1回分(この陣営から見えたもの)。out は自軍が撃った、in は自軍が撃たれた(撃った敵が見えていたときだけ) */
export interface ReplayShot {
  t: number;
  dir: "out" | "in";
  ownId: string;
  /** 相手の contactId(霧の内側の呼び名) */
  contactId: string | null;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** 着弾(この陣営から見えたもの) */
export interface ReplayImpact {
  t: number;
  kind: "artillery" | "air";
  /** 自陣営が要請したものか */
  own: boolean;
  x: number;
  y: number;
  radiusM: number;
}

export interface SideReplay {
  /** 自軍ユニットの軌跡(ユニットIDごと) */
  own: Record<string, TrackPoint[]>;
  /** 敵の軌跡(contactIdごと)。見えていた瞬間の点だけを含む */
  contacts: Record<string, ContactTrackPoint[]>;
  /** 自軍ユニットのイベントだけ */
  events: TurnEvent[];
  /** 両陣営に公開のイベント(目標の奪取など) */
  publicEvents: PublicEvent[];
  /** 自陣営の司令部コマンドの結果 */
  hqEvents: HqEvent[];
  /** 撃ち合い(線の表示用) */
  shots: ReplayShot[];
  /** 砲撃・空襲の着弾(見えたものだけ) */
  impacts: ReplayImpact[];
}

export function replayForSide(result: TurnResult, side: string): SideReplay {
  const { state } = result;
  // このターンに除去された自軍ユニットの軌跡とイベントも自陣営には見せる
  const ownIds = new Set([...state.units, ...result.destroyed].filter((u) => u.side === side).map((u) => u.id));
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
  // 撃ち合い:小ステップの時刻で、その時点の位置を軌跡から引く
  const posAt = (unitId: string, t: number) => result.tracks[unitId]?.find((p) => p.t === t);
  const stepIndex = (unitId: string, t: number) => result.tracks[unitId]?.findIndex((p) => p.t === t) ?? -1;
  const shots: ReplayShot[] = [];
  for (const s of result.shots) {
    const a = posAt(s.attackerId, s.t);
    const b = posAt(s.targetId, s.t);
    if (!a || !b) continue;
    if (ownIds.has(s.attackerId)) {
      shots.push({ t: s.t, dir: "out", ownId: s.attackerId, contactId: entries[s.targetId]?.contactId ?? null, from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } });
    } else if (ownIds.has(s.targetId)) {
      // 撃った敵が、その瞬間に見えていたときだけ線を出す(見えていなければ、撃たれた事実だけが hit イベントで伝わる)
      const seen = (levels[s.attackerId]?.[stepIndex(s.attackerId, s.t)] ?? 0) > 0;
      if (!seen) continue;
      shots.push({ t: s.t, dir: "in", ownId: s.targetId, contactId: entries[s.attackerId]?.contactId ?? null, from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } });
    }
  }
  const impacts: ReplayImpact[] = result.impacts
    .filter((i) => i.seenBy.includes(side))
    .map((i) => ({ t: i.t, kind: i.kind, own: i.side === side, x: i.x, y: i.y, radiusM: i.radiusM }));
  return { own, contacts, events: result.events.filter((e) => ownIds.has(e.unitId)),
    publicEvents: [...result.publicEvents],
    hqEvents: result.hqEvents.filter((e) => e.side === side),
    shots,
    impacts,
  };
}
