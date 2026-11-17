#!/usr/bin/env python3
"""
ウルム〜アウステルリッツ戦役(1805年9月25日〜12月6日)のキャンペーンファイル(v0・概略図)を作る。ナポレオン戦争の時代ルール(napoleonic)。

    python3 tools/campaigns/build_austerlitz_1805.py

出力: data/campaigns/austerlitz-1805.json

ナポレオンの大陸軍は9月25日からライン川を渡り、ドナウ川の北を回ってマック将軍のオーストリア軍の後ろへ出た(ウルムの包囲。10月20日に降伏)。
クトゥーゾフのロシア軍はイン川から退き、11月13日にウィーンが落ち、大陸軍はモラヴィアへ追った。12月2日のアウステルリッツの戦いで
墺露の連合軍を破り、12月4日に休戦、26日にプレスブルクの和約。
根拠と残りの裏取りは docs/research/austerlitz-1805.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位は旅団(歩兵旅団=大隊4〜6、騎兵旅団=連隊2、砲兵=中隊2)。師団・旅団の集まり(formation)は軍団。
軍団ごとの旅団の数・着いた日・置き場所は、一般に知られた戦闘序列の大きさに合わせた仮置き(TODO(要裏取り):出典候補は
Goetz『1805: Austerlitz: Napoleon and the Destruction of the Third Coalition』、Schneid『Napoleon's Conquest of Europe: The War of the Third Coalition』、
Chandler『The Campaigns of Napoleon』、Nafziger の戦闘序列の集成)。
1段階は5日(9月25日を1日目として15段階で12月4日まで)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/austerlitz-1805.json"

START = date(1805, 9, 25)
DAYS_PER_STAGE = 5
STAGES = 15


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯48.5度で約74km、緯度1度は約111km)"""
    return round((lon - 7.5) * 111 * math.cos(math.radians(48.5)), 1), round((lat - 47.0) * 111, 1)


F, W, M = "western-farmland", "ardennes-winter", "mountains"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主
REGIONS = [
    # 大陸軍の出撃の地(ライン川)とバイエルン・ヴュルテンベルク(仏の同盟)
    ("strasbourg", "ストラスブール(ライン渡河)", 48.58, 7.75, F, "fr", "fr"),
    ("mannheim", "マンハイム・シュパイアー(ライン渡河)", 49.49, 8.47, F, "fr", "fr"),
    ("wurzburg", "ヴュルツブルク(ベルナドット・バイエルン軍)", 49.79, 9.95, F, "fr", "fr"),
    ("stuttgart", "シュトゥットガルト(ヴュルテンベルク)", 48.78, 9.18, F, None, "fr"),
    ("ansbach", "アンスバッハ(プロイセン領を横切った)", 49.30, 10.58, F, None, None),
    ("nordlingen", "ネルトリンゲン", 48.85, 10.49, F, None, None),
    ("ingolstadt", "インゴルシュタット", 48.76, 11.43, F, None, None),
    # マック将軍のオーストリア軍(バイエルンに入っていた)
    ("donauworth", "ドナウヴェルト(ドナウの渡河)", 48.72, 10.78, F, None, "co"),
    ("ulm", "ウルム(要塞)", 48.40, 9.99, F, None, "co"),
    ("gunzburg", "ギュンツブルク・エルヒンゲン", 48.45, 10.27, F, None, "co"),
    ("memmingen", "メミンゲン(イラー川)", 47.99, 10.18, F, None, "co"),
    ("augsburg", "アウクスブルク(レヒ川)", 48.37, 10.90, F, None, "co"),
    ("munich", "ミュンヘン", 48.14, 11.58, F, None, "co"),
    ("tyrol", "チロル(インスブルック)", 47.26, 11.39, M, None, "co"),
    # ドナウ川を下ってウィーンへ
    ("regensburg", "レーゲンスブルク", 49.01, 12.10, F, None, None),
    ("passau", "パッサウ(イン川)", 48.57, 13.43, F, None, "co"),
    ("braunau", "ブラウナウ(イン川)", 48.26, 13.03, F, None, "co"),
    ("linz", "リンツ", 48.31, 14.29, F, None, "co"),
    ("amstetten", "アムシュテッテン", 48.12, 14.87, W, None, "co"),
    ("st-polten", "ザンクト・ペルテン", 48.20, 15.62, W, None, "co"),
    ("krems", "クレムス・デュレンシュタイン(ドナウの北岸)", 48.41, 15.60, W, None, "co"),
    ("vienna", "ウィーン", 48.21, 16.37, F, "co", "co"),
    ("pressburg", "プレスブルク(ハンガリーへ)", 48.15, 17.11, F, "co", "co"),
    # モラヴィア
    ("hollabrunn", "ホラブルン・シェーングラーベルン", 48.56, 16.08, F, None, "co"),
    ("znaim", "ツナイム", 48.86, 16.05, F, None, "co"),
    ("iglau", "イーグラウ(ボヘミアへ)", 49.40, 15.59, W, None, "co"),
    ("brunn", "ブリュン", 49.19, 16.61, F, None, "co"),
    ("austerlitz", "アウステルリッツ(プラツェン高地)", 49.15, 16.88, F, None, "co"),
    ("olmutz", "オルミュッツ(同盟軍の集結地)", 49.59, 17.25, F, "co", "co"),
]

