#!/usr/bin/env python3
"""
ラセイニャイの戦い 1941年6月24日 のシナリオファイル(v0・概略図)を作る。

    python3 mods/ww2-fronts/tools/build_raseiniai_1941_06_24.py

出力: mods/ww2-fronts/scenarios/raseiniai-1941-06-24.json(--out で変えられる)

バルバロッサ作戦の3日目。独第6装甲師団のラウス戦闘団がドゥビサ川に橋頭堡を作ったところへ、ソ第3機械化軍団の第2戦車師団(ソリャンキン)が
KV-1・KV-2 の重戦車で反撃する。独の 35(t)・38(t) の 37mm 砲は KV の装甲を抜けず、交差点に居座った1両の KV が橋頭堡への補給を1日止めた。
根拠と残りの裏取りは mods/ww2-fronts/research/raseiniai-1941-06.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/scenarios"))
from common import apply_names, formations, objective, output_path, Sketch, unit  # noqa: E402

OUT = output_path(PACK, "scenarios/raseiniai-1941-06-24.json", "raseiniai-1941-06-24.json")

S = Sketch(origin=(55.39, 23.20), cols=72, rows=48)  # 18km × 12km

# 位置はどれも見つからなかった(TODO(要裏取り):1941年のドイツ軍の地図、Raus『Panzer Operations』の付図)。
# 町は 55.38, 23.12 とおき(**低**)、ドゥビサ川を町の東 7km に南北の線で、橋頭堡をその東岸に、KV が居座った交差点を町と橋の間に置いた(どれも概略)
TOWN = S.at(55.38, 23.12)
BRIDGE = S.offset(TOWN, 7000, 1500)
XROADS = S.offset(TOWN, 2500, 600)
HEAD = S.offset(BRIDGE, 1500, 0)

S.terrain("T", "town")
S.mark(TOWN, "T", 2)
S.terrain("R", "river")
RIVER = [S.snap((BRIDGE[0] - 600, S.height)), S.snap((BRIDGE[0], BRIDGE[1])), S.snap((BRIDGE[0] + 400, 0))]
S.line(RIVER, "R", 0)

S.node("town", TOWN)
S.node("xroads", XROADS)
S.node("bridge_w", S.offset(BRIDGE, -400, 0))
S.node("bridge_e", S.offset(BRIDGE, 400, 0))
S.node("head", HEAD)
S.node("w_edge", S.snap((0, TOWN[1])))
S.node("e_edge", S.snap((S.width, HEAD[1] + 1500)))
S.node("ne_edge", S.snap((S.width - 2000, S.height)))
S.node("sw_edge", S.snap((TOWN[0] + 2000, 0)))
for a, b in [("w_edge", "town"), ("town", "xroads"), ("xroads", "bridge_w"), ("bridge_w", "bridge_e"), ("bridge_e", "head"), ("head", "e_edge"), ("head", "ne_edge"), ("xroads", "sw_edge")]:
    S.road(a, b)

# 時間:24日 06:00〜20:00 の14ターン(夏至のころで昼が長い。戦いは23〜27日)
MAX_TURNS = 14

units = [
    # ラウス戦闘団:第11戦車連隊(35(t) が多い。装備品の一覧にないので 38(t) の大隊で代えた。TODO(要裏取り))、第4狙撃兵連隊の1個大隊、
    # 第76砲兵連隊の2個大隊(1つで代えた)、第411高射砲連隊の 8.8cm の中隊(KV を撃つために呼ばれた)
    unit("de-pz11-1", "de", "de-pz-abt-1940-38t", S.offset(HEAD, 300, 1200), 90, training="veteran"),
    unit("de-pz11-2", "de", "de-pz-abt-1940-38t", S.offset(HEAD, 300, -1200), 90, training="veteran"),
    unit("de-sr4", "de", "ww2f-de-inf-bn-1941", HEAD, 90, training="veteran", entrenchment=1),
    unit("de-ar76", "de", "de-art-abt-lefh18", S.offset(BRIDGE, -2500, 1500), 90),
    unit("de-flak", "de", "de-flak88-bty-1940", S.offset(BRIDGE, -1500, -500), 270),
    # 交差点の KV(第2戦車師団 第4戦車連隊の第1大隊 第3中隊のものという説がある)。橋頭堡の背後の道路の上に居座る
    unit("su-kv-x", "su", "ww2f-su-kv-single-1941", XROADS, 90),
]

# 第2戦車師団の反撃:KV の大隊2・BT-7 の大隊2・自動車化狙撃兵の大隊2・砲兵。東と北東から。到着の時刻・数・配分は TODO(要裏取り)
E, NE = S.nodes["e_edge"], S.nodes["ne_edge"]
EP = (E["x"], E["y"])
units += [
    unit("su-kv-1", "su", "ww2f-su-kv-bn-1941", S.offset(EP, -1000, 0), 270, "column"),
    unit("su-bt-1", "su", "su-bt-tank-bn-1941", S.offset(EP, -1000, -2000), 270, "column", training="green"),
    unit("su-mr-1", "su", "ww2f-su-rifle-bn-1941", S.offset(EP, -500, 1500), 270, "column", training="green"),
]
reinforcements = [
    L([("turn", 3), ("id", "su-kv-2"), ("side", "su"), ("toe", "ww2f-su-kv-bn-1941"), ("x", NE["x"]), ("y", NE["y"]), ("facing", 200)]),
    L([("turn", 3), ("id", "su-bt-2"), ("side", "su"), ("toe", "su-bt-tank-bn-1941"), ("x", NE["x"] - 1000), ("y", NE["y"]), ("facing", 200), ("training", "green")]),
    L([("turn", 4), ("id", "su-mr-2"), ("side", "su"), ("toe", "ww2f-su-rifle-bn-1941"), ("x", E["x"]), ("y", E["y"]), ("facing", 270), ("training", "green")]),
    L([("turn", 4), ("id", "su-art"), ("side", "su"), ("toe", "su-art-bn-m30"), ("x", E["x"]), ("y", E["y"] - 1000), ("facing", 270), ("training", "green")]),
]

objectives = [
    objective("head", "ドゥビサ川の橋頭堡", HEAD, 3, "de", 800),
    objective("bridge", "ドゥビサ川の橋", BRIDGE, 2, "de", 500),
    objective("xroads", "ラセイニャイ前の交差点", XROADS, 1, "su", 400),
]

# 概略の地形:森と沼(森で代えた)と緩い起伏。シードからの自動生成で、史実の地形ではない
S.fill_terrain(19410624, hill=0.05, forest=0.18, scale_m=2500, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives])

scenario = L(
    [
        ("id", "raseiniai-1941-06-24"),
        ("name", "ラセイニャイ 1941年6月24日(v0・概略図)"),
        (
            "description",
            "リトアニア、バルバロッサ作戦の3日目。独第6装甲師団のラウス戦闘団が作ったドゥビサ川の橋頭堡へ、ソ第2戦車師団の KV 重戦車が押し寄せる。"
            "独の軽戦車の 37mm 砲は KV の装甲を抜けない。8.8cm の高射砲と砲兵で、どこまで橋頭堡を保てるか。背後の交差点には KV が1両居座っている。",
        ),
        (
            "notes",
            "v0。町・川・橋頭堡・交差点の位置は概略で、森・起伏は自動生成(史実の地形ではない)。35(t) は 38(t) で、KV-2 は KV-1 で代えた。部隊の配分・到着の時刻は仮置き。"
            "根拠は mods/ww2-fronts/research/raseiniai-1941-06.md。作り直しは mods/ww2-fronts/tools/build_raseiniai_1941_06_24.py。",
        ),
        ("packs", L([("rules", "ww1-korea"), ("branches", "ww1-korea"), ("weapons", ["ww1-korea-generic", "de", "su"]), ("toe", ["ww1-korea-generic", "de", "su", "ww2f-toe-de", "ww2f-toe-su"])])),
        ("sides", [L([("id", "de"), ("name", "ドイツ軍")]), L([("id", "su"), ("name", "ソ連軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 6), ("startDate", "1941-06-24")])),
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
                                # 独軍:橋頭堡と橋を保てば限定的、交差点も取り返して補給路を開けば決定的
                                ("de", L([("decisive", L([("required", ["head", "bridge", "xroads"])])), ("limited", L([("required", ["head", "bridge"])]))])),
                                # ソ連軍:目標の重みの合計2以上(橋か橋頭堡のどちらか。交差点は1)で限定的、両方取れば決定的(ゲームの設計)
                                ("su", L([("decisive", L([("required", ["head", "bridge"])])), ("limited", L([("minWeight", 2)]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("de", 4), ("su", 3)])),
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast"])])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "de-w"), ("side", "de"), ("nodeId", "w_edge"), ("ammoT", 200), ("fuelT", 200)]),
                L([("id", "su-e"), ("side", "su"), ("nodeId", "e_edge"), ("ammoT", 150), ("fuelT", 150)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "de"),
        ("level", "decisive"),
        (
            "summary",
            "橋頭堡は KV の攻撃に耐え、交差点の KV は25日に 8.8cm 砲と工兵の爆薬で仕留められた。第2戦車師団は燃料と弾薬が尽きて包囲され、26日までにほぼ全滅した。",
        ),
    ]
)
apply_names(scenario, {
    "de-pz11-1": "第11戦車連隊 I",
    "de-pz11-2": "第11戦車連隊 II",
    "de-sr4": "第4狙撃兵連隊の大隊",
    "de-ar76": "第76砲兵連隊",
    "de-flak": "8.8cm 高射砲中隊",
    "su-kv-x": "交差点の KV",
    "su-kv-1": "重戦車大隊(KV)1",
    "su-kv-2": "重戦車大隊(KV)2",
    "su-bt-1": "快速戦車大隊(BT-7)1",
    "su-bt-2": "快速戦車大隊(BT-7)2",
    "su-mr-1": "自動車化狙撃兵大隊 1",
    "su-mr-2": "自動車化狙撃兵大隊 2",
    "su-art": "第2榴弾砲連隊",
})
scenario["formations"] = formations(
    scenario,
    [
        ("de-6pz", "第6装甲師団", "de", None, []),
        ("de-raus", "ラウス戦闘団", "de", "de-6pz", ["de-pz11-1", "de-pz11-2", "de-sr4", "de-ar76", "de-flak"]),
        ("su-3mk", "第3機械化軍団", "su", None, []),
        ("su-2td", "第2戦車師団(ソリャンキン)", "su", "su-3mk", ["su-kv-x", "su-kv-1", "su-kv-2", "su-bt-1", "su-bt-2", "su-mr-1", "su-mr-2", "su-art"]),
    ],
)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT}(規定 {MAX_TURNS} ターン)")
