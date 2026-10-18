import { parseClientMessage, type ServerMessage } from "@brigade/protocol";
import type { LoadedScenario } from "@brigade/sim-core";
import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { handleEditorRequest } from "./editor-api.js";
import { Match, scenarioSummary } from "./match.js";

export interface ServerOptions {
  port: number;
  scenarios: Map<string, LoadedScenario>;
  defaultScenario: string;
  defaultSide: string;
  /** data/ のディレクトリ。指定すれば編成エディターの HTTP の口(/api/packs・/api/save)を開く */
  dataDir?: string;
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
    if (!opts.dataDir) return done(false);
    // 保存したら、これから始まる試合が新しいデータを使うよう、シナリオを読み直す
    handleEditorRequest(req, res, opts.dataDir, (fresh) => {
      opts.scenarios.clear();
      for (const [k, v] of fresh) opts.scenarios.set(k, v);
    })
      .then(done)
      .catch((e: unknown) => {
        res.writeHead(500);
        res.end(e instanceof Error ? e.message : String(e));
      });
  });
  const wss = new WebSocketServer({ server: http });
  http.listen(opts.port);
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
            const r = Match.resume(scenario, msg.resume);
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
          match = new Match(scenario, msg.side ?? opts.defaultSide, msg.seed ?? Math.floor(Math.random() * 2 ** 31));
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
