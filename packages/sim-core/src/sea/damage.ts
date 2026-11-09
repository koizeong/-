import type { SimContext } from "../context.js";
import type { Rng } from "../rng.js";
import { toeHitPoints, type Toe } from "../toe.js";
import { trainingOf } from "../training.js";
import type { Unit } from "../unit.js";
import type { SeaDamageRules } from "./rules.js";
export type { SeaDamageRules } from "./rules.js";

/**
 * 艦の損害(docs/naval-design.md の6)。1発ごとに当たった場所を引き、場所の装甲で抜けたかを決め、場所ごとの効果を出す。
 * 艦の状態は Unit.hull に持つ。strength(勝敗・画面)= 1 − max(構造の損害, 浸水)。陸の士気・制圧のゲージは艦にかけない
 */

/** 艦の状態 */
export interface Hull {
  /** 構造の損害(0〜1。1で沈む) */
  structure: number;
  /** 浸水(予備の浮力に対する割合。左舷・右舷。合わせて1で沈む) */
  floodPort: number;
  floodStbd: number;
  /** 毎分の流入(予備の浮力に対する割合。左舷・右舷)。応急で穴をふさぐと減る */
  leakPort: number;
  leakStbd: number;
  /** 火災(0〜1) */
  fire: number;
  /** 使えなくなった砲・発射管の数(武器ごと) */
  gunsOut: Record<string, number>;
  /** 射撃指揮所の損害(0〜1。射撃の解の質が落ちる) */
  director: number;
  /** 電探が壊れた */
  radarOut?: boolean;
  /** 機関の損害(0〜1。最大速力が落ちる) */
  engine: number;
  /** 艦首の損害(0〜1。速力の上限が落ちる) */
  bow: number;
  /** 舵の故障:この時刻(秒)まで、決まった向きに回り続ける(舵の角度の符号:右=1・左=-1) */
  rudderJam?: { untilSec: number; dir: 1 | -1 };
  /** 動力の停止の残り(秒) */
  powerOutSec?: number;
  /** 司令塔をやられて、艦の指揮が乱れている残り(秒)。この間は戦隊の動きに従わない */
  conFusedSec?: number;
}



export type HitLocation = "belt" | "deck" | "turret" | "barbette" | "superstructure" | "conningTower" | "funnel" | "bow" | "stern" | "torpedoMount";

export type DamageEvent =
  | { kind: "magazine" }
  | { kind: "torpedoMount" }
  | { kind: "mountLost"; weapon: string }
  | { kind: "engine" }
  | { kind: "powerOut" }
  | { kind: "director" }
  | { kind: "radar" }
  | { kind: "conningTower" }
  | { kind: "rudderJam" }
  | { kind: "fire" }
  | { kind: "capsized" };

export function newHull(): Hull {
  return { structure: 0, floodPort: 0, floodStbd: 0, leakPort: 0, leakStbd: 0, fire: 0, gunsOut: {}, director: 0, engine: 0, bow: 0 };
}

export function hullOf(u: Unit): Hull {
  return (u.hull ??= newHull());
}

export function flood(h: Hull): number {
  return h.floodPort + h.floodStbd;
}

/** 傾斜(度。右舷へ傾けば正) */
export function listDeg(h: Hull, rules: SeaDamageRules): number {
  return (h.floodStbd - h.floodPort) * rules.listPerFlood;
}

/** 艦の戦力(浮力の残り) = 1 − max(構造の損害, 浸水) */
export function hullStrength(h: Hull): number {
  return Math.max(0, 1 - Math.max(h.structure, flood(h)));
}

function pick<T extends string>(weights: Record<string, number>, rng: Rng, allowed: (k: string) => boolean = () => true): T {
  const entries = Object.entries(weights).filter(([k, w]) => w > 0 && allowed(k));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rng.next() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k as T;
  }
  return entries.at(-1)![0] as T;
}

function sizeLeak(toe: Toe, r: SeaDamageRules): number {
  const disp = toe.ship?.displacementT ?? r.leak.referenceT;
  return Math.pow(r.leak.referenceT / disp, r.leak.sizeExponent);
}

