import { describe, expect, it } from "vitest";
import { equipmentCatalog, parseToePack, parseWeaponPack, toeArmoredShare, toeHitPoints } from "../src/index.js";
import { unwrap } from "./helpers.js";

const weapons = unwrap(
  parseWeaponPack({
    id: "t",
    personnelHitPoints: 0.5,
    weapons: {
      rifle: { name: "小銃", bands: [{ maxRangeM: 400, power: 0.01 }], effectiveness: { soft: 1, armored: 0 }, indirect: false, ammoPerMin: 0 },
      mg: { name: "機関銃", bands: [{ maxRangeM: 800, power: 0.1 }], effectiveness: { soft: 1, armored: 0.05 }, indirect: false, ammoPerMin: 0 },
      gun75: { name: "75mm砲", bands: [{ maxRangeM: 1500, power: 0.5, penetrationMm: 90 }], effectiveness: { soft: 0.6, armored: 1 }, indirect: false, ammoPerMin: 0 },
    },
    equipment: {
      kar98k: { name: "Kar98k", nation: "de", category: "rifle", weapons: [{ weapon: "rifle", count: 1 }] },
      mg34: { name: "MG34", nation: "de", category: "lmg", crew: 2, weapons: [{ weapon: "mg", count: 1 }] },
      pz4: {
        name: "IV号戦車 H",
        nation: "de",
        category: "tank",
        crew: 5,
        hitPoints: 8,
        armored: true,
        armorMm: { front: 81, side: 30, rear: 20, turretFront: 51, turretSide: 30 },
        weapons: [
          { weapon: "gun75", count: 1 },
          { weapon: "mg", count: 2 },
        ],
      },
      stug: { name: "III号突撃砲 G", nation: "de", category: "assault_gun", crew: 4, hitPoints: 7, armored: true, armorMm: { front: 80, side: 30, rear: 30 }, weapons: [{ weapon: "gun75", count: 1 }] },
    },
  }),
);
const catalog = equipmentCatalog([weapons]);
const pack = (elements: unknown[]) => ({
  id: "x",
  toes: { t: { name: "試し", branch: "infantry", armorRatio: 0, supply: { ammoCapacityT: 1, fuelCapacityT: 0, fuelPerKmT: 0 }, elements } },
});

describe("装備品と実数の編成表", () => {
  it("人員と装備品で書いた要素から、撃つ武器(装備品の武器 × 数)と耐久(人員 × 1人あたり)を出す", () => {
    const toe = unwrap(parseToePack(pack([{ name: "小銃中隊", count: 3, personnel: 180, equipment: [{ item: "kar98k", count: 132 }, { item: "mg34", count: 12 }] }]), catalog)).toes["t"]!;
    const e = toe.elements[0]!;
    expect(e.weapons).toEqual([
      { weapon: "rifle", count: 132 },
      { weapon: "mg", count: 12 },
    ]);
    expect(e.hitPoints).toBeCloseTo(90);
    expect(e.armored).toBeUndefined();
    // 書いた人員・装備品は表示のために残る
    expect(e.personnel).toBe(180);
    expect(e.equipment).toEqual([
      { item: "kar98k", count: 132 },
      { item: "mg34", count: 12 },
    ]);
    expect(toeHitPoints(toe)).toBeCloseTo(270);
  });

  it("装甲の装備品(戦車・突撃砲)があれば装甲の要素。耐久には車両の耐久を足し、装甲の厚さは面ごとにいちばん薄い値", () => {
    const toe = unwrap(
      parseToePack(
        pack([
          { name: "戦車中隊", count: 1, personnel: 80, equipment: [{ item: "pz4", count: 14 }, { item: "stug", count: 2 }] },
          { name: "随伴の小銃小隊", count: 1, personnel: 40, equipment: [{ item: "kar98k", count: 30 }] },
        ]),
        catalog,
      ),
    ).toes["t"]!;
    const tanks = toe.elements[0]!;
    expect(tanks.armored).toBe(true);
    expect(tanks.hitPoints).toBeCloseTo(80 * 0.5 + 14 * 8 + 2 * 7);
    expect(tanks.weapons).toEqual([
      { weapon: "gun75", count: 16 },
      { weapon: "mg", count: 28 },
    ]);
    // 突撃砲は砲塔を持たないので、砲塔の厚さは出さない(車体だけ)
    expect(tanks.armorMm).toEqual({ front: 80, side: 30, rear: 20 });
    expect(toeArmoredShare(toe)).toBeCloseTo(tanks.hitPoints / (tanks.hitPoints + 20));
  });

  it("書いた耐久・装甲・武器は勝つ(足す)", () => {
    const toe = unwrap(
      parseToePack(pack([{ name: "戦車小隊", count: 1, personnel: 25, hitPoints: 40, armorMm: { front: 100, side: 50 }, equipment: [{ item: "pz4", count: 5 }], weapons: [{ weapon: "rifle", count: 3 }] }]), catalog),
    ).toes["t"]!;
    const e = toe.elements[0]!;
    expect(e.hitPoints).toBe(40);
    expect(e.armorMm).toEqual({ front: 100, side: 50 });
    expect(e.weapons).toContainEqual({ weapon: "rifle", count: 3 });
  });

  it("ない装備品・装備品の一覧なし・耐久なしは誤り", () => {
    const r1 = parseToePack(pack([{ name: "x", count: 1, personnel: 10, equipment: [{ item: "nope", count: 1 }] }]), catalog);
    expect(r1.ok ? "" : r1.errors.join()).toContain('装備品 "nope" がありません');
    const r2 = parseToePack(pack([{ name: "x", count: 1, personnel: 10, equipment: [{ item: "kar98k", count: 1 }] }]));
    expect(r2.ok ? "" : r2.errors.join()).toContain("装備品の一覧");
    const r3 = parseToePack(pack([{ name: "x", count: 1, equipment: [{ item: "kar98k", count: 1 }] }]), catalog);
    expect(r3.ok ? "" : r3.errors.join()).toContain("耐久が0");
    const r4 = parseToePack(pack([{ name: "x", count: 1, weapons: [] }]), catalog);
    expect(r4.ok ? "" : r4.errors.join()).toContain("hitPoints か、人員");
  });

  it("これまでの書き方(武器と耐久を直接書く)はそのまま読める", () => {
    const toe = unwrap(parseToePack(pack([{ name: "小銃中隊", count: 9, hitPoints: 100, weapons: [{ weapon: "rifle", count: 4 }] }]))).toes["t"]!;
    expect(toe.elements[0]).toMatchObject({ hitPoints: 100, weapons: [{ weapon: "rifle", count: 4 }] });
  });
});
