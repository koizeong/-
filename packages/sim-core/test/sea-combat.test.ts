import { describe, expect, it } from "vitest";
import {
  applyShell,
  applyTorpedo,
  buildScenario,
  detectionLevel,
  flood,
  listDeg,
  resolveTurn,
  Rng,
  stepHull,
  type GameState,
  type LoadedScenario,
  type SimContext,
} from "../src/index.js";
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
const fixed = (ctx: SimContext): SimContext => ({ ...ctx, rules: { ...ctx.rules, naval: { ...ctx.rules.naval!, turn: undefined } } });
const unit = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
/** 損害の決まりの一部を差し替えた文脈 */
function withDamage(ctx: SimContext, edit: (d: NonNullable<NonNullable<SimContext["rules"]["naval"]>["damage"]>) => void): SimContext {
  const d = structuredClone(ctx.rules.naval!.damage!);
  edit(d);
  return { ...ctx, rules: { ...ctx.rules, naval: { ...ctx.rules.naval!, damage: d } } };
}
const shell = (t = 0) => ({ weapon: "x", shellKg: 125, beltPenMm: 300, deckPenMm: 100, he: false, deckShare: 0, starboard: true, t });

/** 西の巡洋艦の戦隊の 16km 東に、東の巡洋艦の戦隊を止めて置く(互いに見えている) */
function duel() {
  const sc = load((f) => {
    for (const u of f.units) if (/^e-(ca|dd[5-8])/.test(u.id)) u.x -= 103000;
    f.rules.knownAtStart = f.units.filter((u) => /^(w|e)-(ca|dd[5-8])/.test(u.id)).map((u) => ({ side: u.id.startsWith("w") ? "e" : "w", unitId: u.id }));
  });
  return { sc, ctx: fixed(sc.ctx) };
}

describe("海戦の射撃の解", () => {
  it("期待挙動:同じ目標を撃ち続けると射撃の解がたまり、大きく変針すると崩れる", () => {
    const { sc, ctx } = duel();
    // 東の戦隊は止まり、西の戦隊は北へゆっくり進みながら撃つ(東の艦は右舷に見える)
    let s = resolveTurn(sc.start(1), [], ctx, [], [
      { squadron: "e-crudiv", speed: "stop", fire: "hold" },
      { squadron: "w-crudiv", course: 0, speed: "slow" },
    ]).state;
    const solved = Math.max(...Object.values(unit(s, "w-ca1").fc ?? {}).map((x) => x.solution));
    expect(solved).toBeGreaterThan(0.8);
    // 一斉回頭で 180° 回ると、解が大きく落ちる
    const r = resolveTurn(s, [], { ...ctx, turnSeconds: 180 }, [], [{ squadron: "w-crudiv", course: 180, turn: "together" }]);
    s = r.state;
    const after = Math.max(...Object.values(unit(s, "w-ca1").fc ?? {}).map((x) => x.solution));
    expect(after).toBeLessThan(solved - 0.2);
  });

  it("撃ち方待ての戦隊は、撃ってこない敵の艦には撃たない", () => {
    const { sc, ctx } = duel();
    const r = resolveTurn(sc.start(1), [], { ...ctx, turnSeconds: 300 }, [], [
      { squadron: "e-crudiv", speed: "stop", fire: "hold" },
      { squadron: "w-crudiv", speed: "stop", fire: "hold" },
    ]);
    expect(r.events.filter((e) => e.type === "fired").length).toBe(0);
  });
});

describe("撃ち方「帯に入ってから」(夜の奇襲)", () => {
  it("期待挙動:交戦の帯の外(16km)の撃ってこない敵には撃たず、帯を広げて内に入れば撃つ。艦砲で撃たれた艦には撃たれた時刻が付く", () => {
    const { sc, ctx } = duel();
    const c = { ...ctx, turnSeconds: 300 };
    // 交戦の目標がなければ「詰める」の帯(主砲の射程の3割=16km より近い)
    const out = resolveTurn(sc.start(1), [], c, [], [
      { squadron: "e-crudiv", speed: "stop", fire: "hold" },
      { squadron: "w-crudiv", speed: "stop", fire: "band" },
    ]);
    expect(out.events.filter((e) => e.type === "fired").length).toBe(0);
    // 帯を 0〜20km にすると、16km の敵は帯の内なので撃つ
    const s = out.state;
    const target = s.intel["w"]!.entries["e-ca1"]!.contactId;
    const r = resolveTurn(s, [], { ...c, turnSeconds: 1200 }, [], [
      { squadron: "e-crudiv", speed: "stop", fire: "hold" },
      { squadron: "w-crudiv", speed: "stop", fire: "band", engage: { target, band: { minM: 0, maxM: 20000 } } },
    ]);
    expect(r.events.filter((e) => e.type === "fired" && e.unitId.startsWith("w-")).length).toBeGreaterThan(0);
    const hurt = r.state.units.filter((u) => u.side === "e" && u.strength < unit(s, u.id).strength);
    expect(hurt.length).toBeGreaterThan(0);
    for (const u of hurt) expect(u.firstHitSec).toBeDefined();
  });
});

