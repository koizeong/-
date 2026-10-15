import { describe, expect, it } from "vitest";
import {
  applyFire,
  computeFire,
  createUnit,
  detectionRange,
  resolveTurn,
  Rng,
  updateMorale,
  type NewUnit,
} from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const HOLD = rules.stances.defense!;
const AMBUSH = rules.stances.ambush!;
const LS = rules.lastStand;

describe("死守", () => {
  it("士気が潰走のしきい値を下回っても潰走しない", () => {
    const at = (stance: string) => {
      const u = createUnit(inf("u", 1000, 1000, { stance, formation: "deployed" }));
      u.morale = rules.morale.routBelow - 0.05;
      updateMorale([u], new Set(["u"]), {}, wideCtx);
      return u.routed;
    };
    expect(at("standard")).toBe(true);
    expect(at("defense")).toBe(false);
  });

  it("動揺していると戦力を多く失い、潰走のしきい値を下回るとさらに多く失う", () => {
    const loss = (stance: string, morale: number) => {
      const t = createUnit(inf("t", 0, 0, { stance }));
      t.morale = morale;
      applyFire(new Map([["t", t]]), [{ attackerId: "a", targetId: "t", aspect: "front", damage: 0.01 }], wideCtx);
      return 1 - t.strength;
    };
    const m = rules.morale;
    expect(loss("defense", 1) / loss("standard", 1)).toBeCloseTo(1);
    expect(loss("defense", m.shakenBelow - 0.05) / loss("standard", m.shakenBelow - 0.05)).toBeCloseTo(HOLD.shakenStrengthWeightMultiplier);
    expect(loss("defense", m.routBelow - 0.05) / loss("standard", m.routBelow - 0.05)).toBeCloseTo(HOLD.brokenStrengthWeightMultiplier);
  });

  it("死守の間は移動の命令を受け付けない。動ける姿勢に変える命令と一緒なら、その場で動ける(切替中は標準扱い)", () => {
    const s0 = state(inf("a", 1000, 2000, { stance: "defense", formation: "deployed" }));
    const stay = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 3000, y: 2000 }] }], wideCtx);
    expect(stay.rejectedOrders[0]?.reason).toContain("移動できません");
    const leave = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 3000, y: 2000 }], stance: "standard" }], wideCtx);
    expect(leave.rejectedOrders).toEqual([]);
    expect(unitOf(leave.state, "a").pos.x).toBeGreaterThan(1000);
  });

  it("死守を命じると陣営の死守の重みがたまり、ターンごとに抜ける。重いほど士気の回復が遅い", () => {
    const units = (n: number) => Array.from({ length: n }, (_, i) => inf(`a${i}`, 1000 + i * 300, 2000, { formation: "deployed" }));
    const quiet = (s: ReturnType<typeof state>, orders: Parameters<typeof resolveTurn>[1]) => {
      for (const u of s.units) u.morale = 0.5;
      return resolveTurn(s, orders, wideCtx);
    };
    const none = quiet(state(...units(4)), []);
    const four = quiet(state(...units(4)), [0, 1, 2, 3].map((i) => ({ unitId: `a${i}`, stance: "defense" })));
    expect(four.state.lastStand.us).toBeCloseTo(4 * LS.gaugePerOrder - LS.decayPerTurn);
    // 撃たれていない部隊の士気の回復が、重み4の分だけ遅い
    const gain = (r: typeof none) => unitOf(r.state, "a0").morale - 0.5;
    expect(gain(four) / gain(none)).toBeCloseTo(Math.max(LS.moraleRecoveryFloor, 1 - 4 * LS.moraleRecoveryPenaltyPerPoint));
  });

  it("死守していた部隊を失うと、陣営の全部隊の士気が下がる", () => {
    const s0 = state(inf("hold", 1000, 2000, { stance: "defense", formation: "deployed", facing: 90 }), inf("other", 1000, 5000), ger("g", 1400, 2000, { formation: "deployed", facing: 270 }));
    unitOf(s0, "hold").strength = 0.001;
    const r = resolveTurn(s0, [], wideCtx);
    expect(r.state.units.some((u) => u.id === "hold")).toBe(false);
    expect(r.hqEvents.some((e) => e.type === "lastStandLost" && e.side === "us")).toBe(true);
    // 比べる相手:同じ状況で、死守していなかった場合
    const s1 = state(inf("hold", 1000, 2000, { formation: "deployed", facing: 90 }), inf("other", 1000, 5000), ger("g", 1400, 2000, { formation: "deployed", facing: 270 }));
    unitOf(s1, "hold").strength = 0.001;
    const r1 = resolveTurn(s1, [], wideCtx);
    expect(unitOf(r1.state, "other").morale - unitOf(r.state, "other").morale).toBeCloseTo(LS.lossMoraleShock);
  });
});

