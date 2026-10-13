import { z } from "zod";

/**
 * 時代ルールパック。時代ごとに変わる数値はここに置き、コードに直書きしない。
 * 項目は機能を実装するたびに足していく。
 */
export const FacingRulesSchema = z
  .object({
    /** 正面とみなす半角(度)。攻撃方向と正面の差がこれ以下なら「前」 */
    frontHalfArcDeg: z.number().min(0).max(180),
    /** 背面とみなす半角(度)。真後ろからの差がこれ以下なら「背面」 */
    rearHalfArcDeg: z.number().min(0).max(180),
    /** 受ける損害への倍率 */
    damageMultiplier: z.object({
      front: z.number().positive(),
      flank: z.number().positive(),
      rear: z.number().positive(),
    }),
  })
  .refine((f) => f.frontHalfArcDeg + f.rearHalfArcDeg <= 180, {
    message: "frontHalfArcDeg と rearHalfArcDeg の合計は180以下にしてください(正面と背面が重なります)",
  });

export const TerrainRulesSchema = z.object({
  name: z.string().min(1),
  /** この地形で築ける陣地レベルの基本上限 */
  entrenchmentCap: z.number().int(),
  /** 移動速度への倍率 */
  speedMultiplier: z.number().positive(),
  /** この地形にいる目標を探知できる距離への倍率(森林・町は小さい) */
  concealment: z.number().positive(),
});

export const StanceRulesSchema = z.object({
  name: z.string().min(1),
  /** 陣地レベル上限への加減 */
  entrenchmentCapModifier: z.number().int(),
  /** 観測側として:探知距離への倍率 */
  visionMultiplier: z.number().positive(),
  /** 目標側として:探知される距離への倍率(小さいほど見つかりにくい) */
  signatureMultiplier: z.number().positive(),
  /** 観測側として:規模推定の誤差への倍率 */
  estimateErrorMultiplier: z.number().min(0),
  /** 与える損害への倍率 */
  firepowerMultiplier: z.number().min(0),
  /** 受ける損害への倍率 */
  damageTakenMultiplier: z.number().positive(),
  /** 弾薬消費への倍率 */
  ammoConsumptionMultiplier: z.number().min(0),
});

export const SupplyRulesSchema = z.object({
  /** 弾薬が切れたときに残る火力の割合 */
  outOfAmmoFirepowerMultiplier: z.number().min(0).max(1),
  /** 携行備蓄(弾薬、または燃料を使うユニットの燃料)が切れている間の士気低下(1分あたり) */
  outOfStockMoraleLossPerMin: z.number().min(0),
  /** 戦闘移動の燃料消費の倍率(行軍に対して) */
  combatMoveFuelMultiplier: z.number().min(0),
  /** 戦闘移動しながら撃つときの弾薬消費の倍率 */
  combatMoveAmmoMultiplier: z.number().min(0),
  /** 道路ノード・集積所を「押さえる」距離(m)。敵だけがこの距離内にいるノードは通れず、集積所は奪われる */
  controlRangeM: z.number().positive(),
  /** ユニットが補給を受け取れる、最寄りの道路ノードまでの距離(m) */
  accessRangeM: z.number().positive(),
  /** 距離による減衰の基準(m)。経路の長さがこの距離のとき、届く量は輸送能力の半分 */
  distanceScaleM: z.number().positive(),
});

export const CombatRulesSchema = z.object({
  /** 火力(損害ポイント/分)から実際の損害への換算係数 */
  damageScale: z.number().positive(),
  /** 損害の揺らぎ(0.15 なら ±15%) */
  damageSpread: z.number().min(0).lt(1),
  /** 戦闘移動しながら撃つときの火力の倍率 */
  combatMoveFirepowerMultiplier: z.number().min(0),
  /** 撃たれた側の隊形による損害の倍率(縦隊は不利) */
  formationDamageTaken: z.object({
    column: z.number().positive(),
    deploying: z.number().positive(),
    deployed: z.number().positive(),
  }),
  /** 陣地レベルごとの受ける損害の倍率。minLevel から maxLevel まで順に並べる */
  entrenchmentDamageTaken: z.array(z.number().positive()).min(1),
  /** 損害1(耐久に対する割合)を各ゲージにどれだけ振り分けるか。時代で比重が変わる */
  gaugeWeights: z.object({
    strength: z.number().min(0),
    suppression: z.number().min(0),
    morale: z.number().min(0),
  }),
  /** 制圧ゲージ1(満タン)のときに失う火力の割合 */
  suppressionFirepowerPenalty: z.number().min(0).max(1),
  /** 制圧ゲージの回復(1分あたり)。そのステップに撃たれなかったときだけ回復する */
  suppressionRecoveryPerMin: z.number().min(0),
  /** 間接射撃の着弾範囲の半径(m)。範囲内のユニットは敵味方を問わず損害を受ける */
  indirectImpactRadiusM: z.number().positive(),
  /** 間接射撃の換算係数(damageScale に対する倍率) */
  indirectDamageScale: z.number().min(0),
});

