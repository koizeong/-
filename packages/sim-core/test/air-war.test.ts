import { describe, expect, it } from "vitest";
import {
  createUnit,
  dailyAirSorties,
  distributeSupply,
  interceptChance,
  replenishAirGroups,
  resolveTurn,
  startScenario,
  type GameState,
  type HqCommand,
  type NewUnit,
  type SimContext,
} from "../src/index.js";
import { ger, inf, rules, unitOf, wideCtx } from "./helpers.js";

const A = rules.air;
const strikeCfg = (groups: number) => ({ groups, replacementPerDay: 0, weapon: "ground_attack_aircraft", count: 12, strikeMinutes: 10 });
/** 両陣営に戦闘機と攻撃機がある晴天の文脈 */
const ctxWith = (o: { usFighters?: number; usAttack?: number; deFighters?: number; usControl?: number; deControl?: number; aaPerMg?: number } = {}): SimContext => ({
  ...wideCtx,
  weapons:
    o.aaPerMg === undefined
      ? wideCtx.weapons
      : { ...wideCtx.weapons, weapons: { ...wideCtx.weapons.weapons, machine_gun: { ...wideCtx.weapons.weapons["machine_gun"]!, antiAir: o.aaPerMg } } },
  scenario: {
    ...wideCtx.scenario,
    weather: { ...wideCtx.scenario.weather, initial: "clear" },
    air: {
      us: { strike: strikeCfg(o.usAttack ?? 2), fighters: { groups: o.usFighters ?? 2, replacementPerDay: 0 }, baseControl: o.usControl ?? 1 },
      de: { strike: strikeCfg(1), fighters: { groups: o.deFighters ?? 2, replacementPerDay: 0 }, baseControl: o.deControl ?? 1 },
    },
  },
});
const start = (ctx: SimContext, seed: number, ...units: NewUnit[]) => startScenario(units.map(createUnit), seed, ctx);
const twoTurns = (s: GameState, ctx: SimContext, cmds: HqCommand[]) => {
  const r1 = resolveTurn(s, [], ctx, cmds);
  return { r1, r2: resolveTurn(r1.state, [], ctx) };
};
const MID = { x: 5000, y: 5000 };
const sweep = (side: string, at = MID): HqCommand => ({ side, type: "airSuperiority", target: at });

describe("出撃枠(戦闘機と攻撃機)", () => {
  it("1日の出撃枠は 編隊の数 × 1編隊の1日の出撃回数。空襲は攻撃機の枠、護衛は戦闘機の枠を使い、足りなければ弾く", () => {
    const ctx = ctxWith({ usFighters: 1, usAttack: 1 }); // どちらも 1 × 2 = 2回
    const s = start(ctx, 1, inf("a", 1000, 1000));
    expect(s.airSortiesLeft.us).toEqual({ fighter: A.sortiesPerGroupPerDay, attack: A.sortiesPerGroupPerDay, transport: 0 });
    const r = resolveTurn(s, [], ctx, [
      { side: "us", type: "airStrike", target: { x: 8000, y: 8000 }, escort: 2 },
      sweep("us"), // 戦闘機は護衛で使い切っている
      { side: "us", type: "airStrike", target: { x: 8000, y: 8000 } },
      { side: "us", type: "interdiction", target: { x: 8000, y: 8000 } }, // 攻撃機は使い切っている
    ]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["今日の戦闘機の出撃枠を使い切っています", "今日の攻撃機の出撃枠を使い切っています"]);
  });

  it("期待挙動:失った編隊は持ち越し、翌朝の出撃枠が減る(補充は開始時の数まで)", () => {
    const ctx = ctxWith();
    const lost = { us: { fighters: 0.6, attack: 2 } };
    expect(dailyAirSorties(lost, ctx).us).toMatchObject({ fighter: Math.round(0.6 * A.sortiesPerGroupPerDay), attack: 2 * A.sortiesPerGroupPerDay });
    const withReplacement: SimContext = {
      ...ctx,
      scenario: { ...ctx.scenario, air: { us: { ...ctx.scenario.air.us!, fighters: { groups: 2, replacementPerDay: 0.5 } } } },
    };
    expect(replenishAirGroups(lost, withReplacement).us!.fighters).toBeCloseTo(1.1);
    expect(replenishAirGroups({ us: { fighters: 1.9, attack: 2 } }, withReplacement).us!.fighters).toBeCloseTo(2);
  });
});

