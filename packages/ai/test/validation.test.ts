/**
 * 史実の戦いの再現度を測る(重いので普段は飛ばす)。同じ設定値で別の戦いを AI 同士に戦わせ、
 * 勝敗・目標の保持・損耗・機甲の損失・投降を、docs/research/validation.md の史実の値と比べる。
 *
 *   VALIDATE=1 npx vitest run packages/ai/test/validation.test.ts
 *   VALIDATE=krinkelt-rocherath-1944-12-17 GAMES=20 npx vitest run packages/ai/test/validation.test.ts
 */
import { describe, it } from "vitest";
import { buildScenario, isGameOver, resolveTurn, toeHitPoints, viewForSide, type GameState, type SimContext } from "@brigade/sim-core";
import { decide, DEFAULT_AI } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

const SCENARIOS = ["krinkelt-rocherath-1944-12-17", "arracourt-1944-09-19", "carentan-1944-06-10"];
const target = process.env.VALIDATE;
const ids = target && target !== "1" ? target.split(",") : SCENARIOS;
const GAMES = Number(process.env.GAMES ?? 10);

interface GameStats {
  winner: string;
  held: Record<string, string | null>;
  firstLost: Record<string, number>;
  loss: Record<string, number>;
  armorLoss: Record<string, number>;
  /** 陣営ごとの、戦力が残ったまま盤上から消えた部隊(投降)と、戦力0で消えた部隊(撃破) */
  surrendered: Record<string, number>;
  destroyed: Record<string, number>;
  /** 陣営ごとの、最も損害の大きかった部隊の損失(投降・撃破は1) */
  worstUnit: Record<string, number>;
}

/**
 * RULES_PATCH(JSON)で、ルールパックの値を上書きして測る(設定を変えたときの比較用)。
 * 例:RULES_PATCH='{"combat":{"directFireMoraleMultiplier":1},"morale":{"lossCeilingFactor":0}}'
 * TOE_UNSPLIT=1 なら、編成表の装甲の要素の印(armored)を外す(装甲と非装甲を分けない、以前の按分)
 */
function patchedPacks() {
  const packs = loadPacks();
  const patch = process.env.RULES_PATCH ? (JSON.parse(process.env.RULES_PATCH) as Record<string, unknown>) : null;
  const merge = (target: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(src)) {
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") merge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
      else target[k] = v;
    }
  };
  if (patch) for (const r of Object.values(packs.rules)) merge(r as unknown as Record<string, unknown>, patch);
  if (process.env.TOE_UNSPLIT) for (const p of Object.values(packs.toes)) for (const t of Object.values(p.toes)) for (const e of t.elements) delete e.armored;
  return packs;
}

const isArmor = (ctx: SimContext, toe: string) => {
  const t = ctx.toes.toes[toe]!;
  return t.branch === "armor" || t.branch === "tank_destroyer";
};

