import { describe, expect, it } from "vitest";
import { computeFire, createUnit, replayForSide, resolveTurn, Rng, toeHitPoints, type GameState, type NewUnit } from "../src/index.js";
import { ger, inf, state, toes, unitOf, wideCtx } from "./helpers.js";

/** 1回分の射撃の損害(同じシードの乱数で比べる) */
function fireOnce(attacker: NewUnit, target: NewUnit, moved: string[] = []) {
  const a = createUnit(attacker);
  const t = createUnit(target);
  return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set(moved)).find((r) => r.attackerId === a.id);
}

function lossOf(s: GameState, id: string) {
  const u = unitOf(s, id);
  return { strength: 1 - u.strength, morale: 1 - u.morale };
}

// 森林(5000〜6000m四方)の中心にいる、東向きで陣地Lv2の防御側
const D = () => inf("d", 5500, 5500, { formation: "deployed", entrenchment: 2, facing: 90 });

describe("射撃の基本", () => {
  it("撃てるのは展開済みだけ。縦隊・展開中は撃たない", () => {
    expect(fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1500, 1000))).toBeDefined();
    expect(fireOnce(ger("a", 1000, 1000, { formation: "column" }), inf("t", 1500, 1000))).toBeUndefined();
    expect(fireOnce(ger("a", 1000, 1000, { formation: "deploying" }), inf("t", 1500, 1000))).toBeUndefined();
  });

  it("射程外・未探知の敵は撃たない", () => {
    expect(fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1000 + 1900, 1000))).toBeUndefined();
    const night = { ...wideCtx, visibilityMultiplier: 0.1 }; // 視程300m
    const a = createUnit(ger("a", 1000, 1000, { formation: "deployed" }));
    const t = createUnit(inf("t", 1500, 1000));
    expect(computeFire([a, t], night, Rng.fromSeed(1), new Set())).toEqual([]);
  });

  it("射程内の敵すべてに火力を均等に分ける", () => {
    const a = createUnit(ger("a", 1000, 1000, { formation: "deployed" }));
    const t1 = createUnit(inf("t1", 1500, 1000, { facing: 270, formation: "deployed" }));
    const t2 = createUnit(inf("t2", 1000, 1500, { facing: 180, formation: "deployed" }));
    const far = createUnit(inf("far", 1000 + 1900, 1000)); // 射程外
    const alone = computeFire([a, t1], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!;
    const split = computeFire([a, t1, t2, far], wideCtx, Rng.fromSeed(1), new Set()).filter((r) => r.attackerId === "a");
    expect(split.map((r) => r.targetId)).toEqual(["t1", "t2"]);
    // 同じ乱数列の1発目どうしで比べる(t1 は ID 順で最初に撃たれる)
    expect(split[0]!.damage / alone.damage).toBeCloseTo(0.5);
  });

  it("装甲化率の高い目標には、歩兵の火力が効きにくい", () => {
    const vs = (branch: string) =>
      fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1500, 1000, { branch, formation: "deployed", facing: 270 }))!;
    const soft = vs("infantry");
    const armored = vs("tank_destroyer");
    // 耐久が違うので、耐久をかけ戻した損害ポイントで比べる
    const hp = (toe: string) => toeHitPoints(toes.toes[toe]!);
    expect(armored.damage * hp("tank_destroyer_battalion")).toBeLessThan(soft.damage * hp("infantry_regiment") * 0.1);
  });

  it("縦隊・展開中の目標は、展開済みより大きな損害を受ける", () => {
    const at = (formation: "column" | "deploying" | "deployed") =>
      fireOnce(ger("a", 1000, 1000, { formation: "deployed", facing: 90 }), inf("t", 1500, 1000, { formation, facing: 270 }))!.damage;
    expect(at("column")).toBeGreaterThan(at("deploying"));
    expect(at("deploying")).toBeGreaterThan(at("deployed"));
  });

  it("戦闘移動しながら撃つと火力が下がる", () => {
    const still = fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1500, 1000))!.damage;
    const moving = fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1500, 1000), ["a"])!.damage;
    expect(moving / still).toBeCloseTo(wideCtx.rules.combat.combatMoveFirepowerMultiplier);
  });

  it("姿勢:攻撃重視は与える損害が大きく、防御重視の目標は受ける損害が小さい", () => {
    const base = fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1500, 1000))!.damage;
    const attack = fireOnce(ger("a", 1000, 1000, { formation: "deployed", stance: "attack" }), inf("t", 1500, 1000))!.damage;
    const vsDefense = fireOnce(ger("a", 1000, 1000, { formation: "deployed" }), inf("t", 1500, 1000, { stance: "defense" }))!.damage;
    expect(attack).toBeGreaterThan(base);
    expect(vsDefense).toBeLessThan(base);
  });

  it("制圧されたユニットは火力が落ちる", () => {
    const a = createUnit(ger("a", 1000, 1000, { formation: "deployed" }));
    const t = createUnit(inf("t", 1500, 1000));
    const fresh = computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set())[0]!.damage;
    a.suppression = 1;
    const pinned = computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set())[0]!.damage;
    expect(pinned / fresh).toBeCloseTo(1 - wideCtx.rules.combat.suppressionFirepowerPenalty);
  });

  it("撃たれると 戦力・士気が減り、制圧が増える", () => {
    const r = resolveTurn(state(inf("a", 1000, 1000), ger("g", 1500, 1000, { formation: "deployed", facing: 270 })), [], wideCtx);
    const a = unitOf(r.state, "a");
    expect(a.strength).toBeLessThan(1);
    expect(a.morale).toBeLessThan(1);
    expect(a.suppression).toBeGreaterThan(0);
  });
});

