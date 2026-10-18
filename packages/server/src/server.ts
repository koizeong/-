import { parseClientMessage, type ServerMessage } from "@brigade/protocol";
import type { LoadedScenario } from "@brigade/sim-core";
import { WebSocketServer, type WebSocket } from "ws";
import { Match } from "./match.js";

export interface ServerOptions {
  port: number;
  scenarios: Map<string, LoadedScenario>;
  defaultScenario: string;
  defaultSide: string;
}

/** WebSocket サーバー。接続ごとに 人間1人 対 AI の試合を持つ */
export function startServer(opts: ServerOptions): WebSocketServer {
  const wss = new WebSocketServer({ port: opts.port });
  wss.on("connection", (ws: WebSocket) => {
    let match: Match | null = null;
    const send = (m: ServerMessage) => ws.send(JSON.stringify(m));
    ws.on("message", (data) => {
      const parsed = parseClientMessage(data.toString());
      if (!parsed.ok) return send({ type: "error", message: `メッセージが不正です: ${parsed.error}` });
      const msg = parsed.value;
      try {
        if (msg.type === "join") {
          const scenario = opts.scenarios.get(msg.scenarioId ?? opts.defaultScenario);
          if (!scenario) return send({ type: "error", message: `シナリオ "${msg.scenarioId}" がありません` });
          match = new Match(scenario, msg.side ?? opts.defaultSide, msg.seed ?? Math.floor(Math.random() * 2 ** 31));
          return send({ type: "welcome", info: match.info(), view: match.view(), modifiers: match.modifiers() });
        }
        if (!match) return send({ type: "error", message: "先に join してください" });
        const outcome = match.submit(msg.turn, msg.orders, msg.hqCommands);
        return send({ type: "turnResolved", outcome, view: match.view(), modifiers: match.modifiers() });
      } catch (e) {
        return send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    });
  });
  return wss;
}
