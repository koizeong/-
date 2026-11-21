#!/usr/bin/env python3
"""
珊瑚海海戦 1942年5月8日 の空母どうしの戦い(v0・概略図)のシナリオファイルを作る。

    python3 tools/scenarios/build_coral_sea_1942_05_08.py

出力: data/scenarios/coral-sea-1942-05-08.json

8時20分ごろ、両軍の索敵機がほぼ同時に相手の空母を見つけた。原(第五航空戦隊)の翔鶴・瑞鶴と、フレッチャーの第17任務部隊(レキシントン・ヨークタウン)が
攻撃隊を出し合う。日本軍は前線の雲の下(瑞鶴はスコールに隠れた)、米軍は晴れた空の下。
対空砲火と上空直衛の効き目を、史実の命中・損失と比べるためのシナリオ(docs/research/coral-sea-1942-05.md)。
5km のセルで 500km × 400km の海(島は表さない)。艦は1隻ずつ(太平洋 1942年の艦級)、航空隊は母艦ごと(機種は data/toe/midway-1942.json)。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/coral-sea-1942-05-08.json"
CELL = 5000
COLS, ROWS = 100, 80


def snap(x, y):
    return (math.floor(x / CELL) * CELL + CELL // 2, math.floor(y / CELL) * CELL + CELL // 2)


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return snap(base[0] + math.sin(r) * dist_m, base[1] + math.cos(r) * dist_m)


# 第17任務部隊は南西、第五航空戦隊は北東。8時すぎの両軍の距離は、両軍の攻撃隊が届く約 270km とした
# (仮置き。TODO(要裏取り):Bates『The Battle of the Coral Sea: Strategical and Tactical Analysis』(海軍大学校 1947)の航跡図、Lundstrom『The First Team』)
TF17 = snap(170000, 110000)
KB = polar(TF17, 30, 270000)
# 2つの輪形陣の間隔(米は攻撃を受ける間に2つの輪に分かれた。日本は瑞鶴がスコールの中)。距離は仮置き TODO(要裏取り)
LEX = TF17
YKT = polar(TF17, 120, 8000)
SHO = KB
ZUI = polar(KB, 60, 15000)

rows = [["~"] * COLS for _ in range(ROWS)]


def u(uid, side, toe, p, facing, **extra):
    d = {"id": uid, "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing}
    d.update(extra)
    return d


def fleet(prefix, side, base, facing, ships, formation=None, training=None, spacing=600):
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


# 第五航空戦隊と護衛(MO 機動部隊。重巡2・駆逐艦6)。各輪への割り振りと、駆逐艦の艦級(朧・曙は吹雪型の綾波型、有明・夕暮は初春型、白露・時雨は白露型。
# 初春型・白露型の艦級がないので吹雪型で代えた)は仮置き TODO(要裏取り):Wikipedia「Battle of the Coral Sea order of battle」、Lundstrom『The First Team』
JP_SHO = [("shokaku", "jp-cv-shokaku", "翔鶴"), ("myoko", "jp-ca-myoko", "妙高")] + [(f"dd{i}", "jp-dd-fubuki", n) for i, n in ((1, "潮"), (2, "曙"), (3, "有明"))]
JP_ZUI = [("zuikaku", "jp-cv-shokaku", "瑞鶴"), ("haguro", "jp-ca-myoko", "羽黒")] + [(f"dd{i}", "jp-dd-fubuki", n) for i, n in ((4, "夕暮"), (5, "白露"), (6, "時雨"))]
# 第17任務部隊(第17.2群の巡洋艦5・駆逐艦と第17.5群の空母2)。各輪への割り振りと艦級(ファラガット級・ポーター級はマハン級、シムス級はベンハム級で代えた)は仮置き
# TODO(要裏取り):Wikipedia「Battle of the Coral Sea order of battle」、各艦の戦闘報告(ibiblio の CoralSeaAAR)
US_LEX = [("lexington", "us-cv-lexington", "レキシントン"), ("minneapolis", "us-ca-new-orleans", "ミネアポリス"), ("new-orleans", "us-ca-new-orleans", "ニューオーリンズ")] + [
    (f"dd{i}", "us-dd-mahan", n) for i, n in ((1, "フェルプス"), (2, "デューイ"), (3, "ファラガット"), (4, "エイルウィン"), (5, "モナハン"))
]
US_YKT = [("yorktown", "us-cv-yorktown", "ヨークタウン"), ("astoria", "us-ca-new-orleans", "アストリア"), ("chester", "us-ca-northampton", "チェスター"), ("portland", "us-ca-portland", "ポートランド")] + [
    (f"dd{i}", "us-dd-benham", n) for i, n in ((6, "モリス"), (7, "アンダーソン"), (8, "ハムマン"), (9, "ラッセル"))
]

SQUADRONS = {
    "jp-cd5-sho": ("第五航空戦隊 翔鶴の輪", "jp", JP_SHO, SHO, 200, "ring", "veteran"),
    "jp-cd5-zui": ("第五航空戦隊 瑞鶴の輪", "jp", JP_ZUI, ZUI, 200, "ring", "veteran"),
    "us-tg-lex": ("第17任務部隊 レキシントンの輪", "us", US_LEX, LEX, 30, "ring", None),
    "us-tg-ykt": ("第17任務部隊 ヨークタウンの輪", "us", US_YKT, YKT, 30, "ring", None),
}
ships = []
squadron_units = {}
for sq, (name, side, lst, pos, facing, form, tr) in SQUADRONS.items():
    lst_units = fleet(side, side, pos, facing, lst, formation=form, training=tr)
    ships += lst_units
    squadron_units[sq] = [x["id"] for x in lst_units]

# 航空隊。日本の攻撃隊は零戦18・艦爆33・艦攻18(資料で確かめた)。母艦ごとの分け方と、上空直衛の零戦の数は仮置き TODO(要裏取り):Lundstrom『The First Team』
# 米の攻撃隊:ヨークタウンは39機(うち SBD 24。TBD 9・F4F 6 は仮置き)、レキシントンは TBD 12・SBD 22・F4F 9(海軍の記録)。上空直衛の F4F の数は仮置き
CARRIER_AIR = [
    ("jp-shokaku", SHO, 200, "veteran", [("vf", "mw-a6m-9", "翔鶴 戦闘機隊(護衛)"), ("vf2", "mw-a6m-9", "翔鶴 戦闘機隊(直衛)"), ("vb", "mw-d3a-19", "翔鶴 艦爆隊"), ("vt", "mw-b5n-10", "翔鶴 艦攻隊")]),
    ("jp-zuikaku", ZUI, 200, "veteran", [("vf", "mw-a6m-9", "瑞鶴 戦闘機隊(護衛)"), ("vf2", "mw-a6m-9", "瑞鶴 戦闘機隊(直衛)"), ("vb", "mw-d3a-14", "瑞鶴 艦爆隊"), ("vt", "mw-b5n-8", "瑞鶴 艦攻隊")]),
    ("us-lexington", LEX, 30, None, [("vf2", "mw-f4f-9", "VF-2(護衛)"), ("vf2c", "mw-f4f-8", "VF-2(直衛)"), ("vb2", "mw-sbd-22", "VB-2・VS-2"), ("vt2", "mw-tbd-12", "VT-2")]),
    ("us-yorktown", YKT, 30, None, [("vf42", "mw-f4f-6", "VF-42(護衛)"), ("vf42c", "mw-f4f-8", "VF-42(直衛)"), ("vb5", "mw-sbd-24", "VB-5・VS-5"), ("vt5", "mw-tbd-9", "VT-5")]),
]
air_units = []
for base, pos, facing, tr, squads in CARRIER_AIR:
    for sid, toe, name in squads:
        extra = {"air": {"baseId": base}, "name": name}
        if tr:
            extra["training"] = tr
        air_units.append(u(f"{base}-{sid}", base.split("-")[0], toe, pos, facing, **extra))
units = ships + air_units

carriers = {"jp": ["jp-shokaku", "jp-zuikaku"], "us": ["us-lexington", "us-yorktown"]}
scenario = {
    "id": "coral-sea-1942-05-08",
    "name": "珊瑚海海戦 1942年5月8日(v0・概略図)",
    "description": "8時20分、両軍の索敵機がほぼ同時に相手の空母を見つけた。翔鶴・瑞鶴とレキシントン・ヨークタウンが攻撃隊を出し合う、史上初めての空母どうしの戦い。日本軍は前線の雲の下、米軍は晴れた空の下にいる。",
    "notes": "v0。5km のセル(500km × 400km、島は表さない)。8時30分から、両軍は相手の空母の位置を知っていて(索敵機の触接が続く)、攻撃隊を出せる。距離・輪形陣の間隔・母艦ごとの機数の分け方・上空直衛の数・駆逐艦の艦級は仮置き。対空砲火を史実と比べるためのもの。根拠は docs/research/coral-sea-1942-05.md。作り直しは tools/scenarios/build_coral_sea_1942_05_08.py・tools/packs/build_midway_1942.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "midway-1942"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "midway-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "us", "name": "アメリカ軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 8.5, "startDate": "1942-05-08"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea"}, "rows": ["".join(r) for r in rows]},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        # 8時30分から16時30分まで(8時間)
        "maxTurns": 24,
        "objectives": [],
        "victory": {
            # ゲームの設計:相手の損耗(失った機も入る)で決める。史実は日本がレキシントンを沈め、米は翔鶴を傷つけた(戦術では日本の勝ち)
            "jp": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.35}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.2}},
            "us": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.35}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.2}},
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
        # 両軍の索敵機が相手の空母に触接を続けた(菅野の索敵機、米の SBD)。始めから位置と艦種がいつも伝わる
        "knownAtStart": [{"side": s, "unitId": c} for s, other in (("jp", "us"), ("us", "jp")) for c in carriers[other]],
        # 瑞鶴はスコールに入ってからは見失われた(触接は翔鶴だけ)
        "shadowed": [{"side": "jp", "unitId": c} for c in carriers["us"]] + [{"side": "us", "unitId": "jp-shokaku"}],
        # 瑞鶴を隠したスコール(前線の雲)。大きさは仮置き
        "squalls": [{"x": ZUI[0], "y": ZUI[1], "radiusM": 12000}],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-mo": {"name": "MO 機動部隊(高木)", "side": "jp", "units": [x["id"] for x in units if x["side"] == "jp" and "air" in x]},
        **{sq: {"name": SQUADRONS[sq][0], "side": "jp", "parent": "jp-mo", "units": squadron_units[sq]} for sq in ["jp-cd5-sho", "jp-cd5-zui"]},
        "us-tf17": {"name": "第17任務部隊(フレッチャー)", "side": "us", "units": [x["id"] for x in units if x["side"] == "us" and "air" in x]},
        **{sq: {"name": SQUADRONS[sq][0], "side": "us", "parent": "us-tf17", "units": squadron_units[sq]} for sq in ["us-tg-lex", "us-tg-ykt"]},
    },
    "historicalOutcome": {
        "winner": "jp",
        "level": "limited",
        "summary": "日本の攻撃隊(零戦18・艦爆33・艦攻18)はレキシントンに魚雷2・爆弾2、ヨークタウンに爆弾1を当て、レキシントンは夕方の誘爆で失われた。米の攻撃隊は翔鶴に爆弾3を当てて発着艦できなくし、魚雷は当たらなかった。瑞鶴はスコールに隠れて無傷。戦術では日本の勝ち、ポートモレスビー攻略を止めた戦略では米の勝ち。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
