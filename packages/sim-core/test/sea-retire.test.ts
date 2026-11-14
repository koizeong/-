import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, type GameState, type LoadedScenario, type SimContext } from "../src/index.js";
import { newHull } from "../src/sea/damage.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
type File = { units: { id: string; x: number; y: number; facing: number }[]; rules: Record<string, unknown> };
function load(edit: (f: File) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as File;
  file.rules.knownAtStart = [];
  edit(file);
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
const fixed = (ctx: SimContext): SimContext => ({ ...ctx, rules: { ...ctx.rules, naval: { ...ctx.rules.naval!, turn: undefined } } });
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
/** 艦の機関を壊して遅くする */
const cripple = (s: GameState, id: string, engine = 0.6): GameState => ({ ...s, units: s.units.map((u) => (u.id === id ? { ...u, hull: { ...(u.hull ?? newHull()), engine } } : u)) });
const westEdge = { side: "w", edge: "west", depthM: 5000, x: 0, y: 50000, fromTurn: 1 };

describe("落伍艦の心得と退避群", () => {
  it("期待挙動:遅くなった艦は戦隊から外れて退避群になり、命令なしで脱出路(自陣営の後ろの端)へ全速で退く", () => {
    const sc = load((f) => (f.rules.escapeRoutes = [westEdge]));
    const ctx = fixed(sc.ctx);
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "battle" }]).state;
    s = cripple(s, "w-ca2");
    const x0 = unit(s, "w-ca2").pos.x;
    const r = resolveTurn(s, [], ctx);
    expect(r.events.some((e) => e.unitId === "w-ca2" && e.type === "shipDetached")).toBe(true);
    const sq = r.state.squadrons!["w-ca2"]!;
    expect(sq.retiring).toBe(true);
    expect(sq.speed).toBe("flank");
    // 東へ進んでいた戦隊から外れ、西の端へ向かう
    expect(unit(r.state, "w-ca2").pos.x).toBeLessThan(x0);
    expect(r.state.squadrons!["w-crudiv"]!.ships).not.toContain("w-ca2");
  });

  it("期待挙動:退避群の艦は脱出路に着くと戦場を去るが、艦隊の撤退ではないので負けにならない。命令を出すと手で指揮する戦隊に戻る", () => {
    const sc = load((f) => {
      f.rules.escapeRoutes = [westEdge];
      // 巡洋艦の戦隊を西の端の近くに置く
      for (const u of f.units) if (/^w-(ca|dd[5-8])/.test(u.id)) u.x -= 14000;
    });
    const ctx = fixed(sc.ctx);
    let s = cripple(sc.start(1), "w-ca2");
    let r = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", course: 0, speed: "slow" }]);
    s = r.state;
    for (let i = 0; i < 3 && s.units.some((u) => u.id === "w-ca2"); i++) {
      r = resolveTurn(s, [], ctx);
      s = r.state;
    }
    expect(s.units.some((u) => u.id === "w-ca2")).toBe(false);
    expect((s.escaped ?? []).some((u) => u.id === "w-ca2")).toBe(true);
    expect(s.retreatedSides ?? []).not.toContain("w");

    // 手で指揮:退避群の戦隊に命令を出すと retiring が消え、その命令どおりに動く
    const sc2 = load();
    const ctx2 = fixed(sc2.ctx);
    let t = resolveTurn(sc2.start(1), [], ctx2, [], [{ squadron: "w-crudiv", course: 90, speed: "battle" }]).state;
    t = resolveTurn(cripple(t, "w-ca2"), [], ctx2).state;
    expect(t.squadrons!["w-ca2"]!.retiring).toBe(true);
    const m = resolveTurn(t, [], ctx2, [], [{ squadron: "w-ca2", course: 90 }]).state;
    expect(m.squadrons!["w-ca2"]!.retiring).toBeUndefined();
  });

  it("期待挙動:「落伍した主力艦に駆逐艦を付ける」戦隊では、落伍した巡洋艦に駆逐艦が1隻ついて一緒に退く", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "battle", escortCripples: true }]).state;
    const r = resolveTurn(cripple(s, "w-ca2"), [], ctx);
    const sq = r.state.squadrons!["w-ca2"]!;
    expect(sq.ships).toHaveLength(2);
    expect(r.state.units.find((u) => u.id === sq.ships[1])!.toe).toBe("gen_dd");
    expect(r.state.squadrons!["w-crudiv"]!.ships).not.toContain(sq.ships[1]);
    // 付けない戦隊(既定)では1隻で退く
    s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "battle" }]).state;
    expect(resolveTurn(cripple(s, "w-ca2"), [], ctx).state.squadrons!["w-ca2"]!.ships).toEqual(["w-ca2"]);
  });

  it("期待挙動:自沈は動けないか大破した艦だけ。沈めた艦の残りの戦力は敵の戦果(損耗)に数えない", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    const s = sc.start(1);
    const healthy = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", scuttle: ["w-ca2"] }]);
    expect(healthy.rejectedSeaOrders?.some((x) => x.reason.includes("自沈できません")) ?? false).toBe(true);
    expect(healthy.state.units.some((u) => u.id === "w-ca2")).toBe(true);
    const wrecked = { ...s, units: s.units.map((u) => (u.id === "w-ca2" ? { ...u, strength: 0.1 } : u)) };
    const r = resolveTurn(wrecked, [], ctx, [], [{ squadron: "w-crudiv", scuttle: ["w-ca2"] }]);
    expect(r.events.some((e) => e.unitId === "w-ca2" && e.type === "shipScuttled")).toBe(true);
    expect(r.state.units.some((u) => u.id === "w-ca2")).toBe(false);
    // 分母から残りの戦力(0.1 の分)を除くので、陣営の損耗は戦力が減った分(0.9)だけ
    const before = s.forceTotals["w"]!;
    expect(r.state.forceTotals["w"]!).toBeLessThan(before);
  });

  it("期待挙動:退避群は傷ついた分だけ逃げ足が落ちる(retiringSpeedFloor)", () => {
    const run = (strength: number) => {
      const sc = load();
      const ctx = fixed(sc.ctx);
      let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "battle" }]).state;
      s = cripple(s, "w-ca2");
      // 艦の戦力は船体の損傷(structure)から決まるので、船体を傷つけて戦力を下げる
      s = { ...s, units: s.units.map((u) => (u.id === "w-ca2" ? { ...u, strength, hull: { ...u.hull!, structure: 1 - strength } } : u)) };
      s = resolveTurn(s, [], ctx).state;
      const a = unit(s, "w-ca2").pos;
      const b = unit(resolveTurn(s, [], ctx).state, "w-ca2").pos;
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(run(0.3)).toBeLessThan(run(0.9) * 0.9);
  });

  it("期待挙動:脱出路から去る大破した艦は、確率で帰り道に沈み(損耗に数える)、無傷に近い艦は沈まない", () => {
    const go = (strength: number) => {
      const sc = load((f) => {
        f.rules.escapeRoutes = [westEdge];
        for (const u of f.units) if (/^w-(ca|dd[5-8])/.test(u.id)) u.x -= 14000;
      });
      const base = fixed(sc.ctx);
      // 確率を1に(below 0.6 の艦はかならず沈む)
      const ctx = { ...base, rules: { ...base.rules, naval: { ...base.rules.naval!, crew: { ...base.rules.naval!.crew!, retiredSink: { below: 0.6, maxChance: 1 } } } } };
      let s = cripple(sc.start(1), "w-ca2");
      s = { ...s, units: s.units.map((u) => (u.id === "w-ca2" ? { ...u, strength, hull: { ...u.hull!, structure: 1 - strength } } : u)) };
      const types: string[] = [];
      let r = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", course: 0, speed: "slow" }]);
      for (let i = 0; i < 4; i++) {
        types.push(...r.events.filter((e) => e.unitId === "w-ca2").map((e) => e.type));
        if (!r.state.units.some((u) => u.id === "w-ca2")) break;
        r = resolveTurn(r.state, [], ctx);
      }
      return { types, escaped: (r.state.escaped ?? []).some((u) => u.id === "w-ca2") };
    };
    const wreck = go(0.05);
    expect(wreck.types).toContain("shipLostRetiring");
    expect(wreck.escaped).toBe(false);
    const fine = go(0.95);
    expect(fine.types).toContain("shipLeft");
    expect(fine.escaped).toBe(true);
  });

  it("期待挙動:暗いときは、初めて撃たれてから20分は大破しても戦列を離れない(夜の奇襲の直後)。昼はすぐに離れる", () => {
    const go = (dark: boolean) => {
      const sc = load((f) => {
        if (dark) f.rules.darkTurns = [{ from: 1, to: 3 }];
        // 東の巡洋艦の戦隊を、西の巡洋艦の戦隊のすぐ東に置く(見えて撃ち合う距離)
        for (const u of f.units) if (/^e-(ca|dd[5-8])/.test(u.id)) u.x -= 125000;
      });
      const ctx = fixed(sc.ctx);
      let s = sc.start(1);
      s = { ...s, units: s.units.map((u) => (u.id === "w-ca1" ? { ...u, strength: 0.4, hull: { ...(u.hull ?? newHull()), structure: 0.6 } } : u)) };
      return resolveTurn(s, [], ctx).events.some((e) => e.unitId === "w-ca1" && e.type === "shipBrokeOff");
    };
    expect(go(false)).toBe(true);
    expect(go(true)).toBe(false);
  });
});
