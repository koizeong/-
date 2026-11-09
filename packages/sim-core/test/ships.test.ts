import { describe, expect, it } from "vitest";
import { baseOperational, buildScenario, distance, dropOrdnance, flagshipOf, gunneryShares, updateIllumination, resolveTurn as resolveFull, Rng, shipFireToe, shipGunnery, toeFire, type GameState, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
/** この試験は決まった長さのターンで書いてある(可変長のターンは sea-turn.test.ts) */
const resolveTurn: typeof resolveFull = (state, orders, ctx, hq) =>
  resolveFull(state, orders, ctx.rules.naval?.turn ? { ...ctx, rules: { ...ctx.rules, naval: { ...ctx.rules.naval, turn: undefined } } } : ctx, hq);
function load(): LoadedScenario {
  const r = buildScenario(loadScenarioJson("test-naval") as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
const sc = load();
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const byId = (s: GameState) => new Map(s.units.map((u) => [u.id, u]));

describe("1隻ずつの艦と戦隊", () => {







  it("期待挙動:撃つ方位へ向けられる砲の数だけ撃つ(重巡の主砲は片舷9門・艦首6門・艦尾3門)", () => {
    const toe = sc.ctx.toes.toes["gen_ca"]!;
    const fp = (arc: "bow" | "beam" | "stern") => toeFire(shipFireToe(toe, arc), sc.ctx.weapons, 15000, 0.5, false, undefined, undefined, (w) => !!w.torpedo).firepower;
    expect(fp("beam") / fp("bow")).toBeCloseTo(1.5, 1);
    expect(fp("bow") / fp("stern")).toBeGreaterThan(1.8);
  });
});

describe("太平洋 1942年の艦級", () => {
  it("どの艦級も1隻の艦で、砲の群れの武器があり、向けられる数が門数を超えない", async () => {
    const { checkToe } = await import("../src/index.js");
    const pack = packs.toes["pacific-ships-1942"]!;
    const weapons = { ...packs.weapons["naval-generic"]!, weapons: { ...packs.weapons["naval-generic"]!.weapons, ...packs.weapons["pacific-ships-1942"]!.weapons } };
    expect(Object.keys(pack.toes).length).toBeGreaterThan(25);
    for (const [id, t] of Object.entries(pack.toes)) {
      expect(t.ship, id).toBeDefined();
      expect(checkToe(t, weapons, packs.branches["ww1-korea"]!).filter((x) => x.level === "error"), id).toEqual([]);
    }
  });

  it("期待挙動:九三式魚雷は Mk15 より遠くまで届き、強い。戦艦の主砲は重巡の主砲より強い", () => {
    const w = packs.weapons["pacific-ships-1942"]!.weapons;
    const max = (id: string) => Math.max(...w[id]!.bands.map((x) => x.maxRangeM));
    expect(max("jp_type93")).toBeGreaterThan(max("us_mk15") * 1.5);
    expect(w["jp_type93"]!.bands[0]!.power).toBeGreaterThan(w["us_mk15"]!.bands[0]!.power);
    expect(w["us_16in_45"]!.bands[1]!.power).toBeGreaterThan(w["us_8in_55"]!.bands[1]!.power * 3);
  });
});

describe("砲戦(命中・貫通・火災と浸水)", () => {
  /** 太平洋の艦級で、海だけの地図に艦を置いたシナリオ(40km × 20km) */
  const pacific = (units: { id: string; side: string; toe: string; x: number; y: number; facing: number }[]) => {
    const file = {
      id: "test-gunnery",
      name: "砲戦の試験",
      packs: { rules: "ww1-korea", branches: "ww1-korea", weapons: ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], toe: ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"] },
      sides: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }],
      autoCommanders: false,
      time: { turnSeconds: 3600, stepSeconds: 60, startHour: 8 },
      map: { cellSizeM: 1000, legend: { "~": "sea" }, rows: Array.from({ length: 20 }, () => "~".repeat(40)) },
      roads: { nodes: {}, edges: [] },
      rules: { maxTurns: 4, objectives: [], victory: { a: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.9 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.8 } }, b: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.9 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.8 } } }, commandPoints: {}, weather: { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 }, air: {}, reinforcements: [], knownAtStart: units.map((u) => ({ side: u.side === "a" ? "b" : "a", unitId: u.id })) },
      units,
      depots: [],
    };
    const r = buildScenario(file, packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return r.value;
  };
  const avg = (n: number, f: (rng: Rng) => number) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += f(Rng.fromSeed(i + 1));
    return t / n;
  };

  it("期待挙動:近いほど、撃ち続けるほど当たる。大きい艦ほど当たりやすい", () => {
    const sc = pacific([{ id: "ca", side: "a", toe: "us-ca-new-orleans", x: 5500, y: 10500, facing: 0 }, { id: "t", side: "b", toe: "jp-ca-myoko", x: 15500, y: 10500, facing: 180 }]);
    const c = sc.ctx;
    const arc = shipFireToe(c.toes.toes["us-ca-new-orleans"]!, "beam");
    const t = sc.units.find((u) => u.id === "t")!;
    const hits = (toe: string, d: number, ranging: number) => avg(400, (rng) => shipGunnery(arc, t, c.toes.toes[toe]!, d, 1, 1, ranging, c, rng).hits);
    expect(hits("jp-ca-myoko", 8000, 6)).toBeGreaterThan(hits("jp-ca-myoko", 20000, 6) * 2);
    expect(hits("jp-ca-myoko", 15000, 6)).toBeGreaterThan(hits("jp-ca-myoko", 15000, 0) * 2);
    expect(hits("jp-bb-kongo", 15000, 6)).toBeGreaterThan(hits("jp-dd-kagero", 15000, 6) * 1.5);
  });

  it("期待挙動:駆逐艦の砲は戦艦の装甲を抜けず、損害は小さい。戦艦の主砲は重巡を抜く", () => {
    const sc = pacific([{ id: "x", side: "a", toe: "us-dd-fletcher", x: 5500, y: 10500, facing: 0 }]);
    const c = sc.ctx;
    const u = sc.units[0]!;
    const dd = shipFireToe(c.toes.toes["us-dd-fletcher"]!, "beam");
    // 主砲だけ(副砲の 5in は重巡の舷側を抜けない)
    const nc = shipFireToe(c.toes.toes["us-bb-north-carolina"]!, "beam");
    const bb = { ...nc, elements: [{ ...nc.elements[0]!, weapons: nc.elements[0]!.weapons.filter((w) => w.weapon === "us_16in_45") }] };
    const many = (arc: typeof dd, toe: string) => {
      let hits = 0;
      let pen = 0;
      let hp = 0;
      for (let i = 0; i < 300; i++) {
        const r = shipGunnery(arc, u, c.toes.toes[toe]!, 6000, 1, 1, 6, c, Rng.fromSeed(i + 1));
        hits += r.hits;
        pen += r.penetrating;
        hp += r.hp;
      }
      return { hits, pen, perHit: hp / Math.max(1, hits) };
    };
    const ddOnBb = many(dd, "jp-bb-kongo");
    expect(ddOnBb.hits).toBeGreaterThan(0);
    expect(ddOnBb.pen).toBe(0);
    const bbOnCa = many(bb, "jp-ca-myoko");
    expect(bbOnCa.pen / bbOnCa.hits).toBeGreaterThan(0.9);
    expect(bbOnCa.perHit).toBeGreaterThan(ddOnBb.perHit * 20);
  });


});

