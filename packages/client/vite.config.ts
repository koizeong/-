import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // ゲームの画面(index.html)・編成エディター(editor.html)・装備編成(develop.html)の3ページ
  build: { rollupOptions: { input: { main: "index.html", editor: "editor.html", develop: "develop.html" } } },
  server: {
    port: 5173,
    // ゲームサーバー(WebSocket)へ中継する
    proxy: {
      "/ws": { target: "ws://localhost:8787", ws: true, rewrite: (p) => p.replace(/^\/ws/, "") },
      // 編成エディターの HTTP の口(パックの読み込みと保存)
      "/api": { target: "http://localhost:8787" },
    },
  },
});
