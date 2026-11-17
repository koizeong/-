#!/usr/bin/env python3
"""
インパール作戦とコヒマの戦い(ウ号作戦。1944年3月8日〜7月6日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_imphal_1944.py

出力: data/campaigns/imphal-1944.json

3月8日、第15軍(牟田口)の第33師団がティディムの第17インド師団の後ろへ回り、15日に第15・第31師団がチンドウィン川を渡った。
第31師団はサンシャクで第50インド落下傘旅団を破り(3月22〜26日)、4月4日からコヒマを囲んだ。第15師団はインパールの北のディマプール道を断った。
英第4軍団(スクーンズ)はインパール平野に退いて囲まれながら守り、空輸で補給を受けた(第5インド師団も空輸で送られた)。
第33軍団(ストップフォード)の英第2師団がディマプールからコヒマを救い(4月18日〜)、6月22日にインパールへの道を開いた。
雨季の中で補給の尽きた第15軍は7月に作戦を止め、チンドウィン川へ退いた(約5万5千〜6万人の損害とされる。数は出典で差がある)。
根拠と残りの裏取りは docs/research/imphal-1944.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:日本は1個の部隊が1個連隊(1944年の歩兵連隊の編成表)、英連邦は1個の部隊が1個旅団(1944年の英の歩兵旅団の編成表。インド軍の旅団も)。
連隊と旅団は兵の数がほぼ同じ。師団の数・位置・着いた日の多くは TODO(要裏取り)
(出典候補:Kirby『The War Against Japan Vol. III』(英公刊戦史)、Slim『Defeat into Victory』、Allen『Burma: The Longest War』、
戦史叢書『インパール作戦』、Rooney『Burma Victory』、Swinson『Kohima』)。
1段階は7日(3月8日を1日目として18段階で7月11日まで)。空輸の補給は、インパール・ディマプールを英の補給の源にして代える。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/imphal-1944.json"

START = date(1944, 3, 8)
DAYS_PER_STAGE = 7
STAGES = 18


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯24.5度で約101km、緯度1度は約111km)"""
    return round((lon - 93.0) * 101, 1), round((lat - 22.5) * 111, 1)


J, M, F = "jungle", "mountains", "western-farmland"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 英連邦(第14軍の第4軍団・第33軍団)
    ("dimapur", "ディマプール(鉄道の終点・補給の基地)", 25.91, 93.73, F, "uk", "uk", True),
    ("kohima", "コヒマ(テニスコートの丘)", 25.67, 94.11, M, None, "uk", False),
    ("jessami", "ジェサミ", 25.62, 94.53, M, None, "uk", False),
    ("kangpokpi", "カングポクピ・マラム(ディマプール道)", 25.15, 93.97, M, None, "uk", False),
    ("ukhrul", "ウクルル・サンシャク", 25.10, 94.36, M, None, "uk", False),
    ("imphal", "インパール(平原と飛行場。空輸の補給)", 24.81, 93.94, F, "uk", "uk", True),
    ("palel", "パレル(飛行場)・シェナム峠", 24.45, 94.02, M, None, "uk", True),
    ("tamu", "タム・モーレ(カバウ谷)", 24.22, 94.31, J, None, "uk", False),
    ("bishenpur", "ビシェンプール・ニントゥコン", 24.60, 93.77, F, None, "uk", False),
    ("churachandpur", "チュラチャンドプル・トルボン(ティディム道)", 24.33, 93.68, M, None, "uk", False),
    ("tiddim", "ティディム(第17インド師団)", 23.37, 93.65, M, None, "uk", False),
    # 日本(第15軍)
    ("kalemyo", "カレミョウ(第33師団)", 23.19, 94.07, J, None, "jp", False),
    ("kalewa", "カレワ(チンドウィン川)", 23.20, 94.30, J, "jp", "jp", False),
    ("thaungdut", "タウンダット(第15師団の渡河)", 24.43, 94.70, J, None, "jp", False),
    ("homalin", "ホマリン(第31師団の渡河)", 24.87, 94.91, J, None, "jp", False),
    ("shwebo", "シュエボ・イェウ(第15軍の後方・飛行場)", 22.57, 95.70, F, "jp", "jp", True),
]
LINKS = [
    ("dimapur", "kohima", "road"), ("kohima", "kangpokpi", "road"), ("kangpokpi", "imphal", "road"), ("kohima", "jessami", "track"),
    ("jessami", "homalin", "track"), ("jessami", "ukhrul", "track"), ("ukhrul", "kangpokpi", "track"), ("ukhrul", "imphal", "road"),
    ("ukhrul", "homalin", "track"), ("ukhrul", "thaungdut", "track"), ("imphal", "palel", "road"), ("palel", "tamu", "road"),
    ("tamu", "thaungdut", "track"), ("tamu", "kalemyo", "road"), ("imphal", "bishenpur", "road"), ("bishenpur", "churachandpur", "road"),
    ("churachandpur", "tiddim", "road"), ("tiddim", "kalemyo", "road"), ("kalemyo", "kalewa", "road"), ("kalewa", "thaungdut", "track"),
    ("thaungdut", "homalin", "track"), ("kalewa", "shwebo", "road"), ("homalin", "shwebo", "track"), ("palel", "bishenpur", "track"),
]