describe("走る魚雷と夜戦", () => {
  const pacific = (units: { id: string; side: string; toe: string; x: number; y: number; facing: number }[], cols = 40) => {
    const file = {
      id: "test-torpedo",
      name: "雷撃の試験",
      packs: { rules: "ww1-korea", branches: "ww1-korea", weapons: ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], toe: ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"] },
      sides: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }],
      autoCommanders: false,
      time: { turnSeconds: 3600, stepSeconds: 60, startHour: 8 },
      map: { cellSizeM: 1000, legend: { "~": "sea" }, rows: Array.from({ length: 20 }, () => "~".repeat(cols)) },
      roads: { nodes: {}, edges: [] },
      rules: { maxTurns: 4, objectives: [], victory: { a: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.9 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.8 } }, b: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.9 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.8 } } }, commandPoints: {}, weather: { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 }, air: {}, reinforcements: [], knownAtStart: [] },
      units,
      depots: [],
    };
    const r = buildScenario(file, packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return r.value;
  };


  it("期待挙動:駆逐艦1隻の九三式の雷撃(2斉射 16本)は、8km の重巡に当たることもあり外れることもある。当たれば大きく傷つく", () => {
    let hitRuns = 0;
    let missRuns = 0;
    let worst = 1;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const sc = pacific([
        { id: "dd", side: "a", toe: "jp-dd-kagero", x: 10500, y: 10500, facing: 0 },
        { id: "ca", side: "b", toe: "us-ca-new-orleans", x: 18500, y: 10500, facing: 0 },
      ]);
      const r = resolveTurn(sc.start(seed), [], sc.ctx);
      const ca = r.state.units.find((u) => u.id === "ca");
      const hit = r.events.some((e) => e.type === "torpedoHit" && e.unitId === "ca");
      if (hit) {
        hitRuns++;
        worst = Math.min(worst, ca?.strength ?? 0);
      } else missRuns++;
    }
    expect(hitRuns).toBeGreaterThan(0);
    expect(missRuns).toBeGreaterThan(0);
    expect(worst).toBeLessThan(0.8);
  });

  it("期待挙動:夜は見える距離が縮むが、撃った艦は発砲の光で遠くからも見える", async () => {
    const { detectionRange } = await import("../src/index.js");
    const sc = pacific([{ id: "a1", side: "a", toe: "us-ca-new-orleans", x: 5500, y: 10500, facing: 0 }, { id: "b1", side: "b", toe: "jp-ca-myoko", x: 15500, y: 10500, facing: 0 }]);
    const night = { ...sc.ctx, visibilityMultiplier: sc.ctx.visibilityMultiplier * sc.ctx.rules.night.visibilityMultiplier };
    const s = sc.start(1);
    const [a1, b1] = [unit(s, "a1"), unit(s, "b1")];
    const dark = detectionRange(a1, b1, night);
    expect(dark).toBeLessThan(detectionRange(a1, b1, sc.ctx));
    b1.revealed = true;
    expect(detectionRange(a1, b1, night)).toBeGreaterThanOrEqual(sc.ctx.rules.naval!.flashRangeM!);
    expect(detectionRange(a1, b1, night)).toBeGreaterThan(dark);
  });
});

