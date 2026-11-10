#!/usr/bin/env python3
"""
オリンピック作戦(1945年11月の南九州上陸。計画だけで実行されなかった架空の戦い)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_olympic_1945.py

出力: data/campaigns/olympic-1945.json

米第6軍が南九州の3か所(西の串木野、南の有明湾=志布志、東の宮崎)に3個師団ずつ上がり、鹿児島湾と飛行場のある南九州を押さえようとする。
日本の第16方面軍は「決号作戦」で、上陸の地点に兵力を集めて海岸で戦う。
根拠と残りの裏取りは docs/research/olympic-1945.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。

部隊の単位:1個の部隊をおおよそ1個師団(連隊の編成表で代える)。上陸はキャンペーンの上陸の増援(landing)で表す(敵がいれば次の段階に攻め手として戦う)。
1段階は3日(10月29日を1日目として10段階で11月27日まで)。上陸の日(X 日)は11月1日=2段階目。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/olympic-1945.json"

START = date(1945, 10, 29)
DAYS_PER_STAGE = 3
STAGES = 10
X_DAY = date(1945, 11, 1)


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯32度で約94km、緯度1度は約111km)"""
    return round((lon - 130.0) * 94, 1), round((lat - 31.2) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主。上陸の3地点は米の補給の源(上がって押さえると、そこから補給が届く)
REGIONS = [
    ("kushikino", "串木野・川内(西の上陸)", 31.72, 130.27, "western-farmland", "us", "jp"),
    ("ariake", "有明湾・志布志(南の上陸)", 31.48, 131.10, "western-farmland", "us", "jp"),
    ("miyazaki", "宮崎(東の上陸)", 31.91, 131.42, "western-farmland", "us", "jp"),
    ("kagoshima", "鹿児島", 31.60, 130.56, "western-farmland", None, "jp"),
    ("kokubu", "国分(鹿児島湾の奥)", 31.74, 130.76, "western-farmland", None, "jp"),
    ("kanoya", "鹿屋(飛行場)", 31.38, 130.85, "western-farmland", None, "jp"),
    ("miyakonojo", "都城", 31.72, 131.06, "western-farmland", None, "jp"),
    ("izumi", "出水", 32.09, 130.35, "western-farmland", None, "jp"),
    ("hitoyoshi", "人吉", 32.21, 130.76, "western-farmland", None, "jp"),
    ("tsuno", "都農", 32.25, 131.56, "western-farmland", None, "jp"),
    # 日本の補給の源(北)
    ("kumamoto", "熊本(北の補給)", 32.80, 130.71, "western-farmland", "jp", "jp"),
    ("nobeoka", "延岡(北の補給)", 32.58, 131.66, "western-farmland", "jp", "jp"),
]

LINKS = [
    ("kushikino", "kagoshima", "road"),
    ("kushikino", "izumi", "road"),
    ("kagoshima", "kokubu", "road"),
    ("kokubu", "kanoya", "road"),
    ("kokubu", "miyakonojo", "road"),
    ("kokubu", "hitoyoshi", "road"),
    ("kanoya", "ariake", "road"),
    ("ariake", "miyakonojo", "road"),
    ("miyakonojo", "miyazaki", "road"),
    ("miyazaki", "tsuno", "road"),
    ("tsuno", "nobeoka", "road"),
    ("tsuno", "hitoyoshi", "track"),
    ("izumi", "hitoyoshi", "road"),
    ("izumi", "kumamoto", "rail"),
    ("hitoyoshi", "kumamoto", "rail"),
    ("nobeoka", "kumamoto", "track"),
]

US = "us-ir-1944"
US_TK = "us-tank-bn-1945"
JP = "jp-inf-regt-1944"
JP_TK = "jp-tank-regt-1945"


def formation(fid: str, side: str, name: str, region: str, units: list[tuple[str, str]], arrive: date | None = None, training: str | None = None, landing: bool = False):
    t = [("training", training)] if training else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    if landing:
        f["landing"] = True
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t) for u, toe in units]
    return f


