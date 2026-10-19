import { fileURLToPath } from "node:url";
import type { ServerMessage, TurnOutcome } from "@brigade/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { DISCONNECT_GRACE_MS, loadDataDir, Room, startServer } from "../src/index.js";

const data = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
const sym = data.scenarios.get("test-symmetric")!;

function makeRoom(timeLimitSec = 0) {
  const got = { us: [] as TurnOutcome[], de: [] as TurnOutcome[] } as Record<"us" | "de", TurnOutcome[]> & Record<string, TurnOutcome[]>;
  let statuses = 0;
  const room = new Room("ABCDEF", sym, data.packs, 5, timeLimitSec, {
    resolved: (side, o) => got[side]!.push(o),
    status: () => statuses++,
  });
  return { room, got, statuses: () => statuses };
}

describe("オンライン対戦の部屋(同時入力)", () => {
  it("両者が揃うまで始まらず、両者が命令を出すと同時に解決して、それぞれに自陣営の再生だけを返す", () => {
    const { room, got } = makeRoom();
    expect(room.sit("us", "t1", 0).ok).toBe(true);
    expect(room.started).toBe(false);
    expect(room.openSides).toEqual(["de"]);
    expect(room.sit("de", "t2", 0).ok).toBe(true);
    expect(room.started).toBe(true);
    room.submit("us", 1, [{ unitId: "us-inf1", waypoints: [{ x: 4000, y: 5000 }], moveMode: "march" }], [], 0);
    expect(got.us).toHaveLength(0);
    expect(room.status(0).seats.find((s) => s.side === "us")!.submitted).toBe(true);
    // 相手のユニットへの命令は弾く
    room.submit("de", 1, [{ unitId: "us-inf2", stance: "defense" }], [], 0);
    expect(got.us).toHaveLength(1);
    expect(got.de).toHaveLength(1);
    expect(Object.keys(got.us[0]!.replay.own)).toContain("us-inf1");
    expect(Object.keys(got.de[0]!.replay.own).every((id) => id.startsWith("de-"))).toBe(true);
    expect(got.de[0]!.rejectedOrders).toEqual([{ unitId: "us-inf2", reason: "自陣営のユニットではありません" }]);
    expect(room.current!.turn).toBe(2);
    expect(() => room.submit("us", 1, [], [], 0)).toThrow("今は 2 ターン目");
  });

  it("制限時間:締め切りが来たら、命令を出していない陣営は命令なしで解決する", () => {
    const { room, got } = makeRoom(180);
    room.sit("us", "t1", 0);
    room.sit("de", "t2", 0);
    room.submit("us", 1, [], [], 1000);
    expect(room.status(1000).remainingSec).toBe(179);
    room.tick(179_000);
    expect(got.us).toHaveLength(0);
    room.tick(180_000);
    expect(got.us).toHaveLength(1);
    expect(room.current!.turn).toBe(2);
    expect(room.status(180_000).remainingSec).toBe(180);
  });

  it("切断:猶予のあいだは待ち、過ぎたら AI が引き継いで進む。戻れば人間に戻る", () => {
    const { room, got } = makeRoom();
    room.sit("us", "t1", 0);
    room.sit("de", "t2", 0);
    room.disconnect("de", 0);
    room.submit("us", 1, [], [], 0);
    room.tick(DISCONNECT_GRACE_MS - 1);
    expect(got.us).toHaveLength(0);
    room.tick(DISCONNECT_GRACE_MS);
    expect(room.status(DISCONNECT_GRACE_MS).seats.find((s) => s.side === "de")!.ai).toBe(true);
    expect(got.us).toHaveLength(1);
    // AI の間は、人間の陣営が出せばすぐ進む
    room.submit("us", 2, [], [], DISCONNECT_GRACE_MS);
    expect(room.current!.turn).toBe(3);
    expect(room.sideOf("t2")).toBe("de");
    room.reconnect("de");
    room.submit("us", 3, [], [], DISCONNECT_GRACE_MS);
    expect(room.current!.turn).toBe(3);
  });

  it("試合の記録(両陣営の命令)は、終わるまで渡さない", () => {
    const { room } = makeRoom();
    room.sit("us", "t1", 0);
    room.sit("de", "t2", 0);
    room.submit("us", 1, [], [], 0);
    room.submit("de", 1, [], [], 0);
    expect(room.record()).toBeNull();
  });

  it("両陣営が装備編成を持ち込める(同じIDでも重ならない)", () => {
    const el = data.packs.toes["ww1-korea-generic"]!.toes["infantry_regiment"]!.elements;
    const custom = {
      bundle: { version: 1 as const, designs: {}, templates: { t: { name: "小さい連隊", baseToe: "infantry_regiment", elements: [{ ...el[0]!, count: 6 }] } } },
      substitutions: { "us-inf1": "t" },
    };
    const { room } = makeRoom();
    room.sit("us", "t1", 0, custom);
    room.sit("de", "t2", 0, { ...custom, substitutions: { "de-inf1": "t" } });
    expect(room.view("us")!.own.find((u) => u.id === "us-inf1")!.toe).toBe("user:us:t");
    expect(room.view("de")!.own.find((u) => u.id === "de-inf1")!.toe).toBe("user:de:t");
  });
});

