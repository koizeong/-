import type { SimContext } from "./context.js";
import { detectionLevel } from "./detection.js";
import { isNaval, isShip } from "./naval.js";
import type { Unit } from "./unit.js";
import { distance } from "./geometry.js";
import { stanceOf } from "./stance.js";

/**
 * 見分け(海戦):電探の反応だけの艦(目では見えていない)は、敵か味方か・何の艦かを見分けるまで撃たない(砲も魚雷も)。
 * 見分けるのにかかる時間は naval.identification の minutes × 練度ごとの倍率。目で見えた艦・撃ってきた艦(発砲の光で位置が露呈)はすぐ撃てる。
 * タサファロンガ沖で、電探で先に見つけた米の駆逐艦が雷撃の許可を待つ間に射点を失ったこと、エスペランス岬沖の撃ち方やめを表す
 */
export function identifyMinutesNeeded(u: Unit, ctx: SimContext): number {
  const r = ctx.rules.naval?.identification;
  if (!r) return 0;
  return r.minutes * (r.byTraining[u.training ?? ctx.rules.training.default] ?? 1);
}

/** a が t を撃ち始めてよいか(見分けの決まりのないとき・艦どうしでないときはいつも撃てる) */
export function canEngage(a: Unit, t: Unit, ctx: SimContext): boolean {
  // 戦闘配置についていない艦は撃てない
  if (a.unready && isNaval(t, ctx)) return false;
  if (!ctx.rules.naval?.identification || !isShip(a, ctx) || !isNaval(t, ctx)) return true;
  if (t.revealed || detectionLevel(a, t, ctx) >= 2) return true;
  return (a.identifying?.[t.id] ?? 0) >= identifyMinutesNeeded(a, ctx);
}

/** 1刻みぶん、戦闘配置についていない艦が、敵の艦を見つけたら配置につきはじめ、時間がたつと撃てるようになる */
export function updateBattleStations(units: readonly Unit[], ctx: SimContext, minutes: number): void {
  for (const a of units) {
    if (!a.unready || a.strength <= 0) continue;
    // 目で見つけた(電探の反応だけでは気づかない)か、当たって傷ついた
    if (!a.unready.alarmed) a.unready.alarmed = a.strength < 1 || units.some((t) => t.side !== a.side && t.strength > 0 && isNaval(t, ctx) && detectionLevel(a, t, ctx) >= 2);
    if (!a.unready.alarmed) continue;
    a.unready.minutes -= minutes;
    if (a.unready.minutes <= 0) delete a.unready;
  }
}

/**
 * 照明:暗いとき、探照灯のある艦(撃てる状態のもの)が、探照灯の届くいちばん近い見えている敵の艦を照らす。照らした艦は光で居場所が見える(revealed)。
 * 照らされた印は刻みごとに付け直す
 */
export function updateIllumination(units: readonly Unit[], ctx: SimContext): void {
  for (const u of units) delete u.illuminated;
  const darkBelow = ctx.rules.naval?.sighting?.darkBelow ?? 0.5;
  if (!ctx.rules.naval?.illumination || ctx.visibilityMultiplier > darkBelow) return;
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const a of ships) {
    const range = ctx.toes.toes[a.toe]?.ship?.searchlightM;
    if (!range || a.unready || stanceOf(a, ctx.rules).naval?.holdGuns || (a.shipDamage?.powerOut ?? 0) > 0 || (a.hull?.powerOutSec ?? 0) > 0) continue;
    const target = ships
      .filter((t) => t.side !== a.side && distance(a.pos, t.pos) <= range && detectionLevel(a, t, ctx) > 0 && canEngage(a, t, ctx))
      .sort((p, q) => distance(a.pos, p.pos) - distance(a.pos, q.pos) || (p.id < q.id ? -1 : 1))[0];
    if (!target) continue;
    target.illuminated = true;
    a.revealed = true;
  }
}

/** 1刻みぶん、艦ごとに電探で追っている相手を見分けていく。見失った相手は忘れる。目で見えた・撃ってきた相手は見分けたことにする */
export function updateIdentification(units: readonly Unit[], ctx: SimContext, minutes: number): void {
  if (!ctx.rules.naval?.identification) return;
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx));
  for (const a of ships) {
    const need = identifyMinutesNeeded(a, ctx);
    const next: Record<string, number> = {};
    for (const t of units) {
      if (t.side === a.side || t.strength <= 0 || !isNaval(t, ctx)) continue;
      const level = detectionLevel(a, t, ctx);
      if (level === 0) continue;
      const prev = a.identifying?.[t.id] ?? 0;
      next[t.id] = level >= 2 || t.revealed ? Math.max(prev, need) : prev + minutes;
    }
    if (Object.keys(next).length > 0) a.identifying = next;
    else delete a.identifying;
  }
}
