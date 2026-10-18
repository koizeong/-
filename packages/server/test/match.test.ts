import { fileURLToPath } from "node:url";
import { parseClientMessage, type ServerMessage } from "@brigade/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { loadDataDir, Match, startServer } from "../src/index.js";

const { scenarios } = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
const bastogne = scenarios.get("bastogne-1944-12-19")!;

describe("試合(人間 対 AI)", () => {
  it("命令を受けて1ターン進み、自陣営のビューと再生データを返す", () => {
    const m = new Match(bastogne, "us", 1);
    expect(m.aiSides).toEqual(["de"]);
    const out = m.submit(1, [{ unitId: "us-501-pir", waypoints: [{ x: 17125, y: 12625 }], moveMode: "march" }], []);
    expect(out.turn).toBe(1);
    expect(out.rejectedOrders).toEqual([]);
    expect(Object.keys(out.replay.own)).toContain("us-501-pir");
    expect(m.turn).toBe(2);
  });

  it("他陣営のユニットへの命令と他陣営の司令部コマンドは弾く。ターン番号が違えば受け付けない", () => {
    const m = new Match(bastogne, "us", 1);
    const out = m.submit(1, [{ unitId: "de-lehr-902", stance: "defense" }], [{ side: "de", type: "airStrike", target: { x: 1, y: 1 } }]);
    expect(out.rejectedOrders).toEqual([{ unitId: "de-lehr-902", reason: "自陣営のユニットではありません" }]);
    expect(out.rejectedHqCommands.map((x) => x.reason)).toEqual(["自陣営の司令部コマンドではありません"]);
    expect(() => m.submit(5, [], [])).toThrow("今は 2 ターン目");
  });

  it("霧:返すビューと再生データに、敵の本当のIDは含まれない", () => {
    const m = new Match(bastogne, "us", 1);
    let text = JSON.stringify(m.view());
    for (let t = 1; t <= 4; t++) text += JSON.stringify(m.submit(t, [], [])) + JSON.stringify(m.view());
    for (const id of ["de-lehr-902", "de-2pz-kg-north", "de-26vgd-77"]) expect(text).not.toContain(id);
  });

  it("最後まで遊べて、勝敗が出る", () => {
    const m = new Match(bastogne, "us", 3);
    let last = null;
    while (!m.over) last = m.submit(m.turn, [], []);
    expect(last!.result).not.toBeNull();
    expect(() => m.submit(m.turn, [], [])).toThrow("試合は終わっています");
  }, 60000);

  it("試合の情報には、自陣営の砲兵の射程が入る", () => {
    const info = new Match(bastogne, "us", 1).info();
    expect(info.mySide).toBe("us");
    expect(Object.keys(info.artilleryRanges)).toEqual(["us-101-divarty"]);
    expect(info.map.rows.length).toBe(100);
  });
});

describe("通信", () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    server = startServer({ port, scenarios, defaultScenario: "bastogne-1944-12-19", defaultSide: "us" });
  });
  afterAll(() => new Promise<void>((done) => server.wss.close(() => server.http.close(() => done()))));

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

  it("参加して1ターン解決できる", async () => {
    const { ws, next } = await connect();
    ws.send(JSON.stringify({ type: "join", seed: 1 }));
    const welcome = await next();
    expect(welcome.type).toBe("welcome");
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    const resolved = await next();
    expect(resolved.type).toBe("turnResolved");
    if (resolved.type === "turnResolved") expect(resolved.view.turn).toBe(2);
    ws.close();
  });

  it("壊れたメッセージにはエラーを返す", async () => {
    const { ws, next } = await connect();
    ws.send("not json");
    expect(await next()).toMatchObject({ type: "error" });
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    expect(await next()).toEqual({ type: "error", message: "先に join してください" });
    ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [{ unitId: 3 }], hqCommands: [] }));
    expect(await next()).toMatchObject({ type: "error" });
    ws.close();
  });

  it("クライアントのメッセージの検証(座標が数値でない命令を弾く)", () => {
    expect(parseClientMessage(JSON.stringify({ type: "submitTurn", turn: 1, orders: [{ unitId: "a", waypoints: [{ x: "1", y: 2 }] }], hqCommands: [] })).ok).toBe(false);
  });
});
