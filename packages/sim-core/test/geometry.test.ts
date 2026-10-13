import { describe, expect, it } from "vitest";
import { angleBetween, bearing, distance, normalizeBearing } from "../src/index.js";

describe("geometry", () => {
  it("距離はメートル", () => {
    expect(distance({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
  });

  it("方位は北0・時計回り", () => {
    const o = { x: 0, y: 0 };
    expect(bearing(o, { x: 0, y: 100 })).toBeCloseTo(0);
    expect(bearing(o, { x: 100, y: 0 })).toBeCloseTo(90);
    expect(bearing(o, { x: 0, y: -100 })).toBeCloseTo(180);
    expect(bearing(o, { x: -100, y: 0 })).toBeCloseTo(270);
  });

  it("方位の正規化と差", () => {
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(720)).toBe(0);
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(0, 180)).toBe(180);
  });
});
