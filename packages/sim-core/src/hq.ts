import { armorNow, armoredDamageFraction } from "./armor.js";
import type { SimContext } from "./context.js";
import { fatigueFirepowerMultiplier } from "./fatigue.js";
import { isDarkTurn, isNightTurn } from "./scenario.js";
import { frontCoverage, frontOf } from "./frontage.js";
import { bearing, distance, type Vec2 } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeFire, toeHitPoints, toeIndirectAmmoPerMin, toeIndirectMaxRange, weaponEffectAgainst } from "./toe.js";
import { moraleStateDamageTaken, suppressionFirepowerMultiplier, type FireResult } from "./combat.js";
import { canAttack, type Unit } from "./unit.js";
import { terrainSpeed } from "./pathfinding.js";
import { findBridges, nearBridge, type BridgeStates } from "./bridges.js";

/**
 * 司令部コマンド:陣営の司令部が、隷下のリソースを前線に投下する。
 * ユニットへの命令(設計ルール9)とは別枠。近接航空支援は要請したターンのうちに、ほかは次のターンに実行する。
 */
export type HqCommand =
  | {
      side: string;
      /** 砲撃:自陣営の砲兵ユニットに撃たせる */
      type: "fireMission";
      unitId: string;
      /** 着弾地点 */
      target: Vec2;
    }
  | {
      side: string;
      /** 空襲(マップ外の航空戦力。攻撃機の枠を1使う)。天候が航空を許さなければ中止 */
      type: "airStrike";
      target: Vec2;
      /** 護衛に付ける戦闘機の出撃数(戦闘機の枠を使う。省略は0) */
      escort?: number;
    }
  | {
      side: string;
      /** 空輸(投下地点の近くの自軍に弾薬・燃料を配る)。天候が航空を許さなければ中止 */
      type: "airDrop";
      target: Vec2;
    }
  | {
      side: string;
      /** 斥候:unitId の部隊から小部隊を出し、target のまわりを探る。このターンのうちに、距離に応じて遅れて結果が出る */
      type: "patrol";
      unitId: string;
      target: Vec2;
    }
  | {
      side: string;
      /** 航空偵察(戦闘機の枠を1使う):次のターンのどこかの時刻に、target のまわりを撮影する。天候が航空を許さなければ中止 */
      type: "airRecon";
      target: Vec2;
    }
  | {
      side: string;
      /**
       * 制空任務(戦闘機の枠を1使う)。次のターンに、target を含む空域の制空権を自陣営へ動かす。
       * 同じ空域に敵の戦闘機がいれば空戦になり、双方が編隊を失う。天候が航空を許さなければ中止
       */
      type: "airSuperiority";
      target: Vec2;
    }
  | {
      side: string;
      /**
       * 補給線への攻撃(攻撃機の枠を1使う)。次のターンに、target のまわりの道路の輸送力を一定時間下げ、
       * そこを行軍中の敵の縦隊を叩く。天候が航空を許さなければ中止
       */
      type: "interdiction";
      target: Vec2;
      escort?: number;
    }
  | {
      side: string;
      /** 艦砲射撃(マップ外の艦船)。次のターンに1ターンかけて着弾する。海から一定距離以内にだけ届く */
      type: "navalGunfire";
      target: Vec2;
    }
  | {
      side: string;
      /** 空挺降下:待機中の空挺部隊 unitId を、次のターンの始めに target のまわりへ降ろす。天候が航空を許さなければ中止 */
      type: "airborneDrop";
      unitId: string;
      target: Vec2;
    }
  | {
      side: string;
      /** 近接航空支援(攻撃機の枠を1使う)。このターンのうちに飛来し、unitId の味方の近くの見えている敵を叩く */
      type: "closeAirSupport";
      unitId: string;
      escort?: number;
    }
  | {
      side: string;
      /**
       * 橋の爆破:橋のそば(rules.bridges.workRangeM 以内)に自軍の部隊がいれば頼める。このターンの終わりに試み、
       * 確率で成功する(そのときも橋のそばに自軍がいること)。落ちた橋は次のターンから通れない。夜も頼める
       */
      type: "demolishBridge";
      bridgeId: string;
    }
  | {
      side: string;
      /**
       * 橋の修理:壊れた橋のそばに自軍の部隊がいれば頼める。次のターンから、橋のそばに自軍がいて近くに敵がいないあいだだけ進み、
       * rules.bridges.repairHours で直る。夜も頼める
       */
      type: "repairBridge";
      bridgeId: string;
    };

