import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import { campaignOrders, CampaignDefSchema, checkOrders, startCampaign, type CampaignEnv } from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = {
  packs: loadPacks(),
  generator: GeneratorDataSchema.parse(json("generators/missions.json")),
  biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes,
};

/**
 * 北と南の2つの地域に青の師団が1つずつ、その間の要塞に赤の師団が1つ(連隊3つ)。青の師団は連隊2つずつで、1つでは赤に届かず、2つ合わせると届く。
 * 北・南の後ろは青の補給の源、要塞の後ろは赤の補給の源(どちらにも結ばない)
 */
function makeDef(blueRegiments: number) {
  const regt = (fid: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${fid}-${i + 1}`, toe: "infantry_regiment" }));
  return CampaignDefSchema.parse({
    id: "test-combined",
    name: "試験:合わせた攻め",
    era: "generic",
    sides: [{ id: "blue", name: "青軍" }, { id: "red", name: "赤軍" }],
    calendar: { startDate: "1944-06-01", daysPerStage: 2, stages: 4 },
    regions: {
      north: { name: "北", x: 0, y: 40, biome: "western-farmland", supply: "blue" },
      south: { name: "南", x: 0, y: 0, biome: "western-farmland", supply: "blue" },
      fort: { name: "要塞", x: 30, y: 20, biome: "western-farmland" },
      redbase: { name: "赤の後方", x: 60, y: 20, biome: "western-farmland", supply: "red" },
    },
    links: [{ a: "north", b: "fort" }, { a: "south", b: "fort" }, { a: "fort", b: "redbase" }],
    control: { north: "blue", south: "blue", fort: "red", redbase: "red" },
    formations: [
      { id: "blue-n", side: "blue", name: "北の師団", region: "north", units: regt("blue-n", blueRegiments) },
      { id: "blue-s", side: "blue", name: "南の師団", region: "south", units: regt("blue-s", blueRegiments) },
      { id: "red-f", side: "red", name: "要塞の師団", region: "fort", units: regt("red-f", 3) },
    ],
    victory: {
      blue: { conditions: [{ id: "fort", type: "region", region: "fort", points: 3 }], decisive: { minPoints: 3 }, limited: { minPoints: 1 } },
      red: { conditions: [{ id: "fort", type: "region", region: "fort", points: 3 }], decisive: { minPoints: 3 }, limited: { minPoints: 1 } },
    },
  });
}

describe("作戦の AI の合わせた攻め", () => {
  it("期待挙動:1つの地域では足りない敵の地域を、隣り合う2つの地域から一斉に攻める", () => {
    const def = makeDef(2);
    const s = startCampaign(def, env, 1);
    const orders = campaignOrders(def, s, "blue", env);
    expect(checkOrders(def, s, "blue", orders)).toEqual([]);
    expect(orders).toContainEqual({ formation: "blue-n", to: "fort" });
    expect(orders).toContainEqual({ formation: "blue-s", to: "fort" });
  });

  it("2つ合わせても足りなければ攻めない", () => {
    const def = makeDef(1);
    const s = startCampaign(def, env, 1);
    expect(campaignOrders(def, s, "blue", env).filter((o) => o.to === "fort")).toEqual([]);
  });

  it("同じ種なら同じ命令になる", () => {
    const def = makeDef(2);
    expect(campaignOrders(def, startCampaign(def, env, 3), "blue", env)).toEqual(campaignOrders(def, startCampaign(def, env, 3), "blue", env));
  });
});
