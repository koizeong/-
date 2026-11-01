// ゲームサーバー(WebSocket)とクライアント(Vite)をまとめて起動する。Ctrl+C で両方止まる
import { spawn } from "node:child_process";

// Windows では pnpm は pnpm.cmd なので、シェルを通して起動する(通さないと ENOENT / EINVAL で起動できない)
const shell = process.platform === "win32";
const procs = [
  spawn("pnpm", ["--filter", "@brigade/server", "dev"], { stdio: "inherit", shell }),
  spawn("pnpm", ["--filter", "@brigade/client", "dev"], { stdio: "inherit", shell }),
];
const stop = () => {
  for (const p of procs) p.kill("SIGINT");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => code && stop());
