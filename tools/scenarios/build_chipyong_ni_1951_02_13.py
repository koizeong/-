#!/usr/bin/env python3
"""
チピョンニ(砥平里)の戦い 1951年2月13〜15日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_chipyong_ni_1951_02_13.py

出力: data/scenarios/chipyong-ni-1951-02-13.json

米第23連隊戦闘団(フランス大隊が配属)が、村のまわりに全周の陣地を作って、中国人民志願軍の数個師団の夜襲を2晩しのぐ。
15日の夕方に第5騎兵連隊のクロンベズ任務部隊が南から戦車で突き抜けてくる。
部隊は国ごとの実数の編成表(data/toe/us.json・korea-north.json)を使う。根拠と残りの裏取りは docs/research/chipyong-ni-1951-02.md。
"""

import json
import math
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import apply_names, Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/chipyong-ni-1951-02-13.json"

S = Sketch(origin=(37.475, 127.637), cols=48, rows=48)  # 12km × 12km
# 村(Wikipedia『Jipyeong-ri』)。周りの高地(248・345・397高地)・トンネル・道路の形は座標が確かめられず入れていない(TODO(要裏取り))
C = S.at(37.475, 127.637)
S.terrain("T", "town")
S.mark(C, "T", 1)

S.node("chipyong", C)
S.node("s_edge", S.snap((C[0], 0)))  # 南(ヨジュ・クロンベズ任務部隊の来た方向)
S.node("n_edge", S.snap((C[0], S.height)))
S.node("e_edge", S.snap((S.width, C[1])))
S.node("w_edge", S.snap((0, C[1])))
for e in ["s_edge", "n_edge", "e_edge", "w_edge"]:
    S.road("chipyong", e)

# 時間:13日17:00 から 15日18:00 まで1時間ごと。夜(18:00〜07:00)は暗い時間として解く(エドソンの丘と同じ)。
#   13日の夜 = ターン2〜14、14日の昼 = 15〜25、14日の夜 = 26〜38、15日の昼 = 39〜49
# TODO(要裏取り):日の出・日の入り(北緯37.5度の2月中旬)と当時の時刻帯
MAX_TURNS = 49
DARK = [L([("from", 2), ("to", 14)]), L([("from", 26), ("to", 38)])]


def ring(r, deg):
    a = math.radians(deg)
    return S.snap((C[0] + r * math.sin(a), C[1] + r * math.cos(a)))


# 米第23連隊戦闘団:大隊3+フランス大隊+連隊の直轄部隊(重迫撃砲・戦車中隊)+第37野砲大隊+第503野砲大隊B中隊(155mm)。
# 全周の陣地の半径800m・大隊の受け持ちの向きは**仮置き**(TODO(要裏取り):Gugeler『Combat Actions in Korea』、Hamburger『Leadership in the Crucible』)。
# 2月3日から陣地を作っていた(中:Wikipedia)→ 陣地レベル3。フランス大隊は米の装備・大隊の形で代えた(TODO)
units = [
    unit("us-23-1", "us", "us-inf-bn-1950", ring(800, 0), 0, entrenchment=3, training="veteran"),
    unit("us-23-2", "us", "us-inf-bn-1950", ring(800, 180), 180, entrenchment=3, training="veteran"),
    unit("us-23-3", "us", "us-inf-bn-1950", ring(800, 90), 90, entrenchment=3, training="veteran"),
    unit("fr-bn", "us", "us-inf-bn-1950", ring(800, 270), 270, entrenchment=3, training="veteran"),
    unit("us-23-troops", "us", "us-regt-troops-1950", C, 0, entrenchment=2, training="veteran"),
    unit("us-37-fab", "us", "us-fa-bn-105", S.offset(C, 200, -200), 0, entrenchment=2),
    unit("us-503-b", "us", "us-fa-bn-155", S.offset(C, -200, -200), 0, entrenchment=2, strength=0.34),
]
# 中国人民志願軍:4個師団(中:Wikipedia『French Battalion』)。全部が同時に攻めたわけではなく、投入の順・連隊の数は TODO(要裏取り)。
# 連隊8を、13日の夜に4・14日の夜に4 として四方から寄せる(配分・方向は**仮置き**。12連隊を一度に寄せると AI 同士で6戦すべて村が落ちた)
CN_FIRST = [(0, 4500), (90, 5000), (180, 4500), (270, 5000)]
CN_SECOND = [(45, 5500), (135, 5500), (225, 5500), (315, 5500)]
for i, (deg, r) in enumerate(CN_FIRST):
    units.append(unit(f"cn-a{i + 1}", "cn", "cn-inf-regt-1950", ring(r, deg), (deg + 180) % 360, "column", training="veteran"))
reinforcements = []
for i, (deg, r) in enumerate(CN_SECOND):
    p = ring(r, deg)
    reinforcements.append(L([("turn", 26), ("id", f"cn-b{i + 1}"), ("side", "cn"), ("toe", "cn-inf-regt-1950"), ("x", p[0]), ("y", p[1]), ("facing", (deg + 180) % 360)]))
