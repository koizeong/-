import type { SimContext } from "./context.js";
import type { Vec2 } from "./geometry.js";
import type { MoveMode, UnitOrder } from "./orders.js";
import { stanceOf } from "./stance.js";
import { toeIndirectMaxRange } from "./toe.js";
import type { Unit } from "./unit.js";

export type GroupMember = Pick<Unit, "id" | "pos" | "toe" | "strength" | "stance" | "pendingStance" | "stanceTurns">;

export interface GroupOrderOptions {
  /** 並ぶ線の中心(m) */
  target: Vec2;
  /** 並んだあとの正面の向き(方位、度) */
  facing: number;
  moveMode?: MoveMode;
  /** 上級部隊単位のまとめた命令にするなら、その上級部隊のID(UnitOrder の group) */
  group?: string;
  /** 隣どうしの帯のすき間(m) */
  gapM?: number;
  /** 正面幅のない部隊(司令部など)に取る幅(m) */
  minWidthM?: number;
  /** 砲兵(間接射撃のできる部隊)を、線のこれだけ後ろに並べる(m) */
  artilleryDepthM?: number;
}

const DEFAULT_GAP_M = 100;
const DEFAULT_MIN_WIDTH_M = 300;
const DEFAULT_ARTILLERY_DEPTH_M = 1500;

/** 展開したときの正面幅(m)。frontageOf と同じ決め方を、今の隊形によらずに見る */
export function plannedFrontage(u: GroupMember, ctx: SimContext): number {
  const base = ctx.toes.toes[u.toe]?.frontageM ?? 0;
  if (base <= 0) return 0;
  const f = ctx.rules.frontage;
  const width = u.strength < f.reducedBelowStrength ? base * f.reducedMultiplier : base;
  return width * stanceOf(u as Unit, ctx.rules).frontageMultiplier;
}

/**
 * まとめた命令:選んだ部隊を、target を中心に facing を正面にした横一列に並べる、部隊ごとの命令を作る(設計ルール9の命令のまま)。
 * 間隔は各部隊の正面幅から決め、今の左右の並び(正面から見た左右)を保って経路が交差しないようにする。
 * 砲兵は線の後ろに、同じように横に並べる。決定論的(同じ入力なら同じ命令)
 */
export function groupOrders(members: readonly GroupMember[], ctx: SimContext, opts: GroupOrderOptions): UnitOrder[] {
  const gap = opts.gapM ?? DEFAULT_GAP_M;
  const minW = opts.minWidthM ?? DEFAULT_MIN_WIDTH_M;
  const rad = (opts.facing * Math.PI) / 180;
  const fwd = { x: Math.sin(rad), y: Math.cos(rad) };
  const right = { x: Math.cos(rad), y: -Math.sin(rad) };
  const isArtillery = (u: GroupMember) => {
    const toe = ctx.toes.toes[u.toe];
    return !!toe && toeIndirectMaxRange(toe, ctx.weapons) > 0;
  };
  const lateral = (p: Vec2) => (p.x - opts.target.x) * right.x + (p.y - opts.target.y) * right.y;
  const row = (us: readonly GroupMember[], back: number): UnitOrder[] => {
    const sorted = [...us].sort((a, b) => lateral(a.pos) - lateral(b.pos) || (a.id < b.id ? -1 : 1));
    const widths = sorted.map((u) => Math.max(minW, plannedFrontage(u, ctx)));
    const total = widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, sorted.length - 1);
    let edge = -total / 2;
    return sorted.map((u, i) => {
      const off = edge + widths[i]! / 2;
      edge += widths[i]! + gap;
      const p = { x: opts.target.x + right.x * off - fwd.x * back, y: opts.target.y + right.y * off - fwd.y * back };
      const o: UnitOrder = { unitId: u.id, waypoints: [p], facingOnArrival: opts.facing };
      if (opts.moveMode !== undefined) o.moveMode = opts.moveMode;
      if (opts.group !== undefined) o.group = opts.group;
      return o;
    });
  };
  const guns = members.filter(isArtillery);
  const line = members.filter((u) => !isArtillery(u));
  return [...row(line, 0), ...row(guns, line.length > 0 ? (opts.artilleryDepthM ?? DEFAULT_ARTILLERY_DEPTH_M) : 0)];
}
