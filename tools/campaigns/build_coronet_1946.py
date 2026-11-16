#!/usr/bin/env python3
"""
コロネット作戦(1946年3月の関東平野への上陸。ダウンフォール作戦の第2段。計画だけで実行されなかった架空の戦い)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_coronet_1946.py

出力: data/campaigns/coronet-1946.json

オリンピック作戦(build_olympic_1945.py)の後、米第1軍が九十九里浜に、第8軍が相模湾に上がり、東京を東西から挟もうとする計画。
後から第13軍団(第13・第20機甲師団)が相模湾から関東平野へ出る。日本の第12方面軍は、九十九里と相模湾の海岸に兵力を置き、
機動の第36軍を関東平野の奥に控えて決戦に出す(決号作戦)。
根拠と残りの裏取りは docs/research/coronet-1946.md。この環境では資料を確かめられず、計画の概略の一般に知られたところから組み立てた。
師団の割り振り・上陸の日・日本の陣地の多くは TODO(要裏取り)(出典候補:Skates『The Invasion of Japan: Alternative to the Bomb』、
『戦史叢書 本土決戦準備〈1〉関東の防衛』、Giangreco『Hell to Pay』、米太平洋陸軍の作戦計画「Coronet」)。

部隊の単位:オリンピック作戦と同じく、1個の部隊をおおよそ1個師団(連隊の編成表で代える)。上陸はキャンペーンの上陸の増援(landing)で表す。
1段階は3日(1946年2月26日を1日目として14段階で4月6日まで)。上陸の日(Y 日)は3月1日=2段階目。
米の航空は九州の極東空軍と空母の航空隊を九州の飛行場に置いて表す。特攻は表していない(TODO)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/coronet-1946.json"

START = date(1946, 2, 26)
DAYS_PER_STAGE = 3
STAGES = 14
Y_DAY = date(1946, 3, 1)


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯35.7度で約90km、緯度1度は約111km)"""
    return round((lon - 139.0) * 90, 1), round((lat - 35.0) * 111, 1)


F, M = "western-farmland", "ardennes-winter"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主。上陸の2地点は米の補給の源(上がって押さえると、そこから補給が届く)
REGIONS = [
    ("kujukuri", "九十九里浜(東の上陸)", 35.55, 140.45, F, "us", "jp"),
    ("sagami", "相模湾(平塚・茅ヶ崎。西の上陸)", 35.33, 139.35, F, "us", "jp"),
    ("choshi", "銚子・鹿島灘", 35.73, 140.83, F, None, "jp"),
    ("narita", "成田・佐倉", 35.77, 140.32, F, None, "jp"),
    ("chiba", "千葉", 35.61, 140.12, F, None, "jp"),
    ("boso", "房総半島の南(木更津・館山)", 35.20, 139.95, M, None, "jp"),
    ("kasumigaura", "土浦・霞ヶ浦", 36.08, 140.20, F, None, "jp"),
    ("atsugi", "厚木(飛行場)", 35.45, 139.45, F, None, "jp"),
    ("odawara", "小田原(箱根の入口)", 35.26, 139.15, M, None, "jp"),
    ("yokosuka", "横須賀・三浦半島", 35.28, 139.67, M, None, "jp"),
    ("yokohama", "横浜・川崎", 35.45, 139.64, F, None, "jp"),
    ("hachioji", "八王子・相模原", 35.66, 139.32, M, None, "jp"),
    ("tokyo", "東京", 35.68, 139.76, F, None, "jp"),
    ("omiya", "大宮・浦和", 35.90, 139.63, F, None, "jp"),
    ("koga", "古河・小山(利根川の北)", 36.20, 139.80, F, None, "jp"),
    # 日本の補給の源(北と西)
    ("kumagaya", "熊谷・高崎(北西の補給)", 36.15, 139.39, F, "jp", "jp"),
    ("utsunomiya", "宇都宮・水戸(北の補給)", 36.56, 139.88, F, "jp", "jp"),
    ("kofu", "甲府(西の山の補給)", 35.66, 138.57, M, "jp", "jp"),
    # 米の航空基地(オリンピック作戦で取った南九州の飛行場)。陸の結びはなく、航空隊だけを置く
    ("kyushu", "南九州の飛行場(米の航空基地)", 31.70, 130.90, F, "us", "us"),
]

