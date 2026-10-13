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

  constructor(private readonly def: TerrainMapDef) {
    this.rows = def.rows.length;
    this.cols = [...(def.rows[0] ?? "")].length;
  }

  get widthM(): number {
    return this.cols * this.def.cellSizeM;
  }

  get heightM(): number {
    return this.rows * this.def.cellSizeM;
  }

  /** 使われている地形IDの一覧 */
  terrainIds(): string[] {
    return [...new Set(Object.values(this.def.legend))];
  }

  /** 位置の地形ID。マップ外は最も近い端のセルで代用する。 */
  terrainAt(p: Vec2): string {
    const size = this.def.cellSizeM;
    const col = clamp(Math.floor(p.x / size), 0, this.cols - 1);
    const rowFromSouth = clamp(Math.floor(p.y / size), 0, this.rows - 1);
    const row = this.def.rows[this.rows - 1 - rowFromSouth] ?? "";
    const ch = [...row][col] ?? "";
    const id = this.def.legend[ch];
    if (id === undefined) throw new Error(`地形が引けません: (${p.x}, ${p.y})`);
    return id;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
