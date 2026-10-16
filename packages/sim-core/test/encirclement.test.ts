import { describe, expect, it } from "vitest";
import { createUnit, holdingZones, isEncircled, resolveTurn, type NewUnit } from "../src/index.js";
import { ger, inf, rules, state, unitOf, wideCtx } from "./helpers.js";

const C = { x: 5000, y: 2500 };
/** C を囲む敵(展開済み、C の方を向く)。dirs は方位(度) */
const ring = (dirs: number[], extra: Partial<NewUnit> = {}, distM = 600) =>
  dirs.map((deg, i) => {
    const r = (deg * Math.PI) / 180;
    return ger(`e${i}`, C.x + Math.sin(r) * distM, C.y + Math.cos(r) * distM, { formation: "deployed", facing: (deg + 180) % 360, ...extra });
  });

type Tweak = (u: ReturnType<typeof createUnit>) => void;
function encircled(target: NewUnit, enemies: NewUnit[], tweak: Tweak = () => {}, enemyTweak: Tweak = () => {}) {
  const u = createUnit(target);
  tweak(u);
  const all = [
    u,
    ...enemies.map((e) => {
      const x = createUnit(e);
      enemyTweak(x);
      return x;
    }),
  ];
  return isEncircled(u, holdingZones(all), wideCtx);
}

describe("包囲", () => {
  const target = () => inf("t", C.x, C.y, { formation: "deployed" });

  it("四方を突破できない阻止圏に囲まれていれば包囲", () => {
    expect(encircled(target(), ring([0, 90, 180, 270]))).toBe(true);
  });

  it("一方でも抜け道があれば包囲ではない", () => {
    expect(encircled(target(), ring([0, 90, 180]))).toBe(false);
  });

  it("包囲網を突破できる強い部隊は、包囲ではない", () => {
    const pz = ger("t", C.x, C.y, { side: "us", branch: "armor", toe: "panzer_regiment", formation: "deployed" });
    // 損耗した包囲網(戦力 55%):歩兵連隊は抜けないが、機甲連隊なら抜ける
    const net = ring([0, 90, 180, 270]);
    const worn: Tweak = (e) => (e.strength = 0.55);
    expect(encircled(target(), net, undefined, worn)).toBe(true);
    expect(encircled(pz, net, undefined, worn)).toBe(false);
  });

  it("マップの端は壁ではない(端へ抜けられる方向があれば包囲ではない)", () => {
    const edge = inf("t", 300, 2500, { formation: "deployed" });
    const net = [0, 90, 180].map((deg, i) => {
      const r = (deg * Math.PI) / 180;
      return ger(`e${i}`, 300 + Math.sin(r) * 600, 2500 + Math.cos(r) * 600, { formation: "deployed", facing: (deg + 180) % 360 });
    });
    expect(encircled(edge, net)).toBe(false);
  });

  it("包囲されたユニットは士気を失う。潰走していなければ消えない", () => {
    // 撃つ力の弱い包囲網(砲兵大隊)で、射撃で潰走する前にターン終了まで進むようにする
    // 同じ規模の偵察中隊を囲むので、突破もできない
    const s0 = state(inf("t", C.x, C.y, { formation: "deployed", branch: "recon" }), ...ring([0, 45, 90, 135, 180, 225, 270, 315], { branch: "artillery" }, 700));
    const r = resolveTurn(s0, [], wideCtx);
    const ev = r.events.find((e) => e.unitId === "t" && e.type === "encircled");
    expect(ev).toBeDefined();
    expect(r.state.units.some((u) => u.id === "t")).toBe(true);
  });

  it("潰走中に包囲されていれば投降して消滅する(敵中を突っ切って逃げることもできない)", () => {
    // 撃つ力の弱い包囲網(砲兵大隊)で、射撃で壊滅する前に投降まで進むようにする
    const net = ring([0, 45, 90, 135, 180, 225, 270, 315], { branch: "artillery" }, 700);
    const s0 = state(inf("t", C.x, C.y, { formation: "column" }), ...net);
    const t = s0.units.find((u) => u.id === "t")!;
    t.routed = true;
    t.morale = rules.morale.routBelow - 0.05;
    t.encircledTurns = rules.encirclement.surrenderAfterTurns - 1; // 包囲が続いていて、このターンで投降までの時間に達する
    const r = resolveTurn(s0, [], wideCtx);
    expect(r.events.some((e) => e.unitId === "t" && e.type === "surrendered")).toBe(true);
    expect(r.state.units.some((u) => u.id === "t")).toBe(false);
  });

  describe("籠城の限界", () => {
    const E = rules.encirclement;
    // 撃つ力の弱い包囲網(砲兵大隊)。囲まれるのは、死守している偵察中隊(同じ規模なので突破もできない)
    const garrison = () => inf("t", C.x, C.y, { formation: "deployed", branch: "recon", stance: "defense", entrenchment: 2 });
    const net = () => ring([0, 45, 90, 135, 180, 225, 270, 315], { branch: "artillery" }, 700);

    it("包囲されている間は士気が回復しない(陣地があっても)", () => {
      const s0 = state(garrison(), ...net());
      const t = s0.units.find((u) => u.id === "t")!;
      t.morale = 0.8;
      t.encircledTurns = 1;
      const r = resolveTurn(s0, [], wideCtx);
      expect(unitOf(r.state, "t").morale).toBeLessThanOrEqual(0.8 - E.moraleLoss + 1e-9);
      expect(unitOf(r.state, "t").encircledTurns).toBe(2);
    });

    it("死守していても、士気が尽きれば投降する(潰走しないまま)", () => {
      const s0 = state(garrison(), ...net());
      const t = s0.units.find((u) => u.id === "t")!;
      t.morale = E.surrenderMoraleBelow + E.moraleLoss - 0.01;
      t.encircledTurns = E.surrenderAfterTurns - 1; // すでに包囲されている(士気が回復せず、このターンで投降までの時間に達する)
      const r = resolveTurn(s0, [], wideCtx);
      expect(r.events.some((e) => e.unitId === "t" && e.type === "surrendered")).toBe(true);
      expect(r.state.units.some((u) => u.id === "t")).toBe(false);
    });

    it("死守していても、弾薬が尽きれば投降する", () => {
      const s0 = state(garrison(), ...net());
      const t = s0.units.find((u) => u.id === "t")!;
      t.ammo = 0;
      t.encircledTurns = E.surrenderAfterTurns - 1;
      const r = resolveTurn(s0, [], wideCtx);
      expect(r.state.units.some((u) => u.id === "t")).toBe(false);
    });

    it("包囲されてすぐには投降しない(包囲が surrenderAfterTurns ターン続いてから)", () => {
      const s0 = state(garrison(), ...net());
      const t = s0.units.find((u) => u.id === "t")!;
      t.ammo = 0;
      t.morale = 0.05;
      const r = resolveTurn(s0, [], wideCtx);
      expect(E.surrenderAfterTurns).toBeGreaterThan(1);
      expect(r.state.units.some((u) => u.id === "t")).toBe(true);
    });

    it("期待挙動:士気も弾薬もあるうちは持ちこたえるが、包囲が続けば数ターンで投降する", () => {
      let s = state(garrison(), ...net());
      let turns = 0;
      while (s.units.some((u) => u.id === "t") && turns < 12) {
        s = resolveTurn(s, [], wideCtx).state;
        turns++;
      }
      expect(turns).toBeGreaterThanOrEqual(3);
      expect(turns).toBeLessThanOrEqual(8);
    });

    it("包囲が解ければ、包囲のターン数は0に戻る", () => {
      const s0 = state(garrison());
      s0.units.find((u) => u.id === "t")!.encircledTurns = 3;
      expect(unitOf(resolveTurn(s0, [], wideCtx).state, "t").encircledTurns).toBe(0);
    });
  });
});