LINKS = [
    ("kujukuri", "chiba", "road"),
    ("kujukuri", "narita", "road"),
    ("kujukuri", "choshi", "road"),
    ("kujukuri", "boso", "track"),
    ("choshi", "narita", "rail"),
    ("choshi", "kasumigaura", "road"),
    ("narita", "chiba", "rail"),
    ("narita", "kasumigaura", "road"),
    ("chiba", "tokyo", "rail"),
    ("chiba", "boso", "rail"),
    ("kasumigaura", "tokyo", "rail"),
    ("kasumigaura", "utsunomiya", "rail"),
    ("kasumigaura", "koga", "road"),
    ("sagami", "atsugi", "road"),
    ("sagami", "odawara", "rail"),
    ("sagami", "yokosuka", "road"),
    ("sagami", "yokohama", "rail"),
    ("odawara", "hachioji", "track"),
    ("odawara", "kofu", "track"),
    ("atsugi", "hachioji", "road"),
    ("atsugi", "yokohama", "road"),
    ("yokosuka", "yokohama", "rail"),
    ("yokohama", "tokyo", "rail"),
    ("hachioji", "tokyo", "rail"),
    ("hachioji", "kofu", "rail"),
    ("hachioji", "kumagaya", "road"),
    ("tokyo", "omiya", "rail"),
    ("omiya", "kumagaya", "rail"),
    ("omiya", "koga", "rail"),
    ("koga", "utsunomiya", "rail"),
    ("koga", "kumagaya", "road"),
]

US = "us-ir-1944"
US_TK = "us-tank-bn-1945"
US_AI = "us-armd-inf-bn-1944"
JP = "jp-inf-regt-1944"
JP_TK = "jp-tank-regt-1945"


def formation(fid, side, name, region, units, arrive=None, training=None, landing=False, strength=None):
    t = [("training", training)] if training else []
    s = [("strength", strength)] if strength else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    if landing:
        f["landing"] = True
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t + s) for u, toe in units]
    return f


FORMATIONS = [
    # ---- 米軍(第1軍・第8軍)----
    # 第1軍(ホッジス):九十九里浜に第24軍団(第7・第27・第96歩兵)と第3水陸両用軍団(第1・第4・第6海兵)。
    # 第8軍(アイケルバーガー):相模湾に第10軍団(第24・第31・第37歩兵)と第14軍団(第6・第32・第38歩兵)。
    # 後から第13軍団(第13・第20機甲師団)が相模湾に上がって平野へ出る計画。師団の割り振りは計画の版で違う(TODO(要裏取り))
    formation("us-24corps", "us", "第24軍団(第7・第27・第96歩兵)", "kujukuri", [("7", US), ("27", US), ("96", US), ("tk", US_TK)], arrive=Y_DAY, training="veteran", landing=True),
    formation("us-3ac", "us", "第3水陸両用軍団(第1・第4・第6海兵)", "kujukuri", [("1mar", US), ("4mar", US), ("6mar", US)], arrive=Y_DAY, training="veteran", landing=True),
    formation("us-10corps", "us", "第10軍団(第24・第31・第37歩兵)", "sagami", [("24", US), ("31", US), ("37", US), ("tk", US_TK)], arrive=Y_DAY, training="veteran", landing=True),
    formation("us-14corps", "us", "第14軍団(第6・第32・第38歩兵)", "sagami", [("6", US), ("32", US), ("38", US)], arrive=Y_DAY, training="veteran", landing=True),
    formation("us-13corps", "us", "第13軍団(第13・第20機甲師団)", "sagami", [("13a", US_TK), ("13b", US_AI), ("20a", US_TK), ("20b", US_AI)], arrive=date(1946, 3, 11), training="regular", landing=True),
    # 欧州から回る師団(第5・第44・第86・第87・第97歩兵ほか)。上がる日と場所は TODO(要裏取り)。ここでは3月中旬に2つの海岸に
    formation("us-follow-e", "us", "後続の師団(欧州から。九十九里)", "kujukuri", [("d1", US), ("d2", US), ("d3", US)], arrive=date(1946, 3, 14), training="regular", landing=True),
    formation("us-follow-w", "us", "後続の師団(欧州から。相模湾)", "sagami", [("d1", US), ("d2", US), ("d3", US)], arrive=date(1946, 3, 17), training="regular", landing=True),
    # ---- 日本軍(第12方面軍)----
    # 第52軍(九十九里・房総)、第53軍(相模湾)、第51軍(鹿島灘)、第36軍(機動の決戦の兵力。戦車師団2を含む)、東京湾兵団・東京防衛軍。
    # 師団の数と置き場所は TODO(要裏取り)。1945年に作った沿岸の師団は装備が足りなかった(未熟・戦力0.7)
    formation("jp-52army", "jp", "第52軍(九十九里浜)", "kujukuri", [("d1", JP), ("d2", JP)], training="green", strength=0.7),
    formation("jp-52army-b", "jp", "第52軍の後ろ(千葉・佐倉)", "chiba", [("d1", JP), ("d2", JP)], training="regular"),
    formation("jp-52army-boso", "jp", "房総の守り", "boso", [("d1", JP)], training="green", strength=0.7),
    formation("jp-53army", "jp", "第53軍(相模湾)", "sagami", [("d1", JP), ("d2", JP)], training="green", strength=0.7),
    formation("jp-53army-b", "jp", "第53軍の後ろ(小田原)", "odawara", [("d1", JP)], training="regular"),
    formation("jp-51army", "jp", "第51軍(鹿島灘)", "choshi", [("d1", JP), ("d2", JP)], training="green", strength=0.7),
    formation("jp-36army-e", "jp", "第36軍(機動。東)", "omiya", [("d1", JP), ("d2", JP), ("d3", JP), ("tk", JP_TK)], training="regular"),
    formation("jp-36army-w", "jp", "第36軍(機動。西)", "hachioji", [("d1", JP), ("d2", JP), ("d3", JP), ("tk", JP_TK)], training="regular"),
    formation("jp-tokyo", "jp", "東京防衛軍", "tokyo", [("d1", JP), ("d2", JP)], training="green", strength=0.7),
    formation("jp-tokyo-bay", "jp", "東京湾兵団(横須賀)", "yokosuka", [("d1", JP)], training="green", strength=0.7),
]


# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))。初めは航空を入れず、AI 同士で米が千葉・相模湾の後ろで止まって
# 日本の限定的勝利・引き分けばかりになったので、計画にあった九州の極東空軍と空母の航空隊を足した(米の空の優勢)。
# 日本の特攻機(数千機を温存していたとされる)は表さず、迎え撃つ戦闘機と攻撃機を少しだけ置く
AIRBASES = ["kyushu", "kumagaya"]
AIR_WINGS = [
    L([("id", "us-feaf"), ("side", "us"), ("name", "極東空軍(九州)"), ("base", "kyushu"), ("rangeKm", 1100), ("fighters", 5), ("strike", 6)]),
    L([("id", "us-carriers"), ("side", "us"), ("name", "第3・第5艦隊の空母の航空隊"), ("base", "kyushu"), ("rangeKm", 1100), ("fighters", 6), ("strike", 6)]),
    L([("id", "jp-air"), ("side", "jp"), ("name", "第1航空軍・第10航空艦隊の残り(特攻は表さない)"), ("base", "kumagaya"), ("rangeKm", 400), ("fighters", 3), ("strike", 2)]),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方。計画の目的=東京と関東平野を押さえる、から)
VICTORY = L(
    [
        ("us", L([
            ("conditions", [cond("tokyo", "tokyo", 8), cond("yokohama", "yokohama", 3), cond("chiba", "chiba", 2), cond("atsugi", "atsugi", 2), cond("omiya", "omiya", 1), loss("loss", 1, 2)]),
            ("decisive", L([("minPoints", 14), ("requires", ["tokyo", "yokohama"])])),
            ("limited", L([("minPoints", 6), ("requires", [])])),
        ])),
        ("jp", L([
            ("conditions", [cond("tokyo", "tokyo", 6), cond("yokohama", "yokohama", 2), cond("chiba", "chiba", 2), cond("kujukuri", "kujukuri", 1), cond("sagami", "sagami", 1), loss("loss", 1.5, 2)]),
            ("decisive", L([("minPoints", 10), ("requires", ["tokyo", "yokohama", "chiba"])])),
            ("limited", L([("minPoints", 6), ("requires", ["tokyo"])])),
        ])),
    ]
)

# 築城した地域(日本軍が守るときだけの塹壕線):九十九里浜・相模湾の海岸と、相模湾の後ろの小田原・横須賀(TODO(要裏取り):陣地の位置と出来上がり具合)
FORTIFIED = {"kujukuri": "trench", "sagami": "trench", "odawara": "trench", "yokosuka": "trench"}


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
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "jp")])
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "coronet-1946"),
            ("name", "コロネット作戦(1946年3月・架空)"),
            (
                "description",
                "実行されなかったダウンフォール作戦の第2段。米第1軍が九十九里浜に、第8軍が相模湾に上がり、東京を東西から挟む。"
                "日本の第12方面軍は海岸で戦い、機動の第36軍を関東平野で決戦に出す。1段階は3日、14段階。架空の戦い・v0・概略図(兵力の割り振りの多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/coronet-1946.md。作り直しは tools/campaigns/build_coronet_1946.py。部隊1つ≒1個師団。米の航空は九州の飛行場から。特攻は表していない(TODO)"),
            ("era", "1945-kyushu"),
            ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "jp"), ("name", "日本軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            # 補充:日本は本土の動員で兵はいたが、武器・弾薬が足りなかった(補充を段階ごとに2%。仮置き)
            ("rules", L([("replacementBySide", L([("jp", 0.02)])), ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_fighter_bomber")]))]))])),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
