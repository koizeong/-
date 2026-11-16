#!/usr/bin/env python3
"""
あ号作戦とマリアナ諸島の戦い(1944年6月11日〜8月10日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_a_go_1944.py

出力: data/campaigns/a-go-1944.json

米の第5艦隊(スプルーアンス)の第58任務部隊(ミッチャー)が6月11日からマリアナの飛行場を叩き、6月15日に第2・第4海兵師団がサイパンに上がる。
日本はあ号作戦で第一機動艦隊(小沢)を出し、6月19〜20日のマリアナ沖海戦で空母3隻(大鳳・翔鶴・飛鷹)と艦載機の大半を失った。
サイパンは7月9日、グアム(7月21日上陸)は8月10日、テニアン(7月24日上陸)は8月1日に落ちた。
根拠と残りの裏取りは docs/research/a-go-1944.md。この環境では資料を確かめられず、一般に知られた戦闘序列の概略から組み立てた。
艦隊・航空隊の顔ぶれ、守備隊の兵力・配置、機数の多くは TODO(要裏取り)
(出典候補:Morison『New Guinea and the Marianas』(第8巻)、Y'Blood『Red Sun Setting』、Crowl『Campaign in the Marianas』(米陸軍公刊戦史)、
防衛庁防衛研修所『戦史叢書 マリアナ沖海戦』『中部太平洋陸軍作戦(1)マリアナ玉砕まで』)。

1段階は4日(6月11日を1日目として16段階で8月10日まで)。部隊の単位は連隊(米の1944年の歩兵連隊で海兵連隊も代える。日本は1944年の歩兵連隊)。
テニアンへは、サイパンから海峡越しに渡った(砲兵はサイパンから撃った)ので、サイパン南西とテニアンを陸の小道でつなぐ(作戦の層の便宜)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/a-go-1944.json"

START = date(1944, 6, 11)
DAYS_PER_STAGE = 4
END = date(1944, 8, 10)
TOD = "TODO(要裏取り)"


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。1度≒111km、経度は北緯15度の値)"""
    return round((lon - 120.0) * 111 * math.cos(math.radians(15)), 1), round((lat - 5.0) * 111, 1)


# 地域:名前・緯度・経度・地形の傾向・補給の源・始めの持ち主・飛行場・港
REGIONS = [
    ("saipan-beach", "サイパン南西(チャランカノア・アスリート飛行場)", 15.15, 145.72, "jungle", "jp", "jp", True, False),
    ("saipan-tapochau", "サイパン中部(タッポーチョ山・ガラパン)", 15.20, 145.75, "jungle", None, "jp", False, True),
    ("saipan-north", "サイパン北部(マルピ岬)", 15.27, 145.81, "jungle", None, "jp", False, False),
    ("tinian", "テニアン(飛行場)", 14.99, 145.63, "western-farmland", "jp", "jp", True, False),
    ("rota", "ロタ(飛行場)", 14.15, 145.20, "jungle", None, "jp", True, False),
    ("guam-west", "グアム西岸(オロテ半島・アプラ港・アガット)", 13.43, 144.67, "jungle", "jp", "jp", True, True),
    ("guam-north", "グアム北部(アガニャ・又木山)", 13.55, 144.85, "jungle", None, "jp", False, False),
    # 島の外の基地
    ("eniwetok", "エニウェトク・クェゼリン(米の前進根拠地)", 11.50, 162.30, "jungle", "us", "us", True, True),
    ("iwojima", "硫黄島・父島", 24.78, 141.32, "jungle", "jp", "jp", True, True),
    ("yap-palau", "ヤップ・パラオ", 9.50, 138.10, "jungle", "jp", "jp", True, True),
    ("guimaras", "ギマラス・タウィタウィ(機動部隊の泊地)", 10.60, 122.60, "jungle", "jp", "jp", False, True),
]
# 島の補給の源は、面した海域を敵に押さえられると働かない(マリアナの守備隊は海から切り離されると補給が届かない)
SUPPLY_VIA = {"saipan-beach": "sea-saipan", "tinian": "sea-saipan", "guam-west": "sea-guam", "eniwetok": "sea-east", "iwojima": "sea-bonin", "yap-palau": "sea-philippine-w", "guimaras": "sea-philippine-w"}

