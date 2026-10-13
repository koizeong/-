import { describe, expect, it } from "vitest";
import { resolveTurn } from "../src/index.js";
import { branches, ctx, inf, rules, state, unitOf, withoutFatigue } from "./helpers.js";

const infMarchPerMin = branches.branches.infantry!.marchSpeedMpm;
const infMarchPerTurn = infMarchPerMin * 30; // m / 30分

describe("移動", () => {
  // 平地(x < 1000)を通る最初の10分間だけで速度を比べる
  it("行軍は兵科の行軍速度で進み、縦隊になる", () => {
    const s0 = state(inf("a", 100, 100, { formation: "deployed" }));
    const r = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 1900, y: 100 }], moveMode: "march" }], withoutFatigue(ctx));
    expect(r.tracks.a![10]!.x - 100).toBeCloseTo(infMarchPerMin * 10);
    const a = unitOf(r.state, "a");
    expect(a.formation).toBe("column");
    expect(a.facing).toBeCloseTo(90);
  });

  it("戦闘移動は行軍より遅い(展開済みから)", () => {
    const order = (mode: "march" | "combat") => [{ unitId: "a", waypoints: [{ x: 1900, y: 100 }], moveMode: mode }];
    const march = resolveTurn(state(inf("a", 100, 100, { formation: "deployed" })), order("march"), withoutFatigue(ctx));
    const combat = resolveTurn(state(inf("a", 100, 100, { formation: "deployed" })), order("combat"), withoutFatigue(ctx));
    const dm = march.tracks.a![10]!.x - 100;
    const dc = combat.tracks.a![10]!.x - 100;
    expect(dc).toBeCloseTo(dm * rules.combatMoveSpeedRatio);
    expect(unitOf(combat.state, "a").formation).toBe("deployed");
  });

  it("森林では平地より遅い", () => {
    // 北側の行:西が平地、東が森林
    const plain = resolveTurn(state(inf("a", 10, 900)), [{ unitId: "a", waypoints: [{ x: 10, y: 0 }] }], ctx);
    const forest = resolveTurn(state(inf("a", 1500, 990)), [{ unitId: "a", waypoints: [{ x: 1500, y: 600 }] }], ctx);
    const dPlain = 900 - unitOf(plain.state, "a").pos.y;
    const dForest = 990 - unitOf(forest.state, "a").pos.y;
    expect(dForest).toBeLessThan(dPlain);
  });

  it("経由点を順にたどり、到着後は指定した正面を向く", () => {
    const s0 = state(inf("a", 0, 0));
    const r = resolveTurn(
      s0,
      [{ unitId: "a", waypoints: [{ x: 300, y: 0 }, { x: 300, y: 300 }], facingOnArrival: 270 }],
      ctx,
    );
    const a = unitOf(r.state, "a");
    expect(a.pos).toEqual({ x: 300, y: 300 });
    expect(a.facing).toBe(270);
    expect(a.route).toEqual([]);
    expect(r.events.some((e) => e.type === "arrived" && e.unitId === "a")).toBe(true);
  });

  it("新しい目的地だけを送ると、前の「到着後の正面」は引き継がない", () => {
    const r1 = resolveTurn(
      state(inf("a", 0, 0)),
      [{ unitId: "a", waypoints: [{ x: 100, y: 0 }], facingOnArrival: 270 }],
      ctx,
    );
    const r2 = resolveTurn(r1.state, [{ unitId: "a", waypoints: [{ x: 100, y: 200 }] }], ctx);
    expect(unitOf(r2.state, "a").facing).toBeCloseTo(0);
  });

  it("未到達の経由点は次ターンも保持され、命令なしで進み続ける", () => {
    const far = { x: 0, y: 100 + infMarchPerTurn * 1.5 };
    const r1 = resolveTurn(state(inf("a", 0, 100)), [{ unitId: "a", waypoints: [far] }], ctx);
    expect(unitOf(r1.state, "a").route).toEqual([far]);
    const r2 = resolveTurn(r1.state, [], ctx);
    expect(unitOf(r2.state, "a").pos).toEqual(far);
  });

  it("再生用の軌跡を小ステップごとに返す", () => {
    const r = resolveTurn(state(inf("a", 0, 0)), [{ unitId: "a", waypoints: [{ x: 5000, y: 0 }] }], ctx);
    const track = r.tracks.a!;
    expect(track).toHaveLength(ctx.turnSeconds / ctx.stepSeconds + 1);
    expect(track[0]!.t).toBe(0);
    expect(track.at(-1)!.t).toBe(ctx.turnSeconds);
    for (let i = 1; i < track.length; i++) expect(track[i]!.x).toBeGreaterThanOrEqual(track[i - 1]!.x);
  });

  it("入力の状態を書き換えず、同じ入力からは同じ結果になる", () => {
    const s0 = state(inf("a", 0, 0), inf("b", 500, 500));
    const orders = [{ unitId: "a", waypoints: [{ x: 1000, y: 0 }] }, { unitId: "b", waypoints: [{ x: 0, y: 0 }] }];
    const snapshot = JSON.stringify(s0);
    const r1 = resolveTurn(s0, orders, ctx);
    const r2 = resolveTurn(s0, orders, ctx);
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(r1).toEqual(r2);
    expect(r1.state.turn).toBe(2);
    expect(r1.state.time).toBe(1800);
  });

  it("不正な命令は弾いて理由を返し、他の命令は通す", () => {
    const r = resolveTurn(
      state(inf("a", 0, 0)),
      [
        { unitId: "ghost", waypoints: [{ x: 1, y: 1 }] },
        { unitId: "a", stance: "berserk" },
        { unitId: "a", waypoints: [{ x: 100, y: 0 }] },
      ],
      ctx,
    );
    expect(r.rejectedOrders.map((x) => x.unitId)).toEqual(["ghost", "a"]);
    expect(unitOf(r.state, "a").pos).toEqual({ x: 100, y: 0 });
  });
});
