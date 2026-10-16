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
