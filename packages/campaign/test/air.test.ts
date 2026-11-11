import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { buildScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import {
  assignAir,
  autoResolve,
  battleScenarioFile,
  campaignAirOrders,
  CampaignDefSchema,
  checkAirOrders,
  chooseBattle,
  commitAir,
  commitOrders,
  newSnapshot,
  planStage,
  resolveStage,
  snapshotPlan,
  startCampaign,
  type BattleOutcome,
  type CampaignAirOrder,
  type CampaignEnv,
  type CampaignState,
} from "../src/index.js";

const json = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
const env: CampaignEnv = {
  packs: loadPacks(),
  generator: GeneratorDataSchema.parse(json("generators/missions.json")),
  biomes: BiomePackSchema.parse(json("generators/biomes.json")).biomes,
};

/** 演習のキャンペーンに、両陣営の後方の航空基地と航空隊を足したもの */
function airDef(extra: (raw: Record<string, any>) => void = () => {}) {
  const raw = json("campaigns/exercise-river.json");
  raw.regions["blue-base"].airbase = true;
  raw.regions["red-base"].airbase = true;
  raw.regions["west-town"].airbase = true;
  raw.airWings = [
    { id: "blue-strike", side: "blue", name: "青の攻撃航空団", base: "blue-base", rangeKm: 90, fighters: 1, strike: 3 },
    { id: "blue-fighter", side: "blue", name: "青の戦闘航空団", base: "blue-base", rangeKm: 70, fighters: 3, strike: 0 },
    { id: "red-strike", side: "red", name: "赤の攻撃航空団", base: "red-base", rangeKm: 90, fighters: 1, strike: 3 },
    { id: "red-fighter", side: "red", name: "赤の戦闘航空団", base: "red-base", rangeKm: 70, fighters: 3, strike: 0 },
  ];
  extra(raw);
  return CampaignDefSchema.parse(raw);
}
const def = airDef();
const power = (s: CampaignState, region: string) => Object.values(s.units).filter((u) => s.formations[u.formation]?.region === region);

/** 戦闘なしで、航空の命令だけを当てて1段階を解く */
function airOnly(state: CampaignState, air: Record<string, CampaignAirOrder[]>) {
  const plan = assignAir(planStage(def, state, { blue: [], red: [] }), air);
  return resolveStage(def, state, plan, env);
}

describe("キャンペーンの航空隊", () => {
  it("読み込み:航空隊の基地は航空基地のある地域だけ", () => {
    const raw = json("campaigns/exercise-river.json");
    raw.airWings = [{ id: "w", side: "blue", name: "w", base: "south-farm", rangeKm: 50, fighters: 1, strike: 1 }];
    const r = CampaignDefSchema.safeParse(raw);
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues.map((i) => i.message).join("\n")).toContain("航空基地がありません");
  });

  it("命令:届く地域へだけ。航空基地への攻撃は敵の航空基地へ、戦闘に出るのは自陣営の出る戦闘へ", () => {
    const s = startCampaign(def, env, 1);
    expect(Object.keys(s.wings!)).toHaveLength(4);
    const plan = planStage(def, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] });
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-strike", mission: "units", region: "east-town" }], plan)).toEqual([]);
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-fighter", mission: "battle", region: "crossing" }], plan)).toEqual([]);
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-strike", mission: "airfield", region: "red-base" }], plan)).toEqual([]);
    // 基地を移るのは回航(航続距離の ferryFactor 倍まで届く)。敵の基地へは移れない
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-fighter", mission: "rebase", region: "red-base" }], plan)[0]).toContain("自陣営の航空基地ではありません");
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-strike", mission: "airfield", region: "west-town" }], plan)[0]).toContain("敵の航空基地ではありません");
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-fighter", mission: "units", region: "crossing" }], plan)[0]).toContain("攻撃機がありません");
    expect(checkAirOrders(def, s, "blue", [{ wing: "blue-strike", mission: "battle", region: "bridge" }], plan)[0]).toContain("戦闘がありません");
    expect(checkAirOrders(def, s, "blue", [{ wing: "red-strike", mission: "cap" }], plan)[0]).toContain("自陣営");
  });

  it("期待挙動:地域の敵部隊への攻撃で、敵の部隊は戦力と士気を失う。迎え撃つ戦闘機がいると、届く攻撃機が減って効き目も落ちる", () => {
    const s = startCampaign(def, env, 1);
    // 赤の戦闘機を基地を移して届かなくした場合(迎撃なし)
    const free = structuredClone(s);
    free.wings!["red-fighter"]!.base = "red-base";
    delete free.wings!["red-fighter"];
    const a = airOnly(free, { blue: [{ wing: "blue-strike", mission: "units", region: "east-town" }], red: [] });
    const b = airOnly(s, { blue: [{ wing: "blue-strike", mission: "units", region: "east-town" }], red: [] });
    const hitA = a.history[0]!.air!.find((x) => x.wing === "blue-strike")!;
    const hitB = b.history[0]!.air!.find((x) => x.wing === "blue-strike")!;
    expect(hitA.effect!.strength).toBeGreaterThan(0);
    expect(a.lost.red).toBeGreaterThan(0);
    const quiet = airOnly(free, { blue: [], red: [] });
    expect(hitA.effect!.morale).toBeGreaterThan(0);
    const total = (x: CampaignState) => power(x, "east-town").reduce((t, u) => t + u.strength, 0);
    expect(total(a)).toBeLessThan(total(quiet));
    expect(hitB.lost.strike + hitB.lost.fighters).toBeGreaterThan(hitA.lost.strike + hitA.lost.fighters);
    expect(hitB.effect!.strength!).toBeLessThan(hitA.effect!.strength!);
    expect(b.history[0]!.air!.some((x) => x.wing === "red-fighter" && x.mission === "cap" && (x.kills ?? 0) > 0)).toBe(true);
  });

  it("期待挙動:護衛の戦闘機があると、攻撃機の損害が減る", () => {
    const s = startCampaign(def, env, 1);
    const noEscort = structuredClone(s);
    noEscort.wings!["blue-strike"]!.fighters = 0;
    const a = airOnly(noEscort, { blue: [{ wing: "blue-strike", mission: "units", region: "east-town" }], red: [] });
    const b = airOnly(s, { blue: [{ wing: "blue-strike", mission: "units", region: "east-town" }], red: [] });
    const lostA = a.history[0]!.air!.find((x) => x.wing === "blue-strike")!.lost.strike;
    const lostB = b.history[0]!.air!.find((x) => x.wing === "blue-strike")!.lost.strike;
    expect(lostB).toBeLessThan(lostA);
  });

  it("期待挙動:補給への攻撃で、地域の敵部隊は携行備蓄を失い、その段階の補充が減る", () => {
    const s = startCampaign(def, env, 1);
    delete s.wings!["red-fighter"];
    s.units["red-1div-inf1"]!.strength = 0.5;
    const quiet = airOnly(s, { blue: [], red: [] });
    const hit = airOnly(s, { blue: [{ wing: "blue-strike", mission: "supply", region: "east-town" }], red: [] });
    expect(hit.units["red-1div-inf1"]!.strength).toBeLessThan(quiet.units["red-1div-inf1"]!.strength);
    expect(hit.units["red-1div-inf1"]!.ammo).toBeLessThan(1);
    expect(quiet.units["red-1div-inf1"]!.ammo).toBe(1);
  });

  it("期待挙動:航空基地への攻撃で、地上の敵の編隊が壊れ、その段階の補充もない", () => {
    const s = startCampaign(def, env, 1);
    s.wings!["red-strike"]!.strike = 2;
    const next = airOnly(s, { blue: [{ wing: "blue-strike", mission: "airfield", region: "red-base" }], red: [] });
    const r = next.history[0]!.air!.find((x) => x.wing === "blue-strike")!;
    expect(r.effect!.destroyed).toBeGreaterThan(0);
    // 壊された基地の航空隊は補充されない(攻撃がなければ 2 → 2.5)
    expect(next.wings!["red-strike"]!.strike).toBeLessThan(2);
    const quiet = airOnly(s, { blue: [], red: [] });
    expect(quiet.wings!["red-strike"]!.strike).toBeCloseTo(2.5);
  });

  it("期待挙動:戦闘に出た航空隊は、戦術の戦闘の航空戦力になり、戦闘で失った編隊を持ち帰る", () => {
    const s = startCampaign(def, env, 1);
    const plan = assignAir(planStage(def, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] }), {
      blue: [
        { wing: "blue-strike", mission: "battle", region: "crossing" },
        { wing: "blue-fighter", mission: "battle", region: "crossing" },
      ],
      red: [],
    });
    const b = plan.battles[0]!;
    expect(b.air).toEqual({ blue: ["blue-fighter", "blue-strike"] });
    const file = battleScenarioFile(def, s, b, env);
    const air = (file.rules as { air: Record<string, any> }).air;
    expect(air.blue.strike).toMatchObject({ groups: 3, weapon: "ground_attack_aircraft", count: 8 });
    expect(air.blue.fighters.groups).toBe(4);
    expect(air.red).toBeUndefined();
    expect(buildScenario(file, env.packs).ok).toBe(true);
    const units = [...b.sides.blue!.units, ...b.sides.red!.units];
    const outcome: BattleOutcome = {
      winner: null,
      level: "draw",
      played: true,
      units: Object.fromEntries(units.map((id) => [id, { strength: 0.9, morale: 0.9, ammo: 0.8, fuel: 0.9, fatigue: 0.2 }])),
      airGroups: { blue: { fighters: 2, attack: 1.5 } },
    };
    const next = resolveStage(def, s, plan, env, { [b.id]: outcome });
    // 攻撃機 3 → 1.5(半分)、戦闘機 4 → 2(半分)を、出た航空隊ごとに。補充 0.5 を足す
    expect(next.wings!["blue-strike"]!.strike).toBeCloseTo(1.5 + 0.5);
    expect(next.wings!["blue-fighter"]!.fighters).toBeCloseTo(1.5 + 0.5);
    expect(next.history[0]!.air!.filter((x) => x.mission === "battle").map((x) => x.wing).sort()).toEqual(["blue-fighter", "blue-strike"]);
  });

  it("期待挙動:基地を敵に取られた航空隊は、近い自陣営の航空基地へ移る。どこもなければ失われる", () => {
    const s = startCampaign(def, env, 1);
    s.control["blue-base"] = "red";
    s.formations["blue-2div"]!.region = "west-town";
    const next = airOnly(s, { blue: [], red: [] });
    expect(next.wings!["blue-strike"]!.base).toBe("west-town");
    expect(next.history[0]!.airUpkeep!.rebased).toContainEqual({ wing: "blue-strike", to: "west-town" });
    const s2 = startCampaign(def, env, 1);
    s2.control["red-base"] = "blue";
    s2.formations["red-2div"]!.region = "east-town";
    const next2 = airOnly(s2, { blue: [], red: [] });
    expect(next2.wings!["red-strike"]).toBeUndefined();
    expect(next2.history[0]!.airUpkeep!.destroyed).toContain("red-strike");
  });

  it("作戦の AI の航空の命令はどれも正しい。届く戦闘があれば攻撃機を出す", () => {
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] });
    for (const side of ["blue", "red"]) {
      const orders = campaignAirOrders(def, s, side, plan, env);
      expect(checkAirOrders(def, s, side, orders, plan)).toEqual([]);
      expect(orders.find((o) => o.wing === `${side}-strike`)).toMatchObject({ mission: "battle", region: "crossing" });
      expect(orders.find((o) => o.wing === `${side}-fighter`)).toMatchObject({ mission: "cap" });
    }
  });

  it("進み具合:航空隊があれば、戦闘を選ぶ前に航空の命令を確定する。相手の航空の命令は確定するまで見せない", () => {
    const r = newSnapshot(def, env, "blue", 3);
    if (!r.ok) throw new Error(r.errors.join());
    const o = commitOrders(def, env, r.value, [{ formation: "blue-1div", to: "crossing" }]);
    if (!o.ok) throw new Error(o.errors.join());
    const battle = snapshotPlan(def, o.value, env)!.battles.find((b) => b.sides.blue!.units.length > 0);
    if (battle) {
      const c = chooseBattle(def, env, o.value, battle.id);
      expect(c.ok ? "" : c.errors[0]).toContain("航空の命令");
    }
    const a = commitAir(def, env, o.value, [{ wing: "blue-strike", mission: "units", region: "east-town" }]);
    if (!a.ok) throw new Error(a.errors.join());
    expect(commitAir(def, env, a.value, []).ok).toBe(false);
    expect(snapshotPlan(def, a.value, env)!.air!.blue).toEqual([{ wing: "blue-strike", mission: "units", region: "east-town" }]);
  });

  it("戦闘に航空隊の出た戦闘を、AI 同士で最後まで解ける(編隊の損耗を持ち帰る)", () => {
    const s = startCampaign(def, env, 2);
    const plan = assignAir(planStage(def, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] }), {
      blue: [{ wing: "blue-strike", mission: "battle", region: "crossing" }],
      red: [{ wing: "red-fighter", mission: "battle", region: "crossing" }],
    });
    const out = autoResolve(def, s, plan.battles[0]!, env);
    expect(out.airGroups?.blue?.attack).toBeLessThanOrEqual(3);
    expect(out.airGroups?.red?.fighters).toBeLessThanOrEqual(3);
  }, 60_000);
});

