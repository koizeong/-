/**
 * シナリオパックの確かめ(作る人の道具)。
 *
 *   pnpm pack:check <パックのフォルダ> [ほかのパック…] [--ai <試合数>]
 *
 * 読み込み(形・参照・ID の重なり・要るパック)の誤りを、ファイルの場所つきで出す。
 * 通ったパックのシナリオは、両陣営の AI が1ターン目に弾かれる命令を出さないかを見る。
 * --ai を付けると、シナリオごとに AI 同士で何試合か戦わせて、勝率と決着の度合いを出す(重い)。
 * リポジトリの mods/ のパックも一緒に読むので、requires で同梱のパックを使える。
 * 誤りがあれば終了コード 1
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decide, DEFAULT_AI, imbalance, runSeries } from "@brigade/ai";
import { resolveTurn, viewForSide, type HqCommand, type SeaOrder, type UnitOrder } from "@brigade/sim-core";
import { findPackDirs } from "./mods.js";
import { loadAll } from "./boot.js";

const args = process.argv.slice(2);
const cwd = process.env.INIT_CWD ?? process.cwd();
const aiAt = args.indexOf("--ai");
const games = aiAt >= 0 ? Number(args[aiAt + 1] ?? 4) : 0;
const targets = args.filter((a, i) => !a.startsWith("--") && !(aiAt >= 0 && i === aiAt + 1)).map((a) => resolve(cwd, a));
if (targets.length === 0) {
  console.error("使い方: pnpm pack:check <パックのフォルダ(pack.json のあるフォルダ。mods のフォルダなら中の全部)> [--ai <試合数>]");
  process.exit(2);
}
// pack.json のあるフォルダはそのパック、ないフォルダは中のパック全部
const packDirs = targets.flatMap((t) => (existsSync(join(t, "pack.json")) ? [t] : findPackDirs([t])));
if (packDirs.length === 0) {
  console.error(`パック(pack.json のあるフォルダ)が見つかりません: ${targets.join(", ")}`);
  process.exit(2);
}

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const repoMods = fileURLToPath(new URL("../../../mods/", import.meta.url));
const all = loadAll(dataDir, [repoMods], packDirs);
const wanted = new Set(packDirs.map((d) => resolve(d)));
let failed = false;

for (const m of all.mods.filter((x) => wanted.has(resolve(x.dir)))) {
  const i = m.info;
  console.log(`\n■ ${i.name}(${i.id} 版 ${i.version})フォルダ ${i.folder}`);
  if (!i.ok) failed = true;
  console.log(i.ok ? "  読み込み: 通りました" : "  読み込み: 誤りがあるので、このパックは丸ごと外れます");
  for (const e of i.errors) console.log(`  ✗ ${e}`);
  if (!i.ok) continue;
  console.log(`  シナリオ ${i.scenarios.length}・キャンペーン ${i.campaigns.length}・手引き ${i.tutorials.length}`);
  for (const id of i.scenarios) {
    const sc = all.scenarios.get(id)!;
    const ctx = sc.ctx;
    const s = sc.start(1);
    const sides = Object.keys(ctx.scenario.victory);
    const problems: string[] = [];
    const orders: UnitOrder[] = [];
    const hq: HqCommand[] = [];
    const sea: SeaOrder[] = [];
    for (const side of sides) {
      if (!s.units.some((u) => u.side === side) && !ctx.scenario.reinforcements.some((r) => r.side === side)) problems.push(`陣営 ${side} の部隊が1つもない`);
      const d = decide(viewForSide(s, side), ctx, DEFAULT_AI);
      orders.push(...d.orders);
      hq.push(...d.hqCommands);
      sea.push(...(d.seaOrders ?? []));
    }
    // 1ターン目を解いて、AI の命令が弾かれないか
    const r = resolveTurn(s, orders, ctx, hq, sea);
    if (r.rejectedSeaOrders?.length) problems.push(`AI の戦隊の命令が ${r.rejectedSeaOrders.length} 件弾かれた(${r.rejectedSeaOrders.slice(0, 3).map((o) => o.reason).join(" ")})`);
    if (r.rejectedOrders.length) problems.push(`AI の命令が ${r.rejectedOrders.length} 件弾かれた(${r.rejectedOrders.slice(0, 3).map((o) => JSON.stringify(o)).join(" ")})`);
    if (r.rejectedHqCommands.length) problems.push(`AI の司令部コマンドが ${r.rejectedHqCommands.length} 件弾かれた`);
    console.log(`  ・${sc.def.name}(${id})${problems.length ? "" : " 問題なし"}`);
    for (const p of problems) console.log(`    ✗ ${p}`);
    if (problems.length) failed = true;
    if (games > 0) {
      const series = runSeries(sc.start, ctx, Array.from({ length: games }, (_, k) => k + 1));
      const rate = sides.map((x) => `${x} ${Math.round((series.winRate[x] ?? 0) * 100)}%`).join("・");
      const loss = sides.map((x) => `${x} ${Math.round((series.decisiveness[x]?.lossShare ?? 0) * 100)}%`).join("・");
      // 偏り(どちらかの勝率が75%を超える)は、試合が少ないと当てにならないので10戦以上で出す
      const skew = games >= 10 ? imbalance(series) : [];
      console.log(`    AI 同士 ${games} 戦: 勝率 ${rate}・引き分け ${series.draws}・失った戦力 ${loss}${skew.length ? `  偏り: ${skew.map((x) => x.side).join("・")}` : ""}`);
    }
  }
}
process.exit(failed ? 1 : 0);