JP_INF = "jp-inf-regt-1944"
JP_TK = "jp-tank-regt-1944"
JP_ART = "artillery_battalion"
INA = "jp-inf-regt-1941"
BDE = "uk-inf-bde-1944"
ARMD = "uk-armd-regt-1942"
ART = "uk-field-regt-25pdr"


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    out = []
    for u, toe in units:
        d = L([("id", f"{fid}-{u}"), ("toe", toe)])
        if training:
            d["training"] = training
        if strength:
            d["strength"] = strength
        out.append(d)
    f["units"] = out
    return f


FORMATIONS = [
    # ===== 第15軍(牟田口)=====
    # 第33師団(柳田):歩兵第213・第214・第215連隊、戦車第14連隊(九七式・新砲塔チハ)、山砲兵第33連隊。ティディムの第17インド師団の後ろへ回った
    formation("jp-33d", "jp", "第33師団(弓。柳田)", "kalemyo", [("214", JP_INF), ("215", JP_INF), ("art", JP_ART)], training="veteran"),
    # 山本支隊(第33師団の歩兵第213連隊の一部と戦車第14連隊・重砲。カバウ谷からタム・パレルへ)
    formation("jp-yamamoto", "jp", "山本支隊(戦車第14連隊・重砲)", "kalewa", [("213", JP_INF), ("tk", JP_TK), ("art", JP_ART)], training="veteran"),
    # 第15師団(山内):歩兵第51・第60・第67連隊。一部はまだタイから着いていなかった(戦力7割。仮置き)
    formation("jp-15d", "jp", "第15師団(祭。山内)", "thaungdut", [("51", JP_INF), ("60", JP_INF), ("67", JP_INF)], training="regular", strength=0.7),
    # 第31師団(佐藤):歩兵第58・第124・第138連隊。コヒマへ
    formation("jp-31d", "jp", "第31師団(烈。佐藤)", "homalin", [("58", JP_INF), ("124", JP_INF), ("138", JP_INF), ("art", JP_ART)], training="veteran"),
    # 後から:インド国民軍の第1師団(4月。編成表は1941年の歩兵連隊を未熟・戦力5割で代える)
    formation("ina-1d", "jp", "インド国民軍第1師団", "kalewa", [("a", INA), ("b", INA)], arrive=date(1944, 4, 10), training="green", strength=0.5),
    # ===== 英第14軍(スリム)=====
    # 第4軍団(スクーンズ):第17インド師団(ティディム)、第20インド師団(タム)、第23インド師団(インパールの予備)、第254戦車旅団(グラント)、第50インド落下傘旅団(サンシャク)
    formation("uk-17id", "uk", "第17インド師団(第48・第63旅団)", "tiddim", [("48", BDE), ("63", BDE), ("art", ART)], training="veteran"),
    formation("uk-20id", "uk", "第20インド師団(第32・第80・第100旅団)", "tamu", [("32", BDE), ("80", BDE), ("100", BDE), ("art", ART)], training="regular"),
    formation("uk-23id", "uk", "第23インド師団(第1・第37・第49旅団)", "imphal", [("1", BDE), ("37", BDE), ("49", BDE)], training="regular"),
    formation("uk-254tk", "uk", "第254インド戦車旅団(グラント・スチュアート)", "imphal", [("3d", ARMD), ("150", ARMD), ("art", ART)], training="regular"),
    formation("uk-50para", "uk", "第50インド落下傘旅団", "ukhrul", [("50", BDE)], training="regular", strength=0.8),
    # コヒマの守り(アッサム連隊・アッサム小銃隊ほか。わずか)
    formation("uk-kohima", "uk", "コヒマの守備隊(アッサム連隊ほか)", "kohima", [("a", BDE)], training="green", strength=0.4),
    # 後から:第5インド師団(3月19日〜、アラカンから空輸でインパールへ。第161旅団はディマプール・コヒマへ)、
    # 第33軍団の英第2師団(4月初め〜、鉄道でディマプールへ)、第7インド師団(4月下旬、空輸)、第23長距離挺進旅団(4月)
    formation("uk-5id", "uk", "第5インド師団(第9・第123旅団。空輸)", "imphal", [("9", BDE), ("123", BDE)], arrive=date(1944, 3, 19), training="veteran"),
    formation("uk-161", "uk", "第161インド旅団(第5インド師団)", "dimapur", [("161", BDE)], arrive=date(1944, 3, 29), training="veteran"),
    formation("uk-2d", "uk", "英第2師団(第4・第5・第6旅団)", "dimapur", [("4", BDE), ("5", BDE), ("6", BDE), ("art", ART)], arrive=date(1944, 4, 2), training="regular"),
    formation("uk-7id", "uk", "第7インド師団(第33・第89旅団)", "dimapur", [("33", BDE), ("89", BDE)], arrive=date(1944, 4, 23), training="veteran"),
    formation("uk-23lrp", "uk", "第23長距離挺進旅団(チンディット)", "dimapur", [("23", BDE)], arrive=date(1944, 4, 16), training="regular", strength=0.7),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。日本:インパールを取れば決定的、コヒマを押さえてディマプール道を断てば限定的。
# 英連邦:インパールとコヒマを守り、第15軍を大きく削れば決定的(史実)、インパールを守れば限定的
VICTORY = L([
    ("jp", L([
        ("conditions", [cond("imphal", "imphal", 6), cond("kohima", "kohima", 3), cond("dimapur", "dimapur", 3), cond("palel", "palel", 1),
                        cond("kangpokpi", "kangpokpi", 1), cond("tiddim", "tiddim", 1), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 10), ("requires", ["imphal"])])),
        ("limited", L([("minPoints", 5), ("requires", ["kohima"])])),
    ])),
    ("uk", L([
        ("conditions", [cond("imphal", "imphal", 5), cond("kohima", "kohima", 3), cond("palel", "palel", 1), cond("tamu", "tamu", 1),
                        cond("ukhrul", "ukhrul", 1), loss("loss", 2.0, 3)]),
        ("decisive", L([("minPoints", 11), ("requires", ["imphal", "kohima", "loss"])])),
        ("limited", L([("minPoints", 5), ("requires", ["imphal"])])),
    ])),
])

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))。
#  - 英連邦:第3戦術航空軍(ハリケーン・スピットファイア・ヴェンジェンス)。インパール・パレルの飛行場から
#  - 日本:第5飛行師団(一式戦・九九式双軽)。3月には多くを南西太平洋へ回していた
AIR_WINGS = [
    L([("id", "uk-221g"), ("side", "uk"), ("name", "第221航空群(インパール)"), ("base", "imphal"), ("rangeKm", 300), ("fighters", 3), ("strike", 2)]),
    L([("id", "uk-224g"), ("side", "uk"), ("name", "第3戦術航空軍(ディマプール・アッサムの飛行場)"), ("base", "dimapur"), ("rangeKm", 350), ("fighters", 2), ("strike", 2)]),
    L([("id", "jp-5fd"), ("side", "jp"), ("name", "第5飛行師団"), ("base", "shwebo"), ("rangeKm", 450), ("fighters", 2), ("strike", 1)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if airbase:
            r["airbase"] = True
        regions[rid] = r
        control[rid] = owner
    return L([
        ("id", "imphal-1944"),
        ("name", "インパール作戦とコヒマの戦い(1944年3〜7月)"),
        ("description",
         "ウ号作戦。第15軍の3つの師団がチンドウィン川を渡り、山と密林を越えてインパール平野とコヒマへ迫る。英第4軍団は平野に退いて空輸で守り、"
         "第33軍団がディマプールからコヒマを救いに来る。日本は雨季の前に補給の尽きないうちにインパールを取れるか。1段階は7日、18段階。v0・概略図(兵力・日付の多くは要裏取り)"),
        ("notes", "根拠は docs/research/imphal-1944.md。作り直しは tools/campaigns/build_imphal_1944.py。日本は部隊1つ≒1個連隊、英連邦は1個旅団。"
                  "空輸の補給はインパールを英の補給の源にして代え、日本の補給の苦しさ(ジンギスカン作戦)は備蓄の上限で代える"),
        ("era", "1944-burma"),
        ("sides", [L([("id", "jp"), ("name", "日本軍(第15軍)")]), L([("id", "uk"), ("name", "英連邦軍(第14軍)")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        # 5月中旬からの雨季(仮置き)
        ("weather", [L([("stage", 1), ("weather", "clear")]), L([("stage", 6), ("weather", "overcast")]), L([("stage", stage_of(date(1944, 5, 15))), ("weather", "rain")])]),
        ("seasons", [
            L([("stage", 1), ("name", "乾季")]),
            L([("stage", stage_of(date(1944, 5, 15))), ("name", "雨季"), ("ground", L([("mud", 0.8)]))]),
        ]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("rules", L([
            # 補充:日本はほとんど届かず、英連邦はインドから送った(仮置き)
            ("replacementBySide", L([("jp", 0.0), ("uk", 0.03)])),
            # 日本の弾薬・燃料:3週間分の糧食と弾薬を持って山を越え、牛・山羊で運ぶつもりだった補給(ジンギスカン作戦)は届かなかった(仮置き)
            ("stockCap", L([("jp", L([("ammo", 0.5), ("fuel", 0.5)]))])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_fighter_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "uk"),
            ("level", "decisive"),
            ("summary", "コヒマは4月18日に救われ、5月中旬まで戦いが続いた。6月22日にディマプールからの道が開き、インパールの囲みが解けた。"
                        "7月に第15軍は作戦を止めてチンドウィン川へ退き、約5万5千〜6万人の損害(多くは飢えと病)を出した(数は出典で差がある)"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
