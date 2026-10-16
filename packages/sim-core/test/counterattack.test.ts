import { describe, expect, it } from "vitest";
import { canBreakThrough, computeFire, createUnit, holdingZones, resolveTurn, Rng, updateFatigue, updateMorale, viewForSide, type NewUnit } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const C = rules.counterattack;
const RESERVE = rules.stances.reserve!;

/** 1回分の射撃の損害。attacker の前ターンの動き・このターンの動き、target の前ターンの動きを指定する */
function damage(a: { movedLastTurn: boolean; movingNow: boolean; stance?: string }, targetMovedLastTurn: boolean) {
  const att = createUnit(ger("a", 1000, 1000, { formation: "deployed", facing: 90, stance: a.stance ?? "standard" }));
  att.movedLastTurn = a.movedLastTurn;
  const t = createUnit(inf("t", 1500, 1000, { formation: "deployed", facing: 270 }));
  t.movedLastTurn = targetMovedLastTurn;
  return computeFire([att, t], wideCtx, Rng.fromSeed(1), new Set(), undefined, undefined, undefined, new Set(a.movingNow ? ["a"] : [])).find(
    (r) => r.attackerId === "a",
  )!.damage;
}

describe("後手からの一撃", () => {
  it("前のターンに動かなかった部隊が反撃に出て、前進してきた敵を撃つと、与える損害が上がる", () => {
    const base = damage({ movedLastTurn: false, movingNow: true }, false);
    expect(damage({ movedLastTurn: false, movingNow: true }, true) / base).toBeCloseTo(C.firepowerMultiplier);
  });

  it("その場で撃ち返すだけ・自分も前のターンに動いていた・相手が前進していない、では上がらない", () => {
    const base = damage({ movedLastTurn: false, movingNow: true }, false);
    expect(damage({ movedLastTurn: false, movingNow: false }, true) / base).toBeCloseTo(1);
    expect(damage({ movedLastTurn: true, movingNow: true }, true) / base).toBeCloseTo(1);
  });

  it("予備の姿勢から反撃に出ると、さらに上がる", () => {
    const base = damage({ movedLastTurn: false, movingNow: true }, false);
    expect(damage({ movedLastTurn: false, movingNow: true, stance: "reserve" }, true) / base).toBeCloseTo(C.firepowerMultiplier * RESERVE.counterattackMultiplier);
  });

  it("反撃の好機には突破しやすい(前進してきた歩兵連隊を、待っていた機甲連隊が正面から抜ける)", () => {
    const holder = (moved: boolean) => {
      const d = createUnit(inf("d", 3000, 3000, { formation: "deployed", facing: 270 } as NewUnit));
      d.movedLastTurn = moved;
      d.strength = 0.65; // ふだんは突破の力の比が 2.0 に届かない相手
      return holdingZones([d], wideCtx)[0]!;
    };
    const pz = createUnit(ger("pz", 2000, 3000, { branch: "armor", toe: "panzer_regiment", formation: "deployed" }));
    expect(canBreakThrough(pz, holder(false), wideCtx)).toBe(false);
    expect(canBreakThrough(pz, holder(true), wideCtx)).toBe(true);
  });

  it("前のターンに動いたかは、ターン終了時に記録される", () => {
    const r = resolveTurn(state(inf("a", 1000, 2000), inf("b", 1000, 5000)), [{ unitId: "a", waypoints: [{ x: 3000, y: 2000 }] }], wideCtx);
    expect(unitOf(r.state, "a").movedLastTurn).toBe(true);
    expect(unitOf(r.state, "b").movedLastTurn).toBe(false);
  });

  it("霧:兵種まで見えている敵なら、このターンに動いていた(次のターンから見て前のターンに動いた)ことが分かる", () => {
    const moving = resolveTurn(state(inf("a", 1000, 1000), ger("g", 2500, 1000)), [{ unitId: "g", waypoints: [{ x: 2500, y: 1500 }] }], wideCtx);
    expect(viewForSide(moving.state, "us").contacts[0]!.movedLastTurn).toBe(true);
    // 前のターンに動いていても、このターンに動かなければ分からない(古い情報を引きずらない)
    const s0 = state(inf("a", 1000, 1000), ger("g", 1500, 1000));
    s0.units.find((u) => u.id === "g")!.movedLastTurn = true;
    expect(viewForSide(resolveTurn(s0, [], wideCtx).state, "us").contacts[0]!.movedLastTurn).toBeUndefined();
  });
});

describe("予備", () => {
  it("士気と疲労の回復が速い", () => {
    const rec = (stance: string) => {
      const u = createUnit(inf("u", 0, 0, { stance }));
      u.morale = 0.5;
      u.fatigue = 0.5;
      updateMorale([u], new Set(), {}, wideCtx);
      updateFatigue([u], { moved: new Set(), fired: new Set(), hit: new Set() }, wideCtx);
      return { morale: u.morale - 0.5, fatigue: 0.5 - u.fatigue };
    };
    const std = rec("standard");
    const res = rec("reserve");
    expect(res.morale / std.morale).toBeCloseTo(RESERVE.moraleRecoveryMultiplier);
    expect(res.fatigue / std.fatigue).toBeCloseTo(RESERVE.fatigueRecoveryMultiplier);
  });
});
