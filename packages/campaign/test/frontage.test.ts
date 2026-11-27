import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import {
  advanceSnapshot,
  battleLineup,
  battleScenarioFile,
  campaignOrders,
  campaignView,
  CampaignDefSchema,
  commitOrders,
  newSnapshot,
  planStage,
  regionFrontage,
  resolveStage,
  setEchelons,
  snapshotPlan,
  startCampaign,
  type BattleOutcome,
  type CampaignEnv,
  type CampaignSnapshot,
} from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = { packs: loadPacks(), generator: GeneratorDataSchema.parse(json("generators/missions.json")), biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes };

/** 演習「川」で、部隊の2つ以上いる陸の戦闘が起きるまで進める。正面幅はどの地域も frontage にする */
function setup(frontage: number) {
  const raw = json("campaigns/exercise-river.json");
  for (const r of Object.values(raw.regions) as { frontage?: number }[]) r.frontage = frontage;
  const def = CampaignDefSchema.parse(raw);
  let s = startCampaign(def, env, 1);
  for (let i = 0; i < 6; i++) {
    const orders = Object.fromEntries(def.sides.map((x) => [x.id, campaignOrders(def, s, x.id, env)]));
    const plan = planStage(def, s, orders);
    const battle = plan.battles.find((b) => b.mission !== "naval" && Object.values(b.sides).some((x) => x.units.length > 1));
    if (battle) return { def, s, plan, battle, side: Object.keys(battle.sides).find((x) => battle.sides[x]!.units.length > 1)! };
    s = resolveStage(def, s, plan, env);
  }
  throw new Error("部隊の2つ以上いる戦闘ができない");
}

describe("戦役の戦闘正面幅(ユーザー判断:地形で並べられる部隊の数が決まる)", () => {
  it("期待挙動:山岳・密林は平野・ステップより正面幅が狭く、地域の frontage が地形の既定を上書きする", () => {
    const raw = json("campaigns/exercise-river.json");
    const [a, b] = Object.keys(raw.regions) as [string, string];
    raw.regions[a].biome = "mountains";
    raw.regions[b].biome = "steppe";
    let def = CampaignDefSchema.parse(raw);
    expect(regionFrontage(def, a, 1)).toBeLessThan(regionFrontage(def, b, 1));
    expect(regionFrontage(def, a, 1)).toBe(def.rules.frontageByBiome.mountains);
    raw.regions[a].frontage = 7;
    def = CampaignDefSchema.parse(raw);
    expect(regionFrontage(def, a, 1)).toBe(7);
  });

  it("期待挙動:正面幅を超えた部隊は第2梯団として後から入り、正面幅が狭いほど戦術の地図の横幅も狭い", () => {
    const wide = setup(8);
    const narrow = setup(1);
    const units = narrow.battle.sides[narrow.side]!.units;
    const l = battleLineup(narrow.def, narrow.s, narrow.battle, narrow.side);
    expect(l.first.length).toBe(1);
    expect(l.waves.size).toBe(units.length - 1);
    const height = (x: ReturnType<typeof setup>) => {
      const f = battleScenarioFile(x.def, x.s, x.battle, env);
      const r = buildScenario(f, env.packs);
      if (!r.ok) throw new Error(r.errors.join());
      return r.value.ctx.terrain.heightM;
    };
    expect(height(narrow)).toBeLessThan(height(wide));
  });

  it("期待挙動:第1梯団に選んだ部隊は始めから置かれ、参加しない部隊は戦わずに状態を保って地域に残る", () => {
    const { def, s, plan, battle, side } = setup(1);
    const units = battle.sides[side]!.units;
    const pick = units[units.length - 1]!;
    const skip = units[0]!;
    const state = { ...s, echelons: { [pick]: "first" as const, [skip]: "none" as const } };
    const l = battleLineup(def, state, battle, side);
    expect(l.first).toEqual([pick]);
    expect(l.out).toEqual([skip]);
    const file = battleScenarioFile(def, state, battle, env) as { units: { id: string }[]; rules: { reinforcements?: { id: string }[] } };
    expect(file.units.some((u) => u.id === pick)).toBe(true);
    expect(file.units.some((u) => u.id === skip)).toBe(false);
    expect((file.rules.reinforcements ?? []).some((r) => r.id === skip)).toBe(false);

    // 結果に載らない「参加しない」部隊は、壊滅とみなさず前の状態のまま
    const res: BattleOutcome["units"] = {};
    for (const x of Object.values(battle.sides)) for (const id of x.units) if (id !== skip) res[id] = { strength: 0.5, morale: 0.5, ammo: 0.5, fuel: 0.5, fatigue: 0.2 };
    const before = structuredClone(s.units[skip]!);
    const next = resolveStage(def, state, plan, env, { [battle.id]: { winner: null, level: "draw", units: res, played: false } });
    expect(next.units[skip]).toBeDefined();
    expect(next.units[skip]!.strength).toBeCloseTo(before.strength, 6);
    expect(next.echelons).toBeUndefined();
  });

  it("梯団の指定(setEchelons):自軍の戦闘に出る部隊だけ、全部を参加しないにはできない、戦闘を選んだ後は変えられない", () => {
    const raw = json("campaigns/exercise-river.json");
    const def = CampaignDefSchema.parse(raw);
    let found: { snap: CampaignSnapshot; units: string[] } | null = null;
    for (const side of def.sides.map((x) => x.id)) {
      let snap = newSnapshot(def, env, side, 1);
      if (!snap.ok) throw new Error(snap.errors.join());
      let cur = snap.value;
      for (let i = 0; i < 6 && !found; i++) {
        const c = commitOrders(def, env, cur, campaignOrders(def, cur.state, side, env));
        if (!c.ok) throw new Error(c.errors.join());
        const b = snapshotPlan(def, c.value, env)?.battles.find((x) => x.mission !== "naval" && (x.sides[side]?.units.length ?? 0) > 1);
        if (b) {
          found = { snap: c.value, units: b.sides[side]!.units };
          break;
        }
        const a = advanceSnapshot(def, env, c.value);
        if (!a.ok) throw new Error(a.errors.join());
        cur = a.value.snapshot;
      }
      if (found) break;
    }
    if (!found) throw new Error("自軍の部隊の2つ以上いる戦闘ができない");
    const { snap, units } = found;
    const ok = setEchelons(def, env, snap, { [units[0]!]: "second" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.value.state.echelons?.[units[0]!]).toBe("second");
    const view = campaignView(def, env, ok.value);
    const row = view.plan?.battles.flatMap((b) => b.lineup ?? []).find((u) => u.id === units[0]);
    expect(row?.echelon).toBe("second");
    expect(row?.chosen).toBe(true);
    // 自動に戻す
    const back = setEchelons(def, env, ok.value, { [units[0]!]: null });
    expect(back.ok && back.value.state.echelons?.[units[0]!]).toBeUndefined();
    expect(setEchelons(def, env, snap, Object.fromEntries(units.map((id) => [id, "none" as const]))).ok).toBe(false);
    const enemy = Object.entries(snap.state.units).find(([, u]) => u.side !== snap.side)?.[0];
    if (enemy) expect(setEchelons(def, env, snap, { [enemy]: "first" }).ok).toBe(false);
    expect(setEchelons(def, env, { ...snap, battleId: "x" }, { [units[0]!]: "first" }).ok).toBe(false);
  });
});