describe("期待挙動", () => {
  it("陣地への正面攻撃は、攻撃側の損害の方が大きい", () => {
    const r = resolveTurn(state(D(), ger("a", 6000, 5500, { formation: "deployed", facing: 270 })), [], wideCtx);
    expect(lossOf(r.state, "a").strength).toBeGreaterThan(lossOf(r.state, "d").strength);
  });

  it("包囲された側の火力は分散し、包囲した側の損害はそれぞれ小さくなる", () => {
    const front = resolveTurn(state(D(), ger("a", 6000, 5500, { formation: "deployed", facing: 270 })), [], wideCtx);
    const surrounded = resolveTurn(
      state(D(), ger("a", 6000, 5500, { formation: "deployed", facing: 270 }), ger("b", 5000, 5500, { formation: "deployed", facing: 90 })),
      [],
      wideCtx,
    );
    const alone = lossOf(front.state, "a").strength;
    const a = lossOf(surrounded.state, "a").strength;
    const b = lossOf(surrounded.state, "b").strength;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).toBeLessThan(alone * 0.7);
    expect(b).toBeLessThan(alone * 0.7);
  });

  it("陣地も側面から撃たれると損害が大きく、包囲(前後から)されると崩れる", () => {
    const front = resolveTurn(state(D(), ger("a", 6000, 5500, { formation: "deployed", facing: 270 })), [], wideCtx);
    const flank = resolveTurn(state(D(), ger("a", 5500, 6000, { formation: "deployed", facing: 180 })), [], wideCtx);
    const surrounded = resolveTurn(
      state(
        D(),
        ger("a", 6000, 5500, { formation: "deployed", facing: 270 }),
        ger("b", 5000, 5500, { formation: "deployed", facing: 90 }),
      ),
      [],
      wideCtx,
    );
    const f = lossOf(front.state, "d");
    const s = lossOf(flank.state, "d");
    const e = lossOf(surrounded.state, "d");
    expect(s.strength).toBeGreaterThan(f.strength);
    expect(e.strength).toBeGreaterThan(s.strength);
    expect(e.morale).toBeGreaterThan(f.morale * 2);
  });

  it("縦隊のまま遭遇した部隊は、展開済みの部隊より不利になる", () => {
    // a は縦隊で東へ行軍。g は展開済みで待ち構える
    const s0 = state(inf("a", 1000, 5000), ger("g", 1000 + 2500, 5000, { formation: "deployed", facing: 270 }));
    const r1 = resolveTurn(s0, [{ unitId: "a", waypoints: [{ x: 9000, y: 5000 }] }], wideCtx);
    // 最初のターン:a は撃たれるが、展開が終わらないので撃ち返せない
    expect(lossOf(r1.state, "a").strength).toBeGreaterThan(0);
    expect(lossOf(r1.state, "g").strength).toBe(0);
    expect(r1.events.some((e) => e.unitId === "a" && e.type === "fired")).toBe(false);

    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(r2.events.some((e) => e.unitId === "a" && e.type === "fired")).toBe(true);
    expect(lossOf(r2.state, "a").strength).toBeGreaterThan(lossOf(r2.state, "g").strength);

    // 損害の交換比(自分の損害 ÷ 相手の損害)が、互いに展開済みで撃ち合った場合よりずっと悪い。
    // 撃たれている時間が違うので、損害の絶対量ではなく比で比べる
    const fair = resolveTurn(
      resolveTurn(
        state(inf("a", 2500, 5000, { formation: "deployed", facing: 90 }), ger("g", 3500, 5000, { formation: "deployed", facing: 270 })),
        [],
        wideCtx,
      ).state,
      [],
      wideCtx,
    );
    const ratio = (s: GameState) => lossOf(s, "a").strength / lossOf(s, "g").strength;
    expect(ratio(fair.state)).toBeGreaterThan(0.7);
    expect(ratio(fair.state)).toBeLessThan(1.3);
    expect(ratio(r2.state)).toBeGreaterThan(ratio(fair.state) * 3);
  });

  it("戦力0のユニットは撃たず、狙われもしない", () => {
    const s0 = state(inf("a", 1000, 1000, { formation: "deployed" }), ger("g", 1500, 1000, { formation: "deployed" }));
    s0.units.find((u) => u.id === "g")!.strength = 0;
    const r = resolveTurn(s0, [], wideCtx);
    expect(r.events.filter((e) => e.type === "fired")).toEqual([]);
  });
});