describe("航空攻撃を艦ごとに・飛行隊・飛行甲板", () => {
  const mw = (() => {
    const r = buildScenario(loadScenarioJson("midway-1942-06-04") as Record<string, unknown>, packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    return r.value;
  })();
  const c = mw.ctx;
  const meanHits = (attacker: string, target: string, aa: number, prep?: (s: GameState) => void) => {
    let hits = 0;
    let fire = 0;
    for (let i = 0; i < 300; i++) {
      const s = mw.start(1);
      prep?.(s);
      const r = dropOrdnance(unit(s, attacker), unit(s, target), aa, s.units, c, Rng.fromSeed(i + 1));
      hits += r.hits;
      fire += r.fire;
    }
    return { hits: hits / 300, fire: fire / 300 };
  };

  it("期待挙動:急降下爆撃の飛行隊(19機)は空母に数発当てる。対空砲火が強いと減る", () => {
    const quiet = meanHits("us-tf16-enterprise-vb6", "jp-kaga", 0);
    expect(quiet.hits).toBeGreaterThan(2);
    expect(quiet.hits).toBeLessThan(6);
    expect(meanHits("us-tf16-enterprise-vb6", "jp-kaga", 80).hits).toBeLessThan(quiet.hits * 0.6);
  });

  it("期待挙動:Mk13 魚雷は不発が多く、九一式魚雷より当たって爆発する数が少ない", () => {
    const us = meanHits("us-tf16-hornet-vt8", "jp-kaga", 0).hits / 15;
    const jp = meanHits("jp-kaga-vt", "us-tf17-yorktown", 0).hits / 27;
    expect(us).toBeLessThan(jp * 0.6);
  });

  it("期待挙動:兵装中・発艦待ちの隊を載せた空母は、爆弾で大きな火災になる。火災の大きい空母は発着艦できない", () => {
    const empty = meanHits("us-tf16-enterprise-vb6", "jp-akagi", 0, (s) => {
      for (const u of s.units) if (u.air?.baseId === "jp-akagi") u.air.status = "outbound";
    });
    const armed = meanHits("us-tf16-enterprise-vb6", "jp-akagi", 0, (s) => {
      for (const u of s.units) if (u.air?.baseId === "jp-akagi") u.air.status = "rearming";
    });
    expect(armed.fire / Math.max(1e-9, armed.hits)).toBeGreaterThan((empty.fire / Math.max(1e-9, empty.hits)) * 2);
    const s = mw.start(1);
    unit(s, "jp-akagi").shipDamage = { fire: 0.6, flooding: 0, gunsLost: 0 };
    expect(baseOperational(unit(s, "jp-akagi-vb"), s.units, c)).toBe(false);
  });

  it("期待挙動:同じ空母の飛行隊は1隊ずつ発艦する(10分おき)。命令した順に飛び立つ", () => {
    const s = mw.start(1);
    const target = { unitId: "jp-akagi-vf", air: { kind: "cap" as const, over: "jp-akagi" } };
    const r = resolveTurn(s, [target, { unitId: "jp-kaga-vf", air: { kind: "cap", over: "jp-kaga" } }, { unitId: "jp-akagi-vb", air: { kind: "search", point: { x: unit(s, "jp-akagi").pos.x, y: unit(s, "jp-akagi").pos.y + 50000 } } }], c);
    const at = (id: string) => r.events.find((e) => e.type === "airLaunched" && e.unitId === id)?.t;
    expect(at("jp-akagi-vf")! - s.time).toBe(600);
    expect(at("jp-kaga-vf")! - s.time).toBe(600);
    expect(at("jp-akagi-vb")! - s.time).toBe(1200);
  });
});

describe("艦の乗員(陸の士気・疲労の決まりの代わり)", () => {
  const sc2 = load();
  it("期待挙動:艦は士気が尽きても潰走しない。陸の疲労はたまらない", () => {
    const s = sc2.start(1);
    const ca = unit(s, "w-ca1");
    ca.morale = 0.01;
    const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 60500, y: 50500 }], moveMode: "march" }], sc2.ctx);
    const after = unit(r.state, "w-ca1");
    expect(after.routed).toBe(false);
    expect(r.events.some((e) => e.type === "routed")).toBe(false);
    expect(after.fatigue).toBe(0);
  });

  it("期待挙動:動揺した艦は命中が少し落ちるが、受ける損害は増えない", async () => {
    const { damageTakenFactors, factorProduct, firepowerFactors } = await import("../src/index.js");
    const s = sc2.start(1);
    const ca = unit(s, "w-ca1");
    const calm = { fire: factorProduct(firepowerFactors(ca, sc2.ctx)), taken: factorProduct(damageTakenFactors(ca, sc2.ctx)) };
    ca.morale = 0.2;
    expect(factorProduct(firepowerFactors(ca, sc2.ctx))).toBeCloseTo(calm.fire * sc2.ctx.rules.naval!.crew.shakenAccuracyMultiplier);
    expect(factorProduct(damageTakenFactors(ca, sc2.ctx))).toBeCloseTo(calm.taken);
  });
});

