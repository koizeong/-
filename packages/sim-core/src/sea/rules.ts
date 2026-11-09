import { z } from "zod";

/** 艦の損害の決まり(ルールパックの naval.damage。docs/naval-design.md の6。sea/damage.ts) */
export const SeaDamageSchema = z.object({
  notes: z.string().optional(),
  /** 1発の構造の損害(耐久の点) = coefficient × 弾の重さ(kg)^exponent。抜けなければ nonPenetrating 倍 */
  structurePerShell: z.object({ coefficient: z.number().positive(), exponent: z.number().positive() }),
  nonPenetrating: z.number().min(0).max(1),
  /** 舷側に当たった弾・甲板に当たった弾の、場所ごとの重み */
  side: z.record(z.string(), z.number().min(0)),
  deck: z.record(z.string(), z.number().min(0)),
  /** 舷側・甲板を抜けた弾が、機関・弾薬庫に届く確率と、水線の付近の穴(浸水)になる確率 */
  beltPen: z.object({ engine: z.number().min(0).max(1), magazine: z.number().min(0).max(1), waterline: z.number().min(0).max(1) }),
  deckPen: z.object({ engine: z.number().min(0).max(1), magazine: z.number().min(0).max(1) }),
  /** 弾薬庫に届いた弾・砲塔・基部を抜けた弾の炎が、弾薬庫を誘爆させる確率 */
  magazineDetonation: z.number().min(0).max(1),
  flash: z.object({ turret: z.number().min(0).max(1), barbette: z.number().min(0).max(1) }),
  /** 砲塔に当たると、抜けた弾・抜けない弾がその砲塔を使えなくする確率 */
  mountLoss: z.object({ penetrating: z.number().min(0).max(1), nonPenetrating: z.number().min(0).max(1) }),
  engineLossPerHit: z.number().min(0).max(1),
  powerLoss: z.object({ chance: z.number().min(0).max(1), minutes: z.number().positive() }),
  director: z.object({ chance: z.number().min(0).max(1), loss: z.number().min(0).max(1) }),
  radarLossChance: z.number().min(0).max(1),
  conningTowerMinutes: z.number().min(0),
  rudderJam: z.object({ chance: z.number().min(0).max(1), minMinutes: z.number().min(0), maxMinutes: z.number().min(0) }),
  bowDamagePerHit: z.number().min(0).max(1),
  fire: z.object({
    penetrating: z.number().min(0).max(1),
    nonPenetrating: z.number().min(0).max(1),
    superstructure: z.number().min(0).max(1),
    heMultiplier: z.number().min(0),
    step: z.number().min(0),
    structurePerMin: z.number().min(0),
    runawayAbove: z.number().min(0).max(1),
    runawayGrowthPerMin: z.number().min(0),
    carrierMultiplier: z.number().min(0),
  }),
  /** 浸水:1つの穴の毎分の流入 = 弾は perShell × (弾の重さ ÷ 100kg)^0.5、魚雷は perTorpedo × (炸薬 ÷ 200kg) に、(基準排水量 ÷ 艦の排水量)^sizeExponent を掛ける */
  leak: z.object({ perShell: z.number().min(0), perTorpedo: z.number().min(0), bowMultiplier: z.number().min(0), sternMultiplier: z.number().min(0), sizeExponent: z.number().min(0), referenceT: z.number().positive() }),
  /** 応急(標準の練度。練度の火力の倍率を掛ける):毎分の消火・穴をふさぐ割合・注水で傾きを戻す量 */
  damageControl: z.object({ fireOutPerMin: z.number().min(0), leakSealPerMin: z.number().min(0).max(1), counterfloodPerMin: z.number().min(0) }),
  /** 傾斜(度) = 片舷の浸水の差 × listPerFlood。capsizeDeg を超えると転覆する。listAccuracyFromDeg から1度ごとに射撃が listAccuracyPerDeg 落ちる */
  listPerFlood: z.number().min(0),
  capsizeDeg: z.number().positive(),
  listAccuracyFromDeg: z.number().min(0),
  listAccuracyPerDeg: z.number().min(0),
  /** 浸水1あたりの速力の低下の割合 */
  floodSpeedLoss: z.number().min(0).max(1),
  torpedo: z.object({
    bow: z.number().min(0),
    mid: z.number().min(0),
    stern: z.number().min(0),
    engine: z.number().min(0).max(1),
    rudderJam: z.number().min(0).max(1),
    magazine: z.number().min(0).max(1),
    /** 1本の構造の損害(耐久の点) = coefficient × 炸薬(kg)^exponent */
    coefficient: z.number().positive(),
    exponent: z.number().positive(),
  }),
  /** 甲板の発射管に当たり、積んでいる魚雷が誘爆する確率と、その構造の損害(1本の炸薬の割合で数える) */
  torpedoMount: z.object({ detonation: z.number().min(0).max(1), warheadsAtRisk: z.number().min(0) }),
  /** 突き抜け:重い徹甲弾が薄い小さな艦を抜けると、炸裂せずに反対側へ抜ける */
  overpenetration: z.object({ armorRatio: z.number().positive(), shellToDisplacement: z.number().positive(), damageMultiplier: z.number().min(0).max(1) }),
});
export type SeaDamageRules = z.infer<typeof SeaDamageSchema>;

