import { chromium } from "playwright";
// キャンペーンを画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-campaign.mjs [スクリーンショットの出力先]
// 表紙 → キャンペーン → 青軍で始める → 命令(第1歩兵師団を渡河点へ)→ 確定 → 戦闘を指揮 → 1ターン → 作戦地図へ → 残りを AI に任せて次の段階へ
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));
page.on("dialog", (d) => d.accept());

await page.goto("http://localhost:5173/");
await page.evaluate(() => localStorage.removeItem("brigade:campaigns"));
await page.getByTestId("title-campaign").click();
await page.getByText("詳しい設定").click();
await page.locator(".campaigns .seed input").fill("5");
await page.getByTestId("campaign-start-exercise-river-blue").click();
await page.getByTestId("campaign-map").waitFor({ timeout: 15000 });
// 札を選んで地図の地域を押す
await page.getByTestId("campaign-chip-blue-1div").click();
await page.getByTestId("campaign-region-crossing").click();
await page.screenshot({ path: `${out}/camp-01-orders.png`, fullPage: true });
await page.getByTestId("campaign-commit").click();
const play = page.locator('[data-testid^="campaign-play-"]').first();
await play.waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/camp-02-plan.png`, fullPage: true });
console.log("battle:", await play.getAttribute("data-testid"));
await play.click();
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").click({ timeout: 30000 });
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
await page.screenshot({ path: `${out}/camp-03-battle.png` });
await page.getByTestId("to-menu").click();
await page.getByTestId("campaign-map").waitFor({ timeout: 15000 });
console.log("resume button:", await page.locator('[data-testid^="campaign-play-"]').first().innerText());
await page.getByTestId("campaign-advance").click();
await page.getByTestId("campaign-report").waitFor({ timeout: 60000 });
console.log("report:", (await page.getByTestId("campaign-report").innerText()).replace(/\n/g, " | "));
console.log("head:", (await page.locator(".campaign-head").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/camp-04-stage2.png`, fullPage: true });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
