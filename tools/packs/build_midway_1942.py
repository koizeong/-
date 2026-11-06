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
# 艦への爆弾・魚雷(1機1発。ルールパックの airGroups.ordnance で命中を数える)。TODO(要裏取り):各爆弾の甲板の貫通、魚雷の炸薬と不発
ORDNANCE = {
    "d3a_bomb": {"kind": "bomb", "kg": 250, "deckPenetrationMm": 50},
    "sbd_bomb": {"kind": "bomb", "kg": 454, "deckPenetrationMm": 75},
    "b5n_torpedo": {"kind": "torpedo", "kg": 205, "reliability": 0.9},
    "us_torpedo": {"kind": "torpedo", "kg": 182, "reliability": 0.4},
    "b17_bombs": {"kind": "bomb", "kg": 227, "deckPenetrationMm": 40, "accuracy": 0.05},
    "b5n_land_bombs": {"kind": "bomb", "kg": 800, "deckPenetrationMm": 20, "accuracy": 0.4},
}
for k, v in ORDNANCE.items():
    WEAPONS[k]["airOrdnance"] = v

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


# 艦艇は1隻ずつの艦級(tools/packs/build_pacific_ships_1942.py)に移した。ここは機種の航空隊だけ。
# 航空隊は母艦ごとの飛行隊(戦闘機・艦爆・艦攻)に分け、機数ごとに編成表を作る(ID は mw-機種-機数)。
# 機種の強さ・速さ・行動半径(1機あたり)。TODO(要裏取り):Lundstrom『The First Team』、Parshall & Tully『Shattered Sword』
KINDS = {
    "a6m": ("零戦隊", "fighter", 2, ["a6m_guns"], 5000, 450000),
    "d3a": ("九九式艦爆隊", "strike", 2.5, ["d3a_bomb"], 4000, 400000),
    "b5n": ("九七式艦攻隊(雷装)", "strike", 3, ["b5n_torpedo"], 4000, 400000),
    "b5n-land": ("九七式艦攻隊(陸用爆弾)", "strike", 3, ["b5n_land_bombs"], 4000, 400000),
    "f4f": ("F4F 戦闘機隊", "fighter", 2.2, ["f4f_guns"], 4500, 280000),
    "sbd": ("SBD 急降下爆撃機隊", "strike", 2.5, ["sbd_bomb"], 4000, 380000),
    "tbd": ("TBD 雷撃機隊", "strike", 3, ["us_torpedo"], 3300, 280000),
}
# 母艦ごとの飛行隊の機数(docs/research/midway-1942-06.md)
SIZES = {"a6m": [18], "d3a": [18], "b5n": [18, 27], "b5n-land": [18], "f4f": [25, 27], "sbd": [17, 18, 19], "tbd": [13, 14, 15]}

TOES = {}
for kind, ns in SIZES.items():
    name, role, hp, ws, speed, radius = KINDS[kind]
    for n in ns:
        TOES[f"mw-{kind}-{n}"] = air(f"{name}({n}機)", role, n, hp, ws, speed, radius)
TOES.update({
    "mw-jp-scout": air("索敵機(水偵 2〜3機)", "scout", 3, 2, ["gunner_mg"], 3000, 550000, vision=50000),
    # ミッドウェー島の航空隊
    "mw-us-vmf221": air("第221海兵戦闘飛行隊(F2A・F4F 26機)", "fighter", 26, 2, ["f2a_guns"], 4000, 300000),
    "mw-us-vmsb241": air("第241海兵偵察爆撃飛行隊(SBD・SB2U 27機)", "strike", 27, 2.5, ["sbd_bomb"], 3500, 350000),
    "mw-us-b17": air("B-17 爆撃機隊(15機)", "strike", 15, 8, ["b17_bombs"], 5000, 1000000),
    "mw-us-pby": air("PBY 哨戒機隊(4機ずつ)", "scout", 4, 3, ["gunner_mg"], 3000, 1000000, vision=50000),
})
toe = {"id": "midway-1942", "notes": "ミッドウェー海戦の航空隊(v0。母艦ごとの飛行隊。ID は mw-機種-機数)。数値は仮置き(tools/packs/build_midway_1942.py、docs/research/midway-1942-06.md)。", "toes": TOES}
(ROOT / "data/weapons/midway-1942.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/midway-1942.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/midway-1942.json, data/toe/midway-1942.json")