LINKS = [
    ("strasbourg", "stuttgart", "road"), ("mannheim", "stuttgart", "road"), ("mannheim", "wurzburg", "road"), ("wurzburg", "ansbach", "road"),
    ("stuttgart", "ulm", "road"), ("stuttgart", "nordlingen", "road"), ("ansbach", "nordlingen", "road"), ("ansbach", "ingolstadt", "road"),
    ("nordlingen", "donauworth", "road"), ("ulm", "gunzburg", "road"), ("ulm", "memmingen", "road"), ("gunzburg", "donauworth", "road"),
    ("gunzburg", "augsburg", "road"), ("memmingen", "augsburg", "road"), ("memmingen", "tyrol", "track"), ("donauworth", "augsburg", "road"),
    ("donauworth", "ingolstadt", "road"), ("augsburg", "munich", "road"), ("ingolstadt", "munich", "road"), ("ingolstadt", "regensburg", "road"),
    ("munich", "tyrol", "track"), ("munich", "braunau", "road"), ("regensburg", "passau", "road"), ("passau", "braunau", "road"),
    ("passau", "linz", "road"), ("braunau", "linz", "road"), ("tyrol", "linz", "track"), ("linz", "amstetten", "road"), ("amstetten", "st-polten", "road"),
    ("st-polten", "vienna", "road"), ("st-polten", "krems", "road"), ("krems", "hollabrunn", "road"), ("vienna", "hollabrunn", "road"),
    ("vienna", "pressburg", "road"), ("hollabrunn", "znaim", "road"), ("znaim", "brunn", "road"), ("znaim", "iglau", "road"), ("iglau", "brunn", "road"),
    ("brunn", "austerlitz", "road"), ("austerlitz", "olmutz", "road"), ("brunn", "olmutz", "road"), ("austerlitz", "pressburg", "road"),
]
# 築城した地域はない。初めはウルムを要塞(同盟が守るときの塹壕線)にしたが、AI 同士で大陸軍が正面から攻め続けて3戦とも負けた。
# 史実のウルムの守りは古く、マックは要塞に籠って守ったのではなく、ドナウ川の北を回られて囲まれた(TODO(要裏取り):1805年のウルムの守り)
FORTIFIED = {}

FR_LINE, FR_LIGHT, FR_GUARD = "nap-fr-line-bde", "nap-fr-light-bde", "nap-fr-guard-bde"
FR_CUIR, FR_DRAG, FR_LCAV = "nap-fr-cuir-bde", "nap-fr-drag-bde", "nap-fr-lcav-bde"
FR_ART, FR_HART, FR_RART = "nap-fr-art", "nap-fr-horse-art", "nap-fr-res-art"
AT_LINE, AT_GRENZ, AT_CAV, AT_LCAV, AT_ART = "nap-at-line-bde", "nap-at-grenz-bde", "nap-at-cav-bde", "nap-at-lcav-bde", "nap-at-art"
RU_LINE, RU_JAGER, RU_GUARD, RU_CUIR, RU_COSSACK, RU_ART = "nap-ru-line-bde", "nap-ru-jager-bde", "nap-ru-guard-bde", "nap-ru-cuir-bde", "nap-ru-cossack-bde", "nap-ru-art"


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    out = []
    for i, toe in enumerate(units):
        d = L([("id", f"{fid}-{i + 1}"), ("toe", toe)])
        if training:
            d["training"] = training
        if strength:
            d["strength"] = strength
        out.append(d)
    f["units"] = out
    return f


