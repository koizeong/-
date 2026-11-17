#!/usr/bin/env python3
"""
ロワール戦役(1429年4月29日〜7月18日。オルレアンの解囲〜パテー〜ランスの戴冠)のキャンペーンファイル(v0・概略図)を作る。百年戦争の時代ルール(medieval)。

    python3 tools/campaigns/build_loire_1429.py

出力: data/campaigns/loire-1429.json

1428年10月からイングランド軍はオルレアンを囲み、南岸のトゥーレルと町の周りのバスティーユ(小さな砦)に籠っていた。
4月29日にジャンヌ・ダルクが補給の船団とともに町に入り、5月4〜7日にサン・ルー・サン・ジャン・ル・ブラン・オーギュスタン・トゥーレルの砦を落として、
8日にイングランド軍は囲みを解いた。6月にアランソン公とジャンヌの軍はジャルジョー(12日)・マン(15日)・ボージャンシー(17日)を取り、
18日のパテーの戦いでタルボットとファストルフの援軍を破った。王太子シャルルはジアンからトロワ・シャロンを経てランスへ進み、7月17日に戴冠した。
根拠と残りの裏取りは docs/research/loire-1429.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位は「隊」(数百〜千人ほど)。軍・守備隊を formation にする。兵力・隊の数・着いた日の多くは TODO(要裏取り)
(出典候補:DeVries『Joan of Arc: A Military Leader』、Pernoud & Clin『Joan of Arc: Her Story』、Cooper『The Real Falstaff』、
Burne『The Agincourt War』、ジャンヌの処刑裁判・復権裁判の記録、『オルレアン包囲日誌』)。
1段階は5日(4月29日を1日目として16段階で7月18日まで)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/loire-1429.json"

START = date(1429, 4, 29)
DAYS_PER_STAGE = 5
STAGES = 16


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯48度で約74km、緯度1度は約111km)"""
    return round((lon - 0.0) * 111 * math.cos(math.radians(48)), 1), round((lat - 47.0) * 111, 1)


F, W = "western-farmland", "ardennes-winter"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主。オルレアンの周りは表示が重ならないよう少しずらす
REGIONS = [
    # オルレアンの包囲
    ("orleans", "オルレアン(町)", 47.90, 1.91, F, None, "fr"),
    ("tourelles", "トゥーレルと南岸の砦(オーギュスタン・サン・ジャン・ル・ブラン)", 47.84, 1.93, F, None, "en"),
    ("bastilles", "北岸のバスティーユ(サン・ローラン・サン・ルー)", 47.95, 1.84, F, None, "en"),
    # ロワール川沿いの町(イングランド軍の守備)
    ("jargeau", "ジャルジョー", 47.86, 2.12, F, None, "en"),
    ("meung", "マン・シュル・ロワール(橋)", 47.83, 1.70, F, None, "en"),
    ("beaugency", "ボージャンシー", 47.78, 1.63, F, None, "en"),
    # ボース平野とパリ(イングランド軍の後ろ)
    ("patay", "パテー(ボース平野)", 48.05, 1.69, F, None, "en"),
    ("janville", "ジャンヴィル(イングランド軍の拠点)", 48.20, 1.88, F, None, "en"),
    ("chartres", "シャルトル", 48.45, 1.49, F, None, "en"),
    ("paris", "パリ(ベドフォード公)", 48.86, 2.35, F, "en", "en"),
    # 王太子の領地(ロワールの南)
    ("blois", "ブロワ(救援の軍の集結地)", 47.59, 1.33, F, "fr", "fr"),
    ("chinon", "シノン・トゥール(王太子の宮廷)", 47.17, 0.24, F, "fr", "fr"),
    ("bourges", "ブールジュ(王太子の都)", 47.08, 2.40, F, "fr", "fr"),
    ("sully", "シュリー", 47.77, 2.37, F, None, "fr"),
    ("gien", "ジアン(戴冠の行軍の集結地)", 47.69, 2.63, F, None, "fr"),
    ("montargis", "モンタルジ", 48.00, 2.74, F, None, "fr"),
    # ランスへの道(ブルゴーニュ派・イングランド派の町)
    ("auxerre", "オーセール", 47.80, 3.57, W, None, "en"),
    ("troyes", "トロワ", 48.30, 4.07, F, None, "en"),
    ("chalons", "シャロン", 48.96, 4.36, F, None, "en"),
    ("reims", "ランス(戴冠の地)", 49.26, 4.03, F, None, "en"),
]

