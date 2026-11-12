import { readFileSync } from "node:fs";
import { buildScenario, viewForSide } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { BiomePackSchema, GeneratorDataSchema, generateScenario } from "../../generator/src/index.js";
import { loadPacks, unwrap } from "../../sim-core/test/helpers.js";
import { assess, decide, defensiveSide, holdFastUnits, offensiveChance } from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/generators/${p}`, import.meta.url), "utf-8"));
const biomes = BiomePackSchema.parse(json("biomes.json")).biomes;
const data = GeneratorDataSchema.parse(json("missions.json"));
const packs = loadPacks();
const gen = (mission: string, seed: number) =>
  unwrap(buildScenario(generateScenario({ mission, biome: "western-farmland", size: "s", era: "generic", seed }, data, biomes, packs, { cards: [] }).file, packs));

describe("防勢の陣営の陣地の堅守", () => {
  it("攻撃と防御・突破の守る側は防勢、攻める側と遭遇戦の両陣営は防勢でない", () => {
    for (const mission of ["attack-defense", "breakthrough"]) {
      const sc = gen(mission, 3);
      const sides = sc.def.sides.map((s) => s.id);
      const def = sides.filter((s) => defensiveSide(sc.ctx, s));
      expect(def.length).toBe(1);
    }
    const enc = gen("encounter", 3);
    for (const s of enc.def.sides) expect(defensiveSide(enc.ctx, s.id)).toBe(false);
  });

  it("勝機がなければ、守る側の陣地の部隊には移動の命令を出さない(堅守を切ると出すことがある)", () => {
    let held = 0;
    for (const seed of [1, 2, 3, 4]) {
      const sc = gen("attack-defense", seed);
      const side = sc.def.sides.map((s) => s.id).find((s) => defensiveSide(sc.ctx, s))!;
      const st = sc.start(seed);
      const view = viewForSide(st, side);
      const ids = holdFastUnits(view, assess(view, sc.ctx), sc.ctx);
      held += ids.size;
      const d = decide(view, sc.ctx, { caution: 0.5, noise: 0 }, seed);
      for (const o of d.orders) if (ids.has(o.unitId)) expect(o.waypoints ?? []).toEqual([]);
    }
    expect(held).toBeGreaterThan(0);
  });

  it("見えている敵の2倍以上の戦力があれば勝機ありとして堅守をやめる", () => {
    const sc = gen("attack-defense", 2);
    const side = sc.def.sides.map((s) => s.id).find((s) => defensiveSide(sc.ctx, s))!;
    const view = viewForSide(sc.start(2), side);
    const a = assess(view, sc.ctx);
    const weak = { ...a, threats: [{ contactId: "x", pos: { x: 0, y: 0 }, estimatedStrength: 0.1, currentLevel: 1, formation: "deployed" as const }] } as typeof a;
    expect(offensiveChance(view, weak, sc.ctx)).toBe(true);
    expect(holdFastUnits(view, weak, sc.ctx).size).toBe(0);
    const none = { ...a, threats: [] };
    expect(offensiveChance(view, none, sc.ctx)).toBe(false);
  });
});
