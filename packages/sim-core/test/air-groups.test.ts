import { describe, expect, it } from "vitest";
import { createUnit, newGameState, parseTerrainMap, resolveTurn, TerrainMap, viewForSide, type GameState, type NewUnit, type SimContext, type UnitOrder } from "../src/index.js";
import { ctx as baseCtx, toes, unwrap, weapons, withoutFatigue } from "./helpers.js";

/** 500m セル × 120 × 120(60km 四方)の海 */
const terrain = new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 500, legend: { "~": "sea" }, rows: Array.from({ length: 120 }, () => "~".repeat(120)) })));
const w = (name: string, maxRangeM: number, power: number, antiAir: number, extra = {}) => ({
  name, bands: [{ maxRangeM, power }], effectiveness: { soft: 1, armored: 1 }, indirect: false, ammoPerMin: 0, suppression: 0.5, antiAir, entrenchmentPierce: 0, arcing: false, ...extra,
});
const supply = { ammoCapacityT: 10, fuelCapacityT: 100, fuelPerKmT: 0.1 };
const naval = (name: string, extra = {}) => ({ name, branch: "naval", armorRatio: 0.5, frontageM: 0, naval: true, speedMpm: 500, supply, elements: [{ name: "艦", count: 3, hitPoints: 500, weapons: [{ weapon: "ship_aa", count: 4 }] }], ...extra });
const air = (name: string, role: "fighter" | "strike", weapon: string) => ({
  name, branch: "naval", armorRatio: 0, frontageM: 0, supply, air: { role, speedMpm: 4000, radiusM: 40000 },
  elements: [{ name: "機", count: 18, hitPoints: 2, weapons: [{ weapon, count: 1 }] }],
});
const ctx: SimContext = withoutFatigue({
  ...baseCtx,
  terrain,
  turnSeconds: 3600,
  weapons: { ...weapons, weapons: { ...weapons.weapons, ship_aa: w("対空機銃", 2000, 0.0001, 1), fighter_mg: w("戦闘機の機銃", 500, 0.001, 3), bomb: w("爆弾", 500, 1, 0.3) } },
  toes: {
    ...toes,
    toes: {
      ...toes.toes,
      cv: naval("試験の空母", { carrier: true }) as never,
      dd: naval("試験の駆逐隊") as never,
      vf: air("試験の戦闘機隊", "fighter", "fighter_mg") as never,
      vb: air("試験の攻撃隊", "strike", "bomb") as never,
    },
  },
});
const unit = (id: string, side: string, toe: string, x: number, y: number, extra: Partial<NewUnit> = {}): NewUnit => ({ id, side, branch: "naval", toe, pos: { x, y }, facing: 0, stance: "standard", ...extra });
const group = (id: string, side: string, toe: string, baseId: string, x: number, y: number) => unit(id, side, toe, x, y, { air: { baseId } });

/** 1ターン進めて敵を見つけ、その陣営から見た contactId を返す */
function spot(s: GameState, side: string): { s: GameState; contact: (unitId: string) => string } {
  const r = resolveTurn(s, [], ctx);
  const entries = r.state.intel[side]!.entries;
  return { s: r.state, contact: (id) => entries[id]!.contactId };
}
const run = (s: GameState, orders: UnitOrder[] = []) => resolveTurn(s, orders, ctx);