LINKS = [
    ("orleans", "tourelles", "road"), ("orleans", "bastilles", "road"), ("orleans", "jargeau", "road"), ("orleans", "meung", "road"),
    ("orleans", "montargis", "road"), ("tourelles", "blois", "track"), ("bastilles", "janville", "road"), ("bastilles", "meung", "road"),
    ("jargeau", "sully", "road"), ("sully", "gien", "road"), ("gien", "bourges", "road"), ("gien", "montargis", "road"), ("gien", "auxerre", "road"),
    ("meung", "beaugency", "road"), ("meung", "patay", "road"), ("beaugency", "blois", "road"), ("beaugency", "patay", "track"),
    ("patay", "janville", "road"), ("janville", "chartres", "road"), ("janville", "paris", "road"), ("chartres", "paris", "road"),
    ("blois", "chinon", "road"), ("chinon", "bourges", "road"), ("blois", "bourges", "road"), ("montargis", "paris", "road"),
    ("auxerre", "troyes", "road"), ("troyes", "chalons", "road"), ("chalons", "reims", "road"), ("paris", "reims", "road"),
]
# 城壁の町と包囲の砦(守る側が築いた陣営のときだけ)。オルレアンの城壁は坑道陣地(陣地5)ほどの守り、砦・小さな町は塹壕線
FORTIFIED = {"orleans": ("cave", "fr"), "tourelles": ("trench", "en"), "bastilles": ("trench", "en"), "jargeau": ("trench", "en"),
             "meung": ("trench", "en"), "beaugency": ("trench", "en"), "paris": ("cave", "en"), "troyes": ("trench", "en"), "reims": ("trench", "en"),
             # 王太子の城の町(初めは入れていなかったが、AI 同士でイングランド軍がロワールの南へ突き進み、補給の源を3つとも取って3戦とも決定的に勝った。
             # 史実のイングランド軍はロワールの南へは攻め込めなかった)
             "blois": ("trench", "fr"), "chinon": ("cave", "fr"), "bourges": ("cave", "fr")}

