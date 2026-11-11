#!/usr/bin/env python3
"""
太平洋 1944年の航空機の航空隊(空母の艦載機と陸上機)の武器と編成表(v0)を作る。レイテ沖海戦・レイテ島の戦いのため。
汎用の艦艇(naval-generic)・太平洋1942年と1944年の艦級の後ろに重ねて使う。

    python3 tools/packs/build_pacific_air_1944.py

出力: data/weapons/pacific-air-1944.json・data/toe/pacific-air-1944.json(ID は pa44-機種-機数)

機種ごとの強さ・速さ(巡航)・行動半径・1機の耐久は、ミッドウェー(tools/packs/build_midway_1942.py)・陸上機
(tools/packs/build_pacific_landair_1941.py)と同じ物差しのゲームの仮置き:
- F6F は零戦五二型より空戦に強く(1944年の米の搭乗員の練度の差は練度で表す)、耐久も高い
- 米の魚雷(Mk13)は1944年には不具合が直り、九一式に近い
- 日本の陸上機は第2航空艦隊(海軍)と第4航空軍(陸軍の一式戦・四式戦)
TODO(要裏取り):各機の行動半径と搭載量(出典候補:Francillon『Japanese Aircraft of the Pacific War』、Tillman『Hellcat』、
NavWeaps の Mk13 の頁)、レイテの各空母の機数(Morison 第12巻の付録)
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, armored=1.0, aa=0.0, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": 1.0, "armored": armored}, "indirect": False, "ammoPerMin": 0, "suppression": 0.5, "antiAir": aa}
    d.update(extra)
    return d


WEAPONS = {
    "pa44_f6f_guns": w("F6F の機銃(1機分)", [(500, 0.6)], armored=0.05, aa=4.0),
    "pa44_fm2_guns": w("FM-2 の機銃(1機分。護衛空母)", [(500, 0.5)], armored=0.05, aa=3.0),
    "pa44_p38_guns": w("P-38 の機銃・機関砲(1機分)", [(500, 0.7)], armored=0.08, aa=3.8),
    "pa44_a6m5_guns": w("零戦五二型の機銃・機関砲(1機分)", [(500, 0.5)], armored=0.05, aa=3.4),
    "pa44_ki43_guns": w("一式戦 隼の機銃(1機分)", [(500, 0.35)], armored=0.03, aa=3.0),
    "pa44_ki84_guns": w("四式戦 疾風の機銃・機関砲(1機分)", [(500, 0.6)], armored=0.05, aa=3.8),
    "pa44_sb2c_bomb": w("SB2C の爆弾(1000ポンド・1機分)", [(500, 170)], armored=0.8, aa=0.6),
    "pa44_tbm_torpedo": w("TBM の Mk13 航空魚雷(1944年・1機分)", [(500, 180)], aa=0.5, torpedo=True),
    "pa44_d4y_bomb": w("彗星の爆弾(500kg・1機分)", [(500, 150)], armored=0.7, aa=0.5),
    "pa44_b6n_torpedo": w("天山の九一式魚雷(1機分)", [(500, 200)], aa=0.5, torpedo=True),
    "pa44_b25_bombs": w("B-25 の反跳爆撃(1機分)", [(500, 60)], armored=0.4, aa=1.5),
    "pa44_b24_bombs": w("B-24 の水平爆撃(1機分。艦艇にはまず当たらない)", [(500, 15)], armored=0.5, aa=1.4),
    "pa44_gunner_mg": w("旋回機銃(1機分)", [(500, 0.1)], armored=0.02, aa=0.6),
}
# 艦への爆弾・魚雷(1機1発)。B-25 の反跳爆撃は低空から当てるので水平爆撃より当たる(accuracy は仮置き)
ORDNANCE = {
    "pa44_sb2c_bomb": {"kind": "bomb", "kg": 454, "deckPenetrationMm": 75},
    "pa44_tbm_torpedo": {"kind": "torpedo", "kg": 270, "reliability": 0.85},
    "pa44_d4y_bomb": {"kind": "bomb", "kg": 500, "deckPenetrationMm": 70},
    "pa44_b6n_torpedo": {"kind": "torpedo", "kg": 205, "reliability": 0.9},
    "pa44_b25_bombs": {"kind": "bomb", "kg": 227, "deckPenetrationMm": 30, "accuracy": 0.35},
    "pa44_b24_bombs": {"kind": "bomb", "kg": 227, "deckPenetrationMm": 40, "accuracy": 0.05},
}
for k, v in ORDNANCE.items():
    WEAPONS[k]["airOrdnance"] = v

weapons = {"id": "pacific-air-1944", "notes": "太平洋1944年の航空機の武器。1機あたり。数値は仮置き(tools/packs/build_pacific_air_1944.py)。", "weapons": WEAPONS}


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


# 機種:名前・役割・1機の耐久・武器・速さ(m/分)・行動半径(m)
KINDS = {
    "f6f": ("F6F 戦闘機隊", "fighter", 2.6, ["pa44_f6f_guns"], 5000, 400000),
    "fm2": ("FM-2 戦闘機隊(護衛空母)", "fighter", 2.2, ["pa44_fm2_guns"], 4500, 300000),
    "sb2c": ("SB2C 急降下爆撃機隊", "strike", 3, ["pa44_sb2c_bomb", "pa44_gunner_mg"], 4300, 400000),
    "tbm": ("TBM 雷撃機隊", "strike", 3.5, ["pa44_tbm_torpedo", "pa44_gunner_mg"], 4000, 400000),
    "a6m5": ("零戦五二型の戦闘機隊", "fighter", 2, ["pa44_a6m5_guns"], 5000, 450000),
    "d4y": ("彗星の艦爆隊", "strike", 2, ["pa44_d4y_bomb", "pa44_gunner_mg"], 5000, 500000),
    "b6n": ("天山の艦攻隊", "strike", 2.5, ["pa44_b6n_torpedo", "pa44_gunner_mg"], 4500, 500000),
    "p38": ("P-38 戦闘機隊", "fighter", 3, ["pa44_p38_guns"], 5500, 600000),
    "b25": ("B-25 爆撃機隊", "strike", 4, ["pa44_b25_bombs", "pa44_gunner_mg"], 4800, 600000),
    "b24": ("B-24 爆撃機隊", "strike", 8, ["pa44_b24_bombs", "pa44_gunner_mg"], 4800, 1500000),
    "ki43": ("一式戦 隼の戦闘機隊", "fighter", 1.8, ["pa44_ki43_guns"], 4800, 500000),
    "ki84": ("四式戦 疾風の戦闘機隊", "fighter", 2.2, ["pa44_ki84_guns"], 5500, 450000),
}
SIZES = {
    "f6f": [12, 24, 36], "fm2": [12, 16], "sb2c": [12, 24], "tbm": [9, 12, 18],
    "a6m5": [12, 24], "d4y": [12], "b6n": [12],
    "p38": [12], "b25": [12], "b24": [12], "ki43": [12], "ki84": [12],
}
TOES = {}
for kind, ns in SIZES.items():
    name, role, hp, ws, speed, radius = KINDS[kind]
    for n in ns:
        TOES[f"pa44-{kind}-{n}"] = air(f"{name}({n}機)", role, n, hp, ws, speed, radius)
# 索敵機:日本は彗星(偵察)、米は TBM の索敵(3機ずつ)
TOES["pa44-jp-scout"] = air("彗星の索敵機(3機)", "scout", 3, 2, ["pa44_gunner_mg"], 5000, 600000, vision=60000)
TOES["pa44-us-scout"] = air("TBM の索敵機(3機)", "scout", 3, 3.5, ["pa44_gunner_mg"], 4000, 500000, vision=50000)

toe = {"id": "pacific-air-1944", "notes": "太平洋1944年の航空隊(艦載機と陸上機。ID は pa44-機種-機数)。数値は仮置き(tools/packs/build_pacific_air_1944.py)。", "toes": TOES}
(ROOT / "data/weapons/pacific-air-1944.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/pacific-air-1944.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/pacific-air-1944.json, data/toe/pacific-air-1944.json")
