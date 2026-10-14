import { canBreakThrough, type HoldingZone } from "./breakthrough.js";
import type { SimContext } from "./context.js";
import { distance, type Vec2 } from "./geometry.js";
import { terrainSpeed } from "./pathfinding.js";
import { mobilityOf } from "./supply.js";
import type { Unit } from "./unit.js";

/**
 * 包囲の判定:ユニットから全方位(directions 方向)へ escapeDistanceM の脱出路を直線でたどり、
 * どの方向も「突破できない敵の阻止圏」「通れない地形(道路=橋・峠の上は通れる)」で止まるなら包囲。
 * マップの外へ出られる方向は脱出できるものとする。
 * 突破判定は阻止圏のものをそのまま使う(強い部隊は弱い包囲網を破れるので、包囲扱いにならない)
 */
export function isEncircled(u: Unit, zones: readonly HoldingZone[], ctx: SimContext): boolean {
  const e = ctx.rules.encirclement;
  for (let k = 0; k < e.directions; k++) {
    const rad = (2 * Math.PI * k) / e.directions;
    if (canEscape(u, { x: Math.sin(rad), y: Math.cos(rad) }, zones, ctx)) return false;
  }
  return true;
}

function canEscape(u: Unit, dir: Vec2, zones: readonly HoldingZone[], ctx: SimContext): boolean {
  const e = ctx.rules.encirclement;
  const r = ctx.rules.breakthrough.zoneRadiusM;
  const stepM = r / 10;
  const mobility = mobilityOf(u, ctx);
  let cur = u.pos;
  for (let d = stepM; d <= e.escapeDistanceM + 1e-9; d += stepM) {
    const next = { x: u.pos.x + dir.x * d, y: u.pos.y + dir.y * d };
    // マップの外へ出られれば脱出できたとみなす(マップの端は壁ではない)
    if (next.x < 0 || next.y < 0 || next.x > ctx.terrain.widthM || next.y > ctx.terrain.heightM) return true;
    if (terrainSpeed(ctx.terrain.terrainAt(next), mobility, ctx) <= 0 && ctx.roads.distanceToRoad(next) > stepM) return false;
    for (const z of zones) {
      if (z.unit.side === u.side || z.unit.strength <= 0) continue;
      const dTo = distance(next, z.pos);
      if (dTo < r && dTo < distance(cur, z.pos) && !canBreakThrough(u, z, ctx, cur)) return false;
    }
    cur = next;
  }
  return true;
}
