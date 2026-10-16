import { describe, expect, it } from "vitest";
import {
  checkZones,
  computeFire,
  computeIndirectFire,
  createUnit,
  distanceToFront,
  frontageOf,
  frontCoverage,
  frontDistance,
  holdingZones,
  isEncircled,
  Rng,
  type NewUnit,
  type SimContext,
} from "../src/index.js";
import { frontCtx, ger, inf, wideCtx } from "./helpers.js";

/** 損害の揺らぎを0にした文脈(損害の比を正確に比べる) */
const steady = (c: SimContext): SimContext => ({ ...c, rules: { ...c.rules, combat: { ...c.rules.combat, damageSpread: 0 } } });

/** 北向き(facing 0)に展開した米軍の歩兵連隊。正面幅2000mなら、帯は x 4000〜6000m、y 5000m */
const holder = (extra: Partial<NewUnit> = {}) => inf("d", 5000, 5000, { formation: "deployed", facing: 0, ...extra });

describe("正面幅の幾何", () => {
  it("帯との距離・帯どうしの距離", () => {
    const f = { pos: { x: 0, y: 0 }, facing: 0, width: 2000 };
    expect(distanceToFront(f, { x: 500, y: 300 })).toBeCloseTo(300);
    expect(distanceToFront(f, { x: 1300, y: 400 })).toBeCloseTo(500);
    // 向き合った2つの帯(横に1500mずれて重なる)の距離は、縦の間隔
    expect(frontDistance(f, { pos: { x: 1500, y: 600 }, facing: 180, width: 2000 })).toBeCloseTo(600);
    // 交わる帯の距離は0
    expect(frontDistance(f, { pos: { x: 0, y: 0 }, facing: 90, width: 2000 })).toBeCloseTo(0);
  });

  it("着弾範囲にかかる帯の割合", () => {
    const f = { pos: { x: 0, y: 0 }, facing: 0, width: 2000 };
    expect(frontCoverage(f, { x: 0, y: 0 }, 400)).toBeCloseTo(0.4);
    expect(frontCoverage(f, { x: 900, y: 0 }, 400)).toBeCloseTo(0.25); // 端にかかる分だけ
    expect(frontCoverage(f, { x: 0, y: 500 }, 400)).toBe(0);
    expect(frontCoverage({ ...f, width: 0 }, { x: 0, y: 300 }, 400)).toBe(1);
  });

  it("正面幅は編成表の値で一定。展開していなければ0、戦力が5割を割ると半分", () => {
    const base = frontCtx.toes.toes["infantry_regiment"]!.frontageM;
    expect(base).toBeGreaterThan(0);
    expect(frontageOf(createUnit(holder()), frontCtx)).toBe(base);
    expect(frontageOf(createUnit(holder({ formation: "column" })), frontCtx)).toBe(0);
    const worn = createUnit(holder());
    worn.strength = 0.6;
    expect(frontageOf(worn, frontCtx)).toBe(base);
    worn.strength = 0.4;
    expect(frontageOf(worn, frontCtx)).toBe(base * frontCtx.rules.frontage.reducedMultiplier);
  });
});

describe("正面幅と阻止圏", () => {
  /** 敵の連隊が、holder の帯の東の端(中心から900m東)の北から南へ抜けようとする */
  function blocked(ctx: SimContext) {
    const d = createUnit(holder());
    const m = createUnit(ger("m", 5900, 6000, { formation: "deployed", facing: 180 }));
    m.route = [{ x: 5900, y: 3000 }];
    return checkZones(m, m.pos, { x: 5900, y: 5300 }, holdingZones([d], ctx), ctx).blockedBy !== null;
  }

  it("期待挙動:阻止圏は帯に沿って広がる(連隊の中心から900m横でも、帯の300m手前で止められる。点なら素通り)", () => {
    expect(blocked(frontCtx)).toBe(true);
    expect(blocked(wideCtx)).toBe(false);
  });

  it("期待挙動:正面幅のある連隊の列は隙間がふさがり、1.2km離れた4部隊で囲める(点なら隙間から抜けられる)", () => {
    const t = createUnit(inf("t", 5000, 5000, { formation: "deployed" }));
    const ring = [0, 90, 180, 270].map((deg, i) => {
      const r = (deg * Math.PI) / 180;
      return createUnit(ger(`e${i}`, 5000 + Math.sin(r) * 1200, 5000 + Math.cos(r) * 1200, { formation: "deployed", facing: (deg + 180) % 360 }));
    });
    expect(isEncircled(t, holdingZones(ring, frontCtx), frontCtx)).toBe(true);
    expect(isEncircled(t, holdingZones(ring, wideCtx), wideCtx)).toBe(false);
  });
});