export const MoraleRulesSchema = z
  .object({
    /** 士気がこれ未満で「動揺」(火力が落ちる) */
    shakenBelow: z.number().min(0).max(1),
    shakenFirepowerMultiplier: z.number().min(0).max(1),
    /** 士気がこれ未満で「潰走」(命令を受け付けず、敵から離れる方向へ後退する。撃たない) */
    routBelow: z.number().min(0).max(1),
    /** 潰走中に士気がこれ以上に戻ると立ち直る */
    rallyAbove: z.number().min(0).max(1),
    /** 潰走したときに下がる距離(m) */
    routRetreatDistanceM: z.number().positive(),
    /** 撃たれておらず、携行備蓄があるときの士気の回復(1分あたり) */
    recoveryPerMin: z.number().min(0),
    /** 陣地レベル1あたりの回復の上乗せ(回復量への倍率に加算) */
    entrenchmentRecoveryBonusPerLevel: z.number().min(0),
    /** 縦深:この距離以内に接敵していない味方がいれば回復を上乗せする */
    depthRangeM: z.number().min(0),
    depthRecoveryBonus: z.number().min(0),
  })
  .refine((m) => m.routBelow <= m.shakenBelow, { message: "routBelow は shakenBelow 以下にしてください" })
  .refine((m) => m.routBelow < m.rallyAbove, { message: "rallyAbove は routBelow より大きくしてください" });

export const WeatherRulesSchema = z
  .object({
    /** 天候の並び(悪い → 良い)。天候は隣の状態へだけ変わる */
    order: z.array(z.string()).min(1),
    types: z.record(
      z.string(),
      z.object({
        name: z.string().min(1),
        /** 視程の倍率 */
        visibilityMultiplier: z.number().positive(),
        /** 航空(空襲・空輸)が使えるか */
        airAllowed: z.boolean(),
      }),
    ),
  })
  .refine((w) => w.order.every((id) => id in w.types) && Object.keys(w.types).every((id) => w.order.includes(id)), {
    message: "order と types の天候が一致しません",
  });

export const AirRulesSchema = z.object({
  /** 空襲の範囲の半径(m)。範囲内は敵味方を問わず損害を受ける */
  strikeRadiusM: z.number().positive(),
  /** 空輸の投下地点から、受け取れるユニットまでの距離(m) */
  dropRadiusM: z.number().positive(),
});

export const NightRulesSchema = z.object({
  /** 夜の視程の倍率(天候の倍率にさらにかける) */
  visibilityMultiplier: z.number().positive(),
  /** 夜間フェイズの小ステップ(秒)。夜は長いので昼より粗く刻む */
  stepSeconds: z.number().positive(),
  /** 夜のうち、移動(浸透移動)と夜襲を行える時間(時間)。残りは休息と補給だけ */
  activeHours: z.number().min(0),
  /** 浸透移動(夜の行軍):速度と、見つかりにくさ(探知される距離への倍率) */
  infiltration: z.object({
    speedMultiplier: z.number().positive(),
    signatureMultiplier: z.number().positive(),
  }),
  /** 夜間行動(浸透移動・夜襲)をしたユニットが、成否にかかわらず夜の終わりに失う士気 */
  actionMoraleCost: z.number().min(0).max(1),
  /** 夜襲(夜の戦闘移動) */
  nightAttack: z.object({
    /** 夜襲する側の火力の倍率 */
    firepowerMultiplier: z.number().min(0),
    /** 夜襲された側の陣地の効果を、どれだけ残すか(0なら陣地の効果なし、1ならそのまま) */
    entrenchmentEffectRetained: z.number().min(0).max(1),
    /** 夜襲の撃ち合いでの士気への打撃の倍率(双方。奇襲と混乱) */
    moraleDamageMultiplier: z.number().min(0),
  }),
});

