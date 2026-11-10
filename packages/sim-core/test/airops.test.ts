import { describe, expect, it } from "vitest";
import { apportion, buildScenario, cycleMinutes, forecastFlyable, resolveTurn, Rng, stepFlights, updateForecasts, viewForSide, type AirOpsState, type Flight, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/** 左右対称の試験シナリオに、両陣営の航空司令部を足す(基地までの距離・機数は試験の値) */
function load(edit: (forces: Record<string, unknown>[], rules: Record<string, unknown>) => void = () => {}): LoadedScenario {
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
  edit(forces, file.rules);
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


describe("効果(AIR4)", () => {
  const sc = load();
  const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];
  const center = { x: sc.ctx.terrain.widthM / 2, y: sc.ctx.terrain.heightM / 2 };
  /** 自陣営 a の部隊1つと敵 b の部隊1つを、同じ点に置く(対空の力のない部隊にして、対空砲の乱数を除く) */
  function ground(markFriend: boolean) {
    const s = sc.start(1);
    const friend = structuredClone(s.units.find((u) => u.side === a)!);
    const enemy = structuredClone(s.units.find((u) => u.side === b)!);
    friend.pos = { ...center };
    enemy.pos = { x: center.x + 200, y: center.y };
    if (markFriend) friend.airMarked = true;
    return { s, friend, enemy };
  }
  function flight(over: Partial<Flight> = {}): Flight {
    return {
      id: "f1",
      force: `${a}-af`,
      side: a,
      squadron: "fb",
      toe: "gen_air_fighter_bomber",
      mission: "armedRecon",
      aircraft: 4,
      pos: { ...center },
      entry: { x: 0, y: center.y },
      station: { ...center },
      phase: "station",
      onStationSec: 0,
      offStationSec: 1e9,
      ...over,
    };
  }
  function airOpsWith(s: ReturnType<typeof sc.start>, flights: Flight[]): AirOpsState {
    const ops = structuredClone(s.airOps!);
    ops[`${a}-af`]!.flights = flights;
    ops[`${a}-af`]!.launched = ops[`${a}-af`]!.plan.map((t) => t.id);
    ops[`${b}-af`]!.launched = ops[`${b}-af`]!.plan.map((t) => t.id);
    return ops;
  }

  it("期待挙動:要請の地点を叩くと、そばの自軍の部隊も損害を受けるが、前線の印を出していれば減る", () => {
    const hitOn = (mark: boolean) => {
      const { s, friend, enemy } = ground(mark);
      const ops = airOpsWith(s, [flight({ mission: "onCall", requestId: "r1", station: { ...center } })]);
      const res = stepFlights(ops, [friend, enemy], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(7));
      return { own: res.fire.filter((x) => x.targetId === friend.id).reduce((t, x) => t + x.damage, 0), foe: res.fire.filter((x) => x.targetId === enemy.id).reduce((t, x) => t + x.damage, 0) };
    };
    const plain = hitOn(false);
    const marked = hitOn(true);
    expect(plain.own).toBeGreaterThan(0);
    expect(plain.own).toBeLessThan(plain.foe);
    expect(marked.own / plain.own).toBeCloseTo(sc.ctx.rules.airOps!.effects.fratricide.marked, 6);
  });

  it("期待挙動:武装偵察は、敵のそばの自軍の部隊を取り違えて狙うことがあり、印を出していれば取り違えにくい", () => {
    const mistakes = (mark: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const { s, friend, enemy } = ground(mark);
        friend.pos = { x: center.x + 900, y: center.y };
        enemy.pos = { ...center };
        const ops = airOpsWith(s, [flight()]);
        stepFlights(ops, [friend, enemy], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(seed));
        const f = ops[`${a}-af`]!.flights![0]!;
        if (f.station.x === friend.pos.x) n++;
      }
      return n;
    };
    const plain = mistakes(false);
    const marked = mistakes(true);
    expect(plain).toBeGreaterThan(0);
    expect(marked).toBeLessThan(plain);
  });

  it("期待挙動:偵察の写真は、持ち帰って判読するまで陣営の情報に入らない。落とされれば届かない", () => {
    const { s, enemy } = ground(false);
    const intel = structuredClone(s.intel);
    if (intel[a]) delete intel[a]!.entries[enemy.id];
    const ops = airOpsWith(s, [flight({ squadron: "rc", toe: "gen_air_recon", mission: "recon", aircraft: 1 })]);
    stepFlights(ops, [enemy], intel, s.time, 60, true, sc.ctx, Rng.fromSeed(1));
    expect(intel[a]?.entries[enemy.id]).toBeUndefined();
    // 帰り着く
    const f = ops[`${a}-af`]!.flights![0]!;
    f.phase = "outbound";
    f.pos = { ...f.entry };
    stepFlights(ops, [enemy], intel, s.time + 60, 60, true, sc.ctx, Rng.fromSeed(1));
    expect(ops[`${a}-af`]!.flights!.length).toBe(0);
    expect(intel[a]?.entries[enemy.id]).toBeUndefined();
    const ready = s.time + 60 + sc.ctx.rules.airOps!.effects.photoDelayMinutes * 60;
    const res = stepFlights(ops, [enemy], intel, ready, 60, true, sc.ctx, Rng.fromSeed(1));
    expect(intel[a]!.entries[enemy.id]?.lastSeenTime).toBe(s.time);
    expect(res.events.some((e) => e.type === "airPhoto" && e.found === 1)).toBe(true);
    // 落とされた偵察機の写真は届かない
    const intel2 = structuredClone(s.intel);
    if (intel2[a]) delete intel2[a]!.entries[enemy.id];
    const ops2 = airOpsWith(s, [flight({ squadron: "rc", toe: "gen_air_recon", mission: "recon", aircraft: 1 })]);
    stepFlights(ops2, [enemy], intel2, s.time, 60, true, sc.ctx, Rng.fromSeed(1));
    ops2[`${a}-af`]!.flights![0]!.aircraft = 0;
    stepFlights(ops2, [enemy], intel2, s.time + 60, 60, true, sc.ctx, Rng.fromSeed(1));
    stepFlights(ops2, [enemy], intel2, ready, 60, true, sc.ctx, Rng.fromSeed(1));
    expect(intel2[a]?.entries[enemy.id]).toBeUndefined();
  });

  it("期待挙動:帰った編隊は戦果を大きめに報告し、味方撃ちは地上から知らされる", () => {
    const { s, friend, enemy } = ground(false);
    const ops = airOpsWith(s, [flight({ mission: "onCall", requestId: "r1" })]);
    stepFlights(ops, [friend, enemy], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(3));
    const f = ops[`${a}-af`]!.flights![0]!;
    expect(f.hit).toEqual([enemy.id]);
    f.phase = "outbound";
    f.pos = { ...f.entry };
    const res = stepFlights(ops, [friend, enemy], structuredClone(s.intel), s.time + 60, 60, true, sc.ctx, Rng.fromSeed(3));
    const claim = res.events.find((e) => e.type === "airClaim");
    expect(claim && claim.type === "airClaim" && claim.claimedHits).toBeGreaterThanOrEqual(2);
    const ff = res.events.find((e) => e.type === "airFratricide");
    expect(ff && ff.type === "airFratricide" && ff.units).toEqual([friend.id]);
    // 霧のフィルタ:帰る前の編隊の戦果(敵の本当の ID)は、自陣営の画面にも渡さない
    const ops2 = airOpsWith(s, [flight({ mission: "onCall", requestId: "r1" })]);
    stepFlights(ops2, [friend, enemy], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(3));
    const v = viewForSide({ ...s, airOps: ops2 }, a);
    expect(v.airOps![`${a}-af`]!.flights![0]!.hit).toBeUndefined();
  });

  it("期待挙動:護衛の戦闘機は、戦場に着く時刻の近い味方の攻撃の編隊に付いて飛び、その編隊が帰ると帰る", () => {
    const { s } = ground(false);
    const strike = flight({ id: "s1", phase: "inbound", pos: { x: 1000, y: center.y }, station: { ...center }, onStationSec: 600 });
    const esc = flight({ id: "e1", squadron: "fg", toe: "gen_air_fighter", mission: "escort", phase: "inbound", pos: { x: 0, y: 0 }, station: { ...center }, onStationSec: 900 });
    const ops = airOpsWith(s, [strike, esc]);
    for (let k = 0; k < 10; k++) stepFlights(ops, [], structuredClone(s.intel), s.time + k * 60, 60, true, sc.ctx, Rng.fromSeed(1));
    const [st, es] = ["s1", "e1"].map((id) => ops[`${a}-af`]!.flights!.find((x) => x.id === id)!);
    expect(es!.escortOf).toBe("s1");
    expect(Math.hypot(es!.pos.x - st!.pos.x, es!.pos.y - st!.pos.y)).toBeLessThan(5000);
    st!.phase = "outbound";
    stepFlights(ops, [], structuredClone(s.intel), s.time + 700, 1, true, sc.ctx, Rng.fromSeed(1));
    expect(ops[`${a}-af`]!.flights!.find((x) => x.id === "e1")!.phase).toBe("outbound");
  });

  it("前線の印は自陣営の部隊にだけ出せる", () => {
    const s = sc.start(1);
    const own = s.units.find((u) => u.side === a)!.id;
    const foe = s.units.find((u) => u.side === b)!.id;
    const r = resolveTurn(s, [], sc.ctx, [
      { side: a, type: "airMark", unitId: own, on: true },
      { side: a, type: "airMark", unitId: foe, on: true },
    ]);
    expect(r.rejectedHqCommands.length).toBe(1);
    expect(r.state.units.find((u) => u.id === own)!.airMarked).toBe(true);
    expect(r.state.units.find((u) => u.id === foe)!.airMarked).toBeUndefined();
  });
});