function addLeak(h: Hull, amount: number, starboard: boolean) {
  if (starboard) h.leakStbd += amount;
  else h.leakPort += amount;
}

/** 場所の装甲の厚さ(mm) */
function armorAt(toe: Toe, loc: HitLocation): number {
  const s = toe.ship!;
  switch (loc) {
    case "belt":
      return s.beltMm;
    case "deck":
      return s.deckMm;
    case "turret":
      return s.turretMm;
    case "barbette":
      return s.barbetteMm ?? s.turretMm;
    case "conningTower":
      return s.conningTowerMm ?? s.beltMm;
    default:
      return 0;
  }
}

export interface ShellHit {
  weapon: string;
  shellKg: number;
  /** 舷側・甲板それぞれの、この距離での貫通力(mm) */
  beltPenMm: number;
  deckPenMm: number;
  he: boolean;
  /** 甲板に当たる割合(落角) */
  deckShare: number;
  /** 撃たれた側(右舷なら true) */
  starboard: boolean;
  t: number;
}

export interface HitOutcome {
  location: HitLocation;
  penetrated: boolean;
  events: DamageEvent[];
  /** 構造の損害(0〜1) */
  structure: number;
}

/** 艦が積んでいる発射管(魚雷の武器のある砲の群れ) */
function tubesOf(toe: Toe, ctx: SimContext): string[] {
  return (toe.ship?.batteries ?? []).filter((b) => ctx.weapons.weapons[b.weapon]?.torpedo).map((b) => b.weapon);
}

/** 艦の砲の群れのうち、砲(魚雷でない)の武器 */
function gunsOf(toe: Toe, ctx: SimContext): { weapon: string; guns: number }[] {
  return (toe.ship?.batteries ?? []).filter((b) => !ctx.weapons.weapons[b.weapon]?.torpedo && b.guns > 0).map((b) => ({ weapon: b.weapon, guns: b.guns }));
}

/** 1つの砲塔の砲の数(群れの mounts。省略は2門ずつ、1門なら1) */
function gunsPerMount(toe: Toe, weapon: string): number {
  const b = toe.ship?.batteries.find((x) => x.weapon === weapon);
  if (!b) return 1;
  const mounts = b.mounts ?? Math.max(1, Math.round(b.guns / 2));
  return Math.max(1, Math.round(b.guns / mounts));
}

/**
 * 砲弾1発の当たり。当たった場所・抜けたか・効果を出し、艦の状態に足す。弾薬庫の誘爆・転覆で沈めば strength を0にする
 */
