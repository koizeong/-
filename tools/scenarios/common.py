"""
シナリオを作るスクリプトで共通に使う道具(概略図の地図・道路・部隊)。

座標(緯度経度)は、基準点を地図の中央に置き、正距円筒図法でメートルに直す(数十kmの範囲では誤差は小さい)。
"""

import math
from collections import OrderedDict as L

M_PER_DEG_LAT = 110574.0


class Sketch:
    """概略図。cell(m)四方のセルを cols × rows 並べ、origin(緯度, 経度)を中央に置く"""

    def __init__(self, origin, cols, rows, cell=250):
        self.origin = origin
        self.cols, self.rows, self.cell = cols, rows, cell
        self.m_per_deg_lon = 111320.0 * math.cos(math.radians(origin[0]))
        self.grid = [["." for _ in range(cols)] for _ in range(rows)]
        self.legend = L([(".", "plain")])
        self.nodes = L()
        self.edges = []

    @property
    def width(self):
        return self.cols * self.cell

    @property
    def height(self):
        return self.rows * self.cell

    def xy(self, lat, lon):
        """緯度経度 → マップ座標(m)"""
        x = self.width / 2 + (lon - self.origin[1]) * self.m_per_deg_lon
        y = self.height / 2 + (lat - self.origin[0]) * M_PER_DEG_LAT
        return round(x), round(y)

    def snap(self, p):
        """セルの中心に寄せ、地図の中に収める"""
        c = min(self.cols - 1, max(0, math.floor(p[0] / self.cell)))
        r = min(self.rows - 1, max(0, math.floor(p[1] / self.cell)))
        return (c * self.cell + self.cell // 2, r * self.cell + self.cell // 2)

    def at(self, lat, lon):
        return self.snap(self.xy(lat, lon))

    def offset(self, p, dx=0, dy=0):
        return self.snap((p[0] + dx, p[1] + dy))

    # 地形

    def terrain(self, ch, name):
        self.legend[ch] = name

    def mark(self, p, ch, r=0):
        """p を中心に (2r+1) セル四方を ch にする"""
        c0, r0 = p[0] // self.cell, p[1] // self.cell
        for dc in range(-r, r + 1):
            for dr in range(-r, r + 1):
                c, rr = c0 + dc, r0 + dr
                if 0 <= c < self.cols and 0 <= rr < self.rows:
                    self.grid[self.rows - 1 - rr][c] = ch

    def rect(self, p0, p1, ch):
        """p0〜p1 の長方形(m)を ch にする"""
        (x0, x1), (y0, y1) = sorted((p0[0], p1[0])), sorted((p0[1], p1[1]))
        for c in range(self.cols):
            for r in range(self.rows):
                x, y = c * self.cell + self.cell / 2, r * self.cell + self.cell / 2
                if x0 <= x <= x1 and y0 <= y <= y1:
                    self.grid[self.rows - 1 - r][c] = ch

    def line(self, pts, ch, width_cells=0):
        """折れ線(川・堤道など)のセルを ch にする"""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) / (self.cell / 2)))
            for i in range(n + 1):
                self.mark((round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)), ch, width_cells)

    def map(self):
        return L([("cellSizeM", self.cell), ("legend", self.legend), ("rows", ["".join(r) for r in self.grid])])

    # 道路

    def node(self, name, p):
        self.nodes[name] = L([("x", p[0]), ("y", p[1])])
        return p

    def road(self, a, b, cap=100):
        self.edges.append(L([("from", a), ("to", b), ("capacityTPerHour", cap)]))

    def roads(self):
        return L([("nodes", self.nodes), ("edges", self.edges)])

    def edge_point(self, frm, through):
        """frm → through の向きにまっすぐ伸ばして、地図の端に当たる点"""
        (x0, y0), (x1, y1) = frm, through
        dx, dy = x1 - x0, y1 - y0
        ts = []
        if dx > 0:
            ts.append((self.width - self.cell / 2 - x0) / dx)
        if dx < 0:
            ts.append((self.cell / 2 - x0) / dx)
        if dy > 0:
            ts.append((self.height - self.cell / 2 - y0) / dy)
        if dy < 0:
            ts.append((self.cell / 2 - y0) / dy)
        t = min(ts)
        return self.snap((x0 + dx * t, y0 + dy * t))


def unit(uid, side, toe, p, facing, formation="deployed", **extra):
    u = L([("id", uid), ("side", side), ("toe", toe), ("x", p[0]), ("y", p[1]), ("facing", facing), ("formation", formation)])
    u.update(extra)
    return u


