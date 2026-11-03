import { describe, expect, it } from "vitest";
import { resolveTurn, type HqCommand, type SimContext } from "../src/index.js";
import { ger, inf, state, unitOf, wideCtx } from "./helpers.js";

/** 潰走の割り増しを以前のまま(縦隊の倍率・振り分けの2倍を砲撃にも)にした文脈 */
const old: SimContext = {
  ...wideCtx,
  rules: { ...wideCtx.rules, combat: { ...wideCtx.rules.combat, routedStrengthWeightDirectOnly: false, routedFormationDamageTaken: undefined } },
};

/** 砲兵1個大隊が、潰走して縦隊で止まっている歩兵連隊を1ターン撃ったときの戦力の減り */
function shelled(ctx: SimContext, routed = true): number {
  let s = state(inf("t", 3000, 5000, { formation: routed ? "column" : "deployed", facing: 90, entrenchment: routed ? 0 : 2 }), ger("g", 9000, 5000, { branch: "artillery", formation: "deployed", facing: 270 }));
  const hq: HqCommand[] = [{ side: "de", type: "fireMission", unitId: "g", target: { x: 3000, y: 5000 } }];
  s = resolveTurn(s, [], ctx, hq).state;
  const t = unitOf(s, "t");
  if (routed) Object.assign(t, { routed: true, morale: 0.05, route: [], formation: "column" });
  const before = t.strength;
  s = resolveTurn(s, [], ctx, hq).state;
  return before - (s.units.find((u) => u.id === "t")?.strength ?? 0);
}

/** 近くの敵(歩兵連隊)に撃たれた(追撃された)ときの戦力の減り */
function pursued(ctx: SimContext): number {
  const s = state(inf("t", 3000, 5000, { formation: "column", facing: 270 }), ger("g", 3400, 5000, { formation: "deployed", facing: 270 }));
  Object.assign(unitOf(s, "t"), { routed: true, morale: 0.05 });
  const before = unitOf(s, "t").strength;
  return before - (resolveTurn(s, [], ctx).state.units.find((u) => u.id === "t")?.strength ?? 0);
}

describe("潰走中の部隊への砲撃と追撃", () => {
  it("潰走中の部隊は砲撃で守っている部隊より多く失うが、縦隊の割り増しと捕虜の割り増しは重ならない(以前より少ない)", () => {
    const now = shelled(wideCtx);
    expect(now).toBeGreaterThan(shelled(wideCtx, false));
    expect(now).toBeLessThan(shelled(old) * 0.5);
  });

  it("近くの敵に追撃されたときは、落伍・捕虜の割り増し(戦力への振り分けの2倍)がかかる", () => {
    const noBonus: SimContext = { ...wideCtx, rules: { ...wideCtx.rules, combat: { ...wideCtx.rules.combat, routedStrengthWeightMultiplier: 1 } } };
    expect(pursued(wideCtx)).toBeGreaterThan(pursued(noBonus) * 1.5);
  });
});
