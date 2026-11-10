#!/usr/bin/env python3
"""
バルジの戦い(アルデンヌ攻勢、1944年12月16日〜1945年1月8日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_bulge_1944.py

出力: data/campaigns/bulge-1944.json

独の第6装甲軍(北)・第5装甲軍(中)・第7軍(南)が、霧と雲の下でアルデンヌの米第5・第8軍団を突き、マース川を目指す。
米軍は第7機甲師団・第101・第82空挺師団などを送り、23日に空が晴れると連合軍の航空が一気に効く。
根拠と残りの裏取りは docs/research/bulge-1944.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。

部隊の単位:青作戦と同じく、**1個の部隊をおおよそ1個師団**とする。装甲師団=戦車連隊と装甲擲弾兵連隊の2つ、国民擲弾兵・降下猟兵・
歩兵師団=連隊1つの編成表、米の機甲師団=機甲任務部隊2つ、空挺師団=空挺歩兵連隊の編成表。両軍とも同じ抽象なので、比は崩れない。
1段階は2日(12月16日を1日目として12段階で1月8日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/bulge-1944.json"

START = date(1944, 12, 16)
DAYS_PER_STAGE = 2
STAGES = 12


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。経度1度は北緯50度で約71.5km、緯度1度は約111km)"""
    return round((lon - 4.7) * 71.5, 1), round((lat - 49.5) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主。緯度経度は町の中心のおおよその値(表示に使うだけ)
REGIONS = [
    # 独の出撃の地(アイフェル)
    ("schleiden", "シュライデン(第6装甲軍の集結地)", 50.53, 6.47, "ardennes-winter", "de", "de"),
    ("prum", "プリュム(第5装甲軍の集結地)", 50.21, 6.42, "ardennes-winter", "de", "de"),
    ("bitburg", "ビットブルク(第7軍の集結地)", 49.97, 6.52, "ardennes-winter", "de", "de"),
    # 米軍の前線(12月16日)
    ("monschau", "モンシャウ", 50.555, 6.24, "ardennes-winter", None, "us"),
    ("elsenborn", "エルゼンボルン・クリンケルト", 50.46, 6.22, "ardennes-winter", None, "us"),
    ("schnee-eifel", "シュネー・アイフェル", 50.27, 6.33, "ardennes-winter", None, "us"),
    ("clervaux", "クレルヴォー", 50.05, 6.03, "ardennes-winter", None, "us"),
    ("echternach", "エヒタナハ", 49.81, 6.42, "ardennes-winter", None, "us"),
    # 後方
    ("st-vith", "サン=ヴィット", 50.28, 6.13, "ardennes-winter", None, "us"),
    ("malmedy", "マルメディ", 50.43, 6.03, "ardennes-winter", None, "us"),
    ("stavelot", "スタヴロ", 50.39, 5.93, "ardennes-winter", None, "us"),
    ("spa", "スパ", 50.49, 5.86, "ardennes-winter", None, "us"),
    ("werbomont", "ウェルボモン", 50.38, 5.68, "ardennes-winter", None, "us"),
    ("houffalize", "ウファリーズ", 50.13, 5.79, "ardennes-winter", None, "us"),
    ("wiltz", "ヴィルツ", 49.97, 5.93, "ardennes-winter", None, "us"),
    ("ettelbruck", "エテルブリュック", 49.85, 6.10, "ardennes-winter", None, "us"),
    ("bastogne", "バストーニュ", 50.00, 5.72, "ardennes-winter", None, "us"),
    ("la-roche", "ラ・ロッシュ", 50.18, 5.58, "ardennes-winter", None, "us"),
    ("marche", "マルシュ", 50.23, 5.34, "ardennes-winter", None, "us"),
    ("neufchateau", "ヌーシャトー", 49.84, 5.43, "ardennes-winter", None, "us"),
    ("dinant", "ディナン(マース川)", 50.26, 4.91, "ardennes-winter", None, "us"),
    # 連合軍の補給の源
    ("liege", "リエージュ(マース川)", 50.63, 5.57, "western-farmland", "us", "us"),
    ("namur", "ナミュール(マース川)", 50.47, 4.87, "western-farmland", "us", "us"),
    ("luxembourg", "ルクセンブルク", 49.61, 6.13, "western-farmland", "us", "us"),
    ("arlon", "アルロン", 49.68, 5.81, "western-farmland", "us", "us"),
]

# 結び。主な道路を大づかみに。TODO(要裏取り):1944年の道路の格と橋
LINKS = [
    ("schleiden", "monschau", "road"),
    ("schleiden", "elsenborn", "road"),
    ("schleiden", "schnee-eifel", "track"),
    ("prum", "schnee-eifel", "road"),
    ("prum", "st-vith", "road"),
    ("prum", "clervaux", "road"),
    ("bitburg", "clervaux", "track"),
    ("bitburg", "ettelbruck", "road"),
    ("bitburg", "echternach", "road"),
    ("monschau", "elsenborn", "road"),
    ("monschau", "spa", "track"),
    ("elsenborn", "malmedy", "road"),
    ("schnee-eifel", "st-vith", "road"),
    ("st-vith", "malmedy", "road"),
    ("st-vith", "stavelot", "road"),
    ("st-vith", "houffalize", "road"),
    ("st-vith", "clervaux", "road"),
    ("malmedy", "stavelot", "road"),
    ("stavelot", "spa", "road"),
    ("stavelot", "werbomont", "road"),
    ("spa", "liege", "road"),
    ("werbomont", "liege", "road"),
    ("werbomont", "houffalize", "road"),
    ("werbomont", "marche", "road"),
    ("clervaux", "bastogne", "road"),
    ("clervaux", "wiltz", "road"),
    ("wiltz", "bastogne", "road"),
    ("wiltz", "ettelbruck", "road"),
    ("ettelbruck", "echternach", "road"),
    ("ettelbruck", "luxembourg", "road"),
    ("echternach", "luxembourg", "road"),
    ("houffalize", "bastogne", "road"),
    ("houffalize", "la-roche", "road"),
    ("la-roche", "marche", "road"),
    ("bastogne", "neufchateau", "road"),
    ("bastogne", "arlon", "road"),
    ("neufchateau", "arlon", "road"),
    ("neufchateau", "marche", "track"),
    ("arlon", "luxembourg", "road"),
    ("marche", "dinant", "road"),
    ("marche", "namur", "road"),
    ("dinant", "namur", "road"),
    ("namur", "liege", "rail"),
]

US_INF = "us_infantry_regiment_1944"
US_ARM = "us_armored_task_force_m4"
US_ABN = "us_airborne_regiment_1944"
VG = "de_volksgrenadier_regiment_1944"
PZ = "de_panzer_regiment_1944"
PZG = "de_panzergrenadier_regiment_1944"


def formation(fid: str, side: str, name: str, region: str, units: list[tuple[str, str]], arrive: date | None = None, training: str | None = None):
    """units:(ID の後ろ、編成表)の並び"""
    t = [("training", training)] if training else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t) for u, toe in units]
    return f