export function applyShell(target: Unit, hit: ShellHit, ctx: SimContext, rng: Rng): HitOutcome {
  const r = ctx.rules.naval!.damage!;
  const toe = ctx.toes.toes[target.toe]!;
  const h = hullOf(target);
  const hasTubes = tubesOf(toe, ctx).length > 0;
  const hasGuns = gunsOf(toe, ctx).length > 0;
  const allowed = (k: string) => (k === "torpedoMount" ? hasTubes : k === "turret" || k === "barbette" ? hasGuns : true);
  const onDeck = rng.next() < hit.deckShare;
  const location = pick<HitLocation>(onDeck ? r.deck : r.side, rng, allowed);
  const armor = armorAt(toe, location);
  const pen = (location === "deck" || (onDeck && location === "turret") ? hit.deckPenMm : hit.beltPenMm) * (hit.he ? (ctx.rules.naval!.gunnery?.ammo.hePenetrationMultiplier ?? 0.2) : 1);
  const penetrated = pen >= armor;
  const ov = r.overpenetration;
  const disp = toe.ship?.displacementT ?? r.leak.referenceT;
  const overpen = penetrated && !hit.he && armor < pen / ov.armorRatio && hit.shellKg / disp >= ov.shellToDisplacement;
  const hp = toeHitPoints(toe);
  let structure = (r.structurePerShell.coefficient * Math.pow(hit.shellKg, r.structurePerShell.exponent)) / hp;
  structure *= penetrated ? (overpen ? ov.damageMultiplier : 1) : r.nonPenetrating;
  const events: DamageEvent[] = [];
  const fireMul = hit.he ? r.fire.heMultiplier : 1;
  const addFire = (chance: number) => {
    if (rng.next() < chance * fireMul) {
      h.fire = Math.min(1, h.fire + r.fire.step);
      events.push({ kind: "fire" });
    }
  };
  const magazine = (chance: number) => {
    if (rng.next() < chance && rng.next() < r.magazineDetonation) events.push({ kind: "magazine" });
  };
  const engineHit = () => {
    h.engine = Math.min(1, h.engine + r.engineLossPerHit);
    events.push({ kind: "engine" });
    if (rng.next() < r.powerLoss.chance) {
      h.powerOutSec = Math.max(h.powerOutSec ?? 0, (r.powerLoss.minutes * 60) / trainingOf(target, ctx.rules).firepowerMultiplier);
      events.push({ kind: "powerOut" });
    }
  };
  const loseMount = (weapon: string) => {
    const b = toe.ship!.batteries.find((x) => x.weapon === weapon)!;
    const out = h.gunsOut[weapon] ?? 0;
    if (out >= b.guns) return;
    h.gunsOut[weapon] = Math.min(b.guns, out + gunsPerMount(toe, weapon));
    events.push({ kind: "mountLost", weapon });
  };
  const leakSize = r.leak.perShell * Math.sqrt(hit.shellKg / 100) * sizeLeak(toe, r);
  switch (location) {
    case "belt":
      if (penetrated && !overpen) {
        if (rng.next() < r.beltPen.engine) engineHit();
        magazine(r.beltPen.magazine);
        if (rng.next() < r.beltPen.waterline) addLeak(h, leakSize, hit.starboard);
      }
      addFire(penetrated ? r.fire.penetrating : r.fire.nonPenetrating);
      break;
    case "deck":
      if (penetrated && !overpen) {
        if (rng.next() < r.deckPen.engine) engineHit();
        magazine(r.deckPen.magazine);
      }
      addFire(penetrated ? r.fire.penetrating : r.fire.nonPenetrating);
      break;
    case "turret":
    case "barbette": {
      // どの砲塔か:砲の群れのうち、砲の数の多さで引く
      const guns = gunsOf(toe, ctx);
      const weapon = pick<string>(Object.fromEntries(guns.map((g) => [g.weapon, g.guns])), rng);
      if (rng.next() < (penetrated ? r.mountLoss.penetrating : r.mountLoss.nonPenetrating)) loseMount(weapon);
      if (penetrated && !hit.he) magazine(location === "turret" ? r.flash.turret / r.magazineDetonation : r.flash.barbette / r.magazineDetonation);
      break;
    }
    case "superstructure":
      addFire(r.fire.superstructure);
      if (rng.next() < r.director.chance) {
        h.director = Math.min(1, h.director + r.director.loss);
        events.push({ kind: "director" });
      }
      if (!h.radarOut && rng.next() < r.radarLossChance) {
        h.radarOut = true;
        events.push({ kind: "radar" });
      }
      break;
    case "conningTower":
      if (penetrated) {
        h.conFusedSec = Math.max(h.conFusedSec ?? 0, r.conningTowerMinutes * 60);
        events.push({ kind: "conningTower" });
      }
      break;
    case "funnel":
      h.engine = Math.min(1, h.engine + r.engineLossPerHit * 0.3);
      addFire(r.fire.nonPenetrating);
      break;
    case "bow":
      h.bow = Math.min(1, h.bow + r.bowDamagePerHit);
      if (penetrated && !overpen) addLeak(h, leakSize * r.leak.bowMultiplier, hit.starboard);
      break;
    case "stern":
      if (penetrated && !overpen) addLeak(h, leakSize * r.leak.sternMultiplier, hit.starboard);
      if (rng.next() < r.rudderJam.chance) jamRudder(h, hit.t, r, rng, events);
      break;
    case "torpedoMount": {
      const tubes = tubesOf(toe, ctx);
      const weapon = tubes[Math.floor(rng.next() * tubes.length)]!;
      const loaded = (target.torpedoLoad?.salvosLeft ?? 1) > 0;
      if (loaded && rng.next() < r.torpedoMount.detonation) {
        const w = ctx.weapons.weapons[weapon]!;
        const warhead = w.torpedoRun?.warheadKg ?? 200;
        structure += (r.torpedoMount.warheadsAtRisk * r.torpedo.coefficient * Math.pow(warhead, r.torpedo.exponent)) / hp;
        h.fire = Math.min(1, h.fire + r.fire.step * 2);
        events.push({ kind: "torpedoMount" });
      }
      loseMount(weapon);
      break;
    }
  }
  h.structure = Math.min(1, h.structure + structure);
  if (events.some((e) => e.kind === "magazine")) h.structure = 1;
  target.strength = hullStrength(h);
  return { location, penetrated, events, structure };
}

