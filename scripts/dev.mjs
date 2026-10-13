// ゲームサーバー(WebSocket)とクライアント(Vite)をまとめて起動する。Ctrl+C で両方止まる
import { spawn } from "node:child_process";

const procs = [
  spawn("pnpm", ["--filter", "@brigade/server", "dev"], { stdio: "inherit" }),
  spawn("pnpm", ["--filter", "@brigade/client", "dev"], { stdio: "inherit" }),
];
const stop = () => {
  for (const p of procs) p.kill("SIGINT");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => code && stop());
