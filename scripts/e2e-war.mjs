import { chromium } from "playwright";
// 戦争モードを画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-war.mjs [スクリーンショットの出力先]
// 表紙 → 戦争 → 欧州1941〜45(枢軸)→ 東部・中央を攻勢・歩兵軍団を注文 → 月を進める → 報告 → 3か月進める → できた歩兵軍団を予備から東部・中央へ送る → 1か月 →(長砲身のIV号を研究したことにして)装甲軍団を設計する → 1か月
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("http://localhost:5173/");
await page.evaluate(() => localStorage.removeItem("brigade.war.v1"));
await page.getByTestId("title-war").click();
await page.getByTestId("war-europe-1941").waitFor({ timeout: 15000 });
await page.getByTestId("war-europe-1941").getByTestId("war-start-ax").click();
await page.getByTestId("war-board").waitFor({ timeout: 15000 });
await page.getByTestId("war-map").waitFor();
await page.screenshot({ path: `${out}/01-start.png` });
await page.getByTestId("posture-east_center-attack").click();
await page.getByTestId("produce-ax_inf41").click();
await page.getByTestId("war-advance").click();
await page.getByTestId("war-log").waitFor({ timeout: 15000 });
console.log("Log:", (await page.getByTestId("war-log").innerText()).replace(/\n/g, " | "));
for (let i = 0; i < 3; i++) {
  await page.getByTestId("war-advance").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="war-advance"]')?.hasAttribute("disabled"), null, { timeout: 15000 });
}
const row = page.getByTestId("units-reserve-ax_inf41");
await row.waitFor({ timeout: 5000 });
await row.locator("select").selectOption("east_center");
await page.getByTestId("war-advance").click();
await page.waitForFunction(() => !document.querySelector('[data-testid="war-advance"]')?.hasAttribute("disabled"), null, { timeout: 15000 });
console.log("Moving:", await page.locator(".war-side").getByText("移動中").innerText().catch(() => "(なし)"));
// 設計:長砲身のIV号を研究したことにして、装甲軍団の質を上げた型を設計する
await page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem("brigade.war.v1"));
  w.state.research.ax.done.push("ax_t_longpz");
  localStorage.setItem("brigade.war.v1", JSON.stringify(w));
});
await page.reload();
await page.getByTestId("title-war").click().catch(() => {});
await page.getByTestId("war-design").waitFor({ timeout: 15000 });
await page.getByTestId("design-quality").fill("0.1");
await page.waitForTimeout(500);
console.log("Design:", (await page.getByTestId("war-design").innerText()).replace(/\n/g, " | "));
await page.getByTestId("design-order").click();
await page.getByTestId("war-advance").click();
await page.waitForFunction(() => !document.querySelector('[data-testid="war-advance"]')?.hasAttribute("disabled"), null, { timeout: 15000 });
console.log("Designs:", await page.getByTestId("war-design").getByText("設計した型").innerText());
console.log("Top:", (await page.locator(".war-top").innerText()).replace(/\n/g, " "));
await page.screenshot({ path: `${out}/02-after.png` });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
