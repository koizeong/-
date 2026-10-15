import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aspectDamageMultiplier, attackAspect, parseRulePack, type FacingRules } from "../src/index.js";

const rules: FacingRules = {
  frontHalfArcDeg: 60,
  rearHalfArcDeg: 45,
  damageMultiplier: { front: 1, flank: 1.5, rear: 2 },
};

// 北(0度)を向いた防御側
const def = { x: 0, y: 0 };
const facing = 0;

describe("attackAspect", () => {
  it("同じ地点から撃たれたら、向きにかかわらず正面とみなす(方位が決まらないため)", () => {
    for (const f of [0, 90, 180, 270]) expect(attackAspect(def, f, { ...def }, rules)).toBe("front");
    // 丸め誤差ほどのずれ(1m未満)も同じ地点とみなす
    for (const f of [0, 90, 180, 270]) expect(attackAspect(def, f, { x: 1e-11, y: -1e-11 }, rules)).toBe("front");
  });

  it("正面・側面・背面を判定する", () => {
    expect(attackAspect(def, facing, { x: 0, y: 1000 }, rules)).toBe("front");
    expect(attackAspect(def, facing, { x: 1000, y: 0 }, rules)).toBe("flank");
    expect(attackAspect(def, facing, { x: -1000, y: 0 }, rules)).toBe("flank");
    expect(attackAspect(def, facing, { x: 0, y: -1000 }, rules)).toBe("rear");
  });

  it("境界の角度はルールパックの値に従う", () => {
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return { x: Math.sin(r) * 1000, y: Math.cos(r) * 1000 };
    };
    expect(attackAspect(def, facing, at(59), rules)).toBe("front");
    expect(attackAspect(def, facing, at(61), rules)).toBe("flank");
    expect(attackAspect(def, facing, at(134), rules)).toBe("flank");
    expect(attackAspect(def, facing, at(136), rules)).toBe("rear");
  });

  it("期待挙動:側面・背面からの攻撃は正面より損害が大きい", () => {
    const m = (p: { x: number; y: number }) => aspectDamageMultiplier(attackAspect(def, facing, p, rules), rules);
    const front = m({ x: 0, y: 1000 });
    const flank = m({ x: 1000, y: 0 });
    const rear = m({ x: 0, y: -1000 });
    expect(flank).toBeGreaterThan(front);
    expect(rear).toBeGreaterThan(flank);
  });
});

describe("ルールパック", () => {
  it("同梱の ww1-korea ルールパックがスキーマを通る", () => {
    const json: unknown = JSON.parse(
      readFileSync(new URL("../../../data/rulepacks/ww1-korea.json", import.meta.url), "utf-8"),
    );
    const r = parseRulePack(json);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(r.value.id).toBe("ww1-korea");
  });

  it("壊れたルールパックは、場所の分かるエラーを返す", () => {
    const r = parseRulePack({
      id: "broken",
      name: "壊れたパック",
      facing: { frontHalfArcDeg: 120, rearHalfArcDeg: 90, damageMultiplier: { front: 1, flank: -1, rear: 2 } },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.startsWith("facing.damageMultiplier.flank"))).toBe(true);
  });
});
