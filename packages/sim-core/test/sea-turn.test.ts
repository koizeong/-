import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, type LoadedScenario } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
function load(edit: (f: { units: { id: string; x: number; y: number }[]; rules: Record<string, unknown> }) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as { units: { id: string; x: number; y: number }[]; rules: Record<string, unknown> };
  edit(file);
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}

describe("海戦の可変長のターン", () => {
  it("期待挙動:新しい敵の艦を見つけたら、ターンの途中で止まり、次の解決は残りから続けてターンの区切りで次のターンへ進む", () => {
    // 東の巡洋艦の戦隊を、西の巡洋艦の戦隊から約40km(見張りの外)に置き、向かい合って走らせる
    const sc = load((f) => {
      f.rules.knownAtStart = [];
      for (const u of f.units) if (/^e-(ca|dd[5-8])/.test(u.id)) u.x -= 80000;
    });
    let s = sc.start(1);
    const turnSec = sc.ctx.turnSeconds;
    const east = [
      { unitId: "w-ca1", waypoints: [{ x: 100000, y: 50500 }], moveMode: "march" as const },
      { unitId: "e-ca1", waypoints: [{ x: 5000, y: 50500 }], moveMode: "march" as const },
    ];
    const r1 = resolveTurn(s, east, sc.ctx);
    // どこかで敵の艦を見つける(試験の海戦は 20分のうちに見張りの距離へ入る並べ方)
    if (r1.state.stoppedBy === undefined) throw new Error("見つける前にターンを解き終えた。試験の並べ方を確かめる");
    expect(r1.state.stoppedBy).toBe("newContact");
    expect(r1.state.turn).toBe(s.turn);
    expect(r1.state.turnElapsedSec).toBeGreaterThanOrEqual(sc.ctx.rules.naval!.turn!.minSeconds);
    expect(r1.state.turnElapsedSec).toBeLessThan(turnSec);
    expect(r1.state.time - s.time).toBe(r1.state.turnElapsedSec);
    // 続きを解くと、同じ艦では止まらない。何度か解けば、ターンの区切りでちょうど時計の20分に着く
    s = r1.state;
    for (let i = 0; i < 10 && s.turn === 1; i++) s = resolveTurn(s, east, sc.ctx).state;
    expect(s.turn).toBe(2);
    expect(s.time).toBe(turnSec);
    expect(s.turnElapsedSec).toBeUndefined();
  });

  it("可変長のターンの決まりがなければ、いつもターンの区切りまで解く", () => {
    const sc = load((f) => {
      f.rules.knownAtStart = [];
    });
    const ctx = { ...sc.ctx, rules: { ...sc.ctx.rules, naval: { ...sc.ctx.rules.naval!, turn: undefined } } };
    const s = sc.start(1);
    const r = resolveTurn(s, [], ctx);
    expect(r.state.turn).toBe(2);
    expect(r.state.stoppedBy).toBeUndefined();
  });
});
