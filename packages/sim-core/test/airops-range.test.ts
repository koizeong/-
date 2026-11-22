import { describe, expect, it } from "vitest";
import { availableAircraft, buildScenario, cycleMinutes, Rng, sortiesPerAircraftPerDay, stepFlights, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/** 左右対称の試験シナリオに、両陣営の航空司令部を足す(基地までの距離・飛行隊の行動半径を選べる) */
function load(distM: { a: number; b: number }, fighterRadiusM?: number, warningMinutes?: number): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-symmetric")) as { packs: { weapons: string | string[]; toe: string | string[] }; sides: { id: string }[]; rules: Record<string, unknown> };
  const arr = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
  file.packs.weapons = [...arr(file.packs.weapons), "air-generic"];
  file.packs.toe = [...arr(file.packs.toe), "air-generic"];
  file.rules.airForces = file.sides.map((s, i) => ({
    id: `${s.id}-af`,
    side: s.id,
    name: `${s.id} の航空軍団`,
    bases: [{ id: "b1", name: "基地", distanceM: i === 0 ? distM.a : distM.b }],
    ...(warningMinutes !== undefined ? { warningMinutes } : {}),
    squadrons: [
      { id: "fg", name: "戦闘機隊", toe: "gen_air_fighter", base: "b1", aircraft: 8, ...(fighterRadiusM ? { radiusM: fighterRadiusM } : {}) },
      { id: "fb", name: "戦闘爆撃機隊", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 16 },
    ],
  }));
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("航空司令部:基地までの距離と行動半径(ユーザー判断)", () => {
  it("期待挙動:基地が行動半径の外の飛行隊は出せない。飛行隊の radiusM で行動半径を書き換えられる", () => {
    const far = load({ a: 400000, b: 60000 });
    const force = far.ctx.scenario.airForces[0]!;
    const st = far.start(1).airOps![force.id]!;
    // 汎用の戦闘機の行動半径は 300km、戦闘爆撃機は 250km
    expect(availableAircraft(force, st, "fg", 0, far.ctx)).toBe(0);
    expect(availableAircraft(force, st, "fb", 0, far.ctx)).toBe(0);
    const longLegs = load({ a: 400000, b: 60000 }, 1040000);
    const f2 = longLegs.ctx.scenario.airForces[0]!;
    expect(availableAircraft(f2, longLegs.start(1).airOps![f2.id]!, "fg", 0, longLegs.ctx)).toBeGreaterThan(0);
  });

  it("期待挙動:行動半径に近い基地から来た編隊は、戦場の上にいられる時間が短い", () => {
    const near = load({ a: 60000, b: 60000 });
    const edge = load({ a: 240000, b: 60000 });
    const sn = cycleMinutes(near.ctx.scenario.airForces[0]!, "fb", near.ctx).station;
    const se = cycleMinutes(edge.ctx.scenario.airForces[0]!, "fb", edge.ctx).station;
    expect(se).toBeLessThan(sn * 0.5);
  });

  it("期待挙動:遠い基地ほど、1機が1日に出られる回数が少ない(往復の時間)", () => {
    const sc = load({ a: 60000, b: 60000 }, 3000000);
    const far = load({ a: 1000000, b: 60000 }, 3000000);
    expect(sortiesPerAircraftPerDay(far.ctx.scenario.airForces[0]!, "fg", far.ctx)).toBeLessThan(sortiesPerAircraftPerDay(sc.ctx.scenario.airForces[0]!, "fg", sc.ctx));
  });

  it("期待挙動:武装偵察は1日に散らす。朝のターンに出るのは、その日の分の一部だけ", () => {
    const sc = load({ a: 60000, b: 60000 });
    const s = sc.start(1);
    const ops = structuredClone(s.airOps!);
    stepFlights(ops, s.units, structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(1));
    const force = sc.ctx.scenario.airForces[0]!;
    const st = ops[force.id]!;
    const out = st.sorties.filter((x) => x.mission === "armedRecon").reduce((n, x) => n + x.aircraft, 0);
    const perDay = Math.floor(16 * 0.5 * sortiesPerAircraftPerDay(force, "fb", sc.ctx));
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(perDay);
  });

  it("期待挙動:戦闘機は、敵の編隊が戦場を離れる前に着ける基地からだけ迎え撃つ(遠い基地の戦闘機は飛び立たない)", () => {
    const scramble = (dist: number) => {
      const sc = load({ a: 60000, b: dist }, 3000000, 60);
      const s = sc.start(1);
      const ops = structuredClone(s.airOps!);
      const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];
      // a の攻撃の編隊を、b の地上の部隊の上に置く(すぐに離れる)
      const enemy = s.units.find((u) => u.side === b)!;
      ops[`${a}-af`]!.flights = [{ id: "x1", force: `${a}-af`, side: a, squadron: "fb", toe: "gen_air_fighter_bomber", mission: "support", aircraft: 4, pos: { ...enemy.pos }, entry: { x: 0, y: enemy.pos.y }, station: { ...enemy.pos }, phase: "station", onStationSec: s.time, offStationSec: s.time + 600 }];
      const res = stepFlights(ops, s.units, structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(1));
      return res.events.some((e) => e.side === b && e.type === "airScramble");
    };
    expect(scramble(20000)).toBe(true);
    expect(scramble(600000)).toBe(false);
  });
});