def objective(oid, name, p, weight, holder, radius=500):
    return L([("id", oid), ("name", name), ("x", p[0]), ("y", p[1]), ("radiusM", radius), ("weight", weight), ("initialHolder", holder)])


PACKS = L([("rules", "ww1-korea"), ("branches", "ww1-korea"), ("weapons", "ww1-korea-generic"), ("toe", "ww1-korea-generic")])
# 米独1944年の武器・編成(貫通力と装甲厚つき)を汎用の後ろに重ねる。作り直しは tools/packs/build_ww2_1944_us_de.py
PACKS_1944 = L(
    [
        ("rules", "ww1-korea"),
        ("branches", "ww1-korea"),
        ("weapons", ["ww1-korea-generic", "ww2-1944-us-de"]),
        ("toe", ["ww1-korea-generic", "ww2-1944-us-de"]),
    ]
)


# 連隊規模の汎用編成 → 大隊規模の汎用編成(編成表の注記を参照)。(大隊の編成, 数) の並び
SPLIT = {
    "infantry_regiment": [("infantry_battalion", 3)],
    "airborne_regiment": [("airborne_battalion", 3)],
    "glider_infantry_regiment": [("glider_infantry_battalion", 3)],
    "volksgrenadier_regiment": [("volksgrenadier_battalion", 2)],
    "panzergrenadier_regiment": [("mechanized_infantry_battalion", 2)],
    "panzer_regiment": [("tank_battalion", 2)],
    "armor_combat_command": [("tank_battalion", 1), ("mechanized_infantry_battalion", 1)],
}
BATTALION_SPACING_M = 500
# 連隊を大隊に分けるか。手触りの確認で、大隊に分けると部隊が多すぎて扱いきれなかったので、連隊規模に戻した(False)。
# 大隊の編成表は残してあり、True にすると大隊のシナリオを作れる
SPLIT_REGIMENTS = False


def battalion_ids(uid, toe):
    """連隊 uid を分けた大隊のID(分けない編成なら uid のまま)。例 us-501-pir → us-501-pir-1, -2, -3"""
    parts = SPLIT.get(toe) if SPLIT_REGIMENTS else None
    if not parts:
        return [uid]
    n = sum(c for _, c in parts)
    return [f"{uid}-{i + 1}" for i in range(n)]


def battalions(uid, toe, p, facing, snap, spacing=BATTALION_SPACING_M):
    """
    連隊を大隊に分ける。[(ID, 編成, 位置)] を返す。大隊は正面(facing)に対して横に spacing 間隔で並べる
    (大隊ごとの位置は資料で確かめていない。連隊の位置のまわりに置く)
    """
    parts = SPLIT.get(toe) if SPLIT_REGIMENTS else None
    if not parts:
        return [(uid, toe, p)]
    toes = [t for t, c in parts for _ in range(c)]
    ids = battalion_ids(uid, toe)
    rad = math.radians(facing)
    lateral = (math.cos(rad), -math.sin(rad))
    out = []
    for i, (bid, t) in enumerate(zip(ids, toes)):
        off = (i - (len(toes) - 1) / 2) * spacing
        out.append((bid, t, snap((p[0] + lateral[0] * off, p[1] + lateral[1] * off))))
    return out


def split_units(units, snap):
    """配置の部隊(unit() の辞書)の並びを、大隊に分けた並びにする。ほかの項目(練度・戦力など)は各大隊に写す"""
    out = []
    for u in units:
        for bid, t, p in battalions(u["id"], u["toe"], (u["x"], u["y"]), u["facing"], snap):
            b = L(u)
            b["id"], b["toe"], b["x"], b["y"] = bid, t, p[0], p[1]
            out.append(b)
    return out


def split_reinforcements(rs, snap):
    """増援の並びを大隊に分ける(split_units と同じ)"""
    return split_units(rs, snap)


def split_withdrawals(ws, toe_of):
    """離脱の並びを大隊のIDに直す。toe_of は 連隊ID → 編成"""
    out = []
    for w in ws:
        for bid in battalion_ids(w["id"], toe_of[w["id"]]):
            out.append(L([("turn", w["turn"]), ("id", bid)]))
    return out


ARTILLERY_TOES = {"artillery_battalion", "artillery_group"}


def scaled_command_points(cp, regiments, battalions_):
    """
    大隊に分けたときの指揮ポイント:分ける前の指揮ポイントに、機動部隊(砲兵を除く)の数の比を掛ける
    (1ターンに命令できる部隊の割合を、分ける前と同じに保つ)
    """
    count = lambda us: sum(1 for u in us if u["toe"] not in ARTILLERY_TOES)
    return max(1, round(cp * count(battalions_) / max(1, count(regiments))))
