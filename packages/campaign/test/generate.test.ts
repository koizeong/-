import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import { campaignOrders, CampaignGeneratorSchema, campaignSpecId, generateCampaign, parseCampaignSpecId, planStage, resolveStage, startCampaign, type CampaignEnv } from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = {
  packs: loadPacks(),
  generator: GeneratorDataSchema.parse(json("generators/missions.json")),
  biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes,
};
const gen = CampaignGeneratorSchema.parse(json("generators/campaigns.json"));
const make = (size: string, era: string, seed: number) => generateCampaign({ size, era, seed }, gen, env.generator.eras[era]!.sides, Object.keys(env.biomes));

describe("自動生成のキャンペーン", () => {
  it("ID から作り直せる(同じ ID なら同じキャンペーン)", () => {
    const spec = { size: "m", era: "generic", seed: 42 };
    expect(parseCampaignSpecId(campaignSpecId(spec))).toEqual(spec);
    expect(parseCampaignSpecId("gencamp:m:generic:x")).toBeNull();
    expect(make("m", "generic", 42)).toEqual(make("m", "generic", 42));
    expect(make("m", "generic", 42)).not.toEqual(make("m", "generic", 43));
  });

  it("どの大きさ・編成でも読み込めて、始めの状態が作れる", () => {
    for (const size of Object.keys(gen.sizes))
      for (const era of Object.keys(gen.eras)) {
        const def = make(size, era, 7);
        const s = startCampaign(def, env, 1);
        expect(Object.keys(s.units).length).toBe(def.formations.reduce((t, f) => t + f.units.length, 0));
        expect(Object.keys(s.units).length).toBeGreaterThanOrEqual(gen.sizes[size]!.formations.length * 2 * 3);
        // 補給の源は両端に1つずつ
        expect(Object.values(def.regions).filter((r) => r.supply).map((r) => r.supply).sort()).toEqual(def.sides.map((x) => x.id).sort());
      }
  });

  it("地図・地形の傾向・師団の置き場所・勝利点は左右で鏡写し", () => {
    for (const seed of [1, 2, 3]) {
      const def = make("l", "generic", seed);
      const C = gen.sizes.l!.columns;
      const m = (id: string) => id.replace(/^r(\d+)-/, (_, c: string) => `r${C - 1 - Number(c)}-`);
      for (const [id, r] of Object.entries(def.regions)) expect(def.regions[m(id)]!.biome).toBe(r.biome);
      const key = (a: string, b: string) => [a, b].sort().join("|");
      const links = new Set(def.links.map((l) => key(l.a, l.b)));
      for (const l of def.links) expect(links.has(key(m(l.a), m(l.b)))).toBe(true);
      const [a, b] = def.sides.map((x) => x.id) as [string, string];
      const place = (side: string) => def.formations.filter((f) => f.side === side).map((f) => `${f.id.slice(side.length)}@${f.region}`);
      expect(place(b).sort()).toEqual(place(a).map((x) => x.replace(/@(.*)$/, (_, r: string) => `@${m(r)}`)).sort());
      const pts = (side: string) => def.victory[side]!.conditions.reduce((t, c) => t + c.points, 0);
      expect(pts(a)).toBe(pts(b));
    }
  });

  it("AI 同士(小・汎用)で、どちらかに偏らない", () => {
    const wins: Record<string, number> = { blue: 0, red: 0, draw: 0 };
    for (let seed = 1; seed <= Number(process.env.CAMP_SEEDS ?? 4); seed++) {
      const def = make("s", "generic", seed);
      let s = startCampaign(def, env, seed);
      while (!s.result) s = resolveStage(def, s, planStage(def, s, { blue: campaignOrders(def, s, "blue", env), red: campaignOrders(def, s, "red", env) }), env);
      wins[s.result.winner ?? "draw"]!++;
    }
    console.log("自動生成のキャンペーン AI 同士:", wins);
    const n = Number(process.env.CAMP_SEEDS ?? 4);
    expect(wins.blue!).toBeLessThan(n);
    expect(wins.red!).toBeLessThan(n);
  }, 600000);
});
