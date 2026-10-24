import { readFileSync } from "node:fs";
import { findBridges, parseRoadNetwork, parseTerrainMap, RoadNetwork, TerrainMap } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { rules, unwrap } from "../../sim-core/test/helpers.js";
import { BiomePackSchema, generateMap, type GeneratedMap } from "../src/index.js";

const pack = BiomePackSchema.parse(JSON.parse(readFileSync(new URL("../../../data/generators/biomes.json", import.meta.url), "utf-8")));
const gen = (seed: number, biome = "western-farmland", axis?: "ew" | "ns") =>
  generateMap({ seed, widthM: 12000, heightM: 9000, cellSizeM: 250, biome: pack.biomes[biome]!, ...(axis ? { axis } : {}) });

/** 道路網でつながっているノードの集まり */
function reachable(g: GeneratedMap, start: string): Set<string> {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const e of g.roads.edges) {
      const other = e.from === n ? e.to : e.to === n ? e.from : null;
      if (other && !seen.has(other)) {
        seen.add(other);
        stack.push(other);
      }
    }
  }
  return seen;
}

describe("地図の生成", () => {
  it("同じシードなら同じ地図、違うシードなら違う地図", () => {
    expect(gen(1)).toEqual(gen(1));
    expect(gen(1).map.rows).not.toEqual(gen(2).map.rows);
  });

  for (const biome of Object.keys(pack.biomes)) {
    it(`${biome}:シナリオの地図・道路として読める。町がいくつもあり、道路で全部つながる。ノードは水の上にない`, () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const g = gen(seed, biome);
        const terrain = new TerrainMap(unwrap(parseTerrainMap(g.map)));
        const roads = new RoadNetwork(unwrap(parseRoadNetwork(g.roads)));
        expect(Object.values(g.map.legend).every((t) => t in rules.terrain)).toBe(true);
        expect(g.towns.length).toBeGreaterThanOrEqual(2);
        const all = reachable(g, g.towns[0]!.nodeId);
        for (const t of g.towns) expect(all.has(t.nodeId)).toBe(true);
        for (const e of g.entries) expect(all.has(e.nodeId)).toBe(true);
        for (const n of Object.values(g.roads.nodes)) expect(rules.terrain[terrain.terrainAt(n)]!.water ?? false).toBe(false);
        // 両軍の配置帯の端に入口がある
        expect(g.entries.some((e) => e.side === 0)).toBe(true);
        expect(g.entries.some((e) => e.side === 1)).toBe(true);
        void roads;
      }
    });
  }

  it("道路が川を横切る所は橋になる(sim-core が見つける)", () => {
    let crossings = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const g = gen(seed);
      const terrain = new TerrainMap(unwrap(parseTerrainMap(g.map)));
      const roads = new RoadNetwork(unwrap(parseRoadNetwork(g.roads)));
      crossings += findBridges({ terrain, roads, rules }).length;
    }
    expect(crossings).toBeGreaterThan(0);
  });

  it("地形の傾向が効く:アルデンヌはステップより森が多い。ジャングルはゴム園も使う", () => {
    const share = (g: GeneratedMap, ch: string) => g.map.rows.join("").split("").filter((x) => x === ch).length / g.map.rows.join("").length;
    expect(share(gen(3, "ardennes-winter"), "F")).toBeGreaterThan(share(gen(3, "steppe"), "F") * 3);
    expect(gen(3, "jungle").map.legend.P).toBe("plantation");
  });

  it("配置帯の向き:ew なら入口は西と東の端、ns なら南と北の端", () => {
    const ew = gen(7, "steppe", "ew");
    for (const e of ew.entries) expect(e.side === 0 ? e.x < 250 : e.x > 12000 - 250).toBe(true);
    const ns = gen(7, "steppe", "ns");
    for (const e of ns.entries) expect(e.side === 0 ? e.y < 250 : e.y > 9000 - 250).toBe(true);
  });
});
