import { moraleStateDamageTaken, type FireResult } from "./combat.js";
import type { SimContext } from "./context.js";
import { distance } from "./geometry.js";
import type { AirMission } from "./hq.js";
import type { Rng } from "./rng.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeHitPoints, weaponEffectAgainst } from "./toe.js";
import type { Unit } from "./unit.js";
import { weaponPowerAt } from "./weapon.js";

/** 空襲の時間帯:ターン中のランダムなステップから strikeMinutes の間。乱数はミッションごとに1回 */
export function strikeWindow(ctx: SimContext, side: string, rng: Rng): { from: number; to: number } {
  const steps = ctx.turnSeconds / ctx.stepSeconds;
  const minutes = ctx.scenario.air[side]!.strike!.strikeMinutes;
  const len = Math.max(1, Math.min(steps, Math.round((minutes * 60) / ctx.stepSeconds)));
  const from = Math.floor(rng.next() * (steps - len + 1));
  return { from, to: from + len };
}

/**
 * 1小ステップ分の空襲の損害。範囲内のユニットは敵味方を問わない(誤射あり)。向きの倍率はかからない。
 */
export function computeAirStrike(m: AirMission, units: readonly Unit[], ctx: SimContext, rng: Rng, effect = 1): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const cfg = ctx.scenario.air[m.side]!.strike!;
  const w = ctx.weapons.weapons[cfg.weapon]!;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  for (const t of [...units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (t.strength <= 0 || distance(t.pos, m.target) > rules.air.strikeRadiusM) continue;
    const tToe = ctx.toes.toes[t.toe]!;
    const firepower = cfg.count * weaponPowerAt(w, 0) * weaponEffectAgainst(w, tToe.armorRatio) * effect;
    const taken =
      c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
      c.formationDamageTaken[t.formation] *
        rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
      stanceOf(t, rules).damageTakenMultiplier *
      moraleStateDamageTaken(t, ctx);
    const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
    results.push({ attackerId: `air:${m.side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: w.suppression });
  }
  return results;
}

/** 制空権の割合による、空襲・近接航空支援の効果の倍率 */
export function airEffect(control: number, ctx: SimContext): number {
  const e = ctx.rules.air.superiority.effectAtNoControl;
  return e + (1 - e) * control;
}

/** 制空権の割合による、航空任務が迎撃される確率 */
export function interceptChance(control: number, ctx: SimContext): number {
  return ctx.rules.air.superiority.interceptMax * (1 - control);
}

/**
 * 制空任務の結果で、制空権の割合を動かす(合計1を保つ)。出撃数の比へ learningRate の速さで近づく。
 * 誰も飛ばなければ変わらない
 */
export function updateAirControl(control: Record<string, number>, sorties: Record<string, number>, ctx: SimContext): Record<string, number> {
  const total = Object.values(sorties).reduce((s, n) => s + n, 0);
  if (total <= 0) return { ...control };
  const k = ctx.rules.air.superiority.learningRate;
  return Object.fromEntries(Object.entries(control).map(([side, c]) => [side, (1 - k) * c + (k * (sorties[side] ?? 0)) / total]));
}

/**
 * 1小ステップ分の近接航空支援の損害。支援する味方の近く(closeSupport.radiusM 以内)にいる、
 * 要請した陣営に見えている敵に、火力を均等に分ける(味方とは調整しているので誤射はない)
 */
export function computeCloseSupport(side: string, supported: Unit, units: readonly Unit[], seen: (u: Unit) => boolean, ctx: SimContext, rng: Rng, effect: number): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const cfg = ctx.scenario.air[side]!.strike!;
  const w = ctx.weapons.weapons[cfg.weapon]!;
  const minutes = ctx.stepSeconds / 60;
  const targets = [...units]
    .filter((t) => t.side !== side && t.strength > 0 && distance(t.pos, supported.pos) <= rules.air.closeSupport.radiusM && seen(t))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const results: FireResult[] = [];
  for (const t of targets) {
    const tToe = ctx.toes.toes[t.toe]!;
    const firepower = (cfg.count * weaponPowerAt(w, 0) * weaponEffectAgainst(w, tToe.armorRatio) * effect) / targets.length;
    const taken =
      c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]! *
      c.formationDamageTaken[t.formation] *
      rules.terrain[ctx.terrain.terrainAt(t.pos)]!.damageTakenMultiplier *
      stanceOf(t, rules).damageTakenMultiplier *
      moraleStateDamageTaken(t, ctx);
    const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
    results.push({ attackerId: `air:${side}`, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(tToe), suppressionMultiplier: w.suppression });
  }
  return results;
}

export interface AirDropResult {
  /** 受け取った陣営(誰もいなければ null) */
  receiver: string | null;
  deliveries: { unitId: string; ammoT: number; fuelT: number }[];
}

/**
 * 空輸の投下(units を書き換える)。投下地点の近くにいる自軍ユニットへ、近い順に不足分を配る。
 * 近くに自軍がいなくて敵だけがいれば、敵が受け取る。余りは失われる。
 */
export function applyAirDrop(m: AirMission, units: Unit[], ctx: SimContext): AirDropResult {
  const cfg = ctx.scenario.air[m.side]!.airlift!;
  const near = units
    .filter((u) => u.strength > 0 && distance(u.pos, m.target) <= ctx.rules.air.dropRadiusM)
    .sort((a, b) => distance(a.pos, m.target) - distance(b.pos, m.target) || (a.id < b.id ? -1 : 1));
  const own = near.filter((u) => u.side === m.side);
  const recipients = own.length > 0 ? own : near;
  const receiver = recipients[0]?.side ?? null;
  let ammoLeft = cfg.ammoT;
  let fuelLeft = cfg.fuelT;
  const deliveries: AirDropResult["deliveries"] = [];
  for (const u of recipients.filter((x) => x.side === receiver)) {
    const cap = ctx.toes.toes[u.toe]!.supply;
    const ammoT = Math.min(ammoLeft, (1 - u.ammo) * cap.ammoCapacityT);
    const fuelT = Math.min(fuelLeft, (1 - u.fuel) * cap.fuelCapacityT);
    if (cap.ammoCapacityT > 0) u.ammo = Math.min(1, u.ammo + ammoT / cap.ammoCapacityT);
    if (cap.fuelCapacityT > 0) u.fuel = Math.min(1, u.fuel + fuelT / cap.fuelCapacityT);
    ammoLeft -= ammoT;
    fuelLeft -= fuelT;
    if (ammoT > 0 || fuelT > 0) deliveries.push({ unitId: u.id, ammoT, fuelT });
  }
  return { receiver, deliveries };
}
