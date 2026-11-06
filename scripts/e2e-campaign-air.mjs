import { chromium } from "playwright";
// キャンペーンの航空隊と艦隊を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-campaign-air.mjs [スクリーンショットの出力先]
// 表紙 → キャンペーン → 演習:海峡(青軍)→ 艦隊を海峡へ・第1歩兵師団を渡河点へ → 確定 → 航空の命令(攻撃航空団を海峡の戦闘へ)→ 確定
// → 海峡の海戦を指揮 → 1ターン → 作戦地図へ → 残りを AI に任せて次の段階へ(段階の結果に航空の記録)
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
await page.getByTestId("campaign-start-exercise-strait-blue").click();
await page.getByTestId("campaign-map").waitFor({ timeout: 15000 });
await page.getByTestId("campaign-chip-blue-fleet").click();
await page.getByTestId("campaign-region-mid-sea").click();
await page.getByTestId("campaign-order-blue-1div").selectOption("crossing");
await page.screenshot({ path: `${out}/campair-01-orders.png`, fullPage: true });
await page.getByTestId("campaign-commit").click();
await page.getByTestId("campaign-air").waitFor({ timeout: 15000 });
await page.getByTestId("campaign-air-mission-blue-sw").selectOption("battle");
await page.getByTestId("campaign-air-region-blue-sw").selectOption("mid-sea");
await page.screenshot({ path: `${out}/campair-02-air.png`, fullPage: true });
await page.getByTestId("campaign-air-commit").click();
const play = page.getByTestId("campaign-play-s1-mid-sea");
await play.waitFor({ timeout: 15000 });
console.log("battle air:", await page.getByTestId("campaign-battle-air-s1-mid-sea").innerText());
await page.screenshot({ path: `${out}/campair-03-plan.png`, fullPage: true });
await play.click();
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
await page.screenshot({ path: `${out}/campair-04-naval.png` });
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").click({ timeout: 30000 });
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
await page.getByTestId("to-menu").click();
await page.getByTestId("campaign-map").waitFor({ timeout: 15000 });
await page.getByTestId("campaign-advance").click();
await page.getByTestId("campaign-report").waitFor({ timeout: 90000 });
console.log("report:", (await page.getByTestId("campaign-report").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/campair-05-stage2.png`, fullPage: true });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
