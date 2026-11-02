// デスクトップ版:アプリの中でゲームサーバーを動かし、専用の窓で画面を開く(Electron)
import { app, BrowserWindow, dialog, shell } from "electron";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

/**
 * 使うポート。ブラウザの保存(セーブ・キャンペーン)はポートごとに分かれるので、毎回同じポートを使う。
 * ふさがっていれば次の番号を試す(そのときは別の保存場所になる)
 */
const PREFERRED_PORT = 47321;
const PORT_TRIES = 10;

const appDir = fileURLToPath(new URL("./app/", import.meta.url));

function portFree(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  for (let i = 0; i < PORT_TRIES; i++) if (await portFree(PREFERRED_PORT + i)) return PREFERRED_PORT + i;
  throw new Error(`ポート ${PREFERRED_PORT}〜${PREFERRED_PORT + PORT_TRIES - 1} がすべて使われています`);
}

async function startGameServer() {
  const port = await pickPort();
  const { boot } = await import(new URL("./app/server.mjs", import.meta.url).href);
  const { server } = boot({ dataDir: `${appDir}data`, staticDir: `${appDir}web`, port, editor: false, host: "127.0.0.1" });
  await new Promise((resolve, reject) => {
    if (server.http.listening) return resolve();
    server.http.once("listening", resolve);
    server.http.once("error", reject);
  });
  return port;
}

// 2つ目を起動したら、開いている窓を前に出す(ゲームサーバーを2つ立てない)
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  try {
    const port = await startGameServer();
    win = new BrowserWindow({ width: 1440, height: 900, autoHideMenuBar: true, title: "旅団戦術シミュレーション", backgroundColor: "#e9e4d6" });
    // 外へのリンクはふだんのブラウザで開く
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url);
      return { action: url.startsWith(`http://127.0.0.1:${port}`) ? "allow" : "deny" };
    });
    await win.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    dialog.showErrorBox("起動できませんでした", e instanceof Error ? e.message : String(e));
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
