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
            expect(r.value.ctx.scenario.objectives.filter((o) => !o.id.startsWith("extra") && !o.id.startsWith("line")).length).toBe(data.missions[mission]!.objectives);
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

describe("偶然の条件のカード", () => {
  for (const [id, card] of Object.entries(data.cards)) {
    it(`${id}(${card.name}):効き目がシナリオに入り、読めて1ターン解ける`, () => {
      const only = { ...data, cardsPerGame: [1, 1] as [number, number], cards: { [id]: card } };
      const mission = card.missions?.[0] ?? "encounter";
      const g = generateScenario(spec({ mission, seed: 4 }), only, biomes, packs);
      expect(g.cards.map((c) => c.id)).toEqual([id]);
      expect(String(g.file.description)).toContain(card.name);
      const r = buildScenario(g.file, packs);
      if (!r.ok) throw new Error(r.errors.join("\n"));
      const sc = r.value;
      const e = card.effect;
      const side = g.cards[0]!.side;
      if (e.type === "darkStart") expect(sc.ctx.scenario.darkTurns).toEqual([{ from: 1, to: e.turns }]);
      if (e.type === "weather") expect(sc.ctx.scenario.weather.initial).toBe(e.initial);
      if (e.type === "ground") expect(sc.ctx.scenario.weather.ground).toMatchObject({ mud: e.mud, snow: e.snow });
      if (e.type === "air") expect(Object.keys(sc.ctx.scenario.air)).toEqual([side]);
      if (e.type === "entrench") expect(sc.units.some((u) => u.entrenchment >= e.level)).toBe(true);
      if (e.type === "ammo") expect(sc.units.filter((u) => u.side === side).every((u) => u.ammo <= e.level + 1e-9)).toBe(true);
      if (e.type === "delay") expect(sc.ctx.scenario.reinforcements.filter((x) => x.side === side && x.turn === e.turn).length).toBe(e.count);
      resolveTurn(sc.start(4), [], sc.ctx);
    });
  }

  it("1戦に引く枚数は決まりの範囲で、同じ組(天候)のカードは重ならない", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = generateScenario(spec({ seed }), data, biomes, packs);
      expect(g.cards.length).toBeLessThanOrEqual(data.cardsPerGame[1]);
      const groups = g.cards.map((c) => data.cards[c.id]!.group).filter(Boolean);
      expect(new Set(groups).size).toBe(groups.length);
    }
  });
});
