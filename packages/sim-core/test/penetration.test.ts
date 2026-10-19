import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeFire, createUnit, parseToePack, parseWeaponPack, penetrationFactor, platesPenetrationFactor, Rng, toeArmorMm, toeArmorPlates, weaponPenetrationAt, type SimContext, type Toe } from "../src/index.js";
import { ger, inf, unwrap, wideCtx } from "./helpers.js";

/** 正面140mm・側面50mmの重戦車と、貫通力80mm(中口径)・160mm(長砲身)の砲を持つ戦車 */
const gun = (name: string, pen: number) => ({ name, bands: [{ maxRangeM: 1500, power: 2, penetrationMm: pen }], effectiveness: { soft: 0.5, armored: 1 }, indirect: false, ammoPerMin: 0.001, suppression: 1, antiAir: 0, entrenchmentPierce: 0, arcing: false });
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

  it("混成の部隊は、要素ごとに抜けるかを決めて重みで平均する(厚さを平均しない)", () => {
    const r = ctx.rules.combat.penetration!;
    const mixed: Toe = {
      ...tank("混成", "gun80"),
      elements: [
        { name: "重", count: 5, hitPoints: 100, armored: true, weapons: [], armorMm: { front: 140, side: 50 } },
        { name: "中", count: 5, hitPoints: 100, armored: true, weapons: [], armorMm: { front: 60, side: 30 } },
      ],
    };
    const plates = toeArmorPlates(mixed)!;
    // 80mm は重い方の正面を抜けず、軽い方の正面は抜ける → 半分
    expect(platesPenetrationFactor(80, plates, "front", r)).toBeCloseTo((r.minFactor + 1) / 2);
    expect(toeArmorMm(mixed)).toEqual({ front: 100, side: 40, rear: 40 });
  });
});

describe("米独1944年のパック(data/*/ww2-1944-us-de.json)", () => {
  const read = (p: string) => JSON.parse(readFileSync(new URL(`../../../data/${p}`, import.meta.url), "utf-8"));
  const weapons = unwrap(parseWeaponPack(read("weapons/ww2-1944-us-de.json")));
  const toes = unwrap(parseToePack(read("toe/ww2-1944-us-de.json")));
  const r = ctx.rules.combat.penetration!;
  const f = (weapon: string, d: number, toe: string, face: "front" | "side") => platesPenetrationFactor(weaponPenetrationAt(weapons.weapons[weapon]!, d)!, toeArmorPlates(toes.toes[toe]!)!, face, r);

  it("期待挙動:M4の75mm砲はパンターの正面を抜けず、側面は抜ける", () => {
    const panther = { ...toes.toes["de_panzer_regiment_1944"]!, elements: toes.toes["de_panzer_regiment_1944"]!.elements.filter((e) => e.name.includes("パンター")) };
    const plates = toeArmorPlates(panther)!;
    expect(platesPenetrationFactor(weaponPenetrationAt(weapons.weapons["us_75mm_m3"]!, 400)!, plates, "front", r)).toBe(r.minFactor);
    expect(platesPenetrationFactor(weaponPenetrationAt(weapons.weapons["us_75mm_m3"]!, 400)!, plates, "side", r)).toBe(1);
  });

  it("期待挙動:パンターの砲はM4を正面から抜き、M18はどの砲にも抜かれる", () => {
    expect(f("de_75mm_kwk42", 1000, "us_armored_task_force_m4", "front")).toBe(1);
    expect(f("de_75mm_kwk40", 1500, "us_tank_destroyer_battalion_m18", "front")).toBe(1);
  });
});

describe("砲塔と面の倍率", () => {
  const r = { lowRatio: 0.8, highRatio: 1.2, minFactor: 0.05, turretShare: 0.4 };
  const pz4: Toe = { ...tank("IV号", "gun80"), elements: [{ name: "戦車", count: 1, hitPoints: 100, armored: true, weapons: [], armorMm: { front: 81, side: 30, turretFront: 51 } }] };

  it("砲塔の厚さを書いた要素は、turretShare の割合だけ砲塔で抜けるかを決める(車体の正面を抜けない砲でも砲塔なら抜ける)", () => {
    const plates = toeArmorPlates(pz4)!;
    expect(platesPenetrationFactor(61, plates, "front", r)).toBeCloseTo(0.6 * r.minFactor + 0.4 * 1);
    expect(platesPenetrationFactor(61, plates, "front", { ...r, turretShare: 0 })).toBe(r.minFactor);
    // 砲塔の側面を書かなければ砲塔の正面と同じ
    expect(plates[0]!.turret).toEqual({ front: 51, side: 51, rear: 51 });
  });

  it("期待挙動:抜ける砲で側面を撃つと、正面より大きく効く(側面の上乗せが残る)", () => {
    const front = damage("long160", "front");
    const flank = damage("long160", "flank");
    expect(flank / front).toBeGreaterThan(ctx.rules.facing.damageMultiplier.flank);
  });
});
