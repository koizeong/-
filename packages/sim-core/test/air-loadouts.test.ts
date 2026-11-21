import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, type GameState, type SeaOrder, type Unit } from "../src/index.js";
import { armedOnDeck, validateAirOrder } from "../src/air-groups.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();

function scenario() {
  const sc = buildScenario(loadScenarioJson("test-naval"), packs);
  if (!sc.ok) throw new Error(sc.errors.join("\n"));
  return sc.value;
}

describe("航空機の兵装の積み替え(編成表の air.loadouts。ユーザー判断)", () => {
  it("読み込むと兵装ごとの編成表ができ、兵装の武器だけが入れ替わる(旋回機銃は残る)", () => {
    const { ctx } = scenario();
    const torp = ctx.toes.toes["air_torpedo_group"]!;
    const bomb = ctx.toes.toes["air_torpedo_group@bomb"]!;
    expect(torp.air!.loadout).toBe("torpedo");
    expect(bomb.air!.loadout).toBe("bomb");
    expect(bomb.air!.baseToe).toBe("air_torpedo_group");
    const ws = bomb.elements.flatMap((e) => e.weapons.map((w) => w.weapon));
    expect(ws).toContain("aircraft_level_bomb");
    expect(ws).toContain("gunner_mg");
    expect(ws).not.toContain("aerial_torpedo");
  });

  it("期待挙動:積み替えを命じた隊は積み替えの間は出られず、時間が経つと兵装の編成表に替わる", () => {
    const sc = scenario();
    const { ctx } = sc;
    let s: GameState = sc.start(1);
    const stop: SeaOrder[] = ["w-cvg", "w-crudiv", "e-cvg", "e-crudiv"].map((q) => ({ squadron: q, speed: "stop" }));
    let r = resolveTurn(s, [{ unitId: "w-vt", air: { kind: "rearm", loadout: "bomb" } }], ctx, [], stop);
    s = r.state;
    const vt = () => s.units.find((u) => u.id === "w-vt")!;
    expect(vt().air!.status).toBe("rearming");
    expect(vt().toe).toBe("air_torpedo_group");
    // 積み替えの間は攻撃・索敵に出せない
    const byId = new Map(s.units.map((u) => [u.id, u]));
    expect(validateAirOrder(vt(), { kind: "search", point: { x: 80000, y: 50000 } }, byId, { ...ctx, phase: "day" } as never, s.intel)).not.toBeNull();
    // 60分(3ターン)で済む
    for (let k = 0; k < 3 && vt().air!.status !== "ready"; k++) {
      r = resolveTurn(s, [], ctx, [], stop);
      s = r.state;
    }
    expect(vt().air!.status).toBe("ready");
    expect(vt().toe).toBe("air_torpedo_group@bomb");
    expect(r.events.some((e) => e.type === "airLoadout" && e.unitId === "w-vt")).toBe(true);
    // 元の兵装へ戻す命令も通る
    expect(validateAirOrder(vt(), { kind: "rearm", loadout: "torpedo" }, new Map(s.units.map((u) => [u.id, u])), ctx, s.intel)).toBeNull();
    expect(validateAirOrder(vt(), { kind: "rearm", loadout: "bomb" }, new Map(s.units.map((u) => [u.id, u])), ctx, s.intel)).not.toBeNull();
  });

  it("兵装を選べない隊・知らない兵装への積み替えは弾く", () => {
    const sc = scenario();
    const s = sc.start(1);
    const byId = new Map(s.units.map((u) => [u.id, u]));
    expect(validateAirOrder(byId.get("w-vb")!, { kind: "rearm", loadout: "bomb" }, byId, sc.ctx, s.intel)).not.toBeNull();
    expect(validateAirOrder(byId.get("w-vt")!, { kind: "rearm", loadout: "nuke" }, byId, sc.ctx, s.intel)).not.toBeNull();
  });

  it("期待挙動:積み替え中の隊を載せた空母は、爆弾が当たったときの誘爆が大きい(外した爆弾・魚雷が格納庫に並ぶ)", () => {
    const sc = scenario();
    const units = sc.start(1).units.map((u) => ({ ...u, air: u.air ? { ...u.air } : undefined }) as Unit);
    const cv = units.find((u) => u.id === "w-cv")!;
    const mult = sc.ctx.rules.airGroups!.ordnance!.convertingDeckFireMultiplier;
    expect(mult).toBeGreaterThan(1);
    const vt = units.find((u) => u.id === "w-vt")!;
    vt.air!.status = "rearming";
    const before = armedOnDeck(cv, units, mult);
    vt.air!.convertTo = "air_torpedo_group@bomb";
    expect(armedOnDeck(cv, units, mult)).toBeCloseTo(before - 1 + mult, 6);
  });
});