describe("オンライン対戦(WebSocket)", () => {
  const port = 18900 + Math.floor(Math.random() * 500);
  let server: ReturnType<typeof startServer>;
  beforeAll(() => {
    server = startServer({ port, scenarios: data.scenarios, packs: data.packs, defaultScenario: "test-symmetric", defaultSide: "us" });
  });
  afterAll(() => {
    server.wss.close();
    server.http.close();
  });

  const client = () =>
    new Promise<{ ws: WebSocket; msgs: ServerMessage[]; next: (type: ServerMessage["type"]) => Promise<ServerMessage> }>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const msgs: ServerMessage[] = [];
      const waiters: { type: string; fn: (m: ServerMessage) => void }[] = [];
      ws.on("message", (d) => {
        const m = JSON.parse(d.toString()) as ServerMessage;
        const i = waiters.findIndex((w) => w.type === m.type);
        if (i >= 0) waiters.splice(i, 1)[0]!.fn(m);
        else msgs.push(m);
      });
      const next = (type: ServerMessage["type"]) =>
        new Promise<ServerMessage>((res) => {
          const i = msgs.findIndex((m) => m.type === type);
          if (i >= 0) res(msgs.splice(i, 1)[0]!);
          else waiters.push({ type, fn: res });
        });
      ws.on("open", () => resolve({ ws, msgs, next }));
    });

  it("部屋を作り、合言葉で入り、両者が命令を出すとそれぞれにターンの結果が届く。切断しても鍵で戻れる", async () => {
    const a = await client();
    a.ws.send(JSON.stringify({ type: "createRoom", scenarioId: "test-symmetric", side: "us", timeLimitSec: 0, seed: 1 }));
    const joined = (await a.next("roomJoined")) as Extract<ServerMessage, { type: "roomJoined" }>;
    expect(joined.side).toBe("us");
    const b = await client();
    b.ws.send(JSON.stringify({ type: "joinRoom", code: joined.code.toLowerCase() }));
    const bj = (await b.next("roomJoined")) as Extract<ServerMessage, { type: "roomJoined" }>;
    expect(bj.side).toBe("de");
    const wa = (await a.next("welcome")) as Extract<ServerMessage, { type: "welcome" }>;
    const wb = (await b.next("welcome")) as Extract<ServerMessage, { type: "welcome" }>;
    expect(wa.info.mySide).toBe("us");
    expect(wb.view.own.every((u) => u.side === "de")).toBe(true);
    a.ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    b.ws.send(JSON.stringify({ type: "submitTurn", turn: 1, orders: [], hqCommands: [] }));
    const ra = (await a.next("turnResolved")) as Extract<ServerMessage, { type: "turnResolved" }>;
    await b.next("turnResolved");
    expect(ra.outcome.turn).toBe(1);
    expect(ra.record).toBeUndefined();
    // 切断して、鍵で戻る
    b.ws.close();
    const c = await client();
    c.ws.send(JSON.stringify({ type: "rejoinRoom", code: joined.code, token: bj.token }));
    expect(((await c.next("roomJoined")) as Extract<ServerMessage, { type: "roomJoined" }>).side).toBe("de");
    const wc = (await c.next("welcome")) as Extract<ServerMessage, { type: "welcome" }>;
    expect(wc.view.turn).toBe(2);
    c.ws.send(JSON.stringify({ type: "rejoinRoom", code: joined.code, token: "wrong" }));
    expect(((await c.next("error")) as Extract<ServerMessage, { type: "error" }>).message).toContain("戻れません");
    a.ws.close();
    c.ws.close();
  });
});
