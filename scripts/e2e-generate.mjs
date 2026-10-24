import { chromium } from "playwright";
// 戦場を作る(自動生成)を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-generate.mjs [スクリーンショットの出力先]
// 表紙 → 戦場を作る → 任務・地形を選ぶ → 作り直す → 陣営を選ぶ → 作戦命令 → 出撃 → 2ターン進める
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));

await page.goto("http://localhost:5173/");
await page.getByTestId("title-generate").click();
await page.getByTestId("gen-mission").selectOption(process.env.MISSION ?? "attack-defense");
await page.getByTestId("gen-biome").selectOption("ardennes-winter");
await page.getByTestId("gen-seed").fill("1234");
await page.locator("canvas.map-thumb").waitFor({ timeout: 15000 });
await page.getByTestId("gen-reroll").click();
await page.locator("canvas.map-thumb").waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/gen-01-select.png`, fullPage: true });
const first = page.locator('[data-testid^="gen-play-"]').first();
console.log("side:", await first.getAttribute("data-testid"));
await first.click();
await page.locator("canvas.map-thumb").waitFor({ timeout: 10000 });
await page.screenshot({ path: `${out}/gen-02-briefing.png`, fullPage: true });
await page.getByTestId("custom-go").click();
await page.getByTestId("end-turn").waitFor({ timeout: 20000 });
for (let i = 0; i < 2; i++) {
  await page.getByTestId("end-turn").click();
  await page.getByText("再生を飛ばす").click({ timeout: 30000 });
  await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
}
console.log("topbar:", (await page.locator(".topbar").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/gen-03-turn3.png` });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
