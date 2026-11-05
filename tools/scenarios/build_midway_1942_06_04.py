#!/usr/bin/env python3
"""
ミッドウェー海戦 1942年6月4日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_midway_1942_06_04.py

出力: data/scenarios/midway-1942-06-04.json

南雲の第一航空艦隊(空母4)が、夜明けにミッドウェー島の北西 250マイルから島へ第一次攻撃隊を出す。
米の第16・第17任務部隊(空母3)は北東から、島の哨戒機の報告を待って攻撃隊を出す。空母どうしは互いを先に見つけた方が有利。
5km のセルで 600km × 500km の海。位置・機数の根拠と残りの裏取りは docs/research/midway-1942-06.md。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/midway-1942-06-04.json"
CELL = 5000
COLS, ROWS = 120, 100


def snap(x, y):
    return (math.floor(x / CELL) * CELL + CELL // 2, math.floor(y / CELL) * CELL + CELL // 2)


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return snap(base[0] + math.sin(r) * dist_m, base[1] + math.cos(r) * dist_m)


# ミッドウェー島(環礁は1セルの陸で表す)
MIDWAY = snap(300000, 100000)
# 夜明けの機動部隊:島の北西(方位320°)250マイル ≒ 400km(資料による。方位は TODO(要裏取り))
KB = polar(MIDWAY, 320, 400000)
# 米の空母部隊:島の北東。第一次攻撃隊を出した 07:00 ごろ、機動部隊から 175〜200マイル(仮置き。TODO(要裏取り):TF16 の航跡図)
TF16 = polar(MIDWAY, 20, 270000)
TF17 = polar(TF16, 330, 20000)

rows = [["~"] * COLS for _ in range(ROWS)]
mc, mr = MIDWAY[0] // CELL, MIDWAY[1] // CELL
rows[ROWS - 1 - mr][mc] = "."


def u(uid, side, toe, p, facing, **extra):
    d = {"id": uid, "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing}
    d.update(extra)
    return d


units = [
    # 第一航空艦隊。第1航空戦隊(赤城・加賀)・第2航空戦隊(飛龍・蒼龍)・支援部隊(第3戦隊・第8戦隊)
    u("jp-cd1", "jp", "mw-jp-cardiv", KB, 135, navalFormation="ring", training="elite"),
    u("jp-cd2", "jp", "mw-jp-cardiv", polar(KB, 90, 10000), 135, navalFormation="ring", training="elite"),
    u("jp-bd", "jp", "mw-jp-batdiv", polar(KB, 135, 15000), 135, training="veteran"),
    # 第1航空戦隊の航空隊:艦攻は魚雷を積んで艦艇に備える。第2航空戦隊の艦攻は陸用爆弾(島への攻撃)
    u("jp-cd1-a6m", "jp", "mw-jp-a6m", KB, 135, air={"baseId": "jp-cd1"}, training="elite"),
    u("jp-cd1-d3a", "jp", "mw-jp-d3a", KB, 135, air={"baseId": "jp-cd1"}, training="elite"),
    u("jp-cd1-b5n", "jp", "mw-jp-b5n", KB, 135, air={"baseId": "jp-cd1"}, training="elite"),
    u("jp-cd2-a6m", "jp", "mw-jp-a6m", polar(KB, 90, 10000), 135, air={"baseId": "jp-cd2"}, training="elite"),
    u("jp-cd2-d3a", "jp", "mw-jp-d3a", polar(KB, 90, 10000), 135, air={"baseId": "jp-cd2"}, training="elite"),
    u("jp-cd2-b5n", "jp", "mw-jp-b5n-land", polar(KB, 90, 10000), 135, air={"baseId": "jp-cd2"}, training="elite"),
    # 利根・筑摩などの水上偵察機(母艦の決まりがあるので、第2航空戦隊を基地にした。TODO:巡洋艦から出す)
    *[u(f"jp-scout{i}", "jp", "mw-jp-scout", polar(KB, 90, 10000), 135, air={"baseId": "jp-cd2"}) for i in (1, 2, 3)],
    # 米:第16任務部隊(エンタープライズ・ホーネット)・第17任務部隊(ヨークタウン)と巡洋艦
    u("us-tf16", "us", "mw-us-tf16-cv", TF16, 225, navalFormation="ring"),
    u("us-tf16-cru", "us", "mw-us-cruisers", polar(TF16, 225, 10000), 225),
    u("us-tf17", "us", "mw-us-tf17-cv", TF17, 225, navalFormation="ring", training="veteran"),
    u("us-tf17-cru", "us", "mw-us-cruisers", polar(TF17, 225, 10000), 225, training="veteran"),
    u("us-tf16-f4f", "us", "mw-us-f4f-tf16", TF16, 225, air={"baseId": "us-tf16"}),
    u("us-tf16-sbd", "us", "mw-us-sbd-tf16", TF16, 225, air={"baseId": "us-tf16"}),
    u("us-tf16-tbd", "us", "mw-us-tbd-tf16", TF16, 225, air={"baseId": "us-tf16"}),
    u("us-tf17-f4f", "us", "mw-us-f4f-tf17", TF17, 225, air={"baseId": "us-tf17"}, training="veteran"),
    u("us-tf17-sbd", "us", "mw-us-sbd-tf17", TF17, 225, air={"baseId": "us-tf17"}, training="veteran"),
    u("us-tf17-tbd", "us", "mw-us-tbd-tf17", TF17, 225, air={"baseId": "us-tf17"}, training="veteran"),
    # ミッドウェー島:守備隊(第6防衛大隊と増援の海兵 約3000名を、汎用の歩兵連隊と対空砲大隊で代えた。掩体に入っている)と、島の航空隊
    u("us-6def-aa", "us", "aa_battalion", MIDWAY, 315, entrenchment=3, formation="deployed", stance="defense"),
    u("us-6def", "us", "infantry_regiment", MIDWAY, 315, entrenchment=3, formation="deployed", stance="defense"),
    u("us-vmf221", "us", "mw-us-vmf221", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}, training="green"),
    u("us-vmsb241", "us", "mw-us-vmsb241", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}, training="green"),
    u("us-b17", "us", "mw-us-b17", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}),
    *[u(f"us-pby{i}", "us", "mw-us-pby", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}) for i in (1, 2, 3)],
]
names = {
    "jp-cd1": "第1航空戦隊(赤城・加賀)", "jp-cd2": "第2航空戦隊(飛龍・蒼龍)", "jp-bd": "支援部隊(第3戦隊・第8戦隊)",
    "jp-cd1-a6m": "第1航空戦隊 零戦隊", "jp-cd1-d3a": "第1航空戦隊 艦爆隊", "jp-cd1-b5n": "第1航空戦隊 艦攻隊(雷装)",
    "jp-cd2-a6m": "第2航空戦隊 零戦隊", "jp-cd2-d3a": "第2航空戦隊 艦爆隊", "jp-cd2-b5n": "第2航空戦隊 艦攻隊(陸用爆弾)", "jp-scout1": "水上偵察機 1", "jp-scout2": "水上偵察機 2", "jp-scout3": "水上偵察機 3",
    "us-tf16": "第16任務部隊(エンタープライズ・ホーネット)", "us-tf16-cru": "第16任務部隊 巡洋艦", "us-tf17": "第17任務部隊(ヨークタウン)", "us-tf17-cru": "第17任務部隊 巡洋艦",
    "us-tf16-f4f": "第16任務部隊 戦闘機隊", "us-tf16-sbd": "第16任務部隊 爆撃・偵察隊", "us-tf16-tbd": "第16任務部隊 雷撃隊",
    "us-tf17-f4f": "VF-3", "us-tf17-sbd": "VB-3・VS-5", "us-tf17-tbd": "VT-3",
    "us-6def-aa": "第6防衛大隊 対空砲", "us-6def": "第6防衛大隊", "us-vmf221": "VMF-221", "us-vmsb241": "VMSB-241", "us-b17": "B-17", "us-pby1": "PBY 哨戒機 1", "us-pby2": "PBY 哨戒機 2", "us-pby3": "PBY 哨戒機 3",
}
for x in units:
    if x["id"] in names:
        x["name"] = names[x["id"]]

scenario = {
    "id": "midway-1942-06-04",
    "name": "ミッドウェー海戦 1942年6月4日(v0・概略図)",
    "description": "夜明け、南雲の空母4隻がミッドウェー島へ攻撃隊を出す。北東には米の空母3隻が潜んでいる。索敵機で先に敵の空母を見つけ、艦爆・艦攻を送り込み、戦闘機で守れ。",
    "notes": "v0。5km のセル(600km × 500km)。位置は資料の距離・方位からの概略、機数は検索結果の要約から(第16任務部隊は2隻分の仮置き)。機種の強さ・行動半径は仮置き。兵装の転換(雷装と陸用爆弾の積み替え)は表さない。根拠は docs/research/midway-1942-06.md。作り直しは tools/scenarios/build_midway_1942_06_04.py・tools/packs/build_midway_1942.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "midway-1942"], "toe": ["ww1-korea-generic", "naval-generic", "midway-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "us", "name": "アメリカ軍"}],
    "time": {"turnSeconds": 3600, "stepSeconds": 60, "startHour": 4.5, "startDate": "1942-06-04"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": ["".join(r) for r in rows]},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 14,
        "objectives": [{"id": "midway", "name": "ミッドウェー島", "x": MIDWAY[0], "y": MIDWAY[1], "radiusM": 6000, "weight": 1, "initialHolder": "us"}],
        "victory": {
            # 日本軍:米の空母部隊を叩く(損耗 8% で限定的、20% で決定的)。米軍は島を保ち、日本軍に 40%・55% の損耗(ゲームの設計。
            # 米の空母は隠れていて先に見つけにくく、AI 同士で同じ物差しにすると米が全勝した。米の急降下爆撃は史実どおり強いので、物差しの方を開いた)
            "jp": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.2}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.08}},
            "us": {"decisive": {"required": ["midway"], "minWeight": 0, "minEnemyLoss": 0.55}, "limited": {"required": ["midway"], "minWeight": 0, "minEnemyLoss": 0.4}},
        },
        "commandPoints": {},
        # 天候は晴れのまま(このルールパックの曇りは航空を止めるが、6月4日の海上は飛べる天候だった。雲の多さは表さない)
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
        # 島の守備隊は海に囲まれているが、投降しない(包囲と投降は陸の決まり)
        "noSurrender": ["us"],
        # 島の守備隊の位置は日本軍も知っている(動かない島)
        "knownAtStart": [{"side": "jp", "unitId": "us-6def"}, {"side": "jp", "unitId": "us-6def-aa"}],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-kb": {"name": "第一航空艦隊(南雲)", "side": "jp", "units": [x["id"] for x in units if x["side"] == "jp"]},
        "us-tf16f": {"name": "第16任務部隊(スプルーアンス)", "side": "us", "units": [x["id"] for x in units if x["id"].startswith("us-tf16")]},
        "us-tf17f": {"name": "第17任務部隊(フレッチャー)", "side": "us", "units": [x["id"] for x in units if x["id"].startswith("us-tf17")]},
        "us-midway": {"name": "ミッドウェー島", "side": "us", "units": ["us-6def-aa", "us-6def", "us-vmf221", "us-vmsb241", "us-b17", "us-pby1", "us-pby2", "us-pby3"]},
    },
    "historicalOutcome": {
        "winner": "us",
        "level": "decisive",
        "summary": "米の急降下爆撃機が10時半ごろ赤城・加賀・蒼龍を、夕方に飛龍を撃破し、日本は空母4隻を失った。米は飛龍の反撃でヨークタウンを失った(7日に沈没)。",
    },
}
# 史実の指揮官(確かめた人だけ。tools/scenarios/historical_commanders.py)
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
