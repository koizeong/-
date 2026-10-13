import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // ゲームサーバー(WebSocket)へ中継する
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true, rewrite: (p) => p.replace(/^\/ws/, "") } },
  },
});
