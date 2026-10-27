import { chromium } from "playwright";
// 自動生成のキャンペーンを画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-campaign-gen.mjs [スクリーンショットの出力先]
// 表紙 → キャンペーン → 作戦を作る(小・汎用・シード)→ 作り直す → 青軍で始める → 全部の師団・旅団を前へ → 確定 → 次の段階へ(2回)
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && logs.push(m.text()));
page.on("dialog", (d) => d.accept());

await page.goto("http://localhost:5173/?menu=campaign");
await page.evaluate(() => sessionStorage.clear());
await page.getByTestId("gencamp-size").selectOption("s");
await page.getByTestId("gencamp-seed").fill("2024");
await page.getByTestId("gencamp-map").waitFor({ timeout: 15000 });
await page.getByTestId("gencamp-reroll").click();
await page.getByTestId("gencamp-map").waitFor({ timeout: 15000 });
await page.screenshot({ path: `${out}/gencamp-01-select.png`, fullPage: true });
await page.getByTestId("gencamp-start-blue").click();
await page.getByTestId("campaign-map").waitFor({ timeout: 15000 });
for (let stage = 0; stage < 2; stage++) {
  // どの師団・旅団も、選べる先の最後(東寄り)へ
  for (const sel of await page.locator('[data-testid^="campaign-order-"]').all()) {
    const n = await sel.locator("option").count();
    await sel.selectOption({ index: n - 1 });
  }
  if (stage === 0) await page.screenshot({ path: `${out}/gencamp-02-orders.png`, fullPage: true });
  await page.getByTestId("campaign-commit").click();
  await page.getByTestId("campaign-advance").click();
  await page.getByText(`第${stage + 1}段階の結果`).waitFor({ timeout: 120000 });
  console.log(`stage ${stage + 1}:`, (await page.getByTestId("campaign-report").innerText()).replace(/\n/g, " | "));
}
console.log("head:", (await page.locator(".campaign-head").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/gencamp-03-stage3.png`, fullPage: true });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
