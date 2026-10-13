import { describe, expect, it } from "vitest";
import { Rng } from "../src/index.js";

describe("Rng", () => {
  it("同じシードからは同じ列が出る", () => {
    const a = Rng.fromSeed(42);
    const b = Rng.fromSeed(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it("違うシードからは違う列が出る", () => {
    const a = Rng.fromSeed(1);
    const b = Rng.fromSeed(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it("状態を保存して復元すると、続きの列が一致する", () => {
    const a = Rng.fromSeed(7);
    for (let i = 0; i < 5; i++) a.next();
    const b = Rng.fromState(a.getState());
    for (let i = 0; i < 20; i++) expect(b.next()).toBe(a.next());
  });

  it("next は [0, 1)、spread は 1±幅 に収まり、平均がおおむね中央", () => {
    const r = Rng.fromSeed(123);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const s = r.spread(0.15);
      expect(s).toBeGreaterThanOrEqual(0.85);
      expect(s).toBeLessThan(1.15);
      sum += v;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });
});
