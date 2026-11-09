import { buildScenario, type NavalTally } from "@brigade/sim-core";
import { describe, it } from "vitest";
import { addNavalTally, runMatch } from "../src/index.js";
import { loadPacks, loadScenarioJson, unwrap } from "../../sim-core/test/helpers.js";

/**
 * 海戦の確かめ(S8):AI 同士で回して、陣営ごとの撃った弾・当たった弾・撃った魚雷・当たった魚雷を数え、史実の数と並べる。
 * 時間がかかるので NAVAL_VALIDATE=1 のときだけ回す(NAVAL_GAMES で試合数、既定 6)。
 *   NAVAL_VALIDATE=1 npx vitest run packages/ai/test/naval-validation.test.ts
 * 史実の数は docs/research/naval-elements.md・各海戦の調査メモの要約(TODO(要裏取り))
 */
const HISTORY: Record<string, Record<string, string>> = {
  "savo-1942-08-09": { jp: "砲弾の命中:キャンベラ約24発・クインシー36発以上ほか。魚雷:シカゴ1・クインシー2・ヴィンセンス1〜2・キャンベラ1〜2(撃った本数は要裏取り)", al: "日本艦への命中はわずか(鳥海ほか)" },
  "tassafaronga-1942-11-30": { jp: "魚雷 約40本で6本ほど命中(約15%。ミネアポリス2・ニューオーリンズ1・ペンサコラ1・ノーザンプトン2)", us: "魚雷 約20本で命中0。砲弾は高波に集中" },
  "java-sea-1942-02-27": { jp: "昼の第1段階で魚雷92本を撃ち命中1本(コルテノール)。夜は那智8本・羽黒4本でデ・ロイテルとジャワを沈めた。昼の砲戦は弾を大量に使ってほとんど当たらず、羽黒の1発がエクセターの缶室を止めた", al: "日本艦への命中はわずか(朝雲が損傷)" },
  "surigao-1944-10-25": { us: "駆逐艦の雷撃で扶桑・満潮・山雲が沈み、山城・朝雲にも当たった。戦艦は16in・14in を合わせて300発ほど、巡洋艦は数千発を撃った(要裏取り)", jp: "米の損害はアルバート・W・グラント(多くは味方撃ち)ほど" },
  "guadalcanal-1942-11-14": { us: "ワシントン:16インチ 75発で霧島に9〜20発(資料で差)、5インチも多数", jp: "米の駆逐艦3隻を沈めた(砲弾と魚雷)。サウスダコタに約26発" },
};

const pct = (h: number, n: number) => (n > 0 ? `${((100 * h) / n).toFixed(1)}%` : "-");

describe.skipIf(!process.env.NAVAL_VALIDATE)("海戦の確かめ:撃った数と当たった数", () => {
  for (const id of Object.keys(HISTORY).filter((k) => !process.env.NAVAL_ONLY || process.env.NAVAL_ONLY.split(",").includes(k))) {
    it(id, () => {
      const sc = unwrap(buildScenario(loadScenarioJson(id), loadPacks()));
      const games = Number(process.env.NAVAL_GAMES ?? 6);
      const total: Record<string, NavalTally> = {};
      const wins: Record<string, number> = {};
      for (let seed = 1; seed <= games; seed++) {
        const o = runMatch(sc.start(seed), sc.ctx, {}, seed);
        addNavalTally(total, o.naval);
        const w = o.result.winner ?? "draw";
        wins[w] = (wins[w] ?? 0) + 1;
      }
      const lines = [`## ${id}(${games}戦:${Object.entries(wins).map(([k, v]) => `${k} ${v}`).join("・")})`, "", "| 陣営 | 砲弾(1戦あたり) | 命中 | 命中率 | 距離の帯ごとの命中率(km) | 魚雷(1戦あたり) | 命中 | 命中率 | 史実 |", "|---|---|---|---|---|---|---|---|---|"];
      for (const side of sc.def.sides.map((s) => s.id)) {
        const t = total[side];
        if (!t) continue;
        const bands = Object.entries(t.bands)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([k, b]) => `${k}〜:${pct(b.hits, b.shells)}(${Math.round(b.shells / games)})`)
          .join(" ");
        lines.push(`| ${side} | ${Math.round(t.shells / games)} | ${(t.shellHits / games).toFixed(1)} | ${pct(t.shellHits, t.shells)} | ${bands} | ${(t.torpedoes / games).toFixed(1)} | ${(t.torpedoHits / games).toFixed(1)} | ${pct(t.torpedoHits, t.torpedoes)} | ${HISTORY[id]![side] ?? ""} |`);
      }
      console.log("\n" + lines.join("\n") + "\n");
    }, 1800000);
  }
});
