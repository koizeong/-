// デスクトップ版の中身(app/)を作る:画面をビルドし、ゲームサーバーを1つのファイルにまとめ、data/ を写す。
//   cd desktop && npm install && npm run dist:win
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = fileURLToPath(new URL("./app/", import.meta.url));
rmSync(app, { recursive: true, force: true });
mkdirSync(app, { recursive: true });

// 1. 画面(packages/client/dist。編成エディターは入らない)
execSync("pnpm build", { cwd: root, stdio: "inherit" });
cpSync(`${root}packages/client/dist`, `${app}web`, { recursive: true });

// 2. ゲームサーバー(ワークスペースのパッケージごと1つの ESM に。ws の任意の部品は使わない)
await build({
  entryPoints: [`${root}packages/server/src/boot.ts`],
  outfile: `${app}server.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["bufferutil", "utf-8-validate"],
  // まとめた CommonJS の部品が require を使えるように
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
  logLevel: "warning",
});

// 3. データ(シナリオ・編成表・武器・キャンペーン・手引き)
cpSync(`${root}data`, `${app}data`, { recursive: true });
console.log("app/ を作りました");
