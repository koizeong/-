#!/usr/bin/env python3
"""
カランタン 1944年6月12〜13日 のシナリオファイル(検証用 v0・概略図)を作る。

    python3 tools/scenarios/build_carentan_1944_06_12.py

出力: data/scenarios/carentan-1944-06-12.json

12日未明から始める(ユーザー判断:米第101空挺師団の町への攻撃は12日から)。以前は10日朝から始めて堤道の戦いも含めていたが、
米軍が10日のうちに町を攻めて落とし、史実の日程と合わなかった。独第6降下猟兵連隊は11〜12日の夜に町を出ているので、
12日は米軍が町と30高地を押さえ、13日に第17SS装甲擲弾兵師団の反撃(ブラッディ・ガルチ)と第2機甲師団A戦闘団の救援が来る。

目的は、バストーニュで合わせた設定値のまま別の戦いを再現して、設定値の妥当性を確かめること(docs/research/validation.md)。
地図は資料で座標が確かめられた村・地点と、国道13号(サン=コーム=デュ=モン〜カランタンの堤道)。
冠水域の広がりは確かめられず、堤道のまわりに帯で置いた概略(TODO(要裏取り))。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACKS, Sketch, objective, scaled_command_points, split_units, unit, historical_presets, real_presets  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/carentan-1944-06-12.json"

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

# 時間:12日 01:30 から(ユーザー判断:米第101空挺師団の町への攻撃は12日から)。01:30〜05:30 の4ターンは暗い時間
# (1時間ごとに解くが見通しは夜と同じ)、昼は 05:30〜21:30 の16ターン、夜は8時間1ターン、13日 21:30 まで。
# 6月5日の日の入りは22:01(英国二重夏時間)。TODO(要裏取り):12〜13日の日の出・日の入りと、当時の時刻帯
DARK_TURNS = 4
DAY_TURNS = 16
NIGHT_TURN = DARK_TURNS + DAY_TURNS + 1


def at_hour(day, hour):
    """12日を day=1 として、その日の hour 時(05:30 以降の昼)に始まるターン"""
    first = DARK_TURNS + 1 if day == 1 else NIGHT_TURN + 1
    return first + round(hour - 5.5)


MAX_TURNS = NIGHT_TURN + DAY_TURNS

C = P["carentan"]
units = [
    # 米第101空挺師団(テイラー)。12日未明の位置はどれも資料の要約からの推定で、TODO(要裏取り)
    # (出典候補:CMH『Utah Beach to Cherbourg』第5章、Rapport & Northwood『Rendezvous with Destiny』)
    # 第502落下傘歩兵連隊:10〜11日に堤道を越え(第3大隊は約24時間で戦力の半分〜3分の2を失った)、町の北のアングーフ農場の一帯にいる。
    # 戦力0.7・疲労0.5は仮置き
    unit("us-502-pir", "us", "airborne_regiment", P["ingouf_farm"], 180, strength=0.7, fatigue=0.5),
    # 第506落下傘歩兵連隊:2個大隊が町の南へ回り、12日02時に第502連隊第2大隊と接触、05時ごろ30高地(ラ・ビヨヌリー)を取ってから町へ入った
    # (d-dayinfo.org。30高地を取ったのを第501とする資料もある)。町の西に縦隊で置く
    unit("us-506-pir", "us", "airborne_regiment", S.offset(C, -1500, 750), 200, "column"),
    # 第501落下傘歩兵連隊:町の東の端を回って南へ(warfarehistorynetwork.com)。町の北東に縦隊で置く
    unit("us-501-pir", "us", "airborne_regiment", S.offset(C, 1250, 1000), 200, "column"),
    # 第327グライダー歩兵連隊:10日にブレヴァンでドゥーヴ川を、サン=ティレールでトート川を渡り、北東から町へ入った(dday-overlord.com)
    unit("us-327-gir", "us", "glider_infantry_regiment", S.offset(P["st_hilaire"], -250, 250), 250),
    # 師団砲兵(大隊の数と位置は TODO(要裏取り))
    unit("us-101-divarty", "us", "artillery_group", S.offset(P["st_come"], 0, 1500), 180),
    # 独第6降下猟兵連隊(フォン・デア・ハイテ):11〜12日の夜に弾薬が尽きかけて町を出て、町の南西に新しい線を敷いた(historyofwar.org)。
    # 線の位置・兵力・町に残した後衛は TODO(要裏取り)。30高地の南西に置き、陣地は着いたばかりの1、戦力0.6・弾薬0.3は仮置き
    unit("de-fjr6", "de", "volksgrenadier_regiment", S.offset(P["hill30"], -750, -1250), 45, entrenchment=1, strength=0.6, ammo=0.3),
]

SW = S.nodes["sw_edge"]
E = S.nodes["east_edge"]
reinforcements = [
    # 独第17SS装甲擲弾兵師団:12〜13日の夜に第37SS装甲擲弾兵連隊の2個大隊と第17SS戦車(突撃砲)大隊が着き、13日の夜明け(06時30分)に
    # 南西から町へ向けて反撃した(ブラッディ・ガルチの戦い。30高地=ドンヴィルの館のまわり)。突撃砲大隊は6月1日に IV号突撃砲42両
    # (到着した数は TODO(要裏取り))。汎用の駆逐戦車大隊で代用
    L([("turn", NIGHT_TURN), ("id", "de-17ss-37"), ("side", "de"), ("toe", "panzergrenadier_regiment"), ("x", SW["x"]), ("y", SW["y"]), ("facing", 30)]),
    L([("turn", NIGHT_TURN), ("id", "de-17ss-stug"), ("side", "de"), ("toe", "tank_destroyer_battalion"), ("x", SW["x"] + 1500), ("y", SW["y"]), ("facing", 30)]),
    # 米第2機甲師団A戦闘団(ローズ准将)。練度:北アフリカ・シチリアで戦った → 古参(TODO(要裏取り))
    # 13日10時30分に出動命令、イジニー方面から来て14時ごろ反撃(carentan1944.com)。戦車約60両
    L([("turn", at_hour(2, 13)), ("id", "us-2ad-cca"), ("side", "us"), ("toe", "armor_combat_command"), ("x", E["x"]), ("y", E["y"]), ("facing", 270), ("training", "veteran")]),
]

# 目標と勝利条件(ゲームの設計)。史実の結末:12日に町が落ち、13日の反撃も押し返して、米軍が町と30高地の一帯を保った。
# 町は独軍が出た後なので持ち主を独軍のままにしておき(米軍が入るまで)、アングーフ農場とサン=ティレールは米軍が押さえている
objectives = [
    objective("carentan", "カランタン", C, 3, "de", 600),
    objective("ingouf_farm", PLACES["ingouf_farm"][0], P["ingouf_farm"], 1, "us"),
    objective("hill30", PLACES["hill30"][0], P["hill30"], 1, "de"),
    objective("st_hilaire", PLACES["st_hilaire"][0], P["st_hilaire"], 1, "us"),
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
        ("id", "carentan-1944-06-12"),
        ("name", "カランタン 1944年6月12〜13日(検証用 v0・概略図)"),
        (
            "description",
            "ノルマンディー。12日未明、米第101空挺師団が、独第6降下猟兵連隊の退いたカランタンと南西の30高地を押さえにかかる。"
            "13日の夜明けに第17SS装甲擲弾兵師団が南西から反撃し、午後に第2機甲師団A戦闘団が来る。史実では米軍が町を守り抜いた。",
        ),
        (
            "notes",
            "検証用 v0。冠水域の広がり・橋の位置・部隊の初期位置の多くは TODO(要裏取り)。"
            "汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。艦砲射撃・航空は入れていない。"
            "根拠は docs/research/validation.md。作り直しは tools/scenarios/build_carentan_1944_06_12.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 1.5), ("startDate", "1944-06-12")])),
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
                                # 急ぎ度:米軍はユタ海岸とオマハ海岸の橋頭堡を急いでつなぐ必要があった → 1.0
                                # 独軍 0.3:第17SS装甲擲弾兵師団は着いた13日の夜明けに町を取り返しに出た。0.3 で残り19ターン(12日の夕方)から
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
                    ("night", L([("turn", NIGHT_TURN), ("hours", 8)])),
                    ("darkTurns", [L([("from", 1), ("to", DARK_TURNS)])]),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        # 補給量は仮置き。独第6降下猟兵連隊は、弾薬・糧食の備蓄の多くを車両ごと失い、戦いで弾薬を多く使った。
        # 届いたのは11〜12日夜の空中補給だけ(遅すぎたとする資料と、十分だったとする資料がある)。12日以降は第17SS装甲擲弾兵師団が補給を受け持った。
        # 出典:EUCMH『6.Fallschirmjäger-Regiment - Normandy』、Warfare History Network『The Lions of Carentan Part II』の要約。
        # 独軍の集積所は、その空中補給の分だけとして 8t(量は TODO(要裏取り):出典候補 von der Heydte の回想、CMH『Utah Beach to Cherbourg』)
        (
            "depots",
            [
                L([("id", "us-north"), ("side", "us"), ("nodeId", "north_edge"), ("ammoT", 400), ("fuelT", 200)]),
                L([("id", "us-east"), ("side", "us"), ("nodeId", "east_edge"), ("ammoT", 200), ("fuelT", 200)]),
                L([("id", "de-sw"), ("side", "de"), ("nodeId", "sw_edge"), ("ammoT", 8), ("fuelT", 100)]),
            ],
        ),
    ]
)

# 第6降下猟兵連隊は兵器の裏が取れていないので汎用のまま。第17SS装甲擲弾兵師団の突撃砲は1944年の編成表がない(TODO(要裏取り))
scenario["presets"] = historical_presets(scenario, {"de-fjr6": "", "de-17ss-stug": ""})
# 史実の編成(実数・定数):第6降下猟兵連隊は降下猟兵連隊の定数(6月の第6連隊は約3,457名とする資料あり。中:Flames of War)、
# 第17SS突撃砲大隊は III号突撃砲 G の旅団の形で代えた(実際は IV号突撃砲も。TODO(要裏取り))。第2機甲師団A戦闘団は戦闘団の定数
scenario["presets"]["real"] = real_presets(
    scenario,
    {"de-fjr6": "de-fjr-1944", "de-17ss-stug": "de-stug-brigade-1944"},
)
# 史実の結末(結果の画面で、プレイヤーの結果と比べる)。勝ち方の段階は、このシナリオの勝利条件に当てはめたもの
scenario["historicalOutcome"] = L([("winner", "us"), ("level", "decisive"), ("summary", "12日に町が落ち、13日の独軍の反撃も押し返して、米軍が町と30高地の一帯を保った。")])
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
