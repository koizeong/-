import { commanderEffect } from "./commanders.js";
import { antiAirOf } from "./air.js";
import { detectionLevel } from "./detection.js";
import { armorNow } from "./armor.js";
import { damageTakenFactors, factorProduct, type FireResult } from "./combat.js";
import type { SimContext } from "./context.js";
import { bearing, distance, type Vec2 } from "./geometry.js";
import type { IntelState } from "./intel.js";
import type { GunneryResult } from "./gunnery.js";
import { isNaval, isShip, navalFormationOf } from "./naval.js";
import { trainingOf } from "./training.js";
import type { Rng } from "./rng.js";
import { toeFire, toeHitPoints } from "./toe.js";
import type { AirState, Unit } from "./unit.js";

/**
 * 盤上の航空隊(編成表の air)。母艦(空母の戦隊)か陸の飛行場を基地にし、目標を指すと飛んで行って攻撃し、
 * 帰って積み直してから、また出られる。往復は自動(プレイヤーが決めるのは行き先だけ)。
 * 地上・艦上の撃ち合い(直接射撃)には加わらず、撃たれもしない。損害を受けるのは空戦と対空射撃だけ。
 * 目標の保持・阻止圏・包囲には数えない
 */

/** 航空隊への命令。strike=敵の部隊(その陣営から見た contactId)を攻撃 / cap=味方の部隊の上空を守る / search=地点を索敵 / return=帰投 */
export type AirOrder = { kind: "strike"; target: string } | { kind: "cap"; over: string } | { kind: "search"; point: Vec2 } | { kind: "return" };

export function isAirGroup(u: Pick<Unit, "toe">, ctx: Pick<SimContext, "toes">): boolean {
  return !!ctx.toes.toes[u.toe]?.air;
}

/** 飛んでいる(地上・艦上で待っていない) */
export function isAirborne(u: Unit): boolean {
  const s = u.air?.status;
  return s === "outbound" || s === "attacking" || s === "returning" || s === "cap" || s === "searching";
}

/** 基地の位置(母艦が沈んでいれば undefined) */
export function airBasePos(u: Unit, units: readonly Unit[]): Vec2 | undefined {
  const a = u.air;
  if (!a) return undefined;
  if (a.baseId !== undefined) {
    const base = units.find((x) => x.id === a.baseId && x.strength > 0);
    return base?.pos;
  }
  return a.basePos;
}

/** 発着艦できる基地か(陸の飛行場はいつも。母艦は戦力が carrierOpsMinStrength 以上) */
export function baseOperational(u: Unit, units: readonly Unit[], ctx: SimContext): boolean {
  const a = u.air;
  if (!a) return false;
  if (a.baseId === undefined) return a.basePos !== undefined;
  const base = units.find((x) => x.id === a.baseId);
  const maxFire = ctx.rules.airGroups?.carrierOpsMaxFire;
  // 火災の大きい母艦は発着艦できない
  if (base && maxFire !== undefined && (base.shipDamage?.fire ?? 0) > maxFire) return false;
  return !!base && base.strength >= (ctx.rules.airGroups?.carrierOpsMinStrength ?? 0);
}

