import { chromium } from "playwright";
// まとめた命令を画面で通す確認。先に pnpm dev で起動しておく。使い方: node scripts/e2e-group.mjs [スクリーンショットの出力先]
// 上級部隊から隷下をまとめて選ぶ → 地図を押して横一列の目的地 → 指揮ポイントが1つ → Shift+クリックで外す → 範囲選択 → 1ターン
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
await page.goto("http://localhost:5173/?scenario=bastogne-1944-12&side=us&seed=1");
await page.getByTestId("end-turn").waitFor({ timeout: 15000 });
const cp = async () => Number((await page.getByTestId("command-points").innerText()).match(/指揮ポイント (\d+)/)?.[1]);

// 1. 上級部隊(第101空挺師団)から隷下をまとめて選ぶ
await page.getByTestId("formation-us-101abn").click();
await page.getByTestId("group-panel").waitFor({ timeout: 5000 });
const title = await page.locator("[data-testid=group-panel] h3").innerText();
console.log("Group:", title);
if (!title.includes("第101空挺師団")) fail("上級部隊の名前が出ていない");

// 2. 地図を押して、少しドラッグして正面の向きを決める
const box = await page.getByTestId("map").boundingBox();
const x = box.x + box.width * 0.6, y = box.y + box.height * 0.45;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 50, y - 10, { steps: 5 });
await page.mouse.up();
const used = await cp();
console.log("CP after group order:", used);
if (used !== 1) fail(`上級部隊のまとめた命令は指揮ポイント1つのはず(${used})`);
const marked = await page.locator("[data-testid=group-panel] li", { hasText: "●" }).count();
console.log("Units with orders:", marked);
if (marked < 3) fail("隷下の部隊に命令が入っていない");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/group-01-order.png` });

// 3. 範囲選択(選択を解いてから Shift+ドラッグ)は、上級部隊から選んでいないので部隊ごとに数える
await page.getByText("選択を解く").click();
const a = { x: box.x + 10, y: box.y + 10 };
await page.keyboard.down("Shift");
await page.mouse.move(a.x, a.y);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10, { steps: 8 });
await page.mouse.up();
await page.keyboard.up("Shift");
const boxed = await page.locator("[data-testid=group-panel] h3").innerText().catch(() => "");
console.log("Box selection:", boxed);
if (!boxed.includes("まとめて選んだ部隊")) fail("範囲選択でまとめて選べていない");
await page.screenshot({ path: `${out}/group-02-box.png` });
await page.getByText("選択を解く").click();

// 4. 1ターン進める(弾かれた命令がない)
await page.getByTestId("end-turn").click();
await page.getByText("再生を飛ばす").waitFor({ timeout: 20000 });
await page.getByText("再生を飛ばす").click();
await page.getByTestId("end-turn").waitFor({ timeout: 20000 });
const log = await page.locator(".log").innerText();
if (log.includes("弾かれ") || log.includes("指揮ポイントが足りません")) fail("命令が弾かれた: " + log.slice(0, 300));
await page.screenshot({ path: `${out}/group-03-turn2.png` });
console.log("browser logs:", logs.filter((l) => !l.includes("[vite]")).join("\n") || "(none)");
console.log(process.exitCode ? "FAILED" : "OK");
await browser.close();
