import { createUnit, resolveTurn, startScenario, viewForSide, type ContactView, type NewUnit } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { decide } from "../src/index.js";
import { breakoutPoint, exposureFactor, openDirections, OPEN_DIRECTIONS_MIN } from "../src/exposure.js";
import { symCtx, symDepots, symUnits } from "./fixtures.js";

/** 規模まで見えている敵(展開済み、p の方を向く) */
const contact = (id: string, p: { x: number; y: number }, toward: { x: number; y: number }): ContactView => ({
  contactId: id,
  currentLevel: 3,
  bestLevel: 3,
  pos: p,
  lastSeenTime: 0,
  facing: (Math.atan2(toward.x - p.x, toward.y - p.y) * 180) / Math.PI,
  formation: "deployed",
  frontageM: 2000,
});

const P = { x: 2500, y: 8000 };
const ring = (dirs: number[], d = 1800) =>
  dirs.map((deg, i) => {
    const r = (deg * Math.PI) / 180;
    return contact(`c${i}`, { x: P.x + Math.sin(r) * d, y: P.y + Math.cos(r) * d }, P);
  });

describe("包囲されかけの見積もり", () => {
  it("三方を正面幅のある敵に囲まれると、抜けられる方向が少なくなる(一方だけなら囲まれていない)", () => {
    expect(openDirections(P, ring([90]), symCtx).length).toBeGreaterThan(OPEN_DIRECTIONS_MIN);
    expect(openDirections(P, ring([0, 90, 180]), symCtx).length).toBeLessThanOrEqual(OPEN_DIRECTIONS_MIN);
  });

  it("下がる先は、空いている方向のうち自陣営の後方に近いもの", () => {
    const u = { ...createUnit({ id: "u", side: "us", branch: "infantry", toe: "infantry_regiment", pos: P, facing: 90, stance: "standard", formation: "deployed" }) };
    const b = breakoutPoint(u, ring([0, 90, 180]), { x: 0, y: P.y }, symCtx)!;
    expect(b).not.toBeNull();
    expect(b.dest.x).toBeLessThan(P.x); // 西(敵のいない側)へ
    expect(breakoutPoint(u, ring([90]), { x: 0, y: P.y }, symCtx)).toBeNull();
  });

  it("味方のいない敵中への行き先は点が下がる(味方が並んでいれば下がらない)", () => {
    const u = createUnit({ id: "u", side: "us", branch: "armor", toe: "armor_combat_command", pos: { x: 500, y: P.y }, facing: 90, stance: "standard", formation: "deployed" });
    const threats = ring([0, 90, 180]);
    expect(exposureFactor(u, P, [u], threats, symCtx)).toBeLessThan(0.5);
    const friends = [0, 1, 2, 3].map((i) => createUnit({ id: `f${i}`, side: "us", branch: "infantry", toe: "infantry_regiment", pos: { x: P.x - 1000, y: P.y - 1500 + i * 1000 }, facing: 90, stance: "standard", formation: "deployed" }));
    expect(exposureFactor(u, P, [u, ...friends], threats, symCtx)).toBe(1);
  });
});

describe("期待挙動:AIは包囲される前に下がる", () => {
  it("三方を敵に囲まれかけた部隊は、空いている側(自陣営の後方)へ下がる命令を出す", () => {
    const base = symUnits();
    const us = base.find((u) => u.id === "us-inf1")!;
    const deInf = base.find((u) => u.id === "de-inf1")!;
    const de = ["de-a", "de-b", "de-c"].map((id) => ({ ...deInf, id }));
    const placed: NewUnit[] = [
      { ...us, pos: P, formation: "deployed" },
      ...de.slice(0, 3).map((u, i) => {
        const deg = [0, 90, 180][i]!;
        const r = (deg * Math.PI) / 180;
        const p = { x: P.x + Math.sin(r) * 1800, y: P.y + Math.cos(r) * 1800 };
        return { ...u, pos: p, facing: ((deg + 180) % 360) as number, formation: "deployed" as const };
      }),
    ];
    const s0 = startScenario(placed.map(createUnit), 1, symCtx, symDepots);
    const seen = resolveTurn(s0, [], symCtx).state;
    const o = decide(viewForSide(seen, "us"), symCtx).orders.find((x) => x.unitId === "us-inf1")!;
    expect(o.waypoints?.length).toBeGreaterThan(0);
    expect(o.waypoints![o.waypoints!.length - 1]!.x).toBeLessThan(P.x - 1000);
  });
});
