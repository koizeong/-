#!/usr/bin/env python3
"""
クリンケルト=ロッヒェラート(双子村)1944年12月17〜19日 のシナリオファイル(検証用 v0・概略図)を作る。

    python3 tools/scenarios/build_krinkelt_rocherath_1944_12_17.py

出力: data/scenarios/krinkelt-rocherath-1944-12-17.json

目的は、バストーニュで合わせた設定値のまま別の戦いを再現して、設定値の妥当性を確かめること(docs/research/validation.md)。
地図は資料で座標が確かめられた村。東の森(クリンケルトの森)とエルゼンボルンの高地の広がりは概略(TODO(要裏取り))。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACKS, Sketch, objective, scaled_command_points, split_units, unit, BASTOGNE_FORMATIONS, KRINKELT_FORMATIONS, formations, historical_presets  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/krinkelt-rocherath-1944-12-17.json"

S = Sketch(origin=(50.440, 6.285), cols=64, rows=64)  # 16km × 16km

PLACES = L(
    [
        ("krinkelt", ("クリンケルト", 50.43184, 6.29497)),
        ("rocherath", ("ロッヒェラート", 50.4361, 6.3011)),
        ("wirtzfeld", ("ヴィルツフェルト", 50.4284, 6.2619)),
        ("murringen", ("ミュリンゲン", 50.40678, 6.30925)),
        ("hunningen", ("ヒュニンゲン", 50.39461, 6.29153)),
        ("elsenborn_camp", ("エルゼンボルンの演習場", 50.4452, 6.2785)),
        ("elsenborn", ("エルゼンボルン", 50.45731, 6.22138)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in PLACES.items()}

S.terrain("T", "town")
S.terrain("F", "forest")
S.terrain("H", "hill")
# 東の森(国際道路沿いの第99歩兵師団の前線が森の中にあった)。広がりは TODO(要裏取り):村から東へ約1.5km先から東の端まで
S.rect(S.xy(50.405, 6.322), S.xy(50.500, 6.400), "F")
# エルゼンボルンの高地(エルゼンボルン村の東のブーメラン形の高み)。広がりは TODO(要裏取り)
S.rect(S.xy(50.440, 6.235), S.xy(50.458, 6.285), "H")
S.mark(P["krinkelt"], "T", 1)
S.mark(P["rocherath"], "T", 1)
for k in ["wirtzfeld", "murringen", "hunningen", "elsenborn"]:
    S.mark(P[k], "T")

# 道路:ヴァーラーシャイト〜ロッヒェラート(北への唯一の道)、双子村〜ヴィルツフェルト〜エルゼンボルン(重い車両が通れる唯一の退路)、
# ロースハイマーグラーベン〜ヒュニンゲン〜ビュリンゲン、ミュリンゲン〜双子村(概略)
for k in P:
    S.node(k, P[k])
S.node("north_edge", S.snap((P["rocherath"][0] + 1500, S.height)))  # ヴァーラーシャイト方面
S.node("west_edge", S.snap((0, P["elsenborn"][1])))  # 米軍の後方
S.node("se_edge", S.snap((S.width, P["hunningen"][1] - 1500)))  # ロースハイマーグラーベン方面(独軍)。位置は TODO(要裏取り)
S.node("east_edge", S.snap((S.width, P["rocherath"][1] + 500)))  # 国際道路から森の小道(独軍)
for a, b in [
    ("north_edge", "rocherath"),
    ("rocherath", "krinkelt"),
    ("krinkelt", "wirtzfeld"),
    ("wirtzfeld", "elsenborn_camp"),
    ("elsenborn_camp", "elsenborn"),
    ("elsenborn", "west_edge"),
    ("krinkelt", "murringen"),
    ("murringen", "hunningen"),
    ("hunningen", "se_edge"),
    ("murringen", "se_edge"),
    ("rocherath", "east_edge"),
]:
    S.road(a, b)

# 時間:17日12:30 から。昼は 16:30 まで(1時間)、夜は 16:30〜翌08:30 の16時間を1ターン。19日 16:30 で終わる
# 日の出・日の入りは計算値(北緯50.43度、12月17〜19日:日の出 約07:31 UTC、日の入り 約15:32 UTC)。当時の時刻帯は TODO(要裏取り)
FIRST_DAY_TURNS = 4
DAY_TURNS = 8
PER_DAY = DAY_TURNS + 1
NIGHT1 = FIRST_DAY_TURNS + 1
MAX_TURNS = FIRST_DAY_TURNS + 1 + DAY_TURNS + 1 + DAY_TURNS

R, K = P["rocherath"], P["krinkelt"]
units = [
    # 米第2歩兵師団(ロバートソン):17日にヴァーラーシャイトから双子村を通って南へ下がった。練度:ノルマンディーから戦ってきた → 古参(TODO(要裏取り))
    # 第38歩兵連隊:双子村そのものを守った
    unit("us-38-ir", "us", "infantry_regiment", S.offset(R, 0, -300), 90, training="veteran"),
    # 第9歩兵連隊第1大隊(マッキンリー):17日17時ごろからラウスデル十字路(双子村の北東約1マイル、森と村の中間)。汎用の歩兵連隊で表す(TODO:大隊規模)
    unit("us-9-ir", "us", "infantry_regiment", S.offset(R, 1100, 1100), 60, training="veteran"),
    # 第23歩兵連隊:第3大隊はロッヒェラートの東、第1大隊はヒュニンゲン(資料によりミュリンゲン)、第2大隊は北
    unit("us-23-ir", "us", "infantry_regiment", S.offset(R, 1400, -300), 90, training="veteran"),
    # 第99歩兵師団:16日からの戦いで消耗。練度:11月に前線に着いたばかりで、大きな戦いは初めて → 未熟(TODO(要裏取り):出典候補 Cole『The Ardennes』第5章)
    # 第393連隊は東の森、第394連隊はミュリンゲン。残りの戦力は TODO(要裏取り)(0.6 は仮置き)
    unit("us-99-393", "us", "infantry_regiment", S.offset(R, 2600, 300), 90, strength=0.6, training="green"),
    unit("us-99-394", "us", "infantry_regiment", P["murringen"], 120, strength=0.6, training="green"),
    # 第741戦車大隊(18日の戦いで約20両)と第644駆逐戦車大隊(M10。1個中隊欠)
    unit("us-741-tk", "us", "armored_task_force", S.offset(K, -300, 0), 90),
    unit("us-644-td", "us", "tank_destroyer_battalion", S.offset(R, -300, 200), 90),
    # 砲兵:第2歩兵師団の4個大隊と第99歩兵師団の4個大隊がエルゼンボルンの高地から撃った。17〜19日に撃っていた大隊の数は TODO(要裏取り)
    unit("us-2id-arty", "us", "artillery_group", S.offset(P["elsenborn_camp"], -1500, 0), 90),
    unit("us-99id-arty", "us", "artillery_group", S.offset(P["elsenborn_camp"], -1500, 1000), 90),
    # 独第12SS装甲師団:16日に Panther 41・IV号 37・Jagdpanther 15・IV号駆逐戦車 48(掲示板の数字・未確認)。少しずつ投入された
    unit("de-12ss-pzr", "de", "panzer_regiment", S.offset(P["murringen"], 3500, -1000), 300, "column"),
    unit("de-12ss-25", "de", "panzergrenadier_regiment", S.offset(R, 5000, -500), 270, "column"),
    unit("de-12ss-26", "de", "panzergrenadier_regiment", S.offset(P["hunningen"], 4000, -500), 300, "column"),
    unit("de-12ss-jg", "de", "tank_destroyer_battalion", S.offset(P["murringen"], 4500, 0), 300, "column"),
    # 独第277国民擲弾兵師団:16日は森を抜けて村に届かなかった。第989(ロッヒェラートへ)・第990(クリンケルトへ)・第991
    unit("de-277-989", "de", "volksgrenadier_regiment", S.offset(R, 4500, 2500), 250),
    unit("de-277-990", "de", "volksgrenadier_regiment", S.offset(K, 4500, 0), 270),
    unit("de-277-991", "de", "volksgrenadier_regiment", S.offset(P["murringen"], 3500, 1500), 280),
    # 独軍の砲兵(師団の砲兵連隊。規模と位置は TODO(要裏取り))
    unit("de-arty", "de", "artillery_group", S.offset(R, 7000, 0), 270),
]

reinforcements = []

objectives = [
    objective("krinkelt", "クリンケルト", K, 2, "us"),
    objective("rocherath", "ロッヒェラート", R, 2, "us"),
    objective("wirtzfeld", "ヴィルツフェルト", P["wirtzfeld"], 1, "us"),
    objective("elsenborn_camp", "エルゼンボルンの高地", P["elsenborn_camp"], 2, "us"),
    objective("murringen", "ミュリンゲン", P["murringen"], 1, "us"),
    objective("hunningen", "ヒュニンゲン", P["hunningen"], 1, "us"),
]

# 連隊は大隊に分ける(連隊1部隊だと耐久が大きく、取りつかれても損害が小さすぎた。docs/research/validation.md)。
# 指揮ポイントは、機動部隊の数の比で増やす(分ける前は両軍6)
REGIMENTS = units
units = split_units(REGIMENTS, S.snap)
reinforcements = split_units(reinforcements, S.snap)
COMMAND_POINTS = {side: scaled_command_points(6, [u for u in REGIMENTS if u["side"] == side], [u for u in units if u["side"] == side]) for side in ("us", "de")}

scenario = L(
    [
        ("id", "krinkelt-rocherath-1944-12-17"),
        ("name", "クリンケルト=ロッヒェラート 1944年12月17〜19日(検証用 v0・概略図)"),
        (
            "description",
            "アルデンヌ北肩。米第2・第99歩兵師団が双子村を守り、独第12SS装甲師団と第277国民擲弾兵師団が森から攻めかかる。"
            "史実では米軍が19日夜まで村を保ち、命令でエルゼンボルンの高地へ下がった。",
        ),
        (
            "notes",
            "検証用 v0。森と高地の広がり、ラウスデル十字路・ロースハイマーグラーベンの位置、部隊の初期位置の多くは TODO(要裏取り)。"
            "汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。根拠は docs/research/validation.md。"
            "作り直しは tools/scenarios/build_krinkelt_rocherath_1944_12_17.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 12.5), ("startDate", "1944-12-17")])),
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
                                # 史実の結末:米軍が19日まで双子村と退路(ヴィルツフェルト)を保ち、独軍の戦車に大きな損害を与えた
                                ("us", L([("decisive", L([("required", ["krinkelt", "rocherath", "wirtzfeld"]), ("minEnemyLoss", 0.25)])), ("limited", L([("required", ["krinkelt", "rocherath"])]))])),
                                # 急ぎ度:第12SS装甲師団は、マース川へ向かう第6装甲軍の時刻表に縛られ、双子村を急いで抜ける必要があった → 1.0
                                # TODO(要裏取り):出典候補 Cole『The Ardennes』第5・6章、Cavanagh『Krinkelt-Rocherath』。米軍は守る側(0)
                                ("de", L([("decisive", L([("required", ["krinkelt", "rocherath", "wirtzfeld"])])), ("limited", L([("required", ["krinkelt", "rocherath"])])), ("urgency", 1.0)])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", COMMAND_POINTS["us"]), ("de", COMMAND_POINTS["de"])])),
                    # 16日から厚い雲と雪。17〜18日夜に吹雪(独軍の将校の証言)。細かい天候は TODO(要裏取り)
                    ("weather", L([("initial", "overcast"), ("changeChancePerHour", 0.08), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["fog", "overcast"])])),
                    ("air", L()),
                    ("night", L([("turn", NIGHT1), ("hours", 16), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-elsenborn"), ("side", "us"), ("nodeId", "west_edge"), ("ammoT", 600), ("fuelT", 200)]),
                L([("id", "de-east"), ("side", "de"), ("nodeId", "east_edge"), ("ammoT", 400), ("fuelT", 150)]),
                L([("id", "de-se"), ("side", "de"), ("nodeId", "se_edge"), ("ammoT", 400), ("fuelT", 150)]),
            ],
        ),
    ]
)

# 第644駆逐戦車大隊は M10。第12SS戦車駆逐大隊は IV号駆逐戦車(ヤークトパンター15両は入れていない。TODO(要裏取り))
scenario["formations"] = formations(scenario, KRINKELT_FORMATIONS)
scenario["presets"] = historical_presets(scenario, {"us-644-td": "us_tank_destroyer_battalion_m10", "de-12ss-jg": "de_tank_destroyer_battalion_jgpz4"})
# 史実の結末(結果の画面で、プレイヤーの結果と比べる)。勝ち方の段階は、このシナリオの勝利条件に当てはめたもの
scenario["historicalOutcome"] = L([("winner", "us"), ("level", "decisive"), ("summary", "米軍が19日まで双子村と退路(ヴィルツフェルト)を保ち、独軍の戦車に大きな損害を与えて、命令でエルゼンボルンの高地へ下がった。")])
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
