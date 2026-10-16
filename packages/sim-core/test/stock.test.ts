import { describe, expect, it } from "vitest";
import { computeFire, createUnit, resolveTurn, Rng } from "../src/index.js";
import { ger, inf, rules, state, toes, unitOf, wideCtx } from "./helpers.js";

const armorSupply = toes.toes.armor_combat_command!.supply;
/** 機甲が距離 m 進める燃料の割合(行軍) */
const fuelFor = (m: number) => ((m / 1000) * armorSupply.fuelPerKmT) / armorSupply.fuelCapacityT;

describe("燃料", () => {
  it("期待挙動:燃料が尽きた機甲は前進できない(経由点は残る)", () => {
    const s0 = state(inf("t", 1000, 1000, { branch: "armor", fuel: 0 }));
    const r = resolveTurn(s0, [{ unitId: "t", waypoints: [{ x: 5000, y: 1000 }] }], wideCtx);
    const t = unitOf(r.state, "t");
    expect(t.pos).toEqual({ x: 1000, y: 1000 });
    expect(t.route).toEqual([{ x: 5000, y: 1000 }]);
    expect(r.events.filter((e) => e.type === "outOfFuel")).toHaveLength(1);
  });

  it("燃料が途中で尽きると、その地点で止まる", () => {
    const s0 = state(inf("t", 1000, 1000, { branch: "armor", fuel: fuelFor(500) }));
    const r = resolveTurn(s0, [{ unitId: "t", waypoints: [{ x: 5000, y: 1000 }] }], wideCtx);
    const t = unitOf(r.state, "t");
    expect(t.pos.x).toBeCloseTo(1500);
    expect(t.fuel).toBeCloseTo(0);
  });

  it("燃料は移動距離に比例して減り、戦闘移動は行軍より多く使う", () => {
    const go = (moveMode: "march" | "combat") =>
      resolveTurn(
        state(inf("t", 1000, 1000, { branch: "armor", formation: "deployed" })),
        [{ unitId: "t", waypoints: [{ x: 2000, y: 1000 }], moveMode }],
        wideCtx,
      ).state;
    const march = 1 - unitOf(go("march"), "t").fuel;
    const combat = 1 - unitOf(go("combat"), "t").fuel;
    expect(march).toBeCloseTo(fuelFor(1000));
    expect(combat / march).toBeCloseTo(rules.supply.combatMoveFuelMultiplier);
  });

  it("徒歩の歩兵は燃料に関係なく動く", () => {
    const r = resolveTurn(state(inf("a", 1000, 1000, { fuel: 0 })), [{ unitId: "a", waypoints: [{ x: 1500, y: 1000 }] }], wideCtx);
    expect(unitOf(r.state, "a").pos).toEqual({ x: 1500, y: 1000 });
  });

  it("燃料が補充されれば、残っていた経由点へ再び進む", () => {
    const r1 = resolveTurn(state(inf("t", 1000, 1000, { branch: "armor", fuel: 0 })), [{ unitId: "t", waypoints: [{ x: 3000, y: 1000 }] }], wideCtx);
    unitOf(r1.state, "t").fuel = 1;
    const r2 = resolveTurn(r1.state, [], wideCtx);
    expect(unitOf(r2.state, "t").pos).toEqual({ x: 3000, y: 1000 });
  });
});

describe("弾薬", () => {
  const duel = (extra = {}) =>
    resolveTurn(state(inf("a", 1000, 1000, { formation: "deployed", ...extra }), ger("g", 1500, 1000, { formation: "deployed" })), [], wideCtx).state;

  it("撃つと弾薬が減り、攻撃重視は多く使う", () => {
    const std = 1 - unitOf(duel(), "a").ammo;
    const atk = 1 - unitOf(duel({ stance: "attack" }), "a").ammo;
    expect(std).toBeGreaterThan(0);
    expect(atk / std).toBeCloseTo(rules.stances.attack!.ammoConsumptionMultiplier, 1);
  });

  it("撃たなければ弾薬は減らない", () => {
    const r = resolveTurn(state(inf("a", 1000, 1000, { formation: "deployed" })), [], wideCtx);
    expect(unitOf(r.state, "a").ammo).toBe(1);
  });

  it("弾薬が切れても、火力は2割残る", () => {
    const fire = (ammo: number) => {
      const a = createUnit(inf("a", 1000, 1000, { formation: "deployed", ammo }));
      const t = createUnit(ger("t", 1500, 1000));
      return computeFire([a, t], wideCtx, Rng.fromSeed(1), new Set()).find((r) => r.attackerId === "a")!.damage;
    };
    expect(fire(0) / fire(1)).toBeCloseTo(0.2);
  });
});

describe("備蓄切れと士気", () => {
  // 備蓄切れによる士気の低下だけを見る(補給路から切れて弾も尽きた「孤立」の士気の低下は除く)
  const onlyStock = { ...wideCtx, rules: { ...wideCtx.rules, encirclement: { ...wideCtx.rules.encirclement, moraleLoss: 0 } } };
  const morale = (extra: object) => unitOf(resolveTurn(state(inf("u", 1000, 1000, extra)), [], onlyStock).state, "u").morale;
  const loss = rules.supply.outOfStockMoraleLossPerMin * 30;

  it("弾薬が切れている間は士気が下がる", () => {
    expect(morale({ ammo: 0 })).toBeCloseTo(1 - loss);
  });

  it("燃料を使うユニットは、燃料切れでも士気が下がる", () => {
    expect(morale({ branch: "armor", fuel: 0 })).toBeCloseTo(1 - loss);
  });

  it("備蓄が残っていれば下がらない(徒歩の歩兵は燃料0でも下がらない)", () => {
    expect(morale({})).toBe(1);
    expect(morale({ fuel: 0 })).toBe(1);
    expect(morale({ ammo: 0.01 })).toBe(1);
  });
});