describe("盤上の航空隊", () => {
  it("目標を指すと発艦して飛んで行き、攻撃して帰り、積み直しの後にまた出られる", () => {
    const start = newGameState([createUnit(unit("cv", "us", "cv", 10000, 30000)), createUnit(group("vb", "us", "vb", "cv", 10000, 30000)), createUnit(unit("e", "de", "dd", 28000, 30000))], 1);
    const { s, contact } = spot(start, "us");
    const r = run(s, [{ unitId: "vb", air: { kind: "strike", target: contact("e") } }]);
    const types = r.events.filter((e) => e.unitId === "vb").map((e) => e.type);
    expect(types).toContain("airLaunched");
    expect(types).toContain("airStrikeBegan");
    expect(types).toContain("airReturned");
    expect(r.state.units.find((u) => u.id === "e")!.strength).toBeLessThan(1);
    const vb = r.state.units.find((u) => u.id === "vb")!;
    expect(vb.air!.status).toBe("rearming");
    // 積み直しの間は出られない。90分たてば出られる
    expect(run(r.state, [{ unitId: "vb", air: { kind: "strike", target: contact("e") } }]).rejectedOrders[0]!.reason).toContain("積み直し");
    const later = run(run(r.state).state).state;
    expect(later.units.find((u) => u.id === "vb")!.air!.status).toBe("ready");
  });

  it("行動半径の外・夜は出せない。地点だけの命令や陸の部隊への命令の形は弾く", () => {
    const start = newGameState([createUnit(unit("cv", "us", "cv", 1000, 30000)), createUnit(group("vb", "us", "vb", "cv", 1000, 30000)), createUnit(unit("e", "de", "dd", 19000, 30000))], 1);
    const { s, contact } = spot(start, "us");
    // 敵は 18km 先。行動半径 40km の内なので通るが、基地を遠くに移した航空隊は弾く
    const far = { ...s, units: s.units.map((u) => (u.id === "cv" || u.id === "vb" ? { ...u, pos: { x: u.pos.x - 0, y: 30000 + 50000 } } : u)) };
    expect(run(far, [{ unitId: "vb", air: { kind: "strike", target: contact("e") } }]).rejectedOrders[0]!.reason).toContain("行動半径");
    expect(run(s, [{ unitId: "vb", waypoints: [{ x: 5000, y: 30000 }] }]).rejectedOrders[0]!.reason).toContain("航空隊");
    const night: SimContext = { ...ctx, phase: "night" };
    const r = resolveTurn({ ...s }, [{ unitId: "vb", air: { kind: "strike", target: contact("e") } }], { ...night, scenario: { ...ctx.scenario, night: { turn: s.turn, hours: 12 } } });
    expect(r.rejectedOrders[0]?.reason ?? "").toContain("夜");
  });

  it("上空直衛の戦闘機は、来た攻撃隊を空戦で削る。護衛の戦闘機がつくと攻撃隊の損害は減る", () => {
    const setup = (escort: boolean) => {
      const units = [
        unit("cv", "us", "cv", 10000, 30000),
        group("vb", "us", "vb", "cv", 10000, 30000),
        ...(escort ? [group("vf", "us", "vf", "cv", 10000, 30000)] : []),
        unit("ecv", "de", "cv", 28000, 30000),
        group("cap", "de", "vf", "ecv", 28000, 30000),
      ];
      const { s, contact } = spot(newGameState(units.map(createUnit), 1), "us");
      // 守る側は先に上空直衛を上げる
      const capUp = run(s, [{ unitId: "cap", air: { kind: "cap", over: "ecv" } }]).state;
      const orders: UnitOrder[] = [{ unitId: "vb", air: { kind: "strike", target: contact("ecv") } }];
      if (escort) orders.push({ unitId: "vf", air: { kind: "strike", target: contact("ecv") } });
      const r = run(capUp, orders);
      return r.state.units.find((u) => u.id === "vb")!.strength;
    };
    const alone = setup(false);
    const escorted = setup(true);
    expect(alone).toBeLessThan(1);
    expect(escorted).toBeGreaterThan(alone);
  });

  it("輪形陣は対空射撃が強く、航空攻撃の損害が小さい", () => {
    const strike = (formation: string) => {
      const units = [unit("cv", "us", "cv", 10000, 30000), group("vb", "us", "vb", "cv", 10000, 30000), unit("e", "de", "dd", 28000, 30000, { navalFormation: formation })];
      const { s, contact } = spot(newGameState(units.map(createUnit), 1), "us");
      const r = run(s, [{ unitId: "vb", air: { kind: "strike", target: contact("e") } }]).state;
      return { target: r.units.find((u) => u.id === "e")!.strength, attacker: r.units.find((u) => u.id === "vb")!.strength };
    };
    const line = strike("line_ahead");
    const ring = strike("ring");
    expect(ring.target).toBeGreaterThan(line.target);
    expect(ring.attacker).toBeLessThan(line.attacker);
  });

  it("母艦で待っている航空隊は敵に見えず、飛んでいても艦砲の撃ち合いの目標にならず、目標の保持にも数えない", () => {
    const start = newGameState([createUnit(unit("cv", "us", "cv", 10000, 30000)), createUnit(group("vb", "us", "vb", "cv", 10000, 30000)), createUnit(unit("e", "de", "dd", 20000, 30000))], 1);
    const r = run(start);
    expect(viewForSide(r.state, "de").contacts.length).toBe(1);
  });

  it("帰る母艦が沈んでいれば、近くのほかの空母へ降りる。降りる所がなければ失う。母艦が傷めば発艦できない", () => {
    const capUp = (others: NewUnit[]) => {
      const s = newGameState([unit("cv", "us", "cv", 10000, 30000), group("vf", "us", "vf", "cv", 10000, 30000), ...others].map(createUnit), 1);
      const up = run(s, [{ unitId: "vf", air: { kind: "cap", over: "cv" } }]).state;
      expect(up.units.find((u) => u.id === "vf")!.air!.status).toBe("cap");
      // 上空直衛の間に母艦が沈む
      return run({ ...up, units: up.units.filter((u) => u.id !== "cv") });
    };
    const diverted = capUp([unit("cv2", "us", "cv", 10000, 40000)]);
    expect(diverted.state.units.find((u) => u.id === "vf")!.air!.baseId).toBe("cv2");
    expect(diverted.events.some((e) => e.unitId === "vf" && e.type === "airReturned")).toBe(true);
    const lost = capUp([unit("dd", "us", "dd", 10000, 40000)]);
    expect(lost.events.some((e) => e.unitId === "vf" && e.type === "airLost")).toBe(true);
    expect(lost.state.units.some((u) => u.id === "vf")).toBe(false);
    // 母艦が戦力3割(飛行甲板の損傷)なら発艦できない
    const s = newGameState([unit("cv", "us", "cv", 10000, 30000, { strength: 0.3 }), group("vf", "us", "vf", "cv", 10000, 30000)].map(createUnit), 1);
    expect(run(s, [{ unitId: "vf", air: { kind: "cap", over: "cv" } }]).rejectedOrders[0]!.reason).toContain("母艦");
  });
});

