import { describe, expect, it } from "vitest";
import { buildScenario, distance, handlingOf, resolveTurn, type GameState, type LoadedScenario, type SeaOrder, type SimContext } from "../src/index.js";
import { loadPacks, loadScenarioJson } from "./helpers.js";

const packs = loadPacks();
type File = { units: { id: string; x: number; y: number; facing: number }[]; rules: Record<string, unknown> };
function load(edit: (f: File) => void = () => {}): LoadedScenario {
  const file = structuredClone(loadScenarioJson("test-naval")) as File;
  file.rules.knownAtStart = [];
  edit(file);
  const r = buildScenario(file as unknown as Record<string, unknown>, packs);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r.value;
}
/** 可変長のターンを外した文脈(このファイルは動きだけを見る) */
const fixed = (ctx: SimContext): SimContext => ({ ...ctx, rules: { ...ctx.rules, naval: { ...ctx.rules.naval!, turn: undefined } } });
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
const turnOf = (heading: number, from: number) => (((heading - from) % 360) + 540) % 360 - 180;

describe("海戦の命令と艦の動き", () => {
  it("艦に陸の命令を出すと弾かれ、戦隊の命令で針路と速力を変える", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    const s = sc.start(1);
    const r = resolveTurn(s, [{ unitId: "w-ca1", waypoints: [{ x: 40000, y: 50500 }] }], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "flank" }]);
    expect(r.rejectedOrders.some((o) => o.unitId === "w-ca1")).toBe(true);
    expect(r.state.squadrons!["w-crudiv"]!.speed).toBe("flank");
    expect(unit(r.state, "w-ca1").pos.x).toBeGreaterThan(28000);
  });

  it("期待挙動:旋回の半径があり、反転の命令でもすぐには向きが変わらない(1分で回れる角度には上限がある)", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "flank" }]).state;
    const before = unit(s, "w-ca1");
    const r = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", course: 270 }]);
    const track = r.tracks["w-ca1"]!;
    const oneMin = track.find((p) => p.t === s.time + 60)!;
    const hd = handlingOf(before, ctx);
    const v = before.speedMps!;
    // 1分で回れる角度 = 速さ ÷ 半径 × 60秒(度に直す)
    const maxDeg = (v / (hd.turnDiameterM / 2)) * (180 / Math.PI) * 60;
    expect(Math.abs(turnOf(oneMin.facing, before.facing))).toBeLessThanOrEqual(maxDeg * 1.1);
    expect(Math.abs(turnOf(oneMin.facing, before.facing))).toBeGreaterThan(30);
    s = r.state;
    // 20分後には反転し終えている
    expect(Math.abs(turnOf(unit(s, "w-ca1").facing, 270))).toBeLessThan(5);
  });

  it("期待挙動:止まった艦は加速の上限でしか速さを上げられない", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", speed: "stop" }]).state;
    expect(unit(s, "w-ca1").speedMps).toBeLessThan(0.5);
    const r = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", speed: "flank" }]);
    const t1 = r.tracks["w-ca1"]!;
    const p0 = t1.find((p) => p.t === s.time + 60)!;
    const p1 = t1.find((p) => p.t === s.time + 120)!;
    const hd = handlingOf(unit(s, "w-ca1"), ctx);
    // 2分目の速さは、2分で上げられる速さ(ノット毎分 × 2)を超えない
    expect(distance(p0, p1) / 60).toBeLessThanOrEqual(hd.accelKnPerMin * 2 * 0.5145 + 0.1);
  });

  it("期待挙動:逐次回頭では、後ろの艦は先頭の回頭点まで進んでから曲がり、列は先頭の航跡の上に並ぶ", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    // 東へ全速で走ってから、北へ逐次回頭
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "battle" }]).state;
    const turnX = unit(s, "w-ca1").pos.x;
    const r = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", course: 0, turn: "succession" }]);
    s = r.state;
    // 最後尾の艦は、先頭が曲がった後もしばらく東へ進み続ける(回頭点まで)
    const lastTrack = r.tracks["w-dd8"]!;
    const early = lastTrack.find((p) => p.t === s.time - 1200 + 120)!;
    expect(Math.abs(turnOf(early.facing, 90))).toBeLessThan(15);
    // 20分後:全艦が北を向き、回頭点のあたり(先頭の航跡の上)で縦に並ぶ
    for (const id of ["w-ca1", "w-ca2", "w-dd5", "w-dd6", "w-dd7", "w-dd8"]) {
      const u = unit(s, id);
      expect(Math.abs(turnOf(u.facing, 0))).toBeLessThan(10);
      expect(Math.abs(u.pos.x - turnX)).toBeLessThan(1500);
    }
    const ys = ["w-ca1", "w-ca2", "w-dd5", "w-dd6", "w-dd7", "w-dd8"].map((id) => unit(s, id).pos.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeLessThan(ys[i - 1]!);
  });

  it("期待挙動:一斉回頭では、全艦が同時に向きを変え、列は横に並んだ梯陣になる", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "w-crudiv", course: 90, speed: "battle" }]).state;
    const r = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", course: 0, turn: "together" }]);
    const t = s.time + 180;
    // 3分後には、最後尾の艦も北へ回り始めている
    expect(Math.abs(turnOf(r.tracks["w-dd8"]!.find((p) => p.t === t)!.facing, 90))).toBeGreaterThan(45);
    s = r.state;
    const xs = ["w-ca1", "w-ca2", "w-dd5", "w-dd6", "w-dd7", "w-dd8"].map((id) => unit(s, id).pos.x);
    // 東西に広がったまま北へ進む(先頭が東、最後尾が西)
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
    expect(s.squadrons!["w-crudiv"]!.inLine).toBe(false);
  });

  it("期待挙動:交戦の距離の帯を「保つ」にすると、目標との距離を帯の中に保ち、目標を舷側に置く", () => {
    // 東の巡洋艦の戦隊を、西の巡洋艦の戦隊から 30km 東に置き、止めておく。互いに見えるようにしておく
    const sc = load((f) => {
      for (const u of f.units) if (/^e-(ca|dd[5-8])/.test(u.id)) u.x -= 89000;
      f.rules.knownAtStart = f.units.filter((u) => /^(w|e)-(ca|dd[5-8])/.test(u.id)).map((u) => ({ side: u.id.startsWith("w") ? "e" : "w", unitId: u.id }));
    });
    const ctx = fixed(sc.ctx);
    let s = resolveTurn(sc.start(1), [], ctx, [], [{ squadron: "e-crudiv", speed: "stop" }]).state;
    const target = s.intel["w"]!.entries["e-ca1"]!.contactId;
    const order: SeaOrder = { squadron: "w-crudiv", engage: { target, band: "hold" }, speed: "battle" };
    s = resolveTurn(s, [], ctx, [], [order]).state;
    s = resolveTurn(s, [], ctx, [], []).state;
    const lead = unit(s, "w-ca1");
    const e = unit(s, "e-ca1");
    const r = distance(lead.pos, e.pos);
    const band = ctx.rules.naval!.motion!.engageBands.hold;
    // 主砲(重巡の 20cm 砲)の最大射程に対する帯。少しはみ出すのは許す
    const main = Math.max(...ctx.toes.toes["gen_ca"]!.ship!.batteries.map((b) => ctx.weapons.weapons[b.weapon]!.bands.at(-1)!.maxRangeM));
    expect(r).toBeGreaterThan(band.min * main * 0.8);
    expect(r).toBeLessThan(band.max * main * 1.2);
    // 目標は舷側(艦首から 45〜135°)
    const rel = Math.abs(turnOf((Math.atan2(e.pos.x - lead.pos.x, e.pos.y - lead.pos.y) * 180) / Math.PI, lead.facing));
    expect(rel).toBeGreaterThan(45);
    expect(rel).toBeLessThan(135);
  });

  it("艦どうしは重ならない(同じ戦隊の艦は間隔を保つ)", () => {
    const sc = load();
    const ctx = fixed(sc.ctx);
    let s = sc.start(1);
    for (const o of [{ course: 90 }, { course: 180 }, { course: 0, turn: "together" as const }, { course: 270, turn: "succession" as const }]) {
      s = resolveTurn(s, [], ctx, [], [{ squadron: "w-crudiv", speed: "flank", ...o }]).state;
      const ships = ["w-ca1", "w-ca2", "w-dd5", "w-dd6", "w-dd7", "w-dd8"].map((id) => unit(s, id));
      for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) expect(distance(ships[i]!.pos, ships[j]!.pos)).toBeGreaterThan(100);
    }
  });
});
