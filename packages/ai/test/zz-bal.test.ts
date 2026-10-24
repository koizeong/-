import { readFileSync } from "node:fs";
import { buildScenario } from "@brigade/sim-core";
import { it } from "vitest";
import { BiomePackSchema, GeneratorDataSchema, generateScenario } from "../../generator/src/index.js";
import { loadPacks, unwrap } from "../../sim-core/test/helpers.js";
import { runMatch } from "../src/index.js";
const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/generators/${p}`, import.meta.url), "utf-8"));
it("bal", () => {
  const biomes = BiomePackSchema.parse(json("biomes.json")).biomes;
  const data = GeneratorDataSchema.parse(json("missions.json"));
  const m = process.env.MISSION ?? "breakthrough";
  if (process.env.TURNS) data.missions[m]!.turns = Number(process.env.TURNS);
  if (process.env.RATIO) data.missions[m]!.forceRatio = Number(process.env.RATIO);
  if (process.env.SHARE) data.missions[m]!.exitShare = { limited: Number(process.env.SHARE), decisive: Number(process.env.SHARE) + 0.15, deny: Number(process.env.SHARE) * 0.4 };
  const packs = loadPacks();
  const bs = Object.keys(biomes);
  const tally: Record<string, number> = {};
  for (let seed = 1; seed <= 20; seed++) {
    const sc = unwrap(buildScenario(generateScenario({ mission: m, biome: bs[seed % bs.length]!, size: "s", era: "generic", seed }, data, biomes, packs).file, packs));
    const out = runMatch(sc.start(seed), sc.ctx);
    const brk = Object.entries(sc.ctx.scenario.victory).find(([, v]) => v.conditions.some((c) => c.id === "exit-limited"))?.[0];
    const role = out.result.winner === null ? "draw" : out.result.winner === brk ? "breaker" : "blocker";
    tally[`${role}:${out.result.level}`] = (tally[`${role}:${out.result.level}`] ?? 0) + 1;
  }
  console.log(JSON.stringify(tally));
}, 600000);
