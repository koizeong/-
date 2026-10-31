#!/usr/bin/env python3
"""
バストーニュ 1944年12月19日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_bastogne_1944_12_19.py

出力: data/scenarios/bastogne-1944-12-19.json

地図は「資料で座標が確かめられた町」と「資料で確かめられた道路のつながり」だけで作る概略図。
森・川・高地は TODO(要裏取り)。調べた事実と出典は docs/research/bastogne-1944-12-19.md。
座標(緯度経度)は、バストーニュ中心を原点に正距円筒図法でメートルに直す(30km × 25km の範囲では誤差は小さい)。
"""
import json
import math
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import apply_names, BASTOGNE_NAMES, Sketch, scaled_command_points, split_units, BASTOGNE_FORMATIONS, KRINKELT_FORMATIONS, formations, historical_presets, real_presets  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/bastogne-1944-12-19.json"

CELL = 250
COLS, ROWS = 120, 100  # 30km × 25km
ORIGIN = (50.00347, 5.71844)  # バストーニュ(GeoNames由来の値)
M_PER_DEG_LAT = 110574.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(ORIGIN[0]))


def xy(lat, lon):
    """緯度経度 → マップ座標(m)。バストーニュがマップの中央"""
    x = COLS * CELL / 2 + (lon - ORIGIN[1]) * M_PER_DEG_LON
    y = ROWS * CELL / 2 + (lat - ORIGIN[0]) * M_PER_DEG_LAT
    return round(x), round(y)


