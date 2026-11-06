import type { SimContext } from "./context.js";
import { bearing, normalizeBearing, type Vec2 } from "./geometry.js";
import type { NavalFormation } from "./rulepack.js";
import type { Toe } from "./toe.js";
import type { Unit } from "./unit.js";

/**
 * 海戦:艦艇の戦隊(編成表の naval)。戦隊1つが1ユニットで、陣形(単縦陣・単横陣・輪形陣など。ルールパックの naval.formations)を持つ。
 * 行軍の縦隊・展開はなく、いつも撃てる。向き(facing)は針路で、陣形ごとに、撃つ・受ける方位(艦首・舷側・艦尾)で倍率が変わる
 */

export function isNaval(u: Pick<Unit, "toe">, ctx: Pick<SimContext, "toes">): boolean {
  return !!ctx.toes.toes[u.toe]?.naval;
}

/** 今効いている陣形(変えている途中なら前の陣形)。ルールパックに naval がなければ undefined */
export function navalFormationOf(u: Unit, ctx: Pick<SimContext, "rules">): NavalFormation | undefined {
  const n = ctx.rules.naval;
  if (!n) return undefined;
  return n.formations[u.navalFormation ?? n.defaultFormation] ?? n.formations[n.defaultFormation];
}

export function navalFormationId(u: Unit, ctx: Pick<SimContext, "rules">): string | undefined {
  const n = ctx.rules.naval;
  if (!n) return undefined;
  return u.navalFormation !== undefined && u.navalFormation in n.formations ? u.navalFormation : n.defaultFormation;
}

/** 陣形を変える命令を受ける(今の陣形と同じなら、変えている途中の取り消し) */
export function orderNavalFormation(u: Unit, to: string, ctx: Pick<SimContext, "rules">): void {
  const n = ctx.rules.naval!;
  if (to === navalFormationId(u, ctx)) {
    delete u.navalChange;
    return;
  }
  if (n.changeSeconds <= 0) {
    u.navalFormation = to;
    delete u.navalChange;
    return;
  }
  u.navalChange = { to, leftSec: n.changeSeconds };
}

/** 陣形を変える時間を進める。変え終わったら新しい陣形のID を返す */
export function advanceNavalFormation(u: Unit, dt: number): string | null {
  if (!u.navalChange) return null;
  u.navalChange.leftSec -= dt;
  if (u.navalChange.leftSec > 1e-9) return null;
  u.navalFormation = u.navalChange.to;
  delete u.navalChange;
  return u.navalFormation;
}

/** 針路 facing の艦から見て、点 p がどの方位(艦首・舷側・艦尾)にあるか */
export function navalArc(facing: number, from: Vec2, p: Vec2, ctx: Pick<SimContext, "rules">): "bow" | "beam" | "stern" {
  const n = ctx.rules.naval;
  const rel = normalizeBearing(bearing(from, p) - facing);
  const off = rel > 180 ? 360 - rel : rel; // 艦首から何度離れているか(0〜180)
  if (off <= (n?.bowHalfArcDeg ?? 45)) return "bow";
  if (off >= 180 - (n?.sternHalfArcDeg ?? 45)) return "stern";
  return "beam";
}

/** 魚雷が残っているか(艦艇の戦隊で、撃った時間がルールパックの上限に届いていない) */
export function hasTorpedoes(u: Unit, ctx: Pick<SimContext, "rules">): boolean {
  return (u.torpedoSecUsed ?? 0) < (ctx.rules.naval?.torpedoSalvoMinutes ?? 0) * 60;
}

/** 撃つ側の陣形の、目標の方位への火力の倍率と、受ける側の陣形の、撃ってきた方位への損害の倍率 */
export function navalFireMultipliers(a: Unit, target: Unit, aPt: Vec2, tPt: Vec2, ctx: SimContext): { fire: number; fireArc?: "bow" | "beam" | "stern"; taken: number; takenArc?: "bow" | "beam" | "stern" } {
  const out: { fire: number; fireArc?: "bow" | "beam" | "stern"; taken: number; takenArc?: "bow" | "beam" | "stern" } = { fire: 1, taken: 1 };
  // 1隻ずつの艦(編成表の ship)は陣形の方位の倍率を使わない(撃つ方位へ向けられる砲の数で決まる。shipFireToe)
  if (isNaval(a, ctx)) {
    const f = navalFormationOf(a, ctx);
    if (f) {
      out.fireArc = navalArc(a.facing, aPt, tPt, ctx);
      if (!isShip(a, ctx)) out.fire = f.fire[out.fireArc];
    }
  }
  if (isNaval(target, ctx)) {
    const f = navalFormationOf(target, ctx);
    if (f) {
      out.takenArc = navalArc(target.facing, tPt, aPt, ctx);
      if (!isShip(target, ctx)) out.taken = f.damageTaken[out.takenArc];
    }
  }
  return out;
}