export const DetectionRulesSchema = z
  .object({
    /** 基本視程(m)。これに天候・地形・姿勢などの倍率をかけたものが探知距離 */
    baseRangeM: z.number().positive(),
    /** 探知距離のこの割合以内なら兵種まで判明 */
    typeIdentifiedRatio: z.number().gt(0).max(1),
    /** 探知距離のこの割合以内なら規模・装備まで判明 */
    fullyIdentifiedRatio: z.number().gt(0).max(1),
    /** 規模推定の誤差(0.2 なら ±20%) */
    sizeEstimateError: z.number().min(0).lt(1),
  })
  .refine((d) => d.fullyIdentifiedRatio <= d.typeIdentifiedRatio, {
    message: "fullyIdentifiedRatio は typeIdentifiedRatio 以下にしてください",
  });

export const EntrenchmentRulesSchema = z
  .object({
    minLevel: z.number().int(),
    maxLevel: z.number().int(),
  })
  .refine((e) => e.minLevel <= e.maxLevel, { message: "minLevel は maxLevel 以下にしてください" });

export const RulePackSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 数値の根拠や仮置きであることのメモ(JSONにはコメントが書けないため) */
    notes: z.string().optional(),
    facing: FacingRulesSchema,
    /** 戦闘移動の速度(行軍速度に対する比) */
    combatMoveSpeedRatio: z.number().positive(),
    /** 行軍で道路を進むときの速度倍率(地形の倍率の代わりに使う)。戦闘移動は道路を使わない */
    roadSpeedMultiplier: z.number().positive(),
    entrenchment: EntrenchmentRulesSchema,
    detection: DetectionRulesSchema,
    /** このユニット自身が敵を探知し、かつこの距離(m)以内なら「接敵」。縦隊は停止して展開を始める */
    contactRangeM: z.number().positive(),
    combat: CombatRulesSchema,
    supply: SupplyRulesSchema,
    morale: MoraleRulesSchema,
    weather: WeatherRulesSchema,
    air: AirRulesSchema,
    night: NightRulesSchema,
    terrain: z.record(z.string(), TerrainRulesSchema),
    stances: z.record(z.string(), StanceRulesSchema),
    /** 新規ユニットの姿勢であり、姿勢切替中のターンに扱う姿勢 */
    defaultStance: z.string(),
  })
  .refine((r) => r.defaultStance in r.stances, {
    message: "defaultStance が stances に定義されていません",
    path: ["defaultStance"],
  })
  .refine((r) => r.combat.entrenchmentDamageTaken.length === r.entrenchment.maxLevel - r.entrenchment.minLevel + 1, {
    message: "陣地レベルの数(minLevel〜maxLevel)と同じ個数にしてください",
    path: ["combat", "entrenchmentDamageTaken"],
  });

export type FacingRules = z.infer<typeof FacingRulesSchema>;
export type TerrainRules = z.infer<typeof TerrainRulesSchema>;
export type StanceRules = z.infer<typeof StanceRulesSchema>;
export type DetectionRules = z.infer<typeof DetectionRulesSchema>;
export type CombatRules = z.infer<typeof CombatRulesSchema>;
export type SupplyRules = z.infer<typeof SupplyRulesSchema>;
export type MoraleRules = z.infer<typeof MoraleRulesSchema>;
export type WeatherRules = z.infer<typeof WeatherRulesSchema>;
export type NightRules = z.infer<typeof NightRulesSchema>;
export type RulePack = z.infer<typeof RulePackSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** スキーマで検証する。壊れたデータは「どこが・なぜ」を並べて返す。 */
export function parseWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): ParseResult<T> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(ルート)"}: ${i.message}`),
  };
}

export function parseRulePack(input: unknown): ParseResult<RulePack> {
  return parseWith(RulePackSchema, input);
}
