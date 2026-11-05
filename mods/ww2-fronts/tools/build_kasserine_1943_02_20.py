#!/usr/bin/env python3
"""
カセリーヌ峠の戦い 1943年2月20日 のシナリオファイル(v0・概略図)を作る。

    python3 mods/ww2-fronts/tools/build_kasserine_1943_02_20.py

出力: mods/ww2-fronts/scenarios/kasserine-1943-02-20.json(--out で変えられる)

チュニジア。グラン・ドルサル山脈の幅3kmほどの切れ目を、米第19工兵連隊と第26連隊戦闘団(スターク部隊)が守り、
ロンメルのアフリカ軍団戦闘団(ビューロヴィウス)と伊チェンタウロ師団が、19日に続いて20日に押し破る。午後には第10装甲師団が加わる。
米第1機甲師団の B 戦闘団(ロビネット)はテベッサへの道を塞ぎに来る。根拠と残りの裏取りは mods/ww2-fronts/research/kasserine-1943-02.md。
"""

import json
import math
import sys
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/scenarios"))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402
from common import apply_names, formations, objective, output_path, Sketch, unit  # noqa: E402

OUT = output_path(PACK, "scenarios/kasserine-1943-02-20.json", "kasserine-1943-02-20.json")

S = Sketch(origin=(35.22, 8.78), cols=64, rows=48)  # 16km × 12km

# 位置は座標が見つからなかったので、峠を南東から北西へ抜ける軸で描いた概略図(TODO(要裏取り):1943年の米軍の地図、
# Howe『Northwest Africa』(米陸軍公刊戦史)第23章の付図)。峠の幅は「2マイルの切れ目」に合わせて2.4km
PC = (8000, 6000)  # 峠の真ん中
AX = (1 / math.sqrt(2), -1 / math.sqrt(2))  # 軸の向き(+ が南東)
PR = (1 / math.sqrt(2), 1 / math.sqrt(2))  # 軸に直角(北東側が +)


def raw(d, side=0.0, base=PC):
    """軸に沿って d、横へ side 離れた点(地図の外でもよい。線を描くとき用)"""
    return (round(base[0] + AX[0] * d + PR[0] * side), round(base[1] + AX[1] * d + PR[1] * side))


def along(d, side=0.0, base=PC):
    return S.snap(raw(d, side, base))


S.terrain("H", "hill")
S.terrain("X", "impassable_high")
S.terrain("R", "river")
S.terrain("T", "town")
# 北東のセママ山・南西のシャンビ山(名前は資料による。形は概略)。峠の両側に、すそ野の高地と、越えられない峰
for side in (+1, -1):
    ridge = [raw(-12000, side * 2900), raw(12000, side * 2900)]
    S.line(ridge, "H", 6)
    S.line(ridge, "X", 3)
# 峠の中を流れるハタブ川(位置は概略)
S.line([raw(-6000, -500), raw(6000, -500)], "R", 0)

KAS = along(5000, 0)  # 峠の南東の口(カセリーヌの村の方)
EXIT = along(-3000, 0)  # 北西の口。ここで道がタラ(北)とテベッサ(西)へ分かれる
S.mark(KAS, "T", 1)

S.node("se_edge", along(9000, 0))
S.node("kas", KAS)
S.node("pass", PC)
S.node("exit", EXIT)
S.node("thala", S.snap((EXIT[0] + 1500, S.height)))
S.node("tebessa", S.snap((0, EXIT[1] - 1000)))
for a, b in [("se_edge", "kas"), ("kas", "pass"), ("pass", "exit"), ("exit", "thala"), ("exit", "tebessa")]:
    S.road(a, b)

# 時間:20日 06:00〜20:00 の14ターン(夕方・宵まで押す)
MAX_TURNS = 14

