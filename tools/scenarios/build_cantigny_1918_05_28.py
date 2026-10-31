#!/usr/bin/env python3
"""
カンティニーの戦い 1918年5月28日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_cantigny_1918_05_28.py

出力: data/scenarios/cantigny-1918-05-28.json

米派遣軍の最初の師団規模の攻勢。米第1師団の第28歩兵連隊が、1時間の準備砲撃の後 06:45 に、フランスのシュナイダー戦車と火炎放射器の手を借りて
カンティニー村を取る。独第82予備師団は終日砲撃し、08:30 と 17:10 に逆襲する。
部隊は国ごとの実数の編成表(data/toe/us.json・de.json・fr.json)を使う。根拠と残りの裏取りは docs/research/cantigny-1918-05.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import apply_names, Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/cantigny-1918-05-28.json"

S = Sketch(origin=(49.655, 2.495), cols=40, rows=36)  # 10km × 9km

# 村(緯度, 経度)。出典は docs/research/cantigny-1918-05.md。ベラシーズ農場・モンディディエは座標が確かめられず入れていない
TOWNS = L(
    [
        ("cantigny", ("カンティニー", 49.6628, 2.4924)),
        ("villers", ("ヴィレール=トゥルネル", 49.6542, 2.4644)),
        ("fontaine", ("フォンテーヌ=ス=モンディディエ", 49.657, 2.517)),
        ("mesnil", ("メニル=サン=ジョルジュ", 49.6399, 2.5229)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in TOWNS.items()}
S.terrain("T", "town")
for k in P:
    S.mark(P[k], "T", 1 if k == "cantigny" else 0)

for k in P:
    S.node(k, P[k])
S.node("w_edge", S.snap((0, P["villers"][1])))  # 米仏の後方
S.node("e_edge", S.snap((S.width, P["cantigny"][1] + 500)))  # 独軍の後方(モンディディエの方)
for a, b in [("w_edge", "villers"), ("villers", "cantigny"), ("cantigny", "fontaine"), ("fontaine", "e_edge"), ("fontaine", "mesnil"), ("cantigny", "e_edge")]:
    S.road(a, b)

# 時間:06:00 から 22:00 の16ターン(05:45 から1時間の準備砲撃、06:45 に歩兵が出た。中)
MAX_TURNS = 16

CA = P["cantigny"]
units = [
    # 米第28歩兵連隊(1918年の連隊の実数)。村の西の出発線から(位置は TODO(要裏取り))
    unit("us-28-ir", "us", "us-ir-1918", S.offset(CA, -1500, 0), 90, entrenchment=1),
    # 仏第5戦車大隊のシュナイダー(12両は仮置き)。機関銃座を潰すのが役目(中)
    unit("fr-5-btn-chars", "us", "fr-ca1-grp-1918", S.offset(CA, -1800, 500), 90),
    # 砲兵:米第1野砲旅団と仏の砲は 75mm 野砲 Mle 1897(米派遣軍もこれを使った)。門数(386門とする話)は確かめられず、大隊2で置いた(TODO(要裏取り))
    unit("us-1-fa-a", "us", "fr-art-grp-75", S.offset(CA, -4000, 1000), 90),
    unit("us-1-fa-b", "us", "fr-art-grp-75", S.offset(CA, -4000, -1000), 90),
    # 独第82予備師団:村の守備。連隊の一部(戦力0.4)と陣地レベル2 は仮置き(TODO(要裏取り):村にいた大隊の数)
    unit("de-82r-a", "de", "de-ir-1918", S.offset(CA, 300, 0), 270, entrenchment=2, strength=0.4),
    unit("de-82r-art", "de", "de-art-abt-1918", S.offset(CA, 4000, 0), 270),
    unit("de-82r-art2", "de", "de-art-abt-1918", S.offset(CA, 4000, -1500), 270),
]
# 逆襲:08:30 の小さな逆襲(米の陣地の右端)と、17:10 の大きな逆襲(中:Wikipedia)。部隊の大きさは TODO(要裏取り)
E = S.nodes["e_edge"]
reinforcements = [
    L([("turn", 3), ("id", "de-82r-b"), ("side", "de"), ("toe", "de-ir-1918"), ("x", E["x"]), ("y", E["y"] - 1500), ("facing", 270), ("strength", 0.4)]),
    L([("turn", 12), ("id", "de-82r-c"), ("side", "de"), ("toe", "de-ir-1918"), ("x", E["x"]), ("y", E["y"]), ("facing", 270)]),
]

objectives = [
    objective("cantigny", "カンティニー", CA, 3, "de", 600),
    objective("villers", "ヴィレール=トゥルネル", P["villers"], 1, "us"),
    objective("fontaine", "フォンテーヌ=ス=モンディディエ", P["fontaine"], 1, "de"),
]

scenario = L(
    [
        ("id", "cantigny-1918-05-28"),
        ("name", "カンティニーの戦い 1918年5月28日(v0・概略図)"),
        (
            "description",
            "米派遣軍の最初の攻勢。第28歩兵連隊が、1時間の準備砲撃とフランスのシュナイダー戦車に助けられて、カンティニー村を取りにいく。"
            "取ったあとは、独軍の終日の砲撃と2度の逆襲に耐えられるか。",
        ),
        (
            "notes",
            "v0。地図は座標が確かめられた4つの村だけ(塹壕線・高地は入れていない)。部隊は国ごとの実数の編成表(定数)。"
            "砲の門数・戦車の両数・逆襲の部隊の大きさは仮置き。根拠は docs/research/cantigny-1918-05.md。作り直しは tools/scenarios/build_cantigny_1918_05_28.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "us", "de", "fr"]),
                    ("toe", ["ww1-korea-generic", "us", "de", "fr"]),
                ]
            ),
        ),
        ("sides", [L([("id", "us"), ("name", "米仏軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 6), ("startDate", "1918-05-28")])),
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
                                # 米軍:村を取って保てば限定的、独軍に3割の損害を与えれば決定的(ゲームの設計)。急ぎ度 1.0(時刻の決まった準備砲撃つきの攻撃)
                                ("us", L([("decisive", L([("required", ["cantigny"]), ("minEnemyLoss", 0.3)])), ("limited", L([("required", ["cantigny", "villers"])])), ("urgency", 1.0)])),
                                # 独軍:村を保つ(取り返す)
                                ("de", L([("decisive", L([("required", ["cantigny", "villers"])])), ("limited", L([("required", ["cantigny"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 3), ("de", 3)])),
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast"])])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-w"), ("side", "us"), ("nodeId", "w_edge"), ("ammoT", 200), ("fuelT", 40)]),
                L([("id", "de-e"), ("side", "de"), ("nodeId", "e_edge"), ("ammoT", 200), ("fuelT", 20)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "us"),
        ("level", "decisive"),
        ("summary", "第28歩兵連隊は30分で村を取り、仏の火炎放射器班と地下室を掃討した。独軍の7回の逆襲をしのいで保った。独第82予備師団は初日に1,408名を失った。"),
    ]
)
# 部隊の表示名(地図・ユニットの欄・作戦命令。ルールには使わない)
apply_names(scenario, {
    "us-28-ir": "第28歩兵連隊",
    "fr-5-btn-chars": "仏第5戦車大隊",
    "us-1-fa-a": "第1野砲旅団 甲",
    "us-1-fa-b": "第1野砲旅団 乙",
    "de-82r-a": "第82予備師団 守備隊",
    "de-82r-art": "第82予備師団 砲兵",
    "de-82r-art2": "第82予備師団 砲兵(2)",
    "de-82r-b": "逆襲部隊(朝)",
    "de-82r-c": "逆襲部隊(夕)",
})
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
