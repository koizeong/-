import { fileURLToPath } from "node:url";
import { boot } from "./boot.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const { scenarios, tutorials, campaigns } = boot({ dataDir, port });
console.log(`サーバー起動: ws://localhost:${port}(編成エディターの口 http://localhost:${port}/api/packs)  シナリオ: ${[...scenarios.keys()].join(", ")}  手引き: ${tutorials.map((t) => t.id).join(", ") || "なし"}  キャンペーン: ${[...(campaigns?.defs.keys() ?? [])].join(", ") || "なし"}`);
