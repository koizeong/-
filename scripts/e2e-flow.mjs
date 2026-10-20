import { chromium } from "playwright";
// ゲームの流れを画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-flow.mjs [スクリーンショットの出力先]
// 表紙 → 作戦の選択 → 部隊編成(作戦命令)→ 出撃 → 最後のターンまで進める → 結果の画面(戦闘詳報)→ 作戦の選択へ戻る
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));

await page.goto("http://localhost:5173/");
await page.getByTestId("title-new").click();
await page.getByTestId("scenario-test-symmetric").click();
await page.getByTestId("play-test-symmetric-us").click();
await page.locator("canvas.map-thumb").waitFor({ timeout: 10000 });
await page.screenshot({ path: `${out}/flow-01-briefing.png`, fullPage: true });
await page.getByTestId("custom-go").click();
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });

// 命令を出さずに最後のターンまで進める(AI 同士のようなもの。再生は飛ばす)
for (let i = 0; i < 40; i++) {
  if (await page.getByTestId("result-screen").isVisible()) break;
  await page.getByTestId("end-turn").click();
  await page.getByText("再生を飛ばす").click({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="result-screen"]') || !document.querySelector('[data-testid="end-turn"]')?.hasAttribute("disabled"), null, { timeout: 30000 });
}
await page.getByTestId("result-screen").waitFor({ timeout: 30000 });
console.log("verdict:", await page.getByTestId("verdict").innerText());
console.log("result:", (await page.getByTestId("result-screen").innerText()).slice(0, 400).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/flow-02-result.png`, fullPage: true });
// 地図を見る → 開き直す
await page.getByTestId("result-map").click();
await page.getByTestId("reopen-result").click();
await page.getByTestId("result-to-scenarios").click();
await page.getByTestId("scenario-test-symmetric").waitFor({ timeout: 10000 });
console.log("back to scenarios: ok");
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
