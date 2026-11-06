import { describe, expect, it } from "vitest";
import { buildScenario, distance, flagshipOf, resolveTurn, shipFireToe, toeFire, type GameState, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
function load(): LoadedScenario {
  const r = buildScenario(loadScenarioJson("test-naval") as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
const sc = load();
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const byId = (s: GameState) => new Map(s.units.map((u) => [u.id, u]));

describe("1隻ずつの艦と戦隊", () => {
  it("命令は戦隊の旗艦に出す。ほかの艦への命令は弾く", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-ca2", waypoints: [{ x: 40500, y: 50500 }] }], sc.ctx);
    expect(r.rejectedOrders[0]).toMatchObject({ unitId: "w-ca2" });
    expect(r.rejectedOrders[0]!.reason).toContain("旗艦(w-ca1)");
  });

  it("期待挙動:単縦陣の戦隊は、旗艦の後ろへ 600m 間隔の一列になってついて行く", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 50500, y: 50500 }], facingOnArrival: 90 }], sc.ctx);
    const lead = unit(r.state, "w-ca1");
    expect(lead.pos.x).toBeGreaterThan(40000);
    for (const [i, id] of ["w-ca2", "w-dd5", "w-dd6", "w-dd7", "w-dd8"].entries()) {
      const u = unit(r.state, id);
      expect(u.pos.x).toBeCloseTo(lead.pos.x - 600 * (i + 1), -2);
      expect(Math.abs(u.pos.y - lead.pos.y)).toBeLessThan(200);
    }
  });

  it("期待挙動:輪形陣の戦隊は、旗艦(空母)を中心に円く囲む", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-cv", waypoints: [{ x: 30500, y: 50500 }], facingOnArrival: 90 }], sc.ctx);
    const cv = unit(r.state, "w-cv");
    for (const id of ["w-dd1", "w-dd2", "w-dd3", "w-dd4"]) expect(distance(unit(r.state, id).pos, cv.pos)).toBeCloseTo(1500, -2);
  });

  it("期待挙動:傷ついた艦は遅く、戦隊はいちばん遅い艦に合わせて進む", () => {
    const go = (damaged: boolean) => {
      const s = sc.start(1);
      if (damaged) unit(s, "w-dd8").strength = 0.4;
      const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 150500, y: 50500 }] }], sc.ctx);
      return unit(r.state, "w-ca1").pos.x - unit(s, "w-ca1").pos.x;
    };
    // 駆逐艦(35ノット)は失った浮力 0.6 × 0.6 = 速力 36% 減で 22.4ノット。無傷なら重巡(33ノット)がいちばん遅い
    expect(go(true) / go(false)).toBeCloseTo((35 * 0.64) / 33, 2);
  });

  it("旗艦が沈めば、次の艦が旗艦を継ぐ", () => {
    const s = sc.start(1);
    unit(s, "w-ca1").strength = 0;
    expect(flagshipOf(unit(s, "w-dd5"), byId(s), sc.ctx).id).toBe("w-ca2");
    const r = resolveTurn(s, [{ unitId: "w-ca2", waypoints: [{ x: 40500, y: 50500 }] }], sc.ctx);
    expect(r.rejectedOrders).toEqual([]);
  });

  it("期待挙動:撃つ方位へ向けられる砲の数だけ撃つ(重巡の主砲は片舷9門・艦首6門・艦尾3門)", () => {
    const toe = sc.ctx.toes.toes["gen_ca"]!;
    const fp = (arc: "bow" | "beam" | "stern") => toeFire(shipFireToe(toe, arc), sc.ctx.weapons, 15000, 0.5, false, undefined, undefined, (w) => !!w.torpedo).firepower;
    expect(fp("beam") / fp("bow")).toBeCloseTo(1.5, 1);
    expect(fp("bow") / fp("stern")).toBeGreaterThan(1.8);
  });
});
