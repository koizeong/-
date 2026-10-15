import { buildScenario, createUnit, resolveTurn, startScenario, viewForSide, type GameState, type SimContext } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";
import { assess } from "../src/assess.js";
import { decide } from "../src/index.js";
import { symCtx, symDepots, symStart, symUnits } from "./fixtures.js";

const unitById = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;

describe("AIの判断", () => {
  it("同じ入力からは同じ決定になる", () => {
    const s = symStart(1);
    expect(decide(viewForSide(s, "us"), symCtx)).toEqual(decide(viewForSide(s, "us"), symCtx));
  });

  it("視界のチートをしない:見えていない敵の位置が違っても、決定は同じ", () => {
    const a = symStart(1);
    const b = symStart(1);
    // 見えていない東側の敵を動かしておく
    unitById(b, "de-inf1").pos = { x: 9000, y: 9000 };
    unitById(b, "de-arm").pos = { x: 9800, y: 2000 };
    expect(viewForSide(a, "us")).toEqual(viewForSide(b, "us"));
    expect(decide(viewForSide(a, "us"), symCtx)).toEqual(decide(viewForSide(b, "us"), symCtx));
  });

  it("誰も持っていない目標へ部隊を向かわせ、同じ目標に偏らない", () => {
    const d = decide(viewForSide(symStart(1), "us"), symCtx);
    const moving = d.orders.filter((o) => o.waypoints?.length);
    expect(moving.length).toBeGreaterThanOrEqual(3);
    const dests = new Set(moving.map((o) => `${Math.round(o.waypoints![0]!.x)},${Math.round(o.waypoints![0]!.y)}`));
    expect(dests.size).toBeGreaterThanOrEqual(2);
  });

  it("出す命令と砲撃要請は、すべてルール上有効", () => {
    let s = symStart(3);
    for (let t = 0; t < 8; t++) {
      const us = decide(viewForSide(s, "us"), symCtx);
      const de = decide(viewForSide(s, "de"), symCtx);
      const r = resolveTurn(s, [...us.orders, ...de.orders], symCtx, [...us.hqCommands, ...de.hqCommands]);
      expect(r.rejectedOrders).toEqual([]);
      expect(r.rejectedHqCommands).toEqual([]);
      s = r.state;
    }
  });

  /** us が中央を持ち、us-inf1 が中央に陣取っていて、de-inf1 が迫っている状態(us から見えている) */
  const holdingCenter = (ctx: SimContext) => {
    const units = symUnits().filter((u) => u.id === "us-inf1" || u.id === "de-inf1");
    const s = startScenario(units.map(createUnit), 1, ctx, symDepots);
    // 価値の高い中央を us が持っている(価値の低い北や南を取りに行くより、守る方が得)
    s.objectives.center = "us";
    const center = ctx.scenario.objectives.find((o) => o.id === "center")!;
    unitById(s, "us-inf1").pos = { x: center.x, y: center.y };
    unitById(s, "de-inf1").pos = { x: center.x, y: center.y + 1200 };
    const seen = resolveTurn(s, [], ctx).state;
    return decide(viewForSide(seen, "us"), ctx).orders.find((x) => x.unitId === "us-inf1")!;
  };

  it("保持している目標の近くに敵がいれば守る。勝利条件に欠かせない目標でなければ死守は使わず、損害時の後退を仕込む", () => {
    const v = symCtx.scenario.victory.us!;
    const ctx: SimContext = {
      ...symCtx,
      scenario: { ...symCtx.scenario, victory: { ...symCtx.scenario.victory, us: { ...v, limited: { ...v.limited, required: [] } } } },
    };
    const o = holdingCenter(ctx);
    expect(o.stance ?? "standard").toBe("standard");
    expect(o.conditional?.when).toEqual({ type: "strengthBelow", threshold: 0.4 });
  });

  /** 勝利条件に欠かせない目標がない文脈で、中央を守る us-inf1(向き facing)と、offset の位置の de-inf1 */
  const ambushCase = (facing: number, offset: { x: number; y: number }) => {
    const v = symCtx.scenario.victory.us!;
    const ctx: SimContext = {
      ...symCtx,
      scenario: { ...symCtx.scenario, victory: { ...symCtx.scenario.victory, us: { ...v, limited: { ...v.limited, required: [] } } } },
    };
    const units = symUnits().filter((u) => u.id === "us-inf1" || u.id === "de-inf1");
    const s = startScenario(units.map(createUnit), 1, ctx, symDepots);
    s.objectives.center = "us";
    const center = ctx.scenario.objectives.find((o) => o.id === "center")!;
    const us = unitById(s, "us-inf1");
    us.pos = { x: center.x, y: center.y };
    us.facing = facing;
    us.formation = "deployed";
    unitById(s, "de-inf1").pos = { x: center.x + offset.x, y: center.y + offset.y };
    const seen = resolveTurn(s, [], ctx).state;
    return decide(viewForSide(seen, "us"), ctx).orders.find((x) => x.unitId === "us-inf1");
  };

  it("目標を守っていて、敵が正面から近づいてくれば伏撃で待ち構える", () => {
    expect(ambushCase(0, { x: 0, y: 1500 })?.stance).toBe("ambush");
  });

  it("敵が側面にいれば伏撃しない(側面・背後に弱いため)。撃ち合う距離まで来ていても今から伏撃には入らない", () => {
    expect(ambushCase(90, { x: 0, y: 1500 })?.stance ?? "standard").toBe("standard");
    expect(ambushCase(0, { x: 0, y: 500 })?.stance ?? "standard").toBe("standard");
  });

  it("伏撃している部隊を動かすときは、姿勢も動ける姿勢に戻す", () => {
    const s = symStart(1);
    const u = unitById(s, "us-inf1");
    u.stance = "ambush";
    const o = decide(viewForSide(s, "us"), symCtx).orders.find((x) => x.unitId === "us-inf1");
    // 開始時は目標へ向かうので、移動命令が出る
    expect(o?.waypoints?.length).toBeGreaterThan(0);
    expect(symCtx.rules.stances[o!.stance ?? u.stance]!.immobile).toBe(false);
  });

  it("勝利条件に欠かせない目標を守っていて敵が迫っていれば、死守する(後退は仕込まない)", () => {
    // 対称シナリオでは、中央は限定的勝利に欠かせない目標
    expect(symCtx.scenario.victory.us!.limited.required).toContain("center");
    const o = holdingCenter(symCtx);
    expect(o.stance).toBe("defense");
    expect(symCtx.rules.stances.defense!.lastStand).toBe(true);
    expect(o.conditional).toBeUndefined();
    expect(o.waypoints).toBeUndefined();
  });

  it("弱ったユニットは敵から離れる方向へ下がる", () => {
    const s = symStart(1);
    const u = unitById(s, "us-inf1");
    u.strength = 0.3;
    u.morale = 0.4;
    const d = decide(viewForSide(s, "us"), symCtx);
    const o = d.orders.find((x) => x.unitId === "us-inf1")!;
    expect(o.moveMode).toBe("march");
    expect(o.waypoints![0]!.x).toBeLessThan(u.pos.x);
  });

  it("砲兵は見えている敵を撃つが、味方が近くにいる敵には撃たない", () => {
    const units = symUnits().filter((u) => ["us-art", "us-rec", "de-inf1"].includes(u.id));
    const s = startScenario(units.map(createUnit), 1, symCtx, symDepots);
    unitById(s, "us-art").formation = "deployed";
    unitById(s, "us-rec").pos = { x: 4000, y: 6500 };
    unitById(s, "de-inf1").pos = { x: 6500, y: 6500 }; // 偵察から2.5km
    const seen = resolveTurn(s, [], symCtx).state;
    const d = decide(viewForSide(seen, "us"), symCtx);
    expect(d.hqCommands).toHaveLength(1);
    expect(d.hqCommands[0]).toMatchObject({ type: "fireMission", unitId: "us-art" });

    // 偵察が敵に張り付いていれば撃たない(誤射を避ける)
    unitById(seen, "us-rec").pos = { x: 6200, y: 6500 };
    expect(decide(viewForSide(seen, "us"), symCtx).hqCommands).toEqual([]);
  });
});

