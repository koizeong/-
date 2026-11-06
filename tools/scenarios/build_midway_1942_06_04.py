#!/usr/bin/env python3
"""
ミッドウェー海戦 1942年6月4日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_midway_1942_06_04.py

出力: data/scenarios/midway-1942-06-04.json

南雲の第一航空艦隊(空母4)が、夜明けにミッドウェー島の北西 250マイルから島へ第一次攻撃隊を出す。
米の第16・第17任務部隊(空母3)は北東から、島の哨戒機の報告を待って攻撃隊を出す。空母どうしは互いを先に見つけた方が有利。
5km のセルで 600km × 500km の海。艦は1隻ずつ(太平洋 1942年の艦級 data/toe/pacific-ships-1942.json)、戦隊は上級部隊。位置・機数の根拠と残りの裏取りは docs/research/midway-1942-06.md。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/midway-1942-06-04.json"
CELL = 5000
COLS, ROWS = 120, 100


def snap(x, y):
    return (math.floor(x / CELL) * CELL + CELL // 2, math.floor(y / CELL) * CELL + CELL // 2)


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return snap(base[0] + math.sin(r) * dist_m, base[1] + math.cos(r) * dist_m)


# ミッドウェー島(環礁は1セルの陸で表す)
MIDWAY = snap(300000, 100000)
# 夜明けの機動部隊:島の北西(方位320°)250マイル ≒ 400km(資料による。方位は TODO(要裏取り))
KB = polar(MIDWAY, 320, 400000)
# 米の空母部隊:島の北東。第一次攻撃隊を出した 07:00 ごろ、機動部隊から 175〜200マイル(仮置き。TODO(要裏取り):TF16 の航跡図)
TF16 = polar(MIDWAY, 20, 270000)
TF17 = polar(TF16, 330, 20000)

rows = [["~"] * COLS for _ in range(ROWS)]
mc, mr = MIDWAY[0] // CELL, MIDWAY[1] // CELL
rows[ROWS - 1 - mr][mc] = "."


def u(uid, side, toe, p, facing, **extra):
    d = {"id": uid, "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing}
    d.update(extra)
    return d


def fleet(prefix, side, base, facing, ships, formation=None, training=None, spacing=600):
    """1隻ずつの艦を、戦隊の旗艦(先頭)の後ろへ一列に置く(輪形陣の戦隊は、旗艦のまわりの持ち場へ1ターン目に動く)"""
    out = []
    back = facing + 180
    for k, (sid, toe, name) in enumerate(ships):
        p = polar(base, back, spacing * k) if k else base
        extra = {"name": name}
        if formation:
            extra["navalFormation"] = formation
        if training:
            extra["training"] = training
        out.append(u(f"{prefix}-{sid}", side, toe, p, facing, **extra))
    return out


# 第一航空艦隊(資料の編成。駆逐艦の各戦隊への割り振りは仮置き TODO(要裏取り):Parshall & Tully『Shattered Sword』の付録の陣形図)
JP_CD1 = [("akagi", "jp-cv-akagi", "赤城"), ("kaga", "jp-cv-kaga", "加賀")] + [(f"dd{i}", "jp-dd-kagero", f"第一航空戦隊の護衛の駆逐艦 {i}") for i in (1, 2, 3, 4)]
JP_CD2 = [("hiryu", "jp-cv-hiryu", "飛龍"), ("soryu", "jp-cv-soryu", "蒼龍")] + [(f"dd{i}", "jp-dd-kagero", f"第二航空戦隊の護衛の駆逐艦 {i}") for i in (5, 6, 7, 8)]
JP_BD = [("nagara", "jp-cl-5500t", "長良(第十戦隊旗艦)"), ("haruna", "jp-bb-kongo", "榛名"), ("kirishima", "jp-bb-kongo", "霧島"), ("tone", "jp-ca-tone", "利根"), ("chikuma", "jp-ca-tone", "筑摩")] + [
    (f"dd{i}", "jp-dd-kagero", f"第十戦隊の駆逐艦 {i}") for i in (9, 10, 11, 12)
]
# 第16任務部隊・第17任務部隊(駆逐艦の艦級は仮置き TODO(要裏取り):各艦の艦級)
US_16CV = [("enterprise", "us-cv-yorktown", "エンタープライズ"), ("hornet", "us-cv-yorktown", "ホーネット")] + [(f"dd{i}", "us-dd-benham", f"第16任務部隊の駆逐艦 {i}") for i in (1, 2, 3, 4, 5)]
US_16CRU = [
    ("new-orleans", "us-ca-new-orleans", "ニューオーリンズ"), ("minneapolis", "us-ca-new-orleans", "ミネアポリス"), ("vincennes", "us-ca-new-orleans", "ヴィンセンス"),
    ("northampton", "us-ca-northampton", "ノーザンプトン"), ("pensacola", "us-ca-pensacola", "ペンサコラ"), ("atlanta", "us-cl-atlanta", "アトランタ"),
] + [(f"dd{i}", "us-dd-mahan", f"第16任務部隊の駆逐艦 {i}") for i in (6, 7, 8, 9)]
US_17CV = [("yorktown", "us-cv-yorktown", "ヨークタウン")] + [(f"dd{i}", "us-dd-benham", f"第17任務部隊の駆逐艦 {i}") for i in (1, 2, 3)]
US_17CRU = [("astoria", "us-ca-new-orleans", "アストリア"), ("portland", "us-ca-portland", "ポートランド")] + [(f"dd{i}", "us-dd-mahan", f"第17任務部隊の駆逐艦 {i}") for i in (4, 5, 6)]

SQUADRONS = {
    # 戦隊 ID: (名前, 陣営, 艦, 位置, 針路, 陣形, 練度)
    "jp-cd1": ("第一航空戦隊(赤城・加賀)", "jp", JP_CD1, KB, 135, "ring", "elite"),
    "jp-cd2": ("第二航空戦隊(飛龍・蒼龍)", "jp", JP_CD2, polar(KB, 90, 10000), 135, "ring", "elite"),
    "jp-bd": ("支援部隊(第三戦隊・第八戦隊・第十戦隊)", "jp", JP_BD, polar(KB, 135, 15000), 135, None, "veteran"),
    "us-tf16-cv": ("第16任務部隊 空母群", "us", US_16CV, TF16, 225, "ring", None),
    "us-tf16-cru": ("第16任務部隊 巡洋艦", "us", US_16CRU, polar(TF16, 225, 10000), 225, None, None),
    "us-tf17-cv": ("第17任務部隊 空母群", "us", US_17CV, TF17, 225, "ring", "veteran"),
    "us-tf17-cru": ("第17任務部隊 巡洋艦", "us", US_17CRU, polar(TF17, 225, 10000), 225, None, "veteran"),
}
ships = []
squadron_units = {}
for sq, (name, side, lst, pos, facing, form, tr) in SQUADRONS.items():
    prefix = sq.replace("-cv", "").replace("-cru", "") if side == "us" else "jp"
    us_ships = fleet(prefix, side, pos, facing, lst, formation=form, training=tr)
    ships += us_ships
    squadron_units[sq] = [x["id"] for x in us_ships]

# 航空隊は母艦ごとの飛行隊(戦闘機・艦爆・艦攻)。機数は資料の要約から(TODO(要裏取り):Parshall & Tully『Shattered Sword』の付録、Lundstrom『The First Team』)。
# 第一次攻撃隊(島へ)は飛龍・蒼龍の艦攻(陸用爆弾)と赤城・加賀の艦爆、残りの艦攻(雷装)と飛龍・蒼龍の艦爆は艦隊への攻撃に備える
CARRIER_AIR = [
    # (母艦, 位置, 針路, 練度, [(飛行隊 ID, 編成表, 名前)])
    ("jp-akagi", KB, 135, "elite", [("vf", "mw-a6m-18", "赤城 戦闘機隊"), ("vb", "mw-d3a-18", "赤城 艦爆隊"), ("vt", "mw-b5n-18", "赤城 艦攻隊(雷装)")]),
    ("jp-kaga", KB, 135, "elite", [("vf", "mw-a6m-18", "加賀 戦闘機隊"), ("vb", "mw-d3a-18", "加賀 艦爆隊"), ("vt", "mw-b5n-27", "加賀 艦攻隊(雷装)")]),
    ("jp-hiryu", polar(KB, 90, 10000), 135, "elite", [("vf", "mw-a6m-18", "飛龍 戦闘機隊"), ("vb", "mw-d3a-18", "飛龍 艦爆隊"), ("vt", "mw-b5n-land-18", "飛龍 艦攻隊(陸用爆弾)")]),
    ("jp-soryu", polar(KB, 90, 10000), 135, "elite", [("vf", "mw-a6m-18", "蒼龍 戦闘機隊"), ("vb", "mw-d3a-18", "蒼龍 艦爆隊"), ("vt", "mw-b5n-land-18", "蒼龍 艦攻隊(陸用爆弾)")]),
    ("us-tf16-enterprise", TF16, 225, None, [("vf6", "mw-f4f-27", "VF-6"), ("vb6", "mw-sbd-19", "VB-6"), ("vs6", "mw-sbd-19", "VS-6"), ("vt6", "mw-tbd-14", "VT-6")]),
    ("us-tf16-hornet", TF16, 225, None, [("vf8", "mw-f4f-27", "VF-8"), ("vb8", "mw-sbd-19", "VB-8"), ("vs8", "mw-sbd-18", "VS-8"), ("vt8", "mw-tbd-15", "VT-8")]),
    ("us-tf17-yorktown", TF17, 225, "veteran", [("vf3", "mw-f4f-25", "VF-3"), ("vb3", "mw-sbd-17", "VB-3"), ("vs5", "mw-sbd-19", "VS-5"), ("vt3", "mw-tbd-13", "VT-3")]),
]
air_units = []
for base, pos, facing, tr, squads in CARRIER_AIR:
    for sid, toe, name in squads:
        extra = {"air": {"baseId": base}, "name": name}
        if tr:
            extra["training"] = tr
        air_units.append(u(f"{base}-{sid}", base.split("-")[0], toe, pos, facing, **extra))
units = ships + air_units + [
    # 索敵:7本の索敵線(利根・筑摩の水偵各2、榛名の水偵1、赤城・加賀の艦攻各1という要約から。TODO(要裏取り):『Shattered Sword』の索敵計画)。
    # 水偵は巡洋艦・戦艦からは出せないので、空母に載せて出す(1隊=1〜2機。編成表は3機で、戦力で減らす)
    *[u(f"jp-scout{i}", "jp", "mw-jp-scout", polar(KB, 90, 10000), 135, air={"baseId": base}, strength=0.5) for i, base in zip(range(1, 8), ["jp-hiryu", "jp-hiryu", "jp-soryu", "jp-soryu", "jp-akagi", "jp-kaga", "jp-akagi"])],
    # ミッドウェー島:守備隊(第6防衛大隊と増援の海兵 約3000名を、汎用の歩兵連隊と対空砲大隊で代えた。掩体に入っている)と、島の航空隊
    u("us-6def-aa", "us", "aa_battalion", MIDWAY, 315, entrenchment=3, formation="deployed", stance="defense"),
    u("us-6def", "us", "infantry_regiment", MIDWAY, 315, entrenchment=3, formation="deployed", stance="defense"),
    u("us-vmf221", "us", "mw-us-vmf221", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}, training="green"),
    u("us-vmsb241", "us", "mw-us-vmsb241", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}, training="green"),
    u("us-b17", "us", "mw-us-b17", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}),
    *[u(f"us-pby{i}", "us", "mw-us-pby", MIDWAY, 315, air={"basePos": {"x": MIDWAY[0], "y": MIDWAY[1]}}) for i in (1, 2, 3)],
]
names = {
    **{f"jp-scout{i}": f"索敵 第{i}線" for i in range(1, 8)},
    "us-6def-aa": "第6防衛大隊 対空砲", "us-6def": "第6防衛大隊", "us-vmf221": "VMF-221", "us-vmsb241": "VMSB-241", "us-b17": "B-17", "us-pby1": "PBY 哨戒機 1", "us-pby2": "PBY 哨戒機 2", "us-pby3": "PBY 哨戒機 3",
}
for x in units:
    if x["id"] in names and "name" not in x:
        x["name"] = names[x["id"]]

scenario = {
    "id": "midway-1942-06-04",
    "name": "ミッドウェー海戦 1942年6月4日(v0・概略図)",
    "description": "夜明け、南雲の空母4隻がミッドウェー島へ攻撃隊を出す。北東には米の空母3隻が潜んでいる。索敵機で先に敵の空母を見つけ、艦爆・艦攻を送り込み、戦闘機で守れ。",
    "notes": "v0。5km のセル(600km × 500km)。位置は資料の距離・方位からの概略、機数は検索結果の要約から(第16任務部隊は2隻分の仮置き)。機種の強さ・行動半径は仮置き。兵装の転換(雷装と陸用爆弾の積み替え)は表さない。根拠は docs/research/midway-1942-06.md。作り直しは tools/scenarios/build_midway_1942_06_04.py・tools/packs/build_midway_1942.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "midway-1942"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "midway-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "us", "name": "アメリカ軍"}],
    "time": {"turnSeconds": 3600, "stepSeconds": 60, "startHour": 4.5, "startDate": "1942-06-04"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": ["".join(r) for r in rows]},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 14,
        "objectives": [{"id": "midway", "name": "ミッドウェー島", "x": MIDWAY[0], "y": MIDWAY[1], "radiusM": 6000, "weight": 1, "initialHolder": "us"}],
        "victory": {
            # 日本軍:米の損耗 20% で限定的、35% で決定的。米軍は島を保ち、日本軍に 25%・40% の損耗(ゲームの設計)。
            # 艦を1隻ずつにし、爆弾・魚雷を1発ずつにした後(海戦の作り直し S5)、失った機も損耗に入るので物差しを合わせ直した
            # (旧い物差し 日 8%・20%/米 40%・55% は戦隊の耐久をまとめて削っていた頃のもの)
            "jp": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.35}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.2}},
            "us": {"decisive": {"required": ["midway"], "minWeight": 0, "minEnemyLoss": 0.4}, "limited": {"required": ["midway"], "minWeight": 0, "minEnemyLoss": 0.25}},
        },
        "commandPoints": {},
        # 天候は晴れのまま(このルールパックの曇りは航空を止めるが、6月4日の海上は飛べる天候だった。雲の多さは表さない)
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
        # 島の守備隊は海に囲まれているが、投降しない(包囲と投降は陸の決まり)
        "noSurrender": ["us"],
        # 島の守備隊の位置は日本軍も知っている(動かない島)
        "knownAtStart": [{"side": "jp", "unitId": "us-6def"}, {"side": "jp", "unitId": "us-6def-aa"}],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-kb": {"name": "第一航空艦隊(南雲)", "side": "jp", "units": [x["id"] for x in units if x["side"] == "jp" and "air" in x]},
        **{sq: {"name": SQUADRONS[sq][0], "side": "jp", "parent": "jp-kb", "units": squadron_units[sq]} for sq in ["jp-cd1", "jp-cd2", "jp-bd"]},
        "us-tf16f": {"name": "第16任務部隊(スプルーアンス)", "side": "us", "units": [x["id"] for x in units if x["id"].startswith("us-tf16") and "air" in x]},
        "us-tf17f": {"name": "第17任務部隊(フレッチャー)", "side": "us", "units": [x["id"] for x in units if x["id"].startswith("us-tf17") and "air" in x]},
        **{sq: {"name": SQUADRONS[sq][0], "side": "us", "parent": "us-tf16f" if "tf16" in sq else "us-tf17f", "units": squadron_units[sq]} for sq in ["us-tf16-cv", "us-tf16-cru", "us-tf17-cv", "us-tf17-cru"]},
        "us-midway": {"name": "ミッドウェー島", "side": "us", "units": ["us-6def-aa", "us-6def", "us-vmf221", "us-vmsb241", "us-b17", "us-pby1", "us-pby2", "us-pby3"]},
    },
    "historicalOutcome": {
        "winner": "us",
        "level": "decisive",
        "summary": "米の急降下爆撃機が10時半ごろ赤城・加賀・蒼龍を、夕方に飛龍を撃破し、日本は空母4隻を失った。米は飛龍の反撃でヨークタウンを失った(7日に沈没)。",
    },
}
# 史実の指揮官(確かめた人だけ。tools/scenarios/historical_commanders.py)
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
