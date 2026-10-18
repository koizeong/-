import { createUnit, frontageOf, resolveTurn, startScenario, viewForSide, type SideView } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { assess } from "../src/assess.js";
import { frontLine } from "../src/front.js";
import { decide } from "../src/index.js";
import { symCtx, symDepots, symUnits } from "./fixtures.js";

const ctx = symCtx;
const isArtillery = (u: { toe: string }) => u.toe === "artillery_battalion";
type Place = [id: string, x: number, y: number, facing: number];

/** us の前線(南北に並んだ歩兵2個連隊、東向き)と後ろの予備(機甲・偵察) */
const US: Place[] = [
  ["us-inf1", 3000, 5800, 90],
  ["us-inf2", 3000, 4200, 90],
  ["us-arm", 1500, 5000, 90],
  ["us-rec", 1500, 3600, 90],
];
/** de の歩兵が正面に、de の機甲と歩兵が北の翼の外にいる(互いに支え合っていて、孤立した敵ではない) */
const DE: Place[] = [
  ["de-inf2", 3700, 5000, 270],
  ["de-arm", 3800, 8000, 200],
  ["de-inf1", 3200, 8300, 200],
];
const FLANKERS = ["de-arm", "de-inf1"];

/** 1ターン進めて見えている状態にし、北の部隊は「前のターンに動いた」ことにする */
const setup = (opts: { flankerMoved?: boolean; us?: Place[]; de?: Place[]; enemyStrength?: number } = {}) => {
  const places = [...(opts.us ?? US), ...(opts.de ?? DE)];
  const s = startScenario(symUnits().filter((u) => places.some((p) => p[0] === u.id)).map(createUnit), 1, ctx, symDepots);
  for (const [id, x, y, facing] of places) {
    const u = s.units.find((v) => v.id === id)!;
    u.pos = { x, y };
    u.facing = facing;
    u.formation = "deployed";
  }
  const seen = resolveTurn(s, [], ctx).state;
  for (const k of Object.keys(seen.objectives)) seen.objectives[k] = "us";
  const view = viewForSide(seen, "us");
  for (const [id, x, y] of places.filter((p) => FLANKERS.includes(p[0]))) {
    const c = view.contacts.find((v) => Math.hypot(v.pos.x - x, v.pos.y - y) < 400);
    if (!c) throw new Error(`${id} が見えていない`);
    c.movedLastTurn = opts.flankerMoved ?? true;
  }
  if (opts.enemyStrength !== undefined) for (const c of view.contacts) c.estimatedStrength = opts.enemyStrength;
  return view;
};
const lineOf = (view: SideView) => {
  const a = assess(view, ctx);
  return frontLine(view.own, a.threats, a.enemyCentroid, ctx, isArtillery, (u) => frontageOf(u as never, ctx))!;
};
const dests = (view: SideView) =>
  decide(view, ctx, { caution: 0.5, noise: 0 })
    .orders.map((o) => o.waypoints?.at(-1))
    .filter((p): p is { x: number; y: number } => !!p);
const near = (p: { x: number; y: number }, q: { x: number; y: number }, r: number) => Math.hypot(p.x - q.x, p.y - q.y) < r;

describe("前線の見積もり", () => {
  it("翼の外を回り込んでくる敵を、その翼の脅威として見つける。翼の守りの位置は翼の端と敵の間", () => {
    const f = lineOf(setup());
    expect(f.flanks).toHaveLength(1);
    const flank = f.flanks[0]!;
    expect(flank.flankers).toHaveLength(2);
    expect(flank.anchor.y).toBeCloseTo(5800, -1);
    expect(flank.guard.y).toBeGreaterThan(5800);
    expect(flank.guard.y).toBeLessThan(8000);
  });

  it("翼の外にいても動いていない敵は、回り込みとはみなさない(前線が広いだけかもしれない)", () => {
    expect(lineOf(setup({ flankerMoved: false })).flanks).toHaveLength(0);
  });

  it("前線の向きは部隊の正面から取る(回り込む敵で敵の重心がずれても、軸は東向きのまま)", () => {
    const { axis } = lineOf(setup());
    expect(axis.x).toBeCloseTo(1, 1);
  });
});

describe("期待挙動:片翼包囲を嫌う", () => {
  const guard = () => lineOf(setup()).flanks[0]!.guard;

  it("戦力が大きく劣っていなければ、回り込んでくる敵の前へ部隊を回して翼をふさぐ", () => {
    const view = setup();
    expect(lineOf(view).ratio).toBeGreaterThanOrEqual(0.6);
    expect(dests(view).some((p) => near(p, guard(), 50))).toBe(true);
  });

  it("回り込みがなければ、翼の守りの位置へは部隊を回さない", () => {
    expect(dests(setup({ flankerMoved: false })).some((p) => near(p, guard(), 300))).toBe(false);
  });

  it("戦力が大きく劣っていれば、翼の守りには回さない(囲まれる前に下がる方に任せる)", () => {
    // 敵の推定戦力が大きい(1部隊あたり 4)
    const view = setup({ enemyStrength: 4 });
    expect(lineOf(view).ratio).toBeLessThan(0.6);
    expect(dests(view).some((p) => near(p, guard(), 300))).toBe(false);
  });
});
