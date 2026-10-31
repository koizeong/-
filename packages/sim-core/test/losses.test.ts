import { describe, expect, it } from "vitest";
import { resolveTurn, type SimContext, type UnitOrder } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

/** 大隊が陣地2の大隊を攻め続けたとき、攻め手が崩れた時点(崩れなければ1日の終わり)の攻め手の損失 */
function attackLoss(stance: string, ctx: SimContext = wideCtx) {
  let s = state(
    inf("d", 3000, 3000, { toe: "infantry_battalion", formation: "deployed", facing: 90, entrenchment: 2 }),
    ger("a", 3700, 3000, { toe: "infantry_battalion", branch: "infantry", formation: "deployed", facing: 270 }),
  );
  for (let t = 1; t <= 16; t++) {
    const a = unitOf(s, "a");
    // 崩れた時点までの損失(崩れた後の潰走の代償 morale.routStrengthLoss は含めない)
    if (a.routed) return { loss: 1 - a.strength - ctx.rules.morale.routStrengthLoss * (a.routs ?? 1), routed: true };
    const o: UnitOrder[] = [{ unitId: "a", waypoints: [{ x: 3000, y: 3000 }], moveMode: "combat", ...(a.stance !== stance && a.pendingStance !== stance ? { stance } : {}) }];
    s = resolveTurn(s, o, ctx).state;
  }
  const a = unitOf(s, "a");
  return { loss: 1 - a.strength, routed: a.routed };
}

describe("損失の水準と、攻め方による違い", () => {
  it("標準の姿勢で陣地を攻める大隊は、1割に届かない損失で崩れる(実際の部隊は1回の戦闘で10%未満の損害で戦いをやめることが多い。McQuie)", () => {
    // 1日あたりの大隊の攻撃の損失(6〜12%)は、1日に何度か攻めた合計
    const r = attackLoss("standard");
    expect(r.routed).toBe(true);
    expect(r.loss).toBeGreaterThan(0.02);
    expect(r.loss).toBeLessThan(0.1);
  });

  it("強襲(遮二無二の突撃)は、撃たれても士気が減りにくく、崩れるまでに多くの損害を払う", () => {
    expect(rules.stances.attack!.moraleDamageTakenMultiplier).toBeLessThan(1);
    // 押し続けたとき(効果が切れない)と比べる
    const pressing = structuredClone(wideCtx.rules);
    delete (pressing.stances.attack as { effectTurns?: number }).effectTurns;
    const allOut = attackLoss("attack", { ...wideCtx, rules: pressing });
    expect(allOut.loss).toBeGreaterThan(attackLoss("standard").loss);
  });

  it("敵に取りつかれたまま崩れた部隊は、逃げ遅れ・捕虜で戦力を失う(離れた敵に崩されたときは失わない)", () => {
    const routNow = (enemyX: number) => {
      const s = state(inf("d", 3000, 3000, { formation: "deployed", facing: 90 }), ger("a", enemyX, 3000, { formation: "column", facing: 270 }));
      unitOf(s, "d").morale = rules.morale.routBelow - 0.01;
      const r = resolveTurn(s, [], wideCtx);
      return { d: unitOf(r.state, "d"), overrun: r.events.some((e) => e.unitId === "d" && e.type === "overrun") };
    };
    const close = routNow(3000 + rules.morale.overrunRangeM - 50);
    const far = routNow(3000 + 2000);
    expect(close.overrun).toBe(true);
    expect(far.overrun).toBe(false);
    expect(close.d.strength).toBeLessThan(far.d.strength - rules.morale.overrunStrengthLoss * 0.9);
  });
});

describe("潰走の代償", () => {
  const withRout = (loss: number, ceiling: number): SimContext => ({
    ...wideCtx,
    rules: { ...wideCtx.rules, morale: { ...wideCtx.rules.morale, routStrengthLoss: loss, routCeilingLoss: ceiling, overrunStrengthLoss: 0 } },
  });
  const routOnce = (ctx: SimContext) => {
    const s = state(inf("d", 3000, 3000, { formation: "deployed", facing: 90 }), ger("a", 5000, 3000, { formation: "column", facing: 270 }));
    unitOf(s, "d").morale = ctx.rules.morale.routBelow - 0.01;
    return unitOf(resolveTurn(s, [], ctx).state, "d");
  };

  it("潰走すると、敵が離れていても、捨てた重火器・落伍の分の戦力を失う", () => {
    const paid = routOnce(withRout(0.05, 0));
    const free = routOnce(withRout(0, 0));
    expect(paid.routs).toBe(1);
    expect(paid.strength).toBeCloseTo(free.strength - 0.05, 6);
  });

  it("潰走を重ねた部隊は、立ち直れる士気の上限が下がり、やがて立ち直らなくなる", () => {
    const ctx = withRout(0, 0.15);
    // 4回目の潰走の後は、上限 1 − 0.15×4 = 0.4 が立ち直りのしきい値(0.45)を割る
    let s = state(inf("d", 3000, 3000, { formation: "deployed", facing: 90 }));
    const u = unitOf(s, "d");
    Object.assign(u, { routs: 4, routed: true, morale: 0.3 });
    for (let t = 0; t < 12; t++) s = resolveTurn(s, [], ctx).state;
    const after = unitOf(s, "d");
    expect(after.morale).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(after.routed).toBe(true);
  });
});
