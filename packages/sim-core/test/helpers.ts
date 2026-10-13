import { readdirSync, readFileSync } from "node:fs";
import {
  createUnit,
  emptyScenario,
  newGameState,
  parseBranchPack,
  parseRulePack,
  parseTerrainMap,
  parseRoadNetwork,
  parseToePack,
  parseWeaponPack,
  RoadNetwork,
  TerrainMap,
  type GameState,
  type NewUnit,
  type PackSet,
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
  roads: RoadNetwork.empty(),
  scenario: emptyScenario(),
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
/**
 * 広いマップの道路:y=5000 に東西の幹線 n0〜n10(1kmおき)。
 * 迂回路は別に用意する(bypassRoads)。
 */
const trunkNodes = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`n${i}`, { x: i * 1000, y: 5000 }]));
const trunkEdges = Array.from({ length: 10 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}`, capacityTPerHour: 200 }));
export const trunkRoads = new RoadNetwork(unwrap(parseRoadNetwork({ nodes: trunkNodes, edges: trunkEdges })));
/** 幹線に加えて、n2 → 北の b1(5000, 8000)→ n8 の迂回路 */
export const bypassRoads = new RoadNetwork(
  unwrap(
    parseRoadNetwork({
      nodes: { ...trunkNodes, b1: { x: 5000, y: 8000 } },
      edges: [...trunkEdges, { from: "n2", to: "b1", capacityTPerHour: 200 }, { from: "b1", to: "n8", capacityTPerHour: 200 }],
    }),
  ),
);

export const wideCtx: SimContext = {
  ...ctx,
  roads: trunkRoads,
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

/** 疲労を無効にした文脈(移動の速さなど、疲労と切り離して確かめたいテスト用) */
export function withoutFatigue(c: SimContext): SimContext {
  const zero = { marchPerHour: 0, combatMovePerHour: 0, firingPerHour: 0, underFirePerHour: 0, nightActionPerHour: 0, restPerHour: 0, speedPenalty: 0, firepowerPenalty: 0 };
  return { ...c, rules: { ...c.rules, fatigue: zero } };
}

/** data/ 以下のパックをすべて読み込み、IDごとにまとめる(サーバー側の読み込みと同じ役割のテスト用) */
export function loadPacks(): PackSet {
  const dir = (sub: string) => readdirSync(new URL(`../../../data/${sub}/`, import.meta.url)).filter((f) => f.endsWith(".json"));
  const load = <T extends { id: string }>(sub: string, parse: (x: unknown) => ParseResult<T>): Record<string, T> =>
    Object.fromEntries(dir(sub).map((f) => unwrap(parse(loadJson(`${sub}/${f}`)))).map((p) => [p.id, p]));
  return {
    rules: load("rulepacks", parseRulePack),
    branches: load("branches", parseBranchPack),
    weapons: load("weapons", parseWeaponPack),
    toes: load("toe", parseToePack),
  };
}

/** data/scenarios/ のシナリオファイルを読む */
export function loadScenarioJson(name: string): unknown {
  return loadJson(`scenarios/${name}.json`);
}
