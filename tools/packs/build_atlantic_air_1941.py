#!/usr/bin/env python3
"""
大西洋・北海 1940〜41年の航空隊(ドイツ空軍・英空軍・英海軍航空隊)の武器と編成表を作る(v0)。
海戦で、空母の艦載機・陸の飛行場の航空隊として盤上で動く(陸上機の基地は地図の外にも置ける=シナリオの air.airfield)。
汎用の艦艇(naval-generic)・太平洋1942年の艦級(pacific-ships-1942)・大西洋の艦級(atlantic-ships-1941)の後ろに重ねて使う。

    python3 tools/packs/build_atlantic_air_1941.py

出力: data/weapons/atlantic-air-1941.json・data/toe/atlantic-air-1941.json

機種の巡航の速さ・積む爆弾の重さは一般に知られた値の概数。行動半径・1機の耐久・命中の倍率・攻撃力はゲームの物差し
(ミッドウェーと陸上機1941年のパックにそろえる)による仮置き。
- ノルウェー沖(1940年4〜6月)では、Ju 87 の急降下爆撃と He 111・Ju 88 の水平爆撃が英の艦隊を苦しめた。
  1940年4月10日にベルゲンでスクア(英海軍の急降下爆撃機)がケーニヒスベルクを沈めた
- 1941年5月26日にアーク・ロイヤルのソードフィッシュの魚雷がビスマルクの舵を壊した
TODO(要裏取り):出典候補は Shores ほか『Fledgling Eagles』、Haarr『The German Invasion of Norway』、
Green『Warplanes of the Third Reich』、Thetford『British Naval Aircraft since 1912』
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, soft=1.0, armored=1.0, aa=0.0, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": armored}, "indirect": False, "ammoPerMin": 0, "suppression": 0.5, "antiAir": aa}
    d.update(extra)
    return d


WEAPONS = {
    # 1機あたり。攻撃力の物差しはミッドウェー・陸上機1941年のパックにそろえる
    "at_ju87_bomb": w("Ju 87 の急降下爆撃(500kg・1機分)", [(500, 160)], armored=0.8, aa=0.6),
    "at_he111_bombs": w("He 111 の水平爆撃(1機分)", [(500, 45)], armored=0.5, aa=0.8),
    "at_ju88_bombs": w("Ju 88 の緩降下爆撃(1機分)", [(500, 80)], armored=0.6, aa=0.8),
    "at_bf109_guns": w("Bf 109 の機銃・機関砲(1機分)", [(500, 0.5)], armored=0.05, aa=3.4),
    "at_bf110_guns": w("Bf 110 の機銃・機関砲(1機分)", [(500, 0.5)], armored=0.05, aa=2.6),
    "at_skua_bomb": w("スクアの急降下爆撃(500ポンド・1機分)", [(500, 120)], armored=0.7, aa=0.6),
    "at_skua_guns": w("スクアの機銃(1機分)", [(500, 0.3)], armored=0.05, aa=1.4),
    "at_swordfish_torpedo": w("ソードフィッシュの18インチ航空魚雷 Mk XII(1機分)", [(500, 150)], armored=1.0, aa=0.3, torpedo=True),
    "at_gladiator_guns": w("グラディエーター(複葉)の機銃(1機分)", [(500, 0.3)], armored=0.05, aa=1.6),
    "at_hurricane_guns": w("ハリケーンの機銃(1機分)", [(500, 0.45)], armored=0.05, aa=3.0),
    "at_blenheim_bombs": w("ブレニムの水平爆撃(1機分)", [(500, 25)], armored=0.4, aa=0.8),
    "at_gunner_mg": w("爆撃機・偵察機の旋回機銃(1機分)", [(500, 0.1)], armored=0.02, aa=0.8),
}
# 艦への爆弾・魚雷(1機1発。ルールパックの airGroups.ordnance で命中を数える)。水平爆撃は急降下より当たらない(accuracy は仮置き)
ORDNANCE = {
    "at_ju87_bomb": {"kind": "bomb", "kg": 500, "deckPenetrationMm": 75},
    "at_he111_bombs": {"kind": "bomb", "kg": 250, "deckPenetrationMm": 40, "accuracy": 0.2},
    "at_ju88_bombs": {"kind": "bomb", "kg": 500, "deckPenetrationMm": 60, "accuracy": 0.45},
    "at_skua_bomb": {"kind": "bomb", "kg": 227, "deckPenetrationMm": 40},
    "at_swordfish_torpedo": {"kind": "torpedo", "kg": 176, "reliability": 0.8},
    "at_blenheim_bombs": {"kind": "bomb", "kg": 113, "deckPenetrationMm": 20, "accuracy": 0.2},
}
for k, v in ORDNANCE.items():
    WEAPONS[k]["airOrdnance"] = v

weapons = {"id": "atlantic-air-1941", "notes": "大西洋・北海 1940〜41年の航空機の武器。1機あたり。数値は仮置き(tools/packs/build_atlantic_air_1941.py)。", "weapons": WEAPONS}


def air(name, role, n, hp, weapons_, speed, radius, nation, vision=None):
    a = {"role": role, "speedMpm": speed, "radiusM": radius}
    if vision:
        a["visionM"] = vision
    return {
        "name": name, "branch": "air_group", "armorRatio": 0, "frontageM": 0,
        "supply": {"ammoCapacityT": 1, "fuelCapacityT": 0, "fuelPerKmT": 0}, "air": a,
        "elements": [{"name": "機", "count": n, "hitPoints": hp, "weapons": [{"weapon": x, "count": 1} for x in weapons_]}],
        "symbol": {"echelon": "company", "modifiers": []},
        "nation": nation,
    }


# 機種:名前・役割・1機の耐久・武器・巡航の速さ(m/分)・行動半径(m)・国
KINDS = {
    "ju87": ("Ju 87 急降下爆撃機隊", "strike", 2.5, ["at_ju87_bomb", "at_gunner_mg"], 4500, 300000, "de"),
    "he111": ("He 111 爆撃機隊", "strike", 4, ["at_he111_bombs", "at_gunner_mg"], 5300, 900000, "de"),
    "ju88": ("Ju 88 爆撃機隊", "strike", 3.5, ["at_ju88_bombs", "at_gunner_mg"], 6000, 900000, "de"),
    "bf109": ("Bf 109 戦闘機隊", "fighter", 2, ["at_bf109_guns"], 6000, 250000, "de"),
    "bf110": ("Bf 110 駆逐機隊", "fighter", 2.6, ["at_bf110_guns"], 5500, 500000, "de"),
    "skua": ("スクア艦上爆撃機隊", "strike", 2.5, ["at_skua_bomb", "at_skua_guns"], 4000, 300000, "uk"),
    "swordfish": ("ソードフィッシュ雷撃機隊(複葉)", "strike", 2, ["at_swordfish_torpedo"], 2600, 300000, "uk"),
    "gladiator": ("グラディエーター戦闘機隊(複葉)", "fighter", 1.8, ["at_gladiator_guns"], 4500, 250000, "uk"),
    "hurricane": ("ハリケーン戦闘機隊", "fighter", 2.2, ["at_hurricane_guns"], 5500, 300000, "uk"),
    "blenheim": ("ブレニム爆撃機隊", "strike", 3, ["at_blenheim_bombs", "at_gunner_mg"], 4800, 700000, "uk"),
}
# 1つの航空隊の機数(中隊・飛行隊の規模の目安)
SIZES = {"ju87": [9, 12], "he111": [9, 12], "ju88": [9, 12], "bf109": [9, 12], "bf110": [9, 12], "skua": [9, 12], "swordfish": [6, 9, 12], "gladiator": [6, 9, 12], "hurricane": [9, 12], "blenheim": [9, 12]}

TOES = {}
for kind, ns in SIZES.items():
    name, role, hp, ws, speed, radius, nation = KINDS[kind]
    for n in ns:
        TOES[f"at-{kind}-{n}"] = air(f"{name}({n}機)", role, n, hp, ws, speed, radius, nation)
# 索敵機:ドイツは Fw 200・He 111 の長距離偵察、英はサンダーランド・ハドソンの哨戒(3機ずつ)
TOES["at-de-scout"] = air("ドイツの長距離偵察機(Fw 200・He 111。3機)", "scout", 3, 4, ["at_gunner_mg"], 5000, 1200000, "de", vision=60000)
TOES["at-uk-scout"] = air("英の哨戒機(サンダーランド・ハドソン。3機)", "scout", 3, 4, ["at_gunner_mg"], 4000, 1000000, "uk", vision=60000)

toe = {"id": "atlantic-air-1941", "notes": "大西洋・北海 1940〜41年の航空隊(ID は at-機種-機数)。数値は仮置き(tools/packs/build_atlantic_air_1941.py)。", "toes": TOES}
(ROOT / "data/weapons/atlantic-air-1941.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/atlantic-air-1941.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/atlantic-air-1941.json, data/toe/atlantic-air-1941.json")
