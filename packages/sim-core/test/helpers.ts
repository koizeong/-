import { readFileSync } from "node:fs";
import {
  createUnit,
  newGameState,
  parseBranchPack,
  parseRulePack,
  parseTerrainMap,
  parseToePack,
  parseWeaponPack,
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
export const weapons = unwrap(parseWeaponPack(loadJson("weapons/ww1-korea-generic.json")));
export const toes = unwrap(parseToePack(loadJson("toe/ww1-korea-generic.json")));

/** テストで使う、兵科ごとの標準の編成表 */
export const TOE_OF: Record<string, string> = {
  infantry: "infantry_regiment",
  armor: "armor_combat_command",
  tank_destroyer: "tank_destroyer_battalion",
  artillery: "artillery_battalion",
  recon: "recon_squadron",
};

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

export const ctx: SimContext = {
  rules,
  branches,
  weapons,
  toes,
  terrain,
  turnSeconds: 1800,
  stepSeconds: 60,
  visibilityMultiplier: 1,
};

/**
 * 探知テスト用の広いマップ:250mセル × 40 × 40(10km四方)の平地。
 * x, y とも 5000〜6000m の範囲だけ森林。
 */
const wideRows = Array.from({ length: 40 }, (_, r) => {
  const rowFromSouth = 39 - r;
  return Array.from({ length: 40 }, (_, c) => (c >= 20 && c < 24 && rowFromSouth >= 20 && rowFromSouth < 24 ? "F" : ".")).join("");
});
export const wideCtx: SimContext = {
  ...ctx,
  terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", F: "forest" }, rows: wideRows }))),
};

export function state(...units: NewUnit[]): GameState {
  return newGameState(units.map(createUnit), 1);
}

/** 歩兵連隊。extra で branch を変えると、編成表もその兵科の標準に合わせる */
export function inf(id: string, x: number, y: number, extra: Partial<NewUnit> = {}): NewUnit {
  const branch = extra.branch ?? "infantry";
  return { id, side: "us", branch, toe: TOE_OF[branch]!, pos: { x, y }, facing: 0, stance: "standard", ...extra };
}

export function ger(id: string, x: number, y: number, extra: Partial<NewUnit> = {}): NewUnit {
  return inf(id, x, y, { side: "de", ...extra });
}

export function unitOf(s: GameState, id: string) {
  const u = s.units.find((x) => x.id === id);
  if (!u) throw new Error(`unit ${id} not found`);
  return u;
}
