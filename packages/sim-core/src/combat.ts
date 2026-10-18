import type { SimContext } from "./context.js";
import { trainingOf } from "./training.js";
import { fatigueFirepowerMultiplier } from "./fatigue.js";
import { detectionLevel } from "./detection.js";
import { aspectDamageMultiplier, attackAspect, type Aspect } from "./facing.js";
import { frontageOf, unitClosestPoints, unitDistance } from "./frontage.js";
import { distance } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance, stanceOf } from "./stance.js";
import { toeDirectMaxRange, toeFire, toeHitPoints } from "./toe.js";
import { canAttack, type Unit } from "./unit.js";

export interface FireResult {
  attackerId: string;
  targetId: string;
  /** 直接射撃なら攻撃された面。間接射撃は向きの倍率がかからないので "indirect" */
  aspect: Aspect | "indirect";
  /** 目標の耐久に対する損害の割合(ゲージへの振り分け前) */
  damage: number;
  /** 士気への打撃の倍率(夜襲など。省略は1) */
  moraleMultiplier?: number;
  /** 制圧への効きの倍率(武器の制圧のしやすさ。省略は1) */
  suppressionMultiplier?: number;
  /** この射撃にだけかかった倍率(撃たれた面・後手の一撃・伏撃の初撃・夜襲・戦闘移動中の射撃・戦闘正面幅。画面用) */
  situational?: Factor[];
}

/**
 * 損害の計算にかかっている倍率の1つ(画面で「いま効いている補正」を見せるため)。
 * value が1の要因は並べない
 */
export interface Factor {
  /** 種類(画面の色分け・まとめに使う) */
  id: string;
  /** 画面に出す名前(ルールパックの名前から) */
  label: string;
  value: number;
  /** 直接射撃にだけかかる(砲撃・空襲にはかからない) */
  directOnly?: boolean;
}

export interface UnitModifiers {
  /** 撃つ力にかかる倍率(戦力そのものは除く) */
  firepower: Factor[];
  /** 撃たれたときに受ける損害にかかる倍率(撃たれる面・夜襲など撃つ側で決まるものは除く) */
  damageTaken: Factor[];
}

