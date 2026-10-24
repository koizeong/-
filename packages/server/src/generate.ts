import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GeneratorDataSchema, generateScenario, parseSpecId, type Biome, type GeneratorData } from "@brigade/generator";
import { buildScenario, type LoadedScenario, type PackSet } from "@brigade/sim-core";

/** 自動生成の任務の決まり(data/generators/missions.json)と地形の傾向 */
export interface GeneratorSetup {
  data: GeneratorData;
  biomes: Record<string, Biome>;
}

export function loadGeneratorData(dataDir: string): GeneratorData | null {
  const path = join(dataDir, "generators", "missions.json");
  if (!existsSync(path)) return null;
  const r = GeneratorDataSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
  if (!r.success) throw new Error(`${path}:\n${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return r.data;
}

/** 作ったシナリオを少しだけ覚えておく(同じ ID を何度も作り直さない) */
const cache = new Map<string, LoadedScenario>();
const CACHE_SIZE = 16;

/**
 * 自動生成のシナリオの ID(gen:任務:地形の傾向:大きさ:編成:シード)から、シナリオを作る。
 * 同じ ID なら同じシナリオになるので、記録・続きから・オンライン対戦は ID だけで足りる
 */
export function generatedScenario(id: string, setup: GeneratorSetup | undefined, packs: PackSet | undefined): LoadedScenario | undefined {
  const hit = cache.get(id);
  if (hit) return hit;
  const spec = parseSpecId(id);
  if (!spec || !setup || !packs) return undefined;
  if (!setup.data.missions[spec.mission] || !setup.data.eras[spec.era] || !setup.biomes[spec.biome]) return undefined;
  const r = buildScenario(generateScenario(spec, setup.data, setup.biomes, packs).file, packs);
  if (!r.ok) throw new Error(`自動生成のシナリオ ${id} が読めません:\n${r.errors.join("\n")}`);
  cache.set(id, r.value);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return r.value;
}