describe("海戦の損害(当たった場所)", () => {
  it("期待挙動:砲塔を抜けた弾は、その砲塔の砲を使えなくする", () => {
    const { sc } = duel();
    const ctx = withDamage(sc.ctx, (d) => {
      d.side = { turret: 1 };
      d.mountLoss.penetrating = 1;
      d.flash = { turret: 0, barbette: 0 };
    });
    const s = sc.start(1);
    const ca = unit(s, "e-ca1");
    const out = applyShell(ca, shell(), ctx, Rng.fromSeed(1));
    expect(out.location).toBe("turret");
    expect(Object.values(ca.hull!.gunsOut).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("期待挙動:弾薬庫に届いた弾が誘爆すると、艦は一度に沈む", () => {
    const { sc } = duel();
    const ctx = withDamage(sc.ctx, (d) => {
      d.side = { belt: 1 };
      d.beltPen.magazine = 1;
      d.magazineDetonation = 1;
    });
    const ca = unit(sc.start(1), "e-ca1");
    const out = applyShell(ca, shell(), ctx, Rng.fromSeed(1));
    expect(out.events.some((e) => e.kind === "magazine")).toBe(true);
    expect(ca.strength).toBe(0);
  });

  it("期待挙動:舵が故障した艦は、戦隊の針路に関わらず回り続ける", () => {
    const { sc } = duel();
    const ctx = fixed(
      withDamage(sc.ctx, (d) => {
        d.side = { stern: 1 };
        d.rudderJam = { chance: 1, minMinutes: 30, maxMinutes: 30 };
      }),
    );
    // 2番艦を切り離して北へ、残りは東へ(列の艦を避ける舵に邪魔されないように離しておく)
    let s = resolveTurn(sc.start(1), [], { ...ctx, turnSeconds: 120 }, [], [{ squadron: "w-crudiv", course: 90, speed: "battle", fire: "hold", detach: ["w-ca2"] }]).state;
    s = resolveTurn(s, [], { ...ctx, turnSeconds: 120 }, [], [{ squadron: "w-ca2", course: 0, speed: "battle", fire: "hold" }]).state;
    const ca = unit(s, "w-ca2");
    applyShell(ca, shell(s.time), ctx, Rng.fromSeed(1));
    expect(ca.hull!.rudderJam).toBeDefined();
    const r = resolveTurn(s, [], { ...ctx, turnSeconds: 360 }, [], []);
    const track = r.tracks["w-ca2"]!;
    let turnedDeg = 0;
    for (let i = 1; i < track.length; i++) turnedDeg += Math.abs((((track[i]!.facing - track[i - 1]!.facing) % 360) + 540) % 360 - 180);
    // 6分で、少なくとも半周は回る
    expect(turnedDeg).toBeGreaterThan(180);
    s = r.state;
  });

  it("期待挙動:片舷の浸水で傾き、注水で傾きは戻るが浸水の合計は増える。撃たれなくなれば浸水は止まり、沈み続けない", () => {
    const { sc } = duel();
    const ctx = sc.ctx;
    const ca = unit(sc.start(1), "e-ca1");
    applyTorpedo(ca, 490, 1, true, 0, ctx, Rng.fromSeed(3));
    const r = ctx.rules.naval!.damage!;
    let maxList = 0;
    for (let m = 0; m < 20; m++) {
      stepHull(ca, 1, ctx);
      maxList = Math.max(maxList, listDeg(ca.hull!, r));
    }
    expect(maxList).toBeGreaterThan(3);
    const at20 = flood(ca.hull!);
    for (let m = 0; m < 100; m++) stepHull(ca, 1, ctx);
    // 傾きは戻り、浸水は増えたが止まっている
    expect(Math.abs(listDeg(ca.hull!, r))).toBeLessThan(maxList);
    expect(flood(ca.hull!)).toBeGreaterThanOrEqual(at20);
    const at120 = flood(ca.hull!);
    for (let m = 0; m < 60; m++) stepHull(ca, 1, ctx);
    expect(flood(ca.hull!) - at120).toBeLessThan(0.02);
    expect(ca.strength).toBeGreaterThan(0);
  });

  it("期待挙動:重巡は九三式魚雷1本では沈まないが、3本で沈む(片舷に当たれば転覆も)", () => {
    const { sc } = duel();
    const ctx = sc.ctx;
    let sunkOne = 0;
    let sunkThree = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = sc.start(1);
      const a = unit(s, "e-ca1");
      applyTorpedo(a, 490, 1, true, 0, ctx, Rng.fromSeed(seed));
      for (let m = 0; m < 120 && a.strength > 0; m++) stepHull(a, 1, ctx);
      if (a.strength <= 0) sunkOne++;
      const b = unit(s, "e-ca2");
      applyTorpedo(b, 490, 3, true, 0, ctx, Rng.fromSeed(seed));
      for (let m = 0; m < 120 && b.strength > 0; m++) stepHull(b, 1, ctx);
      if (b.strength <= 0) sunkThree++;
    }
    expect(sunkOne).toBeLessThanOrEqual(3);
    expect(sunkThree).toBeGreaterThanOrEqual(14);
  });

  it("期待挙動:燃えている艦は、暗い海で遠くから見える", () => {
    const { sc } = duel();
    const ctx = { ...sc.ctx, visibilityMultiplier: 0.25 };
    const s = sc.start(1);
    const w = unit(s, "w-ca1");
    const e = unit(s, "e-ca1");
    e.pos = { x: w.pos.x + 11000, y: w.pos.y };
    expect(detectionLevel(w, e, ctx)).toBe(0);
    applyShell(e, shell(), ctx, Rng.fromSeed(1));
    e.hull!.fire = 0.5;
    expect(detectionLevel(w, e, ctx)).toBeGreaterThan(0);
  });
});
