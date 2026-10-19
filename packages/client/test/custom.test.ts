import { readFileSync } from "node:fs";
import type { DevelopmentInfo } from "@brigade/protocol";
import { parseRulePack, parseToePack, parseWeaponPack } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { applied, budgetOf, readBundle } from "../src/custom.js";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8")) as unknown;
const ok = <T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T => {
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
};
const toes = ok(parseToePack(read("toe/ww1-korea-generic.json")));
const info: DevelopmentInfo = {
  scenarioId: "x",
  scenarioName: "x",
  development: ok(parseRulePack(read("rulepacks/ww1-korea.json"))).development!,
  weapons: ok(parseWeaponPack(read("weapons/ww1-korea-generic.json"))),
  toes,
  branchNames: { infantry: "歩兵", armor: "機甲" },
  sides: { us: { name: "米", budgetMultiplier: 1, units: [{ id: "a", toe: "infantry_regiment" }, { id: "b", toe: "infantry_regiment" }] } },
  formations: {},
};
const el = toes.toes["infantry_regiment"]!.elements;

describe("装備編成の持ち込み(画面側の計算)", () => {
  it("差し替えの点数:安いテンプレートに替えると合計が下がり、上限は元の合計", () => {
    const bundle = ok(readBundle(JSON.stringify({ version: 1, templates: { small: { name: "小さい連隊", baseToe: "infantry_regiment", elements: [{ ...el[0]!, count: 3 }] } } })));
    const none = budgetOf(info, "us", bundle, {});
    expect(none.used).toBeCloseTo(none.limit);
    const sub = budgetOf(info, "us", bundle, { a: "small" });
    expect(sub.used).toBeLessThan(none.used);
    expect(sub.limit).toBeCloseTo(none.limit);
  });

  it("壊れたテンプレート・武器は、それだけを誤りとして外す", () => {
    const bundle = ok(
      readBundle(
        JSON.stringify({
          version: 1,
          designs: { bad: { name: "x", archetype: "gun", params: { caliberMm: 999 } } },
          templates: { good: { name: "g", baseToe: "infantry_regiment", elements: el }, broken: { name: "b", baseToe: "nope", elements: el } },
        }),
      ),
    );
    const a = applied(info, bundle);
    expect(Object.keys(a.errors).sort()).toEqual(["design:bad", "template:broken"]);
    expect(a.toes["user:good"]).toBeDefined();
  });

  it("持ち込みとして読めないファイル", () => {
    expect(readBundle("{").ok).toBe(false);
    expect(readBundle(JSON.stringify({ version: 2 })).ok).toBe(false);
  });
});
