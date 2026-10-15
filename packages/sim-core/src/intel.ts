import type { SimContext } from "./context.js";
import { detectionLevel, type DetectionLevel } from "./detection.js";
import { fogLevel } from "./fog-density.js";
import type { Vec2 } from "./geometry.js";
import type { Rng } from "./rng.js";
import { effectiveStance, stanceOf } from "./stance.js";
import type { Formation, Unit } from "./unit.js";

/** ある陣営が、敵の1ユニットについて知っていること */
export interface IntelEntry {
  /** 陣営ごとに振る匿名のID。敵ユニットの本当のIDは渡さない */
  contactId: string;
  /** 今見えている段階(見えていなければ0) */
  currentLevel: DetectionLevel;
  /** これまでに到達した最高段階。兵種などの知識は見失っても残る */
  bestLevel: DetectionLevel;
  lastSeenPos: Vec2;
  lastSeenTime: number;
  /** 兵種(bestLevel >= 2 で判明) */
  branch: string | null;
  /** 最後に規模まで見えたときの値(currentLevel >= 3 のときだけ更新) */
  lastSeenFacing: number | null;
  lastSeenFormation: Formation | null;
  lastEstimatedStrength: number | null;
  /** 規模推定の誤差倍率。初めて規模まで判明したときに1回だけ引く */
  estimateFactor: number | null;
  /** 撃破の瞬間を見ていた(見ていなければゴーストのまま残る) */
  confirmedDestroyed: boolean;
  /** 最後に兵種まで見えたときに潰走していたか(逃げている様子は外から分かる。currentLevel >= 2 のときだけ更新) */
  lastSeenRouted: boolean;
  /** 最後に兵種まで見えたときに、前のターンに動いていたか(前進してきた敵。currentLevel >= 2 のときだけ更新) */
  lastSeenMoved: boolean;
}

export interface SideIntel {
  nextContactSeq: number;
  /** キーは敵ユニットのID(サーバー内部だけで使う) */
  entries: Record<string, IntelEntry>;
}

export type IntelState = Record<string, SideIntel>;

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sidesOf(units: readonly Unit[]): string[] {
  return [...new Set(units.map((u) => u.side))].sort();
}

export function cloneIntel(intel: IntelState): IntelState {
  const out: IntelState = {};
  for (const [side, si] of Object.entries(intel)) {
    const entries: Record<string, IntelEntry> = {};
    for (const [id, e] of Object.entries(si.entries)) entries[id] = { ...e, lastSeenPos: { ...e.lastSeenPos } };
    out[side] = { nextContactSeq: si.nextContactSeq, entries };
  }
  return out;
}

/**
 * 全陣営の探知を更新する(intel を書き換える)。
 * 戻り値は [陣営][敵ユニットID] → 今の探知段階。
 * 乱数を引く順番がぶれないよう、陣営・ユニットはID順に処理する。
 */
export function updateIntel(
  intel: IntelState,
  units: readonly Unit[],
  t: number,
  ctx: SimContext,
  rng: Rng,
): Record<string, Record<string, DetectionLevel>> {
  const sorted = [...units].sort(byId);
  const levels: Record<string, Record<string, DetectionLevel>> = {};
  for (const side of sidesOf(sorted)) {
    const si = (intel[side] ??= { nextContactSeq: 1, entries: {} });
    const observers = sorted.filter((u) => u.side === side);
    const sideLevels: Record<string, DetectionLevel> = (levels[side] = {});
    for (const target of sorted) {
      if (target.side === side) continue;
      let level: DetectionLevel = 0;
      // 規模推定の誤差は、規模まで見えている観測者のうち最も精度の高いもので決める
      let bestErrorMultiplier = Infinity;
      for (const o of observers) {
        const l = detectionLevel(o, target, ctx);
        if (l > level) level = l;
        if (l === 3) {
          const m = stanceOf(o, ctx.rules).estimateErrorMultiplier;
          bestErrorMultiplier = Math.min(bestErrorMultiplier, m);
        }
      }
      sideLevels[target.id] = level;
      const entry = si.entries[target.id];
      if (level === 0) {
        if (entry) entry.currentLevel = 0;
        continue;
      }
      const e =
        entry ??
        (si.entries[target.id] = {
          contactId: `${side}:c${si.nextContactSeq++}`,
          currentLevel: 0,
          bestLevel: 0,
          lastSeenPos: { ...target.pos },
          lastSeenTime: t,
          branch: null,
          lastSeenFacing: null,
          lastSeenFormation: null,
          lastEstimatedStrength: null,
          estimateFactor: null,
          confirmedDestroyed: false,
          lastSeenRouted: false,
          lastSeenMoved: false,
        });
      e.currentLevel = level;
      e.bestLevel = Math.max(e.bestLevel, level) as DetectionLevel;
      e.lastSeenPos = { ...target.pos };
      e.lastSeenTime = t;
      if (level >= 2) {
        e.branch = target.branch;
        e.lastSeenRouted = target.routed;
        e.lastSeenMoved = target.movedLastTurn;
      }
      if (level === 3) {
        if (e.estimateFactor === null) {
          e.estimateFactor = rng.spread(ctx.rules.detection.sizeEstimateError * bestErrorMultiplier * fogLevel(ctx).sizeEstimateErrorMultiplier);
        }
        e.lastSeenFacing = target.facing;
        e.lastSeenFormation = target.formation;
        e.lastEstimatedStrength = target.strength * e.estimateFactor;
      }
    }
  }
  return levels;
}

