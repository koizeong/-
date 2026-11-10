import type { Hull } from "./sea/damage.js";
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
  /** 潰走した回数(潰走を重ねた部隊は、立ち直れる士気の上限が下がる。morale.routCeilingLoss) */
  routs?: number;
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
  /** 前のターンに撃たれた(直接射撃・砲撃・空襲のどれでも。損害を受けたとき)。対砲兵戦の決まりで、砲撃の要請を止める */
  underFire?: boolean;

  // --- 命令(変更しない限り次ターンも保持する) ---
  /** 残りの経路(経由点の間は道路・地形から自動生成)。空なら停止 */
  route: RoutePoint[];
  moveMode: MoveMode;
  /** 到着後の正面方向。null なら進行方向のまま */
  facingOnArrival: number | null;
  /** 停止したら展開を始める。展開を始めた時点で消費する */
  deployAfterStop: boolean;
  /** 前線の印を出している(司令部コマンド airMark。味方の編隊の誤射が減り、敵の編隊に見つかりやすい) */
  airMarked?: boolean;
  /** 条件付き命令(1つまで)。発動すると消える */
  conditional: ConditionalOrder | null;
  /** 追撃している敵(この陣営から見た contactId)。目的地として扱い、解決のたびに経路を引き直す。なければ追撃していない */
  pursuing?: string;
  /**
   * 残っている耐久のうち、装甲の部分の割合(装甲と非装甲を分けて持つ編成表だけ。省略は満員のときの割合)。
   * 機関銃で随伴歩兵が削られると上がり、対戦車の武器で戦車が削られると下がる
   */
  armoredShare?: number;

  /** このユニット自身が接触している敵ユニットのID(新たな接触の判定用。クライアントには出さない) */
  inContactWith: string[];

  /** 艦艇の戦隊の陣形(ルールパックの naval.formations のキー)。省略はルールパックの既定 */
  navalFormation?: string;
  /** 変えている途中の陣形と、変え終わるまでの残り時間(秒)。変えている間は前の陣形のまま */
  navalChange?: { to: string; leftSec: number };
  /** 魚雷を撃った時間の合計(秒)。naval.torpedoSalvoMinutes に達すると撃ち尽くし */
  torpedoSecUsed?: number;
  /** 航空隊の様子(編成表の air を持つユニット) */
  air?: AirState;
  /** 1隻ずつの艦の損傷(火災・浸水・失った砲の割合。0〜1)。砲戦(naval.gunnery)で起きる */
  shipDamage?: { fire: number; flooding: number; gunsLost: number; powerOut?: number };
  /** 艦の状態(当たった場所ごとの損害。docs/naval-design.md の6) */
  hull?: Hull;
  /** 艦の射撃の解(砲の武器ごとの目標と解。docs/naval-design.md の5) */
  fc?: Record<string, { target: string; solution: number }>;
  /** 空母の飛行甲板がふさがっている残り(秒。発艦・着艦の順番待ち) */
  deckBusySec?: number;
  /** 戦隊を離れている艦(落伍したか、命令で切り離した)。旗艦について行かず、自分への命令で動く */
  detached?: boolean;
  /** 走る魚雷の残りの斉射の数と、次に撃てる時刻(秒)。省略は撃っていない(1 + 次発装填の数が残っている) */
  torpedoLoad?: { salvosLeft: number; readyAt: number };
  /** 艦の射撃の修正:撃ち続けている目標と、撃ち続けた時間(分) */
  ranging?: { targetId: string; minutes: number };
  /** 艦の、前の刻みに出していた速さ(m/秒)。航跡の見つかりやすさに使う(naval.sighting.wake) */
  speedMps?: number;
  /** 艦が電探で追っている敵の艦と、追った時間(分)。見分けるまで撃たない(naval.identification) */
  identifying?: Record<string, number>;
  /** 艦の主砲・副砲の残りの弾(武器ごとの徹甲弾・榴弾の数)。編成表の batteries の apPerGun・hePerGun から始め、砲戦で減る */
  shells?: Record<string, { ap: number; he: number }>;
  /** 揚弾している弾が榴弾(対地砲撃のため)。艦を撃ち始めると、naval.gunnery.ammo.switchMinutes の間撃ってから徹甲弾に替わる。数は替えた残りの分(分) */
  heLoaded?: number;
  /** 艦が探照灯で照らされている(この刻みだけ) */
  illuminated?: boolean;
  /** 艦の哨戒:経路を使い切ったら、次の哨戒点へ向かう(繰り返し)。命令を受けるとやめる。next は次に向かう点の番号 */
  patrol?: { points: Vec2[]; next: number };
  /** 戦闘配置についていない艦(naval.battleStations)。alarmed は敵を見つけて配置につきはじめた、minutes は残りの時間(分) */
  unready?: { alarmed: boolean; minutes: number };
  /** 雷跡を見て避けている(避けている斉射、いつまで、終わったら戻す命令) */
  /** 大破して戦列を離れた(1隻に1度だけ。naval.crew.breakOffBelow) */
  brokeOff?: boolean;
  /** 雷撃して反転を命じられている(撃ったら敵から離れる。OrderBody.torpedoTurnAway) */
  torpedoTurnAway?: boolean;
  combing?: { salvoId: string; untilSec: number; heading: number };
}

