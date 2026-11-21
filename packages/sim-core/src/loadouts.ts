import type { Toe, ToePack } from "./toe.js";

/**
 * 航空機の兵装の積み替え(編成表の air.loadouts)。
 * 兵装ごとに編成表を1つずつ作り、隊の編成表(unit.toe)を差し替えることで兵装を替える。
 * こうすると、火力・爆弾と魚雷・対空・図鑑など、編成表の武器を読む所はそのまま兵装を反映する。
 * 最初の兵装は元の ID のまま、ほかの兵装は「元の ID@兵装の id」。
 */

/** 兵装の編成表の ID(最初の兵装は元の ID) */
export function loadoutToeId(baseId: string, toe: Toe, loadoutId: string): string {
  const first = toe.air?.loadouts?.[0]?.id;
  return loadoutId === first ? baseId : `${baseId}@${loadoutId}`;
}

/** 兵装を選べる編成表に、兵装ごとの編成表を足したパックを返す(元のパックは変えない。兵装のない編成表はそのまま) */
export function expandLoadouts(pack: ToePack): ToePack {
  const toes: Record<string, Toe> = { ...pack.toes };
  let changed = false;
  for (const [id, toe] of Object.entries(pack.toes)) {
    const los = toe.air?.loadouts;
    if (!los || toe.air?.baseToe) continue;
    changed = true;
    const swap = new Set(los.flatMap((l) => l.weapons.map((w) => w.weapon)));
    for (const lo of los) {
      const elements = toe.elements.map((e) => ({ ...e, weapons: [...e.weapons.filter((w) => !swap.has(w.weapon)), ...lo.weapons.map((w) => ({ ...w }))] }));
      toes[loadoutToeId(id, toe, lo.id)] = { ...toe, elements, air: { ...toe.air!, loadout: lo.id, baseToe: id } };
    }
  }
  return changed ? { ...pack, toes } : pack;
}

/** 隊の今の兵装(兵装を選べない編成表は undefined) */
export function currentLoadout(toe: Toe | undefined): NonNullable<NonNullable<Toe["air"]>["loadouts"]>[number] | undefined {
  const los = toe?.air?.loadouts;
  if (!los) return undefined;
  return los.find((l) => l.id === toe!.air!.loadout) ?? los[0];
}
