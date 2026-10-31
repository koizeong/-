import { describe, expect, it } from "vitest";
import { createUnit, distance, groupOrders, newGameState, plannedFrontage, resolveTurn, type SimContext, type UnitOrder } from "../src/index.js";
import { inf, unitOf, wideCtx } from "./helpers.js";

const units = () =>
  [
    inf("a", 2000, 2000, { formation: "deployed" }),
    inf("b", 2600, 2000, { formation: "deployed" }),
    inf("c", 3200, 2000, { formation: "deployed" }),
    inf("g", 2600, 1000, { branch: "artillery", formation: "deployed" }),
  ].map(createUnit);
const at = (o: UnitOrder) => o.waypoints![0]!;

describe("まとめた命令の並べ方(groupOrders)", () => {
  it("正面(北)に直角の横一列に並び、隣どうしの帯は重ならず、正面の向きがそろう", () => {
    const us = units();
    const os = groupOrders(us, wideCtx, { target: { x: 5000, y: 6000 }, facing: 0 });
    const line = os.filter((o) => o.unitId !== "g");
    for (const o of line) {
      expect(at(o).y).toBeCloseTo(6000, 6);
      expect(o.facingOnArrival).toBe(0);
    }
    const xs = line.map((o) => ({ id: o.unitId, x: at(o).x })).sort((p, q) => p.x - q.x);
    // 中心が target
    expect((xs[0]!.x + xs.at(-1)!.x) / 2).toBeCloseTo(5000, 6);
    for (let i = 1; i < xs.length; i++) {
      const w = (id: string) => plannedFrontage(us.find((u) => u.id === id)!, wideCtx);
      expect(xs[i]!.x - xs[i - 1]!.x).toBeGreaterThanOrEqual((w(xs[i]!.id) + w(xs[i - 1]!.id)) / 2);
    }
  });

  it("今の左右の並びを保つ(西にいた部隊は西の端へ。経路が交差しない)", () => {
    const os = groupOrders(units(), wideCtx, { target: { x: 5000, y: 6000 }, facing: 0 });
    const x = (id: string) => at(os.find((o) => o.unitId === id)!).x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
    // 東を向くと、北にいる部隊が左(北)の端になる
    const east = groupOrders(
      [inf("n", 0, 3000), inf("s", 0, 1000)].map(createUnit),
      wideCtx,
      { target: { x: 5000, y: 2000 }, facing: 90 },
    );
    const y = (id: string) => at(east.find((o) => o.unitId === id)!).y;
    expect(y("n")).toBeGreaterThan(y("s"));
  });

  it("砲兵は線の後ろ(正面と逆の側)に並ぶ", () => {
    const os = groupOrders(units(), wideCtx, { target: { x: 5000, y: 6000 }, facing: 0, artilleryDepthM: 1500 });
    expect(at(os.find((o) => o.unitId === "g")!).y).toBeCloseTo(4500, 6);
  });

  it("同じ入力なら同じ命令(決定論)", () => {
    const o = { target: { x: 5000, y: 6000 }, facing: 45 };
    expect(groupOrders(units(), wideCtx, o)).toEqual(groupOrders(units(), wideCtx, o));
  });
});

describe("上級部隊単位のまとめた命令の指揮ポイント", () => {
  const ctx: SimContext = {
    ...wideCtx,
    scenario: { ...wideCtx.scenario, commandPoints: { us: 1 } },
    formations: {
      div: { side: "us", units: ["a"] },
      regt: { side: "us", parent: "div", units: ["b", "c"] },
      other: { side: "us", units: ["g"] },
    },
  };
  const run = (orders: UnitOrder[]) => resolveTurn(newGameState(units(), 1), orders, ctx);
  const move = (id: string, group?: string): UnitOrder => ({ unitId: id, waypoints: [{ x: 2600, y: 4000 }], ...(group ? { group } : {}) });

  it("同じ上級部隊(下の上級部隊を含む)の隷下への命令は、合わせて指揮ポイント1つ", () => {
    const r = run([move("a", "div"), move("b", "div"), move("c", "div")]);
    expect(r.rejectedOrders).toEqual([]);
    for (const id of ["a", "b", "c"]) expect(distance(unitOf(r.state, id).pos, units().find((u) => u.id === id)!.pos)).toBeGreaterThan(10);
  });

  it("上級部隊をつけない命令・隷下でない部隊は、1部隊ずつ払う", () => {
    const plain = run([move("a"), move("b")]);
    expect(plain.rejectedOrders.map((x) => x.unitId)).toEqual(["b"]);
    const outsider = run([move("a", "div"), move("g", "div")]);
    expect(outsider.rejectedOrders.map((x) => x.unitId)).toEqual(["g"]);
  });

  it("上級部隊だけを書いた中身のない命令は、命令として数えない", () => {
    const r = run([{ unitId: "a", group: "div" }, move("b")]);
    expect(r.rejectedOrders).toEqual([]);
  });
});