/** このターンに頼まれた橋の爆破・修理(ターンの終わりに実行する) */
export interface BridgeWork {
  side: string;
  kind: "demolish" | "repair";
  bridgeId: string;
}

/** 予約された空襲・空輸・制空任務など。turn のターンに実行する */
export interface AirMission {
  side: string;
  kind: "airStrike" | "airDrop" | "airSuperiority" | "airborneDrop" | "airRecon" | "interdiction";
  target: Vec2;
  turn: number;
  /** 空挺降下で降ろす部隊 */
  unitId?: string;
  /** 護衛の戦闘機の出撃数(空襲・補給線への攻撃) */
  escort?: number;
}

/** このターンに出る斥候 */
export interface Patrol {
  side: string;
  unitId: string;
  /** 選んだ地点(探る方向を決める) */
  target: Vec2;
  /** 探る方向(出した時点の部隊の位置から選んだ地点への方位) */
  bearing: number;
}

/** このターンに飛来する近接航空支援 */
export interface CloseAirSupport {
  side: string;
  unitId: string;
  escort?: number;
}

/** 補給線への攻撃の効果:side(攻撃した陣営)の敵の補給は、target から air.interdiction.radiusM 以内の道路の輸送力が下がる。until(秒)まで */
export interface Interdiction {
  side: string;
  target: Vec2;
  until: number;
}

/** 出撃枠:戦闘機(制空・護衛・偵察)、攻撃機(空襲・近接航空支援・補給線への攻撃)、輸送(空輸) */
export interface AirPools {
  fighter: number;
  attack: number;
  transport: number;
}
/** 陣営ごとの、その日の残りの出撃枠 */
export type AirSorties = Record<string, AirPools>;
/** 陣営ごとの、残っている編隊の数(失った分は持ち越す) */
export type AirGroups = Record<string, { fighters: number; attack: number }>;

/** 任務が使う出撃枠 */
export function missionCost(kind: AirMission["kind"] | "closeAirSupport", escort = 0): AirPools {
  if (kind === "airSuperiority" || kind === "airRecon") return { fighter: 1, attack: 0, transport: 0 };
  if (kind === "airDrop") return { fighter: 0, attack: 0, transport: 1 };
  if (kind === "airborneDrop") return { fighter: 0, attack: 0, transport: 0 };
  return { fighter: escort, attack: 1, transport: 0 };
}

/** 陣営ごとの、待機中(まだ降りていない・予約していない)空挺部隊のID */
export type AirborneReady = Record<string, string[]>;

export function initialAirborneReady(ctx: SimContext): AirborneReady {
  const out: AirborneReady = {};
  for (const a of ctx.scenario.airborne) (out[a.side] ??= []).push(a.id);
  return out;
}

/** 開始時の編隊の数 */
export function initialAirGroups(ctx: SimContext): AirGroups {
  return Object.fromEntries(
    Object.entries(ctx.scenario.air).map(([side, a]) => [side, { fighters: a.fighters?.groups ?? 0, attack: a.strike?.groups ?? 0 }]),
  );
}

/** 1日の出撃枠:編隊の数 × 1編隊の1日の出撃回数(四捨五入)。輸送はシナリオの1日の回数 */
export function dailyAirSorties(groups: AirGroups, ctx: SimContext): AirSorties {
  const rate = ctx.rules.air.sortiesPerGroupPerDay;
  return Object.fromEntries(
    Object.entries(ctx.scenario.air).map(([side, a]) => {
      const g = groups[side] ?? { fighters: 0, attack: 0 };
      return [side, { fighter: a.fighters ? Math.round(g.fighters * rate) : 0, attack: a.strike ? Math.round(g.attack * rate) : 0, transport: a.airlift?.sortiesPerDay ?? 0 }];
    }),
  );
}

