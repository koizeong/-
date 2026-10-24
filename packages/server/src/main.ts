import { fileURLToPath } from "node:url";
import { loadBiomes, loadDataDir, loadTutorials } from "./data.js";
import { startServer } from "./server.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const { scenarios, packs } = loadDataDir(dataDir);
const port = Number(process.env.PORT ?? 8787);
const tutorials = loadTutorials(dataDir, scenarios);
startServer({ port, scenarios, packs, defaultScenario: "bastogne-1944-12", defaultSide: "us", dataDir, tutorials, biomes: loadBiomes(dataDir) });
console.log(`サーバー起動: ws://localhost:${port}(編成エディターの口 http://localhost:${port}/api/packs)  シナリオ: ${[...scenarios.keys()].join(", ")}  手引き: ${tutorials.map((t) => t.id).join(", ") || "なし"}`);