describe("空戦と空域ごとの制空", () => {
  it("期待挙動:同じ空域に両陣営の戦闘機がいれば空戦になり、双方が編隊を失う(数で勝る側は失いにくい)", () => {
    const ctx = ctxWith({ usFighters: 3, deFighters: 3 });
    const { r2 } = twoTurns(start(ctx, 1, inf("a", 1000, 1000)), ctx, [sweep("us"), sweep("us"), sweep("us"), sweep("de")]);
    const us = r2.state.airGroups.us!.fighters;
    const de = r2.state.airGroups.de!.fighters;
    expect(us).toBeLessThan(3);
    expect(de).toBeLessThan(3);
    expect(3 - us).toBeLessThan(3 - de);
    expect(r2.hqEvents.filter((e) => e.type === "dogfight")).toHaveLength(2);
  });

  it("別々の空域に出せば空戦にならず、それぞれの空域の制空権だけが動く", () => {
    const ctx = ctxWith();
    const { r2 } = twoTurns(start(ctx, 1, inf("a", 1000, 1000)), ctx, [sweep("us", { x: 1000, y: 1000 }), sweep("de", { x: 9000, y: 9000 })]);
    expect(r2.hqEvents.some((e) => e.type === "dogfight")).toBe(false);
    expect(r2.state.airControl["0,0"]!.us).toBeGreaterThan(0.5);
    expect(r2.state.airControl["2,2"]!.de).toBeGreaterThan(0.5);
    expect(r2.state.airControl["1,1"]!.us).toBeCloseTo(0.5);
  });
  it("期待挙動:制空権は持ち越さない。制空任務を出したターンだけ上がり、出さなければ基準(2陣営なら50%)に戻る", () => {
    const ctx = ctxWith();
    const { r2 } = twoTurns(start(ctx, 1, inf("a", 1000, 1000)), ctx, [sweep("us")]);
    expect(r2.state.airControl["1,1"]!.us).toBeGreaterThan(0.5);
    const r3 = resolveTurn(r2.state, [], ctx);
    expect(r3.state.airControl["1,1"]!.us).toBeCloseTo(0.5);
  });

  it("航空戦力を持つのが1陣営だけなら、その陣営の制空権は100%(迎撃する相手がいない)", () => {
    const ctx: SimContext = { ...wideCtx, scenario: { ...wideCtx.scenario, air: { us: { fighters: { groups: 1, replacementPerDay: 0 } } } } };
    const r = resolveTurn(start(ctx, 1, inf("a", 1000, 1000)), [], ctx);
    expect(r.state.airControl["1,1"]!.us).toBe(1);
  });
});

describe("護衛", () => {
  it("護衛が多いほど迎撃されにくい", () => {
    expect(interceptChance(0, wideCtx, 1)).toBeCloseTo(A.superiority.interceptMax / (1 + A.escortInterceptReduction));
    const count = (escort: number) => {
      const ctx = ctxWith({ usControl: 0.01, deControl: 0.99, usFighters: 3 });
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const { r2 } = twoTurns(start(ctx, seed, inf("a", 1000, 1000)), ctx, [{ side: "us", type: "airStrike", target: { x: 8000, y: 8000 }, escort }]);
        if (r2.hqEvents.some((e) => e.type === "airIntercepted")) n++;
      }
      return n;
    };
    expect(count(2)).toBeLessThan(count(0));
  });

  it("迎撃された攻撃機は編隊を失う", () => {
    const ctx = ctxWith({ usControl: 0.0001, deControl: 0.9999 });
    for (let seed = 1; seed <= 20; seed++) {
      const { r2 } = twoTurns(start(ctx, seed, inf("a", 1000, 1000)), ctx, [{ side: "us", type: "airStrike", target: { x: 8000, y: 8000 } }]);
      if (!r2.hqEvents.some((e) => e.type === "airIntercepted")) continue;
      expect(r2.state.airGroups.us!.attack).toBeCloseTo(2 - A.interceptLossGroups);
      return;
    }
    throw new Error("20戦で一度も迎撃されなかった");
  });
});