/**
 * 航空偵察の写真など、その時点で一度だけ見えたことを記録する(兵種まで)。今見えているかどうか
 * (currentLevel)は変えないので、地上の部隊から見えていなければ、撮影した時刻のゴーストとして残る
 */
export function recordSighting(intel: IntelState, side: string, target: Unit, t: number): void {
  const si = (intel[side] ??= { nextContactSeq: 1, entries: {} });
  const e =
    si.entries[target.id] ??
    (si.entries[target.id] = {
      contactId: `${side}:c${si.nextContactSeq++}`,
      currentLevel: 0,
      bestLevel: 0,
      lastSeenPos: { ...target.pos },
      lastSeenTime: t,
      branch: null,
      lastSeenFacing: null,
      lastSeenFormation: null,
      lastEstimatedStrength: null,
      estimateFactor: null,
      confirmedDestroyed: false,
      lastSeenRouted: false,
      lastSeenMoved: false,
    });
  if (e.currentLevel > 0 && e.lastSeenTime >= t) return; // 地上から今見えていれば、そちらの情報が新しい
  e.bestLevel = Math.max(e.bestLevel, 2) as DetectionLevel;
  e.branch = target.branch;
  e.lastSeenPos = { ...target.pos };
  e.lastSeenTime = t;
  e.lastSeenRouted = target.routed;
  e.lastSeenMoved = target.movedLastTurn;
}

/** クライアントに渡す敵の情報。段階に応じて項目が埋まる */
export interface ContactView {
  contactId: string;
  currentLevel: DetectionLevel;
  bestLevel: DetectionLevel;
  /** 今見えていなければ、最後に見た位置(ゴースト) */
  pos: Vec2;
  lastSeenTime: number;
  branch?: string;
  facing?: number;
  formation?: Formation;
  estimatedStrength?: number;
  /** 撃破を確認した */
  destroyed?: boolean;
  /** 潰走している(兵種まで見えているときだけ分かる) */
  routed?: boolean;
  /** 前のターンに動いていた=前進してきた(兵種まで見えているときだけ分かる。反撃の好機の判断に使う) */
  movedLastTurn?: boolean;
}

export function contactView(e: IntelEntry): ContactView {
  const v: ContactView = {
    contactId: e.contactId,
    currentLevel: e.currentLevel,
    bestLevel: e.bestLevel,
    pos: { ...e.lastSeenPos },
    lastSeenTime: e.lastSeenTime,
  };
  if (e.branch !== null) v.branch = e.branch;
  if (e.currentLevel >= 3 && e.lastSeenFacing !== null && e.lastSeenFormation !== null) {
    v.facing = e.lastSeenFacing;
    v.formation = e.lastSeenFormation;
  }
  if (e.lastEstimatedStrength !== null) v.estimatedStrength = e.lastEstimatedStrength;
  if (e.confirmedDestroyed) v.destroyed = true;
  if (e.currentLevel >= 2 && e.lastSeenRouted) v.routed = true;
  if (e.currentLevel >= 2 && e.lastSeenMoved) v.movedLastTurn = true;
  return v;
}
