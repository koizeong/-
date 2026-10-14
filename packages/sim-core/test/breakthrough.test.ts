import { describe, expect, it } from "vitest";
import {
  canBreakThrough,
  computeFire,
  createUnit,
  holdingZones,
  replayForSide,
  resolveTurn,
  Rng,
  type NewUnit,
  type SimContext,
} from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const R = rules.breakthrough.zoneRadiusM;

/** 東向きに守る歩兵連隊(西から来る敵に正面を向ける) */
const holder = (extra: Partial<NewUnit> = {}) => inf("d", 3000, 3000, { formation: "deployed", facing: 270, ...extra });
const panzer = (x: number, y: number, extra: Partial<NewUnit> = {}) =>
  ger("pz", x, y, { branch: "armor", toe: "panzer_regiment", formation: "deployed", ...extra });

/** mover が holder の阻止圏を突破できるか(mover の位置から見た向きで判定) */
function breaks(mover: NewUnit, defender: NewUnit, ctx: SimContext = wideCtx, tweak: (u: ReturnType<typeof createUnit>) => void = () => {}) {
  const m = createUnit(mover);
  const d = createUnit(defender);
  tweak(d);
  return canBreakThrough(m, holdingZones([d])[0]!, ctx);
}

describe("阻止圏と突破判定", () => {
  it("阻止圏を持つのは、展開済みで潰走していないユニットだけ", () => {
    const units = [holder(), inf("c", 0, 0, { formation: "column" }), inf("p", 0, 0, { formation: "deploying" })].map(createUnit);
    const routed = createUnit(inf("r", 0, 0, { formation: "deployed" }));
    routed.routed = true;
    expect(holdingZones([...units, routed]).map((z) => z.unit.id)).toEqual(["d"]);
  });

  it("陣地を築いた歩兵連隊は、戦闘移動中の歩兵連隊にすり抜けられない(阻止圏の縁で止まる)", () => {
    const s0 = state(holder({ entrenchment: 2 }), ger("a", 1800, 3200, { formation: "deployed" }));
    const r = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 4500, y: 3200 }], moveMode: "combat" }], wideCtx);
    const a = unitOf(r.state, "a");
    expect(Math.hypot(a.pos.x - 3000, a.pos.y - 3000)).toBeGreaterThanOrEqual(R);
    expect(a.pos.x).toBeLessThan(3000);
    // 経路は残る(次のターンに再挑戦できる)
    expect(a.route.length).toBeGreaterThan(0);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "blocked")).toBe(true);
  });

  it("陣地がなくても、同じ規模の歩兵どうしでは突破できない", () => {
    expect(breaks(ger("a", 2000, 3000, { formation: "deployed" }), holder())).toBe(false);
  });

  it("機甲の突撃なら、陣地のない歩兵連隊を正面から突破できる", () => {
    expect(breaks(panzer(2000, 3000), holder())).toBe(true);
  });

  it("縦隊(行軍)のまま突っ込むと、同じ機甲でも突破できない", () => {
    expect(breaks(panzer(2000, 3000, { formation: "column" }), holder())).toBe(false);
  });

  it("側面から突くほうが、正面から突くより突破しやすい", () => {
    const dug = holder({ entrenchment: 1 });
    expect(breaks(panzer(2000, 3000), dug)).toBe(false); // 正面(西)
    expect(breaks(panzer(3000, 4000), dug)).toBe(true); // 側面(北)
  });

  it("動揺し、制圧された歩兵連隊は、歩兵にも突破される", () => {
    const a = ger("a", 2000, 3000, { formation: "deployed" });
    expect(breaks(a, holder())).toBe(false);
    expect(
      breaks(a, holder(), wideCtx, (d) => {
        d.morale = rules.morale.shakenBelow - 0.1;
        d.suppression = 0.6;
      }),
    ).toBe(true);
  });

  it("夜の浸透移動は突破しやすい(陣地のない相手なら歩兵でも抜ける)", () => {
    const night: SimContext = { ...wideCtx, phase: "night", nightActors: new Set(["a"]) };
    const a = createUnit(ger("a", 2000, 3000, { formation: "column", moveMode: "march" }));
    a.route = [{ x: 4500, y: 3000, onRoad: false }];
    const d = holdingZones([createUnit(holder())])[0]!;
    expect(canBreakThrough(a, d, wideCtx)).toBe(false); // 昼の縦隊
    expect(canBreakThrough(a, d, night)).toBe(true);
    // 陣地を築いた相手は、浸透移動でも抜けない
    const dug = holdingZones([createUnit(holder({ entrenchment: 2 }))])[0]!;
    expect(canBreakThrough(a, dug, night)).toBe(false);
  });

  it("突破に成功すると阻止圏を抜けて進み、双方に出来事が残る", () => {
    // 背を向けている(東向き)相手を、西から機甲で突く
    const s0 = state(holder({ facing: 90 }), panzer(1500, 3100));
    const r = resolveTurn(s0, [{ unitId: "pz", waypoints: [{ x: 6000, y: 3100 }], moveMode: "combat" }], wideCtx);
    expect(unitOf(r.state, "pz").pos.x).toBeGreaterThan(3000 + R);
    expect(r.events.some((e) => e.unitId === "pz" && e.type === "breakthrough")).toBe(true);
    expect(r.events.some((e) => e.unitId === "d" && e.type === "breached")).toBe(true);
    // 霧:突破された側には、自分の「突破された」だけが届く(相手のIDは載らない)
    const usEvents = replayForSide(r, "us").events;
    expect(usEvents.some((e) => e.type === "breached")).toBe(true);
    expect(usEvents.some((e) => e.unitId === "pz")).toBe(false);
  });

  it("阻止圏の中でも、敵から離れる動きは止められない", () => {
    const s0 = state(holder({ entrenchment: 3 }), ger("a", 2700, 3000, { formation: "deployed" }));
    const r = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 1000, y: 3000 }], moveMode: "combat" }], wideCtx);
    expect(unitOf(r.state, "a").pos.x).toBeLessThan(2700 - R);
    expect(r.events.some((e) => e.type === "blocked")).toBe(false);
  });

  it("強襲:損害を無視して突っ込むので、制圧されていても突破の力が落ちない", () => {
    const suppressed = (stance: string) => {
      const m = createUnit(panzer(2000, 3000, { stance }));
      m.suppression = 0.5;
      m.morale = rules.morale.shakenBelow - 0.1;
      return canBreakThrough(m, holdingZones([createUnit(holder())])[0]!, wideCtx);
    };
    expect(breaks(panzer(2000, 3000), holder())).toBe(true); // 万全なら標準でも抜ける
    expect(suppressed("standard")).toBe(false);
    expect(suppressed("attack")).toBe(true);
  });

  it("強襲なら、陣地を築いた歩兵も機甲で正面から抜ける", () => {
    const dug = holder({ entrenchment: 1 });
    expect(breaks(panzer(2000, 3000), dug)).toBe(false);
    expect(breaks(panzer(2000, 3000, { stance: "attack" }), dug)).toBe(true);
  });

  it("突破した相手への与ダメージが上がる", () => {
    const a = createUnit(panzer(2700, 3000));
    const d = createUnit(holder());
    const plain = computeFire([a, d], wideCtx, Rng.fromSeed(1), new Set()).find((x) => x.attackerId === "pz")!;
    const breached = computeFire([a, d], wideCtx, Rng.fromSeed(1), new Set(), undefined, new Map([["pz", new Set(["d"])]])).find(
      (x) => x.attackerId === "pz",
    )!;
    expect(breached.damage / plain.damage).toBeCloseTo(rules.breakthrough.breachedDamageMultiplier);
  });
});
