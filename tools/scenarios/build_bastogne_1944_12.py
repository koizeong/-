#!/usr/bin/env python3
"""
バストーニュ攻防戦 1944年12月19〜26日(8日間)のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_bastogne_1944_12.py

出力: data/scenarios/bastogne-1944-12.json

地図・目標・19日朝の部隊は 1日版(tools/scenarios/build_bastogne_1944_12_19.py)と同じものを使う。
8日間の出来事(天候・増援・転用・空輸・救援)は、調べられた範囲で置き、確かめられていないものは TODO(要裏取り)。
根拠は docs/research/bastogne-1944-12.md。
"""

import importlib.util
import json
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/bastogne-1944-12.json"

# 1日版の地図・目標・部隊を読み込む(読み込むと1日版のファイルも作り直される。内容は変わらない)
spec = importlib.util.spec_from_file_location("day1", ROOT / "tools/scenarios/build_bastogne_1944_12_19.py")
day1 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(day1)
base = day1.scenario

# 時間:昼は 08:30〜16:30 の16ターン(30分)、夜は 16:30〜翌08:30 の16時間を1ターン。1日 = 17ターン
# TODO(要裏取り):1944年12月のバストーニュの日の出・日の入りと、当時の時刻帯(連合軍と独軍で時刻帯が違う)
DAY_TURNS = 16
PER_DAY = DAY_TURNS + 1
NIGHT_HOURS = 16


def morning(day):
    """day 日目(19日 = 1)の朝の最初のターン"""
    return (day - 1) * PER_DAY + 1


def night(day):
    """day 日目の夜のターン"""
    return (day - 1) * PER_DAY + PER_DAY


DAYS = 8  # 19〜26日
MAX_TURNS = (DAYS - 1) * PER_DAY + DAY_TURNS  # 26日の 16:30 で終わる(救援部隊との連絡は26日16時50分ごろ)

P = day1.P
NODES = base["roads"]["nodes"]


def node(name):
    n = NODES[name]
    return (n["x"], n["y"])


# 天候:19〜22日は霧と曇り(航空は飛べない)、23日に晴れた(空輸と対地攻撃が始まった)
# 出典:Mildenhall AFB『A look at air power in the Battle of the Bulge』、army.mil『Air Borne to the Airborne』
# TODO(要裏取り):19〜22日・24〜26日の日ごとの天候
weather = L(
    [
        ("initial", "fog"),
        ("changeChancePerHour", 0.08),
        ("minHoursBetweenChanges", 3),
        ("improveChance", 0.6),
        ("allowed", ["fog", "overcast"]),
        ("schedule", [L([("turn", morning(5)), ("weather", "clear"), ("allowed", ["clear"])])]),
    ]
)

# 航空(米軍だけ。天候が晴れる23日から使える)
# 空輸:23日は C-47 260機で334トン、23〜27日の合計は850〜1,200トン(資料により違う)。1回の投下量と回数は仮置き
# 対地攻撃:23日に晴れてからの5日間で第9空軍は8,608出撃(アルデンヌ全体)。バストーニュ周辺に回った分は TODO(要裏取り)
air = L(
    [
        (
            "us",
            L(
                [
                    ("strike", L([("sortiesPerDay", 4), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)])),
                    ("airlift", L([("sortiesPerDay", 4), ("ammoT", 80), ("fuelT", 5)])),
                    ("fighters", L([("sortiesPerDay", 4)])),
                    ("recon", L([("sortiesPerDay", 2)])),
                ]
            ),
        )
    ]
)


