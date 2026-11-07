import type { SimContext } from "./context.js";
import { detectionLevel } from "./detection.js";
import { bearing, distance, type Vec2 } from "./geometry.js";
import { powerOut } from "./gunnery.js";
import { isShip } from "./naval.js";
import { terrainSpeed } from "./pathfinding.js";
import type { Unit } from "./unit.js";

/**
 * 大破した艦は戦列を離れる(艦長の判断。naval.crew.breakOffBelow):戦力がこれを下回った艦は、見えている敵の艦が breakOffContactM の内にいれば、
 * 戦隊を離れて敵から離れる向きへ breakOffRunM 走る(1隻に1度だけ。その後は命令し直せる)。旗艦なら次の艦が戦隊を引き継ぐ。
 * 艦は潰走しないが、傷ついた艦を撃ち合いに残して失わないため。動力の止まった艦は離れられない。離れ始めた艦の ID を返す
 */
export function breakOffDamaged(units: readonly Unit[], ctx: SimContext): string[] {
  const c = ctx.rules.naval?.crew;
  if (!c?.breakOffBelow) return [];
  const out: string[] = [];
  const ships = units.filter((u) => u.strength > 0 && isShip(u, ctx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const u of ships) {
    if (u.brokeOff || u.strength >= c.breakOffBelow || powerOut(u)) continue;
    const near = ships
      .filter((e) => e.side !== u.side && distance(e.pos, u.pos) <= c.breakOffContactM && detectionLevel(u, e, ctx) > 0)
      .sort((p, q) => distance(p.pos, u.pos) - distance(q.pos, u.pos) || (p.id < q.id ? -1 : 1))[0];
    if (!near) continue;
    const away = seaPoint(u.pos, bearing(near.pos, u.pos), c.breakOffRunM, ctx);
    if (!away) continue;
    u.route = [{ x: away.x, y: away.y }];
    u.facingOnArrival = null;
    delete u.pursuing;
    delete u.ranging;
    u.detached = true;
    u.brokeOff = true;
    out.push(u.id);
  }
  return out;
}

/** from から方位 heading へ dist 進んだ海の上の地点(行き先が陸か地図の外なら、左右へ振って探す。見つからなければ null) */
export function seaPoint(from: Vec2, heading: number, dist: number, ctx: SimContext): Vec2 | null {
  const b = heading;
  for (const turn of [0, 30, -30, 60, -60, 90, -90, 120, -120]) {
    const rad = ((b + turn) * Math.PI) / 180;
    const p = { x: from.x + Math.sin(rad) * dist, y: from.y + Math.cos(rad) * dist };
    if (p.x < 0 || p.y < 0 || p.x > ctx.terrain.widthM || p.y > ctx.terrain.heightM) continue;
    if (terrainSpeed(ctx.terrain.terrainAt(p), "naval", ctx) > 0) return p;
  }
  return null;
}
