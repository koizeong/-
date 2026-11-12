import { describe, expect, it } from "vitest";
import { computeFire, createUnit, parseTerrainMap, resolveTurn, Rng, TerrainMap, type GameState, type SimContext, type UnitOrder } from "../src/index.js";
import { ctx, ger, inf, rules, state, unitOf, unwrap } from "./helpers.js";

/** 陣地3まで築ける時間(ターン数) */
const FULL = Math.ceil((rules.entrenchment.hoursToLevel!.at(-1)! * 3600) / ctx.turnSeconds) + 1;

function run(s: GameState, turns: number, orders: UnitOrder[] = [], c: SimContext = ctx): GameState {
  let cur = s;
  for (let i = 0; i < turns; i++) cur = resolveTurn(cur, i === 0 ? orders : [], c).state;
  return cur;
}

/** 強襲が息切れせず、ずっと続くルール(姿勢による陣地の上限だけを見るため) */
const lasting: SimContext = (() => {
  const r = structuredClone(rules);
  delete (r.stances.attack as { effectTurns?: number }).effectTurns;
  return { ...ctx, rules: r };
})();

// 座標はヘルパーのテスト用マップを参照
const PLAIN = { x: 100, y: 100 };
const FOREST = { x: 1500, y: 900 };
const TOWN = { x: 1900, y: 100 };

describe("陣地構築", () => {
  it("展開済みで動かずにいた時間で段が上がり、地形の上限で止まる(町=3)", () => {
    const H = rules.entrenchment.hoursToLevel!;
    const turnsFor = (h: number) => Math.ceil((h * 3600) / ctx.turnSeconds);
    let s = state(inf("a", TOWN.x, TOWN.y, { formation: "deployed" }));
    const levels: number[] = [];
    const total = turnsFor(H[2]!) + 2;
    for (let i = 0; i < total; i++) {
      s = resolveTurn(s, [], ctx).state;
      levels.push(unitOf(s, "a").entrenchment);
    }
    // 各段に上がるターン(1始まり)
    expect(levels.indexOf(1) + 1).toBe(turnsFor(H[0]!));
    expect(levels.indexOf(2) + 1).toBe(turnsFor(H[1]!));
    expect(levels.indexOf(3) + 1).toBe(turnsFor(H[2]!));
    expect(levels.at(-1)).toBe(3);
  });

  it("地形ごとの上限:平地1・森林2", () => {
    const plain = run(state(inf("a", PLAIN.x, PLAIN.y, { formation: "deployed" })), FULL);
    const forest = run(state(inf("a", FOREST.x, FOREST.y, { formation: "deployed" })), FULL);
    expect(unitOf(plain, "a").entrenchment).toBe(1);
    expect(unitOf(forest, "a").entrenchment).toBe(2);
  });

  it("機甲・戦車駆逐は上限が1低い", () => {
    for (const branch of ["armor", "tank_destroyer"]) {
      const s = run(state(inf("t", TOWN.x, TOWN.y, { formation: "deployed", branch })), FULL);
      expect(unitOf(s, "t").entrenchment).toBe(2);
    }
  });

  it("姿勢:防御重視は+1、攻撃重視は-1。範囲は0〜3で頭打ち", () => {
    const def = run(state(inf("a", FOREST.x, FOREST.y, { formation: "deployed", stance: "defense" })), FULL);
    const atk = run(state(inf("a", FOREST.x, FOREST.y, { formation: "deployed", stance: "attack" })), FULL, [], lasting);
    const townDef = run(state(inf("a", TOWN.x, TOWN.y, { formation: "deployed", stance: "defense" })), FULL);
    const plainArmorAtk = run(
      state(inf("a", PLAIN.x, PLAIN.y, { formation: "deployed", stance: "attack", branch: "armor" })),
      FULL,
      [],
      lasting,
    );
    expect(unitOf(def, "a").entrenchment).toBe(3);
    expect(unitOf(atk, "a").entrenchment).toBe(1);
    expect(unitOf(townDef, "a").entrenchment).toBe(3); // 3+1 → 3
    expect(unitOf(plainArmorAtk, "a").entrenchment).toBe(0); // 1-1-1 → 0
  });

  it("期待挙動:動くと0に戻る", () => {
    const s = run(state(inf("a", TOWN.x, TOWN.y, { formation: "deployed" })), FULL);
    expect(unitOf(s, "a").entrenchment).toBe(3);
    const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: TOWN.x - 50, y: TOWN.y }], moveMode: "combat" }], ctx);
    expect(unitOf(r.state, "a").entrenchment).toBe(0);
    // また一から築き直す
    expect(unitOf(r.state, "a").dugInSeconds).toBe(0);
  });

  it("シナリオの開始時に築いてあった陣地は、動かない限り保つ", () => {
    const s = run(state(inf("a", TOWN.x, TOWN.y, { formation: "deployed", entrenchment: 3 })), 2);
    expect(unitOf(s, "a").entrenchment).toBe(3);
  });

  it("期待挙動:縦隊では上がらない", () => {
    const s = run(state(inf("a", TOWN.x, TOWN.y)), 3);
    expect(unitOf(s, "a").formation).toBe("column");
    expect(unitOf(s, "a").entrenchment).toBe(0);
  });

  it("展開が完了したターンには上がらず、次の動かないターンから上がる", () => {
    const s1 = run(state(inf("a", TOWN.x, TOWN.y)), 1, [{ unitId: "a", deployAfterStop: true }]);
    expect(unitOf(s1, "a").formation).toBe("deployed");
    expect(unitOf(s1, "a").entrenchment).toBe(0);
    const s2 = run(s1, 1);
    expect(unitOf(s2, "a").entrenchment).toBe(1);
  });
});

