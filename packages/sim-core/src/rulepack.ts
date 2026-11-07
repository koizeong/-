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
    /**
     * 装甲の目標(装甲の部分)が受ける損害への倍率(省略は damageMultiplier と同じ)。
     * 戦車は正面装甲が厚く側面・背後が薄いので、面による差が歩兵より大きい。
     * 装甲化率が中間の目標は、損害のうち装甲の部分に当たる割合で按分する
     */
    armoredDamageMultiplier: z
      .object({
        front: z.number().positive(),
        flank: z.number().positive(),
        rear: z.number().positive(),
      })
      .optional(),
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
  /** 艦艇(編成表の naval)の移動速度への倍率。省略は navigable なら1・そうでなければ0(艦艇は入れない) */
  navalSpeedMultiplier: z.number().min(0).optional(),
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
  /** 水の地形(川・大河・海)。ここを横切る道路の区間が橋になる */
  water: z.boolean().default(false),
});

const StanceEffectsSchema = z.object({
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
  /**
   * 撃たれたときの士気の減り方の倍率(省略は1)。強襲(遮二無二の突撃)は損害を顧みずに押すので小さい:
   * 崩れるまでに多くの損害を払う
   */
  moraleDamageTakenMultiplier: z.number().positive().default(1),
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
  /** 正面幅への倍率(突撃隊形は狭く密集する。省略は1) */
  frontageMultiplier: z.number().positive().default(1),
  /** 敵の阻止圏の中で近づくときの速さに、breakthrough.zoneSpeedMultiplier へさらにかける倍率(突撃隊形は勢いで押し込む。省略は1) */
  zoneSpeedMultiplier: z.number().positive().default(1),
  /** 向きの倍率を使わない(全周防御:どの方向から撃たれても正面と同じ。阻止の力も正面で数える。省略は false) */
  ignoresFacing: z.boolean().default(false),
  /** 包囲されたときに失う士気(encirclement.moraleLoss)への倍率(全周防御は小さい。省略は1) */
  encirclementMoraleMultiplier: z.number().min(0).default(1),
  /** 地図に描く形(表示用):line=正面の帯、wedge=小さな三角形(突撃隊形)、ring=円(全周防御)。省略は line */
  shape: z.enum(["line", "wedge", "ring"]).default("line"),
});

