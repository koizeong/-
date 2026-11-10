import { describe, expect, it } from "vitest";
import { buildScenario, cycleMinutes, freeAircraft, resolveTurn, Rng, stepFlights, updateForecasts, viewForSide, type AirOpsState, type Flight, type GameState, type HqCommand, type LoadedScenario } from "../src/index.js";
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


type AirReq = Extract<HqCommand, { type: "airRequest" }>;
const req = (side: string, c: Omit<AirReq, "side" | "type" | "force">): AirReq => ({ side, type: "airRequest", force: `${side}-af`, ...c });
/** 敵 enemySide のいちばん番号の若い部隊の位置 */
const enemyPos = (s: GameState, enemySide: string) => ({ ...[...s.units].filter((u) => u.side === enemySide).sort((x, y) => (x.id < y.id ? -1 : 1))[0]!.pos });

describe("要請:即応と予約", () => {
  const sc = load();
  const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];

  it("試合の始めには出撃も要請もなく、霧のフィルタでは自陣営の航空司令部だけ見える", () => {
    const s = sc.start(1);
    for (const st of Object.values(s.airOps!)) {
      expect(st.sorties).toEqual([]);
      expect(st.requests).toEqual([]);
    }
    const v = viewForSide(s, a);
    expect(Object.keys(v.airOps ?? {})).toEqual([`${a}-af`]);
  });

  it("期待挙動:即応は、出せる攻撃機の編隊がその場で飛び立ち、護衛の戦闘機が付く。基地が遠いと戦場に着くのが遅い", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [], sc.ctx, [req(a, { kind: "onCall", target: enemyPos(s, b) }), req(b, { kind: "onCall", target: enemyPos(s, a) })]);
    const got = r.hqEvents.filter((e) => e.type === "airRequest");
    expect(got.map((e) => e.type === "airRequest" && e.request.status)).toEqual(["accepted", "accepted"]);
    const eta = (side: string) => {
      const e = got.find((x) => x.side === side)!;
      return e.type === "airRequest" ? e.request.etaSec! : 0;
    };
    // 戦場に着くのは今 + 基地からの行き
    const force = sc.ctx.scenario.airForces.find((f) => f.side === a)!;
    expect(eta(a)).toBeCloseTo(s.time + cycleMinutes(force, "fb", sc.ctx).transit * 60, 3);
    expect(eta(b)).toBeGreaterThan(eta(a));
    // 護衛の戦闘機の編隊が付いて飛んだ
    const events = r.hqEvents.map((e) => e.type);
    expect(events).toContain("airArrived");
    expect(r.state.airOps![`${a}-af`]!.squadrons["fg"]!.sorties ?? 0).toBeGreaterThan(0);
    // 要請は1日の枠を使う
    expect(r.state.airOps![`${a}-af`]!.requestsLeft).toBe(3);
  });

  it("期待挙動:出せる攻撃機がなければ即応は断られ、1日の枠を使い切ると弾かれる", () => {
    const sc2 = load((forces) => {
      forces[0]!.requestsPerDay = 6;
      forces[0]!.squadrons = [{ id: "fb", name: "fb", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 8 }];
    });
    const s = sc2.start(1);
    const asks = Array.from({ length: 7 }, () => req(a, { kind: "onCall", target: enemyPos(s, b) }));
    const r = resolveTurn(s, [], sc2.ctx, asks);
    const st = r.hqEvents.flatMap((e) => (e.type === "airRequest" ? [e.request] : []));
    // 8機 ÷ 編隊4機 = 2回まで飛び、後は断られる(断られても枠は使う)
    expect(st.map((x) => x.status)).toEqual(["accepted", "accepted", "refused", "refused", "refused", "refused"]);
    expect(st[2]!.reason).toBe("出せる攻撃機がない");
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["今日の要請の枠を使い切りました"]);
  });

  it("期待挙動:予約は前もって出せば、そのターンの始めに飛ぶ。間際の予約は断られ、夜のターンの予約は取りやめになる", () => {
    const s = sc.start(1);
    const lead = sc.ctx.rules.airOps!.requests.preplanLeadTurns;
    const target = enemyPos(s, b);
    let r = resolveTurn(s, [], sc.ctx, [
      req(a, { kind: "support", target, turn: 1 + lead }),
      req(a, { kind: "support", target, turn: lead }),
      req(a, { kind: "recon", target, turn: 8 }),
    ]);
    const first = r.hqEvents.flatMap((e) => (e.type === "airRequest" ? [e.request] : []));
    expect(first.map((x) => x.status)).toEqual(["scheduled", "refused", "scheduled"]);
    // 予約のターンまで進める
    let flown: { status: string; etaSec?: number } | undefined;
    let start = 0;
    for (let k = 0; k < 8 && r.state.turn <= 8; k++) {
      start = r.state.time;
      const turn = r.state.turn;
      r = resolveTurn(r.state, [], sc.ctx);
      const evs = r.hqEvents.flatMap((e) => (e.type === "airRequest" ? [e.request] : []));
      if (turn === 1 + lead) {
        flown = evs.find((x) => x.kind === "support");
        expect(flown?.status).toBe("flown");
        expect(flown?.etaSec).toBe(start);
        expect(r.hqEvents.some((e) => e.type === "airAttack" && e.side === a)).toBe(true);
      }
      if (turn === 8) {
        const recon = evs.find((x) => x.kind === "recon");
        expect(recon?.status).toBe("cancelled");
        expect(recon && "reason" in recon && recon.reason).toMatch(/夜/);
      }
    }
    expect(flown).toBeDefined();
  });

  it("期待挙動:基地が霧なら、即応は断られ、予約は取りやめになる", () => {
    const sc2 = load((forces) => {
      (forces[0]!.bases as Record<string, unknown>[])[0]!.weather = { initial: "fog" };
    });
    const s = sc2.start(1);
    const r = resolveTurn(s, [], sc2.ctx, [req(a, { kind: "onCall", target: enemyPos(s, b) })]);
    const got = r.hqEvents.flatMap((e) => (e.type === "airRequest" ? [e.request] : []));
    expect(got[0]!.status).toBe("refused");
    expect(got[0]!.reason).toMatch(/基地の天候/);
    // 基地の天候は自陣営にだけ見える
    expect(viewForSide(r.state, a).airOps![`${a}-af`]!.baseWeather?.["b1"]?.current).toBe("fog");
    expect(viewForSide(r.state, b).airOps![`${a}-af`]).toBeUndefined();
  });

  it("期待挙動:帰ってきた機は、基地までの帰り道と積み直しが済むまで出せない。失った機は出せる機を減らす", () => {
    const s = sc.start(1);
    const ops = structuredClone(s.airOps!);
    const st = ops[`${a}-af`]!;
    const force = sc.ctx.scenario.airForces.find((f) => f.side === a)!;
    const center = { x: sc.ctx.terrain.widthM / 2, y: sc.ctx.terrain.heightM / 2 };
    st.flights = [{ id: "f1", force: `${a}-af`, side: a, squadron: "fb", toe: "gen_air_fighter_bomber", mission: "support", aircraft: 4, pos: { x: 0, y: center.y }, entry: { x: 0, y: center.y }, station: center, phase: "outbound", onStationSec: 0, offStationSec: 1 }];
    st.squadrons["fb"]!.aircraft = 14;
    st.squadrons["fb"]!.lost = 2;
    expect(freeAircraft(st, "fb", s.time)).toBe(10);
    stepFlights(ops, [], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(1));
    expect(st.flights).toEqual([]);
    expect(freeAircraft(st, "fb", s.time + 60)).toBe(10);
    const { transit, turnaround } = cycleMinutes(force, "fb", sc.ctx);
    expect(freeAircraft(st, "fb", s.time + (transit + turnaround) * 60 + 1)).toBe(14);
  });

  it("期待挙動:予約の空輸は、受け取る部隊に弾薬と燃料を届ける。受け取る部隊のない空輸は弾く", () => {
    const sc2 = load((forces) => {
      forces[0]!.squadrons = [...(forces[0]!.squadrons as unknown[]), { id: "tr", name: "輸送機隊", toe: "gen_air_transport", base: "b1", aircraft: 9 }];
    });
    const s = sc2.start(1);
    const unit = [...s.units].filter((u) => u.side === a).sort((x, y) => (x.id < y.id ? -1 : 1))[0]!;
    const lead = sc2.ctx.rules.airOps!.requests.preplanLeadTurns;
    let r = resolveTurn(s, [], sc2.ctx, [req(a, { kind: "airlift", target: { ...unit.pos }, turn: 1 + lead, unitId: unit.id }), req(a, { kind: "airlift", target: { ...unit.pos }, turn: 1 + lead })]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["空輸を受け取る自陣営の部隊を選んでください"]);
    let supplied = false;
    for (let k = 0; k < lead + 1; k++) {
      // 地上の補給で満ちないように、毎ターンの始めに減らしておく
      const low = { ...r.state, units: r.state.units.map((u) => (u.id === unit.id ? { ...u, ammo: 0.2, fuel: 0.2 } : u)) };
      r = resolveTurn(low, [], sc2.ctx);
      supplied ||= r.hqEvents.some((e) => e.type === "airSupplied" && e.deliveries.some((d) => d.unitId === unit.id));
    }
    expect(supplied).toBe(true);
  });
});

