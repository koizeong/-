import type { CatalogResponse } from "@brigade/protocol";
import { toeHitPoints, type Equipment, type PackSet, type Toe, type Weapon } from "@brigade/sim-core";

/** 国の表示名(装備品の nation・編成表の ID の頭) */
export const NATION_NAMES: Record<string, string> = { de: "ドイツ軍", us: "アメリカ軍", su: "ソ連軍", uk: "英連邦軍", jp: "日本軍", fr: "フランス軍", it: "イタリア軍", kp: "朝鮮人民軍", cn: "中国人民志願軍", au: "オーストラリア軍", nl: "オランダ軍", generic: "汎用(演習)" };

const KNOT = 1852 / 3600;

/** 編成表の国:ID の頭(de- など)。古いパックの de_・us_ も見る。分からなければ汎用 */
function nationOf(id: string): string {
  const m = /^([a-z]{2})[-_]/.exec(id);
  return m && NATION_NAMES[m[1]!] ? m[1]! : "generic";
}

/** 装備と編制の図鑑の中身(読み込んだすべてのパック) */
export function catalogOf(packs: PackSet): CatalogResponse {
  const weapons: Record<string, Weapon> = Object.assign({}, ...Object.values(packs.weapons).map((p) => p.weapons));
  const equipment: Record<string, Equipment> = Object.assign({}, ...Object.values(packs.weapons).map((p) => p.equipment ?? {}));
  const toes: Record<string, Toe> = Object.assign({}, ...Object.values(packs.toes).map((p) => p.toes));
  const usedBy: Record<string, string[]> = {};
  for (const [id, t] of Object.entries(toes))
    for (const e of t.elements) for (const ref of e.equipment ?? []) (usedBy[ref.item] ??= []).includes(id) || usedBy[ref.item]!.push(id);
  const branchNames = Object.fromEntries(Object.values(packs.branches).flatMap((p) => Object.entries(p.branches).map(([id, b]) => [id, b.name])));
  const branchSymbols = Object.fromEntries(Object.values(packs.branches).flatMap((p) => Object.entries(p.branches).map(([id, b]) => [id, b.symbol])));
  return {
    nations: NATION_NAMES,
    equipment: Object.fromEntries(
      Object.entries(equipment).map(([id, e]) => [
        id,
        {
          name: e.name,
          ...(e.short ? { short: e.short } : {}),
          ...(e.nation ? { nation: e.nation } : {}),
          ...(e.years ? { years: e.years } : {}),
          category: e.category,
          weapons: e.weapons,
          crew: e.crew,
          hitPoints: e.hitPoints,
          armored: e.armored,
          ...(e.armorMm ? { armorMm: e.armorMm } : {}),
          specs: e.specs,
          ...(e.description ? { description: e.description } : {}),
          usedBy: usedBy[id] ?? [],
        },
      ]),
    ),
    weapons: Object.fromEntries(
      Object.entries(weapons).map(([id, w]) => [
        id,
        {
          name: w.name,
          bands: w.bands,
          indirect: w.indirect,
          arcing: w.arcing,
          effectiveness: w.effectiveness,
          ...(w.naval ? { naval: { shellKg: w.naval.shellKg, rofPerMin: w.naval.rofPerMin, beltPenetration: w.naval.beltPenetration } } : {}),
          ...(w.torpedoRun ? { torpedoRun: { rangeM: w.torpedoRun.rangeM, speedKn: Math.round(w.torpedoRun.speedMpm / 60 / KNOT), warheadKg: w.torpedoRun.warheadKg } } : {}),
        },
      ]),
    ),
    ships: shipsOf(packs, toes),
    toes: Object.fromEntries(
      Object.entries(toes).map(([id, t]) => [
        id,
        {
          name: t.name,
          branch: t.branch,
          nation: nationOf(id),
          real: t.elements.some((e) => e.personnel !== undefined || e.equipment !== undefined),
          hitPoints: toeHitPoints(t),
          elements: t.elements.map((e) => ({
            name: e.name,
            count: e.count,
            hitPoints: e.hitPoints,
            weapons: e.weapons,
            armored: !!e.armored,
            ...(e.personnel !== undefined ? { personnel: e.personnel } : {}),
            ...(e.equipment ? { equipment: e.equipment } : {}),
            ...(e.group ? { group: e.group } : {}),
            ...(e.groupCount ? { groupCount: e.groupCount } : {}),
            ...(e.attachedFrom ? { attachedFrom: e.attachedFrom } : {}),
          })),
        },
      ]),
    ),
    branchNames,
    symbols: {
      branches: branchSymbols,
      toes: Object.fromEntries(Object.entries(toes).map(([id, t]) => [id, { ...(t.symbol?.echelon ? { echelon: t.symbol.echelon } : {}), modifiers: t.symbol?.modifiers ?? [] }])),
    },
  };
}

/** 図鑑の艦艇:編成表の ship を持つ艦級。年は艦級を収めたパックの名前(…-1942 など)から */
function shipsOf(packs: PackSet, toes: Record<string, Toe>): CatalogResponse["ships"] {
  const yearOf = new Map<string, number>();
  for (const [packId, p] of Object.entries(packs.toes)) {
    const m = /(19\d\d)/.exec(packId);
    for (const id of Object.keys(p.toes)) if (m) yearOf.set(id, Number(m[1]));
  }
  const out: CatalogResponse["ships"] = {};
  for (const [id, t] of Object.entries(toes)) {
    const s = t.ship;
    if (!s) continue;
    const fp = s.floatplanes ? toes[s.floatplanes.toe] : undefined;
    const planes = fp?.elements.reduce((n, e) => n + e.count, 0);
    out[id] = {
      name: t.name,
      nation: nationOf(id),
      ...(yearOf.has(id) ? { year: yearOf.get(id)! } : {}),
      type: s.type,
      ...(s.abbr ? { abbr: s.abbr } : {}),
      ...(s.displacementT ? { displacementT: s.displacementT } : {}),
      speedKn: Math.round(((t.speedMpm ?? 0) / 60 / KNOT) * 10) / 10,
      beltMm: s.beltMm,
      deckMm: s.deckMm,
      turretMm: s.turretMm,
      batteries: s.batteries.map((b) => ({
        weapon: b.weapon,
        guns: b.guns,
        ...(b.mounts !== undefined ? { mounts: b.mounts } : {}),
        bow: b.bow,
        beam: b.beam,
        stern: b.stern,
        ...(b.apPerGun !== undefined ? { apPerGun: b.apPerGun } : {}),
        ...(b.hePerGun !== undefined ? { hePerGun: b.hePerGun } : {}),
      })),
      torpedoReloads: s.torpedoReloads,
      ...(t.radarRangeM ? { radarRangeM: t.radarRangeM } : {}),
      ...(t.fireControlRadar ? { fireControlRadarM: t.fireControlRadar.rangeM } : {}),
      nightLookout: s.nightLookout,
      ...(s.searchlightM ? { searchlightM: s.searchlightM } : {}),
      ...(fp ? { floatplanes: { name: fp.name, ...(planes ? { aircraft: planes } : {}) } } : {}),
      carrier: !!t.carrier,
    };
  }
  return out;
}
