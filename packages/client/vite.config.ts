import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // ゲームの画面(index.html)・編成エディター(editor.html)・装備編成(develop.html)・地図の生成(generator.html)の4ページ
  build: { rollupOptions: { input: { main: "index.html", editor: "editor.html", develop: "develop.html", generator: "generator.html" } } },
  server: {
    port: 5173,
    // LAN=1 pnpm dev で、同じネットワークのほかのマシンから開けるようにする(オンライン対戦)
    host: process.env.LAN === "1",
    // ゲームサーバー(WebSocket)へ中継する
    proxy: {
      "/ws": { target: "ws://localhost:8787", ws: true, rewrite: (p) => p.replace(/^\/ws/, ""), xfwd: true },
      // 編成エディターの HTTP の口(パックの読み込みと保存)
      // xfwd:元の送り主を x-forwarded-for で渡す(編成エディターの保存は localhost からだけ。LAN=1 で公開しても守る)
      "/api": { target: "http://localhost:8787", xfwd: true },
    },
  },
});