# 海域:名前・緯度・経度・始めの持ち主
SEAS = [
    ("sea-saipan", "サイパン・テニアン沖", 15.10, 146.40, None),
    ("sea-guam", "グアム・ロタ沖", 13.60, 144.20, None),
    ("sea-marianas-w", "マリアナの西(フィリピン海の東部)", 14.50, 141.50, None),
    ("sea-philippine-w", "フィリピン海の西部", 12.00, 131.00, "jp"),
    ("sea-east", "マリアナの東(米の航路)", 13.00, 153.00, "us"),
    ("sea-bonin", "小笠原の近海", 23.50, 143.00, "jp"),
]
SEA_LINKS = [
    ("saipan-beach", "sea-saipan"), ("saipan-tapochau", "sea-saipan"), ("saipan-north", "sea-saipan"), ("tinian", "sea-saipan"),
    ("rota", "sea-guam"), ("guam-west", "sea-guam"), ("guam-north", "sea-guam"),
    ("eniwetok", "sea-east"), ("iwojima", "sea-bonin"), ("yap-palau", "sea-philippine-w"), ("guimaras", "sea-philippine-w"),
    ("sea-east", "sea-saipan"), ("sea-east", "sea-guam"), ("sea-saipan", "sea-guam"), ("sea-saipan", "sea-marianas-w"), ("sea-guam", "sea-marianas-w"),
    ("sea-marianas-w", "sea-philippine-w"), ("sea-marianas-w", "sea-bonin"), ("sea-saipan", "sea-bonin"),
]
LINKS = [
    ("saipan-beach", "saipan-tapochau", "road"), ("saipan-tapochau", "saipan-north", "road"),
    # サイパンからテニアンへは海峡(約5km)越しに渡った(作戦の層の便宜で陸の小道)
    ("saipan-beach", "tinian", "track"),
    ("guam-west", "guam-north", "road"),
]


def unit(uid, toe, training=None, strength=None, **extra):
    u = L([("id", uid), ("toe", toe)])
    if training:
        u["training"] = training
    if strength:
        u["strength"] = strength
    u.update(extra)
    return u


def formation(fid, side, name, region, units, arrive=None, **extra):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    f["units"] = units
    return f


def division(fid, side, name, region, regiments, artillery=1, tanks=0, arrive=None, training=None, strength=None, **extra):
    """師団・旅団:歩兵連隊(米 us-ir-1944・日本 jp-inf-regt-1944)・戦車(米の大隊・日本の連隊)・砲兵大隊"""
    inf = "us-ir-1944" if side == "us" else "jp-inf-regt-1944"
    tk = "us-tank-bn-1944" if side == "us" else "jp-tank-regt-1944"
    us = [unit(f"{fid}-{r}", inf, training, strength) for r in regiments]
    us += [unit(f"{fid}-tk{i + 1}", tk, training) for i in range(tanks)]
    us += [unit(f"{fid}-art{i + 1}", "artillery_battalion", training) for i in range(artillery)]
    return formation(fid, side, name, region, us, arrive, **extra)


def fleet(fid, side, name, region, ships, air=None, arrive=None, training=None, air_training=None):
    us = [unit(f"{fid}-{sid}", toe, training, squadron=sq) for sid, toe, sq in ships]
    us += [unit(f"{fid}-{sid}", toe, air_training or training, base=f"{fid}-{cv}") for sid, toe, cv in (air or [])]
    return formation(fid, side, name, region, us, arrive)


def essex(cv):
    """エセックス級の航空群(戦闘機・艦爆・艦攻。{TOD}:各艦の6月の機数。艦爆は SBD の艦もあったが SB2C で代える)"""
    return [(f"{cv}-vf", "pa44-f6f-36", cv), (f"{cv}-vb", "pa44-sb2c-24", cv), (f"{cv}-vt", "pa44-tbm-18", cv)]


def cvl(cv):
    return [(f"{cv}-vf", "pa44-f6f-24", cv), (f"{cv}-vt", "pa44-tbm-9", cv)]


def cve(cv):
    return [(f"{cv}-vc", "pa44-fm2-16", cv), (f"{cv}-vt", "pa44-tbm-12", cv)]


