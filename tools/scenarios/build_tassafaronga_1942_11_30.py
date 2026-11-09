#!/usr/bin/env python3
"""
タサファロンガ沖海戦(ルンガ沖夜戦)1942年11月30日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_tassafaronga_1942_11_30.py

出力: data/scenarios/tassafaronga-1942-11-30.json

田中頼三少将の第二水雷戦隊(駆逐艦8。6隻はドラム缶の補給を積む)がガダルカナル島の北岸に沿って南東へ下り、タサファロンガ沖で補給物資を落とそうとする。
ライト少将の第67任務部隊(重巡4・軽巡1・駆逐艦6)は東から来て、電探で先に見つけるが、雷撃の許可を待つ間に射点を失い、九三式魚雷の返り討ちに遭う。
地図はサボ島沖海戦と同じ概略図(1km のセルで 80km × 60km)。艦は1隻ずつ(太平洋 1942年の艦級)。
位置・針路・時刻の根拠と残りの裏取りは docs/research/tassafaronga-1942-11.md(どれも概略。TODO(要裏取り))。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/tassafaronga-1942-11-30.json"
CELL = 1000
COLS, ROWS = 80, 60
KM = 1000

# サボ島沖海戦と同じ概略の海岸線(build_savo_1942_08_09.py)。TODO(要裏取り):海図
SAVO = (34 * KM, 40.5 * KM)
SAVO_R = 3.5 * KM
GUADALCANAL = [(0, 18 * KM), (13 * KM, 27.6 * KM), (59 * KM, 11 * KM), (80 * KM, 5 * KM)]
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
    out = []
    for k, (sid, toe, name) in enumerate(ships):
        p = polar(base, facing + 180, spacing * k) if k else base
        d = {"id": f"{prefix}-{sid}", "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing, "name": name}
        if training:
            d["training"] = training
        if sid in DRUM_CARRIERS:
            d["torpedoReloads"] = 0
        out.append(d)
    return out


# 23:00 の位置(概略。米の電探が 23:06 に約 23,000ヤード=21km で日本の駆逐艦を捉えた。TODO(要裏取り):戦闘報告の航跡図)
# 第二水雷戦隊:エスペランス岬を回って、岸から 3〜4km を南東へ(陸影にまぎれる)
JP_POS = (27 * KM, 25.5 * KM)
JP_COURSE = 110
TAKANAMI_POS = polar(JP_POS, 30, 3500)  # 高波は警戒艦として沖側を進む
# 第67任務部隊:東から、駆逐艦4隻を前衛に、重巡・軽巡の単縦陣、後ろに駆逐艦2隻
US_POS = (52 * KM, 24 * KM)
US_COURSE = 290
US_VAN_POS = polar(US_POS, US_COURSE, 3700)

# 艦級:夕雲型(長波・巻波・高波)・白露型(江風・涼風)はパックにないので陽炎型で代えた。TODO(要裏取り):夕雲型・白露型の艦級。
# ドラム缶を積んだ6隻(長波・高波のほか)は次発装填の魚雷を降ろしていた:torpedoReloads 0。
# TODO(要裏取り):各艦の積んでいた本数。出典候補は NHHC H-Gram 013、Morison 5巻、戦史叢書『南東方面海軍作戦(2)』
DRUM_CARRIERS = {"makinami", "oyashio", "kuroshio", "kagero", "kawakaze", "suzukaze"}
JP = [
    ("naganami", "jp-dd-kagero", "長波(旗艦)"),
    ("makinami", "jp-dd-kagero", "巻波"),
    ("oyashio", "jp-dd-kagero", "親潮"),
    ("kuroshio", "jp-dd-kagero", "黒潮"),
    ("kagero", "jp-dd-kagero", "陽炎"),
    ("kawakaze", "jp-dd-kagero", "江風"),
    ("suzukaze", "jp-dd-kagero", "涼風"),
]
US_CRU = [
    ("minneapolis", "us-ca-new-orleans", "ミネアポリス(旗艦)"),
    ("new-orleans", "us-ca-new-orleans", "ニューオーリンズ"),
    ("pensacola", "us-ca-pensacola", "ペンサコラ"),
    ("honolulu", "us-cl-brooklyn", "ホノルル"),
    ("northampton", "us-ca-northampton", "ノーザンプトン"),
]
# 前衛の駆逐艦(フレッチャー・パーキンス・モーリー・ドレイトン)と後衛(ラムソン・ラードナー)。モーリーはグリッドレー級、ラードナーはベンソン級(仮置きの艦級)
US_VAN = [("fletcher", "us-dd-fletcher", "フレッチャー"), ("perkins", "us-dd-mahan", "パーキンス"), ("maury", "us-dd-bagley", "モーリー"), ("drayton", "us-dd-mahan", "ドレイトン")]
US_REAR = [("lamson", "us-dd-mahan", "ラムソン"), ("lardner", "us-dd-benson", "ラードナー")]

units = (
    column("jp-2sd", "jp", JP_POS, JP_COURSE, JP, training="elite")
    + column("jp-picket", "jp", TAKANAMI_POS, JP_COURSE, [("takanami", "jp-dd-kagero", "高波(警戒艦)")], training="elite")
    + column("us-van", "us", US_VAN_POS, US_COURSE, US_VAN)
    + column("us-cru", "us", US_POS, US_COURSE, US_CRU, spacing=900)
    + column("us-rear", "us", polar(US_POS, US_COURSE + 180, 6000), US_COURSE, US_REAR)
)
ids = lambda prefix: [u["id"] for u in units if u["id"].startswith(prefix + "-")]

# 補給物資を落とす所(タサファロンガ岬の沖)
DROP = (38 * KM, 20.5 * KM)
scenario = {
    "id": "tassafaronga-1942-11-30",
    "name": "タサファロンガ沖海戦 1942年11月30日(v0・概略図)",
    "description": "夜、田中の駆逐艦8隻がガダルカナル島の岸に沿ってドラム缶の補給を運ぶ。待ち受ける米の巡洋艦部隊は電探で先に見つける。先に撃つのは電探か、九三式魚雷か。",
    "notes": "v0。サボ島沖海戦と同じ概略図(1km のセルで 80km × 60km)。位置・針路は資料の要約からの概略。夕雲型・白露型は陽炎型で代え、ドラム缶を積んだ6隻は次発装填の魚雷を降ろしていた(torpedoReloads 0)。根拠は docs/research/tassafaronga-1942-11.md。作り直しは tools/scenarios/build_tassafaronga_1942_11_30.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "us", "name": "アメリカ軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 23, "startDate": "1942-11-30"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 6,
        "darkTurns": [{"from": 1, "to": 6}],
        "objectives": [{"id": "drop", "name": "タサファロンガ沖(補給の投下点)", "x": DROP[0], "y": DROP[1], "radiusM": 3000, "weight": 1, "initialHolder": None}],
        "victory": {
            # 日本:米の損耗 20% で決定的・10% で限定的(史実はノーザンプトンが沈み、重巡3隻が大破して損耗はおよそ2割強)。
            # 米:日本の損耗 35%・15%(駆逐艦8隻に対して、ゲームの設計)
            "jp": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.2}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.1}},
            "us": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.35}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.15}},
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-2sdf": {"name": "第二水雷戦隊(田中)", "side": "jp", "units": []},
        "jp-2sd": {"name": "第二水雷戦隊 本隊", "side": "jp", "parent": "jp-2sdf", "units": ids("jp-2sd")},
        "jp-picket": {"name": "警戒艦 高波", "side": "jp", "parent": "jp-2sdf", "units": ids("jp-picket")},
        "us-tf67": {"name": "第67任務部隊(ライト)", "side": "us", "units": []},
        "us-van": {"name": "前衛の駆逐艦", "side": "us", "parent": "us-tf67", "units": ids("us-van")},
        "us-cru": {"name": "巡洋艦部隊", "side": "us", "parent": "us-tf67", "units": ids("us-cru")},
        "us-rear": {"name": "後衛の駆逐艦", "side": "us", "parent": "us-tf67", "units": ids("us-rear")},
    },
    "historicalOutcome": {
        "winner": "jp",
        "level": "decisive",
        "summary": "米は電探で先に見つけたが、前衛の駆逐艦の雷撃は遠すぎて全部外れた。巡洋艦の砲火は警戒艦の高波に集まって沈めたが、その閃光を目印に田中の駆逐艦が九三式魚雷を放ち、ノーザンプトンが沈み、ミネアポリス・ニューオーリンズ・ペンサコラが大破した。日本は補給物資を落とせずに引き揚げた。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
