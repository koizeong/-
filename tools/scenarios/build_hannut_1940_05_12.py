#!/usr/bin/env python3
"""
アニューの戦い 1940年5月12〜13日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_hannut_1940_05_12.py

出力: data/scenarios/hannut-1940-05-12.json

史上はじめての大きな戦車戦の一つ。仏騎兵軍団(プリウー)の軽機械化師団が S35・H39 で、独第16自動車化軍団(ヘプナー)の装甲師団を
アニューで迎え撃ち、ジャンブルーの陣地へ下がるまでの時間を稼ぐ。
部隊は国ごとの実数の編成表(data/toe/fr.json・de.json)を使う。根拠と残りの裏取りは docs/research/hannut-1940-05.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import apply_names, Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/hannut-1940-05-12.json"

S = Sketch(origin=(50.675, 5.02), cols=72, rows=48)  # 18km × 12km

# 町(緯度, 経度)。メルドルプ・ティスヌ・ジャンドラン・ジョーシュは座標が見つからず入れていない(TODO(要裏取り))。
# クレアンは分で丸めた値、オルプ=ジョーシュは町(自治体)全体の中心
TOWNS = L(
    [
        ("hannut", ("アニュー", 50.6725, 5.0780)),
        ("crehen", ("クレアン", 50.667, 5.050)),
        ("orp", ("オルプ=ジョーシュ", 50.683, 4.950)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in TOWNS.items()}
S.terrain("T", "town")
for k in P:
    S.mark(P[k], "T", 1 if k == "hannut" else 0)

for k in P:
    S.node(k, P[k])
S.node("e_edge", S.snap((S.width, P["hannut"][1])))  # 独軍の来た方向(トンゲレン・リエージュの方)
S.node("w_edge", S.snap((0, P["orp"][1] - 1000)))  # 仏軍の後方(ジャンブルーの方)
for a, b in [("e_edge", "hannut"), ("hannut", "crehen"), ("crehen", "orp"), ("orp", "w_edge"), ("hannut", "orp")]:
    S.road(a, b)

# 時間:12日・13日の 08:00〜20:00 を各12ターン、夜(20:00〜08:00)を1ターン。合わせて25ターン(戦いは12〜14日。時刻は TODO(要裏取り))
DAY_TURNS = 12
PER_DAY = DAY_TURNS + 1
MAX_TURNS = PER_DAY + DAY_TURNS

H, C = P["hannut"], P["crehen"]
units = [
    # 仏第3軽機械化師団(プリウー騎兵軍団)。2個の軽機械化師団で S35 176・オチキス 239(**低**:Wikipedia のノート)。ここでは第3師団の分として
    # S35 の大隊2・H39 の大隊3(オチキスは H35 も多かったが H39 で代えた)・竜騎兵(自動車化歩兵)を1940年の歩兵連隊の戦力0.5で置いた(配分は**仮置き**)
    unit("fr-3dlm-s35-a", "fr", "fr-s35-sqn-grp-1940", S.offset(C, -2000, 1500), 90),
    unit("fr-3dlm-s35-b", "fr", "fr-s35-sqn-grp-1940", S.offset(C, -2000, -1500), 90),
    unit("fr-3dlm-h39-a", "fr", "fr-h39-bn-1940", S.offset(H, -500, 1000), 90, entrenchment=1),
    unit("fr-3dlm-h39-b", "fr", "fr-h39-bn-1940", S.offset(C, 0, -1000), 90, entrenchment=1),
    unit("fr-3dlm-h39-c", "fr", "fr-h39-bn-1940", S.offset(P["orp"], 1000, 0), 90),
    unit("fr-3dlm-rdp", "fr", "fr-ir-1940", H, 90, entrenchment=1, strength=0.5),
    unit("fr-3dlm-art", "fr", "fr-art-grp-75", S.offset(P["orp"], -1000, 0), 90),
    # 独第4装甲師団(343両とする資料)。1940年の戦車大隊(III号・II号・IV号)を4、狙撃兵連隊を歩兵連隊で代えて1、砲兵(配分は**仮置き**)。
    # 実際は I号・II号が多かった(TODO(要裏取り):Jentz『Panzertruppen 1』)
    unit("de-4pz-35-1", "de", "de-pz-abt-1940", S.offset(H, 5000, 1500), 270, "column", training="veteran"),
    unit("de-4pz-35-2", "de", "de-pz-abt-1940", S.offset(H, 5500, 0), 270, "column", training="veteran"),
    unit("de-4pz-36-1", "de", "de-pz-abt-1940", S.offset(H, 5000, -1500), 270, "column", training="veteran"),
    unit("de-4pz-36-2", "de", "de-pz-abt-1940", S.offset(H, 6000, -2500), 270, "column", training="veteran"),
    unit("de-4pz-sr", "de", "de-ir-1939", S.offset(H, 6500, 1000), 270, "column", training="veteran"),
    unit("de-4pz-art", "de", "de-art-abt-lefh18", S.offset(H, 7000, 0), 270),
]

# 独第3装甲師団(280両とする資料)。12日に加わった時刻は TODO(要裏取り)。昼(ターン5)に東から戦車大隊2・狙撃兵連隊1 で置いた
E = S.nodes["e_edge"]
reinforcements = [
    L([("turn", 5), ("id", "de-3pz-5-1"), ("side", "de"), ("toe", "de-pz-abt-1940"), ("x", E["x"]), ("y", E["y"] + 2000), ("facing", 270), ("training", "veteran")]),
    L([("turn", 5), ("id", "de-3pz-5-2"), ("side", "de"), ("toe", "de-pz-abt-1940"), ("x", E["x"]), ("y", E["y"] - 2000), ("facing", 270), ("training", "veteran")]),
    L([("turn", 5), ("id", "de-3pz-sr"), ("side", "de"), ("toe", "de-ir-1939"), ("x", E["x"]), ("y", E["y"]), ("facing", 270), ("training", "veteran")]),
]

objectives = [
    objective("hannut", "アニュー", H, 2, "fr", 700),
    objective("crehen", "クレアン", C, 1, "fr"),
    objective("orp", "オルプ=ジョーシュ", P["orp"], 2, "fr", 700),
]

scenario = L(
    [
        ("id", "hannut-1940-05-12"),
        ("name", "アニューの戦い 1940年5月12〜13日(v0・概略図)"),
        (
            "description",
            "ベルギーの平原。仏の軽機械化師団の S35・H39 が、独第4装甲師団の III号・IV号を迎え撃つ。"
            "S35 の 47mm と厚い装甲は独の戦車より強いが、無線が少なく1人用の砲塔。ジャンブルーへ下がるまで、アニューとオルプでどれだけ時間を稼げるか。",
        ),
        (
            "notes",
            "v0。地図は座標が確かめられた3つの町だけ(メルドルプ・ティスヌ・ジャンドラン・ジョーシュ・川は未確認)。部隊は国ごとの実数の編成表(定数)。"
            "両軍の部隊の配分・位置・時刻は仮置き。根拠は docs/research/hannut-1940-05.md。作り直しは tools/scenarios/build_hannut_1940_05_12.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "de", "fr"]),
                    ("toe", ["ww1-korea-generic", "de", "fr"]),
                ]
            ),
        ),
        ("sides", [L([("id", "fr"), ("name", "フランス軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 8), ("startDate", "1940-05-12")])),
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
                                # 独軍:アニューとクレアンを取れば限定的、オルプまで取れば決定的。急ぎ度 1.0(仏第1軍を引きつけるための攻勢)
                                ("de", L([("decisive", L([("required", ["hannut", "crehen", "orp"])])), ("limited", L([("required", ["hannut", "crehen"])])), ("urgency", 1.0)])),
                                # 仏軍:時間を稼ぐ。オルプを保てば限定的、アニューも保てば決定的(ゲームの設計)
                                ("fr", L([("decisive", L([("required", ["orp", "hannut"])])), ("limited", L([("required", ["orp"]), ("minEnemyLoss", 0.15)]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("fr", 4), ("de", 5)])),
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast"])])),
                    ("night", L([("turn", PER_DAY), ("hours", 12), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "fr-w"), ("side", "fr"), ("nodeId", "w_edge"), ("ammoT", 250), ("fuelT", 200)]),
                L([("id", "de-e"), ("side", "de"), ("nodeId", "e_edge"), ("ammoT", 250), ("fuelT", 200)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "de"),
        ("level", "limited"),
        ("summary", "独軍はアニューの一帯を取ったが、仏の騎兵軍団は戦車の損害を与えつつ、ジャンブルーの陣地へ下がった。仏の戦車の損害は121両、独は撃破52・損傷111とされる(12〜14日)。"),
    ]
)
# 部隊の表示名(地図・ユニットの欄・作戦命令。ルールには使わない)
apply_names(scenario, {
    "fr-3dlm-s35-a": "S35 戦車群 甲",
    "fr-3dlm-s35-b": "S35 戦車群 乙",
    "fr-3dlm-h39-a": "H39 大隊 甲",
    "fr-3dlm-h39-b": "H39 大隊 乙",
    "fr-3dlm-h39-c": "H39 大隊 丙",
    "fr-3dlm-rdp": "竜騎兵連隊",
    "fr-3dlm-art": "第3軽機械化師団 砲兵",
    "de-4pz-35-1": "第35戦車連隊 I",
    "de-4pz-35-2": "第35戦車連隊 II",
    "de-4pz-36-1": "第36戦車連隊 I",
    "de-4pz-36-2": "第36戦車連隊 II",
    "de-4pz-sr": "第4装甲師団 狙撃兵",
    "de-4pz-art": "第4装甲師団 砲兵",
    "de-3pz-5-1": "第3装甲師団 戦車大隊 I",
    "de-3pz-5-2": "第3装甲師団 戦車大隊 II",
    "de-3pz-sr": "第3装甲師団 狙撃兵",
})
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