# クロンベズ任務部隊:第5騎兵連隊の戦車と歩兵が15日の夕方に南から着いた(中:Wikipedia)。戦車の数・車種は TODO(要裏取り)。
# M4A3E8 の戦車大隊の戦力0.33(約23両)と、米の大隊1 で置いた
SE = S.nodes["s_edge"]
reinforcements += [
    L([("turn", 46), ("id", "us-tf-crombez"), ("side", "us"), ("toe", "us-tank-bn-1950-e8"), ("x", SE["x"]), ("y", SE["y"]), ("facing", 0), ("strength", 0.33)]),
    L([("turn", 46), ("id", "us-5cav-inf"), ("side", "us"), ("toe", "us-inf-bn-1950"), ("x", SE["x"] + 500), ("y", SE["y"]), ("facing", 0)]),
]

# 目標の範囲は村の中心の500m(全周の陣地の内側)。範囲の中の部隊の数で持ち主が決まるので、陣地の環を抜けないと取れない
objectives = [objective("chipyong", "チピョンニ", C, 3, "us", 500)]

# 概略の地形(高地・森)を自動で敷く。資料で位置を確かめた高地・森がないので、村を囲む朝鮮の丘陵のおよその姿をシードから作ったもの(史実の地形ではない)。
# 割合はゲームの設計。町・目標と部隊の初期位置のまわりは平地のまま
S.fill_terrain(19510213, hill=0.45, forest=0.05, scale_m=1500, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives])

scenario = L(
    [
        ("id", "chipyong-ni-1951-02-13"),
        ("name", "チピョンニの戦い 1951年2月13〜15日(v0・概略図)"),
        (
            "description",
            "朝鮮戦争。米第23連隊戦闘団とフランス大隊が、村のまわりの全周の陣地で、中国人民志願軍の数個師団の夜襲を2晩しのぐ。"
            "3日目の夕方、南から戦車の任務部隊が来るまで持ちこたえられるか。",
        ),
        (
            "notes",
            "v0。高地・森は概略の自動生成で、史実の地形ではない。地図は村1つだけ(周りの高地・トンネル・道路の形は座標が確かめられず入れていない)。陣地の半径・大隊の受け持ち・志願軍の連隊の数と方向は仮置き。"
            "部隊は国ごとの実数の編成表(定数)。夜は暗い時間として1時間ごとに解く。根拠は docs/research/chipyong-ni-1951-02.md。"
            "作り直しは tools/scenarios/build_chipyong_ni_1951_02_13.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "us", "su", "korea-north"]),
                    ("toe", ["ww1-korea-generic", "us", "su", "korea-north"]),
                ]
            ),
        ),
        ("sides", [L([("id", "us"), ("name", "国連軍(米・仏)")]), L([("id", "cn"), ("name", "中国人民志願軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 17), ("startDate", "1951-02-13")])),
        ("map", S.map()),
        ("roads", S.roads()),
        (
            "rules",
            L(
                [
                    ("maxTurns", MAX_TURNS),
                    ("objectives", objectives),
                    (
                        "victory",
                        L(
                            [
                                # 志願軍:村を取れば決定的。国連軍に3割の損害を与えれば限定的(ゲームの設計)。急ぎ度 0.8(第4次戦役の反撃の一部)
                                ("cn", L([("decisive", L([("required", ["chipyong"])])), ("limited", L([("minEnemyLoss", 0.3)])), ("urgency", 0.8)])),
                                # 国連軍:村を保てば限定的、さらに志願軍に3割の損害を与えれば決定的(史実の結末)
                                ("us", L([("decisive", L([("required", ["chipyong"]), ("minEnemyLoss", 0.3)])), ("limited", L([("required", ["chipyong"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 4), ("cn", 6)])),
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast", "snow"])])),
                    ("darkTurns", DARK),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                # 包囲の中の集積所(14〜15日は空中投下で補給された。量は TODO(要裏取り))
                L([("id", "us-perimeter"), ("side", "us"), ("nodeId", "chipyong"), ("ammoT", 250), ("fuelT", 80)]),
                L([("id", "us-south"), ("side", "us"), ("nodeId", "s_edge"), ("ammoT", 200), ("fuelT", 150)]),
                L([("id", "cn-north"), ("side", "cn"), ("nodeId", "n_edge"), ("ammoT", 150), ("fuelT", 20)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "us"),
        ("level", "decisive"),
        ("summary", "国連軍は村を守り抜き、15日の夕方にクロンベズ任務部隊がつながった。志願軍の損害は米の見積もりで戦死約2,000・負傷約3,000。"),
    ]
)
# 部隊の表示名(地図・ユニットの欄・作戦命令。ルールには使わない)
apply_names(scenario, {
    "us-23-1": "第23連隊 第1大隊",
    "us-23-2": "第23連隊 第2大隊",
    "us-23-3": "第23連隊 第3大隊",
    "fr-bn": "フランス大隊",
    "us-23-troops": "第23連隊 直轄部隊",
    "us-37-fab": "第37野砲大隊",
    "us-503-b": "第503野砲大隊 B中隊",
    "us-tf-crombez": "クロンベズ任務部隊",
    "us-5cav-inf": "第5騎兵連隊の大隊",
    "cn-a1": "志願軍 第1攻撃隊",
    "cn-a2": "志願軍 第2攻撃隊",
    "cn-a3": "志願軍 第3攻撃隊",
    "cn-a4": "志願軍 第4攻撃隊",
    "cn-b1": "志願軍 第5攻撃隊",
    "cn-b2": "志願軍 第6攻撃隊",
    "cn-b3": "志願軍 第7攻撃隊",
    "cn-b4": "志願軍 第8攻撃隊",
})
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
