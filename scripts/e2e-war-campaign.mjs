import { chromium } from "playwright";
// 戦争の戦線を戦役で戦う流れを画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-war-campaign.mjs [スクリーンショットの出力先]
// 表紙 → 戦争 → 欧州1941〜45(枢軸)→ 東部・中央「戦役で戦う」(バルバロッサ作戦)→ 戦役の画面 → (戦役が終わったことにして)「戦争へ戻る」→ 戦争の画面に結果
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("http://localhost:5173/");
await page.evaluate(() => {
  localStorage.removeItem("brigade.war.v1");
  localStorage.removeItem("brigade.war.campaign");
});
await page.getByTestId("title-war").click();
await page.getByTestId("war-europe-1941").getByTestId("war-start-ax").click();
await page.getByTestId("war-campaign-east_center").click();
// 戦役の画面(バルバロッサ作戦)が開く
await page.getByTestId("campaign-close").waitFor({ timeout: 30000 });
console.log("Campaign:", (await page.locator("h2, h3").first().innerText()).slice(0, 60));
await page.screenshot({ path: `${out}/01-campaign.png` });
// 戦役が終わったことにする(枢軸=独の限定的勝利・損耗 独1割・ソ3割)
await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem("brigade:campaigns"));
  const s = list[0].snapshot.state;
  s.result = { winner: "de", level: "limited", perSide: { de: { points: 0, lossRatio: 0, met: {}, level: "limited" }, su: { points: 0, lossRatio: 0, met: {}, level: "none" } } };
  s.lost = { de: s.forceTotals.de * 0.1, su: s.forceTotals.su * 0.3 };
  localStorage.setItem("brigade:campaigns", JSON.stringify(list));
});
await page.reload();
await page.getByTestId("war-return").click({ timeout: 30000 });
await page.getByTestId("war-board").waitFor({ timeout: 30000 });
console.log("War:", (await page.locator(".war-side").getByText("戦役の結果").locator("..").innerText()).replace(/\n/g, " | "));
await page.getByTestId("war-advance").click();
await page.waitForFunction(() => !document.querySelector('[data-testid="war-advance"]')?.hasAttribute("disabled"), null, { timeout: 15000 });
console.log("Top:", (await page.locator(".war-top").innerText()).replace(/\n/g, " "));
await page.screenshot({ path: `${out}/02-war.png` });
console.log("browser logs:", logs.join("\n") || "(none)");
await browser.close();