def panzer(tag: str):
    return [(f"{tag}pz", PZ), (f"{tag}pzg", PZG)]


def armored(tag: str):
    """米の機甲師団:機甲任務部隊を2つ(独の装甲師団と同じく2部隊)"""
    return [(f"{tag}a", US_ARM), (f"{tag}b", US_ARM)]


FORMATIONS = [
    # ---- 独軍 ----
    # 第6装甲軍(ディートリヒ):北の主攻。モンシャウからクレヴィンケルの正面。第1SS・第2SS装甲軍団と第67軍団(中)
    # 第1SS装甲軍団:第1SS・第12SS装甲師団(中。Wikipedia『I SS Panzer Corps』の要約)、第277国民擲弾兵師団(低。フォーラムの OOB)
    formation("de-1sspzk", "de", "第1SS装甲軍団(第1SS・第12SS装甲)", "schleiden", panzer("1ss") + panzer("12ss"), training="veteran"),
    # 第1SS装甲軍団の歩兵師団:第277国民擲弾兵師団。第12国民擲弾兵・第3降下猟兵師団は TODO(要裏取り)
    formation("de-1sspzk-inf", "de", "第1SS装甲軍団の歩兵師団(第277国民擲弾兵ほか)", "schleiden", [("277vg", VG), ("12vg", VG), ("3fj", VG)], training="regular"),
    # 第67軍団:モンシャウの方面。師団(第272・第326国民擲弾兵か)は TODO(要裏取り)
    formation("de-67k", "de", "第67軍団", "schleiden", [("vg1", VG), ("vg2", VG)], training="regular"),
    # 第2SS装甲軍団(第2SS・第9SS装甲):第6装甲軍の予備で、12月21日にサン=ヴィットの近くで投入(中。Wikipedia『II SS Panzer Corps』の要約)
    formation("de-2sspzk", "de", "第2SS装甲軍団(第2SS・第9SS装甲)", "schleiden", panzer("2ss") + panzer("9ss"), arrive=date(1944, 12, 21), training="veteran"),
    # 第5装甲軍(マントイフェル):中央。第47・第58装甲軍団と第66軍団(中)
    # 第47装甲軍団:第2装甲師団・教導戦車師団(中)、第26国民擲弾兵師団(中。バストーニュの包囲。docs/research/bastogne-1944-12.md)
    formation("de-47pzk", "de", "第47装甲軍団(第2装甲・教導戦車・第26国民擲弾兵)", "prum", panzer("2") + panzer("lehr") + [("26vg", VG)], training="veteran"),
    # 第58装甲軍団:第116装甲師団(低。フォーラムの OOB)、第560国民擲弾兵師団(低)
    formation("de-58pzk", "de", "第58装甲軍団(第116装甲・第560国民擲弾兵)", "prum", panzer("116") + [("560vg", VG)], training="regular"),
    # 第66軍団:シュネー・アイフェルの第106歩兵師団を包んだ。国民擲弾兵師団2つ(第18・第62か)は TODO(要裏取り)
    formation("de-66k", "de", "第66軍団", "prum", [("vg1", VG), ("vg2", VG)], training="regular"),
    # 第7軍:南の翼を守る。第212国民擲弾兵師団がエヒタナハを突いた(中。ibiblio『The Ardennes』の要約)。
    # 第5降下猟兵師団はバストーニュの南(中。docs/research/bastogne-1944-12.md)。第352・第276国民擲弾兵師団は TODO(要裏取り)
    formation("de-7army", "de", "第7軍(第5降下猟兵・第212国民擲弾兵ほか)", "bitburg", [("5fj", VG), ("212vg", VG), ("352vg", VG), ("276vg", VG)], training="regular"),
    # 第15装甲擲弾兵師団:24日の夜にバストーニュの北西へ(中。docs/research/bastogne-1944-12.md)。ここでは25日ごろにプリュムから
    formation("de-15pzg", "de", "第15装甲擲弾兵師団", "prum", [("15pzg", PZG)], arrive=date(1944, 12, 24), training="veteran"),
    # ---- 米軍(連合軍) ----
    # 第5軍団:第2・第99歩兵師団(中。12月13日にロール川のダムへ攻めていた。govinfo『The Battle of the Bulge』の要約。
    # クリンケルト=ロシュラートの戦いは docs/research/krinkelt-rocherath-1944-12-17.md)
    formation("us-99id", "us", "第99歩兵師団", "elsenborn", [("99", US_INF)], training="green"),
    formation("us-2id", "us", "第2歩兵師団", "elsenborn", [("2", US_INF)], training="veteran"),
    # 第8軍団:第106歩兵師団(第14騎兵群つき。11日に第2歩兵師団と入れ替わった。中)、第28歩兵師団(第110連隊がクレルヴォー。中)、
    # 第4歩兵師団(エヒタナハ。中)、第9機甲師団(A戦闘団はエヒタナハ方面、B戦闘団はサン=ヴィットへ。中。Warfare History Network)
    formation("us-106id", "us", "第106歩兵師団(第14騎兵群つき)", "schnee-eifel", [("106", US_INF), ("14cav", US_INF)], training="green"),
    formation("us-28id", "us", "第28歩兵師団", "clervaux", [("28", US_INF)], training="veteran"),
    formation("us-4id", "us", "第4歩兵師団", "echternach", [("4", US_INF)], training="veteran"),
    formation("us-9ad", "us", "第9機甲師団", "ettelbruck", armored("9"), training="regular"),
    # 増援。第7機甲師団は攻勢の初日にサン=ヴィットへ送られ、21日まで守った(中。encyclopedia.com・Wikipedia『Battle of St. Vith』の要約)
    formation("us-7ad", "us", "第7機甲師団", "st-vith", armored("7"), arrive=date(1944, 12, 17), training="veteran"),
    # 第10機甲師団B戦闘団は18日、第101空挺師団は19日にバストーニュ(中。docs/research/bastogne-1944-12.md)
    formation("us-10ad", "us", "第10機甲師団B戦闘団", "bastogne", [("10", US_ARM)], arrive=date(1944, 12, 18), training="regular"),
    formation("us-101", "us", "第101空挺師団", "bastogne", [("101", US_ABN)], arrive=date(1944, 12, 19), training="elite"),
    # 第82空挺師団:ウェルボモンへ(日付は資料で割れる。18日ごろ。中)
    formation("us-82", "us", "第82空挺師団", "werbomont", [("82", US_ABN)], arrive=date(1944, 12, 18), training="elite"),
    # 第30歩兵師団(マルメディ・スタヴロ)・第1歩兵師団(エルゼンボルン)が着いた日は TODO(要裏取り)。ここでは18日
    formation("us-30id", "us", "第30歩兵師団", "malmedy", [("30", US_INF)], arrive=date(1944, 12, 18), training="veteran"),
    formation("us-1id", "us", "第1歩兵師団", "elsenborn", [("1", US_INF)], arrive=date(1944, 12, 18), training="veteran"),
    # 第3軍の第3軍団(第4機甲・第26・第80歩兵師団):南から攻め、26日に第4機甲師団がバストーニュへの道を開いた(中)。
    # 攻め始めた日(22日とされる)は TODO(要裏取り)。ここでは22日にアルロン
    formation("us-3corps", "us", "第3軍団(第4機甲・第26・第80歩兵)", "arlon", armored("4ad") + [("26", US_INF), ("80", US_INF)], arrive=date(1944, 12, 22), training="veteran"),
    # 第7軍団(第2・第3機甲・第84歩兵師団。マルシュ・ラ・ロッシュの方面)と英第30軍団(第29機甲旅団がディナン)は、着いた日・場所とも TODO(要裏取り)。
    # ここでは22日にマルシュ、24日にディナン
    formation("us-7corps", "us", "第7軍団(第2・第3機甲)", "marche", armored("2ad") + armored("3ad"), arrive=date(1944, 12, 22), training="veteran"),
    # 米陸軍の研究の着いた日の一覧(generalstaff.org『1 US Army Battle of the Bulge 17 December 1944 to 5 January 1945』の要約):
    # 第84・第75歩兵師団は21日、第11機甲師団は25日、第83・第87歩兵師団と第6機甲師団は26日。第35歩兵師団は日付なし(TODO)。
    # 着いた地域は役割から置いた(第84・第75は線を守る=マルシュ・ウェルボモン、第11機甲・第87はバストーニュの西を攻める第8軍団=ヌーシャトー、
    # 第83は突出部の先端ロシュフォールの近く=マルシュ、第6機甲は第3軍団=アルロン)。地域は TODO(要裏取り)
    formation("us-84id", "us", "第84歩兵師団", "marche", [("84", US_INF)], arrive=date(1944, 12, 21), training="green"),
    formation("us-75id", "us", "第75歩兵師団", "werbomont", [("75", US_INF)], arrive=date(1944, 12, 21), training="green"),
    formation("us-11ad", "us", "第11機甲師団", "neufchateau", armored("11"), arrive=date(1944, 12, 25), training="green"),
    formation("us-87id", "us", "第87歩兵師団", "neufchateau", [("87", US_INF)], arrive=date(1944, 12, 26), training="green"),
    formation("us-83id", "us", "第83歩兵師団", "marche", [("83", US_INF)], arrive=date(1944, 12, 26), training="regular"),
    formation("us-6ad", "us", "第6機甲師団", "arlon", armored("6"), arrive=date(1944, 12, 26), training="veteran"),
    # 英第30軍団:19日にモントゴメリーがジヴェ・ディナン・ナミュールの橋を守るよう命じ、24日には橋を押さえていた。
    # 22日までに第51(ハイランド)・第53(ウェールズ)歩兵師団と近衛機甲師団がマーストリヒトとジヴェの間でマース川を守った
    # (Royal British Legion ブリュッセル支部・Tank Museum の要約)。第29機甲旅団は19日にディナン、師団は22日にナミュールとリエージュ。
    # 第33機甲旅団・第34戦車旅団・第6空挺師団は日付が分からない(TODO(要裏取り))。英軍の編成表がこの編成(era)にないので、米の編成表で代える
    formation("uk-29bde", "us", "英第29機甲旅団", "dinant", [("29", US_ARM)], arrive=date(1944, 12, 19), training="veteran"),
    formation("uk-30corps-n", "us", "英第30軍団(第53歩兵・近衛機甲)", "liege", [("53", US_INF)] + armored("gds"), arrive=date(1944, 12, 22), training="veteran"),
    formation("uk-30corps-s", "us", "英第30軍団(第51歩兵)", "namur", [("51", US_INF)], arrive=date(1944, 12, 22), training="veteran"),
]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid: str, mx: float, points: int):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方。史実の数値ではない)。
# 独:マース川(ディナンかリエージュ)を押さえれば決定的。バストーニュとサン=ヴィットを取って点が5以上なら限定的。
# 米:バストーニュ・エルゼンボルン・マース川の渡河点を守れば決定的。点が7以上なら限定的。
# 史実(1月8日):独はサン=ヴィット・ウファリーズ・ラ・ロッシュ・クレルヴォー・ヴィルツを保ち、米はバストーニュ・エルゼンボルン・マース川を守った
VICTORY = L(
    [
        (
            "de",
            L(
                [
                    ("conditions", [cond("dinant", "dinant", 5), cond("liege", "liege", 5), cond("bastogne", "bastogne", 3), cond("st-vith", "st-vith", 2), cond("houffalize", "houffalize", 1), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 10), ("requires", ["dinant"])])),
                    ("limited", L([("minPoints", 5), ("requires", ["bastogne"])])),
                ]
            ),
        ),
        (
            "us",
            L(
                [
                    ("conditions", [cond("bastogne", "bastogne", 3), cond("elsenborn", "elsenborn", 2), cond("dinant", "dinant", 3), cond("liege", "liege", 3), cond("st-vith", "st-vith", 2), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 13), ("requires", ["bastogne", "elsenborn", "dinant", "liege"])])),
                    ("limited", L([("minPoints", 7), ("requires", [])])),
                ]
            ),
        ),
    ]
)

