#!/usr/bin/env python3
"""
硫黄島・摺鉢山の攻略 1945年2月19〜23日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_iwo_suribachi_1945_02_19.py

出力: data/scenarios/iwo-suribachi-1945-02-19.json

第28海兵連隊がグリーン・ビーチに上陸し、島の首を横断して摺鉢山を孤立させ、ブロックハウスと洞窟の帯を火炎放射器と爆薬で
1日に約200ヤードずつ落として山頂へ登る。根拠と残りの裏取りは docs/research/iwo-suribachi-1945-02.md。
この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。海岸線・海岸の位置、両軍の兵力の内訳は TODO(要裏取り)。

上陸の流れは表さず、第1波(1/28・2/28、第27海兵連隊の2個大隊)が海岸に着いた 09:00 から始める(艇の上の時間は短く、
揚陸能力のある編成表を海兵のF編制の大隊に作るほどではないため)。後続は海岸に着く増援にする。
"""

import json
import math
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Sketch, formations, objective, unit  # noqa: E402
from build_slim_river_1942_01_07 import PACKS_PACIFIC  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/iwo-suribachi-1945-02-19.json"

# 6km × 6km。南西の端が摺鉢山、北東へ第1飛行場(千鳥飛行場)まで
S = Sketch(origin=(24.7650, 141.2980), cols=24, rows=22)

P = L(
    [
        ("summit", S.at(24.7503, 141.2889)),  # 摺鉢山の山頂(標高169m。中〜高)
        ("base_n", S.at(24.7540, 141.2905)),  # 山の北のふもと(ブロックハウスの帯。推定)
        ("neck_w", S.at(24.7565, 141.2890)),  # 島の首の西海岸(首の幅 約690m。推定 TODO(要裏取り))
        ("green", S.at(24.7555, 141.2965)),  # グリーン・ビーチ(摺鉢山のすぐ北。推定)
        ("red1", S.at(24.7590, 141.2995)),  # レッド1(推定)
        ("red2", S.at(24.7615, 141.3020)),  # レッド2(推定)
        ("south_field", S.at(24.7628, 141.3036)),  # 第1飛行場(中。滑走路の中心か端かは不明)
    ]
)

S.legend["."] = "plain"
S.terrain("W", "large_river")  # 海
S.terrain("V", "volcanic_sand")  # 海岸の段丘の火山砂
S.terrain("H", "hill")
S.terrain("F", "fortified_slope")

# 島の形(概略。緯度経度の多角形。TODO(要裏取り:国土地理院の地図、Bartley の付図))
ISLAND = [
    (24.7445, 141.2880),  # 摺鉢山の南
    (24.7475, 141.2935),
    (24.7535, 141.2960),  # 首の東(グリーン・ビーチの南端)
    (24.7590, 141.2992),
    (24.7650, 141.3060),
    (24.7720, 141.3160),
    (24.7800, 141.3260),  # 東海岸を北東へ(地図の外)
    (24.7920, 141.3260),
    (24.7920, 141.2840),
    (24.7700, 141.2845),  # 西海岸
    (24.7600, 141.2870),
    (24.7555, 141.2885),  # 首の西
    (24.7520, 141.2830),
    (24.7475, 141.2835),
]


def inside(lat, lon, poly):
    n, c = len(poly), False
    for i in range(n):
        (y1, x1), (y2, x2) = poly[i], poly[(i + 1) % n]
        if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def latlon(c, r):
    x, y = c * S.cell + S.cell / 2, r * S.cell + S.cell / 2
    return S.origin[0] + (y - S.height / 2) / 110574.0, S.origin[1] + (x - S.width / 2) / S.m_per_deg_lon


for r in range(S.rows):
    for c in range(S.cols):
        lat, lon = latlon(c, r)
        S.grid[S.rows - 1 - r][c] = "." if inside(lat, lon, ISLAND) else "W"
# 東海岸の上陸海岸:海に面した陸のセルと、その内側1セルを火山砂に(急な段丘で、車両が埋まった)
for r in range(S.rows):
    for c in range(S.cols):
        if S.grid[S.rows - 1 - r][c] != ".":
            continue
        lat, lon = latlon(c, r)
        if lat > 24.7530 and any(0 <= c + d < S.cols and S.grid[S.rows - 1 - r][c + d] == "W" for d in (1, 2)) and lon > 141.294:
            S.grid[S.rows - 1 - r][c] = "V"
