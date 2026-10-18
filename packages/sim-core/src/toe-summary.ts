import type { BranchPack } from "./branch.js";
import type { RulePack } from "./rulepack.js";
import { toeFire, toeHitPoints, toeIndirectAmmoPerMin, toeIndirectMaxRange, toeDirectMaxRange, type Toe, type ToePack } from "./toe.js";
import { weaponMaxRange, type Weapon, type WeaponPack } from "./weapon.js";

/**
 * 編成表から導き出される値(編成エディター用)。ゲームと同じ関数で計算するので、エディターの数字とゲームの動きは一致する。
 * 値はすべて満員(戦力100%)のとき
 */
export interface ToeSummary {
  hitPoints: number;
  /** 要素の数の合計(中隊・小隊などの数) */
  elementCount: number;
  direct: {
    maxRangeM: number;
    /** 距離ごとの1分あたりの火力(非装甲の目標・装甲の目標) */
    curve: { distanceM: number; soft: number; armored: number }[];
    /** 制圧のしやすさ(300mでの、火力で重みづけした平均) */
    suppression: number;
    /** 撃っている間の弾薬消費(トン/分)と、携行備蓄で撃ち続けられる時間(分。消費がなければ null) */
    ammoPerMin: number;
    ammoMinutes: number | null;
  };
  indirect: {
    maxRangeM: number;
    curve: { distanceM: number; soft: number; armored: number }[];
    suppression: number;
    ammoPerMin: number;
    ammoMinutes: number | null;
  };
  /** 対空の力(武器の antiAir の合計) */
  antiAir: number;
  /** 行軍・展開したままの速度(km/時。平地・疲労なし) */
  marchKmh: number;
  deployedKmh: number;
  /** 携行燃料で進める距離(km。燃料を使わなければ null) */
  fuelRangeKm: number | null;
}

/** グラフの距離の刻み(最大射程を CURVE_STEPS 等分) */
const CURVE_STEPS = 24;

function curve(toe: Toe, weapons: WeaponPack, indirect: boolean, maxRangeM: number) {
  if (maxRangeM <= 0) return [];
  const out: { distanceM: number; soft: number; armored: number }[] = [];
  for (let i = 0; i <= CURVE_STEPS; i++) {
    // 0m は射程帯の最初の値と同じなので、少しだけ離した点から始める
    const d = Math.max(1, (maxRangeM * i) / CURVE_STEPS);
    out.push({ distanceM: d, soft: toeFire(toe, weapons, d, 0, indirect).firepower, armored: toeFire(toe, weapons, d, 1, indirect).firepower });
  }
  return out;
}

function directAmmoPerMin(toe: Toe, weapons: WeaponPack): number {
  let s = 0;
  for (const e of toe.elements) for (const ref of e.weapons) {
    const w = weapons.weapons[ref.weapon];
    if (w && !w.indirect) s += e.count * ref.count * w.ammoPerMin;
  }
  return s;
}

/** 編成表の導出値。参照の切れた武器・兵科があれば null(先に checkToe で直す) */
export function toeSummary(toe: Toe, weapons: WeaponPack, branches: BranchPack, rules: RulePack): ToeSummary | null {
  if (checkToe(toe, weapons, branches).some((x) => x.level === "error")) return null;
  const branch = branches.branches[toe.branch]!;
  const dMax = toeDirectMaxRange(toe, weapons);
  const iMax = toeIndirectMaxRange(toe, weapons);
  const cap = toe.supply.ammoCapacityT;
  const dAmmo = directAmmoPerMin(toe, weapons);
  const iAmmo = iMax > 0 ? toeIndirectAmmoPerMin(toe, weapons, 1) : 0;
  let antiAir = 0;
  for (const e of toe.elements) for (const ref of e.weapons) antiAir += e.count * ref.count * (weapons.weapons[ref.weapon]?.antiAir ?? 0);
  const marchKmh = (branch.marchSpeedMpm * 60) / 1000;
  return {
    hitPoints: toeHitPoints(toe),
    elementCount: toe.elements.reduce((s, e) => s + e.count, 0),
    direct: {
      maxRangeM: dMax,
      curve: curve(toe, weapons, false, dMax),
      suppression: toeFire(toe, weapons, Math.min(300, dMax || 300), 0, false).suppression,
      ammoPerMin: dAmmo,
      ammoMinutes: dAmmo > 0 && cap > 0 ? cap / dAmmo : null,
    },
    indirect: {
      maxRangeM: iMax,
      curve: curve(toe, weapons, true, iMax),
      suppression: iMax > 0 ? toeFire(toe, weapons, iMax / 2, 0, true).suppression : 1,
      ammoPerMin: iAmmo,
      ammoMinutes: iAmmo > 0 && cap > 0 ? cap / iAmmo : null,
    },
    antiAir,
    marchKmh,
    deployedKmh: marchKmh * rules.combatMoveSpeedRatio,
    fuelRangeKm: toe.supply.fuelPerKmT > 0 ? toe.supply.fuelCapacityT / toe.supply.fuelPerKmT : null,
  };
}

