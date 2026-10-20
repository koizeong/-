#!/usr/bin/env python3
"""
仁川上陸(クロマイト作戦)1950年9月15〜17日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_inchon_1950_09_15.py

出力: data/scenarios/inchon-1950-09-15.json

強襲上陸(揚陸能力のある部隊が海から上がる)と艦砲射撃・艦上機の支援を遊ぶためのもの。根拠と残りの裏取りは
docs/research/inchon-1950-09.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。
海岸線・干潟・海岸の位置、兵力・時刻の多くは TODO(要裏取り)。

潮の満ち引き(ユーザー判断で簡略版):干潟は時刻で変わらず、揚陸能力のある部隊だけが遅く通れる海として固定する。
朝の満潮(06:59)で月尾島、夕の満潮(19:19)でレッド・ビーチとブルー・ビーチ、という二段の上陸は、
第5・第1海兵連隊を15日の午後に沖へ着く増援にして表す(朝のうちは月尾島の大隊しか上陸できない)。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACKS, Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/inchon-1950-09-15.json"

# 32km × 18km。西は黄海、東は永登浦、北は漢江の南岸(金浦飛行場)、南は仁川の南の塩田
S = Sketch(origin=(37.5025, 126.745), cols=128, rows=72)

P = L(
    [
        ("wolmi", S.at(37.4723, 126.6023)),  # 月尾島(高)
        ("sowolmi", S.at(37.4650, 126.6000)),  # 小月尾島(推定。TODO(要裏取り))
        ("observatory", S.at(37.4756, 126.6220)),  # 天文台の丘(今の自由公園。中)
        ("cemetery", S.at(37.4870, 126.6260)),  # 墓地の丘:レッド・ビーチ北端の背後(推定。TODO(要裏取り))
        ("red_beach", S.at(37.4830, 126.6215)),  # レッド・ビーチ:土手道の北の岸壁(推定。TODO(要裏取り))
        ("blue_beach", S.at(37.4520, 126.6400)),  # ブルー・ビーチ:市の南、塩田の隣(推定。TODO(要裏取り))
        ("station", S.at(37.4760, 126.6200)),  # 土手道の終点(仁川駅付近。陸の上に置く。推定)
        ("inchon", S.at(37.4700, 126.6350)),  # 仁川市街(旧市街の中区。推定)
        ("hill117", S.at(37.4780, 126.6650)),  # 117高地:内陸2マイル、ソウル道路を見下ろす(推定。TODO(要裏取り))
        ("juan", S.at(37.4650, 126.6800)),  # 朱安(推定)
        ("ascom", S.at(37.5000, 126.7200)),  # ASCOM City(富平。推定)
        ("sosa", S.at(37.4830, 126.7950)),  # 素砂(推定)
        ("kimpo", S.at(37.5583, 126.7910)),  # 金浦飛行場(今の金浦空港の基準点。中)
        ("yongdungpo", S.at(37.5156, 126.9076)),  # 永登浦(中)
    ]
)

S.terrain("T", "town")
S.terrain("H", "hill")
S.terrain("W", "large_river")
S.terrain("M", "tidal_flat")

# 海岸線(北から南へ。推定 TODO(要裏取り))。海岸線より西は海。海岸から沖へ2セル(500m)を干潟、その先を海とする
# (干潮の干潟は最大約3kmまで広がったが、簡略版では満潮の海を基準に、岸壁の前の泥だけを干潟にする)
COAST = [(37.585, 126.640), (37.520, 126.635), (37.495, 126.625), (37.4820, 126.6175), (37.465, 126.618), (37.455, 126.632), (37.445, 126.645), (37.420, 126.660)]


def coast_lon(lat):
    pts = sorted(COAST)
    if lat <= pts[0][0]:
        return pts[0][1]
    for (la0, lo0), (la1, lo1) in zip(pts, pts[1:]):
        if la0 <= lat <= la1:
            return lo0 + (lo1 - lo0) * (lat - la0) / (la1 - la0)
    return pts[-1][1]


for r in range(S.rows):
    for c in range(S.cols):
        x, y = c * S.cell + S.cell / 2, r * S.cell + S.cell / 2
        lat = S.origin[0] + (y - S.height / 2) / 110574.0
        lon = S.origin[1] + (x - S.width / 2) / S.m_per_deg_lon
        d = (coast_lon(lat) - lon) * S.m_per_deg_lon
        if d > 0:
            S.grid[S.rows - 1 - r][c] = "M" if d <= 2 * S.cell else "W"

# 月尾島(本土から約1km の島。ラジオ山 105m)と小月尾島。まわりは干潟
S.mark(S.offset(P["wolmi"], -400, -400), "M", 4)
S.mark(P["wolmi"], ".", 1)
S.mark(P["wolmi"], "H", 0)
S.mark(P["sowolmi"], ".", 0)
# 月尾島の西へ通じる水路(飛魚水道の終わり。概略)
S.line([S.xy(37.4723, 126.565), S.offset(P["wolmi"], -500, 0)], "W", 0)
# 仁川の市街(人口約25万。範囲は推定)と丘。海岸線より東(陸)だけ
for r in range(S.rows):
    for c in range(S.cols):
        x, y = c * S.cell + S.cell / 2, r * S.cell + S.cell / 2
        lat = S.origin[0] + (y - S.height / 2) / 110574.0
        lon = S.origin[1] + (x - S.width / 2) / S.m_per_deg_lon
        if 37.455 <= lat <= 37.492 and lon <= 126.655 and S.grid[S.rows - 1 - r][c] == ".":
            S.grid[S.rows - 1 - r][c] = "T"
S.mark(P["observatory"], "H", 1)
S.mark(P["cemetery"], "H", 0)
S.mark(P["hill117"], "H", 1)
for k in ["juan", "ascom", "sosa"]:
    S.mark(P[k], "T", 1)
S.rect(S.xy(37.505, 126.885), S.xy(37.530, 126.925), "T")  # 永登浦(範囲は推定)
# 漢江(金浦飛行場の北を西へ流れる。線は推定 TODO(要裏取り))
S.line([S.xy(37.585, 126.815), S.xy(37.565, 126.860), S.xy(37.545, 126.890), S.xy(37.533, 126.925)], "W", 1)

nodes = L(
    [
        ("fleet", S.at(37.4723, 126.575)),  # 沖の艦隊(補給の出どころ。海の上)
        ("wolmi_w", S.offset(P["wolmi"], -250, 0)),
        ("wolmi_e", S.offset(P["wolmi"], 250, 0)),
        ("station", P["station"]),
        ("red_beach", P["red_beach"]),
        ("inchon", P["inchon"]),
        ("blue_beach", P["blue_beach"]),
        ("juan", P["juan"]),
        ("ascom", P["ascom"]),
        ("sosa", P["sosa"]),
        ("yongdungpo", P["yongdungpo"]),
        ("east_edge", S.at(37.5156, 126.9240)),  # 東:ソウル方面
        ("kimpo", P["kimpo"]),
        ("north_edge", S.at(37.584, 126.760)),  # 北:金浦半島の北(北朝鮮軍の増援)
        ("south_edge", S.at(37.421, 126.690)),
    ]
)
for k, p in nodes.items():
    S.node(k, p)
for a, b, cap in [
    ("fleet", "wolmi_w", 300),  # 艦隊から月尾島への揚陸(海の上の区間。橋として扱われる)
    ("wolmi_w", "wolmi_e", 300),
    ("wolmi_e", "station", 300),  # 月尾島と仁川を結ぶ土手道(干潟の上を通る → 橋として扱われる)
    ("station", "red_beach", 200),
    ("station", "inchon", 200),
    ("inchon", "blue_beach", 100),
    ("inchon", "juan", 200),
    ("juan", "ascom", 200),
    ("ascom", "sosa", 200),
    ("sosa", "yongdungpo", 200),
    ("yongdungpo", "east_edge", 200),
    ("ascom", "kimpo", 100),
    ("kimpo", "yongdungpo", 100),
    ("kimpo", "north_edge", 100),
    ("juan", "south_edge", 100),
]:
    S.road(a, b, cap)

# 時間:15日 05:00 から(05:45 に砲撃開始、06:33 にグリーン・ビーチ)。日の出 06:15・日没 18:43(北緯37.47度、UTC+9。調査メモの計算)。
# 昼は 15日が 05:00〜19:00 の14ターン、16・17日が 06:00〜19:00 の13ターン。夜は 19:00〜06:00 の11時間を1ターン。
# 17日 19:00 で終わる(金浦飛行場の奪取は17日の日没ごろ)
FIRST_DAY_TURNS = 14
DAY_TURNS = 13
PER_DAY = DAY_TURNS + 1
NIGHT1 = FIRST_DAY_TURNS + 1


def at_hour(day, hour):
    """15日を day=1 として、その日の hour 時に始まるターン(昼だけ)"""
    if day == 1:
        return hour - 5 + 1
    return NIGHT1 + 1 + (day - 2) * PER_DAY + (hour - 6)


MAX_TURNS = at_hour(3, 18)


def rf(turn, uid, side, toe, p, facing, **extra):
    r = L([("turn", turn), ("id", uid), ("side", side), ("toe", toe), ("x", p[0]), ("y", p[1]), ("facing", facing)])
    r.update(extra)
    return r


SEA_GREEN = S.at(37.4723, 126.585)  # 月尾島の西の水路
SEA_RED = S.at(37.4860, 126.600)  # レッド・ビーチの沖
SEA_BLUE = S.at(37.4450, 126.620)  # ブルー・ビーチの沖

units = [
    # 米軍:第5海兵連隊第3大隊(タプレット中佐。戦車・工兵を加えて約1,250名)。朝の満潮で月尾島のグリーン・ビーチへ(06:33)
    unit("us-3-5", "us", "amphibious_infantry_battalion", SEA_GREEN, 90, training="veteran"),
    # 北朝鮮軍:仁川と月尾島で約2,000(戦後の推定)。第226独立海兵連隊の2個以上の大隊と第918砲兵連隊の数個中隊。兵力・位置は TODO(要裏取り)
    # 月尾島:約400(戦前の見積もりは600)。13日から艦砲射撃・空爆を受けていた
    unit("nk-wolmi", "nk", "infantry_battalion", P["wolmi"], 270, entrenchment=3, strength=0.6),
    unit("nk-918-wolmi", "nk", "artillery_battalion", S.offset(P["wolmi"], 250, 0), 270, entrenchment=3, strength=0.5),
    # 第226独立海兵連隊:レッド・ビーチと墓地の丘、ブルー・ビーチ、天文台の丘(配置は推定)
    unit("nk-226-red", "nk", "infantry_battalion", P["cemetery"], 270, entrenchment=2),
    unit("nk-226-blue", "nk", "infantry_battalion", S.offset(P["blue_beach"], 300, 300), 225, entrenchment=2),
    unit("nk-obs", "nk", "infantry_battalion", P["observatory"], 270, entrenchment=3, strength=0.6),
    unit("nk-918-city", "nk", "artillery_battalion", S.offset(P["inchon"], 800, 0), 270, entrenchment=2, strength=0.5),
    # 金浦飛行場の守備(規模は TODO(要裏取り))
    unit("nk-kimpo", "nk", "infantry_battalion", P["kimpo"], 225, training="green", strength=0.5),
]

reinforcements = [
    # 米軍:夕の満潮(19:19)に合わせ、H時 17:30 に上陸。艦船が沖へ着くのを15日の午後とした(簡略版の潮の表し方)
    # 第5海兵連隊(第1・第2大隊。韓国海兵の大隊を含む)はレッド・ビーチへ(17:33)
    rf(at_hour(1, 15), "us-5mar", "us", "amphibious_infantry_regiment", SEA_RED, 90, training="veteran"),
    rf(at_hour(1, 15), "us-kmc", "us", "amphibious_infantry_battalion", S.offset(SEA_RED, 0, 700), 90),
    # 第1海兵連隊(プラー大佐)はブルー・ビーチへ(17:32)。水陸両用車172両を25波に分けた
    rf(at_hour(1, 15), "us-1mar", "us", "amphibious_infantry_regiment", SEA_BLUE, 60, training="veteran"),
    # 16日:干潮でレッド・ビーチに乗り上げた LST から揚陸。第1戦車大隊(M26。月尾島の9両を含む)と第11海兵連隊(砲兵)
    # 揚陸の時刻は TODO(要裏取り)
    rf(at_hour(2, 7), "us-1tank", "us", "tank_battalion", P["red_beach"], 90, training="veteran"),
    rf(at_hour(2, 7), "us-11mar", "us", "artillery_group", P["station"], 90, training="veteran"),
    # 北朝鮮軍:第18師団が釜山へ向かう途中で反転し、素砂付近で第1海兵連隊と交戦した(兵力・到着は TODO(要裏取り))
    rf(at_hour(2, 6), "nk-18div", "nk", "infantry_regiment", nodes["east_edge"], 270),
    # 17日 05:45〜06:05:ASCOM City の手前で、T-34 6両と歩兵約250が海兵の待ち伏せにあい全滅した
    rf(at_hour(3, 6), "nk-t34", "nk", "tank_battalion", S.offset(P["ascom"], 2500, 500), 270, strength=0.3),
    rf(at_hour(3, 6), "nk-t34-inf", "nk", "infantry_battalion", S.offset(P["ascom"], 2500, -500), 270, strength=0.3),
    # 第78独立連隊と第25旅団(約2,000)がソウルへ向かった。金浦方面への到着は TODO(要裏取り)
    rf(at_hour(3, 6), "nk-78ind", "nk", "infantry_regiment", nodes["north_edge"], 180, training="green"),
]

objectives = [
    objective("wolmi", "月尾島", P["wolmi"], 1, "nk", radius=500),
    objective("cemetery", "墓地の丘(レッド・ビーチ)", P["cemetery"], 1, "nk"),
    objective("observatory", "天文台の丘", P["observatory"], 2, "nk"),
    objective("inchon", "仁川市街", P["inchon"], 3, "nk", radius=900),
    objective("blue_beach", "ブルー・ビーチ", nodes["blue_beach"], 1, "nk"),
    objective("hill117", "117高地", P["hill117"], 1, "nk"),
    objective("ascom", "ASCOM City(富平)", P["ascom"], 1, "nk"),
    objective("kimpo", "金浦飛行場", P["kimpo"], 2, "nk", radius=800),
]

scenario = L(
    [
        ("id", "inchon-1950-09-15"),
        ("name", "仁川上陸 1950年9月15〜17日(クロマイト作戦・v0・概略図)"),
        (
            "description",
            "朝鮮戦争。米第1海兵師団が仁川に上陸する。15日の朝は第5海兵連隊第3大隊だけで月尾島を取り、午後に沖へ着く第5・第1海兵連隊で"
            "レッド・ビーチとブルー・ビーチへ上がる(干潟は揚陸能力のある部隊だけが遅く通れる)。艦砲射撃と空母のコルセアが支える。"
            "16日からは北朝鮮軍の第18師団などが東から来る。史実では17日の日没ごろに金浦飛行場を取った。",
        ),
        (
            "notes",
            "v0・概略図。潮の満ち引きは表さず(ユーザー判断で簡略版)、二段の上陸は第5・第1海兵連隊の増援の時刻で表した。"
            "海岸線・干潟・海岸の位置、両軍の兵力と到着の日時の多くは TODO(要裏取り)(資料のページを直接読めず、検索結果の要約で組み立てた)。"
            "米軍の補給は沖の艦隊のノードから月尾島を通って届く(揚陸の流れの簡略化)。防潮壁(干潟から約16フィート)は表していない。"
            "汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。根拠は docs/research/inchon-1950-09.md。"
            "作り直しは tools/scenarios/build_inchon_1950_09_15.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "us"), ("name", "国連軍(米第1海兵師団)")]), L([("id", "nk"), ("name", "北朝鮮軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 5), ("startDate", "1950-09-15")])),
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
                                # 史実の結末(17日夕方):仁川市街・天文台の丘を取り、金浦飛行場まで進んだ → 国連軍の決定的勝利
                                (
                                    "us",
                                    L(
                                        [
                                            ("decisive", L([("required", ["inchon", "observatory", "kimpo"])])),
                                            ("limited", L([("required", ["inchon", "observatory"])])),
                                            # 急ぎ度:潮の窓が月に3〜4日しかなく、洛東江の戦線を救うために急いでソウルへ向かう必要があった
                                            ("urgency", 0.7),
                                        ]
                                    ),
                                ),
                                (
                                    "nk",
                                    L(
                                        [
                                            ("decisive", L([("required", ["inchon", "observatory"])])),
                                            ("limited", L([("required", ["observatory"])])),
                                        ]
                                    ),
                                ),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 7), ("nk", 5)])),
                    # 15日の夕方は煙・夕暮れ・にわか雨が重なり、ブルー・ビーチでは視界がほとんどなかった。細かい天候は TODO(要裏取り)
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.0), ("minHoursBetweenChanges", 3), ("improveChance", 0.5)])),
                    # 空母のコルセア(VMF-214・VMF-323)。編隊の数と出撃は仮置き TODO(要裏取り)
                    ("air", L([("us", L([("strike", L([("groups", 3), ("replacementPerDay", 0.5), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)]))]))])),
                    # 艦砲射撃:巡洋艦4隻(トレド・ロチェスター・ジャマイカ・ケニア)と駆逐艦6隻、ロケット艦3隻。回数と門数は仮置き
                    ("naval", L([("us", L([("gunfire", L([("missionsPerDay", 6), ("weapon", "naval_gun"), ("count", 12), ("rangeFromSeaM", 8000)]))]))])),
                    ("night", L([("turn", NIGHT1), ("hours", 11), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-fleet"), ("side", "us"), ("nodeId", "fleet"), ("ammoT", 1500), ("fuelT", 500)]),
                L([("id", "nk-seoul"), ("side", "nk"), ("nodeId", "east_edge"), ("ammoT", 500), ("fuelT", 150)]),
            ],
        ),
    ]
)

# 史実の結末(結果の画面で、プレイヤーの結果と比べる)。勝ち方の段階は、このシナリオの勝利条件に当てはめたもの
scenario["historicalOutcome"] = L([("winner", "us"), ("level", "decisive"), ("summary", "17日の日没ごろまでに仁川市街・天文台の丘を取り、金浦飛行場まで進んだ。")])
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
