import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import {
  autoResolve,
  battleScenarioFile,
  campaignAirOrders,
  campaignOrders,
  CampaignDefSchema,
  checkAirOrders,
  checkOrders,
  planStage,
  resolveStage,
  startCampaign,
  suppliedRegions,
  type BattleOutcome,
  type CampaignEnv,
} from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = {
  packs: loadPacks(),
  generator: GeneratorDataSchema.parse(json("generators/missions.json")),
  biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes,
};
const def = CampaignDefSchema.parse(json("campaigns/exercise-strait.json"));

/** 海戦の決着(勝った側は無傷、負けた側は戦力半分) */
const fake = (winner: string, units: string[]): BattleOutcome => ({
  winner,
  level: "limited",
  played: true,
  units: Object.fromEntries(units.map((id) => [id, { strength: id.startsWith(winner) ? 1 : 0.5, morale: 0.8, ammo: 0.8, fuel: 0.8, fatigue: 0.2 }])),
});

describe("キャンペーンの海域と艦隊", () => {
  it("読み込み:海域につなぐ線は sea、海域のあるキャンペーンには艦艇のパック", () => {
    const bad = json("campaigns/exercise-strait.json");
    bad.links.push({ a: "blue-town", b: "mid-sea" });
    delete bad.naval;
    const r = CampaignDefSchema.safeParse(bad);
    const text = r.success ? "" : r.error.issues.map((i) => i.message).join("\n");
    expect(text).toContain('kind "sea"');
    expect(text).toContain("naval");
  });

  it("艦隊は海域へだけ、陸の師団・旅団は陸へだけ動ける", () => {
    const s = startCampaign(def, env, 1);
    expect(checkOrders(def, s, "blue", [{ formation: "blue-fleet", to: "mid-sea" }])).toEqual([]);
    expect(checkOrders(def, s, "blue", [{ formation: "blue-fleet", to: "blue-port" }])[0]).toContain("陸の部隊は海域へ");
    expect(checkOrders(def, s, "blue", [{ formation: "blue-armd", to: "blue-sea" }])[0]).toContain("陸の部隊は海域へ");
  });

  it("同じ海域に両陣営の艦隊が入れば海戦。海だけの地図に、航空隊は母艦に載せて置く", () => {
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, { blue: [{ formation: "blue-fleet", to: "mid-sea" }], red: [{ formation: "red-fleet", to: "mid-sea" }] });
    const b = plan.battles.find((x) => x.region === "mid-sea")!;
    expect(b.mission).toBe("naval");
    expect(b.sides.blue!.units).toHaveLength(10);
    const file = battleScenarioFile(def, s, b, env);
    const r = buildScenario(file, env.packs);
    expect(r.ok ? [] : r.errors).toEqual([]);
    const units = file.units as { id: string; air?: { baseId: string } }[];
    expect(units.find((u) => u.id === "blue-fleet-vb")!.air).toEqual({ baseId: "blue-fleet-cv" });
  });

  it("期待挙動:海戦に勝てば制海権を取り、負けた艦隊は下がる。母艦を失った航空隊も失われる", () => {
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, { blue: [{ formation: "blue-fleet", to: "mid-sea" }], red: [{ formation: "red-fleet", to: "mid-sea" }] });
    const b = plan.battles.find((x) => x.region === "mid-sea")!;
    const all = [...b.sides.blue!.units, ...b.sides.red!.units];
    const out = fake("blue", all);
    delete out.units["red-fleet-cv"];
    const next = resolveStage(def, s, plan, env, { [b.id]: out });
    expect(next.control["mid-sea"]).toBe("blue");
    expect(next.formations["red-fleet"]!.region).toBe("red-sea");
    expect(next.units["red-fleet-vb"]).toBeUndefined();
    expect(next.units["red-fleet-ca1"]).toBeDefined();
  });

  it("期待挙動:港の補給の源は、近海を敵に押さえられると働かない", () => {
    const s = startCampaign(def, env, 1);
    expect(suppliedRegions(def, s, "red").has("red-port")).toBe(true);
    // 赤の鉄道終点からの道を断つ(赤の港へは港の源からしか届かない)
    s.control["red-base"] = "blue";
    expect(suppliedRegions(def, s, "red").has("red-port")).toBe(true);
    s.control["red-sea"] = "blue";
    expect(suppliedRegions(def, s, "red").has("red-port")).toBe(false);
  });

  it("期待挙動:海を渡る増援は、通る海域を敵に押さえられている間は着かず、押さえが解けた段階に着く", () => {
    const s = startCampaign(def, env, 1);
    s.stage = 2;
    s.control["red-sea"] = "blue";
    s.formations["red-fleet"]!.region = "mid-sea";
    const next = resolveStage(def, s, planStage(def, s, { blue: [], red: [] }), env);
    expect(next.formations["red-3div"]).toBeUndefined();
    expect(next.delayed).toContain("red-3div");
    expect(next.formations["blue-3div"]).toBeDefined();
    // 赤の艦隊が近海を取り戻す
    const later = resolveStage(def, { ...next, control: { ...next.control, "red-sea": "red" } }, planStage(def, { ...next, control: { ...next.control, "red-sea": "red" } }, { blue: [], red: [] }), env);
    expect(later.formations["red-3div"]).toBeDefined();
    expect(later.delayed).toBeUndefined();
  });

  it("航空隊は海域の艦隊も叩ける(地域の敵部隊への攻撃)", () => {
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, { blue: [], red: [{ formation: "red-fleet", to: "mid-sea" }] });
    const air = { blue: [{ wing: "blue-sw", mission: "units" as const, region: "mid-sea" }], red: [] };
    expect(checkAirOrders(def, s, "blue", air.blue, plan)).toEqual([]);
    const next = resolveStage(def, s, { ...plan, air }, env);
    expect(next.history[0]!.air!.find((x) => x.wing === "blue-sw")!.effect!.units).toBe(10);
  });

  it("作戦の AI の命令(陸・艦隊・航空)はどれも正しい", () => {
    const s = startCampaign(def, env, 1);
    const orders = { blue: campaignOrders(def, s, "blue", env), red: campaignOrders(def, s, "red", env) };
    for (const side of ["blue", "red"] as const) expect(checkOrders(def, s, side, orders[side])).toEqual([]);
    const plan = planStage(def, s, orders);
    for (const side of ["blue", "red"]) expect(checkAirOrders(def, s, side, campaignAirOrders(def, s, side, plan, env), plan)).toEqual([]);
  });

  it("海戦を AI 同士で最後まで解ける", () => {
    const s = startCampaign(def, env, 4);
    const plan = planStage(def, s, { blue: [{ formation: "blue-fleet", to: "mid-sea" }], red: [{ formation: "red-fleet", to: "mid-sea" }] });
    const out = autoResolve(def, s, plan.battles.find((x) => x.region === "mid-sea")!, env);
    expect(Object.keys(out.units).length).toBeGreaterThan(0);
  }, 60_000);
});
