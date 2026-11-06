#!/usr/bin/env python3
"""
左右対称の海戦の試験シナリオ(AI のバランス検出・海戦の手触り確認用。史実ではない)を作る。

    python3 tools/scenarios/build_test_naval.py

出力: data/scenarios/test-naval.json

1000m セルで 160km × 100km の海。西軍と東軍が、空母の戦隊(空母1・駆逐4。戦闘機・艦爆・艦攻・索敵機の4隊を載せる)と巡洋艦の戦隊(重巡2・駆逐4)を
1つずつ持ち(艦は1隻ずつのユニット、戦隊は上級部隊)、140km 離れて向かい合う。座標はセルの中心に置き、x=80000 を軸に鏡写し。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/test-naval.json"
W, H, CELL = 160, 100, 1000
MID = W * CELL / 2


def mirror(x):
    return W * CELL - x


def side_units(side, sign, facing):
    """空母の戦隊(空母1・駆逐4。輪形陣)と巡洋艦の戦隊(重巡2・駆逐4。単縦陣)を1隻ずつ。航空隊は空母に載せる"""
    x = lambda v: v if sign > 0 else mirror(v)
    cv = f"{side}-cv"
    ships = [{"id": cv, "side": side, "toe": "gen_cv", "x": x(10500), "y": 50500, "facing": facing, "navalFormation": "ring"}]
    for i in range(4):
        ships.append({"id": f"{side}-dd{i + 1}", "side": side, "toe": "gen_dd", "x": x(10500), "y": 52500 + i * 500, "facing": facing, "navalFormation": "ring"})
    for i in range(2):
        ships.append({"id": f"{side}-ca{i + 1}", "side": side, "toe": "gen_ca", "x": x(20500 - i * 600), "y": 50500, "facing": facing})
    for i in range(4):
        ships.append({"id": f"{side}-dd{i + 5}", "side": side, "toe": "gen_dd", "x": x(19300 - i * 600), "y": 50500, "facing": facing})
    air = [
        {"id": f"{side}-{g}", "side": side, "toe": toe, "x": x(10500), "y": 50500, "facing": facing, "air": {"baseId": cv}}
        for g, toe in [("vf", "air_fighter_group"), ("vb", "air_dive_bomber_group"), ("vt", "air_torpedo_group"), ("vs", "air_scout_group")]
    ]
    return ships + air


def side_formations(side, name):
    return {
        f"{side}-tf": {"name": f"{name}の機動部隊", "side": side, "units": [f"{side}-{g}" for g in ["vf", "vb", "vt", "vs"]]},
        f"{side}-cvg": {"name": f"{name}の空母の戦隊", "side": side, "parent": f"{side}-tf", "units": [f"{side}-cv"] + [f"{side}-dd{i}" for i in range(1, 5)]},
        f"{side}-crudiv": {"name": f"{name}の巡洋艦の戦隊", "side": side, "parent": f"{side}-tf", "units": [f"{side}-ca1", f"{side}-ca2"] + [f"{side}-dd{i}" for i in range(5, 9)]},
    }


units = side_units("w", 1, 90) + side_units("e", -1, 270)
scenario = {
    "id": "test-naval",
    # 左右対称の試験なので、架空の指揮官(特性の違い)は付けない
    "autoCommanders": False,
    "name": "海戦の試験(左右対称)",
    "description": "空母の戦隊と巡洋艦の戦隊どうしの、左右対称の海戦。索敵機で敵を見つけ、艦爆・艦攻で叩き、戦闘機で守る。史実ではない。",
    "notes": "1000m セル × 160 × 100(160km × 100km)。x=80000 を軸に鏡写し。艦艇は1隻ずつの汎用の艦級、航空隊は汎用(data/toe/naval-generic.json)。作り直しは tools/scenarios/build_test_naval.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic"], "toe": ["ww1-korea-generic", "naval-generic"]},
    "sides": [{"id": "w", "name": "西軍"}, {"id": "e", "name": "東軍"}],
    "time": {"turnSeconds": 3600, "stepSeconds": 60, "startHour": 6},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea"}, "rows": ["~" * W for _ in range(H)]},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 12,
        "objectives": [],
        "victory": {
            s: {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.35}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.15}}
            for s in ["w", "e"]
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5},
        "air": {},
        "reinforcements": [],
    },
    "units": units,
    "depots": [],
    "formations": {**side_formations("w", "西軍"), **side_formations("e", "東軍")},
}
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