describe("指揮ポイント", () => {
  const limited = (points: number) => ({ ...symCtx, scenario: { ...symCtx.scenario, commandPoints: { us: points, de: points } } });

  it("AIは指揮ポイントの上限内に命令と砲撃要請を収める", () => {
    for (const points of [0, 1, 2, 3]) {
      const ctx = limited(points);
      let s = symStart(2);
      for (let t = 0; t < 6; t++) {
        const us = decide(viewForSide(s, "us"), ctx);
        const de = decide(viewForSide(s, "de"), ctx);
        expect(us.orders.length + us.hqCommands.length).toBeLessThanOrEqual(points);
        const r = resolveTurn(s, [...us.orders, ...de.orders], ctx, [...us.hqCommands, ...de.hqCommands]);
        expect(r.rejectedOrders).toEqual([]);
        expect(r.rejectedHqCommands).toEqual([]);
        s = r.state;
      }
    }
  });

  it("ポイントが少なければ、撤退を最優先する", () => {
    const s = symStart(1);
    const u = unitById(s, "us-inf1");
    u.morale = 0.4;
    const d = decide(viewForSide(s, "us"), limited(1));
    expect(d.orders.map((o) => o.unitId)).toEqual(["us-inf1"]);
  });
});

describe("航空", () => {
  const withAir = (initial: string) => ({
    ...symCtx,
    scenario: {
      ...symCtx.scenario,
      weather: { ...symCtx.scenario.weather, initial },
      air: { us: { strike: { sortiesPerDay: 1, weapon: "ground_attack_aircraft", count: 12, strikeMinutes: 10 }, airlift: { sortiesPerDay: 1, ammoT: 40, fuelT: 20 } } },
    },
  });

  it("晴れていれば、見えている敵へ空襲し、補給の切れた部隊へ空輸する。悪天候では要請しない", () => {
    const situation = (initial: string) => {
      const ctx = withAir(initial);
      const s = startScenario(symUnits().filter((u) => ["us-inf1", "us-rec", "de-arm"].includes(u.id)).map(createUnit), 1, ctx, []);
      // 森と町(y=4000〜6000)を避けて、見通しの通る北側に置く
      unitById(s, "us-rec").pos = { x: 3000, y: 7125 };
      unitById(s, "de-arm").pos = { x: 5500, y: 7125 };
      unitById(s, "us-inf1").ammo = 0.2;
      return { ctx, seen: resolveTurn(s, [], ctx).state };
    };
    const sunny = situation("clear");
    const kinds = decide(viewForSide(sunny.seen, "us"), sunny.ctx).hqCommands.map((c) => c.type).sort();
    expect(kinds).toEqual(["airDrop", "airStrike"]);
    const foggy = situation("fog");
    expect(decide(viewForSide(foggy.seen, "us"), foggy.ctx).hqCommands.filter((c) => c.type !== "fireMission")).toEqual([]);
  });
});

