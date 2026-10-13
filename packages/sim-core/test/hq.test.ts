import { describe, expect, it } from "vitest";
import { resolveTurn, toeHitPoints, viewForSide, type GameState, type HqCommand } from "../src/index.js";
import { ger, inf, state, toes, unitOf, wideCtx } from "./helpers.js";

const art = (extra = {}) => inf("art", 1000, 1000, { branch: "artillery", formation: "deployed", ...extra });
const mission = (target = { x: 6000, y: 6500 }, over: Partial<HqCommand> = {}): HqCommand => ({
  side: "us",
  type: "fireMission",
  unitId: "art",
  target,
  ...over,
});
const loss = (s: GameState, id: string) => 1 - unitOf(s, id).strength;

describe("司令部コマンド:砲撃", () => {
  it("期待挙動:砲撃は要請した次のターンに着弾し、要請したターンには効果がない", () => {
    const s0 = state(art(), ger("g", 6000, 6500, { formation: "deployed" }));
    const r1 = resolveTurn(s0, [], wideCtx, [mission()]);
    expect(r1.rejectedHqCommands).toEqual([]);
    expect(loss(r1.state, "g")).toBe(0);
    expect(r1.events.some((e) => e.unitId === "art" && e.type === "fired")).toBe(false);
    expect(r1.state.fireMissions).toHaveLength(1);

    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(loss(r2.state, "g")).toBeGreaterThan(0);
    // 戦闘フェイズ全体に均等に着弾する(毎ステップ撃つ)
    const shots = r2.events.filter((e) => e.unitId === "art" && e.type === "fired");
    expect(shots).toHaveLength(wideCtx.turnSeconds / wideCtx.stepSeconds);
    // 着弾したミッションは消える
    expect(r2.state.fireMissions).toEqual([]);
  });

  it("期待挙動:陣地にこもった部隊も砲撃で制圧される(正面からの直接射撃より制圧が大きい)", () => {
    // 森林の陣地Lv2
    const dug = () => inf("d", 5500, 5500, { side: "de", formation: "deployed", entrenchment: 2, facing: 90 });
    const shelled = resolveTurn(resolveTurn(state(dug(), art()), [], wideCtx, [mission({ x: 5500, y: 5500 })]).state, [], wideCtx).state;
    const assaulted = resolveTurn(state(dug(), inf("a", 6000, 5500, { formation: "deployed", facing: 270 })), [], wideCtx).state;
    expect(unitOf(shelled, "d").suppression).toBeGreaterThan(0);
    expect(unitOf(shelled, "d").suppression).toBeGreaterThan(unitOf(assaulted, "d").suppression);
  });

  it("誤射あり:着弾範囲内の味方も損害を受け、範囲外は無傷", () => {
    // 敵はいない。直接射撃が混ざらないよう、味方だけで確かめる
    const r1 = resolveTurn(state(art(), inf("friend", 6200, 6500), inf("away", 6000, 7500)), [], wideCtx, [mission()]);
    const s = resolveTurn(r1.state, [], wideCtx).state;
    expect(loss(s, "friend")).toBeGreaterThan(0);
    expect(loss(s, "away")).toBe(0);
  });

  it("装甲化率の高い目標には効きにくい", () => {
    const shell = (branch: string) =>
      resolveTurn(resolveTurn(state(art(), ger("g", 6000, 6500, { branch, formation: "deployed" })), [], wideCtx, [mission()]).state, [], wideCtx).state;
    // 耐久が違うので、耐久をかけ戻した損害ポイントで比べる
    const points = (branch: string, toe: string) => loss(shell(branch), "g") * toeHitPoints(toes.toes[toe]!);
    expect(points("tank_destroyer", "tank_destroyer_battalion")).toBeLessThan(points("infantry", "infantry_regiment") * 0.5);
  });

  it("着弾のターンに砲兵が動いていたら撃たない", () => {
    const r1 = resolveTurn(state(art(), ger("g", 6000, 6500)), [], wideCtx, [mission()]);
    // ターンの最後まで動き続ける距離(戦闘移動 75m/分 × 30分 より遠く)
    const r2 = resolveTurn(r1.state, [{ unitId: "art", waypoints: [{ x: 1000, y: 5000 }], moveMode: "combat" }], wideCtx);
    expect(loss(r2.state, "g")).toBe(0);
  });

  it("撃つと弾薬を大きく消費する", () => {
    const r1 = resolveTurn(state(art(), ger("g", 6000, 6500)), [], wideCtx, [mission()]);
    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(unitOf(r2.state, "art").ammo).toBeLessThan(0.5);
  });

  it("不正な要請は理由をつけて弾く", () => {
    const s0 = state(art(), inf("rifles", 2000, 1000), ger("g", 6000, 6500));
    const r = resolveTurn(s0, [], wideCtx, [
      mission({ x: 9900, y: 9900 }, { unitId: "ghost" }),
      mission({ x: 6000, y: 6500 }, { unitId: "rifles" }),
      mission({ x: 6000, y: 6500 }, { unitId: "g" }),
      mission({ x: 1000, y: 1000 + 12000 }),
      mission(),
      mission(),
    ]);
    expect(r.rejectedHqCommands.map((x) => x.reason)).toEqual([
      "存在しないユニットです",
      "間接射撃できるユニットではありません",
      "自陣営のユニットではありません",
      "着弾地点が射程外です",
      "同じユニットへの砲撃要請が重複しています",
    ]);
    expect(r.state.fireMissions).toHaveLength(1);
  });

  it("霧:予約した砲撃は自陣営にだけ見える", () => {
    const r = resolveTurn(state(art(), ger("g", 6000, 6500)), [], wideCtx, [mission()]);
    expect(viewForSide(r.state, "us").fireMissions).toHaveLength(1);
    expect(viewForSide(r.state, "de").fireMissions).toEqual([]);
  });
});
