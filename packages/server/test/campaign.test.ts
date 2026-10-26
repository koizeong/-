import { fileURLToPath } from "node:url";
import type { ServerMessage } from "@brigade/protocol";
import type { CampaignSnapshot, CampaignView, StageReport } from "@brigade/campaign";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { loadBiomes, loadCampaigns, loadDataDir, loadGeneratorData, startServer } from "../src/index.js";

const dataDir = fileURLToPath(new URL("../../../data/", import.meta.url));
const { scenarios, packs } = loadDataDir(dataDir);
const generator = loadGeneratorData(dataDir)!;
const biomes = loadBiomes(dataDir);
const env = { packs, generator, biomes };
const campaigns = { defs: loadCampaigns(dataDir, env), env };

type Reply = { snapshot: CampaignSnapshot; view: CampaignView; scenarioId?: string; side?: string; report?: StageReport; errors?: string[] };

describe("キャンペーンの口", () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const base = `http://localhost:${port}`;
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    server = startServer({ port, scenarios, packs, defaultScenario: "bastogne-1944-12-19", defaultSide: "us", generator, biomes, campaigns });
  });
  afterAll(() => new Promise<void>((done) => server.wss.close(() => server.http.close(() => done()))));

  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Reply };
  };
  const connect = () =>
    new Promise<{ ws: WebSocket; next: () => Promise<ServerMessage> }>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const queue: ServerMessage[] = [];
      const waiters: ((m: ServerMessage) => void)[] = [];
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString()) as ServerMessage;
        const w = waiters.shift();
        if (w) w(m);
        else queue.push(m);
      });
      ws.on("open", () => resolve({ ws, next: () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise((r) => waiters.push(r))) }));
    });

  it("一覧と作戦地図", async () => {
    const list = (await (await fetch(`${base}/api/campaigns`)).json()) as { id: string; stages: number }[];
    expect(list.map((c) => c.id)).toContain("exercise-river");
    const d = (await (await fetch(`${base}/api/campaign?id=exercise-river`)).json()) as { regions: Record<string, unknown>; links: unknown[] };
    expect(Object.keys(d.regions)).toHaveLength(8);
    expect(d.links.length).toBeGreaterThan(0);
  });

  it("始める → 命令を確定 → 戦闘を選んで WebSocket で指揮 → 記録を送って段階を進める", async () => {
    const start = await post("/api/campaign/start", { campaignId: "exercise-river", side: "blue", seed: 5 });
    expect(start.status).toBe(200);
    expect(start.body.view.stage).toBe(1);
    expect(start.body.view.plan).toBeNull();

    // 確定する前は戦闘を選べない
    expect((await post("/api/campaign/battle", { snapshot: start.body.snapshot, battleId: "s1-crossing" })).status).toBe(400);
    // つながっていない地域への命令は弾く
    const bad = await post("/api/campaign/orders", { snapshot: start.body.snapshot, orders: [{ formation: "blue-1div", to: "red-base" }] });
    expect(bad.status).toBe(400);
    expect(bad.body.errors![0]).toContain("つながっていない");

    const committed = await post("/api/campaign/orders", { snapshot: start.body.snapshot, orders: [{ formation: "blue-1div", to: "crossing" }] });
    expect(committed.status).toBe(200);
    const plan = committed.body.view.plan!;
    expect(plan).not.toBeNull();
    // 確定した後は変えられない
    expect((await post("/api/campaign/orders", { snapshot: committed.body.snapshot, orders: [] })).status).toBe(400);

    const battle = plan.battles.find((b) => b.playable);
    // この種では、赤の第1狙撃師団も渡河点へ来て遭遇戦になる
    expect(battle).toMatchObject({ id: "s1-crossing", mission: "encounter" });
    if (!battle) return;
    const chosen = await post("/api/campaign/battle", { snapshot: committed.body.snapshot, battleId: battle.id });
    expect(chosen.status).toBe(200);
    expect(chosen.body.scenarioId).toMatch(/^camp:exercise-river:1:/);
    // 1段階に1つだけ
    const other = plan.battles.find((b) => b.playable && b.id !== battle.id);
    if (other) expect((await post("/api/campaign/battle", { snapshot: chosen.body.snapshot, battleId: other.id })).status).toBe(400);

    const { ws, next } = await connect();
    ws.send(JSON.stringify({ type: "join", scenarioId: chosen.body.scenarioId, side: "blue", seed: 3 }));
    const welcome = await next();
    expect(welcome.type).toBe("welcome");
    if (welcome.type !== "welcome") return;
    expect(welcome.view.own.every((u) => u.id.startsWith("blue-"))).toBe(true);
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    const resolved = await next();
    expect(resolved.type).toBe("turnResolved");
    if (resolved.type !== "turnResolved") return;
    ws.close();

    // 途中までの記録:残りは AI 同士で解く。指揮した戦闘は played
    const adv = await post("/api/campaign/advance", { snapshot: chosen.body.snapshot, record: resolved.record });
    expect(adv.status).toBe(200);
    expect(adv.body.view.stage).toBe(2);
    expect(adv.body.view.plan).toBeNull();
    expect(adv.body.report!.battles.find((b) => b.id === battle.id)).toMatchObject({ played: true });
    expect(adv.body.report!.battles.filter((b) => b.id !== battle.id).every((b) => !b.played)).toBe(true);
    // 別の戦いの記録は受け付けない
    const wrong = await post("/api/campaign/advance", { snapshot: chosen.body.snapshot, record: { ...resolved.record!, scenarioId: "test-symmetric" } });
    expect(wrong.status).toBe(400);
  }, 120000);

  it("壊れた記録・知らない陣営は弾く", async () => {
    expect((await post("/api/campaign/start", { campaignId: "exercise-river", side: "green" })).status).toBe(400);
    expect((await post("/api/campaign/view", { snapshot: { campaignId: "nope" } })).status).toBe(400);
    const start = await post("/api/campaign/start", { campaignId: "exercise-river", side: "red", seed: 1 });
    const tampered = { ...start.body.snapshot, orders: [{ formation: "blue-1div", to: "crossing" }] };
    expect((await post("/api/campaign/view", { snapshot: tampered })).status).toBe(400);
  });
});
