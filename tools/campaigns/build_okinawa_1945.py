#!/usr/bin/env python3
"""
沖縄戦(アイスバーグ作戦。1945年4月1日〜6月22日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_okinawa_1945.py

出力: data/campaigns/okinawa-1945.json

4月1日、米第10軍(バックナー)の第3水陸両用軍団(第1・第6海兵師団)と第24軍団(第7・第96歩兵師団)が嘉手納・読谷の海岸(渡具知)に上がった。
第32軍(牛島)は海岸で戦わず、首里の周りの洞窟陣地(嘉数・前田・シュガーローフ)で待った。海兵は北部と本部半島(八重岳)を4月中に取り、
4月16日に第77歩兵師団が伊江島に上がった。4月6〜7日に大和の水上特攻(天一号作戦)は九州の南で第58任務部隊の艦載機に沈められ、
菊水作戦の特攻で米の艦艇が多く沈み傷ついた。5月4〜5日の第32軍の反攻は失敗し、5月末に首里を捨てて南へ退き、6月22日ごろ摩文仁で組織的な戦いが終わった。
根拠と残りの裏取りは docs/research/okinawa-1945.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:1個の部隊をおおよそ1個連隊(島が小さく、師団の数が少ないため)。米は1944年の歩兵連隊・1945年の戦車大隊・155mm 砲兵大隊、
日本は1944年の歩兵連隊(独立混成旅団・海軍の陸戦隊も)・1944年の戦車連隊・汎用の砲兵大隊。兵力・位置の多くは TODO(要裏取り)
(出典候補:Appleman ほか『Okinawa: The Last Battle』(米陸軍公刊戦史)、Nichols & Shaw『Okinawa: Victory in the Pacific』(海兵隊公刊戦史)、
戦史叢書『沖縄方面陸軍作戦』『沖縄方面海軍作戦』、八原博通『沖縄決戦』、Morison『Victory in the Pacific』)。
1段階は6日(4月1日を1日目として14段階で6月23日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/okinawa-1945.json"

START = date(1945, 4, 1)
DAYS_PER_STAGE = 6
STAGES = 14


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯26.5度で約100km、緯度1度は約111km)"""
    return round((lon - 127.0) * 100, 1), round((lat - 26.0) * 111, 1)


