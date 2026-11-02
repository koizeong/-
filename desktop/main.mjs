// デスクトップ版:アプリの中でゲームサーバーを動かし、専用の窓で画面を開く(Electron)
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { connect as tcpConnect, createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * 使うポート。ブラウザの保存(セーブ・キャンペーン)はポートごとに分かれるので、毎回同じポートを使う。
 * ふさがっていれば次の番号を試す(そのときは別の保存場所になる)
 */
const PREFERRED_PORT = 47321;
const PORT_TRIES = 10;
/** オンライン対戦を受け付けるときに、ほかの PC から入ってもらう番号(すべてのアドレスで待ち受け、自分のゲームサーバーへ中継する) */
const HOST_PORT = 47320;

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

/** 自分の PC のアドレス(IPv4。同じ Wi-Fi・Tailscale から入ってもらう先) */
function ownAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

/** オンライン対戦の受け付け:すべてのアドレスの HOST_PORT で受け、自分のゲームサーバー(127.0.0.1)へそのまま中継する */
let relay = null;
function startHosting(gamePort) {
  if (relay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = createServer((client) => {
      const upstream = tcpConnect(gamePort, "127.0.0.1");
      client.pipe(upstream).pipe(client);
      const close = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on("error", close);
      upstream.on("error", close);
    });
    s.once("error", reject);
    s.listen(HOST_PORT, "0.0.0.0", () => {
      relay = s;
      resolve();
    });
  });
}
function stopHosting() {
  relay?.close();
  relay = null;
}

/** ほかの PC への接続先(「IP」か「IP:番号」。名前・IPv4 だけ) */
function remoteUrl(address) {
  const m = /^\s*([A-Za-z0-9.\-]+)(?::(\d{1,5}))?\s*$/.exec(address);
  if (!m) return null;
  return `http://${m[1]}:${m[2] ?? HOST_PORT}/?menu=online`;
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
    const home = `http://127.0.0.1:${port}/`;
    ipcMain.handle("desktop:setHosting", async (_e, on) => {
      if (on) await startHosting(port);
      else stopHosting();
      return { hosting: !!relay, addresses: ownAddresses(), port: HOST_PORT };
    });
    ipcMain.handle("desktop:hostingStatus", () => ({ hosting: !!relay, addresses: ownAddresses(), port: HOST_PORT, remote: !!win && !win.webContents.getURL().startsWith(home) }));
    ipcMain.handle("desktop:connect", async (_e, address) => {
      const url = remoteUrl(address);
      if (!url) return { ok: false, error: "アドレスの形が正しくありません(例:192.168.1.23 や 100.64.0.5)" };
      try {
        await win.loadURL(url);
        return { ok: true };
      } catch {
        await win.loadURL(`${home}?menu=online`);
        return { ok: false, error: "つながりませんでした。相手が「対戦を受け付ける」を入れているか、アドレスが合っているかを確かめてください" };
      }
    });
    ipcMain.handle("desktop:goHome", () => win.loadURL(`${home}?menu=online`));
    win = new BrowserWindow({
      width: 1440,
      height: 900,
      autoHideMenuBar: true,
      title: "旅団戦術シミュレーション",
      backgroundColor: "#e9e4d6",
      webPreferences: { preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)) },
    });
    // 外へのリンクはふだんのブラウザで開く
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!url.startsWith(home)) shell.openExternal(url);
      return { action: url.startsWith(home) ? "allow" : "deny" };
    });
    await win.loadURL(home);
  } catch (e) {
    dialog.showErrorBox("起動できませんでした", e instanceof Error ? e.message : String(e));
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