/** 40km × 20km の海。island の列(西から何km目)に南北に細い島を置く */
const sea = (island: number | null, units: { id: string; side: string; toe: string; x: number; y: number; facing: number; training?: string }[], extra: Record<string, unknown> = {}) => {
  const rows = Array.from({ length: 20 }, (_, r) => [...Array(40)].map((_, c) => (island !== null && c === island && r >= 5 && r < 15 ? "." : "~")).join(""));
  const file = {
    id: "test-sighting",
    name: "見張りの試験",
    packs: { rules: "ww1-korea", branches: "ww1-korea", weapons: ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], toe: ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"] },
    sides: [{ id: "a", name: "甲" }, { id: "b", name: "乙" }],
    autoCommanders: false,
    time: { turnSeconds: 1200, stepSeconds: 60, startHour: 8 },
    map: { cellSizeM: 1000, legend: { "~": "sea", ".": "plain" }, rows },
    roads: { nodes: {}, edges: [] },
    rules: { maxTurns: 4, objectives: [], victory: { a: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.9 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.8 } }, b: { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.9 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.8 } } }, commandPoints: {}, weather: { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 }, air: {}, reinforcements: [], ...extra },
    units,
    depots: [],
  };
  const r = buildScenario(file, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
};

describe("見張りと電探(航跡・陸影・陸の反射)", () => {
  it("期待挙動:夜は、速い艦は航跡で遠くから見つかり、遅い艦は見つかりにくい", async () => {
    const { detectionRange } = await import("../src/index.js");
    const s = sea(null, [
      { id: "a1", side: "a", toe: "jp-ca-myoko", x: 5500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "us-ca-new-orleans", x: 25500, y: 10500, facing: 270 },
    ]);
    const st = s.start(1);
    const b1 = unit(st, "b1");
    const night = { ...s.ctx, visibilityMultiplier: 0.25 };
    b1.speedMps = 30 / 1.943844;
    const fast = detectionRange(unit(st, "a1"), b1, night);
    b1.speedMps = 10 / 1.943844;
    const slow = detectionRange(unit(st, "a1"), b1, night);
    expect(fast / slow).toBeCloseTo(1.5 / (0.6 + (0.2 * 10) / 12), 2);
    // 昼は速さで変わらない(夜の 30ノットの艦は、昼の 1/4 の視界 × 航跡 1.5 × 日本の艦の夜の見張り 1.8)
    expect(fast / detectionRange(unit(st, "a1"), b1, s.ctx)).toBeCloseTo(0.25 * 1.5 * 1.8, 5);
  });

  it("期待挙動:陸を背にした艦は目で見つけにくい。島の陰の艦には電探が届かず、島の近くの艦には電探の届く距離が縮む", async () => {
    const { detectionRange, detectionLevel } = await import("../src/index.js");
    // 島は西から 20km 目。乙の艦は島の手前 2km(陸を背にする)
    const s = sea(20, [
      { id: "a1", side: "a", toe: "us-cv-yorktown", x: 5500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "jp-ca-myoko", x: 18500, y: 10500, facing: 270 },
    ]);
    const open = sea(null, [
      { id: "a1", side: "a", toe: "us-cv-yorktown", x: 5500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "jp-ca-myoko", x: 18500, y: 10500, facing: 270 },
    ]);
    const st = s.start(1);
    const so = open.start(1);
    expect(detectionRange(unit(st, "a1"), unit(st, "b1"), s.ctx) / detectionRange(unit(so, "a1"), unit(so, "b1"), open.ctx)).toBeCloseTo(0.6, 5);
    // 電探(30km):開けた海なら 13km 先は反応あり。島の近く(3km 以内)では 30km × 0.3 = 9km までしか届かない
    const night = { ...s.ctx, visibilityMultiplier: 0.01 };
    const nightOpen = { ...open.ctx, visibilityMultiplier: 0.01 };
    expect(detectionLevel(unit(so, "a1"), unit(so, "b1"), nightOpen)).toBe(1);
    expect(detectionLevel(unit(st, "a1"), unit(st, "b1"), night)).toBe(0);
    unit(st, "b1").pos = { x: 12500, y: 10500 };
    unit(st, "a1").pos = { x: 5500, y: 10500 };
    // 7km 先で、島からは 7.5km 離れた:届く
    expect(detectionLevel(unit(st, "a1"), unit(st, "b1"), night)).toBe(1);
    // 島の向こう(西から 25km)の艦には届かない
    unit(st, "b1").pos = { x: 25500, y: 10500 };
    unit(st, "a1").pos = { x: 15500, y: 10500 };
    expect(detectionLevel(unit(st, "a1"), unit(st, "b1"), night)).toBe(0);
  });
});

