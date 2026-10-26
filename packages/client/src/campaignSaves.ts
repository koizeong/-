import type { CampaignSnapshot } from "@brigade/campaign";

/**
 * キャンペーンの進み具合の置き場所(ブラウザの localStorage)。キャンペーンごとに1つの枠(段階を進めるたびに上書き)。
 * battle:この段階に指揮している戦闘の戦術シナリオの ID とシード(試合の記録は saves.ts の方に自動保存される)
 */
export interface CampaignSave {
  key: string;
  name: string;
  sideName: string;
  snapshot: CampaignSnapshot;
  battle?: { scenarioId: string; seed: number };
  savedAt: string;
}

const STORAGE_KEY = "brigade:campaigns";
const MAX = 10;

export const campaignKey = (s: Pick<CampaignSnapshot, "campaignId" | "side" | "state">) => `${s.campaignId}:${s.side}:${s.state.seed}`;

export function listCampaignSaves(): CampaignSave[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as CampaignSave[]) : [];
    return Array.isArray(all) ? all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)) : [];
  } catch {
    return [];
  }
}

function write(list: CampaignSave[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 保存できない環境では何もしない
  }
}

export function putCampaignSave(entry: Omit<CampaignSave, "key" | "savedAt">): CampaignSave {
  const key = campaignKey(entry.snapshot);
  const saved = { ...entry, key, savedAt: new Date().toISOString() };
  write([saved, ...listCampaignSaves().filter((e) => e.key !== key)]);
  return saved;
}

export function getCampaignSave(key: string): CampaignSave | undefined {
  return listCampaignSaves().find((e) => e.key === key);
}

export function removeCampaignSave(key: string): void {
  write(listCampaignSaves().filter((e) => e.key !== key));
}

/** 試合の画面からキャンペーンに戻ったときに開く枠(結果の画面の「作戦地図へ戻る」) */
const ACTIVE_KEY = "brigade:campaign-active";
export function setActiveCampaign(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(ACTIVE_KEY, key);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // 何もしない
  }
}
export function activeCampaign(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
