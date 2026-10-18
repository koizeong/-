import type { GameRecord } from "@brigade/protocol";

/**
 * セーブデータ(試合の記録)の置き場所。ブラウザの localStorage に、試合ごとに1つ(ターンを解決するたびに上書き)。
 * localStorage が使えない環境(プライベートモードなど)でも、ゲームは動くようにする(保存できないだけ)
 */

export interface SaveEntry {
  /** 試合の識別(シナリオ・陣営・シード) */
  key: string;
  record: GameRecord;
  scenarioName: string;
  sideName: string;
  /** 次に解決するターン */
  turn: number;
  maxTurns: number;
  finished: boolean;
  savedAt: string;
}

const STORAGE_KEY = "brigade:saves";
/** 残しておく試合の数(古いものから消す) */
const MAX_SAVES = 20;

export const saveKey = (r: Pick<GameRecord, "scenarioId" | "side" | "seed">) => `${r.scenarioId}:${r.side}:${r.seed}`;

export function listSaves(): SaveEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as SaveEntry[]) : [];
    return Array.isArray(all) ? all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)) : [];
  } catch {
    return [];
  }
}

function write(entries: SaveEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_SAVES)));
  } catch {
    // 保存できない環境(容量切れ・プライベートモード)では何もしない
  }
}

export function putSave(entry: Omit<SaveEntry, "key" | "savedAt">): void {
  const key = saveKey(entry.record);
  const rest = listSaves().filter((e) => e.key !== key);
  write([{ ...entry, key, savedAt: new Date().toISOString() }, ...rest]);
}

export function removeSave(key: string): void {
  write(listSaves().filter((e) => e.key !== key));
}

/** 記録をファイルとして書き出す */
export function downloadRecord(record: GameRecord, name: string): void {
  const blob = new Blob([`${JSON.stringify(record)}\n`], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.brigade.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** 読み込んだファイルの中身が記録らしいか(細かい検証はサーバーが行う) */
export function looksLikeRecord(x: unknown): x is GameRecord {
  const r = x as Partial<GameRecord> | null;
  return !!r && r.version === 1 && typeof r.scenarioId === "string" && typeof r.side === "string" && typeof r.seed === "number" && Array.isArray(r.turns);
}
