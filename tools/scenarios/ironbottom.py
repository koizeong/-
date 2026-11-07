"""
ソロモン諸島・ガダルカナル沖(アイアンボトム・サウンド)の概略図。サボ島沖・タサファロンガ沖・第三次ソロモン海戦のシナリオで使う。
1km のセルで 80km × 60km。原点は南西の角(東経159°30′・南緯9°30′、1′ ≒ 1.84km)。海岸線は直線でならした概算。TODO(要裏取り):海図
"""

import math

CELL = 1000
COLS, ROWS = 80, 60
KM = 1000
SAVO = (34 * KM, 40.5 * KM)
SAVO_R = 3.5 * KM
GUADALCANAL = [(0, 18 * KM), (13 * KM, 27.6 * KM), (59 * KM, 11 * KM), (80 * KM, 5 * KM)]
FLORIDA = [(50 * KM, 52 * KM), (60 * KM, 48 * KM), (72 * KM, 45 * KM), (80 * KM, 44 * KM)]
# ルンガ泊地(ヘンダーソン飛行場の沖)とツラギ泊地
LUNGA = (57 * KM, 14 * KM)
TULAGI = (70 * KM, 42 * KM)


def _line_y(pts, x):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return None


def rows():
    out = []
    for r in range(ROWS):
        y = (ROWS - 1 - r) * CELL + CELL / 2
        row = ""
        for c in range(COLS):
            x = c * CELL + CELL / 2
            g = _line_y(GUADALCANAL, x)
            f = _line_y(FLORIDA, x)
            land = math.hypot(x - SAVO[0], y - SAVO[1]) <= SAVO_R or (g is not None and y < g) or (f is not None and y > f)
            row += "." if land else "~"
        out.append(row)
    return out


def polar(base, bearing_deg, dist_m):
    r = math.radians(bearing_deg)
    return (round(base[0] + math.sin(r) * dist_m), round(base[1] + math.cos(r) * dist_m))


def column(prefix, side, base, facing, ships, training=None, spacing=600, **extra):
    """1隻ずつの艦を、戦隊の旗艦(先頭)の後ろへ一列に置く"""
    out = []
    for k, (sid, toe, name) in enumerate(ships):
        p = polar(base, facing + 180, spacing * k) if k else base
        d = {"id": f"{prefix}-{sid}", "side": side, "toe": toe, "x": p[0], "y": p[1], "facing": facing, "name": name}
        if training:
            d["training"] = training
        d.update(extra)
        out.append(d)
    return out


def map_def():
    return {"cellSizeM": CELL, "legend": {"~": "sea", ".": "plain"}, "rows": rows()}
