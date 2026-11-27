import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import { battleScenarioFile, campaignOrders, CampaignDefSchema, planStage, reserveTurns, resolveStage, startCampaign, type BattleOutcome, type CampaignEnv } from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = { packs: loadPacks(), generator: GeneratorDataSchema.parse(json("generators/missions.json")), biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes };

/** 演習「川」で、戦闘の始めに置く部隊を1つにした(残りは第2梯団になる) */
function setup() {
  const raw = json("campaigns/exercise-river.json");
  raw.rules = { ...raw.rules, maxUnitsPerBattle: 1, reserveWaveTurns: 2, frontageByBiome: {} };
  const def = CampaignDefSchema.parse(raw);
  let s = startCampaign(def, env, 1);
  for (let i = 0; i < 6; i++) {
    const orders = Object.fromEntries(def.sides.map((x) => [x.id, campaignOrders(def, s, x.id, env)]));
    const plan = planStage(def, s, orders);
    const battle = plan.battles.find((b) => b.mission !== "naval" && Object.values(b.sides).some((x) => x.units.length > 1));
    if (battle) return { def, s, plan, battle };
    s = resolveStage(def, s, plan, env);
  }
  throw new Error("部隊の2つ以上いる戦闘ができない");
}

describe("キャンペーンの大軍の戦闘:第2梯団(ユーザー判断:全部隊が戦いに加わる)", () => {
  it("期待挙動:上限を超えた部隊も戦闘に加わり、上限の数ずつ決まったターンに増援として陣営の端から入る", () => {
    const { def, s, battle } = setup();
    const side = Object.keys(battle.sides).find((x) => battle.sides[x]!.units.length > 1)!;
    const units = battle.sides[side]!.units;
    const waves = reserveTurns(def, battle, side);
    expect(waves.size).toBe(units.length - 1);
    expect([...waves.values()][0]).toBe(3);
    const file = battleScenarioFile(def, s, battle, env) as { units: { id: string }[]; rules: { maxTurns: number; reinforcements?: { id: string; turn: number; strength?: number }[] } };
    expect(buildScenario(file, env.packs).ok).toBe(true);
    expect(file.units.some((u) => u.id === units[0])).toBe(true);
    const reinf = new Map((file.rules.reinforcements ?? []).map((r) => [r.id, r.turn]));
    for (const [id, turn] of waves) if (turn <= file.rules.maxTurns) expect(reinf.get(id)).toBe(turn);
  });

  it("期待挙動:戦いが終わるまでに着かなかった第2梯団は、壊滅とみなさず状態をそのまま持ち越す", () => {
    const { def, s, plan, battle } = setup();
    const side = Object.keys(battle.sides).find((x) => battle.sides[x]!.units.length > 1)!;
    const [first, late] = battle.sides[side]!.units as [string, string];
    // 出た部隊だけが結果に載り、late は着かなかった
    const units: BattleOutcome["units"] = {};
    for (const x of Object.values(battle.sides)) for (const id of x.units) if (id !== late) units[id] = { strength: 0.5, morale: 0.5, ammo: 0.5, fuel: 0.5, fatigue: 0.2 };
    const outcome: BattleOutcome = { winner: null, level: "draw", units, played: false, notArrived: [late] };
    const before = structuredClone(s.units[late]!);
    const next = resolveStage(def, s, plan, env, { [battle.id]: outcome });
    expect(next.units[late]).toBeDefined();
    expect(next.units[late]!.strength).toBeCloseTo(before.strength, 6);
    // 出た部隊は結果の戦力(補充で少し戻ることがある)、着かなかった部隊は前のまま
    expect(next.units[first]!.strength).toBeLessThan(0.6);
  });
});