describe("対空砲", () => {
  it("期待挙動:対空砲を持つ部隊のまわりを空襲すると、攻撃機の編隊を失い、与える損害も小さい", () => {
    const run = (aa: number) => {
      const ctx = ctxWith({ aaPerMg: aa, usControl: 0.9999, deControl: 0.0001 });
      const { r2 } = twoTurns(start(ctx, 1, inf("a", 1000, 1000), ger("g", 8000, 8000, { formation: "deployed" })), ctx, [
        { side: "us", type: "airStrike", target: { x: 8000, y: 8000 } },
      ]);
      return { loss: 1 - unitOf(r2.state, "g").strength, groups: r2.state.airGroups.us!.attack, flak: r2.hqEvents.some((e) => e.type === "flak") };
    };
    const without = run(0);
    const withAa = run(0.5);
    expect(without.flak).toBe(false);
    expect(withAa.flak).toBe(true);
    expect(withAa.groups).toBeLessThan(2);
    expect(withAa.loss).toBeLessThan(without.loss);
  });

  it("空襲の結果に、効果にかかった倍率(制空権・対空砲)が付く(画面の戦況まとめ用)", () => {
    const ctx = ctxWith({ aaPerMg: 0.5 });
    // 迎撃されなかった戦いを探す(制空権50%なので、迎撃されることがある)
    let rep;
    for (let seed = 1; seed <= 20 && !rep; seed++) {
      const { r2 } = twoTurns(start(ctx, seed, inf("a", 1000, 1000), ger("g", 8000, 8000, { formation: "deployed" })), ctx, [
        { side: "us", type: "airStrike", target: { x: 8000, y: 8000 } },
      ]);
      rep = r2.strikes.find((x) => x.kind === "airStrike");
    }
    if (!rep) throw new Error("20戦とも迎撃された");
    expect(rep.effect.map((f) => f.id).sort()).toEqual(["airControl", "flak"]);
    expect(rep.hits.find((h) => h.unitId === "g")!.strength).toBeGreaterThan(0);
  });
});

describe("補給線への攻撃", () => {
  it("期待挙動:叩いた道路は輸送力が落ち、その先への補給が減る", () => {
    const ctx = ctxWith();
    const depot = { id: "us-dump", side: "us", nodeId: "n0", ammoT: 5000, fuelT: 5000 };
    const supplied = (interdictions: { side: string; target: { x: number; y: number }; until: number }[]) => {
      const u = createUnit(inf("a", 9500, 5200, { ammo: 0 }));
      distributeSupply([u], [{ ...depot }], ctx, interdictions);
      return u.ammo;
    };
    const free = supplied([]);
    const cut = supplied([{ side: "de", target: { x: 5000, y: 5000 }, until: 1e9 }]);
    expect(cut).toBeLessThan(free);
    // 自陣営の攻撃は自陣営の補給を妨げない
    expect(supplied([{ side: "us", target: { x: 5000, y: 5000 }, until: 1e9 }])).toBeCloseTo(free);
  });

  it("期待挙動:範囲を行軍している敵の縦隊を叩き、展開している部隊は叩かない。効果は一定時間続く", () => {
    const ctx = ctxWith({ usControl: 0.9999, deControl: 0.0001 });
    const s = start(ctx, 1, inf("a", 1000, 1000), ger("col", 5000, 5000, { formation: "column" }), ger("dep", 5600, 5000, { formation: "deployed" }));
    const { r2 } = twoTurns(s, ctx, [{ side: "us", type: "interdiction", target: { x: 5000, y: 5000 } }]);
    expect(unitOf(r2.state, "col").strength).toBeLessThan(1);
    expect(unitOf(r2.state, "dep").strength).toBe(1);
    expect(r2.state.interdictions).toHaveLength(1);
    expect(r2.state.interdictions[0]!.until - r2.state.time).toBeGreaterThan(0);
  });
});
