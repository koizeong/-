#!/usr/bin/env python3
"""
プロホロフカ 1943年7月12日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_prokhorovka_1943_07_12.py

出力: data/scenarios/prokhorovka-1943-07-12.json

ソ連第5親衛戦車軍の第18・第29戦車軍団が、朝から波のように、プロホロフカの南西でSS第2装甲軍団(ライプシュタンダルテ・ダス・ライヒ)に突っ込む。
T-34・T-70 の数はソ連が多いが、独のティーガー・IV号の長砲身と、待ち構える陣地が相手になる。
部隊は国ごとの実数の編成表(data/toe/de.json・su.json)を使う。根拠と残りの裏取りは docs/research/prokhorovka-1943-07.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/prokhorovka-1943-07-12.json"

S = Sketch(origin=(50.99, 36.68), cols=64, rows=64)  # 16km × 16km

# 村(緯度, 経度)。出典はロシア語版 Wikipedia ほかの検索結果の要約(docs/research/prokhorovka-1943-07.md)。
# 252.2高地・十月国営農場・コムソモーレツ国営農場・プショール川・鉄道は座標が確かめられず入れていない(TODO(要裏取り))
TOWNS = L(
    [
        ("prokhorovka", ("プロホロフカ", 51.0364, 36.7364)),
        ("yamki", ("ヤムキ", 51.0103, 36.6894)),
        ("petrovka", ("ペトロフカ", 51.0500, 36.6422)),
        ("belenikhino", ("ベレニヒノ", 50.9408, 36.6219)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in TOWNS.items()}

S.terrain("T", "town")
for k in P:
    S.mark(P[k], "T", 2 if k == "prokhorovka" else 0)

# 道路(概略。村どうしを直線で結んだもの。TODO(要裏取り))
for k in P:
    S.node(k, P[k])
S.node("ne_edge", S.snap((S.width, S.height)))  # ソ連軍の後方
S.node("e_edge", S.snap((S.width, P["prokhorovka"][1] - 3000)))
S.node("sw_edge", S.snap((0, 0)))  # 独軍の後方(テテレヴィノ・ベルゴロド方面)
S.node("w_edge", S.snap((0, P["petrovka"][1])))
for a, b in [
    ("ne_edge", "prokhorovka"),
    ("e_edge", "prokhorovka"),
    ("prokhorovka", "yamki"),
    ("yamki", "belenikhino"),
    ("yamki", "petrovka"),
    ("prokhorovka", "petrovka"),
    ("belenikhino", "sw_edge"),
    ("petrovka", "w_edge"),
    ("yamki", "sw_edge"),
]:
    S.road(a, b)

# 時間:ソ連の攻撃は 08:30 ごろ始まった(TODO(要裏取り))。08:00〜21:00 の13ターン
MAX_TURNS = 13

PR, YA = P["prokhorovka"], P["yamki"]
units = [
    # ソ連第5親衛戦車軍。第29戦車軍団(鉄道沿い)・第18戦車軍団(プショール川沿い)の旅団を、1942年の戦車旅団(T-34 32・T-70 21・自動車化狙撃兵大隊)で表す。
    # 旅団の数(各軍団3)は広く知られた形。位置は資料で確かめていない(TODO(要裏取り):Zamulin『Demolishing the Myth』の地図)
    unit("su-29tc-25", "su", "su-tank-bde-1942", S.offset(PR, -1500, -2500), 225),
    unit("su-29tc-31", "su", "su-tank-bde-1942", S.offset(PR, -500, -1500), 225),
    unit("su-29tc-32", "su", "su-tank-bde-1942", S.offset(PR, 500, -2500), 225),
    unit("su-29tc-1446", "su", "su-sp-regt-su76", S.offset(PR, 500, -500), 225),
    unit("su-18tc-181", "su", "su-tank-bde-1942", S.offset(PR, -2500, 1000), 240),
    unit("su-18tc-170", "su", "su-tank-bde-1942", S.offset(PR, -1500, 1500), 240),
    unit("su-18tc-110", "su", "su-tank-bde-1942", S.offset(PR, -500, 2000), 240),
    # 第9親衛空挺師団(狙撃兵の連隊として):プロホロフカの前で守っていた(TODO(要裏取り))
    unit("su-9gad-26", "su", "su-rifle-regt-1942", S.offset(PR, -2500, -500), 225, training="veteran"),
    unit("su-9gad-28", "su", "su-rifle-regt-1942", S.offset(PR, -1000, 500), 225, training="veteran"),
    unit("su-arty", "su", "su-art-bn-m30", S.offset(PR, 1500, 1000), 225),
    # 独SS第2装甲軍団。ライプシュタンダルテ(11日夜に戦車56両)はヤムキの南西で、ソ連の戦車を待ち構える。ダス・ライヒ(61両)はベレニヒノの方
    # ライプシュタンダルテは12日の朝、守りの構えでソ連の攻撃を受けた(陣地レベル2・1 は**仮置き**。TODO(要裏取り):Nipe『Blood, Steel, and Myth』)。
    # 突撃砲大隊は III号突撃砲の大隊の戦力0.4(約12両)の**仮置き**(両数は TODO)
    unit("de-lah-pz", "de", "de-ss-pz-regt-1943", S.offset(YA, -1500, -1500), 45, training="veteran", entrenchment=1),
    unit("de-lah-pgr1", "de", "de-pzgr-regt-1943", S.offset(YA, 0, 0), 45, training="veteran", entrenchment=2),
    unit("de-lah-pgr2", "de", "de-pzgr-regt-1943", S.offset(YA, -2500, 500), 45, training="veteran", entrenchment=2),
    unit("de-lah-stug", "de", "de-stug-abt-1942", S.offset(YA, -1500, 0), 45, training="veteran", entrenchment=1, strength=0.4),
    unit("de-dr-pz", "de", "de-ss-pz-regt-1943", S.offset(P["belenikhino"], 1500, 1500), 45, training="veteran", entrenchment=1),
    unit("de-dr-pgr", "de", "de-pzgr-regt-1943", S.offset(P["belenikhino"], 2500, 500), 45, training="veteran", entrenchment=2),
    # トーテンコップの戦車連隊:11日に94両、12日の夜明けにプショール川を渡って北から攻めた(中:warhistory.org、Nipe)。
    # ここでは川を表していないので、ペトロフカの西に置く(位置は TODO(要裏取り))。編成はライプシュタンダルテの戦車連隊の形で代えた
    unit("de-tk-pz", "de", "de-ss-pz-regt-1943", S.offset(P["petrovka"], -2500, 500), 90, training="veteran"),
    unit("de-tk-pgr", "de", "de-pzgr-regt-1943", S.offset(P["petrovka"], -2500, -1000), 90, training="veteran"),
    unit("de-arty", "de", "de-art-abt-sfh18", S.offset(YA, -4000, -3000), 45),
]

objectives = [
    objective("prokhorovka", "プロホロフカ", PR, 3, "su", 800),
    # ヤムキは12日朝の独の前線のあたり(座標から見ると、プロホロフカの南西約4km。252.2高地・十月国営農場と同じ方向)。独軍が持っていたとした**仮置き**(TODO(要裏取り))
    objective("yamki", "ヤムキ", YA, 1, "de"),
    objective("petrovka", "ペトロフカ", P["petrovka"], 1, "su"),
    objective("belenikhino", "ベレニヒノ", P["belenikhino"], 1, None),
]

scenario = L(
    [
        ("id", "prokhorovka-1943-07-12"),
        ("name", "プロホロフカ 1943年7月12日(v0・概略図)"),
        (
            "description",
            "クルスク南部。ソ連第5親衛戦車軍の T-34・T-70 の旅団が、朝からSS第2装甲軍団のティーガー・IV号に向かって突っ込む。"
            "独軍はプロホロフカを取れば突破、ソ連軍は守り抜いて独の戦車を削れば勝ち。",
        ),
        (
            "notes",
            "v0。地図は座標が確かめられた4つの村だけ(252.2高地・十月国営農場・プショール川・鉄道は未確認のため入れていない)。"
            "部隊は国ごとの実数の編成表(定数)で、ソ連の戦車旅団は1942年の形(T-34 32・T-70 21)、独の戦車連隊は11日夜のライプシュタンダルテの両数。"
            "勝利条件・指揮ポイント・補給量は仮置き。根拠は docs/research/prokhorovka-1943-07.md。作り直しは tools/scenarios/build_prokhorovka_1943_07_12.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "de", "su"]),
                    ("toe", ["ww1-korea-generic", "de", "su"]),
                ]
            ),
        ),
        ("sides", [L([("id", "su"), ("name", "ソ連軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 8), ("startDate", "1943-07-12")])),
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
                                # ソ連軍:攻める側だが、目的は独の突破を止めること(ゲームの設計)。急ぎ度 0.8(朝の反撃を命じられた)
                                # ソ連軍:独軍をヤムキから押し戻せば限定的、ベレニヒノまで取れば決定的
                                ("su", L([("decisive", L([("required", ["prokhorovka", "yamki", "belenikhino"])])), ("limited", L([("required", ["prokhorovka", "yamki"])])), ("urgency", 0.8)])),
                                # 独軍:プロホロフカを取れば決定的。ベレニヒノを保ち、ヤムキかペトロフカも保てば限定的(ソ連の反撃を止めた)
                                ("de", L([("decisive", L([("required", ["prokhorovka"])])), ("limited", L([("required", ["belenikhino"]), ("minWeight", 2)]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("su", 5), ("de", 4)])),
                    # 天候:12日は曇りで雨があったとされる(TODO(要裏取り))
                    ("weather", L([("initial", "overcast"), ("changeChancePerHour", 0.1), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast", "rain"])])),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "su-ne"), ("side", "su"), ("nodeId", "ne_edge"), ("ammoT", 400), ("fuelT", 300)]),
                L([("id", "de-sw"), ("side", "de"), ("nodeId", "sw_edge"), ("ammoT", 300), ("fuelT", 200)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "su"),
        ("level", "limited"),
        ("summary", "ソ連の戦車軍は大きな損害(1日で約340両とする資料も)を出したが、独軍はプロホロフカに届かず、数日後に攻勢をやめた。独の損害は戦車約80両とされる。"),
    ]
)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
