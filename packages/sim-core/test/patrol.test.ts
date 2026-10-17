import { describe, expect, it } from "vitest";
import { createUnit, newGameState, resolveTurn, viewForSide, type HqCommand, type NewUnit } from "../src/index.js";
import { ger, inf, rules, unitOf, wideCtx } from "./helpers.js";

const PR = rules.patrol;
const patrol = (unitId: string, target: { x: number; y: number }): HqCommand => ({ side: "us", type: "patrol", unitId, target });
const game = (seed: number, ...units: NewUnit[]) => newGameState(units.map(createUnit), seed);

describe("斥候", () => {
  it("そのターンのうちに、扇形の半分の距離に応じて遅れて、探る範囲の敵を兵種まで見つける(写真として残る)", () => {
    // 森(5000〜6000m 四方)の中の敵は、地上からは近くまで行かないと見えない
    let found = 0;
    let lastT = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = game(seed, inf("a", 3500, 5500, { formation: "deployed" }), ger("g", 5500, 5500, { formation: "deployed" }));
      const r = resolveTurn(s, [], wideCtx, [patrol("a", { x: 5500, y: 5500 })]);
      const ev = r.hqEvents.find((e) => e.type === "patrol")!;
      expect(ev).toBeDefined();
      lastT = ev.t - s.time;
      if (viewForSide(r.state, "us").contacts.some((c) => c.branch === "infantry")) found++;
    }
    expect(found).toBeGreaterThan(5);
    // 扇形の半分の距離 × 1kmあたりの分(ターンの終わりを超えれば、ターンの終わり近く)
    const due = Math.min((PR.maxRangeM / 2 / 1000) * PR.minutesPerKm * 60, wideCtx.turnSeconds - wideCtx.stepSeconds);
    expect(lastT).toBeGreaterThanOrEqual(due - wideCtx.stepSeconds);
  });

  it("偵察部隊から出すと見つけやすい", () => {
    const count = (branch: string) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = game(seed, inf("a", 3500, 5500, { branch, formation: "deployed" }), ger("g", 5500, 5500, { formation: "deployed" }));
        const r = resolveTurn(s, [], wideCtx, [patrol("a", { x: 5500, y: 5500 })]);
        n += r.hqEvents.find((e) => e.type === "patrol")!.found;
      }
      return n;
    };
    expect(count("recon")).toBeGreaterThan(count("infantry"));
  });

  it("範囲に敵がいると斥候が見つかることがあり、出した部隊が小さな損害を受け、敵に位置を知られる", () => {
    let caught = 0;
    for (let seed = 1; seed <= 30; seed++) {
      // 敵 g は森の奥にいて、地上からは a が見えない(森の木にさえぎられる)
      const s = game(seed, inf("a", 3500, 5500, { formation: "deployed" }), ger("g", 5500, 5500, { formation: "deployed" }));
      const r = resolveTurn(s, [], wideCtx, [patrol("a", { x: 5500, y: 5500 })]);
      const ev = r.hqEvents.find((e) => e.type === "patrol")!;
      if (!ev.caught) {
        expect(viewForSide(r.state, "de").contacts).toEqual([]);
        continue;
      }
      caught++;
      expect(unitOf(r.state, "a").strength).toBeCloseTo(1 - PR.caughtStrengthLoss);
      expect(viewForSide(r.state, "de").contacts.length).toBeGreaterThan(0);
    }
    expect(caught).toBeGreaterThan(3);
    expect(caught).toBeLessThan(30);
  });

  it("要請できない:部隊と同じ地点(方向が決まらない)・同じ部隊から2回・潰走中の部隊", () => {
    const s = game(1, inf("a", 1000, 1000), inf("b", 2000, 1000));
    expect(resolveTurn(s, [], wideCtx, [patrol("a", { x: 1000, y: 1000 })]).rejectedHqCommands[0]?.reason).toContain("方向");
    expect(resolveTurn(s, [], wideCtx, [patrol("a", { x: 2000, y: 2000 }), patrol("a", { x: 2500, y: 2000 })]).rejectedHqCommands).toHaveLength(1);
    s.units.find((u) => u.id === "b")!.routed = true;
    expect(resolveTurn(s, [], wideCtx, [patrol("b", { x: 2500, y: 2000 })]).rejectedHqCommands[0]?.reason).toContain("潰走中");
  });

  it("陣営ごとに1日の回数が決まっていて、使うと減る(使い切ると要請できない)", () => {
    const units = Array.from({ length: PR.perDay + 1 }, (_, i) => inf(`u${i}`, 1000 + i * 100, 1000));
    const s = game(1, ...units);
    const r = resolveTurn(s, [], wideCtx, units.map((u) => patrol(u.id, { x: u.pos.x, y: 2000 })));
    expect(r.rejectedHqCommands).toHaveLength(1);
    expect(r.rejectedHqCommands[0]!.reason).toContain("使い切って");
    expect(r.state.patrolsLeft.us).toBe(0);
    expect(viewForSide(r.state, "us").patrolsLeft).toBe(0);
  });

  it("期待挙動:探る範囲は、出した部隊を要に選んだ方向へ広がる扇形(扇形の外の敵は見つけない)", () => {
    const run = (target: { x: number; y: number }, enemyAt: { x: number; y: number }) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const s = game(seed, inf("a", 1000, 2000, { formation: "deployed" }), ger("g", enemyAt.x, enemyAt.y, { formation: "deployed" }));
        n += resolveTurn(s, [], wideCtx, [patrol("a", target)]).hqEvents.find((e) => e.type === "patrol")!.found;
      }
      return n;
    };
    // 東へ出した斥候は、東5kmの敵を見つける(地上からは見えない距離)。押した地点より遠くても扇形の中なら見つける
    expect(run({ x: 2000, y: 2000 }, { x: 6000, y: 2000 })).toBeGreaterThan(5);
    // 扇形の外(北)や、長さより遠い敵は見つけない
    expect(run({ x: 2000, y: 2000 }, { x: 1000, y: 6000 })).toBe(0);
    expect(run({ x: 2000, y: 2000 }, { x: 1000 + PR.maxRangeM + 500, y: 2000 })).toBe(0);
  });

  it("期待挙動:何もつかめずに戻ってくることがある(敵が扇形の中にいても見つけない)", () => {
    let failed = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = game(seed, inf("a", 1000, 2000, { formation: "deployed" }), ger("g", 4000, 2000, { formation: "deployed" }));
      const ev = resolveTurn(s, [], wideCtx, [patrol("a", { x: 4000, y: 2000 })]).hqEvents.find((e) => e.type === "patrol")!;
      if (ev.type === "patrol" && ev.failed) {
        failed++;
        expect(ev.found).toBe(0);
      }
    }
    expect(PR.failChance).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(3);
    expect(failed).toBeLessThan(30);
  });
});
