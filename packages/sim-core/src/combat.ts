import { applySplitLoss, armoredDamageFraction, armorNow, elementWeight } from "./armor.js";
import { moraleCeiling } from "./morale.js";
import type { SimContext } from "./context.js";
import { trainingOf } from "./training.js";
import { fatigueFirepowerMultiplier } from "./fatigue.js";
import { detectionLevel } from "./detection.js";
import { armoredAspect, attackAspect, type Aspect } from "./facing.js";
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
  /** 損害のうち、装甲の部分に当たる割合(装甲と非装甲を分けて持つ目標だけ) */
  armoredFraction?: number;
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
  /** 損耗による士気の上限(休んでもここまでしか戻らない) */
  moraleCeiling: number;
  /** 今の装甲化率(装甲と非装甲を分けて持つ編成表は、残っている部分の割合で変わる) */
  armor: number;
  /** 命令が効き始めるまでの遅れ(分。練度による) */
  orderDelayMinutes: number;
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
  return { firepower: firepowerFactors(u, ctx), damageTaken: damageTakenFactors(u, ctx), moraleCeiling: moraleCeiling(u, ctx), armor: armorNow(u, ctx), orderDelayMinutes: trainingOf(u, ctx.rules).orderDelayMinutes };
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
  const armor = armorNow(u, ctx);
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
  /** 先手の時間の内か(その組が撃ち始めてから surprise.durationMinutes の間。省略は撃ち始め=いつも内) */
  surpriseWindow: (a: Unit, target: Unit) => boolean = () => true,
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
    const weight = elementWeight(a, ctx);
    const shares = targetShares(a, targets, ctx);
    const moving = movedThisStep.has(a.id) ? c.combatMoveFirepowerMultiplier : 1;
    const bonus = firepowerBonus(a);
    const attackerFactor = a.strength * factorProduct(firepowerFactors(a, ctx)) * moving * bonus;

    for (const [ti, target] of targets.entries()) {
      const share = shares[ti]!;
      const tToe = ctx.toes.toes[target.toe]!;
      const [aPt, tPt] = unitClosestPoints(a, target, ctx);
      const d = distance(aPt, tPt);
      // 夜襲:夜襲する側は火力が落ちるが、相手の陣地の効果を減らす。士気への打撃は双方とも大きい
      const nightAttacking = night?.attackers.has(a.id) ?? false;
      const na = rules.night.nightAttack;
      const armor = armorNow(target, ctx);
      const fire = toeFire(aToe, ctx.weapons, d, armor, false, weight);
      const counter = counterattackMultiplier(a, target, ctx, "firepower", movedThisTurn.has(a.id));
      // 先手:撃たれた側が、撃った側をまだ見つけていない(撃ち返せない・身構えていない)
      const surprised = !!c.surprise && surpriseWindow(a, target) && detectionLevel(target, a, ctx) === 0;
      const surpriseK = surprised ? c.surprise!.damageMultiplier : 1;
      const firepower = fire.firepower * attackerFactor * share * (nightAttacking ? na.firepowerMultiplier : 1) * counter;
      if (firepower <= 0) continue;

      const dug = c.entrenchmentDamageTaken[target.entrenchment - rules.entrenchment.minLevel]!;
      const seen = attackAspect(tPt, target.facing, aPt, rules.facing);
      const aspect = seen === "front" && exposed?.has(target.id) ? "flank" : seen;
      // 撃たれた面:損害のうち装甲の部分に当たる割合で、装甲と非装甲の倍率を按分する(戦車は正面が硬く側面が脆い)
      const soft0 = toeFire(aToe, ctx.weapons, d, 0, false, weight).firepower;
      const armored1 = toeFire(aToe, ctx.weapons, d, 1, false, weight).firepower;
      const baseFrac = armoredDamageFraction(target, ctx, soft0, armored1) ?? (armored1 * armor + soft0 * (1 - armor) > 0 ? (armored1 * armor) / (armored1 * armor + soft0 * (1 - armor)) : armor);
      const faced = armoredAspect(aspect, rules.facing, baseFrac);
      const aspectK = faced.multiplier;
      // 伏撃は側面・背後を突かれると脆い
      const flankStance = aspect === "front" ? 1 : stanceOf(target, rules).flankRearDamageTakenMultiplier;
      // 夜襲は陣地の効果を減らす(陣地の倍率を置き換える)
      const nightDug = nightAttacking ? (1 - (1 - dug) * na.entrenchmentEffectRetained) / dug : 1;
      const taken = aspectK * flankStance * nightDug * surpriseK * factorProduct(damageTakenFactors(target, ctx));

      const points = firepower * minutes * c.damageScale * taken * rng.spread(c.damageSpread);
      const result: FireResult = {
        attackerId: a.id,
        targetId: target.id,
        aspect,
        damage: points / toeHitPoints(tToe),
        suppressionMultiplier: fire.suppression,
      };
      if (armoredDamageFraction(target, ctx, soft0, armored1) !== undefined) result.armoredFraction = faced.armoredFraction;
      const situational: Factor[] = [];
      push(situational, "aspect", aspect === "front" ? "正面" : aspect === "flank" ? (seen === "front" ? "敵陣に入り込んでいる" : "側面から") : "背後から", aspectK);
      push(situational, "flankStance", `${stanceOf(target, rules).name}の側面`, flankStance);
      push(situational, "counter", "後手からの一撃", counter);
      push(situational, "opening", "伏撃の初撃", bonus);
      push(situational, "surprise", "先手(見えない敵から)", surpriseK);
      push(situational, "moving", "戦闘移動中の射撃", moving);
      if (nightAttacking) {
        push(situational, "nightFire", "夜襲(火力)", na.firepowerMultiplier);
        push(situational, "nightDug", "夜襲(陣地の効果が減る)", nightDug);
      }
      if (situational.length) result.situational = situational;
      const moraleK = (night ? na.moraleDamageMultiplier : 1) * c.directFireMoraleMultiplier * (surprised ? c.surprise!.moraleMultiplier : 1);
      if (moraleK !== 1) result.moraleMultiplier = moraleK;
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

/**
 * 射程内の目標ごとの火力の割り振り(合計1)。combat.targetPriority がなければ均等。
 * 近い敵・自分の正面にいる敵・向かってくる敵を優先する(守り手は迫ってくる部隊から順に撃つ)
 */
export function targetShares(a: Unit, targets: readonly Unit[], ctx: SimContext): number[] {
  const p = ctx.rules.combat.targetPriority;
  if (!p || targets.length <= 1) return targets.map(() => 1 / targets.length);
  const w = targets.map((t) => {
    const [aPt, tPt] = unitClosestPoints(a, t, ctx);
    const d = distance(aPt, tPt);
    const front = attackAspect(aPt, a.facing, tPt, ctx.rules.facing) === "front" ? p.frontWeight : 1;
    // 向かってくる:次の経由点が今より自分に近い
    const next = t.route[0];
    const approaching = next && distance(next, aPt) < d - 1 ? p.approachingWeight : 1;
    return (front * approaching) / (1 + d / p.distanceScaleM);
  });
  const sum = w.reduce((s, x) => s + x, 0);
  return w.map((x) => x / sum);
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
    // 装甲と非装甲を分けて持つ目標は、それぞれの部分を減らす(なくなった部分に当たった分は消える)
    applySplitLoss(t, ctx, Math.max(0, r.damage * strengthWeight), r.armoredFraction);
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
