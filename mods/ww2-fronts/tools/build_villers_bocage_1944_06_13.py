#!/usr/bin/env python3
"""
ヴィレル=ボカージュの戦い 1944年6月13日 のシナリオファイル(v0・概略図)を作る。

    python3 mods/ww2-fronts/tools/build_villers_bocage_1944_06_13.py

出力: mods/ww2-fronts/scenarios/villers-bocage-1944-06-13.json(--out で変えられる)

英第7機甲師団の第22機甲旅団群(ハインド准将)が、カーンの西の隙間を抜けてヴィレル=ボカージュに入り、
先頭の第4カウンティ・オブ・ロンドン・ヨーマンリー(4CLY)の A 中隊が町の東の 213 高地へ上がったところを、
第101SS重戦車大隊のティーガー(ヴィットマンの第2中隊)が待ち伏せる。午後には同じ大隊の第1中隊と装甲教導師団が町へ反撃し、
17時ごろ英軍は町を捨てて西へ下がる。根拠と残りの裏取りは mods/ww2-fronts/research/villers-bocage-1944-06.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/scenarios"))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402
from common import apply_names, formations, objective, output_path, Sketch, unit  # noqa: E402

OUT = output_path(PACK, "scenarios/villers-bocage-1944-06-13.json", "villers-bocage-1944-06-13.json")

S = Sketch(origin=(49.085, -0.635), cols=56, rows=40)  # 14km × 10km

# 町の中心(緯度, 経度)は検索結果の要約(49.08, -0.66)。213 高地は「町の東 1.5〜1.6km、カーンへの国道175号の上」(資料により 2.6km とも)。
# ここでは町から東北東へ 1.8km に置いた(TODO(要裏取り):IGN の地図、Taylor『Villers-Bocage Through the Lens』)
VB = S.at(49.079, -0.661)
P213 = S.offset(VB, 1700, 600)
S.terrain("T", "town")
S.mark(VB, "T", 2)
S.terrain("H", "hill")
S.mark(P213, "H", 1)

# 道路(概略):国道175号(西のコーモンの方 → 町 → 213 高地 → カーン)、北のティイ=シュル=スールの方(装甲教導師団)、南のオネーの方。
# 向きはおよそ。つながりは TODO(要裏取り)
S.node("vb", VB)
S.node("p213", P213)
S.node("w_edge", S.snap((0, VB[1] - 1500)))
S.node("ne_edge", S.edge_point(VB, P213))
S.node("n_edge", S.snap((VB[0] + 1500, S.height)))
S.node("s_edge", S.snap((VB[0] - 500, 0)))
for a, b in [("w_edge", "vb"), ("vb", "p213"), ("p213", "ne_edge"), ("vb", "n_edge"), ("vb", "s_edge")]:
    S.road(a, b)

# 時間:08:00〜20:00 の12ターン(英軍の町への進入は朝、待ち伏せは 09:00 ごろ、撤退の命令は 17:00 ごろ)
MAX_TURNS = 12

units = [
    # 4CLY(クロムウェル・ファイアフライの機甲連隊)。A 中隊(パックの編成表の戦車中隊1つ)は 213 高地へ上がったところで縦隊のまま止まっていた。
    # 残り(連隊本部・偵察・B・C 中隊)は町の中と西で、連隊の戦力0.7。配分は**仮置き**
    unit("uk-4cly-a", "uk", "ww2f-uk-armd-sqn-1944", P213, 60, "column", training="veteran"),
    unit("uk-4cly", "uk", "uk-armd-regt-1944", S.offset(VB, -300, 0), 90, "column", strength=0.7, training="veteran"),
    # 第1狙撃旅団(ライフル・ブリゲード)の A 中隊(自動車化歩兵)。A 中隊の後ろの道路に車列で止まっていた。英の歩兵大隊のライフル中隊1つで代えた(**仮置き**)
    unit("uk-1rb-a", "uk", "ww2f-uk-rifle-coy-1944", S.offset(P213, -700, -250), 60, "column", training="veteran"),
    # 第1/7クイーンズ(第131旅団の歩兵大隊)。町に入った時刻は TODO(要裏取り)。はじめから町の西に置いた
    unit("uk-17q", "uk", "uk-inf-bn-1944", S.offset(VB, -1200, 0), 90, "column"),
    # 第5王立騎馬砲兵(第7機甲師団の砲兵)。実際は自走砲(セクストン)だったとされる(TODO(要裏取り))。25ポンド砲の野砲連隊で代えた
    unit("uk-5rha", "uk", "uk-field-regt-25pdr", S.offset(VB, -3500, -500), 90),
]

# 第101SS重戦車大隊 第2中隊(ヴィットマン)。動けたティーガーは5両ほど(資料による)。パックの編成表の6両の中隊。
# 213 高地の南の林に伏せていた(位置は TODO(要裏取り))
units.append(unit("de-101-2", "de", "ww2f-de-tiger-coy-1944", S.offset(P213, 300, -800), 330, stance="ambush", training="elite"))

# 午後の反撃:同じ大隊の第1中隊(ティーガー8両ほど)が東から、装甲教導師団の IV号戦車が北(ティイの方)から。時刻・数は TODO(要裏取り)。
# 第2装甲師団は14日以降に着いたので入れない
NE, N = S.nodes["ne_edge"], S.nodes["n_edge"]
reinforcements = [
    L([("turn", 4), ("id", "de-101-1"), ("side", "de"), ("toe", "ww2f-de-tiger-coy8-1944"), ("x", NE["x"]), ("y", NE["y"]), ("facing", 240), ("training", "veteran")]),
    L([("turn", 4), ("id", "de-lehr-pz4"), ("side", "de"), ("toe", "ww2f-de-pz4-2coy-1944"), ("x", N["x"]), ("y", N["y"]), ("facing", 200), ("training", "veteran")]),
]

objectives = [
    objective("vb", "ヴィレル=ボカージュ", VB, 3, "uk", 700),
    # 先頭の A 中隊(4CLY)が朝のうちに高地へ上がって止まった(史実)ので、始めから英が持つ
    objective("p213", "213 高地", P213, 2, "uk", 500),
]

# 概略の地形:ボカージュ(生け垣で区切った畑)を森として多めに、起伏を少し。シードからの自動生成で、史実の地形ではない
S.fill_terrain(19440613, hill=0.08, forest=0.22, scale_m=1500, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives])

scenario = L(
    [
        ("id", "villers-bocage-1944-06-13"),
        ("name", "ヴィレル=ボカージュ 1944年6月13日(v0・概略図)"),
        (
            "description",
            "ノルマンディー。英第22機甲旅団群がカーンの西へ回り込み、ヴィレル=ボカージュの町と東の 213 高地を取りに行く。"
            "高地の上で縦隊のまま止まった先頭の中隊を、ティーガーの中隊が待ち伏せる。午後にはティーガーと装甲教導師団の IV号が町へ反撃してくる。",
        ),
        (
            "notes",
            "v0。ボカージュ・起伏は概略の自動生成で、史実の地形ではない。213 高地の位置・道路の向き・部隊の配分と時刻は仮置き。部隊は国ごとの実数の編成表(定数)。"
            "根拠は mods/ww2-fronts/research/villers-bocage-1944-06.md。作り直しは mods/ww2-fronts/tools/build_villers_bocage_1944_06_13.py。",
        ),
        ("packs", L([("rules", "ww1-korea"), ("branches", "ww1-korea"), ("weapons", ["ww1-korea-generic", "uk", "de"]), ("toe", ["ww1-korea-generic", "uk", "de", "ww2f-toe-uk", "ww2f-toe-de"])])),
        ("sides", [L([("id", "uk"), ("name", "イギリス軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 8), ("startDate", "1944-06-13")])),
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
                                # 英軍:町と 213 高地の両方を保てば限定的(旅団の任務は高地を取ってカーンの背後へ出ること)、さらに敵に2割の損害で決定的。ゲームの設計
                                ("uk", L([("decisive", L([("required", ["vb", "p213"]), ("minEnemyLoss", 0.2)])), ("limited", L([("required", ["vb", "p213"])]))])),
                                # 独軍:町か高地のどちらかを取れば限定的(英軍の突進を止める)、両方なら決定的
                                ("de", L([("decisive", L([("required", ["vb", "p213"])])), ("limited", L([("minWeight", 2)]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("uk", 4), ("de", 3)])),
                    ("weather", L([("initial", "overcast"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast"])])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "uk-w"), ("side", "uk"), ("nodeId", "w_edge"), ("ammoT", 200), ("fuelT", 200)]),
                L([("id", "de-ne"), ("side", "de"), ("nodeId", "ne_edge"), ("ammoT", 150), ("fuelT", 100)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "de"),
        ("level", "limited"),
        (
            "summary",
            "待ち伏せで 4CLY の A 中隊と先頭の車列が失われ、午後の反撃のあと英軍は17時ごろ町を捨てて西へ下がった。"
            "英軍の損害は戦車23〜27両ほど、独軍はティーガーを含む戦車8〜15両ほどとされる(資料により幅がある)。",
        ),
    ]
)
apply_names(scenario, {
    "uk-4cly-a": "4CLY A 中隊",
    "uk-4cly": "第4カウンティ・オブ・ロンドン・ヨーマンリー",
    "uk-1rb-a": "第1狙撃旅団 A 中隊",
    "uk-17q": "第1/7クイーンズ",
    "uk-5rha": "第5王立騎馬砲兵",
    "de-101-2": "第101SS重戦車大隊 第2中隊",
    "de-101-1": "第101SS重戦車大隊 第1中隊",
    "de-lehr-pz4": "装甲教導師団 IV号戦車",
})
scenario["formations"] = formations(
    scenario,
    [
        ("uk-7ad", "第7機甲師団", "uk", None, ["uk-5rha"]),
        ("uk-22", "第22機甲旅団群", "uk", "uk-7ad", ["uk-4cly-a", "uk-4cly", "uk-1rb-a", "uk-17q"]),
        ("de-101", "第101SS重戦車大隊", "de", None, ["de-101-2", "de-101-1"]),
        ("de-lehr", "装甲教導師団", "de", None, ["de-lehr-pz4"]),
    ],
)
# 史実の指揮官(確かめた人だけ。tools/scenarios/historical_commanders.py)
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT}(規定 {MAX_TURNS} ターン)")