describe("見分けと射撃用の電探", () => {
  // 夜(暗い時間)に、電探のあるフレッチャー級が 9km 先の陽炎型を電探でだけ捉える
  const night = (training?: string) =>
    sea(null, [
      { id: "a1", side: "a", toe: "us-dd-fletcher", x: 5500, y: 10500, facing: 90, ...(training ? { training } : {}) },
      { id: "b1", side: "b", toe: "jp-dd-kagero", x: 14500, y: 10500, facing: 90 },
    ], { darkTurns: [{ from: 1, to: 4 }] });

  it("期待挙動:電探の反応だけの艦は、見分けるまで(標準の練度で4分)撃たない。撃ってきた艦はすぐ撃てる", async () => {
    const { canEngage, updateIdentification, detectionLevel } = await import("../src/index.js");
    const s = night();
    const st = s.start(1);
    const ctx = { ...s.ctx, visibilityMultiplier: 0.25 };
    const [a, b] = [unit(st, "a1"), unit(st, "b1")];
    expect(detectionLevel(a, b, ctx)).toBe(1);
    expect(canEngage(a, b, ctx)).toBe(false);
    for (let m = 0; m < 3; m++) updateIdentification(st.units, ctx, 1);
    expect(canEngage(a, b, ctx)).toBe(false);
    updateIdentification(st.units, ctx, 1);
    expect(canEngage(a, b, ctx)).toBe(true);
    // 見失うと忘れる
    b.pos = { x: 39500, y: 19500 };
    updateIdentification(st.units, ctx, 1);
    expect(a.identifying).toBeUndefined();
    b.pos = { x: 14500, y: 10500 };
    b.revealed = true;
    expect(canEngage(a, b, ctx)).toBe(true);
  });

  it("期待挙動:未熟な艦は見分けるのに長くかかる", async () => {
    const { identifyMinutesNeeded } = await import("../src/index.js");
    const s = night("green");
    const st = s.start(1);
    expect(identifyMinutesNeeded(unit(st, "a1"), s.ctx)).toBeCloseTo(6, 5);
  });

});

describe("主砲の弾", () => {
  const s = sea(null, [
    { id: "a1", side: "a", toe: "jp-bb-kongo", x: 5500, y: 10500, facing: 0 },
    { id: "b1", side: "b", toe: "us-ca-portland", x: 15500, y: 10500, facing: 0 },
  ]);
  const toe = (id: string) => s.ctx.toes.toes[id]!;
  const fire = (heLoaded: boolean, d: number, seed: number) => {
    const st = s.start(1);
    const a = unit(st, "a1");
    if (heLoaded) a.heLoaded = 15;
    const arc = shipFireToe(toe("jp-bb-kongo"), "beam");
    const rng = Rng.fromSeed(seed);
    const out = { hits: 0, penetrating: 0, shots: 0 };
    for (let m = 0; m < 10; m++) {
      const r = shipGunnery(arc, unit(st, "b1"), toe("us-ca-portland"), d, 1, 1, 99, s.ctx, rng, { unit: a, toe: toe("jp-bb-kongo") });
      out.hits += r.hits;
      out.penetrating += r.penetrating;
      out.shots += r.shots ?? 0;
    }
    return { ...out, shells: a.shells! };
  };

  it("期待挙動:撃った分だけ徹甲弾が減り、尽きると榴弾を撃つ", () => {
    const st = s.start(1);
    const a = unit(st, "a1");
    const arc = shipFireToe(toe("jp-bb-kongo"), "beam");
    const rng = Rng.fromSeed(3);
    const start = { ...shellsLeft() };
    function shellsLeft() {
      return { ap: a.shells?.["jp_14in_45"]?.ap ?? 8 * 90, he: a.shells?.["jp_14in_45"]?.he ?? 8 * 40 };
    }
    expect(start).toEqual({ ap: 720, he: 320 });
    for (let m = 0; m < 400; m++) shipGunnery(arc, unit(st, "b1"), toe("us-ca-portland"), 8000, 1, 1, 99, s.ctx, rng, { unit: a, toe: toe("jp-bb-kongo") });
    // 8門 × 1.5発/分 × 0.3(戦いの中で撃ち続けられる割合)= 3.6発/分。200分で徹甲弾 720 発を撃ち尽くし、残りの約89分で榴弾 320 発
    expect(a.shells!["jp_14in_45"]!.ap).toBe(0);
    expect(a.shells!["jp_14in_45"]!.he).toBe(0);
  });

  it("期待挙動:対地砲撃の榴弾を揚弾していた艦は、重巡の舷側を抜けない(比叡)", () => {
    let ap = 0;
    let he = 0;
    for (let seed = 1; seed <= 20; seed++) {
      ap += fire(false, 8000, seed).penetrating;
      he += fire(true, 8000, seed).penetrating;
    }
    expect(ap).toBeGreaterThan(5);
    // 榴弾が抜けるのは薄い甲板に当たったときだけ
    expect(he).toBeLessThan(ap * 0.3);
  });

  it("期待挙動:遠いほど弾着を見て撃つので、発射が遅く弾も減りにくい", () => {
    // 主砲(8門 × 1.5発/分 × 10分 × 0.3 = 36発)だけを比べる。25km は 0.18 と 0.12 の間で 0.15(8km の半分)
    const used = (d: number) => 720 - fire(false, d, 1).shells["jp_14in_45"]!.ap;
    expect(used(8000)).toBeCloseTo(36, 5);
    expect(used(25000)).toBeCloseTo(18, 5);
  });
});