describe("航空隊の運用(直衛を戦隊単位で・機数を分けて出す・見込み)", () => {
  it("上空直衛は戦隊・任務部隊(上級部隊)の上に出せ、隷下の空母の上を守る。capMinutes を過ぎれば帰る", () => {
    const fctx: SimContext = { ...ctx, formations: { tf: { side: "us", name: "任務部隊", units: ["dd", "cv"] } } as never };
    const start = newGameState([createUnit(unit("dd", "us", "dd", 14000, 30000)), createUnit(unit("cv", "us", "cv", 10000, 30000)), createUnit(group("vf", "us", "vf", "cv", 10000, 30000))], 1);
    const r = resolveTurn(start, [{ unitId: "vf", air: { kind: "cap", over: "tf" } }], fctx);
    expect(r.rejectedOrders).toEqual([]);
    const vf = r.state.units.find((u) => u.id === "vf")!;
    expect(vf.air!.status).toBe("cap");
    // 隷下の空母の上(駆逐艦ではない)
    expect(Math.hypot(vf.pos.x - 10000, vf.pos.y - 30000)).toBeLessThan(1000);
    expect(vf.air!.untilSec).toBeGreaterThan(start.time);
    // 2時間を過ぎれば帰る
    let s = r.state;
    for (let k = 0; k < 2; k++) s = resolveTurn(s, [], fctx).state;
    expect(["returning", "rearming", "ready"]).toContain(s.units.find((u) => u.id === "vf")!.air!.status);
  });

  it("期待挙動:機数を指定すると、待機中の隊から分けて出し、残りは待機を続ける。損耗の分母は変わらず、帰って積み直すと元の隊に戻る", () => {
    const start = newGameState([createUnit(unit("cv", "us", "cv", 10000, 30000)), createUnit(group("vb", "us", "vb", "cv", 10000, 30000)), createUnit(unit("e", "de", "dd", 28000, 30000))], 1);
    const { s, contact } = spot(start, "us");
    const r = run(s, [{ unitId: "vb", air: { kind: "strike", target: contact("e"), aircraft: 6 } }]);
    expect(r.rejectedOrders).toEqual([]);
    const main = r.state.units.find((u) => u.id === "vb")!;
    const det = r.state.units.find((u) => u.id === "vb~1")!;
    expect(main.air!.status).toBe("ready");
    expect(main.strength).toBeCloseTo(12 / 18, 5);
    expect(det.air!.detachOf).toBe("vb");
    expect(r.events.some((e) => e.unitId === "vb~1" && e.type === "airStrikeBegan")).toBe(true);
    // 多すぎる機数は弾く
    expect(run(s, [{ unitId: "vb", air: { kind: "strike", target: contact("e"), aircraft: 30 } }]).rejectedOrders[0]!.reason).toContain("多く");
    // 積み直しが済めば元の隊に戻る(撃破には数えない)
    let t = r.state;
    const all: string[] = [];
    for (let k = 0; k < 3; k++) {
      const x = run(t);
      all.push(...x.events.filter((e) => e.unitId === "vb~1").map((e) => e.type));
      t = x.state;
    }
    expect(all).toContain("airMerged");
    expect(all).not.toContain("destroyed");
    expect(t.units.some((u) => u.id === "vb~1")).toBe(false);
    expect(t.units.find((u) => u.id === "vb")!.strength).toBeCloseTo(det.strength + main.strength, 5);
  });
});
