import { describe, expect, it } from "vitest";
import {
  backersOf,
  canBreakThrough,
  computeFire,
  supportersOf,
  createUnit,
  holdingPower,
  holdingZones,
  replayForSide,
  resolveTurn,
  Rng,
  type NewUnit,
  type SimContext,
  type ToePack,
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
  return canBreakThrough(m, holdingZones([d], ctx)[0]!, ctx);
}

describe("阻止圏と突破判定", () => {
  it("阻止圏を持つのは、展開済みで潰走していないユニットだけ", () => {
    const units = [holder(), inf("c", 0, 0, { formation: "column" }), inf("p", 0, 0, { formation: "deploying" })].map(createUnit);
    const routed = createUnit(inf("r", 0, 0, { formation: "deployed" }));
    routed.routed = true;
    expect(holdingZones([...units, routed], wideCtx).map((z) => z.unit.id)).toEqual(["d"]);
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

  it("機甲だけでは、万全の歩兵連隊を正面から抜けない。制圧・動揺で削れば抜ける", () => {
    expect(breaks(panzer(2000, 3000), holder())).toBe(false);
    expect(breaks(panzer(2000, 3000), holder(), wideCtx, (d) => (d.suppression = 0.7))).toBe(true);
    expect(breaks(panzer(2000, 3000), holder(), wideCtx, (d) => (d.morale = rules.morale.shakenBelow - 0.1))).toBe(true);
  });

  it("縦隊(行軍)のまま突っ込むと、同じ機甲でも突破できない", () => {
    expect(breaks(panzer(2000, 3000, { formation: "column" }), holder())).toBe(false);
  });

  it("側面から突くほうが、正面から突くより突破しやすい", () => {
    const worn = (d: ReturnType<typeof createUnit>) => (d.suppression = 0.3);
    expect(breaks(panzer(2000, 3000), holder(), wideCtx, worn)).toBe(false); // 正面(西)
    expect(breaks(panzer(3000, 4000), holder(), wideCtx, worn)).toBe(true); // 側面(北)
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
    const d = holdingZones([createUnit(holder())], wideCtx)[0]!;
    expect(canBreakThrough(a, d, wideCtx)).toBe(false); // 昼の縦隊
    expect(canBreakThrough(a, d, night)).toBe(true);
    // 陣地を築いた相手は、浸透移動でも抜けない
    const dug = holdingZones([createUnit(holder({ entrenchment: 2 }))], wideCtx)[0]!;
    expect(canBreakThrough(a, dug, night)).toBe(false);
  });

  it("突破に成功すると阻止圏を抜けて進み、双方に出来事が残る", () => {
    // 背を向けている(東向き)相手を、西から機甲で突く
    const s0 = state(holder({ facing: 90 }), panzer(1500, 3100));
    const r = resolveTurn(s0, [{ unitId: "pz", waypoints: [{ x: 6000, y: 3100 }], moveMode: "combat" }], wideCtx);
    // 相手(x=3000)の横を抜けて先へ進む
    expect(unitOf(r.state, "pz").pos.x).toBeGreaterThan(3000);
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
      const d = createUnit(holder());
      d.suppression = 0.7;
      return canBreakThrough(m, holdingZones([d], wideCtx)[0]!, wideCtx);
    };
    // 制圧された相手なら、万全の機甲は標準でも抜ける
    expect(breaks(panzer(2000, 3000), holder(), wideCtx, (d) => (d.suppression = 0.7))).toBe(true);
    expect(suppressed("standard")).toBe(false);
    expect(suppressed("attack")).toBe(true);
  });

  it("強襲なら、少し削っただけの歩兵連隊も機甲で正面から抜ける(万全の相手は強襲でも抜けない)", () => {
    const worn = (d: ReturnType<typeof createUnit>) => (d.suppression = 0.3);
    expect(breaks(panzer(2000, 3000), holder(), wideCtx, worn)).toBe(false);
    expect(breaks(panzer(2000, 3000, { stance: "attack" }), holder(), wideCtx, worn)).toBe(true);
    expect(breaks(panzer(2000, 3000, { stance: "attack" }), holder())).toBe(false);
  });

  it("陣地を築いた歩兵連隊(陣地3)は、制圧されていても機甲の強襲で正面からは抜けない。動揺させて背後を突けば抜ける", () => {
    const dug = holder({ entrenchment: 3 });
    const hammered = (d: ReturnType<typeof createUnit>) => (d.suppression = 0.8);
    expect(breaks(panzer(2000, 3000, { stance: "attack" }), dug, wideCtx, hammered)).toBe(false); // 正面
    expect(breaks(panzer(3000, 4000, { stance: "attack" }), dug, wideCtx, hammered)).toBe(false); // 側面
    const broken = (d: ReturnType<typeof createUnit>) => {
      d.suppression = 1;
      d.morale = rules.morale.shakenBelow - 0.1;
    };
    expect(breaks(panzer(4000, 3000, { stance: "attack" }), dug, wideCtx, broken)).toBe(true); // 背後(東)
  });

  it("陣地は、制圧で阻止の力が落ちるのを和らげる", () => {
    const zone = (ent: number, sup: number) => {
      const d = createUnit(holder({ entrenchment: ent }));
      d.suppression = sup;
      return holdingPower(holdingZones([d], wideCtx)[0]!, { x: 2000, y: 3000 }, wideCtx);
    };
    const B = rules.breakthrough;
    expect(zone(0, 0.8) / zone(0, 0)).toBeCloseTo(1 - 0.8 * B.suppressionPenalty);
    expect(zone(3, 0.8) / zone(3, 0)).toBeCloseTo(1 - 0.8 * B.suppressionPenalty * (1 - 3 * B.entrenchedSuppressionShield));
  });

  it("突破した部隊は、敵の阻止圏の中にいる間は、正面から撃たれても側面から撃たれた扱いになる(封じ込めると大損害)", () => {
    // d(東向き)が、西から正面に来た機甲 pz を撃つ
    const d = createUnit(holder({ facing: 270 }));
    const pz = createUnit(panzer(2700, 3000, { facing: 90 }));
    const shot = (exposed?: Set<string>, target = pz) => computeFire([d, target], wideCtx, Rng.fromSeed(1), new Set(), undefined, exposed).find((x) => x.attackerId === "d")!;
    // 本当に側面から撃たれた(北を向いている)ときと同じ損害
    const sideways = createUnit(panzer(2700, 3000, { facing: 0 }));
    expect(shot(new Set(["pz"])).damage).toBeCloseTo(shot(undefined, sideways).damage, 6);
    expect(shot(new Set(["pz"])).damage).toBeGreaterThan(shot().damage * rules.facing.damageMultiplier.flank);
  });

  it("突破された側はその場では崩れず、士気が少し下がるだけ(相手ごとに1ターン1回)", () => {
    const s0 = state(holder({ facing: 90 }), panzer(1500, 3100));
    const r = resolveTurn(s0, [{ unitId: "pz", waypoints: [{ x: 6000, y: 3100 }], moveMode: "combat" }], wideCtx);
    expect(r.events.filter((e) => e.unitId === "d" && e.type === "breached")).toHaveLength(1);
    const d = unitOf(r.state, "d");
    expect(d.routed).toBe(false);
  });

  it("戦力の集中:1部隊ずつでは抜けない阻止圏も、同じ阻止圏に押し入る味方の力を足せば抜ける", () => {
    const W = rules.breakthrough.concentrationWeight;
    expect(W).toBe(0.5);
    // 陣地のない歩兵連隊(阻止の力 1080)を、歩兵連隊3個で正面から押す:(1080 + 0.5×2×1080) / 1080 = 2.0
    const open = holdingZones([createUnit(holder())], wideCtx)[0]!;
    const pushing = (id: string, y: number) => {
      const u = createUnit(ger(id, 2400, y, { formation: "deployed" }));
      u.route = [{ x: 4000, y, onRoad: false }];
      return u;
    };
    const [a, b, c] = [pushing("a", 3000), pushing("b", 3300), pushing("c", 2700)];
    expect(canBreakThrough(a, open, wideCtx)).toBe(false);
    const sup = supportersOf(a, open, holdingZones([a, b, c], wideCtx).concat(open), wideCtx);
    expect(sup.map((u) => u.id)).toEqual(["b", "c"]);
    expect(canBreakThrough(a, open, wideCtx, a.pos, sup)).toBe(true);
    // 2個だけでは足りない
    expect(canBreakThrough(a, open, wideCtx, a.pos, [b])).toBe(false);
  });

  it("戦力の集中は守る側にも効く:隣の味方が支える阻止圏は抜きにくい", () => {
    const pz = createUnit(panzer(2000, 3000));
    const d = createUnit(holder());
    d.suppression = 0.7; // 単独なら万全の機甲連隊に抜かれる
    const nb = createUnit(inf("nb", 3000, 3600, { formation: "deployed", facing: 270 }));
    const zs = holdingZones([d, nb], wideCtx);
    const zone = zs.find((z) => z.unit.id === "d")!;
    expect(canBreakThrough(pz, zone, wideCtx)).toBe(true);
    const backers = backersOf(zone, zs, wideCtx);
    expect(backers.map((z) => z.unit.id)).toEqual(["nb"]);
    expect(canBreakThrough(pz, zone, wideCtx, pz.pos, [], backers)).toBe(false);
  });

  it("戦力の集中に加わるのは、近くで(相手から一定距離以内)その相手へ向かっている展開済みの味方だけ", () => {
    const zone = holdingZones([createUnit(holder())], wideCtx)[0]!;
    const a = createUnit(ger("a", 2400, 3000, { formation: "deployed" }));
    const far = createUnit(ger("far", 1000, 3000, { formation: "deployed" }));
    far.route = [{ x: 4000, y: 3000, onRoad: false }];
    const idle = createUnit(ger("idle", 2400, 3300, { formation: "deployed" }));
    const away = createUnit(ger("away", 2400, 2700, { formation: "deployed" }));
    away.route = [{ x: 0, y: 2700, onRoad: false }];
    expect(supportersOf(a, zone, holdingZones([a, far, idle, away], wideCtx), wideCtx)).toEqual([]);
  });
});

describe("対装甲の力で割り引く阻止(breakthrough.antiArmor)", () => {
  /** 歩兵連隊から携行対戦車火器を外した編成表(対戦車火器のない歩兵) */
  const noAt: SimContext = (() => {
    const toes: ToePack = structuredClone(wideCtx.toes);
    for (const e of toes.toes.infantry_regiment!.elements) e.weapons = e.weapons.filter((w) => w.weapon !== "rocket_launcher");
    return { ...wideCtx, toes };
  })();

  it("対戦車火器を持つ歩兵の阻止の力は、戦車に対しても割り引かれない", () => {
    const pz = createUnit(panzer(2000, 3000));
    const z = holdingZones([createUnit(holder())], wideCtx)[0]!;
    expect(holdingPower(z, pz.pos, wideCtx, pz)).toBeCloseTo(holdingPower(z, pz.pos, wideCtx), 9);
  });

  it("期待挙動:対戦車火器のない歩兵連隊は、戦車連隊を阻止圏で止められない(対戦車火器があれば止まる)", () => {
    expect(breaks(panzer(2000, 3000), holder())).toBe(false);
    expect(breaks(panzer(2000, 3000), holder(), noAt)).toBe(true);
  });

  it("対戦車火器のない歩兵でも、歩兵の突破は今までどおり止められる", () => {
    expect(breaks(ger("a", 2000, 3000, { formation: "deployed" }), holder(), noAt)).toBe(false);
  });

  it("割り引きは下限(minFactor)までで、突破する側の装甲化率に比例する", () => {
    const a = rules.breakthrough.antiArmor!;
    const z = holdingZones([createUnit(holder())], noAt)[0]!;
    const pz = createUnit(panzer(2000, 3000));
    const full = holdingPower(z, pz.pos, noAt);
    const ratio = holdingPower(z, pz.pos, noAt, pz) / full;
    const armored = noAt.toes.toes.panzer_regiment!.armorRatio;
    expect(ratio).toBeGreaterThanOrEqual(1 - armored * (1 - a.minFactor) - 1e-9);
    expect(ratio).toBeLessThan(1);
  });
});
