import type { SimContext } from "../context.js";
import { detectionLevel, detectionRange } from "../detection.js";
import { distance } from "../geometry.js";
import { lookup, shellsOf } from "../gunnery.js";
import { canEngage } from "../identify.js";
import { isShip, navalArc } from "../naval.js";
import type { Rng } from "../rng.js";
import { trainingOf } from "../training.js";
import type { Unit } from "../unit.js";
import { commanderEffect } from "../commanders.js";
import { applyShell, gunsLeft, listAccuracy, type DamageEvent, type HitLocation } from "./damage.js";
import { squadronMainRange } from "./motion.js";
import { bandMeters, sideOf, squadronMembers, squadronOfShip, type Squadrons } from "./squadron.js";

/**
 * 砲戦(docs/naval-design.md の5)。艦は砲の群れごとに目標を選び、目標ごとの射撃の解(0〜1)をためて撃つ。1発ごとに命中を決め、
 * 当たった弾は sea/damage.ts で当たった場所と効果を決める。陸の部隊への艦砲射撃は陸の射撃のまま(combat.ts)
 */

export interface SeaShot {
  attackerId: string;
  targetId: string;
  weapon: string;
  rangeM: number;
  shells: number;
  hits: number;
}

export interface SeaHitReport {
  attackerId: string;
  targetId: string;
  location: HitLocation;
  penetrated: boolean;
  events: DamageEvent[];
}

export interface SeaGunneryInput {
  units: readonly Unit[];
  byId: ReadonlyMap<string, Unit>;
  squadrons: Squadrons;
  ctx: SimContext;
  rng: Rng;
  /** このステップの終わりの時刻(秒) */
  t: number;
  /** このステップの始めの向き(艦の変針の大きさを測る) */
  facingBefore: ReadonlyMap<string, number>;
}

/** 砲戦で撃つ砲の群れ(魚雷でなく、武器に naval のあるもの) */
function gunBatteries(u: Unit, ctx: SimContext) {
  const toe = ctx.toes.toes[u.toe]!;
  return (toe.ship?.batteries ?? []).filter((b) => {
    const w = ctx.weapons.weapons[b.weapon];
    return !!w && !w.torpedo && !!w.naval && b.guns > 0;
  });
}

const KNOTS = 1.943844;

function turned(u: Unit, before: ReadonlyMap<string, number>, minutes: number): number {
  const b = before.get(u.id);
  if (b === undefined) return 0;
  const d = Math.abs((((u.facing - b) % 360) + 540) % 360 - 180);
  return d / Math.max(minutes, 1e-9);
}

