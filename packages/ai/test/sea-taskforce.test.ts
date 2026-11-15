import { buildScenario, resolveTurn, viewForSide, type LoadedScenario } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide, DEFAULT_AI } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "../../sim-core/test/helpers.js";

type Formation = { name?: string; side: string; parent?: string; units: string[] };
type File = { units: { id: string; x: number; y: number }[]; formations: Record<string, Formation>; rules: Record<string, unknown> };
/** 試験の海戦の西の任務部隊を、空母のいない水上の任務部隊(巡洋艦の戦隊と水雷戦隊)にする */
function surfaceTaskForce(): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as File;
  delete file.formations["w-cvg"]!.parent;
  file.formations["w-crudiv"]!.units = ["w-ca1", "w-ca2"];
  file.formations["w-desron"] = { name: "水雷戦隊", side: "w", parent: "w-tf", units: ["w-dd5", "w-dd6", "w-dd7", "w-dd8"] };
  file.rules.navalSignals = { w: { radio: true } };
  // 敵の水上の艦を見ている(AI は水上戦を予期するときだけ配備を使う)
  file.rules.knownAtStart = [{ side: "w", unitId: "e-ca1" }];
  const r = buildScenario(file as unknown as Record<string, unknown>, loadPacks());
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("AI の任務部隊", () => {
  it("期待挙動:空母のいない任務部隊に、昼は警戒航行序列を命じ(基準はいちばん重い砲の戦隊)、持ち場の戦隊には針路・交戦を出さない", () => {
    const sc = surfaceTaskForce();
    const s0 = sc.start(1);
    const d0 = decide(viewForSide(s0, "w"), sc.ctx, DEFAULT_AI, 1);
    const tfOrder = (d0.seaOrders ?? []).find((o) => o.squadron === "w-tf");
    expect(tfOrder?.disposition).toBe("cruising");
    expect(tfOrder?.guide ?? s0.taskForces!["w-tf"]!.guide).toBe("w-crudiv");
    const s1 = resolveTurn(s0, d0.orders, sc.ctx, d0.hqCommands, d0.seaOrders ?? []).state;
    expect(s1.taskForces!["w-tf"]!.members["w-desron"]).toBeDefined();
    const d1 = decide(viewForSide(s1, "w"), sc.ctx, DEFAULT_AI, 1);
    const desron = (d1.seaOrders ?? []).find((o) => o.squadron === "w-desron");
    expect(desron?.course ?? desron?.toward ?? desron?.engage ?? desron?.follow).toBeUndefined();
  });

  it("敵の航空機だけが見えていて水上の艦を見ていなければ、配備を出さない(航空攻撃だけを受ける艦隊)", () => {
    const file = structuredClone(loadScenarioJson("test-naval")) as File;
    delete file.formations["w-cvg"]!.parent;
    file.formations["w-crudiv"]!.units = ["w-ca1", "w-ca2"];
    file.formations["w-desron"] = { name: "水雷戦隊", side: "w", parent: "w-tf", units: ["w-dd5", "w-dd6", "w-dd7", "w-dd8"] };
    file.rules.knownAtStart = [{ side: "w", unitId: "e-vb" }];
    const r = buildScenario(file as unknown as Record<string, unknown>, loadPacks());
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const d = decide(viewForSide(r.value.start(1), "w"), r.value.ctx, DEFAULT_AI, 1);
    expect((d.seaOrders ?? []).some((o) => o.squadron === "w-tf")).toBe(false);
  });

  it("空母のいる任務部隊には配備を出さない(空母の護衛は前からの決まりで)", () => {
    const sc = (() => {
      const r = buildScenario(loadScenarioJson("test-naval"), loadPacks());
      if (!r.ok) throw new Error(r.errors.join("\n"));
      return r.value;
    })();
    const d = decide(viewForSide(sc.start(1), "w"), sc.ctx, DEFAULT_AI, 1);
    expect((d.seaOrders ?? []).some((o) => o.squadron === "w-tf")).toBe(false);
  });
});

describe("AI の索敵", () => {
  it("期待挙動:索敵機が足りなければ(12機に満たない)、雷撃機の隊から3機を分けて索敵に出す", () => {
    const r = buildScenario(loadScenarioJson("test-naval"), loadPacks());
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const sc = r.value;
    const d = decide(viewForSide(sc.start(1), "w"), sc.ctx, DEFAULT_AI, 1);
    const search = d.orders.filter((o) => o.air?.kind === "search");
    expect(search.some((o) => o.unitId === "w-vs")).toBe(true);
    const borrowed = search.find((o) => o.unitId === "w-vt");
    expect(borrowed?.air).toMatchObject({ kind: "search", aircraft: 3 });
  });
});