units = [
    # 第19工兵連隊(2個大隊。峠のいちばん狭い所)。歩兵として戦ったので歩兵大隊で代えた。実戦は初めて(未熟)
    unit("us-19e-1", "us", "ww2f-us-inf-bn-1942", along(300, 800), 135, training="green"),
    unit("us-19e-2", "us", "ww2f-us-inf-bn-1942", along(800, -700), 135, training="green"),
    # 第26歩兵連隊の第1大隊(タラへの道の側)
    unit("us-1-26", "us", "ww2f-us-inf-bn-1942", along(-1200, 900), 135, training="green"),
    # 戦車の中隊(第13機甲連隊からの分遣とされるが未確認。TODO(要裏取り))と砲兵
    unit("us-13ar", "us", "ww2f-us-lee-coy-1942", along(-1800, -300), 135),
    unit("us-fa", "us", "us-fa-bn-105", along(-4000, 600), 135),
    # アフリカ軍団戦闘団(ビューロヴィウス):第33偵察大隊、アフリカ装甲擲弾兵連隊の大隊(メントン大隊ほか)。伊チェンタウロ師団の戦車大隊とベルサリエーリ
    unit("de-33", "de", "de-recon-coy", along(4200, 0), 315, training="veteran"),
    unit("de-pgr-1", "de", "ww2f-de-inf-bn-1942", along(4500, 900), 315, training="veteran"),
    unit("de-pgr-2", "de", "ww2f-de-inf-bn-1942", along(4500, -900), 315, training="veteran"),
    unit("it-cent-tk", "de", "it-m13-bn-1941", along(6000, 0), 315, "column"),
    unit("it-bers", "de", "ww2f-it-inf-bn-1940", along(6800, 400), 315, "column"),
    unit("de-art", "de", "de-art-abt-lefh18", along(6500, -500), 315),
]

# 昼前:第10装甲師団(第7戦車連隊の2個大隊・装甲擲弾兵の大隊)が南東から。米 B 戦闘団(M3 リーの大隊と機甲歩兵)が西のテベッサの道から。
# 時刻・兵力は TODO(要裏取り)。B 戦闘団の戦車は M4 シャーマンだったかもしれない
SE = S.nodes["kas"]  # 第10装甲師団はカセリーヌの村の方から入る
TB = S.nodes["tebessa"]
reinforcements = [
    L([("turn", 4), ("id", "de-10pz-tk"), ("side", "de"), ("toe", "de-pz-abt-1942"), ("x", SE["x"]), ("y", SE["y"]), ("facing", 315), ("training", "veteran")]),
    L([("turn", 4), ("id", "de-10pz-tk2"), ("side", "de"), ("toe", "de-pz-abt-1942"), ("x", SE["x"] + 500), ("y", SE["y"] - 500), ("facing", 315), ("training", "veteran")]),
    L([("turn", 4), ("id", "de-10pz-pgr"), ("side", "de"), ("toe", "ww2f-de-inf-bn-1942"), ("x", SE["x"] - 500), ("y", SE["y"] + 500), ("facing", 315), ("training", "veteran")]),
    L([("turn", 8), ("id", "us-ccb-tk"), ("side", "us"), ("toe", "us-tank-bn-1942-lee"), ("x", TB["x"]), ("y", TB["y"]), ("facing", 90)]),
    L([("turn", 8), ("id", "us-ccb-inf"), ("side", "us"), ("toe", "ww2f-us-inf-bn-1942"), ("x", TB["x"]), ("y", TB["y"] + 500), ("facing", 90)]),
]

objectives = [
    objective("pass", "カセリーヌ峠", PC, 3, "us", 900),
    objective("exit", "峠の北西の口(道の分かれ目)", EXIT, 2, "us", 700),
]

S.fill_terrain(19430220, hill=0.06, forest=0.0, scale_m=2500, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives])

