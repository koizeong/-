import type { SimContext } from "./context.js";
import { fatigueFirepowerMultiplier } from "./fatigue.js";
import { isNightTurn } from "./scenario.js";
import { distance, type Vec2 } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { toeFire, toeHitPoints, toeIndirectAmmoPerMin, toeIndirectMaxRange } from "./toe.js";
import { moraleStateDamageTaken, suppressionFirepowerMultiplier, type FireResult } from "./combat.js";
import { canAttack, type Unit } from "./unit.js";
import { terrainSpeed } from "./pathfinding.js";

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
      /** 空襲(マップ外の航空戦力)。天候が航空を許さなければ中止 */
      type: "airStrike";
      target: Vec2;
    }
  | {
      side: string;
      /** 空輸(投下地点の近くの自軍に弾薬・燃料を配る)。天候が航空を許さなければ中止 */
      type: "airDrop";
      target: Vec2;
    }
  | {
      side: string;
      /** 制空任務(戦闘機)。次のターンに、制空権の割合を自陣営へ動かす。天候が航空を許さなければ中止 */
      type: "airSuperiority";
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
      /** 近接航空支援。このターンのうちに飛来し、unitId の味方の近くの見えている敵を叩く。出撃回数は空襲と共通 */
      type: "closeAirSupport";
      unitId: string;
    };

/** 予約された空襲・空輸・制空任務。turn のターンに実行する(制空任務は target を使わない) */
export interface AirMission {
  side: string;
  kind: "airStrike" | "airDrop" | "airSuperiority" | "airborneDrop";
  target: Vec2;
  turn: number;
  /** 空挺降下で降ろす部隊 */
  unitId?: string;
}

/** このターンに飛来する近接航空支援 */
export interface CloseAirSupport {
  side: string;
  unitId: string;
}

/** 陣営ごとの、その日の残りの出撃回数 */
export type AirSorties = Record<string, { airStrike: number; airDrop: number; airSuperiority: number }>;

/** 陣営ごとの、待機中(まだ降りていない・予約していない)空挺部隊のID */
export type AirborneReady = Record<string, string[]>;

export function initialAirborneReady(ctx: SimContext): AirborneReady {
  const out: AirborneReady = {};
  for (const a of ctx.scenario.airborne) (out[a.side] ??= []).push(a.id);
  return out;
}

export function initialAirSorties(ctx: SimContext): AirSorties {
  const out: AirSorties = {};
  for (const [side, a] of Object.entries(ctx.scenario.air)) {
    out[side] = { airStrike: a.strike?.sortiesPerDay ?? 0, airDrop: a.airlift?.sortiesPerDay ?? 0, airSuperiority: a.fighters?.sortiesPerDay ?? 0 };
  }
  return out;
}

/** 開始時の制空権の割合(航空戦力を持つ陣営どうしで合計1。initialControl の比、省略は等分) */
export function initialAirControl(ctx: SimContext): Record<string, number> {
  const sides = Object.entries(ctx.scenario.air);
  const total = sides.reduce((s, [, a]) => s + (a.initialControl ?? 1), 0);
  return Object.fromEntries(sides.map(([side, a]) => [side, total > 0 ? (a.initialControl ?? 1) / total : 0]));
}

/** 予約された砲撃。turn のターンの戦闘フェイズ全体に均等に着弾する */
export interface FireMission {
  side: string;
  unitId: string;
  target: Vec2;
  turn: number;
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
): { missions: FireMission[]; airMissions: AirMission[]; closeSupport: CloseAirSupport[]; rejected: RejectedHqCommand[] } {
  const missions: FireMission[] = [];
  const airMissions: AirMission[] = [];
  const closeSupport: CloseAirSupport[] = [];
  const rejected: RejectedHqCommand[] = [];
  const used = new Set<string>();
  const airborneUsed = new Set<string>();
  const airLeft = (side: string, kind: Exclude<AirMission["kind"], "airborneDrop">) => {
    const queued = [...air.pending, ...airMissions].filter((m) => m.side === side && m.kind === kind).length;
    // 近接航空支援は空襲と出撃回数を分け合う
    const cas = kind === "airStrike" ? closeSupport.filter((m) => m.side === side).length : 0;
    return (air.left[side]?.[kind] ?? 0) - queued - cas;
  };
  // 夜間フェイズには砲撃も航空も使えない(要請はその前のターンに出すので、ここで弾く)。
  // 近接航空支援はこのターンに飛ぶので、このターンが夜かで判定する
  const nextIsNight = isNightTurn(ctx.scenario, currentTurn + 1);
  const nowIsNight = isNightTurn(ctx.scenario, currentTurn);
  for (const c of commands) {
    const reason =
      c.type === "closeAirSupport"
        ? nowIsNight
          ? "夜間フェイズには使えません"
          : validateCloseSupport(c, units, airLeft(c.side, "airStrike"), ctx)
        : nextIsNight
          ? "夜間フェイズには使えません"
          : c.type === "fireMission"
            ? validateFire(c, units, used, ctx)
            : c.type === "airborneDrop"
              ? validateAirborne(c, air.airborneReady ?? {}, airborneUsed, currentTurn, ctx)
              : validateAir(c, airLeft(c.side, c.type), ctx);
    if (reason) {
      rejected.push({ command: c, reason });
      continue;
    }
    if (!spend(c.side)) {
      rejected.push({ command: c, reason: "指揮ポイントが足りません" });
      continue;
    }
    if (c.type === "fireMission") {
      used.add(c.unitId);
      missions.push({ side: c.side, unitId: c.unitId, target: { ...c.target }, turn: currentTurn + 1 });
    } else if (c.type === "closeAirSupport") {
      closeSupport.push({ side: c.side, unitId: c.unitId });
    } else if (c.type === "airborneDrop") {
      airborneUsed.add(c.unitId);
      airMissions.push({ side: c.side, kind: "airborneDrop", target: { ...c.target }, turn: currentTurn + 1, unitId: c.unitId });
    } else if (c.type === "airSuperiority") {
      airMissions.push({ side: c.side, kind: "airSuperiority", target: { x: 0, y: 0 }, turn: currentTurn + 1 });
    } else {
      airMissions.push({ side: c.side, kind: c.type, target: { ...c.target }, turn: currentTurn + 1 });
    }
  }
  return { missions, airMissions, closeSupport, rejected };
}

