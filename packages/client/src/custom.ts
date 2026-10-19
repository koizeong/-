import type { DevelopmentInfo } from "@brigade/protocol";
import { applyBundle, parseCustomBundle, toeCost, USER_PREFIX, type BranchPack, type CustomBundle, type Toe, type WeaponPack } from "@brigade/sim-core";

/**
 * 装備編成の持ち込み(開発した武器・連隊テンプレート)の置き場所。ブラウザの localStorage に1つ。
 * ファイルへの書き出し・読み込みで、別のブラウザや相手に渡せる。正しいかの最終的な検証はサーバーが行う
 */

const STORAGE_KEY = "brigade:custom";

export const emptyBundle = (): CustomBundle => ({ version: 1, designs: {}, templates: {} });

export function loadBundle(): CustomBundle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyBundle();
    const r = parseCustomBundle(JSON.parse(raw));
    return r.ok ? r.value : emptyBundle();
  } catch {
    return emptyBundle();
  }
}

export function saveBundle(b: CustomBundle): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // 保存できない環境(容量切れ・プライベートモード)では何もしない
  }
}

export function downloadBundle(b: CustomBundle): void {
  const blob = new Blob([`${JSON.stringify(b, null, 2)}\n`], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-equipment.brigade-custom.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/** ファイルの中身を持ち込みとして読む(形が違えば誤りを返す) */
export function readBundle(text: string): { ok: true; value: CustomBundle } | { ok: false; errors: string[] } {
  try {
    return parseCustomBundle(JSON.parse(text));
  } catch {
    return { ok: false, errors: ["JSONとして読めません"] };
  }
}

/** シナリオの武器・編成表に持ち込みを重ねたもの。テンプレートごとの誤りも返す(誤りのあるテンプレートは使えない) */
export function applied(info: DevelopmentInfo, bundle: CustomBundle): { weapons: WeaponPack; toes: Record<string, Toe>; errors: Record<string, string[]> } {
  const branches: BranchPack = { id: "*", branches: Object.fromEntries(Object.entries(info.branchNames).map(([id, name]) => [id, { name } as BranchPack["branches"][string]])) };
  const errors: Record<string, string[]> = {};
  // 1つずつ重ねて、壊れた武器・テンプレートだけを外す
  const okDesigns: CustomBundle["designs"] = {};
  for (const [id, d] of Object.entries(bundle.designs)) {
    const r = applyBundle({ version: 1, designs: { [id]: d }, templates: {} }, info.development, info.weapons, info.toes, branches);
    if (r.ok) okDesigns[id] = d;
    else errors[`design:${id}`] = r.errors;
  }
  const base = applyBundle({ version: 1, designs: okDesigns, templates: {} }, info.development, info.weapons, info.toes, branches);
  const weapons = base.ok ? base.value.weapons : info.weapons;
  const toes: Record<string, Toe> = { ...info.toes.toes };
  for (const [id, t] of Object.entries(bundle.templates)) {
    const r = applyBundle({ version: 1, designs: okDesigns, templates: { [id]: t } }, info.development, info.weapons, info.toes, branches);
    if (r.ok) toes[USER_PREFIX + id] = r.value.toes.toes[USER_PREFIX + id]!;
    else errors[`template:${id}`] = r.errors;
  }
  return { weapons, toes, errors };
}

/** 編成表の点数 */
export function costOf(info: DevelopmentInfo, weapons: WeaponPack, toe: Toe): number {
  return toeCost(toe, weapons, info.development.cost);
}

/** 差し替えの点数(陣営の差し替えられる部隊の、差し替え後の合計と上限) */
export function budgetOf(info: DevelopmentInfo, side: string, bundle: CustomBundle, subs: Record<string, string>): { used: number; limit: number } {
  const a = applied(info, bundle);
  const s = info.sides[side];
  if (!s) return { used: 0, limit: 0 };
  let before = 0;
  let after = 0;
  for (const u of s.units) {
    before += costOf(info, a.weapons, a.toes[u.toe]!);
    const t = subs[u.id] ? a.toes[USER_PREFIX + subs[u.id]!] : undefined;
    after += costOf(info, a.weapons, t ?? a.toes[u.toe]!);
  }
  return { used: after, limit: before * s.budgetMultiplier };
}