/** 命令を確かめる(弾く理由。よければ null)。目標の敵は intel で探す */
export function validateAirOrder(u: Unit, o: AirOrder, units: ReadonlyMap<string, Unit>, ctx: SimContext, intel: IntelState): string | null {
  const toe = ctx.toes.toes[u.toe]!;
  if (!toe.air || !u.air) return "航空隊ではありません";
  if (!ctx.rules.airGroups) return "このルールパックでは航空隊を使えません";
  if (o.kind === "return") return isAirborne(u) || u.air.status === "spotting" ? null : "飛んでいません";
  if (u.air.status === "spotting") return "発艦の準備中です(取りやめは帰投の命令で)";
  if (ctx.phase === "night") return "夜は発進できません";
  if (u.air.status === "rearming") return "積み直しの途中です";
  if (u.air.status === "outbound" || u.air.status === "attacking" || u.air.status === "returning") return "飛行中は行き先を変えられません(帰投だけできます)";
  const all = [...units.values()];
  if (u.air.status === "ready" && !baseOperational(u, all, ctx)) return "基地から発進できません(母艦の損傷)";
  const from = isAirborne(u) ? u.pos : airBasePos(u, all);
  if (!from) return "基地がありません";
  let at: Vec2;
  if (o.kind === "strike") {
    if (toe.air.role === "scout") return "索敵機は攻撃に出せません";
    const found = Object.entries(intel[u.side]?.entries ?? {}).find(([, e]) => e.contactId === o.target);
    if (!found || found[1].confirmedDestroyed) return "攻撃する敵が見つかりません";
    if (ctx.toes.toes[units.get(found[0])?.toe ?? ""]?.air) return "航空隊は攻撃の目標にできません(戦闘機の空戦で落とします)";
    at = found[1].lastSeenPos;
  } else if (o.kind === "cap") {
    if (toe.air.role !== "fighter") return "上空直衛は戦闘機だけです";
    const over = units.get(o.over);
    if (!over || over.side !== u.side || over.strength <= 0) return "守る味方が見つかりません";
    at = over.pos;
  } else {
    if (!Number.isFinite(o.point.x) || !Number.isFinite(o.point.y)) return "索敵の地点が不正です";
    at = o.point;
  }
  if (distance(from, at) > toe.air.radiusM) return "行動半径の外です";
  return null;
}

/**
 * 命令を受ける(確かめた後)。飛行甲板の決まり(airGroups.deck)があり、母艦から出る隊は、甲板が空くまで発艦の準備(spotting)で待ち、
 * 1隊ずつ launchMinutes かけて飛び立つ(同じ母艦の隊は順番に並ぶ)
 */
export function applyAirOrder(u: Unit, o: AirOrder, intel: IntelState, units?: ReadonlyMap<string, Unit>, ctx?: SimContext): void {
  const a = u.air!;
  if (o.kind === "return") {
    // 発艦の準備の取りやめ
    if (a.status === "spotting") {
      a.status = "ready";
      delete a.pending;
      delete a.launchInSec;
      return;
    }
    a.status = "returning";
    delete a.targetId;
    delete a.overId;
    return;
  }
  const deck = ctx?.rules.airGroups?.deck;
  const carrier = a.baseId !== undefined ? units?.get(a.baseId) : undefined;
  if (deck && carrier && a.status === "ready") {
    const wait = (carrier.deckBusySec ?? 0) + deck.launchMinutes * 60;
    carrier.deckBusySec = wait;
    a.status = "spotting";
    a.launchInSec = wait;
    if (o.kind === "strike") {
      const [id, e] = Object.entries(intel[u.side]?.entries ?? {}).find(([, x]) => x.contactId === o.target)!;
      a.pending = { kind: "strike", targetId: id, point: { ...e.lastSeenPos } };
    } else if (o.kind === "cap") a.pending = { kind: "cap", over: o.over };
    else a.pending = { kind: "search", point: { ...o.point } };
    return;
  }
  if (o.kind === "strike") {
    const [id, e] = Object.entries(intel[u.side]?.entries ?? {}).find(([, x]) => x.contactId === o.target)!;
    a.status = "outbound";
    a.targetId = id;
    a.point = { ...e.lastSeenPos };
    delete a.overId;
  } else if (o.kind === "cap") {
    a.status = "cap";
    a.overId = o.over;
    delete a.targetId;
  } else {
    a.status = "searching";
    a.point = { ...o.point };
    delete a.targetId;
    delete a.overId;
  }
}

