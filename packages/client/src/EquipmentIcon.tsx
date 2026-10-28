/**
 * 装備品の種類ごとの小さな絵(SVG の線画。横向きの側面図ふう)。表示だけ
 */

export const CATEGORY_NAMES: Record<string, string> = {
  rifle: "小銃",
  smg: "短機関銃",
  lmg: "軽機関銃",
  hmg: "重機関銃",
  mortar: "迫撃砲",
  at_rifle: "対戦車銃",
  at_launcher: "対戦車ロケット",
  flamethrower: "火炎放射器",
  infantry_gun: "歩兵砲",
  at_gun: "対戦車砲",
  field_gun: "野砲",
  howitzer: "榴弾砲",
  heavy_artillery: "重砲",
  rocket_artillery: "ロケット砲",
  aa_gun: "対空砲",
  tank: "戦車",
  assault_gun: "突撃砲",
  tank_destroyer: "駆逐戦車",
  spg: "自走砲",
  armored_car: "装甲車",
  halftrack: "半装軌車",
  truck: "トラック",
  prime_mover: "牽引車",
  other: "その他",
};

/** 一覧の並べ方(小火器 → 支援火器 → 砲 → 車両) */
export const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);

const P: Record<string, string> = {
  // 小銃:銃床・機関部・銃身
  rifle: "M2 13 L9 11 L14 11 L15 10 L30 10 L30 11.5 L15 12 L13 14 L9 13.5 Z",
  smg: "M5 12 L10 11 L14 11 L14 10 L26 10 L26 11.5 L16 12 L15 15 L13 15 L12.5 12.5 L8 13.5 Z",
  lmg: "M2 12.5 L8 11 L13 11 L13 9.5 L30 9.5 L30 11 L14 11.5 L13 13 L9 13 Z M20 11 L17 16 M20 11 L23 16",
  hmg: "M6 10 L28 10 L28 12 L6 12 Z M10 12 L5 18 M10 12 L12 18 M10 12 L18 18 M28 10.5 L31 10.5",
  mortar: "M8 18 L24 18 M10 18 L22 5 L24 6 L12.5 18 M15 18 L18 11",
  at_rifle: "M1 13 L7 11.5 L12 11.5 L12 10.5 L31 10.5 L31 11.5 L13 12.5 L11 14 L7 14 Z M20 12 L18 16 M20 12 L22 16",
  at_launcher: "M3 9 L29 9 L29 13 L3 13 Z M12 13 L12 16 M18 13 L18 16 M29 10 L31 10 L31 12 L29 12",
  flamethrower: "M6 8 L10 8 L10 18 L6 18 Z M10 13 L26 12 L28 13 L26 14 L10 14",
  infantry_gun: "M4 11 L24 8 L24 10 L5 13 Z M10 14 a3.5 3.5 0 1 0 0.1 0 M12 12 L20 17",
  at_gun: "M4 12 L31 10 L31 11.5 L5 13.5 Z M10 13 L8 11 L13 10 L13 14 Z M12 15 a3 3 0 1 0 0.1 0 M14 13 L24 17",
  field_gun: "M3 12 L30 8 L30 9.5 L4 13.5 Z M11 15 a3.5 3.5 0 1 0 0.1 0 M13 13 L24 18",
  howitzer: "M4 13 L26 6 L27 7.5 L5 14.5 Z M10 16 a3.5 3.5 0 1 0 0.1 0 M12 14 L24 18 M24 18 L28 18",
  heavy_artillery: "M3 14 L27 5 L28 7 L4 16 Z M8 17 a3.5 3.5 0 1 0 0.1 0 M15 17 a3.5 3.5 0 1 0 0.1 0 M10 15 L27 19",
  rocket_artillery: "M4 16 L24 16 M8 16 L8 12 M20 16 L20 12 M6 12 L26 6 L26 9 L6 15 Z",
  aa_gun: "M8 17 L24 17 M16 17 L16 12 M16 12 L28 3 L29 4.5 L17 13 M12 14 L20 14",
  tank: "M2 15 L4 12 L28 12 L30 15 L27 18 L5 18 Z M9 12 L11 8 L20 8 L22 12 M20 9.5 L31 9 L31 10 L20 10.5 M6 16 a1.4 1.4 0 1 0 0.1 0 M11 16 a1.4 1.4 0 1 0 0.1 0 M16 16 a1.4 1.4 0 1 0 0.1 0 M21 16 a1.4 1.4 0 1 0 0.1 0 M26 16 a1.4 1.4 0 1 0 0.1 0",
  assault_gun: "M2 15 L4 12 L28 12 L30 15 L27 18 L5 18 Z M8 12 L10 9 L22 9 L24 12 M10 10.5 L31 10.5 L31 11.5 L10 11.5 M6 16 a1.4 1.4 0 1 0 0.1 0 M11 16 a1.4 1.4 0 1 0 0.1 0 M16 16 a1.4 1.4 0 1 0 0.1 0 M21 16 a1.4 1.4 0 1 0 0.1 0 M26 16 a1.4 1.4 0 1 0 0.1 0",
  tank_destroyer: "M2 15 L4 12 L28 12 L30 15 L27 18 L5 18 Z M8 12 L13 8 L24 8 L26 12 M14 9.5 L31 9 L31 10 L14 10.5 M6 16 a1.4 1.4 0 1 0 0.1 0 M11 16 a1.4 1.4 0 1 0 0.1 0 M16 16 a1.4 1.4 0 1 0 0.1 0 M21 16 a1.4 1.4 0 1 0 0.1 0 M26 16 a1.4 1.4 0 1 0 0.1 0",
  spg: "M2 15 L4 12 L28 12 L30 15 L27 18 L5 18 Z M8 12 L8 7 L22 7 L22 12 M18 8 L30 4 L30 5.5 L18 9.5",
  armored_car: "M3 14 L6 10 L24 10 L28 14 L28 16 L3 16 Z M12 10 L13 7 L19 7 L20 10 M19 8 L27 8 M8 17 a2 2 0 1 0 0.1 0 M23 17 a2 2 0 1 0 0.1 0",
  halftrack: "M2 15 L3 11 L9 10 L11 8 L28 8 L29 15 Z M6 17 a2 2 0 1 0 0.1 0 M14 17 L27 17 L28 15 L13 15 Z",
  truck: "M2 15 L2 10 L8 10 L10 7 L13 7 L13 15 Z M13 6 L30 6 L30 15 L13 15 M6 17 a2 2 0 1 0 0.1 0 M20 17 a2 2 0 1 0 0.1 0 M26 17 a2 2 0 1 0 0.1 0",
  prime_mover: "M2 15 L3 10 L10 10 L12 7 L22 7 L22 15 Z M5 17 L22 17 L23 15 L4 15 Z",
  other: "M8 8 L24 8 L24 18 L8 18 Z",
};

/** 種類の絵。armored:装甲の装備品は少し濃く塗る */
export function EquipmentIcon({ category, size = 32, armored = false, title }: { category: string; size?: number; armored?: boolean; title?: string }) {
  const d = P[category] ?? P.other!;
  const filled = ["tank", "assault_gun", "tank_destroyer", "armored_car", "halftrack", "truck", "prime_mover", "spg"].includes(category);
  return (
    <svg className="equipment-icon" width={size} height={(size * 20) / 32} viewBox="0 0 32 20" aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d={d} fill={filled ? (armored ? "#5c5a46" : "#8a866a") : "none"} stroke="#2b2418" strokeWidth={filled ? 0.8 : 1.3} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
