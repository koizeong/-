import { fileURLToPath } from "node:url";
import { parseClientMessage, type ServerMessage } from "@brigade/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { developmentInfo, loadDataDir, Match, scenarioSummary, startScenario, startServer } from "../src/index.js";

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

  it("経路の見積もり:自軍のユニットだけ。見積もりは実際の解決と同じ位置になり、試合は進まない", () => {
    const m = new Match(bastogne, "us", 1);
    const wp = [{ x: 17125, y: 12625 }];
    const p = m.preview("us-501-pir", wp, "march")!;
    expect(p.reachable).toBe(true);
    expect(p.path.length).toBeGreaterThan(1);
    expect(m.preview("de-lehr-902", wp)).toBeNull();
    expect(m.turn).toBe(1);
    const out = m.submit(1, [{ unitId: "us-501-pir", waypoints: wp, moveMode: "march" }], []);
    const track = out.replay.own["us-501-pir"]!;
    const end = track[track.length - 1]!;
    // 接敵・阻止圏がなければ、このターンの終わりの位置は見積もりと同じ
    if (!out.replay.events.some((e) => e.unitId === "us-501-pir" && (e.type === "contact" || e.type === "blocked"))) {
      expect(end.x).toBeCloseTo(p.turnEnds[0]!.x, 0);
      expect(end.y).toBeCloseTo(p.turnEnds[0]!.y, 0);
    }
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

describe("試合の記録と続きから", () => {
  it("期待挙動:記録を再生すると、保存したときとまったく同じ状態に戻る(AIの命令も同じになる)", () => {
    const m = new Match(bastogne, "us", 7);
    m.submit(1, [{ unitId: "us-501-pir", waypoints: [{ x: 17125, y: 12625 }], moveMode: "march" }], []);
    m.submit(2, [], []);
    const last = m.submit(3, [{ unitId: "us-501-pir", stance: "defense" }], []);
    const rec = m.record();
    expect(rec.turns).toHaveLength(3);
    const r = Match.resume(bastogne, JSON.parse(JSON.stringify(rec)));
    expect(r.sameData).toBe(true);
    expect(r.match.turn).toBe(m.turn);
    expect(r.match.view()).toEqual(m.view());
    expect(r.last).toEqual(last);
    // 続きから進めても、元の試合と同じに進む
    expect(r.match.submit(4, [], [])).toEqual(m.submit(4, [], []));
  });

  it("データが変わっていれば、そのことを知らせる(再生はする)", () => {
    const m = new Match(bastogne, "us", 7);
    m.submit(1, [], []);
    const r = Match.resume(bastogne, { ...m.record(), scenarioHash: "old" });
    expect(r.sameData).toBe(false);
    expect(r.match.turn).toBe(2);
  });

  it("開始画面の概要:陣営ごとの部隊の数・日数・勝利条件", async () => {
    const { scenarioSummary } = await import("../src/index.js");
    const eight = scenarios.get("bastogne-1944-12")!;
    const s = scenarioSummary(eight);
    expect(s.days).toBe(8);
    expect(s.sides.map((x) => x.id)).toEqual(["us", "de"]);
    expect(s.sides.every((x) => x.units > 0)).toBe(true);
    expect(Object.keys(s.victory)).toContain("us");
  });
});

describe("装備編成で始める", () => {
  const data = loadDataDir(fileURLToPath(new URL("../../../data/", import.meta.url)));
  const sym = data.scenarios.get("test-symmetric")!;
  const custom = {
    bundle: {
      version: 1 as const,
      designs: { mg: { name: "高速機関銃", archetype: "machine_gun", params: { rateRpm: 1000 } } },
      templates: { light: { name: "軽歩兵連隊", baseToe: "infantry_regiment", elements: [{ name: "小銃中隊", count: 9, hitPoints: 100, weapons: [{ weapon: "user:mg", count: 2 }] }] } },
    },
    substitutions: { "us-inf1": "light" },
  };

  it("差し替えた部隊で始まり、記録に持ち込みが残り、記録から同じ状態に戻る", () => {
    const sc = startScenario(sym, data.packs, "us", custom);
    expect(sc.ok).toBe(true);
    if (!sc.ok) return;
    const m = new Match(sc.value, "us", 3, undefined, custom);
    expect(m.view().own.find((u) => u.id === "us-inf1")!.toe).toBe("user:light");
    m.submit(1, [], []);
    const rec = JSON.parse(JSON.stringify(m.record()));
    expect(rec.custom).toEqual(custom);
    const again = startScenario(sym, data.packs, rec.side, rec.custom);
    if (!again.ok) throw new Error(again.errors.join());
    const r = Match.resume(again.value, rec);
    expect(r.sameData).toBe(true);
    expect(r.match.view()).toEqual(m.view());
  });

  it("相手の陣営の部隊は差し替えられない(サーバーが弾く)", () => {
    const r = startScenario(sym, data.packs, "us", { ...custom, substitutions: { "de-inf1": "light" } });
    expect(r.ok).toBe(false);
  });

  it("装備編成の画面の情報:ルールパックの開発の決まりと、差し替えられる部隊", () => {
    const info = developmentInfo(sym)!;
    expect(Object.keys(info.development.archetypes)).toContain("gun");
    expect(info.sides["us"]!.units.map((u) => u.id)).toContain("us-inf1");
    expect(scenarioSummary(sym).customizableSides).toEqual(["us", "de"]);
  });
});