describe("戦闘に出した航空隊を航空司令部として渡す(rules.air.airOps)", () => {
  const opsDef = airDef((raw) => {
    raw.rules = { air: { airOps: { aircraftPerGroup: { fighter: 4, strike: 8 }, fighterToe: "gen_air_fighter", strikeToe: "gen_air_fighter_bomber" } } };
  });
  const sent = (share?: number) => {
    const s = startCampaign(opsDef, env, 1);
    const plan = assignAir(planStage(opsDef, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] }), {
      blue: [
        { wing: "blue-strike", mission: "battle", region: "crossing", ...(share !== undefined ? { share } : {}) },
        { wing: "blue-fighter", mission: "battle", region: "crossing" },
      ],
      red: [],
    });
    return { s, plan, b: plan.battles[0]! };
  };

  it("期待挙動:出す割合だけの機数で、航空隊の基地から戦場までの距離の航空司令部になる(前の仕組みの航空戦力にはしない)", () => {
    const { s, b } = sent(0.5);
    expect(b.airShare).toEqual({ "blue-strike": 0.5 });
    const file = battleScenarioFile(opsDef, s, b, env);
    const rules = file.rules as { air?: Record<string, unknown>; airForces: any[] };
    expect(rules.air?.["blue"]).toBeUndefined();
    const f = rules.airForces.find((x) => x.side === "blue");
    expect(f.squadrons.map((q: any) => [q.id, q.aircraft])).toEqual([
      ["blue-fighter-f", 12],
      ["blue-strike-f", 2],
      ["blue-strike-s", 12],
    ]);
    const base = opsDef.regions["blue-base"]!;
    const at = opsDef.regions["crossing"]!;
    expect(f.bases[0].distanceM).toBe(Math.round(Math.hypot(base.x - at.x, base.y - at.y) * 1000));
    expect((file.packs as { toe: string[] }).toe).toContain("air-generic");
    const sc = buildScenario(file, env.packs);
    expect(sc.ok).toBe(true);
    // 戦術の戦闘では、渡した機数のまま(割合は機数に掛けてあるので、運の幅はない)
    if (sc.ok) expect(sc.value.start(3).airOps!["camp-blue"]!.squadrons["blue-strike-s"]!.aircraft).toBe(12);
  });

  it("期待挙動:戦術の戦闘で失った機は、編隊の数に直して航空隊から引く。出さなかった分は失わない", () => {
    const { s, plan, b } = sent(0.5);
    const units = [...b.sides.blue!.units, ...b.sides.red!.units];
    const outcome: BattleOutcome = {
      winner: null,
      level: "draw",
      played: true,
      units: Object.fromEntries(units.map((id) => [id, { strength: 0.9, morale: 0.9, ammo: 0.8, fuel: 0.9, fatigue: 0.2 }])),
      airLosses: { "camp-blue:blue-strike-s": 8, "camp-blue:blue-fighter-f": 2 },
    };
    const next = resolveStage(opsDef, s, plan, env, { [b.id]: outcome });
    // 攻撃機 3 → 3 - 8/8 = 2、戦闘機 3 → 3 - 2/4 = 2.5。補充 0.5 を足す(始めの数まで)
    expect(next.wings!["blue-strike"]!.strike).toBeCloseTo(2 + 0.5);
    expect(next.wings!["blue-fighter"]!.fighters).toBeCloseTo(3);
    const rep = next.history[0]!.air!.find((x) => x.wing === "blue-strike")!;
    expect(rep.sent.strike).toBeCloseTo(1.5);
    expect(rep.lost.strike).toBeCloseTo(1);
  });

  it("出す割合は、戦闘に出すときだけ 0〜1 で書ける", () => {
    const s = startCampaign(opsDef, env, 1);
    const plan = planStage(opsDef, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] });
    expect(checkAirOrders(opsDef, s, "blue", [{ wing: "blue-strike", mission: "battle", region: "crossing", share: 0.25 }], plan)).toEqual([]);
    expect(checkAirOrders(opsDef, s, "blue", [{ wing: "blue-strike", mission: "battle", region: "crossing", share: 1.5 }], plan)[0]).toContain("割合");
    expect(checkAirOrders(opsDef, s, "blue", [{ wing: "blue-fighter", mission: "cap", share: 0.5 }], plan)[0]).toContain("割合");
  });

  it("AI 同士で解いても、航空司令部の損耗が航空隊に戻る", () => {
    const { s, plan, b } = sent();
    const outcome = autoResolve(opsDef, s, b, env);
    const next = resolveStage(opsDef, s, plan, env, { [b.id]: outcome });
    const lost = Object.values(outcome.airLosses ?? {}).reduce((a, x) => a + x, 0);
    const rep = next.history[0]!.air!.filter((x) => x.mission === "battle");
    expect(rep.length).toBe(2);
    expect(rep.reduce((t, r) => t + r.lost.fighters * 4 + r.lost.strike * 8, 0)).toBeCloseTo(lost, 1);
  }, 120000);
});

