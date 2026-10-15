import { z } from "zod";
import type { Vec2 } from "./geometry.js";
import { parseWith, type ParseResult } from "./rulepack.js";

/**
 * 地形グリッド。rows[0] が北端の行、各行の先頭が西端。
 * 座標は南西の角を原点とし、x が東、y が北(メートル)。
 */
export const TerrainMapSchema = z
  .object({
    cellSizeM: z.number().positive(),
    /** 1文字 → 地形ID(ルールパックの terrain のキー) */
    legend: z.record(z.string().length(1), z.string().min(1)),
    rows: z.array(z.string().min(1)).min(1),
  })
  .superRefine((m, ctx) => {
    const width = m.rows[0]?.length ?? 0;
    m.rows.forEach((row, r) => {
      if ([...row].length !== width) {
        ctx.addIssue({ code: "custom", path: ["rows", r], message: `行の長さが ${width} ではありません` });
      }
      [...row].forEach((ch, c) => {
        if (!(ch in m.legend)) {
          ctx.addIssue({ code: "custom", path: ["rows", r], message: `${c}列目の文字 "${ch}" が legend にありません` });
        }
      });
    });
  });

export type TerrainMapDef = z.infer<typeof TerrainMapSchema>;

export function parseTerrainMap(input: unknown): ParseResult<TerrainMapDef> {
  return parseWith(TerrainMapSchema, input);
}

export class TerrainMap {
  readonly cols: number;
  readonly rows: number;

  /** セルごとの地形ID。添字は (南から数えた行) * cols + 列 */
  private readonly cells: string[];

  constructor(private readonly def: TerrainMapDef) {
    this.rows = def.rows.length;
    this.cols = [...(def.rows[0] ?? "")].length;
    this.cells = new Array<string>(this.rows * this.cols);
    def.rows.forEach((row, r) => {
      const rowFromSouth = this.rows - 1 - r;
      [...row].forEach((ch, c) => {
        this.cells[rowFromSouth * this.cols + c] = def.legend[ch]!;
      });
    });
  }

  get widthM(): number {
    return this.cols * this.def.cellSizeM;
  }

  get heightM(): number {
    return this.rows * this.def.cellSizeM;
  }

  get cellSizeM(): number {
    return this.def.cellSizeM;
  }

  /** 位置を含むセル(マップ外は最も近い端のセル)。row は南から数える */
  cellOf(p: Vec2): { col: number; row: number } {
    const size = this.def.cellSizeM;
    return {
      col: clamp(Math.floor(p.x / size), 0, this.cols - 1),
      row: clamp(Math.floor(p.y / size), 0, this.rows - 1),
    };
  }

  cellCenter(col: number, row: number): Vec2 {
    const size = this.def.cellSizeM;
    return { x: (col + 0.5) * size, y: (row + 0.5) * size };
  }

  /**
   * p から、accept を満たす地形のセル(の中心)までの最短距離(m)。maxM より遠ければ Infinity。
   * 艦砲射撃が海から届くかの判定などに使う
   */
  distanceToTerrain(p: Vec2, accept: (terrainId: string) => boolean, maxM: number): number {
    const size = this.def.cellSizeM;
    const c0 = this.cellOf({ x: p.x - maxM, y: p.y - maxM });
    const c1 = this.cellOf({ x: p.x + maxM, y: p.y + maxM });
    let best = Infinity;
    for (let row = c0.row; row <= c1.row; row++) {
      for (let col = c0.col; col <= c1.col; col++) {
        if (!accept(this.cells[row * this.cols + col]!)) continue;
        const c = { x: (col + 0.5) * size, y: (row + 0.5) * size };
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < best) best = d;
      }
    }
    return best <= maxM ? best : Infinity;
  }

  /** 使われている地形IDの一覧 */
  terrainIds(): string[] {
    return [...new Set(Object.values(this.def.legend))];
  }

  /** 位置の地形ID。マップ外は最も近い端のセルで代用する。 */
  terrainAt(p: Vec2): string {
    const { col, row } = this.cellOf(p);
    return this.cells[row * this.cols + col]!;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
