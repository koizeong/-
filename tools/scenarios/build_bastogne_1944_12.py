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
day1_common = importlib.import_module("common")

# 時間:昼は 08:30〜16:30 の8ターン(1時間)、夜は 16:30〜翌08:30 の16時間を1ターン。1日 = 9ターン
# TODO(要裏取り):1944年12月のバストーニュの日の出・日の入りと、当時の時刻帯(連合軍と独軍で時刻帯が違う)
DAY_TURNS = 8
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


# 増援(日時・位置・編成は TODO(要裏取り))
# 一次資料(Cole『The Ardennes』第19章)は作業環境から開けず、引用を含む検索結果で確かめた範囲で置く。根拠は docs/research/bastogne-1944-12.md
N = node("n30_north_edge")
NW = day1.snap((P["bastogne"][0] - 9000, P["bastogne"][1] + 6000))
SOUTH_Y = day1.CELL // 2
reinforcements = [
    # 第26国民擲弾兵師団 第78擲弾兵連隊:北でフォワからネフまでの正面を受け持った(第2装甲師団の後を引き継ぐ)。北の端から
    # 到着の日時と道筋は TODO(要裏取り)
    L([("turn", morning(2)), ("id", "de-26vgd-78"), ("side", "de"), ("toe", "volksgrenadier_regiment"), ("x", N[0]), ("y", N[1]), ("facing", 200)]),
    # 第26国民擲弾兵師団 第39擲弾兵連隊:西・北西(米軍のブラウン隊と第327グライダー歩兵連隊第3大隊の正面)に集結し、フラミエルジュを攻めた
    # Cole 第19章。北を回って北西から入ったものとして置く(到着の日時と道筋は TODO(要裏取り))
    L([("turn", morning(3)), ("id", "de-26vgd-39"), ("side", "de"), ("toe", "volksgrenadier_regiment"), ("x", NW[0]), ("y", NW[1]), ("facing", 135)]),
    # クンケル戦闘団(第26偵察大隊を基幹に600〜800人と戦車・突撃砲。数は資料により違う):市街の南を回り込み、20日にシブレを取って
    # 北のスノンシャン・ヴィルーへ向かった。Cole 第19章、TracesOfWar『Historical Route Bastogne 11』
    # 20日の朝に南の端(アスノワの南東)に着いたものとして置く(位置は TODO(要裏取り))
    L([("turn", morning(2)), ("id", "de-26vgd-kg-kunkel"), ("side", "de"), ("toe", "recon_squadron"), ("x", day1.snap((P["assenois"][0] + 3000, 0))[0]), ("y", SOUTH_Y), ("facing", 330)]),
    # 第5降下猟兵師団 第14降下猟兵連隊:南側を受け持ち、アーロン街道を北上する第4機甲師団を止めた。26日のアスノワは
    # 降下猟兵と国民擲弾兵の戦闘団が守っていた(TracesOfWar『Historical Route Bastogne 10』、Battle of the Bulge Memories)
    # 前衛はマルトランジュの北でアーロン街道を越えていた(Cole 第19章)。南の端に22日朝に着いたものとして置く
    # (日時・位置・規模は TODO(要裏取り)。資料により20〜24日。出典候補:Cole 第19・23章、独軍資料 MS B-023)
    L([("turn", morning(4)), ("id", "de-5fj-14"), ("side", "de"), ("toe", "volksgrenadier_regiment"), ("x", day1.snap((P["assenois"][0], 0))[0]), ("y", SOUTH_Y), ("facing", 0)]),
    # 第15装甲擲弾兵師団のマウケ戦闘団(第115装甲擲弾兵連隊と戦車約18両)。25日05時30分に北西(シャン・エムルール)を攻撃した
    # 出典:historynet『Close Call Near Bastogne』。24日夜に北西へ着いたものとして置く(位置は TODO(要裏取り))
    # 練度:イタリア戦線から来た師団 → 古参(TODO(要裏取り))
    L([("turn", night(6)), ("id", "de-15pzg-115"), ("side", "de"), ("toe", "panzergrenadier_regiment"), ("x", NW[0]), ("y", NW[1]), ("facing", 135), ("training", "veteran")]),
    # 米第4機甲師団の救援部隊(R戦闘団)。26日、アスノワを抜けて16時50分ごろ包囲の中と連絡した
    # 出典:Europe Remembers『Breakthrough at Assenois』。26日朝に南の端へ着いたものとして置く(到着時刻・位置・編成は TODO(要裏取り))
    # 練度:7月末のノルマンディー突破から戦い続けていた → 古参(TODO(要裏取り))
    L([("turn", morning(8)), ("training", "veteran"), ("id", "us-4ad-ccr"), ("side", "us"), ("toe", "armor_combat_command"), ("x", edge_south_of("assenois", 20000)[0]), ("y", edge_south_of("assenois", 20000)[1]), ("facing", 0)]),
]

