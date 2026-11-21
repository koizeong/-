import { describe, expect, it } from "vitest";
import { buildScenario, type Unit } from "../src/index.js";
import { computeAirCombat } from "../src/air-groups.js";
import { Rng } from "../src/rng.js";
import type { SimContext } from "../src/context.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

/**
 * 試験の海戦の東の空母の上に、西の攻撃隊(と護衛の戦闘機)を「攻撃中」で置き、1ステップの対空射撃の損害を見る。
 * elapsedSec は攻撃に入ってからの時間。戦闘機どうしの空戦が混ざらないよう、東の戦闘機は外す
 */
function flak(ids: string[], elapsedSec: number, rules?: Partial<NonNullable<SimContext["rules"]["airGroups"]>>, opts?: { t: number; earlier?: { id: string; startSec: number }[] }) {
  const sc = buildScenario(loadScenarioJson("test-naval"), packs);
  if (!sc.ok) throw new Error(sc.errors.join("\n"));
  const ctx: SimContext = { ...sc.value.ctx, rules: { ...sc.value.ctx.rules, airGroups: { ...sc.value.ctx.rules.airGroups!, ...rules } } };
  const s = sc.value.start(1);
  const cv = s.units.find((u) => u.id === "e-cv")!;
  const units: Unit[] = s.units.filter((u) => u.id !== "e-vf");
  for (const id of ids) {
    const g = units.find((u) => u.id === id)!;
    g.pos = { ...cv.pos };
    g.air = { ...g.air!, status: "attacking", targetId: "e-cv", struck: true, delivered: true, attackLeftSec: ctx.rules.airGroups!.strikeMinutes * 60 - elapsedSec };
  }
  // 少し前に同じ艦隊を攻めて、もう離れた隊(帰投中)
  for (const e of opts?.earlier ?? []) {
    const g = units.find((u) => u.id === e.id)!;
    g.pos = { x: cv.pos.x - 20000, y: cv.pos.y };
    g.air = { ...g.air!, status: "returning", struck: true, delivered: true, attackStartSec: e.startSec, attackPos: { ...cv.pos } };
  }
  const res = computeAirCombat(units, ctx, Rng.fromSeed(1), opts?.t);
  const dmg = (id: string) => res.filter((r) => r.targetId === id).reduce((t, r) => t + r.damage, 0);
  return { dmg, ctx };
}

describe("対空砲火(ユーザー判断:撃墜が多すぎる、の直し。docs/research/coral-sea-1942-05.md の4)", () => {
  it("期待挙動:対空射撃に撃たれるのは攻撃に入ってから決まった分だけ。爆弾を落として離れた後は撃たれない", () => {
    const { dmg, ctx } = flak(["w-vb"], 0);
    expect(ctx.rules.airGroups!.antiAirExposureMinutes).toBeDefined();
    expect(dmg("w-vb")).toBeGreaterThan(0);
    const late = flak(["w-vb"], ctx.rules.airGroups!.antiAirExposureMinutes! * 60);
    expect(late.dmg("w-vb")).toBe(0);
  });

  it("期待挙動:攻撃隊についてきた護衛の戦闘機は対空射撃を受けない", () => {
    const { dmg } = flak(["w-vb", "w-vf"], 0);
    expect(dmg("w-vf")).toBe(0);
    expect(dmg("w-vb")).toBeGreaterThan(0);
  });

  it("期待挙動:同じ時に2つの隊が攻めると、対空射撃が分かれて1つの隊が受ける損害は1隊だけのときより小さい(飽和)", () => {
    const alone = flak(["w-vb"], 0).dmg("w-vb");
    const together = flak(["w-vb", "w-vt"], 0).dmg("w-vb");
    expect(together).toBeLessThan(alone * 0.8);
    // 飽和を切れば、どちらも丸ごと受ける(前の決まり)
    const off = flak(["w-vb", "w-vt"], 0, { antiAirSaturation: false }).dmg("w-vb");
    expect(off).toBeCloseTo(alone, 5);
  });

  it("期待挙動:雷撃機が、数分前に爆撃機の攻めた艦隊へ続けて来ると、対空射撃は分かれたまま(短い間の攻撃は対空砲を分散させる)", () => {
    const t = 36000;
    const alone = flak(["w-vt"], 0, { antiAirCoordinatedMultiplier: 1 }, { t }).dmg("w-vt");
    const after = flak(["w-vt"], 0, { antiAirCoordinatedMultiplier: 1 }, { t, earlier: [{ id: "w-vb", startSec: t - 240 }] }).dmg("w-vt");
    expect(after).toBeLessThan(alone * 0.8);
    // 決めた時間より前の攻撃とは分け合わない
    const { ctx } = flak([], 0);
    const old = flak(["w-vt"], 0, { antiAirCoordinatedMultiplier: 1 }, { t, earlier: [{ id: "w-vb", startSec: t - ctx.rules.airGroups!.antiAirSaturationWindowMinutes! * 60 - 60 }] }).dmg("w-vt");
    expect(old).toBeCloseTo(alone, 5);
  });

  it("期待挙動:雷撃(低空)と爆撃(高空)がそろうと、分け合うだけでなく対空の力そのものが落ちる", () => {
    const { ctx } = flak([], 0);
    const m = ctx.rules.airGroups!.antiAirCoordinatedMultiplier!;
    expect(m).toBeLessThan(1);
    const split = flak(["w-vb", "w-vt"], 0).dmg("w-vb");
    const plain = flak(["w-vb", "w-vt"], 0, { antiAirCoordinatedMultiplier: 1 }).dmg("w-vb");
    expect(split / plain).toBeCloseTo(m, 2);
  });
});
