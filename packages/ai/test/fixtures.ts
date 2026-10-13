import {
  createUnit,
  parseRoadNetwork,
  parseScenarioRules,
  parseTerrainMap,
  RoadNetwork,
  startScenario,
  TerrainMap,
  type Depot,
  type GameState,
  type NewUnit,
  type SimContext,
} from "@brigade/sim-core";
import { branches, rules, toes, unwrap, weapons } from "../../sim-core/test/helpers.js";

/**
 * 左右対称の試験シナリオ(史実ではない)。250mセル × 39列 × 40行(9750m × 10000m)。
 * 列を奇数にして、対称軸 x=4875 がセルの中央を通るようにする。
 * 座標はすべてセルの中心に置く(境目の点はどちらのセルに入るかで左右がずれるため)。
 * 目標:中央(重み3)・北・南(重み1)。どちらの陣営も中央で限定的勝利、全部で決定的勝利。
 */
const COLS = 39;
const ROWS = 40;
const AXIS = (COLS * 250) / 2; // 4875
/** 対称軸からの距離 dx(m)の、西側の x */
const west = (dx: number) => AXIS - dx;
const mirrorX = (x: number) => 2 * AXIS - x;
const rows = Array.from({ length: ROWS }, (_, r) => {
  const rowFromSouth = ROWS - 1 - r;
  return Array.from({ length: COLS }, (_, c) => {
    const fromAxis = Math.abs(c - (COLS - 1) / 2); // 0 が中央の列
    const forest = fromAxis >= 6 && fromAxis < 8 && rowFromSouth >= 16 && rowFromSouth < 24;
    const town = fromAxis <= 1 && rowFromSouth >= 19 && rowFromSouth < 21;
    return town ? "T" : forest ? "F" : ".";
  }).join("");
});
// 道路:y=5125 の東西の幹線(1kmおき、軸に対称)と、x=4875 の南北の道路
const ROAD_Y = 5125;
const nodes: Record<string, { x: number; y: number }> = {};
const edges: { from: string; to: string; capacityTPerHour: number }[] = [];
const ewXs = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => AXIS + k * 1000);
ewXs.forEach((x, i) => (nodes[`ew${i}`] = { x, y: ROAD_Y }));
for (let i = 0; i < ewXs.length - 1; i++) edges.push({ from: `ew${i}`, to: `ew${i + 1}`, capacityTPerHour: 200 });
const nsYs = [1125, 2125, 3125, 4125, 6125, 7125, 8125, 9125];
nsYs.forEach((y, j) => (nodes[`ns${j}`] = { x: AXIS, y }));
const nsChain = ["ns0", "ns1", "ns2", "ns3", "ew4", "ns4", "ns5", "ns6", "ns7"];
for (let j = 0; j < nsChain.length - 1; j++) edges.push({ from: nsChain[j]!, to: nsChain[j + 1]!, capacityTPerHour: 200 });

export const symCtx: SimContext = {
  rules,
  branches,
  weapons,
  toes,
  terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", F: "forest", T: "town" }, rows }))),
  roads: new RoadNetwork(unwrap(parseRoadNetwork({ nodes, edges }))),
  scenario: unwrap(
    parseScenarioRules({
      // 昼14ターン + 夜間フェイズ(14時間)
      maxTurns: 15,
      night: { turn: 15, hours: 14 },
      objectives: [
        { id: "center", name: "中央の町", x: AXIS, y: ROAD_Y, radiusM: 600, weight: 3, initialHolder: null },
        { id: "north", name: "北の交差点", x: AXIS, y: 8125, radiusM: 600, weight: 1, initialHolder: null },
        { id: "south", name: "南の交差点", x: AXIS, y: 2125, radiusM: 600, weight: 1, initialHolder: null },
      ],
      victory: {
        us: { decisive: { minWeight: 5 }, limited: { required: ["center"] } },
        de: { decisive: { minWeight: 5 }, limited: { required: ["center"] } },
      },
    }),
  ),
  turnSeconds: 1800,
  stepSeconds: 60,
  visibilityMultiplier: 1,
};

const TOE: Record<string, string> = {
  infantry: "infantry_regiment",
  armor: "armor_combat_command",
  artillery: "artillery_battalion",
  recon: "recon_squadron",
};

/** 西側(us)の配置。東側(de)は x を鏡写しにする */
const WEST: { id: string; branch: string; x: number; y: number }[] = [
  { id: "inf1", branch: "infantry", x: west(3500), y: 6625 },
  { id: "inf2", branch: "infantry", x: west(3500), y: 3625 },
  { id: "arm", branch: "armor", x: west(4000), y: ROAD_Y },
  { id: "art", branch: "artillery", x: west(4500), y: ROAD_Y },
  { id: "rec", branch: "recon", x: west(3000), y: ROAD_Y },
];

export { AXIS, mirrorX };

export function symUnits(): NewUnit[] {
  const out: NewUnit[] = [];
  for (const [side, mirror] of [["us", false], ["de", true]] as const) {
    for (const w of WEST) {
      out.push({
        id: `${side}-${w.id}`,
        side,
        branch: w.branch,
        toe: TOE[w.branch]!,
        pos: { x: mirror ? mirrorX(w.x) : w.x, y: w.y },
        facing: mirror ? 270 : 90,
        stance: "standard",
      });
    }
  }
  return out;
}

export const symDepots: Depot[] = [
  { id: "us-dump", side: "us", nodeId: "ew0", ammoT: 1000, fuelT: 500 },
  { id: "de-dump", side: "de", nodeId: "ew8", ammoT: 1000, fuelT: 500 },
];

export function symStart(seed: number): GameState {
  return startScenario(symUnits().map(createUnit), seed, symCtx, symDepots);
}
