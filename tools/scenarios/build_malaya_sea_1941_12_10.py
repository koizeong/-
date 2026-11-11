#!/usr/bin/env python3
"""
マレー沖海戦 1941年12月10日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_malaya_sea_1941_12_10.py

出力: data/scenarios/malaya-sea-1941-12-10.json

クアンタン沖に来た Z部隊(プリンス・オブ・ウェールズ・レパルスと駆逐艦3)を、仏印南部の飛行場から飛んだ
第22航空戦隊の陸攻(元山空・美幌空の九六式、鹿屋空の一式)が探して叩く。陸攻の飛行場は地図の外(方位と距離。
シナリオの air.airfield)で、行き帰りは実際の距離(約 800〜900km)を飛ぶ。英はシンガポールのバッファロー(第453飛行隊)を上空直衛に出せる。
5km のセルで 400km × 350km の海と、西の縁にマレー半島の東海岸(概略)。根拠と残りの裏取りは docs/research/malaya-naval-air-1941-12.md。
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/malaya-sea-1941-12-10.json"
CELL = 5000
COLS, ROWS = 80, 70
W, H = COLS * CELL, ROWS * CELL
# 地図の真ん中を北緯3.5度・東経104.0度に置く(平面に近似。1度 = 111.1km)
LAT0, LON0 = 3.5, 104.0
KM_LAT = 111.1
KM_LON = 111.1 * math.cos(math.radians(LAT0))


def xy(lat, lon):
    return (W / 2 + (lon - LON0) * KM_LON * 1000, H / 2 + (lat - LAT0) * KM_LAT * 1000)


def snap(p):
    return (math.floor(p[0] / CELL) * CELL + CELL // 2, math.floor(p[1] / CELL) * CELL + CELL // 2)


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return snap((base[0] + math.sin(r) * dist_m, base[1] + math.cos(r) * dist_m))


def airfield(name, lat, lon):
    """地図の外の飛行場:地図の真ん中から見た方位と距離"""
    x, y = xy(lat, lon)
    dx, dy = x - W / 2, y - H / 2
    return {"name": name, "bearingDeg": round((math.degrees(math.atan2(dx, dy)) + 360) % 360), "distanceM": round(math.hypot(dx, dy), -3)}


# マレー半島の東海岸(概略):緯度ごとの海岸の経度。クアラ・トレンガヌ 5.3N 103.1E、クアンタン 3.8N 103.35E、
# ペカン 3.5N 103.4E、エンダウ 2.65N 103.6E、メルシン 2.4N 103.85E(地図帳の値を丸めたもの。湾・島は表さない)
COAST = [(1.9, 104.0), (2.4, 103.85), (2.65, 103.6), (3.5, 103.42), (3.8, 103.35), (4.3, 103.45), (4.8, 103.4), (5.3, 103.1), (5.2, 103.1)]


def coast_lon(lat):
    pts = sorted(COAST)
    if lat <= pts[0][0]:
        return pts[0][1]
    for (a, la), (b, lb) in zip(pts, pts[1:]):
        if a <= lat <= b:
            return la + (lb - la) * (lat - a) / (b - a) if b > a else la
    return pts[-1][1]


rows = []
for r in range(ROWS):
    y = H - (r + 0.5) * CELL
    lat = LAT0 + (y - H / 2) / 1000 / KM_LAT
    line = ""
    for c in range(COLS):
        x = (c + 0.5) * CELL
        lon = LON0 + (x - W / 2) / 1000 / KM_LON
        line += "." if lon < coast_lon(lat) else "~"
    rows.append(line)


def u(uid, side, toe, p, facing, **extra):
    d = {"id": uid, "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing}
    d.update(extra)
    return d


# Z部隊:07:00 ごろ、クアンタン沖へ向かう(クアンタン上陸の誤報。08:00 ごろ沖に着いた)。位置は概略
FORCE_Z = snap(xy(3.95, 103.75))
FACING = 200
Z_SHIPS = [
    ("pow", "uk-bb-kgv", "プリンス・オブ・ウェールズ"),
    ("repulse", "uk-bc-renown", "レパルス"),
]
Z_SCREEN = [
    ("electra", "uk-dd-e", "エレクトラ"),
    ("express", "uk-dd-e", "エクスプレス"),
    ("vampire", "uk-dd-vw", "ヴァンパイア(豪)"),
]
units = []
for k, (sid, toe, name) in enumerate(Z_SHIPS):
    units.append(u(f"uk-{sid}", "uk", toe, polar(FORCE_Z, FACING + 180, 800 * k) if k else FORCE_Z, FACING, name=name))
for k, (sid, toe, name) in enumerate(Z_SCREEN):
    units.append(u(f"uk-{sid}", "uk", toe, polar(FORCE_Z, FACING + 180 + (k - 1) * 40, 3000), FACING, name=name))

# 陸攻の飛行場(仏印南部)。元山空=サイゴン、美幌空=ツドウム、鹿屋空=ソクトラン(要約による。TODO(要裏取り):各隊の基地)
SAIGON = airfield("サイゴン", 10.82, 106.66)
THUDAUMOT = airfield("ツドウム", 10.98, 106.65)
SOCTRANG = airfield("ソクトラン", 9.6, 105.97)
# シンガポールのセンバワン(第453飛行隊のバッファロー)
SEMBAWANG = airfield("センバワン(シンガポール)", 1.43, 103.82)

# 攻撃隊:雷装 51・爆装 34 とする要約に合わせた割り振り(元山空 雷装17・爆装9、美幌空 雷装8・爆装25、鹿屋空 雷装26)。
# 爆装と雷装の数・隊ごとの機種は出典で割れる(TODO(要裏取り):『戦史叢書 マレー進攻作戦』、Middlebrook & Mahoney『Battleship』)
JP_AIR = [
    ("jp-genzan-t", "lb-g3m-torp-17", SAIGON, "元山空 雷撃隊(九六式)"),
    ("jp-genzan-b", "lb-g3m-bomb-9", SAIGON, "元山空 爆撃隊(九六式)"),
    ("jp-mihoro-t", "lb-g3m-torp-8", THUDAUMOT, "美幌空 雷撃隊(九六式)"),
    ("jp-mihoro-b1", "lb-g3m-bomb-16", THUDAUMOT, "美幌空 爆撃隊 第1(九六式)"),
    ("jp-mihoro-b2", "lb-g3m-bomb-9", THUDAUMOT, "美幌空 爆撃隊 第2(九六式)"),
    ("jp-kanoya-t", "lb-g4m-torp-26", SOCTRANG, "鹿屋空 雷撃隊(一式)"),
    # 索敵:九六式の索敵機(数は仮置き。TODO(要裏取り))
    ("jp-scout1", "lb-g3m-scout-3", SAIGON, "索敵 第1線"),
    ("jp-scout2", "lb-g3m-scout-3", SAIGON, "索敵 第2線"),
    ("jp-scout3", "lb-g3m-scout-3", SAIGON, "索敵 第3線"),
]
for uid, toe, field, name in JP_AIR:
    units.append({"id": uid, "side": "jp", "toe": toe, "facing": 180, "name": name, "training": "veteran", "air": {"airfield": field}})
# 第453飛行隊(バッファロー 11機)。史実では Z部隊が無線を封止して呼ばず、沈んだ後に着いた
units.append({"id": "uk-453sqn", "side": "uk", "toe": "lb-buffalo-12", "facing": 0, "name": "第453飛行隊(豪)バッファロー", "strength": round(11 / 12, 2), "training": "green", "air": {"airfield": SEMBAWANG}})

scenario = {
    "id": "malaya-sea-1941-12-10",
    "name": "マレー沖海戦 1941年12月10日(v0・概略図)",
    "description": "クアンタン沖に来たプリンス・オブ・ウェールズとレパルスを、800km 北の仏印の飛行場から飛ぶ陸攻が探して叩く。日本軍は索敵機で先に見つけ、雷撃と水平爆撃を重ねよ。英軍はシンガポールの戦闘機を呼ぶか、南へ逃れよ。",
    "notes": "v0。5km のセル(400km × 350km)。陸攻と英の戦闘機の飛行場は地図の外(方位と距離)で、行き帰りは実際の距離を飛ぶ。位置は概略、機数は検索結果の要約から、機種の強さ・行動半径は仮置き。日本軍は前夜の潜水艦の報告で Z部隊のおおよその位置を知って始める。根拠は docs/research/malaya-naval-air-1941-12.md。作り直しは tools/scenarios/build_malaya_sea_1941_12_10.py・tools/packs/build_pacific_landair_1941.py。",
    "packs": {
        "rules": "ww1-korea",
        "branches": "ww1-korea",
        "weapons": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "pacific-landair-1941"],
        "toe": ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "pacific-landair-1941"],
    },
    "sides": [{"id": "jp", "name": "日本軍"}, {"id": "uk", "name": "英国軍"}],
    "time": {"turnSeconds": 1200, "stepSeconds": 60, "startHour": 7, "startDate": "1941-12-10"},
    "visibilityMultiplier": 1,
    "map": {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows},
    "roads": {"nodes": {}, "edges": []},
    "rules": {
        # 07:00 から 18:00 まで(日没は 19 時ごろ)
        "maxTurns": 33,
        "objectives": [],
        "victory": {
            # 日本軍:英の損耗 20% で限定的、45% で決定的(主力艦1隻の沈没でおよそ限定的、2隻で決定的。ゲームの設計)。
            # 英軍:陸攻の 30% を落とせば限定的、50% で決定的(史実は 85機ほどのうち3〜4機)
            "jp": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.45}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.2}},
            "uk": {"decisive": {"required": [], "minWeight": 0, "minEnemyLoss": 0.5}, "limited": {"required": [], "minWeight": 0, "minEnemyLoss": 0.3}},
        },
        "commandPoints": {},
        "weather": {"initial": "clear", "changeChancePerHour": 0, "minHoursBetweenChanges": 0, "improveChance": 0.5, "allowed": ["clear"]},
        "air": {},
        "reinforcements": [],
        # 前夜に伊58潜が Z部隊を報告した(おおよその位置。TODO(要裏取り):報告の時刻と位置)
        "knownAtStart": [{"side": "jp", "unitId": "uk-pow"}],
    },
    "units": units,
    "depots": [],
    "formations": {
        "uk-force-z": {"name": "Z部隊(フィリップス)", "side": "uk", "units": []},
        "uk-main": {"name": "Z部隊・主力", "side": "uk", "parent": "uk-force-z", "units": [f"uk-{s}" for s, _, _ in Z_SHIPS]},
        "uk-screen": {"name": "Z部隊・駆逐隊", "side": "uk", "parent": "uk-force-z", "units": [f"uk-{s}" for s, _, _ in Z_SCREEN]},
        "uk-raaf": {"name": "シンガポールの戦闘機", "side": "uk", "units": ["uk-453sqn"]},
        "jp-22af": {"name": "第22航空戦隊(松永)", "side": "jp", "units": []},
        "jp-genzan": {"name": "元山海軍航空隊", "side": "jp", "parent": "jp-22af", "units": ["jp-genzan-t", "jp-genzan-b", "jp-scout1", "jp-scout2", "jp-scout3"]},
        "jp-mihoro": {"name": "美幌海軍航空隊", "side": "jp", "parent": "jp-22af", "units": ["jp-mihoro-t", "jp-mihoro-b1", "jp-mihoro-b2"]},
        "jp-kanoya": {"name": "鹿屋海軍航空隊", "side": "jp", "parent": "jp-22af", "units": ["jp-kanoya-t"]},
    },
    "historicalOutcome": {
        "winner": "jp",
        "level": "decisive",
        "summary": "11時過ぎから陸攻が水平爆撃と雷撃を重ね、12時半ごろレパルス、13時20分ごろプリンス・オブ・ウェールズが沈んだ。日本の損失は3〜4機。第453飛行隊のバッファローは沈んだ後に着いた。",
    },
}
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
