import { describe, expect, it } from "vitest";
import { buildScenario, distance, resolveTurn, type GameState, type LoadedScenario, type SeaOrder, type SimContext, type TurnResult } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
type Formation = { name?: string; side: string; parent?: string; units: string[] };
type File = { units: { id: string; x: number; y: number; facing: number }[]; formations: Record<string, Formation>; rules: Record<string, unknown> };
function load(edit: (f: File) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as File;
  file.rules.knownAtStart = [];
  edit(file);
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
const fixed = (ctx: SimContext, turnSeconds?: number): SimContext => ({ ...ctx, ...(turnSeconds ? { turnSeconds } : {}), rules: { ...ctx.rules, naval: { ...ctx.rules.naval!, turn: undefined } } });
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
/** 東の艦隊は止めておく(撃たない) */
const holdEast: SeaOrder[] = [
  { squadron: "e-cvg", speed: "stop", fire: "hold" },
  { squadron: "e-crudiv", speed: "stop", fire: "hold" },
];
function run(s: GameState, ctx: SimContext, orders: SeaOrder[], turns = 1): { state: GameState; results: TurnResult[] } {
  const results: TurnResult[] = [];
  let st = s;
  for (let i = 0; i < turns; i++) {
    const r = resolveTurn(st, [], ctx, [], i === 0 ? [...holdEast, ...orders] : holdEast);
    results.push(r);
    st = r.state;
  }
  return { state: st, results };
}

describe("任務部隊", () => {
  it("2つ以上の戦隊を隷下に持つ上級部隊が任務部隊になり、配備を命じるまで持ち場はない", () => {
    const sc = load();
    const s = sc.start(1);
    expect(Object.keys(s.taskForces ?? {})).toEqual(["e-tf", "w-tf"]);
    expect(s.taskForces!["w-tf"]!.members).toEqual({});
  });

  it("期待挙動:単縦の戦列を命じると、隷下の戦隊が基準の戦隊の後ろにつながる", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    const { state } = run(sc.start(1), ctx, [{ squadron: "w-tf", disposition: "battle_line", guide: "w-crudiv", course: 0, speed: "slow" }], 4);
    expect(state.squadrons!["w-cvg"]!.follow).toBe("w-crudiv");
    // 空母の群の先頭は、巡洋艦の戦隊の最後の艦の後ろ数 km に追いついている(始めは 6km 以上離れていた)
    const tail = unit(state, "w-dd8");
    expect(distance(unit(state, "w-cv").pos, tail.pos)).toBeLessThan(4000);
  });

  it("期待挙動:警戒航行序列を命じると、隷下の戦隊が基準の戦隊からの持ち場(空母は後ろ 3km)につき、同じ針路で進む", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    const { state } = run(sc.start(1), ctx, [{ squadron: "w-tf", disposition: "cruising", guide: "w-crudiv", course: 90, speed: "cruise" }], 4);
    const tf = state.taskForces!["w-tf"]!;
    expect(tf.members["w-cvg"]?.role).toBe("carrier");
    const ca = unit(state, "w-ca1");
    // 持ち場:針路 90° から見て真後ろ 3km
    const spot = { x: ca.pos.x - 3000, y: ca.pos.y };
    expect(distance(unit(state, "w-cv").pos, spot)).toBeLessThan(1500);
    expect(Math.abs(unit(state, "w-cv").facing - 90)).toBeLessThan(20);
  });

  it("期待挙動:配備の信号は旗旒なら3分かかり、届くまで隷下は前のまま。艦隊無線ならすぐ届く", () => {
    const flag = load();
    const ctx = fixed(flag.ctx, 120);
    const r1 = run(flag.start(1), ctx, [{ squadron: "w-tf", disposition: "cruising" }]).state;
    expect(r1.taskForces!["w-tf"]!.members).toEqual({});
    const r2 = run(r1, ctx, []).state;
    // 基準の戦隊を書かなければ、隷下の最初の戦隊(空母の群)が基準になる
    expect(Object.keys(r2.taskForces!["w-tf"]!.members)).toEqual(["w-crudiv"]);
    const radio = load((f) => {
      f.rules.navalSignals = { w: { radio: true } };
    });
    const r3 = run(radio.start(1), fixed(radio.ctx, 120), [{ squadron: "w-tf", disposition: "cruising" }]).state;
    expect(Object.keys(r3.taskForces!["w-tf"]!.members)).toEqual(["w-crudiv"]);
  });

  it("期待挙動:寄り合いの艦隊は夜の信号がいちばん遅い(旗旒3分 × 夜2 × 寄り合い3)", async () => {
    const { signalDelaySec } = await import("../src/index.js");
    const sc = load((f) => {
      f.rules.navalSignals = { w: { mixed: true }, e: { radio: true } };
    });
    expect(signalDelaySec("w", true, sc.ctx)).toBe(1080);
    expect(signalDelaySec("e", false, sc.ctx)).toBe(30);
  });

  it("期待挙動:持ち場の戦隊に個別に針路を命じると持ち場を外れ、join で戻る", () => {
    const sc = load((f) => {
      f.rules.navalSignals = { w: { radio: true } };
    });
    const ctx = fixed(sc.ctx);
    let { state } = run(sc.start(1), ctx, [{ squadron: "w-tf", disposition: "cruising", guide: "w-crudiv" }]);
    expect(state.squadrons!["w-cvg"]!.station).toBeDefined();
    state = run(state, ctx, [{ squadron: "w-cvg", course: 180 }]).state;
    expect(state.taskForces!["w-tf"]!.members["w-cvg"]).toBeUndefined();
    expect(state.squadrons!["w-cvg"]!.station).toBeUndefined();
    state = run(state, ctx, [{ squadron: "w-tf", join: ["w-cvg"] }]).state;
    expect(state.taskForces!["w-tf"]!.members["w-cvg"]).toBeDefined();
  });

  it("任務部隊への命令の誤りは弾く(隷下でない基準の戦隊・ない配備・ない役割)", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    const r = resolveTurn(sc.start(1), [], ctx, [], [
      { squadron: "w-tf", guide: "e-crudiv" },
      { squadron: "w-tf", disposition: "nope" },
      { squadron: "w-tf", roles: { "w-cvg": "nope" } },
    ]);
    expect(r.rejectedSeaOrders?.length).toBe(3);
  });

  it("期待挙動:水雷戦隊の役割の戦隊は、敵の艦が見えると持ち場を離れて雷撃し、撃ち終えると持ち場へ戻る", () => {
    // 巡洋艦の戦隊の駆逐艦を水雷戦隊に分け、東の巡洋艦の戦隊を 25km 東に置く
    const sc = load((f) => {
      f.formations["w-crudiv"]!.units = ["w-ca1", "w-ca2"];
      f.formations["w-desron"] = { name: "水雷戦隊", side: "w", parent: "w-tf", units: ["w-dd5", "w-dd6", "w-dd7", "w-dd8"] };
      for (const u of f.units) if (/^e-(ca|dd[5-8])/.test(u.id)) u.x -= 94000;
      f.rules.navalSignals = { w: { radio: true } };
    });
    const ctx = fixed(sc.ctx);
    const { results } = run(sc.start(1), ctx, [{ squadron: "w-tf", disposition: "night_battle", guide: "w-crudiv", course: 90, speed: "battle", fire: "hold" }], 6);
    const events = results.flatMap((r) => r.events);
    const sortie = events.find((e) => e.type === "tfSortie");
    expect(sortie && "squadron" in sortie ? sortie.squadron : undefined).toBe("w-desron");
    // 突撃の後に、水雷戦隊の駆逐艦が魚雷を撃った
    const desron = new Set(["w-dd5", "w-dd6", "w-dd7", "w-dd8"]);
    expect(events.some((e) => e.type === "torpedoLaunched" && desron.has(e.unitId) && e.t >= sortie!.t)).toBe(true);
    expect(events.some((e) => e.type === "tfReturn")).toBe(true);
  });
});