export function initialAirSorties(ctx: SimContext): AirSorties {
  return dailyAirSorties(initialAirGroups(ctx), ctx);
}

/** 毎朝の補充:replacementPerDay だけ編隊を足す(開始時の数まで) */
export function replenishAirGroups(groups: AirGroups, ctx: SimContext): AirGroups {
  return Object.fromEntries(
    Object.entries(ctx.scenario.air).map(([side, a]) => {
      const g = groups[side] ?? { fighters: 0, attack: 0 };
      return [
        side,
        {
          fighters: Math.min(a.fighters?.groups ?? 0, g.fighters + (a.fighters?.replacementPerDay ?? 0)),
          attack: Math.min(a.strike?.groups ?? 0, g.attack + (a.strike?.replacementPerDay ?? 0)),
        },
      ];
    }),
  );
}

/** 空域の分け方(シナリオの airSectors、なければルールパック) */
export function airSectorGrid(ctx: SimContext): { cols: number; rows: number } {
  return ctx.scenario.airSectors ?? ctx.rules.air.sectors;
}

/** 地点を含む空域のキー("列,行"。西・南から0) */
export function airSectorOf(p: Vec2, ctx: SimContext): string {
  const { cols, rows } = airSectorGrid(ctx);
  const c = Math.min(cols - 1, Math.max(0, Math.floor((p.x / ctx.terrain.widthM) * cols)));
  const r = Math.min(rows - 1, Math.max(0, Math.floor((p.y / ctx.terrain.heightM) * rows)));
  return `${c},${r}`;
}

/** 空域のキーの一覧(行ごと、南から北・西から東の順) */
export function airSectorKeys(ctx: SimContext): string[] {
  const { cols, rows } = airSectorGrid(ctx);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(`${c},${r}`);
  return out;
}

/** 空域ごとの制空権の割合(空域キー → 陣営 → 割合。航空戦力を持つ陣営どうしで合計1) */
export type AirControl = Record<string, Record<string, number>>;

/**
 * 制空任務を出していない空域の制空権の割合(どの空域も、baseControl の比。省略は等分で、2陣営なら50%)。
 * 制空権は持ち越さず、毎ターンここから始めて、そのターンに戦闘機がいた空域だけが動く。
 * 航空戦力を持つのが1陣営だけなら、その陣営が100%(迎撃する相手がいない)
 */
export function baseAirControl(ctx: SimContext): AirControl {
  const sides = Object.entries(ctx.scenario.air);
  const total = sides.reduce((s, [, a]) => s + (a.baseControl ?? 1), 0);
  const shares = Object.fromEntries(sides.map(([side, a]) => [side, total > 0 ? (a.baseControl ?? 1) / total : 0]));
  return Object.fromEntries(airSectorKeys(ctx).map((k) => [k, { ...shares }]));
}

/** 地点での、ある陣営の制空権の割合 */
export function airControlAt(control: AirControl, side: string, p: Vec2, ctx: SimContext): number {
  return control[airSectorOf(p, ctx)]?.[side] ?? 0;
}

/** 予約された艦砲射撃。turn のターンの戦闘フェイズ全体に均等に着弾する */
export interface NavalMission {
  side: string;
  target: Vec2;
  turn: number;
}

/** 陣営ごとの、その日の残りの艦砲射撃の回数 */
export function initialNavalLeft(ctx: SimContext): Record<string, number> {
  return Object.fromEntries(Object.entries(ctx.scenario.naval).map(([side, n]) => [side, n.gunfire.missionsPerDay]));
}

/** 艦砲射撃が届くか(海からの距離) */
export function navalInRange(side: string, target: Vec2, ctx: SimContext): boolean {
  const g = ctx.scenario.naval[side]?.gunfire;
  if (!g) return false;
  return ctx.terrain.distanceToTerrain(target, (id) => ctx.rules.terrain[id]?.navigable ?? false, g.rangeFromSeaM) <= g.rangeFromSeaM;
}