F, M, J = "western-farmland", "mountains", "jungle"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地、港
REGIONS = [
    # 沖縄本島の南部(第32軍の主陣地)
    ("hagushi", "嘉手納・読谷(渡具知の海岸と飛行場)", 26.37, 127.74, F, "us", "jp", True, True),
    ("ishikawa", "石川地峡", 26.43, 127.83, F, None, "jp", False, False),
    ("kakazu", "嘉数・西原(第1防衛線)", 26.27, 127.75, M, None, "jp", False, False),
    ("shuri", "首里(第32軍の司令部・前田高地・シュガーローフ)", 26.22, 127.72, M, "jp", "jp", False, False),
    ("naha", "那覇", 26.21, 127.68, F, None, "jp", False, True),
    ("yonabaru", "与那原・運玉森", 26.20, 127.76, M, None, "jp", False, False),
    ("oroku", "小禄半島(海軍の陣地・那覇飛行場)", 26.19, 127.66, M, None, "jp", False, False),
    ("chinen", "知念半島", 26.17, 127.82, M, None, "jp", False, False),
    ("kiyan", "喜屋武・摩文仁(南端)", 26.09, 127.70, M, None, "jp", False, False),
    # 北部
    ("nago", "名護", 26.59, 127.98, J, None, "jp", False, False),
    ("motobu", "本部半島(八重岳)", 26.66, 127.90, M, None, "jp", False, False),
    ("kunigami", "国頭(北部の山地)", 26.75, 128.18, J, None, "jp", False, False),
    ("iejima", "伊江島(飛行場)", 26.71, 127.79, F, None, "jp", True, False),
    # 九州(特攻の基地。島とは海だけでつながる)
    ("kyushu", "九州南部(鹿屋・知覧の特攻基地)", 31.40, 130.85, F, "jp", "jp", True, True),
    # 米の泊地(ウルシー・慶良間。艦隊の修理と補給)
    ("kerama", "慶良間列島(米の泊地。3月下旬に取った)", 26.20, 127.30, F, "us", "us", False, True),
]
LINKS = [
    ("hagushi", "ishikawa", "road"), ("hagushi", "kakazu", "road"), ("ishikawa", "nago", "road"), ("ishikawa", "kakazu", "track"),
    ("kakazu", "shuri", "road"), ("kakazu", "yonabaru", "track"), ("shuri", "naha", "road"), ("shuri", "yonabaru", "road"),
    ("shuri", "kiyan", "road"), ("naha", "oroku", "road"), ("naha", "kiyan", "road"), ("yonabaru", "chinen", "road"),
    ("yonabaru", "kiyan", "track"), ("chinen", "kiyan", "track"), ("oroku", "kiyan", "track"),
    ("nago", "motobu", "road"), ("nago", "kunigami", "road"), ("motobu", "kunigami", "track"),
]
SEAS = [
    ("sea-west", "沖縄の西の海(上陸の泊地・レーダーピケット)", 26.35, 127.45, "us"),
    ("sea-east", "沖縄の東の海(第58任務部隊)", 26.40, 128.60, "us"),
    ("sea-north", "沖縄の北の海(大和の進路)", 28.50, 128.30, None),
    ("sea-kyushu", "九州の南の海(坊ノ岬沖)", 30.60, 129.80, "jp"),
]
SEA_LINKS = [
    ("hagushi", "sea-west"), ("naha", "sea-west"), ("oroku", "sea-west"), ("motobu", "sea-west"), ("iejima", "sea-west"), ("kerama", "sea-west"),
    ("chinen", "sea-east"), ("nago", "sea-east"), ("kunigami", "sea-east"), ("kyushu", "sea-kyushu"),
    ("sea-west", "sea-east"), ("sea-west", "sea-north"), ("sea-east", "sea-north"), ("sea-north", "sea-kyushu"),
]
# 港の補給の源は、面した海域を押さえている間だけ(渡具知の海岸の揚陸)
SUPPLY_VIA = {"hagushi": "sea-west"}
# 第32軍の洞窟陣地(日本が守るときの坑道陣地)と陣地(塹壕線)。TODO(要裏取り):陣地の広がり
# (初めは嘉数も坑道陣地にしたが、AI 同士で3戦とも最後まで落ちず引き分けだった。史実の第1防衛線は約2週間で破られたので塹壕線に)
FORTIFIED = {"kakazu": "trench", "shuri": "cave", "oroku": "cave", "kiyan": "cave", "yonabaru": "trench", "naha": "trench", "motobu": "trench", "iejima": "trench"}

US_INF = "us-ir-1944"
US_TK = "us-tank-bn-1945"
US_ART = "us-fa-bn-155"
JP_INF = "jp-inf-regt-1944"
JP_TK = "jp-tank-regt-1944"
JP_ART = "artillery_battalion"
DD_US = "us-dd-fletcher-1944"
DD_JP = "jp-dd-kagero"


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


def division(fid, name, region, regiments, training, arrive=None, tanks=1, art=2, **extra):
    us = [unit(f"{fid}-{r}", US_INF, training) for r in regiments]
    us += [unit(f"{fid}-tk{i + 1}", US_TK, training) for i in range(tanks)]
    us += [unit(f"{fid}-art{i + 1}", US_ART, training) for i in range(art)]
    return formation(fid, "us", name, region, us, arrive, **extra)


def jp(fid, name, region, n, training="regular", strength=None, extra=()):
    us = [unit(f"{fid}-{i + 1}", JP_INF, training, strength) for i in range(n)] + [unit(f"{fid}-{k}", t, training, s) for k, t, s in extra]
    return formation(fid, "jp", name, region, us)


def fleet(fid, side, name, region, ships, air=None, arrive=None, training=None):
    us = [unit(f"{fid}-{sid}", toe, training, squadron=sq) for sid, toe, sq in ships]
    us += [unit(f"{fid}-{sid}", toe, training, base=f"{fid}-{cv}") for sid, toe, cv in (air or [])]
    return formation(fid, side, name, region, us, arrive)


