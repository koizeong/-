import { chromium } from "playwright";
// 航空司令部を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-air.mjs [スクリーンショットの出力先]
// 航空司令部の試験 → 航空司令部の欄(飛行隊・予報)→ 予約の攻撃と即応を要請(地図を押す)→ 1ターン → 要請の結果
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
const fail = (msg) => {
  console.error("NG:", msg);
  process.exitCode = 1;
};
await page.goto("http://localhost:5173/?scenario=test-air&side=us&seed=1");
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });
const map = await page.getByTestId("map").boundingBox();
const panel = page.getByTestId("air-force-us-af");
await panel.waitFor({ timeout: 5000 });
const text = await panel.innerText();
if (!text.includes("第1戦闘機隊") || !text.includes("16機")) fail(`飛行隊が出ていない: ${text.slice(0, 200)}`);
if (!(await page.getByTestId("air-forecast-us-af").isVisible())) fail("予報が出ていない");
if (!text.includes("今出せる")) fail(`出せる機が出ていない: ${text.slice(0, 200)}`);

// 予約の攻撃:東側(敵の方)を押す
await page.getByTestId("air-request-reserve-us-af").click();
await page.mouse.click(map.x + map.width * 0.7, map.y + map.height * 0.5);
// 即応:同じあたりを押す
await page.getByTestId("air-request-oncall-us-af").click();
await page.mouse.click(map.x + map.width * 0.65, map.y + map.height * 0.5);
const hq = await page.locator("ul.hq").innerText();
if (!hq.includes("予約の攻撃") || !hq.includes("即応")) fail(`司令部コマンドに入っていない: ${hq}`);
await page.screenshot({ path: `${out}/air-orders.png` });

await page.getByTestId("end-turn").click();
await page.waitForFunction(() => document.body.innerText.includes("再生を飛ばす"), null, { timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector('[data-testid="end-turn"]')?.hasAttribute("disabled") && !document.body.innerText.includes("再生を飛ばす"), null, { timeout: 60000 });
await page.waitForTimeout(1000);
const reqs = await page.getByTestId("air-requests-us-af").innerText().catch(() => "");
if (!reqs.includes("予約の攻撃") || !reqs.includes("即応")) fail(`要請の結果が出ていない: ${reqs}`);
console.log("要請:", reqs.replace(/\n/g, " / "));
const log = await page.locator("ul.log").innerText();
console.log("出来事:", log.replace(/\n/g, " / ").slice(0, 400));
await page.screenshot({ path: `${out}/air-turn2.png` });
const errs = logs.filter((l) => l.startsWith("pageerror") || l.startsWith("error"));
if (errs.length) fail(errs.join("\n"));
console.log(process.exitCode ? "NG" : "OK");
await browser.close();
