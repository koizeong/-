import { chromium } from "playwright";
// 配属を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-attach.mjs [スクリーンショットの出力先]
// 作戦の選択(左右対称の試験)→ 米軍で → 機甲の戦車中隊を歩兵連隊に配属 → 出撃 → 地図の配属の印とユニットの欄の内訳 → 1ターン
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));

await page.goto("http://localhost:5173/?menu=scenarios");
await page.getByTestId("scenario-test-symmetric").click();
await page.getByTestId("play-test-symmetric-us").click();
await page.getByTestId("attach-us-arm-0").waitFor({ timeout: 15000 });
await page.getByTestId("attach-us-arm-0").selectOption("us-inf1");
await page.screenshot({ path: `${out}/attach-01-briefing.png`, fullPage: true });
await page.getByTestId("custom-go").click();
await page.getByTestId("end-turn").waitFor({ timeout: 20000 });
// 歩兵連隊を選ぶ(ユニットの一覧から)
await page.getByText("inf1", { exact: false }).first().click();
const att = page.getByTestId("unit-attachments");
await att.waitFor({ timeout: 10000 });
console.log("unit panel:", (await att.innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/attach-02-map.png` });
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").click({ timeout: 30000 });
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
await page.getByText("inf1", { exact: false }).first().click();
console.log("after 1 turn:", (await att.innerText()).replace(/\n/g, " | "));
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
