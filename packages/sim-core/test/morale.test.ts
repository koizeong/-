import { describe, expect, it } from "vitest";
import { computeFire, createUnit, replayForSide, resolveTurn, Rng, viewForSide, type GameState, type HqCommand } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx, withoutFatigue } from "./helpers.js";

const m = rules.morale;
const turnRecovery = m.recoveryPerMin * 30;

describe("動揺", () => {
  it("士気が shakenBelow 未満だと火力が落ちる", () => {
    const fire = (morale: number) => {
      const a = createUnit(inf("a", 1000, 1000, { formation: "deployed" }));
      a.morale = morale;
      const t = createUnit(ger("t", 1500, 1000));
      return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(fire(m.shakenBelow - 0.01) / fire(1)).toBeCloseTo(m.shakenFirepowerMultiplier);
    expect(fire(m.shakenBelow) / fire(1)).toBeCloseTo(1);
  });
});

describe("潰走", () => {
  // a は東の g と 500m で撃ち合っている。士気は潰走寸前
  const brink = (): GameState => {
    const s = state(inf("a", 5000, 5000, { formation: "deployed", facing: 90 }), ger("g", 5500, 5000, { formation: "deployed", facing: 270 }));
    unitOf(s, "a").morale = m.routBelow + 0.001;
    return s;
  };

  it("期待挙動:士気が崩れた部隊は潰走して敵から離れる方向へ後退し、撃たず、命令を受け付けない", () => {
    const r1 = resolveTurn(brink(), [], wideCtx);
    const routedAt = r1.events.find((e) => e.unitId === "a" && e.type === "routed")!;
    expect(routedAt).toBeDefined();
    const a = unitOf(r1.state, "a");
    expect(a.routed).toBe(true);
    expect(a.formation).toBe("column");
    expect(a.pos.x).toBeLessThan(5000); // 西(敵と反対)へ下がる
    expect(r1.events.some((e) => e.unitId === "a" && e.type === "fired" && e.t > routedAt.t)).toBe(false);

    const r2 = resolveTurn(r1.state, [{ unitId: "a", waypoints: [{ x: 5500, y: 5000 }] }], wideCtx);
    expect(r2.rejectedOrders).toEqual([{ unitId: "a", reason: "潰走中のため命令を受け付けません" }]);
  });

  it("伏撃・死守の部隊も、潰走すれば姿勢が崩れて退却する(伏撃へ切替中に潰走しても、その場に縛られない)", () => {
    for (const setup of [(u: ReturnType<typeof unitOf>) => (u.stance = "ambush"), (u: ReturnType<typeof unitOf>) => (u.pendingStance = "ambush")]) {
      const s = brink();
      setup(unitOf(s, "a"));
      const r1 = resolveTurn(s, [], wideCtx);
      const a1 = unitOf(r1.state, "a");
      expect(a1.routed).toBe(true);
      expect(a1.stance).toBe(rules.defaultStance);
      expect(a1.pendingStance).toBeNull();
      const r2 = resolveTurn(r1.state, [], wideCtx);
      // 2ターン目も退却を続け、元の位置から大きく離れる
      expect(unitOf(r2.state, "a").pos.x).toBeLessThan(a1.pos.x);
    }
  });

  it("潰走すると条件付き命令も捨てる", () => {
    const s = brink();
    const r = resolveTurn(s, [{ unitId: "a", conditional: { when: { type: "strengthBelow", threshold: 0.1 }, then: {} } }], wideCtx);
    expect(unitOf(r.state, "a").conditional).toBeNull();
  });

  it("撃たれなくなって士気が戻ると立ち直り、その場で止まって命令を受け付ける", () => {
    const s = state(inf("a", 1000, 1000));
    const a = unitOf(s, "a");
    a.routed = true;
    a.morale = m.rallyAbove - turnRecovery / 2;
    const r = resolveTurn(s, [], wideCtx);
    expect(r.events.some((e) => e.unitId === "a" && e.type === "rallied")).toBe(true);
    expect(unitOf(r.state, "a").routed).toBe(false);
    const r2 = resolveTurn(r.state, [{ unitId: "a", waypoints: [{ x: 1500, y: 1000 }] }], wideCtx);
    expect(r2.rejectedOrders).toEqual([]);
  });

  it("潰走した砲兵は、予約済みの砲撃を撃たない", () => {
    const mission: HqCommand = { side: "us", type: "fireMission", unitId: "art", target: { x: 6000, y: 6500 } };
    const r1 = resolveTurn(state(inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" }), ger("g", 6000, 6500)), [], wideCtx, [mission]);
    unitOf(r1.state, "art").routed = true;
    unitOf(r1.state, "art").morale = 0;
    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(unitOf(r2.state, "g").strength).toBe(1);
  });
});

describe("士気の回復", () => {
  const after = (s: GameState) => unitOf(resolveTurn(s, [], wideCtx).state, "a").morale;
  const at = (extra: object, ...others: Parameters<typeof inf>[]) => {
    const s = state(inf("a", 1000, 1000, extra), ...others.map((o) => inf(...o)));
    unitOf(s, "a").morale = 0.5;
    return s;
  };

  it("撃たれておらず携行備蓄があれば回復する", () => {
    expect(after(at({}))).toBeCloseTo(0.5 + turnRecovery);
  });

  it("陣地と縦深(近くに接敵していない味方)で回復が速くなる", () => {
    const base = after(at({})) - 0.5;
    const dug = after(at({ formation: "deployed", entrenchment: 1 })) - 0.5;
    const depth = after(at({}, ["b", 2000, 1000])) - 0.5;
    expect(dug / base).toBeCloseTo(1 + m.entrenchmentRecoveryBonusPerLevel);
    expect(depth / base).toBeCloseTo(1 + m.depthRecoveryBonus);
  });

  it("撃たれている間と、備蓄が切れている間は回復しない", () => {
    expect(after(at({ ammo: 0 }))).toBeLessThan(0.5);
    const underFire = at({ formation: "deployed", facing: 90 });
    underFire.units.push(createUnit(ger("g", 1500, 1000, { formation: "deployed", facing: 270 })));
    expect(after(underFire)).toBeLessThan(0.5);
  });
});

describe("戦力0の除去", () => {
  const dying = () => {
    const s = state(inf("a", 5000, 5000, { formation: "deployed", facing: 90 }), ger("g", 5300, 5000, { formation: "deployed", facing: 270 }));
    unitOf(s, "a").strength = 0.0005;
    return s;
  };

  it("戦力0のユニットはターン終了時に除去され、自陣営の再生データには撃破が残る", () => {
    const r = resolveTurn(dying(), [], wideCtx);
    expect(r.state.units.map((u) => u.id)).toEqual(["g"]);
    expect(r.destroyed.map((u) => u.id)).toEqual(["a"]);
    const rep = replayForSide(r, "us");
    expect(rep.events.some((e) => e.type === "destroyed")).toBe(true);
    expect(rep.own.a).toBeDefined();
  });

  it("撃破を見ていた敵には撃破済みとして伝わる", () => {
    const r = resolveTurn(dying(), [], wideCtx);
    const v = viewForSide(r.state, "de");
    expect(v.contacts).toHaveLength(1);
    expect(v.contacts[0]!.destroyed).toBe(true);
    expect(v.contacts[0]!.currentLevel).toBe(0);
  });

  it("見ていないところで撃破された敵は、ゴーストのまま残る", () => {
    const art = inf("art", 1000, 1000, { branch: "artillery", formation: "deployed" });
    // 1ターン目:us は 2km 先の g を見る(ゴーストができる)
    const seen = resolveTurn(state(art, ger("g", 3000, 1000)), [], wideCtx).state;
    expect(viewForSide(seen, "us").contacts).toHaveLength(1);
    // g は視界の外へ移ったことにして、そこへ砲撃する
    const g = unitOf(seen, "g");
    g.pos = { x: 6000, y: 6500 };
    g.strength = 0.0001;
    const r1 = resolveTurn(seen, [], wideCtx, [{ side: "us", type: "fireMission", unitId: "art", target: { x: 6000, y: 6500 } }]);
    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(r2.destroyed.map((u) => u.id)).toEqual(["g"]);
    const ghost = viewForSide(r2.state, "us").contacts[0]!;
    expect(ghost.destroyed).toBeUndefined();
    expect(ghost.pos).toEqual({ x: 3000, y: 1000 });
  });
});

describe("潰走中の足", () => {
  it("潰走中は統制を失い、同じ経路でも移動が遅い", () => {
    const moved = (routed: boolean) => {
      const s0 = state(inf("a", 1000, 2000, { formation: "column", moveMode: "march" }));
      const u = unitOf(s0, "a");
      u.route = [{ x: 9000, y: 2000, onRoad: false }];
      u.routed = routed;
      u.morale = routed ? 0.1 : 1;
      return unitOf(resolveTurn(s0, [], withoutFatigue(wideCtx)).state, "a").pos.x - 1000;
    };
    expect(moved(true) / moved(false)).toBeCloseTo(rules.morale.routedSpeedMultiplier, 2);
  });
});