function play(id: string, seed: number): GameStats {
  const sc = unwrap(buildScenario(loadScenarioJson(id), patchedPacks()));
  const ctx = sc.ctx;
  let s: GameState = sc.start(seed);
  const sides = Object.keys(ctx.scenario.victory);
  // 部隊ごとの、加わったときの耐久と最後に見た耐久
  const firstHp = new Map<string, { side: string; armor: boolean; hp: number }>();
  const lastHp = new Map<string, number>();
  const seen = (st: GameState) => {
    for (const u of st.units) {
      const hp = toeHitPoints(ctx.toes.toes[u.toe]!) * u.strength;
      if (!firstHp.has(u.id)) firstHp.set(u.id, { side: u.side, armor: isArmor(ctx, u.toe), hp });
      lastHp.set(u.id, hp);
    }
  };
  seen(s);
  const firstLost: Record<string, number> = {};
  const initial = { ...s.objectives };
  let result = null as ReturnType<typeof resolveTurn>["result"];
  while (!isGameOver(s, ctx)) {
    const ds = sides.map((side) => decide(viewForSide(s, side), ctx, DEFAULT_AI, seed));
    const r = resolveTurn(s, ds.flatMap((d) => d.orders), ctx, ds.flatMap((d) => d.hqCommands));
    s = r.state;
    result = r.result;
    seen(s);
    for (const [k, v] of Object.entries(s.objectives)) if (v !== initial[k] && firstLost[k] === undefined) firstLost[k] = s.turn - 1;
  }
  const zero = () => Object.fromEntries(sides.map((x) => [x, 0]));
  const surrendered = zero();
  const destroyed = zero();
  const armorFirst = zero();
  const armorNow = zero();
  const worstUnit = zero();
  const present = new Set(s.units.map((u) => u.id));
  // 戦場から離脱した(転用された)部隊は、損失にも投降にも数えない
  const withdrawn = new Set(ctx.scenario.withdrawals.map((w) => w.id));
  for (const [uid, f] of firstHp) {
    if (withdrawn.has(uid) && !present.has(uid)) continue;
    const now = present.has(uid) ? lastHp.get(uid)! : 0;
    if (!present.has(uid)) (lastHp.get(uid)! > 0 ? surrendered : destroyed)[f.side]! += 1;
    if (f.hp > 0) worstUnit[f.side] = Math.max(worstUnit[f.side]!, 1 - now / f.hp);
    if (f.armor) {
      armorFirst[f.side]! += f.hp;
      armorNow[f.side]! += now;
    }
  }
  return {
    winner: result ? `${result.winner ?? "draw"}:${result.level}` : "none",
    held: { ...s.objectives },
    firstLost,
    loss: { ...s.ownLoss },
    armorLoss: Object.fromEntries(sides.map((x) => [x, armorFirst[x]! > 0 ? 1 - armorNow[x]! / armorFirst[x]! : 0])),
    surrendered,
    destroyed,
    worstUnit,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

describe.skipIf(!target)("史実の戦いの再現度", () => {
  for (const id of ids) {
    it(id, () => {
      const games = Array.from({ length: GAMES }, (_, i) => play(id, i + 1));
      const sides = Object.keys(games[0]!.loss);
      const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});
      const lines = [`== ${id}(${GAMES}戦)`, `勝敗 ${JSON.stringify(count(games.map((g) => g.winner)))}`];
      for (const side of sides) {
        lines.push(
          `${side}: 損耗 平均${pct(mean(games.map((g) => g.loss[side] ?? 0)))}(${pct(Math.min(...games.map((g) => g.loss[side] ?? 0)))}〜${pct(Math.max(...games.map((g) => g.loss[side] ?? 0)))})` +
            ` 機甲の損失 平均${pct(mean(games.map((g) => g.armorLoss[side] ?? 0)))} 投降 平均${mean(games.map((g) => g.surrendered[side] ?? 0)).toFixed(1)}部隊 撃破 平均${mean(games.map((g) => g.destroyed[side] ?? 0)).toFixed(1)}部隊` +
            ` 最も損害の大きい部隊 平均${pct(mean(games.map((g) => g.worstUnit[side] ?? 0)))}`,
        );
      }
      const objectives = Object.keys(games[0]!.held);
      // 終了時に保持していた目標の重み(陣営ごとの分布)。勝利条件の線引きを史実の結末と比べるのに使う
      const weightOf = Object.fromEntries(unwrap(buildScenario(loadScenarioJson(id), patchedPacks())).ctx.scenario.objectives.map((o) => [o.id, o.weight]));
      for (const side of sides) {
        const ws = games.map((g) => Object.entries(g.held).reduce((a, [o, h]) => a + (h === side ? (weightOf[o] ?? 1) : 0), 0));
        lines.push(`${side}: 終了時の重み ${JSON.stringify(count(ws.map(String)))} 平均${mean(ws).toFixed(1)}`);
      }
      for (const o of objectives) {
        const holders = count(games.map((g) => g.held[o] ?? "none"));
        const lostAt = games.map((g) => g.firstLost[o]).filter((t): t is number => t !== undefined);
        lines.push(`  ${o}: 終了時 ${JSON.stringify(holders)} 初めて保持者が変わったターン ${lostAt.length ? `平均${mean(lostAt).toFixed(1)}(${lostAt.length}戦)` : "なし"}`);
      }
      // DUMP=1 なら1戦ずつの結果も出す(勝利条件の線引きを変えた場合の数え直し用)
      if (process.env.DUMP) for (const g of games) lines.push(`DUMP ${JSON.stringify({ held: g.held, loss: g.loss, winner: g.winner })}`);
      console.log(lines.join("\n"));
    }, 3_600_000);
  }
});
