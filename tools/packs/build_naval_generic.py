#!/usr/bin/env python3
"""
史実ではない汎用の艦艇・航空隊の武器と編成(海戦の手触り確認用)を作る。

    python3 tools/packs/build_naval_generic.py

出力: data/weapons/naval-generic.json・data/toe/naval-generic.json

数値はすべてゲームの設計による仮置き(1隻・1機・1門あたり)。艦は1隻ずつのユニット(編成表の ship)で、戦隊はシナリオの上級部隊で組む。合わせ方:
- 重巡2・駆逐4の戦隊どうしが 15km で撃ち合うと、1時間で戦力の1割ほどを失う(士気はその12倍の速さで減るので、40分ほどで崩れて離脱する)
- 艦爆18機の攻撃10分で、空母の戦隊は戦力の3割ほどを失う(甲板が使えなくなる手前)
- 魚雷は 8km 以内で強いが、戦隊ごとに6分しか撃てない
TODO(要裏取り):艦砲の威力・射程と命中率は Campbell『Naval Weapons of World War Two』、空襲の命中率は Lundstrom『The First Team』
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, soft=1.0, armored=1.0, aa=0.0, ammo=0.0005, suppression=0.5, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": armored}, "indirect": False, "ammoPerMin": ammo, "suppression": suppression, "antiAir": aa}
    d.update(extra)
    return d


WEAPONS = {
    "naval_14in": w("戦艦の主砲(1隻分)", [(10000, 450), (20000, 400), (30000, 250)], armored=1.0, ammo=0.002),
    "naval_8in": w("重巡の主砲(1隻分)", [(10000, 200), (20000, 160), (25000, 80)], armored=0.7, ammo=0.001),
    "naval_5in": w("駆逐艦・副砲の砲(1隻分)", [(6000, 35), (12000, 25), (16000, 10)], armored=0.25, ammo=0.0004),
    "naval_aa": w("艦の対空機銃(1隻分)", [(2000, 0.5)], armored=0.05, aa=2.0, ammo=0.0001),
    "ship_torpedo": w("魚雷(1隻分)", [(4000, 700), (8000, 500)], armored=1.0, ammo=0.002, torpedo=True),
    "aircraft_mg": w("戦闘機の機銃(1機分)", [(500, 0.5)], armored=0.05, aa=3.0, ammo=0),
    "gunner_mg": w("攻撃機の旋回機銃(1機分)", [(500, 0.1)], armored=0.02, aa=0.6, ammo=0),
    "aircraft_bomb": w("急降下爆撃の爆弾(1機分)", [(500, 150)], soft=1.0, armored=0.8, aa=0.6, ammo=0),
    "aerial_torpedo": w("航空魚雷(1機分)", [(500, 180)], armored=1.0, aa=0.6, ammo=0, torpedo=True),
    # 1門・1射線あたり(1隻ずつの艦の砲・発射管の群れ ship.batteries に使う)。1隻分の値を、片舷に向く門数で割って合わせた
    "gun_14in": w("36cm 級の主砲(1門)", [(10000, 50), (20000, 44), (30000, 28)], armored=1.0, ammo=0.0002),
    "gun_8in": w("20cm 級の主砲(1門)", [(10000, 22), (20000, 18), (25000, 9)], armored=0.7, ammo=0.0001),
    "gun_6in": w("15cm 級の主砲(1門)", [(8000, 13), (16000, 9), (20000, 4)], armored=0.4, ammo=0.00008),
    "gun_5in": w("12.7cm 級の砲(1門)", [(6000, 7), (12000, 5), (16000, 2)], armored=0.25, ammo=0.00008),
    "torpedo_tube": w("魚雷発射管(1射線)", [(4000, 90), (8000, 60)], armored=1.0, ammo=0.00025, torpedo=True),
}

def gun(rof, kg, belt, deck):
    """砲戦の諸元(1隻ずつの艦どうし):1分の発射の数・弾の重さ・距離(km)ごとの舷側と甲板を抜ける厚さ(mm)。汎用なので仮置き"""
    return {"rofPerMin": rof, "shellKg": kg, "beltPenetration": [{"rangeM": int(r * 1000), "mm": mm} for r, mm in belt], "deckPenetration": [{"rangeM": int(r * 1000), "mm": mm} for r, mm in deck]}


WEAPONS["gun_14in"]["naval"] = gun(1.5, 635, [(5, 480), (10, 390), (15, 310), (20, 245), (25, 195), (30, 155)], [(5, 30), (10, 40), (15, 55), (20, 75), (25, 100), (30, 130)])
WEAPONS["gun_8in"]["naval"] = gun(2.0, 120, [(5, 260), (10, 190), (15, 135), (20, 100), (25, 75)], [(5, 15), (10, 25), (15, 38), (20, 55), (25, 75)])
WEAPONS["gun_6in"]["naval"] = gun(5.0, 50, [(5, 150), (10, 100), (15, 70), (20, 50)], [(5, 9), (10, 18), (15, 30), (20, 45)])
WEAPONS["gun_5in"]["naval"] = gun(5.0, 25, [(5, 75), (10, 45), (15, 28)], [(5, 5), (10, 10), (15, 17)])

weapons = {"id": "naval-generic", "notes": "史実ではない汎用の艦艇・航空隊の武器。1隻・1機あたり。数値は仮置き(tools/packs/build_naval_generic.py)。", "weapons": WEAPONS}


def ship(name, count, hp, guns):
    return {"name": name, "count": count, "hitPoints": hp, "weapons": [{"weapon": g, "count": 1} for g in guns]}


DD = ship("駆逐艦", 4, 150, ["naval_5in", "naval_aa", "ship_torpedo"])
SUPPLY = {"ammoCapacityT": 50, "fuelCapacityT": 400, "fuelPerKmT": 0.3}


def squadron(name, elements, armor, speed, carrier=False, frontage=0, **extra):
    t = {"name": name, "branch": "naval", "armorRatio": armor, "frontageM": frontage, "naval": True, "speedMpm": speed, "supply": SUPPLY, "elements": elements, "symbol": {"echelon": "regiment", "modifiers": []}}
    if carrier:
        t["carrier"] = True
    t.update(extra)
    return t


def airgroup(name, role, n, hp, weapon_list, speed, radius, vision=None):
    a = {"role": role, "speedMpm": speed, "radiusM": radius}
    if vision:
        a["visionM"] = vision
    return {
        "name": name,
        "branch": "air_group",
        "armorRatio": 0,
        "frontageM": 0,
        "supply": {"ammoCapacityT": 1, "fuelCapacityT": 0, "fuelPerKmT": 0},
        "air": a,
        "elements": [{"name": "機", "count": n, "hitPoints": hp, "weapons": [{"weapon": x, "count": 1} for x in weapon_list]}],
        "symbol": {"echelon": "company", "modifiers": []},
    }


def battery(weapon, guns, bow, beam, stern):
    return {"weapon": weapon, "guns": guns, "bow": bow, "beam": beam, "stern": stern}


def one_ship(name, type_, hp, speed_kn, batteries, aa=2, belt=0, deck=0, turret=0, displacement=None, carrier=False):
    """1隻の艦(艦級)。要素の武器は、群れの門数(片舷の最大)と対空。speed_kn はノット(1ノット ≒ 30.87m/分)"""
    weapons = [{"weapon": b["weapon"], "count": b["guns"]} for b in batteries] + [{"weapon": "naval_aa", "count": 1} for _ in range(aa)]
    t = {
        "name": name,
        "branch": "naval",
        "armorRatio": 0.6 if belt >= 100 else 0.3 if belt > 0 else 0.1,
        "frontageM": 0,
        "naval": True,
        "speedMpm": round(speed_kn * 30.87),
        "supply": SUPPLY,
        "elements": [{"name": name, "count": 1, "hitPoints": hp, "weapons": weapons}],
        "ship": {"type": type_, "beltMm": belt, "deckMm": deck, "turretMm": turret, "batteries": batteries},
        "symbol": {"modifiers": []},
    }
    if displacement:
        t["ship"]["displacementT"] = displacement
    if carrier:
        t["carrier"] = True
    return t


# 1隻ずつの汎用の艦級(史実ではない。数値は仮置き)。耐久は旧い戦隊の1隻分と同じ
SHIPS = {
    "gen_bb": one_ship("戦艦(汎用)", "battleship", 1500, 25, [battery("gun_14in", 9, 6, 9, 3), battery("gun_5in", 16, 4, 8, 4)], aa=3, belt=330, deck=130, turret=400, displacement=35000),
    "gen_ca": one_ship("重巡洋艦(汎用)", "heavy_cruiser", 600, 33, [battery("gun_8in", 9, 6, 9, 3), battery("gun_5in", 8, 2, 4, 2)], aa=2, belt=100, deck=50, turret=75, displacement=10000),
    "gen_cl": one_ship("軽巡洋艦(汎用)", "light_cruiser", 400, 32.5, [battery("gun_6in", 12, 6, 12, 6), battery("gun_5in", 8, 2, 4, 2)], aa=2, belt=100, deck=50, turret=50, displacement=9000),
    "gen_dd": one_ship("駆逐艦(汎用)", "destroyer", 150, 35, [battery("gun_5in", 5, 2, 5, 3), battery("torpedo_tube", 8, 0, 8, 0)], aa=1, displacement=1600),
    "gen_cv": one_ship("空母(汎用)", "carrier", 800, 33, [battery("gun_5in", 8, 2, 4, 2)], aa=4, belt=100, deck=40, displacement=20000, carrier=True),
}

TOES = {
    **SHIPS,
    # 30ノット ≒ 926m/分、25ノット ≒ 772m/分
    "air_fighter_group": airgroup("戦闘機隊(18機)", "fighter", 18, 2, ["aircraft_mg"], 4500, 300000),
    "air_dive_bomber_group": airgroup("艦上爆撃機隊(18機)", "strike", 18, 2.5, ["aircraft_bomb", "gunner_mg"], 4000, 250000),
    "air_torpedo_group": airgroup("艦上攻撃機隊(15機)", "strike", 15, 3, ["aerial_torpedo", "gunner_mg"], 3500, 220000),
    "air_scout_group": airgroup("索敵機隊(6機)", "scout", 6, 2, ["gunner_mg"], 3000, 400000, vision=40000),
}
toe = {"id": "naval-generic", "notes": "史実ではない汎用の艦艇の戦隊・航空隊。数値は仮置き(tools/packs/build_naval_generic.py)。", "toes": TOES}

(ROOT / "data/weapons/naval-generic.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/naval-generic.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/naval-generic.json, data/toe/naval-generic.json")