describe("正面幅と射撃", () => {
  it("撃たれる面は帯のいちばん近い点から見る(帯の端の前に並んでいれば正面。点なら側面)", () => {
    const aspect = (ctx: SimContext) => {
      const d = createUnit(holder({ pos: { x: 5000, y: 2500 } }));
      const a = createUnit(ger("a", 5900, 2900, { formation: "deployed", facing: 180 }));
      return computeFire([a, d], ctx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.aspect;
    };
    expect(aspect(frontCtx)).toBe("front");
    expect(aspect(wideCtx)).toBe("flank");
  });

  /** holder(森の外、y 2500m)を北 600m から正面で撃つ部隊を n 個並べたときの、holder が受ける損害の合計 */
  function frontalDamage(n: number, ctx: SimContext, flanker = false) {
    const d = createUnit(holder({ pos: { x: 5000, y: 2500 } }));
    const xs = [5000, 4400, 5600, 3800, 6200].slice(0, n);
    const attackers = xs.map((x, i) => createUnit(ger(`a${i}`, x, 3100, { formation: "deployed", facing: 180 })));
    if (flanker) attackers.push(createUnit(ger("f", 7000, 2500, { formation: "deployed", facing: 270 })));
    return computeFire([d, ...attackers], ctx, Rng.fromSeed(1), new Set())
      .filter((r) => r.targetId === "d")
      .reduce((s, r) => s + r.damage, 0);
  }

  it("期待挙動:戦闘正面幅:正面から撃つ部隊を増やしても、目標の幅(の1.5倍)を超えた分は損害が増えない", () => {
    const ctx = steady(frontCtx);
    const one = frontalDamage(1, ctx);
    const four = frontalDamage(4, ctx);
    const cap = ctx.rules.frontage.combatWidthMultiplier!;
    // 4部隊で幅8000m、目標の幅2000m × 1.5 = 3000m までしか効かない
    expect(four / one).toBeCloseTo(4 * (cap * 2000) / 8000, 5);
    // 上限を外せば4倍
    const { combatWidthMultiplier: _, ...noCap } = ctx.rules.frontage;
    const open = { ...ctx, rules: { ...ctx.rules, frontage: noCap } };
    expect(frontalDamage(4, open) / frontalDamage(1, open)).toBeCloseTo(4, 5);
  });

  it("期待挙動:あふれた部隊は側面に回れば上限にかからず、損害を上乗せできる", () => {
    const ctx = steady(frontCtx);
    expect(frontalDamage(4, ctx, true)).toBeGreaterThan(frontalDamage(5, ctx));
  });
});

describe("正面幅と砲撃", () => {
  it("期待挙動:砲撃は着弾範囲にかかった帯の割合だけ効く(幅2000mの連隊に半径400mの砲撃なら4割)", () => {
    const fire = (ctx: SimContext) => {
      const d = createUnit(ger("d", 5000, 2500, { formation: "deployed", facing: 0 }));
      const g = createUnit(inf("g", 2000, 2500, { branch: "artillery", formation: "deployed", facing: 90 }));
      const byId = new Map([d, g].map((u) => [u.id, u]));
      const mission = { side: "us", unitId: "g", target: { x: 5000, y: 2500 }, turn: 1 };
      return computeIndirectFire([mission], [d, g], byId, ctx, Rng.fromSeed(1), new Set()).results.find((r) => r.targetId === "d")!.damage;
    };
    expect(fire(frontCtx) / fire(wideCtx)).toBeCloseTo((2 * frontCtx.rules.combat.indirectImpactRadiusM) / 2000, 5);
  });
});
