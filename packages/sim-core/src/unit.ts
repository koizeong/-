import type { Vec2 } from "./geometry.js";
import type { ConditionalOrder } from "./orders.js";
import type { RoutePoint } from "./pathfinding.js";

/** 縦隊 / 展開中 / 展開済み。攻撃できるのは展開済みだけ。 */
export type Formation = "column" | "deploying" | "deployed";

/** 行軍(速いが縦隊) / 戦闘移動(展開したまま、速度は行軍の約半分) */
export type MoveMode = "march" | "combat";

export interface Unit {
  readonly id: string;
  readonly side: string;
  /** 兵科ID(兵科パックのキー)。編成表の branch と一致させる */
  readonly branch: string;
  /** 編成表ID(編成パックのキー) */
  readonly toe: string;

  pos: Vec2;
  /** 正面の方位(度、北0・時計回り) */
  facing: number;
  formation: Formation;
  /** 展開中に経過した時間(秒)。1ターン分たまると展開済みになる */
  deployProgressSec: number;
  entrenchment: number;
  /** 姿勢ID(ルールパックの stances のキー) */
  stance: string;
  /** 切替中の姿勢。切替中のターンは defaultStance として扱う */
  pendingStance: string | null;
  /** 今の姿勢になってから(切替が終わってから)過ぎたターン数。効果の続くターン数の判定に使う */
  stanceTurns: number;
  /** 続けて包囲されているターン数(包囲が解ければ0)。包囲されている間は士気が回復しない */
  encircledTurns: number;
  /** 練度(ルールパックの training.levels のキー)。省略はルールパックの既定 */
  training?: string;
  /** 展開済みで動かずにいた累計時間(秒)。陣地の段はこの時間で決まる(動くと0) */
  dugInSeconds: number;

  /** 損害の3ゲージ(0〜1)。戦力・士気は1が満タン、制圧は0が無傷 */
  strength: number;
  suppression: number;
  morale: number;

  /** 疲労(0〜1、0が元気)。損害の3ゲージとは別の状態 */
  fatigue: number;

  /** 携行備蓄。編成表の上限に対する割合(0〜1) */
  ammo: number;
  fuel: number;
  /** 直近のターン終了時に、補給路で味方の集積所とつながっていたか */
  supplied: boolean;
  /** 潰走中(命令を受け付けず、撃たない) */
  routed: boolean;
  /** 撃って位置が露呈している(伏撃の見つかりにくさが効かない)。撃たずに1ターン過ごすと戻る */
  revealed: boolean;
  /** 前のターンに動いた(後手からの一撃の判定に使う) */
  movedLastTurn: boolean;

  // --- 命令(変更しない限り次ターンも保持する) ---
  /** 残りの経路(経由点の間は道路・地形から自動生成)。空なら停止 */
  route: RoutePoint[];
  moveMode: MoveMode;
  /** 到着後の正面方向。null なら進行方向のまま */
  facingOnArrival: number | null;
  /** 停止したら展開を始める。展開を始めた時点で消費する */
  deployAfterStop: boolean;
  /** 条件付き命令(1つまで)。発動すると消える */
  conditional: ConditionalOrder | null;
  /** 追撃している敵(この陣営から見た contactId)。目的地として扱い、解決のたびに経路を引き直す。なければ追撃していない */
  pursuing?: string;

  /** このユニット自身が接触している敵ユニットのID(新たな接触の判定用。クライアントには出さない) */
  inContactWith: string[];
}

export interface NewUnit {
  id: string;
  side: string;
  branch: string;
  toe: string;
  pos: Vec2;
  facing: number;
  stance: string;
  formation?: Formation;
  entrenchment?: number;
  /** 疲労。省略すると0(元気) */
  fatigue?: number;
  /** 練度(ルールパックの training.levels のキー)。省略はルールパックの既定 */
  training?: string;
  /** 戦力・士気。省略すると1(シナリオの開始前に消耗していた部隊用) */
  strength?: number;
  morale?: number;
  /** 携行備蓄の割合。省略すると満タン */
  ammo?: number;
  fuel?: number;
  moveMode?: MoveMode;
}

export function createUnit(u: NewUnit): Unit {
  return {
    id: u.id,
    side: u.side,
    branch: u.branch,
    toe: u.toe,
    pos: { ...u.pos },
    facing: u.facing,
    formation: u.formation ?? "column",
    deployProgressSec: 0,
    entrenchment: u.entrenchment ?? 0,
    stance: u.stance,
    pendingStance: null,
    stanceTurns: 0,
    encircledTurns: 0,
    ...(u.training !== undefined ? { training: u.training } : {}),
    dugInSeconds: 0,
    strength: u.strength ?? 1,
    suppression: 0,
    morale: u.morale ?? 1,
    fatigue: u.fatigue ?? 0,
    ammo: u.ammo ?? 1,
    fuel: u.fuel ?? 1,
    supplied: true,
    routed: false,
    revealed: false,
    movedLastTurn: false,
    route: [],
    moveMode: u.moveMode ?? "march",
    facingOnArrival: null,
    deployAfterStop: false,
    conditional: null,
    inContactWith: [],
  };
}

export function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    pos: { ...u.pos },
    route: u.route.map((p) => ({ ...p })),
    conditional: u.conditional === null ? null : structuredClone(u.conditional),
    inContactWith: [...u.inContactWith],
  };
}

/** 攻撃できるのは展開済みのユニットだけ(設計ルール10)。縦隊・展開中は攻撃できない。潰走中も撃たない */
export function canAttack(u: Unit): boolean {
  return u.formation === "deployed" && !u.routed;
}