def snap(p):
    """セルの中心に寄せる(境目の点は左右で判定が変わるため)"""
    return (math.floor(p[0] / CELL) * CELL + CELL // 2, math.floor(p[1] / CELL) * CELL + CELL // 2)


# 町(緯度, 経度, 出典の要約, 確かさ)。確かさ "ok" は資料の座標、"todo" は要裏取り
TOWNS = L(
    [
        ("bastogne", ("バストーニュ", 50.00347, 5.71844, "GeoNames由来(latitudelongitude.org)。Wikipedia は 50.0042, 5.7200", "ok")),
        ("noville", ("ノヴィル", 50.0639, 5.7611, "Wikipedia『Noville, Bastogne』", "ok")),
        ("foy", ("フォワ", 50.050, 5.750, "Wikipedia『Foy, Belgium』(mapcarta は 50.0445, 5.7506)", "ok")),
        ("recogne", ("ルコーニュ", 50.04833, 5.74083, "ルコーニュのドイツ軍墓地の座標(集落そのものではない)", "ok")),
        ("bizory", ("ビゾリー", 50.01965, 5.76379, "paintmaps の地図切り抜きサンプル", "ok")),
        ("mageret", ("マジュレ", 50.01447, 5.78439, "paintmaps の地図切り抜きサンプル", "ok")),
        ("longvilly", ("ロンヴィイ", 50.02, 5.84, "教会の Open Location Code 9F272RFP+X9 を検索側で読み解いた概算値。TODO(要裏取り)", "todo")),
        ("benonchamps", ("ブノンシャン", 50.005, 5.8081, "Wikimedia Commons", "ok")),
        ("marvie", ("マルヴィ", 49.98512, 5.74602, "paintmaps の地図切り抜きサンプル", "ok")),
        ("assenois", ("アスノワ", 49.96547, 5.67979, "paintmaps の地図切り抜きサンプル", "ok")),
        ("senonchamps", ("スノンシャン", 50.00079, 5.65856, "paintmaps の地図切り抜きサンプル", "ok")),
        ("sibret", ("シブレ", 49.97073, 5.63453, "paintmaps の地図切り抜きサンプル", "ok")),
    ]
)
P = {k: snap(xy(v[1], v[2])) for k, v in TOWNS.items()}


def edge_point(frm, through, edge):
    """frm → through の向きにまっすぐ伸ばして、マップの端(edge)に当たる点(概略の道路の延長)"""
    (x0, y0), (x1, y1) = frm, through
    dx, dy = x1 - x0, y1 - y0
    w, h = COLS * CELL, ROWS * CELL
    ts = []
    if dx > 0:
        ts.append((w - CELL / 2 - x0) / dx)
    if dx < 0:
        ts.append((CELL / 2 - x0) / dx)
    if dy > 0:
        ts.append((h - CELL / 2 - y0) / dy)
    if dy < 0:
        ts.append((CELL / 2 - y0) / dy)
    t = min(ts)
    return snap((x0 + dx * t, y0 + dy * t))


# 道路:資料で確かめられたつながりだけ。形は直線の概略
#  - N30 バストーニュ → フォワ → ノヴィル → 北(ウファリーズ方面)。ノヴィルは N30 上(historyofwar.org)、出口の標識は Houffalize(N30)(TracesOfWar)
#  - N874 バストーニュ → マジュレ → ロンヴィイ → 東。ロンヴィイは N874 上(historyofwar.org)、チェリーはマジュレを通って戻った(Warfare History Network)
#  - ヌフシャトー方面 バストーニュ → シブレ → 南西。シブレ経由の道が包囲前の最後の道(historyofwar.org)
NODES = L()
EDGES = []


def node(name, p):
    NODES[name] = L([("x", p[0]), ("y", p[1])])


def road(a, b, cap):
    EDGES.append(L([("from", a), ("to", b), ("capacityTPerHour", cap)]))


for k in ["bastogne", "foy", "noville", "mageret", "longvilly", "sibret"]:
    node(k, P[k])
node("n30_north_edge", edge_point(P["bastogne"], P["noville"], "north"))
node("n874_east_edge", edge_point(P["mageret"], P["longvilly"], "east"))
node("neufchateau_sw_edge", edge_point(P["bastogne"], P["sibret"], "southwest"))
# 輸送能力は仮置き(主要道 100 t/h)。TODO: 1944年の道路の等級
for a, b in [("bastogne", "foy"), ("foy", "noville"), ("noville", "n30_north_edge"), ("bastogne", "mageret"), ("mageret", "longvilly"), ("longvilly", "n874_east_edge"), ("bastogne", "sibret"), ("sibret", "neufchateau_sw_edge")]:
    road(a, b, 100)

# 地形:平地を基本に、町のセルだけ町。バストーニュは 3×3 セル(750m 四方)。森・川・高地は TODO(要裏取り)
grid = [["." for _ in range(COLS)] for _ in range(ROWS)]


def mark(p, ch, r=0):
    c0, r0 = p[0] // CELL, p[1] // CELL
    for dc in range(-r, r + 1):
        for dr in range(-r, r + 1):
            c, rr = c0 + dc, r0 + dr
            if 0 <= c < COLS and 0 <= rr < ROWS:
                grid[ROWS - 1 - rr][c] = ch


for k in TOWNS:
    mark(P[k], "T", 1 if k == "bastogne" else 0)
rows = ["".join(r) for r in grid]

# 目標:バストーニュ中心(重み5)と周辺の町(重み1)。勝利条件はゲームの設計(史実ではない)・仮置き
CROSSROADS = ["noville", "foy", "recogne", "bizory", "mageret", "longvilly", "marvie", "assenois", "senonchamps", "sibret"]
objectives = [L([("id", "bastogne"), ("name", "バストーニュ市街"), ("x", P["bastogne"][0]), ("y", P["bastogne"][1]), ("radiusM", 600), ("weight", 5), ("initialHolder", "us")])]
for k in CROSSROADS:
    holder = "de" if k == "mageret" else "us"  # マジュレは18日夜に教導戦車師団が押さえていた(チェリーが通過時に射撃を受けた)
    objectives.append(L([("id", k), ("name", TOWNS[k][0]), ("x", P[k][0]), ("y", P[k][1]), ("radiusM", 500), ("weight", 1), ("initialHolder", holder)]))


def at(k, dx=0, dy=0):
    return snap((P[k][0] + dx, P[k][1] + dy))


B = P["bastogne"]

# 部隊(1ユニット = 旅団〜連隊、B戦闘団は3チーム)。編成は汎用(史実ではない)
# confirmed: 資料で位置が確かめられた / provisional: 暫定配置(TODO(要裏取り))
UNITS = [
    # 米軍
    ("us-team-desobry", "us", "armored_task_force", at("noville"), 30, "deployed", "confirmed", "18日深夜にノヴィル着、道路封鎖(TracesOfWar、Warfare History Network)"),
    ("us-team-cherry", "us", "armored_task_force", at("longvilly"), 90, "deployed", "provisional", "先遣が18日19時ごろロンヴィイ着(Warfare History Network)。ロンヴィイの座標が未確認"),
    ("us-team-ohara", "us", "armored_task_force", at("marvie", 500, -250), 120, "deployed", "provisional", "南東のワルダンへ(資料によりブラ)。ワルダンの座標が未確認のため、近くのマルヴィの東に暫定配置"),
    ("us-501-pir", "us", "airborne_regiment", snap((B[0] + 750, B[1])), 90, "column", "confirmed", "19日早朝、バストーニュから東へ前進(historyofwar.org、Warfare History Network)"),
    ("us-506-pir", "us", "airborne_regiment", snap((B[0], B[1] + 750)), 30, "column", "provisional", "19日に第1大隊がノヴィルへ。19日朝の位置は未確認、バストーニュ市内北側に暫定配置"),
    ("us-502-pir", "us", "airborne_regiment", snap((B[0] - 750, B[1] + 500)), 330, "column", "provisional", "19日朝の位置は未確認、バストーニュ市内北西に暫定配置"),
    ("us-327-gir", "us", "glider_infantry_regiment", snap((B[0] - 750, B[1] - 500)), 210, "column", "provisional", "19日朝の位置は未確認、バストーニュ市内南西に暫定配置"),
    ("us-705-td", "us", "tank_destroyer_battalion", snap((B[0] + 250, B[1] - 500)), 90, "column", "provisional", "到着時期は資料で食い違い(18日/19日夜)。暫定で開始時から市内に配置"),
    ("us-101-divarty", "us", "artillery_group", snap((B[0] - 1500, B[1])), 90, "deployed", "provisional", "師団砲兵の位置は未確認。バストーニュ西に暫定配置"),
    # ドイツ軍
    ("de-2pz-kg-north", "de", "panzer_regiment", at("noville", 1500, 1750), 210, "deployed", "provisional", "第2装甲師団が19日朝ノヴィルを攻撃(10時30分ごろ戦車戦)。攻撃方向と位置は未確認、北東に暫定配置"),
    ("de-2pz-pgr", "de", "panzergrenadier_regiment", at("noville", 500, 2250), 190, "column", "provisional", "第2装甲師団の擲弾兵。位置は未確認、北に暫定配置"),
    ("de-lehr-902", "de", "panzergrenadier_regiment", at("mageret"), 270, "deployed", "provisional", "教導戦車師団の部隊が18日夜にマジュレにいた(チェリーが通過時に射撃を受けた)。第902連隊がバストーニュ攻撃に残されたこと(コール『The Ardennes』第8章の抜粋)は確認済みだが、マジュレの部隊が第902連隊かどうかは要裏取り"),
    ("de-lehr-130", "de", "panzer_regiment", at("mageret", 1000, 250), 270, "column", "provisional", "教導戦車師団の戦車。位置は未確認、マジュレの東に暫定配置"),
    ("de-26vgd-77", "de", "volksgrenadier_regiment", at("benonchamps"), 290, "column", "provisional", "第26国民擲弾兵師団。19日朝の位置と連隊番号は未確認、ブノンシャンに暫定配置"),
    ("de-26vgd-art", "de", "artillery_group", at("benonchamps", 2500, 0), 270, "deployed", "provisional", "砲兵の位置は未確認、東に暫定配置"),
]

# 練度(既定は標準)。TODO(要裏取り):出典候補 Cole『The Ardennes』、Marshall『Bastogne: The First Eight Days』
#  - 第101空挺師団:ノルマンディー・マーケットガーデンを戦った → 古参
#  - 第2装甲師団・教導戦車師団:ノルマンディーから戦ってきた → 古参
TRAINING = {
    "us-501-pir": "veteran",
    "us-506-pir": "veteran",
    "us-502-pir": "veteran",
    "us-327-gir": "veteran",
    "us-101-divarty": "veteran",
    "de-2pz-kg-north": "veteran",
    "de-2pz-pgr": "veteran",
    "de-lehr-902": "veteran",
    "de-lehr-130": "veteran",
}

units = []
for uid, side, toe, pos, facing, formation, status, note in UNITS:
    u = L([("id", uid), ("side", side), ("toe", toe), ("x", pos[0]), ("y", pos[1]), ("facing", facing), ("formation", formation)])
    if uid in TRAINING:
        u["training"] = TRAINING[uid]
    units.append(u)

# 連隊は大隊に分ける(連隊1部隊だと耐久が大きく、取りつかれても損害が小さすぎた。docs/research/validation.md)。
# 指揮ポイントは、機動部隊の数の比で増やす(分ける前は米6・独6)
REGIMENTS = units
units = split_units(REGIMENTS, snap)
COMMAND_POINTS = {side: scaled_command_points(6, [u for u in REGIMENTS if u["side"] == side], [u for u in units if u["side"] == side]) for side in ("us", "de")}

# 概略の地形(高地・森)を自動で敷く。アルデンヌの森と丘のおよその姿をシードから作ったもの(史実の地形ではない。森・高地の位置は TODO(要裏取り))。
# 割合はゲームの設計。町・道路の結び目・目標と部隊の初期位置のまわりは平地のまま
_S = Sketch(origin=ORIGIN, cols=COLS, rows=ROWS, cell=CELL)
_S.grid = grid
_S.legend = L([(".", "plain"), ("T", "town")])
_S.fill_terrain(19441219, hill=0.08, forest=0.15, scale_m=2000, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives] + [(n["x"], n["y"]) for n in NODES.values()])
rows = ["".join(r) for r in grid]

