import { readFileSync } from "node:fs";
import {
  createUnit,
  parseBranchPack,
  parseRulePack,
  parseTerrainMap,
  TerrainMap,
  type GameState,
  type NewUnit,
  type ParseResult,
  type SimContext,
} from "../src/index.js";

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../data/${rel}`, import.meta.url), "utf-8"));
}

export function unwrap<T>(r: ParseResult<T>): T {
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

export const rules = unwrap(parseRulePack(loadJson("rulepacks/ww1-korea.json")));
export const branches = unwrap(parseBranchPack(loadJson("branches/ww1-korea.json")));

/**
 * テスト用マップ:250mセル × 8列 × 4行(2km × 1km)。
 * 北半分の西側が平地、東側が森林、南半分の東端が町。
 */
export const terrain = new TerrainMap(
  unwrap(
    parseTerrainMap({
      cellSizeM: 250,
      legend: { ".": "plain", F: "forest", T: "town" },
      rows: ["....FFFF", "....FFFF", "......TT", "......TT"],
    }),
  ),
);

export const ctx: SimContext = { rules, branches, terrain, turnSeconds: 1800, stepSeconds: 60 };

export function state(...units: NewUnit[]): GameState {
  return { turn: 1, time: 0, units: units.map(createUnit) };
}

export function inf(id: string, x: number, y: number, extra: Partial<NewUnit> = {}): NewUnit {
  return { id, side: "us", branch: "infantry", pos: { x, y }, facing: 0, stance: "standard", ...extra };
}

export function unitOf(s: GameState, id: string) {
  const u = s.units.find((x) => x.id === id);
  if (!u) throw new Error(`unit ${id} not found`);
  return u;
}