FORMATIONS = [
    # ---- 米軍(第6軍)----
    # 3か所に3個師団ずつ、ほかに予備2個師団(計画。中。Wikipedia『Operation Downfall』・historyofwar.org の要約)。陸軍9・海兵3(USNI)
    # 西の串木野:第5水陸両用軍団(第2・第3・第5海兵師団)(中。rusinsw.org.au の要約)
    formation("us-vac", "us", "第5水陸両用軍団(第2・第3・第5海兵)", "kushikino", [("2mar", US), ("3mar", US), ("5mar", US)], arrive=X_DAY, training="veteran", landing=True),
    # 南の有明湾・東の宮崎の軍団と師団は TODO(要裏取り)。ここでは3個師団ずつ(戦車大隊つき)
    formation("us-south", "us", "有明湾の上陸の軍団", "ariake", [("d1", US), ("d2", US), ("d3", US), ("tk", US_TK)], arrive=X_DAY, training="veteran", landing=True),
    formation("us-east", "us", "宮崎の上陸の軍団", "miyazaki", [("d1", US), ("d2", US), ("d3", US), ("tk", US_TK)], arrive=X_DAY, training="veteran", landing=True),
    # 予備の2個師団:上がる日・場所は TODO(要裏取り)。ここでは11月7日に有明湾
    formation("us-reserve", "us", "第6軍の予備", "ariake", [("d1", US), ("d2", US)], arrive=date(1945, 11, 7), training="regular", landing=True),
    # 第6軍は12個師団(と予備2個師団)で上がる計画(historyofwar.org)。3か所×3個師団の後に続く3個師団(第9軍団か)は TODO(要裏取り)。
    # ここでは11月4日に宮崎(有明湾と宮崎に分ける資料は確かめていない)
    formation("us-follow", "us", "後続の3個師団(第9軍団か)", "miyazaki", [("d1", US), ("d2", US), ("d3", US)], arrive=date(1945, 11, 4), training="regular", landing=True),
    # ---- 日本軍(第16方面軍)----
    # 米第6軍の8月1日の見積もり:九州に約42万1千人、9個師団か師団相当(中。pahor.at の要約)。のちの見積もりはもっと多い(TODO)。
    # 第40軍は南西を3個師団と独立旅団1つで守った(中。irp.fas.org『Estimate of the Enemy Situation』)
    formation("jp-40army", "jp", "第40軍(南西)", "kagoshima", [("d1", JP), ("d2", JP), ("d3", JP), ("bde", JP)], training="regular"),
    formation("jp-40army-coast", "jp", "第40軍の海岸の守り(串木野)", "kushikino", [("d1", JP)], training="green"),
    # 有明湾がいちばん上陸されやすいとみて兵力を寄せた(中。pwencycl.kgbudge.com の要約)。宮崎も上陸の地とみた。
    # 師団の数の割り振りは TODO(要裏取り)。ここでは有明湾に2・宮崎に2・都城に1(戦車連隊)
    formation("jp-ariake", "jp", "有明湾の守り", "ariake", [("d1", JP), ("d2", JP)], training="regular"),
    formation("jp-miyazaki", "jp", "宮崎の守り", "miyazaki", [("d1", JP), ("d2", JP)], training="regular"),
    formation("jp-reserve", "jp", "南九州の予備(都城)", "miyakonojo", [("d1", JP), ("tk", JP_TK)], training="regular"),
]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid: str, mx: float, points: int):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方。計画の目的=鹿児島湾と南九州の飛行場を押さえる、から)
VICTORY = L(
    [
        (
            "us",
            L(
                [
                    ("conditions", [cond("kagoshima", "kagoshima", 3), cond("kanoya", "kanoya", 3), cond("miyakonojo", "miyakonojo", 2), cond("miyazaki", "miyazaki", 2), cond("kokubu", "kokubu", 2), cond("kushikino", "kushikino", 1), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 11), ("requires", ["kagoshima", "kanoya", "miyazaki"])])),
                    ("limited", L([("minPoints", 6), ("requires", [])])),
                ]
            ),
        ),
        (
            "jp",
            L(
                [
                    ("conditions", [cond("kagoshima", "kagoshima", 3), cond("kanoya", "kanoya", 2), cond("miyakonojo", "miyakonojo", 2), cond("ariake", "ariake", 1), cond("miyazaki", "miyazaki", 1), loss("loss", 1.5, 2)]),
                    ("decisive", L([("minPoints", 8), ("requires", ["kagoshima", "kanoya"])])),
                    ("limited", L([("minPoints", 4), ("requires", [])])),
                ]
            ),
        ),
    ]
)


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "olympic-1945"),
            ("name", "オリンピック作戦(1945年11月・架空)"),
            (
                "description",
                "実行されなかった南九州上陸の計画。米第6軍が串木野・有明湾・宮崎の3か所に上がり、鹿児島湾と飛行場を押さえようとする。"
                "日本の第16方面軍は上陸の地点に兵力を集めて海岸で戦う。1段階は3日、10段階。架空の戦い・v0・概略図(兵力の割り振りの多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/olympic-1945.md。作り直しは tools/campaigns/build_olympic_1945.py。部隊1つ≒1個師団。航空(米の航空と特攻)は入れていない(TODO)"),
            ("era", "1945-kyushu"),
            ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "jp"), ("name", "日本軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