describe("夜", () => {
  it("次のターンが夜なら、砲撃も航空も要請しない", () => {
    const units = symUnits().filter((u) => ["us-art", "us-rec", "de-inf1"].includes(u.id));
    let s = startScenario(units.map(createUnit), 1, symCtx, symDepots);
    unitById(s, "us-art").formation = "deployed";
    unitById(s, "us-rec").pos = { x: 4000, y: 6500 };
    unitById(s, "de-inf1").pos = { x: 6500, y: 6500 };
    s = resolveTurn(s, [], symCtx).state;
    expect(decide(viewForSide(s, "us"), symCtx).hqCommands.length).toBeGreaterThan(0);
    s.turn = 14; // 次は夜
    expect(decide(viewForSide(s, "us"), symCtx).hqCommands).toEqual([]);
  });

  it("夜は、近くのはっきり弱い敵にだけ夜襲(戦闘移動)し、ほかの移動は浸透移動(行軍)", () => {
    const units = symUnits().filter((u) => ["us-inf1", "us-inf2", "de-rec"].includes(u.id));
    let s = startScenario(units.map(createUnit), 1, symCtx, symDepots);
    // 規模まで見える距離(900m以内)に、見通しの通る北側(森と町を避ける)に置く。規模が分からない敵には夜襲しない
    unitById(s, "us-inf1").pos = { x: 3000, y: 7125 };
    unitById(s, "de-rec").pos = { x: 3800, y: 7125 };
    unitById(s, "de-rec").strength = 0.3;
    s = resolveTurn(s, [], symCtx).state;
    s.turn = 15;
    s.phase = "night";
    const d = decide(viewForSide(s, "us"), symCtx);
    const raid = d.orders.find((o) => o.unitId === "us-inf1");
    expect(raid?.moveMode).toBe("combat");
    for (const o of d.orders.filter((x) => x.unitId !== "us-inf1" && x.waypoints?.length)) expect(o.moveMode).toBe("march");
  });

  it("夜は、夜襲と敵のいない目標の確保にしか命令を出さず、ほかは休ませる", () => {
    const units = symUnits().filter((u) => ["us-inf1", "us-inf2"].includes(u.id));
    const s = startScenario(units.map(createUnit), 1, symCtx, symDepots);
    // inf1 は昼の戦闘移動が残ったまま夜に入る。inf2 は士気が低い
    const u = unitById(s, "us-inf1");
    u.moveMode = "combat";
    u.route = [{ x: 4875, y: 5125 }];
    unitById(s, "us-inf2").morale = 0.5;
    s.turn = 15;
    s.phase = "night";
    const d = decide(viewForSide(s, "us"), symCtx);
    // inf1 は敵のいない中央へ浸透移動(目的地つきで出し直す)。士気の低い inf2 は休ませる
    const o1 = d.orders.find((x) => x.unitId === "us-inf1");
    expect(o1?.waypoints?.length).toBe(1);
    expect(o1?.moveMode).toBe("march");
    expect(d.orders.find((x) => x.unitId === "us-inf2")).toBeUndefined();
  });
});