describe("動力の停止と応急", () => {
  it("期待挙動:動力の止まった艦は止まり、電探が使えず、応急で(標準の練度で60分)戻る", async () => {
    const { addShipDamage, stepShipDamage, detectionLevel, moveSpeedMps } = await import("../src/index.js");
    const s = sea(null, [
      { id: "a1", side: "a", toe: "us-cv-yorktown", x: 5500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "jp-ca-myoko", x: 18500, y: 10500, facing: 270 },
    ]);
    const st = s.start(1);
    const a = unit(st, "a1");
    const night = { ...s.ctx, visibilityMultiplier: 0.01 };
    expect(detectionLevel(a, unit(st, "b1"), night)).toBe(1);
    const speed0 = moveSpeedMps(a, { x: 30000, y: 10500 }, s.ctx);
    addShipDamage(a, { fire: 0, flooding: 0, gunsLost: 0, powerOutMin: 60 });
    expect(moveSpeedMps(a, { x: 30000, y: 10500 }, s.ctx)).toBe(0);
    expect(detectionLevel(a, unit(st, "b1"), night)).toBe(0);
    for (let m = 0; m < 59; m++) stepShipDamage(a, s.ctx);
    expect(a.shipDamage!.powerOut).toBeGreaterThan(0);
    stepShipDamage(a, s.ctx);
    expect(a.shipDamage!.powerOut).toBeUndefined();
    expect(moveSpeedMps(a, { x: 30000, y: 10500 }, s.ctx)).toBeCloseTo(speed0, 6);
  });

  it("期待挙動:魚雷は抜けた砲弾より動力を止めやすい", async () => {
    const { rollPowerLoss } = await import("../src/index.js");
    const s = sea(null, [{ id: "a1", side: "a", toe: "jp-ca-myoko", x: 5500, y: 10500, facing: 90 }, { id: "b1", side: "b", toe: "jp-ca-myoko", x: 9500, y: 10500, facing: 90 }]);
    const t = unit(s.start(1), "a1");
    const rng = Rng.fromSeed(5);
    let torp = 0;
    let shell = 0;
    for (let i = 0; i < 400; i++) {
      if (rollPowerLoss(t, { torpedoes: 1 }, s.ctx, rng) !== undefined) torp++;
      if (rollPowerLoss(t, { penetrating: 1 }, s.ctx, rng) !== undefined) shell++;
    }
    expect(torp).toBeGreaterThan(shell * 4);
  });
});



describe("雷跡を見て避ける", () => {
  const s = sea(null, [
    { id: "a1", side: "a", toe: "us-ca-new-orleans", x: 20500, y: 10500, facing: 0 },
    { id: "b1", side: "b", toe: "jp-dd-kagero", x: 5500, y: 10500, facing: 90 },
  ]);
  // 西から東(方位 90)へ走る斉射。先頭は艦の 2km 手前
  const salvo = (weapon: string, x: number) => ({ id: "t1", side: "b", launchedBy: "b1", weapon, pos: { x, y: 10500 }, heading: 90, speedMpm: 1500, leftM: 15000, traveledM: 3000, count: 8, passed: [] as string[] });


  it("期待挙動:雷跡のほとんど見えない九三式は、近くまで来ないと気づかない", async () => {
    const { spotTorpedoes } = await import("../src/index.js");
    const st = s.start(1);
    expect(spotTorpedoes([salvo("jp_type93", 18500)], st.units, 0, s.ctx)).toEqual([]);
    expect(spotTorpedoes([salvo("jp_type93", 19700)], st.units, 0, s.ctx).length).toBe(1);
  });

  it("期待挙動:避けている斉射は当たりにくい", async () => {
    const { advanceTorpedoes } = await import("../src/index.js");
    const hits = (combing: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const st = s.start(1);
        const a = unit(st, "a1");
        if (combing) a.combing = { salvoId: "t1", untilSec: 999, heading: 0 };
        const sv = [salvo("us_mk15", 19500)];
        for (const h of advanceTorpedoes(sv, st.units, s.ctx, Rng.fromSeed(seed))) n += h.hits;
      }
      return n;
    };
    expect(hits(true)).toBeLessThan(hits(false) * 0.6);
  });
});

