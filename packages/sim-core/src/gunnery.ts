import type { SimContext } from "./context.js";
import type { Rng } from "./rng.js";
import type { Toe } from "./toe.js";
import type { Unit } from "./unit.js";
import type { Weapon } from "./weapon.js";
import { trainingOf } from "./training.js";

/**
 * 砲戦:1隻ずつの艦どうしの艦砲(武器の naval)。命中を1発ずつ数え、当たった弾ごとに舷側か甲板か・抜けるかを決める。
 * 決まりはルールパックの naval.gunnery。当たった所の表は持たず、抜けた・抜けないと、浮力・火災・浸水・砲の損失だけを見る
 */

type Gunnery = NonNullable<NonNullable<SimContext["rules"]["naval"]>["gunnery"]>;

/** 距離の表を直線で補って引く(表の外は端の値) */
export function lookup<T extends { rangeM: number }>(table: readonly T[], d: number, key: (x: T) => number): number {
  if (d <= table[0]!.rangeM) return key(table[0]!);
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]!;
    const b = table[i]!;
    if (d <= b.rangeM) return key(a) + ((key(b) - key(a)) * (d - a.rangeM)) / (b.rangeM - a.rangeM);
  }
  return key(table[table.length - 1]!);
}

/** 砲戦で撃つ艦砲か(1隻ずつの艦どうしで、ルールパックに砲戦の決まりがあり、武器に naval がある) */
export function usesGunnery(w: Weapon, ctx: Pick<SimContext, "rules">): boolean {
  return !!w.naval && !w.torpedo && !!ctx.rules.naval?.gunnery;
}

export interface GunneryResult {
  /** 失わせた浮力(耐久の点) */
  hp: number;
  hits: number;
  penetrating: number;
  fire: number;
  flooding: number;
  gunsLost: number;
  /** 撃った弾の数(砲戦だけ) */
  shots?: number;
  /** 動力が止まった時間(分)。抜けた弾・魚雷・爆弾が機関や電路を止めた(naval.gunnery.powerLoss) */
  powerOutMin?: number;
}

/**
 * 動力の停止:抜けた弾 penetrating 発・魚雷 torpedoes 本・甲板を抜けた爆弾 bombs 発のどれかが、確率で機関・電路を止める。
 * 止まっている時間は minutes ÷ 練度の火力の倍率(応急の上手さ)。サウスダコタの電路(第三次ソロモン第2夜)、ヨークタウンの汽缶(ミッドウェー)
 */
export function rollPowerLoss(target: Unit, hits: { penetrating?: number; torpedoes?: number; bombs?: number }, ctx: SimContext, rng: Rng): number | undefined {
  const pl = ctx.rules.naval?.gunnery?.powerLoss;
  if (!pl) return undefined;
  const tries: [number, number][] = [
    [hits.penetrating ?? 0, pl.perPenetratingHit],
    [hits.torpedoes ?? 0, pl.perTorpedoHit],
    [hits.bombs ?? 0, pl.perBombHit],
  ];
  for (const [n, p] of tries) for (let i = 0; i < n; i++) if (rng.next() < p) return pl.minutes / trainingOf(target, ctx.rules).firepowerMultiplier;
  return undefined;
}

/** 艦の残りの弾(武器ごと)。はじめて引いたときに編成表の砲の群れ(apPerGun・hePerGun)から数える。数えない武器は入らない */
export function shellsOf(u: Unit, toe: Toe): Record<string, { ap: number; he: number }> | undefined {
  if (u.shells) return u.shells;
  const counted = (toe.ship?.batteries ?? []).filter((b) => b.apPerGun !== undefined || b.hePerGun !== undefined);
  if (counted.length === 0) return undefined;
  const out: Record<string, { ap: number; he: number }> = {};
  for (const b of counted) {
    const s = (out[b.weapon] ??= { ap: 0, he: 0 });
    s.ap += b.guns * (b.apPerGun ?? 0);
    s.he += b.guns * (b.hePerGun ?? 0);
  }
  u.shells = out;
  return out;
}

/**
 * 1ステップの、艦 a から艦 t への砲戦。arcToe は撃つ方位へ向けられる砲の数にした編成表。share は目標に向ける砲の割合(射線のふさがりも掛けたもの)。
 * accuracy は撃つ側の火力の倍率(練度・指揮官・制圧など)。ranging は撃ち続けた分(分)
 */
