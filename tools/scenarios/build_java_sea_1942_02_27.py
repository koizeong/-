#!/usr/bin/env python3
"""
スラバヤ沖海戦 1942年2月27日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_java_sea_1942_02_27.py

出力: data/scenarios/java-sea-1942-02-27.json

ドールマンの ABDA 打撃部隊(巡洋艦5・駆逐艦9)が、ジャワ島に向かう日本の上陸船団を叩きに出る。
高木の第五戦隊(那智・羽黒)と第二・第四水雷戦隊が船団を守る。昼の遠距離の撃ち合い(弾を大量に使って当たらない)と、夜の雷撃。
1km のセルで 170km × 180km の海。艦は1隻ずつ(太平洋 1942年の艦級 data/toe/pacific-ships-1942.json)、戦隊は上級部隊。
位置・針路・時刻の根拠と残りの裏取りは docs/research/java-sea-1942-02.md(どれも概略。TODO(要裏取り))。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/java-sea-1942-02-27.json"
CELL = 1000
COLS, ROWS = 170, 180
KM = 1000

# 経緯度からの概算(原点は南西の角=東経111°18′・南緯7°18′、1′ ≒ 1.84km)。海岸線は直線でならした。TODO(要裏取り):海図
# ジャワ島の北岸(西から:レンバン → トゥバン → スラバヤの西の海峡)
JAVA = [(0, 66 * KM), (82 * KM, 44 * KM), (148 * KM, 16 * KM), (170 * KM, 10 * KM)]
# マドゥラ島(スラバヤの北東。北岸を直線でならした)
MADURA_X0, MADURA_Y1 = 154 * KM, 44 * KM
# バウエアン島
BAWEAN = (148 * KM, 165 * KM)
BAWEAN_R = 6 * KM


def line_y(pts, x):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


rows = []
for r in range(ROWS):
    y = (ROWS - 1 - r) * CELL + CELL / 2
    row = ""
    for c in range(COLS):
        x = c * CELL + CELL / 2
        g = line_y(JAVA, x)
        land = (g is not None and y < g) or (x >= MADURA_X0 and y < MADURA_Y1) or math.hypot(x - BAWEAN[0], y - BAWEAN[1]) <= BAWEAN_R
        row += "." if land else "~"
    rows.append(row)


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return (round(base[0] + math.sin(r) * dist_m), round(base[1] + math.cos(r) * dist_m))


def column(prefix, side, base, facing, ships, training=None, spacing=700):
    """1隻ずつの艦を、戦隊の旗艦(先頭)の後ろへ一列に置く"""
    out = []
    for k, (sid, toe, name) in enumerate(ships):
        p = polar(base, facing + 180, spacing * k) if k else base
        d = {"id": f"{prefix}-{sid}", "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing, "name": name}
        if training:
            d["training"] = training
        out.append(d)
    return out


# 16:00 の位置(概略。16:16 ごろ約 25km で撃ち合いが始まった。TODO(要裏取り):各国の戦闘報告の航跡図、Dull『A Battle History of the IJN』)
# 連合:スラバヤを出て北西へ(巡洋艦の単縦陣、前に英の駆逐艦、後ろに蘭・米の駆逐艦)
AL_POS = (140 * KM, 115 * KM)
AL_COURSE = 300
# 日本:第五戦隊は北から南へ、第二水雷戦隊(神通)は東寄り、第四水雷戦隊(那珂)は西寄りに先行
JP_CA_POS = (125 * KM, 152 * KM)
JP_COURSE = 200
JP_2SD_POS = (138 * KM, 145 * KM)
JP_4SD_POS = (112 * KM, 148 * KM)
# 上陸船団(輸送船41隻)はバウエアン島の西を南下していた。ここでは船団のいる海を目標にする(輸送船は表さない)
CONVOY = (95 * KM, 165 * KM)

# 艦級:白露型・朝潮型は陽炎型で、綾波型は吹雪型で代えた(TODO(要裏取り):白露型・朝潮型の艦級)。各戦隊の艦の割り振りは TODO(要裏取り)
JP_CA = [
    ("nachi", "jp-ca-myoko", "那智(旗艦)"),
    ("haguro", "jp-ca-myoko", "羽黒"),
    ("ushio", "jp-dd-fubuki", "潮"),
    ("sazanami", "jp-dd-fubuki", "漣"),
    ("yamakaze", "jp-dd-kagero", "山風"),
    ("kawakaze", "jp-dd-kagero", "江風"),
]
JP_2SD = [
    ("jintsu", "jp-cl-5500t", "神通"),
    ("yukikaze", "jp-dd-kagero", "雪風"),
    ("tokitsukaze", "jp-dd-kagero", "時津風"),
    ("amatsukaze", "jp-dd-kagero", "天津風"),
    ("hatsukaze", "jp-dd-kagero", "初風"),
]
JP_4SD = [
    ("naka", "jp-cl-5500t", "那珂"),
    ("asagumo", "jp-dd-kagero", "朝雲"),
    ("minegumo", "jp-dd-kagero", "峯雲"),
    ("murasame", "jp-dd-kagero", "村雨"),
    ("samidare", "jp-dd-kagero", "五月雨"),
    ("harusame", "jp-dd-kagero", "春雨"),
    ("yudachi", "jp-dd-kagero", "夕立"),
]
AL_CRU = [
    ("de-ruyter", "nl-cl-de-ruyter", "デ・ロイテル(旗艦)"),
    ("exeter", "uk-ca-york", "エクセター"),
    ("houston", "us-ca-northampton", "ヒューストン"),
    ("perth", "au-cl-perth", "パース"),
    ("java", "nl-cl-java", "ジャワ"),
]
AL_UK = [("electra", "uk-dd-e", "エレクトラ"), ("encounter", "uk-dd-e", "エンカウンター"), ("jupiter", "uk-dd-j", "ジュピター")]
AL_NL = [("kortenaer", "nl-dd-admiralen", "コルテノール"), ("witte-de-with", "nl-dd-admiralen", "ウィッテ・デ・ウィット")]
AL_US = [("edwards", "us-dd-clemson", "ジョン・D・エドワーズ"), ("alden", "us-dd-clemson", "オールデン"), ("ford", "us-dd-clemson", "ジョン・D・フォード"), ("paul-jones", "us-dd-clemson", "ポール・ジョーンズ")]

units = (
    # ヒューストンは2月4日の空襲で後部の主砲塔(3番砲塔)を失っていた。TODO(要裏取り):ここでは表さない(9門のまま)
    # 連合は寄り合いの艦隊(英・蘭・米・豪の4か国。言葉・信号・戦術の決まりが違い、共同の訓練もない)なので未熟(ゲームの置き方。
    # 練度で命令の遅れ・射撃・見分け・応急が落ちる)。ドールマンの命令は旗旒信号と無線の翻訳で伝わり、エクセターの被弾の後に陣形が乱れた
    column("al-cru", "al", AL_POS, AL_COURSE, AL_CRU, spacing=900, training="green")
    + column("al-uk", "al", polar(AL_POS, AL_COURSE, 5000), AL_COURSE, AL_UK, training="green")
    + column("al-nl", "al", polar(AL_POS, AL_COURSE + 180, 6000), AL_COURSE, AL_NL, training="green")
    + column("al-us", "al", polar(AL_POS, AL_COURSE + 180, 8000), AL_COURSE, AL_US, training="green")
    # 日本は開戦からの戦いを重ねていたので古参(ゲームの置き方)
    + column("jp-5s", "jp", JP_CA_POS, JP_COURSE, JP_CA, training="veteran")
    + column("jp-2sd", "jp", JP_2SD_POS, JP_COURSE, JP_2SD, training="veteran")
    + column("jp-4sd", "jp", JP_4SD_POS, JP_COURSE, JP_4SD, training="veteran")
)
ids = lambda prefix: [u["id"] for u in units if u["id"].startswith(prefix + "-")]

TURNS = 26  # 16:00 から 20分のターンで 00:40 まで
scenario = {
    "id": "java-sea-1942-02-27",
    "name": "スラバヤ沖海戦 1942年2月27日(v0・概略図)",
    "description": "夕方、ドールマンの ABDA 打撃部隊が、ジャワ島に向かう日本の上陸船団を叩きに出る。高木の重巡2隻と2つの水雷戦隊が立ちはだかる。昼は遠い距離の撃ち合い、夜は雷撃。言葉も信号も違う4か国の寄り合いの艦隊で、船団まで届くか。",
    "notes": "v0。1km のセル(170km × 180km)。位置・針路・時刻は資料の要約からの概略で、海岸線は直線でならした。輸送船団・水上機・航空攻撃は表さない(船団のいる海を目標にした)。ジュピターの触雷、米の駆逐艦の燃料切れの引き揚げは表さない。根拠は docs/research/java-sea-1942-02.md。作り直しは tools/scenarios/build_java_sea_1942_02_27.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "al", "name": "連合軍(ABDA)"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 16, "startDate": "1942-02-27"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": TURNS,
        # 日没は 18:20 ごろとして、8ターン目(18:20)から暗い。TODO(要裏取り):1942年2月27日のジャワ海の日没と月
        "darkTurns": [{"from": 8, "to": TURNS}],
        "objectives": [
            {"id": "convoy", "name": "上陸船団の海", "x": CONVOY[0], "y": CONVOY[1], "radiusM": 10000, "weight": 1, "initialHolder": "jp"},
        ],
        "victory": {
            # 連合:船団の海に1ターンでも居座れば(輸送船を叩けば)限定的、2ターンと日本の損耗 15% で決定的。
            # 日本:船団の海を最後まで渡さなければ限定的、それに連合の損耗 30% で決定的(ゲームの設計)
            "jp": {
                "conditions": [
                    {"id": "guard", "type": "hold", "objective": "convoy", "perTurn": True, "points": TURNS},
                    {"id": "al-loss", "type": "enemyLoss", "min": 0.3},
                ],
                "decisive": {"minPoints": TURNS, "requires": ["al-loss"]},
                "limited": {"minPoints": TURNS},
            },
            "al": {
                "conditions": [
                    {"id": "strike", "type": "hold", "objective": "convoy", "perTurn": True, "points": TURNS},
                    {"id": "jp-loss", "type": "enemyLoss", "min": 0.15},
                ],
                "decisive": {"minPoints": 2, "requires": ["jp-loss"]},
                "limited": {"minPoints": 1},
            },
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
        # 日本の水上機(重巡の偵察機)は連合の艦隊に触接し続けていた。連合は日本の位置を知らなかった(航空支援がなかった)
        "knownAtStart": [{"side": "jp", "unitId": u["id"]} for u in units if u["side"] == "al"],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-east": {"name": "東部攻略部隊の護衛(高木)", "side": "jp", "units": []},
        "jp-5s": {"name": "第五戦隊(那智・羽黒)と駆逐艦", "side": "jp", "parent": "jp-east", "units": ids("jp-5s")},
        "jp-2sd": {"name": "第二水雷戦隊(神通)", "side": "jp", "parent": "jp-east", "units": ids("jp-2sd")},
        "jp-4sd": {"name": "第四水雷戦隊(那珂)", "side": "jp", "parent": "jp-east", "units": ids("jp-4sd")},
        "al-strike": {"name": "ABDA 打撃部隊(ドールマン)", "side": "al", "units": []},
        "al-cru": {"name": "巡洋艦(デ・ロイテル・エクセター・ヒューストン・パース・ジャワ)", "side": "al", "parent": "al-strike", "units": ids("al-cru")},
        "al-uk": {"name": "英の駆逐艦", "side": "al", "parent": "al-strike", "units": ids("al-uk")},
        "al-nl": {"name": "蘭の駆逐艦", "side": "al", "parent": "al-strike", "units": ids("al-nl")},
        "al-us": {"name": "米の駆逐艦(第58駆逐隊)", "side": "al", "parent": "al-strike", "units": ids("al-us")},
    },
    "historicalOutcome": {
        "winner": "jp",
        "level": "decisive",
        "summary": "昼の遠い距離の撃ち合いでは両軍とも多くの弾を撃ってほとんど当たらず、羽黒の20cm 弾がエクセターの缶室を止めて戦列が乱れた。日本の雷撃でコルテノールが沈み、エレクトラは砲撃で沈んだ。夜、那智と羽黒の魚雷がデ・ロイテルとジャワを沈め、ドールマンは戦死した。連合は船団に届かず、日本の損傷は朝雲の1隻ほどだった。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
