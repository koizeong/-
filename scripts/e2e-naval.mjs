import { chromium } from "playwright";
// 海戦を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-naval.mjs [スクリーンショットの出力先]
// 試験の海戦 → 空母の戦隊を輪形陣に → 巡洋艦の戦隊を単横陣で前へ → 索敵機を出す → 戦闘機を上空直衛に → 1ターン → 索敵機が帰る
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
const fail = (msg) => {
  console.error("NG:", msg);
  process.exitCode = 1;
};
await page.goto("http://localhost:5173/?scenario=test-naval&side=w&seed=1");
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });
const map = await page.getByTestId("map").boundingBox();

// 1. 空母の戦隊:輪形陣(はじめから輪形陣)を確かめる
await page.getByTestId("unit-w-cv").click();
await page.getByTestId("ship-controls").waitFor({ timeout: 5000 });
if (!(await page.getByTestId("naval-ring").getAttribute("class"))?.includes("on")) fail("空母の戦隊が輪形陣になっていない");

// 2. 巡洋艦の戦隊:単横陣にして、海を押して前へ
// 戦隊の2番艦を押すと、旗艦(w-ca1)が選ばれる(命令は旗艦に出し、ほかの艦は持ち場につく)
await page.getByTestId("unit-w-ca2").click();
const picked = await page.getByTestId("unit-panel").innerText();
if (!picked.startsWith("ca1 ")) fail(`2番艦を押しても旗艦が選ばれない: ${picked.slice(0, 120)}`);
await page.getByTestId("naval-line_abreast").click();
await page.mouse.click(map.x + map.width * 0.35, map.y + map.height * 0.5);

// 3. 索敵機:海を押して索敵
await page.getByTestId("unit-w-vs").click();
await page.getByTestId("air-controls").waitFor({ timeout: 5000 });
await page.mouse.click(map.x + map.width * 0.85, map.y + map.height * 0.5);
const note = await page.getByTestId("air-controls").innerText();
if (!note.includes("索敵")) fail(`索敵の命令が出ていない: ${note}`);

// 4. 戦闘機:母艦の上空直衛
await page.getByTestId("unit-w-vf").click();
await page.getByTestId("cap-w-cv").click();
await page.screenshot({ path: `${out}/naval-orders.png` });

// 5. 1ターン進める
await page.getByTestId("end-turn").click();
await page.waitForFunction(() => document.body.innerText.includes("ターン 2"), null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.getByTestId("unit-w-vs").click();
const vs = await page.getByTestId("unit-panel").innerText();
console.log("索敵機:", vs.split("\n").slice(0, 3).join(" / "));
await page.getByTestId("unit-w-ca1").click();
const ca = await page.getByTestId("unit-panel").innerText();
if (!ca.includes("単横陣")) fail(`巡洋艦の戦隊が単横陣になっていない: ${ca.slice(0, 200)}`);
await page.screenshot({ path: `${out}/naval-turn2.png` });
const errs = logs.filter((l) => l.startsWith("pageerror") || l.startsWith("error"));
if (errs.length) fail(errs.join("\n"));
console.log(process.exitCode ? "NG" : "OK");
await browser.close();
