import { parseClientMessage, type ServerMessage, type Tutorial } from "@brigade/protocol";
import type { LoadedScenario, PackSet } from "@brigade/sim-core";
import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { handleEditorRequest } from "./editor-api.js";
import { developmentInfo, Match, scenarioSummary, startScenario } from "./match.js";

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
}

/** WebSocket サーバー。接続ごとに 人間1人 対 AI の試合を持つ。同じポートで編成エディターの HTTP の口も受ける */
export function startServer(opts: ServerOptions): { wss: WebSocketServer; http: Server } {
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
    // 装備編成の画面:シナリオの開発の決まり・武器・編成表・差し替えられる部隊
    if (req.method === "GET" && new URL(req.url ?? "/", "http://localhost").pathname === "/api/development") {
      const id = new URL(req.url ?? "/", "http://localhost").searchParams.get("scenario") ?? opts.defaultScenario;
      const sc = opts.scenarios.get(id);
      const info = sc ? developmentInfo(sc) : null;
      res.writeHead(info ? 200 : 404, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(info ?? { error: sc ? "このシナリオのルールパックでは装備編成ができません" : `シナリオ "${id}" がありません` }));
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
  const custom = (scenario: LoadedScenario, side: string, c: Parameters<typeof startScenario>[3]) =>
    c && !opts.packs ? { ok: false as const, errors: ["このサーバーは装備編成を受け付けていません"] } : startScenario(scenario, opts.packs!, side, c);
  wss.on("connection", (ws: WebSocket) => {
    let match: Match | null = null;
    const send = (m: ServerMessage) => ws.send(JSON.stringify(m));
    ws.on("message", (data) => {
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return send({ type: "error", message: `メッセージが不正です: ${parsed.error}` });
      const msg = parsed.value;
      try {
        if (msg.type === "join") {
          // 続きから:記録を再生して、保存したときの状態に戻す
          if (msg.resume) {
            const scenario = opts.scenarios.get(msg.resume.scenarioId);
            if (!scenario) return send({ type: "error", message: `記録のシナリオ "${msg.resume.scenarioId}" がありません` });
            const started = custom(scenario, msg.resume.side, msg.resume.custom);
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
          const scenario = opts.scenarios.get(msg.scenarioId ?? opts.defaultScenario);
          if (!scenario) return send({ type: "error", message: `シナリオ "${msg.scenarioId}" がありません` });
          const side = msg.side ?? opts.defaultSide;
          const started = custom(scenario, side, msg.custom);
          if (!started.ok) return send({ type: "error", message: `装備編成で始められません:${started.errors.join(" / ")}` });
          match = new Match(started.value, side, msg.seed ?? Math.floor(Math.random() * 2 ** 31), undefined, msg.custom);
          return send({ type: "welcome", info: match.info(), view: match.view(), modifiers: match.modifiers(), record: match.record() });
        }
        if (!match) return send({ type: "error", message: "先に join してください" });
        if (msg.type === "preview") {
          const preview = match.preview(msg.unitId, msg.waypoints, msg.moveMode);
          return send({ type: "preview", requestId: msg.requestId, unitId: msg.unitId, preview, ...(preview ? {} : { error: "そのユニットには命令できません" }) });
        }
        const outcome = match.submit(msg.turn, msg.orders, msg.hqCommands);
        return send({ type: "turnResolved", outcome, view: match.view(), modifiers: match.modifiers(), record: match.record() });
      } catch (e) {
        return send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    });
  });
  return { wss, http };
}
