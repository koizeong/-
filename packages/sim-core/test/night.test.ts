import { describe, expect, it } from "vitest";
import {
  computeFire,
  createUnit,
  parseRoadNetwork,
  replayForSide,
  resolveTurn,
  RoadNetwork,
  Rng,
  startScenario,
  viewForSide,
  type GameState,
  type NewUnit,
  type SimContext,
} from "../src/index.js";
import { branches, ger, inf, rules, unitOf, unwrap, wideCtx } from "./helpers.js";

/** 1ターン目が昼、2ターン目が夜(14時間)、それで終わり */
const nightCtx: SimContext = {
  ...wideCtx,
  scenario: { ...wideCtx.scenario, maxTurns: 2, night: { turn: 2, hours: 14 } },
};
const N = rules.night;
const start = (...units: NewUnit[]) => startScenario(units.map(createUnit), 1, nightCtx);
/** 1ターン目(昼)を何もせずに過ごし、夜の手前の状態を返す */
const dusk = (...units: NewUnit[]): GameState => resolveTurn(start(...units), [], nightCtx).state;

describe("夜間フェイズ", () => {
  it("2ターン目が夜で、14時間進む。刻みは粗く、昼夜は両陣営に公開", () => {
    const s = dusk(inf("a", 1000, 1000));
    expect(s.phase).toBe("night");
    expect(viewForSide(s, "us").phase).toBe("night");
    const r = resolveTurn(s, [], nightCtx);
    expect(r.state.time - s.time).toBe(14 * 3600);
    expect(r.tracks.a!.length).toBe((14 * 3600) / N.stepSeconds + 1);
  });

  it("夜は探知距離が縮む", () => {
    const d = rules.detection.baseRangeM * 0.5;
    const s = dusk(inf("a", 1000, 5000), ger("g", 1000 + d, 5000));
    expect(s.intel.us!.entries.g!.currentLevel).toBeGreaterThan(0);
    const r = resolveTurn(s, [], nightCtx);
    expect(r.state.intel.us!.entries.g!.currentLevel).toBe(0);
  });

  it("夜は砲撃も航空も要請できない(夜に実行される要請はその場で弾く)", () => {
    const s0 = start(inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" }), ger("g", 6000, 6000));
    const r = resolveTurn(s0, [], nightCtx, [{ side: "us", type: "fireMission", unitId: "art", target: { x: 6000, y: 6000 } }]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["夜間フェイズには使えません"]);
  });

  it("夜でも、展開は昼の1ターン分(30分)で終わる", () => {
    const r = resolveTurn(dusk(inf("a", 1000, 1000)), [{ unitId: "a", deployAfterStop: true }], nightCtx);
    const done = r.events.find((e) => e.type === "formationChanged" && e.to === "deployed")!;
    expect(done.t - r.state.time + 14 * 3600).toBe(1800);
  });

  it("夜は長いぶん、道路で大量に補給が届く", () => {
    const thin = new RoadNetwork(unwrap(parseRoadNetwork({ nodes: { s: { x: 0, y: 5000 }, e: { x: 1000, y: 5000 } }, edges: [{ from: "s", to: "e", capacityTPerHour: 20 }] })));
    const ctx = { ...nightCtx, roads: thin };
    const s0 = startScenario([createUnit(inf("a", 1000, 5100, { ammo: 0 }))], 1, ctx, [{ id: "d", side: "us", nodeId: "s", ammoT: 1000, fuelT: 0 }]);
    const day = resolveTurn(s0, [], ctx).state;
    expect(unitOf(day, "a").ammo).toBeLessThan(0.2); // 昼の1ターンでは10トン足らず
    unitOf(day, "a").ammo = 0;
    expect(unitOf(resolveTurn(day, [], ctx).state, "a").ammo).toBeCloseTo(1); // 夜で満タン
  });
});

describe("浸透移動(夜の行軍)", () => {
  it("遅く、夜の活動時間を過ぎたら止まる", () => {
    const r = resolveTurn(dusk(inf("a", 500, 2000)), [{ unitId: "a", waypoints: [{ x: 9500, y: 2000 }] }], nightCtx);
    const expected = branches.branches.infantry!.marchSpeedMpm * N.infiltration.speedMultiplier * N.activeHours * 60;
    expect(unitOf(r.state, "a").pos.x - 500).toBeCloseTo(expected, 0);
  });

  it("見つかりにくく、接敵しても止まって展開しない", () => {
    // 夜の探知距離 750m。浸透移動中は 375m まで近づかないと見つからない
    const s = dusk(inf("a", 1000, 3000), ger("g", 2500, 3500, { formation: "deployed" }));
    const r = resolveTurn(s, [{ unitId: "a", waypoints: [{ x: 4000, y: 3000 }] }], nightCtx);
    const a = unitOf(r.state, "a");
    expect(a.pos).toEqual({ x: 4000, y: 3000 });
    expect(a.formation).toBe("column");
    // 夕方(昼)には見つかっていたが、夜の浸透移動中は、最も近づいたとき(500m)でも一度も探知されない
    expect(r.detections.de!.a!.every((level) => level === 0)).toBe(true);
  });
});

describe("夜襲(夜の戦闘移動)", () => {
  it("夜襲する部隊とその相手のあいだでだけ撃ち合い、ほかは夜は撃ち合わない", () => {
    const s = dusk(
      inf("raider", 2000, 5000, { formation: "deployed", facing: 90 }),
      ger("target", 2600, 5000, { formation: "deployed", facing: 270 }),
      inf("idle", 2000, 7000, { formation: "deployed", facing: 90 }),
      ger("idle2", 2500, 7000, { formation: "deployed", facing: 270 }),
    );
    const r = resolveTurn(s, [{ unitId: "raider", waypoints: [{ x: 2400, y: 5000 }], moveMode: "combat" }], nightCtx);
    const fired = new Set(r.events.filter((e) => e.type === "fired").map((e) => e.unitId));
    expect(fired).toEqual(new Set(["raider", "target"]));
    // idle と idle2 は夕方(昼)には撃ち合っていたが、夜は撃ち合わない
    expect(unitOf(r.state, "idle").strength).toBe(unitOf(s, "idle").strength);
    expect(unitOf(r.state, "idle2").strength).toBe(unitOf(s, "idle2").strength);
  });

  it("夜襲は火力が落ちるが、相手の陣地の効果を減らし、士気への打撃が大きい", () => {
    const night = { ...nightCtx, phase: "night" as const, visibilityMultiplier: 1 };
    const raider = createUnit(inf("r", 1000, 1000, { formation: "deployed", facing: 90 }));
    const dug = createUnit(ger("d", 1500, 1000, { formation: "deployed", facing: 270, entrenchment: 3 }));
    const atNight = computeFire([raider, dug], night, Rng.fromSeed(1), new Set(), { attackers: new Set(["r"]) }).find((x) => x.attackerId === "r")!;
    const byDay = computeFire([raider, dug], wideCtx, Rng.fromSeed(1), new Set()).find((x) => x.attackerId === "r")!;
    const keep = rules.combat.entrenchmentDamageTaken[3]!;
    const expected = (N.nightAttack.firepowerMultiplier * (1 - (1 - keep) * N.nightAttack.entrenchmentEffectRetained)) / keep;
    expect(atNight.damage / byDay.damage).toBeCloseTo(expected);
    expect(atNight.moraleMultiplier).toBe(N.nightAttack.moraleDamageMultiplier);
  });

  it("夜襲も、夜の活動時間を過ぎたら終わる", () => {
    const s = dusk(inf("raider", 2000, 5000, { formation: "deployed", facing: 90 }), ger("target", 2600, 5000, { formation: "deployed", facing: 270 }));
    const r = resolveTurn(s, [{ unitId: "raider", waypoints: [{ x: 2300, y: 5000 }], moveMode: "combat" }], nightCtx);
    const lastShot = Math.max(...r.events.filter((e) => e.type === "fired").map((e) => e.t));
    expect(lastShot - s.time).toBeLessThanOrEqual(N.activeHours * 3600);
  });
});

describe("増援", () => {
  const withReinforcement: SimContext = {
    ...nightCtx,
    scenario: {
      ...nightCtx.scenario,
      reinforcements: [{ turn: 2, id: "relief", side: "us", branch: "armor", toe: "armor_combat_command", x: 500, y: 500, facing: 90 }],
    },
  };

  it("指定のターンの始めに現れ、そのターンから命令でき、敵からは見えない", () => {
    const s0 = startScenario([createUnit(inf("a", 1000, 1000)), createUnit(ger("g", 9000, 9000))], 1, withReinforcement);
    const r1 = resolveTurn(s0, [], withReinforcement);
    expect(r1.state.units.map((u) => u.id)).toContain("relief");
    expect(replayForSide(r1, "us").events).toContainEqual(expect.objectContaining({ unitId: "relief", type: "reinforced" }));
    expect(JSON.stringify(viewForSide(r1.state, "de"))).not.toContain("relief");
    const r2 = resolveTurn(r1.state, [{ unitId: "relief", deployAfterStop: true }], withReinforcement);
    expect(r2.rejectedOrders).toEqual([]);
  });

  it("勝敗は夜が明けた時点(夜間フェイズの後)で出る", () => {
    const s0 = startScenario([createUnit(inf("a", 1000, 1000))], 1, withReinforcement);
    const r1 = resolveTurn(s0, [], withReinforcement);
    expect(r1.result).toBeNull();
    expect(resolveTurn(r1.state, [], withReinforcement).result).not.toBeNull();
  });
});

describe("夜間行動命令", () => {
  it("夜に目的地つきの命令を出していないユニットは、昼の経路が残っていても動かず、戦闘移動のままでも夜襲にならない", () => {
    // 夕方に戦闘移動を命じ、目的地に着かないまま夜に入る
    const s0 = start(inf("a", 2000, 5000, { formation: "deployed", facing: 90 }), ger("g", 3000, 5000, { formation: "deployed", facing: 270 }));
    const s = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 9000, y: 5000 }], moveMode: "combat" }], nightCtx).state;
    const a = unitOf(s, "a");
    expect(a.route.length).toBeGreaterThan(0);
    const r = resolveTurn(s, [], nightCtx);
    expect(unitOf(r.state, "a").pos).toEqual(a.pos);
    expect(r.events.filter((e) => e.type === "fired")).toEqual([]);
    // 経路は残り、翌朝そのまま続けられる
    expect(unitOf(r.state, "a").route).toEqual(a.route);
  });

  it("夜間行動(浸透移動・夜襲)をしたユニットは、成否にかかわらず夜の終わりに士気を大きく失う", () => {
    const s = dusk(inf("sneak", 500, 2000), inf("raider", 2000, 5000, { formation: "deployed" }), inf("rest", 500, 8000), ger("g", 2600, 5000, { formation: "deployed" }));
    const r = resolveTurn(
      s,
      [
        { unitId: "sneak", waypoints: [{ x: 1500, y: 2000 }] },
        { unitId: "raider", waypoints: [{ x: 2300, y: 5000 }], moveMode: "combat" },
      ],
      nightCtx,
    );
    // 浸透移動は撃たれていないので、休息で満タンまで戻ったあとにコストを引かれる
    expect(unitOf(r.state, "sneak").morale).toBeCloseTo(1 - N.actionMoraleCost);
    expect(unitOf(r.state, "rest").morale).toBe(1);
    expect(unitOf(r.state, "raider").morale).toBeLessThanOrEqual(1 - N.actionMoraleCost);
    expect(r.events.filter((e) => e.type === "nightStrain").map((e) => e.unitId).sort()).toEqual(["raider", "sneak"]);
  });

  it("条件付き命令は夜は発動せず、翌朝まで残る", () => {
    const s = dusk(inf("a", 1000, 5000), ger("g", 9000, 9000));
    unitOf(s, "a").strength = 0.3;
    const r = resolveTurn(s, [{ unitId: "a", conditional: { when: { type: "strengthBelow", threshold: 0.5 }, then: { waypoints: [{ x: 1000, y: 1000 }] } } }], nightCtx);
    expect(r.events.some((e) => e.type === "conditionalTriggered")).toBe(false);
    expect(unitOf(r.state, "a").conditional).not.toBeNull();
    expect(unitOf(r.state, "a").pos).toEqual({ x: 1000, y: 5000 });
  });
});
