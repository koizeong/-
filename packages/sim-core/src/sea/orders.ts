import { z } from "zod";

/**
 * 海戦の戦隊の命令(docs/naval-design.md の2。CLAUDE.md のルール9の例外)。艦には陸の命令(経由点・姿勢・条件付き命令)を使わない。
 * squadron は戦隊の ID(シナリオの上級部隊の ID。切り離した艦・どの上級部隊にも属さない艦は艦の ID)。
 * 書かなかった項目は前の命令のまま(陸の命令と同じく、変えない限り次のターンも保つ)
 */
export const SeaSpeedSchema = z.enum(["stop", "slow", "cruise", "battle", "flank"]);
export type SeaSpeed = z.infer<typeof SeaSpeedSchema>;

export const SeaBandSchema = z.union([z.enum(["close", "hold", "open"]), z.object({ minM: z.number().min(0), maxM: z.number().positive() })]);
export type SeaBand = z.infer<typeof SeaBandSchema>;

const Vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const SeaOrderSchema = z.object({
  squadron: z.string().min(1).max(100),
  /** 針路(度)。toward・follow とどれか1つ。新しく決めたものが前のものに代わる */
  course: z.number().finite().optional(),
  /** その点へ向かう(着いたら、その時の針路のまま進む) */
  toward: Vec2Schema.optional(),
  /** 別の戦隊(自陣営)の後ろにつく */
  follow: z.string().min(1).max(100).optional(),
  speed: SeaSpeedSchema.optional(),
  /** 針路を変えるときの回頭の仕方:逐次回頭(先頭の回頭点で順に曲がる)か一斉回頭(全艦が同時に曲がる) */
  turn: z.enum(["succession", "together"]).optional(),
  /** 陣形(ルールパックの naval.formations)。変えるのに時間がかかる */
  formation: z.string().min(1).max(50).optional(),
  /** 交戦:目標(敵の接触の ID)と距離の帯。null で交戦をやめる */
  engage: z.object({ target: z.string().min(1).max(100), band: SeaBandSchema }).nullable().optional(),
  /** 撃ち方:撃ち方始め・待て(待てでも、撃ってきて位置の分かった艦には撃ち返す) */
  fire: z.enum(["free", "hold"]).optional(),
  /** 雷撃:自由・待て・撃ったら反転 */
  torpedoes: z.enum(["free", "hold", "turnAway"]).optional(),
  smoke: z.boolean().optional(),
  evade: z.boolean().optional(),
  /** 戦隊から艦を切り離す(切り離した艦は1隻の戦隊になり、その艦の ID で命令する) */
  detach: z.array(z.string().min(1).max(100)).max(30).optional(),
  /** 切り離した艦を、この戦隊(もとの上級部隊)に戻す(近くにいれば列の後ろにつく) */
  rejoin: z.array(z.string().min(1).max(100)).max(30).optional(),
});
export type SeaOrder = z.infer<typeof SeaOrderSchema>;
