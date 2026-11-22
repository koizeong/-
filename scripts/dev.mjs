// ゲームサーバー(WebSocket)とクライアント(Vite)をまとめて起動する。Ctrl+C で両方止まる
import { execSync, spawn } from "node:child_process";
import { connect } from "node:net";

const PORT = Number(process.env.PORT ?? 8787);
const win = process.platform === "win32";

/** 番号がもう使われているか(前に起動したサーバーが裏に残っていると、新しいサーバーが起動できず、画面の問い合わせが古いほうへ行って返事が来ない) */
const inUse = (port) =>
  new Promise((resolve) => {
    const s = connect({ port, host: "127.0.0.1" });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.setTimeout(1500, () => (s.destroy(), resolve(false)));
  });

if (await inUse(PORT)) {
  console.error(`\n番号 ${PORT} はもう使われています。前に起動したゲームサーバーが裏に残っているかもしれません。`);
  if (win) {
    let pids = "";
    try {
      pids = [...new Set(execSync(`netstat -ano -p tcp`, { encoding: "utf8" }).split(/\r?\n/).filter((l) => l.includes(`:${PORT} `) && /LISTENING/i.test(l)).map((l) => l.trim().split(/\s+/).pop()))].join(" ");
    } catch {}
    console.error(`止めるには(PowerShell かコマンドプロンプトで): ${pids ? pids.split(" ").map((p) => `taskkill /F /T /PID ${p}`).join(" & ") : `netstat -ano | findstr :${PORT} で番号を使っているプロセスの PID を調べ、taskkill /F /T /PID <PID>`}`);
  } else console.error(`止めるには: lsof -ti tcp:${PORT} | xargs kill`);
  console.error("止めてから、もう一度 pnpm dev を起動してください。\n");
  process.exit(1);
}

// Windows では pnpm は pnpm.cmd なので、シェルを通して起動する(通さないと ENOENT / EINVAL で起動できない)
const procs = [
  // Windows 以外は子を自分のプロセスグループにして、止めるときにグループごと止める(pnpm の下の tsx・vite が残らないように)
  spawn("pnpm", ["--filter", "@brigade/server", "dev"], { stdio: "inherit", shell: win, detached: !win }),
  spawn("pnpm", ["--filter", "@brigade/client", "dev"], { stdio: "inherit", shell: win, detached: !win }),
];
const stop = () => {
  for (const p of procs) {
    // Windows ではシェルを止めても、その下の node(ゲームサーバー)が残って番号をつかんだままになるので、木ごと止める
    if (win && p.pid) {
      try {
        execSync(`taskkill /F /T /PID ${p.pid}`, { stdio: "ignore" });
      } catch {}
    } else if (p.pid) {
      try {
        process.kill(-p.pid, "SIGINT");
      } catch {}
    }
  }
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => code && stop());
