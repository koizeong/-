import { describe, expect, it } from "vitest";
import { tutorialDone, type GameState } from "../src/game.js";

const base = { phase: "planning", selected: null, orders: {}, hq: [], view: { turn: 1 } } as unknown as GameState;
const st = (p: Partial<GameState>) => ({ ...base, ...p }) as GameState;

describe("手引きの進む条件", () => {
  it("部隊を選んだ", () => {
    expect(tutorialDone({ type: "select", unitId: "a" }, st({ selected: "b" }))).toBe(false);
    expect(tutorialDone({ type: "select", unitId: "a" }, st({ selected: "a" }))).toBe(true);
  });
  it("命令の項目:経由点は空では満たさない。value があればその値のときだけ", () => {
    const until = { type: "order", unitId: "a", field: "waypoints" } as const;
    expect(tutorialDone(until, st({ orders: { a: { unitId: "a", waypoints: [] } } }))).toBe(false);
    expect(tutorialDone(until, st({ orders: { a: { unitId: "a", waypoints: [{ x: 1, y: 1 }] } } }))).toBe(true);
    const deploy = { type: "order", unitId: "a", field: "deployAfterStop", value: true } as const;
    expect(tutorialDone(deploy, st({ orders: { a: { unitId: "a", deployAfterStop: false } } }))).toBe(false);
    expect(tutorialDone(deploy, st({ orders: { a: { unitId: "a", deployAfterStop: true } } }))).toBe(true);
  });
  it("司令部コマンドと、ターンが進んだこと(再生が終わって作戦フェイズになってから)", () => {
    expect(tutorialDone({ type: "hq", command: "fireMission" }, st({ hq: [{ side: "us", type: "fireMission", unitId: "x", target: { x: 0, y: 0 } }] }))).toBe(true);
    const turn2 = { type: "turn", atLeast: 2 } as const;
    expect(tutorialDone(turn2, st({ phase: "replay", view: { turn: 2 } as GameState["view"] }))).toBe(false);
    expect(tutorialDone(turn2, st({ phase: "planning", view: { turn: 2 } as GameState["view"] }))).toBe(true);
  });
});