scenario = L(
    [
        ("id", "bastogne-1944-12-19"),
        ("name", "バストーニュ 1944年12月19日(v0・概略図)"),
        ("description", "バストーニュ周辺の最初の衝突の日。ノヴィル・ロンヴィイ・マジュレ・ネフで、米第101空挺師団と第10機甲師団B戦闘団が、独第47装甲軍団とぶつかる。"),
        (
            "notes",
            "v0。高地・森は概略の自動生成で、史実の地形ではない。地図は資料で座標が確かめられた町と、資料で確かめられた道路のつながりだけの概略図(道路は直線)。"
            "森・川・高地、ネフ・ワルダン・シャン・ロンシャン・ブルシーの位置、多くの部隊の初期位置は TODO(要裏取り)。"
            "暫定配置の部隊と、史実ではない汎用編成・勝利条件・指揮ポイント・補給量を含む。"
            "調べた事実と出典は docs/research/bastogne-1944-12-19.md。作り直しは tools/scenarios/build_bastogne_1944_12_19.py。",
        ),
        ("packs", L([("rules", "ww1-korea"), ("branches", "ww1-korea"), ("weapons", "ww1-korea-generic"), ("toe", "ww1-korea-generic")])),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        # 開始時刻・夜の長さは TODO(要裏取り):1944年12月19日のバストーニュの日の出・日の入りと、当時の時刻帯
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 8.5), ("startDate", "1944-12-19")])),
        ("map", L([("cellSizeM", CELL), ("legend", _S.legend), ("rows", rows)])),
        ("roads", L([("nodes", NODES), ("edges", EDGES)])),
        (
            "rules",
            L(
                [
                    ("maxTurns", 8),
                    ("objectives", objectives),
                    (
                        "victory",
                        L(
                            [
                                # 急ぎ度:独第47装甲軍団は、教導戦車師団でバストーニュを奇襲で取るよう命じられていた(取れなければ第26国民擲弾兵師団が囲む)。
                                # 出典:Wikipedia『Siege of Bastogne』の要約。この日の独軍は最初から遮二無二に攻める(1.0)。米軍は守る側(0)
                                ("de", L([("decisive", L([("required", ["bastogne"])])), ("limited", L([("minWeight", 6)])), ("urgency", 1.0)])),
                                ("us", L([("decisive", L([("required", ["bastogne"]), ("minWeight", 15)])), ("limited", L([("required", ["bastogne"]), ("minWeight", 11)]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", COMMAND_POINTS["us"]), ("de", COMMAND_POINTS["de"])])),
                    # 19日の朝は濃い霧(視界約200ヤード)。16〜22日は曇りで航空は飛べない
                    ("weather", L([("initial", "fog"), ("changeChancePerHour", 0.08), ("minHoursBetweenChanges", 3), ("improveChance", 0.7), ("allowed", ["fog", "overcast"])])),
                    ("air", L()),
                    ("night", L([("turn", 8), ("hours", 17)])),
                    ("reinforcements", []),
                ]
            ),
        ),
        ("units", units),
        # 補給量は仮置き。TODO(要裏取り):両軍の弾薬・燃料の状況
        (
            "depots",
            [
                L([("id", "us-bastogne"), ("side", "us"), ("nodeId", "bastogne"), ("ammoT", 600), ("fuelT", 300)]),
                L([("id", "de-east"), ("side", "de"), ("nodeId", "n874_east_edge"), ("ammoT", 600), ("fuelT", 200)]),
                L([("id", "de-north"), ("side", "de"), ("nodeId", "n30_north_edge"), ("ammoT", 400), ("fuelT", 150)]),
            ],
        ),
    ]
)

# 第705駆逐戦車大隊は M18(docs/research/weapons-1944-us-de.md の TODO 7)。独の戦車連隊のパンターとIV号の割合は汎用の半々(TODO(要裏取り))
scenario["formations"] = formations(scenario, BASTOGNE_FORMATIONS)
scenario["presets"] = historical_presets(scenario, {"us-705-td": "us_tank_destroyer_battalion_m18"})
# 史実の編成(実数・定数):8日間のシナリオと同じ読み替え
scenario["presets"]["real"] = real_presets(
    scenario,
    {"us-705-td": "us-td-bn-m18", "de-lehr-130": "de-pz-lehr-130-1944", "de-lehr-902": "de-pzgr-regt-1944-spw"},
)
apply_names(scenario, {k: v for k, v in BASTOGNE_NAMES.items() if any(u["id"] == k for u in scenario["units"] + scenario["rules"].get("reinforcements", []))})
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 確認用の一覧(研究メモに貼る)
if __name__ == "__main__":
    print("町(マップ座標 m):")
    for k, v in TOWNS.items():
        print(f"  {v[0]:<8} {P[k]}  [{v[4]}] {v[3]}")
    print("部隊:")
    for uid, side, toe, pos, facing, formation, status, note in UNITS:
        print(f"  {uid:<18} {pos} {formation:<8} [{status}] {note}")
    print(f"wrote {OUT.relative_to(ROOT)}")