export type AirEvent =
  | { t: number; unitId: string; type: "airLaunched" }
  | { t: number; unitId: string; type: "airStrikeBegan"; targetId: string }
  | { t: number; unitId: string; type: "airReturned" }
  | { t: number; unitId: string; type: "airReady" }
  | { t: number; unitId: string; type: "airLost"; reason: "noBase" }
  | { t: number; unitId: string; type: "airMissed" };

/**
 * 航空隊を1ステップ進める:発進待ち・積み直しは基地に乗ったまま、飛んでいれば行き先へまっすぐ飛ぶ。
 * 攻撃の時間が終われば帰投し、着けば積み直す。夜になれば、飛んでいる航空隊は帰投する。
 * 帰る母艦がなくなっていれば、ほかの発着艦できる母艦へ向かい、なければ失う
 */
export function stepAirGroups(units: Unit[], tEnd: number, dt: number, ctx: SimContext, intel: IntelState, emit: (e: AirEvent) => void): void {
  const r = ctx.rules.airGroups;
  if (!r) return;
  // 飛行甲板の順番待ちを進める
  for (const u of units) if (u.deckBusySec !== undefined) u.deckBusySec = Math.max(0, u.deckBusySec - dt);
  for (const u of units) {
    const a = u.air;
    const spec = ctx.toes.toes[u.toe]!.air;
    if (!a || !spec || u.strength <= 0) continue;
    // 発艦の準備:順番が来たら飛び立つ(母艦が発着艦できなければ待つ)
    if (a.status === "spotting") {
      const base = airBasePos(u, units);
      if (base) u.pos = { ...base };
      a.launchInSec = Math.max(0, (a.launchInSec ?? 0) - dt);
      if (a.launchInSec > 0 || !baseOperational(u, units, ctx) || ctx.phase === "night") continue;
      const p = a.pending;
      delete a.pending;
      delete a.launchInSec;
      if (!p) {
        a.status = "ready";
        continue;
      }
      if (p.kind === "strike") {
        a.status = "outbound";
        a.targetId = p.targetId;
        a.point = { ...p.point };
      } else if (p.kind === "cap") {
        a.status = "cap";
        a.overId = p.over;
      } else {
        a.status = "searching";
        a.point = { ...p.point };
      }
      emit({ t: tEnd, unitId: u.id, type: "airLaunched" });
      continue;
    }
    if (ctx.phase === "night" && isAirborne(u) && a.status !== "returning") a.status = "returning";
    // 帰る母艦が沈んだ・発着艦できなくなった:ほかの母艦へ
    if (isAirborne(u) && a.baseId !== undefined && !baseOperational(u, units, ctx)) {
      const alt = units
        .filter((x) => x.side === u.side && x.strength >= r.carrierOpsMinStrength && ctx.toes.toes[x.toe]?.carrier && distance(x.pos, u.pos) <= spec.radiusM)
        .sort((p, q) => distance(p.pos, u.pos) - distance(q.pos, u.pos) || (p.id < q.id ? -1 : 1))[0];
      if (alt) a.baseId = alt.id;
    }
    const base = airBasePos(u, units);
    if (a.status === "ready" || a.status === "rearming") {
      if (base) u.pos = { ...base };
      if (a.status === "rearming" && a.readyAt !== undefined && tEnd >= a.readyAt) {
        a.status = "ready";
        delete a.readyAt;
        u.ammo = 1;
        u.fuel = 1;
        emit({ t: tEnd, unitId: u.id, type: "airReady" });
      }
      continue;
    }
    const step = (spec.speedMpm / 60) * dt;
    const fly = (to: Vec2) => {
      const d = distance(u.pos, to);
      if (d > 0) u.facing = bearing(u.pos, to);
      u.pos = d <= step ? { ...to } : { x: u.pos.x + ((to.x - u.pos.x) * step) / d, y: u.pos.y + ((to.y - u.pos.y) * step) / d };
      return d <= step;
    };
    if (a.status === "returning") {
      if (!base || !baseOperational(u, units, ctx)) {
        // 降りる所がない
        u.strength = 0;
        emit({ t: tEnd, unitId: u.id, type: "airLost", reason: "noBase" });
        continue;
      }
      if (fly(base)) {
        a.status = "rearming";
        // 着艦も1隊ずつ甲板を使う(後の発艦が待たされる)
        const carrier = a.baseId !== undefined ? units.find((x) => x.id === a.baseId) : undefined;
        if (r.deck && carrier) carrier.deckBusySec = (carrier.deckBusySec ?? 0) + r.deck.recoverMinutes * 60;
        delete a.delivered;
        a.readyAt = tEnd + r.turnaroundMinutes * 60;
        delete a.targetId;
        delete a.point;
        emit({ t: tEnd, unitId: u.id, type: "airReturned" });
      }
      continue;
    }
    // 行動半径を越えて追うことはしない(基地から半径の外へ出そうなら引き返す)
    if (base && distance(base, u.pos) > spec.radiusM) {
      a.status = "returning";
      continue;
    }
    if (a.status === "cap") {
      const over = units.find((x) => x.id === a.overId && x.strength > 0);
      if (!over) a.status = "returning";
      else fly(over.pos);
      continue;
    }
    if (a.status === "searching") {
      // 索敵機は敵の艦艇を艦種まで見分けたら引き返す(触接を報告して、敵の上空直衛に飛び込まない)
      const found = spec.role === "scout" && units.some((e) => e.side !== u.side && e.strength > 0 && isNaval(e, ctx) && detectionLevel(u, e, ctx) >= 2);
      if (found || fly(a.point!)) a.status = "returning";
      continue;
    }
    if (a.status === "outbound") {
      const target = units.find((x) => x.id === a.targetId);
      const known = intel[u.side]?.entries[a.targetId ?? ""];
      // 陣営の誰か(または自分の目)に見えていれば今の位置へ、見えていなければ最後に知った位置へ
      if (target && target.strength > 0 && ((known && known.currentLevel > 0) || detectionLevel(u, target, ctx) > 0)) a.point = { ...target.pos };
      const arrived = fly(a.point!);
      if (target && target.strength > 0 && distance(u.pos, target.pos) <= r.attackRadiusM) {
        a.status = "attacking";
        a.attackLeftSec = r.strikeMinutes * 60;
        emit({ t: tEnd, unitId: u.id, type: "airStrikeBegan", targetId: target.id });
      } else if (arrived) {
        // 最後に知った位置に来ても目標がいない
        a.status = "returning";
        emit({ t: tEnd, unitId: u.id, type: "airMissed" });
      }
      continue;
    }
    if (a.status === "attacking") {
      const target = units.find((x) => x.id === a.targetId);
      if (target && target.strength > 0) fly(target.pos);
      a.attackLeftSec = (a.attackLeftSec ?? 0) - dt;
      if (!target || target.strength <= 0 || a.attackLeftSec <= 0) {
        a.status = "returning";
        delete a.attackLeftSec;
      }
    }
  }
}

