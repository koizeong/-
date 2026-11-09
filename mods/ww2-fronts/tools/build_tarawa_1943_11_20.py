#!/usr/bin/env python3
"""
タラワの戦い(ベティオ島)1943年11月20〜23日 のシナリオファイル(v0・概略図)を作る。

    python3 mods/ww2-fronts/tools/build_tarawa_1943_11_20.py

出力: mods/ww2-fronts/scenarios/tarawa-1943-11-20.json(--out で変えられる)

ギルバート諸島タラワ環礁のベティオ島。米第2海兵師団が礁湖(北)側のレッド1・2・3の浜へ上陸用の装軌車(LVT)で上がり、
島じゅうを陣地にした特別陸戦隊と戦う。小潮で上陸用舟艇は珊瑚礁の縁に止められ、後の波は浅瀬を歩いて渡った。
20日 09:00 から、島の確保が宣言された23日の昼まで(76時間の戦い)。根拠と残りの裏取りは mods/ww2-fronts/research/tarawa-1943-11.md。
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

OUT = output_path(PACK, "scenarios/tarawa-1943-11-20.json", "tarawa-1943-11-20.json")

# 島ひとつの戦いなので 100m のセルで 5km × 3km。北が礁湖
S = Sketch(origin=(1.355, 172.93), cols=50, rows=30, cell=100)

# 島の形・浜・陣地の位置は概略(TODO(要裏取り):米海兵隊の公刊戦史 Alexander『Across the Reef』の付図、Shaw『Tarawa: A Legend Is Born』)。
# ベティオは東西に長く(西が太く、東は細い尾)、北の礁湖側に珊瑚礁が張り出している
S.terrain("W", "large_river")  # 礁湖と外海(揚陸能力のある部隊だけが渡れる。撃たれやすい)
S.terrain("R", "tidal_flat")  # 珊瑚礁の浅瀬(揚陸能力のある部隊だけが遅く渡れる。後の波は歩いて渡った)
S.terrain("P", "plantation")  # 椰子林と飛行場のまわり
S.terrain("F", "fortified_slope")  # 浜の縁の陣地(トーチカ・椰子の丸太の壁)。地形の名は山腹だが、効き目(隠れやすく撃たれにくい)だけを借りた
S.terrain("O", "open_ocean")  # 島の南と東の外海(上陸した部隊が外海を回り込まないように。上陸の装軌車は礁湖の側の浜へだけ上がった)
S.rect((0, 0), (S.width, S.height), "O")
S.rect((0, 1900), (S.width, S.height), "W")  # 北の礁湖
S.rect((0, 1000), (400, S.height), "W")  # 西の端のグリーン・ビーチの沖(21日の夕方から第6海兵連隊が上がった)
S.rect((300, 2000), (4400, 2500), "R")  # 北の礁
S.rect((400, 1100), (2900, 1900), "P")  # 島の太い西の部分
S.rect((2900, 1250), (4300, 1650), "P")  # 東の細い尾
# 浜の縁の陣地(北岸・南岸・西の端・東の尾の縁)。日本は南と南西からの上陸を予想していて、南岸・西の端の陣地が厚かった
S.rect((400, 1800), (2900, 1900), "F")
S.rect((400, 1100), (2900, 1200), "F")
S.rect((400, 1100), (500, 1900), "F")
S.rect((2900, 1550), (4300, 1650), "F")
S.rect((2900, 1250), (4300, 1350), "F")

RED1 = S.snap((800, 1850))  # 西の入り江
RED2 = S.snap((1700, 1850))  # 長い桟橋の西
RED3 = S.snap((2400, 1850))  # 長い桟橋の東
AIRFIELD = S.snap((1800, 1450))  # 島の真ん中の飛行場
SOUTH = S.snap((1700, 1150))  # 南岸(島を横切った所)
WEST_END = S.snap((550, 1500))  # 西の端(グリーン・ビーチ)
EAST = S.snap((3600, 1450))  # 東の尾

# 時間:20日 09:00 から D 日の昼9ターン、夜(18:00〜06:00)を1ターン、21・22日は昼12ターンと夜1ターン、23日は 06:00〜13:00 の7ターン。合わせて43ターン
DAY1 = 9
NIGHT_TURN = DAY1 + 1
PER_DAY = 13
MAX_TURNS = NIGHT_TURN + PER_DAY * 2 + 7
D2 = NIGHT_TURN + 1  # 21日 06:00 のターン
D3 = D2 + PER_DAY  # 22日 06:00 のターン

LAGOON_Y = 2800  # 上陸の波が礁湖の中で並ぶ所

units = [
    # 第2海兵師団はガダルカナルを戦った部隊なので、海兵は古参(ゲームの置き方)。
    # 第1〜3波:LVT に乗った上陸大隊。レッド3の第8海兵連隊第2大隊(2/8)は確かめた。レッド1・2の大隊の割り振りは TODO(要裏取り)
    # (第2海兵連隊の第3大隊(3/2)と第2大隊(2/2)とされることが多い)
    unit("us-3-2", "us", "ww2f-pac-usmc-lt-1943", S.snap((RED1[0], LAGOON_Y)), 180, training="veteran"),
    unit("us-2-2", "us", "ww2f-pac-usmc-lt-1943", S.snap((RED2[0], LAGOON_Y)), 180, training="veteran"),
    unit("us-2-8", "us", "ww2f-pac-usmc-lt-1943", S.snap((RED3[0], LAGOON_Y)), 180, training="veteran"),
    # 特別陸戦隊。浜の縁の陣地に入っている(陣地の段階・所属の割り振りは仮置き)。日本は捕虜を出さず、ほぼ全滅した。
    # 戦う兵は第三特別根拠地隊 1,112名と佐世保第七特別陸戦隊 約1,497名で約2,600名。陸軍の歩兵大隊(1,000名ほど)の4つ分を、戦力 0.65 ずつにした
    unit("jp-w", "jp", "ww2f-pac-jp-snlf-1943", S.snap((800, 1600)), 0, training="veteran", stance="defense", entrenchment=3, strength=0.65),
    unit("jp-c", "jp", "ww2f-pac-jp-snlf-1943", S.snap((1700, 1650)), 0, training="veteran", stance="defense", entrenchment=3, strength=0.65),
    unit("jp-e", "jp", "ww2f-pac-jp-snlf-1943", S.snap((2500, 1600)), 0, training="veteran", stance="defense", entrenchment=3, strength=0.65),
    unit("jp-s", "jp", "ww2f-pac-jp-snlf-1943", S.snap((1500, 1250)), 180, training="veteran", stance="defense", entrenchment=3, strength=0.65),
    unit("jp-guns", "jp", "ww2f-pac-jp-guns-1943", S.snap((1200, 1500)), 0, stance="defense", entrenchment=3),
    # 東の尾:設営隊(第百十一設営隊など。大半は武器の乏しい労働者)を、陸戦隊の大隊の戦力 0.4・未熟で表した(仮置き。TODO(要裏取り))
    unit("jp-tail", "jp", "ww2f-pac-jp-snlf-1943", S.snap((3500, 1450)), 0, training="green", stance="defense", entrenchment=3, strength=0.4),
]

# 後の波:上陸用舟艇は礁の縁で止まり、浅瀬を歩いて渡った(礁の縁から出る)。時刻・浜は仮置き(TODO(要裏取り))
REEF_EDGE_Y = 2450
reinforcements = [
    # シャーマンの中隊(第5波)
    L([("turn", 2), ("id", "us-tanks"), ("side", "us"), ("toe", "ww2f-pac-usmc-tank-1943"), ("x", RED3[0]), ("y", S.snap((0, REEF_EDGE_Y))[1]), ("facing", 180), ("training", "veteran")]),
    # 第2海兵連隊第1大隊(1/2)と第8海兵連隊第3大隊(3/8)が D 日のうちに浅瀬を渡った
    L([("turn", 4), ("id", "us-1-2"), ("side", "us"), ("toe", "ww2f-pac-usmc-lt-1943"), ("x", RED2[0]), ("y", S.snap((0, REEF_EDGE_Y))[1]), ("facing", 180), ("training", "veteran")]),
    L([("turn", 6), ("id", "us-3-8"), ("side", "us"), ("toe", "ww2f-pac-usmc-lt-1943"), ("x", RED3[0]), ("y", S.snap((0, REEF_EDGE_Y))[1]), ("facing", 180), ("training", "veteran")]),
    # 第8海兵連隊第1大隊(1/8)は21日の朝、レッド2へ浅瀬を渡って大きな損害を受けた
    L([("turn", D2), ("id", "us-1-8"), ("side", "us"), ("toe", "ww2f-pac-usmc-lt-1943"), ("x", RED2[0] - 300), ("y", S.snap((0, REEF_EDGE_Y))[1]), ("facing", 180), ("training", "veteran")]),
    # 第6海兵連隊:第1大隊(1/6)は21日の夕方にゴムボートで西の端のグリーン・ビーチへ(礁に着いたのは 18:45)、第3大隊(3/6)は22日にグリーン・ビーチへ
    L([("turn", D2 + 12), ("id", "us-1-6"), ("side", "us"), ("toe", "ww2f-pac-usmc-lt-1943"), ("x", S.snap((150, 1500))[0]), ("y", S.snap((150, 1500))[1]), ("facing", 90), ("training", "veteran")]),
    L([("turn", D3), ("id", "us-3-6"), ("side", "us"), ("toe", "ww2f-pac-usmc-lt-1943"), ("x", S.snap((150, 1350))[0]), ("y", S.snap((150, 1350))[1]), ("facing", 90), ("training", "veteran")]),
]

objectives = [
    objective("beach", "浜の足場(レッド2・3)", S.snap((2050, 1800)), 2, "jp", 350),
    objective("airfield", "飛行場", AIRFIELD, 2, "jp", 400),
    objective("south", "南岸(島を横切る)", SOUTH, 2, "jp", 300),
    objective("west", "西の端", WEST_END, 1, "jp", 300),
    objective("east", "東の尾", EAST, 1, "jp", 400),
]

scenario = L(
    [
        ("id", "tarawa-1943-11-20"),
        ("name", "タラワ(ベティオ島)1943年11月20〜23日(v0・概略図)"),
        (
            "description",
            "ギルバート諸島タラワ環礁のベティオ島。米第2海兵師団が北の礁湖側の浜へ、上陸用の装軌車で珊瑚礁を越えて上がる。"
            "島じゅうを陣地にした特別陸戦隊は降伏しない。小潮で舟艇は礁に止められ、後の波は撃たれながら浅瀬を歩いて渡る。3日半で島を取りきれるか。",
        ),
        (
            "notes",
            "v0。100m のセル。島の形・礁・陣地の位置は概略で、寸法は確かめていない。浜の縁の陣地は「要塞化した山腹」の地形の効き目を借りた。"
            "海兵の大隊は 1944年の F 編制、特別陸戦隊は陸軍の 1944年の歩兵大隊、海岸の砲台は独立速射砲大隊で代えた。九五式軽戦車7両・海岸砲・長い桟橋は表さない。"
            "根拠は mods/ww2-fronts/research/tarawa-1943-11.md。作り直しは mods/ww2-fronts/tools/build_tarawa_1943_11_20.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "ww2-1944-us-de", "ww2-pacific"]),
                    ("toe", ["ww1-korea-generic", "ww2-1944-us-de", "ww2-pacific", "ww2f-toe-pac"]),
                ]
            ),
        ),
        ("sides", [L([("id", "us"), ("name", "米海兵隊")]), L([("id", "jp"), ("name", "日本海軍陸戦隊")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 9), ("startDate", "1943-11-20")])),
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
                                # 米:島の全部(東の尾まで)を取り、日本の損耗7割で決定的(史実)、東の尾のほかを取れば限定的(ゲームの設計)
                                ("us", L([("decisive", L([("required", ["beach", "south", "airfield", "west", "east"]), ("minEnemyLoss", 0.7)])), ("limited", L([("required", ["beach", "south", "airfield", "west"])])), ("urgency", 0.3)])),
                                # 日本:浜の足場を取り返せば決定的(上陸を撃退)、飛行場を保てば限定的
                                ("jp", L([("decisive", L([("required", ["beach"])])), ("limited", L([("required", ["airfield"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 6), ("jp", 3)])),
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0), ("minHoursBetweenChanges", 0), ("improveChance", 0.5), ("allowed", ["clear"])])),
                    ("air", L()),
                    # 艦砲射撃(戦艦・巡洋艦・駆逐艦)。数・回数は硫黄島と同じ仮置き。TODO(要裏取り)
                    ("naval", L([("us", L([("gunfire", L([("missionsPerDay", 6), ("weapon", "naval_gun"), ("count", 12), ("rangeFromSeaM", 8000)]))]))])),
                    ("night", L([("turn", NIGHT_TURN), ("hours", 12), ("everyTurns", 13)])),
                    ("noSurrender", ["jp"]),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        ("depots", []),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "us"),
        ("level", "decisive"),
        (
            "summary",
            "小潮で舟艇は礁に止められ、浅瀬を歩いて渡った海兵は大きな損害を受けた。D 日の終わりの足場は浅かったが、21日に島を横切って南岸に出て、23日に島を取った。"
            "日本の守備隊はほぼ全滅し(捕虜は日本兵17名・朝鮮人の労働者129名)、海兵は戦死1,009名・負傷2,101名(76時間の戦い全体)。",
        ),
    ]
)
apply_names(scenario, {
    "us-3-2": "第2海兵連隊第3大隊(3/2)",
    "us-2-2": "第2海兵連隊第2大隊(2/2)",
    "us-2-8": "第8海兵連隊第2大隊(2/8)",
    "us-1-2": "第2海兵連隊第1大隊(1/2)",
    "us-3-8": "第8海兵連隊第3大隊(3/8)",
    "us-1-8": "第8海兵連隊第1大隊(1/8)",
    "us-tanks": "第2戦車大隊の中隊(シャーマン)",
    "us-1-6": "第6海兵連隊第1大隊(1/6)",
    "us-3-6": "第6海兵連隊第3大隊(3/6)",
    "jp-w": "陸戦隊 西地区",
    "jp-c": "陸戦隊 中地区(レッド2)",
    "jp-e": "陸戦隊 東地区(レッド3)",
    "jp-s": "陸戦隊 南岸",
    "jp-guns": "海岸の砲台",
    "jp-tail": "陸戦隊 東の尾(設営隊を含む)",
})
scenario["formations"] = formations(
    scenario,
    [
        ("us-2mardiv", "第2海兵師団", "us", None, ["us-tanks"]),
        ("us-2mar", "第2海兵連隊", "us", "us-2mardiv", ["us-3-2", "us-2-2", "us-1-2"]),
        ("us-8mar", "第8海兵連隊", "us", "us-2mardiv", ["us-2-8", "us-3-8", "us-1-8"]),
        ("us-6mar", "第6海兵連隊", "us", "us-2mardiv", ["us-1-6", "us-3-6"]),
        ("jp-3sbf", "第三特別根拠地隊・佐世保第七特別陸戦隊", "jp", None, ["jp-w", "jp-c", "jp-e", "jp-s", "jp-guns", "jp-tail"]),
    ],
)
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT}(規定 {MAX_TURNS} ターン)")
