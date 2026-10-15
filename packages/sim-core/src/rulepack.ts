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
  /** 徒歩の移動速度への倍率。0なら徒歩では入れない */
  speedMultiplier: z.number().min(0),
  /** 車両(燃料を使う編成)の移動速度への倍率。0なら車両では入れない。省略は徒歩と同じ */
  vehicleSpeedMultiplier: z.number().min(0).optional(),
  /** 揚陸能力のある編成の移動速度への倍率(川・海を渡る)。省略は車両と同じ */
  amphibiousSpeedMultiplier: z.number().min(0).optional(),
  /** 艦船が入れる(海)。艦砲射撃は、この地形から一定距離以内に届く(省略は false) */
  navigable: z.boolean().default(false),
  /** この地形にいる目標を探知できる距離への倍率(森林・町は小さい) */
  concealment: z.number().positive(),
  /** 標高(m)。見通しの判定に使う */
  elevationM: z.number().default(0),
  /** 遮蔽物(樹木・建物)の高さ(m)。標高に足して見通しをさえぎる */
  obstacleHeightM: z.number().min(0).default(0),
  /** この地形にいるユニットが受ける損害の倍率(高地は小さい) */
  damageTakenMultiplier: z.number().positive().default(1),
  /** この地形にいる観測者の探知距離の倍率(高地は大きい) */
  observerVisionMultiplier: z.number().positive().default(1),
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
  /** 突破する側の力への倍率(省略は1) */
  breakthroughMultiplier: z.number().min(0).default(1),
  /** 突破する側として、自分の制圧・動揺で突破の力が下がらない(損害を無視して突っ込む。省略は false) */
  breakthroughIgnoresDamage: z.boolean().default(false),
  /** 疲労のたまり方への倍率(回復には効かない。省略は1) */
  fatigueMultiplier: z.number().min(0).default(1),
  /** この姿勢の間は移動しない(死守・伏撃。省略は false) */
  immobile: z.boolean().default(false),
  /** 士気が下がっても潰走しない(死守。省略は false) */
  neverRouts: z.boolean().default(false),
  /** 動揺(士気が morale.shakenBelow 未満)の間に受けた損害の、戦力ゲージへの振り分けの倍率(省略は1) */
  shakenStrengthWeightMultiplier: z.number().min(0).default(1),
  /** 士気が morale.routBelow 未満(潰走しない姿勢で踏みとどまっている)の間の、同じ倍率(省略は1) */
  brokenStrengthWeightMultiplier: z.number().min(0).default(1),
  /** 側面・背後から撃たれたときに、向きの倍率にさらにかける倍率(伏撃。省略は1) */
  flankRearDamageTakenMultiplier: z.number().positive().default(1),
  /** 撃つと位置が露呈し、撃たずに1ターン過ごすまで signatureMultiplier が効かない(伏撃。省略は false) */
  revealOnFire: z.boolean().default(false),
  /** 隠れた状態から撃ち始めてから openingFireMinutes 分間の火力の倍率(伏撃の初撃。省略は1) */
  openingFireMultiplier: z.number().min(0).default(1),
  openingFireMinutes: z.number().min(0).default(0),
  /** 死守の姿勢(陣営の「死守の重み」に数え、壊滅すると陣営全体の士気が下がる。省略は false) */
  lastStand: z.boolean().default(false),
  /** 士気・疲労の回復の倍率(予備。省略は1) */
  moraleRecoveryMultiplier: z.number().min(0).default(1),
  fatigueRecoveryMultiplier: z.number().min(0).default(1),
  /** 反撃の好機に、counterattack の倍率にさらにかける倍率(予備。省略は1) */
  counterattackMultiplier: z.number().positive().default(1),
});

/**
 * 後手からの一撃(反撃の好機)。前のターンに動かなかった部隊が、このターンに動いて(反撃に出て)、
 * 前のターンに前進していた敵を攻めると、与える損害と突破の力が上がる
 */
export const CounterattackRulesSchema = z.object({
  firepowerMultiplier: z.number().positive(),
  breakthroughMultiplier: z.number().positive(),
});

