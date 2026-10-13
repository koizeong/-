import type { SimContext } from "./context.js";
import { isNightTurn } from "./scenario.js";
import { distance, type Vec2 } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { toeHitPoints, toeIndirectAmmoPerMin, toeIndirectFirepower, toeIndirectMaxRange } from "./toe.js";
import type { FireResult } from "./combat.js";
import { canAttack, type Unit } from "./unit.js";

/**
 * 司令部コマンド:陣営の司令部が、隷下のリソースを前線に投下する。
 * ユニットへの命令(設計ルール9)とは別枠。どれも要請した次のターンに実行する。
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
    };

/** 予約された空襲・空輸。turn のターンに実行する */
export interface AirMission {
  side: string;
  kind: "airStrike" | "airDrop";
  target: Vec2;
  turn: number;
}

/** 陣営ごとの、その日の残りの出撃回数 */
export type AirSorties = Record<string, { airStrike: number; airDrop: number }>;

export function initialAirSorties(ctx: SimContext): AirSorties {
  const out: AirSorties = {};
  for (const [side, a] of Object.entries(ctx.scenario.air)) {
    out[side] = { airStrike: a.strike?.sortiesPerDay ?? 0, airDrop: a.airlift?.sortiesPerDay ?? 0 };
  }
  return out;
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
  air: { left: AirSorties; pending: readonly AirMission[] } = { left: {}, pending: [] },
): { missions: FireMission[]; airMissions: AirMission[]; rejected: RejectedHqCommand[] } {
  const missions: FireMission[] = [];
  const airMissions: AirMission[] = [];
  const rejected: RejectedHqCommand[] = [];
  const used = new Set<string>();
  const airLeft = (side: string, kind: AirMission["kind"]) => {
    const queued = [...air.pending, ...airMissions].filter((m) => m.side === side && m.kind === kind).length;
    return (air.left[side]?.[kind] ?? 0) - queued;
  };
  // 夜間フェイズには砲撃も航空も使えない(要請はその前のターンに出すので、ここで弾く)
  const nextIsNight = isNightTurn(ctx.scenario, currentTurn + 1);
  for (const c of commands) {
    const reason = nextIsNight
      ? "夜間フェイズには使えません"
      : c.type === "fireMission"
        ? validateFire(c, units, used, ctx)
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
    } else {
      airMissions.push({ side: c.side, kind: c.type, target: { ...c.target }, turn: currentTurn + 1 });
    }
  }
  return { missions, airMissions, rejected };
}

function validateAir(c: Extract<HqCommand, { type: "airStrike" | "airDrop" }>, left: number, ctx: SimContext): string | null {
  const { x, y } = c.target;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "目標地点が不正です";
  if (x < 0 || y < 0 || x > ctx.terrain.widthM || y > ctx.terrain.heightM) return "目標地点がマップの外です";
  const cfg = ctx.scenario.air[c.side];
  if (c.type === "airStrike" ? !cfg?.strike : !cfg?.airlift) return "この陣営は使えません";
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
      (1 - a.suppression * c.suppressionFirepowerPenalty) *
      rules.stances[effectiveStance(a, rules)]!.firepowerMultiplier *
      (a.ammo <= 0 ? rules.supply.outOfAmmoFirepowerMultiplier : 1) *
      (a.morale < rules.morale.shakenBelow ? rules.morale.shakenFirepowerMultiplier : 1);

    for (const t of sortedUnits) {
      if (t.strength <= 0 || distance(t.pos, m.target) > c.indirectImpactRadiusM) continue;
      const tToe = ctx.toes.toes[t.toe]!;
      const firepower = toeIndirectFirepower(aToe, ctx.weapons, d, tToe.armorRatio) * attackerFactor;
      if (firepower <= 0) continue;
      const taken =
        c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
        c.formationDamageTaken[t.formation] *
        rules.stances[effectiveStance(t, rules)]!.damageTakenMultiplier;
      const points = firepower * minutes * c.damageScale * c.indirectDamageScale * taken * rng.spread(c.damageSpread);
      results.push({ attackerId: a.id, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe) });
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
