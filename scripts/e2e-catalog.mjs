import { chromium } from "playwright";
// 装備と編制(図鑑)を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-catalog.mjs [スクリーンショットの出力先]
// 表紙 → 装備と編制 → ドイツ軍の編制(1939年の歩兵連隊の線図)→ 装備を押して札 → 時期で絞る → 作戦命令の戦闘序列から線図を開く
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const fail = (msg) => {
  console.error("NG:", msg);
  process.exitCode = 1;
};
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));

await page.goto("http://localhost:5173/");
await page.getByTestId("title-catalog").click();
await page.getByTestId("catalog-nation-de").click();
await page.getByTestId("catalog-toe-de-ir-1939").click();
await page.getByTestId("orgchart").waitFor({ timeout: 10000 });
await page.screenshot({ path: `${out}/catalog-01-ir1939.png`, fullPage: true });
await page.getByTestId("catalog-toe-de-panther-abt-1944").click();
await page.screenshot({ path: `${out}/catalog-02-panther.png`, fullPage: true });
// 線図の装備を押すと装備品の札
await page.locator(".org-totals .chips li.link").first().click();
await page.getByTestId("equipment-card").waitFor({ timeout: 10000 });
console.log("card:", (await page.getByTestId("equipment-card").innerText()).replace(/\n/g, " | ").slice(0, 300));
await page.screenshot({ path: `${out}/catalog-03-card.png`, fullPage: true });
await page.getByTestId("catalog-era").selectOption("1940");
console.log("1939-41 items:", await page.locator('[data-testid^="catalog-item-"]').count());
// 艦艇:日本軍の艦級の一覧から金剛型の札を開く
await page.getByTestId("catalog-era").selectOption("all");
await page.getByTestId("catalog-nation-jp").click();
await page.getByTestId("catalog-mode-ships").click();
await page.getByTestId("catalog-ship-jp-bb-kongo").click();
const ship = await page.getByTestId("ship-card").innerText();
console.log("ship:", ship.replace(/\n/g, " | ").slice(0, 300));
if (!ship.includes("金剛") || !ship.includes("ノット")) fail("艦艇の札が出ない");
await page.getByTestId("ship-card").screenshot({ path: `${out}/catalog-05-ship.png` });
// 作戦命令の戦闘序列から線図を開く
await page.goto("http://localhost:5173/?menu=scenarios");
await page.getByTestId("scenario-test-symmetric").click();
await page.getByTestId("play-test-symmetric-us").click();
await page.getByTestId("oob-us-inf1").click();
await page.getByTestId("org-modal").waitFor({ timeout: 10000 });
await page.screenshot({ path: `${out}/catalog-04-briefing-modal.png` });
await page.getByTestId("org-modal-close").click();
await browser.close();
console.log("browser logs:", logs.join("\n") || "(none)");