# 摺鉢山:山頂から約300m は山(高地)、そのまわりの約600m までは要塞化した山腹(ふもとのブロックハウス約70、山腹の約50、坑道でつながる)
for r in range(S.rows):
    for c in range(S.cols):
        if S.grid[S.rows - 1 - r][c] == "W":
            continue
        x, y = c * S.cell + S.cell / 2, r * S.cell + S.cell / 2
        d = math.hypot(x - P["summit"][0], y - P["summit"][1])
        if d <= 300:
            S.grid[S.rows - 1 - r][c] = "H"
        elif d <= 650:
            S.grid[S.rows - 1 - r][c] = "F"

nodes = L(
    [
        ("summit", P["summit"]),
        ("base_n", P["base_n"]),
        ("neck_w", P["neck_w"]),
        ("green", P["green"]),
        ("red1", P["red1"]),
        ("red2", P["red2"]),
        ("south_field", P["south_field"]),
        ("north_edge", S.at(24.7880, 141.3100)),  # 北:島の本隊(栗林中将の主陣地)の方
    ]
)
for k, p in nodes.items():
    S.node(k, p)
for a, b, cap in [
    ("summit", "base_n", 10),  # 山の小道(日本軍の洞窟の備蓄はここから)
    ("base_n", "neck_w", 30),
    ("base_n", "green", 30),
    ("green", "red1", 50),
    ("red1", "red2", 50),
    ("neck_w", "red1", 30),
    ("red2", "south_field", 50),
    ("south_field", "north_edge", 50),
]:
    S.road(a, b, cap)

# 時間:19日 09:00(H時)から23日 11:00 まで。昼は 06:00〜18:00、夜は 18:00〜06:00 を1ターン(日の出・日の入りは TODO(要裏取り))。
#   19日 09:00〜18:00 = ターン1〜9、夜 = 10、20日 = 11〜22、夜 = 23、21日 = 24〜35、夜 = 36、22日 = 37〜48、夜 = 49、23日 06:00〜11:00 = 50〜54
# 史実では23日 10:20 に最初の旗が山頂に立った
FIRST_DAY_TURNS = 9
DAY_TURNS = 12
PER_DAY = DAY_TURNS + 1
NIGHT1 = FIRST_DAY_TURNS + 1


def at_hour(day, hour):
    """19日を day=1 として、その日の hour 時に始まるターン(昼だけ)"""
    if day == 1:
        return hour - 9 + 1
    return NIGHT1 + 1 + (day - 2) * PER_DAY + (hour - 6)


MAX_TURNS = at_hour(5, 10)


def rf(turn, uid, side, toe, p, facing, **extra):
    r = L([("turn", turn), ("id", uid), ("side", side), ("toe", toe), ("x", p[0]), ("y", p[1]), ("facing", facing)])
    r.update(extra)
    return r


units = [
    # 米軍:第28海兵連隊(リヴァセッジ大佐)の第1・第2大隊がグリーン・ビーチへ。元パラマリン・レイダーが多い(古参とする)。大隊の人数は TODO(要裏取り)
    unit("us-1-28", "us", "usmc_infantry_battalion_1944", S.offset(P["green"], -250, 250), 270, training="veteran"),
    unit("us-2-28", "us", "usmc_infantry_battalion_1944", S.offset(P["green"], 0, 500), 225, training="veteran"),
    # 第27海兵連隊:レッド1に2/27、レッド2に1/27(09:02)。北の翼を受け持つ
    unit("us-2-27", "us", "usmc_infantry_battalion_1944", P["red1"], 300),
    unit("us-1-27", "us", "usmc_infantry_battalion_1944", P["red2"], 330),
    # 日本軍・摺鉢山地区(厚地兼彦大佐):陸海軍あわせて約2,000(中)。独立歩兵第312大隊、海軍の砲台と部隊、独立速射砲第10大隊。
    # 内訳と人数は TODO(要裏取り:『戦史叢書 中部太平洋陸軍作戦(2)』、Hyperwar の日本軍戦闘序列)
    unit("jp-312", "jp", "jp_infantry_battalion_1944", P["base_n"], 0, entrenchment=3, stance="defense"),
    unit("jp-navy", "jp", "jp_infantry_battalion_1944", S.offset(P["summit"], 0, 250), 0, entrenchment=3, strength=0.6, stance="defense", training="green"),
    unit("jp-navy-w", "jp", "jp_infantry_battalion_1944", S.offset(P["summit"], -250, 0), 315, entrenchment=3, strength=0.6, stance="defense", training="green"),
    unit("jp-10at", "jp", "jp_antitank_battalion_1944", S.offset(P["base_n"], 250, -250), 45, entrenchment=3),
    # 山の砲・迫撃砲:上陸前の艦砲射撃で、14cm 平射砲を含む13門が壊れた。残りの数は TODO(要裏取り)
    unit("jp-guns", "jp", "artillery_battalion", P["summit"], 45, entrenchment=3, strength=0.4),
    # 第1飛行場の南の守り(混成第2旅団の一部。規模は TODO(要裏取り))。第27海兵連隊の相手
    unit("jp-2mixed", "jp", "jp_infantry_battalion_1944", S.offset(P["south_field"], 0, 500), 135, entrenchment=3),
]