/** 編成エディターに出す誤り(error:保存できない)と注意(warning:保存はできるが、ゲームで意図と違う動きになりうる) */
export interface DataIssue {
  level: "error" | "warning";
  /** どこの項目か(例:"elements.0.weapons.1.weapon") */
  path: string;
  message: string;
}

/** 編成表の参照と整合のチェック(スキーマの検証の後に使う) */
export function checkToe(toe: Toe, weapons: WeaponPack, branches: BranchPack): DataIssue[] {
  const out: DataIssue[] = [];
  if (!branches.branches[toe.branch]) out.push({ level: "error", path: "branch", message: `兵科 "${toe.branch}" がありません` });
  let hasDirect = false;
  toe.elements.forEach((e, i) => {
    if (e.weapons.length === 0) out.push({ level: "warning", path: `elements.${i}.weapons`, message: `「${e.name}」は武器を持っていません(撃てない要素)` });
    e.weapons.forEach((ref, j) => {
      const w = weapons.weapons[ref.weapon];
      if (!w) out.push({ level: "error", path: `elements.${i}.weapons.${j}.weapon`, message: `武器 "${ref.weapon}" がありません` });
      else if (!w.indirect) hasDirect = true;
    });
  });
  if (hasDirect && toe.frontageM <= 0) out.push({ level: "warning", path: "frontageM", message: "正面幅が0です(展開しても点として扱われ、阻止圏・戦闘正面幅が働きません)" });
  if (toe.supply.ammoCapacityT <= 0) out.push({ level: "warning", path: "supply.ammoCapacityT", message: "弾薬の携行備蓄が0です(弾薬を消費せず、補給も受けません)" });
  if (toe.supply.fuelPerKmT > 0 && toe.supply.fuelCapacityT <= 0) out.push({ level: "error", path: "supply.fuelCapacityT", message: "燃料を使うのに、燃料の携行備蓄が0です(動けません)" });
  return out;
}

/** 武器の整合のチェック(スキーマの検証の後に使う) */
export function checkWeapon(w: Weapon): DataIssue[] {
  const out: DataIssue[] = [];
  if (w.bands.every((b) => b.power === 0)) out.push({ level: "warning", path: "bands", message: "どの射程帯でも火力が0です" });
  if (w.effectiveness.soft === 0 && w.effectiveness.armored === 0) out.push({ level: "warning", path: "effectiveness", message: "非装甲にも装甲にも効果が0です" });
  if (w.indirect && weaponMaxRange(w) < 2000) out.push({ level: "warning", path: "bands", message: "間接射撃の武器の射程が2km未満です(直接射撃の武器のつもりなら「間接射撃」を外してください)" });
  return out;
}

/** 武器を使っている編成表(武器を消す・IDを変える前の確認に使う) */
export function weaponUsage(weaponId: string, toePacks: readonly ToePack[]): { pack: string; toe: string }[] {
  const out: { pack: string; toe: string }[] = [];
  for (const p of toePacks)
    for (const [id, t] of Object.entries(p.toes)) if (t.elements.some((e) => e.weapons.some((r) => r.weapon === weaponId))) out.push({ pack: p.id, toe: id });
  return out;
}
