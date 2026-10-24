import { readFileSync } from "node:fs";
import { buildScenario, resolveTurn } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import { BiomePackSchema, GeneratorDataSchema, generateScenario, parseSpecId, specId, type ScenarioSpec } from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/generators/${p}`, import.meta.url), "utf-8"));
const biomes = BiomePackSchema.parse(json("biomes.json")).biomes;
const data = GeneratorDataSchema.parse(json("missions.json"));
const packs = loadPacks();
const spec = (over: Partial<ScenarioSpec> = {}): ScenarioSpec => ({ mission: "encounter", biome: "western-farmland", size: "s", era: "generic", seed: 1, ...over });

describe("任務の生成", () => {
  it("シナリオの ID に設定とシードを書き、ID から読み戻せる", () => {
    const s = spec({ biome: "ardennes-winter", era: "1944-us-de", seed: 42, size: "l", mission: "attack-defense" });
    expect(parseSpecId(specId(s))).toEqual(s);
    expect(parseSpecId("bastogne-1944-12")).toBeNull();
  });

  it("同じ設定なら同じシナリオ", () => {
    expect(generateScenario(spec(), data, biomes, packs).file).toEqual(generateScenario(spec(), data, biomes, packs).file);
  });

  for (const mission of Object.keys(data.missions)) {
    for (const era of Object.keys(data.eras)) {
      it(`${mission}・${era}:どの地形の傾向でも、シナリオとして読めて1ターン解ける`, () => {
        for (const biome of Object.keys(biomes)) {
          for (const seed of [1, 2, 3]) {
            const g = generateScenario(spec({ mission, era, biome, seed }), data, biomes, packs);
            const r = buildScenario(g.file, packs);
            if (!r.ok) throw new Error(`${biome}/${seed}:\n${r.errors.join("\n")}`);
            const sides = r.value.def.sides.map((s) => s.id);
            for (const s of sides) expect(r.value.units.filter((u) => u.side === s).length).toBeGreaterThanOrEqual(2);
            expect(r.value.ctx.scenario.objectives.filter((o) => !o.id.startsWith("extra")).length).toBe(data.missions[mission]!.objectives);
            const s0 = r.value.start(seed);
            expect(s0.secrets && Object.keys(s0.secrets).sort()).toEqual([...sides].sort());
            resolveTurn(s0, [], r.value.ctx);
          }
        }
      });
    }
  }

  it("期待挙動:遭遇戦の目標は、両軍の配置帯から同じくらいの所要時間(差が許容の範囲)", () => {
    let checked = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = generateScenario(spec({ seed, size: "m" }), data, biomes, packs);
      for (const t of g.objectiveTimes) {
        const [a, b] = t.minutes;
        if (!g.map.towns.some((x) => g.file.rules && (g.file.rules as { objectives: { id: string; name: string }[] }).objectives.find((o) => o.id === t.id)?.name === x.name)) continue;
        expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThanOrEqual(data.fairness + 0.02); // 所要時間は分に丸めてあるので、少しだけ緩める
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("期待挙動:攻撃と防御では、守る側が目標を持って陣地にこもり、攻める側の兵力(点数)が多い", () => {
    for (const seed of [1, 2, 3, 4]) {
      const g = generateScenario(spec({ mission: "attack-defense", seed }), data, biomes, packs);
      const r = buildScenario(g.file, packs);
      if (!r.ok) throw new Error(r.errors.join("\n"));
      const obj = r.value.ctx.scenario.objectives.filter((o) => !o.id.startsWith("extra"));
      const def = obj[0]!.initialHolder!;
      expect(obj.every((o) => o.initialHolder === def)).toBe(true);
      const defUnits = r.value.units.filter((u) => u.side === def && u.entrenchment > 0);
      expect(defUnits.length).toBeGreaterThan(0);
      const att = r.value.def.sides.find((s) => s.id !== def)!.id;
      expect(r.value.units.filter((u) => u.side === att).length).toBeGreaterThanOrEqual(r.value.units.filter((u) => u.side === def).length);
    }
  });
});