describe("基地の天候と予報(AIR5)", () => {
  it("期待挙動:戦場が晴れていても、基地が霧なら飛び立てない", () => {
    const sc = load((forces) => {
      (forces[0]!.bases as Record<string, unknown>[])[0]!.weather = { initial: "fog" };
    });
    const [a, b] = sc.def.sides.map((x) => x.id);
    let s = sc.start(1);
    const launched = new Set<string>();
    for (let k = 0; k < 4; k++) {
      s = resolveTurn(s, [], sc.ctx).state;
      for (const st of Object.values(s.airOps!)) for (const f of st.flights ?? []) launched.add(f.force);
    }
    expect(launched.has(`${a}-af`)).toBe(false);
    expect(launched.has(`${b}-af`)).toBe(true);
    // 基地の天候は自陣営にだけ見える
    expect(viewForSide(s, a!).airOps![`${a}-af`]!.baseWeather?.["b1"]?.current).toBe("fog");
  });

  it("期待挙動:航空司令部は予報で飛べない時間帯に出撃を割り当てない(予報が外れても、予報に従う)", () => {
    const sc = load((_, rules) => {
      rules.weather = { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5, schedule: [{ turn: 3, weather: "overcast" }, { turn: 5, weather: "clear" }] };
    });
    const s = sc.start(1);
    for (const [id, st] of Object.entries(s.airOps!)) {
      const force = sc.ctx.scenario.airForces.find((f) => f.id === id)!;
      for (const t of st.plan) {
        const turn = 1 + Math.floor((t.onStationSec - s.time) / sc.ctx.turnSeconds);
        const base = force.squadrons.find((q) => q.id === t.squadron)!.base;
        expect(forecastFlyable(st, base, 1, s.weather, turn, sc.ctx)).toBe(true);
      }
      // 予報の多くは予定どおり曇り(3・4ターン目)なので、その時間帯の出撃は少ない
      const inBad = st.plan.filter((t) => t.onStationSec >= s.time + 2 * sc.ctx.turnSeconds && t.onStationSec < s.time + 4 * sc.ctx.turnSeconds).length;
      const inGood = st.plan.filter((t) => t.onStationSec >= s.time + 4 * sc.ctx.turnSeconds && t.onStationSec < s.time + 6 * sc.ctx.turnSeconds).length;
      expect(inBad).toBeLessThan(inGood);
    }
  });

  it("期待挙動:予報は先のターンほど外れやすい", () => {
    const sc = load((_, rules) => {
      rules.maxTurns = 30;
    });
    const s = sc.start(1);
    const lead = sc.ctx.rules.airOps!.forecast.leadTurns;
    const miss = new Array(lead).fill(0);
    for (let seed = 1; seed <= 400; seed++) {
      const ops = structuredClone(s.airOps!);
      updateForecasts(ops, 1, { current: "overcast", since: 0 }, sc.ctx, Rng.fromSeed(seed).getState());
      const fc = Object.values(ops)[0]!.forecast!;
      fc.battlefield.forEach((w, i) => (miss[i] += w !== "overcast" ? 1 : 0));
    }
    expect(miss[0]).toBeGreaterThan(0);
    expect(miss[lead - 1]).toBeGreaterThan(miss[0] * 2);
  });
});
