import { fileURLToPath } from "node:url";
import { loadDataDir } from "./data.js";
import { startServer } from "./server.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const { scenarios } = loadDataDir(dataDir);
const port = Number(process.env.PORT ?? 8787);
startServer({ port, scenarios, defaultScenario: "bastogne-1944-12", defaultSide: "us" });
console.log(`サーバー起動: ws://localhost:${port}  シナリオ: ${[...scenarios.keys()].join(", ")}`);