describe("盤上の飛行", () => {
  /** 片方の陣営だけに戦闘爆撃機、もう片方には戦闘機だけ(数は試験の値) */
  function strikeVsFighters(fighters: number) {
    return load((forces) => {
      forces[0]!.squadrons = [{ id: "fb", name: "fb", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 16 }];
      forces[1]!.bases = [{ id: "b1", name: "基地", distanceM: 60000 }];
      forces[1]!.squadrons = fighters > 0 ? [{ id: "fg", name: "fg", toe: "gen_air_fighter", base: "b1", aircraft: fighters }] : [{ id: "rc", name: "rc", toe: "gen_air_recon", base: "b1", aircraft: 1 }];
    });
  }
  /** a が毎ターン即応で b の部隊を叩く */
  const run = (sc: LoadedScenario, turns: number, ctx = sc.ctx) => {
    const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];
    let s = sc.start(1);
    const events: { side: string; type: string }[] = [];
    for (let k = 0; k < turns; k++) {
      const r = resolveTurn(s, [], ctx, k < 3 ? [req(a, { kind: "onCall", target: enemyPos(s, b) })] : []);
      events.push(...(r.hqEvents as { side: string; type: string }[]));
      s = r.state;
    }
    return { s, events };
  };

  it("期待挙動:攻撃の編隊は要請の地点を叩き、敵の部隊は損害を受ける", () => {
    const sc = strikeVsFighters(0);
    const [a, b] = sc.def.sides.map((x) => x.id);
    const { s, events } = run(sc, 4);
    expect(events.some((e) => e.side === a && e.type === "airAttack")).toBe(true);
    const lost = s.units.filter((u) => u.side === b).reduce((t, u) => t + (1 - u.strength), 0);
    expect(lost).toBeGreaterThan(0);
  });

  it("期待挙動:敵の戦闘機は見えた攻撃の編隊を自動で迎え撃ち、攻撃の編隊は機を失う。失った機は飛行隊から減る", () => {
    const quiet = run(strikeVsFighters(0), 4);
    const hot = run(strikeVsFighters(16), 4);
    const [, b] = strikeVsFighters(0).def.sides.map((x) => x.id);
    expect(hot.events.some((e) => e.side === b && e.type === "airScramble")).toBe(true);
    expect(quiet.events.some((e) => e.type === "airScramble")).toBe(false);
    const fb = (s: typeof quiet.s) => Object.values(s.airOps!).find((f) => f.squadrons["fb"])!.squadrons["fb"]!;
    expect(fb(hot.s).lost).toBeGreaterThan(fb(quiet.s).lost);
    expect(fb(hot.s).aircraft).toBe(16 - fb(hot.s).lost);
  });

  it("霧のフィルタ:敵の編隊は、地上の部隊・自陣営の編隊から見える距離の内だけ見える", () => {
    const sc = strikeVsFighters(0);
    const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];
    const ctx = { ...sc.ctx, turnSeconds: 600 };
    let s = sc.start(1);
    let seenSomeTime = false;
    // ターンを10分に刻んで、飛んでいる最中の編隊を見る
    for (let k = 0; k < 7; k++) {
      s = resolveTurn(s, [], ctx, k === 0 ? [req(a, { kind: "onCall", target: enemyPos(s, b) })] : []).state;
      const v = viewForSide(s, b);
      for (const f of v.enemyFlights ?? []) {
        seenSomeTime = true;
        const eyes = [...s.units.filter((u) => u.side === b).map((u) => u.pos), ...Object.values(v.airOps ?? {}).flatMap((x) => (x.flights ?? []).map((fl) => fl.pos))];
        expect(eyes.some((p) => Math.hypot(p.x - f.pos.x, p.y - f.pos.y) <= sc.ctx.rules.airOps!.flight.sightM)).toBe(true);
      }
      expect(Object.keys(v.airOps ?? {})).not.toContain(`${a}-af`);
    }
    expect(seenSomeTime).toBe(true);
  });
});

