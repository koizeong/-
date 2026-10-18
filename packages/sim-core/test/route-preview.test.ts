import { describe, expect, it } from "vitest";
import { createUnit, parseTerrainMap, previewMove, RoadNetwork, resolveTurn, TerrainMap, zoneWarnings, type ContactView, type SimContext } from "../src/index.js";
import { inf, state, unitOf, unwrap, wideCtx, withoutFatigue } from "./helpers.js";

const flat = withoutFatigue(wideCtx);

describe("経路のプレビュー", () => {
  it("このターンの終わりの位置は、実際にターンを解決した位置と同じ", () => {
    const order = { waypoints: [{ x: 9000, y: 2000 }], moveMode: "march" as const };
    const s0 = state(inf("a", 1000, 1000, { formation: "deployed" }));
    const p = previewMove(s0.units[0]!, order, 1, flat);
    const r = resolveTurn(s0, [{ unitId: "a", ...order }], flat);
    const end = unitOf(r.state, "a").pos;
    expect(p.turnEnds[0]!.x).toBeCloseTo(end.x, 3);
    expect(p.turnEnds[0]!.y).toBeCloseTo(end.y, 3);
    expect(p.arrival?.turn).toBeGreaterThan(1);
  });

  it("道路を行軍すると、原野を行くより早く着く", () => {
    const u = createUnit(inf("a", 0, 5000, { formation: "column", moveMode: "march" }));
    const road = previewMove(u, { waypoints: [{ x: 6000, y: 5000 }] }, 1, flat);
    const field = previewMove({ ...u, pos: { x: 0, y: 2000 } }, { waypoints: [{ x: 6000, y: 2000 }] }, 1, flat);
    expect(road.onRoadShare).toBeGreaterThan(0.9);
    expect(field.onRoadShare).toBe(0);
    expect(road.arrival!.atSeconds).toBeLessThan(field.arrival!.atSeconds);
  });

  it("縦隊から戦闘移動を命じると、展開しきるまでの1ターンは動かない", () => {
    const u = createUnit(inf("a", 1000, 1000, { formation: "column", moveMode: "march" }));
    const p = previewMove(u, { waypoints: [{ x: 3000, y: 1000 }], moveMode: "combat" }, 1, flat);
    expect(p.startDelay.deploySeconds).toBe(flat.turnSeconds);
    expect(p.turnEnds[0]!.alongM).toBe(0);
    expect(p.turnEnds[1]!.alongM).toBeGreaterThan(0);
  });

  it("未熟な部隊は命令の遅れの分だけ動き出しが遅い", () => {
    const order = { waypoints: [{ x: 9000, y: 1000 }], moveMode: "march" as const };
    const reg = previewMove(createUnit(inf("a", 1000, 1000, { formation: "column", moveMode: "march" })), order, 1, flat);
    const green = previewMove(createUnit(inf("a", 1000, 1000, { formation: "column", moveMode: "march", training: "green" })), order, 1, flat);
    const delay = flat.rules.training.levels["green"]!.orderDelayMinutes * 60;
    expect(green.startDelay.orderSeconds).toBe(delay);
    expect(green.turnEnds[0]!.alongM).toBeLessThan(reg.turnEnds[0]!.alongM);
  });

  it("死守の部隊は動かない", () => {
    const u = createUnit(inf("a", 1000, 1000, { stance: immobileStance(flat) }));
    const p = previewMove(u, { waypoints: [{ x: 3000, y: 1000 }] }, 1, flat);
    expect(p.immobile).toBeDefined();
    expect(p.arrival).toBeNull();
  });

  it("川を渡る所を、足が鈍る所として示す", () => {
    const river: SimContext = {
      ...flat,
      roads: RoadNetwork.empty(),
      terrain: new TerrainMap(unwrap(parseTerrainMap({ cellSizeM: 250, legend: { ".": "plain", "~": "river" }, rows: ["....~....", "....~....", "....~...."] }))),
    };
    const u = createUnit(inf("a", 125, 375, { formation: "deployed" }));
    const p = previewMove(u, { waypoints: [{ x: 2100, y: 375 }], moveMode: "combat" }, 1, river);
    expect(p.slow.length).toBe(1);
    expect(p.slow[0]!.terrain).toBe("river");
    expect(p.slow[0]!.x).toBeGreaterThanOrEqual(1000 - 1);
  });

  it("知っている敵の阻止圏に入る所を知らせる(知らない敵・潰走した敵は数えない)", () => {
    const u = createUnit(inf("a", 1000, 1000, { formation: "column", moveMode: "march" }));
    const p = previewMove(u, { waypoints: [{ x: 5000, y: 1000 }] }, 1, flat);
    const R = flat.rules.breakthrough.zoneRadiusM;
    const contact = (id: string, extra: Partial<ContactView> = {}): ContactView => ({
      contactId: id,
      currentLevel: 2,
      bestLevel: 2,
      pos: { x: 3000, y: 1000 + R / 2 },
      lastSeenTime: 0,
      formation: "deployed",
      ...extra,
    });
    const w = zoneWarnings(p, [contact("c1"), contact("c2", { routed: true }), contact("c3", { pos: { x: 3000, y: 5000 } })], flat);
    expect(w.map((x) => x.contactId)).toEqual(["c1"]);
    expect(w[0]!.at.x).toBeLessThan(3000);
    expect(w[0]!.at.x).toBeGreaterThan(3000 - R - 1);
    expect(Number.isFinite(w[0]!.at.atSeconds)).toBe(true);
  });
});

function immobileStance(c: SimContext): string {
  return Object.entries(c.rules.stances).find(([, st]) => st.immobile)![0];
}
