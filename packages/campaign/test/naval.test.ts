import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import { landAirUnits } from "../src/naval.js";
import {
  assignAir,
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

  it("期待挙動:空母のいない海戦は種でおよそ7割が夜戦(暗い時間)になり、空母のいる海戦はいつも昼。スコールを置く", async () => {
    const { navalBattleFile } = await import("../src/naval.js");
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, { blue: [{ formation: "blue-fleet", to: "mid-sea" }], red: [{ formation: "red-fleet", to: "mid-sea" }] });
    const b = plan.battles.find((x) => x.region === "mid-sea")!;
    // 空母と航空隊を外した水上艦だけの海戦
    const surface = structuredClone(b);
    for (const side of Object.values(surface.sides)) side.units = side.units.filter((id) => !s.units[id]!.base && !/cv/.test(id));
    let nights = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const f = navalBattleFile(def, s, surface, env, seed) as { name: string; time: { startHour: number }; rules: { darkTurns: { from: number; to: number }[]; squalls: unknown[] } };
      expect(f.rules.squalls).toHaveLength(2);
      if (f.rules.darkTurns.length) {
        nights++;
        expect(f.time.startHour).toBe(21);
        expect(f.rules.darkTurns[0]).toEqual({ from: 1, to: 24 });
        expect(f.name).toContain("夜戦");
      }
    }
    expect(nights / 40).toBeGreaterThan(0.5);
    expect(nights / 40).toBeLessThan(0.9);
    for (let seed = 1; seed <= 10; seed++) expect((navalBattleFile(def, s, b, env, seed) as { rules: { darkTurns: unknown[] } }).rules.darkTurns).toEqual([]);
    const r = buildScenario(navalBattleFile(def, s, surface, env, 3), env.packs);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("期待挙動:空母のいる海戦は 400×300km・間合い250km、水上艦だけは 200×120km。どちらも自陣営の後ろの地図の端が脱出路で、負けの込んだ AI は端へ下がって撤退する", async () => {
    const { navalBattleFile } = await import("../src/naval.js");
    const { decide } = await import("../../ai/src/index.js");
    const { viewForSide } = await import("@brigade/sim-core");
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, { blue: [{ formation: "blue-fleet", to: "mid-sea" }], red: [{ formation: "red-fleet", to: "mid-sea" }] });
    const b = plan.battles.find((x) => x.region === "mid-sea")!;
    type F = { map: { cellSizeM: number; rows: string[] }; units: { side: string; x: number; air?: unknown }[]; rules: { escapeRoutes: { side: string; edge: string; fromTurn: number }[] } };
    const size = (f: F) => [f.map.rows[0]!.length * f.map.cellSizeM, f.map.rows.length * f.map.cellSizeM];
    const carrier = navalBattleFile(def, s, b, env, 1) as F;
    expect(size(carrier)).toEqual([400000, 300000]);
    const xs = (f: F, side: string) => f.units.filter((u) => u.side === side && !u.air).map((u) => u.x);
    expect(Math.min(...xs(carrier, "red")) - Math.max(...xs(carrier, "blue"))).toBeGreaterThan(240000);
    expect(carrier.rules.escapeRoutes).toEqual([expect.objectContaining({ side: "blue", edge: "west", fromTurn: 1 }), expect.objectContaining({ side: "red", edge: "east", fromTurn: 1 })]);
    const surface = structuredClone(b);
    for (const side of Object.values(surface.sides)) side.units = side.units.filter((id) => !s.units[id]!.base && !/cv/.test(id));
    expect(size(navalBattleFile(def, s, surface, env, 1) as F)).toEqual([200000, 120000]);
    // 撤退を始めた青の AI:戦隊は全速で西の端へ向かい、端に着いた艦は撤退する
    const r = buildScenario(navalBattleFile(def, s, surface, env, 1), env.packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const st = r.value.start(1);
    const blue = st.units.filter((u) => u.side === "blue");
    const atEdge = { ...st, retreatedSides: ["blue"], units: st.units.map((u) => (u.id === blue[0]!.id ? { ...u, pos: { x: 2000, y: u.pos.y } } : u)) };
    const d = decide(viewForSide(atEdge, "blue"), r.value.ctx, { caution: 0.5, noise: 0 }, 1);
    expect(d.seaOrders!.length).toBeGreaterThan(0);
    for (const o of d.seaOrders!) expect(o).toMatchObject({ speed: "flank", toward: { x: 500 } });
    expect(d.hqCommands).toContainEqual({ side: "blue", type: "retreat", unitId: blue[0]!.id });
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

describe("艦隊の修理と港", () => {
  it("期待挙動:港にいる艦隊は段階ごとに修理を受け、港の外では直らない(艦上の航空隊も同じ)", () => {
    const s = startCampaign(def, env, 1);
    for (const id of ["blue-fleet-ca1", "blue-fleet-vb", "red-fleet-ca1", "red-fleet-vb"]) s.units[id]!.strength = 0.5;
    // 青の艦隊は近海(港の前)、赤の艦隊は海峡へ(港の外)
    s.formations["red-fleet"]!.region = "mid-sea";
    const next = resolveStage(def, s, planStage(def, s, { blue: [], red: [] }), env);
    expect(next.units["blue-fleet-ca1"]!.strength).toBeCloseTo(0.5 + def.rules.navalRepairPerStage);
    expect(next.units["blue-fleet-vb"]!.strength).toBeCloseTo(0.5 + def.rules.navalRepairPerStage);
    expect(next.units["red-fleet-ca1"]!.strength).toBeCloseTo(0.5);
    expect(next.units["red-fleet-vb"]!.strength).toBeCloseTo(0.5);
  });

  it("期待挙動:作戦の AI は、大きく傷ついた艦隊を港の海域へ下げる", () => {
    const s = startCampaign(def, env, 1);
    s.formations["red-fleet"]!.region = "mid-sea";
    for (const [id, u] of Object.entries(s.units)) if (id.startsWith("red-fleet")) u.strength = 0.4;
    const orders = campaignOrders(def, s, "red", env);
    expect(orders.find((o) => o.formation === "red-fleet")).toMatchObject({ to: "red-sea" });
  });
});

describe("マレー作戦の海(Z部隊・エンダウ沖)", () => {
  const malaya = CampaignDefSchema.parse(json("campaigns/malaya-1941.json"));

  it("東海岸沖に3つの海域、Z部隊と船団の護衛が始めからいて、エンダウの護衛は1月下旬に来る", () => {
    const s = startCampaign(malaya, env, 1);
    expect(malaya.regions["sea-north"]!.sea).toBe(true);
    expect(s.formations["uk-force-z"]!.region).toBe("sea-south");
    expect(s.formations["jp-escort"]!.region).toBe("sea-north");
    expect(s.formations["jp-endau"]).toBeUndefined();
    expect(malaya.formations.find((f) => f.id === "jp-18div")!.via).toBe("sea-north");
  });

  it("Z部隊が北へ出れば、船団の護衛と海戦になり、戦術の海戦が読み込める", () => {
    const s = startCampaign(malaya, env, 1);
    const plan = planStage(malaya, s, { uk: [{ formation: "uk-force-z", to: "sea-east" }], jp: [{ formation: "jp-escort", to: "sea-east" }] });
    const b = plan.battles.find((x) => x.region === "sea-east")!;
    expect(b.mission).toBe("naval");
    expect(b.sides.uk!.units).toContain("uk-force-z-pow");
    const r = buildScenario(battleScenarioFile(malaya, s, b, env), env.packs);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
});

describe("陸の航空隊の海戦(空母の艦載機に準じる)", () => {
  const malaya = CampaignDefSchema.parse(json("campaigns/malaya-1941.json"));
  const raid = (seed = 1) => {
    const s = startCampaign(malaya, env, seed);
    const plan = assignAir(planStage(malaya, s, { uk: [], jp: [] }), { jp: [{ wing: "jp-bombers", mission: "units", region: "sea-south" }], uk: [] }, malaya, s);
    return { s, plan, b: plan.battles.find((x) => x.region === "sea-south")! };
  };

  it("海域の敵の艦隊への部隊攻撃は「艦隊への空襲」の海戦になり、陸攻は地図の外の飛行場から飛ぶ盤上の航空隊になる", () => {
    const { s, plan, b } = raid();
    expect(b).toMatchObject({ mission: "naval", airRaid: true, attacker: "jp" });
    expect(b.sides.jp!.units).toEqual([]);
    expect(b.sides.uk!.units).toContain("uk-force-z-pow");
    // 戦略の任務からは外れる(二重に叩かない)
    expect(plan.air!.jp!.find((o) => o.wing === "jp-bombers")!.mission).toBe("battle");
    const units = landAirUnits(malaya, s, b, env);
    // 20.8 編隊 × 12機 = 250機 → 12機の隊 21個(最後は端数)と索敵機
    expect(units.filter((x) => x.kind === "strike").reduce((t, x) => t + x.planes, 0)).toBe(250);
    expect(units.find((x) => x.kind === "scout")).toBeDefined();
    expect(units[0]!.airfield.name).toBe(malaya.regions["singora"]!.name);
    const file = battleScenarioFile(malaya, s, b, env) as { name: string; rules: { darkTurns: unknown[]; air: unknown }; units: { id: string; air?: { airfield?: unknown } }[] };
    expect(file.name).toContain("空襲");
    expect(file.rules.darkTurns).toEqual([]);
    expect(file.rules.air).toEqual({});
    expect(file.units.find((x) => x.id === units[0]!.id)!.air!.airfield).toEqual(units[0]!.airfield);
    const r = buildScenario(file, env.packs);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("期待挙動:空襲で艦隊が傷つき、陸攻の失った機は航空隊の編隊から引かれる。空襲に勝っても海域は取らない", () => {
    const { s, plan, b } = raid(2);
    const out = autoResolve(malaya, s, b, env);
    const shipsAfter = b.sides.uk!.units.reduce((t, id) => t + (out.units[id]?.strength ?? 0), 0);
    expect(shipsAfter).toBeLessThan(b.sides.uk!.units.length);
    const next = resolveStage(malaya, s, plan, env, { [b.id]: out });
    expect(next.control["sea-south"]).toBe("uk");
    const air = next.history[next.history.length - 1]!.air!.find((x) => x.wing === "jp-bombers" && x.mission === "battle")!;
    expect(air.sent.strike).toBeCloseTo(20.8);
    // 失った機は報告に出る(段階の終わりの補充で編隊が戻ることがあるので、引いた分は報告で確かめる)
    expect(air.lost.strike).toBeGreaterThan(0);
    expect(air.lost.strike).toBeLessThan(20.8);
  }, 120000);
});

describe("東京急行・飛行場への艦砲射撃・飛行場の争奪", () => {
  /** 演習の海峡を書き換える:赤の港に飛行場と攻撃機の航空隊、青の艦隊に戦艦、赤の艦隊は外す */
  const variant = (edit: (d: Record<string, any>) => void = () => {}) => {
    const d = json("campaigns/exercise-strait.json");
    d.regions["red-port"].airbase = true;
    d.airWings.find((w: { id: string }) => w.id === "red-sw").base = "red-port";
    d.formations.find((f: { id: string }) => f.id === "blue-fleet").units.push({ id: "blue-fleet-bb", toe: "gen_bb" });
    d.formations = d.formations.filter((f: { id: string }) => f.id !== "red-fleet");
    edit(d);
    return CampaignDefSchema.parse(d);
  };

  it("期待挙動:飛行場に面した海域に残った戦艦の艦隊は、そこの敵の航空隊を壊し、その段階の補充を止める。下がれば撃てない", () => {
    const d = variant();
    const s = startCampaign(d, env, 1);
    s.formations["blue-fleet"]!.region = "mid-sea";
    const before = s.wings!["red-sw"]!.strike;
    expect(checkOrders(d, s, "blue", [{ formation: "blue-fleet", to: "mid-sea", bombard: "red-port" }])[0]).toContain("艦砲射撃できません");
    const plan = planStage(d, s, { blue: [{ formation: "blue-fleet", to: "red-sea", bombard: "red-port" }], red: [] });
    expect(plan.bombard).toEqual([{ formation: "blue-fleet", region: "red-port" }]);
    const next = resolveStage(d, s, plan, env);
    const r = next.history[next.history.length - 1]!.bombardments![0]!;
    // 戦艦 0.25 + 巡洋艦の分
    expect(r.share).toBeGreaterThanOrEqual(0.25);
    expect(r.share).toBeLessThanOrEqual(d.rules.bombardment.maxShare);
    // 壊した分は補充で戻らない(この段階の補充が止まる)
    expect(next.wings!["red-sw"]!.strike).toBeCloseTo(before * (1 - r.share), 1);
  });

  it("期待挙動:東京急行の増援は、押さえられた海域でも敵の艦隊がいなければ夜に着き、敵の航空隊が届けば戦力を失う。艦隊がいれば遅れる", () => {
    const d = variant((x) => {
      x.formations.find((f: { id: string }) => f.id === "red-3div").express = true;
      x.rules.nightExpress = { red: { loss: 0.2, supplyShare: 0.5 } };
    });
    const s = startCampaign(d, env, 1);
    s.stage = 2;
    s.control["red-sea"] = "blue";
    const next = resolveStage(d, s, planStage(d, s, { blue: [], red: [] }), env);
    const rep = next.history[next.history.length - 1]!;
    expect(rep.expressed?.[0]?.formation).toBe("red-3div");
    const u = Object.values(next.units).filter((x) => x.formation === "red-3div");
    expect(u.length).toBeGreaterThan(0);
    // 青の航空隊が届けば戦力を失う
    if (rep.expressed![0]!.loss > 0) for (const x of u) expect(x.strength).toBeLessThan(1);
    // 敵の艦隊がいる海域は夜でも通れない
    const s2 = startCampaign(d, env, 1);
    s2.stage = 2;
    s2.control["red-sea"] = "blue";
    s2.formations["blue-fleet"]!.region = "red-sea";
    const n2 = resolveStage(d, s2, planStage(d, s2, { blue: [], red: [] }), env);
    expect(n2.history[n2.history.length - 1]!.delayed).toContain("red-3div");
  }, 120000);

  it("期待挙動:夜の輸送の陣営は、敵に押さえられた海域の先にも少しだけ補給が届く(敵の艦隊がいれば届かない)", () => {
    const d = variant((x) => (x.rules.nightExpress = { red: { loss: 0.1, supplyShare: 0.4 } }));
    const s = startCampaign(d, env, 1);
    s.control["red-base"] = "blue";
    s.control["red-sea"] = "blue";
    expect(suppliedRegions(d, s, "red").has("red-port")).toBe(false);
    expect(suppliedRegions(d, s, "red", true).has("red-port")).toBe(true);
    s.formations["blue-fleet"]!.region = "red-sea";
    expect(suppliedRegions(d, s, "red", true).has("red-port")).toBe(false);
  });

  it("期待挙動:作戦の AI の戦艦の艦隊は、面した敵の飛行場を砲撃し、航空隊は取った前の飛行場へ移る", async () => {
    const { campaignOrders, campaignAirOrders } = await import("../src/index.js");
    // 空母のある艦隊は砲撃に出さないので、空母と航空隊を外した水上の艦隊で確かめる
    const d = variant((x) => {
      const f = x.formations.find((y: { id: string }) => y.id === "blue-fleet");
      f.units = f.units.filter((u: { toe: string; base?: string }) => u.toe !== "gen_cv" && !u.base);
    });
    const s = startCampaign(d, env, 1);
    s.formations["blue-fleet"]!.region = "red-sea";
    const all = campaignOrders(d, s, "blue", env);
    const o = all.find((x) => x.formation === "blue-fleet");
    expect(o?.bombard, JSON.stringify(all)).toBe("red-port");
    // 青の戦闘機の基地から敵に届かず、取った赤の港の飛行場からは届くなら、そこへ移る
    const near = variant((x) => (x.airWings.find((w: { id: string }) => w.id === "blue-fw").rangeKm = 58));
    const s3 = startCampaign(near, env, 1);
    s3.control["red-port"] = "blue";
    s3.formations["red-armd"]!.region = "red-base";
    const air = campaignAirOrders(near, s3, "blue", planStage(near, s3, { blue: [], red: [] }), env);
    expect(air.find((x) => x.wing === "blue-fw")).toEqual({ wing: "blue-fw", mission: "rebase", region: "red-port" });
  });
});

describe("ガダルカナル島の戦い(v0)", () => {
  const gc = CampaignDefSchema.parse(json("campaigns/guadalcanal-1942.json"));

  it("読み込めて、両陣営の作戦の AI の命令が正しい。ルンガに飛行場、日本の増援は東京急行でスロットを通る", async () => {
    const { campaignOrders } = await import("../src/index.js");
    const s = startCampaign(gc, env, 1);
    expect(gc.regions["lunga"]!.airbase).toBe(true);
    expect(s.control["lunga"]).toBe("us");
    for (const side of ["us", "jp"]) expect(checkOrders(gc, s, side, campaignOrders(gc, s, side, env))).toEqual([]);
    const ichiki = gc.formations.find((f) => f.id === "jp-ichiki")!;
    expect(ichiki).toMatchObject({ express: true, via: "sea-slot" });
    expect(gc.rules.nightExpress["jp"]).toBeDefined();
    // 米の空母の航空隊は母艦に載る
    expect(Object.values(s.units).some((u) => u.base === "us-tf16-enterprise")).toBe(true);
  });

  it("鉄底海峡で日米の艦隊が出会えば海戦になり、カクタス航空隊も陸の飛行場から出られる", () => {
    const s = startCampaign(gc, env, 1);
    s.wings!["us-cactus"] = { side: "us", base: "lunga", fighters: 1.6, strike: 1 };
    const plan = assignAir(
      planStage(gc, s, { us: [], jp: [{ formation: "jp-mikawa", to: "sea-slot" }] }),
      { us: [], jp: [] },
      gc,
      s,
    );
    expect(plan.battles.find((b) => b.region === "sea-slot")).toBeUndefined();
    s.formations["jp-mikawa"]!.region = "sea-slot";
    const p2 = assignAir(planStage(gc, s, { us: [], jp: [{ formation: "jp-mikawa", to: "sea-ironbottom" }] }), { us: [{ wing: "us-cactus", mission: "battle", region: "sea-ironbottom" }], jp: [] }, gc, s);
    const b = p2.battles.find((x) => x.region === "sea-ironbottom")!;
    expect(b.mission).toBe("naval");
    const file = battleScenarioFile(gc, s, b, env);
    const r = buildScenario(file, env.packs);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect((file.units as { id: string }[]).some((u) => u.id.startsWith("us-cactus~"))).toBe(true);
  });
});

describe("レイテの戦い(v0)", () => {
  const ly = CampaignDefSchema.parse(json("campaigns/leyte-1944.json"));

  it("読み込めて、両陣営の作戦の AI の命令が正しい。米の空母の航空隊は1944年の機種", async () => {
    const { campaignOrders } = await import("../src/index.js");
    const s = startCampaign(ly, env, 1);
    for (const side of ["us", "jp"]) expect(checkOrders(ly, s, side, campaignOrders(ly, s, side, env))).toEqual([]);
    expect(s.units["us-tg382-intrepid-vf"]).toMatchObject({ toe: "pa44-f6f-36", base: "us-tg382-intrepid" });
    expect(ly.formations.find((f) => f.id === "jp-1div")).toMatchObject({ express: true, via: "sea-camotes" });
  });

  it("レイテ湾に栗田の艦隊が入れば、旧式戦艦・護衛空母と海戦になり、ルソンの陸攻も地図の外から飛べる", () => {
    const s = startCampaign(ly, env, 1);
    s.formations["jp-kurita"]!.region = "sea-samar";
    const plan = assignAir(planStage(ly, s, { us: [], jp: [{ formation: "jp-kurita", to: "sea-leyte-gulf" }] }), { jp: [{ wing: "jp-2af-b", mission: "battle", region: "sea-leyte-gulf" }], us: [] }, ly, s);
    const b = plan.battles.find((x) => x.region === "sea-leyte-gulf")!;
    expect(b.mission).toBe("naval");
    const file = battleScenarioFile(ly, s, b, env);
    const r = buildScenario(file, env.packs);
    expect(r.ok ? [] : r.errors).toEqual([]);
    expect((file.units as { id: string }[]).some((u) => u.id.startsWith("jp-2af-b~"))).toBe(true);
  });
});