describe("潰走した部隊の逃げ場", () => {
  /** 潰走しかけた独軍の部隊を、米軍の4部隊が ring m 離れて四方から囲む */
  const surrounded = (ring: number) => {
    const s = state(
      ger("g", 5000, 5000, { formation: "deployed" }),
      inf("n", 5000, 5000 + ring, { formation: "deployed", facing: 180 }),
      inf("s", 5000, 5000 - ring, { formation: "deployed", facing: 0 }),
      inf("e", 5000 + ring, 5000, { formation: "deployed", facing: 270 }),
      inf("w", 5000 - ring, 5000, { formation: "deployed", facing: 90 }),
    );
    unitOf(s, "g").morale = rules.morale.routBelow - 0.05;
    return s;
  };
  const turnsUntilGone = (ring: number) => {
    let s = surrounded(ring);
    for (let t = 1; t <= 12; t++) {
      s = resolveTurn(s, [], wideCtx).state;
      if (!s.units.some((u) => u.id === "g")) return t;
    }
    return null;
  };

  it("囲みに隙間があっても、退路を阻止圏にふさがれて動けない潰走部隊は、包囲と同じく数ターンで投降する(居座り続けない)", () => {
    const t = turnsUntilGone(900);
    expect(t).not.toBeNull();
    expect(t!).toBeLessThanOrEqual(rules.encirclement.surrenderAfterTurns + 2);
  });

  it("囲みの隙間が広ければ、潰走した部隊は敵の阻止圏を避けて隙間から下がる", () => {
    expect(turnsUntilGone(2500)).toBeNull();
  });
});
