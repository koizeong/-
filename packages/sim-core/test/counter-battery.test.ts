import { describe, expect, it } from "vitest";
import { resolveTurn, viewForSide, type GameState, type HqCommand, type SimContext } from "../src/index.js";
import { ger, inf, state, unitOf, wideCtx } from "./helpers.js";

/** 対砲兵戦:砲撃すると位置を標定されることがあり、撃たれている砲兵は砲撃を要請できない */

const withCb = (revealChance: number, blockWhenUnderFire = true): SimContext => ({
  ...wideCtx,
  rules: { ...wideCtx.rules, combat: { ...wideCtx.rules.combat, counterBattery: { revealChance, blockWhenUnderFire } } },
});
const art = () => inf("art", 1000, 1000, { branch: "artillery", toe: "artillery_battalion", formation: "deployed" });
const gart = () => ger("gart", 6000, 6500, { branch: "artillery", toe: "artillery_battalion", formation: "deployed" });
const fire = (side: string, unitId: string, target: { x: number; y: number }): HqCommand => ({ side, type: "fireMission", unitId, target });
/** 要請したターンと、着弾するターンの2つを解く */
const shell = (s0: GameState, ctx: SimContext, cmds: HqCommand[]) => {
  const r1 = resolveTurn(s0, [], ctx, cmds);
  return { r1, r2: resolveTurn(r1.state, [], ctx) };
};

describe("砲撃による位置の露呈(標定)", () => {
  it("期待挙動:砲撃を撃ち始めた砲兵は、敵の地図に兵種つきで出る(砲撃の目標にできる)", () => {
    const { r2 } = shell(state(art(), gart()), withCb(1), [fire("us", "art", { x: 6000, y: 6500 })]);
    const seen = viewForSide(r2.state, "de").contacts.find((c) => c.branch === "artillery");
    expect(seen).toBeDefined();
    expect(Math.hypot(seen!.pos.x - 1000, seen!.pos.y - 1000)).toBeLessThan(1);
    expect(r2.hqEvents.filter((e) => e.type === "batteryLocated").map((e) => e.side)).toEqual(["de"]);
  });

  it("確率が0なら標定されない(遠くの砲兵は、ふだんは見えない)", () => {
    const { r2 } = shell(state(art(), gart()), withCb(0), [fire("us", "art", { x: 6000, y: 6500 })]);
    expect(viewForSide(r2.state, "de").contacts.some((c) => c.branch === "artillery")).toBe(false);
    expect(r2.hqEvents.some((e) => e.type === "batteryLocated")).toBe(false);
  });

  it("確率は1回の砲撃につき1度だけ判定する(撃ち続けても標定の知らせは1つ)", () => {
    const { r2 } = shell(state(art(), gart()), withCb(1), [fire("us", "art", { x: 6000, y: 6500 })]);
    expect(r2.hqEvents.filter((e) => e.type === "batteryLocated")).toHaveLength(1);
  });
});

describe("撃たれている砲兵は砲撃できない", () => {
  it("前のターンに撃たれた砲兵の砲撃要請は弾かれる", () => {
    const s0 = state(art(), gart());
    unitOf(s0, "art").underFire = true;
    const r = resolveTurn(s0, [], withCb(0), [fire("us", "art", { x: 6000, y: 6500 })]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual(["撃たれているため砲撃できません(前のターンに攻撃を受けた)"]);
    // 決まりを切れば撃てる
    expect(resolveTurn(s0, [], withCb(0, false), [fire("us", "art", { x: 6000, y: 6500 })]).rejectedHqCommands).toEqual([]);
  });

  it("期待挙動:標定した敵の砲兵を撃ち返すと、その砲兵は次のターンに砲撃できない。撃たれずに1ターン過ごすと撃てるようになる", () => {
    const ctx = withCb(1);
    // 米軍の砲兵が(独軍の砲兵とは別の所へ)撃ち、独軍に標定される
    const { r2 } = shell(state(art(), gart()), ctx, [fire("us", "art", { x: 6000, y: 4000 })]);
    const located = viewForSide(r2.state, "de").contacts.find((c) => c.branch === "artillery")!;
    // 独軍が標定した地点へ撃ち返す(対砲兵射撃)
    const back = shell(r2.state, ctx, [fire("de", "gart", located.pos)]);
    expect(unitOf(back.r2.state, "art").underFire).toBe(true);
    const blocked = resolveTurn(back.r2.state, [], ctx, [fire("us", "art", { x: 6000, y: 6500 })]);
    expect(blocked.rejectedHqCommands).toHaveLength(1);
    // 撃たれなかったターンの後は、また撃てる(撃たれた砲兵は撃ち返せないので、先に当てた方が黙らせる)
    expect(unitOf(blocked.state, "art").underFire).toBeUndefined();
    expect(resolveTurn(blocked.state, [], ctx, [fire("us", "art", { x: 6000, y: 6500 })]).rejectedHqCommands).toEqual([]);
  });

  it("直接射撃で撃たれても同じ(攻撃の種類によらない)", () => {
    const s0 = state(art(), ger("g", 1600, 1000, { formation: "deployed", facing: 270 }));
    const r = resolveTurn(s0, [], withCb(0));
    expect(r.events.some((e) => e.unitId === "art" && e.type === "hit")).toBe(true);
    expect(unitOf(r.state, "art").underFire).toBe(true);
  });
});