describe("疲労", () => {
  it("疲れ切ったユニットは下げて休ませる", () => {
    const s = symStart(1);
    unitById(s, "us-inf1").fatigue = 0.95;
    const o = decide(viewForSide(s, "us"), symCtx).orders.find((x) => x.unitId === "us-inf1")!;
    expect(o.moveMode).toBe("march");
    expect(o.waypoints![0]!.x).toBeLessThan(unitById(s, "us-inf1").pos.x);
  });
});

describe("勝利条件のしきい値と戦力の振り分け", () => {
  it("重みの合計が勝利条件に効くなら、必須の目標だけに集まらず周辺の目標にも振り分ける(バストーニュ)", async () => {
    const { buildScenario } = await import("@brigade/sim-core");
    const { loadPacks, loadScenarioJson, unwrap } = await import("../../sim-core/test/helpers.js");
    const sc = unwrap(buildScenario(loadScenarioJson("bastogne-1944-12-19"), loadPacks()));
    const s = sc.start(1);
    const d = decide(viewForSide(s, "us"), sc.ctx);
    const center = sc.ctx.scenario.objectives.find((o) => o.id === "bastogne")!;
    // 移動命令の行き先(または今いる場所)ごとに、どの目標の近くかを数える
    const nearestObjective = (p: { x: number; y: number }) =>
      [...sc.ctx.scenario.objectives].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]!.id;
    const destOf = (id: string) => d.orders.find((o) => o.unitId === id)?.waypoints?.[0] ?? s.units.find((u) => u.id === id)!.pos;
    const infantry = s.units.filter((u) => u.side === "us" && u.branch !== "artillery");
    const targets = infantry.map((u) => nearestObjective(destOf(u.id)));
    expect(new Set(targets).size).toBeGreaterThanOrEqual(4);
    expect(targets.filter((t) => t === center.id).length).toBeLessThan(infantry.length / 2);
  });
});

describe("追撃と包囲", () => {
  /** 北西の開けた場所に us の部隊と de の1部隊だけを置き、1ターン進めて見えている状態にする */
  const setup = (us: Record<string, { x: number; y: number }>, de: { x: number; y: number }, tweak: (g: GameState["units"][number]) => void) => {
    const ids = [...Object.keys(us), "de-inf1"];
    const s = startScenario(symUnits().filter((u) => ids.includes(u.id)).map(createUnit), 1, symCtx, symDepots);
    for (const [id, p] of Object.entries(us)) {
      const u = unitById(s, id);
      u.pos = { ...p };
      u.formation = "deployed";
    }
    const g = unitById(s, "de-inf1");
    g.pos = { ...de };
    g.formation = "deployed";
    tweak(g);
    const seen = resolveTurn(s, [], symCtx).state;
    return { seen, d: decide(viewForSide(seen, "us"), symCtx, { caution: 0.5, noise: 0 }) };
  };

  it("潰走中の敵が見えれば、退路の先へ回り込んで追う(強襲)", () => {
    const { seen, d } = setup({ "us-inf1": { x: 2000, y: 7000 } }, { x: 2000, y: 8000 }, (g) => {
      g.routed = true;
      g.morale = 0.05;
    });
    const enemy = viewForSide(seen, "us").contacts[0]!;
    expect(enemy.routed).toBe(true);
    const o = d.orders.find((x) => x.unitId === "us-inf1")!;
    expect(o.stance).toBe("attack");
    // 回り込み先は、敵より自分から遠い(敵の向こう側)
    const me = unitById(seen, "us-inf1").pos;
    const dest = o.waypoints![0]!;
    expect(Math.hypot(dest.x - me.x, dest.y - me.y)).toBeGreaterThan(Math.hypot(enemy.pos.x - me.x, enemy.pos.y - me.y));
  });

  it("弱った孤立した敵は、複数の部隊が別々の方向から囲む", () => {
    const { seen, d } = setup(
      { "us-inf1": { x: 1600, y: 7500 }, "us-inf2": { x: 2400, y: 7500 }, "us-arm": { x: 2000, y: 7300 } },
      { x: 2000, y: 8100 },
      (g) => {
        g.strength = 0.3;
      },
    );
    const enemy = viewForSide(seen, "us").contacts[0]!;
    // 各部隊の行き先(命令がなければ今いる場所。すでに回り込み先にいれば命令は出ない)
    const ring = ["us-inf1", "us-inf2", "us-arm"]
      .map((id) => d.orders.find((o) => o.unitId === id)?.waypoints?.[0] ?? unitById(seen, id).pos)
      .filter((p) => Math.abs(Math.hypot(p.x - enemy.pos.x, p.y - enemy.pos.y) - 650) < 160);
    expect(ring.length).toBeGreaterThanOrEqual(2);
    // 回り込み先は互いに離れている(同じ場所に重ならない)
    for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) expect(Math.hypot(ring[i]!.x - ring[j]!.x, ring[i]!.y - ring[j]!.y)).toBeGreaterThan(500);
  });
});

