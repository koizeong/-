import { contactView, type ContactView } from "./intel.js";
import type { DetectionLevel } from "./detection.js";
import type { GameState, HqEvent, PublicEvent, StrikeReport, TrackPoint, TurnEvent, TurnResult } from "./turn.js";
import type { Factor } from "./combat.js";
import type { Aspect } from "./facing.js";
import type { Depot } from "./depot.js";
import type { AirMission, AirPools, FireMission, Interdiction, NavalMission } from "./hq.js";
import type { SupplyRoute } from "./resupply.js";
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
  /** 自陣営の「死守の重み」(次のターンの始めの値) */
  lastStand: number;
  /** 自陣営の損耗率(正確な値)。敵の損耗率は見せない(霧の内側から estimateEnemyLoss で見積もる) */
  ownLoss: number;
  /** 自陣営が予約した空襲・空輸と、今日の残りの出撃回数 */
  airMissions: AirMission[];
  airSortiesLeft: AirPools;
  /** 自陣営の残りの編隊の数 */
  airGroups: { fighters: number; attack: number };
  /** 空域ごとの自陣営の制空権の割合(0〜1。両陣営に公開の情報)。airSectorKeys の順(南の行から、西から東へ) */
  airControl: number[];
  /** 自陣営の補給線への攻撃で、効果が続いているもの */
  interdictions: Interdiction[];
  /** 自陣営の、待機中の空挺部隊のID */
  airborneReady: string[];
  /** 自陣営が予約した艦砲射撃と、今日の残りの回数 */
  navalMissions: NavalMission[];
  navalLeft: number;
  /** 自軍ユニットの補給路(ユニットID → 補給路。つながっていたユニットだけ) */
  supplyRoutes: Record<string, SupplyRoute>;
  /** 今日の残りの斥候の回数(省略は満タン = ルールパックの patrol.perDay) */
  patrolsLeft?: number;
  /** 自陣営が引いた秘密の副目標の ID(シナリオの secretPool から)。相手の分は見せない */
  secrets?: string[];
  /** 目標地点の保持陣営(両陣営に公開) */
  objectives: Record<string, string | null>;
  /** これから解決するターンの天候(両陣営に公開) */
  weather: string;
  /** これから解決するターンが昼か夜か(両陣営に公開) */
  phase: "day" | "night";
  /** 橋(ID → 壊れているか。両陣営に公開)。自陣営が修理している橋だけ、進んだ時間(秒)も */
  bridges: Record<string, { destroyed: boolean; repairSec?: number }>;
  /** 地面の状態(ぬかるみ・積雪。0〜1。両陣営に公開) */
  ground: { mud: number; snow: number };
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
    ground: { ...(state.ground ?? { mud: 0, snow: 0 }) },
    bridges: Object.fromEntries(
      Object.entries(state.bridges ?? {}).map(([id, b]) => [id, { destroyed: b.destroyed, ...(b.repair?.side === side ? { repairSec: b.repair.progressSec } : {}) }]),
    ),
    airMissions: state.airMissions.filter((m) => m.side === side).map((m) => ({ ...m, target: { ...m.target } })),
    airSortiesLeft: { fighter: 0, attack: 0, transport: 0, ...state.airSortiesLeft[side] },
    airGroups: { fighters: 0, attack: 0, ...state.airGroups[side] },
    airControl: Object.keys(state.airControl)
      .sort((p, q) => {
        const [pc, pr] = p.split(",").map(Number);
        const [qc, qr] = q.split(",").map(Number);
        return pr! - qr! || pc! - qc!;
      })
      .map((k) => state.airControl[k]![side] ?? 0),
    interdictions: state.interdictions.filter((x) => x.side === side).map((x) => ({ ...x, target: { ...x.target } })),
    airborneReady: [...(state.airborneReady[side] ?? [])],
    navalMissions: state.navalMissions.filter((m) => m.side === side).map((m) => ({ ...m, target: { ...m.target } })),
    navalLeft: state.navalLeft[side] ?? 0,
    supplyRoutes: Object.fromEntries(
      Object.entries(state.supplyRoutes)
        .filter(([id]) => state.units.some((u) => u.id === id && u.side === side))
        .map(([id, r]) => [id, { ...r, edges: [...r.edges] }]),
    ),
    ...(state.patrolsLeft[side] !== undefined ? { patrolsLeft: state.patrolsLeft[side] } : {}),
    ...(state.secrets?.[side] ? { secrets: [...state.secrets[side]] } : {}),
    fireMissions: state.fireMissions.filter((m) => m.side === side).map((m) => ({ ...m, target: { ...m.target } })),
    lastStand: state.lastStand[side] ?? 0,
    ownLoss: state.ownLoss[side] ?? 0,
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

