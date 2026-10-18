import { chromium } from "playwright";
// 画面を通した動作確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-smoke.mjs [スクリーンショットの出力先]
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("http://localhost:5173/?scenario=bastogne-1944-12&side=us&seed=1");
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/01-start.png` });
const cp = async () => (await page.locator(".topbar").innerText()).match(/指揮ポイント (\d+) \/ (\S+)/)?.slice(1).join("/");
console.log("CP before:", await cp());
await page.getByTestId("unit-us-501-pir").click();
const box = await page.getByTestId("map").boundingBox();
// 地図の中央より右(東)を押して、少しドラッグして向きを決める
const x = box.x + box.width * 0.62, y = box.y + box.height * 0.5;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 40, y, { steps: 5 });
await page.mouse.up();
console.log("CP after order:", await cp());
// 経路の見積もり(地図の経路と、ユニットの欄の要約)
await page.getByTestId("route-preview").waitFor({ timeout: 5000 });
console.log("Preview:", (await page.getByTestId("route-preview").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/02-order.png` });
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").waitFor({ timeout: 20000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/03-replay.png` });
await page.getByTestId("end-turn").waitFor({ timeout: 20000 });
console.log("Topbar:", (await page.locator(".topbar").innerText()).replace(/\n/g, " | "));
console.log("Log:", (await page.locator(".log").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/04-turn2.png` });
console.log("browser logs:", logs.filter((l) => !l.includes("[vite]")).join("\n") || "(none)");
await browser.close();