function jamRudder(h: Hull, t: number, r: SeaDamageRules, rng: Rng, events: DamageEvent[]) {
  const minutes = r.rudderJam.minMinutes + rng.next() * (r.rudderJam.maxMinutes - r.rudderJam.minMinutes);
  h.rudderJam = { untilSec: t + minutes * 60, dir: rng.next() < 0.5 ? 1 : -1 };
  events.push({ kind: "rudderJam" });
}

/** 魚雷 hits 本の当たり(当たった場所は艦首・中央・艦尾)。撃たれた側は starboard */
export function applyTorpedo(target: Unit, warheadKg: number, hits: number, starboard: boolean, t: number, ctx: SimContext, rng: Rng): { events: DamageEvent[]; structure: number } {
  const r = ctx.rules.naval!.damage!;
  const toe = ctx.toes.toes[target.toe]!;
  const h = hullOf(target);
  const events: DamageEvent[] = [];
  let structure = 0;
  for (let i = 0; i < hits; i++) {
    const where = pick<"bow" | "mid" | "stern">({ bow: r.torpedo.bow, mid: r.torpedo.mid, stern: r.torpedo.stern }, rng);
    structure += (r.torpedo.coefficient * Math.pow(warheadKg, r.torpedo.exponent)) / toeHitPoints(toe);
    addLeak(h, r.leak.perTorpedo * (warheadKg / 200) * sizeLeak(toe, r) * (where === "bow" ? r.leak.bowMultiplier : where === "stern" ? r.leak.sternMultiplier : 1), starboard);
    if (where === "bow") h.bow = Math.min(1, h.bow + r.bowDamagePerHit * 2);
    if (where === "mid" && rng.next() < r.torpedo.engine) {
      h.engine = Math.min(1, h.engine + r.engineLossPerHit * 2);
      events.push({ kind: "engine" });
      if (rng.next() < r.powerLoss.chance * 2) {
        h.powerOutSec = Math.max(h.powerOutSec ?? 0, (r.powerLoss.minutes * 60) / trainingOf(target, ctx.rules).firepowerMultiplier);
        events.push({ kind: "powerOut" });
      }
    }
    if (where === "stern" && rng.next() < r.torpedo.rudderJam) jamRudder(h, t, r, rng, events);
    if (where !== "stern" && rng.next() < r.torpedo.magazine && rng.next() < r.magazineDetonation) events.push({ kind: "magazine" });
  }
  h.structure = Math.min(1, h.structure + structure);
  if (events.some((e) => e.kind === "magazine")) h.structure = 1;
  target.strength = hullStrength(h);
  return { events, structure };
}

/**
 * 爆弾1発(空から。甲板・砲塔・上部構造に当たる)。penMm は甲板への貫通力(徹甲爆弾の重さで決める)。
 * 空母は火災が燃え広がりやすい(燃料と兵装)
 */
export function applyBomb(target: Unit, bombKg: number, penMm: number, t: number, ctx: SimContext, rng: Rng): HitOutcome {
  return applyShell(target, { weapon: "bomb", shellKg: bombKg, beltPenMm: 0, deckPenMm: penMm, he: false, deckShare: 1, starboard: rng.next() < 0.5, t }, ctx, rng);
}