def jp_cv(cv, fighters=24, bombers=12, attack=12):
    """日本の空母の航空隊(零戦五二型・彗星・天山。{TOD}:各艦の機数。零戦の戦爆と九九式艦爆も載っていた)"""
    out = [(f"{cv}-vf", f"pa44-a6m5-{fighters}", cv)]
    if bombers:
        out.append((f"{cv}-vb", "pa44-d4y-12", cv))
    if attack:
        out.append((f"{cv}-vt", "pa44-b6n-12", cv))
    return out


DD_US = "us-dd-fletcher-1944"
DD_JP = "jp-dd-kagero"

FORMATIONS = [
    # ===== 米軍(陸。第5水陸両用軍団 ホーランド・スミス、南方上陸部隊 ガイガー)=====
    # 6月15日:第2・第4海兵師団がサイパンの南西岸(チャランカノア)に上陸。第27歩兵師団は16〜17日に上がった。
    # 海兵連隊は陸軍の1944年の歩兵連隊の編成表で代える({TOD}:海兵師団の編成)
    division("us-2mar", "us", "第2海兵師団", "saipan-beach", ["2m", "6m", "8m"], tanks=1, arrive=date(1944, 6, 15), training="veteran", landing=True, via="sea-saipan"),
    division("us-4mar", "us", "第4海兵師団", "saipan-beach", ["23m", "24m", "25m"], tanks=1, arrive=date(1944, 6, 15), training="veteran", landing=True, via="sea-saipan"),
    division("us-27div", "us", "第27歩兵師団", "saipan-beach", ["105", "106", "165"], arrive=date(1944, 6, 17), training="regular", landing=True, via="sea-saipan"),
    # グアム:7月21日に第3海兵師団(北のアサン)と第1臨時海兵旅団(南のアガット)、第77歩兵師団は21〜23日。ここでは西岸に1つにまとめた
    division("us-3mar", "us", "第3海兵師団", "guam-west", ["3m", "9m", "21m"], tanks=1, arrive=date(1944, 7, 21), training="veteran", landing=True, via="sea-guam"),
    division("us-1mbde", "us", "第1臨時海兵旅団", "guam-west", ["4m", "22m"], artillery=0, arrive=date(1944, 7, 21), training="veteran", landing=True, via="sea-guam"),
    division("us-77div", "us", "第77歩兵師団", "guam-west", ["305", "306", "307"], arrive=date(1944, 7, 23), training="green", landing=True, via="sea-guam"),
    # ===== 日本軍(陸。第31軍 小畑、サイパンは第43師団 斎藤)=====
    # サイパン:第43師団(歩兵第118・第135・第136連隊。第118連隊は輸送の途中で潜水艦に沈められて兵の多くを失った)、独立混成第47旅団、
    # 戦車第9連隊、海軍の第5根拠地隊・陸戦隊。合わせて約3万人とされる。{TOD}:配置と兵力
    division("jp-43div-s", "jp", "第43師団(歩兵第136連隊・戦車第9連隊)", "saipan-beach", ["136"], tanks=1, training="regular"),
    division("jp-43div-c", "jp", "第43師団(歩兵第135連隊・独立混成第47旅団)", "saipan-tapochau", ["135", "47b"], training="regular"),
    division("jp-43div-n", "jp", "第43師団(歩兵第118連隊)と海軍の陸戦隊", "saipan-north", ["118"], artillery=0, training="regular", strength=0.6),
    # テニアン:歩兵第50連隊(第29師団から)・歩兵第135連隊の1個大隊・海軍(約8千人)。{TOD}
    division("jp-tinian", "jp", "テニアンの守備隊(歩兵第50連隊・海軍)", "tinian", ["50"], training="regular"),
    # グアム:第29師団(歩兵第18・第38連隊。第18連隊は輸送の途中で沈められ兵を失った)、独立混成第48旅団、海軍の陸戦隊(約1万8千人)。{TOD}
    division("jp-29div-w", "jp", "第29師団(歩兵第38連隊・独立混成第48旅団)", "guam-west", ["38", "48b"], training="regular"),
    division("jp-29div-n", "jp", "第29師団(歩兵第18連隊)", "guam-north", ["18"], artillery=0, training="regular", strength=0.7),
    # ===== 米の艦隊(第5艦隊 スプルーアンス・第58任務部隊 ミッチャー)=====
    # 4つの空母の任務群と、戦艦の戦列(第58.7任務群 リー)。空母と護衛の割り振りは一般に知られた戦闘序列の概数({TOD}:Morison 第8巻の付録)
    fleet("us-tg581", "us", "第58.1任務群(クラーク)", "sea-saipan", [
        ("hornet", "us-cv-essex", "空母"), ("yorktown", "us-cv-essex", "空母"), ("belleau-wood", "us-cvl-independence", "空母"), ("bataan", "us-cvl-independence", "空母"),
        ("boston", "us-ca-baltimore", "護衛"), ("dd1", DD_US, "護衛"), ("dd2", DD_US, "護衛"), ("dd3", DD_US, "護衛"),
    ], air=essex("hornet") + essex("yorktown") + cvl("belleau-wood") + cvl("bataan"), training="veteran"),
    fleet("us-tg582", "us", "第58.2任務群(モンゴメリー)", "sea-saipan", [
        ("bunker-hill", "us-cv-essex", "空母"), ("wasp", "us-cv-essex", "空母"), ("monterey", "us-cvl-independence", "空母"), ("cabot", "us-cvl-independence", "空母"),
        ("santa-fe", "us-cl-cleveland", "護衛"), ("dd1", DD_US, "護衛"), ("dd2", DD_US, "護衛"), ("dd3", DD_US, "護衛"),
    ], air=essex("bunker-hill") + essex("wasp") + cvl("monterey") + cvl("cabot"), training="veteran"),
    fleet("us-tg583", "us", "第58.3任務群(リーヴス)", "sea-saipan", [
        ("enterprise", "us-cv-yorktown", "空母"), ("lexington", "us-cv-essex", "空母"), ("san-jacinto", "us-cvl-independence", "空母"), ("princeton", "us-cvl-independence", "空母"),
        ("indianapolis", "us-ca-portland", "護衛"), ("dd1", DD_US, "護衛"), ("dd2", DD_US, "護衛"), ("dd3", DD_US, "護衛"),
    ], air=essex("enterprise") + essex("lexington") + cvl("san-jacinto") + cvl("princeton"), training="veteran"),
    fleet("us-tg584", "us", "第58.4任務群(ハリル)", "sea-saipan", [
        ("essex", "us-cv-essex", "空母"), ("langley", "us-cvl-independence", "空母"), ("cowpens", "us-cvl-independence", "空母"),
        ("san-juan", "us-cl-atlanta", "護衛"), ("dd1", DD_US, "護衛"), ("dd2", DD_US, "護衛"),
    ], air=essex("essex") + cvl("langley") + cvl("cowpens"), training="veteran"),
    fleet("us-tg587", "us", "第58.7任務群(リーの戦艦の戦列)", "sea-saipan", [
        ("washington", "us-bb-north-carolina", "戦艦"), ("north-carolina", "us-bb-north-carolina", "戦艦"), ("iowa", "us-bb-iowa", "戦艦"), ("new-jersey", "us-bb-iowa", "戦艦"),
        ("south-dakota", "us-bb-south-dakota", "戦艦"), ("alabama", "us-bb-south-dakota", "戦艦"), ("indiana", "us-bb-south-dakota", "戦艦"),
        ("wichita", "us-ca-new-orleans", "巡洋艦"), ("minneapolis", "us-ca-new-orleans", "巡洋艦"),
        ("dd1", DD_US, "駆逐艦"), ("dd2", DD_US, "駆逐艦"), ("dd3", DD_US, "駆逐艦"), ("dd4", DD_US, "駆逐艦"),
    ], training="veteran"),
    # 上陸の火力支援(旧式戦艦)と護衛空母(第52任務部隊の一部)。{TOD}:顔ぶれ(旧式戦艦7・護衛空母7〜11とされる。ここでは数を抑えた)
    fleet("us-tg52", "us", "火力支援群(旧式戦艦)", "sea-east", [
        ("tennessee", "us-bb-tennessee", "戦艦"), ("california", "us-bb-tennessee", "戦艦"), ("colorado", "us-bb-colorado", "戦艦"), ("maryland", "us-bb-colorado", "戦艦"),
        ("pennsylvania", "us-bb-pennsylvania", "戦艦"), ("new-mexico", "us-bb-new-mexico", "戦艦"),
        ("dd1", DD_US, "駆逐艦"), ("dd2", DD_US, "駆逐艦"), ("dd3", DD_US, "駆逐艦"),
    ], training="regular"),
    fleet("us-cve", "us", "護衛空母群", "sea-east", [
        ("cve1", "us-cve-casablanca", "護衛空母"), ("cve2", "us-cve-casablanca", "護衛空母"), ("cve3", "us-cve-casablanca", "護衛空母"), ("cve4", "us-cve-casablanca", "護衛空母"),
        ("dd1", DD_US, "護衛"), ("dd2", DD_US, "護衛"),
    ], air=cve("cve1") + cve("cve2") + cve("cve3") + cve("cve4"), training="regular"),
    # ===== 日本の艦隊(第一機動艦隊 小沢)=====
    # 6月13日にタウィタウィを出てギマラスで給油し、19日にマリアナの西で米の空母を攻めた(アウトレンジ戦法)。艦載機は約430〜450機とされる。
    # 搭乗員の多くは訓練が足りなかった(艦載機の隊は未熟)。艦の顔ぶれは一般に知られた戦闘序列({TOD}:駆逐艦は数を抑えた)
    # 甲部隊:第1航空戦隊(大鳳・翔鶴・瑞鶴)と第5戦隊(妙高・羽黒)・矢矧
    fleet("jp-force-a", "jp", "甲部隊(第1航空戦隊・小沢)", "sea-philippine-w", [
        ("taiho", "jp-cv-taiho", "第1航空戦隊"), ("shokaku", "jp-cv-shokaku", "第1航空戦隊"), ("zuikaku", "jp-cv-shokaku", "第1航空戦隊"),
        ("myoko", "jp-ca-myoko", "第5戦隊"), ("haguro", "jp-ca-myoko", "第5戦隊"), ("yahagi", "jp-cl-agano", "第10戦隊"),
        ("dd1", DD_JP, "第10戦隊"), ("dd2", DD_JP, "第10戦隊"), ("dd3", DD_JP, "第10戦隊"),
    ], air=jp_cv("taiho") + jp_cv("shokaku") + jp_cv("zuikaku") + [("scout", "pa44-jp-scout", "taiho")], training="regular", air_training="green"),
    # 乙部隊:第2航空戦隊(隼鷹・飛鷹・龍鳳)と長門・最上。龍鳳は瑞鳳型で代える({TOD})
    fleet("jp-force-b", "jp", "乙部隊(第2航空戦隊・城島)", "sea-philippine-w", [
        ("junyo", "jp-cv-junyo", "第2航空戦隊"), ("hiyo", "jp-cv-junyo", "第2航空戦隊"), ("ryuho", "jp-cvl-zuiho", "第2航空戦隊"),
        ("nagato", "jp-bb-nagato", "護衛"), ("mogami", "jp-ca-mogami-1944", "護衛"),
        ("dd1", DD_JP, "護衛"), ("dd2", DD_JP, "護衛"), ("dd3", DD_JP, "護衛"),
    ], air=jp_cv("junyo", attack=0) + jp_cv("hiyo", attack=0) + jp_cv("ryuho", fighters=12, bombers=0), training="regular", air_training="green"),
    # 前衛:第3航空戦隊(千歳・千代田・瑞鳳)と第2艦隊(栗田。大和・武蔵・金剛・榛名と重巡8)
    fleet("jp-van", "jp", "前衛(第3航空戦隊・第2艦隊 栗田)", "sea-philippine-w", [
        ("chitose", "jp-cvl-chitose", "第3航空戦隊"), ("chiyoda", "jp-cvl-chitose", "第3航空戦隊"), ("zuiho", "jp-cvl-zuiho", "第3航空戦隊"),
        ("yamato", "jp-bb-yamato", "第1戦隊"), ("musashi", "jp-bb-yamato", "第1戦隊"), ("kongo", "jp-bb-kongo", "第3戦隊"), ("haruna", "jp-bb-kongo", "第3戦隊"),
        ("atago", "jp-ca-takao", "第4戦隊"), ("takao", "jp-ca-takao", "第4戦隊"), ("maya", "jp-ca-chokai", "第4戦隊"), ("chokai", "jp-ca-chokai", "第4戦隊"),
        ("kumano", "jp-ca-myoko", "第7戦隊"), ("suzuya", "jp-ca-myoko", "第7戦隊"), ("tone", "jp-ca-tone", "第7戦隊"), ("chikuma", "jp-ca-tone", "第7戦隊"),
        ("noshiro", "jp-cl-agano", "第2水雷戦隊"), ("dd1", DD_JP, "第2水雷戦隊"), ("dd2", DD_JP, "第2水雷戦隊"), ("dd3", DD_JP, "第2水雷戦隊"),
    ], air=jp_cv("chitose", fighters=12, bombers=0) + jp_cv("chiyoda", fighters=12, bombers=0) + jp_cv("zuiho", fighters=12, bombers=0), training="veteran", air_training="green"),
]

