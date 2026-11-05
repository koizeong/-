import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "./boot.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const port = Number(process.env.PORT ?? 8787);
// シナリオパック:リポジトリの mods/ と、環境変数 MODS_DIR(区切りは Windows では ; ・ほかでは :)
const modsDirs = [fileURLToPath(new URL("../../../mods/", import.meta.url)), ...(process.env.MODS_DIR ?? "").split(delimiter).filter(Boolean)];
const { scenarios, tutorials, campaigns, mods } = boot({ dataDir, port, modsDirs });
console.log(`サーバー起動: ws://localhost:${port}(編成エディターの口 http://localhost:${port}/api/packs)  シナリオ: ${[...scenarios.keys()].join(", ")}  手引き: ${tutorials.map((t) => t.id).join(", ") || "なし"}  キャンペーン: ${[...(campaigns?.defs.keys() ?? [])].join(", ") || "なし"}  シナリオパック: ${mods.map((m) => `${m.info.id}${m.info.ok ? "" : "(外した)"}`).join(", ") || "なし"}`);
