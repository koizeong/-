import { parseClientMessage, type ServerMessage, type Tutorial } from "@brigade/protocol";
import type { LoadedScenario, PackSet } from "@brigade/sim-core";
import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { generateMap, MAP_SIZES, type Biome, type GeneratorData } from "@brigade/generator";
import { generatedScenario } from "./generate.js";
import { handleEditorRequest } from "./editor-api.js";
import { randomBytes } from "node:crypto";
import { developmentInfo, Match, scenarioDetail, scenarioSummary, sideInfo, sideModifiers, sidePreview, startOptionsOf, startScenario, type StartOptions } from "./match.js";
import { Room, roomCode, TIME_LIMITS } from "./room.js";

export interface ServerOptions {
  port: number;
  scenarios: Map<string, LoadedScenario>;
  /** 読み込んだパック(装備編成で始めるときに、シナリオを読み込み直すのに使う)。なければ装備編成で始められない */
  packs?: PackSet;
  defaultScenario: string;
  defaultSide: string;
  /** data/ のディレクトリ。指定すれば編成エディターの HTTP の口(/api/packs・/api/save)を開く */
  dataDir?: string;
  /** 手引き(GET /api/tutorials で配る) */
  tutorials?: Tutorial[];
  /** 自動生成マップの地形の傾向(GET /api/generate/*) */
  biomes?: Record<string, Biome>;
  /** 自動生成の任務の決まり。あれば gen: で始まる ID のシナリオを作って遊べる */
  generator?: GeneratorData;
}

/** 生成する地図の大きさの上限(m)。重すぎる地図を頼まれないように */
const MAX_MAP_M = 30000;

/** 誰もつながっていない部屋を消すまでの時間 */
const ROOM_IDLE_MS = 60 * 60 * 1000;

