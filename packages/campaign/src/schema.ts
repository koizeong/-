import { z } from "zod";

/**
 * キャンペーン(作戦の層)のデータ。地域を点、道路・鉄道を線でつないだ作戦地図の上で、師団・旅団(部隊の集まり)を動かす。
 * 地域でぶつかると、そこの地形の傾向で戦術の戦闘(連隊規模)を自動生成して戦う。1段階は数日
 */

const id = z.string().min(1);

/** 勝利の条件(キャンペーンの終わりに判定)。region:その地域を自陣営が押さえている。lossRatio:自陣営の損耗率が敵の max 倍以下 */
const CampaignConditionSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("region"), region: id, points: z.number().min(0).default(0) }),
  z.object({ id, type: z.literal("lossRatio"), max: z.number().positive(), points: z.number().min(0).default(0) }),
]);
export type CampaignCondition = z.infer<typeof CampaignConditionSchema>;

const TierSchema = z.object({ minPoints: z.number().min(0).default(0), requires: z.array(z.string()).default([]) });

export const CampaignDefSchema = z
  .object({
    id,
    name: z.string().min(1),
    description: z.string().optional(),
    notes: z.string().optional(),
    /** 戦術の戦闘の生成に使う編成(data/generators/missions.json の eras のキー)。陣営はその並び */
    era: id,
    sides: z.tuple([z.object({ id, name: z.string() }), z.object({ id, name: z.string() })]),
    calendar: z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      daysPerStage: z.number().int().positive(),
      /** この数の段階を解いたら終わる */
      stages: z.number().int().positive(),
    }),
    /**
     * 天候の予定(段階の始めから、その天候。次の予定まで続く)。戦術の戦闘の始めの天候になり、航空機の飛べない天候の段階は戦略の航空任務を出せない。
     * 天候はルールパックの天候の名前。省略は戦闘ごとの生成器の天候
     */
    weather: z.array(z.object({ stage: z.number().int().min(1), weather: id })).default([]),
    /**
     * 地域。x・y は作戦地図の上の位置(km。表示用)。biome は戦術の戦闘の地形の傾向。
     * supply はその陣営の補給の源(港・鉄道の終点)。押さえていれば、そこから自陣営の地域をたどって補給が届く
     */
    regions: z.record(
      id,
      z.object({
        name: z.string().min(1),
        x: z.number(),
        y: z.number(),
        biome: id,
        supply: id.optional(),
        /** 航空基地がある(押さえている陣営の航空隊を置ける) */
        airbase: z.boolean().optional(),
        /**
         * 海域(艦隊だけが入れる。艦隊だけがいる陣営が制海権を持つ=地域の持ち主)。海域は敵に押さえられていなければ補給が通る。
         * biome は使わない(海戦は海だけの地図)
         */
        sea: z.boolean().optional(),
        /** 補給の源が海から届く(港)。この海域を敵に押さえられると、補給の源として働かない */
        supplyVia: id.optional(),
        /** 港(艦隊が修理・補給を受けられる。隣の海域にいる艦隊が、この地域を押さえていて補給が届けば港にいる)。補給の源も港として扱う */
        port: z.boolean().optional(),
      }),
    ),
    links: z.array(z.object({ a: id, b: id, kind: z.enum(["road", "rail", "track", "sea"]).default("road") })),
    /** 始めの地域の持ち主(書かない地域は誰のものでもない) */
    control: z.record(id, id.nullable()).default({}),
    /** 師団・旅団。units は隷下の連隊・大隊(戦術の戦闘に出る部隊。編成表のキー) */
    formations: z.array(
      z.object({
        id,
        side: id,
        name: z.string().min(1),
        region: id,
        /** 後から来る増援:この段階の始めに region へ着く(region がそのとき敵のものなら、自陣営の補給の源へ)。書かなければ始めからいる */
        arriveStage: z.number().int().min(1).optional(),
        /** 海を渡って来る増援:この海域を敵に押さえられている間は着かない(押さえが解けた段階に着く) */
        via: id.optional(),
        /**
         * 上陸する増援:region が敵の地域でも、敵の師団・旅団がいなければそこへ上がって押さえる(例:仁川)。
         * 敵がいれば上がれず、次の段階まで遅れる
         */
        landing: z.boolean().optional(),
        /**
         * 夜の駆逐艦輸送(東京急行)で来る小さな増援:通る海域(via)を敵に押さえられていても、そこに敵の艦隊がいなければ夜に着く
         * (敵の航空隊が届く海域なら rules.nightExpress の loss だけ戦力を失う)。陣営に rules.nightExpress がなければ普通の増援と同じ
         */
        express: z.boolean().optional(),
        /** units の base は、航空隊を載せる母艦(同じ艦隊の空母の戦隊の id) */
        units: z
          .array(
            z.object({
              id,
              toe: id,
              training: z.string().optional(),
              strength: z.number().gt(0).max(1).optional(),
              /** 始めの携行備蓄(省略は満タン) */
              ammo: z.number().min(0).max(1).optional(),
              fuel: z.number().min(0).max(1).optional(),
              base: id.optional(),
              /** 艦の戦隊の名前(同じ艦隊で同じ名前の艦が1つの戦隊になる。先に書いた艦が旗艦。省略は艦隊で1つの戦隊) */
              squadron: z.string().min(1).optional(),
            }),
          )
          .min(1),
      }),
    ),
    /**
     * 航空隊(飛行団・航空群)。base の航空基地に置き、基地から rangeKm 以内の地域へ戦略の任務(地域の部隊・補給・航空基地への攻撃)に出すか、
     * その範囲の戦闘に出す(戦術の戦闘の司令部コマンドの空襲・近接支援・制空任務などに使える編隊になる)。
     * fighters・strike は戦闘機・攻撃機の編隊の数。weapon・count は攻撃機の1回の出撃の武器と機数(省略はキャンペーンの rules.air)
     */
    airWings: z
      .array(
        z.object({
          id,
          side: id,
          name: z.string().min(1),
          base: id,
          rangeKm: z.number().positive(),
          fighters: z.number().min(0).default(0),
          strike: z.number().min(0).default(0),
          weapon: id.optional(),
          count: z.number().int().positive().optional(),
          arriveStage: z.number().int().min(1).optional(),
          /** 海戦に出るときの機種(盤上の航空隊の編成表。省略は naval.landAir の既定) */
          navalToes: z.object({ fighter: id.optional(), strike: id.optional(), scout: id.optional() }).optional(),
        }),
      )
      .default([]),
    /** 艦隊の艦艇・航空隊の武器と編成表のパック(戦術の編成 era に重ねる)と、海戦の地図の大きさ(km)・長さ */
    naval: z
      .object({
        weapons: z.array(id).default(["naval-generic"]),
        toe: z.array(id).default(["naval-generic"]),
        widthKm: z.number().positive().default(140),
        heightKm: z.number().positive().default(80),
        /** 海戦の長さ(時間)。1ターンは turnMinutes 分。ユーザー判断で20分固定(ルールパックの naval.turnSeconds と合わなければ戦術の海戦を読み込まない) */
        hours: z.number().positive().default(12),
        turnMinutes: z.literal(20).default(20),
        /** 向かい合う艦隊の始めの間合い(km) */
        gapKm: z.number().positive().default(110),
        /**
         * 夜戦:空母のいない(水上艦だけの)海戦は、種で nightShare の割合を夜に始める(nightStartHour 時から nightHours 時間は暗い時間)。
         * ソロモンの水上戦の大半は夜。空母のいる海戦は昼に始める。squalls は海の局地のスコールの数(種で置く)
         */
        nightShare: z.number().min(0).max(1).default(0.7),
        nightStartHour: z.number().min(0).max(24).default(21),
        nightHours: z.number().positive().default(8),
        /** 夜戦の始めの間合い(km。見張りの届かない、すぐに出会う距離) */
        nightGapKm: z.number().positive().default(30),
        squalls: z.number().int().min(0).default(2),
        /**
         * 陸の航空基地の航空隊が海戦に出るときの、盤上の航空隊の編成表(空母の艦載機と同じ仕組み。飛行場は地図の外に方位と距離で置く)。
         * 1編隊の機数 aircraftPerGroup(rules.air.airOps があればその機数)。scout は攻撃機のある航空隊に1つ足す索敵機
         */
        landAir: z
          .object({ fighter: id, strike: id, scout: id.optional(), aircraftPerGroup: z.number().positive().default(12) })
          .default({ fighter: "air_fighter_group", strike: "air_torpedo_group", scout: "air_scout_group", aircraftPerGroup: 12 }),
      })
      .optional(),
    /** 史実の結末(結果の画面で比べる。史実のキャンペーンだけ) */
    historicalOutcome: z.object({ winner: id.nullable(), level: z.enum(["decisive", "limited", "draw"]), summary: z.string() }).optional(),
    victory: z.record(id, z.object({ conditions: z.array(CampaignConditionSchema).default([]), decisive: TierSchema, limited: TierSchema })),
    /** キャンペーンの決まり(数値は仮置き。キャンペーンごとに変えられる) */
    rules: z
      .object({
        /** 補給の届く部隊が、段階ごとに取り戻す戦力(補充)と士気 */
        replacementPerStage: z.number().min(0).max(1).default(0.05),
        /** 艦の修理:港にいる艦隊の艦(と艦上の航空隊)が段階ごとに取り戻す浮力(戦力)。港の外では直らない(陸の部隊の補充の代わり) */
        navalRepairPerStage: z.number().min(0).max(1).default(0.15),
        /** この戦力を下回った艦の多い艦隊は、作戦の AI が港へ下げる */
        navalRetireBelow: z.number().min(0).max(1).default(0.6),
        moraleRecoveryPerStage: z.number().min(0).max(1).default(0.3),
        /** 補給の届かない部隊の、段階ごとの携行備蓄の減り */
        unsuppliedStockLoss: z.number().min(0).max(1).default(0.3),
        /**
         * 陣営ごとの、補給で戻る携行備蓄の上限(0〜1)。燃料・弾薬が足りなかった陣営を表す(例:1944年12月のアルデンヌの独軍の燃料)。
         * 省略はどちらも1
         */
        stockCap: z.record(id, z.object({ ammo: z.number().min(0).max(1).default(1), fuel: z.number().min(0).max(1).default(1) })).default({}),
        /**
         * 夜の輸送(東京急行。陣営ごと)。loss:敵の航空隊が届く海域を通って着く増援が失う戦力。supplyShare:敵に押さえられた海域でも、
         * 敵の艦隊がいなければ夜に補給が少し届く(普通の補給に対する、補充と携行備蓄の戻りの割合)
         */
        nightExpress: z.record(id, z.object({ loss: z.number().min(0).max(1).default(0.1), supplyShare: z.number().min(0).max(1).default(0.4) })).default({}),
        /**
         * 飛行場への艦砲射撃:艦隊が飛行場の地域に面した海域に段階の終わりまで残れば、そこの敵の航空隊の編隊を share だけ壊し、
         * その段階の補充を止める。share = 艦種ごとの重み × 艦の戦力 の合計(上限 maxShare)。重みは仮置き
         * (1942年10月13〜14日夜の金剛・榛名の砲撃でカクタス航空隊の約90機のうち約48機を壊した、という要約から戦艦1隻 0.25)
         */
        bombardment: z
          .object({
            weights: z.record(z.string(), z.number().min(0)).default({ battleship: 0.25, battlecruiser: 0.25, heavy_cruiser: 0.05, light_cruiser: 0.02 }),
            maxShare: z.number().min(0).max(1).default(0.6),
          })
          .default({}),
        /** 1つの戦闘に出る部隊の上限(陣営ごと。超えた分は予備として戦わない) */
        maxUnitsPerBattle: z.number().int().positive().default(8),
        /** 決定的に負けた側の部隊が、さらに失う戦力の割合(潰走・落伍) */
        decisiveExtraLoss: z.number().min(0).max(1).default(0.1),
        /** 経験:勝った戦闘ごとの点(決定的なら decisive)。練度が上がるまでの点(練度の並びの順) */
        experience: z
          .object({ win: z.number().min(0).default(1), decisive: z.number().min(0).default(2), levels: z.array(id).min(1), thresholds: z.array(z.number().positive()) })
          .default({ win: 1, decisive: 2, levels: ["green", "regular", "veteran", "elite"], thresholds: [2, 5, 9] }),
        /**
         * 航空の決まり(数値は仮置き)。どれも攻撃機の編隊1つあたり:
         * unitStrength・unitMorale=地域の敵部隊への攻撃で、部隊が失う戦力・士気(部隊が多いほど薄まる。spreadUnits より多ければ割る)。
         * supplyStock=補給への攻撃で、地域の敵部隊が失う携行備蓄。supplyCut=その段階の補充・備蓄の戻りを削る割合。
         * airfieldGroups=航空基地への攻撃で、地上で壊す敵の編隊の数。
         * 迎撃:interceptKill=迎え撃つ戦闘機の編隊1つが落とす編隊の数(護衛の戦闘機が相手をした分は攻撃機に届かない)。flakLoss=対空砲で失う割合。
         * replacementPerStage=補給の届く基地の航空隊が、段階ごとに取り戻す編隊の数(始めの数まで)
         */
        air: z
          .object({
            weapon: id.default("ground_attack_aircraft"),
            count: z.number().int().positive().default(8),
            unitStrength: z.number().min(0).default(0.02),
            unitMorale: z.number().min(0).default(0.05),
            spreadUnits: z.number().int().positive().default(3),
            maxUnitLoss: z.number().min(0).max(1).default(0.2),
            supplyStock: z.number().min(0).default(0.08),
            supplyCut: z.number().min(0).max(1).default(0.25),
            airfieldGroups: z.number().min(0).default(0.3),
            interceptKill: z.number().min(0).default(0.3),
            flakLoss: z.number().min(0).max(1).default(0.04),
            replacementPerStage: z.number().min(0).default(0.5),
            /** 基地を移る(rebase)ときに飛べる距離:航続距離(戦闘の行動半径 rangeKm)の何倍か(回航は爆弾を積まず片道なので遠くまで行ける。仮置き) */
            ferryFactor: z.number().positive().default(2.5),
            /**
             * 陸の戦闘に出した航空隊を、戦術の戦闘の航空司令部(docs/air-design.md)として渡す。書かなければ前の仕組み(rules.air の編隊)で渡す。
             * aircraftPerGroup:編隊1つの機数(戦闘機・攻撃機)。fighterToe・strikeToe:機種の編成表。packs:機種の武器・編成表のパック(戦術の編成に重ねる)。
             * 基地は航空隊の基地の地域(戦場からの距離と方位は作戦地図の位置から)。戦闘に出す割合は航空の命令の share(戦術の戦闘の allotment に min = max で渡す)
             */
            airOps: z
              .object({
                aircraftPerGroup: z.object({ fighter: z.number().positive(), strike: z.number().positive() }),
                fighterToe: id,
                strikeToe: id,
                packs: z.array(id).default(["air-generic"]),
                requestsPerDay: z.number().int().min(0).default(4),
              })
              .optional(),
          })
          .default({}),
      })
      .default({}),
  })
  .superRefine((c, ctx) => {
    const regions = new Set(Object.keys(c.regions));
    const sides = new Set(c.sides.map((s) => s.id));
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    for (const [i, l] of c.links.entries()) for (const r of [l.a, l.b]) if (!regions.has(r)) issue(["links", i], `地域 "${r}" がありません`);
    for (const [r, s] of Object.entries(c.control)) {
      if (!regions.has(r)) issue(["control", r], `地域 "${r}" がありません`);
      if (s !== null && !sides.has(s)) issue(["control", r], `陣営 "${s}" がありません`);
    }
    for (const [r, g] of Object.entries(c.regions)) {
      if (g.supply && !sides.has(g.supply)) issue(["regions", r, "supply"], `陣営 "${g.supply}" がありません`);
      if (g.supplyVia && !c.regions[g.supplyVia]?.sea) issue(["regions", r, "supplyVia"], `海域 "${g.supplyVia}" がありません`);
      if (g.sea && g.airbase) issue(["regions", r], "海域に航空基地は置けません");
    }
    for (const [i, l] of c.links.entries()) {
      const sa = !!c.regions[l.a]?.sea;
      const sb = !!c.regions[l.b]?.sea;
      if ((sa || sb) && l.kind !== "sea") issue(["links", i], `海域につながる線は kind "sea" にしてください(${l.a}–${l.b})`);
      if (!sa && !sb && l.kind === "sea") issue(["links", i], `kind "sea" の線は海域につないでください(${l.a}–${l.b})`);
    }
    const hasSea = Object.values(c.regions).some((g) => g.sea);
    if (hasSea && !c.naval) issue(["naval"], "海域のあるキャンペーンには naval(艦艇のパック)を書いてください");
    const unitIds = new Set<string>();
    for (const [i, f] of c.formations.entries()) {
      if (!regions.has(f.region)) issue(["formations", i, "region"], `地域 "${f.region}" がありません`);
      if (!sides.has(f.side)) issue(["formations", i, "side"], `陣営 "${f.side}" がありません`);
      if (f.via && !c.regions[f.via]?.sea) issue(["formations", i, "via"], `海域 "${f.via}" がありません`);
      const ids = new Set(f.units.map((u) => u.id));
      for (const u of f.units) if (u.base && !ids.has(u.base)) issue(["formations", i, "units"], `母艦 "${u.base}" が同じ艦隊にありません`);
      for (const u of f.units) {
        if (unitIds.has(u.id)) issue(["formations", i, "units"], `部隊の ID "${u.id}" が重複しています`);
        unitIds.add(u.id);
      }
    }
    const wingIds = new Set<string>();
    for (const [i, w] of c.airWings.entries()) {
      if (wingIds.has(w.id)) issue(["airWings", i, "id"], `航空隊の ID "${w.id}" が重複しています`);
      wingIds.add(w.id);
      if (!sides.has(w.side)) issue(["airWings", i, "side"], `陣営 "${w.side}" がありません`);
      if (!c.regions[w.base]) issue(["airWings", i, "base"], `地域 "${w.base}" がありません`);
      else if (!c.regions[w.base]!.airbase) issue(["airWings", i, "base"], `地域 "${w.base}" に航空基地がありません`);
    }
    for (const [s, v] of Object.entries(c.victory)) {
      if (!sides.has(s)) issue(["victory", s], `陣営 "${s}" がありません`);
      const ids = new Set(v.conditions.map((x) => x.id));
      for (const x of v.conditions) if (x.type === "region" && !regions.has(x.region)) issue(["victory", s], `地域 "${x.region}" がありません`);
      for (const t of ["decisive", "limited"] as const) for (const r of v[t].requires) if (!ids.has(r)) issue(["victory", s, t], `条件 "${r}" がありません`);
    }
  });

export type CampaignDef = z.infer<typeof CampaignDefSchema>;