function validateAir(c: Extract<HqCommand, { type: "airStrike" | "airDrop" | "airSuperiority" }>, left: number, ctx: SimContext): string | null {
  const cfg = ctx.scenario.air[c.side];
  if (c.type === "airSuperiority") {
    if (!cfg?.fighters) return "この陣営は使えません";
    if (left <= 0) return "今日の出撃回数を使い切っています";
    return null;
  }
  const { x, y } = c.target;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "目標地点が不正です";
  if (x < 0 || y < 0 || x > ctx.terrain.widthM || y > ctx.terrain.heightM) return "目標地点がマップの外です";
  if (c.type === "airStrike" ? !cfg?.strike : !cfg?.airlift) return "この陣営は使えません";
  if (left <= 0) return "今日の出撃回数を使い切っています";
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

function validateCloseSupport(c: Extract<HqCommand, { type: "closeAirSupport" }>, units: ReadonlyMap<string, Unit>, left: number, ctx: SimContext): string | null {
  const u = units.get(c.unitId);
  if (!u) return "存在しないユニットです";
  if (u.side !== c.side) return "自陣営のユニットではありません";
  if (!ctx.scenario.air[c.side]?.strike) return "この陣営は使えません";
  if (left <= 0) return "今日の出撃回数を使い切っています";
  return null;
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
): { results: FireResult[]; fired: FireMission[] } {
  const { rules } = ctx;
  const c = rules.combat;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  const fired: FireMission[] = [];
  const sortedUnits = [...units].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const m of [...missions].sort((a, b) => (a.unitId < b.unitId ? -1 : 1))) {
    const a = byId.get(m.unitId);
    if (!a || !canAttack(a) || a.strength <= 0 || movedThisStep.has(a.id)) continue;
    const aToe = ctx.toes.toes[a.toe]!;
    const d = distance(a.pos, m.target);
    if (d > toeIndirectMaxRange(aToe, ctx.weapons)) continue;

    const attackerFactor =
      a.strength *
      suppressionFirepowerMultiplier(a, ctx) *
      rules.stances[effectiveStance(a, rules)]!.firepowerMultiplier *
      (a.ammo <= 0 ? rules.supply.outOfAmmoFirepowerMultiplier : 1) *
      (a.morale < rules.morale.shakenBelow ? rules.morale.shakenFirepowerMultiplier : 1) *
      fatigueFirepowerMultiplier(a, ctx);

    for (const t of sortedUnits) {
      if (t.strength <= 0 || distance(t.pos, m.target) > c.indirectImpactRadiusM) continue;
      const tToe = ctx.toes.toes[t.toe]!;
      const fire = toeFire(aToe, ctx.weapons, d, tToe.armorRatio, true);
      const firepower = fire.firepower * attackerFactor;
      if (firepower <= 0) continue;
      const taken =
        c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
        c.formationDamageTaken[t.formation] *
        rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
        rules.stances[effectiveStance(t, rules)]!.damageTakenMultiplier *
        moraleStateDamageTaken(t, ctx);
      const points = firepower * minutes * c.damageScale * c.indirectDamageScale * taken * rng.spread(c.damageSpread);
      results.push({ attackerId: a.id, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: fire.suppression });
    }

    fired.push(m);
    const cap = aToe.supply.ammoCapacityT;
    if (cap > 0 && a.ammo > 0) {
      const used = toeIndirectAmmoPerMin(aToe, ctx.weapons, d) * minutes * rules.stances[effectiveStance(a, rules)]!.ammoConsumptionMultiplier;
      a.ammo = Math.max(0, a.ammo - used / cap);
    }
  }
  return { results, fired };
}
