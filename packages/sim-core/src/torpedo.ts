import { stanceOf } from "./stance.js";
import { seaPoint } from "./breakoff.js";
import type { SimContext } from "./context.js";
import { detectionLevel } from "./detection.js";
import { canEngage } from "./identify.js";

const withPower = (m: number | undefined) => (m === undefined ? {} : { powerOutMin: m });
import { bearing, distance, type Vec2 } from "./geometry.js";
import { gunsLeftMultiplier, powerOut, rollPowerLoss, type GunneryResult } from "./gunnery.js";
import { isShip, navalArc, shipFireToe } from "./naval.js";
import type { Rng } from "./rng.js";
import { moveSpeedMps } from "./route-preview.js";
import type { Unit } from "./unit.js";
import type { Weapon } from "./weapon.js";

/**
 * 走る魚雷:1隻ずつの艦の発射管(武器の torpedoRun)。撃つと1斉射が扇に開いて走り、敵の艦の前を通れば当たることがある。
 * 決まりはルールパックの naval.torpedoes。斉射は状態の torpedoes に持つ(相手には見えない。当たった・撃ったの出来事だけ)
 */
export interface TorpedoSalvo {
  id: string;
  side: string;
  launchedBy: string;
  weapon: string;
  pos: Vec2;
  /** 進む向き(方位、度) */
  heading: number;
  speedMpm: number;
  /** 残りの走る距離(m)と、ここまで走った距離(m) */
  leftM: number;
  traveledM: number;
  /** まだ走っている本数 */
  count: number;
  /** もう前を通った艦(同じ斉射で2度は判定しない) */
  passed: string[];
}

