import { cloneUnit, distance, toeIndirectMaxRange, viewForSide, type GameState } from "@brigade/sim-core";
import { describe, expect, it } from "vitest";
import { assaultRole, planAssault, STAGING_M } from "../src/assault.js";
import { assess } from "../src/assess.js";
import { decide } from "../src/index.js";
import { mirrorX, symCtx, symStart } from "./fixtures.js";

/** 規定ターンを長くした対称シナリオ(残りのターンが少ないときの振る舞いと分けて見るため) */
const ctx = { ...symCtx, scenario: { ...symCtx.scenario, maxTurns: 40 } };

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
  // 米軍の砲兵は展開済み(準備砲撃を撃てる)
  byId(s, "us-art").formation = "deployed";
  return s;
}
/** 残りのターンが少ない(遮二無二の突撃にする。砲撃を待たずに突入するほどではない) */
const late = (s: GameState) => {
  s.turn = ctx.scenario.maxTurns - 5;
  return s;
};
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
    const after = plan(s).p!;
    expect(after.requestBarrage).toBe(true);
    const d = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 });
    expect(d.hqCommands.some((h) => h.type === "fireMission" && h.unitId === "us-art" && distance(h.target, center) < 1)).toBe(true);
  });

  it("遮二無二の突撃では、砲撃の着弾中は着弾範囲の外で待って強襲に切り替え、強襲が効いているターンに突入する", () => {
    const s = late(heldByDe());
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
        Object.entries(ctx.scenario.victory).map(([side, v]) => [side, { ...v, decisive: { ...v.decisive, required: [] }, limited: { ...v.limited, required: [] } }]),
      ),
    },
  };

  it("正面攻撃に要る部隊の数がそろわなければ、総攻撃をかけない(少数でばらばらに突っ込まない)。遮二無二の突撃の時期と、自軍の限定的勝利に欠かせない目標はかける", () => {
    // 町は東軍の勝利条件にだけ欠かせない(米軍は重みで勝つ):大きな守備隊がいるとみなし、要る部隊は4個。米軍の機動部隊は3個
    const deNeeds = { ...ctx, scenario: { ...ctx.scenario, victory: { ...ctx.scenario.victory, us: weightOnly.scenario.victory.us! } } };
    const planIn = (c: typeof ctx, s: GameState) => {
      const v = viewForSide(s, "us");
      return planAssault(v, assess(v, c), c, 1);
    };
    expect(planIn(deNeeds, heldByDe())).toBeNull();
    expect(planIn(deNeeds, late(heldByDe()))?.objectiveId).toBe("center");
    // 米軍の限定的勝利にも欠かせない(取り返さなければ負ける)なら、そろわなくてもかける
    expect(planIn(ctx, heldByDe())?.objectiveId).toBe("center");
  });

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

  it("撃てる(展開済みの)砲兵がいなければ、砲撃を待たずに突入する(陣地変換中の砲兵を待ち続けない)", () => {
    const s = heldByDe();
    byId(s, "us-art").formation = "column";
    expect(plan(s).p?.direct).toBe(true);
  });

  it("砲兵は、敵が見えなくても敵が押さえている目標が射程内なら陣地を変えない(霧で敵が消えるたびに動かない)", () => {
    const s = heldByDe();
    const art = byId(s, "us-art");
    expect(distance(art.pos, center)).toBeLessThan(toeIndirectMaxRange(ctx.toes.toes[art.toe]!, ctx.weapons));
    const o = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 }).orders.find((x) => x.unitId === "us-art");
    expect(o?.waypoints?.length ?? 0).toBe(0);
  });

  it("遮二無二の突撃で守備隊に取りついた部隊は、集結点へ下がらずにその場で踏みとどまり、次の強襲に切り替える", () => {
    const s = late(heldByDe());
    const { p } = plan(s);
    const id = [...p!.slots.keys()][0]!;
    const u = byId(s, id);
    u.pos = { x: center.x + ctx.rules.breakthrough.zoneRadiusM, y: center.y };
    u.formation = "deployed";
    const again = plan(s);
    expect(assaultRole(again.v.own.find((x) => x.id === id)!, again.p!, ctx)).toBe("press");
    const o = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 }).orders.find((x) => x.unitId === id);
    expect(o?.waypoints ?? []).toEqual([]);
    expect(o?.stance).toBe("attack");
  });

  it("残りのターンが少なければ遮二無二の突撃、時間があれば(勝利条件に欠かせない目標でも)持続できる攻勢。取りついた部隊は標準の姿勢のまま詰める", () => {
    expect(plan(late(heldByDe())).p?.allOut).toBe(true);
    const s = heldByDe();
    const p = plan(s).p!;
    expect(p.allOut).toBe(false);
    // 取りついた部隊
    const id = [...p.slots.keys()][0]!;
    const u = byId(s, id);
    u.pos = { x: center.x + ctx.rules.breakthrough.zoneRadiusM, y: center.y };
    u.formation = "deployed";
    const o = decide(viewForSide(s, "us"), ctx, { caution: 0.5, noise: 0 }).orders.find((x) => x.unitId === id)!;
    expect(distance(o.waypoints!.at(-1)!, center)).toBeLessThan(1);
    expect(o.stance ?? "standard").toBe("standard");
  });

  it("急ぎ度が高い陣営は、勝利条件に欠かせない目標へ最初から遮二無二の突撃をかける", () => {
    const urgentCtx = {
      ...ctx,
      scenario: { ...ctx.scenario, victory: Object.fromEntries(Object.entries(ctx.scenario.victory).map(([side, v]) => [side, { ...v, urgency: 1 }])) },
    };
    const s = heldByDe();
    expect(plan(s).p?.allOut).toBe(false);
    const v = viewForSide(s, "us");
    expect(planAssault(v, assess(v, urgentCtx), urgentCtx, 1)?.allOut).toBe(true);
  });

  it("敵の損耗を狙う陣営には使わない(準備砲撃からの突撃は別にある)", () => {
    const s = heldByDe();
    const v = viewForSide(s, "us");
    const a = { ...assess(v, ctx), attritionDrive: 0.5 };
    expect(planAssault(v, a, ctx, 1)).toBeNull();
  });
});
