#!/usr/bin/env python3
"""
サボ島沖海戦(第一次ソロモン海戦)1942年8月9日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_savo_1942_08_09.py

出力: data/scenarios/savo-1942-08-09.json

三川の第八艦隊が夜にサボ島の西から入り、南方部隊・北方部隊の重巡を雷撃と砲撃で叩く。連合軍は泊地(ルンガ・ツラギ)の輸送船団を守る。
1km のセルで 80km × 60km の海。艦は1隻ずつ(太平洋 1942年の艦級 data/toe/pacific-ships-1942.json)、戦隊は上級部隊。
位置・針路・時刻の根拠と残りの裏取りは docs/research/savo-1942-08.md(どれも概略。TODO(要裏取り))。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/savo-1942-08-09.json"
CELL = 1000
COLS, ROWS = 80, 60
KM = 1000

# 経緯度からの概算(原点は南西の角=東経159°30′・南緯9°30′、1′ ≒ 1.84km)。TODO(要裏取り):海図
SAVO = (34 * KM, 40.5 * KM)
SAVO_R = 3.5 * KM
# ガダルカナル島の北岸(西から:西岸の先 → エスペランス岬 → ルンガ岬 → 東)
GUADALCANAL = [(0, 18 * KM), (13 * KM, 27.6 * KM), (59 * KM, 11 * KM), (80 * KM, 5 * KM)]
# フロリダ島の南岸(西の端 → ツラギの沖 → 東)
FLORIDA = [(50 * KM, 52 * KM), (60 * KM, 48 * KM), (72 * KM, 45 * KM), (80 * KM, 44 * KM)]


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
        g = line_y(GUADALCANAL, x)
        f = line_y(FLORIDA, x)
        land = math.hypot(x - SAVO[0], y - SAVO[1]) <= SAVO_R or (g is not None and y < g) or (f is not None and y > f)
        row += "." if land else "~"
    rows.append(row)


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return (round(base[0] + math.sin(r) * dist_m), round(base[1] + math.cos(r) * dist_m))


def column(prefix, side, base, facing, ships, training=None, spacing=600):
    """1隻ずつの艦を、戦隊の旗艦(先頭)の後ろへ一列に置く"""
    out = []
    for k, (sid, toe, name) in enumerate(ships):
        p = polar(base, facing + 180, spacing * k) if k else base
        d = {"id": f"{prefix}-{sid}", "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing, "name": name}
        if training:
            d["training"] = training
        out.append(d)
    return out


# 01:00 の位置(概略。TODO(要裏取り):米海軍大学校の分析の作図)
JP_POS = (8 * KM, 46 * KM)  # サボ島の西北西 約27km、サボ島の南を回る針路
SOUTH_POS = polar(SAVO, 135, 7400)  # サボ島の南東 約4カイリ、310°・130° の哨戒線(12ノット)
NORTH_POS = (44 * KM, 47 * KM)  # サボ島とフロリダ島の間、一辺5カイリの四角(10ノット)
BLUE_POS = (24 * KM, 37 * KM)  # サボ島の西(南の入口)
TALBOT_POS = (27 * KM, 49 * KM)  # サボ島の北西(北の入口)

# 第八艦隊の単縦陣(鳥海が先頭。順番は資料の要約から。TODO(要裏取り))。夜戦の訓練を重ねていたので古参(ゲームの置き方)
JP = [
    ("chokai", "jp-ca-chokai", "鳥海(旗艦)"),
    ("aoba", "jp-ca-furutaka", "青葉"),
    ("kako", "jp-ca-furutaka", "加古"),
    ("kinugasa", "jp-ca-furutaka", "衣笠"),
    ("furutaka", "jp-ca-furutaka", "古鷹"),
    ("tenryu", "jp-cl-tenryu", "天龍"),
    ("yubari", "jp-cl-yubari", "夕張"),
    ("yunagi", "jp-dd-kamikaze", "夕凪"),
]
SOUTH = [("canberra", "au-ca-kent", "キャンベラ"), ("chicago", "us-ca-northampton", "シカゴ"), ("patterson", "us-dd-bagley", "パターソン"), ("bagley", "us-dd-bagley", "バグレー")]
NORTH = [("vincennes", "us-ca-new-orleans", "ヴィンセンス"), ("quincy", "us-ca-new-orleans", "クインシー"), ("astoria", "us-ca-new-orleans", "アストリア"), ("helm", "us-dd-bagley", "ヘルム"), ("wilson", "us-dd-bagley", "ウィルソン")]

units = (
    column("jp", "jp", JP_POS, 115, JP, training="veteran")
    + column("al-south", "al", SOUTH_POS, 310, SOUTH)
    + column("al-north", "al", NORTH_POS, 45, NORTH)
    + column("al-blue", "al", BLUE_POS, 30, [("blue", "us-dd-bagley", "ブルー")])
    + column("al-talbot", "al", TALBOT_POS, 210, [("talbot", "us-dd-bagley", "ラルフ・タルボット")])
)
ids = lambda prefix: [u["id"] for u in units if u["id"].startswith(prefix + "-")]

LUNGA = (57 * KM, 14 * KM)
TULAGI = (70 * KM, 42 * KM)
scenario = {
    "id": "savo-1942-08-09",
    "name": "サボ島沖海戦 1942年8月9日(v0・概略図)",
    "description": "夜、三川の第八艦隊がサボ島の西から泊地へ突入する。連合軍の重巡は南と北の二手に分かれて哨戒している。先に見つけ、先に魚雷を放った側が勝つ。",
    "notes": "v0。1km のセル(80km × 60km)。位置・針路は資料の要約からの概略で、海岸線は直線でならした。日本の水上機の照明弾、オーストラリア(会議で離れていた)と東方部隊(戦いに加わらなかった)、輸送船団は表さない。根拠は docs/research/savo-1942-08.md。作り直しは tools/scenarios/build_savo_1942_08_09.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "al", "name": "連合軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 1, "startDate": "1942-08-09"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 8,
        "darkTurns": [{"from": 1, "to": 8}],
        "objectives": [
            {"id": "lunga", "name": "ルンガ泊地", "x": LUNGA[0], "y": LUNGA[1], "radiusM": 4000, "weight": 1, "initialHolder": "al"},
            {"id": "tulagi", "name": "ツラギ泊地", "x": TULAGI[0], "y": TULAGI[1], "radiusM": 4000, "weight": 1, "initialHolder": "al"},
        ],
        "victory": {
            # 日本:連合軍の損耗 35% で決定的・15% で限定的(史実は重巡4隻が沈み、損耗はおよそ4割)。連合:泊地を保ち、日本に 25%・10% の損耗(ゲームの設計)
            "jp": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.35}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.15}},
            "al": {"decisive": {"required": ["lunga", "tulagi"], "minWeight": 0, "minEnemyLoss": 0.25}, "limited": {"required": ["lunga", "tulagi"], "minWeight": 0, "minEnemyLoss": 0.1}},
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-8f": {"name": "第八艦隊(三川)", "side": "jp", "units": ids("jp")},
        "al-screen": {"name": "連合軍の護衛部隊", "side": "al", "units": []},
        "al-south": {"name": "南方部隊", "side": "al", "parent": "al-screen", "units": ids("al-south")},
        "al-north": {"name": "北方部隊", "side": "al", "parent": "al-screen", "units": ids("al-north")},
        "al-blue": {"name": "哨戒駆逐艦ブルー", "side": "al", "parent": "al-screen", "units": ids("al-blue")},
        "al-talbot": {"name": "哨戒駆逐艦ラルフ・タルボット", "side": "al", "parent": "al-screen", "units": ids("al-talbot")},
    },
    "historicalOutcome": {
        "winner": "jp",
        "level": "decisive",
        "summary": "第八艦隊はサボ島の南を回って南方部隊を、続いて北方部隊を雷撃と砲撃で叩き、キャンベラ・クインシー・ヴィンセンス・アストリアを沈めた。日本の損傷は小さかったが、三川は輸送船団を叩かずに引き揚げた。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
