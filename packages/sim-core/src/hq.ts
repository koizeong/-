import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance } from "./stance.js";
import { toeHitPoints, toeIndirectAmmoPerMin, toeIndirectFirepower, toeIndirectMaxRange } from "./toe.js";
import type { FireResult } from "./combat.js";
import { canAttack, type Unit } from "./unit.js";

/**
 * 司令部コマンド:陣営の司令部が、隷下のリソースを前線に投下する。
 * ユニットへの命令(設計ルール9)とは別枠。今は砲撃だけ。空輸・空襲は天候と一緒に追加する。
 */
export type HqCommand = {
  side: string;
  type: "fireMission";
  /** 撃たせる砲兵ユニット */
  unitId: string;
  /** 着弾地点 */
  target: Vec2;
};

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

/** 司令部コマンドを検証し、次のターンに着弾する砲撃として予約する */
export function scheduleHqCommands(
  commands: readonly HqCommand[],
  units: ReadonlyMap<string, Unit>,
  currentTurn: number,
  ctx: SimContext,
): { missions: FireMission[]; rejected: RejectedHqCommand[] } {
  const missions: FireMission[] = [];
  const rejected: RejectedHqCommand[] = [];
  const used = new Set<string>();
  for (const c of commands) {
    const reason = validate(c, units, used, ctx);
    if (reason) {
      rejected.push({ command: c, reason });
      continue;
    }
    used.add(c.unitId);
    missions.push({ side: c.side, unitId: c.unitId, target: { ...c.target }, turn: currentTurn + 1 });
  }
  return { missions, rejected };
}

function validate(c: HqCommand, units: ReadonlyMap<string, Unit>, used: Set<string>, ctx: SimContext): string | null {
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
      (a.ammo <= 0 ? rules.supply.outOfAmmoFirepowerMultiplier : 1);

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
