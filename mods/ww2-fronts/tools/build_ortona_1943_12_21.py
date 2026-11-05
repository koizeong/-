#!/usr/bin/env python3
"""
オルトーナの戦い 1943年12月21〜22日 のシナリオファイル(v0・概略図)を作る。

    python3 mods/ww2-fronts/tools/build_ortona_1943_12_21.py

出力: mods/ww2-fronts/scenarios/ortona-1943-12-21.json(--out で変えられる)

イタリア、アドリア海の岸の町。加第1歩兵師団のロイヤル・エドモントン連隊とシーフォース・ハイランダーズが、スリー・リヴァーズ連隊の戦車と町へ入り、
独第1降下猟兵師団の2個大隊と家から家へ戦う(壁に穴を開けて家伝いに進む「ねずみの穴」)。「小さなスターリングラード」。戦いは20〜28日の8日間で、ここでは始めの2日。
根拠と残りの裏取りは mods/ww2-fronts/research/ortona-1943-12.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/scenarios"))
from common import apply_names, formations, objective, output_path, Sketch, unit  # noqa: E402

OUT = output_path(PACK, "scenarios/ortona-1943-12-21.json", "ortona-1943-12-21.json")

# 町ひとつの戦いなので、125m のセルで 6km × 4km
S = Sketch(origin=(42.352, 14.395), cols=48, rows=32, cell=125)

# 町の形・広場・城の位置は概略(座標を確かめられなかった。TODO(要裏取り):1943年の連合軍の市街図、Zuehlke『Ortona』の付図)。
# 東はアドリア海(大河の扱いで、渡れない水)。町は海の上の高台で、北東の端に城(カステッロ・アラゴネーゼ)
S.terrain("T", "town")
S.terrain("W", "large_river")
S.terrain("H", "hill")
S.rect((4700, 0), (S.width, S.height), "W")
S.rect((3200, 1700), (4500, 3300), "T")
PIAZZA = S.snap((3800, 2500))  # 市庁舎の広場(町の真ん中)
CASTLE = S.snap((4300, 3200))  # 城(北東の端)
SOUTH = S.snap((3800, 1800))  # 町の南の入口
S.mark(CASTLE, "H", 0)

S.node("s_edge", S.snap((3800, 0)))
S.node("south", SOUTH)
S.node("piazza", PIAZZA)
S.node("castle", CASTLE)
S.node("n_edge", S.snap((3600, S.height)))
S.node("w_edge", S.snap((0, 2200)))
for a, b in [("s_edge", "south"), ("south", "piazza"), ("piazza", "castle"), ("piazza", "n_edge"), ("piazza", "w_edge")]:
    S.road(a, b)

# 時間:21日 07:00〜17:00 の10ターン、夜(17:00〜07:00)を1ターン、22日の10ターン。合わせて21ターン
DAY_TURNS = 10
PER_DAY = DAY_TURNS + 1
MAX_TURNS = PER_DAY + DAY_TURNS

units = [
    # 加第2歩兵旅団:ロイヤル・エドモントン連隊(シーフォースを指揮下に)。カナダの大隊の編成表がないので英の1944年の歩兵大隊で代えた
    unit("ca-leer", "ca", "uk-inf-bn-1944", S.snap((3800, 1100)), 0, training="veteran"),
    unit("ca-seaf", "ca", "uk-inf-bn-1944", S.snap((3200, 1000)), 0, training="veteran"),
    # スリー・リヴァーズ連隊(シャーマン)。町に入った分を M4 の2個中隊とした(**仮置き**)
    unit("ca-3rr", "ca", "ww2f-us-m4-2coy-1944", S.snap((3800, 500)), 0, "column", training="veteran"),
    unit("ca-art", "ca", "uk-field-regt-25pdr", S.snap((2500, 300)), 0),
    # 独第1降下猟兵師団(ハイドリッヒ)の2個大隊。どの連隊の大隊かは資料で確かめられなかった(第3降下猟兵連隊とされることが多い。TODO(要裏取り))。
    # 町の建物を陣地にしている
    unit("fj-a", "fj", "ww2f-de-fj-bn-1943", S.snap((3800, 2200)), 180, training="elite", stance="defense", entrenchment=2),
    unit("fj-b", "fj", "ww2f-de-fj-bn-1943", S.snap((4000, 2900)), 180, training="elite", stance="defense", entrenchment=2),
    unit("fj-art", "fj", "de-art-abt-lefh18", S.snap((1500, 3700)), 135),
]
# プリンセス・パトリシア・カナダ軽歩兵連隊とスリー・リヴァーズの残りは26日に加わったとする資料がある(このシナリオの2日の外)。
# 入れていない(AI 同士で加軍が10戦全勝したため。research/ortona-1943-12.md)
reinforcements = []

objectives = [
    objective("south", "町の南の入口", SOUTH, 1, "fj", 300),
    objective("piazza", "市庁舎の広場", PIAZZA, 2, "fj", 350),
    objective("castle", "城", CASTLE, 2, "fj", 350),
]

S.fill_terrain(19431221, hill=0.12, forest=0.08, scale_m=1200, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives])

scenario = L(
    [
        ("id", "ortona-1943-12-21"),
        ("name", "オルトーナ 1943年12月21〜22日(v0・概略図)"),
        (
            "description",
            "イタリア、アドリア海の岸の町。カナダ軍の2個大隊がシャーマンと町へ入り、建物を陣地にした精鋭の降下猟兵と家から家へ戦う。"
            "市庁舎の広場と北の端の城を、2日でどこまで取れるか。",
        ),
        (
            "notes",
            "v0。町の形・広場・城・道は概略で、丘・木立は自動生成(史実の地形ではない)。125m のセル。カナダ軍は英の歩兵大隊と米の M4 の中隊で代えた。"
            "部隊の位置・降下猟兵の大隊の所属は仮置き。根拠は mods/ww2-fronts/research/ortona-1943-12.md。作り直しは mods/ww2-fronts/tools/build_ortona_1943_12_21.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "uk", "us", "de"]),
                    ("toe", ["ww1-korea-generic", "uk", "us", "de", "ww2f-toe-us", "ww2f-toe-de"]),
                ]
            ),
        ),
        ("sides", [L([("id", "ca"), ("name", "カナダ軍")]), L([("id", "fj"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 7), ("startDate", "1943-12-21")])),
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
                                # カナダ軍:広場と城を取れば限定的、さらに敵に4割の損害を与えれば決定的(2日で町を取りきる)
                                ("ca", L([("decisive", L([("required", ["piazza", "castle"]), ("minEnemyLoss", 0.4)])), ("limited", L([("required", ["piazza", "castle"])]))])),
                                # ドイツ軍:城か広場のどちらかを保てば限定的(町に踏みとどまる)、両方なら決定的(ゲームの設計)
                                ("fj", L([("decisive", L([("required", ["piazza", "castle"])])), ("limited", L([("minWeight", 2)]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("ca", 4), ("fj", 3)])),
                    ("weather", L([("initial", "overcast"), ("changeChancePerHour", 0.08), ("minHoursBetweenChanges", 3), ("improveChance", 0.4), ("allowed", ["clear", "overcast", "rain"])])),
                    ("night", L([("turn", PER_DAY), ("hours", 14), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "ca-s"), ("side", "ca"), ("nodeId", "s_edge"), ("ammoT", 200), ("fuelT", 100)]),
                L([("id", "fj-n"), ("side", "fj"), ("nodeId", "n_edge"), ("ammoT", 150), ("fuelT", 50)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "ca"),
        ("level", "limited"),
        (
            "summary",
            "8日間の家から家への戦いの末、降下猟兵は28日の夜に町を捨てて下がった。ロイヤル・エドモントン連隊の損害は172名(戦死63)、シーフォースは103名(戦死41)とされる。独軍の損害はよく分かっていない。",
        ),
    ]
)
apply_names(scenario, {
    "ca-leer": "ロイヤル・エドモントン連隊",
    "ca-seaf": "シーフォース・ハイランダーズ",
    "ca-3rr": "スリー・リヴァーズ連隊",
    "ca-art": "加第1歩兵師団 砲兵",
        "fj-a": "降下猟兵 甲大隊",
    "fj-b": "降下猟兵 乙大隊",
    "fj-art": "第1降下猟兵師団 砲兵",
})
scenario["formations"] = formations(
    scenario,
    [
        ("ca-1div", "加第1歩兵師団", "ca", None, ["ca-art"]),
        ("ca-2bde", "加第2歩兵旅団", "ca", "ca-1div", ["ca-leer", "ca-seaf"]),
        ("ca-1abde", "加第1機甲旅団", "ca", None, ["ca-3rr"]),
        ("fj-1", "第1降下猟兵師団(ハイドリッヒ)", "fj", None, ["fj-a", "fj-b", "fj-art"]),
    ],
)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT}(規定 {MAX_TURNS} ターン)")
