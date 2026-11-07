#!/usr/bin/env python3
"""
第三次ソロモン海戦 第2夜(1942年11月14〜15日)のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_guadalcanal_1942_11_14.py

出力: data/scenarios/guadalcanal-1942-11-14.json

近藤信竹中将の艦隊(戦艦 霧島・重巡 愛宕・高雄・軽巡2・駆逐艦9)が、ヘンダーソン飛行場を砲撃するためにサボ島の北から入る。
リー少将の第64任務部隊(新戦艦 ワシントン・サウスダコタ、駆逐艦4)が迎え撃つ。米の電探射撃・サウスダコタの電路の故障・霧島の対地砲撃の弾が見どころ。
地図はサボ島沖海戦と同じ概略図(tools/scenarios/ironbottom.py)。位置・針路・時刻の根拠と残りの裏取りは docs/research/guadalcanal-1942-11-14.md(TODO(要裏取り))。
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402
from ironbottom import KM, LUNGA, SAVO, column, map_def, polar  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/guadalcanal-1942-11-14.json"

# 23:00 の位置(概略。米は 22:55 ごろ電探で日本艦を捉えた。TODO(要裏取り):戦闘報告の航跡図)
# 第64任務部隊:サボ島の南を西へ。駆逐艦4隻が先頭、戦艦2隻が続く
US_POS = polar(SAVO, 160, 8000)
US_COURSE = 270
# 日本:掃討隊(川内)はサボ島の東を南へ、直衛隊(長良)はサボ島の西を南へ、射撃隊(霧島・愛宕・高雄)は直衛隊の後ろ
SENDAI_POS = polar(SAVO, 40, 12000)
NAGARA_POS = polar(SAVO, 300, 13000)
KONDO_POS = polar(NAGARA_POS, 330, 6000)

# 艦級:吹雪型(綾波・敷波・浦波・白雪・初雪)・暁型(電)は吹雪型、朝潮型(朝雲)・白露型(五月雨)・秋月型(照月)は陽炎型で代えた。
# 各戦隊への割り振りは資料の要約から。TODO(要裏取り):Lundgren の分析・Morison 5巻の編成表
SWEEP = [("sendai", "jp-cl-5500t", "川内(掃討隊)"), ("shikinami", "jp-dd-fubuki", "敷波"), ("uranami", "jp-dd-fubuki", "浦波"), ("ayanami", "jp-dd-fubuki", "綾波")]
SCREEN = [("nagara", "jp-cl-5500t", "長良(直衛隊)"), ("samidare", "jp-dd-kagero", "五月雨"), ("inazuma", "jp-dd-fubuki", "電"), ("shirayuki", "jp-dd-fubuki", "白雪"), ("hatsuyuki", "jp-dd-fubuki", "初雪")]
MAIN = [("atago", "jp-ca-takao", "愛宕(旗艦)"), ("takao", "jp-ca-takao", "高雄"), ("kirishima", "jp-bb-kongo", "霧島"), ("asagumo", "jp-dd-kagero", "朝雲"), ("teruzuki", "jp-dd-kagero", "照月")]
# 駆逐艦の艦級:ウォーク(シムス級)・グウィン(グリーブス級)はベンソン級、プレストン(マハン級)、ベンハム(ベンハム級)。仮置き
US = [
    ("walke", "us-dd-benson", "ウォーク"),
    ("benham", "us-dd-benham", "ベンハム"),
    ("preston", "us-dd-mahan", "プレストン"),
    ("gwin", "us-dd-benson", "グウィン"),
    ("washington", "us-bb-north-carolina", "ワシントン(旗艦)"),
    ("south-dakota", "us-bb-south-dakota", "サウスダコタ"),
]

units = (
    column("jp-sweep", "jp", SENDAI_POS, 180, SWEEP, training="veteran")
    + column("jp-screen", "jp", NAGARA_POS, 150, SCREEN, training="veteran")
    # 射撃隊は飛行場を砲撃するつもりで、対地砲撃の弾(三式弾・榴弾)を揚弾していた
    + column("jp-main", "jp", KONDO_POS, 150, MAIN, training="veteran", heLoaded=True)
    + column("us-dd", "us", polar(US_POS, US_COURSE, 4500), US_COURSE, US[:4])
    + column("us-bb", "us", US_POS, US_COURSE, US[4:], spacing=1500)
)
# 駆逐艦は対地砲撃の弾を積んでいない(揚弾は戦艦・重巡だけ)
for u in units:
    if u["id"] in ("jp-main-asagumo", "jp-main-teruzuki"):
        u.pop("heLoaded", None)
ids = lambda prefix: [u["id"] for u in units if u["id"].startswith(prefix + "-")]

scenario = {
    "id": "guadalcanal-1942-11-14",
    "name": "第三次ソロモン海戦 第2夜 1942年11月14日(v0・概略図)",
    "description": "夜、近藤の戦艦 霧島と重巡がヘンダーソン飛行場の砲撃に向かう。待ち受けるのは電探を持つ米の新戦艦2隻。駆逐艦の雷撃で道を開くか、電探射撃で撃ち返すか。",
    "notes": "v0。サボ島沖海戦と同じ概略図(1km のセルで 80km × 60km)。位置・針路は資料の要約からの概略。日本の駆逐艦の艦級は近い艦級で代えた。飛行場の砲撃は、ルンガ泊地の沖(目標)を取ることで表す。根拠は docs/research/guadalcanal-1942-11-14.md。作り直しは tools/scenarios/build_guadalcanal_1942_11_14.py。",
    "packs": {"rules": "ww1-korea", "branches": "ww1-korea", "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"], "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"]},
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "us", "name": "アメリカ軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 23, "startDate": "1942-11-14"},
    "visibilityMultiplier": 1,
    "map": map_def(),
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        "maxTurns": 9,
        "darkTurns": [{"from": 1, "to": 9}],
        "objectives": [{"id": "henderson", "name": "ルンガ沖(ヘンダーソン飛行場の砲撃の位置)", "x": LUNGA[0], "y": LUNGA[1], "radiusM": 5000, "weight": 1, "initialHolder": "us"}],
        "victory": {
            # 日本:飛行場の沖を取れば勝ち(米の損耗 30% で決定的)。米:飛行場の沖を守り、日本の損耗 15% で決定的・守るだけで限定的(ゲームの設計)
            "jp": {"decisive": {"required": ["henderson"], "minWeight": 0, "minEnemyLoss": 0.3}, "limited": {"required": ["henderson"], "minWeight": 0, "minEnemyLoss": 0}},
            "us": {"decisive": {"required": ["henderson"], "minWeight": 0, "minEnemyLoss": 0.15}, "limited": {"required": ["henderson"], "minWeight": 0, "minEnemyLoss": 0}},
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
    },
    "units": units,
    "depots": [],
    "formations": {
        "jp-kondo": {"name": "前進部隊(近藤)", "side": "jp", "units": []},
        "jp-main": {"name": "射撃隊(愛宕・高雄・霧島)", "side": "jp", "parent": "jp-kondo", "units": ids("jp-main")},
        "jp-screen": {"name": "直衛隊(長良)", "side": "jp", "parent": "jp-kondo", "units": ids("jp-screen")},
        "jp-sweep": {"name": "掃討隊(川内)", "side": "jp", "parent": "jp-kondo", "units": ids("jp-sweep")},
        "us-tf64": {"name": "第64任務部隊(リー)", "side": "us", "units": []},
        "us-dd": {"name": "駆逐艦", "side": "us", "parent": "us-tf64", "units": ids("us-dd")},
        "us-bb": {"name": "戦艦", "side": "us", "parent": "us-tf64", "units": ids("us-bb")},
    },
    "historicalOutcome": {
        "winner": "us",
        "level": "decisive",
        "summary": "日本の駆逐艦の雷撃と砲撃で米の駆逐艦3隻(ウォーク・プレストン・ベンハム)が沈み、電路が落ちたサウスダコタは日本艦の砲火を浴びて退いた。しかし電探で射撃したワシントンが霧島を撃ち沈め(綾波も沈んだ)、近藤は飛行場を砲撃できずに引き揚げた。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
