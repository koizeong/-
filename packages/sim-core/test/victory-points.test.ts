import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createUnit,
  drawSecrets,
  evaluateVictory,
  initialObjectiveLog,
  ownVictory,
  parseScenarioRules,
  publicVictory,
  resolveTurn,
  startScenario,
  updateObjectiveLog,
  viewForSide,
  type ObjectiveHolders,
  type ScenarioRules,
  type SimContext,
} from "../src/index.js";
import { ger, inf, unwrap, wideCtx } from "./helpers.js";

/** 勝利点制:条件ごとの勝利点と、段階(点の合計・満たすべき条件) */

const O = (id: string, x: number, weight: number, initialHolder: string | null = null) => ({ id, name: id, x, y: 5000, radiusM: 500, weight, initialHolder });
const ctxOf = (rules: unknown): SimContext => ({ ...wideCtx, scenario: unwrap(parseScenarioRules(rules)) });

describe("旧い形からの読み替え", () => {
  type LegacyTier = { required?: string[]; minWeight?: number; minEnemyLoss?: number; maxOwnLoss?: number };
  /** 旧い判定(作り替える前の evaluateVictory と同じ式) */
  function legacyLevel(s: { objectives: { id: string; weight: number }[] }, v: { decisive: LegacyTier; limited: LegacyTier }, side: string, holders: ObjectiveHolders, enemyLoss: number, ownLoss: number) {
    const held = new Set(s.objectives.filter((o) => holders[o.id] === side).map((o) => o.id));
    const weight = s.objectives.filter((o) => held.has(o.id)).reduce((a, o) => a + o.weight, 0);
    const meets = (t: LegacyTier) => (t.required ?? []).every((id) => held.has(id)) && weight >= (t.minWeight ?? 0) && enemyLoss >= (t.minEnemyLoss ?? 0) && ownLoss <= (t.maxOwnLoss ?? 1);
    return meets(v.decisive) ? "decisive" : meets(v.limited) ? "limited" : "none";
  }

  const dir = new URL("../../../data/scenarios/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    it(`期待挙動:${file} の勝利条件は、読み替えた後も旧い判定とまったく同じ`, () => {
      const raw = JSON.parse(readFileSync(new URL(file, dir), "utf-8")) as { rules: { objectives: { id: string; weight: number }[]; victory: Record<string, { decisive: LegacyTier; limited: LegacyTier }> } };
      const ctx = ctxOf(raw.rules);
      const sides = Object.keys(raw.rules.victory);
      // 決まった擬似乱数で、保持と損耗の組み合わせを多数試す
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let k = 0; k < 300; k++) {
        const holders: ObjectiveHolders = Object.fromEntries(raw.rules.objectives.map((o) => [o.id, rnd() < 0.2 ? null : sides[Math.floor(rnd() * sides.length)]!]));
        const enemyLoss = Object.fromEntries(sides.map((s) => [s, rnd() * 0.6]));
        const ownLoss = Object.fromEntries(sides.map((s) => [s, rnd() * 0.6]));
        const r = evaluateVictory(holders, ctx, enemyLoss, ownLoss);
        for (const s of sides) expect(r.perSide[s]!.level).toBe(legacyLevel(raw.rules, raw.rules.victory[s]!, s, holders, enemyLoss[s]!, ownLoss[s]!));
      }
    });
  }
});

