import { describe, expect, it } from "vitest";
import { applyOrders, canBreakThrough, computeFire, createUnit, frontageOf, holdingZones, resolveTurn, Rng, type NewUnit } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

/** 兵科専用の姿勢:機甲の突撃隊形(wedge)と、歩兵の全周防御(all_round) */

const holder = (extra: Partial<NewUnit> = {}) => inf("d", 3000, 3000, { formation: "deployed", facing: 270, ...extra });
const panzer = (extra: Partial<NewUnit> = {}, x = 2000) => ger("pz", x, 3000, { branch: "armor", toe: "panzer_regiment", formation: "deployed", facing: 90, ...extra });

describe("突撃隊形(機甲)", () => {
  it("機甲だけが取れる。歩兵に命じても弾かれる", () => {
    const units = new Map([holder(), panzer()].map((u) => [u.id, createUnit(u)] as const));
    const rejected = applyOrders(units, [{ unitId: "d", stance: "wedge" }, { unitId: "pz", stance: "wedge" }], wideCtx);
    expect(rejected.map((r) => r.unitId)).toEqual(["d"]);
    expect(units.get("pz")!.pendingStance).toBe("wedge");
  });

  it("正面幅が狭くなる(密集した楔形)", () => {
    const std = createUnit(panzer());
    const wedge = createUnit(panzer({ stance: "wedge" }));
    expect(frontageOf(wedge, wideCtx)).toBeCloseTo(frontageOf(std, wideCtx) * rules.stances.wedge!.frontageMultiplier, 6);
  });

  it("期待挙動:標準では抜けない、少し削れた歩兵連隊の阻止圏を、突撃隊形なら正面から抜ける", () => {
    const d = createUnit(holder());
    d.suppression = 0.4;
    const z = holdingZones([d], wideCtx)[0]!;
    expect(canBreakThrough(createUnit(panzer()), z, wideCtx)).toBe(false);
    expect(canBreakThrough(createUnit(panzer({ stance: "wedge" })), z, wideCtx)).toBe(true);
  });

  it("その代わり、撃たれると損害が大きい", () => {
    const shot = (stance: string) => computeFire([createUnit(holder()), createUnit(panzer({ stance }, 2700))], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.targetId === "pz")!.damage;
    expect(shot("wedge")).toBeGreaterThan(shot("standard"));
  });
});

describe("全周防御(歩兵)", () => {
  it("歩兵だけが取れる。機甲に命じても弾かれる", () => {
    const units = new Map([holder(), panzer()].map((u) => [u.id, createUnit(u)] as const));
    const rejected = applyOrders(units, [{ unitId: "d", stance: "all_round" }, { unitId: "pz", stance: "all_round" }], wideCtx);
    expect(rejected.map((r) => r.unitId)).toEqual(["pz"]);
  });

  it("期待挙動:側面・背後から撃たれても、正面から撃たれたのと同じ損害(標準なら側面の方が大きい)", () => {
    const hit = (stance: string, from: { x: number; y: number }) =>
      computeFire([createUnit(holder({ stance })), createUnit(ger("a", from.x, from.y, { formation: "deployed", facing: 0 }))], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.targetId === "d")!.damage;
    const front = { x: 2500, y: 3000 }; // 西(正面)
    const flank = { x: 3000, y: 3500 }; // 北(側面)
    expect(hit("standard", flank)).toBeGreaterThan(hit("standard", front) * 1.2);
    expect(hit("all_round", flank)).toBeCloseTo(hit("all_round", front), 6);
  });

  it("期待挙動:包囲されても、士気の減り方が小さい", () => {
    const C = { x: 5000, y: 2500 };
    const ring = [0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
      const r = (deg * Math.PI) / 180;
      return ger(`e${i}`, C.x + Math.sin(r) * 700, C.y + Math.cos(r) * 700, { formation: "deployed", facing: (deg + 180) % 360 });
    });
    const after = (stance: string) => {
      const s0 = state(inf("t", C.x, C.y, { formation: "deployed", branch: "infantry", stance }), ...ring);
      return unitOf(resolveTurn(s0, [], wideCtx).state, "t").morale;
    };
    expect(after("all_round")).toBeGreaterThan(after("standard"));
  });
});
