import { readFileSync } from "node:fs";
import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { BiomePackSchema, GeneratorDataSchema, generateScenario } from "../../generator/src/index.js";
import { loadPacks, unwrap } from "../../sim-core/test/helpers.js";
import { runMatch } from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/generators/${p}`, import.meta.url), "utf-8"));
const biomes = BiomePackSchema.parse(json("biomes.json")).biomes;
const data = GeneratorDataSchema.parse(json("missions.json"));
const packs = loadPacks();

describe("自動生成の戦場で AI 同士が戦える", () => {
  for (const mission of ["encounter", "attack-defense"]) {
    it(`${mission}:最後まで解けて、勝敗が出る。AI の命令はほとんど弾かれない`, () => {
      const sc = unwrap(buildScenario(generateScenario({ mission, biome: "western-farmland", size: "s", era: "generic", seed: 11 }, data, biomes, packs).file, packs));
      const out = runMatch(sc.start(11), sc.ctx);
      expect(out.turns).toBe(sc.ctx.scenario.maxTurns);
      expect(["decisive", "limited", "draw"]).toContain(out.result.level);
      for (const s of Object.values(out.stats)) expect(s.ordersRejected).toBeLessThan(10);
    }, 60000);
  }
});