/** 1ステップの砲戦。撃った組・当たりの報告を返す(艦の状態はその場で書き換える) */
export function seaGunnery(inp: SeaGunneryInput): { shots: SeaShot[]; hits: SeaHitReport[] } {
  const { units, ctx, rng, squadrons } = inp;
  const g = ctx.rules.naval?.gunnery;
  const fcr = ctx.rules.naval?.fireControl;
  const shots: SeaShot[] = [];
  const hits: SeaHitReport[] = [];
  if (!g || !fcr) return { shots, hits };
  const minutes = ctx.stepSeconds / 60;
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const sqOf = (u: Unit) => {
    const id = squadronOfShip(squadrons, u.id);
    return id ? squadrons[id] : undefined;
  };
  const byId = new Map(units.map((u) => [u.id, u] as const));
  // 1:砲の群れごとの目標を決める
  type Plan = { a: Unit; weapon: string; target: Unit; d: number; bearing: number };
  const plans: Plan[] = [];
  for (const a of ships) {
    const sq = sqOf(a);
    const hold = sq?.fire === "hold";
    // 帯に入ってから:交戦の距離の帯の外の艦には、撃ってきて位置の分かった艦にだけ撃ち返す
    // (交戦の目標がなければ「詰める」の帯)
    const bandMax = sq?.fire === "band" ? bandMeters(sq.engage?.band ?? "close", squadronMainRange(squadronMembers(sq, byId), ctx), ctx).max : undefined;
    const enemies = ships.filter(
      (e) => e.side !== a.side && detectionLevel(a, e, ctx) > 0 && canEngage(a, e, ctx) && (!hold || e.revealed) && (bandMax === undefined || e.revealed || distance(a.pos, e.pos) <= bandMax),
    );
    const batteries = gunBatteries(a, ctx);
    if (enemies.length === 0 || batteries.length === 0) {
      continue;
    }
    const heaviest = Math.max(...batteries.map((b) => ctx.weapons.weapons[b.weapon]!.naval!.shellKg));
    const fc = (a.fc ??= {});
    for (const b of batteries) {
      const w = ctx.weapons.weapons[b.weapon]!;
      const maxRange = w.bands.at(-1)?.maxRangeM ?? 0;
      const inRange = enemies.filter((e) => distance(a.pos, e.pos) <= maxRange);
      if (inRange.length === 0) continue;
      const main = w.naval!.shellKg >= heaviest;
      const keep = fc[b.weapon]?.target;
      const engaged = main && sq?.engage ? inRange.find((e) => e.id === sq.engage!.target) : undefined;
      let target = engaged ?? inRange.find((e) => e.id === keep);
      if (!target) {
        // 主砲は大きな艦へ、副砲・駆逐艦の砲は近い艦へ(naval.gunnery.targetPriority)
        const tp = g.targetPriority ?? { sizeExponent: 0.7, heavyShellKg: 1000, distanceScaleM: 5000 };
        const e = tp.sizeExponent * Math.min(1, w.naval!.shellKg / tp.heavyShellKg);
        const weight = (x: Unit) => {
          const size = (ctx.toes.toes[x.toe]!.ship!.displacementT ?? g.sizeReferenceT) / g.sizeReferenceT;
          return Math.pow(size, e) / (1 + distance(a.pos, x.pos) / tp.distanceScaleM);
        };
        target = [...inRange].sort((p, q) => weight(q) - weight(p) || (p.id < q.id ? -1 : 1))[0]!;
      }
      const arc = navalArc(a.facing, a.pos, target.pos, ctx);
      const toe = ctx.toes.toes[a.toe]!;
      const bearing = Math.floor(b[arc] * gunsLeft(a, toe, b.weapon) + 1e-9);
      if (fc[b.weapon]?.target !== target.id) fc[b.weapon] = { target: target.id, solution: 0 };
      if (bearing <= 0) continue;
      plans.push({ a, weapon: b.weapon, target, d: distance(a.pos, target.pos), bearing });
    }
  }
  // 同じ目標を撃つ艦の数(弾着の見分けにくさ)
  const shooters = new Map<string, Set<string>>();
  for (const p of plans) {
    const s = shooters.get(p.target.id) ?? new Set<string>();
    s.add(p.a.id);
    shooters.set(p.target.id, s);
  }
  // 2:射撃の解を進めて撃つ
  for (const p of plans) {
    const { a, target, d } = p;
    const w = ctx.weapons.weapons[p.weapon]!;
    const aToe = ctx.toes.toes[a.toe]!;
    const tToe = ctx.toes.toes[target.toe]!;
    const sq = sqOf(a);
    const tsq = sqOf(target);
    const fc = a.fc![p.weapon]!;
    const hull = a.hull;
    const power = (hull?.powerOutSec ?? 0) <= 0;
    const radar = aToe.fireControlRadar && power && !hull?.radarOut && d <= aToe.fireControlRadar.rangeM ? aToe.fireControlRadar : undefined;
    const visual = detectionRange(a, target, ctx);
    const visK = d <= visual * fcr.visibilityFrom ? 1 : d >= visual ? fcr.visibilityAtEdge : 1 - ((1 - fcr.visibilityAtEdge) * (d - visual * fcr.visibilityFrom)) / (visual * (1 - fcr.visibilityFrom));
    const salvo = [...fcr.salvo].reverse().find((x) => p.bearing >= x.guns)?.multiplier ?? fcr.salvo[0]!.multiplier;
    const others = (shooters.get(target.id)?.size ?? 1) - 1;
    const confusion = 1 / (1 + fcr.confusionPerShooter * others * (radar ? fcr.radarConfusion : 1));
    const quality = aToe.ship!.fireControl * trainingOf(a, ctx.rules).firepowerMultiplier * (1 - (hull?.director ?? 0)) * (1 - fcr.fireSmoke * (hull?.fire ?? 0));
    const rate = fcr.solutionPerMin * quality * (radar ? fcr.radarMultiplier : 1) * salvo * confusion * Math.max(radar ? 1 : 0, visK);
    // 崩れ:自分と目標の変針、回避運動
    const own = Math.max(0, turned(a, inp.facingBefore, minutes) - fcr.turnFreeDegPerMin);
    const their = Math.max(0, turned(target, inp.facingBefore, minutes) - fcr.turnFreeDegPerMin);
    let s = fc.solution * (1 - Math.min(0.9, (own + their) * fcr.turnLossPerDeg));
    if (sq?.evade) s *= 1 - fcr.evadeLossPerMin * minutes;
    if (tsq?.evade) s *= 1 - fcr.evadeLossPerMin * minutes;
    s = s + (1 - s) * (1 - Math.exp(-rate * minutes));
    // 探照灯で照らされた目標は、測距儀で測れて照準がすぐ合う
    if (target.illuminated && ctx.rules.naval?.illumination?.rangingComplete) s = Math.max(s, 1);
    fc.solution = Math.min(1, Math.max(0, s));
    // 撃つ弾の数(発射の速さ × 向く砲の数 × 遠いほど弾着を待つ分)
    let n = p.bearing * w.naval!.rofPerMin * minutes * lookup(g.ammo.rofByRange, d, (x) => x.multiplier);
    const left = shellsOf(a, aToe)?.[p.weapon];
    let he = a.heLoaded !== undefined;
    if (left) {
      he = (he && left.he > 0) || left.ap <= 0;
      const have = he ? left.he : left.ap;
      if (have <= 0) continue;
      n = Math.min(n, have);
      if (he) left.he -= n;
      else left.ap -= n;
    }
    // 1発の命中
    const size = Math.pow((tToe.ship?.displacementT ?? g.sizeReferenceT) / g.sizeReferenceT, g.sizeExponent);
    const tKn = (target.speedMps ?? 0) * KNOTS;
    const oKn = (a.speedMps ?? 0) * KNOTS;
    const speed = Math.max(0.2, 1 - fcr.targetSpeed.perKn * Math.max(0, tKn - fcr.targetSpeed.fromKn)) * Math.max(0.2, 1 - fcr.ownSpeed.perKn * Math.max(0, oKn - fcr.ownSpeed.fromKn));
    const seen = detectionLevel(a, target, ctx);
    const radarOnly = seen <= 1 && !target.revealed && !target.illuminated ? (radar ? (radar.hitMultiplier ?? g.fireControlRadar.radarOnlyHitMultiplier) : g.radarOnlyHitMultiplier) : 1;
    const dark = ctx.visibilityMultiplier <= (ctx.rules.naval?.sighting?.darkBelow ?? 0.5) ? g.nightHitMultiplier : 1;
    const shaken = a.morale < ctx.rules.morale.shakenBelow ? (ctx.rules.naval?.crew?.shakenAccuracyMultiplier ?? 1) : 1;
    const skill = Math.sqrt(trainingOf(a, ctx.rules).firepowerMultiplier) * commanderEffect(a, "firepower", ctx);
    const pHit = Math.min(1, lookup(g.hitChance, d, (x) => x.chance) * (fcr.floor + (1 - fcr.floor) * fc.solution) * size * speed * skill * listAccuracy(a, ctx) * radarOnly * dark * shaken * (power ? 1 : fcr.localControl));
    const expected = n * pHit;
    const k = Math.floor(expected) + (rng.next() < expected - Math.floor(expected) ? 1 : 0);
    shots.push({ attackerId: a.id, targetId: target.id, weapon: p.weapon, rangeM: d, shells: n, hits: k });
    const deckShare = lookup(g.deckShare, d, (x) => x.share);
    for (let i = 0; i < k && target.strength > 0; i++) {
      const beltPen = lookup(w.naval!.beltPenetration, d, (x) => x.mm);
      const deckPen = lookup(w.naval!.deckPenetration, d, (x) => x.mm);
      const out = applyShell(target, { weapon: p.weapon, shellKg: w.naval!.shellKg, beltPenMm: beltPen, deckPenMm: deckPen, he, deckShare, starboard: sideOf(target.pos, target.facing, a.pos) > 0, t: inp.t }, ctx, rng);
      hits.push({ attackerId: a.id, targetId: target.id, location: out.location, penetrated: out.penetrated, events: out.events });
    }
  }
  return { shots, hits };
}