/** WebSocket サーバー。接続ごとに 人間1人 対 AI の試合を持つ。同じポートで編成エディターの HTTP の口も受ける */
export function startServer(opts: ServerOptions): { wss: WebSocketServer; http: Server } {
  /** シナリオを探す:data/ のシナリオか、自動生成の ID なら作る(作れなければ undefined) */
  const findScenario = (id: string) => {
    try {
      return opts.scenarios.get(id) ?? generatedScenario(id, opts.generator && opts.biomes ? { data: opts.generator, biomes: opts.biomes } : undefined, opts.packs);
    } catch (e) {
      console.error(e);
      return undefined;
    }
  };
  const http = createServer((req, res) => {
    const done = (handled: boolean) => {
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    };
    // 開始画面のシナリオ一覧(両陣営に公開の情報だけ)
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/scenarios") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify([...opts.scenarios.values()].map(scenarioSummary)));
      return;
    }
    // シナリオ選択・部隊編成の画面:1つのシナリオの地図・目標と、選んだ陣営の部隊(編成の選択を当てたもの)
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/scenario") {
      const q = new URL(req.url ?? "/", "http://localhost").searchParams;
      const base = findScenario(q.get("id") ?? opts.defaultScenario);
      const side = q.get("side") ?? base?.def.sides[0]?.id ?? "";
      const preset = q.get("preset");
      let sc = base;
      if (sc && preset && opts.packs) {
        const r = startScenario(sc, opts.packs, side, { preset });
        sc = r.ok ? r.value : undefined;
      }
      const ok = !!sc && sc.def.sides.some((s) => s.id === side);
      res.writeHead(ok ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(ok ? scenarioDetail(sc!, side) : { error: sc ? `陣営 "${side}" はこのシナリオにありません` : `シナリオ "${q.get("id")}" がありません` }));
      return;
    }
    // 自動生成マップ:地形の傾向の一覧と、シードから作った地図(確認画面 generator.html)
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/generate/biomes") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(Object.entries(opts.biomes ?? {}).map(([id, b]) => ({ id, name: b.name, description: b.description }))));
      return;
    }
    // 自動生成の任務:選べる任務・編成・大きさ・地形の傾向と、ID から作ったシナリオの一覧の札(作戦命令の画面に渡す)
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/generate/options") {
      const g = opts.generator;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          missions: Object.entries(g?.missions ?? {}).map(([id, m]) => ({ id, name: m.name, description: m.description })),
          eras: Object.entries(g?.eras ?? {}).map(([id, e]) => ({ id, name: e.name })),
          sizes: Object.entries(MAP_SIZES).map(([id, z]) => ({ id, name: z.name, widthM: z.widthM, heightM: z.heightM })),
          biomes: Object.entries(opts.biomes ?? {}).map(([id, b]) => ({ id, name: b.name, description: b.description })),
        }),
      );
      return;
    }
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/generate/summary") {
      const id = new URL(req.url ?? "/", "http://localhost").searchParams.get("id") ?? "";
      const sc = id.startsWith("gen:") ? findScenario(id) : undefined;
      res.writeHead(sc ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(sc ? scenarioSummary(sc) : { error: `自動生成のシナリオ "${id}" を作れません` }));
      return;
    }
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/generate/map") {
      const q = new URL(req.url ?? "/", "http://localhost").searchParams;
      const biome = opts.biomes?.[q.get("biome") ?? ""];
      const num = (k: string, d: number) => (Number.isFinite(Number(q.get(k))) && q.get(k) !== null ? Number(q.get(k)) : d);
      const widthM = Math.min(MAX_MAP_M, Math.max(4000, num("w", 12000)));
      const heightM = Math.min(MAX_MAP_M, Math.max(4000, num("h", 9000)));
      const axis = q.get("axis");
      if (!biome) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: `地形の傾向 "${q.get("biome")}" がありません` }));
        return;
      }
      const g = generateMap({ seed: Math.floor(num("seed", 1)), widthM, heightM, cellSizeM: 250, biome, ...(axis === "ew" || axis === "ns" ? { axis } : {}) });
      const { roles: _roles, ...out } = g;
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(out));
      return;
    }
    // 装備編成の画面:シナリオの開発の決まり・武器・編成表・差し替えられる部隊
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/development") {
      const q = new URL(req.url ?? "/", "http://localhost").searchParams;
      const id = q.get("scenario") ?? opts.defaultScenario;
      const preset = q.get("preset");
      let sc = findScenario(id);
      // 編成の選択をしているなら、それを当てたシナリオの武器・編成表を渡す
      if (sc && preset && opts.packs) {
        const r = startScenario(sc, opts.packs, "", { preset });
        sc = r.ok ? r.value : undefined;
      }
      const info = sc ? developmentInfo(sc) : null;
      res.writeHead(info ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(info ?? { error: sc ? "このシナリオのルールパックでは装備編成ができません" : `シナリオ "${id}" がありません` }));
      return;
    }
    // オンライン対戦:合言葉の部屋のシナリオと空いている陣営(入る前に装備編成を選ぶため)
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/room") {
      const code = (new URL(req.url ?? "/", "http://localhost").searchParams.get("code") ?? "").toUpperCase();
      const room = rooms.get(code);
      res.writeHead(room ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(room ? { code, scenarioId: room.scenarioId, openSide: room.openSides[0] ?? null, timeLimitSec: room.timeLimitSec, ...(room.preset ? { preset: room.preset } : {}) } : { error: `部屋 "${code}" がありません` }));
      return;
    }
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/tutorials") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(opts.tutorials ?? []));
      return;
    }
    if (!opts.dataDir) return done(false);
    // 保存したら、これから始まる試合が新しいデータを使うよう、シナリオを読み直す
    handleEditorRequest(req, res, opts.dataDir, (fresh, packs) => {
      opts.scenarios.clear();
      for (const [k, v] of fresh) opts.scenarios.set(k, v);
      opts.packs = packs;
    })
      .then(done)
      .catch((e: unknown) => {
        res.writeHead(500);
        res.end(e instanceof Error ? e.message : String(e));
      });
  });
  const wss = new WebSocketServer({ server: http });
  http.listen(opts.port);
  const custom = (scenario: LoadedScenario, side: string, how: StartOptions) =>
    (how.custom || how.aiAuto || how.preset) && !opts.packs ? { ok: false as const, errors: ["このサーバーは編成の選択・装備編成を受け付けていません"] } : startScenario(scenario, opts.packs!, side, how);

  // ---- オンライン対戦の部屋 ----
  const rooms = new Map<string, Room>();
  /** 部屋ごと・陣営ごとの接続(同じ陣営に入り直したら新しい方だけ) */
  const conns = new Map<string, Map<string, WebSocket>>();
  const sendTo = (code: string, side: string, m: ServerMessage) => {
    const ws = conns.get(code)?.get(side);
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };
  const broadcast = (code: string) => {
    const room = rooms.get(code);
    if (!room) return;
    const status = room.status(Date.now());
    for (const side of room.seats.keys()) sendTo(code, side, { type: "roomStatus", status });
    const record = room.record();
    if (record) for (const side of room.seats.keys()) sendTo(code, side, { type: "roomRecord", record });
  };
  const welcome = (room: Room, side: string): ServerMessage => ({
    type: "welcome",
    info: sideInfo(room.loaded!, room.current!, side),
    view: room.view(side)!,
    modifiers: sideModifiers(room.loaded!, room.current!, side),
  });
  const createRoom = (scenario: LoadedScenario, seed: number, timeLimitSec: number, preset?: string): Room => {
    let code = roomCode(Math.random);
    while (rooms.has(code)) code = roomCode(Math.random);
    const room = new Room(code, scenario, opts.packs, seed, timeLimitSec, {
      resolved: (side, outcome) =>
        sendTo(code, side, { type: "turnResolved", outcome, view: room.view(side)!, modifiers: sideModifiers(room.loaded!, room.current!, side) }),
      status: () => broadcast(code),
    }, undefined, preset);
    rooms.set(code, room);
    conns.set(code, new Map());
    return room;
  };
  /** 毎秒:締め切り・切断の引き継ぎ。誰もいなくなって長い部屋は消す */
  const lastSeen = new Map<string, number>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      room.tick(now);
      if ([...room.seats.values()].some((x) => x.connected)) lastSeen.set(code, now);
      else if (now - (lastSeen.get(code) ?? now) > ROOM_IDLE_MS) {
        rooms.delete(code);
        conns.delete(code);
        lastSeen.delete(code);
      }
      // 制限時間があれば、残り時間を知らせ続ける
      if (room.started && !room.over && room.timeLimitSec > 0) broadcast(code);
    }
  }, 1000);
  http.on("close", () => clearInterval(timer));

  wss.on("connection", (ws: WebSocket) => {
    let match: Match | null = null;
    /** この接続が座っている部屋と陣営 */
    let seat: { room: Room; side: string } | null = null;
    const send = (m: ServerMessage) => ws.send(JSON.stringify(m));
    ws.on("close", () => {
      if (!seat || conns.get(seat.room.code)?.get(seat.side) !== ws) return;
      seat.room.disconnect(seat.side, Date.now());
    });
    const sit = (room: Room, side: string, token: string) => {
      seat = { room, side };
      lastSeen.set(room.code, Date.now());
      conns.get(room.code)!.set(side, ws);
      send({ type: "roomJoined", code: room.code, token, side, scenarioName: room.loaded?.def.name ?? findScenario(room.scenarioId)?.def.name ?? room.scenarioId });
    };
    ws.on("message", (data) => {
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return send({ type: "error", message: `メッセージが不正です: ${parsed.error}` });
      const msg = parsed.value;
      try {
        if (msg.type === "createRoom") {
          const scenario = findScenario(msg.scenarioId);
          if (!scenario) return send({ type: "error", message: `シナリオ "${msg.scenarioId}" がありません` });
          if (!(TIME_LIMITS as readonly number[]).includes(msg.timeLimitSec)) return send({ type: "error", message: `制限時間は ${TIME_LIMITS.join("・")} 秒から選んでください` });
          // 編成の選択は部屋ごと(両陣営に同じ)。部屋の元のシナリオにする
          const based = msg.preset ? custom(scenario, msg.side, { preset: msg.preset }) : { ok: true as const, value: scenario };
          if (!based.ok) return send({ type: "error", message: based.errors.join(" / ") });
          const room = createRoom(based.value, msg.seed ?? Math.floor(Math.random() * 2 ** 31), msg.timeLimitSec, msg.preset);
          const token = randomBytes(16).toString("hex");
          const r = room.sit(msg.side, token, Date.now(), msg.custom);
          if (!r.ok) {
            rooms.delete(room.code);
            return send({ type: "error", message: r.errors.join(" / ") });
          }
          sit(room, msg.side, token);
          return broadcast(room.code);
        }
        if (msg.type === "joinRoom") {
          const room = rooms.get(msg.code.toUpperCase());
          if (!room) return send({ type: "error", message: `部屋 "${msg.code}" がありません` });
          const side = room.openSides[0];
          if (!side) return send({ type: "error", message: "この部屋は満員です" });
          const token = randomBytes(16).toString("hex");
          const r = room.sit(side, token, Date.now(), msg.custom);
          if (!r.ok) return send({ type: "error", message: `部屋に入れません:${r.errors.join(" / ")}` });
          sit(room, side, token);
          // 揃ったら、両者に試合の始まりを送る
          if (room.started) for (const s of room.seats.keys()) sendTo(room.code, s, welcome(room, s));
          return broadcast(room.code);
        }
        if (msg.type === "rejoinRoom") {
          const room = rooms.get(msg.code.toUpperCase());
          const side = room?.sideOf(msg.token);
          if (!room || !side) return send({ type: "error", message: "部屋に戻れません(部屋がなくなったか、鍵が違います)" });
          sit(room, side, msg.token);
          room.reconnect(side);
          if (room.started) send(welcome(room, side));
          return broadcast(room.code);
        }
        if (seat) {
          const { room, side } = seat;
          if (msg.type === "preview") {
            const preview = room.started ? sidePreview(room.loaded!, room.current!, side, msg.unitId, msg.waypoints, msg.moveMode) : null;
            return send({ type: "preview", requestId: msg.requestId, unitId: msg.unitId, preview, ...(preview ? {} : { error: "そのユニットには命令できません" }) });
          }
          if (msg.type === "submitTurn") return room.submit(side, msg.turn, msg.orders, msg.hqCommands, Date.now());
          return send({ type: "error", message: "オンライン対戦の部屋では、このメッセージは使えません" });
        }
        if (msg.type === "join") {
          // 続きから:記録を再生して、保存したときの状態に戻す
          if (msg.resume) {
            const scenario = findScenario(msg.resume.scenarioId);
            if (!scenario) return send({ type: "error", message: `記録のシナリオ "${msg.resume.scenarioId}" がありません` });
            const started = custom(scenario, msg.resume.side, startOptionsOf(msg.resume));
            if (!started.ok) return send({ type: "error", message: `記録の装備編成で始められません:${started.errors.join(" / ")}` });
            const r = Match.resume(started.value, msg.resume);
            match = r.match;
            return send({
              type: "welcome",
              info: match.info(),
              view: match.view(),
              modifiers: match.modifiers(),
              record: match.record(),
              resumed: { turns: msg.resume.turns.length, sameData: r.sameData },
              ...(r.last ? { last: r.last } : {}),
            });
          }
          const scenario = findScenario(msg.scenarioId ?? opts.defaultScenario);
          if (!scenario) return send({ type: "error", message: `シナリオ "${msg.scenarioId}" がありません` });
          const side = msg.side ?? opts.defaultSide;
          const how = startOptionsOf(msg);
          const started = custom(scenario, side, how);
          if (!started.ok) return send({ type: "error", message: `装備編成で始められません:${started.errors.join(" / ")}` });
          match = new Match(started.value, side, msg.seed ?? Math.floor(Math.random() * 2 ** 31), undefined, how);
          return send({ type: "welcome", info: match.info(), view: match.view(), modifiers: match.modifiers(), record: match.record() });
        }
        if (!match) return send({ type: "error", message: "先に join してください" });
        if (msg.type === "preview") {
          const preview = match.preview(msg.unitId, msg.waypoints, msg.moveMode);
          return send({ type: "preview", requestId: msg.requestId, unitId: msg.unitId, preview, ...(preview ? {} : { error: "そのユニットには命令できません" }) });
        }
        if (msg.type !== "submitTurn") return send({ type: "error", message: "このメッセージは使えません" });
        const outcome = match.submit(msg.turn, msg.orders, msg.hqCommands);
        return send({ type: "turnResolved", outcome, view: match.view(), modifiers: match.modifiers(), record: match.record() });
      } catch (e) {
        return send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    });
  });
  return { wss, http };
}
