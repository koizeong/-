import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadBiomes, loadCampaigns, loadDataDir, loadGeneratorData, loadWars, startServer, type WarSnapshot } from "../src/index.js";

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

  it("設計の見込みを返し、世代の上限を超えれば断る", async () => {
    const s = await post("/api/war/start", { warId: "europe-1941", side: "ax", seed: 3 });
    const snap = s.body.snapshot;
    snap.state.research.ax!.done = ["ax_t_longpz"];
    const ok = (await (await fetch(`${base}/api/war/design/preview`, { method: "POST", body: JSON.stringify({ snapshot: snap, design: { name: "", base: "ax_pz41", quality: 0.1, shift: 0 } }) })).json()) as { template: { attack: number }; price: number };
    expect(ok.template.attack).toBeGreaterThan(14);
    expect(ok.price).toBeGreaterThan(0);
    const ng = await fetch(`${base}/api/war/design/preview`, { method: "POST", body: JSON.stringify({ snapshot: snap, design: { name: "", base: "ax_pz41", quality: 0.4, shift: 0 } }) });
    expect(ng.status).toBe(400);
  });

  it("壊れた記録は断る", async () => {
    const r = await post("/api/war/advance", { snapshot: { warId: "europe-1941", side: "zz", state: {} }, orders: {} });
    expect(r.status).toBe(400);
  });
});

describe("戦争の戦線を戦役で戦う口", () => {
  const port = 21000 + Math.floor(Math.random() * 1000);
  const base = `http://localhost:${port}`;
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    const generator = loadGeneratorData(dataDir)!;
    const env = { packs, generator, biomes: loadBiomes(dataDir) };
    server = startServer({ port, scenarios, packs, defaultScenario: "bastogne-1944-12-19", defaultSide: "us", wars, campaigns: { defs: loadCampaigns(dataDir, env), env } });
  });
  afterAll(() => new Promise<void>((done) => server.wss.close(() => server.http.close(() => done()))));
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Record<string, any> };
  };

  it("バルバロッサ作戦を戦役で始め、終わった戦役の結果を戦争へ戻す", async () => {
    const s = await post("/api/war/start", { warId: "europe-1941", side: "ax", seed: 5 });
    const c = await post("/api/war/campaign/start", { snapshot: s.body.snapshot, front: "east_center" });
    expect(c.status).toBe(200);
    expect(c.body.campaign.campaignId).toBe("barbarossa-1941");
    expect(c.body.campaign.side).toBe("de");
    // 戦争の戦線ではソ連が劣るので、ソ連の始めの戦力が下がる
    expect(c.body.scale.al).toBeLessThan(1);
    // 戦役の途中では、戦争は進められない
    const blocked = await post("/api/war/advance", { snapshot: c.body.snapshot, orders: {} });
    expect(blocked.status).toBe(400);
    // 戦役が終わったことにして報告する
    const camp = c.body.campaign;
    camp.state.result = { winner: "de", level: "limited", perSide: {} };
    camp.state.lost = { de: camp.state.forceTotals.de * 0.1, su: camp.state.forceTotals.su * 0.3 };
    const r = await post("/api/war/campaign/result", { snapshot: c.body.snapshot, front: "east_center", campaign: camp });
    expect(r.status).toBe(200);
    expect(r.body.view.campaignResults[0]).toMatchObject({ campaignId: "barbarossa-1941", winner: "ax", level: "limited", moved: 1 });
    const a = await post("/api/war/advance", { snapshot: r.body.snapshot, orders: {} });
    expect(a.status).toBe(200);
  });
});
