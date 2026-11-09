#!/usr/bin/env python3
"""
スリガオ海峡海戦 1944年10月25日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_surigao_1944_10_25.py

出力: data/scenarios/surigao-1944-10-25.json

夜、西村の第一遊撃部隊第三部隊(山城・扶桑・最上・駆逐艦4)がスリガオ海峡を北へ抜け、レイテ湾の上陸船団を目指す。
オルデンドルフの艦隊が待ち受ける:南の入口の魚雷艇、両岸からの駆逐艦の雷撃、北の出口で T 字を描く戦艦6隻の戦列と巡洋艦8隻。
志摩の第二遊撃部隊が遅れて続く。1km のセルで 60km × 130km。艦は1隻ずつ(1942年・1944年の艦級)、戦隊は上級部隊。
位置・針路・時刻の根拠と残りの裏取りは docs/research/surigao-1944-10.md(どれも概略。TODO(要裏取り))。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/surigao-1944-10-25.json"
CELL = 1000
COLS, ROWS = 60, 130
KM = 1000

# 海峡を南北の水道にならした概略図(北が上)。西岸=レイテ島(南はパナオン島)、東岸=ディナガット島。北の出口の先がレイテ湾。TODO(要裏取り):海図
WEST_SHORE = 12 * KM  # レイテ島の東岸(y 40km より北)
WEST_SOUTH = 4 * KM  # パナオン島の東岸(y 40km より南)
EAST_SHORE = 48 * KM  # ディナガット島の西岸(y 30〜100km)


def land(x, y):
    if y >= 40 * KM and x < WEST_SHORE:
        return True
    if y < 40 * KM and x < WEST_SOUTH:
        return True
    if 30 * KM <= y <= 100 * KM and x > EAST_SHORE:
        return True
    return False


rows = []
for r in range(ROWS):
    y = (ROWS - 1 - r) * CELL + CELL / 2
    rows.append("".join("." if land(c * CELL + CELL / 2, y) else "~" for c in range(COLS)))


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return (round(base[0] + math.sin(r) * dist_m), round(base[1] + math.cos(r) * dist_m))


def column(prefix, side, base, facing, ships, training=None, spacing=700):
    out = []
    for k, (sid, toe, name) in enumerate(ships):
        p = polar(base, facing + 180, spacing * k) if k else base
        d = {"id": f"{prefix}-{sid}", "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing, "name": name}
        if training:
            d["training"] = training
        out.append(d)
    return out


# 02:00 の位置(概略)。TODO(要裏取り):米海軍大学校の分析(Battle of Surigao Strait)、Tully『Battle of Surigao Strait』の航跡図
NISHIMURA_POS = (28 * KM, 22 * KM)  # 南の入口から北へ
BATTLE_LINE = (22 * KM, 104 * KM)  # 北の出口を東西に往復する戦艦の戦列
LEFT_CRU = (16 * KM, 96 * KM)  # 左翼(西)の巡洋艦(オルデンドルフ)
RIGHT_CRU = (40 * KM, 96 * KM)  # 右翼(東)の巡洋艦(バーキー)
DESRON54 = (45 * KM, 74 * KM)  # 東岸から最初に雷撃した駆逐隊
DESRON24 = (15 * KM, 80 * KM)  # 西岸から雷撃した駆逐隊
DESRON56 = (20 * KM, 92 * KM)  # 左翼の巡洋艦と一緒にいて、最後に雷撃した駆逐隊
GULF = (30 * KM, 124 * KM)  # レイテ湾の上陸船団の泊地(目標)

JP_MAIN = [
    ("michishio", "jp-dd-kagero", "満潮"),
    ("asagumo", "jp-dd-kagero", "朝雲"),
    ("yamashiro", "jp-bb-fuso", "山城(旗艦)"),
    ("fuso", "jp-bb-fuso", "扶桑"),
    ("mogami", "jp-ca-mogami-1944", "最上"),
    ("yamagumo", "jp-dd-kagero", "山雲"),
    ("shigure", "jp-dd-kagero", "時雨"),
]
# 志摩の第二遊撃部隊(04:00 ごろ南の入口に着いた)。曙・潮は綾波型(吹雪型で代える)、不知火・霞は陽炎型・朝潮型
JP_SHIMA = [
    ("nachi", "jp-ca-myoko", "那智(志摩の旗艦)"),
    ("ashigara", "jp-ca-myoko", "足柄"),
    ("abukuma", "jp-cl-5500t", "阿武隈"),
    ("shiranui", "jp-dd-kagero", "不知火"),
    ("kasumi", "jp-dd-kagero", "霞"),
    ("akebono", "jp-dd-fubuki", "曙"),
    ("ushio", "jp-dd-fubuki", "潮"),
]
US_BB = [
    ("west-virginia", "us-bb-colorado", "ウェストバージニア"),
    ("maryland", "us-bb-colorado", "メリーランド"),
    ("mississippi", "us-bb-new-mexico", "ミシシッピ"),
    ("tennessee", "us-bb-tennessee", "テネシー"),
    ("california", "us-bb-tennessee", "カリフォルニア(旗艦はウェイラー)"),
    ("pennsylvania", "us-bb-pennsylvania", "ペンシルベニア"),
]
US_LEFT = [
    ("louisville", "us-ca-northampton", "ルイビル(オルデンドルフの旗艦)"),
    ("portland", "us-ca-portland", "ポートランド"),
    ("minneapolis", "us-ca-new-orleans", "ミネアポリス"),
    ("denver", "us-cl-cleveland", "デンバー"),
    ("columbia", "us-cl-cleveland", "コロンビア"),
]
US_RIGHT = [
    ("phoenix", "us-cl-brooklyn", "フェニックス"),
    ("boise", "us-cl-brooklyn", "ボイシ"),
    ("shropshire", "au-ca-kent", "シュロップシャー(豪)"),
]
DD = "us-dd-fletcher-1944"  # 駆逐艦の艦級はフレッチャー級でまとめた(アルンタは豪のトライバル級)。TODO(要裏取り)
US_DS54 = [("remey", DD, "リメイ"), ("mcgowan", DD, "マクゴワン"), ("melvin", DD, "メルヴィン"), ("mcdermut", DD, "マクダーマット"), ("monssen", DD, "モンセン")]
US_DS24 = [("hutchins", DD, "ハッチンス"), ("daly", DD, "デイリー"), ("bache", DD, "バッチ"), ("arunta", DD, "アルンタ(豪)"), ("killen", DD, "キレン"), ("beale", DD, "ビール")]
US_DS56 = [("newcomb", DD, "ニューコム"), ("leary", DD, "リチャード・P・リアリー"), ("grant", DD, "アルバート・W・グラント"), ("robinson", DD, "ロビンソン"), ("halford", DD, "ハルフォード"), ("bryant", DD, "ブライアント")]
# 魚雷艇:13の小隊(39隻)のうち6つを、南の入口から海峡の中ほどの両岸に置いた。TODO(要裏取り):小隊ごとの位置
PT_POS = [(8 * KM, 30 * KM), (44 * KM, 34 * KM), (15 * KM, 48 * KM), (44 * KM, 52 * KM), (15 * KM, 64 * KM), (44 * KM, 66 * KM)]

units = (
    # 日本は練度の高い艦も多いが、急いで集めた部隊(ゲームの置き方で標準)。米は古参(戦いを重ね、夜戦の電探射撃の訓練をした)
    column("jp-main", "jp", NISHIMURA_POS, 0, JP_MAIN, spacing=800)
    + column("us-bb", "us", BATTLE_LINE, 90, US_BB, training="veteran", spacing=900)
    + column("us-left", "us", LEFT_CRU, 90, US_LEFT, training="veteran")
    + column("us-right", "us", RIGHT_CRU, 270, US_RIGHT, training="veteran")
    + column("us-ds54", "us", DESRON54, 180, US_DS54, training="veteran", spacing=500)
    + column("us-ds24", "us", DESRON24, 180, US_DS24, training="veteran", spacing=500)
    + column("us-ds56", "us", DESRON56, 180, US_DS56, training="veteran", spacing=500)
    + [{"id": f"us-pt{i + 1}", "side": "us", "toe": "us-pt-section", "x": p[0], "y": p[1], "facing": 180, "name": f"魚雷艇の小隊 {i + 1}"} for i, p in enumerate(PT_POS)]
)
SHIMA_ENTRY = (30 * KM, 2 * KM)
TURNS = 9  # 02:00 から 20分のターンで 05:00 まで
reinforcements = [
    {"turn": 7, "id": f"jp-shima-{sid}", "side": "jp", "toe": toe, "x": p[0], "y": p[1], "facing": 0, "name": name}
    for (sid, toe, name), p in zip(JP_SHIMA, [polar(SHIMA_ENTRY, 180, 800 * k) for k in range(len(JP_SHIMA))])
]
ids = lambda prefix: [u["id"] for u in units if u["id"].startswith(prefix + "-")] + [r["id"] for r in reinforcements if r["id"].startswith(prefix + "-")]

scenario = {
    "id": "surigao-1944-10-25",
    "name": "スリガオ海峡海戦 1944年10月25日(v0・概略図)",
    "description": "夜、西村の戦艦2隻・重巡1隻・駆逐艦4隻がスリガオ海峡を北へ抜け、レイテ湾の上陸船団を目指す。待ち受けるのは魚雷艇・駆逐艦の雷撃と、北の出口で T 字を描く米の戦艦6隻・巡洋艦8隻。志摩の艦隊が遅れて続く。",
    "notes": "v0。1km のセル(60km × 130km)。海峡は南北の水道にならした概略図で、位置・針路・時刻は資料の要約からの概略。魚雷艇は13小隊のうち6つ、米の駆逐艦はフレッチャー級でまとめた。米の戦艦は上陸支援の砲撃のために榴弾が多く徹甲弾が少ない。根拠は docs/research/surigao-1944-10.md。作り直しは tools/scenarios/build_surigao_1944_10_25.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "pacific-ships-1944"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "pacific-ships-1944"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "us", "name": "米軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 2, "startDate": "1944-10-25"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": TURNS,
        "darkTurns": [{"from": 1, "to": TURNS}],
        "objectives": [
            {"id": "gulf", "name": "レイテ湾の泊地", "x": GULF[0], "y": GULF[1], "radiusM": 8000, "weight": 1, "initialHolder": "us"},
        ],
        "victory": {
            # 日本:泊地に1ターンでも居座れば(上陸船団を叩けば)限定的、2ターンと米の損耗 15% で決定的。
            # 米:泊地を最後まで渡さなければ限定的、それに日本の損耗 50% で決定的(ゲームの設計)
            "jp": {
                "conditions": [
                    {"id": "strike", "type": "hold", "objective": "gulf", "perTurn": True, "points": TURNS},
                    {"id": "us-loss", "type": "enemyLoss", "min": 0.15},
                ],
                "decisive": {"minPoints": 2, "requires": ["us-loss"]},
                "limited": {"minPoints": 1},
                # 捷一号作戦の時刻表:西村は夜明けにレイテ湾へ着くよう命じられ、劣勢と分かっても北へ突き進んだ(AI は退かずに泊地へ進む)
                "urgency": 1,
            },
            "us": {
                "conditions": [
                    {"id": "guard", "type": "hold", "objective": "gulf", "perTurn": True, "points": TURNS},
                    {"id": "jp-loss", "type": "enemyLoss", "min": 0.5},
                ],
                "decisive": {"minPoints": TURNS, "requires": ["jp-loss"]},
                "limited": {"minPoints": TURNS},
            },
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": reinforcements,
        # 米は魚雷艇の報告と前日の航空偵察で西村艦隊を知っていた
        "knownAtStart": [{"side": "us", "unitId": u["id"]} for u in units if u["side"] == "jp"],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-1yb": {"name": "第一遊撃部隊第三部隊(西村)", "side": "jp", "units": ids("jp-main")},
        "jp-2yb": {"name": "第二遊撃部隊(志摩)", "side": "jp", "units": ids("jp-shima")},
        "us-tg77-2": {"name": "第77.2任務群(オルデンドルフ)", "side": "us", "units": []},
        "us-bb": {"name": "戦艦の戦列(ウェイラー)", "side": "us", "parent": "us-tg77-2", "units": ids("us-bb")},
        "us-left": {"name": "左翼の巡洋艦(オルデンドルフ)", "side": "us", "parent": "us-tg77-2", "units": ids("us-left")},
        "us-right": {"name": "右翼の巡洋艦(バーキー)", "side": "us", "parent": "us-tg77-2", "units": ids("us-right")},
        "us-ds54": {"name": "第54駆逐隊(カワード)", "side": "us", "parent": "us-tg77-2", "units": ids("us-ds54")},
        "us-ds24": {"name": "第24駆逐隊", "side": "us", "parent": "us-tg77-2", "units": ids("us-ds24")},
        "us-ds56": {"name": "第56駆逐隊", "side": "us", "parent": "us-tg77-2", "units": ids("us-ds56")},
        **{f"us-pt{i + 1}": {"name": f"魚雷艇の小隊 {i + 1}", "side": "us", "parent": "us-tg77-2", "units": [f"us-pt{i + 1}"]} for i in range(len(PT_POS))},
    },
    "historicalOutcome": {
        "winner": "us",
        "level": "decisive",
        "summary": "魚雷艇の雷撃は当たらなかったが、両岸からの駆逐艦の雷撃で扶桑が沈み、満潮・山雲が沈んで朝雲が艦首を失った。北の出口で T 字を描いた戦艦と巡洋艦の電探射撃で山城が沈み、最上は大破(翌朝に沈む)。時雨だけが逃れた。遅れて来た志摩は混乱の中で引き揚げた。米の損害は味方撃ちを受けたアルバート・W・グラントの1隻ほどだった。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