/**
 * 1小ステップ分の艦砲射撃の損害。着弾範囲内は敵味方を問わない(誤射あり)。向きの倍率はかからない
 */
export function computeNavalGunfire(m: NavalMission, units: readonly Unit[], ctx: SimContext, rng: Rng): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const g = ctx.scenario.naval[m.side]!.gunfire;
  const w = ctx.weapons.weapons[g.weapon]!;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  for (const t of [...units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (t.strength <= 0) continue;
      // 着弾範囲にかかった帯(正面幅)の割合だけ効く
      const covered = frontCoverage(frontOf(t, ctx), m.target, c.indirectImpactRadiusM);
      if (covered <= 0) continue;
    const tToe = ctx.toes.toes[t.toe]!;
    const armor = armorNow(t, ctx);
    const firepower = g.count * (w.bands[0]?.power ?? 0) * weaponEffectAgainst(w, armor);
    const taken =
      c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
      c.formationDamageTaken[t.formation] *
      rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
      stanceOf(t, rules).damageTakenMultiplier *
      moraleStateDamageTaken(t, ctx);
    const points = firepower * covered * minutes * c.damageScale * c.indirectDamageScale * taken * rng.spread(c.damageSpread);
    const frac = armoredDamageFraction(t, ctx, w.effectiveness.soft, w.effectiveness.armored);
    results.push({ attackerId: `naval:${m.side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: w.suppression, ...(frac !== undefined ? { armoredFraction: frac } : {}) });
  }
  return results;
}

/** 予約された砲撃。turn のターンの戦闘フェイズ全体に均等に着弾する */
export interface FireMission {
  side: string;
  unitId: string;
  target: Vec2;
  turn: number;
  /**
   * そのターンの何分目から撃ち始めるか(観測射撃:見えている敵の近くへの要請は、要請したターンのうちに数分後に着弾する)。
   * 省略は0分目から(前のターンに予約した射撃)
   */
  fromMinute?: number;
}

export interface RejectedHqCommand {
  command: HqCommand;
  reason: string;
}

/**
 * 司令部コマンドを検証し、次のターンに実行するものとして予約する。
 * 航空は、その日の残りの出撃回数(実行済み + 予約済みを引いた数)の範囲で受け付ける。
 */
export function scheduleHqCommands(
  commands: readonly HqCommand[],
  units: ReadonlyMap<string, Unit>,
  currentTurn: number,
  ctx: SimContext,
  spend: (side: string) => boolean = () => true,
  air: { left: AirSorties; pending: readonly AirMission[]; airborneReady?: AirborneReady } = { left: {}, pending: [] },
  naval: { left: Record<string, number>; pending: readonly NavalMission[] } = { left: {}, pending: [] },
  patrolsLeft: Record<string, number> = {},
  /** 砲撃の目標が、要請した陣営から今見えている敵の近くか(観測射撃。そのターンのうちに着弾する) */
  isObserved: (side: string, target: Vec2) => boolean = () => false,
  /** 橋の状態(爆破・修理の検証に使う) */
  bridgeStates: BridgeStates = {},
): {
  bridgeWorks: BridgeWork[];
  missions: FireMission[];
  airMissions: AirMission[];
  navalMissions: NavalMission[];
  closeSupport: CloseAirSupport[];
  patrols: Patrol[];
  rejected: RejectedHqCommand[];
} {
  const patrols: Patrol[] = [];
  const bridgeWorks: BridgeWork[] = [];
  const missions: FireMission[] = [];
  const navalMissions: NavalMission[] = [];
  const navalLeft = (side: string) => (naval.left[side] ?? 0) - [...naval.pending, ...navalMissions].filter((m) => m.side === side).length;
  const airMissions: AirMission[] = [];
  const closeSupport: CloseAirSupport[] = [];
  const rejected: RejectedHqCommand[] = [];
  const used = new Set<string>();
  const airborneUsed = new Set<string>();
  // 出撃枠の残り:その日の枠から、予約済み・このターンに要請した任務が使う分を引く
  const airLeft = (side: string): AirPools => {
    const left = { fighter: 0, attack: 0, transport: 0, ...air.left[side] };
    for (const m of [...air.pending, ...airMissions].filter((x) => x.side === side)) {
      const cost = missionCost(m.kind, m.escort);
      left.fighter -= cost.fighter;
      left.attack -= cost.attack;
      left.transport -= cost.transport;
    }
    for (const c of closeSupport.filter((x) => x.side === side)) {
      const cost = missionCost("closeAirSupport", c.escort);
      left.fighter -= cost.fighter;
      left.attack -= cost.attack;
    }
    return left;
  };
  // 夜間フェイズには砲撃も航空も使えない(要請はその前のターンに出すので、ここで弾く)。
  // 近接航空支援はこのターンに飛ぶので、このターンが夜かで判定する
  const nextIsNight = isNightTurn(ctx.scenario, currentTurn + 1);
  const nowIsNight = isNightTurn(ctx.scenario, currentTurn);
  // 観測射撃:見えている敵の近くへの砲撃は、このターンのうちに着弾する(昼だけ)
  const observedNow = (c: Extract<HqCommand, { type: "fireMission" }>) =>
    ctx.rules.combat.observedFireDelayMinutes !== undefined && !nowIsNight && isObserved(c.side, c.target);
  for (const c of commands) {
    const reason =
      c.type === "demolishBridge" || c.type === "repairBridge"
        ? validateBridge(c, units, bridgeStates, bridgeWorks, ctx)
        : c.type === "patrol"
        ? validatePatrol(c, units, patrols, (patrolsLeft[c.side] ?? ctx.rules.patrol.perDay) - patrols.filter((p) => p.side === c.side).length, ctx)
        : c.type === "closeAirSupport"
        ? nowIsNight
          ? "夜間フェイズには使えません"
          : isDarkTurn(ctx.scenario, currentTurn)
          ? "暗い時間には航空は使えません"
          : validateCloseSupport(c, units, airLeft(c.side), ctx)
        : c.type === "fireMission" && observedNow(c)
          ? validateFire(c, units, used, ctx)
        : nextIsNight
          ? "夜間フェイズには使えません"
          : c.type !== "fireMission" && c.type !== "navalGunfire" && isDarkTurn(ctx.scenario, currentTurn + 1)
          ? "暗い時間には航空は使えません"
          : c.type === "fireMission"
            ? validateFire(c, units, used, ctx)
            : c.type === "airborneDrop"
              ? validateAirborne(c, air.airborneReady ?? {}, airborneUsed, currentTurn, ctx)
              : c.type === "navalGunfire"
                ? validateNaval(c, navalLeft(c.side), ctx)
                : validateAir(c, airLeft(c.side), ctx);
    if (reason) {
      rejected.push({ command: c, reason });
      continue;
    }
    if (!spend(c.side)) {
      rejected.push({ command: c, reason: "指揮ポイントが足りません" });
      continue;
    }
    if (c.type === "demolishBridge" || c.type === "repairBridge") {
      bridgeWorks.push({ side: c.side, kind: c.type === "demolishBridge" ? "demolish" : "repair", bridgeId: c.bridgeId });
    } else if (c.type === "fireMission") {
      used.add(c.unitId);
      missions.push(
        observedNow(c)
          ? { side: c.side, unitId: c.unitId, target: { ...c.target }, turn: currentTurn, fromMinute: ctx.rules.combat.observedFireDelayMinutes! }
          : { side: c.side, unitId: c.unitId, target: { ...c.target }, turn: currentTurn + 1 },
      );
    } else if (c.type === "patrol") {
      patrols.push({ side: c.side, unitId: c.unitId, target: { ...c.target }, bearing: bearing(units.get(c.unitId)!.pos, c.target) });
    } else if (c.type === "closeAirSupport") {
      closeSupport.push({ side: c.side, unitId: c.unitId, ...(c.escort ? { escort: c.escort } : {}) });
    } else if (c.type === "navalGunfire") {
      navalMissions.push({ side: c.side, target: { ...c.target }, turn: currentTurn + 1 });
    } else if (c.type === "airborneDrop") {
      airborneUsed.add(c.unitId);
      airMissions.push({ side: c.side, kind: "airborneDrop", target: { ...c.target }, turn: currentTurn + 1, unitId: c.unitId });
    } else {
      const escort = (c.type === "airStrike" || c.type === "interdiction") && c.escort ? { escort: c.escort } : {};
      airMissions.push({ side: c.side, kind: c.type, target: { ...c.target }, turn: currentTurn + 1, ...escort });
    }
  }
  return { bridgeWorks, missions, airMissions, navalMissions, closeSupport, patrols, rejected };
}

function validateBridge(
  c: Extract<HqCommand, { type: "demolishBridge" | "repairBridge" }>,
  units: ReadonlyMap<string, Unit>,
  states: BridgeStates,
  queued: readonly BridgeWork[],
  ctx: SimContext,
): string | null {
  const b = findBridges(ctx).find((x) => x.id === c.bridgeId);
  if (!b) return "存在しない橋です";
  if (queued.some((w) => w.bridgeId === c.bridgeId && w.side === c.side)) return "この橋には、このターンもう頼んでいます";
  const st = states[b.id];
  if (c.type === "demolishBridge" && st?.destroyed) return "もう壊れています";
  if (c.type === "repairBridge") {
    if (!st?.destroyed) return "壊れていません";
    if (st.repair?.side === c.side) return "もう修理しています";
  }
  if (!nearBridge(b, [...units.values()], c.side, ctx.rules.bridges.workRangeM)) return `橋から${ctx.rules.bridges.workRangeM}m以内に自軍の部隊がいません`;
  return null;
}

/** 出撃枠が足りるか(足りなければ理由)。護衛は戦闘機の枠から出す */
function poolShortage(kind: AirMission["kind"] | "closeAirSupport", escort: number | undefined, left: AirPools, ctx: SimContext, side: string): string | null {
  if (escort !== undefined && !(Number.isInteger(escort) && escort >= 0)) return "護衛の数が不正です";
  if ((escort ?? 0) > 0 && !ctx.scenario.air[side]?.fighters) return "護衛に出す戦闘機がありません";
  const cost = missionCost(kind, escort);
  if (cost.attack > left.attack) return "今日の攻撃機の出撃枠を使い切っています";
  if (cost.fighter > left.fighter) return (escort ?? 0) > 0 ? "護衛に出す戦闘機の出撃枠が足りません" : "今日の戦闘機の出撃枠を使い切っています";
  if (cost.transport > left.transport) return "今日の輸送の出撃枠を使い切っています";
  return null;
}

function validateAir(
  c: Extract<HqCommand, { type: "airStrike" | "airDrop" | "airSuperiority" | "airRecon" | "interdiction" }>,
  left: AirPools,
  ctx: SimContext,
): string | null {
  const cfg = ctx.scenario.air[c.side];
  const { x, y } = c.target;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "目標地点が不正です";
  if (x < 0 || y < 0 || x > ctx.terrain.widthM || y > ctx.terrain.heightM) return "目標地点がマップの外です";
  const usable = c.type === "airStrike" || c.type === "interdiction" ? !!cfg?.strike : c.type === "airDrop" ? !!cfg?.airlift : !!cfg?.fighters;
  if (!usable) return "この陣営は使えません";
  return poolShortage(c.type, "escort" in c ? c.escort : undefined, left, ctx, c.side);
}

function validatePatrol(c: Extract<HqCommand, { type: "patrol" }>, units: ReadonlyMap<string, Unit>, queued: readonly Patrol[], left: number, ctx: SimContext): string | null {
  const u = units.get(c.unitId);
  if (!u) return "存在しないユニットです";
  if (u.side !== c.side) return "自陣営のユニットではありません";
  if (u.routed) return "潰走中の部隊からは出せません";
  if (queued.some((p) => p.unitId === c.unitId)) return "この部隊からは、このターンもう斥候を出しています";
  if (!Number.isFinite(c.target.x) || !Number.isFinite(c.target.y)) return "探る地点が不正です";
  if (distance(u.pos, c.target) < 1) return "探る方向を部隊から離れた地点で選んでください";
  if (left <= 0) return "今日の斥候の回数を使い切っています";
  return null;
}

function validateNaval(c: Extract<HqCommand, { type: "navalGunfire" }>, left: number, ctx: SimContext): string | null {
  if (!ctx.scenario.naval[c.side]) return "この陣営は使えません";
  const { x, y } = c.target;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "着弾地点が不正です";
  if (x < 0 || y < 0 || x > ctx.terrain.widthM || y > ctx.terrain.heightM) return "着弾地点がマップの外です";
  if (!navalInRange(c.side, c.target, ctx)) return "着弾地点が海から遠すぎます";
  if (left <= 0) return "今日の艦砲射撃の回数を使い切っています";
  return null;
}

function validateAirborne(
  c: Extract<HqCommand, { type: "airborneDrop" }>,
  ready: AirborneReady,
  used: Set<string>,
  currentTurn: number,
  ctx: SimContext,
): string | null {
  const def = ctx.scenario.airborne.find((a) => a.id === c.unitId);
  if (!def || def.side !== c.side) return "自陣営の空挺部隊ではありません";
  if (!(ready[c.side] ?? []).includes(c.unitId) || used.has(c.unitId)) return "この空挺部隊はもう降下しています(または予約済みです)";
  if (currentTurn + 1 < def.availableFromTurn) return `この空挺部隊は ${def.availableFromTurn} ターン目から降下できます`;
  const { x, y } = c.target;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "降下地点が不正です";
  if (x < 0 || y < 0 || x > ctx.terrain.widthM || y > ctx.terrain.heightM) return "降下地点がマップの外です";
  if (terrainSpeed(ctx.terrain.terrainAt(c.target), "foot", ctx) <= 0) return "降下地点は降りられない地形です";
  return null;
}

function validateCloseSupport(c: Extract<HqCommand, { type: "closeAirSupport" }>, units: ReadonlyMap<string, Unit>, left: AirPools, ctx: SimContext): string | null {
  const u = units.get(c.unitId);
  if (!u) return "存在しないユニットです";
  if (u.side !== c.side) return "自陣営のユニットではありません";
  if (!ctx.scenario.air[c.side]?.strike) return "この陣営は使えません";
  return poolShortage("closeAirSupport", c.escort, left, ctx, c.side);
}

function validateFire(
  c: Extract<HqCommand, { type: "fireMission" }>,
  units: ReadonlyMap<string, Unit>,
  used: Set<string>,
  ctx: SimContext,
): string | null {
  const u = units.get(c.unitId);
  if (!u) return "存在しないユニットです";
  if (u.side !== c.side) return "自陣営のユニットではありません";
  if (!Number.isFinite(c.target.x) || !Number.isFinite(c.target.y)) return "着弾地点が不正です";
  const range = toeIndirectMaxRange(ctx.toes.toes[u.toe]!, ctx.weapons);
  if (range === 0) return "間接射撃できるユニットではありません";
  if (distance(u.pos, c.target) > range) return "着弾地点が射程外です";
  if (used.has(c.unitId)) return "同じユニットへの砲撃要請が重複しています";
  if (ctx.rules.combat.counterBattery?.blockWhenUnderFire && u.underFire) return "撃たれているため砲撃できません(前のターンに攻撃を受けた)";
  return null;
}

/**
 * 1小ステップ分の間接射撃。砲兵が展開済みで、このステップに動いておらず、射程内なら撃つ。
 * 着弾範囲内のユニットは敵味方を問わず損害を受ける(誤射あり)。向きの倍率はかからない。
 * 弾薬もここで減らす。撃ったミッションの一覧を返す。
 */
export function computeIndirectFire(
  missions: readonly FireMission[],
  units: readonly Unit[],
  byId: ReadonlyMap<string, Unit>,
  ctx: SimContext,
  rng: Rng,
  movedThisStep: ReadonlySet<string>,
  /** このステップの開始が、ターンの何分目か(観測射撃の撃ち始めの判定) */
  elapsedMinutes = Infinity,
): { results: FireResult[]; fired: FireMission[]; massing: Map<FireMission, number> } {
  const { rules } = ctx;
  const c = rules.combat;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  const fired: FireMission[] = [];
  const sortedUnits = [...units].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // このステップに撃てるミッション(撃ち始めの時刻を過ぎ、砲兵が展開して止まっていて、射程内)
  const firing = [...missions]
    .sort((a, b) => (a.unitId < b.unitId ? -1 : 1))
    .filter((m) => {
      if ((m.fromMinute ?? 0) > elapsedMinutes) return false;
      const a = byId.get(m.unitId);
      if (!a || !canAttack(a) || a.strength <= 0 || movedThisStep.has(a.id)) return false;
      return distance(a.pos, m.target) <= toeIndirectMaxRange(ctx.toes.toes[a.toe]!, ctx.weapons);
    });
  // 集中射撃:同じ陣営で同じ地点(着弾範囲の半径以内)へ撃つ砲兵の数に応じて、撃ち始めの間だけ損害を上乗せ
  const massing = new Map<FireMission, number>();
  const mf = c.massedFire;
  if (mf) {
    for (const m of firing) {
      const n = firing.filter((o) => o.side === m.side && distance(o.target, m.target) <= c.indirectImpactRadiusM).length;
      const opening = elapsedMinutes - (m.fromMinute ?? 0) < mf.firstMinutes;
      if (n > 1 && opening) massing.set(m, Math.min(mf.max, 1 + mf.perExtraBattery * (n - 1)));
    }
  }

  for (const m of firing) {
    const a = byId.get(m.unitId)!;
    const aToe = ctx.toes.toes[a.toe]!;
    const d = distance(a.pos, m.target);
    const massed = massing.get(m) ?? 1;

    const attackerFactor =
      a.strength *
      suppressionFirepowerMultiplier(a, ctx) *
      stanceOf(a, rules).firepowerMultiplier *
      (a.ammo <= 0 ? rules.supply.outOfAmmoFirepowerMultiplier : 1) *
      (a.morale < rules.morale.shakenBelow ? rules.morale.shakenFirepowerMultiplier : 1) *
      fatigueFirepowerMultiplier(a, ctx);

    for (const t of sortedUnits) {
      if (t.strength <= 0) continue;
      // 着弾範囲にかかった帯(正面幅)の割合だけ効く
      const covered = frontCoverage(frontOf(t, ctx), m.target, c.indirectImpactRadiusM);
      if (covered <= 0) continue;
      const tToe = ctx.toes.toes[t.toe]!;
      const armor = armorNow(t, ctx);
      const fire = toeFire(aToe, ctx.weapons, d, armor, true);
      const firepower = fire.firepower * attackerFactor;
      if (firepower <= 0) continue;
      const taken =
        c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
        c.formationDamageTaken[t.formation] *
        rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
        stanceOf(t, rules).damageTakenMultiplier *
        moraleStateDamageTaken(t, ctx);
      const points = firepower * covered * minutes * c.damageScale * c.indirectDamageScale * taken * massed * rng.spread(c.damageSpread);
      const frac = armoredDamageFraction(t, ctx, toeFire(aToe, ctx.weapons, d, 0, true).firepower, toeFire(aToe, ctx.weapons, d, 1, true).firepower);
      results.push({ attackerId: a.id, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: fire.suppression, ...(frac !== undefined ? { armoredFraction: frac } : {}) });
    }

    fired.push(m);
    const cap = aToe.supply.ammoCapacityT;
    if (cap > 0 && a.ammo > 0) {
      const used = toeIndirectAmmoPerMin(aToe, ctx.weapons, d) * minutes * stanceOf(a, rules).ammoConsumptionMultiplier;
      a.ammo = Math.max(0, a.ammo - used / cap);
    }
  }
  return { results, fired, massing };
}
