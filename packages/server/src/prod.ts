import { fileURLToPath } from "node:url";
import { boot } from "./boot.js";

/**
 * 本番用の起動:ビルド済みの画面(packages/client/dist。先に pnpm build)も同じポートで配る。編成エディターの保存の口は開かない。
 *   pnpm build && pnpm start   → http://localhost:8787
 * 環境変数:PORT(既定 8787)・HOST(既定はすべて)・DATA_DIR・STATIC_DIR
 */
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
const staticDir = process.env.STATIC_DIR ?? fileURLToPath(new URL("../../client/dist/", import.meta.url));
const port = Number(process.env.PORT ?? 8787);
boot({ dataDir, port, staticDir, editor: false, ...(process.env.HOST ? { host: process.env.HOST } : {}) });
console.log(`ゲームを起動しました: http://localhost:${port}`);