/** 死守の連発への歯止め(陣営ごとの「死守の重み」) */
export const LastStandRulesSchema = z.object({
  /** 死守を命じるたびにたまる重み */
  gaugePerOrder: z.number().min(0),
  /** 1ターンごとに抜ける重み */
  decayPerTurn: z.number().min(0),
  /** 重み1あたりの、陣営の全ユニットの士気の回復の低下(割合) */
  moraleRecoveryPenaltyPerPoint: z.number().min(0),
  /** 士気の回復の倍率の下限 */
  moraleRecoveryFloor: z.number().min(0).max(1),
  /** 死守していたユニットが除去されたときに、陣営の全ユニットが失う士気 */
  lossMoraleShock: z.number().min(0).max(1),
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
  /** 士気の状態ごとの受ける損害の倍率(動揺=士気が morale.shakenBelow 未満、潰走=潰走中)。直接射撃・砲撃・空襲すべてにかかる */
  moraleStateDamageTaken: z.object({ shaken: z.number().positive(), routed: z.number().positive() }),
  /** 潰走中に受けた損害の、戦力ゲージへの振り分けの倍率(落伍・投降を表す) */
  routedStrengthWeightMultiplier: z.number().min(0),
  /** 損害1(耐久に対する割合)を各ゲージにどれだけ振り分けるか。時代で比重が変わる */
  gaugeWeights: z.object({
    strength: z.number().min(0),
    suppression: z.number().min(0),
    morale: z.number().min(0),
  }),
  /** 制圧ゲージ1(満タン)のときに失う火力の割合 */
  suppressionFirepowerPenalty: z.number().min(0).max(1),
  /** 装甲化率による制圧の影響の違い。装甲化率1のとき、火力の低下をどれだけ軽くするか / 視界(探知距離)をどれだけ落とすか(制圧1で) */
  armorSuppression: z.object({ firepowerRelief: z.number().min(0).max(1), visionPenalty: z.number().min(0).max(1) }),
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
    /** 潰走中の移動速度の倍率(統制を失い散り散りになるので足が鈍る) */
    routedSpeedMultiplier: z.number().positive(),
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
  /**
   * 制空権。陣営ごとの「制空権の割合」(合計1)を持ち、制空任務を出した分だけ自陣営へ動く。
   * 割合が低いほど、空襲・空輸・近接航空支援が迎撃されやすく、届いても効果が落ちる
   */
  superiority: z.object({
    /** 1ターンの制空任務で、割合が「出撃数の比」へ近づく速さ(0〜1) */
    learningRate: z.number().min(0).max(1),
    /** 制空権の割合が0のときに、航空任務が迎撃される確率 */
    interceptMax: z.number().min(0).max(1),
    /** 制空権の割合が0のときの、空襲・近接航空支援の効果の倍率(割合1で1倍) */
    effectAtNoControl: z.number().min(0).max(1),
  }),
  /** 航空偵察。撮影した範囲の敵を、確率で兵種まで見つける(その時点の写真として残る) */
  recon: z.object({
    /** 撮影する範囲の半径(m) */
    radiusM: z.number().positive(),
    /** 見つける確率の基本値。目標の地形の隠蔽(concealment)と姿勢の見つかりにくさ(signatureMultiplier)をかける */
    detectChance: z.number().min(0).max(1),
  }),
  /** 空挺降下。降下地点のまわりに散らばり、少し戦力を失って、展開途中の状態で降りる */
  airborne: z.object({
    /** 散らばる距離の目安(m)。降下地点からの距離は 0〜この値 */
    scatterM: z.number().min(0),
    /** 戦力の損失の幅(0〜1) */
    lossMin: z.number().min(0).max(1),
    lossMax: z.number().min(0).max(1),
    /** 降りた地点から enemyNearM 以内に敵がいれば、さらに失う戦力 */
    enemyNearM: z.number().min(0),
    enemyNearLoss: z.number().min(0).max(1),
    /** 輸送機が迎撃されたとき:中止ではなく、大きく散らばり、大きな損害を受けて降りる */
    interceptedScatterM: z.number().min(0),
    interceptedLoss: z.number().min(0).max(1),
  }),
  /** 近接航空支援。要請したターンのうちに、指定した味方の近くの見えている敵を叩く */
  closeSupport: z.object({
    /** 支援する味方からこの距離(m)以内の敵を叩く */
    radiusM: z.number().positive(),
    /** 要請から飛来までの時間(分) */
    delayMinutes: z.number().min(0),
    /** 攻撃が続く時間(分) */
    strikeMinutes: z.number().positive(),
  }),
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

/** 疲労(0〜1、0が元気)。1時間あたりの増減で持つ */
export const FatigueRulesSchema = z.object({
  marchPerHour: z.number().min(0),
  combatMovePerHour: z.number().min(0),
  firingPerHour: z.number().min(0),
  underFirePerHour: z.number().min(0),
  /** 夜間行動(浸透移動・夜襲)の上乗せ */
  nightActionPerHour: z.number().min(0),
  /** 動かず、撃たず、撃たれていないときの回復 */
  restPerHour: z.number().min(0),
  /** 疲労1(限界)のときに失う速度・火力の割合 */
  speedPenalty: z.number().min(0).max(1),
  firepowerPenalty: z.number().min(0).max(1),
});

/** 阻止圏と突破。展開済みのユニットは周囲に阻止圏を持ち、敵はその中を突破判定に勝たないと進めない */
export const BreakthroughRulesSchema = z.object({
  /** 阻止圏の半径(m) */
  zoneRadiusM: z.number().positive(),
  /** 突破できる力の比(突破する側 ÷ 阻止する側)。この値以上なら突破 */
  ratioThreshold: z.number().positive(),
  /** 装甲化率1のときに突破する側の力に足す倍率(力 × (1 + armorBonus × 装甲化率)) */
  armorBonus: z.number().min(0),
  /** 縦隊(行軍)のまま突破しようとするときの力の倍率 */
  columnMultiplier: z.number().min(0),
  /** 夜の浸透移動で突破しようとするときの力の倍率(縦隊の倍率の代わりに使う) */
  infiltrationMultiplier: z.number().min(0),
  /** 阻止する側の陣地レベルごとの力の倍率(minLevel から順に) */
  entrenchmentMultiplier: z.array(z.number().positive()),
  /** 制圧1のときに失う力の割合(双方) */
  suppressionPenalty: z.number().min(0).max(1),
  /** 動揺(士気が shakenBelow 未満)しているときの力の倍率(双方) */
  shakenMultiplier: z.number().min(0),
  /** 突破中(阻止圏の中で相手に近づいているあいだ)の速度の倍率 */
  zoneSpeedMultiplier: z.number().positive(),
  /** 突破に成功したユニットが、突破した相手に与える損害の倍率(そのターンの残り) */
  breachedDamageMultiplier: z.number().positive(),
});

/** 包囲。ターン終了時に判定する */
export const EncirclementRulesSchema = z.object({
  /** 脱出路を調べる方向の数 */
  directions: z.number().int().min(4),
  /** 脱出路の長さ(m)。この距離まで抜けられる方向が1つもなければ包囲 */
  escapeDistanceM: z.number().positive(),
  /** 包囲されたユニットが失う士気(ターンごと)。潰走中に包囲されていれば投降して消滅する */
  moraleLoss: z.number().min(0).max(1),
});

/** 霧の濃度(試合の設定。両陣営に同じものを適用する) */
export const FogRulesSchema = z
  .object({
    /** 既定の濃度 */
    default: z.string(),
    levels: z.record(
      z.string(),
      z.object({
        name: z.string().min(1),
        /** 探知距離の倍率 */
        detectionRangeMultiplier: z.number().positive(),
        /** 規模推定の誤差の倍率 */
        sizeEstimateErrorMultiplier: z.number().min(0),
        /** 見失った敵(ゴースト)を覚えている時間(時間)。null なら忘れない */
        ghostHours: z.number().positive().nullable(),
      }),
    ),
  })
  .refine((f) => f.default in f.levels, { message: "default の濃度が levels にありません", path: ["default"] });

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
    /** 見通しの判定で、観測者・目標の地面からの高さ(m) */
    eyeHeightM: z.number().min(0),
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
    fatigue: FatigueRulesSchema,
    fog: FogRulesSchema,
    breakthrough: BreakthroughRulesSchema,
    encirclement: EncirclementRulesSchema,
    lastStand: LastStandRulesSchema,
    counterattack: CounterattackRulesSchema,
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
  })
  .refine((r) => r.breakthrough.entrenchmentMultiplier.length === r.entrenchment.maxLevel - r.entrenchment.minLevel + 1, {
    message: "陣地レベルの数(minLevel〜maxLevel)と同じ個数にしてください",
    path: ["breakthrough", "entrenchmentMultiplier"],
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
export type FatigueRules = z.infer<typeof FatigueRulesSchema>;
export type FogRules = z.infer<typeof FogRulesSchema>;
export type BreakthroughRules = z.infer<typeof BreakthroughRulesSchema>;
export type EncirclementRules = z.infer<typeof EncirclementRulesSchema>;
export type LastStandRules = z.infer<typeof LastStandRulesSchema>;
export type CounterattackRules = z.infer<typeof CounterattackRulesSchema>;
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