describe("キャンペーンの天候の予定", () => {
  const fogDef = airDef((raw) => {
    raw.weather = [
      { stage: 1, weather: "fog" },
      { stage: 2, weather: "clear" },
    ];
  });

  it("期待挙動:飛べない天候の段階は、戦略の航空任務が出ず、戦術の戦闘もその天候で始まる。晴れれば出る", () => {
    const s = startCampaign(fogDef, env, 1);
    const orders = { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] };
    const air = { blue: [{ wing: "blue-strike", mission: "units" as const, region: "red-base" }], red: [] };
    const plan = assignAir(planStage(fogDef, s, orders), air);
    const file = battleScenarioFile(fogDef, s, plan.battles[0]!, env);
    expect((file.rules as { weather: { initial: string } }).weather.initial).toBe("fog");
    const foggy = resolveStage(fogDef, s, assignAir(planStage(fogDef, s, { blue: [], red: [] }), air), env);
    expect(foggy.history[0]!.air ?? []).toEqual([]);
    // 2段階目は晴れ:同じ命令で攻撃が出る
    const clear = resolveStage(fogDef, { ...foggy }, assignAir(planStage(fogDef, foggy, { blue: [], red: [] }), air), env);
    expect(clear.history.at(-1)!.air!.some((a) => a.mission === "units")).toBe(true);
  });
});