FORMATIONS = [
    # ===== フランス大陸軍(約21万。7個軍団と近衛・予備騎兵)=====
    # 旅団の数は軍団の大きさに合わせた仮置き。歩兵師団は旅団2つ、軍団の騎兵は軽騎兵旅団1つ、砲兵は軍団に1〜2
    formation("fr-1", "fr", "第1軍団(ベルナドット)", "wurzburg", [FR_LINE, FR_LINE, FR_LINE, FR_LCAV, FR_ART], training="regular"),
    formation("fr-2", "fr", "第2軍団(マルモン)", "wurzburg", [FR_LINE, FR_LINE, FR_LINE, FR_LCAV, FR_ART], training="regular"),
    formation("fr-3", "fr", "第3軍団(ダヴー)", "mannheim", [FR_LINE, FR_LINE, FR_LINE, FR_LINE, FR_LCAV, FR_ART], training="veteran"),
    formation("fr-4", "fr", "第4軍団(スルト)", "mannheim", [FR_LINE, FR_LINE, FR_LINE, FR_LINE, FR_LIGHT, FR_LCAV, FR_ART], training="veteran"),
    formation("fr-5", "fr", "第5軍団(ランヌ)", "strasbourg", [FR_LINE, FR_LINE, FR_LIGHT, FR_LIGHT, FR_LCAV, FR_ART], training="veteran"),
    formation("fr-6", "fr", "第6軍団(ネイ)", "stuttgart", [FR_LINE, FR_LINE, FR_LINE, FR_LIGHT, FR_LCAV, FR_ART], training="veteran"),
    formation("fr-guard", "fr", "近衛(ベシエール)", "strasbourg", [FR_GUARD, FR_GUARD, FR_CUIR, FR_HART], training="elite"),
    formation("fr-cav", "fr", "予備騎兵(ミュラ)", "strasbourg", [FR_CUIR, FR_CUIR, FR_DRAG, FR_DRAG, FR_DRAG, FR_LCAV, FR_HART], training="veteran"),
    formation("fr-bav", "fr", "バイエルン軍", "wurzburg", [FR_LINE, FR_LINE, FR_LINE, FR_LCAV, FR_ART], training="green"),
    # 第7軍団(オージュロー。ブレストから遅れて来た。11月にフォアアールベルク)
    formation("fr-7", "fr", "第7軍団(オージュロー)", "strasbourg", [FR_LINE, FR_LINE, FR_LINE, FR_ART], arrive=date(1805, 10, 25), training="regular"),
    # ===== オーストリア軍 =====
    # マック将軍のドイツの軍(約7万。フェルディナント大公は名目の総司令官)。バイエルンのイラー川・ドナウ川に広がっていた
    # (初めはウルムに7旅団を置いたが、AI 同士でウルムが固すぎたので、イラー川・ドナウ川の線に分けた)
    formation("at-mack-ulm", "co", "マックの軍の主力(ウルム)", "ulm", [AT_LINE, AT_LINE, AT_CAV, AT_ART], training="regular"),
    formation("at-mack-aug", "co", "マックの軍の一部(アウクスブルク)", "augsburg", [AT_LINE, AT_LINE, AT_LCAV], training="regular"),
    formation("at-mack-gz", "co", "マックの軍(ギュンツブルク・リーシュ)", "gunzburg", [AT_LINE, AT_LINE, AT_GRENZ, AT_LCAV, AT_ART], training="regular"),
    formation("at-jellacic", "co", "イェラチッチの軍団(メミンゲン)", "memmingen", [AT_LINE, AT_LINE, AT_GRENZ, AT_LCAV], training="regular"),
    formation("at-kienmayer", "co", "キーンマイヤーの軍団(ミュンヘン)", "munich", [AT_LINE, AT_LINE, AT_LCAV, AT_LCAV, AT_ART], training="regular"),
    formation("at-donauworth", "co", "ドナウヴェルトの守備", "donauworth", [AT_LINE, AT_LCAV], training="regular"),
    # チロルのヨハン大公の軍(約2万)
    formation("at-johann", "co", "ヨハン大公の軍(チロル)", "tyrol", [AT_LINE, AT_LINE, AT_GRENZ, AT_GRENZ], training="regular"),
    # ウィーンの守備と予備
    formation("at-vienna", "co", "ウィーンの守備と予備", "vienna", [AT_LINE, AT_LINE, AT_LCAV, AT_ART], training="green"),
    # ===== ロシア軍 =====
    # クトゥーゾフのポドリア軍(約3万8千):10月中旬にブラウナウに着いた
    formation("ru-kutuzov", "co", "クトゥーゾフのポドリア軍", "braunau", [RU_LINE, RU_LINE, RU_LINE, RU_LINE, RU_JAGER, RU_CUIR, RU_COSSACK, RU_ART], arrive=date(1805, 10, 15), training="regular"),
    # ブクスヘーヴデンのヴォルィーニ軍(約3万)とロシア近衛:11月中旬〜下旬にオルミュッツ
    formation("ru-buxhowden", "co", "ブクスヘーヴデンのヴォルィーニ軍", "olmutz", [RU_LINE, RU_LINE, RU_LINE, RU_LINE, RU_JAGER, RU_CUIR, RU_COSSACK, RU_ART], arrive=date(1805, 11, 15), training="regular"),
    formation("ru-guard", "co", "ロシア近衛(コンスタンチン大公)", "olmutz", [RU_GUARD, RU_GUARD, RU_CUIR, RU_ART], arrive=date(1805, 11, 20), training="elite"),
    formation("at-liechtenstein", "co", "リヒテンシュタイン公の墺軍(オルミュッツ)", "olmutz", [AT_LINE, AT_LINE, AT_CAV, AT_LCAV, AT_ART], arrive=date(1805, 11, 15), training="regular"),
    # イタリアからのカール大公の軍(12月初めにハンガリーへ着いたが、アウステルリッツには間に合わなかった)
    formation("at-karl", "co", "カール大公の軍(イタリアから)", "pressburg", [AT_LINE, AT_LINE, AT_LINE, AT_LINE, AT_CAV, AT_ART], arrive=date(1805, 12, 2), training="veteran"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。仏:ウルムとウィーンを取り、同盟軍を大きく削れば決定的(史実)、ウルムなら限定的。
# 同盟:ウィーンとウルムを守れば決定的、ウィーンを守れば限定的
VICTORY = L([
    ("fr", L([
        ("conditions", [cond("ulm", "ulm", 4), cond("vienna", "vienna", 5), cond("munich", "munich", 2), cond("brunn", "brunn", 2), cond("olmutz", "olmutz", 2), loss("rout", 0.5, 3)]),
        ("decisive", L([("minPoints", 14), ("requires", ["ulm", "vienna", "rout"])])),
        ("limited", L([("minPoints", 6), ("requires", ["ulm"])])),
    ])),
    ("co", L([
        # ウィーンは5点:作戦の AI は勝利点5以上の地域に1つ残す
        ("conditions", [cond("vienna", "vienna", 5), cond("ulm", "ulm", 3), cond("munich", "munich", 2), cond("brunn", "brunn", 1), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 10), ("requires", ["vienna", "ulm"])])),
        ("limited", L([("minPoints", 6), ("requires", ["vienna"])])),
    ])),
])


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "co")])
        regions[rid] = r
        control[rid] = owner
    return L([
        ("id", "austerlitz-1805"),
        ("name", "ウルム〜アウステルリッツ戦役(1805年)"),
        ("description",
         "ナポレオン戦争。大陸軍がライン川を渡り、ドナウ川の北を回ってマック将軍の後ろへ出る。ウルムで包めるか、ロシア軍の着く前にウィーンへ届くか。"
         "モラヴィアでは墺露の連合軍と決戦になる。1段階は5日、15段階。部隊は旅団、軍団ごとに動かす。v0・概略図(旅団の数・日付の多くは要裏取り)"),
        ("notes", "根拠は docs/research/austerlitz-1805.md。作り直しは tools/campaigns/build_austerlitz_1805.py。時代ルールは napoleonic(戦列・縦隊・方陣・騎兵の突撃と追撃・直接照準の大砲)。イタリア戦線(マッセナ対カール大公)とトラファルガーは表していない"),
        ("era", "1805-austerlitz"),
        ("sides", [L([("id", "fr"), ("name", "フランス大陸軍")]), L([("id", "co"), ("name", "第三次対仏大同盟(墺・露)")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        # 10月のウルムの長雨、11月の寒さ、12月2日の朝霧(アウステルリッツの太陽)。仮置き
        ("weather", [L([("stage", 1), ("weather", "clear")]), L([("stage", 3), ("weather", "rain")]), L([("stage", 6), ("weather", "overcast")]), L([("stage", 12), ("weather", "snow")]), L([("stage", 14), ("weather", "fog")])]),
        ("seasons", [
            L([("stage", 1), ("name", "初秋")]),
            L([("stage", 3), ("name", "秋の長雨"), ("ground", L([("mud", 0.5)]))]),
            L([("stage", 7), ("name", "晩秋")]),
            L([("stage", 11), ("name", "初冬"), ("ground", L([("mud", 0.2), ("snow", 0.2)]))]),
        ]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("rules", L([
            # 大陸軍は「土地で食う」ので補給の足は長い。同盟軍(特に遠くから来たロシア軍)は補給に苦しんだ(備蓄の上限は仮置き)
            ("stockCap", L([("co", L([("ammo", 0.9), ("fuel", 1)]))])),
            # 補充:戦役の2か月余りで、どちらも新しい兵はほとんど来なかった(段階ごとに2%)
            ("replacementPerStage", 0.02),
            ("maxUnitsPerBattle", 10),
        ])),
        ("historicalOutcome", L([
            ("winner", "fr"),
            ("level", "decisive"),
            ("summary", "10月20日にマック将軍がウルムで約2万3千人とともに降伏し(戦役全体で約6万の捕虜)、11月13日にウィーンが落ちた。"
                        "12月2日のアウステルリッツの戦いで大陸軍は墺露の連合軍を破り(連合軍の損害は約2万7千)、12月4日に休戦、26日にプレスブルクの和約"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
