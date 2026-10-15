import { describe, expect, it } from "vitest";
import { createUnit, newGameState, resolveTurn, viewForSide, type HqCommand, type NewUnit } from "../src/index.js";
import { ger, inf, rules, unitOf, wideCtx } from "./helpers.js";

const PR = rules.patrol;
const patrol = (unitId: string, target: { x: number; y: number }): HqCommand => ({ side: "us", type: "patrol", unitId, target });
const game = (seed: number, ...units: NewUnit[]) => newGameState(units.map(createUnit), seed);

describe("斥候", () => {
  it("そのターンのうちに、距離に応じて遅れて、探る範囲の敵を兵種まで見つける(写真として残る)", () => {
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
    // 2km 先なら、1kmあたり15分 → 30分後(ターンの終わり近く)
    expect(lastT).toBeGreaterThanOrEqual(2 * PR.minutesPerKm * 60 - wideCtx.stepSeconds);
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

  it("要請できない:遠すぎる地点・同じ部隊から2回・潰走中の部隊", () => {
    const s = game(1, inf("a", 1000, 1000), inf("b", 2000, 1000));
    expect(resolveTurn(s, [], wideCtx, [patrol("a", { x: 1000 + PR.maxRangeM + 100, y: 1000 })]).rejectedHqCommands[0]?.reason).toContain("遠すぎます");
    expect(resolveTurn(s, [], wideCtx, [patrol("a", { x: 2000, y: 2000 }), patrol("a", { x: 2500, y: 2000 })]).rejectedHqCommands).toHaveLength(1);
    s.units.find((u) => u.id === "b")!.routed = true;
    expect(resolveTurn(s, [], wideCtx, [patrol("b", { x: 2500, y: 2000 })]).rejectedHqCommands[0]?.reason).toContain("潰走中");
  });
});
