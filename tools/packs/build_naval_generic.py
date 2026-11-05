#!/usr/bin/env python3
"""
史実ではない汎用の艦艇・航空隊の武器と編成(海戦の手触り確認用)を作る。

    python3 tools/packs/build_naval_generic.py

出力: data/weapons/naval-generic.json・data/toe/naval-generic.json

数値はすべてゲームの設計による仮置き(1隻・1機あたり)。合わせ方:
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
}

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


TOES = {
    # 30ノット ≒ 926m/分、25ノット ≒ 772m/分
    "naval_carrier_group": squadron("空母の戦隊(空母1・駆逐4)", [ship("空母", 1, 800, ["naval_5in", "naval_aa", "naval_aa", "naval_aa"]), DD], 0.3, 926, carrier=True),
    "naval_cruiser_squadron": squadron("巡洋艦の戦隊(重巡2・駆逐4)", [ship("重巡洋艦", 2, 600, ["naval_8in", "naval_5in", "naval_aa", "naval_aa"]), DD], 0.5, 926),
    "naval_battle_squadron": squadron("戦艦の戦隊(戦艦2・駆逐4)", [ship("戦艦", 2, 1500, ["naval_14in", "naval_5in", "naval_aa", "naval_aa", "naval_aa"]), DD], 0.7, 772),
    "air_fighter_group": airgroup("戦闘機隊(18機)", "fighter", 18, 2, ["aircraft_mg"], 4500, 300000),
    "air_dive_bomber_group": airgroup("艦上爆撃機隊(18機)", "strike", 18, 2.5, ["aircraft_bomb", "gunner_mg"], 4000, 250000),
    "air_torpedo_group": airgroup("艦上攻撃機隊(15機)", "strike", 15, 3, ["aerial_torpedo", "gunner_mg"], 3500, 220000),
    "air_scout_group": airgroup("索敵機隊(6機)", "scout", 6, 2, ["gunner_mg"], 3000, 400000, vision=40000),
}
toe = {"id": "naval-generic", "notes": "史実ではない汎用の艦艇の戦隊・航空隊。数値は仮置き(tools/packs/build_naval_generic.py)。", "toes": TOES}

(ROOT / "data/weapons/naval-generic.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/naval-generic.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/naval-generic.json, data/toe/naval-generic.json")