export const StanceRulesSchema = StanceEffectsSchema.extend({
  /** この姿勢を取れる兵科(省略はすべての兵科)。兵科専用の姿勢(機甲の突撃隊形・歩兵の全周防御など) */
  branches: z.array(z.string().min(1)).optional(),
  /**
   * 効果が続くターン数(省略は無期限)。切替が終わってからこのターン数を過ぎると「息切れ」し、
   * spent に書いた値で効果を上書きする(強襲:勢いは短い間しか続かない)。
   * 同じ姿勢を命じ直しても戻らない。いったん別の姿勢に切り替える必要がある
   */
  effectTurns: z.number().int().positive().optional(),
  /** 息切れしたら、その場で既定の姿勢(標準)に戻る(省略は false:息切れしたまま spent の効果で残る) */
  revertWhenSpent: z.boolean().default(false),
  /** 息切れした後の効果(書いた項目だけ上書きする) */
  spent: StanceEffectsSchema.omit({ name: true }).partial().optional(),
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
  /**
   * routedStrengthWeightMultiplier を直接射撃(近くの敵の追撃)にだけかける。砲撃・空襲・艦砲射撃では捕虜は出ないので、
   * ふだんの振り分けのまま。省略は全部にかける(以前のまま)
   */
  routedStrengthWeightDirectOnly: z.boolean().optional(),
  /**
   * 潰走中の部隊にかける隊形の倍率(formationDamageTaken の代わり)。潰走は道を整然と進む行軍ではなく散り散りに下がる動きなので、
   * 縦隊の割り増しをかけない。省略は今の隊形の倍率(以前のまま)
   */
  routedFormationDamageTaken: z.number().positive().optional(),
  /** 損害1(耐久に対する割合)を各ゲージにどれだけ振り分けるか。時代で比重が変わる */
  gaugeWeights: z.object({
    strength: z.number().min(0),
    suppression: z.number().min(0),
    morale: z.number().min(0),
  }),
  /** 制圧ゲージ1(満タン)のときに失う火力の割合 */
  suppressionFirepowerPenalty: z.number().min(0).max(1),
  /**
   * 肉薄:突撃の姿勢(stances)の部隊が、弱った敵(制圧 minSuppression 以上か動揺)に rangeM まで迫ったら、陣地を奪い合う判定をする。
   * 突破の力 ÷ 阻止の力が ratioThreshold 以上なら守り手は陣地を捨てて崩れ、戦力を defenderStrengthLoss 失う。
   * 届かなければ攻め手が戦力を attackerStrengthLoss・士気を attackerMoraleLoss 失う。省略すると使わない
   */
  assault: z
    .object({
      stances: z.array(z.string()).min(1),
      rangeM: z.number().positive(),
      minSuppression: z.number().min(0).max(1),
      ratioThreshold: z.number().positive(),
      defenderStrengthLoss: z.number().min(0).max(1),
      attackerStrengthLoss: z.number().min(0).max(1),
      attackerMoraleLoss: z.number().min(0).max(1),
      /**
       * 守り手の陣地レベルごとの、要る力の比の倍率(minLevel から順に。省略は全部1)。阻止の力の陣地の倍率に重ねて、
       * 固い陣地(掩蓋・交通壕)に取りついても、中の守り手を追い出すのは難しいことを表す
       */
      entrenchmentRatioMultiplier: z.array(z.number().positive()).optional(),
    })
    .optional(),
  /** 装甲化率による制圧の影響の違い。装甲化率1のとき、火力の低下をどれだけ軽くするか / 視界(探知距離)をどれだけ落とすか(制圧1で) */
  armorSuppression: z.object({ firepowerRelief: z.number().min(0).max(1), visionPenalty: z.number().min(0).max(1) }),
  /** 制圧ゲージの回復(1分あたり)。そのステップに撃たれなかったときだけ回復する */
  suppressionRecoveryPerMin: z.number().min(0),
  /** 間接射撃の着弾範囲の半径(m)。範囲内のユニットは敵味方を問わず損害を受ける */
  indirectImpactRadiusM: z.number().positive(),
  /** 間接射撃の換算係数(damageScale に対する倍率) */
  indirectDamageScale: z.number().min(0),
  /**
   * 観測射撃:今見えている敵の近く(着弾範囲以内)への砲撃は、要請したターンのうちに、この分数の後から着弾する。
   * 省略すると、砲撃はすべて次のターンに着弾する
   */
  observedFireDelayMinutes: z.number().min(0).optional(),
  /**
   * 直接射撃の士気への効きの倍率(gaugeWeights.morale に掛ける。砲撃・空襲には掛けない。省略は1)。
   * 撃ち合いは、損害より先に士気・制圧で決着がつく(撃ち負けた側が先に崩れる)ようにする
   */
  directFireMoraleMultiplier: z.number().min(0).default(1),
  /**
   * 先手(奇襲):撃たれた側が撃った側をまだ見つけていなければ、損害と士気への打撃を上乗せする。
   * その組が撃ち始めてから durationMinutes の間だけ(そのターンの中で)。省略すると使わない
   */
  /**
   * 射撃の目標の選び方(火力の集中)。射程内の敵に、近い・自分の正面にいる・向かってくる敵ほど多く火力を割り振る。
   * 重み = 1 ÷ (1 + 距離 ÷ distanceScaleM) × (正面なら frontWeight) × (向かってくるなら approachingWeight)。省略すると均等に分ける
   */
  targetPriority: z
    .object({
      distanceScaleM: z.number().positive(),
      frontWeight: z.number().min(1),
      approachingWeight: z.number().min(1),
    })
    .optional(),
  /**
   * 砲兵の集中射撃:同じターンに、同じ陣営の複数の砲兵が同じ地点(着弾範囲の半径以内)へ撃つと、
   * 撃ち始めてから firstMinutes の間、損害を 1 + perExtraBattery × (砲兵の数 − 1) 倍(上限 max)にする。
   * 一斉に着弾すると、伏せる・壕に入る前に当たる。省略すると使わない
   */
  massedFire: z
    .object({
      perExtraBattery: z.number().min(0),
      max: z.number().min(1),
      firstMinutes: z.number().positive(),
    })
    .optional(),
  /**
   * 対砲兵戦。revealChance:砲撃(司令部コマンド)を撃ち始めたとき、その砲兵の位置が敵に標定される確率(1ターン・1回の砲撃ごと。
   * 発砲の閃光・音源の標定。標定された砲兵は、敵の地図に兵種つきのゴーストとして出て、砲撃の目標にできる)。
   * blockWhenUnderFire:前のターンに撃たれた(直接射撃・砲撃・空襲のどれでも)砲兵は、砲撃を要請できない。
   * 砲撃の最中に撃たれた砲兵も、そのターンの残りの砲撃をやめる。省略すると使わない
   */
  counterBattery: z
    .object({
      revealChance: z.number().min(0).max(1),
      blockWhenUnderFire: z.boolean().default(true),
    })
    .optional(),
  /**
   * 射線(直接射撃):撃つ側の帯の上の samples 点から撃たれる側へ線を引き、間に展開した部隊の帯(±blockerHalfDepthM)が
   * 横切る線はふさがれる。通る線の割合だけ火力が届く。両端から endClearanceM 以内は数えない(隣に並んでいるだけ)。
   * 部隊の高さ unitHeightM:高い所から撃つ線がこれより上を通れば越えて撃てる。省略すると使わない(間の部隊を無視する)
   */
  /**
   * 貫通力と装甲(武器の penetrationMm と編成表の armorMm がどちらもあるときだけ効く)。装甲の部分への効き目に
   * 貫通力 ÷ 装甲 の比から決まる倍率をかける:比が lowRatio 以下なら minFactor、highRatio 以上なら1、その間は直線。
   * 砲塔の厚さを書いた要素は、当たる弾のうち turretShare の割合が砲塔に当たる。
   * 面の倍率:装甲の部分には facing.damageMultiplier と facing.armoredDamageMultiplier を facingBlend で混ぜたものを使う
   * (0=歩兵と同じ、1=装甲の面の倍率のまま。正面の硬さは装甲の厚さが表すので、正面は1より小さくしない)。
   * 側面・背後の上乗せは、薄い装甲だけでは表せない分(弾薬庫・機関室・乗員に当たりやすい、向き直るまで撃ち返せない)
   */
  /**
   * 護衛:装甲の要素と歩兵(非装甲の要素)が同じ部隊にいるとき、withinM 以内で撃たれた装甲の部分の損害に armoredDamageMultiplier を掛ける
   * (歩兵が肉薄兵を寄せ付けない。突撃砲・戦車は近接戦闘に弱く、歩兵の護衛が要った)。省略すると使わない
   */
  escort: z.object({ withinM: z.number().positive(), armoredDamageMultiplier: z.number().positive().max(1) }).optional(),
  penetration: z
    .object({
      lowRatio: z.number().positive(),
      highRatio: z.number().positive(),
      minFactor: z.number().min(0).max(1),
      turretShare: z.number().min(0).max(1).optional(),
      facingBlend: z.number().min(0).max(1).optional(),
    })
    .optional(),
  lineOfFire: z
    .object({
      samples: z.number().int().min(1),
      blockerHalfDepthM: z.number().positive(),
      endClearanceM: z.number().min(0),
      unitHeightM: z.number().min(0),
    })
    .optional(),
  surprise: z
    .object({
      damageMultiplier: z.number().min(1),
      moraleMultiplier: z.number().min(1),
      durationMinutes: z.number().positive(),
    })
    .optional(),
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
    /**
     * 蹂躙:持ち場を守っている(動いていない)部隊が潰走したとき、この距離(m)以内に敵(潰走していない)がいれば、
     * 取り残された兵・捕虜として戦力をこの割合だけ失う。
     * 取りつかれてから崩れた守備隊は、逃げ遅れが多い。0 なら使わない
     */
    overrunStrengthLoss: z.number().min(0).max(1).default(0),
    overrunRangeM: z.number().min(0).default(0),
    /**
     * 損耗による士気の上限:士気は 1 − lossCeilingFactor × (失った戦力) までしか回復しない。
     * 大きな損害を出した部隊は、休んでも元のようには戦えない。0 なら使わない
     */
    lossCeilingFactor: z.number().min(0).default(0),
    /**
     * 潰走の代償:潰走するたびに、捨てた重火器・落伍・捕虜として戦力をこの割合だけ失う(蹂躙とは別に、いつも)。0 なら使わない
     */
    routStrengthLoss: z.number().min(0).max(1).default(0),
    /**
     * 潰走を重ねた部隊は、潰走1回ごとに立ち直れる士気の上限がこれだけ下がる(上限が立ち直りのしきい値を割ると、もう立ち直らない)。0 なら使わない
     */
    routCeilingLoss: z.number().min(0).max(1).default(0),
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
  // types には order にない天候(雨・雪など)を置ける。そうした天候は、シナリオが自分の並び(scenario.weather.order)や
  // 予定(schedule)・初期値で使うときだけ現れる(ルールパックの並びを変えると、既存のシナリオの天候の動きが変わるため)
  .refine((w) => w.order.every((id) => id in w.types), {
    message: "order に types にない天候があります",
  });

/**
 * 地面の状態:雨が続くとぬかるみ、雪が続くと積雪がたまり(0〜1。マップ全体で1つ)、晴れても少しずつしか戻らない。
 * 移動の速さに、地面の状態に応じた倍率をかける(道路以外の徒歩・車両、道路で別々)
 */
const GroundEffectSchema = z.object({
  /** 状態が1のときに、徒歩(道路以外)の速さから引く割合 */
  foot: z.number().min(0).max(1),
  /** 状態が1のときに、車両(道路以外)の速さから引く割合 */
  vehicle: z.number().min(0).max(1),
  /** 状態が1のときに、道路を行軍する速さから引く割合 */
  road: z.number().min(0).max(1),
});
export const GroundRulesSchema = z.object({
  /** 天候ごとの、1時間あたりのぬかるみ・積雪の増減(負なら乾く・解ける)。書いていない天候は増減しない */
  weather: z.record(z.string(), z.object({ mudPerHour: z.number().default(0), snowPerHour: z.number().default(0) })).default({}),
  mud: GroundEffectSchema.default({ foot: 0, vehicle: 0, road: 0 }),
  snow: GroundEffectSchema.default({ foot: 0, vehicle: 0, road: 0 }),
  /** 地面の状態による速さの倍率の下限 */
  minMultiplier: z.number().positive().max(1).default(0.2),
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
  /** 1編隊が1日に出撃できる回数。1日の出撃枠 = 編隊の数 × この値(四捨五入) */
  sortiesPerGroupPerDay: z.number().positive(),
  /** 制空権を持つ空域の分け方(既定。シナリオの airSectors で上書きできる) */
  sectors: z.object({ cols: z.number().int().min(1), rows: z.number().int().min(1) }),
  /** 空戦:同じ空域に両陣営の戦闘機がいれば、相手の出撃1回あたり、相手の割合をかけた分だけ編隊を失う */
  dogfightLossPerSortie: z.number().min(0),
  /** 迎撃されたときに失う編隊 */
  interceptLossGroups: z.number().min(0),
  /** 護衛:迎撃の確率を 1 / (1 + この値 × 護衛の出撃数) 倍にする */
  escortInterceptReduction: z.number().min(0),
  /** 護衛は、空域の戦闘機の数に、この重みで数える(制空権の取り合いへの寄与) */
  escortPresenceWeight: z.number().min(0),
  /** 対空砲:目標から radiusM 以内の敵の対空の力の合計(点)に応じて、編隊を失い(最大 maxLossGroups)、効果が 1 / (1 + 点 × effectPerPoint) 倍になる */
  flak: z.object({
    radiusM: z.number().positive(),
    lossPerPoint: z.number().min(0),
    maxLossGroups: z.number().min(0),
    effectPerPoint: z.number().min(0),
  }),
  /** 補給線への攻撃:目標から radiusM 以内の道路の輸送力を durationHours の間 capacityMultiplier 倍にし、範囲の縦隊を叩く */
  interdiction: z.object({
    radiusM: z.number().positive(),
    capacityMultiplier: z.number().min(0).max(1),
    durationHours: z.number().positive(),
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

/** 斥候。部隊から小部隊を出して、離れた地点を探る(司令部コマンド。そのターンのうちに結果が出る) */
export const PatrolRulesSchema = z.object({
  /** 陣営ごとの、1日に出せる回数 */
  perDay: z.number().int().min(0),
  /** 探る扇形の長さ(m)。出す部隊を要に、選んだ地点の方向へ広がる */
  maxRangeM: z.number().positive(),
  /** 探る扇形の半角(度) */
  halfAngleDeg: z.number().positive().max(180),
  /** 何もつかめずに戻ってくる確率(道に迷う・敵の警戒線を抜けられない)。このときは敵を見つけない */
  failChance: z.number().min(0).max(1),
  /** 1kmあたりにかかる時間(分)。扇形の半分の距離に応じて、結果が遅れて出る */
  minutesPerKm: z.number().min(0),
  /** 見つける確率の基本値。目標の地形の隠蔽と姿勢の見つかりにくさをかける。夜は視程の倍率もかける */
  detectChance: z.number().min(0).max(1),
  /** 偵察の兵科・偵察重視の姿勢の部隊から出したときの、見つける確率の倍率 */
  reconBonus: z.number().min(1),
  /** 探った範囲に敵がいるとき、斥候が見つかる確率 */
  caughtChance: z.number().min(0).max(1),
  /** 斥候が見つかったときに、出した部隊が失う戦力・士気 */
  caughtStrengthLoss: z.number().min(0).max(1),
  caughtMoraleLoss: z.number().min(0).max(1),
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
  /**
   * 陣地による制圧の影響の軽減(阻止する側だけ)。陣地レベル1つごとに、制圧で阻止の力が落ちる割合をこの分だけ減らす
   * (例 0.2:陣地3なら制圧の影響は4割)。壕に入った部隊は、撃たれても持ち場を保ちやすい
   */
  entrenchedSuppressionShield: z.number().min(0).max(1).default(0),
  /** 動揺(士気が shakenBelow 未満)しているときの力の倍率(双方) */
  shakenMultiplier: z.number().min(0),
  /** 突破中(阻止圏の中で相手に近づいているあいだ)の速度の倍率 */
  zoneSpeedMultiplier: z.number().positive(),
  /**
   * 突破された側の士気の低下(突破されるたびに1回。相手ごとに1ターン1回まで)。
   * 突破された部隊はその場では崩れず、崩れるのは後方を断たれた後(補給切れ・包囲)
   */
  breachedMoraleLoss: z.number().min(0).max(1).default(0),
  /**
   * 突破した部隊は、そのターンのうち敵の阻止圏の中にいる間は、正面から撃たれても側面から撃たれた扱いになる
   * (敵陣に入り込んで周りから撃たれる。封じ込められると大きな損害を受ける)
   */
  penetratorExposed: z.boolean().default(false),
  /**
   * 戦力の集中:同じ阻止圏に押し入ろうとしている味方(展開済みで、その敵からこの距離以内にいて、敵へ近づく経路を持つ)の
   * 突破の力を、この重みで足し合わせる(重点の形成)。0なら1部隊ずつ判定する
   */
  concentrationRadiusM: z.number().min(0).default(0),
  concentrationWeight: z.number().min(0).max(1).default(0),
  /**
   * 肉薄:目的地がその敵の阻止圏の中にある(その敵を攻める)動きは、敵からこの距離(m)までは突破判定なしで近づける
   * (阻止圏の中なので速度は zoneSpeedMultiplier。近づけば近距離の撃ち合いになる)。これより内へ踏み込む動きと、
   * 敵の脇を抜けて別の場所へ向かう動き(すり抜け)は突破判定。0 なら阻止圏の縁から突破判定
   */
  closeAssaultM: z.number().min(0).default(0),
  /**
   * 対装甲の力で割り引く阻止:装甲の部隊が突破を試みるとき、阻止する側の力を、その部隊が装甲を撃てる度合いで割り引く
   * (対戦車火器のない歩兵は、戦車を阻止圏で止められない)。度合いは、阻止する側の編成表の rangeM での
   * 対装甲の火力 ÷ 対人の火力(突破する側の編成表の装甲厚と貫通力も効く)を fullRatio で割ったもの(上限1、下限 minFactor)。
   * 阻止の力 × (1 − 突破する側の装甲化率 × (1 − 度合い))。省略すれば割り引かない
   */
  antiArmor: z.object({ rangeM: z.number().positive(), fullRatio: z.number().positive(), minFactor: z.number().min(0).max(1) }).optional(),
});

/**
 * 正面幅(frontage.ts)。展開済みのユニットは編成表の frontageM の幅の帯を受け持つ。
 * 幅は一定で、戦力が reducedBelowStrength を割ると reducedMultiplier 倍に縮む
 */
export const FrontageRulesSchema = z.object({
  reducedBelowStrength: z.number().min(0).max(1),
  reducedMultiplier: z.number().min(0).max(1),
  /**
   * 戦闘正面幅:1つの目標を正面から撃つ部隊の正面幅の合計(火力を分けていれば、その割合をかけた幅)が、
   * 目標の正面幅のこの倍数を超えると、正面から撃つ部隊の損害を比例して減らす(あふれた部隊は側面・背後に回らないと効かない)。
   * 省略は上限なし
   */
  combatWidthMultiplier: z.number().positive().optional(),
  /**
   * 並行移動:帯を持つユニットの移動が、残りの道のり shiftMaxM 以内で、向きの変化(到着後の向き − 今の向き)が
   * shiftMaxTurnDeg 以内なら、向きを保ったまま横・前後へずれ、最後に小さく回る。陣地は失わない
   * (その場で shiftMaxTurnDeg 以内だけ向きを直すのも同じ)。どちらかを省略すると並行移動はしない
   */
  shiftMaxM: z.number().min(0).optional(),
  shiftMaxTurnDeg: z.number().min(0).max(180).optional(),
});

/** 包囲。ターン終了時に判定する */
export const EncirclementRulesSchema = z.object({
  /** 脱出路を調べる方向の数 */
  directions: z.number().int().min(4),
  /** 脱出路の長さ(m)。この距離まで抜けられる方向が1つもなければ包囲 */
  escapeDistanceM: z.number().positive(),
  /** 包囲されたユニットが失う士気(ターンごと)。潰走中に包囲されていれば投降して消滅する */
  moraleLoss: z.number().min(0).max(1),
  /**
   * 籠城の限界:包囲されたユニットは士気が回復せず、士気がこの値以下になるか、弾薬がこの割合以下になると、
   * 潰走していなくても(死守していても)投降して消滅する
   */
  surrenderMoraleBelow: z.number().min(0).max(1).default(0),
  /**
   * 包囲が途切れたターンに、包囲のターン数をいくつ減らすか。省略すると0に戻す。
   * 隙間が1ターン開いただけで数え直しにならないように、小さい値にする(数が残っている間は士気も回復しない)
   */
  releasePerTurn: z.number().int().min(1).optional(),
  /**
   * 投降するまでに、続けて包囲されているターン数(潰走中も籠城の限界も。省略は1:包囲されたそのターンに投降しうる)。
   * 夜は1ターンが長いので、日をまたぐ包囲は夜1回で数ターン分にあたる
   */
  surrenderAfterTurns: z.number().int().min(1).default(1),
  surrenderAmmoBelow: z.number().min(0).max(1).default(0),
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
    /** 動いている(経路を持つ)目標の見つかりやすさの倍率(探知距離に掛ける)。止まって待つ側が先に見つける */
    movingSignatureMultiplier: z.number().positive().default(1),
  })
  .refine((d) => d.fullyIdentifiedRatio <= d.typeIdentifiedRatio, {
    message: "fullyIdentifiedRatio は typeIdentifiedRatio 以下にしてください",
  });

export const EntrenchmentRulesSchema = z
  .object({
    minLevel: z.number().int(),
    maxLevel: z.number().int(),
    /**
     * 陣地を築く時間:各段(minLevel+1 〜 maxLevel)に上がるのに要る、展開済みで動かずにいた累計時間(時間)。
     * 例 [0.5, 2, 8]:簡易壕30分、フォックスホール2時間、本格的な陣地8時間。省略すると動かないターンごとに1段
     */
    hoursToLevel: z.array(z.number().min(0)).optional(),
  })
  .refine((e) => e.minLevel <= e.maxLevel, { message: "minLevel は maxLevel 以下にしてください" })
  .refine((e) => !e.hoursToLevel || e.hoursToLevel.length === e.maxLevel - e.minLevel, { message: "hoursToLevel の数は段の数と同じにしてください" });

/** 練度。部隊ごと(シナリオの配置・増援)に段階を指定し、効果はここで定義する */
export const TrainingRulesSchema = z
  .object({
    /** 指定のない部隊の段階 */
    default: z.string(),
    levels: z.record(
      z.string(),
      z.object({
        name: z.string().min(1),
        /** 撃つときの火力の倍率 */
        firepowerMultiplier: z.number().positive(),
        /** 撃たれたときの士気の減り方の倍率 */
        moraleDamageTakenMultiplier: z.number().positive(),
        /** 突破の力・阻止の力の倍率 */
        breakthroughMultiplier: z.number().positive(),
        /**
         * 命令が効き始めるまでの遅れ(分)。それまでは前の命令のまま動く(昼だけ。省略は0)。
         * 訓練の浅い部隊は、命令が届いて動き出すまでに時間がかかり、攻撃の足並みがそろわない
         */
        orderDelayMinutes: z.number().min(0).default(0),
        /** 観測側としての探知距離の倍率(省略は1)。経験のある部隊は敵を早く見つける(先手を取りやすい) */
        visionMultiplier: z.number().positive().default(1),
      }),
    ),
  })
  .refine((t) => t.default in t.levels, { message: "default の練度が levels にありません", path: ["default"] });

/** 橋の爆破と修理(司令部コマンド)、空襲で橋が落ちること */
const BridgeRulesSchema = z.object({
  /** 爆破・修理を頼むには、橋からこの距離(m)以内に自軍の部隊(潰走していない)がいる */
  workRangeM: z.number().positive(),
  /** 爆破が成功する確率 */
  demolitionSuccess: z.number().min(0).max(1),
  /** 修理にかかる時間(時間)。橋のそばに自軍がいて、近くに敵がいないあいだだけ進む */
  repairHours: z.number().positive(),
  /** 修理が進むのは、橋からこの距離(m)以内に敵(潰走していない)がいないとき */
  repairClearM: z.number().positive(),
  /** 空襲1回で、着弾範囲の中の橋が落ちる確率 */
  airStrikeChance: z.number().min(0).max(1),
});

/**
 * 装備編成(武器の開発・連隊テンプレート)。ルールパックごとに、開発できる武器の型と調整できる値の範囲(時代の上限)、
 * 武器・編成表の点数の式、テンプレートの上限を決める
 */
const DesignParamSchema = z
  .object({
    name: z.string().min(1),
    /** 単位(表示用。例 "mm"、"口径") */
    unit: z.string().default(""),
    min: z.number(),
    max: z.number(),
    /** 基準の値。元の武器(reference)はこの値のときの性能 */
    default: z.number().positive(),
    step: z.number().positive().default(1),
  })
  .refine((p) => p.min > 0 && p.min <= p.default && p.default <= p.max, { message: "0 < min ≦ default ≦ max にしてください" });

/** 調整の効き方:値が基準の何倍かを exponent 乗して、target に掛ける(例 口径が1.2倍で exponent 1.5 なら 1.2^1.5 倍) */
const DesignEffectSchema = z.object({
  target: z.enum(["power", "range", "penetration", "ammoPerMin", "suppression", "antiAir"]),
  param: z.string().min(1),
  exponent: z.number(),
});

const DesignArchetypeSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    /** 元の武器(調整する値が基準のときの性能。武器パックの武器と同じ形) */
    reference: z.object({
      bands: z.array(z.object({ maxRangeM: z.number().positive(), power: z.number().min(0), penetrationMm: z.number().positive().optional() })).min(1),
      effectiveness: z.object({ soft: z.number().min(0), armored: z.number().min(0) }),
      indirect: z.boolean(),
      ammoPerMin: z.number().min(0),
      suppression: z.number().min(0).default(1),
      antiAir: z.number().min(0).default(0),
    }),
    params: z.record(z.string(), DesignParamSchema),
    effects: z.array(DesignEffectSchema),
  })
  .superRefine((a, ctx) => {
    a.effects.forEach((e, i) => {
      if (!(e.param in a.params)) ctx.addIssue({ code: "custom", path: ["effects", i, "param"], message: `調整する値 "${e.param}" が params にありません` });
    });
  });

export const DevelopmentRulesSchema = z.object({
  /**
   * 点数の式。武器 = 火力の積分(各射程帯の 火力 × 帯の幅km × (非装甲の効き目×softWeight + 装甲の効き目×armoredWeight×(1 + 最大の貫通力mm×penetrationPerMm)))
   * × firepowerPerKm(間接射撃は × indirectMultiplier)+ 対空の力 × antiAirPoint。
   * 編成表 = 要素ごとに 数 × (elementBase + 耐久 × hitPoint + 装甲厚の平均mm × armorPerMm + 武器の点数 × 数)
   * + 弾薬の携行備蓄t × ammoPerT + 燃料の携行備蓄t × fuelPerT
   */
  cost: z.object({
    firepowerPerKm: z.number().min(0),
    softWeight: z.number().min(0),
    armoredWeight: z.number().min(0),
    indirectMultiplier: z.number().min(0),
    penetrationPerMm: z.number().min(0),
    antiAirPoint: z.number().min(0),
    elementBase: z.number().min(0),
    hitPoint: z.number().min(0),
    armorPerMm: z.number().min(0),
    ammoPerT: z.number().min(0),
    fuelPerT: z.number().min(0),
  }),
  /** 連隊テンプレートの上限 */
  template: z.object({
    /** 要素の数(count の合計)の上限 */
    maxElements: z.number().int().positive(),
    /** 要素1つの耐久の範囲 */
    hitPoints: z.object({ min: z.number().positive(), max: z.number().positive() }),
    /** 要素1つが持てる武器の数(count の合計)の上限 */
    maxWeaponsPerElement: z.number().int().positive(),
    /** 装甲厚の上限(mm) */
    maxArmorMm: z.number().positive(),
  }),
  /** 開発できる武器の型 */
  archetypes: z.record(z.string(), DesignArchetypeSchema),
  /**
   * おまかせ編成の方針。点数の上限の中で、陣営の差し替えられる部隊の導出値(下の重み)が大きくなるように組む。
   * 重みは、元の値からの伸び(対数)に掛ける:soft=300mの対人の火力、armored=300mの対装甲の火力(携行対戦車火器も入る)、long=1000mの火力、hitPoints=耐久
   */
  autoStyles: z
    .record(
      z.string(),
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        weights: z.object({ soft: z.number().min(0), armored: z.number().min(0), long: z.number().min(0), hitPoints: z.number().min(0) }),
      }),
    )
    .default({}),
  /** おまかせ編成で武器を付け替えるときの、重い型・軽い型の値(基準から上限・下限までのこの割合だけ動かす) */
  autoWeaponStep: z.number().gt(0).max(1).default(0.5),
  /** おまかせ編成で中隊の数を増減できる幅(元の数に対する割合。少なくとも±1) */
  autoMaxChange: z.number().min(0).max(1).default(0.34),
  /**
   * 配属(戦いの前に、ある部隊の中隊を別の部隊に付ける)。fromBranches の兵科の部隊から、toBranches の兵科の部隊へ。
   * 1つの部隊に付けられる中隊は maxPerHost まで。省略すると配属できない
   */
  attachment: z.object({ fromBranches: z.array(z.string()), toBranches: z.array(z.string()), maxPerHost: z.number().int().positive() }).optional(),
  /** おまかせ編成で、元より下がる値をこの倍に重く数える(大きく削ってほかを伸ばす引き換えを抑える) */
  autoLossWeight: z.number().min(1).default(2),
});

/** 艦艇の陣形:撃つ・受ける方位ごとの倍率(艦首=針路の前 ±bowHalfArcDeg、艦尾=後ろ ±sternHalfArcDeg、そのほかは舷側) */
const ArcMultipliersSchema = z.object({ bow: z.number().min(0), beam: z.number().min(0), stern: z.number().min(0) });

export const NavalFormationSchema = z.object({
  name: z.string().min(1),
  /** 移動の速さへの倍率 */
  speedMultiplier: z.number().positive().default(1),
  /** 撃つ側:目標がいる方位(自分の針路から見て)ごとの火力の倍率。単縦陣は舷側が大きく、艦首・艦尾は前後の艦が射線をふさいで小さい */
  fire: ArcMultipliersSchema,
  /** 受ける側:撃ってくる相手の方位(自分の針路から見て)ごとの損害の倍率。単縦陣を艦首から撃たれる(T字を描かれる)と大きい */
  damageTaken: ArcMultipliersSchema,
  /** 対空射撃の力への倍率(輪形陣は大きい) */
  antiAirMultiplier: z.number().min(0).default(1),
  /** 航空攻撃で受ける損害への倍率(輪形陣は主力の艦を囲んで守る) */
  airDamageTakenMultiplier: z.number().positive().default(1),
  /**
   * 1隻ずつの艦の戦隊での持ち場:column=旗艦の後ろに一列、abreast=旗艦の左右に交互に横一列、ring=旗艦(主力)を中心に円く囲む。
   * spacingM は隣の艦との間隔(輪形陣は半径)。1隻ずつの艦(編成表の ship)では、火力・受ける損害の方位の倍率は使わず、
   * 撃つ方位へ向けられる砲の数と持ち場の並びで決まる
   */
  station: z.object({ kind: z.enum(["column", "abreast", "ring"]), spacingM: z.number().positive() }).default({ kind: "column", spacingM: 600 }),
});

export const NavalRulesSchema = z
  .object({
    formations: z.record(z.string(), NavalFormationSchema),
    defaultFormation: z.string().min(1),
    /** 陣形を変えるのにかかる時間(秒)。変えている間は前の陣形のまま */
    changeSeconds: z.number().min(0),
    bowHalfArcDeg: z.number().min(0).max(90).default(45),
    sternHalfArcDeg: z.number().min(0).max(90).default(45),
    /** 魚雷を撃てる時間(分。戦隊ごとの合計)。撃ち尽くすと、その戦いの中では積み直せない */
    torpedoSalvoMinutes: z.number().min(0).default(6),
    /** 艦艇どうしの、目で見つけられる距離の基本(m。檣楼の見張り。天候・夜の視界の倍率がかかる)。陸の探知の基本距離の代わり */
    surfaceDetectionRangeM: z.number().positive().default(20000),
    /**
     * 1隻ずつの艦の損傷:失った戦力(浮力)1あたりの速力の低下の割合と、速力の下限(倍率)。
     * 戦隊の旗艦は、戦隊のいちばん遅い艦の速さに stationSpeedMargin を掛けた速さまでに抑える(ほかの艦が持ち場に追いつけるように)
     */
    shipDamage: z.object({ speedLossPerDamage: z.number().min(0).default(0.6), minSpeedMultiplier: z.number().min(0).max(1).default(0.15) }).default({}),
    stationSpeedMargin: z.number().gt(0).max(1).default(0.9),
    /**
     * 艦の乗員(陸の部隊の士気・疲労の決まりの代わり)。routs:艦は潰走しない(退くのは指揮の判断)。fatigue:陸の疲労を艦にかけない。
     * shakenAccuracyMultiplier:士気が動揺の線を下回った艦の砲・発射管の力の倍率(陸の動揺の火力の倍率の代わり)。
     * 艦には士気・隊形・陣地による受ける損害の倍率をかけない(装甲は乗員の士気で薄くならない)
     */
    crew: z
      .object({ routs: z.boolean().default(false), fatigue: z.boolean().default(false), shakenAccuracyMultiplier: z.number().min(0).max(1).default(0.85) })
      .default({}),
    /** 持ち場からこの距離(m)以内なら、持ち場についている(動かない) */
    stationToleranceM: z.number().positive().default(150),
    /**
     * 落伍と合流:戦隊の中でいちばん速い艦の速さ × straggleSpeedRatio より遅くなった艦は、戦隊を離れる(旗艦の行き先へ自分の速さで進む)。
     * 離れた艦は、旗艦から rejoinRadiusM 以内で止まっていて、遅すぎなければ戦隊に戻る
     */
    straggleSpeedRatio: z.number().min(0).max(1).default(0.75),
    rejoinRadiusM: z.number().positive().default(1500),
    /**
     * 砲戦(1隻ずつの艦どうしで、武器に naval がある艦砲)。省略すると、陸と同じ火力の式で撃つ。
     * 1門の命中の数 = 発射の数 × 命中の確率。命中の確率 = 距離の表(hitChance。基準の大きさの艦に)× 射撃の修正(同じ目標を撃ち続けた時間。
     * rangingStart から rangingMinutes で1まで)×(目標の基準排水量 ÷ sizeReferenceT)^sizeExponent × 撃つ側の火力の倍率(練度・指揮官・制圧)× 艦の射撃指揮。
     * 当たった弾は、距離の表(deckShare)の割合で甲板に、残りは舷側に当たる。抜ければ浮力を coefficient × 弾の重さ^exponent 失い、
     * 抜けなければその nonPenetratingDamage 倍。抜けた弾は確率で火災・浸水(舷側だけ)・砲の損失を起こす。
     * 火災・浸水は1分ごとに浮力を削り、応急(damageControlPerMin × 練度の火力の倍率)で減る。浸水は速力も落とす
     */
    /**
     * 走る魚雷(1隻ずつの艦の発射管で、武器に torpedoRun があるもの)。省略すると陸と同じ火力の式で撃つ。
     * 見えている敵の艦が、射程の launchRangeShare 以内で発射管を向けられる方位に入ると、向けられる数だけ1斉射を撃つ(次発装填があれば reloadMinutes 後にもう1度)。
     * 魚雷は目標の未来位置へ、1本あたり spreadDegPerTorpedo の扇に開いて雷速で走り、射程で沈む。敵の艦の前を通ると、1本ごとに
     * (艦の幅 hitHalfWidthM ×(排水量 ÷ 1万トン)^1/3 × 2 ÷ その距離の扇の幅)× aimChance × 信頼性 で当たる。
     * 1本の損害は coefficient × 炸薬^exponent の浮力と、浸水 floodPerHit
     */
    torpedoes: z
      .object({
        launchRangeShare: z.number().gt(0).max(1),
        spreadDegPerTorpedo: z.number().positive(),
        hitHalfWidthM: z.number().positive(),
        aimChance: z.number().min(0).max(1),
        reloadMinutes: z.number().min(0),
        damage: z.object({ coefficient: z.number().positive(), exponent: z.number().positive() }),
        floodPerHit: z.number().min(0).max(1),
      })
      .optional(),
    /** 夜の海戦:撃った艦は、発砲の光でこの距離(m)まで見える(照明弾・探照灯もここにまとめる) */
    flashRangeM: z.number().positive().optional(),
    /**
     * 艦を見つける見張り・電探の決まり(省略すると陸と同じ:動いている目標は見つかりやすい)。
     * wake:暗いとき(視界の倍率が darkBelow 以下)の艦の見つかりやすさを、動いているかでなく速さ(ノット)で決める(航跡・艦首の波。表の間は直線で補う)。昼は 1。陸の movingSignatureMultiplier の代わり。
     * landBackdrop:見る艦から見て目標の向こう rangeM 以内に陸があると、陸影にまぎれて目で見つけにくい(visualMultiplier)。空から見るときは効かない。
     * radarLand:目標から nearLandM 以内に陸があると、陸の反射で電探の届く距離が clutterMultiplier 倍。見る艦と目標の間に陸があると電探は届かない(blocks)
     */
    /** 見分け:電探の反応だけの艦は、minutes × 練度ごとの倍率(byTraining。練度の ID ごと、省略は1)の間追ってから撃つ(identify.ts) */
    identification: z.object({ minutes: z.number().min(0), byTraining: z.record(z.string(), z.number().min(0)).default({}) }).optional(),
    sighting: z
      .object({
        wake: z.array(z.object({ knots: z.number().min(0), multiplier: z.number().positive() })).min(1),
        /** 航跡が効く暗さ:視界の倍率(夜・天候)がこれ以下のとき。昼は艦の見つかりやすさを変えない */
        darkBelow: z.number().min(0).max(1).default(0.5),
        landBackdrop: z.object({ rangeM: z.number().positive(), visualMultiplier: z.number().positive() }).optional(),
        radarLand: z.object({ nearLandM: z.number().positive(), clutterMultiplier: z.number().positive(), blocks: z.boolean().default(true) }).optional(),
      })
      .optional(),
    gunnery: z
      .object({
        /** 電探の反応だけの目標(目では見えていない)を撃つときの命中の倍率 */
        radarOnlyHitMultiplier: z.number().min(0).max(1).default(0.4),
        /** 射撃用の電探(編成表の fireControlRadar)のある艦の、電探の反応だけの目標への命中の倍率と、射撃の修正にかかる時間の倍率(艦級で上書きできる) */
        fireControlRadar: z.object({ radarOnlyHitMultiplier: z.number().min(0).max(1).default(0.7), rangingMultiplier: z.number().positive().default(0.5) }).default({}),
        /**
         * 弾:砲の群れの apPerGun・hePerGun を数えて撃つ。徹甲弾を先に使い、尽きたら榴弾。榴弾は抜ける厚さが hePenetrationMultiplier 倍で、火災は heFireMultiplier 倍。
         * 対地砲撃の榴弾を揚弾していた艦(heLoaded)は、艦を switchMinutes 撃ってから徹甲弾に替わる。
         * rofByRange:遠いほど弾着を見てから次を撃つので、発射の速さが落ちる(距離の表。弾も命中もその分だけ減る)
         */
        /**
         * 動力の停止:抜けた弾 1発・魚雷 1本・甲板を抜けた爆弾 1発ごとに、確率で機関・電路が止まる。止まっている間(minutes ÷ 練度の火力の倍率)は
         * 速さが speedMultiplier 倍、電探(捜索・射撃用)が使えず、砲の命中が accuracyMultiplier 倍(各砲塔の照準で撃つ)。応急で戻る
         */
        powerLoss: z
          .object({
            perPenetratingHit: z.number().min(0).max(1),
            perTorpedoHit: z.number().min(0).max(1),
            perBombHit: z.number().min(0).max(1),
            minutes: z.number().positive(),
            speedMultiplier: z.number().min(0).max(1),
            accuracyMultiplier: z.number().min(0).max(1),
          })
          .optional(),
        ammo: z
          .object({
            hePenetrationMultiplier: z.number().min(0).max(1).default(0.2),
            heFireMultiplier: z.number().min(0).default(2),
            switchMinutes: z.number().min(0).default(15),
            rofByRange: z.array(z.object({ rangeM: z.number().min(0), multiplier: z.number().positive() })).min(1).default([{ rangeM: 0, multiplier: 1 }]),
          })
          .default({}),
        hitChance: z.array(z.object({ rangeM: z.number().min(0), chance: z.number().min(0).max(1) })).min(1),
        rangingMinutes: z.number().positive(),
        rangingStart: z.number().min(0).max(1),
        sizeReferenceT: z.number().positive(),
        sizeExponent: z.number().min(0),
        deckShare: z.array(z.object({ rangeM: z.number().min(0), share: z.number().min(0).max(1) })).min(1),
        damagePerShell: z.object({ coefficient: z.number().positive(), exponent: z.number().positive() }),
        nonPenetratingDamage: z.number().min(0).max(1),
        fireChance: z.object({ penetrating: z.number().min(0).max(1), nonPenetrating: z.number().min(0).max(1) }),
        fireStep: z.number().min(0).max(1),
        floodChance: z.number().min(0).max(1),
        floodStep: z.number().min(0).max(1),
        gunLossChance: z.number().min(0).max(1),
        gunLossStep: z.number().min(0).max(1),
        fireDamagePerMin: z.number().min(0),
        floodDamagePerMin: z.number().min(0),
        damageControlPerMin: z.number().min(0),
        floodSpeedLoss: z.number().min(0).max(1),
        /** 火災がこれを超えると応急が追いつかず、1分あたり runawayFireGrowthPerMin ずつ燃え広がる(省略は燃え広がらない) */
        runawayFireAbove: z.number().min(0).max(1).optional(),
        runawayFireGrowthPerMin: z.number().min(0).default(0),
        /** 空母の火災の損害の倍率(航空燃料・爆弾・魚雷が燃え広がる)。省略は1 */
        carrierFireMultiplier: z.number().min(0).default(1),
        /** 砲戦の損害の、士気・制圧への効きの倍率(ゲージの重みに掛ける。陸の部隊より崩れにくい。艦は乗員が持ち場を離れられない) */
        moraleMultiplier: z.number().min(0).default(1),
        suppressionMultiplier: z.number().min(0).default(1),
      })
      .optional(),
  })
  .refine((n) => n.defaultFormation in n.formations, { message: "defaultFormation が formations に定義されていません", path: ["defaultFormation"] });

/** 指揮官の特性:効果は倍率(省略は1)。数%ほどの小さな違いにとどめる(フレーバーが主) */
export const CommanderTraitSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  /** 効く部隊(陸の部隊・艦艇の戦隊・航空隊。省略はすべて) */
  domains: z.array(z.enum(["land", "naval", "air"])).optional(),
  firepower: z.number().positive().default(1),
  damageTaken: z.number().positive().default(1),
  moraleDamageTaken: z.number().positive().default(1),
  moraleRecovery: z.number().positive().default(1),
  speed: z.number().positive().default(1),
  vision: z.number().positive().default(1),
  /** 空戦の力(航空隊の戦闘機) */
  airCombat: z.number().positive().default(1),
  /** AI の癖:慎重さ(AiConfig.caution)に足す値(負なら攻撃的)。最上位の指揮官の特性で決まる */
  aiCaution: z.number().min(-1).max(1).default(0),
  /** 同じ組の特性は1人に1つだけ(気性など。自動で付けるときに使う) */
  group: z.string().optional(),
});