/** 発進:発進待ちから飛び立った航空隊の出来事(命令を受けたターンの始めに) */
export function launchEvents(before: ReadonlyMap<string, AirState["status"]>, units: readonly Unit[], t: number): AirEvent[] {
  return units.filter((u) => u.air && before.get(u.id) === "ready" && isAirborne(u)).map((u) => ({ t, unitId: u.id, type: "airLaunched" as const }));
}

/**
 * 1隻ずつの艦への爆弾・魚雷(airGroups.ordnance)。機数は編成表の機数 × 戦力。1機ずつ命中を決め、爆弾は甲板を抜けるか、魚雷は爆発するかを見る。
 * aa はまわりの対空の力(照準を乱す)
 */
export function dropOrdnance(g: Unit, target: Unit, aa: number, units: readonly Unit[], ctx: SimContext, rng: Rng): GunneryResult {
  const o = ctx.rules.airGroups!.ordnance!;
  const out: GunneryResult = { hp: 0, hits: 0, penetrating: 0, fire: 0, flooding: 0, gunsLost: 0 };
  const tToe = ctx.toes.toes[target.toe]!;
  const size = Math.pow((tToe.ship?.displacementT ?? 10000) / 10000, o.sizeExponent);
  const formation = navalFormationOf(target, ctx)?.airDamageTakenMultiplier ?? 1;
  const skill = trainingOf(g, ctx.rules).firepowerMultiplier * commanderEffect(g, "firepower", ctx);
  const disrupt = Math.exp(-aa * o.aaDisruption);
  // 兵装中・発艦待ちの隊を載せた空母(甲板と格納庫に燃料と爆弾・魚雷がある)
  const armed = tToe.carrier ? units.filter((x) => x.air?.baseId === target.id && x.strength > 0 && (x.air.status === "rearming" || x.air.status === "spotting" || x.air.status === "ready")).length : 0;
  for (const e of ctx.toes.toes[g.toe]!.elements) {
    for (const ref of e.weapons) {
      const w = ctx.weapons.weapons[ref.weapon]!;
      const ord = w.airOrdnance;
      if (!ord) continue;
      const planes = Math.round(e.count * ref.count * g.strength);
      const p = Math.min(1, o.hitChance[ord.kind] * ord.accuracy * size * skill * formation * disrupt);
      for (let i = 0; i < planes; i++) {
        if (rng.next() >= p) continue;
        if (ord.kind === "torpedo") {
          if (rng.next() >= ord.reliability) continue;
          const t = ctx.rules.naval?.torpedoes;
          out.hp += (t?.damage.coefficient ?? o.bombDamage.coefficient) * Math.pow(ord.kg, t?.damage.exponent ?? o.bombDamage.exponent);
          out.flooding += o.torpedoFloodStep;
          out.penetrating++;
        } else {
          const through = ord.deckPenetrationMm >= (tToe.ship?.deckMm ?? 0);
          out.hp += o.bombDamage.coefficient * Math.pow(ord.kg, o.bombDamage.exponent) * (through ? 1 : o.nonPenetratingDamage);
          // 甲板を抜けない爆弾は、上部構造の小さな火災だけ(兵装中の空母は、それでも甲板の上の機が燃える)
          out.fire += o.bombFireStep * (through ? 1 : o.nonPenetratingDamage) + o.armedDeckFireStep * armed;
          if (through) out.penetrating++;
        }
        out.hits++;
      }
    }
  }
  return out;
}

