import { describe, expect, it } from "vitest";
import { halfWidth, relaxLayout, shortRegionName } from "../src/opmapLayout.js";

/** 2つの箱が重なっているか(横は名前の幅、縦は丸と名前の高さ 84 の楕円で見る) */
const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }, la: number, lb: number) =>
  ((b.x - a.x) / (halfWidth(la) + halfWidth(lb))) ** 2 + ((b.y - a.y) / 84) ** 2 < 0.98;

describe("作戦地図の描く位置のほどき", () => {
  it("同じ所に集まった地域は重ならないよう離れ、もとの並び(東西・南北)を保つ", () => {
    const boxes = [
      { id: "narvik", x: 450, y: 100, label: 6 },
      { id: "harstad", x: 440, y: 92, label: 6 },
      { id: "bjornfjell", x: 462, y: 101, label: 8 },
      { id: "oslo", x: 450, y: 600, label: 4 },
    ];
    const { pos, height } = relaxLayout(boxes, 900, 70);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(pos[boxes[i]!.id]!, pos[boxes[j]!.id]!, boxes[i]!.label, boxes[j]!.label)).toBe(false);
    // 東西:ビョルンフェルはナルヴィクの東、ハーシュタは西。南北:オスロはいちばん南(下)
    expect(pos.bjornfjell!.x).toBeGreaterThan(pos.harstad!.x);
    expect(pos.oslo!.y).toBeGreaterThan(Math.max(pos.narvik!.y, pos.harstad!.y, pos.bjornfjell!.y));
    expect(height).toBeGreaterThan(0);
  });

  it("離れている地域は動かさない(上の縁に合わせてずらすだけ)", () => {
    const { pos } = relaxLayout([{ id: "a", x: 100, y: 100, label: 4 }, { id: "b", x: 600, y: 500, label: 4 }], 900, 70);
    expect(pos.b!.x - pos.a!.x).toBeCloseTo(500);
    expect(pos.b!.y - pos.a!.y).toBeCloseTo(400);
  });

  it("毎回同じ形になる", () => {
    const boxes = [1, 2, 3, 4, 5].map((i) => ({ id: `r${i}`, x: 300 + i, y: 300, label: 5 }));
    expect(relaxLayout(boxes, 900, 70)).toEqual(relaxLayout(boxes, 900, 70));
  });

  it("地図に出す名前は括弧の前まで", () => {
    expect(shortRegionName("ハーシュタ(バルドゥフォス飛行場)")).toBe("ハーシュタ");
    expect(shortRegionName("オスロ")).toBe("オスロ");
  });
});