const EchelonRanksSchema = z.object({
  company: z.string(),
  battalion: z.string(),
  regiment: z.string(),
  brigade: z.string(),
  division: z.string(),
  corps: z.string(),
  army: z.string(),
});

export const CommanderRulesSchema = z.object({
  traits: z.record(z.string(), CommanderTraitSchema),
  /** 上級部隊の指揮官の特性が隷下に効く割合(1なら部隊の指揮官と同じ) */
  formationShare: z.number().min(0).max(1),
  /** 倒れる:1ターンに失った戦力が threshold を超えると、失った戦力 × chancePerLoss の確率で部隊の指揮官が倒れる。部隊の士気が moraleLoss 下がる */
  casualty: z.object({ threshold: z.number().min(0), chancePerLoss: z.number().min(0), moraleLoss: z.number().min(0) }),
  /**
   * 架空の指揮官の名前を作る一覧(国ごと。style は western=名・姓、eastern=姓名)と、陣営の ID → 国の読み替え、規模ごとの階級。
   * シナリオが指揮官を書かなかった部隊・上級部隊に、決まった種で名前・階級・特性を付ける
   */
  names: z
    .object({
      nations: z.record(z.string(), z.object({ style: z.enum(["western", "eastern"]), family: z.array(z.string()).min(1), given: z.array(z.string()).min(1) })),
      aliases: z.record(z.string(), z.string()).default({}),
      ranks: z.object({ land: EchelonRanksSchema, naval: EchelonRanksSchema, air: EchelonRanksSchema }),
    })
    .optional(),
  /** 自動で付ける指揮官の特性の数 */
  auto: z.object({ traitsMin: z.number().int().min(0).max(3), traitsMax: z.number().int().min(0).max(3) }).default({ traitsMin: 2, traitsMax: 3 }),
});

