import { createUnit, resolveTurn, startScenario, viewForSide, type SimContext } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide, imbalance, runMatch, runSeries } from "../src/index.js";
import { mirrorX, symCtx, symDepots, symStart, symUnits } from "./fixtures.js";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("AI同士の自動対戦", () => {
  it("乱数と判断のぶれを0にすると、対称シナリオで両陣営が完全に鏡写しに動く(東西で扱いの違う処理がない)", () => {
    const det: SimContext = {
      ...symCtx,
      rules: {
        ...symCtx.rules,
        combat: { ...symCtx.rules.combat, damageSpread: 0 },
        detection: { ...symCtx.rules.detection, sizeEstimateError: 0 },
      },
    };
    const flat = { caution: 0.5, noise: 0 };
    let s = symStart(1);
    for (let t = 1; t <= det.scenario.maxTurns; t++) {
      const us = decide(viewForSide(s, "us"), det, flat);
      const de = decide(viewForSide(s, "de"), det, flat);
      s = resolveTurn(s, [...us.orders, ...de.orders], det, [...us.hqCommands, ...de.hqCommands]).state;
      for (const a of s.units.filter((u) => u.side === "us")) {
        const b = s.units.find((u) => u.id === a.id.replace("us-", "de-"));
        expect(b, `T${t} ${a.id}`).toBeDefined();
        expect(Math.hypot(a.pos.x - mirrorX(b!.pos.x), a.pos.y - b!.pos.y), `T${t} ${a.id} の位置`).toBeLessThan(1e-6);
        expect(a.strength, `T${t} ${a.id} の戦力`).toBeCloseTo(b!.strength, 9);
        expect(a.morale, `T${t} ${a.id} の士気`).toBeCloseTo(b!.morale, 9);
      }
    }
  });

  it("同じシードの対戦は、同じ結果になる", () => {
    const a = runMatch(symStart(7), symCtx, {}, 7);
    const b = runMatch(symStart(7), symCtx, {}, 7);
    expect(a.result).toEqual(b.result);
    expect(a.final).toEqual(b.final);
  });

  it("対称シナリオでは勝率が一方に偏らない(40戦で各陣営 25〜75%)", () => {
    const s = runSeries(symStart, symCtx, seeds(40));
    expect(s.games).toBe(40);
    expect(imbalance(s)).toEqual([]);
    // 命令が弾かれていない(AIはルール上有効な命令だけを出す)
    for (const o of s.outcomes) for (const st of Object.values(o.stats)) expect(st.ordersRejected).toBe(0);
  }, 60000);

  it("偏りの検出:片方から機甲を抜いたハンデ戦は、偏りとして検出される", () => {
    const handicapped = (seed: number) =>
      startScenario(symUnits().filter((u) => u.id !== "us-arm").map(createUnit), seed, symCtx, symDepots);
    const s = runSeries(handicapped, symCtx, seeds(20));
    expect(imbalance(s).map((x) => x.side)).toContain("de");
  }, 60000);
});
