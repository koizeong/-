import { describe, expect, it } from "vitest";
import { computeFire, createUnit, Rng, type SimContext, type Toe, type Weapon } from "../src/index.js";
import { ger, inf, wideCtx } from "./helpers.js";

/** 歩兵の武器の性質:陣地に強い(火炎放射器など)・曲射(擲弾筒など) */
const weapon = (over: Partial<Weapon>): Weapon => ({
  name: "w",
  bands: [{ maxRangeM: 1500, power: 1 }],
  effectiveness: { soft: 1, armored: 0.1 },
  indirect: false,
  ammoPerMin: 0.001,
  suppression: 1,
  antiAir: 0,
  entrenchmentPierce: 0,
  arcing: false,
  ...over,
});
const toe = (w: string): Toe => ({
  name: w,
  branch: "infantry",
  amphibious: false,
  armorRatio: 0,
  frontageM: 0,
  supply: { ammoCapacityT: 20, fuelCapacityT: 0, fuelPerKmT: 0 },
  elements: [{ name: "中隊", count: 3, hitPoints: 100, weapons: [{ weapon: w, count: 3 }] }],
});
const ctx: SimContext = {
  ...wideCtx,
  weapons: { ...wideCtx.weapons, weapons: { ...wideCtx.weapons.weapons, plain: weapon({}), flame: weapon({ entrenchmentPierce: 0.8 }), arc: weapon({ arcing: true }) } },
  toes: { ...wideCtx.toes, toes: { ...wideCtx.toes.toes, plain: toe("plain"), flame: toe("flame"), arc: toe("arc") } },
};

const damage = (shooterToe: string, opts: { dug?: number; between?: boolean; distance?: number } = {}) => {
  const d = opts.distance ?? 400;
  const units = [
    createUnit(inf("a", 1000, 3000, { toe: shooterToe, formation: "deployed", facing: 90 })),
    createUnit(ger("t", 1000 + d, 3000, { formation: "deployed", facing: 270, entrenchment: opts.dug ?? 0 })),
  ];
  if (opts.between) units.push(createUnit(inf("f", 1000 + d / 2, 3000, { formation: "deployed", facing: 90 })));
  return computeFire(units, ctx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a" && r.targetId === "t")?.damage ?? 0;
};

describe("武器の性質", () => {
  it("期待挙動:陣地に強い武器は、陣地に籠もった敵に、ふつうの武器より大きく効く(陣地のない敵には同じ)", () => {
    expect(damage("flame") / damage("plain")).toBeCloseTo(1, 6);
    const ratioDug = damage("flame", { dug: 3 }) / damage("plain", { dug: 3 });
    expect(ratioDug).toBeGreaterThan(1.5);
  });

  it("期待挙動:曲射の武器は、間の部隊にさえぎられずに撃てる(ふつうの武器は撃てない)", () => {
    expect(damage("plain", { between: true, distance: 1200 })).toBe(0);
    const arc = damage("arc", { between: true, distance: 1200 });
    expect(arc).toBeGreaterThan(0);
    expect(arc).toBeCloseTo(damage("arc", { distance: 1200 }), 6);
  });
});
