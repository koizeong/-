import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDataDir, loadWars, startServer, type WarSnapshot } from "../src/index.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const { scenarios, packs } = loadDataDir(dataDir);
const wars = loadWars(dataDir);

type Reply = { snapshot: WarSnapshot; view: { date: string; month: number; stock: Record<string, number>; buildable: string[]; fronts: { id: string; open: boolean }[] }; report?: unknown; errors?: string[] };

describe("戦争の口", () => {
  const port = 20000 + Math.floor(Math.random() * 1000);
  const base = `http://localhost:${port}`;
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    server = startServer({ port, scenarios, packs, defaultScenario: "bastogne-1944-12-19", defaultSide: "us", wars });
  });
  afterAll(() => new Promise<void>((done) => server.wss.close(() => server.http.close(() => done()))));
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Reply };
  };

  it("一覧と定義を返し、始めて、命令つきで1か月進める", async () => {
    const list = (await (await fetch(`${base}/api/wars`)).json()) as { id: string }[];
    expect(list.map((w) => w.id)).toContain("europe-1941");
    const def = (await (await fetch(`${base}/api/war?id=europe-1941`)).json()) as { fronts: Record<string, unknown> };
    expect(Object.keys(def.fronts)).toContain("east_center");
    const s = await post("/api/war/start", { warId: "europe-1941", side: "ax", seed: 3 });
    expect(s.status).toBe(200);
    expect(s.body.view.date).toBe("1941-06");
    expect(s.body.view.buildable).toContain("ax_inf41");
    const a = await post("/api/war/advance", { snapshot: s.body.snapshot, orders: { produce: ["ax_inf41"], postures: { east_center: "attack" } } });
    expect(a.status).toBe(200);
    expect(a.body.view.month).toBe(1);
    expect(a.body.snapshot.state.queue.some((q) => q.side === "ax")).toBe(true);
    expect(a.body.report).toBeDefined();
  });

  it("壊れた記録は断る", async () => {
    const r = await post("/api/war/advance", { snapshot: { warId: "europe-1941", side: "zz", state: {} }, orders: {} });
    expect(r.status).toBe(400);
  });
});
