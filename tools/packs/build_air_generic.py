#!/usr/bin/env python3
"""
史実ではない汎用の陸上機の武器と編成(空の作り直し docs/air-design.md の手触り確認用)を作る。

    python3 tools/packs/build_air_generic.py

出力: data/weapons/air-generic.json・data/toe/air-generic.json

編成表は1機あたり(要素の数1)。飛行隊の機数はシナリオの airForces に書き、飛ぶ編隊は 1機 × 機数 で数える。
役割(air.role)は戦闘機・戦闘爆撃機・急降下爆撃機・襲撃機・中型爆撃機・偵察機・輸送機。
数値はすべてゲームの設計による仮置き TODO(要裏取り):出典候補は各機種の諸元(巡航速度・行動半径・搭載量)、
米戦略爆撃調査団・英の作戦研究班の対地攻撃の効果の調査
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, soft=1.0, armored=1.0, aa=0.0, suppression=0.5, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": armored}, "indirect": False, "ammoPerMin": 0, "suppression": suppression, "antiAir": aa}
    d.update(extra)
    return d


WEAPONS = {
    "air_fighter_guns": w("戦闘機の機銃・機関砲(1機分)", [(500, 1.5)], soft=1.0, armored=0.05, aa=3.0, suppression=0.8),
    "air_rockets": w("対地ロケット(1機分)", [(500, 6)], soft=0.8, armored=0.7, suppression=0.9),
    "air_light_bombs": w("戦闘爆撃機の爆弾(1機分)", [(500, 8)], soft=1.0, armored=0.4, suppression=1.0),
    "air_dive_bombs": w("急降下爆撃の爆弾(1機分)", [(500, 12)], soft=1.0, armored=0.8, suppression=1.2),
    "air_attack_cannon": w("襲撃機の機関砲・小型爆弾(1機分)", [(500, 7)], soft=1.0, armored=0.6, suppression=1.0),
    "air_medium_bombs": w("中型爆撃機の爆弾(1機分)", [(800, 20)], soft=1.0, armored=0.3, suppression=1.5),
    "air_gunner": w("旋回機銃(1機分)", [(500, 0.1)], soft=1.0, armored=0.02, aa=0.6),
}


def toe(name, role, speed_kmh, radius_km, hp, weapons, vision_km=None):
    air = {"role": role, "speedMpm": round(speed_kmh * 1000 / 60), "radiusM": radius_km * 1000}
    if vision_km:
        air["visionM"] = vision_km * 1000
    return {
        "name": name,
        "branch": "air_group",
        "armorRatio": 0,
        "frontageM": 0,
        "supply": {"ammoCapacityT": 1, "fuelCapacityT": 0, "fuelPerKmT": 0},
        "air": air,
        "elements": [{"name": "機", "count": 1, "hitPoints": hp, "weapons": [{"weapon": k, "count": 1} for k in weapons]}],
        "symbol": {"echelon": "company", "modifiers": []},
    }


TOES = {
    "gen_air_fighter": toe("戦闘機(汎用)", "fighter", 450, 300, 2, ["air_fighter_guns"]),
    "gen_air_fighter_bomber": toe("戦闘爆撃機(汎用)", "fighterBomber", 420, 250, 2.5, ["air_fighter_guns", "air_light_bombs", "air_rockets"]),
    "gen_air_dive_bomber": toe("急降下爆撃機(汎用)", "diveBomber", 330, 250, 2.5, ["air_dive_bombs", "air_gunner"]),
    "gen_air_attack": toe("襲撃機(汎用)", "attack", 330, 200, 4, ["air_attack_cannon", "air_gunner"]),
    "gen_air_bomber": toe("中型爆撃機(汎用)", "bomber", 380, 500, 5, ["air_medium_bombs", "air_gunner"]),
    "gen_air_recon": toe("偵察機(汎用)", "recon", 450, 400, 2, [], vision_km=20),
    "gen_air_transport": toe("輸送機(汎用)", "transport", 280, 600, 4, []),
}

(ROOT / "data/weapons/air-generic.json").write_text(json.dumps({"id": "air-generic", "weapons": WEAPONS}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/air-generic.json").write_text(json.dumps({"id": "air-generic", "toes": TOES}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote data/weapons/air-generic.json, data/toe/air-generic.json")