/**
 * 敵に与えた損害の目安。敵の正確な戦力は霧の内側なので、段階でだけ伝える
 * (slight:0.3%未満 / light:0.3〜1% / moderate:1〜3% / heavy:3%以上。1ターン・1組あたり、部隊の戦力に対する割合。
 * 1時間の撃ち合いで連隊が失うのは多くて数%なので、その幅で差が見えるように刻む)
 */
export type LossBand = "slight" | "light" | "moderate" | "heavy";
export function lossBand(x: number): LossBand {
  return x < 0.003 ? "slight" : x < 0.01 ? "light" : x < 0.03 ? "moderate" : "heavy";
}

/**
 * 撃ち合いの組(この陣営から見えたもの)。
 * out:自軍が撃った。与えた損害は段階だけ、かかった倍率は全部(自分の工夫の結果なので見せる)
 * in:自軍が撃たれた。受けた損害は正確に、撃たれた面も見せる(撃った敵が見えていなければ contactId は null)
 */
export type SideEngagement =
  | { dir: "out"; ownId: string; contactId: string | null; dealt: LossBand; aspect: Aspect; situational: Factor[] }
  | { dir: "in"; ownId: string; contactId: string | null; strength: number; morale: number; aspect: Aspect };

/** 砲撃・空襲などの結果(この陣営から見えたもの) */
export interface SideStrike {
  /** 自陣営が要請したものか(敵のものは、自軍が損害を受けたときだけ見える) */
  own: boolean;
  kind: StrikeReport["kind"];
  target: { x: number; y: number };
  /** 撃った砲兵・支援した部隊(自陣営のものだけ) */
  unitId?: string;
  /** 効果にかかった倍率(制空権・対空砲。自陣営のものだけ) */
  effect: Factor[];
  /** 損害を受けた自軍の部隊(正確な値。味方への誤射を含む) */
  ownHits: { unitId: string; strength: number; morale: number }[];
  /** 損害を与えた敵(見えている・前に見た敵だけ。段階で) */
  enemyHits: { contactId: string; dealt: LossBand }[];
  /** 見えていない敵にも当たったか(何に当たったかは分からない) */
  unobservedHits: boolean;
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
  /** このターンの撃ち合いの組ごとの結果 */
  engagements: SideEngagement[];
  /** このターンの砲撃・空襲などの結果 */
  strikes: SideStrike[];
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
  const seenDuringTurn = (unitId: string) => (levels[unitId] ?? []).some((l) => l > 0);
  const engagements: SideEngagement[] = [];
  for (const e of result.engagements ?? []) {
    if (ownIds.has(e.attackerId) && !ownIds.has(e.targetId)) {
      engagements.push({ dir: "out", ownId: e.attackerId, contactId: entries[e.targetId]?.contactId ?? null, dealt: lossBand(e.strength), aspect: e.aspect, situational: e.situational.map((f) => ({ ...f })) });
    } else if (ownIds.has(e.targetId) && !ownIds.has(e.attackerId)) {
      const contactId = seenDuringTurn(e.attackerId) ? (entries[e.attackerId]?.contactId ?? null) : null;
      engagements.push({ dir: "in", ownId: e.targetId, contactId, strength: e.strength, morale: e.morale, aspect: e.aspect });
    }
  }
  const strikes: SideStrike[] = [];
  for (const r of result.strikes ?? []) {
    const mine = r.side === side;
    const ownHits = r.hits.filter((h) => ownIds.has(h.unitId)).map((h) => ({ ...h }));
    if (!mine && ownHits.length === 0) continue;
    const enemy = mine ? r.hits.filter((h) => !ownIds.has(h.unitId)) : [];
    strikes.push({
      own: mine,
      kind: r.kind,
      target: { ...r.target },
      ...(mine && r.unitId ? { unitId: r.unitId } : {}),
      effect: mine ? r.effect.map((f) => ({ ...f })) : [],
      ownHits,
      enemyHits: enemy.filter((h) => entries[h.unitId]).map((h) => ({ contactId: entries[h.unitId]!.contactId, dealt: lossBand(h.strength) })),
      unobservedHits: enemy.some((h) => !entries[h.unitId]),
    });
  }
  return { own, contacts, events: result.events.filter((e) => ownIds.has(e.unitId)),
    engagements,
    strikes,
    publicEvents: [...result.publicEvents],
    hqEvents: result.hqEvents.filter((e) => e.side === side),
    shots,
    impacts,
  };
}
