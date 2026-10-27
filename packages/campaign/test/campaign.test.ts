import { readFileSync } from "node:fs";
import { BiomePackSchema, GeneratorDataSchema } from "@brigade/generator";
import { describe, expect, it } from "vitest";
import { loadPacks } from "../../sim-core/test/helpers.js";
import {
  battleScenario,
  campaignOrders,
  CampaignDefSchema,
  advanceSnapshot,
  checkOrders,
  checkSnapshot,
  chooseBattle,
  commitOrders,
  newSnapshot,
  playedScenario,
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
const def = CampaignDefSchema.parse(json("campaigns/exercise-river.json"));
/** 勝った側の全部隊を無傷、負けた側の全部隊を戦力半分にした決着(AI 同士で解かずに結果の反映を確かめる) */
const fake = (winner: string | null, level: BattleOutcome["level"], units: string[], loserSide: (id: string) => boolean): BattleOutcome => ({
  winner,
  level,
  played: true,
  units: Object.fromEntries(units.map((id) => [id, { strength: loserSide(id) ? 0.5 : 1, morale: 0.8, ammo: 0.7, fuel: 0.8, fatigue: 0.3 }])),
});

describe("キャンペーンの土台", () => {
  it("読み込みで誤りを知らせる(ない地域・陣営・重複した部隊)", () => {
    const bad = json("campaigns/exercise-river.json");
    bad.links.push({ a: "west-town", b: "nowhere" });
    bad.formations[0].units.push({ id: "red-1div-inf1", toe: "infantry_regiment" });
    const r = CampaignDefSchema.safeParse(bad);
    expect(r.success).toBe(false);
    const text = r.success ? "" : r.error.issues.map((i) => i.message).join("\n");
    expect(text).toContain('地域 "nowhere" がありません');
    expect(text).toContain('部隊の ID "red-1div-inf1" が重複しています');
  });

  it("始めの状態:部隊ごとの状態と、陣営の総戦力", () => {
    const s = startCampaign(def, env, 1);
    expect(s.stage).toBe(1);
    expect(Object.keys(s.units)).toHaveLength(18);
    expect(s.units["blue-1div-inf1"]).toMatchObject({ strength: 1, training: "regular", xp: 0 });
    expect(s.forceTotals.blue).toBeGreaterThan(0);
  });

  it("命令はつながった地域へだけ。相手の師団・旅団には出せない", () => {
    const s = startCampaign(def, env, 1);
    expect(checkOrders(def, s, "blue", [{ formation: "blue-1div", to: "crossing" }])).toEqual([]);
    expect(checkOrders(def, s, "blue", [{ formation: "blue-1div", to: "red-base" }])[0]).toContain("つながっていない");
    expect(checkOrders(def, s, "blue", [{ formation: "red-1div", to: "crossing" }])[0]).toContain("自陣営");
  });

  it("同じ地域に両陣営が入れば戦闘。もとからいた側が守り、入ってきた側が攻める。片方だけなら戦わずに取る", () => {
    const s = startCampaign(def, env, 1);
    const plan = planStage(def, s, {
      blue: [
        { formation: "blue-1div", to: "crossing" },
        { formation: "blue-armd", to: "bridge" },
      ],
      red: [{ formation: "red-1div", to: "crossing" }],
    });
    expect(plan.battles.map((b) => [b.region, b.mission, b.attacker])).toEqual([["crossing", "encounter", null]]);
    expect(plan.captures).toEqual([{ region: "bridge", side: "blue" }]);
    const attack = planStage(def, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [] });
    expect(attack.battles).toEqual([]);
    const assault = planStage(def, { ...s, formations: { ...s.formations, "blue-1div": { side: "blue", region: "crossing" } }, control: { ...s.control, crossing: "blue" } }, {
      blue: [],
      red: [{ formation: "red-1div", to: "crossing" }],
    });
    expect(assault.battles[0]).toMatchObject({ region: "crossing", mission: "attack-defense", attacker: "red" });
  });

  it("戦闘の戦術シナリオは、地域の地形の傾向で作られ、出る部隊は持ち越した戦力のまま置かれる", () => {
    const s = startCampaign(def, env, 1);
    s.units["blue-1div-inf1"]!.strength = 0.6;
    s.units["blue-1div-inf1"]!.training = "veteran";
    const plan = planStage(def, s, { blue: [{ formation: "blue-1div", to: "crossing" }], red: [{ formation: "red-1div", to: "crossing" }] });
    const sc = battleScenario(def, s, plan.battles[0]!, env);
    expect(sc.def.id).toBe("camp:exercise-river:1:crossing");
    const u = sc.units.find((x) => x.id === "blue-1div-inf1")!;
    expect(u.strength).toBeCloseTo(0.6);
    expect(u.training).toBe("veteran");
    expect(sc.units.filter((x) => x.side === "red").map((x) => x.id).sort()).toEqual(["red-1div-art", "red-1div-inf1", "red-1div-inf2"]);
  });

  it("期待挙動:攻めた側が決定的に勝つと地域を取り、負けた側は戦力をさらに失って下がる。勝った部隊は経験を積む", () => {
    const s0 = startCampaign(def, env, 1);
    const s = { ...s0, formations: { ...s0.formations, "blue-1div": { side: "blue", region: "crossing" } }, control: { ...s0.control, crossing: "blue" } };
    const plan = planStage(def, s, { blue: [], red: [{ formation: "red-1div", to: "crossing" }] });
    const b = plan.battles[0]!;
    const all = [...b.sides.blue!.units, ...b.sides.red!.units];
    const next = resolveStage(def, s, plan, env, { [b.id]: fake("red", "decisive", all, (id) => id.startsWith("blue")) });
    expect(next.control.crossing).toBe("red");
    expect(next.formations["red-1div"]!.region).toBe("crossing");
    expect(next.formations["blue-1div"]!.region).toBe("west-town");
    // 決定的に負けた:戦力0.5 × (1 − 0.1) に、補給の届く地域での補充 0.05
    expect(next.units["blue-1div-inf1"]!.strength).toBeCloseTo(0.5 * 0.9 + 0.05);
    expect(next.units["red-1div-inf1"]!.xp).toBe(2);
    expect(next.history[0]!.battles[0]).toMatchObject({ region: "crossing", winner: "red", level: "decisive", played: true });
    expect(next.stage).toBe(2);
  });

  it("期待挙動:攻めた側が勝てなければ、元の地域へ戻る", () => {
    const s0 = startCampaign(def, env, 1);
    const s = { ...s0, formations: { ...s0.formations, "blue-1div": { side: "blue", region: "crossing" } }, control: { ...s0.control, crossing: "blue" } };
    const plan = planStage(def, s, { blue: [], red: [{ formation: "red-1div", to: "crossing" }] });
    const b = plan.battles[0]!;
    const next = resolveStage(def, s, plan, env, { [b.id]: fake("blue", "limited", [...b.sides.blue!.units, ...b.sides.red!.units], (id) => id.startsWith("red")) });
    expect(next.control.crossing).toBe("blue");
    expect(next.formations["red-1div"]!.region).toBe("east-town");
  });

  it("期待挙動:下がる先(自陣営の、敵のいない隣の地域)がなければ、包囲されて壊滅する", () => {
    const s0 = startCampaign(def, env, 1);
    // 青の第1師団が渡河点にいて、隣の西の町・橋はどちらも赤のもの
    const s = { ...s0, formations: { ...s0.formations, "blue-1div": { side: "blue", region: "crossing" } }, control: { ...s0.control, crossing: "blue", "west-town": "red", bridge: "red" } };
    const plan = planStage(def, s, { blue: [], red: [{ formation: "red-1div", to: "crossing" }] });
    const b = plan.battles[0]!;
    const next = resolveStage(def, s, plan, env, { [b.id]: fake("red", "limited", [...b.sides.blue!.units, ...b.sides.red!.units], (id) => id.startsWith("blue")) });
    expect(next.formations["blue-1div"]).toBeUndefined();
    expect(next.units["blue-1div-inf1"]).toBeUndefined();
    expect(next.history[0]!.destroyed).toEqual(["blue-1div"]);
  });

  it("期待挙動:補給の源から自陣営の地域をたどって届かない部隊は、補充されず携行備蓄が減る", () => {
    const s0 = startCampaign(def, env, 1);
    // 西の町を孤立させる(鉄道終点・南の農場を赤が持つ)
    const s = {
      ...s0,
      control: { ...s0.control, "blue-base": "red", "south-farm": "red" },
      formations: { ...s0.formations, "blue-2div": { side: "blue", region: "west-town" }, "blue-armd": { side: "blue", region: "west-town" } },
    };
    expect(suppliedRegions(def, s, "blue").has("west-town")).toBe(false);
    s.units["blue-1div-inf1"]!.strength = 0.7;
    const next = resolveStage(def, s, planStage(def, s, { blue: [], red: [] }), env);
    expect(next.units["blue-1div-inf1"]!.strength).toBeCloseTo(0.7);
    expect(next.units["blue-1div-inf1"]!.ammo).toBeCloseTo(0.7);
  });

  it("作戦の AI の命令はどれも正しく、最後の段階を解くと勝敗が出る(AI 同士・2段階)", () => {
    const short = { ...def, calendar: { ...def.calendar, stages: 2 } };
    let s = startCampaign(short, env, 3);
    while (!s.result) {
      const orders = { blue: campaignOrders(short, s, "blue", env), red: campaignOrders(short, s, "red", env) };
      for (const [side, list] of Object.entries(orders)) expect(checkOrders(short, s, side, list)).toEqual([]);
      s = resolveStage(short, s, planStage(short, s, orders), env);
    }
    expect(s.history).toHaveLength(2);
    expect(["decisive", "limited", "draw"]).toContain(s.result.level);
  }, 300000);

  it("進み具合(セーブデータ):命令は1段階に1度だけ確定、指揮する戦闘は1つ、指揮した戦闘の結果を使って次の段階へ", () => {
    const r = newSnapshot(def, env, "blue", 5);
    if (!r.ok) throw new Error(r.errors.join());
    expect(chooseBattle(def, env, r.value, "s1-crossing").ok).toBe(false);
    const c = commitOrders(def, env, r.value, [{ formation: "blue-1div", to: "crossing" }]);
    if (!c.ok) throw new Error(c.errors.join());
    expect(commitOrders(def, env, c.value, []).ok).toBe(false);
    expect(commitOrders(def, env, r.value, [{ formation: "blue-1div", to: "crossing" }, { formation: "blue-1div", to: "west-town" }]).ok).toBe(false);
    const b = chooseBattle(def, env, c.value, "s1-crossing");
    if (!b.ok) throw new Error(b.errors.join());
    expect(checkSnapshot(def, env, b.value)).toEqual([]);
    // 戦術シナリオの ID は状態ごとに違う(同じ状態なら同じ)
    const sc = playedScenario(def, env, b.value)!;
    expect(sc.def.id).toMatch(/^camp:exercise-river:1:crossing:[0-9a-f]{12}$/);
    expect(playedScenario(def, env, b.value)!.def.id).toBe(sc.def.id);
    // 指揮した戦闘で青が決定的に勝った
    const units = sc.units.map((u) => u.id);
    const a = advanceSnapshot(def, env, b.value, fake("blue", "decisive", units, (id) => id.startsWith("red")));
    if (!a.ok) throw new Error(a.errors.join());
    expect(a.value.report.battles[0]).toMatchObject({ id: "s1-crossing", winner: "blue", played: true });
    expect(a.value.snapshot.state.control.crossing).toBe("blue");
    expect(a.value.snapshot.orders).toBeUndefined();
    expect(a.value.snapshot.battleId).toBeUndefined();
    // 書き換えた記録(相手の師団への命令)は弾く
    expect(checkSnapshot(def, env, { ...r.value, orders: [{ formation: "red-1div", to: "crossing" }] })[0]).toContain("自陣営");
  });

  it("期待挙動:増援はその段階の始めに着く。着く地域が敵の手にあれば補給の源へ。着くまでは総戦力に入れない", () => {
    const withReinf = CampaignDefSchema.parse({
      ...json("campaigns/exercise-river.json"),
      formations: [
        ...json("campaigns/exercise-river.json").formations,
        { id: "blue-3div", side: "blue", name: "第3歩兵師団", region: "west-town", arriveStage: 2, units: [{ id: "blue-3div-inf1", toe: "infantry_regiment" }] },
      ],
    });
    const s = startCampaign(withReinf, env, 1);
    expect(s.formations["blue-3div"]).toBeUndefined();
    const total = s.forceTotals.blue!;
    const next = resolveStage(withReinf, s, planStage(withReinf, s, { blue: [], red: [] }), env);
    expect(next.formations["blue-3div"]).toEqual({ side: "blue", region: "west-town" });
    expect(next.forceTotals.blue!).toBeGreaterThan(total);
    expect(next.history[0]!.arrivals).toEqual([{ formation: "blue-3div", region: "west-town" }]);
    // 西の町が赤の手にあれば、青の鉄道終点へ
    const lost = resolveStage(withReinf, { ...s, control: { ...s.control, "west-town": "red" } }, planStage(withReinf, s, { blue: [], red: [] }), env);
    expect(lost.formations["blue-3div"]!.region).toBe("blue-base");
  });

  it("マレー作戦(史実 v0):読み込めて、増援は後から着き、両陣営の作戦の AI の命令が正しい", () => {
    const malaya = CampaignDefSchema.parse(json("campaigns/malaya-1941.json"));
    expect(malaya.calendar).toMatchObject({ startDate: "1941-12-08", daysPerStage: 5, stages: 14 });
    expect(malaya.historicalOutcome).toMatchObject({ winner: "jp", level: "decisive" });
    const s = startCampaign(malaya, env, 1);
    expect(s.formations["jp-5div"]).toEqual({ side: "jp", region: "singora" });
    // 第45インド旅団(1月3日にシンガポール)は始めにはいない
    expect(s.formations["uk-45bde"]).toBeUndefined();
    expect(malaya.formations.find((f) => f.id === "uk-45bde")!.arriveStage).toBe(6);
    for (const side of ["jp", "uk"]) expect(checkOrders(malaya, s, side, campaignOrders(malaya, s, side, env))).toEqual([]);
    // 第5師団はジットラへ攻める(シンゴラの隣の敵はジットラだけで、攻めれば足止めできる)
    expect(campaignOrders(malaya, s, "jp", env)).toContainEqual({ formation: "jp-5div", to: "jitra" });
  });

  it("青作戦 第1段階(史実 v0):読み込めて、ソ連の予備の軍は後から着き、両陣営の作戦の AI の命令が正しい", () => {
    const blau = CampaignDefSchema.parse(json("campaigns/blau-1942.json"));
    expect(blau.calendar).toMatchObject({ startDate: "1942-06-28", daysPerStage: 3, stages: 9 });
    expect(blau.historicalOutcome).toMatchObject({ winner: "de", level: "limited" });
    const s = startCampaign(blau, env, 1);
    expect(s.formations["de-48pzk"]).toEqual({ side: "de", region: "kursk" });
    expect(s.formations["su-62a"]).toBeUndefined();
    // ソ連の狙撃兵師団は充足率6割
    expect(s.units["su-40a-r1"]!.strength).toBeCloseTo(0.6);
    for (const side of ["de", "su"]) expect(checkOrders(blau, s, side, campaignOrders(blau, s, side, env))).toEqual([]);
  });
});