# 戦場からの離脱(別の方面への転用)。日時は TODO(要裏取り)
#  - 第2装甲師団:ノヴィルを取った後、北を回ってマース川方面へ進んだ(20〜21日)
#  - 教導戦車師団:第902連隊を残して西(サン=チュベール方面)へ進んだ(21〜22日)
withdrawals = [
    L([("turn", morning(3)), ("id", "de-2pz-kg-north")]),
    L([("turn", morning(3)), ("id", "de-2pz-pgr")]),
    L([("turn", morning(4)), ("id", "de-lehr-130")]),
]

# 連隊は大隊に分ける(1日版と同じ。docs/research/validation.md)
reinforcements = day1.split_units(reinforcements, day1.snap)
withdrawals = day1_common.split_withdrawals(withdrawals, {u["id"]: u["toe"] for u in day1.REGIMENTS})

rules = L(base["rules"])
rules["maxTurns"] = MAX_TURNS
rules["weather"] = weather
rules["air"] = air
rules["night"] = L([("turn", night(1)), ("hours", NIGHT_HOURS), ("everyTurns", PER_DAY)])
rules["reinforcements"] = reinforcements
rules["withdrawals"] = withdrawals

# 勝利条件(ゲームの設計。史実の目的に寄せたもの)
#  - 米軍の目的:救援が来るまでバストーニュを保持し、南からの救援路(アスノワ)をつなぐ
#  - 独軍の目的:バストーニュを取る。取れなくても、周りの村を押さえて包囲を固める
# 史実の結末(26日夕方):米軍は市街とアスノワ・フォワ・ルコーニュ・ビゾリー・マルヴィー・スノンシャンを保持(重み11)、
# 独軍はノヴィル・マジュレ・ロンヴィリー・シブレを保持(重み4)→ 米軍の限定的勝利になるように置く。
# 目標は必ずどちらかが保持しているので(重みの合計15)、米軍の重み10以上と独軍の重み6以上は同時に成り立たない
#  - 米軍 決定的:市街 + アスノワ + 重み12以上(独軍に村を3つまでしか渡さない。史実より良い)
#  - 米軍 限定的:市街 + アスノワ + 重み10以上(史実どおり、または独軍に村を1つ多く渡す)
#  - 独軍 決定的:市街を取る
#  - 独軍 限定的:重み6以上(史実より村を2つ以上多く押さえ、包囲を固めた)
#  - どれでもない(市街は守ったが救援路がつながらない等):引き分け
# 急ぎ度(遮二無二の突撃をかけ始める時期:残りのターンが「8 + 急ぎ度 × 135」以下)
#  - 独軍 0.4:奇襲が失敗した後は包囲に切り替え、大きな総攻撃は23日(教導戦車師団と第26国民擲弾兵師団の最初の連携攻撃)と
#    25日(第15装甲擲弾兵師団の北西からの攻撃)。0.4 で、22日の夕方(残り62ターン)から遮二無二に攻める
#    出典:Wikipedia『Siege of Bastogne』、historynet『Close Call Near Bastogne』の要約。TODO(要裏取り):Cole『The Ardennes』第19・23章
#  - 米軍 0.15:救援路(アスノワ)をつなぐのは26日。第4機甲師団のアスノワ突破は強行突破だった。0.15 で、25日の朝(残り28ターン)から
#    出典:Europe Remembers『Breakthrough at Assenois』
rules["victory"] = L(
    [
        ("de", L([("decisive", L([("required", ["bastogne"])])), ("limited", L([("minWeight", 6)])), ("urgency", 0.4)])),
        (
            "us",
            L(
                [
                    ("decisive", L([("required", ["bastogne", "assenois"]), ("minWeight", 12)])),
                    ("limited", L([("required", ["bastogne", "assenois"]), ("minWeight", 10)])),
                    ("urgency", 0.15),
                ]
            ),
        ),
    ]
)

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
scenario["time"] = L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 8.5), ("startDate", "1944-12-19")])
scenario["rules"] = rules

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    print(f"1日 = {PER_DAY}ターン(昼{DAY_TURNS}・夜1)、規定ターン {MAX_TURNS}")
    for d in range(1, DAYS + 1):
        print(f"  12月{18 + d}日: 朝 {morning(d)}ターン目、夜 {night(d) if d < DAYS else '-'}ターン目")
    print(f"wrote {OUT.relative_to(ROOT)}")