EN_MAT, EN_ARCH, EN_HORSE, EN_GAR, EN_SIEGE = "med-en-mat", "med-en-archers", "med-en-horse", "med-en-garrison", "med-en-siege"
FR_MAT, FR_KN, FR_XBOW, FR_SCOTS, FR_MIL, FR_LIGHT, FR_ART = "med-fr-mat", "med-fr-knights", "med-fr-xbow", "med-fr-scots", "med-fr-militia", "med-fr-light", "med-fr-art"


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
    # ===== イングランド軍(包囲の軍は約4〜5千。数は出典で大きく違う。TODO(要裏取り))=====
    # 包囲の軍は7か月の包囲で減り(逃亡・病)、ジャンヌの到着で士気が落ちていた。初めは古参・満の戦力にしたが、AI 同士で中盤にオルレアンを落としたので、
    # 標準の練度・戦力8割にした(TODO(要裏取り):5月初めの包囲の軍の数)
    formation("en-tourelles", "en", "トゥーレルと南岸の砦(グラスデール)", "tourelles", [EN_MAT, EN_ARCH, EN_GAR, EN_SIEGE], training="regular", strength=0.8),
    formation("en-bastilles", "en", "北岸のバスティーユ(タルボット・スケールズ)", "bastilles", [EN_MAT, EN_ARCH, EN_ARCH, EN_GAR, EN_SIEGE], training="regular", strength=0.8),
    formation("en-suffolk", "en", "サフォーク伯の守備(ジャルジョー)", "jargeau", [EN_MAT, EN_ARCH, EN_GAR], training="regular"),
    formation("en-meung", "en", "マンの守備", "meung", [EN_ARCH, EN_GAR], training="regular"),
    formation("en-beaugency", "en", "ボージャンシーの守備", "beaugency", [EN_MAT, EN_ARCH, EN_GAR], training="regular"),
    formation("en-janville", "en", "ジャンヴィルの守備", "janville", [EN_ARCH, EN_GAR], training="regular"),
    formation("en-paris", "en", "パリの守備(ベドフォード公)", "paris", [EN_MAT, EN_ARCH, EN_GAR, EN_GAR], training="regular"),
    # ファストルフの援軍(約5千。6月中旬にジャンヴィルに着き、タルボットと合わさった)
    formation("en-fastolf", "en", "ファストルフの援軍", "janville", [EN_MAT, EN_MAT, EN_ARCH, EN_ARCH, EN_ARCH, EN_HORSE], arrive=date(1429, 6, 13), training="regular"),
    # ブルゴーニュ派・イングランド派の町の守備(トロワは7月10日、シャロン・ランスは戦わずに開いた)
    formation("bur-auxerre", "en", "オーセールの守備(ブルゴーニュ派)", "auxerre", [EN_GAR], training="green"),
    formation("bur-troyes", "en", "トロワの守備(ブルゴーニュ派)", "troyes", [EN_GAR, EN_GAR], training="green"),
    formation("bur-chalons", "en", "シャロンの守備", "chalons", [EN_GAR], training="green"),
    formation("bur-reims", "en", "ランスの守備", "reims", [EN_GAR], training="green"),
    # ===== フランス王太子軍 =====
    # オルレアンの守備(デュノワ)と市民兵
    formation("fr-orleans", "fr", "オルレアンの守備(デュノワ)", "orleans", [FR_MAT, FR_MIL, FR_MIL, FR_XBOW, FR_ART], training="regular"),
    # ジャンヌ・ダルクと救援の軍(ブロワで集め、4月29日に補給の船団とともに入った。約4千。TODO(要裏取り))
    # (始めはブロワに置いたが、AI がブロワに留めてオルレアンの守備だけが落ちた。4月29日は町に入った日なので、オルレアンから始める)
    formation("fr-joan", "fr", "ジャンヌ・ダルクと救援の軍(ラ・イル・ジル・ド・レ)", "orleans", [FR_MAT, FR_MAT, FR_KN, FR_XBOW, FR_SCOTS, FR_LIGHT], training="regular"),
    # アランソン公の軍(6月初めにセル・シュル・シェールで集めた。約6千)
    formation("fr-alencon", "fr", "アランソン公の軍", "blois", [FR_MAT, FR_KN, FR_KN, FR_XBOW, FR_LIGHT, FR_ART], arrive=date(1429, 6, 4), training="regular"),
    # リッシュモン元帥(ブルターニュの兵。6月16日ごろボージャンシーの前に着いた)
    formation("fr-richemont", "fr", "リッシュモン元帥の軍", "blois", [FR_MAT, FR_KN, FR_XBOW], arrive=date(1429, 6, 14), training="regular"),
    # 王太子シャルルの戴冠の軍(6月下旬にジアンで集めた。約1万2千)
    formation("fr-royal", "fr", "王太子シャルルの軍(戴冠の行軍)", "gien", [FR_MAT, FR_MAT, FR_KN, FR_KN, FR_MIL, FR_ART], arrive=date(1429, 6, 24), training="green"),
    formation("fr-bourges", "fr", "ブールジュの守備", "bourges", [FR_MIL, FR_MAT], training="green"),
    # 王太子の城の守備(TODO(要裏取り):1429年のブロワ・シノンの守備の大きさ)
    formation("fr-blois", "fr", "ブロワの守備", "blois", [FR_MIL, FR_XBOW], training="green"),
    formation("fr-chinon", "fr", "シノンの守備(王太子の宮廷)", "chinon", [FR_MIL, FR_MAT], training="green"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。仏:オルレアンの囲みを解き(トゥーレル)、ランスで戴冠すれば決定的(史実)、オルレアンを守って囲みを解けば限定的。
# 英:オルレアンを落とせば決定的、ランスとロワールの町を守れば限定的
VICTORY = L([
    ("fr", L([
        ("conditions", [cond("orleans", "orleans", 5), cond("tourelles", "tourelles", 3), cond("bastilles", "bastilles", 1), cond("jargeau", "jargeau", 1),
                        cond("meung", "meung", 1), cond("beaugency", "beaugency", 1), cond("troyes", "troyes", 1), cond("reims", "reims", 6), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 15), ("requires", ["orleans", "tourelles", "reims"])])),
        ("limited", L([("minPoints", 8), ("requires", ["orleans", "tourelles"])])),
    ])),
    ("en", L([
        ("conditions", [cond("orleans", "orleans", 8), cond("tourelles", "tourelles", 2), cond("reims", "reims", 5), cond("beaugency", "beaugency", 1),
                        cond("jargeau", "jargeau", 1), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 10), ("requires", ["orleans"])])),
        ("limited", L([("minPoints", 7), ("requires", ["reims"])])),
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
            works, side = FORTIFIED[rid]
            r["fortified"] = L([("works", works), ("side", side)])
        regions[rid] = r
        control[rid] = owner
    return L([
        ("id", "loire-1429"),
        ("name", "ロワール戦役(1429年。オルレアンの解囲〜ランスの戴冠)"),
        ("description",
         "百年戦争。イングランド軍に囲まれたオルレアンへ、ジャンヌ・ダルクが救援の軍とともに入る。トゥーレルと砦を落として囲みを解き、"
         "ロワール川沿いの町を取り返し、ボース平野でイングランドの長弓兵と戦う。王太子をランスへ連れて行き戴冠させられるか。1段階は5日、16段階。v0・概略図"),
        ("notes", "根拠は docs/research/loire-1429.md。作り直しは tools/campaigns/build_loire_1429.py。時代ルールは medieval(長弓・弩の曲射、騎士の突撃、杭、攻城の砲)。オルレアンの城壁は坑道陣地、砦は塹壕線で表した"),
        ("era", "1429-loire"),
        ("sides", [L([("id", "en"), ("name", "イングランド軍(とブルゴーニュ派)")]), L([("id", "fr"), ("name", "フランス王太子軍")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        ("weather", [L([("stage", 1), ("weather", "clear")]), L([("stage", 5), ("weather", "overcast")]), L([("stage", 8), ("weather", "clear")])]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("rules", L([
            # 補充:傭兵と封建の兵は集まりにくく、どちらも段階ごとに2%。イングランド軍はノルマンディーから遠く、矢と食糧に苦しんだ(備蓄の上限 8割。仮置き)
            ("replacementPerStage", 0.02),
            ("stockCap", L([("en", L([("ammo", 0.8), ("fuel", 1)]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "fr"),
            ("level", "decisive"),
            ("summary", "5月8日にイングランド軍はオルレアンの囲みを解いた。6月にジャルジョー・マン・ボージャンシーを取り、18日のパテーの戦いでフランスの騎兵が"
                        "杭を打つ前の長弓兵を襲ってイングランド軍を破り(タルボットは捕らわれた)、7月17日に王太子はランスで戴冠してシャルル7世となった"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