# 天候の予定(段階=2日)。根拠は docs/research/bulge-1944.md「天候」
#  - 16日:独空軍は500機を飛ばした。18日:第9空軍は600機以上を飛ばした。19〜21日:ひどい天候。20日は夜の2機のほか飛べず。23日:初めての好天
#  - 1月1日:ボーデンプラッテ作戦(何度も延びて、初めて飛べた日)
#  - 段階ごとの置き方:1(16〜17日)曇り、2(18〜19日)霧、3(20〜21日)霧、4(22〜23日)晴れ、5・6(24〜27日)晴れ、7・8(28〜31日)曇り(TODO)、
#    9(1月1〜2日)晴れ、10〜12(3〜8日)曇り(TODO)。2日を1つにまとめるので、16日・18日に飛べた分は表せない
WEATHER = [(1, "overcast"), (2, "fog"), (4, "clear"), (7, "overcast"), (9, "clear"), (10, "overcast")]

# 航空基地と航空隊(根拠は docs/research/bulge-1944.md「航空隊」)
#  - 連合:第9空軍は中型爆撃機1,111・戦闘機1,502・偵察機217(資料の要約)。戦闘爆撃機は第9・第19・第29戦術航空軍団。
#    21日に第9・第29戦術航空軍団は英第2戦術空軍の指揮へ、22日に第9戦術航空軍団の3個戦闘機群が第19戦術航空軍団へ(陸軍航空隊博物館の年表)
#  - 独:16日に独空軍は500機を飛ばした。17〜27日に戦闘機644機を失い227機が損傷(資料の要約)
#  - 編隊1つ=実機約40機(作戦の層の単位)。連合は戦闘機1,502を3つの戦術航空軍団に等分、中型爆撃機1,111は1つ(基地は作戦地図の外なので補給の源の地域に置く)。
#    独は500機を戦闘機3/4・攻撃機1/4(仮置き)。基地・航続距離は仮置き(TODO(要裏取り))
#  - 戦術の戦闘へは、前線の一区画に回る分として、編隊1つ=戦闘機4機・攻撃機8機で渡す(ゲームの設計)
AIRBASES = ["liege", "luxembourg", "namur", "arlon", "prum", "schleiden"]
AIR_WINGS = [
    L([("id", "us-ixtac"), ("side", "us"), ("name", "第9戦術航空軍団"), ("base", "liege"), ("rangeKm", 250), ("fighters", 12.5), ("strike", 0)]),
    L([("id", "us-xixtac"), ("side", "us"), ("name", "第19戦術航空軍団"), ("base", "luxembourg"), ("rangeKm", 250), ("fighters", 12.5), ("strike", 0)]),
    L([("id", "us-xxixtac"), ("side", "us"), ("name", "第29戦術航空軍団"), ("base", "liege"), ("rangeKm", 250), ("fighters", 12.5), ("strike", 0)]),
    L([("id", "us-9bd"), ("side", "us"), ("name", "第9爆撃航空師団(中型爆撃機)"), ("base", "namur"), ("rangeKm", 400), ("fighters", 0), ("strike", 27.8)]),
    L([("id", "de-lw-west"), ("side", "de"), ("name", "西方航空軍(戦闘機)"), ("base", "prum"), ("rangeKm", 250), ("fighters", 9.4), ("strike", 3.1)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if rid in AIRBASES:
            r["airbase"] = True
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "bulge-1944"),
            ("name", "バルジの戦い(1944年12月〜1945年1月)"),
            (
                "description",
                "独の3個軍がアルデンヌの米軍の薄い正面を突き、マース川を目指す。米軍は機甲・空挺の師団を送ってサン=ヴィットとバストーニュで時を稼ぐ。"
                "22日までは雲と霧で航空が飛べず、23日に晴れると連合軍の航空が一気に効く。1段階は2日、12段階。v0・概略図(兵力・日付の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/bulge-1944.md。作り直しは tools/campaigns/build_bulge_1944.py。部隊1つ≒1個師団"),
            ("era", "1944-us-de"),
            ("sides", [L([("id", "us"), ("name", "連合軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            ("weather", [L([("stage", s), ("weather", w)]) for s, w in WEATHER]),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            # 独軍の燃料不足:燃料が足りず多くの装甲車両を捨てた。パイパー戦闘団は19日にストゥモンで燃料がほぼ尽き、24日に車両を捨てた
            # (army.mil・dvidshub・Cole『The Ardennes』第16章の要約。docs/research/bulge-1944.md)。補給で戻る燃料は4割まで(仮置き)
            ("rules", L([("stockCap", L([("de", L([("fuel", 0.4)]))])), ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter_bomber"), ("strikeToe", "gen_air_bomber")]))]))])),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "us"),
                        ("level", "limited"),
                        ("summary", "独軍はマース川に届かず、バストーニュは救われた。1月8日にはまだサン=ヴィット・ウファリーズ・ラ・ロッシュなどを保っていたが、攻勢はやみ、連合軍が押し返し始めていた"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