/** 走る魚雷を撃つ武器か(ルールパックに naval.torpedoes があり、武器に torpedoRun がある) */
export function usesTorpedoRun(w: Weapon, ctx: Pick<SimContext, "rules">): boolean {
  return !!w.torpedo && !!w.torpedoRun && !!ctx.rules.naval?.torpedoes;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const ahead = (p: Vec2, heading: number, m: number): Vec2 => ({ x: p.x + Math.sin(rad(heading)) * m, y: p.y + Math.cos(rad(heading)) * m });

/** 目標の今の動き(m/秒の速さと向き)。止まっていれば速さ0 */
function velocity(u: Unit, ctx: SimContext): { speed: number; heading: number } {
  // 艦は、直前の1分に実際に進んだ速さと針路(見張り・射撃指揮が測る的針・的速)で見越す。戦隊の持ち場につく艦の経路は近くの持ち場を指すだけなので使わない
  if (u.speedMps !== undefined && isShip(u, ctx)) return { speed: u.speedMps, heading: u.facing };
  const next = u.route[0];
  if (!next) return { speed: 0, heading: u.facing };
  return { speed: moveSpeedMps(u, next, ctx), heading: bearing(u.pos, next) };
}

/** 未来位置:魚雷が着くころに目標がいる所(目標が今の向き・速さで進むとして、3回詰める) */
export function interceptPoint(from: Vec2, target: Unit, torpedoMps: number, ctx: SimContext): Vec2 {
  const v = velocity(target, ctx);
  let aim = { ...target.pos };
  for (let i = 0; i < 3; i++) aim = ahead(target.pos, v.heading, v.speed * (distance(from, aim) / torpedoMps));
  return aim;
}

/**
 * 撃てる艦は撃つ:見えている敵の艦のうちいちばん近いものが、射程の launchRangeShare 以内で、発射管を向けられる方位にいれば、
 * 向けられる数だけ1斉射。斉射が残っていて、装填が済んでいる(readyAt を過ぎた)艦だけ
 */
export function launchTorpedoes(units: readonly Unit[], t: number, ctx: SimContext): { salvos: TorpedoSalvo[]; launched: { unitId: string; count: number; aim: Vec2 }[] } {
  const r = ctx.rules.naval?.torpedoes;
  const salvos: TorpedoSalvo[] = [];
  const launched: { unitId: string; count: number; aim: Vec2 }[] = [];
  if (!r) return { salvos, launched };
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const a of ships) {
    const toe = ctx.toes.toes[a.toe]!;
    const load = a.torpedoLoad ?? { salvosLeft: 1 + (toe.ship?.torpedoReloads ?? 0), readyAt: 0 };
    if (load.salvosLeft <= 0 || t < load.readyAt || a.routed) continue;
    const tubes = (toe.ship?.batteries ?? []).filter((b) => usesTorpedoRun(ctx.weapons.weapons[b.weapon]!, ctx));
    if (tubes.length === 0) continue;
    const enemies = ships.filter((e) => e.side !== a.side && detectionLevel(a, e, ctx) > 0 && canEngage(a, e, ctx)).sort((p, q) => distance(a.pos, p.pos) - distance(a.pos, q.pos) || (p.id < q.id ? -1 : 1));
    const target = enemies[0];
    if (!target) continue;
    let fired = false;
    let inReachNotBearing = false;
    for (const b of tubes) {
      const w = ctx.weapons.weapons[b.weapon]!;
      const run = w.torpedoRun!;
      const aim = interceptPoint(a.pos, target, run.speedMpm / 60, ctx);
      const d = distance(a.pos, aim);
      // 雷撃して反転を命じられた艦は、naval.torpedoes.turnAwayLaunchShare の距離から撃つ
      if (d > run.rangeM * (a.torpedoTurnAway ? r.turnAwayLaunchShare : r.launchRangeShare)) continue;
      const arc = navalArc(a.facing, a.pos, aim, ctx);
      const ref = shipFireToe(toe, arc).elements[0]!.weapons.find((x) => x.weapon === b.weapon);
      const count = Math.round((ref?.count ?? 0) * gunsLeftMultiplier(a));
      if (count <= 0) {
        if ((ref?.count ?? 0) === 0) inReachNotBearing = true;
        continue;
      }
      salvos.push({ id: `${a.id}@${t}:${b.weapon}`, side: a.side, launchedBy: a.id, weapon: b.weapon, pos: { ...a.pos }, heading: bearing(a.pos, aim), speedMpm: run.speedMpm, leftM: run.rangeM, traveledM: 0, count, passed: [] });
      launched.push({ unitId: a.id, count, aim });
      fired = true;
    }
    // 雷撃して反転:届く距離なのに発射管が向かなければ、敵を舷側に置く向きへ舵を切る(戦隊の旗艦なら戦隊ごと)。向けば次の刻みで撃つ
    if (!fired && inReachNotBearing && a.torpedoTurnAway) {
      const toTarget = bearing(a.pos, target.pos);
      const left = (toTarget + 270) % 360;
      const right = (toTarget + 90) % 360;
      const diff = (h: number) => Math.abs(((h - a.facing + 540) % 360) - 180);
      const p = seaPoint(a.pos, diff(left) <= diff(right) ? left : right, r.turnAwayM, ctx);
      if (p) a.route = [p];
      a.facingOnArrival = null;
      delete a.pursuing;
    }
    if (fired) {
      a.torpedoLoad = { salvosLeft: load.salvosLeft - 1, readyAt: t + r.reloadMinutes * 60 };
      // 雷撃して反転:撃ったら敵から離れる向きへ走る(戦隊の旗艦なら戦隊ごと)
      if (a.torpedoTurnAway) {
        const away = seaPoint(a.pos, bearing(target.pos, a.pos), r.turnAwayM, ctx);
        if (away) a.route = [away];
        a.facingOnArrival = null;
        delete a.pursuing;
        delete a.torpedoTurnAway;
      }
    }
  }
  return { salvos, launched };
}

/** 斉射の進む向きに沿った、艦の前後の位置(m。斉射の今の位置から)と、横のずれ(m) */
function alongTrack(p: Vec2, from: Vec2, heading: number): { along: number; lateral: number } {
  const fx = Math.sin(rad(heading));
  const fy = Math.cos(rad(heading));
  const dx = p.x - from.x;
  const dy = p.y - from.y;
  return { along: dx * fx + dy * fy, lateral: Math.abs(dx * fy - dy * fx) };
}

/**
 * 雷跡を見て避ける(naval.torpedoes.evasion)。向かってくる斉射が見えた艦は、魚雷と同じ向きへ艦尾を向けて走り、避け終われば前の命令に戻る。
 * 避け始めた艦の ID と斉射を返す
 */
