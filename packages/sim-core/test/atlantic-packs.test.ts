import { describe, expect, it } from "vitest";
import { loadPacks } from "./helpers.js";

const packs = loadPacks();
const weaponsOf = (ids: string[]) => Object.assign({}, ...ids.map((id) => packs.weapons[id]!.weapons));
/** 距離(m)での貫通(mm。表の間は直線で補う) */
const pen = (table: { rangeM: number; mm: number }[], r: number) => {
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]!;
    const b = table[i]!;
    if (r <= b.rangeM) return a.mm + ((b.mm - a.mm) * (r - a.rangeM)) / (b.rangeM - a.rangeM);
  }
  return table.at(-1)!.mm;
};

describe("大西洋 1940〜41年の艦級・航空隊のパック", () => {
  const stack = ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"];
  const weapons = weaponsOf(stack);
  const toes = { ...packs.toes["atlantic-ships-1941"]!.toes, ...packs.toes["atlantic-air-1941"]!.toes };

  it("艦級の兵装・水偵・航空隊の武器は、重ねるパックの中にすべてある。国は独・英・ノルウェー", () => {
    for (const [id, t] of Object.entries(toes)) {
      for (const b of t.ship?.batteries ?? []) expect(weapons[b.weapon], `${id} の ${b.weapon}`).toBeDefined();
      for (const e of t.elements) for (const x of e.weapons) expect(weapons[x.weapon], `${id} の ${x.weapon}`).toBeDefined();
      if (t.ship?.floatplanes) expect(toes[t.ship.floatplanes.toe], `${id} の水偵`).toBeDefined();
      expect(["de", "uk", "no"]).toContain(t.nation);
    }
    expect(toes["de-bb-bismarck"]!.ship!.type).toBe("battleship");
    expect(toes["no-cd-norge"]!.ship!.abbr).toBe("CD");
  });

  it("期待挙動:ビスマルクの 38cm は近い距離でフッドの舷側を抜き、遠い距離では落ちてくる弾でフッドの薄い甲板を抜くが、KGV の厚い甲板は抜けない", () => {
    const g = weapons["de_38cm_52"]!.naval!;
    const hood = toes["uk-bc-hood"]!.ship!;
    const kgv = packs.toes["pacific-ships-1942"]!.toes["uk-bb-kgv"]!.ship!;
    expect(pen(g.beltPenetration, 15000)).toBeGreaterThan(hood.beltMm);
    expect(pen(g.deckPenetration, 20000)).toBeGreaterThan(hood.deckMm);
    expect(pen(g.deckPenetration, 25000)).toBeLessThan(kgv.deckMm);
  });

  it("期待挙動:1940年のドイツの魚雷は不具合で当たっても爆発しにくい(英の 21in より信頼性が低い)", () => {
    expect(weapons["de_g7a"]!.torpedoRun!.reliability).toBeLessThan(weapons["uk_21in"]!.torpedoRun!.reliability);
  });

  it("期待挙動:急降下爆撃は水平爆撃より艦に当たりやすい(Ju 87・スクア 対 He 111)", () => {
    const acc = (id: string) => weapons[id]!.airOrdnance!.accuracy;
    expect(acc("at_ju87_bomb")).toBeGreaterThan(acc("at_he111_bombs"));
    expect(acc("at_skua_bomb")).toBeGreaterThan(acc("at_he111_bombs"));
  });
});
