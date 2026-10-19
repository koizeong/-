import { describe, expect, it } from "vitest";
import { computeFire, createUnit, penetrationFactor, Rng, toeArmorMm, type SimContext, type Toe } from "../src/index.js";
import { ger, inf, wideCtx } from "./helpers.js";

/** 正面140mm・側面50mmの重戦車と、貫通力80mm(中口径)・160mm(長砲身)の砲を持つ戦車 */
const gun = (name: string, pen: number) => ({ name, bands: [{ maxRangeM: 1500, power: 2, penetrationMm: pen }], effectiveness: { soft: 0.5, armored: 1 }, indirect: false, ammoPerMin: 0.001, suppression: 1, antiAir: 0 });
const tank = (name: string, weapon: string, armorMm?: { front: number; side: number }): Toe => ({
  name,
  branch: "armor",
  amphibious: false,
  armorRatio: 1,
  frontageM: 0,
  supply: { ammoCapacityT: 20, fuelCapacityT: 20, fuelPerKmT: 0.1 },
  elements: [{ name: "戦車", count: 10, hitPoints: 100, armored: true, weapons: [{ weapon, count: 1 }], ...(armorMm ? { armorMm } : {}) }],
});
const ctx: SimContext = {
  ...wideCtx,
  weapons: { ...wideCtx.weapons, weapons: { ...wideCtx.weapons.weapons, gun80: gun("中口径", 80), gun160: gun("長砲身", 160) } },
  toes: {
    ...wideCtx.toes,
    toes: { ...wideCtx.toes.toes, heavy: tank("重戦車", "gun80", { front: 140, side: 50 }), medium80: tank("中戦車", "gun80"), long160: tank("長砲身の戦車", "gun160") },
  },
};

/** 北を向いた重戦車を、北(正面)か東(側面)から400mで撃ったときの損害 */
const damage = (shooterToe: string, from: "front" | "flank") => {
  const target = createUnit(ger("t", 5000, 5000, { branch: "armor", toe: "heavy", formation: "deployed", facing: 0 }));
  const pos = from === "front" ? { x: 5000, y: 5400 } : { x: 5400, y: 5000 };
  const shooter = createUnit(inf("s", pos.x, pos.y, { branch: "armor", toe: shooterToe, formation: "deployed", facing: from === "front" ? 180 : 270 }));
  return computeFire([shooter, target], ctx, Rng.fromSeed(1), new Set()).find((r) => r.targetId === "t")?.damage ?? 0;
};

describe("貫通力と装甲", () => {
  it("貫通力 ÷ 装甲 の比で効き目が決まる(下は最低値、上は1、その間は直線)", () => {
    const r = ctx.rules.combat.penetration!;
    expect(penetrationFactor(50, 100, r)).toBe(r.minFactor);
    expect(penetrationFactor(150, 100, r)).toBe(1);
    expect(penetrationFactor(100, 100, r)).toBeCloseTo((r.minFactor + 1) / 2);
    expect(toeArmorMm(ctx.toes.toes["heavy"]!)).toEqual({ front: 140, side: 50, rear: 50 });
  });

  it("期待挙動:中口径の砲は重戦車の正面をほとんど抜けないが、側面からなら抜ける", () => {
    const front = damage("medium80", "front");
    const flank = damage("medium80", "flank");
    expect(front).toBeGreaterThan(0);
    expect(flank / front).toBeGreaterThan(10);
  });

  it("期待挙動:長砲身の砲なら正面からでも抜ける", () => {
    expect(damage("long160", "front") / damage("medium80", "front")).toBeGreaterThan(10);
  });

  it("貫通力を持たない武器・装甲の厚さを持たない目標は、これまでどおり(装甲の面の倍率)", () => {
    const target = createUnit(ger("t", 5000, 5000, { branch: "armor", toe: "medium80", formation: "deployed", facing: 0 }));
    const shooter = createUnit(inf("s", 5000, 5400, { branch: "armor", toe: "medium80", formation: "deployed", facing: 180 }));
    const r = computeFire([shooter, target], ctx, Rng.fromSeed(1), new Set()).find((x) => x.targetId === "t")!;
    expect(r.situational?.some((f) => f.id === "penetration")).toBeFalsy();
  });
});
