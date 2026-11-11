#!/usr/bin/env python3
"""
太平洋・マレー(1941〜42年)の陸上機の航空隊(陸攻・連合軍の爆撃機・雷撃機・戦闘機)の武器と編成(v0)を作る。
海戦で、空母の艦載機と同じ盤上の航空隊として使う(基地は陸の飛行場。地図の外の飛行場はシナリオの air.airfield)。
汎用の艦艇の武器(naval-generic)・太平洋1942年の艦級(pacific-ships-1942)の後ろに重ねて使う。

    python3 tools/packs/build_pacific_landair_1941.py

出力: data/weapons/pacific-landair-1941.json・data/toe/pacific-landair-1941.json

根拠は docs/research/malaya-naval-air-1941-12.md(検索の要約だけで調べた)。
- 九六式陸攻(G3M):巡航 約280km/h、爆弾 800kg か魚雷1本を胴体の下に
- 一式陸攻(G4M):巡航 約315km/h、爆弾 1000kg か九一式魚雷1本(約800kg)
- 魚雷の炸薬・命中、水平爆撃の当たりにくさ、行動半径、1機の耐久はゲームの設計による仮置き(ミッドウェーの機種と同じ物差し)
TODO(要裏取り):行動半径(出典候補:『戦史叢書 マレー進攻作戦』『海軍航空概史』、Shores ほか『Bloody Shambles』)、
九一式航空魚雷の改型ごとの炸薬、英の Mk XII 航空魚雷の炸薬と信頼性、ハドソンの爆弾の数
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, soft=1.0, armored=1.0, aa=0.0, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": armored}, "indirect": False, "ammoPerMin": 0, "suppression": 0.5, "antiAir": aa}
    d.update(extra)
    return d


WEAPONS = {
    # 1機あたり。攻撃力の物差しはミッドウェーの機種(tools/packs/build_midway_1942.py)にそろえる
    "lb_type91_torpedo": w("九一式航空魚雷(陸攻・1機分)", [(500, 200)], armored=1.0, aa=0.6, torpedo=True),
    "lb_jp_250kg_level": w("陸攻の水平爆撃(250kg・1機分)", [(500, 40)], armored=0.5, aa=0.6),
    "lb_jp_500kg_level": w("陸攻の水平爆撃(500kg・1機分)", [(500, 60)], armored=0.6, aa=0.6),
    "lb_uk_18in_torpedo": w("英の18インチ航空魚雷 Mk XII(1機分)", [(500, 150)], armored=1.0, aa=0.3, torpedo=True),
    "lb_hudson_bombs": w("ハドソンの爆弾(250ポンド・1機分)", [(500, 20)], armored=0.4, aa=0.8),
    "lb_gunner_mg": w("陸上機の旋回機銃(1機分)", [(500, 0.1)], armored=0.02, aa=0.8),
    "lb_f2a_guns": w("バッファロー(F2A)の機銃(1機分)", [(500, 0.4)], armored=0.05, aa=1.8),
    "lb_a6m_guns": w("零戦の機銃・機関砲(1機分。陸上の基地から)", [(500, 0.5)], armored=0.05, aa=3.6),
}
# 艦への爆弾・魚雷(1機1発。ルールパックの airGroups.ordnance で命中を数える)
# 水平爆撃は急降下より当たらない(マレー沖の美幌空の水平爆撃は、レパルスに 250kg 1発という要約から。accuracy は仮置き)
ORDNANCE = {
    "lb_type91_torpedo": {"kind": "torpedo", "kg": 205, "reliability": 0.9},
    "lb_jp_250kg_level": {"kind": "bomb", "kg": 250, "deckPenetrationMm": 40, "accuracy": 0.25},
    "lb_jp_500kg_level": {"kind": "bomb", "kg": 500, "deckPenetrationMm": 60, "accuracy": 0.25},
    "lb_uk_18in_torpedo": {"kind": "torpedo", "kg": 176, "reliability": 0.7},
    "lb_hudson_bombs": {"kind": "bomb", "kg": 113, "deckPenetrationMm": 20, "accuracy": 0.2},
}
for k, v in ORDNANCE.items():
    WEAPONS[k]["airOrdnance"] = v

weapons = {"id": "pacific-landair-1941", "notes": "太平洋・マレー(1941〜42年)の陸上機の武器。1機あたり。数値は仮置き(tools/packs/build_pacific_landair_1941.py、docs/research/malaya-naval-air-1941-12.md)。", "weapons": WEAPONS}


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


# 機種:名前・役割・1機の耐久・武器・速さ(m/分。巡航)・行動半径(m)。陸攻は燃えやすく、1機の耐久は艦攻と同じ 3 にした(仮置き)
KINDS = {
    "g3m-torp": ("九六式陸攻隊(雷装)", "strike", 3, ["lb_type91_torpedo", "lb_gunner_mg"], 4600, 1100000),
    "g3m-bomb": ("九六式陸攻隊(爆装・水平爆撃)", "strike", 3, ["lb_jp_500kg_level", "lb_gunner_mg"], 4600, 1100000),
    "g4m-torp": ("一式陸攻隊(雷装)", "strike", 3, ["lb_type91_torpedo", "lb_gunner_mg"], 5200, 1300000),
    "g4m-bomb": ("一式陸攻隊(爆装・水平爆撃)", "strike", 3, ["lb_jp_500kg_level", "lb_gunner_mg"], 5200, 1300000),
    "a6m-land": ("零戦隊(陸上の基地から)", "fighter", 2, ["lb_a6m_guns"], 5000, 600000),
    "hudson": ("ハドソン爆撃機隊", "strike", 4, ["lb_hudson_bombs", "lb_gunner_mg"], 5000, 900000),
    "vildebeest": ("ヴィルデビースト雷撃機隊(複葉)", "strike", 2, ["lb_uk_18in_torpedo"], 2600, 400000),
    "buffalo": ("バッファロー戦闘機隊", "fighter", 2, ["lb_f2a_guns"], 4500, 350000),
}
# 1つの航空隊の機数(中隊 9機を基本に。マレー沖の攻撃は 8〜9機の中隊ごとに来た、という要約から。キャンペーンの 12機の編隊も)
SIZES = {
    "g3m-torp": [8, 9, 12, 16, 17],
    "g3m-bomb": [8, 9, 12, 16],
    "g4m-torp": [8, 9, 12, 26],
    "g4m-bomb": [9, 12],
    "a6m-land": [9, 12],
    "hudson": [9, 12],
    "vildebeest": [9, 12],
    "buffalo": [9, 12],
}

TOES = {}
for kind, ns in SIZES.items():
    name, role, hp, ws, speed, radius = KINDS[kind]
    for n in ns:
        TOES[f"lb-{kind}-{n}"] = air(f"{name}({n}機)", role, n, hp, ws, speed, radius)
# 陸上の索敵機(九六式陸攻の索敵。3機)
TOES["lb-g3m-scout-3"] = air("九六式陸攻の索敵機(3機)", "scout", 3, 3, ["lb_gunner_mg"], 4600, 1100000, vision=50000)
TOES["lb-hudson-scout-2"] = air("ハドソンの哨戒機(2機)", "scout", 2, 4, ["lb_gunner_mg"], 5000, 900000, vision=50000)

toe = {"id": "pacific-landair-1941", "notes": "太平洋・マレー(1941〜42年)の陸上機の航空隊(v0。ID は lb-機種-機数)。海戦で空母の艦載機と同じように動く。数値は仮置き(tools/packs/build_pacific_landair_1941.py、docs/research/malaya-naval-air-1941-12.md)。", "toes": TOES}
(ROOT / "data/weapons/pacific-landair-1941.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/pacific-landair-1941.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/pacific-landair-1941.json, data/toe/pacific-landair-1941.json")