/** 航空隊の様子。母艦(艦艇の戦隊)か陸の飛行場を基地にする */
export interface AirState {
  /** 母艦の ID。省略は陸の飛行場 basePos */
  baseId?: string;
  basePos?: Vec2;
  /** ready=発進できる / spotting=甲板に並べて発艦を待つ / outbound=目標へ / attacking=攻撃中 / returning=帰投中 / rearming=積み直し中 / cap=上空直衛 / searching=索敵 */
  status: "ready" | "spotting" | "outbound" | "attacking" | "returning" | "rearming" | "cap" | "searching";
  /** 発艦を待っている命令と、発艦までの残り(秒) */
  pending?: { kind: "strike"; targetId: string; point: Vec2 } | { kind: "cap"; over: string } | { kind: "search"; point: Vec2 };
  launchInSec?: number;
  /** 爆弾・魚雷を落とした(この出撃では、もう落とさない) */
  delivered?: boolean;
  /** 攻撃する敵の ID(strike) */
  targetId?: string;
  /** 上空直衛で守る味方の ID(cap) */
  overId?: string;
  /** 行き先(strike は最後に知った目標の位置、search は索敵の地点) */
  point?: Vec2;
  /** 攻撃の残り時間(秒) */
  attackLeftSec?: number;
  /** 積み直しが終わる時刻(秒) */
  readyAt?: number;
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
  /** 艦艇の戦隊の陣形。省略はルールパックの既定 */
  navalFormation?: string;
  /** 航空隊の基地(母艦の ID か陸の飛行場の位置)。航空隊だけ */
  air?: { baseId?: string; basePos?: Vec2 };
  /** 揚弾している榴弾(残りの分) */
  heLoaded?: number;
  /** 艦の魚雷の残り(シナリオで次発装填の数を書いたとき) */
  torpedoLoad?: { salvosLeft: number; readyAt: number };
  /** 艦の哨戒の点(繰り返し) */
  patrol?: Vec2[];
  /** 戦闘配置についていない */
  unready?: { alarmed: boolean; minutes: number };
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
    ...(u.navalFormation !== undefined ? { navalFormation: u.navalFormation } : {}),
    ...(u.heLoaded !== undefined ? { heLoaded: u.heLoaded } : {}),
    ...(u.torpedoLoad ? { torpedoLoad: { ...u.torpedoLoad } } : {}),
    ...(u.unready ? { unready: { ...u.unready } } : {}),
    ...(u.patrol && u.patrol.length > 0 ? { patrol: { points: u.patrol.map((p) => ({ ...p })), next: 0 }, moveMode: "combat" as const } : {}),
    ...(u.air ? { air: { ...u.air, ...(u.air.basePos ? { basePos: { ...u.air.basePos } } : {}), status: "ready" as const } } : {}),
  };
}

export function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    pos: { ...u.pos },
    route: u.route.map((p) => ({ ...p })),
    conditional: u.conditional === null ? null : structuredClone(u.conditional),
    inContactWith: [...u.inContactWith],
    ...(u.navalChange ? { navalChange: { ...u.navalChange } } : {}),
    ...(u.air ? { air: structuredClone(u.air) } : {}),
    ...(u.shipDamage ? { shipDamage: { ...u.shipDamage } } : {}),
    ...(u.hull ? { hull: structuredClone(u.hull) } : {}),
    ...(u.fc ? { fc: structuredClone(u.fc) } : {}),
    ...(u.ranging ? { ranging: { ...u.ranging } } : {}),
    ...(u.torpedoLoad ? { torpedoLoad: { ...u.torpedoLoad } } : {}),
    ...(u.identifying ? { identifying: { ...u.identifying } } : {}),
    ...(u.unready ? { unready: { ...u.unready } } : {}),
    ...(u.patrol ? { patrol: { points: u.patrol.points.map((p) => ({ ...p })), next: u.patrol.next } } : {}),
    ...(u.combing ? { combing: structuredClone(u.combing) } : {}),
    ...(u.shells ? { shells: Object.fromEntries(Object.entries(u.shells).map(([k, v]) => [k, { ...v }])) } : {}),
  };
}

/** 攻撃できるのは展開済みのユニットだけ(設計ルール10)。縦隊・展開中は攻撃できない。潰走中も撃たない */
export function canAttack(u: Unit): boolean {
  return u.formation === "deployed" && !u.routed;
}