/** 1隻ずつの艦(編成表の ship) */
export function isShip(u: Pick<Unit, "toe">, ctx: Pick<SimContext, "toes">): boolean {
  return !!ctx.toes.toes[u.toe]?.ship;
}

const arcToes = new WeakMap<Toe, Partial<Record<"bow" | "beam" | "stern", Toe>>>();

/**
 * 撃つ方位ごとの艦の武器:砲・発射管の群れ(ship.batteries)に書いた武器は、その方位へ向けられる数だけにした編成表。
 * 群れに書かない武器(対空など)は要素の数のまま。群れのない艦・艦でない編成表はそのまま
 */
export function shipFireToe(toe: Toe, arc: "bow" | "beam" | "stern" | undefined): Toe {
  if (!toe.ship || toe.ship.batteries.length === 0 || !arc) return toe;
  const memo = arcToes.get(toe) ?? {};
  if (memo[arc]) return memo[arc]!;
  const listed = new Set(toe.ship.batteries.map((b) => b.weapon));
  const [first, ...rest] = toe.elements;
  const weapons = [...first!.weapons.filter((r) => !listed.has(r.weapon)), ...toe.ship.batteries.filter((b) => b[arc] > 0).map((b) => ({ weapon: b.weapon, count: b[arc] }))];
  const out: Toe = { ...toe, elements: [{ ...first!, weapons }, ...rest] };
  memo[arc] = out;
  arcToes.set(toe, memo);
  return out;
}

/** 損傷した艦の速さの倍率:失った戦力(浮力)に比例して落ちる(ルールパックの naval.shipDamage)。艦でなければ1 */
export function shipSpeedMultiplier(u: Unit, ctx: Pick<SimContext, "toes" | "rules">): number {
  const n = ctx.rules.naval;
  if (!n || !isShip(u, ctx)) return 1;
  const d = n.shipDamage;
  return Math.max(d.minSpeedMultiplier, 1 - d.speedLossPerDamage * (1 - Math.max(0, Math.min(1, u.strength))));
}

const directIndex = new WeakMap<object, Map<string, string>>();

/** 艦が直に属する上級部隊(戦隊)の ID。最初に名前の出てくる上級部隊。なければ undefined */
export function squadronIdOf(unitId: string, ctx: Pick<SimContext, "formations">): string | undefined {
  const fs = ctx.formations;
  if (!fs) return undefined;
  let idx = directIndex.get(fs);
  if (!idx) {
    idx = new Map();
    for (const [fid, f] of Object.entries(fs)) for (const u of f.units) if (!idx.has(u)) idx.set(u, fid);
    directIndex.set(fs, idx);
  }
  return idx.get(unitId);
}

/** 戦隊の生きている艦(上級部隊の並びの順。先頭が旗艦) */
export function squadronShips(squadronId: string, byId: ReadonlyMap<string, Unit>, ctx: Pick<SimContext, "formations" | "toes">): Unit[] {
  const f = ctx.formations?.[squadronId];
  if (!f) return [];
  return f.units.flatMap((id) => {
    const u = byId.get(id);
    return u && u.strength > 0 && isShip(u, ctx) && squadronIdOf(id, ctx) === squadronId ? [u] : [];
  });
}

/** 艦の戦隊の旗艦(戦隊に属さない艦・艦でない部隊は自分) */
export function flagshipOf(u: Unit, byId: ReadonlyMap<string, Unit>, ctx: Pick<SimContext, "formations" | "toes">): Unit {
  if (!isShip(u, ctx)) return u;
  const sq = squadronIdOf(u.id, ctx);
  if (sq === undefined) return u;
  return squadronShips(sq, byId, ctx)[0] ?? u;
}

/**
 * 戦隊の k 番目(旗艦が0)の艦の持ち場:旗艦の位置と針路、旗艦の陣形の持ち場の並び(station)から決める。
 * 単縦陣は旗艦の後ろへ一列、単横陣は旗艦の右・左へ交互に、輪形陣は旗艦を中心に円く(艦首の方から時計回り)
 */
export function stationPoint(leader: Unit, k: number, n: number, ctx: Pick<SimContext, "rules">): Vec2 {
  const f = navalFormationOf(leader, ctx);
  const st = f?.station ?? { kind: "column" as const, spacingM: 600 };
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dir = (deg: number) => ({ x: Math.sin(rad(deg)), y: Math.cos(rad(deg)) });
  const at = (deg: number, m: number) => ({ x: leader.pos.x + dir(deg).x * m, y: leader.pos.y + dir(deg).y * m });
  if (k <= 0) return { ...leader.pos };
  if (st.kind === "column") return at(leader.facing + 180, st.spacingM * k);
  if (st.kind === "abreast") return at(leader.facing + (k % 2 === 1 ? 90 : -90), st.spacingM * Math.ceil(k / 2));
  return at(leader.facing + (360 * (k - 1)) / Math.max(1, n - 1), st.spacingM);
}