describe("新しい条件", () => {
  it("勝利点の合計と、満たすべき条件で段階が決まる", () => {
    const ctx = ctxOf({
      maxTurns: 4,
      objectives: [O("a", 2000, 1), O("b", 5000, 1)],
      victory: {
        us: {
          conditions: [
            { id: "a", type: "hold", objective: "a", points: 2 },
            { id: "b", type: "hold", objective: "b", points: 3 },
          ],
          decisive: { minPoints: 5 },
          limited: { minPoints: 2, requires: ["a"] },
        },
        de: { conditions: [], decisive: { minPoints: 99 }, limited: { minPoints: 99 } },
      },
    });
    expect(evaluateVictory({ a: "us", b: "us" }, ctx).perSide.us).toMatchObject({ points: 5, level: "decisive" });
    expect(evaluateVictory({ a: "us", b: null }, ctx).perSide.us).toMatchObject({ points: 2, level: "limited" });
    // 点は足りても、満たすべき条件(a)を欠けば届かない
    expect(evaluateVictory({ a: null, b: "us" }, ctx).perSide.us).toMatchObject({ points: 3, level: "none" });
  });

  it("期待挙動:ターンごとにたまる支配点は、最後のターンに奪っただけでは少ない", () => {
    const ctx = ctxOf({
      maxTurns: 4,
      objectives: [O("a", 2000, 1)],
      victory: {
        us: { conditions: [{ id: "a", type: "hold", objective: "a", points: 4, perTurn: true }], decisive: { minPoints: 3 }, limited: { minPoints: 1 } },
        de: { conditions: [{ id: "a", type: "hold", objective: "a", points: 4, perTurn: true }], decisive: { minPoints: 3 }, limited: { minPoints: 1 } },
      },
    });
    // 3ターン us が持ち、最後のターンに de が奪った
    let log = initialObjectiveLog({ a: null });
    for (const [t, h] of [[1, "us"], [2, "us"], [3, "us"], [4, "de"]] as const) log = updateObjectiveLog(log, { a: h }, t);
    const r = evaluateVictory({ a: "de" }, ctx, {}, {}, log);
    expect(r.perSide.us!.points).toBeCloseTo(3);
    expect(r.perSide.de!.points).toBeCloseTo(1);
    expect(r).toMatchObject({ winner: "us", level: "decisive" });
  });

  it("期待挙動:遅滞戦(期限までの保持)は、期限より前に一度でも奪われると満たさない。期限の後に奪われるのはよい", () => {
    const ctx = ctxOf({
      maxTurns: 6,
      objectives: [O("a", 2000, 1, "us")],
      victory: {
        us: { conditions: [{ id: "delay", type: "holdUntil", objective: "a", turn: 4, points: 1 }], decisive: { minPoints: 1 }, limited: { minPoints: 1 } },
        de: { conditions: [], decisive: { minPoints: 99 }, limited: { minPoints: 99 } },
      },
    });
    const run = (seq: (string | null)[]) => {
      let log = initialObjectiveLog({ a: "us" });
      seq.forEach((h, i) => (log = updateObjectiveLog(log, { a: h }, i + 1)));
      return evaluateVictory({ a: seq[seq.length - 1]! }, ctx, {}, {}, log).perSide.us!.level;
    };
    expect(run(["us", "us", "us", "us", "de", "de"])).toBe("decisive");
    expect(run(["us", "us", "de", "us", "us", "us"])).toBe("none");
  });

  it("期待挙動:損耗比は、敵より損耗を抑えた側が満たす(どちらも損耗がなければ満たさない)", () => {
    const side = { conditions: [{ id: "r", type: "lossRatio", max: 1, points: 1 }], decisive: { minPoints: 1 }, limited: { minPoints: 1 } };
    const ctx = ctxOf({ maxTurns: 2, objectives: [], victory: { us: side, de: side } });
    // us の損耗 5%・de の損耗 10%(us から見た敵の損耗 = de の損耗)
    expect(evaluateVictory({}, ctx, { us: 0.1, de: 0.05 }, { us: 0.05, de: 0.1 })).toMatchObject({ winner: "us" });
    expect(evaluateVictory({}, ctx, {}, {})).toMatchObject({ winner: null, level: "draw" });
  });

  it("1ターンずつ解くと、目標の保持の記録がたまり、判定に使われる", () => {
    const rules: ScenarioRules = unwrap(
      parseScenarioRules({
        maxTurns: 2,
        objectives: [O("a", 2000, 1)],
        victory: {
          de: { conditions: [{ id: "a", type: "hold", objective: "a", points: 2, perTurn: true }], decisive: { minPoints: 2 }, limited: { minPoints: 1 } },
          us: { conditions: [], decisive: { minPoints: 99 }, limited: { minPoints: 99 } },
        },
      }),
    );
    const ctx: SimContext = { ...wideCtx, scenario: rules };
    const s0 = startScenario([createUnit(ger("g", 2000, 5100)), createUnit(inf("u", 9000, 9000))], 1, ctx);
    const r1 = resolveTurn(s0, [], ctx);
    expect(r1.state.objectiveLog!.turnsHeld.a).toEqual({ de: 1 });
    const r2 = resolveTurn(r1.state, [], ctx);
    expect(r2.result).toMatchObject({ winner: "de", level: "decisive" });
    expect(r2.result!.perSide.de!.points).toBeCloseTo(2);
  });

  it("条件の誤りは読み込みで知らせる(ない目標・ない条件・重複・期限が規定ターンの外)", () => {
    const r = parseScenarioRules({
      maxTurns: 3,
      objectives: [O("a", 2000, 1)],
      victory: {
        us: {
          conditions: [
            { id: "x", type: "hold", objective: "nowhere" },
            { id: "x", type: "holdUntil", objective: "a", turn: 9 },
          ],
          decisive: { requires: ["missing"] },
          limited: {},
        },
      },
    });
    expect(r.ok).toBe(false);
    const errors = r.ok ? "" : r.errors.join("\n");
    expect(errors).toContain('目標 "nowhere" がありません');
    expect(errors).toContain("条件のIDが重複しています");
    expect(errors).toContain("期限が規定ターンの外です");
    expect(errors).toContain('条件 "missing" がありません');
  });
});

