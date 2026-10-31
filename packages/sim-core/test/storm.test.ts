import { describe, expect, it } from "vitest";
import { resolveTurn, type SimContext } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const ASSAULT = {
  stances: ["attack"],
  rangeM: 200,
  minSuppression: 0.5,
  ratioThreshold: 1.0,
  defenderStrengthLoss: 0.1,
  attackerStrengthLoss: 0.08,
  attackerMoraleLoss: 0.2,
};
const ctx: SimContext = { ...wideCtx, rules: { ...wideCtx.rules, combat: { ...wideCtx.rules.combat, assault: ASSAULT } } };

/** 攻め手 a(強襲などの姿勢)が、150m 先の守り手 d に取りついている。1ターン解いて、両者と出来事を返す */
function storm(opts: { stance?: string; aStrength?: number; dSuppression?: number; dMorale?: number; dEntrench?: number; dStance?: string }) {
  const s = state(
    inf("d", 3000, 3000, { toe: "infantry_battalion", formation: "deployed", facing: 90, entrenchment: opts.dEntrench ?? 0, stance: opts.dStance ?? "standard" }),
    ger("a", 3150, 3000, { toe: "infantry_battalion", branch: "infantry", formation: "deployed", facing: 270, stance: opts.stance ?? "attack" }),
  );
  const a = unitOf(s, "a");
  a.strength = opts.aStrength ?? 1;
  const d = unitOf(s, "d");
  d.suppression = opts.dSuppression ?? 0;
  d.morale = opts.dMorale ?? 1;
  const r = resolveTurn(s, [], ctx);
  const ev = (id: string, type: string) => r.events.find((e) => e.unitId === id && e.type === type) as { success?: boolean } | undefined;
  return { r, a: unitOf(r.state, "a"), d: r.state.units.find((u) => u.id === "d"), assault: ev("a", "assault"), stormed: ev("d", "stormed") };
}

describe("肉薄(陣地の奪い合い)", () => {
  it("強襲の部隊が、制圧された守り手に取りつくと、守り手は陣地を捨てて崩れる", () => {
    const x = storm({ dSuppression: 1 });
    expect(x.assault?.success).toBe(true);
    expect(x.stormed?.success).toBe(true);
    expect(x.r.events.some((e) => e.unitId === "d" && e.type === "routed")).toBe(true);
    expect(x.d!.entrenchment).toBe(0);
  });

  it("制圧も動揺もしていない守り手には肉薄しない(弱らせてからでないと取りつけない)", () => {
    const x = storm({ dSuppression: 0, dEntrench: 2 });
    expect(x.assault).toBeUndefined();
  });

  it("標準の姿勢では肉薄しない(遮二無二の突撃だけが陣地に飛び込む)", () => {
    const x = storm({ stance: "standard", dSuppression: 1 });
    expect(x.assault).toBeUndefined();
  });

  it("弱い攻め手が陣地の固い守り手に肉薄すると撃退され、攻め手が戦力・士気を失う", () => {
    const fail = storm({ aStrength: 0.15, dSuppression: 0.6, dEntrench: 3 });
    expect(fail.assault?.success).toBe(false);
    expect(fail.stormed?.success).toBe(false);
    const free = (() => {
      const c = { ...ctx, rules: { ...ctx.rules, combat: { ...ctx.rules.combat, assault: undefined } } };
      const s = state(
        inf("d", 3000, 3000, { toe: "infantry_battalion", formation: "deployed", facing: 90, entrenchment: 3 }),
        ger("a", 3150, 3000, { toe: "infantry_battalion", branch: "infantry", formation: "deployed", facing: 270, stance: "attack" }),
      );
      unitOf(s, "a").strength = 0.15;
      unitOf(s, "d").suppression = 0.6;
      return unitOf(resolveTurn(s, [], c).state, "a");
    })();
    expect(fail.a.strength).toBeLessThan(free.strength - ASSAULT.attackerStrengthLoss * 0.9);
  });

  it("死守の守り手は、肉薄されても崩れずに踏みとどまり、その場で戦力を失う", () => {
    const x = storm({ dSuppression: 1, dStance: "defense" });
    expect(x.stormed?.success).toBe(true);
    expect(x.d!.routed).toBe(false);
    expect(rules.stances.defense!.neverRouts).toBe(true);
  });

  it("1ターンに1部隊1回だけ", () => {
    const x = storm({ aStrength: 0.15, dSuppression: 0.6, dEntrench: 3 });
    expect(x.r.events.filter((e) => e.unitId === "a" && e.type === "assault")).toHaveLength(1);
  });
});
