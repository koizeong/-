import type { ClientMessage, ServerMessage } from "@brigade/protocol";

/** ゲームサーバーとの接続(vite の /ws 中継を通す) */
export class Connection {
  private ws: WebSocket;
  private pending: ClientMessage[] = [];

  constructor(onMessage: (m: ServerMessage) => void, onStatus: (s: "open" | "closed") => void) {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      onStatus("open");
      for (const m of this.pending.splice(0)) this.ws.send(JSON.stringify(m));
    };
    this.ws.onclose = () => onStatus("closed");
    this.ws.onmessage = (e) => onMessage(JSON.parse(String(e.data)) as ServerMessage);
  }

  send(m: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else this.pending.push(m);
  }

  close(): void {
    this.ws.close();
  }
}
