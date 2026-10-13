import { z } from "zod";
import { parseWith, type ParseResult } from "./rulepack.js";

/** 射程帯。maxRangeM までの距離で power を発揮する(近い帯から順に並べる) */
export const RangeBandSchema = z.object({
  maxRangeM: z.number().positive(),
  /** 1分あたりの火力(損害ポイント) */
  power: z.number().min(0),
});

export const WeaponSchema = z
  .object({
    name: z.string().min(1),
    bands: z.array(RangeBandSchema).min(1),
    /**
     * 目標への効果倍率。非装甲(soft)と装甲(armored)の2つを持ち、
     * 実際の効果は目標の装甲化率で按分する
     */
    effectiveness: z.object({ soft: z.number().min(0), armored: z.number().min(0) }),
    /** 間接射撃(砲兵など)。直接射撃の戦闘解決では撃たない */
    indirect: z.boolean(),
  })
  .superRefine((w, ctx) => {
    for (let i = 1; i < w.bands.length; i++) {
      if (w.bands[i]!.maxRangeM <= w.bands[i - 1]!.maxRangeM) {
        ctx.addIssue({ code: "custom", path: ["bands", i], message: "射程帯は近い順に、maxRangeM が増えるように並べてください" });
      }
    }
  });

export const WeaponPackSchema = z.object({
  id: z.string().min(1),
  notes: z.string().optional(),
  weapons: z.record(z.string(), WeaponSchema),
});

export type Weapon = z.infer<typeof WeaponSchema>;
export type WeaponPack = z.infer<typeof WeaponPackSchema>;

export function parseWeaponPack(input: unknown): ParseResult<WeaponPack> {
  return parseWith(WeaponPackSchema, input);
}

/** 距離 d での火力(射程外なら0) */
export function weaponPowerAt(w: Weapon, d: number): number {
  for (const b of w.bands) if (d <= b.maxRangeM) return b.power;
  return 0;
}

export function weaponMaxRange(w: Weapon): number {
  return w.bands[w.bands.length - 1]!.maxRangeM;
}