/** 航空隊の空戦・対空射撃・攻撃の損害(1ステップ分)。結果は直接射撃と同じ形で返し、まとめて適用する */
export function computeAirCombat(units: readonly Unit[], ctx: SimContext, rng: Rng): FireResult[] {
  const r = ctx.rules.airGroups;
  if (!r) return [];
  const c = ctx.rules.combat;
  const minutes = ctx.stepSeconds / 60;
  const out: FireResult[] = [];
  const flying = units.filter((u) => u.strength > 0 && isAirborne(u)).sort((p, q) => (p.id < q.id ? -1 : 1));
  // 空戦:戦闘機は近くの敵の航空隊を撃つ(相手が多ければ火力を分ける)。攻撃機・索敵機は、自分を撃ってくる戦闘機に撃ち返す
  for (const g of flying) {
    const role = ctx.toes.toes[g.toe]!.air!.role;
    const near = flying.filter((e) => e.side !== g.side && distance(e.pos, g.pos) <= r.interceptRadiusM);
    const targets = role === "fighter" ? near : near.filter((e) => ctx.toes.toes[e.toe]!.air!.role === "fighter");
    if (targets.length === 0) continue;
    const power = antiAirOf(g, ctx) * commanderEffect(g, "airCombat", ctx);
    for (const t of targets) {
      const points = (power / targets.length) * minutes * r.airCombatScale * rng.spread(c.damageSpread);
      out.push({ attackerId: g.id, targetId: t.id, aspect: "indirect", damage: points / toeHitPoints(ctx.toes.toes[t.toe]!), suppressionMultiplier: 0 });
    }
  }
  for (const g of flying.filter((x) => x.air!.status === "attacking")) {
    const target = units.find((x) => x.id === g.air!.targetId);
    if (!target || target.strength <= 0) continue;
    // 対空射撃:攻撃中の航空隊は、まわりの敵の艦艇・部隊の対空の力で撃たれる(輪形陣は大きい)
    const gunners = units.filter((x) => x.side !== g.side && x.strength > 0 && !isAirGroup(x, ctx) && distance(x.pos, g.pos) <= r.antiAirRadiusM);
    const aa = gunners.reduce((s, x) => s + antiAirOf(x, ctx) * (isNaval(x, ctx) ? (navalFormationOf(x, ctx)?.antiAirMultiplier ?? 1) : 1), 0);
    if (aa > 0) {
      const points = aa * minutes * r.antiAirScale * rng.spread(c.damageSpread);
      out.push({ attackerId: gunners[0]!.id, targetId: g.id, aspect: "indirect", damage: points / toeHitPoints(ctx.toes.toes[g.toe]!), suppressionMultiplier: 0 });
    }
    // 1隻ずつの艦への爆弾・魚雷:着いた最初のステップに1機1発を落とす(この出撃では一度だけ)
    const gToe = ctx.toes.toes[g.toe]!;
    if (r.ordnance && isShip(target, ctx) && gToe.elements.some((e) => e.weapons.some((w) => ctx.weapons.weapons[w.weapon]?.airOrdnance))) {
      if (g.air!.delivered) continue;
      g.air!.delivered = true;
      const res = dropOrdnance(g, target, aa, units, ctx, rng);
      if (res.hits === 0) continue;
      const gw = ctx.rules.naval?.gunnery;
      out.push({
        attackerId: g.id,
        targetId: target.id,
        aspect: "indirect",
        damage: res.hp / toeHitPoints(ctx.toes.toes[target.toe]!) / c.gaugeWeights.strength,
        moraleMultiplier: gw?.moraleMultiplier ?? 1,
        suppressionMultiplier: gw?.suppressionMultiplier ?? 1,
        shipHits: res,
      });
      continue;
    }
    // 攻撃:爆弾・魚雷(魚雷は艦艇にだけ)。陣形の、航空攻撃で受ける損害の倍率(輪形陣は小さい)
    const tNaval = isNaval(target, ctx);
    const fire = toeFire(gToe, ctx.weapons, 0, armorNow(target, ctx), false, undefined, undefined, (w) => !!w.torpedo && !tNaval);
    if (fire.firepower <= 0) continue;
    const formation = tNaval ? (navalFormationOf(target, ctx)?.airDamageTakenMultiplier ?? 1) : 1;
    // 陣地(島の守備隊の掩体など)は空からの攻撃の損害も減らす
    const dug = c.entrenchmentDamageTaken[target.entrenchment - ctx.rules.entrenchment.minLevel] ?? 1;
    const points = fire.firepower * g.strength * commanderEffect(g, "firepower", ctx) * minutes * c.damageScale * r.strikeScale * formation * dug * factorProduct(damageTakenFactors(target, ctx)) * rng.spread(c.damageSpread);
    out.push({
      attackerId: g.id,
      targetId: target.id,
      aspect: "indirect",
      damage: points / toeHitPoints(ctx.toes.toes[target.toe]!),
      suppressionMultiplier: fire.suppression,
      ...(formation !== 1 ? { situational: [{ id: "navalAir", label: "陣形(航空攻撃)", value: formation }] } : {}),
    });
  }
  return out;
}