scenario = L(
    [
        ("id", "kasserine-1943-02-20"),
        ("name", "カセリーヌ峠 1943年2月20日(v0・概略図)"),
        (
            "description",
            "チュニジア。山脈の切れ目の峠を、実戦の浅い米軍の工兵と歩兵が守る。ロンメルの独伊の戦闘団が峠を押し破りに来て、午後には第10装甲師団も加わる。"
            "峠を抜かれれば、北のタラと西のテベッサへの道が開く。米第1機甲師団の B 戦闘団は午後に西から来る。",
        ),
        (
            "notes",
            "v0。峠・山・川・道の位置は概略で、座標は使っていない。部隊の配分・到着の時刻は仮置き。チェンタウロの戦車は M14/41 ではなく M13/40 の大隊で代えた。部隊は国ごとの実数の編成表(定数)。"
            "根拠は mods/ww2-fronts/research/kasserine-1943-02.md。作り直しは mods/ww2-fronts/tools/build_kasserine_1943_02_20.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "us", "de", "it"]),
                    ("toe", ["ww1-korea-generic", "us", "de", "it", "ww2f-toe-us", "ww2f-toe-de", "ww2f-toe-it"]),
                ]
            ),
        ),
        ("sides", [L([("id", "us"), ("name", "アメリカ軍")]), L([("id", "de"), ("name", "独伊軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 6), ("startDate", "1943-02-20")])),
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
                                # 独伊軍:峠か北西の口のどちらかを取れば限定的(峠を抜けて米軍の陣を崩す)、両方なら決定的
                                ("de", L([("decisive", L([("required", ["pass", "exit"])])), ("limited", L([("minWeight", 2)])), ("urgency", 1.0)])),
                                # 米軍:峠と北西の口の両方を保てば限定的、さらに敵に2割の損害を与えれば決定的
                                ("us", L([("decisive", L([("required", ["pass", "exit"]), ("minEnemyLoss", 0.2)])), ("limited", L([("required", ["pass", "exit"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 3), ("de", 4)])),
                    ("weather", L([("initial", "overcast"), ("changeChancePerHour", 0.05), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["clear", "overcast", "rain"])])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-w"), ("side", "us"), ("nodeId", "tebessa"), ("ammoT", 200), ("fuelT", 200)]),
                L([("id", "de-se"), ("side", "de"), ("nodeId", "se_edge"), ("ammoT", 200), ("fuelT", 150)]),
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
            "20日の夕方までに独伊軍は峠を取った。米軍は大きな損害を出して下がったが、タラとテベッサへの道は英米の増援が22日までに止め、独伊軍は23日に峠を通って引き揚げた。",
        ),
    ]
)
apply_names(scenario, {
    "us-19e-1": "第19工兵連隊 第1大隊",
    "us-19e-2": "第19工兵連隊 第2大隊",
    "us-1-26": "第26歩兵連隊 第1大隊",
    "us-13ar": "第13機甲連隊の戦車中隊",
    "us-fa": "第33野砲兵大隊",
    "us-ccb-tk": "B 戦闘団の戦車大隊",
    "us-ccb-inf": "B 戦闘団の機甲歩兵",
    "de-33": "第33偵察大隊",
    "de-pgr-1": "アフリカ装甲擲弾兵連隊 甲",
    "de-pgr-2": "アフリカ装甲擲弾兵連隊 乙(メントン)",
    "it-cent-tk": "チェンタウロ 戦車大隊",
    "it-bers": "チェンタウロ ベルサリエーリ",
    "de-art": "アフリカ軍団の砲兵",
    "de-10pz-tk": "第7戦車連隊 I",
    "de-10pz-tk2": "第7戦車連隊 II",
    "de-10pz-pgr": "第10装甲師団 装甲擲弾兵",
})
scenario["formations"] = formations(
    scenario,
    [
        ("us-stark", "スターク部隊", "us", None, ["us-19e-1", "us-19e-2", "us-1-26", "us-13ar", "us-fa"]),
        ("us-ccb", "第1機甲師団 B 戦闘団", "us", None, ["us-ccb-tk", "us-ccb-inf"]),
        ("de-dak", "アフリカ軍団戦闘団(ビューロヴィウス)", "de", None, ["de-33", "de-pgr-1", "de-pgr-2", "de-art"]),
        ("it-cent", "チェンタウロ師団", "de", None, ["it-cent-tk", "it-bers"]),
        ("de-10pz", "第10装甲師団", "de", None, ["de-10pz-tk", "de-10pz-tk2", "de-10pz-pgr"]),
    ],
)
# 史実の指揮官(確かめた人だけ。tools/scenarios/historical_commanders.py)
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT}(規定 {MAX_TURNS} ターン)")
