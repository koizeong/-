#!/usr/bin/env python3
"""
アラスの反撃 1940年5月21日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_arras_1940_05_21.py

出力: data/scenarios/arras-1940-05-21.json

英第1陸軍戦車旅団(第4・第7王立戦車連隊のマチルダ I・II)と第151旅団の2個大隊(第6・第8ダラム軽歩兵)が、
アラスの南西を回って、独第7装甲師団(ロンメル)とSSトーテンコップ師団の側面を突く。
独の 37mm 対戦車砲はマチルダを止められず、ロンメルが 10.5cm 榴弾砲と 8.8cm 高射砲で急ごしらえの砲列を作って止めた。
部隊は国ごとの実数の編成表(data/toe/uk.json・de.json)を使う。根拠と残りの裏取りは docs/research/arras-1940-05.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/arras-1940-05-21.json"

S = Sketch(origin=(50.265, 2.735), cols=72, rows=56)  # 18km × 14km

# 村(緯度, 経度)。出典は検索結果の要約(docs/research/arras-1940-05.md)。フィシューは座標が見つからず入れていない
TOWNS = L(
    [
        ("arras", ("アラス", 50.292, 2.780)),
        ("duisans", ("デュイザン", 50.3083, 2.6853)),
        ("dainville", ("ダンヴィル", 50.281, 2.722)),
        ("warlus", ("ワルリュ", 50.275, 2.667)),
        ("berneville", ("ベルヌヴィル", 50.2664, 2.6722)),
        ("achicourt", ("アシクール", 50.273, 2.757)),
        ("agny", ("アニー", 50.2605, 2.7584)),
        ("beaurains", ("ボーラン", 50.263, 2.787)),
        ("wailly", ("ワイイ", 50.247, 2.723)),
        ("mercatel", ("メルカテル", 50.2361, 2.7964)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in TOWNS.items()}

S.terrain("T", "town")
for k in P:
    S.mark(P[k], "T", 3 if k == "arras" else 0)

# 道路(概略。村どうしを直線で結んだもの。つながりは TODO(要裏取り):1940年の地図、Saunders『Arras Counter-Attack 1940』)
for k in P:
    S.node(k, P[k])
S.node("north_edge", S.snap((P["duisans"][0] + 2000, S.height)))  # 英軍の集結地(ヴィミー・マロイユ方面)
S.node("nw_edge", S.snap((0, P["duisans"][1] + 1000)))  # 独第25戦車連隊の来た方向(アク方面)
S.node("sw_edge", S.snap((0, P["wailly"][1] - 1500)))  # 独第7装甲師団の後方(ボーメ方面)
S.node("se_edge", S.snap((S.width, P["mercatel"][1] - 1500)))  # 独軍の後方(バポーム方面)
for a, b in [
    ("north_edge", "duisans"),
    ("north_edge", "arras"),
    ("duisans", "warlus"),
    ("duisans", "dainville"),
    ("arras", "dainville"),
    ("dainville", "warlus"),
    ("warlus", "berneville"),
    ("berneville", "wailly"),
    ("dainville", "achicourt"),
    ("arras", "achicourt"),
    ("achicourt", "agny"),
    ("agny", "wailly"),
    ("achicourt", "beaurains"),
    ("arras", "beaurains"),
    ("beaurains", "mercatel"),
    ("wailly", "mercatel"),
    ("nw_edge", "duisans"),
    ("sw_edge", "wailly"),
    ("se_edge", "mercatel"),
]:
    S.road(a, b)

# 時間:反撃は14時ごろに始まり、夕方に独の砲列と第25戦車連隊の逆襲で止まった。14:00〜21:00 の7ターン。
# TODO(要裏取り):開始の時刻(14:30 とする資料もある)と日の入り
MAX_TURNS = 7

D, W = P["duisans"], P["wailly"]
units = [
    # 右縦隊:第7王立戦車連隊・第8ダラム軽歩兵・第260対戦車中隊(Wikipedia)。出発線(アラス〜ドゥラン街道のあたり。TODO(要裏取り))のデュイザンから南へ
    unit("uk-7rtr", "uk", "uk-7rtr-1940", S.offset(D, 500, 500), 200),
    unit("uk-8dli", "uk", "uk-inf-bn-1941", S.offset(D, -500, 1000), 200),
    unit("uk-260-at", "uk", "uk_antitank_battery_1941", S.offset(D, 0, 1500), 200),
    # 左縦隊:第4王立戦車連隊・第6ダラム軽歩兵。ダンヴィル → アシクール → アニー → ボーラン(warfarehistorynetwork)
    unit("uk-4rtr", "uk", "uk-4rtr-1940", S.offset(P["dainville"], 500, 500), 180),
    unit("uk-6dli", "uk", "uk-inf-bn-1941", S.offset(P["dainville"], 1500, 1000), 180),
    # 独第7装甲師団の第6・第7狙撃兵連隊はワイイの付近で行軍中(ロンメルはワイイで英の右縦隊に出くわした)。
    # 自動車化の狙撃兵連隊を1939〜41年の歩兵連隊の実数で代えた(TODO(要裏取り):1940年の狙撃兵連隊の KStN)
    unit("de-7pz-sr7", "de", "de-ir-1939", S.offset(W, -1500, -500), 20, "column"),
    unit("de-7pz-sr6", "de", "de-ir-1939", S.offset(W, 2000, -1000), 340, "column"),
    unit("de-7pz-art", "de", "de-art-abt-lefh18", S.offset(W, 0, -3000), 0),
    unit("de-7pz-flak", "de", "de-flak88-bty-1940", S.offset(W, 0, -800), 0),
    # SSトーテンコップ師団の一部はワルリュ・ベルヌヴィルの方。英の戦車に押されて崩れた(Wikipedia)→ 未熟
    unit("de-sstk", "de", "de-ir-1939", S.offset(P["berneville"], -1000, -1500), 20, "column", training="green"),
]
# 増援:独第25戦車連隊は北西(アクの方)から英軍の側面・後方を突いた(warfarehistorynetwork)。着いた時刻は TODO(要裏取り)。17時ごろとした
NW = S.nodes["nw_edge"]
reinforcements = [
    L([("turn", 4), ("id", "de-25-pz"), ("side", "de"), ("toe", "de-pz-abt-1940-38t"), ("x", NW["x"]), ("y", NW["y"]), ("facing", 120)]),
]

# 目標:英軍は南へ突き抜けて、独軍の先鋒を断つ。重みはゲームの設計
objectives = [
    objective("arras", "アラス", P["arras"], 2, "uk", 900),
    objective("duisans", "デュイザン", D, 1, "uk"),
    objective("dainville", "ダンヴィル", P["dainville"], 1, "uk"),
    objective("warlus", "ワルリュ", P["warlus"], 1, None),
    objective("agny", "アニー", P["agny"], 1, None),
    objective("beaurains", "ボーラン", P["beaurains"], 1, None),
    objective("wailly", "ワイイ", W, 2, "de"),
    objective("mercatel", "メルカテル", P["mercatel"], 1, "de"),
]

scenario = L(
    [
        ("id", "arras-1940-05-21"),
        ("name", "アラスの反撃 1940年5月21日(v0・概略図)"),
        (
            "description",
            "マチルダ歩兵戦車の反撃。英第1陸軍戦車旅団とダラム軽歩兵の2縦隊が、アラスの南西でロンメルの第7装甲師団とSSトーテンコップの側面を突く。"
            "独の 37mm 対戦車砲はマチルダに通らない。止められるのは 10.5cm 榴弾砲と 8.8cm 高射砲の砲列と、北西から戻ってくる第25戦車連隊だけ。",
        ),
        (
            "notes",
            "v0。地図は資料で座標が確かめられた村だけで、道路は直線の概略。川(スカルプ川・クランション川)・高地(テレグラフの丘)は座標が確かめられず入れていない。"
            "部隊は国ごとの実数の編成表(定数)。勝利条件・指揮ポイント・補給量は史実ではない仮置き。根拠は docs/research/arras-1940-05.md。"
            "作り直しは tools/scenarios/build_arras_1940_05_21.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "ww2-1944-us-de", "ww2-pacific", "uk", "de"]),
                    ("toe", ["ww1-korea-generic", "ww2-1944-us-de", "ww2-pacific", "uk", "de"]),
                ]
            ),
        ),
        ("sides", [L([("id", "uk"), ("name", "英軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 14), ("startDate", "1940-05-21")])),
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
                                # 英軍:南へ突き抜けて独の先鋒を断つ(ゲームの設計)。急ぎ度:包囲されかけた中の限られた時間の反撃 → 0.7
                                ("uk", L([("decisive", L([("required", ["wailly", "mercatel"])])), ("limited", L([("required", ["arras"]), ("minWeight", 6)])), ("urgency", 0.7)])),
                                # 独軍:ワイイを保ち、英の戦車に損害を与える(史実は反撃を止め、英軍は夜に下がった)
                                ("de", L([("decisive", L([("required", ["wailly", "mercatel"]), ("minEnemyLoss", 0.3)])), ("limited", L([("required", ["wailly"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("uk", 4), ("de", 4)])),
                    # 天候は TODO(要裏取り)。晴れとした
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast"])])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "uk-north"), ("side", "uk"), ("nodeId", "north_edge"), ("ammoT", 200), ("fuelT", 120)]),
                L([("id", "de-sw"), ("side", "de"), ("nodeId", "sw_edge"), ("ammoT", 200), ("fuelT", 120)]),
                L([("id", "de-se"), ("side", "de"), ("nodeId", "se_edge"), ("ammoT", 150), ("fuelT", 80)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "de"),
        ("level", "limited"),
        ("summary", "英軍はダンヴィル・アシクール・アニー・ボーランまで進んだが、ロンメルの砲列と第25戦車連隊に止められ、夜に下がった。翌日動けたのはマチルダ I 26両・II 2両。"),
    ]
)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
