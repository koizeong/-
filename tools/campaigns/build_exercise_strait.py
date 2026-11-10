#!/usr/bin/env python3
"""
演習のキャンペーン「海峡をはさむ押し合い」(架空)を作る。陸・空・海の3つの層を一度に試すためのもの。

    python3 tools/campaigns/build_exercise_strait.py

出力: data/campaigns/exercise-strait.json

北の陸の帯(西=青、東=赤)の南に3つの海域が並ぶ。両陣営の前線の港(港の補給の源)は、それぞれの近くの海域を
敵に押さえられると働かず、海を渡って来る増援(第3師団)もその海域を通る。航空基地は両陣営の後方の鉄道終点にあり、
戦闘機の航空団と攻撃の航空団を1つずつ置く。艦隊は1隻ずつの艦で、空母戦隊(空母1・駆逐2)と巡洋艦戦隊(重巡2・駆逐2)に、艦上の戦闘機隊・艦爆隊・索敵機隊。
x=40 を軸に左右の鏡写し。地域の配置・兵力・勝利点・航続距離はどれも仮置き。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/exercise-strait.json"

SIDES = {"blue": "青軍", "red": "赤軍"}


def mx(x):
    return 80 - x


# 青の側の地域(赤の側は鏡写し)。名前・x・y・地形の傾向・ほか
HALF = {
    "base": ("鉄道終点", 0, 34, "western-farmland", {"supply": True, "airbase": True}),
    "town": ("町", 20, 42, "western-farmland", {}),
    "port": ("港", 26, 20, "western-farmland", {"supply": True, "via": "sea"}),
    "sea": ("近海", 24, 4, "western-farmland", {"sea": True}),
}
regions = {}
for side, sign in [("blue", 1), ("red", -1)]:
    for key, (name, x, y, biome, extra) in HALF.items():
        rid = f"{side}-{key}"
        r = {"name": f"{SIDES[side][:1]}の{name}", "x": x if sign > 0 else mx(x), "y": y, "biome": biome}
        if extra.get("supply"):
            r["supply"] = side
        if extra.get("airbase"):
            r["airbase"] = True
        if extra.get("via"):
            r["supplyVia"] = f"{side}-sea"
        if extra.get("sea"):
            r["sea"] = True
        regions[rid] = r
regions["crossing"] = {"name": "渡河点", "x": 40, "y": 42, "biome": "western-farmland"}
regions["cape"] = {"name": "岬", "x": 40, "y": 22, "biome": "steppe"}
regions["mid-sea"] = {"name": "海峡", "x": 40, "y": 2, "biome": "western-farmland", "sea": True}

links = []
for s in ["blue", "red"]:
    links += [
        {"a": f"{s}-base", "b": f"{s}-town", "kind": "rail"},
        {"a": f"{s}-base", "b": f"{s}-port"},
        {"a": f"{s}-town", "b": "crossing"},
        {"a": f"{s}-town", "b": f"{s}-port", "kind": "track"},
        {"a": f"{s}-port", "b": "cape", "kind": "track"},
        {"a": f"{s}-port", "b": f"{s}-sea", "kind": "sea"},
        {"a": f"{s}-sea", "b": "mid-sea", "kind": "sea"},
    ]
links += [{"a": "crossing", "b": "cape", "kind": "track"}, {"a": "cape", "b": "mid-sea", "kind": "sea"}]

control = {}
for s in ["blue", "red"]:
    for k in ["base", "town", "port", "sea"]:
        control[f"{s}-{k}"] = s


def land(side, key, name, region, units, arrive=None):
    f = {"id": f"{side}-{key}", "side": side, "name": name, "region": region, "units": [{"id": f"{side}-{key}-{u}", "toe": t} for u, t in units]}
    if arrive:
        f["arriveStage"] = arrive
        f["via"] = f"{side}-sea"
    return f


formations = []
for s in ["blue", "red"]:
    formations += [
        land(s, "1div", "第1歩兵師団", f"{s}-town", [("inf1", "infantry_regiment"), ("inf2", "infantry_regiment"), ("art", "artillery_battalion")]),
        land(s, "armd", "第1機甲旅団", f"{s}-port", [("tf1", "armored_task_force"), ("tf2", "armored_task_force"), ("rec", "recon_squadron")]),
        land(s, "3div", "第3歩兵師団", f"{s}-port", [("inf1", "infantry_regiment"), ("inf2", "infantry_regiment")], arrive=3),
        {
            "id": f"{s}-fleet",
            "side": s,
            "name": "第1艦隊",
            "region": f"{s}-sea",
            "units": [
                {"id": f"{s}-fleet-cv", "toe": "gen_cv", "squadron": "空母戦隊"},
                {"id": f"{s}-fleet-dd1", "toe": "gen_dd", "squadron": "空母戦隊"},
                {"id": f"{s}-fleet-dd2", "toe": "gen_dd", "squadron": "空母戦隊"},
                {"id": f"{s}-fleet-ca1", "toe": "gen_ca", "squadron": "巡洋艦戦隊"},
                {"id": f"{s}-fleet-ca2", "toe": "gen_ca", "squadron": "巡洋艦戦隊"},
                {"id": f"{s}-fleet-dd3", "toe": "gen_dd", "squadron": "巡洋艦戦隊"},
                {"id": f"{s}-fleet-dd4", "toe": "gen_dd", "squadron": "巡洋艦戦隊"},
                {"id": f"{s}-fleet-vf", "toe": "air_fighter_group", "base": f"{s}-fleet-cv"},
                {"id": f"{s}-fleet-vb", "toe": "air_dive_bomber_group", "base": f"{s}-fleet-cv"},
                {"id": f"{s}-fleet-vs", "toe": "air_scout_group", "base": f"{s}-fleet-cv"},
            ],
        },
    ]

air_wings = []
for s in ["blue", "red"]:
    air_wings += [
        {"id": f"{s}-fw", "side": s, "name": "第1戦闘航空団", "base": f"{s}-base", "rangeKm": 50, "fighters": 3, "strike": 0},
        {"id": f"{s}-sw", "side": s, "name": "第1攻撃航空団", "base": f"{s}-base", "rangeKm": 85, "fighters": 1, "strike": 3},
    ]


def victory(s, e):
    return {
        "conditions": [
            {"id": "crossing", "type": "region", "region": "crossing", "points": 2},
            {"id": "cape", "type": "region", "region": "cape", "points": 2},
            {"id": "mid-sea", "type": "region", "region": "mid-sea", "points": 1},
            {"id": "port", "type": "region", "region": f"{e}-port", "points": 3},
            {"id": "town", "type": "region", "region": f"{e}-town", "points": 3},
            {"id": "loss", "type": "lossRatio", "max": 1, "points": 2},
        ],
        "decisive": {"minPoints": 9},
        "limited": {"minPoints": 4},
    }


campaign = {
    "id": "exercise-strait",
    "name": "演習:海峡をはさむ押し合い",
    "description": "陸・空・海の演習(架空)。北の陸の帯で渡河点と岬を奪い合い、南の海で制海権を争う。前線の港は近海を敵に押さえられると補給の源として働かず、海を渡る増援も遅れる。航空団で敵の部隊・補給・航空基地を叩くか、戦闘に出す",
    "notes": "演習用の架空のキャンペーン。地域の配置・兵力・勝利点・航続距離はどれも仮置き。x=40 を軸に左右の鏡写し。作り直しは tools/campaigns/build_exercise_strait.py",
    "era": "generic",
    "sides": [{"id": "blue", "name": "青軍"}, {"id": "red", "name": "赤軍"}],
    "calendar": {"startDate": "1944-06-01", "daysPerStage": 2, "stages": 6},
    "regions": regions,
    "links": links,
    "control": control,
    "formations": formations,
    "airWings": air_wings,
    "naval": {"weapons": ["naval-generic"], "toe": ["naval-generic"]},
    # 陸の戦闘に出した航空団は、戦術の戦闘の航空司令部(docs/air-design.md)として渡す。編隊1つ=戦闘機4機・攻撃機8機(仮置き。
    # 戦闘機はルールパックの編隊の機数、攻撃機は前の仕組みの1回の出撃の機数に合わせた)。海戦は前の仕組みのまま
    "rules": {"air": {"airOps": {"aircraftPerGroup": {"fighter": 4, "strike": 8}, "fighterToe": "gen_air_fighter", "strikeToe": "gen_air_fighter_bomber"}}},
    "victory": {"blue": victory("blue", "red"), "red": victory("red", "blue")},
}
OUT.write_text(json.dumps(campaign, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