# 航空隊(編隊1つ=12機)。根拠は docs/research/a-go-1944.md「航空隊」(数はすべて TODO(要裏取り))
#  - 日本の基地航空部隊(第1航空艦隊 角田):マリアナ・カロリン・硫黄島に、書類の上では千数百機とされるが、6月11日からの米の空襲で多くを地上で失った
#  - 米の陸の航空隊:アスリート飛行場(イスリー飛行場)を取った後、6月22日から第318戦闘群の P-47(ここでは P-38 の戦闘機隊で代える)
AIR_WINGS = [
    L([("id", "jp-1af-guam"), ("side", "jp"), ("name", "第1航空艦隊(グアム・ロタ)"), ("base", "guam-west"), ("rangeKm", 900), ("fighters", 3), ("strike", 3),
       ("navalToes", L([("fighter", "pa44-a6m5-12"), ("strike", "pa44-d4y-12")]))]),
    L([("id", "jp-1af-tinian"), ("side", "jp"), ("name", "第1航空艦隊(テニアン。陸攻)"), ("base", "tinian"), ("rangeKm", 1300), ("fighters", 1), ("strike", 3),
       ("navalToes", L([("fighter", "pa44-a6m5-12"), ("strike", "lb-g4m-torp-12"), ("scout", "lb-g3m-scout-3")]))]),
    L([("id", "jp-yap"), ("side", "jp"), ("name", "第1航空艦隊(ヤップ・パラオ)"), ("base", "yap-palau"), ("rangeKm", 1100), ("fighters", 2), ("strike", 2),
       ("navalToes", L([("fighter", "pa44-a6m5-12"), ("strike", "pa44-d4y-12")]))]),
    L([("id", "jp-iwo"), ("side", "jp"), ("name", "八幡空襲部隊(硫黄島。横須賀からの増援)"), ("base", "iwojima"), ("rangeKm", 1300), ("fighters", 2), ("strike", 1), ("arriveStage", stage_of(date(1944, 6, 20))),
       ("navalToes", L([("fighter", "pa44-a6m5-12"), ("strike", "lb-g4m-torp-12")]))]),
    L([("id", "us-318fg"), ("side", "us"), ("name", "第318戦闘群(P-47。アスリート飛行場)"), ("base", "saipan-beach"), ("rangeKm", 500), ("fighters", 2), ("strike", 0), ("arriveStage", stage_of(date(1944, 6, 22))),
       ("navalToes", L([("fighter", "pa44-p38-12")]))]),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


# 勝利の条件(ゲームの決め方)。米:サイパン・テニアン・グアムを取れば決定的(史実)、サイパンの飛行場を取れば限定的。
# 日本:サイパンの飛行場を保ち、米の艦隊をサイパン沖から追えば決定的、サイパンかグアムの飛行場を保てば限定的
VICTORY = L([
    ("us", L([
        ("conditions", [cond("saipan-beach", "saipan-beach", 5), cond("saipan-tapochau", "saipan-tapochau", 2), cond("saipan-north", "saipan-north", 1),
                        cond("tinian", "tinian", 3), cond("guam-west", "guam-west", 4), cond("guam-north", "guam-north", 1),
                        L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
        ("decisive", L([("minPoints", 15), ("requires", ["saipan-beach", "tinian", "guam-west"])])),
        ("limited", L([("minPoints", 6), ("requires", ["saipan-beach"])])),
    ])),
    ("jp", L([
        ("conditions", [cond("saipan-beach", "saipan-beach", 5), cond("sea-saipan", "sea-saipan", 3), cond("guam-west", "guam-west", 3), cond("tinian", "tinian", 2),
                        L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
        ("decisive", L([("minPoints", 10), ("requires", ["saipan-beach", "sea-saipan"])])),
        ("limited", L([("minPoints", 4), ("requires", [])])),
    ])),
])

# 作戦地図に描く位置(表示だけ。レイテと同じ作り)。マリアナの島々は数十 km の内に集まり、ギマラスからエニウェトクまでの 4000km の地図では重なるので、
# 島の地域は模式の配置、島の外は島の真ん中から放射状に距離を対数で縮めて描く(x・y は航空隊の行動半径の距離に使うので変えない)
MAP_UNIT = 25.0
ISLAND_LAYOUT = {
    "saipan-north": (1.6, 3.4), "saipan-tapochau": (1.0, 2.4), "saipan-beach": (0.3, 1.5), "tinian": (-0.6, 0.4),
    "rota": (-1.2, -1.0), "guam-north": (-1.6, -2.4), "guam-west": (-2.6, -3.0),
}
MAP_ISLAND_KM = 150.0
MAP_ISLAND_R = 110.0
MAP_A = 40.0
MAP_B = 150.0
MAP_NUDGE = {"sea-saipan": (70.0, 50.0), "sea-guam": (-110.0, -60.0), "sea-marianas-w": (-140.0, 20.0)}


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase, port in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if rid in SUPPLY_VIA:
            r["supplyVia"] = SUPPLY_VIA[rid]
        if airbase:
            r["airbase"] = True
        if port:
            r["port"] = True
        regions[rid] = r
        control[rid] = owner
    for rid, name, lat, lon, owner in SEAS:
        x, y = km(lat, lon)
        regions[rid] = L([("name", name), ("x", x), ("y", y), ("biome", "jungle"), ("sea", True)])
        control[rid] = owner
    # 島の真ん中(サイパンとグアムの間)
    cx, cy = km(14.3, 145.2)
    for rid, r in regions.items():
        if rid in ISLAND_LAYOUT:
            gx, gy = ISLAND_LAYOUT[rid]
            r["mapX"], r["mapY"] = round(gx * MAP_UNIT, 1), round(gy * MAP_UNIT, 1)
            continue
        if rid in MAP_NUDGE:
            r["mapX"], r["mapY"] = MAP_NUDGE[rid]
            continue
        dx, dy = r["x"] - cx, r["y"] - cy
        d = math.hypot(dx, dy)
        rr = MAP_ISLAND_R + MAP_A * math.log(1 + max(0.0, d - MAP_ISLAND_KM) / MAP_B)
        r["mapX"], r["mapY"] = round(dx / d * rr, 1), round(dy / d * rr, 1)
    return L([
        ("id", "a-go-1944"),
        ("name", "あ号作戦とマリアナ諸島の戦い(1944年6月〜8月)"),
        ("description",
         "第58任務部隊がマリアナの飛行場を叩き、海兵隊がサイパンに上がる。日本は第一機動艦隊を出して、空母9隻の艦載機でアウトレンジから米の空母を叩こうとする。"
         "マリアナ沖で空母の決戦に勝てるか、島の守備隊はどこまで持ちこたえるか。1段階は4日、16段階。v0・概略図"),
        ("notes",
         "根拠は docs/research/a-go-1944.md。作り直しは tools/campaigns/build_a_go_1944.py。潜水艦(大鳳・翔鶴を沈めた)、大鳳の揮発油の気化の爆発、"
         "6月20日の米の薄暮の攻撃の帰り道の夜の着艦、サイパンの民間人の犠牲は表していない。艦隊と航空隊の顔ぶれの多くは仮置き"),
        ("era", "1944-marianas"),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "jp"), ("name", "日本軍")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stage_of(END))])),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS] + [L([("a", a), ("b", b), ("kind", "sea")]) for a, b in SEA_LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("naval", L([
            ("weapons", ["naval-generic", "pacific-ships-1942", "pacific-ships-1944", "pacific-landair-1941", "midway-1942", "pacific-air-1944"]),
            ("toe", ["naval-generic", "pacific-ships-1942", "pacific-ships-1944", "pacific-landair-1941", "midway-1942", "pacific-air-1944"]),
        ])),
        ("rules", L([
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "us"),
            ("level", "decisive"),
            ("summary", "6月19〜20日のマリアナ沖海戦で、日本は大鳳・翔鶴(潜水艦)と飛鷹を失い、艦載機の大半(約400機)を失った(「マリアナの七面鳥撃ち」)。"
                        "サイパンは7月9日、テニアンは8月1日、グアムは8月10日に落ち、7月18日に東條内閣が倒れた"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