def edge_south_of(k, dy):
    x, y = P[k]
    return day1.snap((x, max(day1.CELL // 2, y - dy)))


# 増援(日時・位置・編成は TODO(要裏取り)。出典候補:Cole『The Ardennes』第19・20章、Marshall『Bastogne: The First Eight Days』)
E = node("n874_east_edge")
NW = day1.snap((P["bastogne"][0] - 9000, P["bastogne"][1] + 6000))
reinforcements = [
    # 第26国民擲弾兵師団の残りの連隊(第39・第78擲弾兵連隊)。到着の日時と方向は TODO(要裏取り)
    L([("turn", morning(2)), ("id", "de-26vgd-39"), ("side", "de"), ("toe", "volksgrenadier_regiment"), ("x", E[0]), ("y", E[1]), ("facing", 270)]),
    L([("turn", morning(2)), ("id", "de-26vgd-78"), ("side", "de"), ("toe", "volksgrenadier_regiment"), ("x", E[0]), ("y", E[1] - 3000), ("facing", 270)]),
    # 第15装甲擲弾兵師団のマウケ戦闘団(第115装甲擲弾兵連隊と戦車約18両)。25日05時30分に北西(シャン・エムルール)を攻撃した
    # 出典:historynet『Close Call Near Bastogne』。24日夜に北西へ着いたものとして置く(位置は TODO(要裏取り))
    L([("turn", night(6)), ("id", "de-15pzg-115"), ("side", "de"), ("toe", "panzergrenadier_regiment"), ("x", NW[0]), ("y", NW[1]), ("facing", 135)]),
    # 米第4機甲師団の救援部隊(R戦闘団)。26日、アスノワを抜けて16時50分ごろ包囲の中と連絡した
    # 出典:Europe Remembers『Breakthrough at Assenois』。26日朝に南の端へ着いたものとして置く(到着時刻・位置・編成は TODO(要裏取り))
    L([("turn", morning(8)), ("id", "us-4ad-ccr"), ("side", "us"), ("toe", "armor_combat_command"), ("x", edge_south_of("assenois", 20000)[0]), ("y", edge_south_of("assenois", 20000)[1]), ("facing", 0)]),
]

# 戦場からの離脱(別の方面への転用)。日時は TODO(要裏取り)
#  - 第2装甲師団:ノヴィルを取った後、北を回ってマース川方面へ進んだ(20〜21日)
#  - 教導戦車師団:第902連隊を残して西(サン=チュベール方面)へ進んだ(21〜22日)
withdrawals = [
    L([("turn", morning(3)), ("id", "de-2pz-kg-north")]),
    L([("turn", morning(3)), ("id", "de-2pz-pgr")]),
    L([("turn", morning(4)), ("id", "de-lehr-130")]),
]

rules = L(base["rules"])
rules["maxTurns"] = MAX_TURNS
rules["weather"] = weather
rules["air"] = air
rules["night"] = L([("turn", night(1)), ("hours", NIGHT_HOURS), ("everyTurns", PER_DAY)])
rules["reinforcements"] = reinforcements
rules["withdrawals"] = withdrawals

scenario = L(base)
scenario["id"] = "bastogne-1944-12"
scenario["name"] = "バストーニュ攻防戦 1944年12月19〜26日(v0・概略図)"
scenario["description"] = (
    "米第101空挺師団と第10機甲師団B戦闘団が、独第47装甲軍団に包囲されたバストーニュを8日間守る。"
    "22日までは霧と曇りで航空は飛べず、23日に晴れて空輸が始まる。26日に南から第4機甲師団が救援に来る。"
)
scenario["notes"] = (
    "v0。地図・目標・19日朝の部隊は1日版と同じ(概略図)。8日間の出来事(天候・増援・転用・空輸・救援)の日時・位置・量の多くは "
    "TODO(要裏取り)。汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。"
    "根拠は docs/research/bastogne-1944-12.md。作り直しは tools/scenarios/build_bastogne_1944_12.py。"
)
scenario["time"] = L([("turnSeconds", 1800), ("stepSeconds", 60), ("startHour", 8.5), ("startDate", "1944-12-19")])
scenario["rules"] = rules

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    print(f"1日 = {PER_DAY}ターン(昼{DAY_TURNS}・夜1)、規定ターン {MAX_TURNS}")
    for d in range(1, DAYS + 1):
        print(f"  12月{18 + d}日: 朝 {morning(d)}ターン目、夜 {night(d) if d < DAYS else '-'}ターン目")
    print(f"wrote {OUT.relative_to(ROOT)}")