/** 盤上の航空隊(編成表の air)の決まり */
export const AirGroupRulesSchema = z.object({
  /** 目標からこの距離(m)まで来たら攻撃に入る */
  attackRadiusM: z.number().positive(),
  /** 攻撃にかける時間(分) */
  strikeMinutes: z.number().positive(),
  /** 帰ってから再び出られるまでの時間(分。燃料・爆弾・魚雷の積み直し) */
  turnaroundMinutes: z.number().min(0),
  /** 敵の航空隊とこの距離(m)以内なら空戦になる */
  interceptRadiusM: z.number().positive(),
  /** 空戦の損害の物差し(対空の力1が1分あたりに与える耐久の損害) */
  airCombatScale: z.number().min(0),
  /** 攻撃中の航空隊は、この距離(m)以内の敵の対空射撃を受ける */
  antiAirRadiusM: z.number().positive(),
  /** 対空射撃の損害の物差し(対空の力1が1分あたりに与える耐久の損害) */
  antiAirScale: z.number().min(0),
  /** 攻撃の損害の倍率(直接射撃の damageScale にかける) */
  strikeScale: z.number().min(0),
  /** 飛んでいる航空隊を、地上・艦上から見つけられる距離(m。天候・夜の視界の倍率がかかる) */
  detectRangeM: z.number().positive(),
  /** 空から見つけられる距離の既定(m。編成表の air.visionM を省略したとき) */
  defaultVisionM: z.number().positive(),
  /** 母艦の戦力がこれを下回ると発着艦できない(飛行甲板の損傷) */
  carrierOpsMinStrength: z.number().min(0).max(1),
  /** 母艦の火災がこれを超えると発着艦できない(1隻ずつの艦の火災。省略は火災で止めない) */
  carrierOpsMaxFire: z.number().min(0).max(1).optional(),
  /**
   * 飛行甲板:空母は1度に1隊ずつ発艦・着艦する。launchMinutes・recoverMinutes は1隊あたりの時間(甲板に並べて飛ばす・降ろして格納する)。
   * 命令を受けた隊は、甲板が空くまで発艦の準備(spotting)で待つ。省略すると、すぐに飛び立ち・降りる
   */
  deck: z.object({ launchMinutes: z.number().min(0), recoverMinutes: z.number().min(0) }).optional(),
  /**
   * 艦への爆弾・魚雷(武器の airOrdnance)。1隻ずつの艦を攻撃する隊は、着いた最初のステップに1機1発を落とす。
   * 1機の命中の確率 = hitChance(爆弾・魚雷)×(目標の排水量 ÷ 1万トン)^sizeExponent × 練度の火力の倍率 × 陣形の航空攻撃の倍率
   * × exp(−まわりの対空の力 × aaDisruption)(対空砲火で照準が乱れる)。
   * 爆弾は甲板を抜ければ coefficient × 重さ^exponent の浮力と火災 bombFireStep、抜けなければ損害も火災も nonPenetratingDamage 倍。
   * 魚雷は naval.torpedoes の式の損害と浸水。兵装中・発艦待ちの隊を載せた空母に爆弾が当たると、火災が隊1つにつき armedDeckFireStep 増える
   */
  ordnance: z
    .object({
      hitChance: z.object({ bomb: z.number().min(0).max(1), torpedo: z.number().min(0).max(1) }),
      sizeExponent: z.number().min(0),
      aaDisruption: z.number().min(0),
      bombDamage: z.object({ coefficient: z.number().positive(), exponent: z.number().positive() }),
      nonPenetratingDamage: z.number().min(0).max(1),
      bombFireStep: z.number().min(0).max(1),
      armedDeckFireStep: z.number().min(0).max(1),
      torpedoFloodStep: z.number().min(0).max(1),
    })
    .optional(),
});

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
    ground: GroundRulesSchema.default({ weather: {}, mud: { foot: 0, vehicle: 0, road: 0 }, snow: { foot: 0, vehicle: 0, road: 0 }, minMultiplier: 0.2 }),
    air: AirRulesSchema,
    patrol: PatrolRulesSchema,
    bridges: BridgeRulesSchema.default({ workRangeM: 1000, demolitionSuccess: 0.85, repairHours: 8, repairClearM: 2000, airStrikeChance: 0.25 }),
    night: NightRulesSchema,
    fatigue: FatigueRulesSchema,
    fog: FogRulesSchema,
    breakthrough: BreakthroughRulesSchema,
    /** 脱出路(シナリオの escapeRoutes):脱出路の半径と、撤退できる「近くに敵がいない」距離(m) */
    escape: z.object({ radiusM: z.number().positive(), enemyClearM: z.number().min(0) }).default({ radiusM: 600, enemyClearM: 1500 }),
    encirclement: EncirclementRulesSchema,
    lastStand: LastStandRulesSchema,
    counterattack: CounterattackRulesSchema,
    terrain: z.record(z.string(), TerrainRulesSchema),
    stances: z.record(z.string(), StanceRulesSchema),
    /** 新規ユニットの姿勢であり、姿勢切替中のターンに扱う姿勢 */
    defaultStance: z.string(),
    /**
     * 目標の保持の決め方。count:範囲内の部隊の数の多い陣営(以前の決め方)。
     * strength:範囲内の部隊の力(編成表の耐久 × 戦力。動揺中は shakenWeight 倍)の合計が多い陣営。
     * 多い側が少ない側の (1 + contestedMargin) 倍に届かなければ拮抗(前の保持者のまま、どちらも補給を受けられない)
     */
    objectiveControl: z
      .object({
        measure: z.enum(["count", "strength"]),
        contestedMargin: z.number().min(0).default(0),
        shakenWeight: z.number().min(0).max(1).default(1),
      })
      .default({ measure: "count", contestedMargin: 0, shakenWeight: 1 }),
    frontage: FrontageRulesSchema.default({ reducedBelowStrength: 0.5, reducedMultiplier: 0.5 }),
    /** 装備編成(武器の開発・連隊テンプレート)。省略するとこのルールパックでは装備編成ができない */
    development: DevelopmentRulesSchema.optional(),
    /** 海戦(艦艇の陣形)。省略するとこのルールパックでは艦艇の戦隊を使えない */
    naval: NavalRulesSchema.optional(),
    /** 盤上の航空隊。省略するとこのルールパックでは航空隊のユニットを使えない */
    airGroups: AirGroupRulesSchema.optional(),
    /** 指揮官の特性と倒れる決まり。省略すると指揮官は効かない(名前だけ) */
    commanders: CommanderRulesSchema.optional(),
    training: TrainingRulesSchema.default({
      default: "regular",
      levels: { regular: { name: "標準", firepowerMultiplier: 1, moraleDamageTakenMultiplier: 1, breakthroughMultiplier: 1 } },
    }),
  })
  .refine((r) => r.defaultStance in r.stances, {
    message: "defaultStance が stances に定義されていません",
    path: ["defaultStance"],
  })
  .refine((r) => !r.combat.assault?.entrenchmentRatioMultiplier || r.combat.assault.entrenchmentRatioMultiplier.length === r.entrenchment.maxLevel - r.entrenchment.minLevel + 1, {
    message: "陣地レベルの数(minLevel〜maxLevel)と同じ個数にしてください",
    path: ["combat", "assault", "entrenchmentRatioMultiplier"],
  })
  .refine((r) => (r.combat.assault?.stances ?? []).every((id) => id in r.stances), {
    message: "combat.assault.stances に、stances に定義されていない姿勢があります",
    path: ["combat", "assault", "stances"],
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
export type FrontageRules = z.infer<typeof FrontageRulesSchema>;
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
export type DevelopmentRules = z.infer<typeof DevelopmentRulesSchema>;
export type NavalRules = z.infer<typeof NavalRulesSchema>;
export type AirGroupRules = z.infer<typeof AirGroupRulesSchema>;
export type CommanderTrait = z.infer<typeof CommanderTraitSchema>;
export type NavalFormation = z.infer<typeof NavalFormationSchema>;
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