describe("効果", () => {
  const sc = load();
  const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];
  const center = { x: sc.ctx.terrain.widthM / 2, y: sc.ctx.terrain.heightM / 2 };
  /** 自陣営 a の部隊1つと敵 b の部隊1つを、近くに置く */
  function ground() {
    const s = sc.start(1);
    const friend = structuredClone(s.units.find((u) => u.side === a)!);
    const enemy = structuredClone(s.units.find((u) => u.side === b)!);
    friend.pos = { ...center };
    enemy.pos = { x: center.x + 200, y: center.y };
    return { s, friend, enemy };
  }
  function flight(over: Partial<Flight> = {}): Flight {
    return {
      id: "f1",
      force: `${a}-af`,
      side: a,
      squadron: "fb",
      toe: "gen_air_fighter_bomber",
      mission: "support",
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
  function airOpsWith(s: GameState, flights: Flight[]): AirOpsState {
    const ops = structuredClone(s.airOps!);
    ops[`${a}-af`]!.flights = flights;
    ops[`${a}-af`]!.launched = flights.map((f) => f.id);
    return ops;
  }

  it("期待挙動:偵察の写真は、持ち帰って判読するまで陣営の情報に入らない。落とされれば届かない", () => {
    const { s, enemy } = ground();
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

  it("期待挙動:帰った編隊は戦果を大きめに報告する。そばの自軍の部隊は撃たない(味方撃ちは表さない)", () => {
    const { s, friend, enemy } = ground();
    const ops = airOpsWith(s, [flight({ requestId: "r1" })]);
    const res0 = stepFlights(ops, [friend, enemy], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(3));
    expect(res0.fire.map((x) => x.targetId)).toEqual([enemy.id]);
    const f = ops[`${a}-af`]!.flights![0]!;
    expect(f.hit).toEqual([enemy.id]);
    f.phase = "outbound";
    f.pos = { ...f.entry };
    const res = stepFlights(ops, [friend, enemy], structuredClone(s.intel), s.time + 60, 60, true, sc.ctx, Rng.fromSeed(3));
    const claim = res.events.find((e) => e.type === "airClaim");
    expect(claim && claim.type === "airClaim" && claim.claimedHits).toBeGreaterThanOrEqual(2);
    // 霧のフィルタ:帰る前の編隊の戦果(敵の本当の ID)は、自陣営の画面にも渡さない
    const ops2 = airOpsWith(s, [flight({ requestId: "r1" })]);
    stepFlights(ops2, [friend, enemy], structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(3));
    const v = viewForSide({ ...s, airOps: ops2 }, a);
    expect(v.airOps![`${a}-af`]!.flights![0]!.hit).toBeUndefined();
  });

  it("期待挙動:護衛の戦闘機は護衛する攻撃の編隊に付いて飛び、その編隊が帰ると帰る", () => {
    const { s } = ground();
    const strike = flight({ id: "s1", phase: "inbound", pos: { x: 1000, y: center.y }, station: { ...center }, onStationSec: 600 });
    const esc = flight({ id: "s1:esc", squadron: "fg", toe: "gen_air_fighter", mission: "escort", escortOf: "s1", phase: "inbound", pos: { x: 0, y: 0 }, station: { ...center }, onStationSec: 600 });
    const ops = airOpsWith(s, [strike, esc]);
    for (let k = 0; k < 3; k++) stepFlights(ops, [], structuredClone(s.intel), s.time + k * 60, 60, true, sc.ctx, Rng.fromSeed(1));
    const [st, es] = ["s1", "s1:esc"].map((id) => ops[`${a}-af`]!.flights!.find((x) => x.id === id)!);
    expect(Math.hypot(es!.pos.x - st!.pos.x, es!.pos.y - st!.pos.y)).toBeLessThan(5000);
    st!.phase = "outbound";
    stepFlights(ops, [], structuredClone(s.intel), s.time + 700, 1, true, sc.ctx, Rng.fromSeed(1));
    expect(ops[`${a}-af`]!.flights!.find((x) => x.id === "s1:esc")!.phase).toBe("outbound");
  });
});

describe("基地の天候と予報(AIR5)", () => {
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

describe("この戦場に回ってくる機(戦闘ごとの運)", () => {
  it("期待挙動:allotment の幅の内で試合ごとに変わり、同じ種なら同じ。省略すれば全部", () => {
    const sc = load((forces) => (forces[0]!.allotment = { min: 0.25, max: 0.75 }));
    const [a, b] = sc.def.sides.map((x) => x.id);
    const shares = [1, 2, 3, 4, 5, 6].map((seed) => sc.start(seed).airOps![`${a}-af`]!.share!);
    for (const x of shares) expect(x).toBeGreaterThanOrEqual(0.25), expect(x).toBeLessThanOrEqual(0.75);
    expect(new Set(shares.map((x) => x.toFixed(3))).size).toBeGreaterThan(1);
    expect(sc.start(3).airOps![`${a}-af`]!.share).toBe(shares[2]);
    const s = sc.start(3);
    expect(s.airOps![`${a}-af`]!.squadrons["fg"]!.aircraft).toBe(Math.round(16 * shares[2]!));
    expect(s.airOps![`${b}-af`]!.share).toBeUndefined();
    expect(s.airOps![`${b}-af`]!.squadrons["fg"]!.aircraft).toBe(16);
  });
});