def essex(cv):
    return [(f"{cv}-vf", "pa44-f6f-36", cv), (f"{cv}-vb", "pa44-sb2c-24", cv), (f"{cv}-vt", "pa44-tbm-18", cv)]


def cvl(cv):
    return [(f"{cv}-vf", "pa44-f6f-24", cv), (f"{cv}-vt", "pa44-tbm-9", cv)]


D1 = date(1945, 4, 1)
FORMATIONS = [
    # ===== 米第10軍(バックナー)=====
    # 第3水陸両用軍団(ガイガー):第6海兵師団(北)・第1海兵師団、第24軍団(ホッジ):第7歩兵師団・第96歩兵師団(南)。どれも4月1日に渡具知の海岸へ
    division("us-6mar", "第6海兵師団", "hagushi", ["4mar", "22mar", "29mar"], "regular", D1, landing=True),
    division("us-1mar", "第1海兵師団", "hagushi", ["1mar", "5mar", "7mar"], "veteran", D1, landing=True),
    division("us-7id", "第7歩兵師団", "hagushi", ["17", "32", "184"], "veteran", D1, landing=True),
    division("us-96id", "第96歩兵師団", "hagushi", ["381", "382", "383"], "regular", D1, landing=True),
    # 後から:第27歩兵師団(4月9日)、第77歩兵師団(伊江島に4月16日。その後首里の正面へ)
    division("us-27id", "第27歩兵師団", "hagushi", ["105", "106", "165"], "regular", date(1945, 4, 9), art=0),
    division("us-77id", "第77歩兵師団(伊江島)", "iejima", ["305", "306", "307"], "veteran", date(1945, 4, 16), tanks=0, art=0, landing=True),
    # ===== 第32軍(牛島。八原が作戦)=====
    # 第62師団(首里の北の第1防衛線)、第24師団(南部)、独立混成第44旅団、海軍の沖縄方面根拠地隊(大田。小禄)、第5砲兵司令部、戦車第27連隊、
    # 国頭支隊(宇土。本部半島)。防衛隊・学徒は入れていない(TODO)
    # (戦力は初め8〜9割にしたが、AI 同士で3戦とも首里の手前で止まって引き分けだった。米の艦砲・航空の援護を入れていない分と、
    #  兵の数の差(米の第10軍の戦闘の兵は第32軍の2倍を超えたとされる)を合わせるため、第32軍の主力を7割に。米の師団の砲兵を2個大隊に)
    jp("jp-62d", "第62師団(嘉数・西原の第1防衛線)", "kakazu", 4, "veteran", 0.7),
    jp("jp-32a-hq", "第32軍の司令部と砲兵(首里)", "shuri", 1, "regular", 0.8, [("art1", JP_ART, None), ("art2", JP_ART, None), ("art3", JP_ART, None)]),
    jp("jp-24d", "第24師団", "kiyan", 3, "regular", 0.7),
    jp("jp-44imb", "独立混成第44旅団", "chinen", 2, "regular", 0.7, [("tk", JP_TK, 0.6)]),
    jp("jp-naval", "海軍の沖縄方面根拠地隊(大田)", "oroku", 2, "green", 0.6),
    jp("jp-naha", "那覇の守備(船舶工兵・特設の部隊)", "naha", 1, "green", 0.5),
    jp("jp-yonabaru", "与那原の守備", "yonabaru", 1, "regular", 0.6),
    jp("jp-udo", "国頭支隊(宇土。本部半島・八重岳)", "motobu", 1, "regular", 0.8),
    jp("jp-ie", "伊江島の守備", "iejima", 1, "regular", 0.6),
    jp("jp-coast", "海岸の守備(特設の部隊)", "hagushi", 1, "green", 0.3),
    # ===== 艦隊 =====
    # 第58任務部隊(ミッチャー)の任務群2つ(4つのうち2つに縮めた。TODO(要裏取り):4月の各任務群の顔ぶれと機数)
    fleet("us-tf58-1", "us", "第58任務部隊の第58.1・第58.3任務群", "sea-east", [
        ("hornet", "us-cv-essex", "空母"), ("bennington", "us-cv-essex", "空母"), ("essex", "us-cv-essex", "空母"), ("bunker-hill", "us-cv-essex", "空母"),
        ("belleau-wood", "us-cvl-independence", "空母"), ("cabot", "us-cvl-independence", "空母"),
        ("new-jersey", "us-bb-iowa", "戦艦"), ("missouri", "us-bb-iowa", "戦艦"), ("baltimore", "us-ca-baltimore", "巡洋艦"), ("pasadena", "us-cl-cleveland", "巡洋艦"),
    ] + [(f"dd{i}", DD_US, "駆逐隊") for i in range(1, 9)],
        air=essex("hornet") + essex("bennington") + essex("essex") + essex("bunker-hill") + cvl("belleau-wood") + cvl("cabot"), training="veteran"),
    # 第54任務部隊(デヨ):旧式戦艦の艦砲射撃と援護。レーダーピケットの駆逐艦
    fleet("us-tf54", "us", "第54任務部隊(旧式戦艦の艦砲射撃)とレーダーピケット", "sea-west", [
        ("tennessee", "us-bb-tennessee", "戦艦"), ("colorado", "us-bb-colorado", "戦艦"), ("new-mexico", "us-bb-new-mexico", "戦艦"),
        ("pensacola", "us-ca-baltimore", "巡洋艦"),
    ] + [(f"dd{i}", DD_US, "ピケット") for i in range(1, 9)], training="veteran"),
    # 第二艦隊(伊藤)の水上特攻(天一号作戦):大和・矢矧・駆逐艦8。4月6日に徳山を出た
    fleet("jp-yamato", "jp", "第二艦隊(大和の水上特攻)", "sea-kyushu", [
        ("yamato", "jp-bb-yamato", "第1戦隊"), ("yahagi", "jp-cl-agano", "第2水雷戦隊"),
    ] + [(f"dd{i}", DD_JP, "第2水雷戦隊") for i in range(1, 9)], arrive=date(1945, 4, 6), training="veteran"),
]

