import { describe, expect, it } from "vitest";
import { computeFire, createUnit, detectionLevel, parseTerrainMap, Rng, TerrainMap, type NewUnit, type SimContext, type Unit } from "../src/index.js";
import { ctx as baseCtx, toes, unwrap, weapons, withoutFatigue } from "./helpers.js";

/** 250m セル × 120 × 120(30km 四方)の海 */
const terrain = new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { "~": "sea", ".": "plain" }, rows: Array.from({ length: 120 }, (_, r) => (r < 4 ? ".".repeat(120) : "~".repeat(120))) })));
const gun = { name: "試験の艦砲", bands: [{ maxRangeM: 20000, power: 1 }], effectiveness: { soft: 1, armored: 1 }, indirect: false, ammoPerMin: 0.001, suppression: 0.5, antiAir: 0, entrenchmentPierce: 0, arcing: false };
const torpedo = { ...gun, name: "試験の魚雷", bands: [{ maxRangeM: 8000, power: 3 }], torpedo: true };
const ship = (weapon: string) => ({
  name: "試験の戦隊",
  branch: "naval",
  armorRatio: 0,
  frontageM: 0,
  naval: true,
  speedMpm: 600,
  supply: { ammoCapacityT: 100, fuelCapacityT: 1000, fuelPerKmT: 0.5 },
  elements: [{ name: "艦", count: 4, hitPoints: 500, weapons: [{ weapon, count: 2 }] }],
});
const ctx: SimContext = withoutFatigue({
  ...baseCtx,
  terrain,
  weapons: { ...weapons, weapons: { ...weapons.weapons, naval_gun: gun, test_torpedo: torpedo } },
  toes: { ...toes, toes: { ...toes.toes, gun_ship: ship("naval_gun") as never, torp_ship: ship("test_torpedo") as never, radar_ship: { ...ship("naval_gun"), radarRangeM: 15000 } as never } },
});
const sq = (id: string, side: string, x: number, y: number, facing: number, extra: Partial<NewUnit> = {}): Unit =>
  createUnit({ id, side, branch: "naval", toe: "gun_ship", pos: { x, y }, facing, stance: "standard", formation: "deployed", ...extra });
const damageTo = (units: Unit[], c: SimContext = ctx) => {
  const rs = computeFire(units, { ...c, rules: { ...c.rules, combat: { ...c.rules.combat, damageSpread: 0 } } }, Rng.fromSeed(1), new Set());
  return Object.fromEntries(units.map((u) => [u.id, rs.filter((r) => r.targetId === u.id).reduce((s, r) => s + r.damage, 0)]));
};

describe("海戦の砲戦と雷撃", () => {
  it("T字:単縦陣で舷側を向けた側は、艦首を向けて突っ込んでくる単縦陣より大きな損害を与え、受ける損害は小さい", () => {
    // a は東へ進む。b は a の北 10km から南へ(a へ艦首を向けて)来る → a は舷側で撃ち、b は艦首の方向へしか撃てない
    const a = sq("a", "us", 15000, 10000, 90);
    const b = sq("b", "de", 15000, 20000, 180);
    const d = damageTo([a, b]);
    // 撃つ火力の比(舷側1 / 艦首0.35)× 受ける損害の比(艦首から撃たれる1.3 / 舷側から撃たれる1)
    expect(d["b"]! / d["a"]!).toBeCloseTo((1 / 0.35) * (1.3 / 1), 3);
  });

  it("単横陣は、正面の敵へ向かうとき単縦陣より前へ撃てて、艦首の方向から撃たれる損害も小さい", () => {
    const enemy = sq("e", "de", 15000, 20000, 270);
    const ahead = damageTo([sq("a", "us", 15000, 10000, 0), enemy]);
    const abreast = damageTo([sq("a", "us", 15000, 10000, 0, { navalFormation: "line_abreast" }), enemy]);
    expect(abreast["e"]!).toBeGreaterThan(ahead["e"]! * 1.9);
    expect(abreast["a"]!).toBeLessThan(ahead["a"]!);
  });

  it("魚雷は艦艇にだけ撃ち、撃てる時間を使い切ると撃たない", () => {
    const t = sq("t", "us", 15000, 10000, 90, { toe: "torp_ship" });
    const target = sq("x", "de", 15000, 15000, 270);
    const r = computeFire([t, target], ctx, Rng.fromSeed(1), new Set());
    expect(r.find((x) => x.attackerId === "t")?.torpedo).toBe(true);
    // 陸の部隊には撃たない(射程内でも)
    const land = createUnit({ id: "l", side: "de", branch: "infantry", toe: "infantry_regiment", pos: { x: 15000, y: 875 }, facing: 0, stance: "standard", formation: "deployed" });
    const t2 = sq("t2", "us", 15000, 5000, 0, { toe: "torp_ship" });
    expect(computeFire([t2, land], ctx, Rng.fromSeed(1), new Set()).filter((x) => x.attackerId === "t2")).toEqual([]);
    // 撃ち尽くし
    const spent = { ...t, torpedoSecUsed: ctx.rules.naval!.torpedoSalvoMinutes * 60 };
    expect(computeFire([spent, target], ctx, Rng.fromSeed(1), new Set()).filter((x) => x.attackerId === "t")).toEqual([]);
  });

  it("艦艇どうしは檣楼の見張りで遠くまで見え、夜も撃ち合う", () => {
    const a = sq("a", "us", 15000, 10000, 90);
    const b = sq("b", "de", 15000, 25000, 270);
    expect(detectionLevel(a, b, ctx)).toBeGreaterThan(0);
    const night: SimContext = { ...ctx, visibilityMultiplier: 0.5, phase: "night" };
    const c = sq("c", "de", 15000, 15000, 270);
    expect(computeFire([a, c], night, Rng.fromSeed(1), new Set(), { attackers: new Set() }).length).toBe(2);
  });

  it("電探は、夜で目に見えない距離の艦艇でも位置だけは分かる", () => {
    const night: SimContext = { ...ctx, visibilityMultiplier: 0.3 };
    const plain = sq("a", "us", 15000, 10000, 90);
    const radar = sq("r", "us", 15000, 10000, 90, { toe: "radar_ship" });
    const b = sq("b", "de", 15000, 22000, 270);
    expect(detectionLevel(plain, b, night)).toBe(0);
    expect(detectionLevel(radar, b, night)).toBe(1);
  });
});
