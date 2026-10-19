#!/usr/bin/env python3
"""
エドソンの丘(血染めの丘/ムカデ高地)の戦い 1942年9月12〜14日(ガダルカナル)のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_edson_ridge_1942_09_12.py

出力: data/scenarios/edson-ridge-1942-09-12.json

川口支隊がジャングルを抜けて、ヘンダーソン飛行場の南の草地の尾根を2晩続けて夜襲する。主な戦闘が夜なので、夜を1ターンに
まとめず、暗い時間(darkTurns:1時間ごとに解くが見通しは夜と同じ、航空は使えない、砲撃は使える)にする。
根拠と残りの裏取りは docs/research/edson-ridge-1942-09.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。
丘・川・海岸の位置、各大隊の兵力、日没・日の出の時刻は TODO(要裏取り)。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Sketch, formations, objective, unit  # noqa: E402
from build_slim_river_1942_01_07 import PACKS_PACIFIC  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/edson-ridge-1942-09-12.json"

# 10km × 9.5km。北は海(ルンガ岬の沖)、南は丘の南のジャングル、西はルンガ川の西(第5海兵連隊第3大隊)、東はテナル川(第1海兵連隊第3大隊)
S = Sketch(origin=(-9.437, 160.052), cols=40, rows=38)

P = L(
    [
        ("airfield", S.at(-9.42806, 160.05472)),  # ヘンダーソン飛行場(今のホニアラ国際空港の基準点。高。1942年の滑走路と同じかは要確認)
        ("hill123", S.at(-9.4460, 160.0510)),  # Hill 123:飛行場の南端から約1.55km(相対位置は中。座標は推定 TODO(要裏取り))
        ("hill80", S.at(-9.4510, 160.0500)),  # Hill 80:Hill 123 の南約550m(推定)
        ("east_spur", S.at(-9.4480, 160.0545)),  # 空挺大隊が守った東の支脈(推定)
        ("reserve", S.at(-9.4380, 160.0520)),  # 2/5 の予備:丘と飛行場の間(推定)
        ("lunga_w", S.at(-9.4250, 160.0300)),  # 3/5:ルンガ川の西、海岸寄り(推定)
        ("tenaru", S.at(-9.4300, 160.0760)),  # 3/1:テナル川の線(推定)
        ("guns", S.at(-9.4240, 160.0480)),  # 第11海兵連隊の砲(飛行場の西。推定)
    ]
)

S.legend["."] = "jungle"  # 既定はジャングル
S.terrain("O", "plain")  # 尾根の上の草地(クナイ草)・飛行場
S.terrain("P", "plantation")  # 海岸沿いのヤシ園
S.terrain("H", "hill")
S.terrain("R", "river")
S.terrain("W", "large_river")  # 海

# 海岸(北の端から2セルを海、その南2セルをヤシ園。線は推定)
S.rect(S.xy(-9.4105, 160.00), S.xy(-9.40, 160.10), "W")
S.rect(S.xy(-9.4155, 160.00), S.xy(-9.4105, 160.10), "P")
# 飛行場と、そのまわりの開けた土地
S.rect(S.xy(-9.4330, 160.0420), S.xy(-9.4230, 160.0680), "O")
# 尾根:南北に延びる草地。Hill 123 と Hill 80 は高地、東の支脈も
S.line([S.xy(-9.4360, 160.0515), S.xy(-9.4530, 160.0500)], "O", 0)
S.mark(P["hill123"], "H", 0)
S.mark(P["hill80"], "H", 0)
S.mark(P["east_spur"], "O", 0)
# ルンガ川(南から北へ流れ、ルンガ岬で海に出る)と、丘の西の潟湖(川と同じに扱う)。テナル川(東の境)。線は推定 TODO(要裏取り)
S.line([S.xy(-9.475, 160.0440), S.xy(-9.450, 160.0430), S.xy(-9.430, 160.0380), S.xy(-9.412, 160.0330)], "R", 0)
S.mark(S.xy(-9.4500, 160.0465), "R", 0)
S.line([S.xy(-9.475, 160.0780), S.xy(-9.440, 160.0770), S.xy(-9.412, 160.0790)], "R", 0)

nodes = L(
    [
        ("lunga_pt", S.at(-9.4130, 160.0320)),  # ルンガ岬(補給の集積所)
        ("west_edge", S.at(-9.4140, 160.0060)),  # 海岸道路の西(マタニカウ川方面)
        ("west_road", S.at(-9.4140, 160.0250)),
        ("airfield", P["airfield"]),
        ("ridge_n", S.at(-9.4360, 160.0515)),
        ("hill123", P["hill123"]),
        ("east_road", S.at(-9.4170, 160.0760)),  # テナル川の河口付近
        ("east_edge", S.at(-9.4170, 160.0950)),
        ("trail_s", S.at(-9.4780, 160.0600)),  # 南のジャングルの小道(川口支隊が切り開いた道。位置は推定)
    ]
)
for k, p in nodes.items():
    S.node(k, p)
for a, b, cap in [
    ("west_edge", "west_road", 100),
    ("west_road", "lunga_pt", 100),  # ルンガ川の河口を渡る(橋)
    ("lunga_pt", "airfield", 150),
    ("airfield", "east_road", 100),
    ("east_road", "east_edge", 100),  # テナル川の河口(橋)
    ("airfield", "ridge_n", 50),
    ("ridge_n", "hill123", 30),  # 尾根の上の小道
    ("hill123", "trail_s", 10),  # 南のジャングルへの小道(日本軍の補給はここから。携行の分のほかはほとんど届かない)
]:
    S.road(a, b, cap)

# 時間:12日 19:00 から14日 10:00 まで、1時間ごと(夜も1ターンにまとめない)。日没 18時ごろ・日の出 6時ごろの見込み
# (南緯9.4度の9月中旬。当時の時刻帯も含めて TODO(要裏取り))。月はほぼ新月で、真っ暗な夜
#   12日の夜 19:00〜06:00 = ターン1〜11、13日の昼 06:00〜18:00 = 12〜23、13日の夜 18:00〜06:00 = 24〜35、14日の朝 06:00〜10:00 = 36〜39
MAX_TURNS = 39
DARK = [L([("from", 1), ("to", 11)]), L([("from", 24), ("to", 35)])]

# 日本軍:蔓・下草・急な谷を抜ける行軍で遅れ、ばらばらになり、糧食も乏しい(タシンボコの集積所は9月8日に壊された)。
# 疲労0.5は仮置き。兵力は中央隊3個大隊で約3,000(中)。大隊ごとの実数は TODO(要裏取り:Frank『Guadalcanal』付録、戦史叢書『南太平洋陸軍作戦(1)』)
TIRED = dict(fatigue=0.5)
units = [
    # 米軍:エドソン中佐の第1海兵突撃大隊と第1海兵空挺大隊(合わせて約840。空挺は約240)。大隊の兵力は D編制の大隊の戦力の割合で仮置き
    unit("us-1raider", "us", "usmc_infantry_battalion_1942", S.offset(P["hill80"], 0, 250), 180, entrenchment=1, strength=0.65, training="elite", fatigue=0.2),
    unit("us-1para", "us", "usmc_infantry_battalion_1942", P["east_spur"], 135, entrenchment=1, strength=0.25, training="veteran", fatigue=0.2),
    unit("us-2-5", "us", "usmc_infantry_battalion_1942", P["reserve"], 180, training="veteran"),  # 予備(14日04:00に投入)
    unit("us-3-5", "us", "usmc_infantry_battalion_1942", P["lunga_w"], 225, entrenchment=2, training="veteran"),
    unit("us-3-1", "us", "usmc_infantry_battalion_1942", P["tenaru"], 90, entrenchment=3, training="veteran"),  # 鉄条網あり
    # 第11海兵連隊:105mm の第5大隊(13日21:00から夜明けまでに1,992発)と75mm 山砲の大隊。門数は TODO(要裏取り)
    unit("us-5-11", "us", "artillery_battalion", P["guns"], 180, entrenchment=1),
    unit("us-3-11", "us", "usmc_pack_howitzer_battalion", S.offset(P["guns"], 500, 0), 180, entrenchment=1),
    # 第1戦車大隊の軽戦車6両(14日朝に歩兵を伴わずに出て、37mm砲にやられた)。軽戦車の編成表がないので、汎用の戦車大隊の戦力を下げて置く(TODO)
    unit("us-1tank", "us", "tank_battalion", S.offset(P["airfield"], 1000, 0), 180, strength=0.15),
    # 日本軍・川口支隊。中央隊:国生大隊(I/124)・渡辺大隊(III/124)・田村大隊(II/4、青葉支隊)
    unit("jp-1-124", "jp", "jp_infantry_battalion_1942_light", S.offset(P["hill80"], -750, -1250), 0, **TIRED),
    unit("jp-3-124", "jp", "jp_infantry_battalion_1942_light", S.offset(P["hill80"], 250, -1750), 0, **TIRED),
    unit("jp-2-4", "jp", "jp_infantry_battalion_1942_light", S.offset(P["hill80"], 0, -2750), 0, **TIRED),
    # 東の助攻:熊大隊(水野少佐。一木支隊第2梯団)。37mm 速射砲4門を持っていた。兵力は TODO(要裏取り)
    unit("jp-kuma", "jp", "jp_infantry_battalion_1941", S.offset(P["tenaru"], 750, -1500), 315, strength=0.6, **TIRED),
    # 西の助攻:岡部隊(第124連隊第2大隊が主体)。攻撃したのは約650人
    unit("jp-oka", "jp", "jp_infantry_battalion_1942_light", S.offset(P["lunga_w"], -1500, -1500), 45, strength=0.6, **TIRED),
]

objectives = [
    objective("airfield", "ヘンダーソン飛行場", P["airfield"], 5, "us", radius=900),
    objective("hill123", "Hill 123", P["hill123"], 2, "us", radius=300),
    objective("hill80", "Hill 80", P["hill80"], 1, "us", radius=300),
]

scenario = L(
    [
        ("id", "edson-ridge-1942-09-12"),
        ("name", "エドソンの丘 1942年9月12〜14日(ガダルカナル・v0・概略図)"),
        (
            "description",
            "ガダルカナル島。川口支隊がジャングルを抜けて、ヘンダーソン飛行場の南の草地の尾根を2晩続けて夜襲する。"
            "守るのはエドソン中佐の突撃大隊と空挺大隊の約840人。真っ暗な夜は1時間ごとに解き、航空は使えないが砲撃は使える。"
            "日本軍は砲を置いてきており、疲れて糧食も乏しい。米軍は草地の射界と105mm・75mm の砲撃、予備の大隊で支える。"
            "史実では Hill 80 を取られたが、Hill 123 と飛行場を守り抜いた。",
        ),
        (
            "notes",
            "v0・概略図。丘・川・海岸の位置、各大隊の兵力、日没・日の出の時刻、砲の門数は TODO(要裏取り)"
            "(資料のページを直接読めず、検索結果の要約で組み立てた)。夜は暗い時間(darkTurns)として1時間ごとに解く。"
            "日本軍の疲労0.5、大隊の戦力の割合、勝利条件・指揮ポイント・補給量・航空の編隊の数は仮置き。"
            "根拠は docs/research/edson-ridge-1942-09.md。作り直しは tools/scenarios/build_edson_ridge_1942_09_12.py。",
        ),
        ("packs", PACKS_PACIFIC),
        ("sides", [L([("id", "jp"), ("name", "日本軍(川口支隊)")]), L([("id", "us"), ("name", "米軍(第1海兵師団)")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 19), ("startDate", "1942-09-12")])),
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
                                ("jp", L([("decisive", L([("required", ["airfield"])])), ("limited", L([("required", ["hill123"])])), ("urgency", 0.8)])),
                                # 史実の結末:Hill 80 は取られたが、Hill 123 と飛行場を守った → 米軍の決定的勝利
                                ("us", L([("decisive", L([("required", ["airfield", "hill123"])])), ("limited", L([("required", ["airfield"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("jp", 4), ("us", 6)])),
                    # 雨は資料で確認できない(TODO(要裏取り))。晴れのまま(昼は航空が使える)
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.0), ("minHoursBetweenChanges", 3), ("improveChance", 0.5)])),
                    (
                        "air",
                        L(
                            [
                                # カクタス航空隊(F4F・SBD・P-400)。13日にF4F 18機が増援。日ごとの稼働機数は TODO(要裏取り:Lundstrom『The First Team and the Guadalcanal Campaign』)
                                ("us", L([("strike", L([("groups", 2), ("replacementPerDay", 0.5), ("weapon", "ground_attack_aircraft"), ("count", 6), ("strikeMinutes", 10)])), ("fighters", L([("groups", 3), ("replacementPerDay", 1.0)]))])),
                                # ラバウルからの一式陸攻と零戦(昼の空襲)。編隊の数は仮置き
                                ("jp", L([("strike", L([("groups", 2), ("replacementPerDay", 0.5), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)])), ("fighters", L([("groups", 2), ("replacementPerDay", 0.5)]))])),
                            ]
                        ),
                    ),
                    # 日本の艦砲射撃:12日21:30ごろに軽巡川内と駆逐艦3隻、13日21:00に駆逐艦7隻が丘を撃った。回数と門数は仮置き
                    ("naval", L([("jp", L([("gunfire", L([("missionsPerDay", 1), ("weapon", "naval_gun"), ("count", 6), ("rangeFromSeaM", 8000)]))]))])),
                    ("darkTurns", DARK),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-lunga"), ("side", "us"), ("nodeId", "lunga_pt"), ("ammoT", 800), ("fuelT", 200)]),
                # 日本軍の補給はほとんど届かない(タシンボコの集積所は壊された)。南の小道の端の少しの備蓄(量は仮置き)
                L([("id", "jp-trail"), ("side", "jp"), ("nodeId", "trail_s"), ("ammoT", 40), ("fuelT", 0)]),
            ],
        ),
    ]
)

scenario["formations"] = formations(
    scenario,
    [
        ("jp-kawaguchi", "川口支隊", "jp", None, ["jp-kuma", "jp-oka"]),
        ("jp-center", "中央隊", "jp", "jp-kawaguchi", ["jp-1-124", "jp-3-124", "jp-2-4"]),
        ("us-1mardiv", "第1海兵師団", "us", None, ["us-1tank"]),
        ("us-edson", "エドソン中佐の部隊", "us", "us-1mardiv", ["us-1raider", "us-1para", "us-2-5"]),
        ("us-1mar", "第1海兵連隊", "us", "us-1mardiv", ["us-3-1"]),
        ("us-5mar", "第5海兵連隊", "us", "us-1mardiv", ["us-3-5"]),
        ("us-11mar", "第11海兵連隊(砲兵)", "us", "us-1mardiv", ["us-5-11", "us-3-11"]),
    ],
)
scenario["customization"] = L([("jp", L([("units", "all"), ("budgetMultiplier", 1.0)])), ("us", L([("units", "all"), ("budgetMultiplier", 1.0)]))])

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