# 航空隊(編隊1つ=12機)。数はすべて TODO(要裏取り)。
#  - 日本:菊水作戦の特攻(第5航空艦隊・第6航空軍。4月6日〜6月22日に10回、約1,500機の特攻とされる)と、援護の戦闘機
#  - 米:第2海兵航空団(戦術航空軍。4月7日から読谷・嘉手納の飛行場)。空母の艦載機は艦隊の航空隊
AIR_WINGS = [
    L([("id", "jp-kikusui"), ("side", "jp"), ("name", "菊水作戦の特攻(第5航空艦隊・第6航空軍)"), ("base", "kyushu"), ("rangeKm", 800), ("fighters", 0), ("strike", 6), ("kamikaze", True),
       ("navalToes", L([("strike", "pa44-a6m5-12")]))]),
    L([("id", "jp-5af"), ("side", "jp"), ("name", "第5航空艦隊の戦闘機・攻撃機"), ("base", "kyushu"), ("rangeKm", 800), ("fighters", 3), ("strike", 2),
       ("navalToes", L([("fighter", "pa44-ki84-12"), ("strike", "pa44-b6n-12"), ("scout", "pa44-jp-scout")]))]),
    L([("id", "us-taf"), ("side", "us"), ("name", "第2海兵航空団(戦術航空軍。読谷・嘉手納)"), ("base", "hagushi"), ("rangeKm", 400), ("fighters", 4), ("strike", 2), ("arriveStage", stage_of(date(1945, 4, 13))),
       ("navalToes", L([("fighter", "pa44-f6f-12"), ("strike", "pa44-sb2c-12")]))]),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。米:首里と南端を取れば決定的(史実)、飛行場と首里の手前までなら限定的。
# 日本:首里と嘉数を最後まで保てば決定的(持久)、首里を保てば限定的
VICTORY = L([
    ("us", L([
        ("conditions", [cond("hagushi", "hagushi", 3), cond("kakazu", "kakazu", 2), cond("shuri", "shuri", 5), cond("naha", "naha", 2), cond("kiyan", "kiyan", 3),
                        cond("motobu", "motobu", 1), cond("iejima", "iejima", 1), loss("loss", 1.5, 2)]),
        ("decisive", L([("minPoints", 15), ("requires", ["shuri", "kiyan"])])),
        ("limited", L([("minPoints", 6), ("requires", ["hagushi"])])),
    ])),
    ("jp", L([
        ("conditions", [cond("shuri", "shuri", 5), cond("kakazu", "kakazu", 2), cond("kiyan", "kiyan", 2), cond("hagushi", "hagushi", 2), cond("sea", "sea-west", 2), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 10), ("requires", ["shuri", "kakazu"])])),
        ("limited", L([("minPoints", 5), ("requires", ["shuri"])])),
    ])),
])


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
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "jp")])
        regions[rid] = r
        control[rid] = owner
    for rid, name, lat, lon, owner in SEAS:
        x, y = km(lat, lon)
        regions[rid] = L([("name", name), ("x", x), ("y", y), ("biome", F), ("sea", True)])
        control[rid] = owner
    # 作戦地図に描く位置:九州は 550km 北にあり、そのままでは島が点に縮むので、北の海の上に寄せて描く(x・y は航空隊の距離に使うので変えない)
    regions["kyushu"]["mapX"], regions["kyushu"]["mapY"] = 130.0, 175.0
    regions["sea-kyushu"]["mapX"], regions["sea-kyushu"]["mapY"] = 115.0, 145.0
    regions["sea-north"]["mapX"], regions["sea-north"]["mapY"] = 100.0, 112.0
    return L([
        ("id", "okinawa-1945"),
        ("name", "沖縄戦(1945年4〜6月)"),
        ("description",
         "アイスバーグ作戦。米第10軍が嘉手納・読谷の海岸に上がり、第32軍は首里の周りの洞窟陣地で持久する。九州からは菊水作戦の特攻が泊地の艦隊を襲い、"
         "大和の水上特攻が沖縄へ向かう。米は首里の線を破れるか、日本はどれだけ持ちこたえて艦隊を削れるか。1段階は6日、14段階。v0・概略図(兵力・位置の多くは要裏取り)"),
        ("notes", "根拠は docs/research/okinawa-1945.md。作り直しは tools/campaigns/build_okinawa_1945.py。部隊1つ≒1個連隊。首里の線は坑道陣地。"
                  "九州は描く位置だけ島の北に寄せた。防衛隊・学徒・住民の犠牲は表していない"),
        ("era", "1945-kyushu"),
        ("sides", [L([("id", "us"), ("name", "米軍(第10軍・第5艦隊)")]), L([("id", "jp"), ("name", "日本軍(第32軍・第5航空艦隊)")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        # 5月下旬からの梅雨(首里の撤退は豪雨の中だった)
        ("weather", [L([("stage", 1), ("weather", "clear")]), L([("stage", 5), ("weather", "overcast")]), L([("stage", 9), ("weather", "rain")]), L([("stage", 12), ("weather", "overcast")])]),
        ("seasons", [L([("stage", 1), ("name", "春")]), L([("stage", 9), ("name", "梅雨"), ("ground", L([("mud", 0.7)]))]), L([("stage", 13), ("name", "初夏")])]),
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
            # 補充:第32軍は島に閉じ込められ、補充はほとんどない(防衛隊を少し)。米は補充の兵を送った(仮置き)
            ("replacementBySide", L([("us", 0.03), ("jp", 0.01)])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_fighter_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "us"),
            ("level", "decisive"),
            ("summary", "米は4月中に北部と伊江島を取ったが、首里の線で約50日止められた。5月末に第32軍は首里を捨てて南へ退き、6月22日ごろ摩文仁で組織的な戦いが終わった。"
                        "大和は4月7日に坊ノ岬沖で沈んだ。特攻で米の艦艇約30隻が沈み、約370隻が傷ついたとされる(数は出典で差がある)"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
