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

    def fill_terrain(self, seed, hill=0.0, forest=0.0, scale_m=2500, keep=()):
        """
        概略の地形を自動で敷く(史実の地形ではない。資料で位置を確かめた高地・森がないシナリオのため)。
        平地(".")のセルだけを、シードから決まる滑らかな起伏で高地・森にする。hill・forest はおよその割合(0〜1)、
        scale_m は起伏の大きさ(m)。keep の点(部隊の初期位置など)のまわり1セルは平地のまま残す
        """
        import random

        rng = random.Random(seed)
        step = max(2, round(scale_m / self.cell))

        def lattice():
            gc, gr = self.cols // step + 2, self.rows // step + 2
            return [[rng.random() for _ in range(gc)] for _ in range(gr)]

        def sample(g, c, r):
            fc, fr = c / step, r / step
            c0, r0 = int(fc), int(fr)
            tc, tr = fc - c0, fr - r0
            tc, tr = tc * tc * (3 - 2 * tc), tr * tr * (3 - 2 * tr)
            top = g[r0][c0] * (1 - tc) + g[r0][c0 + 1] * tc
            bot = g[r0 + 1][c0] * (1 - tc) + g[r0 + 1][c0 + 1] * tc
            return top * (1 - tr) + bot * tr

        hills, woods = lattice(), lattice()
        step_fine = max(1, step // 2)

        def lattice_fine():
            gc, gr = self.cols // step_fine + 2, self.rows // step_fine + 2
            return [[rng.random() for _ in range(gc)] for _ in range(gr)]

        fine_h, fine_w = lattice_fine(), lattice_fine()

        def sample_fine(g, c, r):
            nonlocal step
            keep_step = step
            step = step_fine
            v = sample(g, c, r)
            step = keep_step
            return v

        def field(g, fine, c, r):
            return 0.7 * sample(g, c, r) + 0.3 * sample_fine(fine, c, r)

        # 割合から閾値を決める(平地のセルの値を並べて、上から hill・forest の割合のところ)
        plain = [(c, r) for r in range(self.rows) for c in range(self.cols) if self.grid[self.rows - 1 - r][c] == "."]
        kept = set()
        for p in keep:
            c0, r0 = p[0] // self.cell, p[1] // self.cell
            for dc in (-1, 0, 1):
                for dr in (-1, 0, 1):
                    kept.add((c0 + dc, r0 + dr))
        hv = {cr: field(hills, fine_h, *cr) for cr in plain}
        wv = {cr: field(woods, fine_w, *cr) for cr in plain}
        h_cut = sorted(hv.values(), reverse=True)[int(len(hv) * hill)] if hill > 0 and hv else 2.0
        w_cut = sorted(wv.values(), reverse=True)[int(len(wv) * forest)] if forest > 0 and wv else 2.0
        if hill > 0:
            self.terrain("H", "hill")
        if forest > 0:
            self.terrain("F", "forest")
        for c, r in plain:
            if (c, r) in kept:
                continue
            if hv[(c, r)] > h_cut:
                self.grid[self.rows - 1 - r][c] = "H"
            elif wv[(c, r)] > w_cut:
                self.grid[self.rows - 1 - r][c] = "F"

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


# 史実の編成(米独1944年のパック data/*/ww2-1944-us-de.json)。汎用の編成表 → 1944年の編成表(陣営ごと)。
# 駆逐大隊は車種がシナリオごとに違うので、シナリオのスクリプトで部隊ごとに書く(overrides)
HISTORICAL_1944 = {
    ("us", "armored_task_force"): "us_armored_task_force_m4",
    ("us", "infantry_regiment"): "us_infantry_regiment_1944",
    ("us", "airborne_regiment"): "us_airborne_regiment_1944",
    ("us", "glider_infantry_regiment"): "us_glider_infantry_regiment_1944",
    ("de", "panzer_regiment"): "de_panzer_regiment_1944",
    ("de", "panzergrenadier_regiment"): "de_panzergrenadier_regiment_1944",
    ("de", "volksgrenadier_regiment"): "de_volksgrenadier_regiment_1944",
}


def historical_presets(scenario, overrides=None, note=""):
    """
    シナリオの「史実の編成」の選択(presets.historical)。初めからいる部隊と増援の編成表を、1944年の編成表に替える。
    overrides:部隊ID → 編成表("" は汎用のまま。1944年の編成表がない・兵器の裏が取れていない部隊)
    """
    overrides = overrides or {}
    units = {}
    for u in list(scenario["units"]) + list(scenario["rules"].get("reinforcements", [])):
        t = overrides[u["id"]] if u["id"] in overrides else HISTORICAL_1944.get((u["side"], u["toe"]))
        if t:
            units[u["id"]] = t
    desc = (
        "部隊の編成表を米独1944年のもの(武器の貫通力と、戦車・駆逐戦車の装甲厚つき)に替える。"
        "数値の根拠は docs/research/weapons-1944-us-de.md。汎用の編成より、戦車どうしの撃ち合いで向きと車種の差が大きく出る。"
        "アラクールでは独軍寄りになった(docs/research/validation.md)。" + note
    )
    return L(
        [
            (
                "historical",
                L(
                    [
                        ("name", "史実の編成(米独1944年)"),
                        ("description", desc),
                        ("packs", L([("weapons", ["ww1-korea-generic", "ww2-1944-us-de"]), ("toe", ["ww1-korea-generic", "ww2-1944-us-de"])])),
                        ("units", units),
                    ]
                ),
            )
        ]
    )


# 国ごとの実数の編成表(data/toe/us.json・de.json)への読み替え。部隊の型ごと。ないものは米独1944年の編成表(HISTORICAL_1944)のまま
REAL_1944 = {
    ("us", "armored_task_force"): "us-armd-team-1944",
    ("us", "infantry_regiment"): "us-ir-1944",
    ("us", "airborne_regiment"): "us-pir-1944",
    ("us", "armor_combat_command"): "us-cc-1944",
    ("us", "tank_destroyer_battalion"): "us-td-bn-m10",
    ("us", "tank_battalion"): "us-tank-bn-1944",
    ("de", "panzer_regiment"): "de-pz-regt-1944",
    ("de", "panzergrenadier_regiment"): "de-pzgr-regt-1944",
    ("de", "volksgrenadier_regiment"): "de-vgr-1944",
}


def real_presets(scenario, overrides=None, note="", packs=None, defaults=True):
    """
    シナリオの「史実の編成(実数・定数)」の選択(presets.real)。部隊の編成表を、人員と装備品の実数で書いた国ごとの編成表に替える。
    overrides:部隊ID → 編成表("" は元のまま)。defaults:型ごとの読み替え(REAL_1944、なければ米独1944年の HISTORICAL_1944)も使うか
    (1944年の米独のシナリオだけ。ほかの年代・国は overrides だけで書く)。packs:武器・編成表のパック(既定は汎用・米独1944年・us・de)
    """
    overrides = overrides or {}
    units = {}
    for u in list(scenario["units"]) + list(scenario["rules"].get("reinforcements", [])):
        key = (u["side"], u["toe"])
        if u["id"] in overrides:
            t = overrides[u["id"]]
        elif defaults:
            t = REAL_1944.get(key) or HISTORICAL_1944.get(key)
        else:
            t = None
        if t:
            units[u["id"]] = t
    desc = (
        "部隊の編成表を、人員と装備品の実数で書いた国ごとの編成表(1丁・1両ずつの武器と装甲)に替える。図鑑(装備と編制)で線図を見られる。"
        "定数で書いたので、多くの部隊は汎用の編成より人員・火力が多い(実際の兵力は定数より少ない部隊が多い)。"
        "根拠は docs/research/equipment-*.md。" + note
    )
    packs = packs or ["ww1-korea-generic", "ww2-1944-us-de", "us", "de"]
    return L(
        [
            ("name", "史実の編成(実数・定数)"),
            ("description", desc),
            ("packs", L([("weapons", packs), ("toe", packs)])),
            ("units", units),
        ]
    )

def formations(scenario, spec):
    """
    上級部隊(装備編成の階層の画面に見せる木)。spec は (ID, 名前, 陣営, 上の上級部隊ID or None, [部隊ID]) の並び。
    シナリオにいない部隊は除く
    """
    ids = {u["id"] for u in list(scenario["units"]) + list(scenario["rules"].get("reinforcements", []))}
    out = L()
    for fid, name, side, parent, units in spec:
        f = L([("name", name), ("side", side)])
        if parent:
            f["parent"] = parent
        f["units"] = [u for u in units if u in ids]
        out[fid] = f
    return out


# バストーニュ(19日・8日間)の上級部隊。第705駆逐戦車大隊は第101空挺師団に配属(Cole『The Ardennes』第19章)
BASTOGNE_FORMATIONS = [
    ("us-101abn", "第101空挺師団", "us", None, ["us-501-pir", "us-502-pir", "us-506-pir", "us-327-gir", "us-705-td"]),
    ("us-10ad-ccb", "第10機甲師団B戦闘団", "us", None, ["us-team-desobry", "us-team-cherry", "us-team-ohara"]),
    ("us-4ad", "第4機甲師団", "us", None, ["us-4ad-ccr"]),
    ("de-xlvii", "第47装甲軍団", "de", None, []),
    ("de-2pz", "第2装甲師団", "de", "de-xlvii", ["de-2pz-kg-north", "de-2pz-pgr"]),
    ("de-lehr", "装甲教導師団", "de", "de-xlvii", ["de-lehr-902", "de-lehr-130"]),
    ("de-26vgd", "第26国民擲弾兵師団", "de", "de-xlvii", ["de-26vgd-77", "de-26vgd-78", "de-26vgd-39", "de-26vgd-kg-kunkel"]),
    ("de-5fj", "第5降下猟兵師団", "de", None, ["de-5fj-14"]),
    ("de-15pzg", "第15装甲擲弾兵師団", "de", None, ["de-15pzg-115"]),
]

# クリンケルト=ロッヒェラートの上級部隊。第741戦車大隊・第644駆逐戦車大隊は第2歩兵師団に配属
KRINKELT_FORMATIONS = [
    ("us-2id", "第2歩兵師団", "us", None, ["us-9-ir", "us-23-ir", "us-38-ir", "us-741-tk", "us-644-td"]),
    ("us-99id", "第99歩兵師団", "us", None, ["us-99-393", "us-99-394"]),
    ("de-1sspzk", "第1SS装甲軍団", "de", None, []),
    ("de-12ss", "第12SS装甲師団", "de", "de-1sspzk", ["de-12ss-pzr", "de-12ss-25", "de-12ss-26", "de-12ss-jg"]),
    ("de-277vgd", "第277国民擲弾兵師団", "de", "de-1sspzk", ["de-277-989", "de-277-990", "de-277-991"]),
]


def apply_names(scenario, names):
    """
    部隊の表示名(地図・ユニットの欄・作戦命令に出す。ルールには使わない)を、初めからいる部隊・増援・空挺部隊に入れる。
    names:部隊ID → 名前。地図に出るので短めに(例「第501空挺歩兵連隊」)。名前の表にない部隊は ID のまま
    """
    for u in list(scenario["units"]) + list(scenario["rules"].get("reinforcements", [])) + list(scenario["rules"].get("airborne", [])):
        if u["id"] in names:
            u["name"] = names[u["id"]]
    unknown = set(names) - {u["id"] for u in list(scenario["units"]) + list(scenario["rules"].get("reinforcements", [])) + list(scenario["rules"].get("airborne", []))}
    if unknown:
        raise SystemExit(f"名前の表にシナリオにいない部隊があります: {sorted(unknown)}")


# バストーニュ(19日・8日間)の部隊の表示名。連隊番号の分からない部隊は師団名で書く
BASTOGNE_NAMES = {
    "us-team-desobry": "デソブリー隊",
    "us-team-cherry": "チェリー隊",
    "us-team-ohara": "オハラ隊",
    "us-501-pir": "第501空挺歩兵連隊",
    "us-506-pir": "第506空挺歩兵連隊",
    "us-502-pir": "第502空挺歩兵連隊",
    "us-327-gir": "第327グライダー歩兵連隊",
    "us-705-td": "第705駆逐戦車大隊",
    "us-101-divarty": "第101空挺師団砲兵",
    "us-4ad-ccr": "第4機甲師団R戦闘団",
    "de-2pz-kg-north": "第2装甲師団 戦闘団",
    "de-2pz-pgr": "第2装甲師団 擲弾兵連隊",
    "de-lehr-902": "装甲教導 第902連隊",
    "de-lehr-130": "教導戦車連隊130",
    "de-26vgd-77": "第77擲弾兵連隊",
    "de-26vgd-78": "第78擲弾兵連隊",
    "de-26vgd-39": "第39擲弾兵連隊",
    "de-26vgd-art": "第26国民擲弾兵師団砲兵",
    "de-26vgd-kg-kunkel": "クンケル戦闘団",
    "de-5fj-14": "第14降下猟兵連隊",
    "de-15pzg-115": "第115装甲擲弾兵連隊",
}

