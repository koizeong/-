import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildScenario, contentHash, resolveTurn } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
const base = () => structuredClone(loadScenarioJson("test-symmetric")) as Record<string, any>;

describe("シナリオファイル", () => {
  it("同梱のシナリオはすべて読み込め、1ターン解決できる", () => {
    const names = readdirSync(new URL("../../../data/scenarios/", import.meta.url))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const r = buildScenario(loadScenarioJson(name), packs);
      if (!r.ok) throw new Error(`${name}:\n${r.errors.join("\n")}`);
      const s = r.value.start(1);
      expect(s.units.length).toBeGreaterThan(0);
      expect(() => resolveTurn(s, [], r.value.ctx)).not.toThrow();
    }
  });

  it("兵科は編成表から決まり、姿勢は既定値になる", () => {
    const r = buildScenario(base(), packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const arm = r.value.units.find((u) => u.id === "us-arm")!;
    expect(arm.branch).toBe("armor");
    expect(arm.stance).toBe(packs.rules["ww1-korea"]!.defaultStance);
  });

  it("壊れたシナリオは、参照切れや配置の誤りを場所つきでまとめて返す", () => {
    const def = base();
    def.units.push({ id: "us-inf1", side: "us", toe: "infantry_regiment", x: 100, y: 100, facing: 0 }); // ID重複
    def.units.push({ id: "ghost", side: "xx", toe: "infantry_regiment", x: 100, y: 100, facing: 0 }); // 陣営なし
    def.units.push({ id: "phantom", side: "us", toe: "no_such_toe", x: 100, y: 100, facing: 0 }); // 編成表なし
    def.units.push({ id: "far", side: "us", toe: "infantry_regiment", x: 99999, y: 100, facing: 0 }); // マップの外
    def.rules.objectives[0].initialHolder = "zz";
    const r = buildScenario(def, packs);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join("\n");
    expect(all).toContain("units.10(us-inf1): IDが重複しています");
    expect(all).toContain('units.11(ghost).side: 陣営 "xx" が sides にありません');
    expect(all).toContain('units.12(phantom).toe: 編成表 "no_such_toe" がありません');
    expect(all).toContain("units.13(far): 位置 (99999, 100) がマップの外です");
    expect(all).toContain('rules.objectives.0.initialHolder: 陣営 "zz" が sides にありません');
  });

  it("入れない地形への配置と、存在しないパック・道路ノードを指摘する", () => {
    const def = base();
    def.map.legend["~"] = "large_river";
    def.map.rows[0] = "~" + def.map.rows[0].slice(1);
    def.units.push({ id: "swimmer", side: "us", toe: "infantry_regiment", x: 125, y: 9875, facing: 0 });
    def.depots.push({ id: "lost", side: "us", nodeId: "nowhere", ammoT: 1, fuelT: 1 });
    const r = buildScenario(def, packs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join("\n")).toContain("units.10(swimmer): 位置 (125, 9875) は入れない地形");
    }
    const noPack = base();
    noPack.packs.weapons = "missing";
    const r2 = buildScenario(noPack, packs);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors).toEqual(['packs.weapons: 武器パック "missing" がありません']);
    const badDepot = base();
    badDepot.depots.push({ id: "lost", side: "us", nodeId: "nowhere", ammoT: 1, fuelT: 1 });
    const r3 = buildScenario(badDepot, packs);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.errors.join("\n")).toContain('集積所 lost: 道路ノード "nowhere" がありません');
  });

  it("形式の誤りはスキーマのエラーとして返す", () => {
    const def = base();
    delete def.time;
    const r = buildScenario(def, packs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith("time"))).toBe(true);
  });
});

describe("内容のハッシュ(構成の照合)", () => {
  const hashOf = (def: unknown, p = packs) => {
    const r = buildScenario(def, p);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return r.value.hash;
  };

  it("同じ内容なら同じ。キーの順序には依存しない", () => {
    expect(hashOf(base())).toBe(hashOf(base()));
    expect(contentHash({ a: 1, b: [1, 2, { c: 3, d: 4 }] })).toBe(contentHash({ b: [1, 2, { d: 4, c: 3 }], a: 1 }));
  });

  it("シナリオやパックの数値が1つでも違えば変わる", () => {
    const changed = base();
    changed.units[0].x += 250;
    expect(hashOf(changed)).not.toBe(hashOf(base()));
    const tweaked = structuredClone(packs);
    tweaked.weapons["ww1-korea-generic"]!.weapons.machine_gun!.bands[0]!.power += 0.1;
    expect(hashOf(base(), tweaked)).not.toBe(hashOf(base()));
  });
});
