import { describe, expect, it } from "vitest";
import { availableAircraft, buildScenario, freeAircraft, moveSpeedMps, pickSquadron, resolveTurn, Rng, stepFlights, type Flight, type HqCommand, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/** 左右対称の試験シナリオに、両陣営の航空司令部(要請の枠なし)を足す */
function load(): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-symmetric")) as { packs: { weapons: string | string[]; toe: string | string[] }; sides: { id: string }[]; rules: Record<string, unknown> };
  const arr = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
  file.packs.weapons = [...arr(file.packs.weapons), "air-generic"];
  file.packs.toe = [...arr(file.packs.toe), "air-generic"];
  file.rules.airForces = file.sides.map((s) => ({
    id: `${s.id}-af`,
    side: s.id,
    name: `${s.id} の航空軍団`,
    bases: [{ id: "b1", name: "基地", distanceM: 60000 }],
    squadrons: [
      { id: "fg", name: "戦闘機隊", toe: "gen_air_fighter", base: "b1", aircraft: 8 },
      { id: "fb", name: "戦闘爆撃機隊", toe: "gen_air_fighter_bomber", base: "b1", aircraft: 16 },
    ],
  }));
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("陸戦の航空の効き目(ユーザー判断:触っても触らなくても変わらない、の直し)", () => {
  const sc = load();
  const [a, b] = sc.def.sides.map((x) => x.id) as [string, string];

  it("期待挙動:要請の1日の枠を書かなければ、5回でも6回でも要請できる(出せる機の回りだけが上限)", () => {
    const s = sc.start(1);
    const target = { ...s.units.find((u) => u.side === b)!.pos };
    const reqs: HqCommand[] = Array.from({ length: 6 }, () => ({ side: a, type: "airRequest", force: `${a}-af`, kind: "support", target, turn: 4 }) as HqCommand);
    const r = resolveTurn(s, [], sc.ctx, reqs);
    expect(r.rejectedHqCommands.filter((c) => c.command.type === "airRequest")).toEqual([]);
    // 予約はなく今すぐ飛ぶ(出せる機の分だけ受け、残りは機がなくて断られる。枠で弾かれはしない)
    const got = r.hqEvents.flatMap((e) => (e.type === "airRequest" ? [e.request] : []));
    expect(got).toHaveLength(6);
    expect(got.filter((x) => x.status === "accepted").length).toBeGreaterThan(1);
    expect(got.every((x) => x.status === "accepted" || x.reason === "出せる攻撃機がない")).toBe(true);
  });

  it("期待挙動:要請のない攻撃機は武装偵察に出る。飛行隊の機の一部は要請に取っておく", () => {
    const s = sc.start(1);
    const ops = structuredClone(s.airOps!);
    stepFlights(ops, s.units, structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(1));
    const st = ops[`${a}-af`]!;
    const recon = st.sorties.filter((x) => x.mission === "armedRecon");
    expect(recon.length).toBeGreaterThan(0);
    const reserve = Math.ceil(16 * sc.ctx.rules.airOps!.armedRecon!.reserveShare);
    expect(freeAircraft(st, "fb", s.time)).toBeGreaterThanOrEqual(reserve);
    // 武装偵察の攻撃機には護衛の戦闘機が付く
    expect(st.sorties.some((x) => x.mission === "escort" && recon.some((r) => r.id === x.escortOf))).toBe(true);
  });

  it("期待挙動:武装偵察の編隊は、見えた敵のうち道路を縦隊で動く部隊を先に狙う", () => {
    const s = sc.start(1);
    const units = structuredClone(s.units);
    const enemies = units.filter((u) => u.side === b).slice(0, 2);
    const center = { x: sc.ctx.terrain.widthM / 2, y: sc.ctx.terrain.heightM / 2 };
    // 近い方は展開して止まっている、少し遠い方は縦隊で動いている
    enemies[0]!.pos = { x: center.x + 500, y: center.y };
    enemies[0]!.formation = "deployed";
    enemies[1]!.pos = { x: center.x + 2500, y: center.y };
    enemies[1]!.formation = "column";
    enemies[1]!.movedLastTurn = true;
    const ops = structuredClone(s.airOps!);
    const st = ops[`${a}-af`]!;
    const f: Flight = { id: "ar1", force: `${a}-af`, side: a, squadron: "fb", toe: "gen_air_fighter_bomber", mission: "armedRecon", aircraft: 4, pos: { ...center }, entry: { x: 0, y: center.y }, station: { ...center }, phase: "station", onStationSec: s.time, offStationSec: s.time + 1800 };
    st.flights = [f];
    const noRecon = { ...sc.ctx, rules: { ...sc.ctx.rules, airOps: { ...sc.ctx.rules.airOps!, armedRecon: undefined } } };
    stepFlights(ops, units, structuredClone(s.intel), s.time, 60, true, noRecon, Rng.fromSeed(1));
    expect(st.flights[0]!.acquired).toBe(true);
    expect(st.flights[0]!.station).toEqual(enemies[1]!.pos);
  });

  it("期待挙動:1機が1日に出られる回数には上限がある(役割の maxSortiesPerDay)。使い切ると、積み直しが済んだ機がいても出せない", () => {
    const s = sc.start(1);
    const ops = structuredClone(s.airOps!);
    const st = ops[`${a}-af`]!;
    const force = sc.ctx.scenario.airForces.find((f) => f.side === a)!;
    const max = sc.ctx.rules.airOps!.roles["fighterBomber"]!.maxSortiesPerDay!;
    expect(availableAircraft(force, st, "fb", s.time, sc.ctx)).toBe(16);
    st.squadrons["fb"]!.today = Math.floor(16 * max);
    expect(freeAircraft(st, "fb", s.time)).toBe(16);
    expect(availableAircraft(force, st, "fb", s.time, sc.ctx)).toBe(0);
    expect(pickSquadron(force, st, "support", s.time, sc.ctx)).toBeNull();
  });

  it("期待挙動:攻撃を受けた部隊は足止めされ、しばらく移動の速さが落ちる", () => {
    const s = sc.start(1);
    const units = structuredClone(s.units);
    const enemy = units.find((u) => u.side === b)!;
    const ops = structuredClone(s.airOps!);
    const st = ops[`${a}-af`]!;
    st.flights = [{ id: "s1", force: `${a}-af`, side: a, squadron: "fb", toe: "gen_air_fighter_bomber", mission: "support", aircraft: 4, pos: { ...enemy.pos }, entry: { x: 0, y: enemy.pos.y }, station: { ...enemy.pos }, phase: "station", onStationSec: s.time, offStationSec: s.time + 1800 }];
    const before = moveSpeedMps(enemy, { x: enemy.pos.x + 1000, y: enemy.pos.y, onRoad: false } as never, sc.ctx);
    const res = stepFlights(ops, units, structuredClone(s.intel), s.time, 60, true, sc.ctx, Rng.fromSeed(1));
    expect(res.fire.some((x) => x.targetId === enemy.id && x.damage > 0)).toBe(true);
    const pin = sc.ctx.rules.airOps!.effects.pin!;
    expect(enemy.airPinnedSec).toBe(pin.minutes * 60);
    const after = moveSpeedMps(enemy, { x: enemy.pos.x + 1000, y: enemy.pos.y, onRoad: false } as never, sc.ctx);
    expect(after).toBeCloseTo(before * pin.speedMultiplier, 6);
  });
});