export function spotTorpedoes(salvos: readonly TorpedoSalvo[], units: readonly Unit[], t: number, ctx: SimContext): { unitId: string; salvoId: string }[] {
  const r = ctx.rules.naval?.torpedoes;
  const ev = r?.evasion;
  const out: { unitId: string; salvoId: string }[] = [];
  if (!r || !ev) return out;
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  // 避け終わった艦は前の命令に戻る
  for (const u of ships) {
    if (!u.combing || t < u.combing.untilSec) continue;
    delete u.combing;
  }
  for (const s of salvos) {
    if (s.count <= 0) continue;
    const w = ctx.weapons.weapons[s.weapon]!;
    const range = ev.spotRangeM * (w.torpedoRun?.wakeVisibility ?? 1) * Math.min(1, ctx.visibilityMultiplier);
    for (const e of ships) {
      if (e.side === s.side || s.passed.includes(e.id) || e.combing || powerOut(e)) continue;
      const { along, lateral } = alongTrack(e.pos, s.pos, s.heading);
      if (along <= 0 || along > range) continue;
      const half = Math.tan(rad((s.count * r.spreadDegPerTorpedo) / 2)) * (s.traveledM + along);
      if (lateral > half + r.hitHalfWidthM * 3) continue;
      // 艦尾を魚雷に向けて走る(戦隊の動きの代わりに、避け終わるまで魚雷と同じ向きへ全速。sea/motion.ts)
      e.combing = { salvoId: s.id, untilSec: t + ev.minutes * 60, heading: s.heading };
      delete e.ranging;
      out.push({ unitId: e.id, salvoId: s.id });
    }
  }
  return out;
}

export interface TorpedoHit {
  salvo: TorpedoSalvo;
  targetId: string;
  hits: number;
  result: GunneryResult;
}

/**
 * 斉射を1ステップ進める。敵の艦の前を通ったら、1本ごとに当たるかを決める(当たった本数は斉射から減る)。射程を走りきった斉射は消える。
 * 当たりを返し、salvos は進めたものに置き換える
 */
export function advanceTorpedoes(salvos: TorpedoSalvo[], units: readonly Unit[], ctx: SimContext, rng: Rng): TorpedoHit[] {
  const r = ctx.rules.naval?.torpedoes;
  if (!r) return [];
  const dt = ctx.stepSeconds;
  const out: TorpedoHit[] = [];
  const keep: TorpedoSalvo[] = [];
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const s of salvos) {
    const step = Math.min(s.leftM, (s.speedMpm / 60) * dt);
    const to = ahead(s.pos, s.heading, step);
    const w = ctx.weapons.weapons[s.weapon]!;
    for (const e of ships) {
      if (e.side === s.side || s.passed.includes(e.id) || s.count <= 0) continue;
      // このステップに、斉射の先頭が艦の前後の位置を通り過ぎ、そのとき艦が扇の中にいれば判定する
      const { along, lateral } = alongTrack(e.pos, s.pos, s.heading);
      if (along <= 0 || along > step) continue;
      const half = Math.tan(rad((s.count * r.spreadDegPerTorpedo) / 2)) * (s.traveledM + along);
      const disp = ctx.toes.toes[e.toe]?.ship?.displacementT ?? 10000;
      const shipHalf = r.hitHalfWidthM * Math.cbrt(disp / 10000);
      if (lateral > half + shipHalf) continue;
      s.passed.push(e.id);
      // 回避運動の艦は魚雷をかわしやすい
      const evade = (stanceOf(e, ctx.rules).naval?.torpedoHitMultiplier ?? 1) * (e.combing?.salvoId === s.id ? (r.evasion?.hitMultiplier ?? 1) : 1);
      const p = Math.min(1, (2 * shipHalf) / (2 * half + 2 * shipHalf)) * r.aimChance * evade;
      let hits = 0;
      let duds = 0;
      for (let i = 0; i < s.count; i++) {
        if (rng.next() >= p) continue;
        if (rng.next() < (w.torpedoRun!.reliability ?? 1)) hits++;
        else duds++;
      }
      s.count -= hits + duds;
      if (hits === 0) continue;
      const hp = hits * r.damage.coefficient * Math.pow(w.torpedoRun!.warheadKg, r.damage.exponent);
      out.push({ salvo: s, targetId: e.id, hits, result: { hp, hits, penetrating: hits, fire: 0, flooding: hits * r.floodPerHit, gunsLost: 0, ...withPower(rollPowerLoss(e, { torpedoes: hits }, ctx, rng)) } });
    }
    s.pos = to;
    s.leftM -= step;
    s.traveledM += step;
    if (s.leftM > 1e-6 && s.count > 0) keep.push(s);
  }
  salvos.splice(0, salvos.length, ...keep);
  return out;
}
