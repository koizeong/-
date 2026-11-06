import { describe, expect, it } from "vitest";
import { buildScenario, distance, flagshipOf, resolveTurn, Rng, shipFireToe, shipGunnery, toeFire, type GameState, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
function load(): LoadedScenario {
  const r = buildScenario(loadScenarioJson("test-naval") as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
const sc = load();
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const byId = (s: GameState) => new Map(s.units.map((u) => [u.id, u]));

describe("1隻ずつの艦と戦隊", () => {
  it("戦隊の旗艦でない艦に命令すると、その艦は戦隊を離れて単独で動く。陣形の命令は旗艦にだけ", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-ca2", waypoints: [{ x: 20500, y: 70500 }] }, { unitId: "w-dd5", navalFormation: "ring" }], sc.ctx);
    expect(r.rejectedOrders.map((x) => x.unitId)).toEqual(["w-dd5"]);
    expect(r.rejectedOrders[0]!.reason).toContain("旗艦(w-ca1)");
    const ca2 = unit(r.state, "w-ca2");
    expect(ca2.detached).toBe(true);
    expect(ca2.pos.y).toBeGreaterThan(60000);
    // 残りの艦は w-ca1 を旗艦のまま、2番艦が抜けた持ち場を詰める(w-dd5 が2番目)
    expect(flagshipOf(unit(r.state, "w-dd5"), byId(r.state), sc.ctx).id).toBe("w-ca1");
  });

  it("期待挙動:離れた艦は、旗艦の近くへ戻って止まると戦隊に戻る", () => {
    const s = sc.start(1);
    const r1 = resolveTurn(s, [{ unitId: "w-ca2", waypoints: [{ x: 20500, y: 60500 }] }], sc.ctx);
    const flag = unit(r1.state, "w-ca1");
    const r2 = resolveTurn(r1.state, [{ unitId: "w-ca2", waypoints: [{ x: flag.pos.x - 600, y: flag.pos.y }] }], sc.ctx);
    expect(unit(r2.state, "w-ca2").detached).toBeUndefined();
    expect(r2.events.some((e) => e.type === "shipRejoined" && e.unitId === "w-ca2")).toBe(true);
  });

  it("期待挙動:単縦陣の戦隊は、旗艦の後ろへ 600m 間隔の一列になってついて行く", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 50500, y: 50500 }], facingOnArrival: 90 }], sc.ctx);
    const lead = unit(r.state, "w-ca1");
    expect(lead.pos.x).toBeGreaterThan(40000);
    for (const [i, id] of ["w-ca2", "w-dd5", "w-dd6", "w-dd7", "w-dd8"].entries()) {
      const u = unit(r.state, id);
      expect(u.pos.x).toBeCloseTo(lead.pos.x - 600 * (i + 1), -2);
      expect(Math.abs(u.pos.y - lead.pos.y)).toBeLessThan(200);
    }
  });

  it("期待挙動:輪形陣の戦隊は、旗艦(空母)を中心に円く囲む", () => {
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-cv", waypoints: [{ x: 30500, y: 50500 }], facingOnArrival: 90 }], sc.ctx);
    const cv = unit(r.state, "w-cv");
    for (const id of ["w-dd1", "w-dd2", "w-dd3", "w-dd4"]) expect(distance(unit(r.state, id).pos, cv.pos)).toBeCloseTo(1500, -2);
  });

  it("期待挙動:傷ついた艦は遅く、戦隊はいちばん遅い艦に合わせて進む。遅すぎる艦は落伍して戦隊を離れる", () => {
    const go = (strength: number | null) => {
      const s = sc.start(1);
      if (strength !== null) unit(s, "w-dd8").strength = strength;
      const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 150500, y: 50500 }] }], sc.ctx);
      return { moved: unit(r.state, "w-ca1").pos.x - unit(s, "w-ca1").pos.x, r };
    };
    // 戦力 0.75:速力 15% 減で 29.75ノット(いちばん速い艦 35ノットの 0.75 倍 = 26.25 より速いので戦隊に残り、戦隊を遅くする)
    expect(go(0.75).moved / go(null).moved).toBeCloseTo((35 * 0.85) / 33, 2);
    // 戦力 0.4:速力 36% 減で 22.4ノット。落伍して戦隊を離れ、戦隊は遅くならない
    const heavy = go(0.4);
    expect(heavy.r.events.some((e) => e.type === "shipDetached" && e.unitId === "w-dd8")).toBe(true);
    expect(unit(heavy.r.state, "w-dd8").detached).toBe(true);
    expect(heavy.moved).toBeCloseTo(go(null).moved, -2);
  });

  it("期待挙動:旗艦がターンの途中で沈むと、次の艦が命令を引き継いで行き先へ向かう", () => {
    const s = sc.start(1);
    unit(s, "w-ca1").shipDamage = { fire: 1, flooding: 1, gunsLost: 0 };
    unit(s, "w-ca1").strength = 0.05;
    const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 60500, y: 30500 }] }], sc.ctx);
    expect(r.state.units.some((u) => u.id === "w-ca1")).toBe(false);
    expect(r.events.some((e) => e.type === "flagshipChanged" && e.unitId === "w-ca2")).toBe(true);
    const ca2 = unit(r.state, "w-ca2");
    expect(ca2.pos.y).toBeLessThan(45000);
  });

  it("旗艦が沈めば、次の艦が旗艦を継ぐ", () => {
    const s = sc.start(1);
    unit(s, "w-ca1").strength = 0;
    expect(flagshipOf(unit(s, "w-dd5"), byId(s), sc.ctx).id).toBe("w-ca2");
    const r = resolveTurn(s, [{ unitId: "w-ca2", waypoints: [{ x: 40500, y: 50500 }] }], sc.ctx);
    expect(r.rejectedOrders).toEqual([]);
  });

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

  it("期待挙動:重巡どうしが 15km で砲だけで撃ち合うと、1時間で双方が傷つき、火災・浸水を起こす", () => {
    // 魚雷を持たない米の重巡どうし(魚雷は S3 で作り直す)
    const sc = pacific([{ id: "p", side: "a", toe: "us-ca-new-orleans", x: 5500, y: 10500, facing: 0 }, { id: "q", side: "b", toe: "us-ca-new-orleans", x: 20500, y: 10500, facing: 180 }]);
    const r = resolveTurn(sc.start(7), [], sc.ctx);
    for (const id of ["p", "q"]) {
      const x = unit(r.state, id);
      expect(x).toBeDefined();
      expect(x.strength).toBeLessThan(0.8);
      expect(x.shipDamage).toBeDefined();
    }
  });

  it("期待挙動:火災・浸水は撃ち合いが終わっても浮力を削り、応急で収まっていく。浸水すると遅くなる", () => {
    const sc = pacific([{ id: "s", side: "a", toe: "us-ca-new-orleans", x: 5500, y: 10500, facing: 90 }]);
    const s = sc.start(1);
    const u = unit(s, "s");
    u.shipDamage = { fire: 0.6, flooding: 0.4, gunsLost: 0 };
    const r = resolveTurn(s, [{ unitId: "s", waypoints: [{ x: 35500, y: 10500 }] }], sc.ctx);
    const after = unit(r.state, "s");
    expect(after.strength).toBeLessThan(1);
    expect(after.shipDamage!.fire).toBeLessThan(0.6);
    expect(after.shipDamage!.flooding).toBeLessThan(0.4);
    const clean = resolveTurn(sc.start(1), [{ unitId: "s", waypoints: [{ x: 35500, y: 10500 }] }], sc.ctx);
    const at = (rr: typeof r) => rr.tracks["s"]!.find((p) => p.t === s.time + 600)!.x;
    expect(at(r)).toBeLessThan(at(clean) - 1000);
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

  it("期待挙動:魚雷は撃ってから雷速で走って当たる。九三式は遠くから撃て、Mk15 は近くまで撃たない", () => {
    // 陽炎型(九三式・次発装填あり)とフレッチャー級(Mk15)が 12km で向かい合い、どちらも止まっている
    const sc = pacific([{ id: "jp", side: "a", toe: "jp-dd-kagero", x: 10500, y: 10500, facing: 0 }, { id: "us", side: "b", toe: "us-dd-fletcher", x: 22500, y: 10500, facing: 0 }]);
    const r = resolveTurn(sc.start(5), [], sc.ctx);
    const launched = r.events.filter((e) => e.type === "torpedoLaunched");
    expect(launched.map((e) => e.unitId)).toContain("jp");
    expect(launched.some((e) => e.unitId === "us")).toBe(false);
    const first = launched.find((e) => e.unitId === "jp")!;
    // 12km を 48ノット(約 1480m/分)で約8分。当たるなら撃ってから7分より後
    for (const h of r.events.filter((e) => e.type === "torpedoHit")) expect(h.t - first.t).toBeGreaterThan(7 * 60);
    // 次発装填:1度撃った後、20分後にもう1度
    const jpLaunches = launched.filter((e) => e.unitId === "jp");
    if (jpLaunches.length > 1) expect(jpLaunches[1]!.t - jpLaunches[0]!.t).toBeGreaterThanOrEqual(20 * 60);
  });

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
