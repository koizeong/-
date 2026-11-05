#!/usr/bin/env python3
"""
ミッドウェー海戦(1942年6月)の艦艇の戦隊・航空隊の武器と編成(v0)を作る。汎用の艦艇の武器(naval-generic)の後ろに重ねて使う。

    python3 tools/packs/build_midway_1942.py

出力: data/weapons/midway-1942.json・data/toe/midway-1942.json

機数は検索結果の要約から(根拠と残りの裏取りは docs/research/midway-1942-06.md)。
機種ごとの武器の強さ・速さ・行動半径はゲームの設計による仮置き:
- 零戦は空戦に強く(F4F の 1.2 倍、F2A バッファローの 2 倍)、行動半径が長い
- 九一式航空魚雷は確実、米の Mk 13 魚雷は不発・遅さで効きにくい(九七式艦攻の半分)
- 米の急降下爆撃(SBD)は九九式艦爆より重い爆弾(1000ポンド)。B-17 の水平爆撃は艦艇にほとんど当たらない
TODO(要裏取り):Lundstrom『The First Team』、Parshall & Tully『Shattered Sword』の機数・行動半径・命中
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, soft=1.0, armored=1.0, aa=0.0, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": armored}, "indirect": False, "ammoPerMin": 0, "suppression": 0.5, "antiAir": aa}
    d.update(extra)
    return d


WEAPONS = {
    "a6m_guns": w("零戦の機銃・機関砲(1機分)", [(500, 0.5)], armored=0.05, aa=3.6),
    "f4f_guns": w("F4F の機銃(1機分)", [(500, 0.5)], armored=0.05, aa=3.0),
    "f2a_guns": w("F2A の機銃(1機分)", [(500, 0.4)], armored=0.05, aa=1.8),
    "d3a_bomb": w("九九式艦爆の爆弾(250kg・1機分)", [(500, 120)], armored=0.6, aa=0.5),
    "sbd_bomb": w("SBD の爆弾(1000ポンド・1機分)", [(500, 170)], armored=0.8, aa=0.6),
    "b5n_torpedo": w("九七式艦攻の九一式魚雷(1機分)", [(500, 200)], armored=1.0, aa=0.5, torpedo=True),
    "us_torpedo": w("Mk 13 航空魚雷(1機分。不発が多い)", [(500, 100)], armored=1.0, aa=0.5, torpedo=True),
    "b17_bombs": w("B-17 の水平爆撃(1機分。艦艇にはまず当たらない)", [(500, 15)], armored=0.5, aa=1.2),
    "gunner_mg": w("旋回機銃(1機分)", [(500, 0.1)], armored=0.02, aa=0.6),
    "b5n_land_bombs": w("九七式艦攻の陸用爆弾(800kg・1機分)", [(500, 60)], soft=1.0, armored=0.3, aa=0.5),
}
weapons = {"id": "midway-1942", "notes": "ミッドウェー海戦の航空機の武器。1機あたり。数値は仮置き(tools/packs/build_midway_1942.py)。", "weapons": WEAPONS}

SUPPLY_SHIP = {"ammoCapacityT": 50, "fuelCapacityT": 400, "fuelPerKmT": 0.3}


def ship(name, count, hp, guns):
    return {"name": name, "count": count, "hitPoints": hp, "weapons": [{"weapon": g, "count": 1} for g in guns]}


DD = lambda n: ship("駆逐艦", n, 150, ["naval_5in", "naval_aa", "ship_torpedo"])
CV = lambda n, aa=3: ship("空母", n, 800, ["naval_5in"] + ["naval_aa"] * aa)


def squadron(name, elements, armor, speed, carrier=False, radar=None):
    t = {"name": name, "branch": "naval", "armorRatio": armor, "frontageM": 0, "naval": True, "speedMpm": speed, "supply": SUPPLY_SHIP, "elements": elements, "symbol": {"echelon": "regiment", "modifiers": []}}
    if carrier:
        t["carrier"] = True
    if radar:
        t["radarRangeM"] = radar
    return t


def air(name, role, n, hp, weapons_, speed, radius, vision=None):
    a = {"role": role, "speedMpm": speed, "radiusM": radius}
    if vision:
        a["visionM"] = vision
    return {
        "name": name, "branch": "air_group", "armorRatio": 0, "frontageM": 0,
        "supply": {"ammoCapacityT": 1, "fuelCapacityT": 0, "fuelPerKmT": 0}, "air": a,
        "elements": [{"name": "機", "count": n, "hitPoints": hp, "weapons": [{"weapon": x, "count": 1} for x in weapons_]}],
        "symbol": {"echelon": "company", "modifiers": []},
    }


# 速さ:30ノット ≒ 926m/分。米の空母部隊の CXAM 電探は対空・対水上で 100km ほど(**仮置き**)
TOES = {
    # 第一航空艦隊(南雲):空母は2隻ずつの航空戦隊に、護衛の駆逐艦を分けて付けた(配分は仮置き)
    "mw-jp-cardiv": squadron("航空戦隊(空母2・駆逐4)", [CV(2, 3), DD(4)], 0.3, 926, carrier=True),
    "mw-jp-batdiv": squadron("支援部隊(戦艦2・重巡2・駆逐4)", [ship("戦艦", 2, 1500, ["naval_14in", "naval_5in", "naval_aa", "naval_aa"]), ship("重巡洋艦", 2, 600, ["naval_8in", "naval_aa"]), DD(4)], 0.6, 926),
    # 米:第16任務部隊(空母2)・第17任務部隊(空母1)と、巡洋艦の戦隊
    "mw-us-tf16-cv": squadron("第16任務部隊 空母群(空母2・駆逐5)", [CV(2, 4), DD(5)], 0.3, 926, carrier=True, radar=100000),
    "mw-us-tf17-cv": squadron("第17任務部隊 空母群(空母1・駆逐3)", [CV(1, 4), DD(3)], 0.3, 926, carrier=True, radar=100000),
    "mw-us-cruisers": squadron("巡洋艦の戦隊(重巡3・駆逐2)", [ship("重巡洋艦", 3, 600, ["naval_8in", "naval_aa", "naval_aa"]), DD(2)], 0.5, 926, radar=60000),
    # 日本の航空隊(航空戦隊=空母2隻分。1隻あたり零戦18・艦爆18・艦攻18 とする資料から、2隻分)
    "mw-jp-a6m": air("零戦隊(36機)", "fighter", 36, 2, ["a6m_guns"], 5000, 450000),
    "mw-jp-d3a": air("九九式艦爆隊(36機)", "strike", 36, 2.5, ["d3a_bomb"], 4000, 400000),
    "mw-jp-b5n": air("九七式艦攻隊(36機)", "strike", 36, 3, ["b5n_torpedo"], 4000, 400000),
    "mw-jp-b5n-land": air("九七式艦攻隊(陸用爆弾・36機)", "strike", 36, 3, ["b5n_land_bombs"], 4000, 400000),
    "mw-jp-scout": air("索敵機(水偵 2〜3機)", "scout", 3, 2, ["gunner_mg"], 3000, 550000, vision=50000),
    # 米の艦上機(第17任務部隊は検索結果の要約の数。第16任務部隊は2隻分を仮置き)
    "mw-us-f4f-tf16": air("F4F 戦闘機隊(第16任務部隊・54機)", "fighter", 54, 2.2, ["f4f_guns"], 4500, 280000),
    "mw-us-sbd-tf16": air("SBD 急降下爆撃機隊(第16任務部隊・70機)", "strike", 70, 2.5, ["sbd_bomb"], 4000, 380000),
    "mw-us-tbd-tf16": air("TBD 雷撃機隊(第16任務部隊・29機)", "strike", 29, 3, ["us_torpedo"], 3300, 280000),
    "mw-us-f4f-tf17": air("F4F 戦闘機隊(第17任務部隊・25機)", "fighter", 25, 2.2, ["f4f_guns"], 4500, 280000),
    "mw-us-sbd-tf17": air("SBD 急降下爆撃機隊(第17任務部隊・37機)", "strike", 37, 2.5, ["sbd_bomb"], 4000, 380000),
    "mw-us-tbd-tf17": air("TBD 雷撃機隊(第17任務部隊・13機)", "strike", 13, 3, ["us_torpedo"], 3300, 280000),
    # ミッドウェー島の航空隊
    "mw-us-vmf221": air("第221海兵戦闘飛行隊(F2A・F4F 26機)", "fighter", 26, 2, ["f2a_guns"], 4000, 300000),
    "mw-us-vmsb241": air("第241海兵偵察爆撃飛行隊(SBD・SB2U 27機)", "strike", 27, 2.5, ["sbd_bomb"], 3500, 350000),
    "mw-us-b17": air("B-17 爆撃機隊(15機)", "strike", 15, 8, ["b17_bombs"], 5000, 1000000),
    "mw-us-pby": air("PBY 哨戒機隊(4機ずつ)", "scout", 4, 3, ["gunner_mg"], 3000, 1000000, vision=50000),
}
toe = {"id": "midway-1942", "notes": "ミッドウェー海戦の戦隊と航空隊(v0)。艦艇の武器は汎用(naval-generic)。数値は仮置き(tools/packs/build_midway_1942.py、docs/research/midway-1942-06.md)。", "toes": TOES}
(ROOT / "data/weapons/midway-1942.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/midway-1942.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/midway-1942.json, data/toe/midway-1942.json")
