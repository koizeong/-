import { loadBiomes, loadDataDir, loadTutorials } from "./data.js";
import { loadGeneratorData } from "./generate.js";
import { loadCampaignGenerator, loadCampaigns } from "./campaign.js";
import { startServer } from "./server.js";

export interface BootOptions {
  /** data/ のディレクトリ */
  dataDir: string;
  port: number;
  /** ビルド済みの画面のディレクトリ(本番用の起動・デスクトップ版) */
  staticDir?: string;
  /** 編成エディターの HTTP の口を開くか(省略は開く) */
  editor?: boolean;
  host?: string;
}

/** data/ を読み込んでゲームサーバーを起動する(開発用の main.ts・本番用の prod.ts・デスクトップ版で共通) */
export function boot(o: BootOptions) {
  const { scenarios, packs } = loadDataDir(o.dataDir);
  const tutorials = loadTutorials(o.dataDir, scenarios);
  const generator = loadGeneratorData(o.dataDir);
  const biomes = loadBiomes(o.dataDir);
  const campaignEnv = generator ? { packs, generator, biomes } : null;
  const campaignGenerator = loadCampaignGenerator(o.dataDir);
  const campaigns = campaignEnv ? { defs: loadCampaigns(o.dataDir, campaignEnv), env: campaignEnv, ...(campaignGenerator ? { generator: campaignGenerator } : {}) } : undefined;
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
  });
  return { server, scenarios, tutorials, campaigns };
}
