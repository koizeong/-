import { resolve } from "node:path";
import { loadBiomes, loadDataDir, loadTutorials } from "./data.js";
import { loadGeneratorData } from "./generate.js";
import { loadCampaignGenerator, loadCampaigns } from "./campaign.js";
import { startServer } from "./server.js";
import { findPackDirs, loadMods } from "./mods.js";

export interface BootOptions {
  /** data/ のディレクトリ */
  dataDir: string;
  port: number;
  /** ビルド済みの画面のディレクトリ(本番用の起動・デスクトップ版) */
  staticDir?: string;
  /** 編成エディターの HTTP の口を開くか(省略は開く) */
  editor?: boolean;
  host?: string;
  /** シナリオパック(MOD)を置くフォルダの並び。中の、pack.json を持つ下のフォルダを1つずつ読む */
  modsDirs?: string[];
}

/** data/ とシナリオパックを読み込む(起動とパックの確かめ pack:check で共通) */
export function loadAll(dataDir: string, modsDirs: readonly string[] = [], extraPackDirs: readonly string[] = []) {
  const { scenarios, packs } = loadDataDir(dataDir);
  // シナリオパック:誤りのあるパックは丸ごと外して、誤りを /api/mods で知らせる。同じフォルダは1度だけ
  const dirs = [...new Set([...findPackDirs(modsDirs), ...extraPackDirs].map((d) => resolve(d)))];
  const { mods, sourceOf } = loadMods(dirs, packs, scenarios);
  const okMods = mods.filter((m) => m.info.ok);
  const tutorials = loadTutorials(dataDir, scenarios);
  for (const m of okMods) {
    try {
      const t = loadTutorials(m.dir, scenarios);
      tutorials.push(...t);
      m.info.tutorials = t.map((x) => x.id);
    } catch (e) {
      m.info.errors.push(`手引きを外しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const generator = loadGeneratorData(dataDir);
  const biomes = loadBiomes(dataDir);
  const campaignEnv = generator ? { packs, generator, biomes } : null;
  const campaignGenerator = loadCampaignGenerator(dataDir);
  const campaignDefs = campaignEnv ? loadCampaigns(dataDir, campaignEnv) : undefined;
  if (campaignEnv && campaignDefs)
    for (const m of okMods) {
      try {
        const defs = loadCampaigns(m.dir, campaignEnv);
        for (const [id, d] of defs) {
          if (campaignDefs.has(id)) throw new Error(`キャンペーンの ID "${id}" はほかと重なっています`);
          campaignDefs.set(id, d);
        }
        m.info.campaigns = [...defs.keys()];
      } catch (e) {
        m.info.errors.push(`キャンペーンを外しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  const campaigns = campaignEnv && campaignDefs ? { defs: campaignDefs, env: campaignEnv, ...(campaignGenerator ? { generator: campaignGenerator } : {}) } : undefined;
  const packName = new Map(okMods.map((m) => [m.manifest.id, m.manifest.name]));
  const scenarioPack = new Map([...sourceOf].map(([sc, id]) => [sc, { id, name: packName.get(id) ?? id }]));
  return { scenarios, packs, mods, tutorials, generator, biomes, campaigns, scenarioPack };
}

/** data/ を読み込んでゲームサーバーを起動する(開発用の main.ts・本番用の prod.ts・デスクトップ版で共通) */
export function boot(o: BootOptions) {
  const { scenarios, packs, mods, tutorials, generator, biomes, campaigns, scenarioPack } = loadAll(o.dataDir, o.modsDirs);
  const server = startServer({
    port: o.port,
    scenarios,
    packs,
    defaultScenario: "bastogne-1944-12",
    defaultSide: "us",
    dataDir: o.dataDir,
    tutorials,
    biomes,
    ...(generator ? { generator } : {}),
    ...(campaigns ? { campaigns } : {}),
    ...(o.staticDir ? { staticDir: o.staticDir } : {}),
    ...(o.editor === false ? { editor: false } : {}),
    ...(o.host ? { host: o.host } : {}),
    mods: mods.map((m) => m.info),
    scenarioPack,
  });
  for (const m of mods) if (!m.info.ok) console.warn(`シナリオパック "${m.info.folder}" を外しました:\n  ${m.info.errors.join("\n  ")}`);
  return { server, scenarios, tutorials, campaigns, mods };
}
