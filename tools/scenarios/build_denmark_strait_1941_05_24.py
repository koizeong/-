#!/usr/bin/env python3
"""
デンマーク海峡海戦(1941年5月24日)のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_denmark_strait_1941_05_24.py

出力: data/scenarios/denmark-strait-1941-05-24.json

ライン演習作戦。リュッチェンス中将の戦艦ビスマルクと重巡プリンツ・オイゲンが、デンマーク海峡を南西へ抜けて大西洋へ出ようとする。
ホランド中将の巡洋戦艦フッドと新戦艦プリンス・オブ・ウェールズが南東から寄せ、ウェイク=ウォーカー少将の重巡ノーフォーク・サフォークが
後ろから電探で触接する。夜明け(北極圏の5月で、ほぼ明るい)の遠い砲戦。
位置・針路・時刻は一般に知られた経過の概略。根拠と残りの裏取りは docs/research/denmark-strait-1941-05.md(TODO(要裏取り))。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/denmark-strait-1941-05-24.json"
KM = 1000
CELL = 1000
W, H = 160, 110  # km


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return (round(base[0] + math.sin(r) * dist_m), round(base[1] + math.cos(r) * dist_m))


def ice(x_km, y_km):
    """グリーンランド側の流氷の縁(北西。通れない)。海峡の北西の縁を斜めの線で表す概略"""
    return y_km > 0.55 * x_km + 70


def rows():
    out = []
    for r in range(H):
        y = H - 1 - r + 0.5
        out.append("".join("." if ice(c + 0.5, y) else "~" for c in range(W)))
    return out


def column(prefix, side, base, facing, ships, training=None, spacing=1000):
    out = []
    for k, (sid, toe, name, *rest) in enumerate(ships):
        p = polar(base, facing + 180, spacing * k) if k else base
        d = {"id": f"{prefix}-{sid}", "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing, "name": name}
        t = rest[0] if rest else training
        if t:
            d["training"] = t
        out.append(d)
    return out


# 05:35 ごろの位置(概略)。独はほぼ南西(約220°)へ約28ノット、プリンツ・オイゲンが先頭。
# 英の巡洋戦艦の戦隊は独の左舷前方寄り(独から見て方位約160°)約26km から、針路を北西寄りにして寄せる(前部の砲塔しか向かない向きで詰めた)。
# 重巡2隻は独の後ろ(北東)約25km で触接。TODO(要裏取り):Admiralty の戦闘報告の航跡図、Jasper『Hood and Bismarck』
BISMARCK = (95 * KM, 78 * KM)
DE_COURSE = 220
UK_POS = polar(BISMARCK, 160, 26000)
UK_COURSE = 300
SHADOW_POS = polar(BISMARCK, 40, 25000)

DE = [("prinz-eugen", "de-ca-hipper", "プリンツ・オイゲン"), ("bismarck", "de-bb-bismarck", "ビスマルク(旗艦)")]
# プリンス・オブ・ウェールズは就役したばかりで、乗員の訓練が足りず、造船所の工員を乗せたまま、主砲の故障が多かった(未熟とする)
UK = [("hood", "uk-bc-hood", "フッド(旗艦)"), ("pow", "uk-bb-kgv", "プリンス・オブ・ウェールズ", "green")]
SHADOW = [("norfolk", "uk-ca-county", "ノーフォーク(旗艦)"), ("suffolk", "uk-ca-county", "サフォーク")]

units = (
    column("de-rhine", "de", polar(BISMARCK, DE_COURSE, 1500), DE_COURSE, DE, training="regular", spacing=1500)
    + column("uk-h", "uk", UK_POS, UK_COURSE, UK, training="regular", spacing=800)
    + column("uk-cs1", "uk", SHADOW_POS, DE_COURSE, SHADOW, training="regular", spacing=1500)
)
ids = lambda prefix: [u["id"] for u in units if u["id"].startswith(prefix + "-")]
ATLANTIC = (25 * KM, 20 * KM)

scenario = {
    "id": "denmark-strait-1941-05-24",
    "name": "デンマーク海峡海戦 1941年5月24日(v0・概略図)",
    "description": "夜明けのデンマーク海峡。大西洋へ抜けようとするビスマルクとプリンツ・オイゲンに、フッドとプリンス・オブ・ウェールズが南東から寄せる。フッドの薄い甲板に、遠くから落ちてくる 38cm 砲弾が届く前に詰め切れるか。",
    "notes": "v0。1km のセルで 160km × 110km の概略図。北西はグリーンランド側の流氷の縁(通れない)。位置・針路は一般に知られた経過の概略で、天候(霧・雪のかたまり)は入れていない。英は重巡の電探の触接で独艦の位置を知っている。根拠は docs/research/denmark-strait-1941-05.md。作り直しは tools/scenarios/build_denmark_strait_1941_05_24.py。",
    "packs": {
        "rules": "ww1-korea",
        "branches": "ww1-korea",
        "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"],
        "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"],
    },
    "sides": [{"id": "de", "name": "ドイツ軍"}, {"id": "uk", "name": "イギリス軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 5.5, "startDate": "1941-05-24"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows()},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 9,
        "objectives": [{"id": "atlantic", "name": "大西洋への出口(海峡の南西)", "x": ATLANTIC[0], "y": ATLANTIC[1], "radiusM": 20000, "weight": 1, "initialHolder": "uk"}],
        "victory": {
            # 独:ビスマルクが戦力5割以上で大西洋への出口に着けば限定的(通商破壊に出られる)。英に3割の損耗も与えれば決定的
            # 英:ビスマルクを半分以上傷つけるか、出口に着かせなければ限定的。両方なら決定的(ゲームの設計)
            # 出口は始めは英が押さえている(英には守る目標、独には目指す目標。持ち主は勝敗に使わず、AI の向かう先を決めるだけ)
            "de": {
                # 急ぎ度1:始めから、退かずに出口へ進む(リュッチェンスの任務は大西洋へ出て通商破壊をすること。AI の戦隊の決め方)
                "urgency": 1,
                "conditions": [
                    {"id": "breakout", "type": "unitReach", "unit": "de-rhine-bismarck", "objective": "atlantic", "minStrength": 0.5, "points": 2},
                    {"id": "uk-loss", "type": "enemyLoss", "min": 0.3, "points": 1},
                ],
                "decisive": {"minPoints": 3, "requires": ["breakout", "uk-loss"]},
                "limited": {"minPoints": 2, "requires": ["breakout"]},
            },
            "uk": {
                "conditions": [
                    {"id": "cripple", "type": "unitLoss", "unit": "de-rhine-bismarck", "minLoss": 0.5, "points": 2},
                    {"id": "deny", "type": "exitShare", "objectives": ["atlantic"], "side": "de", "max": 0.3, "points": 1},
                ],
                "decisive": {"minPoints": 3, "requires": ["cripple", "deny"]},
                "limited": {"minPoints": 1},
            },
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
        # サフォークの電探(Type 284)は前の晩から独艦を触接していた
        "shadowed": [{"side": "uk", "unitId": "de-rhine-bismarck"}, {"side": "uk", "unitId": "de-rhine-prinz-eugen"}],
    },
    "units": units,
    "depots": [],
    "formations": {
        "de-rhine": {"name": "ライン演習作戦の艦隊(リュッチェンス)", "side": "de", "units": ids("de-rhine")},
        "uk-h": {"name": "巡洋戦艦の戦隊(ホランド)", "side": "uk", "units": ids("uk-h")},
        "uk-cs1": {"name": "第1巡洋艦戦隊(ウェイク=ウォーカー)", "side": "uk", "units": ids("uk-cs1")},
    },
    "historicalOutcome": {
        "winner": "de",
        "level": "decisive",
        "summary": "05:52 に砲戦が始まり、06:00 ごろビスマルクの斉射がフッドの弾薬庫を貫いてフッドは爆沈した(生存者3名)。プリンス・オブ・ウェールズも被弾し、主砲の故障もあって煙幕を張って退いた。ビスマルクも3発を受けて燃料が漏れ、リュッチェンスは作戦を打ち切ってサン=ナゼールへ向かったが、5月27日に英の艦隊に捉えられて沈んだ。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
