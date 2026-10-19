#!/usr/bin/env python3
"""
アラクール戦車戦 1944年9月19〜22日 のシナリオファイル(検証用 v0・概略図)を作る。

    python3 tools/scenarios/build_arracourt_1944_09_19.py

出力: data/scenarios/arracourt-1944-09-19.json

目的は、バストーニュで合わせた設定値のまま別の戦いを再現して、設定値の妥当性を確かめること(docs/research/validation.md)。
地図は資料で座標が確かめられた村だけ。道路は村どうしを直線で結んだ概略(つながりは TODO(要裏取り))。
運河・森・高地(265高地・318高地・257高地)は座標が確かめられず、入れていない(TODO(要裏取り))。
根拠と出典は docs/research/validation.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACKS, Sketch, objective, scaled_command_points, split_units, unit, historical_presets  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/arracourt-1944-09-19.json"

S = Sketch(origin=(48.725, 6.585), cols=96, rows=96)  # 24km × 24km

# 村(緯度, 経度)。出典は Wikipedia ほかの検索結果の要約(docs/research/validation.md)
TOWNS = L(
    [
        ("arracourt", ("アラクール", 48.7244, 6.5339)),
        ("lezey", ("ルゼ", 48.7528, 6.6297)),
        ("moncourt", ("モンクール", 48.7192, 6.6386)),
        ("bezange", ("ブザンジュ=ラ=プティット", 48.7308, 6.6125)),
        ("rechicourt", ("レシクール=ラ=プティット", 48.7192, 6.5828)),  # 出典1つだけ
        ("juvelize", ("ジュヴリーズ", 48.7642, 6.6486)),
        ("parroy", ("パロワ", 48.6833, 6.6017)),
        ("bures", ("ビュール", 48.6950, 6.5769)),
        ("ommeray", ("オムレ", 48.7239, 6.6881)),
        ("moyenvic", ("モワイヤンヴィック", 48.7781, 6.5631)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in TOWNS.items()}

S.terrain("T", "town")
for k in P:
    S.mark(P[k], "T")

# 道路(概略。村どうしを直線で結んだもの。つながりは TODO(要裏取り)。出典候補:Cole『The Lorraine Campaign』の地図、Barnes『Arracourt』DTIC ADB067783)
for k in P:
    S.node(k, P[k])
S.node("west_edge", S.snap((0, P["arracourt"][1])))  # 米軍の後方(ナンシー方面)
S.node("se_edge", S.snap((S.width, P["parroy"][1] - 2000)))  # 独軍の後方(運河の南東)
S.node("ne_edge", S.snap((S.width, P["juvelize"][1] + 1500)))  # 独第11装甲師団の来た方向(TODO(要裏取り))
for a, b in [
    ("west_edge", "arracourt"),
    ("arracourt", "rechicourt"),
    ("rechicourt", "bezange"),
    ("bezange", "moncourt"),
    ("moncourt", "ommeray"),
    ("arracourt", "lezey"),
    ("lezey", "juvelize"),
    ("arracourt", "moyenvic"),
    ("lezey", "bezange"),
    ("rechicourt", "bures"),
    ("bures", "parroy"),
    ("parroy", "se_edge"),
    ("ommeray", "se_edge"),
    ("juvelize", "ne_edge"),
]:
    S.road(a, b)

# 時間:9月の昼を 07:00〜19:00 の12ターン(1時間)、夜を12時間1ターンとする。1日 = 13ターン、4日で51ターン
# TODO(要裏取り):当時の時刻帯と日の出・日の入り(北緯48.7度の9月20日は、日の出 約05:17 UTC、日の入り 約17:40 UTC の計算値)
DAY_TURNS = 12
PER_DAY = DAY_TURNS + 1


def morning(day):
    return (day - 1) * PER_DAY + 1


MAX_TURNS = 3 * PER_DAY + DAY_TURNS

# 部隊。編成は汎用(史実ではない)。数・位置の根拠は docs/research/validation.md
A = P["arracourt"]
units = [
    # 米第4機甲師団A戦闘団(クラーク大佐)。練度:7月末のノルマンディー突破から戦い続けていた → 古参(TODO(要裏取り):出典候補 Cole『The Lorraine Campaign』)
    # 第37戦車大隊(3個中戦車中隊)と第53機甲歩兵大隊を、汎用の機甲任務部隊3つ(戦車1個中隊+機甲歩兵1個中隊)で表す
    unit("us-cca-lamison", "us", "armored_task_force", P["lezey"], 120, training="veteran"),  # C/37 戦車中隊がルゼで前哨(Cole 第5章)
    unit("us-cca-hunter", "us", "armored_task_force", S.offset(A, 1000, -500), 120, training="veteran"),  # ハンター少佐の A・B 中隊。レシクール経由で南から側面へ(Cole)
    unit("us-cca-abrams", "us", "armored_task_force", S.offset(A, -500, 500), 90, training="veteran"),  # 第37戦車大隊の残りと第53機甲歩兵大隊。位置は TODO(要裏取り)
    unit("us-704-td", "us", "tank_destroyer_battalion", S.offset(A, 500, 1000), 90, training="veteran"),  # 第704駆逐戦車大隊の一部(M18)。どれだけ配属されていたかは TODO(要裏取り)
    unit("us-cca-arty", "us", "artillery_group", S.offset(A, -1500, 0), 90),  # 第66・第94機甲野砲大隊と第191野砲大隊(155mm)
    unit("us-25-cav", "us", "recon_squadron", S.offset(P["moyenvic"], 1500, 0), 90),  # 第25騎兵偵察大隊。位置は TODO(要裏取り)
    # 独第113装甲旅団(フォン・ゼッケンドルフ大佐):パンター42両の大隊とIV号の大隊、装甲擲弾兵2個大隊(Cole、Wikipedia)
    # 19日朝、霧の中をブザンジュ=ラ=プティット付近から前進(米軍の連絡将校が07:30ごろ独軍の縦列に出くわした)
    # 練度:装甲旅団の乗員は訓練約2週間で、無線も少なかった(Wikipedia『Battle of Arracourt』)→ 未熟
    unit("de-113-pz", "de", "panzer_regiment", S.offset(P["bezange"], 1500, -1500), 300, "column", training="green"),
    unit("de-113-pgr", "de", "panzergrenadier_regiment", S.offset(P["moncourt"], 1500, -1000), 300, "column", training="green"),
    # 独第111装甲旅団:パロワで運河を渡った。19〜20日はビュールからアラクールへ攻めた(ccsanon.fr)。戦車約90両とする資料と、定数72両とする資料がある
    unit("de-111-pz", "de", "panzer_regiment", S.offset(P["parroy"], 0, -1500), 330, "column", training="green"),
    unit("de-111-pgr", "de", "panzergrenadier_regiment", S.offset(P["parroy"], 1500, -2000), 330, "column", training="green"),
]

# 増援:独第11装甲師団。22日に第111装甲旅団と合わせて約40両で、霧の中からジュヴリーズ〜ルゼへ攻めた(eARMOR 2015)
# 着いた日時・方向は TODO(要裏取り)。22日朝に北東の端から来たものとして置く
NE = S.nodes["ne_edge"]
reinforcements = [
    L([("turn", morning(4)), ("id", "de-11pz-kg"), ("side", "de"), ("toe", "panzer_regiment"), ("x", NE["x"]), ("y", NE["y"]), ("facing", 240)]),
    L([("turn", morning(4)), ("id", "de-11pz-pgr"), ("side", "de"), ("toe", "panzergrenadier_regiment"), ("x", NE["x"]), ("y", NE["y"] - 1500), ("facing", 240)]),
]

# 目標:A戦闘団の陣地(アラクール)と、まわりの村。勝利条件はゲームの設計(史実の結末:米軍がアラクール一帯を保ち、独軍の2個装甲旅団は壊滅)
objectives = [objective("arracourt", "アラクール", A, 3, "us", 600)]
for k, holder in [("lezey", "us"), ("rechicourt", "us"), ("bezange", None), ("moncourt", None), ("juvelize", None)]:
    objectives.append(objective(k, TOWNS[k][0], P[k], 1, holder))

# 天候:朝はたびたび霧(19日は午前中ずっと霧、22日は霧が晴れてからP-47が攻撃)。日ごとの細かい天候は TODO(要裏取り)
weather = L(
    [
        ("initial", "fog"),
        ("changeChancePerHour", 0.1),
        ("minHoursBetweenChanges", 3),
        ("improveChance", 0.6),
        ("allowed", ["fog", "overcast", "clear"]),
        (
            "schedule",
            [
                L([("turn", morning(1) + 5), ("weather", "overcast"), ("allowed", ["fog", "overcast", "clear"])]),  # 19日昼まで霧
                L([("turn", morning(2)), ("weather", "fog"), ("allowed", ["fog", "overcast", "clear"])]),
                L([("turn", morning(3)), ("weather", "fog"), ("allowed", ["fog", "overcast", "clear"])]),
                L([("turn", morning(4)), ("weather", "fog"), ("allowed", ["fog"])]),
                L([("turn", morning(4) + 4), ("weather", "clear"), ("allowed", ["clear", "overcast"])]),  # 22日、霧が晴れる時刻は TODO(要裏取り)
            ],
        ),
    ]
)

# 連隊は大隊に分ける(連隊1部隊だと耐久が大きく、取りつかれても損害が小さすぎた。docs/research/validation.md)。
# 指揮ポイントは、機動部隊の数の比で増やす(分ける前は両軍6)
REGIMENTS = units
units = split_units(REGIMENTS, S.snap)
reinforcements = split_units(reinforcements, S.snap)
COMMAND_POINTS = {side: scaled_command_points(6, [u for u in REGIMENTS if u["side"] == side], [u for u in units if u["side"] == side]) for side in ("us", "de")}

scenario = L(
    [
        ("id", "arracourt-1944-09-19"),
        ("name", "アラクール戦車戦 1944年9月19〜22日(検証用 v0・概略図)"),
        (
            "description",
            "ロレーヌ。米第4機甲師団A戦闘団の突出部に、独第5装甲軍の第113・第111装甲旅団が朝霧の中から攻めかかる。22日には第11装甲師団も加わる。",
        ),
        (
            "notes",
            "検証用 v0。地図は資料で座標が確かめられた村だけで、道路は直線の概略。運河・森・高地は未確認のため入れていない。"
            "汎用編成・勝利条件・指揮ポイント・補給量・航空の回数は史実ではない仮置き。根拠は docs/research/validation.md。"
            "作り直しは tools/scenarios/build_arracourt_1944_09_19.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 7), ("startDate", "1944-09-19")])),
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
                                # 急ぎ度:独第5装甲軍は、米第3軍の側面へ急いで反撃するよう求められ、装甲旅団は着いた順に投入された → 0.6
                                # TODO(要裏取り):出典候補 Cole『The Lorraine Campaign』第5章、Zaloga『Arracourt 1944』。米軍は守る側(0)
                                ("de", L([("decisive", L([("required", ["arracourt"])])), ("limited", L([("minWeight", 4)])), ("urgency", 0.6)])),
                                # 米軍の決定的勝利は、陣地を保ったうえで独軍に大きな損害を与えること(史実の結末)
                                ("us", L([("decisive", L([("required", ["arracourt"]), ("minEnemyLoss", 0.3)])), ("limited", L([("required", ["arracourt"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", COMMAND_POINTS["us"]), ("de", COMMAND_POINTS["de"])])),
                    ("weather", weather),
                    # P-47 は霧が晴れると出撃した。回数は TODO(要裏取り)(9月のアラクール一帯で戦車73両を撃破・損傷とする資料がある)
                    ("air", L([("us", L([("strike", L([("groups", 2), ("replacementPerDay", 0.5), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)])), ("fighters", L([("groups", 3), ("replacementPerDay", 0.5)]))]))])),
                    ("night", L([("turn", PER_DAY), ("hours", 12), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        # 補給量は仮置き。独軍の装甲旅団は砲兵を持たず、無線も少なかった(Wikipedia)
        (
            "depots",
            [
                L([("id", "us-west"), ("side", "us"), ("nodeId", "west_edge"), ("ammoT", 400), ("fuelT", 300)]),
                L([("id", "de-se"), ("side", "de"), ("nodeId", "se_edge"), ("ammoT", 300), ("fuelT", 150)]),
                L([("id", "de-ne"), ("side", "de"), ("nodeId", "ne_edge"), ("ammoT", 200), ("fuelT", 100)]),
            ],
        ),
    ]
)

# 第704駆逐戦車大隊は M18
scenario["presets"] = historical_presets(scenario, {"us-704-td": "us_tank_destroyer_battalion_m18"})
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
