import type { ScenarioInfo as MatchInfo } from "@brigade/protocol";

type Route = MatchInfo["escape"]["routes"][number];
interface P {
  x: number;
  y: number;
}

/** 地図の大きさ(m) */
export function mapSize(info: MatchInfo): { widthM: number; heightM: number } {
  return { widthM: [...(info.map.rows[0] ?? "")].length * info.map.cellSizeM, heightM: info.map.rows.length * info.map.cellSizeM };
}

/** 脱出路の上か(sim-core の onEscapeRoute と同じ決まり。点は半径 radiusM、地図の端は端から depthM 以内) */
export function onRoute(e: Route, p: P, info: MatchInfo): boolean {
  if (!e.edge) return Math.hypot(e.x - p.x, e.y - p.y) <= info.escape.radiusM;
  const d = e.depthM ?? info.escape.radiusM;
  const { widthM, heightM } = mapSize(info);
  return e.edge === "west" ? p.x <= d : e.edge === "east" ? p.x >= widthM - d : e.edge === "south" ? p.y <= d : p.y >= heightM - d;
}

/** 脱出路へ向かう行き先(地図の端は、今の位置からいちばん近い端の上の点) */
export function routeTarget(e: Route, p: P, info: MatchInfo): P {
  if (!e.edge) return { x: e.x, y: e.y };
  const inset = Math.min(e.depthM ?? info.escape.radiusM, 1000) / 2;
  const { widthM, heightM } = mapSize(info);
  return e.edge === "west" ? { x: inset, y: p.y } : e.edge === "east" ? { x: widthM - inset, y: p.y } : e.edge === "south" ? { x: p.x, y: inset } : { x: p.x, y: heightM - inset };
}
