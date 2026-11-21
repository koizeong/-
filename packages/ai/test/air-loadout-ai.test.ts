import { buildScenario, viewForSide } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide, DEFAULT_AI } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "../../sim-core/test/helpers.js";

type File = { units: { id: string; side: string; toe: string; x: number }[]; rules: Record<string, unknown> };

/** 試験の海戦:西の艦攻を爆装(水平爆撃)で始め、東の空母の位置を始めから知っている(間合いを詰めて攻撃の届く所に) */
function scenario(knowCarrier: boolean) {
  const f = structuredClone(loadScenarioJson("test-naval")) as File;
  for (const u of f.units) {
    if (u.id === "w-vt") u.toe = "air_torpedo_group@bomb";
    if (u.side === "e") u.x -= 40000;
  }
  if (knowCarrier) f.rules.knownAtStart = [{ side: "w", unitId: "e-cv" }];
  const r = buildScenario(f, loadPacks());
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("AI の兵装の積み替え", () => {
  it("期待挙動:敵の空母を見つけていて、爆装の艦攻の効き目が雷装の半分に満たなければ、出さずに雷装へ積み替える", () => {
    const sc = scenario(true);
    const d = decide(viewForSide(sc.start(1), "w"), sc.ctx, DEFAULT_AI, 1);
    const vt = d.orders.find((o) => o.unitId === "w-vt");
    expect(vt?.air).toEqual({ kind: "rearm", loadout: "torpedo" });
    // 兵装を選べない急降下爆撃機は積み替えない
    expect(d.orders.some((o) => o.unitId === "w-vb" && o.air?.kind === "rearm")).toBe(false);
  });

  it("母艦の隊は、敵の艦を知らない間は艦に効く兵装を地上向けに替えない(敵の艦隊に備える)", () => {
    const f = structuredClone(loadScenarioJson("test-naval")) as File;
    const r = buildScenario(f, loadPacks());
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const d = decide(viewForSide(r.value.start(1), "w"), r.value.ctx, DEFAULT_AI, 1);
    expect(d.orders.some((o) => o.air?.kind === "rearm")).toBe(false);
  });
});