export function shipGunnery(
  arcToe: Toe,
  t: Unit,
  tToe: Toe,
  d: number,
  share: number,
  accuracy: number,
  rangingMin: number,
  ctx: SimContext,
  rng: Rng,
  /** 撃つ艦とその編成表(弾を数えるとき)。省略は弾を数えない */
  shooter?: { unit: Unit; toe: Toe },
): GunneryResult {
  const g = ctx.rules.naval!.gunnery!;
  const out: GunneryResult = { hp: 0, hits: 0, penetrating: 0, fire: 0, flooding: 0, gunsLost: 0, shots: 0 };
  const rofK = lookup(g.ammo.rofByRange, d, (x) => x.multiplier);
  const shells = shooter ? shellsOf(shooter.unit, shooter.toe) : undefined;
  const minutes = ctx.stepSeconds / 60;
  const ship = arcToe.ship!;
  const tShip = tToe.ship;
  const size = Math.pow((tShip?.displacementT ?? g.sizeReferenceT) / g.sizeReferenceT, g.sizeExponent);
  const ranging = Math.min(1, g.rangingStart + ((1 - g.rangingStart) * rangingMin) / g.rangingMinutes);
  const base = lookup(g.hitChance, d, (x) => x.chance);
  const p = Math.min(1, base * ranging * size * accuracy * ship.fireControl);
  const deckShare = lookup(g.deckShare, d, (x) => x.share);
  const belt = tShip?.beltMm ?? 0;
  const deck = tShip?.deckMm ?? 0;
  for (const ref of arcToe.elements[0]!.weapons) {
    const w = ctx.weapons.weapons[ref.weapon]!;
    if (!usesGunnery(w, ctx)) continue;
    // 射程の外は撃たない(射程帯の威力が0)
    if (!w.bands.some((b) => d <= b.maxRangeM)) continue;
    let shots = ref.count * share * w.naval!.rofPerMin * minutes * rofK;
    // 弾:揚弾している榴弾か、徹甲弾が尽きたら榴弾。どちらも尽きたら撃てない
    const left = shells?.[ref.weapon];
    let he = shooter?.unit.heLoaded !== undefined;
    if (left) {
      he = (he && left.he > 0) || left.ap <= 0;
      const have = he ? left.he : left.ap;
      if (have <= 0) continue;
      shots = Math.min(shots, have);
      if (he) left.he -= shots;
      else left.ap -= shots;
    }
    out.shots = (out.shots ?? 0) + shots;
    const expected = shots * p;
    const n = Math.floor(expected) + (rng.next() < expected - Math.floor(expected) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const onDeck = rng.next() < deckShare;
      const pen = lookup(onDeck ? w.naval!.deckPenetration : w.naval!.beltPenetration, d, (x) => x.mm) * (he ? g.ammo.hePenetrationMultiplier : 1);
      const through = pen >= (onDeck ? deck : belt);
      const dmg = g.damagePerShell.coefficient * Math.pow(w.naval!.shellKg, g.damagePerShell.exponent) * (through ? 1 : g.nonPenetratingDamage);
      out.hp += dmg;
      out.hits++;
      if (through) out.penetrating++;
      if (rng.next() < (through ? g.fireChance.penetrating : g.fireChance.nonPenetrating) * (he ? g.ammo.heFireMultiplier : 1)) out.fire += g.fireStep;
      if (through && !onDeck && rng.next() < g.floodChance) out.flooding += g.floodStep;
      if (through && rng.next() < g.gunLossChance) out.gunsLost += g.gunLossStep;
    }
  }
  const power = rollPowerLoss(t, { penetrating: out.penetrating }, ctx, rng);
  if (power !== undefined) out.powerOutMin = power;
  return out;
}

/** 動力が止まっている艦か */
export function powerOut(u: Unit): boolean {
  return (u.shipDamage?.powerOut ?? 0) > 0;
}

/** 当たった砲戦の結果を艦の損傷に足す */
export function addShipDamage(u: Unit, r: Pick<GunneryResult, "fire" | "flooding" | "gunsLost" | "powerOutMin">): void {
  const s = (u.shipDamage ??= { fire: 0, flooding: 0, gunsLost: 0 });
  if (r.powerOutMin !== undefined) s.powerOut = Math.max(s.powerOut ?? 0, r.powerOutMin);
  s.fire = Math.min(1, s.fire + r.fire);
  s.flooding = Math.min(1, s.flooding + r.flooding);
  s.gunsLost = Math.min(1, s.gunsLost + r.gunsLost);
}

/**
 * 1ステップの火災・浸水:浮力を削り(火災は制圧も上げる)、応急で減る。応急の速さは練度の火力の倍率に比例。
 * 失った浮力(戦力)を返す
 */
export function stepShipDamage(u: Unit, ctx: SimContext): number {
  const g: Gunnery | undefined = ctx.rules.naval?.gunnery;
  const s = u.shipDamage;
  if (!g || !s || u.strength <= 0) return 0;
  const minutes = ctx.stepSeconds / 60;
  const before = u.strength;
  const fireK = ctx.toes.toes[u.toe]?.carrier ? g.carrierFireMultiplier : 1;
  u.strength = Math.max(0, u.strength - (s.fire * g.fireDamagePerMin * fireK + s.flooding * g.floodDamagePerMin) * minutes);
  u.suppression = Math.max(u.suppression, s.fire);
  const dc = g.damageControlPerMin * trainingOf(u, ctx.rules).firepowerMultiplier * minutes;
  // 大きすぎる火災は応急が追いつかず燃え広がる
  if (g.runawayFireAbove !== undefined && s.fire > g.runawayFireAbove) s.fire = Math.min(1, s.fire + g.runawayFireGrowthPerMin * minutes);
  else s.fire = Math.max(0, s.fire - dc);
  s.flooding = Math.max(0, s.flooding - dc * 0.5);
  // 止まった動力は、応急で時間とともに戻る
  if (s.powerOut !== undefined) {
    s.powerOut -= minutes;
    if (s.powerOut <= 0) delete s.powerOut;
  }
  return before - u.strength;
}

/** 浸水で落ちる速さの倍率 */
export function floodingSpeedMultiplier(u: Unit, ctx: Pick<SimContext, "rules">): number {
  const g = ctx.rules.naval?.gunnery;
  if (g?.powerLoss && powerOut(u)) return g.powerLoss.speedMultiplier;
  return g && u.shipDamage ? 1 - g.floodSpeedLoss * u.shipDamage.flooding : 1;
}

/** 失った砲の分の火力の倍率 */
export function gunsLeftMultiplier(u: Unit): number {
  return 1 - (u.shipDamage?.gunsLost ?? 0);
}
