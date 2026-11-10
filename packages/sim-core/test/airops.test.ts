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

  it("期待挙動:事前計画は前もって出せば阻止攻撃の編隊が回ってくるが、間際の要請は断られる", () => {
    const sc = load();
    const s = sc.start(1);
    const [a] = sc.def.sides.map((x) => x.id);
    const target = s.units.find((u) => u.side !== a)!.pos;
    const r = resolveTurn(s, [], sc.ctx, [
      { side: a!, type: "airRequest", force: `${a}-af`, kind: "support", target, turn: s.turn + 3 },
      { side: a!, type: "airRequest", force: `${a}-af`, kind: "support", target, turn: s.turn },
    ]);
    const reqs = r.state.airOps![`${a}-af`]!.requests;
    expect(["accepted", "delayed"]).toContain(reqs[0]!.status);
    expect(reqs[0]!.taskIds.length).toBeGreaterThan(0);
    const t = r.state.airOps![`${a}-af`]!.plan.find((x) => x.id === reqs[0]!.taskIds[0])!;
    expect(t.mission).toBe("support");
    expect(t.target).toEqual(target);
    expect(reqs[1]!.status).toBe("refused");
    // 結果は要請した陣営にだけ伝わる
    expect(r.hqEvents.filter((e) => e.type === "airRequest").every((e) => e.side === a)).toBe(true);
    expect(r.state.airOps![`${a}-af`]!.requestsLeft).toBe(sc.ctx.scenario.airForces[0]!.requestsPerDay - 2);
  });

  it("期待挙動:即応は、その空域に上空待機がいれば受け、いなければ断る。要請の枠を使い切ると弾く", () => {
    const sc = load((forces) => (forces[0]!.requestsPerDay = 2));
    const s = sc.start(1);
    const [a] = sc.def.sides.map((x) => x.id);
    const plan = s.airOps![`${a}-af`]!.plan;
    const waiting = plan.find((t) => t.mission === "onCall" && t.onStationSec <= s.time + 3600)!;
    const [c, r0] = waiting.sector!.split(",").map(Number);
    const grid = { cols: 3, rows: 3 };
    const inSector = { x: ((c! + 0.5) * sc.ctx.terrain.widthM) / grid.cols, y: ((r0! + 0.5) * sc.ctx.terrain.heightM) / grid.rows };
    const empty = ["0,0", "2,0", "0,2", "2,2", "1,0", "0,1", "2,1", "1,2"].find((k) => !plan.some((t) => t.mission === "onCall" && t.sector === k))!;
    const [ec, er] = empty.split(",").map(Number);
    const elsewhere = { x: ((ec! + 0.5) * sc.ctx.terrain.widthM) / grid.cols, y: ((er! + 0.5) * sc.ctx.terrain.heightM) / grid.rows };
    const r = resolveTurn(s, [], sc.ctx, [
      { side: a!, type: "airRequest", force: `${a}-af`, kind: "onCall", target: inSector },
      { side: a!, type: "airRequest", force: `${a}-af`, kind: "onCall", target: elsewhere },
      { side: a!, type: "airRequest", force: `${a}-af`, kind: "recon", target: elsewhere },
    ]);
    const reqs = r.state.airOps![`${a}-af`]!.requests;
    expect(reqs[0]!.status).toBe("accepted");
    expect(reqs[1]!.status).toBe("refused");
    expect(reqs.length).toBe(2);
    expect(r.rejectedHqCommands.some((x) => x.reason.includes("枠"))).toBe(true);
  });

});

describe("盤上の飛行", () => {
  /** 片方の陣営だけに戦闘爆撃機、もう片方には戦闘機だけ(数は試験の値) */
  function strikeVsFighters(fighters: number) {
    return load((forces) => {
      forces[0]!.doctrine = { weights: { interdiction: 1, armedRecon: 1 } };
      forces[0]!.squadrons = [{ id: "fb", name: "fb", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 16 }];
      forces[1]!.doctrine = { weights: { patrol: 1 } };
      forces[1]!.bases = [{ id: "b1", name: "基地", distanceM: 60000 }];
      forces[1]!.squadrons = fighters > 0 ? [{ id: "fg", name: "fg", toe: "gen_air_fighter", base: "b1", aircraft: fighters }] : [{ id: "rc", name: "rc", toe: "gen_air_recon", base: "b1", aircraft: 1 }];
    });
  }
  const run = (sc: LoadedScenario, turns: number) => {
    let s = sc.start(1);
    const events: { side: string; type: string }[] = [];
    for (let k = 0; k < turns; k++) {
      const r = resolveTurn(s, [], sc.ctx);
      events.push(...(r.hqEvents as { side: string; type: string }[]));
      s = r.state;
    }
    return { s, events };
  };

  it("期待挙動:攻撃の編隊は敵地で見つけた部隊を叩き、敵の部隊は損害を受ける", () => {
    const sc = strikeVsFighters(0);
    const [a, b] = sc.def.sides.map((x) => x.id);
    const { s, events } = run(sc, 4);
    expect(events.some((e) => e.side === a && e.type === "airAttack")).toBe(true);
    const lost = s.units.filter((u) => u.side === b).reduce((t, u) => t + (1 - u.strength), 0);
    expect(lost).toBeGreaterThan(0);
  });

  it("期待挙動:敵の戦闘機が哨戒していると、攻撃の編隊は機を失い、爆弾を捨てて帰ることもある。失った機は飛行隊から減る", () => {
    const quiet = run(strikeVsFighters(0), 4);
    const hot = run(strikeVsFighters(16), 4);
    const [a] = hot.s.airOps ? Object.keys(hot.s.airOps) : [];
    void a;
    const fbLeft = (s: typeof quiet.s) => Object.values(s.airOps!).find((f) => f.squadrons["fb"])!.squadrons["fb"]!;
    expect(fbLeft(hot.s).lost).toBeGreaterThan(fbLeft(quiet.s).lost);
    expect(fbLeft(hot.s).aircraft).toBe(16 - fbLeft(hot.s).lost);
  });

  it("霧のフィルタ:敵の編隊は、地上の部隊・自陣営の編隊から見える距離の内だけ見える", () => {
    const sc = strikeVsFighters(0);
    const [a, b] = sc.def.sides.map((x) => x.id);
    let s = sc.start(1);
    let seenSomeTime = false;
    // ターンを10分に刻んで、飛んでいる最中の編隊を見る
    for (let k = 0; k < 7; k++) {
      s = resolveTurn(s, [], { ...sc.ctx, turnSeconds: 600 }).state;
      const v = viewForSide(s, b!);
      for (const f of v.enemyFlights ?? []) {
        seenSomeTime = true;
        const eyes = [...s.units.filter((u) => u.side === b).map((u) => u.pos), ...Object.values(v.airOps ?? {}).flatMap((x) => (x.flights ?? []).map((fl) => fl.pos))];
        expect(eyes.some((p) => Math.hypot(p.x - f.pos.x, p.y - f.pos.y) <= sc.ctx.rules.airOps!.flight.sightM)).toBe(true);
      }
      // 自陣営の航空司令部の編隊は相手に渡さない
      expect(Object.keys(v.airOps ?? {})).not.toContain(`${a}-af`);
    }
    expect(seenSomeTime).toBe(true);
  });
});

