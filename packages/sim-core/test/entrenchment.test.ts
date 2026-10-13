import { describe, expect, it } from "vitest";
import { resolveTurn, type GameState, type UnitOrder } from "../src/index.js";
import { ctx, inf, state, unitOf } from "./helpers.js";

function run(s: GameState, turns: number, orders: UnitOrder[] = []): GameState {
  let cur = s;
  for (let i = 0; i < turns; i++) cur = resolveTurn(cur, i === 0 ? orders : [], ctx).state;
  return cur;
}

// 座標はヘルパーのテスト用マップを参照
const PLAIN = { x: 100, y: 100 };
const FOREST = { x: 1500, y: 900 };
const TOWN = { x: 1900, y: 100 };

describe("陣地構築", () => {
  it("展開済みで動かないと毎ターン1段ずつ上がり、地形の上限で止まる(町=3)", () => {
    let s = state(inf("a", TOWN.x, TOWN.y, { formation: "deployed" }));
    const levels: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = resolveTurn(s, [], ctx).state;
      levels.push(unitOf(s, "a").entrenchment);
    }
    expect(levels).toEqual([1, 2, 3, 3, 3]);
  });

  it("地形ごとの上限:平地1・森林2", () => {
    const plain = run(state(inf("a", PLAIN.x, PLAIN.y, { formation: "deployed" })), 4);
    const forest = run(state(inf("a", FOREST.x, FOREST.y, { formation: "deployed" })), 4);
    expect(unitOf(plain, "a").entrenchment).toBe(1);
    expect(unitOf(forest, "a").entrenchment).toBe(2);
  });

  it("機甲・戦車駆逐は上限が1低い", () => {
    for (const branch of ["armor", "tank_destroyer"]) {
      const s = run(state(inf("t", TOWN.x, TOWN.y, { formation: "deployed", branch })), 4);
      expect(unitOf(s, "t").entrenchment).toBe(2);
    }
  });

  it("姿勢:防御重視は+1、攻撃重視は-1。範囲は0〜3で頭打ち", () => {
    const def = run(state(inf("a", FOREST.x, FOREST.y, { formation: "deployed", stance: "defense" })), 4);
    const atk = run(state(inf("a", FOREST.x, FOREST.y, { formation: "deployed", stance: "attack" })), 4);
    const townDef = run(state(inf("a", TOWN.x, TOWN.y, { formation: "deployed", stance: "defense" })), 5);
    const plainArmorAtk = run(
      state(inf("a", PLAIN.x, PLAIN.y, { formation: "deployed", stance: "attack", branch: "armor" })),
      3,
    );
    expect(unitOf(def, "a").entrenchment).toBe(3);
    expect(unitOf(atk, "a").entrenchment).toBe(1);
    expect(unitOf(townDef, "a").entrenchment).toBe(3); // 3+1 → 3
    expect(unitOf(plainArmorAtk, "a").entrenchment).toBe(0); // 1-1-1 → 0
  });

  it("期待挙動:動くと0に戻る", () => {
    const s = run(state(inf("a", TOWN.x, TOWN.y, { formation: "deployed" })), 3);
    expect(unitOf(s, "a").entrenchment).toBe(3);
    const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: TOWN.x - 50, y: TOWN.y }], moveMode: "combat" }], ctx);
    expect(unitOf(r.state, "a").entrenchment).toBe(0);
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
