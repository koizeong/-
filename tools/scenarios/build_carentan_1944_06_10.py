#!/usr/bin/env python3
"""
カランタン 1944年6月10〜13日 のシナリオファイル(検証用 v0・概略図)を作る。

    python3 tools/scenarios/build_carentan_1944_06_10.py

出力: data/scenarios/carentan-1944-06-10.json

目的は、バストーニュで合わせた設定値のまま別の戦いを再現して、設定値の妥当性を確かめること(docs/research/validation.md)。
地図は資料で座標が確かめられた村・地点と、国道13号(サン=コーム=デュ=モン〜カランタンの堤道)。
冠水域の広がりは確かめられず、堤道のまわりに帯で置いた概略(TODO(要裏取り))。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACKS, Sketch, objective, scaled_command_points, split_units, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/carentan-1944-06-10.json"

S = Sketch(origin=(49.300, -1.255), cols=64, rows=48)  # 16km × 12km

PLACES = L(
    [
        ("carentan", ("カランタン", 49.304, -1.245)),
        ("st_come", ("サン=コーム=デュ=モン", 49.337, -1.271)),
        ("dead_mans_corner", ("デッドマンズ・コーナー", 49.3287, -1.2688)),
        ("ingouf_farm", ("アングーフ農場(コールの突撃)", 49.3144, -1.2598)),
        ("st_hilaire", ("サン=ティレール=プティヴィル", 49.3039, -1.2278)),
        # 30高地は「カランタンの南西約1マイル」(Wikipedia)。座標は近くのシンク大佐の指揮所跡(tracesofwar 157045)。TODO(要裏取り)
        ("hill30", ("30高地", 49.3009, -1.2648)),
        ("baupte", ("ボープト", 49.3081, -1.3586)),
        ("auvers", ("オーヴェール", 49.300, -1.318)),
        ("st_georges", ("サン=ジョルジュ=ド=ボオン", 49.2514, -1.2683)),
        ("brevands", ("ブレヴァン", 49.3325, -1.1822)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in PLACES.items()}

# 地形:冠水域(ドゥーヴ川の氾濫原を独軍が水浸しにした。車両は通れず、歩兵もやっと)は「渡河できる川」で表す。
# 広がりは TODO(要裏取り):堤道の両側と、町の北・北東に帯で置く(出典候補:CMH『Utah Beach to Cherbourg』の地図)
S.terrain("~", "river")
S.terrain("T", "town")
S.terrain("H", "hill")
S.rect(S.xy(49.309, -1.300), S.xy(49.333, -1.215), "~")
S.mark(P["st_come"], "T", 1)  # サン=コームの高み(冠水域の外)
S.mark(P["dead_mans_corner"], ".", 0)
S.mark(P["carentan"], "T", 2)
S.mark(P["ingouf_farm"], "T")
S.mark(P["st_hilaire"], "T")
for k in ["baupte", "auvers", "st_georges", "brevands"]:
    S.mark(P[k], "T")
S.mark(P["hill30"], "H", 1)

# 道路:国道13号(堤道。冠水域の上を2〜2.5m高く通り、橋が4つ)、カランタン〜ペリエ・カランタン〜ボープト(13日の独軍の攻撃路)
for k in P:
    S.node(k, P[k])
S.node("north_edge", S.snap((P["st_come"][0] - 1500, S.height)))  # ユタ海岸・サント=メール=エグリーズ方面(米軍の後方)
S.node("east_edge", S.snap((S.width, P["st_hilaire"][1] + 500)))  # イジニー方面(第2機甲師団A戦闘団が来た方向)
S.node("sw_edge", S.snap((P["st_georges"][0] - 2500, 0)))  # ペリエ方面(独軍の後方)
for a, b in [
    ("north_edge", "st_come"),
    ("st_come", "dead_mans_corner"),
    ("dead_mans_corner", "ingouf_farm"),
    ("ingouf_farm", "carentan"),
    ("carentan", "st_hilaire"),
    ("st_hilaire", "east_edge"),
    ("carentan", "hill30"),
    ("hill30", "sw_edge"),  # ペリエ街道(概略)
    ("carentan", "auvers"),
    ("auvers", "baupte"),  # ボープト街道(概略)
    ("carentan", "st_georges"),
    ("st_georges", "sw_edge"),
    ("st_hilaire", "brevands"),
]:
    S.road(a, b)

# 時間:6月の昼を 05:30〜22:00 の33ターン(30分)、夜を7.5時間1ターン。1日 = 34ターン、10日朝〜13日22時で135ターン
# 6月5日の日の入りは22:01(英国二重夏時間)。TODO(要裏取り):10〜13日の時刻と、当時の時刻帯
DAY_TURNS = 33
PER_DAY = DAY_TURNS + 1


def morning(day):
    return (day - 1) * PER_DAY + 1


def night(day):
    return day * PER_DAY


def at_hour(day, hour):
    return morning(day) + round((hour - 5.5) * 2)


MAX_TURNS = 3 * PER_DAY + DAY_TURNS

C = P["carentan"]
units = [
    # 米第101空挺師団(テイラー)
    # 第502落下傘歩兵連隊:第3大隊(コール中佐)が10日午後に堤道を進み、16時ごろ4つ目の橋。11日に銃剣突撃(historyofwar ほか)
    unit("us-502-pir", "us", "airborne_regiment", S.offset(P["st_come"], 0, -250), 150),
    # 第327グライダー歩兵連隊(第401グライダー歩兵連隊第1大隊を含む):10日01時45分〜06時にブレヴァン付近でドゥーヴ川を渡り、北東から攻めた
    # 10日朝の位置は TODO(要裏取り)。ブレヴァンとカランタンの間に置く
    unit("us-327-gir", "us", "glider_infantry_regiment", S.at(49.322, -1.200), 220),
    # 第506・第501落下傘歩兵連隊:12日02時に夜間行軍で町の西を回り、05時ごろ30高地。10日の位置は TODO(要裏取り)
    unit("us-506-pir", "us", "airborne_regiment", S.offset(P["st_come"], -1000, 750), 180, "column"),
    unit("us-501-pir", "us", "airborne_regiment", S.offset(P["st_come"], 1000, 750), 180, "column"),
    # 師団砲兵(大隊の数と位置は TODO(要裏取り))
    unit("us-101-divarty", "us", "artillery_group", S.offset(P["st_come"], 0, 1500), 180),
    # 独第6降下猟兵連隊(フォン・デア・ハイテ):第1大隊は7日ごろに壊滅し、第2・第3大隊が町を守った。弾薬がひどく不足(迫撃砲弾・機関銃弾)
    # 汎用の国民擲弾兵大隊で表す。弾薬の量 0.3 は「ひどく不足」を表す仮置き。大隊ごとの位置は TODO(要裏取り)
    unit("de-fjr6-2", "de", "volksgrenadier_battalion", S.offset(P["ingouf_farm"], 250, -500), 330, entrenchment=2, ammo=0.3),
    unit("de-fjr6-3", "de", "volksgrenadier_battalion", C, 0, entrenchment=2, ammo=0.3),
]

SW = S.nodes["sw_edge"]
E = S.nodes["east_edge"]
reinforcements = [
    # 独第17SS装甲擲弾兵師団:13日06時30分、南西からペリエ街道・ボープト街道沿いに攻撃。第37SS装甲擲弾兵連隊が先頭
    # 突撃砲大隊は6月1日に IV号突撃砲42両(到着した数は TODO(要裏取り))。汎用の駆逐戦車大隊で代用
    L([("turn", night(3)), ("id", "de-17ss-37"), ("side", "de"), ("toe", "panzergrenadier_regiment"), ("x", SW["x"]), ("y", SW["y"]), ("facing", 30)]),
    L([("turn", night(3)), ("id", "de-17ss-stug"), ("side", "de"), ("toe", "tank_destroyer_battalion"), ("x", SW["x"] + 1500), ("y", SW["y"]), ("facing", 30)]),
    # 米第2機甲師団A戦闘団(ローズ准将)。練度:北アフリカ・シチリアで戦った → 古参(TODO(要裏取り))
    # 13日10時30分に出動命令、イジニー方面から来て14時ごろ反撃(carentan1944.com)。戦車約60両
    L([("turn", at_hour(4, 13)), ("id", "us-2ad-cca"), ("side", "us"), ("toe", "armor_combat_command"), ("x", E["x"]), ("y", E["y"]), ("facing", 270), ("training", "veteran")]),
]

# 目標と勝利条件(ゲームの設計)。史実の結末:12日に町が落ち、13日の反撃も押し返して、米軍が町と30高地の一帯を保った
objectives = [
    objective("carentan", "カランタン", C, 3, "de", 600),
    objective("ingouf_farm", PLACES["ingouf_farm"][0], P["ingouf_farm"], 1, "de"),
    objective("hill30", PLACES["hill30"][0], P["hill30"], 1, "de"),
    objective("st_hilaire", PLACES["st_hilaire"][0], P["st_hilaire"], 1, "de"),
    objective("st_come", PLACES["st_come"][0], P["st_come"], 1, "us"),
]

# 連隊は大隊に分ける(連隊1部隊だと耐久が大きく、取りつかれても損害が小さすぎた。docs/research/validation.md)。
# 指揮ポイントは、機動部隊の数の比で増やす(分ける前は両軍6)
REGIMENTS = units
units = split_units(REGIMENTS, S.snap)
reinforcements = split_units(reinforcements, S.snap)
COMMAND_POINTS = {side: scaled_command_points(6, [u for u in REGIMENTS if u["side"] == side], [u for u in units if u["side"] == side]) for side in ("us", "de")}

scenario = L(
    [
        ("id", "carentan-1944-06-10"),
        ("name", "カランタン 1944年6月10〜13日(検証用 v0・概略図)"),
        (
            "description",
            "ノルマンディー。米第101空挺師団が、冠水域に囲まれたカランタンを独第6降下猟兵連隊から奪う。"
            "13日には南西から第17SS装甲擲弾兵師団が反撃し、午後に第2機甲師団A戦闘団が来る。",
        ),
        (
            "notes",
            "検証用 v0。冠水域の広がり・橋の位置・部隊の初期位置の多くは TODO(要裏取り)。"
            "汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。艦砲射撃・航空は入れていない。"
            "根拠は docs/research/validation.md。作り直しは tools/scenarios/build_carentan_1944_06_10.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 1800), ("stepSeconds", 60), ("startHour", 5.5), ("startDate", "1944-06-10")])),
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
                                # 急ぎ度:米軍はユタ海岸とオマハ海岸の橋頭堡を急いでつなぐ必要があった → 1.0(最初から遮二無二。コールの銃剣突撃)
                                # 独軍 0.3:第17SS装甲擲弾兵師団は着いた13日朝に町を取り返しに出た。0.3 で3日目の昼(残り48ターン)から
                                # TODO(要裏取り):出典候補 CMH『Utah Beach to Cherbourg』第5章
                                ("us", L([("decisive", L([("required", ["carentan", "hill30"])])), ("limited", L([("required", ["carentan"])])), ("urgency", 1.0)])),
                                ("de", L([("decisive", L([("required", ["carentan"])])), ("limited", L([("minWeight", 2)])), ("urgency", 0.3)])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", COMMAND_POINTS["us"]), ("de", COMMAND_POINTS["de"])])),
                    # 天候は TODO(要裏取り)
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["overcast", "clear"])])),
                    ("air", L()),
                    ("night", L([("turn", PER_DAY), ("hours", 7.5), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        # 補給量は仮置き。独軍は補給がほとんど届かなかった(11〜12日夜の空中補給は、遅すぎたとする資料と間に合ったとする資料がある)
        (
            "depots",
            [
                L([("id", "us-north"), ("side", "us"), ("nodeId", "north_edge"), ("ammoT", 400), ("fuelT", 200)]),
                L([("id", "us-east"), ("side", "us"), ("nodeId", "east_edge"), ("ammoT", 200), ("fuelT", 200)]),
                L([("id", "de-sw"), ("side", "de"), ("nodeId", "sw_edge"), ("ammoT", 60), ("fuelT", 100)]),
            ],
        ),
    ]
)

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