describe("艦種の取り違え", () => {
  it("期待挙動:兵種まで見えた艦は艦種を取り違えることがあり、規模まで見えると本当の艦種になる。空母を重巡と見れば空母とは思わない", async () => {
    const { updateIntel, contactView } = await import("../src/index.js");
    const s = sea(null, [
      { id: "a1", side: "a", toe: "jp-ca-myoko", x: 1500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "us-cv-yorktown", x: 15500, y: 10500, facing: 90 },
    ]);
    let wrong = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const st = s.start(1);
      const intel = {};
      // 14km:兵種まで(見張り 30km の 0.3〜0.6)
      updateIntel(intel, st.units, 0, s.ctx, Rng.fromSeed(seed));
      const e = (intel as Record<string, { entries: Record<string, Parameters<typeof contactView>[0]> }>)["a"]!.entries["b1"]!;
      const v = contactView(e);
      expect(v.currentLevel).toBe(2);
      if (v.shipType !== "carrier") {
        wrong++;
        expect(v.shipType).toBe("heavy_cruiser");
        expect(v.carrier).toBeUndefined();
      } else expect(v.carrier).toBe(true);
      // 近づいて規模まで見えると本当の艦種
      unit(st, "b1").pos = { x: 6500, y: 10500 };
      updateIntel(intel, st.units, 60, s.ctx, Rng.fromSeed(seed));
      expect(contactView(e).shipType).toBe("carrier");
      expect(contactView(e).carrier).toBe(true);
    }
    expect(wrong / N).toBeGreaterThan(0.15);
    expect(wrong / N).toBeLessThan(0.45);
  });
});

describe("雷撃して反転と、艦にかけない陸の決まり", () => {

  it("期待挙動:艦は撃たれても制圧を受けず、陸の弾薬を使わない", () => {
    const s = sea(null, [
      { id: "a1", side: "a", toe: "us-ca-new-orleans", x: 5500, y: 10500, facing: 0 },
      { id: "b1", side: "b", toe: "jp-ca-myoko", x: 15500, y: 10500, facing: 0 },
    ]);
    const r = resolveTurn(s.start(1), [], s.ctx);
    for (const id of ["a1", "b1"]) {
      const u = unit(r.state, id);
      expect(u.strength).toBeLessThan(1);
      expect(u.ammo).toBe(1);
      // 制圧のゲージは火災の煙だけ
      expect(u.suppression).toBeCloseTo(u.shipDamage?.fire ?? 0, 1);
    }
  });
});

