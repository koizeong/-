import type { SimContext } from "./context.js";
import { effectiveStance } from "./stance.js";
import type { Toe } from "./toe.js";
import type { Unit } from "./unit.js";
import type { WeaponPack } from "./weapon.js";

/**
 * 黒色火薬の時代(ナポレオン戦争など)の、硝煙と散兵の幕。ルールパックの combat.smoke・combat.skirmishScreen があるときだけ効く
 */

/** 編成表の武器の硝煙の出かた(武器の smoke を、いちばん近い距離帯の火力で重みづけした平均) */
export function toeSmoke(toe: Toe, weapons: WeaponPack): number {
  let total = 0;
  let smoke = 0;
  for (const e of toe.elements)
    for (const ref of e.weapons) {
      const w = weapons.weapons[ref.weapon];
      if (!w || w.indirect) continue;
      const f = e.count * ref.count * (w.bands[0]?.power ?? 0);
      total += f;
      smoke += f * w.smoke;
    }
  return total > 0 ? smoke / total : 0;
}

/** 撃つ側・撃たれる側の煙の多いほうから決まる、火力の倍率(煙のない時代は1) */
export function smokeFireMultiplier(a: Unit, t: Unit, ctx: SimContext): number {
  const s = ctx.rules.combat.smoke;
  if (!s) return 1;
  return 1 - s.hitPenalty * Math.max(a.smoke ?? 0, t.smoke ?? 0);
}

/** 見る側・見られる側の煙の多いほうから決まる、探知の距離の倍率 */
export function smokeVisionMultiplier(observer: Unit, target: Unit, ctx: SimContext): number {
  const s = ctx.rules.combat.smoke;
  if (!s) return 1;
  return 1 - s.visionPenalty * Math.max(observer.smoke ?? 0, target.smoke ?? 0);
}

/** 刻みごとの煙:晴れてから、この刻みに撃った部隊の煙をたす */
export function updateSmoke(units: readonly Unit[], fired: ReadonlySet<string>, ctx: SimContext): void {
  const s = ctx.rules.combat.smoke;
  if (!s) return;
  const min = ctx.stepSeconds / 60;
  const keep = Math.exp(-s.decayPerMin * min);
  for (const u of units) {
    let v = (u.smoke ?? 0) * keep;
    if (fired.has(u.id)) v += s.perMinute * min * toeSmoke(ctx.toes.toes[u.toe]!, ctx.weapons);
    v = Math.min(1, v);
    if (v < 1e-3) delete u.smoke;
    else u.smoke = v;
  }
}

/** 散兵の幕の強さ(0〜1):散兵の要素の耐久の割合 ÷ fullShare。幕を張る隊形のときだけ */
export function screenOf(u: Unit, ctx: SimContext): number {
  const sc = ctx.rules.combat.skirmishScreen;
  if (!sc || !sc.stances.includes(effectiveStance(u, ctx.rules))) return 0;
  const toe = ctx.toes.toes[u.toe]!;
  let all = 0;
  let sk = 0;
  for (const e of toe.elements) {
    const hp = e.count * e.hitPoints;
    all += hp;
    if (e.skirmishers) sk += hp;
  }
  return all > 0 ? Math.min(1, sk / all / sc.fullShare) : 0;
}

/** 散兵の幕による、受ける損害の倍率(遠くからの射撃だけ。幕どうしは打ち消し合い、騎兵には効かない) */
export function screenDamageMultiplier(a: Unit, t: Unit, d: number, ctx: SimContext): number {
  const sc = ctx.rules.combat.skirmishScreen;
  if (!sc || d <= sc.closeM || sc.ignoredBy.includes(a.branch)) return 1;
  const net = screenOf(t, ctx) - screenOf(a, ctx);
  return net > 0 ? 1 - sc.maxReduction * net : 1;
}