/**
 * 1ステップ(minutes 分)の艦の状態の変化:火災が構造を焼き、浸水が流れ込み、応急が火を消し・穴をふさぎ・注水で傾きを戻す。
 * 動力の停止・司令塔の混乱は時間で戻る。転覆したら沈む。失った戦力と出来事を返す
 */
export function stepHull(u: Unit, minutes: number, ctx: SimContext): { lost: number; events: DamageEvent[] } {
  const r = ctx.rules.naval?.damage;
  const h = u.hull;
  if (!r || !h || u.strength <= 0) return { lost: 0, events: [] };
  const before = u.strength;
  const events: DamageEvent[] = [];
  const dc = trainingOf(u, ctx.rules).firepowerMultiplier;
  const carrier = ctx.toes.toes[u.toe]?.carrier ? r.fire.carrierMultiplier : 1;
  h.structure = Math.min(1, h.structure + h.fire * r.fire.structurePerMin * carrier * minutes);
  if (h.fire > r.fire.runawayAbove) h.fire = Math.min(1, h.fire + r.fire.runawayGrowthPerMin * carrier * minutes);
  else h.fire = Math.max(0, h.fire - r.damageControl.fireOutPerMin * dc * minutes);
  h.floodPort = Math.min(1, h.floodPort + h.leakPort * minutes);
  h.floodStbd = Math.min(1, h.floodStbd + h.leakStbd * minutes);
  const seal = Math.pow(1 - Math.min(0.95, r.damageControl.leakSealPerMin * dc), minutes);
  h.leakPort *= seal;
  h.leakStbd *= seal;
  if (h.leakPort < 1e-5) h.leakPort = 0;
  if (h.leakStbd < 1e-5) h.leakStbd = 0;
  // 注水:傾いた艦は、反対舷に水を入れて傾きを戻す(浸水の合計は増える)
  const diff = h.floodStbd - h.floodPort;
  const cf = Math.min(Math.abs(diff), r.damageControl.counterfloodPerMin * dc * minutes);
  if (diff > 0) h.floodPort += cf;
  else h.floodStbd += cf;
  if (Math.abs(listDeg(h, r)) > r.capsizeDeg) {
    h.structure = 1;
    events.push({ kind: "capsized" });
  }
  if (h.powerOutSec !== undefined) {
    h.powerOutSec -= minutes * 60;
    if (h.powerOutSec <= 0) delete h.powerOutSec;
  }
  if (h.conFusedSec !== undefined) {
    h.conFusedSec -= minutes * 60;
    if (h.conFusedSec <= 0) delete h.conFusedSec;
  }
  u.strength = hullStrength(h);
  return { lost: before - u.strength, events };
}

/** 艦の最大速力の倍率(機関・艦首・浸水・動力の停止) */
export function hullSpeedMultiplier(u: Unit, ctx: SimContext): number {
  const r = ctx.rules.naval?.damage;
  const h = u.hull;
  if (!r || !h) return 1;
  if ((h.powerOutSec ?? 0) > 0) return 0;
  return Math.max(0, (1 - h.engine) * (1 - h.bow * 0.5) * (1 - r.floodSpeedLoss * flood(h)));
}

/** 武器の、使える砲の割合(砲塔の損失) */
export function gunsLeft(u: Unit, toe: Toe, weapon: string): number {
  const b = toe.ship?.batteries.find((x) => x.weapon === weapon);
  if (!b || b.guns <= 0) return 1;
  return Math.max(0, 1 - (u.hull?.gunsOut[weapon] ?? 0) / b.guns);
}

/** 傾斜による射撃の倍率 */
export function listAccuracy(u: Unit, ctx: SimContext): number {
  const r = ctx.rules.naval?.damage;
  if (!r || !u.hull) return 1;
  const over = Math.abs(listDeg(u.hull, r)) - r.listAccuracyFromDeg;
  return over > 0 ? Math.max(0, 1 - over * r.listAccuracyPerDeg) : 1;
}