describe("勝利条件に応じた追撃", () => {
  /** 決戦のシナリオ(対称シナリオと同じ地図・部隊で、勝利条件だけが敵の損耗率) */
  const attrition = unwrap(buildScenario(loadScenarioJson("decisive-battle"), loadPacks()));

  it("敵を削る意欲は、勝利条件に敵の損耗率があるときだけ0より大きい", () => {
    expect(assess(viewForSide(symStart(1), "us"), symCtx).attritionDrive).toBe(0);
    expect(assess(viewForSide(attrition.start(1), "us"), attrition.ctx).attritionDrive).toBeGreaterThan(0);
  });

  it("撃滅戦なら遠く(5km)の潰走した敵も追う。目標の保持で決まるシナリオでは追わない", () => {
    const pursues = (ctx: SimContext) => {
      const s = startScenario(symUnits().filter((u) => u.id === "us-inf1" || u.id === "de-inf1").map(createUnit), 1, ctx, symDepots);
      const me = unitById(s, "us-inf1");
      me.pos = { x: 2000, y: 3000 };
      me.formation = "deployed";
      const g = unitById(s, "de-inf1");
      g.pos = { x: 2000, y: 8000 };
      g.routed = true;
      g.morale = 0.05;
      // 偵察で見えている状態を作る:敵のすぐ近くに us の偵察を置いて1ターン進める
      const rec = createUnit({ ...symUnits().find((u) => u.id === "us-rec")!, pos: { x: 2000, y: 7400 } });
      s.units.push(rec);
      const seen = resolveTurn(s, [], ctx).state;
      seen.units = seen.units.filter((u) => u.id !== "us-rec");
      const v = viewForSide(seen, "us");
      const o = decide(v, ctx, { caution: 0.5, noise: 0 }).orders.find((x) => x.unitId === "us-inf1");
      const enemy = v.contacts[0]!;
      return !!o?.waypoints?.[0] && Math.hypot(o.waypoints[0].x - enemy.pos.x, o.waypoints[0].y - enemy.pos.y) < 1000;
    };
    expect(pursues(attrition.ctx)).toBe(true);
    expect(pursues(symCtx)).toBe(false);
  });

  it("消耗抑制の陣営は、近くに敵が見えれば後方へ下がる。漸減・撃滅・目標のシナリオでは意欲は0", () => {
    const pres = unwrap(buildScenario(loadScenarioJson("attrition-vs-preservation"), loadPacks()));
    expect(assess(viewForSide(pres.start(1), "us"), pres.ctx).preserveDrive).toBeGreaterThan(0);
    expect(assess(viewForSide(pres.start(1), "de"), pres.ctx).preserveDrive).toBe(0);
    expect(assess(viewForSide(symStart(1), "us"), symCtx).preserveDrive).toBe(0);
    // us-inf1 の 1.5km 東に de-inf1 が見えている状態で、us-inf1 が下がるか(行き先が今より西)
    const backs = (ctx: SimContext) => {
      const s = startScenario(symUnits().filter((u) => u.id === "us-inf1" || u.id === "de-inf1").map(createUnit), 1, ctx, symDepots);
      const me = unitById(s, "us-inf1");
      me.pos = { x: 3000, y: 8125 };
      me.formation = "deployed";
      const g = unitById(s, "de-inf1");
      g.pos = { x: 3000, y: 9325 };
      g.formation = "deployed";
      const seen = resolveTurn(s, [], ctx).state;
      const o = decide(viewForSide(seen, "us"), ctx, { caution: 0.5, noise: 0 }).orders.find((x) => x.unitId === "us-inf1");
      const now = unitById(seen, "us-inf1").pos;
      return !!o?.waypoints?.[0] && o.waypoints[0].x < now.x - 500;
    };
    expect(backs(pres.ctx)).toBe(true);
    expect(backs(symCtx)).toBe(false);
  });
});