/** 倍率の積 */
export function factorProduct(fs: readonly Factor[], opts: { indirect?: boolean } = {}): number {
  return fs.reduce((p, f) => (opts.indirect && f.directOnly ? p : p * f.value), 1);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** value が1でなければ足す */
function push(out: Factor[], id: string, label: string, value: number, directOnly?: boolean) {
  if (Math.abs(value - 1) < 1e-9) return;
  out.push(directOnly ? { id, label, value, directOnly } : { id, label, value });
}

/** 撃つ側の、その時々の状態から決まる火力の倍率(戦力・このステップの移動・相手ごとの倍率は除く) */
export function firepowerFactors(a: Unit, ctx: SimContext): Factor[] {
  const { rules } = ctx;
  const out: Factor[] = [];
  const st = stanceOf(a, rules);
  push(out, "stance", st.name, st.firepowerMultiplier);
  push(out, "suppression", `制圧 ${pct(a.suppression)}`, suppressionFirepowerMultiplier(a, ctx));
  if (a.ammo <= 0) push(out, "ammo", "弾薬切れ", rules.supply.outOfAmmoFirepowerMultiplier);
  if (a.morale < rules.morale.shakenBelow) push(out, "shaken", "動揺", rules.morale.shakenFirepowerMultiplier);
  push(out, "fatigue", `疲労 ${pct(a.fatigue)}`, fatigueFirepowerMultiplier(a, ctx));
  const tr = trainingOf(a, rules);
  push(out, "training", tr.name, tr.firepowerMultiplier);
  return out;
}

/** 撃たれる側の、その時々の状態から決まる受ける損害の倍率(撃たれる面・夜襲は除く) */
export function damageTakenFactors(t: Unit, ctx: SimContext): Factor[] {
  const { rules } = ctx;
  const c = rules.combat;
  const out: Factor[] = [];
  push(out, "entrenchment", `陣地 ${t.entrenchment}`, c.entrenchmentDamageTaken[t.entrenchment - rules.entrenchment.minLevel]!);
  push(out, "formation", FORMATION_NAME[t.formation] ?? t.formation, c.formationDamageTaken[t.formation]);
  const terrain = rules.terrain[ctx.terrain.terrainAt(t.pos)]!;
  push(out, "terrain", terrain.name, terrain.damageTakenMultiplier);
  const st = stanceOf(t, rules);
  push(out, "stance", st.name, st.damageTakenMultiplier);
  push(out, "morale", t.routed ? "潰走" : "動揺", moraleStateDamageTaken(t, ctx));
  const br = ctx.branches.branches[t.branch]!;
  push(out, "branch", br.name, br.directDamageTakenMultiplier, true);
  return out;
}

const FORMATION_NAME: Record<string, string> = { column: "縦隊", deploying: "展開中", deployed: "展開" };

/** ユニットにいま効いている補正(画面用) */
export function unitModifiers(u: Unit, ctx: SimContext): UnitModifiers {
  return { firepower: firepowerFactors(u, ctx), damageTaken: damageTakenFactors(u, ctx) };
}

export interface GaugeChange {
  strength: number;
  suppression: number;
  morale: number;
}

/**
 * 制圧による火力の倍率。装甲化率が高いほど落ちにくい(ハッチを閉めても撃てる)。
 * その代わり装甲は、制圧されると視界が大きく落ちる(detection.ts)
 */
export function suppressionFirepowerMultiplier(u: Unit, ctx: SimContext): number {
  const c = ctx.rules.combat;
  const armor = ctx.toes.toes[u.toe]!.armorRatio;
  return 1 - u.suppression * c.suppressionFirepowerPenalty * (1 - armor * c.armorSuppression.firepowerRelief);
}

/**
 * 後手からの一撃(反撃の好機)の倍率。前のターンに動かなかった部隊が、このターンに動いて(反撃に出て)、
 * 前のターンに前進していた敵を攻めるときに上がる。姿勢(予備)でさらに上がる
 */
export function counterattackMultiplier(a: Unit, target: Unit, ctx: SimContext, kind: "firepower" | "breakthrough", movingNow: boolean): number {
  if (a.movedLastTurn || !movingNow || !target.movedLastTurn) return 1;
  const c = ctx.rules.counterattack;
  return (kind === "firepower" ? c.firepowerMultiplier : c.breakthroughMultiplier) * stanceOf(a, ctx.rules).counterattackMultiplier;
}

/** 士気の状態による受ける損害の倍率。動揺・潰走しているユニットは大きな損害を受ける(直接射撃・砲撃・空襲に共通) */
export function moraleStateDamageTaken(u: Unit, ctx: SimContext): number {
  const m = ctx.rules.combat.moraleStateDamageTaken;
  if (u.routed) return m.routed;
  if (u.morale < ctx.rules.morale.shakenBelow) return m.shaken;
  return 1;
}

/**
 * 直接射撃の目標:自分で探知していて、直接射撃の射程内にいる敵すべて(ID順)。
 */
export function targetsInRange(attacker: Unit, units: readonly Unit[], ctx: SimContext, night?: NightFire): Unit[] {
  const range = toeDirectMaxRange(ctx.toes.toes[attacker.toe]!, ctx.weapons);
  return units
    .filter(
      (e) =>
        e.side !== attacker.side &&
        e.strength > 0 &&
        unitDistance(attacker, e, ctx) <= range &&
        detectionLevel(attacker, e, ctx) > 0 &&
        (!night || night.attackers.has(attacker.id) || night.attackers.has(e.id)),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 夜間フェイズの撃ち合いの条件。夜襲する部隊(attackers)とその相手のあいだでだけ撃ち合う。
 * それ以外の部隊どうしは夜は撃たない
 */
export interface NightFire {
  attackers: ReadonlySet<string>;
}

/**
 * 1小ステップ分の直接射撃を計算する。全員がステップ開始時の状態で同時に撃つ(結果はまだ適用しない)。
 * 火力は射程内の目標すべてに均等に分ける。各目標への火力は、その目標との距離と装甲化率で決まる。
 * 距離と撃たれる面は、帯(正面幅)の上でいちばん近い点どうしで測る。
 * 戦闘正面幅(frontage.combatWidthMultiplier):1つの目標を正面から撃つ部隊の正面幅の合計が目標の幅を超えると、
 * 正面から撃つ部隊の損害を比例して減らす(側面・背後から撃つ部隊は減らない)。
 * @param movedThisStep このステップに移動したユニット(戦闘移動中の射撃は火力が下がる)
 * @param exposed 敵陣に入り込んでいる(突破して敵の阻止圏の中にいる)ユニット。正面から撃たれても側面扱いになる
 * @param firepowerBonus 撃つ側ごとの火力の上乗せ(伏撃の初撃)
 */
export function computeFire(
  units: readonly Unit[],
  ctx: SimContext,
  rng: Rng,
  movedThisStep: ReadonlySet<string>,
  night?: NightFire,
  exposed?: ReadonlySet<string>,
  /** 撃つ側ごとの火力の上乗せ(伏撃の初撃など。省略は1) */
  firepowerBonus: (a: Unit) => number = () => 1,
  /** このターンに動いたユニット(後手からの一撃の判定に使う。省略は誰も動いていない) */
  movedThisTurn: ReadonlySet<string> = new Set(),
): FireResult[] {
  const { rules } = ctx;
  const c = rules.combat;
  const minutes = ctx.stepSeconds / 60;
  const results: FireResult[] = [];
  // 戦闘正面幅:目標ごとに、正面から撃つ部隊が使う幅(正面幅 × 火力を分けた割合)を足し上げる
  const frontal = new Map<string, { width: number; results: FireResult[] }>();
  const sorted = [...units].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const a of sorted) {
    if (!canAttack(a) || a.strength <= 0) continue;
    const targets = targetsInRange(a, sorted, ctx, night);
    if (targets.length === 0) continue;

    const aToe = ctx.toes.toes[a.toe]!;
    const share = 1 / targets.length;
    const moving = movedThisStep.has(a.id) ? c.combatMoveFirepowerMultiplier : 1;
    const bonus = firepowerBonus(a);
    const attackerFactor = a.strength * factorProduct(firepowerFactors(a, ctx)) * moving * bonus;

    for (const target of targets) {
      const tToe = ctx.toes.toes[target.toe]!;
      const [aPt, tPt] = unitClosestPoints(a, target, ctx);
      const d = distance(aPt, tPt);
      // 夜襲:夜襲する側は火力が落ちるが、相手の陣地の効果を減らす。士気への打撃は双方とも大きい
      const nightAttacking = night?.attackers.has(a.id) ?? false;
      const na = rules.night.nightAttack;
      const fire = toeFire(aToe, ctx.weapons, d, tToe.armorRatio, false);
      const counter = counterattackMultiplier(a, target, ctx, "firepower", movedThisTurn.has(a.id));
      const firepower = fire.firepower * attackerFactor * share * (nightAttacking ? na.firepowerMultiplier : 1) * counter;
      if (firepower <= 0) continue;

      const dug = c.entrenchmentDamageTaken[target.entrenchment - rules.entrenchment.minLevel]!;
      const seen = attackAspect(tPt, target.facing, aPt, rules.facing);
      const aspect = seen === "front" && exposed?.has(target.id) ? "flank" : seen;
      const aspectK = aspectDamageMultiplier(aspect, rules.facing);
      // 伏撃は側面・背後を突かれると脆い
      const flankStance = aspect === "front" ? 1 : stanceOf(target, rules).flankRearDamageTakenMultiplier;
      // 夜襲は陣地の効果を減らす(陣地の倍率を置き換える)
      const nightDug = nightAttacking ? (1 - (1 - dug) * na.entrenchmentEffectRetained) / dug : 1;
      const taken = aspectK * flankStance * nightDug * factorProduct(damageTakenFactors(target, ctx));

      const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
      const result: FireResult = {
        attackerId: a.id,
        targetId: target.id,
        aspect,
        damage: points / toeHitPoints(tToe),
        suppressionMultiplier: fire.suppression,
      };
      const situational: Factor[] = [];
      push(situational, "aspect", aspect === "front" ? "正面" : aspect === "flank" ? (seen === "front" ? "敵陣に入り込んでいる" : "側面から") : "背後から", aspectK);
      push(situational, "flankStance", `${stanceOf(target, rules).name}の側面`, flankStance);
      push(situational, "counter", "後手からの一撃", counter);
      push(situational, "opening", "伏撃の初撃", bonus);
      push(situational, "moving", "戦闘移動中の射撃", moving);
      if (nightAttacking) {
        push(situational, "nightFire", "夜襲(火力)", na.firepowerMultiplier);
        push(situational, "nightDug", "夜襲(陣地の効果が減る)", nightDug);
      }
      if (situational.length) result.situational = situational;
      if (night) result.moraleMultiplier = na.moraleDamageMultiplier;
      results.push(result);
      if (aspect === "front") {
        const f = frontal.get(target.id) ?? { width: 0, results: [] };
        f.width += frontageOf(a, ctx) * share;
        f.results.push(result);
        frontal.set(target.id, f);
      }
    }
  }
  const cap = rules.frontage.combatWidthMultiplier;
  if (cap !== undefined) {
    for (const [id, f] of frontal) {
      const t = sorted.find((u) => u.id === id)!;
      const room = frontageOf(t, ctx) * cap;
      // 幅を持たない目標(縦隊・点)には上限をかけない
      if (room <= 0 || f.width <= room) continue;
      const k = room / f.width;
      for (const r of f.results) {
        r.damage *= k;
        (r.situational ??= []).push({ id: "width", label: "戦闘正面幅の上限(正面に寄せすぎ)", value: k });
      }
    }
  }
  return results;
}

/** 損害を3ゲージに振り分けて適用する(units を書き換える)。ユニットごとの変化量を返す */
export function applyFire(units: Map<string, Unit>, results: readonly FireResult[], ctx: SimContext): Map<string, GaugeChange> {
  const w = ctx.rules.combat.gaugeWeights;
  const changes = new Map<string, GaugeChange>();
  for (const r of results) {
    const t = units.get(r.targetId)!;
    const before = { strength: t.strength, suppression: t.suppression, morale: t.morale };
    // 潰走中は落伍・投降で、戦力を多く失う。死守は崩れても踏みとどまる分、戦力を多く失う
    const st = stanceOf(t, ctx.rules);
    const m = ctx.rules.morale;
    const holdOn = t.morale < m.routBelow ? st.brokenStrengthWeightMultiplier : t.morale < m.shakenBelow ? st.shakenStrengthWeightMultiplier : 1;
    const strengthWeight = w.strength * (t.routed ? ctx.rules.combat.routedStrengthWeightMultiplier : 1) * holdOn;
    t.strength = clamp01(t.strength - r.damage * strengthWeight);
    t.suppression = clamp01(t.suppression + r.damage * w.suppression * (r.suppressionMultiplier ?? 1));
    t.morale = clamp01(t.morale - r.damage * w.morale * (r.moraleMultiplier ?? 1) * trainingOf(t, ctx.rules).moraleDamageTakenMultiplier * st.moraleDamageTakenMultiplier);
    const ch = changes.get(t.id) ?? { strength: 0, suppression: 0, morale: 0 };
    ch.strength += t.strength - before.strength;
    ch.suppression += t.suppression - before.suppression;
    ch.morale += t.morale - before.morale;
    changes.set(t.id, ch);
  }
  return changes;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
