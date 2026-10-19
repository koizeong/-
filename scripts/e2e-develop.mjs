import { chromium } from "playwright";
// 装備編成を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-develop.mjs [スクリーンショットの出力先]
// 武器を開発し、それを載せた連隊テンプレートを作り、開始画面で部隊を差し替えて始め、1ターン進める。おまかせ編成(AIの陣営も)で始めて1ターン進める
import { mkdirSync } from "node:fs";
const out = process.argv[2] ?? "test-results";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
page.on("dialog", (d) => d.accept());

await page.goto("http://localhost:5173/develop.html?scenario=test-symmetric");
await page.getByTestId("dev-new-weapon").waitFor({ timeout: 15000 });
// 武器:機関銃の型で発射速度を上げる
await page.getByTestId("dev-new-weapon").click();
await page.getByTestId("dev-design-form").locator("select").selectOption("machine_gun");
await page.getByTestId("dev-param-rateRpm").fill("1000");
console.log("weapon cost:", await page.getByTestId("dev-weapon-cost").innerText());
await page.screenshot({ path: `${out}/dev-01-weapon.png` });
// テンプレート:歩兵連隊を元に、小銃中隊の機関銃を開発した機関銃に替え、中隊を1つ減らす
await page.getByRole("button", { name: "テンプレート" }).click();
await page.getByTestId("dev-new-template").click();
const form = page.getByTestId("dev-template-form");
await form.locator("select").first().selectOption("infantry_regiment");
await form.getByRole("button", { name: "要素を元の編成表に戻す" }).click();
const mgSelect = form.locator("table.elements tbody tr").first().locator(".wref select").nth(1);
const userOpt = await mgSelect.locator("option", { hasText: "★" }).first().getAttribute("value");
await mgSelect.selectOption(userOpt);
// 点数の上限(元の点数の合計)に収まるよう、小銃中隊を1つ減らす
await form.locator("table.elements tbody tr").first().locator('input[type="number"]').first().fill("8");
console.log("template stats:", (await page.getByTestId("dev-template-stats").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/dev-02-template.png` });

// 開始画面:装備編成して始める
await page.goto("http://localhost:5173/");
await page.getByTestId("custom-test-symmetric-us").click();
await page.getByTestId("sub-us-inf1").waitFor({ timeout: 10000 });
const opt = await page.getByTestId("sub-us-inf1").locator("option", { hasText: "★" }).first().getAttribute("value");
await page.getByTestId("sub-us-inf1").selectOption(opt);
console.log("budget:", await page.getByTestId("custom-budget").innerText());
await page.screenshot({ path: `${out}/dev-03-start.png` });
await page.getByTestId("custom-go").click();
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });
await page.getByTestId("unit-us-inf1").click();
console.log("unit panel:", (await page.locator("aside").innerText()).slice(0, 300).replace(/\n/g, " | "));
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").waitFor({ timeout: 20000 });
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
console.log("Topbar:", (await page.locator(".topbar").innerText()).replace(/\n/g, " | "));
await page.screenshot({ path: `${out}/dev-04-turn2.png` });
// おまかせ編成:方針を選んで組み、AIの陣営もおまかせにして始める
await page.goto("http://localhost:5173/");
await page.getByTestId("custom-test-symmetric-us").click();
await page.getByTestId("auto-style").selectOption("antitank");
await page.getByTestId("auto-compose").click();
console.log("auto budget:", await page.getByTestId("custom-budget").innerText());
console.log("auto subs:", await page.getByTestId("sub-us-inf1").inputValue(), await page.getByTestId("sub-us-arm").inputValue());
await page.getByTestId("ai-auto").selectOption("balanced");
await page.screenshot({ path: `${out}/dev-05-auto.png` });
await page.getByTestId("custom-go").click();
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").waitFor({ timeout: 20000 });
await page.getByTestId("end-turn").waitFor({ timeout: 30000 });
console.log("auto Topbar:", (await page.locator(".topbar").innerText()).replace(/\n/g, " | "));
console.log("browser logs:", logs.filter((l) => !l.includes("[vite]")).join("\n") || "(none)");
await browser.close();