describe("築城の地形(塹壕線・坑道陣地。陣地4・5)", () => {
  // 北の行の西半分が塹壕線、東半分が坑道陣地、南の行は町
  const fort = {
    ...ctx,
    terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { R: "trench", C: "cave", T: "town" }, rows: ["RRRRCCCC", "RRRRCCCC", "TTTTTTTT", "TTTTTTTT"] }))),
  } as SimContext;
  const TRENCH = { x: 400, y: 900 };
  const CAVE = { x: 1600, y: 900 };
  const TOWN2 = { x: 1000, y: 100 };
  const DAY = Math.ceil((24 * 3600) / ctx.turnSeconds) + 1;

  it("期待挙動:塹壕線では4、坑道陣地では5まで上がる。町で死守しても野戦の上限3で止まる", () => {
    expect(unitOf(run(state(inf("a", TRENCH.x, TRENCH.y, { formation: "deployed" })), DAY, [], fort), "a").entrenchment).toBe(4);
    expect(unitOf(run(state(inf("a", CAVE.x, CAVE.y, { formation: "deployed" })), DAY, [], fort), "a").entrenchment).toBe(5);
    expect(unitOf(run(state(inf("a", TOWN2.x, TOWN2.y, { formation: "deployed", stance: "defense" })), DAY, [], fort), "a").entrenchment).toBe(3);
  });

  it("期待挙動:坑道陣地(陣地5)には砲撃がほとんど効かず、陣地3の町の守備隊より受ける損害がずっと小さい", async () => {
    const { computeIndirectFire } = await import("../src/index.js");
    const hit = (pos: { x: number; y: number }, level: number) => {
      const target = createUnit(ger("t", pos.x, pos.y, { formation: "deployed", entrenchment: level }));
      const gun = createUnit(inf("g", 100, 100, { branch: "artillery", toe: "artillery_battalion", formation: "deployed" }));
      const units = [gun, target];
      const r = computeIndirectFire([{ side: "us", unitId: "g", target: { ...pos }, turn: 1 }], units, new Map(units.map((u) => [u.id, u])), fort, Rng.fromSeed(1), new Set(), 0);
      return r.results[0]?.damage ?? 0;
    };
    const town = hit(TOWN2, 3);
    const cave = hit(CAVE, 5);
    expect(town).toBeGreaterThan(0);
    // 陣地の守り(0.12 ÷ 0.3)・砲撃への上乗せ 0.3・地形 0.8 ほど
    expect(cave / town).toBeLessThan(0.2);
  });

  it("陣地に強い武器(火炎放射器など)は、坑道陣地の守りも差し引く", () => {
    const r = structuredClone(rules);
    const pierce = (p: number) => {
      const w = structuredClone(ctx.weapons);
      for (const x of Object.values(w.weapons)) x.entrenchmentPierce = p;
      const c = { ...fort, rules: r, weapons: w } as SimContext;
      const a = createUnit(inf("a", CAVE.x - 400, CAVE.y, { formation: "deployed", facing: 90 }));
      const t = createUnit(ger("t", CAVE.x, CAVE.y, { formation: "deployed", facing: 270, entrenchment: 5 }));
      return computeFire([a, t], c, Rng.fromSeed(1), new Set()).find((x) => x.targetId === "t")?.damage ?? 0;
    };
    expect(pierce(0.5)).toBeGreaterThan(pierce(0) * 2);
  });
});
