import { describe, expect, it } from "vitest";
import {
  createUnit,
  evaluateVictory,
  isGameOver,
  parseScenarioRules,
  replayForSide,
  resolveTurn,
  startScenario,
  type NewUnit,
  type ScenarioRules,
  type SimContext,
} from "../src/index.js";
import { ger, inf, unitOf, unwrap, wideCtx } from "./helpers.js";

/**
 * 試験用のシナリオ(史実ではない)。中心(5000,5000)と交差点3つ。
 * de は中心で決定的勝利、交差点2つで限定的勝利。us は中心と交差点2つ以上で限定的勝利(=保持)。
 */
const scenario: ScenarioRules = unwrap(
  parseScenarioRules({
    maxTurns: 3,
    objectives: [
      { id: "center", name: "中心", x: 5000, y: 5000, radiusM: 500, weight: 5, initialHolder: "us" },
      { id: "x1", name: "交差点1", x: 2000, y: 5000, radiusM: 500, weight: 1, initialHolder: "us" },
      { id: "x2", name: "交差点2", x: 8000, y: 5000, radiusM: 500, weight: 1, initialHolder: "us" },
      { id: "x3", name: "交差点3", x: 5000, y: 8000, radiusM: 500, weight: 1, initialHolder: "us" },
    ],
    victory: {
      de: { decisive: { required: ["center"] }, limited: { minWeight: 2 } },
      us: { decisive: { minWeight: 99 }, limited: { required: ["center"], minWeight: 7 } },
    },
  }),
);
const ctx: SimContext = { ...wideCtx, scenario };
const start = (...units: NewUnit[]) => startScenario(units.map(createUnit), 1, ctx);

describe("目標地点の保持", () => {
  it("範囲内に1陣営だけがいれば、その陣営が押さえる(公開イベント)", () => {
    const r = resolveTurn(start(ger("g", 2000, 5100)), [], ctx);
    expect(r.state.objectives.x1).toBe("de");
    expect(r.publicEvents).toEqual([{ t: 1800, type: "objectiveCaptured", objectiveId: "x1", from: "us", to: "de" }]);
    // 公開イベントは両陣営の再生データに入る
    expect(replayForSide(r, "us").publicEvents).toHaveLength(1);
  });

  it("同数で取り合っている間と、誰もいなくなった後は、前の保持者のまま", () => {
    const contested = resolveTurn(start(ger("g", 2000, 5100), inf("a", 2000, 4900)), [], ctx);
    expect(contested.state.objectives.x1).toBe("us");
    const taken = resolveTurn(start(ger("g", 2000, 5100)), [], ctx);
    const left = resolveTurn(taken.state, [{ unitId: "g", waypoints: [{ x: 2000, y: 7000 }] }], ctx);
    expect(left.state.objectives.x1).toBe("de");
  });

  it("範囲内の部隊の数が多い陣営が押さえる(同数なら前の保持者のまま)", () => {
    const more = resolveTurn(start(ger("g1", 2000, 5100), ger("g2", 2100, 5000), inf("a", 2000, 4900)), [], ctx);
    expect(more.state.objectives.x1).toBe("de");
    const even = resolveTurn(start(ger("g1", 2000, 5100), inf("a", 2000, 4900)), [], ctx);
    expect(even.state.objectives.x1).toBe("us");
  });

  it("拮抗している(同数の)目標の範囲内では、どちらも補給を受けられない", () => {
    const depot = { id: "us-dump", side: "us", nodeId: "n0", ammoT: 500, fuelT: 500 };
    const at = { x: 9500, y: 5200 };
    const supplyCtx: SimContext = {
      ...wideCtx,
      scenario: { ...scenario, objectives: [{ id: "town", name: "町", x: at.x, y: at.y, radiusM: 500, weight: 1, initialHolder: "us" }] },
    };
    const run = (...units: NewUnit[]) => unitOf(resolveTurn(startScenario(units.map(createUnit), 1, supplyCtx, [depot]), [], supplyCtx).state, "a");
    // 米軍だけなら補給を受ける
    expect(run(inf("a", at.x, at.y, { ammo: 0.5 })).supplied).toBe(true);
    // 1対1で拮抗していれば受けられない
    const contested = run(inf("a", at.x, at.y, { ammo: 0.5 }), ger("g", at.x + 200, at.y, { formation: "column" }));
    expect(contested.supplied).toBe(false);
    expect(contested.ammo).toBeLessThan(0.6);
    // 米軍が多ければ受けられる
    expect(run(inf("a", at.x, at.y, { ammo: 0.5 }), inf("b", at.x - 200, at.y), ger("g", at.x + 200, at.y, { formation: "column" })).supplied).toBe(true);
  });

  it("潰走中のユニットは目標を押さえられない", () => {
    const s = start(ger("g", 2000, 5100));
    unitOf(s, "g").routed = true;
    unitOf(s, "g").morale = 0;
    expect(resolveTurn(s, [], ctx).state.objectives.x1).toBe("us");
  });
});

describe("勝敗", () => {
  const judge = (holders: Record<string, string | null>) => evaluateVictory(holders, ctx);

  it("段階の高い方が勝つ(ドイツ軍が中心を取れば決定的勝利)", () => {
    const r = judge({ center: "de", x1: "us", x2: "us", x3: "us" });
    expect(r.winner).toBe("de");
    expect(r.level).toBe("decisive");
  });

  it("交差点2つで限定的勝利。米軍が中心を保っていても段階が上回れば勝つ", () => {
    // de: 交差点2つ(重み2)で限定的。us: 中心+交差点1つ(重み6)で条件(7)に届かない
    const r = judge({ center: "us", x1: "de", x2: "de", x3: "us" });
    expect(r).toMatchObject({ winner: "de", level: "limited" });
  });

  it("米軍が保持しきれば米軍の勝ち、同じ段階なら引き分け", () => {
    expect(judge({ center: "us", x1: "us", x2: "us", x3: "de" })).toMatchObject({ winner: "us", level: "limited" });
    // どちらも条件に届かない(us は中心+交差点1つで重み6、de は交差点1つ)
    expect(judge({ center: "us", x1: "de", x2: "us", x3: null })).toMatchObject({ winner: null, level: "draw" });
  });

  it("勝敗は規定ターンを終えたときだけ出し、その後は解決できない", () => {
    let s = start(inf("a", 5000, 5000));
    const r1 = resolveTurn(s, [], ctx);
    expect(r1.result).toBeNull();
    s = resolveTurn(r1.state, [], ctx).state; // 3ターン目(最終ターン)の手前
    expect(s.turn).toBe(3);
    expect(isGameOver(s, ctx)).toBe(false);
    const last = resolveTurn(s, [], ctx);
    expect(last.result).toMatchObject({ winner: "us", level: "limited" });
    expect(isGameOver(last.state, ctx)).toBe(true);
    expect(() => resolveTurn(last.state, [], ctx)).toThrow("規定ターン");
  });
});

describe("シナリオのデータ検証", () => {
  it("勝利条件が存在しない目標を参照していれば弾く", () => {
    const r = parseScenarioRules({
      maxTurns: 1,
      objectives: [],
      victory: { de: { decisive: { required: ["nowhere"] }, limited: {} } },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('目標 "nowhere" がありません');
  });
});
