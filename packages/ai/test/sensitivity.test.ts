/**
 * 編成の差がどれだけ勝敗に効くかを測る(重いので普段は飛ばす)。
 * 対称シナリオで、us の歩兵連隊2つだけを、人数(耐久)をほぼ同じにしたまま装備を変えた編成に置き換え、AI同士で戦わせる。
 * 相性を見るため、de の歩兵連隊1つを機甲に置き換えた「機甲が多い敵」でも測る。
 *
 *   SENSITIVITY=1 GAMES=40 npx vitest run packages/ai/test/sensitivity.test.ts
 */
import { createUnit, forceNow, resolveTurn, startScenario, toeSummary, type GameState, type SimContext, type Toe } from "@brigade/sim-core";
import { describe, it } from "vitest";
import { runSeries } from "../src/index.js";
import { symCtx, symStart } from "./fixtures.js";

const GAMES = Number(process.env.GAMES ?? 40);
const seeds = Array.from({ length: GAMES }, (_, i) => i + 1);
const base = symCtx.toes.toes["infantry_regiment"]!;

type W = [weapon: string, count: number];
const rifle = (count: number, hp: number, ...weapons: W[]) => ({ name: "小銃中隊", count, hitPoints: hp, weapons: weapons.map(([weapon, n]) => ({ weapon, count: n })) });
const heavy = (count: number, hp: number, ...weapons: W[]) => ({ name: "重火器中隊", count, hitPoints: hp, weapons: weapons.map(([weapon, n]) => ({ weapon, count: n })) });

/** 比べる編成(基準:小銃中隊9[小火器4・機関銃1・対戦車火器1]+重火器中隊3[機関銃3]、耐久1080) */
const VARIANTS: Record<string, Toe> = {
  基準: base,
  "火力+20%(武器を2割増し)": { ...base, elements: [rifle(9, 100, ["small_arms", 5], ["machine_gun", 1], ["rocket_launcher", 1]), heavy(3, 60, ["machine_gun", 4])] },
  "耐久+20%": { ...base, elements: base.elements.map((e) => ({ ...e, hitPoints: e.hitPoints * 1.2 })) },
  "対戦車寄り(機関銃→対戦車)": { ...base, elements: [rifle(9, 100, ["small_arms", 4], ["rocket_launcher", 2]), heavy(3, 60, ["at_gun", 2])] },
  "対歩兵寄り(対戦車→機関銃)": { ...base, elements: [rifle(9, 100, ["small_arms", 4], ["machine_gun", 2]), heavy(3, 60, ["machine_gun", 4])] },
  "大人数・軽装(12個中隊・機関銃なし)": { ...base, elements: [rifle(12, 100, ["small_arms", 4], ["rocket_launcher", 1])] },
  "少人数・重装(7個中隊・機関銃増し)": { ...base, elements: [rifle(7, 100, ["small_arms", 4], ["machine_gun", 2], ["rocket_launcher", 1]), heavy(3, 60, ["machine_gun", 4])] },
};

/** 戦わせる相手:対称(de はそのまま)と、de の歩兵連隊1つを機甲にした「機甲が多い敵」 */
const ENEMIES: Record<string, (s: GameState) => void> = {
  対称: () => {},
  機甲が多い敵: (s) => {
    const u = s.units.find((x) => x.id === "de-inf2")!;
    Object.assign(u, { toe: "armor_combat_command", branch: "armor" });
  },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

describe.skipIf(!process.env.SENSITIVITY)("編成の効き目", () => {
  it("一騎打ち:開けた平地で展開して向き合った相手と、4ターン撃ち合ったときの損害(600m と 250m)", () => {
    const rows: string[] = ["\n# 一騎打ち(平地・4ターン。与えた損害 / 受けた損害)"];
    for (const [name, toe] of Object.entries(VARIANTS)) {
      const ctx: SimContext = { ...symCtx, toes: { ...symCtx.toes, toes: { ...symCtx.toes.toes, variant: toe } } };
      const cells: string[] = [];
      for (const [enemyName, enemyToe, enemyBranch, gap] of [
        ["歩兵 600m", "infantry_regiment", "infantry", 600],
        ["歩兵 250m", "infantry_regiment", "infantry", 250],
        ["機甲 600m", "armor_combat_command", "armor", 600],
        ["機甲 250m", "armor_combat_command", "armor", 250],
        ["戦車 600m", "panzer_regiment", "armor", 600],
      ] as const) {
        let s = startScenario(
          [
            createUnit({ id: "us-v", side: "us", branch: "infantry", toe: "variant", pos: { x: 4000, y: 6500 }, facing: 90, stance: "standard", formation: "deployed" }),
            createUnit({ id: "de-e", side: "de", branch: enemyBranch, toe: enemyToe, pos: { x: 4000 + gap, y: 6500 }, facing: 270, stance: "standard", formation: "deployed" }),
          ],
          1,
          ctx,
        );
        for (let t = 0; t < 4; t++) s = resolveTurn(s, [], ctx).state;
        const left = (id: string) => s.units.find((u) => u.id === id)?.strength ?? 0;
        const routed = (id: string) => (s.units.find((u) => u.id === id)?.routed ? "潰" : "");
        cells.push(`${enemyName} 与${pct1(1 - left("de-e"))}${routed("de-e")}/受${pct1(1 - left("us-v"))}${routed("us-v")}`);
      }
      rows.push(`${name}  ${cells.join("  ")}`);
    }
    console.log(rows.join("\n"));
  });

  it("編成ごと・相手ごとに AI 同士で戦わせ、勝敗と損耗を比べる", () => {
    const rows: string[] = [];
    for (const [name, toe] of Object.entries(VARIANTS)) {
      const ctx: SimContext = { ...symCtx, toes: { ...symCtx.toes, toes: { ...symCtx.toes.toes, variant: toe } } };
      const s = toeSummary(toe, ctx.weapons, ctx.branches, ctx.rules)!;
      const peak = (k: "soft" | "armored") => Math.max(...s.direct.curve.map((p) => p[k]));
      rows.push(`\n## ${name}(耐久 ${s.hitPoints}・対歩兵 ${peak("soft").toFixed(1)}・対装甲 ${peak("armored").toFixed(1)}・射程 ${s.direct.maxRangeM}m)`);
      for (const [enemy, tweak] of Object.entries(ENEMIES)) {
        const start = (seed: number) => {
          const st = symStart(seed);
          for (const u of st.units) if (u.id === "us-inf1" || u.id === "us-inf2") Object.assign(u, { toe: "variant" });
          tweak(st);
          // 損耗率の分母(開始時の戦力)を、置き換えた後の編成で取り直す
          st.forceTotals = forceNow(st.units, ctx);
          return st;
        };
        const r = runSeries(start, ctx, seeds);
        const loss = (side: string) => r.outcomes.reduce((t, o) => t + (o.final.ownLoss[side] ?? 0), 0) / r.games;
        const decided = r.games - r.draws;
        rows.push(
          `${enemy}: us勝 ${r.wins.us}・de勝 ${r.wins.de}・分 ${r.draws}(決着した中の us 勝率 ${decided ? pct(r.wins.us! / decided) : "—"})` +
            `/損耗 us ${pct(loss("us"))}・de ${pct(loss("de"))}(de/us ${(loss("de") / Math.max(0.001, loss("us"))).toFixed(2)})`,
        );
      }
    }
    console.log(rows.join("\n"));
  }, 3_600_000);
});