reinforcements = [
    # 3/28 は予定より早く投入された(正確な時刻は TODO(要裏取り))
    rf(at_hour(1, 11), "us-3-28", "us", "usmc_infantry_battalion_1944", P["green"], 270, training="veteran"),
    # 第5戦車大隊C中隊の6両(11:48 に上陸の命令)。M4A3 だが、編成表は海兵のM4A2の中隊で代える。中隊15両の4割
    rf(at_hour(1, 13), "us-5tank-c", "us", "usmc_tank_company_1944", P["red2"], 270, strength=0.4),
    # 第13海兵連隊第3大隊(105mm):D-Day の午後に上陸し、夕暮れまでに摺鉢山を撃ち始めた
    rf(at_hour(1, 15), "us-3-13", "us", "artillery_battalion", S.offset(P["red1"], -500, 250), 225),
    # 島の本隊からの増援(栗林中将は摺鉢山へ兵を送らなかった。北の第27海兵連隊への圧力として、2日目に1個大隊。規模・時刻は仮置き TODO)
    rf(at_hour(2, 6), "jp-north", "jp", "jp_infantry_battalion_1944", nodes["north_edge"], 225),
]

objectives = [
    objective("neck", "島の首(西海岸)", P["neck_w"], 2, "jp", radius=300),
    objective("base", "摺鉢山の北のふもと", P["base_n"], 1, "jp", radius=300),
    objective("summit", "摺鉢山の山頂", P["summit"], 3, "jp", radius=250),
    objective("south_field", "第1飛行場", P["south_field"], 1, "jp", radius=500),
]

