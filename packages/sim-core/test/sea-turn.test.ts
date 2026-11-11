import { describe, expect, it } from "vitest";
import { buildScenario, resolveTurn, type GameState, type LoadedScenario, type SeaOrder, type UnitOrder } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
function load(edit: (f: { units: { id: string; x: number; y: number }[]; rules: Record<string, unknown> }) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as { units: { id: string; x: number; y: number }[]; rules: Record<string, unknown> };
  edit(file);
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
/** 何ターンか解き、出来事を集める(最初のターンだけ命令を出す) */
function run(sc: LoadedScenario, turns: number, orders: UnitOrder[] = [], sea: SeaOrder[] = []): { s: GameState; events: { unitId?: string; type: string; [k: string]: unknown }[] } {
  let s = sc.start(1);
  const events: { unitId?: string; type: string }[] = [];
  for (let k = 0; k < turns; k++) {
    const r = resolveTurn(s, k === 0 ? orders : [], sc.ctx, [], k === 0 ? sea : []);
    expect(r.rejectedOrders).toEqual([]);
    expect(r.rejectedSeaOrders ?? []).toEqual([]);
    events.push(...(r.events as { unitId?: string; type: string }[]));
    s = r.state;
  }
  return { s, events };
}
/** 巡洋艦の戦隊どうしを向かい合わせて走らせる */
const closing: SeaOrder[] = [
  { squadron: "w-crudiv", toward: { x: 150000, y: 50500 }, speed: "flank" },
  { squadron: "e-crudiv", toward: { x: 0, y: 50500 }, speed: "flank" },
];

describe("海戦のターンは止まらない(WEGO)", () => {
  it("新しい敵の艦を見つけても、ターンは途中で止まらず、いつも20分を解く", () => {
    const sc = load((f) => {
      f.rules.knownAtStart = [];
    });
    const { s, events } = run(sc, 3, [], closing);
    expect(s.turn).toBe(4);
    expect(s.time).toBe(3 * sc.ctx.turnSeconds);
    expect(s.stoppedBy).toBeUndefined();
    expect(events.some((e) => e.type === "fired")).toBe(true);
  });
});

describe("戦隊の反応(条件付きの命令)", () => {
  it("期待挙動:「敵の艦が見えたら退避」の戦隊は、見えた瞬間に敵から離れる針路へ全速で走る。反応は1度で消える", () => {
    const sc = load((f) => {
      f.rules.knownAtStart = [];
    });
    const sea: SeaOrder[] = [...closing, { squadron: "e-crudiv", reaction: { when: { type: "enemyShipSeen", withinM: 40000 }, then: "withdraw" } }];
    const { s, events } = run(sc, 3, [], [closing[0]!, { ...closing[1]!, ...sea[2]! }]);
    const fired = events.find((e) => e.type === "seaReaction");
    expect(fired?.then).toBe("withdraw");
    const sq = s.squadrons!["e-crudiv"]!;
    expect(sq.reaction).toBeUndefined();
    expect(sq.speed).toBe("flank");
    // 西の戦隊から離れる(東向き=90度のあたり)
    expect(Math.abs(sq.course - 90)).toBeLessThan(30);
  });

  it("期待挙動:「敵の艦が見えたら交戦」の戦隊は、いちばん近い見えている敵の艦を交戦の目標にする", () => {
    const sc = load((f) => {
      f.rules.knownAtStart = [];
    });
    const { s, events } = run(sc, 3, [], [closing[0]!, { ...closing[1]!, reaction: { when: { type: "enemyShipSeen", withinM: 40000 }, then: "engage", band: "open" } }]);
    expect(events.some((e) => e.type === "seaReaction" && e.then === "engage")).toBe(true);
    const eng = s.squadrons!["e-crudiv"]?.engage;
    expect(eng?.band).toBe("open");
    expect(eng?.target.startsWith("w-")).toBe(true);
  });
});

describe("航空隊の反応(条件付きの命令)", () => {
  it("期待挙動:「敵機が来たら迎撃」の戦闘機隊は、敵の攻撃隊が近づいたら、残っている機で戦隊の上空直衛に上がる", () => {
    const sc = load((f) => {
      f.rules.knownAtStart = [{ side: "e", unitId: "w-cv" }];
    });
    const s0 = sc.start(1);
    const contact = s0.intel["e"]!.entries["w-cv"]!.contactId;
    const { events, s } = run(sc, 3, [
      { unitId: "e-vb", air: { kind: "strike", target: contact } },
      { unitId: "w-vf", conditional: { when: { type: "enemyAirNear", withinM: 60000 }, then: { air: { kind: "cap", over: "w-cvg" } } } },
    ]);
    expect(events.some((e) => e.unitId === "w-vf" && e.type === "conditionalTriggered" && e.condition === "enemyAirNear")).toBe(true);
    expect(events.some((e) => e.unitId === "w-vf" && e.type === "airLaunched")).toBe(true);
    expect(s.units.find((u) => u.id === "w-vf")!.conditional).toBeNull();
  });

  it("期待挙動:「敵空母を見つけたら攻撃」の攻撃隊は、索敵機が敵の空母を見分けると、その空母へ攻撃に出る", () => {
    const sc = load((f) => {
      f.rules.knownAtStart = [];
    });
    const { events } = run(sc, 4, [
      { unitId: "w-vs", air: { kind: "search", point: { x: 149500, y: 50500 } } },
      { unitId: "w-vb", conditional: { when: { type: "enemyCarrierSeen" }, then: { air: { kind: "strike", target: "auto", aircraft: 9 } } } },
    ]);
    expect(events.some((e) => e.unitId === "w-vb" && e.type === "conditionalTriggered" && e.condition === "enemyCarrierSeen")).toBe(true);
    // 9機だけを分けて出す
    expect(events.some((e) => e.unitId === "w-vb~1" && e.type === "airLaunched")).toBe(true);
  });

  it("航空隊に陸の条件付き命令や、条件に合わない命令は出せない。艦以外の部隊に航空隊の条件は出せない", () => {
    const sc = load();
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-vf", conditional: { when: { type: "enemyDetected", withinM: 1000 }, then: { air: { kind: "cap", over: "w-cvg" } } } }], sc.ctx);
    expect(r.rejectedOrders[0]?.reason).toContain("航空隊");
    const r2 = resolveTurn(s, [{ unitId: "w-vf", conditional: { when: { type: "enemyAirNear", withinM: 1000 }, then: { air: { kind: "strike", target: "auto" } } } }], sc.ctx);
    expect(r2.rejectedOrders[0]?.reason).toContain("航空隊");
  });
});