describe("伏撃", () => {
  const target = (extra: Partial<NewUnit> = {}) => createUnit(inf("t", 2000, 1000, { formation: "deployed", ...extra }));
  const observer = createUnit(ger("o", 1000, 1000));

  it("かなり近寄らないと見つからない。撃って露呈すると、見つかりにくさが消える", () => {
    const normal = detectionRange(observer, target(), wideCtx);
    const hidden = target({ stance: "ambush" });
    expect(detectionRange(observer, hidden, wideCtx) / normal).toBeCloseTo(AMBUSH.signatureMultiplier);
    hidden.revealed = true;
    expect(detectionRange(observer, hidden, wideCtx)).toBeCloseTo(normal);
  });

  it("伏撃の間は移動の命令を受け付けない", () => {
    const r = resolveTurn(state(inf("a", 1000, 2000, { stance: "ambush", formation: "deployed" })), [{ unitId: "a", waypoints: [{ x: 3000, y: 2000 }] }], wideCtx);
    expect(r.rejectedOrders[0]?.reason).toContain("移動できません");
  });

  it("側面・背後を突かれると、通常より大きな損害を受ける(正面は変わらない)", () => {
    const hit = (stance: string, facing: number) => {
      const a = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }));
      // 伏撃は見つかりにくいので、見える距離(300m)から撃つ
      const t = createUnit(inf("t", 1300, 1000, { formation: "deployed", stance, facing }));
      return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(hit("ambush", 270) / hit("standard", 270)).toBeCloseTo(1); // 正面(西から撃たれる)
    expect(hit("ambush", 0) / hit("standard", 0)).toBeCloseTo(AMBUSH.flankRearDamageTakenMultiplier); // 側面
    expect(hit("ambush", 90) / hit("standard", 90)).toBeCloseTo(AMBUSH.flankRearDamageTakenMultiplier); // 背後
  });

  it("隠れた状態から撃ち始めると、最初の数分は火力が上がる。撃ったターンは露呈し、撃たずに1ターン過ごすとまた隠れる", () => {
    // 近づいてくる敵を、伏撃で待ち構える
    const s0 = state(inf("amb", 1000, 2000, { stance: "ambush", formation: "deployed", facing: 90 }), ger("g", 1500, 2000, { formation: "deployed", facing: 270 }));
    const r = resolveTurn(s0, [], wideCtx);
    const hits = r.events.filter((e) => e.unitId === "g" && e.type === "hit") as { t: number; strength: number }[];
    const first = hits[0]!;
    const later = hits.find((h) => h.t - first.t >= AMBUSH.openingFireMinutes * 60)!;
    // 初撃の分は火力が openingFireMultiplier 倍(ほかの条件も少し変わるので、おおよそで比べる)
    expect(first.strength / later.strength).toBeGreaterThan(AMBUSH.openingFireMultiplier * 0.7);
    expect(unitOf(r.state, "amb").revealed).toBe(true);
    // 敵がいなくなって撃たずに1ターン過ごすと、また隠れる
    const alone = { ...r.state, units: r.state.units.filter((u) => u.id !== "g") };
    expect(unitOf(resolveTurn(alone, [], wideCtx).state, "amb").revealed).toBe(false);
  });
});