describe("射撃と霧", () => {
  it("射撃・被弾のイベントに相手のIDは載らない", () => {
    const r = resolveTurn(
      state(inf("us-1", 1000, 1000, { formation: "deployed" }), ger("de-1", 1500, 1000, { formation: "deployed" })),
      [],
      wideCtx,
    );
    const rep = replayForSide(r, "us");
    expect(rep.events.some((e) => e.type === "fired")).toBe(true);
    expect(rep.events.some((e) => e.type === "hit")).toBe(true);
    expect(JSON.stringify(rep)).not.toContain("de-1");
  });
});

describe("制圧の回復", () => {
  it("撃たれている間は回復せず、撃たれなくなると回復する", () => {
    const rate = wideCtx.rules.combat.suppressionRecoveryPerMin * 30;
    // 撃たれていない:1ターンで rate だけ回復
    const quiet = state(inf("a", 1000, 1000));
    unitOf(quiet, "a").suppression = 0.5;
    expect(unitOf(resolveTurn(quiet, [], wideCtx).state, "a").suppression).toBeCloseTo(0.5 - rate);
    // 撃たれ続けている:増える一方
    const underFire = state(inf("a", 1000, 1000, { formation: "deployed", facing: 90 }), ger("g", 1500, 1000, { formation: "deployed", facing: 270 }));
    unitOf(underFire, "a").suppression = 0.5;
    expect(unitOf(resolveTurn(underFire, [], wideCtx).state, "a").suppression).toBeGreaterThan(0.5);
  });
});
