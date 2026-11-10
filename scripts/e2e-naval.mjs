import { chromium } from "playwright";
// 海戦を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-naval.mjs [スクリーンショットの出力先]
// 試験の海戦 → 空母の戦隊は輪形陣 → 巡洋艦の戦隊を単横陣・全速・一斉回頭で前へ、駆逐艦を1隻切り離す → 索敵機を出す → 戦闘機を上空直衛に → 1ターン(途中で止まれば続ける) → 切り離した艦を戻す
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
// 自軍の一覧は戦隊ごとにまとまっている(艦は畳んである)
if (await page.getByTestId("unit-w-dd1").count()) fail("戦隊の艦が畳まれていない");
await page.locator('[data-testid="fleet-sq-w-cvg"] .fleet-row').click();
await page.getByTestId("squadron-controls").waitFor({ timeout: 5000 });
if (!(await page.getByTestId("naval-ring").getAttribute("class"))?.includes("on")) fail("空母の戦隊が輪形陣になっていない");

// 2. 巡洋艦の戦隊:単横陣・全速・一斉回頭にして、海を押して前へ
// 戦隊の2番艦を押すと、先導の艦(w-ca1)が選ばれる(命令は戦隊に出す)
await page.getByTestId("fleet-fold-w-crudiv").click();
await page.getByTestId("unit-w-ca2").click();
const picked = await page.getByTestId("unit-panel").innerText();
if (!picked.startsWith("ca1 ")) fail(`2番艦を押しても先導の艦が選ばれない: ${picked.slice(0, 120)}`);
await page.getByTestId("naval-line_abreast").click();
await page.getByTestId("sea-speed-flank").click();
await page.getByTestId("sea-turn-together").click();
await page.mouse.click(map.x + map.width * 0.35, map.y + map.height * 0.5);
// 駆逐艦 dd8 を切り離す
await page.getByTestId("sea-detach-w-dd8").click();

// 3. 索敵機:海を押して索敵
await page.getByTestId("unit-w-vs").click();
await page.getByTestId("air-controls").waitFor({ timeout: 5000 });
await page.mouse.click(map.x + map.width * 0.85, map.y + map.height * 0.5);
const note = await page.getByTestId("air-controls").innerText();
if (!note.includes("索敵")) fail(`索敵の命令が出ていない: ${note}`);

// 4. 戦闘機:空母の戦隊の上空直衛
await page.getByTestId("unit-w-vf").click();
// 直衛は戦隊・任務部隊の上に出せる。半分の機数だけ出す
await page.getByTestId("air-send").fill("6");
await page.getByTestId("cap-w-cvg").click();
const cap = await page.getByTestId("air-plan").innerText();
if (!cap.includes("6機を分けて") || !cap.includes("帰着")) fail(`直衛の見込みが出ていない: ${cap}`);
await page.screenshot({ path: `${out}/naval-orders.png` });

// 5. 1ターン進める(海戦のターンは出来事で途中で止まる。止まれば命令はそのままで続ける)
for (let i = 0; i < 6; i++) {
  await page.getByTestId("end-turn").click();
  await page.waitForFunction(() => document.body.innerText.includes("再生を飛ばす"), null, { timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-testid="end-turn"]')?.hasAttribute("disabled") && !document.body.innerText.includes("再生を飛ばす"), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const top = await page.locator("header.topbar").innerText();
  if (top.includes("ターン 2")) break;
  console.log("途中で止まった:", top.replace(/\n/g, " ").slice(0, 160));
}
await page.getByTestId("unit-w-vs").click();
const vs = await page.getByTestId("unit-panel").innerText();
console.log("索敵機:", vs.split("\n").slice(0, 3).join(" / "));
await page.locator('[data-testid="fleet-sq-w-crudiv"] .fleet-row').click();
const ca = await page.getByTestId("unit-panel").innerText();
if (!ca.includes("単横陣")) fail(`巡洋艦の戦隊が単横陣になっていない: ${ca.slice(0, 200)}`);
await page.screenshot({ path: `${out}/naval-turn2.png` });
// 切り離した dd8:押すと dd8 の1隻の戦隊が選ばれ、「元の戦隊に戻す」が出る
await page.locator('[data-testid="fleet-sq-w-dd8"] .fleet-row').click();
await page.getByTestId("sea-rejoin").click();
const errs = logs.filter((l) => l.startsWith("pageerror") || l.startsWith("error"));
if (errs.length) fail(errs.join("\n"));
console.log(process.exitCode ? "NG" : "OK");
await browser.close();