describe("秘密の副目標", () => {
  const rules = {
    maxTurns: 2,
    objectives: [O("a", 2000, 1), O("b", 5000, 1), O("c", 8000, 1)],
    victory: {
      us: {
        conditions: [{ id: "lr", type: "lossRatio", max: 1, points: 1 }],
        decisive: { minPoints: 3 },
        limited: { minPoints: 1 },
        secretPool: {
          count: 1,
          options: [
            { id: "sa", type: "hold", objective: "a", points: 2 },
            { id: "sb", type: "hold", objective: "b", points: 2 },
            { id: "sc", type: "hold", objective: "c", points: 2 },
          ],
        },
      },
      de: { conditions: [{ id: "x", type: "hold", objective: "b", points: 1, secret: true }], decisive: { minPoints: 9 }, limited: { minPoints: 1 } },
    },
  };
  const ctx = ctxOf(rules);

  it("試合のシードで候補から引く。同じシードなら同じ、シードが違えば違うものも引く", () => {
    expect(drawSecrets(ctx.scenario, 5)).toEqual(drawSecrets(ctx.scenario, 5));
    expect(drawSecrets(ctx.scenario, 5).us).toHaveLength(1);
    const seen = new Set(Array.from({ length: 30 }, (_, i) => drawSecrets(ctx.scenario, i).us![0]));
    expect(seen.size).toBe(3);
    // 候補のない陣営は引かない
    expect(drawSecrets(ctx.scenario, 5).de).toBeUndefined();
  });

  it("期待挙動:引いた副目標だけが勝利点を足す(引いていない候補を保持しても点にならない)", () => {
    const lossy = { us: 0.2, de: 0.1 };
    const own = { us: 0.1, de: 0.2 };
    expect(evaluateVictory({ a: "us" }, ctx, lossy, own, undefined, { us: ["sa"] }).perSide.us).toMatchObject({ points: 3, level: "decisive" });
    expect(evaluateVictory({ a: "us" }, ctx, lossy, own, undefined, { us: ["sb"] }).perSide.us).toMatchObject({ points: 1, level: "limited" });
    // 終わりに明かす中身
    expect(evaluateVictory({}, ctx, {}, {}, undefined, { us: ["sb"] }).perSide.us!.secrets.map((c) => c.id)).toEqual(["sb"]);
  });

  it("霧:相手には秘密の条件も候補の中身も見せない(候補の数だけ)。自陣営には引いたものを見せる", () => {
    const pub = publicVictory(ctx.scenario.victory.de!);
    expect(pub.conditions).toEqual([]);
    const usPub = publicVictory(ctx.scenario.victory.us!);
    expect(usPub.secretPool).toEqual({ count: 1, options: [] });
    const own = ownVictory(ctx.scenario.victory.us!, ["sc"]);
    expect(own.conditions.map((c) => [c.id, c.secret])).toEqual([["lr", false], ["sc", true]]);
    const s = startScenario([createUnit(inf("u", 1000, 1000)), createUnit(ger("g", 9000, 9000))], 3, ctx);
    expect(viewForSide(s, "us").secrets).toEqual(s.secrets!.us);
    expect(viewForSide(s, "de").secrets).toBeUndefined();
    expect(JSON.stringify(viewForSide(s, "de"))).not.toContain(s.secrets!.us![0]!);
  });

  it("秘密の条件は、満たすべき条件にはできない(段階の条件を相手に隠せなくなるため)", () => {
    const r = parseScenarioRules({ ...rules, victory: { ...rules.victory, de: { ...rules.victory.de, limited: { requires: ["x"] } } } });
    expect(r.ok ? "" : r.errors.join("\n")).toContain('秘密の条件 "x" は満たすべき条件にできません');
  });
});
