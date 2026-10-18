import { describe, expect, it } from "vitest";
import { computeFire, createUnit, fireLaneOpen, parseTerrainMap, Rng, TerrainMap, type SimContext } from "../src/index.js";
import { frontCtx, ger, inf, unwrap, wideCtx } from "./helpers.js";

/** 西の us-a が東の de-t(1.2km先)を撃つ。間(x=1600)に部隊を置けるようにする */
const shooter = () => createUnit(inf("a", 1000, 3000, { formation: "deployed", facing: 90 }));
const target = () => createUnit(ger("t", 2200, 3000, { formation: "deployed", facing: 270 }));
const damage = (ctx: SimContext, ...between: ReturnType<typeof createUnit>[]) =>
  computeFire([shooter(), target(), ...between], ctx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a" && r.targetId === "t")?.damage ?? 0;

describe("射線(間の部隊にふさがれる)", () => {
  it("期待挙動:間に展開した味方の部隊がいれば、その向こうの敵は撃てない(敵の部隊でも同じ)", () => {
    const open = damage(wideCtx);
    expect(open).toBeGreaterThan(0);
    const friend = createUnit(inf("f", 1600, 3000, { formation: "deployed", facing: 90 }));
    expect(damage(wideCtx, friend)).toBe(0);
    const enemy = createUnit(ger("e", 1600, 3000, { formation: "deployed", facing: 270 }));
    expect(damage(wideCtx, enemy)).toBe(0);
  });

  it("縦隊・潰走中の部隊はふさがない(細長い・散り散り)", () => {
    const open = damage(wideCtx);
    expect(damage(wideCtx, createUnit(inf("f", 1600, 3000, { formation: "column", facing: 90 })))).toBeCloseTo(open, 9);
    const routed = createUnit(inf("f", 1600, 3000, { formation: "deployed", facing: 90 }));
    routed.routed = true;
    expect(damage(wideCtx, routed)).toBeCloseTo(open, 9);
  });

  it("期待挙動:帯の一部だけがふさがれていれば、通る線の割合だけ火力が届く", () => {
    // 撃つ側の帯(南北2km)の北半分の前にだけ、狭い部隊を置く
    const small = createUnit(inf("f", 1600, 3700, { toe: "infantry_battalion", formation: "deployed", facing: 90 }));
    // 正面幅のある編成表で(撃つ側の帯は南北2km、間の大隊は700m)
    const lane = fireLaneOpen(shooter(), target(), [small], frontCtx);
    expect(lane).toBeGreaterThan(0);
    expect(lane).toBeLessThan(1);
    expect(damage(frontCtx, small) / damage(frontCtx)).toBeCloseTo(lane, 6);
  });

  it("高い所から撃つ線は、間の部隊の上を越えられる", () => {
    // 撃つ側だけが高地(標高40m)
    const hillCtx: SimContext = {
      ...wideCtx,
      terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 500, legend: { ".": "plain", h: "hill" }, rows: Array.from({ length: 12 }, () => "hh..........") }))),
    };
    const blocker = createUnit(inf("f", 2500, 3000, { formation: "deployed", facing: 90 }));
    const a = createUnit(inf("a", 500, 3000, { formation: "deployed", facing: 90 }));
    const t = createUnit(ger("t", 3500, 3000, { formation: "deployed", facing: 270 }));
    expect(fireLaneOpen(a, t, [blocker], hillCtx)).toBe(1);
    expect(fireLaneOpen(a, t, [blocker], wideCtx)).toBe(0);
  });
});
