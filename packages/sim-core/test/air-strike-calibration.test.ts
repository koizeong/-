import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, type GameState, type SeaOrder, type UnitOrder } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/** 試験の海戦:両艦隊を止め、西の急降下爆撃機18機・雷撃機15機で東の空母を攻撃する(cap なら東の戦闘機18機が上空直衛) */
function strike(seed: number, cap: boolean) {
  const f = structuredClone(loadScenarioJson("test-naval")) as { units: { id: string; side: string; toe: string; x: number }[]; rules: Record<string, unknown> };
  for (const u of f.units) if (u.side === "e") u.x -= 20000;
  f.rules.knownAtStart = f.units.filter((u) => u.side === "e" && !u.toe.startsWith("air")).map((u) => ({ side: "w", unitId: u.id }));
  const sc = buildScenario(f, packs);
  if (!sc.ok) throw new Error(sc.errors.join("\n"));
  const ctx = { ...sc.value.ctx, rules: { ...sc.value.ctx.rules, naval: { ...sc.value.ctx.rules.naval!, turn: undefined } } };
  let s: GameState = sc.value.start(seed);
  const contact = s.intel["w"]!.entries["e-cv"]!.contactId;
  const orders: UnitOrder[] = [
    { unitId: "w-vb", air: { kind: "strike", target: contact } },
    { unitId: "w-vt", air: { kind: "strike", target: contact } },
  ];
  if (cap) orders.push({ unitId: "e-vf", air: { kind: "cap", over: "e-tf" } });
  const stop: SeaOrder[] = ["w-cvg", "w-crudiv", "e-cvg", "e-crudiv"].map((q) => ({ squadron: q, speed: "stop" }));
  let r = resolveTurn(s, orders, ctx, [], stop);
  let capMin = 1;
  for (let k = 0; k < 5; k++) {
    s = r.state;
    capMin = Math.min(capMin, s.units.find((u) => u.id === "e-vf")?.strength ?? capMin);
    r = resolveTurn(s, [], ctx);
  }
  s = r.state;
  const str = (id: string) => s.units.find((u) => u.id === id)?.strength ?? 0;
  return { carrier: str("e-cv"), strikeLoss: (18 * (1 - str("w-vb")) + 15 * (1 - str("w-vt"))) / 33, capLoss: 1 - capMin };
}

describe("航空攻撃の当たりと損害の合わせ込み(ユーザー判断:艦が固すぎて当たらない、の直し)", () => {
  const seeds = [1, 2, 3, 4];
  it("期待挙動:上空直衛のない空母への33機の攻撃は、空母を大きく傷つける(半分以上の試合で戦力半分未満)。攻撃隊の損失は1〜2割", () => {
    const rs = seeds.map((s) => strike(s, false));
    expect(rs.filter((r) => r.carrier < 0.5).length).toBeGreaterThanOrEqual(2);
    for (const r of rs) expect(r.strikeLoss).toBeLessThan(0.25);
  });

  it("期待挙動:護衛のない攻撃隊が上空直衛に当たると2.5〜8割を失う(ミッドウェーの雷撃隊のように)。直衛の戦闘機は攻撃隊の旋回機銃では大きく減らない", () => {
    const rs = seeds.map((s) => strike(s, true));
    for (const r of rs) {
      expect(r.strikeLoss).toBeGreaterThan(0.25);
      expect(r.strikeLoss).toBeLessThan(0.8);
      expect(r.capLoss).toBeLessThan(0.3);
    }
  });
});
