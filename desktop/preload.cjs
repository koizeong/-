// デスクトップ版の画面へ渡す口(オンライン対戦の受け付け・ほかの PC の部屋へ入る・自分の PC に戻る)。
// 入った先の PC の画面にも渡るので、ゲームの外のことはできない小さな口だけにする
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  /** 対戦を受け付ける(true)・やめる(false)。受け付けている間のアドレスと番号を返す */
  setHosting: (on) => ipcRenderer.invoke("desktop:setHosting", !!on),
  hostingStatus: () => ipcRenderer.invoke("desktop:hostingStatus"),
  /** ほかの PC(部屋の主)のゲームへつなぐ。address は「IP」か「IP:番号」 */
  connect: (address) => ipcRenderer.invoke("desktop:connect", String(address)),
  /** 自分の PC のゲームに戻る */
  goHome: () => ipcRenderer.invoke("desktop:goHome"),
  /** シナリオパックのフォルダを開く・起動し直す(パックを足したあと読み込む) */
  openModsFolder: () => ipcRenderer.invoke("desktop:openModsFolder"),
  restart: () => ipcRenderer.invoke("desktop:restart"),
});