describe("暗い時間の航空隊", () => {
  it("期待挙動:暗い時間(darkTurns)は航空隊が発進できない", () => {
    const file = loadScenarioJson("test-naval") as { rules: Record<string, unknown> };
    file.rules.darkTurns = [{ from: 1, to: 3 }];
    const r = buildScenario(file, packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    const st = r.value.start(1);
    expect(st.dark).toBe(true);
    const scout = st.units.find((u) => u.air && r.value.ctx.toes.toes[u.toe]!.air!.role === "scout")!;
    const res = resolveTurn(st, [{ unitId: scout.id, air: { kind: "search", point: { x: 70000, y: 40000 } } }], r.value.ctx);
    expect(res.rejectedOrders[0]?.reason).toContain("暗い間");
  });
});

describe("大破した艦は戦列を離れる", () => {
  it("期待挙動:戦力が5割を下回った艦は、近くに敵の艦が見えれば戦隊を離れて敵から離れる(1度だけ)", async () => {
    const { breakOffDamaged } = await import("../src/index.js");
    const s = sea(null, [
      { id: "a1", side: "a", toe: "us-ca-new-orleans", x: 5500, y: 10500, facing: 0 },
      { id: "b1", side: "b", toe: "jp-ca-myoko", x: 15500, y: 10500, facing: 0 },
    ]);
    const st = s.start(1);
    const a = unit(st, "a1");
    expect(breakOffDamaged(st.units, s.ctx)).toEqual([]);
    a.strength = 0.45;
    expect(breakOffDamaged(st.units, s.ctx)).toEqual(["a1"]);
    expect(a.detached).toBe(true);
    expect(a.route[0]!.x).toBeLessThan(a.pos.x);
    a.route = [];
    expect(breakOffDamaged(st.units, s.ctx)).toEqual([]);
  });
});

describe("艦砲の目標の選び方", () => {
  const s = sea(null, [
    { id: "a1", side: "a", toe: "us-bb-north-carolina", x: 5500, y: 10500, facing: 0 },
    { id: "a2", side: "a", toe: "us-dd-bagley", x: 5500, y: 12500, facing: 0 },
    { id: "dd", side: "b", toe: "jp-dd-kamikaze", x: 10500, y: 10500, facing: 0 },
    { id: "bb", side: "b", toe: "jp-bb-kongo", x: 17500, y: 10500, facing: 0 },
  ]);
  const st = s.start(1);
  const targets = [unit(st, "dd"), unit(st, "bb")];
  const shares = (id: string) => {
    const a = unit(st, id);
    const g = gunneryShares(a, s.ctx.toes.toes[a.toe]!, targets, [0.5, 0.5], s.ctx, (t) => distance(a.pos, t.pos))!;
    return g;
  };

  it("期待挙動:戦艦の主砲は近い駆逐艦より遠い戦艦を撃ち、駆逐艦の砲は近い艦を撃つ", () => {
    const bb = shares("a1");
    const main = [...bb.entries()].sort((x, y) => s.ctx.weapons.weapons[y[0]]!.naval!.shellKg - s.ctx.weapons.weapons[x[0]]!.naval!.shellKg)[0]![1];
    expect(main[1]!).toBeGreaterThan(main[0]!);
    // 合計は陸の決め方で艦に割り振った分(1)
    expect(main[0]! + main[1]!).toBeCloseTo(1);
    const dd = [...shares("a2").values()][0]!;
    expect(dd[0]!).toBeGreaterThan(dd[1]!);
  });

  it("期待挙動:撃ち続けている目標を変えたがらない", () => {
    const a = unit(st, "a2");
    const before = [...shares("a2").values()][0]![1]!;
    a.ranging = { targetId: "bb", minutes: 5 };
    const after = [...shares("a2").values()][0]![1]!;
    delete a.ranging;
    expect(after).toBeGreaterThan(before);
  });
});



describe("シナリオから艦の状態を持ち込む", () => {
  it("揚弾している榴弾(heLoaded)がシナリオから部隊に入る", () => {
    const r = buildScenario(loadScenarioJson("guadalcanal-1942-11-14") as Record<string, unknown>, packs);
    if (!r.ok) throw new Error(r.errors.join("\n"));
    expect(unit(r.value.start(1), "jp-main-kirishima").heLoaded).toBe(15);
  });
});



describe("魚雷の次発装填", () => {

  it("シナリオで艦ごとに次発装填の数を書ける(ドラム缶を積んで予備の魚雷を降ろした駆逐艦)", () => {
    const s = sea(null, [{ id: "a1", side: "a", toe: "jp-dd-kagero", x: 5500, y: 10500, facing: 0, torpedoReloads: 0 }, { id: "b1", side: "b", toe: "us-dd-bagley", x: 35500, y: 10500, facing: 0 }] as never);
    expect(unit(s.start(1), "a1").torpedoLoad).toEqual({ salvosLeft: 1, readyAt: 0 });
  });
});

describe("探照灯の照明", () => {
  it("期待挙動:暗いとき、探照灯のある日本の艦はいちばん近い見えている敵の艦を照らし、自分も光で見える。米艦は照らさない。昼は照らさない", () => {
    const s = sea(null, [
      { id: "a1", side: "a", toe: "jp-ca-myoko", x: 5500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "us-ca-new-orleans", x: 9500, y: 10500, facing: 270 },
      { id: "b2", side: "b", toe: "us-ca-new-orleans", x: 11500, y: 10500, facing: 270 },
    ]);
    const st = s.start(1);
    const night = { ...s.ctx, visibilityMultiplier: 0.25 };
    for (const u of st.units) u.revealed = true;
    updateIllumination(st.units, night);
    expect(unit(st, "b1").illuminated).toBe(true);
    expect(unit(st, "b2").illuminated).toBeUndefined();
    expect(unit(st, "a1").illuminated).toBeUndefined();
    updateIllumination(st.units, s.ctx);
    expect(unit(st, "b1").illuminated).toBeUndefined();
  });
});

describe("魚雷の見越し", () => {
  it("期待挙動:艦は、命じた経路でなく直前に実際に進んだ針路と速さで見越して狙う(戦隊の持ち場につく艦の経路は近くを指すだけ)", async () => {
    const { interceptPoint } = await import("../src/index.js");
    const s = sea(null, [
      { id: "a1", side: "a", toe: "jp-dd-kagero", x: 5500, y: 10500, facing: 90 },
      { id: "b1", side: "b", toe: "us-ca-new-orleans", x: 15500, y: 5500, facing: 0 },
    ]);
    const st = s.start(1);
    const b = unit(st, "b1");
    // 持ち場へ向かう経路は東のすぐ近くを指しているが、実際には北へ 15m/秒で進んでいる
    b.route = [{ x: 15600, y: 5500 }];
    b.speedMps = 15;
    const aim = interceptPoint(unit(st, "a1").pos, b, 24, s.ctx);
    expect(aim.y).toBeGreaterThan(8000);
    expect(Math.abs(aim.x - 15500)).toBeLessThan(1);
  });
});
