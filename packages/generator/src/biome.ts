import { z } from "zod";

/**
 * 地形の傾向(自動生成マップの「らしさ」)。数値はどれも割合・範囲で、地図の大きさに依らない。
 * terrain は役割 → ルールパックの地形ID(ジャングルなら wood を jungle に、など)
 */
export const BiomeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  terrain: z.object({
    open: z.string(),
    wood: z.string(),
    town: z.string(),
    hill: z.string(),
    peak: z.string(),
    river: z.string(),
    bigRiver: z.string(),
    /** 2つ目の林(ゴム園など)。省略すると使わない */
    wood2: z.string().optional(),
  }),
  /** 森の割合(地図のマスのうち) */
  wood: z.number().min(0).max(0.8),
  /** 2つ目の林の割合 */
  wood2: z.number().min(0).max(0.5).default(0),
  /** 高地の割合 */
  hill: z.number().min(0).max(0.5),
  /** 峻険な高地(入れない)の割合 */
  peak: z.number().min(0).max(0.1).default(0),
  /** 起伏・森の塊の大きさ(m)。大きいほど大きな塊になる */
  noiseScaleM: z.number().positive(),
  /** 川の本数の範囲 [最小, 最大] */
  rivers: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  /** 川が大河になる確率(大河は揚陸能力のない部隊は橋でしか渡れない) */
  bigRiverChance: z.number().min(0).max(1).default(0),
  /** 町の数の範囲(10km四方あたり) */
  townsPer100km2: z.tuple([z.number().min(0), z.number().min(0)]),
  /** 町の広さ(マス数)の範囲 */
  townCells: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  /** 最小全域木に足す道路の割合(0 なら木だけ。大きいほど網の目) */
  extraRoads: z.number().min(0).max(1).default(0.3),
  /** 道路の輸送能力(トン/時)。幹線(町と町を結ぶ木)とそれ以外 */
  roadCapacity: z.object({ main: z.number().positive(), minor: z.number().positive() }),
  /** 町の名前の候補(足りなければ番号をつける) */
  townNames: z.array(z.string().min(1)).default([]),
});
export type Biome = z.infer<typeof BiomeSchema>;

export const BiomePackSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  biomes: z.record(z.string(), BiomeSchema),
});
export type BiomePack = z.infer<typeof BiomePackSchema>;
