import { cloneUnit, distance, viewForSide, type GameState } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { assaultRole, planAssault, STAGING_M } from "../src/assault.js";
import { assess } from "../src/assess.js";
import { decide } from "../src/index.js";
import { mirrorX, symCtx as ctx, symStart } from "./fixtures.js";

const center = ctx.scenario.objectives.find((o) => o.id === "center")!;
const byId = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
/**
 * 東軍が中央の町を押さえ、町に歩兵連隊2個が陣取っている。米軍は開始位置のまま。
 * small:米軍の機動部隊を3個にする(包囲には4個要るので、正面攻撃になる)
 */
function heldByDe(small = true): GameState {
  const s = symStart(1);
  if (small) s.units = s.units.filter((u) => u.id !== "us-rec");
  s.objectives.center = "de";
  for (const [id, dy] of [["de-inf1", 200], ["de-inf2", -200]] as const) {
    const u = byId(s, id);
    u.pos = { x: center.x, y: center.y + dy };
    u.formation = "deployed";
    u.entrenchment = 3;
  }
  return s;
}
const plan = (s: GameState, seed = 1) => {
  const v = viewForSide(s, "us");
  return { v, p: planAssault(v, assess(v, ctx), ctx, seed) };
};

describe("総攻撃の段取り", () => {
  it("敵が押さえている目標へは、ばらばらに突っ込まず、手前の集結点に集まる(強襲にもしない)", () => {
    const s = heldByDe();
    const { p } = plan(s);
    expect(p?.objectiveId).toBe("center");
    expect(p?.mode).toBe("assault");
    expect(p?.requestBarrage).toBe(false);
    const d = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 });
    for (const o of d.orders.filter((x) => p!.slots.has(x.unitId) && x.waypoints?.length)) {
      expect(Math.abs(distance(o.waypoints!.at(-1)!, center) - STAGING_M)).toBeLessThan(450);
      expect(o.stance).not.toBe("attack");
    }
    expect(d.hqCommands.some((h) => h.type === "fireMission" && distance(h.target, center) < 100)).toBe(false);
  });

  it("集まったら、届く砲兵で目標に準備砲撃を要請する", () => {
    const s = heldByDe();
    const { p } = plan(s);
    for (const [id, at] of p!.slots) {
      const u = byId(s, id);
      u.pos = { ...at };
      u.formation = "deployed";
    }
    byId(s, "us-art").formation = "deployed";
    const after = plan(s).p!;
    expect(after.requestBarrage).toBe(true);
    const d = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 });
    expect(d.hqCommands.some((h) => h.type === "fireMission" && h.unitId === "us-art" && distance(h.target, center) < 1)).toBe(true);
  });

  it("砲撃の着弾中は着弾範囲の外で待って強襲に切り替え、強襲が効いているターンに突入する", () => {
    const s = heldByDe();
    const { p } = plan(s);
    for (const [id, at] of p!.slots) byId(s, id).pos = { ...at };
    s.fireMissions.push({ side: "us", unitId: "us-art", target: { x: center.x, y: center.y }, turn: s.turn });
    const waiting = plan(s);
    const id = [...waiting.p!.slots.keys()][0]!;
    expect(assaultRole(waiting.v.own.find((u) => u.id === id)!, waiting.p!, ctx)).toBe("wait");
    const o = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 }).orders.find((x) => x.unitId === id)!;
    expect(o.stance).toBe("attack");
    expect(distance(o.waypoints!.at(-1)!, center)).toBeGreaterThan(ctx.rules.combat.indirectImpactRadiusM);
    // 次のターン:強襲が効いている → 目標へ
    s.fireMissions = [];
    byId(s, id).stance = "attack";
    byId(s, id).stanceTurns = 0;
    const storm = plan(s);
    expect(assaultRole(storm.v.own.find((u) => u.id === id)!, storm.p!, ctx)).toBe("storm");
  });

  /** 米軍の機動部隊を倍にし、町の守備隊を1部隊にする */
  function strongVsOne(): GameState {
    const s = heldByDe(false);
    for (const id of ["us-inf1", "us-inf2", "us-arm", "us-rec"]) {
      const c = { ...cloneUnit(byId(s, id)), id: `${id}-2` };
      c.pos = { x: c.pos.x, y: c.pos.y + 300 };
      s.units.push(c);
    }
    byId(s, "de-inf2").pos = { x: mirrorX(byId(s, "us-inf1").pos.x), y: 9000 };
    return s;
  }
  /** 町を勝利条件に必要としない(重みだけで決まる)ようにした状況 */
  const weightOnly = {
    ...ctx,
    scenario: {
      ...ctx.scenario,
      victory: Object.fromEntries(
        Object.entries(ctx.scenario.victory).map(([side, v]) => [side, { decisive: { ...v.decisive, required: [] }, limited: { ...v.limited, required: [] } }]),
      ),
    },
  };

  it("兵力に余裕があり時間も残っていれば、正面から攻めずに包囲する(外回りで回り込む)", () => {
    const v = viewForSide(strongVsOne(), "us");
    const p = planAssault(v, assess(v, weightOnly), weightOnly, 1);
    expect(p?.mode).toBe("siege");
    expect(p!.slots.size).toBeGreaterThanOrEqual(4);
    for (const at of p!.slots.values()) expect(distance(at, center)).toBeCloseTo(650, -1);
    expect(p!.via.size).toBeGreaterThan(0);
  });

  it("敵の勝利条件に欠かせない目標は包囲しない(見えている守備隊が1部隊でも、大きな守備隊がいるとみなす)", () => {
    expect(plan(strongVsOne()).p?.mode).toBe("assault");
  });

  it("敵の損耗を狙う陣営には使わない(準備砲撃からの突撃は別にある)", () => {
    const s = heldByDe();
    const v = viewForSide(s, "us");
    const a = { ...assess(v, ctx), attritionDrive: 0.5 };
    expect(planAssault(v, a, ctx, 1)).toBeNull();
  });
});