scenario = L(
    [
        ("id", "iwo-suribachi-1945-02-19"),
        ("name", "硫黄島・摺鉢山 1945年2月19〜23日(v0・概略図)"),
        (
            "description",
            "第28海兵連隊がグリーン・ビーチに上陸し、幅約690mの島の首を横断して摺鉢山を孤立させる。山のふもとと山腹には"
            "ブロックハウスと洞窟が坑道でつながって並び、重火器では黙らせにくい。火炎放射器と爆薬の班で1日に約200ヤードずつ進む。"
            "海岸の火山砂で戦車は埋まり、20日と22日は雨。史実では23日10:20に最初の星条旗が山頂に立った。",
        ),
        (
            "notes",
            "v0・概略図。島の形・海岸の位置、両軍の兵力の内訳、砲の数、日の出・日の入りは TODO(要裏取り)"
            "(資料のページを直接読めず、検索結果の要約で組み立てた)。上陸の流れは表さず、第1波が海岸に着いた 09:00 から始める。"
            "21日の荒れた海(揚陸を大型艦艇に絞った)と、雨と火山灰による武器の不調は表していない。23日の天候は記録がないので22日の雨が続くものとした。"
            "勝利条件・指揮ポイント・補給量・航空の編隊の数・艦砲の回数は仮置き。根拠は docs/research/iwo-suribachi-1945-02.md。"
            "作り直しは tools/scenarios/build_iwo_suribachi_1945_02_19.py。",
        ),
        ("packs", PACKS_PACIFIC),
        ("sides", [L([("id", "us"), ("name", "米軍(第5海兵師団)")]), L([("id", "jp"), ("name", "日本軍(摺鉢山地区隊)")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 9), ("startDate", "1945-02-19")])),
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
                                # 史実の結末:19日夜に孤立させ、23日朝に山頂を取った → 米軍の決定的勝利
                                ("us", L([("decisive", L([("required", ["summit", "neck"])])), ("limited", L([("required", ["neck"])])), ("urgency", 0.6)])),
                                # 山頂とふもとを持ちこたえれば日本軍の勝ち(島の首を取られて孤立しても、山を保てば引き分け)
                                ("jp", L([("decisive", L([("required", ["summit", "base", "neck"])])), ("limited", L([("required", ["summit", "base"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 6), ("jp", 4)])),
                    # 19日:晴れ。20日:冷たい雨。21日:強い風(曇りとする)。22日:前日より強い雨(高)。23日は TODO(要裏取り)
                    (
                        "weather",
                        L(
                            [
                                ("initial", "clear"),
                                ("changeChancePerHour", 0.0),
                                ("minHoursBetweenChanges", 3),
                                ("improveChance", 0.5),
                                (
                                    "schedule",
                                    [
                                        L([("turn", at_hour(2, 6)), ("weather", "rain")]),
                                        L([("turn", at_hour(3, 6)), ("weather", "overcast")]),
                                        L([("turn", at_hour(4, 6)), ("weather", "rain")]),
                                    ],
                                ),
                            ]
                        ),
                    ),
                    # 空母機:21日の攻撃の前に40機の空襲(高)。編隊の数は仮置き
                    ("air", L([("us", L([("strike", L([("groups", 4), ("replacementPerDay", 1.0), ("weapon", "ground_attack_aircraft"), ("count", 10), ("strikeMinutes", 10)]))]))])),
                    # 艦砲射撃:毎朝、攻撃の前に艦砲と軍団砲兵の準備射撃(高)。回数と門数は仮置き
                    ("naval", L([("us", L([("gunfire", L([("missionsPerDay", 6), ("weapon", "naval_gun"), ("count", 12), ("rangeFromSeaM", 8000)]))]))])),
                    ("night", L([("turn", NIGHT1), ("hours", 12), ("everyTurns", PER_DAY)])),
                    # 日本軍は投降しない:摺鉢山は初めから海に囲まれて孤立していたが、守備隊はほぼ全滅するまで戦った
                    # (D+4 までに312大隊の大部分が死傷。捕虜はわずか)。投降の規則のままでは、包囲の士気の減りで6ターンほどで投降した
                    ("noSurrender", ["jp"]),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-beach"), ("side", "us"), ("nodeId", "red1"), ("ammoT", 1500), ("fuelT", 300)]),
                # 洞窟の備蓄(量は仮置き)。山頂から山の小道で届く
                L([("id", "jp-caves"), ("side", "jp"), ("nodeId", "summit"), ("ammoT", 300), ("fuelT", 20)]),
                L([("id", "jp-north"), ("side", "jp"), ("nodeId", "north_edge"), ("ammoT", 300), ("fuelT", 50)]),
            ],
        ),
    ]
)

scenario["formations"] = formations(
    scenario,
    [
        ("us-5mardiv", "第5海兵師団", "us", None, ["us-5tank-c", "us-3-13"]),
        ("us-28mar", "第28海兵連隊", "us", "us-5mardiv", ["us-1-28", "us-2-28", "us-3-28"]),
        ("us-27mar", "第27海兵連隊", "us", "us-5mardiv", ["us-1-27", "us-2-27"]),
        ("jp-109div", "第109師団(小笠原兵団)", "jp", None, ["jp-north", "jp-2mixed"]),
        ("jp-suribachi", "摺鉢山地区隊(厚地大佐)", "jp", "jp-109div", ["jp-312", "jp-navy", "jp-navy-w", "jp-10at", "jp-guns"]),
    ],
)
scenario["customization"] = L([("us", L([("units", "all"), ("budgetMultiplier", 1.0)])), ("jp", L([("units", "all"), ("budgetMultiplier", 1.0)]))])

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
    for row in S.grid:
        print("".join(row))
