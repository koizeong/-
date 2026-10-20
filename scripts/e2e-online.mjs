import { chromium } from "playwright";
// オンライン対戦を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-online.mjs [スクリーンショットの出力先]
// 2つのブラウザで、片方が部屋を作り、もう片方が合言葉で入り、両者がターン終了して1ターン進む。片方が切断して戻る
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const logs = [];
const open = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 820 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto("http://localhost:5173/?menu=online");
  return page;
};
const a = await open();
const b = await open();

await a.getByTestId("online-scenario").selectOption("test-symmetric");
await a.getByTestId("online-side").selectOption("us");
await a.getByTestId("online-time").selectOption("180");
await a.getByTestId("online-create").click();
const code = (await a.getByTestId("room-code").innerText()).trim();
console.log("room code:", code);
await a.screenshot({ path: `${out}/online-01-lobby.png` });

await b.getByTestId("online-code").fill(code);
await b.getByTestId("online-join").click();
await a.getByTestId("end-turn").waitFor({ timeout: 15000 });
await b.getByTestId("end-turn").waitFor({ timeout: 15000 });
console.log("A:", (await a.locator(".topbar").innerText()).replace(/\n/g, " | "));
console.log("B:", (await b.locator(".topbar").innerText()).replace(/\n/g, " | "));

// A がターン終了 → 相手を待つ。B の帯には A が「命令済み」と出る
await a.getByTestId("end-turn").click();
await a.getByTestId("waiting").waitFor({ timeout: 5000 });
await b.getByText("命令済み").waitFor({ timeout: 5000 });
console.log("B after A submitted:", await b.getByTestId("room-status").innerText());
await b.screenshot({ path: `${out}/online-02-opponent-ready.png` });
await b.getByTestId("end-turn").click();
for (const p of [a, b]) {
  await p.getByText("再生を飛ばす").waitFor({ timeout: 20000 });
  await p.getByText("再生を飛ばす").click();
  await p.getByTestId("end-turn").waitFor({ timeout: 20000 });
}
console.log("A turn 2:", (await a.locator(".topbar").innerText()).replace(/\n/g, " | "));

// B が切断(ページを閉じる)→ A の帯に「切断中」。B は開始画面の「部屋に戻る」で戻る
const bctx = b.context();
await b.close();
await a.getByText("切断中").waitFor({ timeout: 5000 });
console.log("A sees:", await a.getByTestId("room-status").innerText());
const b2 = await bctx.newPage();
await b2.goto("http://localhost:5173/?menu=online");
await b2.getByTestId(`rejoin-${code}`).click();
await b2.getByTestId("end-turn").waitFor({ timeout: 15000 });
await a.getByText("考え中").waitFor({ timeout: 5000 });
console.log("B back:", (await b2.locator(".topbar").innerText()).replace(/\n/g, " | "));
await b2.screenshot({ path: `${out}/online-03-rejoined.png` });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
