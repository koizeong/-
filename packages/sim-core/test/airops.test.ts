import { describe, expect, it } from "vitest";
import { apportion, buildScenario, cycleMinutes, resolveTurn, viewForSide, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/** 左右対称の試験シナリオに、両陣営の航空司令部を足す(基地までの距離・機数は試験の値) */
function load(edit: (forces: Record<string, unknown>[]) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-symmetric")) as { packs: { weapons: string | string[]; toe: string | string[] }; sides: { id: string }[]; rules: Record<string, unknown> };
  const arr = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
  file.packs.weapons = [...arr(file.packs.weapons), "air-generic"];
  file.packs.toe = [...arr(file.packs.toe), "air-generic"];
  const [a, b] = file.sides.map((s) => s.id);
  const force = (side: string, distanceM: number) => ({
    id: `${side}-af`,
    side,
    name: `${side} の航空軍団`,
    doctrine: { weights: { patrol: 2, escort: 1, cover: 1, onCall: 2, interdiction: 1, armedRecon: 1, recon: 1 } },
    bases: [{ id: "b1", name: "基地", distanceM }],
    squadrons: [
      { id: "fg", name: "戦闘機隊", toe: "gen_air_fighter", base: "b1", aircraft: 16 },
      { id: "fb", name: "戦闘爆撃機隊", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 16 },
      { id: "rc", name: "偵察機隊", toe: "gen_air_recon", base: "b1", aircraft: 2 },
    ],
  });
  const forces = [force(a!, 60000), force(b!, 200000)];
  edit(forces);
  file.rules.airForces = forces;
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("航空司令部と1日の計画", () => {
  it("出撃の割り当ては、重みで配り(端数は大きい順)、合計は出撃の数", () => {
    expect(apportion(10, [2, 1, 1])).toEqual([5, 3, 2]);
    expect(apportion(7, [1, 0, 1])).toEqual([4, 0, 3]);
  });

  it("試合の始めに、両陣営の航空司令部がその日の計画を作り、霧のフィルタでは自陣営の分だけ見える", () => {
    const sc = load();
    const s = sc.start(1);
    const [a, b] = sc.def.sides.map((x) => x.id);
    expect(s.airOps![`${a}-af`]!.plan.length).toBeGreaterThan(0);
    expect(s.airOps![`${b}-af`]!.plan.length).toBeGreaterThan(0);
    const v = viewForSide(s, a!);
    expect(Object.keys(v.airOps ?? {})).toEqual([`${a}-af`]);
    // 戦闘機は哨戒・護衛・上空援護だけ、偵察機は偵察だけ
    for (const t of v.airOps![`${a}-af`]!.plan) {
      if (t.squadron === "fg") expect(["patrol", "escort", "cover"]).toContain(t.mission);
      if (t.squadron === "rc") expect(t.mission).toBe("recon");
    }
  });

  it("期待挙動:基地が遠いと、1日に回せる出撃が少なく、戦場に着くのも遅い", () => {
    const sc = load();
    const s = sc.start(1);
    const [a, b] = sc.def.sides.map((x) => x.id);
    const near = s.airOps![`${a}-af`]!.plan.filter((t) => t.squadron === "fb");
    const far = s.airOps![`${b}-af`]!.plan.filter((t) => t.squadron === "fb");
    expect(far.length).toBeLessThan(near.length);
    expect(Math.min(...far.map((t) => t.onStationSec))).toBeGreaterThan(Math.min(...near.map((t) => t.onStationSec)));
    const f = sc.ctx.scenario.airForces[0]!;
    const c = cycleMinutes(f, "fb", sc.ctx);
    expect(c.cycle).toBeCloseTo(2 * c.transit + c.station + sc.ctx.rules.airOps!.roles["fighterBomber"]!.turnaroundMinutes, 6);
  });

  it("期待挙動:失った機は、次の日の出撃の力を下げる", () => {
    const sc = load();
    const s = sc.start(1);
    const [a] = sc.def.sides.map((x) => x.id);
    const full = s.airOps![`${a}-af`]!.plan.filter((t) => t.squadron === "fb").length;
    const half = (() => {
      const sc2 = load((forces) => ((forces[0]!.squadrons as { aircraft: number }[])[1]!.aircraft = 4));
      return sc2.start(1).airOps![`${a}-af`]!.plan.filter((t) => t.squadron === "fb").length;
    })();
    expect(half).toBeLessThan(full);
  });

  it("哨戒の空域・上空援護の命令は、自陣営の航空司令部・部隊にだけ効き、ほかは弾く", () => {
    const sc = load();
    const s = sc.start(1);
    const [a, b] = sc.def.sides.map((x) => x.id);
    const ownUnit = s.units.find((u) => u.side === a)!.id;
    const enemyUnit = s.units.find((u) => u.side === b)!.id;
    const r = resolveTurn(s, [], sc.ctx, [
      { side: a!, type: "airPatrol", force: `${a}-af`, sectors: ["1,1"] },
      { side: a!, type: "airCover", force: `${a}-af`, unitId: ownUnit, on: true },
      { side: a!, type: "airCover", force: `${a}-af`, unitId: enemyUnit, on: true },
      { side: a!, type: "airPatrol", force: `${b}-af`, sectors: ["0,0"] },
      { side: a!, type: "airPatrol", force: `${a}-af`, sectors: ["9,9"] },
    ]);
    expect(r.rejectedHqCommands.length).toBe(3);
    const st = r.state.airOps![`${a}-af`]!;
    expect(st.patrolSectors).toEqual(["1,1"]);
    expect(st.cover).toEqual([ownUnit]);
  });
});