/**
 * 射撃の解(ルールパックの naval.fireControl。docs/naval-design.md の5。sea/gunnery.ts)。
 * 射撃の解(0〜1)は、目標ごとに毎分 solutionPerMin × 射撃指揮の質 × 練度 × (射撃用の電探 radarMultiplier) × 斉射の砲の数 × 同じ目標への集中 × 視界 × (1 − 射撃指揮所の損害) ×
 * (1 − 火災の煙) の割合で 1 に近づく。自分の変針(1分に turnFreeDegPerMin を超えた1度ごとに turnLossPerDeg)・目標の変針・回避運動で崩れる。
 * 1発の命中 = 距離の表(naval.gunnery.hitChance) × (floor + (1 − floor) × 解) × 大きさ × 速さ × 練度 × 傾斜 × 暗さ・電探だけ
 */
export const SeaFireControlSchema = z.object({
  notes: z.string().optional(),
  solutionPerMin: z.number().positive(),
  radarMultiplier: z.number().positive(),
  /** 同じ目標へ向ける砲の数(斉射)ごとの、解のたまりの倍率(砲の数の少ない順) */
  salvo: z.array(z.object({ guns: z.number().int().min(1), multiplier: z.number().min(0) })).min(1),
  /** 同じ目標をほかの艦も撃っているとき、1隻ごとに解のたまりを 1 ÷ (1 + confusionPerShooter × 隻数) にする(射撃用の電探があれば radarConfusion 倍に軽くする) */
  confusionPerShooter: z.number().min(0),
  radarConfusion: z.number().min(0).max(1),
  turnFreeDegPerMin: z.number().min(0),
  turnLossPerDeg: z.number().min(0),
  /** 回避運動をしている側(撃つ側・撃たれる側)の、毎分の解の崩れ */
  evadeLossPerMin: z.number().min(0).max(1),
  /** 見える距離の visibilityFrom 倍より遠い目標は、解のたまりが直線で落ち、見える距離で visibilityAtEdge 倍 */
  visibilityFrom: z.number().min(0).max(1),
  visibilityAtEdge: z.number().min(0).max(1),
  floor: z.number().min(0).max(1),
  targetSpeed: z.object({ fromKn: z.number().min(0), perKn: z.number().min(0) }),
  ownSpeed: z.object({ fromKn: z.number().min(0), perKn: z.number().min(0) }),
  fireSmoke: z.number().min(0).max(1),
  /** 動力が止まった艦は、砲塔ごとの照準で撃つ(命中の倍率) */
  localControl: z.number().min(0).max(1),
});
export type SeaFireControlRules = z.infer<typeof SeaFireControlSchema>;
