"""
装備品(実数の編成表)の武器の威力を、汎用の武器から決める共通の道具。国ごとの装備品パックの build スクリプトから使う。
物差しと根拠は docs/research/equipment-calibration.md。

基準:**小銃150丁と軽機関銃9挺の小銃中隊** の300mでの火力を、汎用の小銃中隊(小火器4・機関銃1)の300mでの火力
(0.6 × 4 + 2.0 × 1 = 4.4)と同じにする。小火器・機関銃は「小銃何丁ぶん(小銃換算 RE)」で、砲は1発の重さで比べる。
弾薬の消費は、汎用の武器の 弾薬 ÷ 火力 の比をそのまま使う(火力に比例)。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEN_W = json.loads((ROOT / "data/weapons/ww1-korea-generic.json").read_text())["weapons"]

# 小銃換算1つあたりの300mでの火力:汎用の小銃中隊の 4.4 を、基準の中隊(小銃150 × 1 + 軽機関銃9 × 10 = 240)で割る
GENERIC_COMPANY_300 = 0.6 * 4 + 2.0 * 1
REFERENCE_RE = 150 * 1.0 + 9 * 10.0
PER_RE_300 = GENERIC_COMPANY_300 / REFERENCE_RE

# 小銃換算(ゲームの見立て。根拠は equipment-calibration.md):ボルトアクション小銃 1。
# 第二次大戦の機関銃は半自動小銃のおよそ10倍の理論殺傷力(デュピュイ研究所)→ 半自動小銃 1.5 とおき、汎用機関銃(二脚)15、
# 弾倉式の軽機関銃 10、三脚の重機関銃 15(射程が長い)
RE = {
    "bolt_rifle": 1.0,
    "semi_rifle": 1.5,
    "carbine": 1.2,
    "smg": 2.0,
    "assault_rifle": 2.5,
    "auto_rifle": 4.0,
    "lmg": 10.0,
    "gpmg": 15.0,
    "hmg": 15.0,
}


def _scaled(base: dict, k: float, name: str, **over) -> dict:
    w = json.loads(json.dumps(base))
    w["name"] = name
    for b in w["bands"]:
        b["power"] = round(b["power"] * k, 6)
    w["ammoPerMin"] = round(w["ammoPerMin"] * k, 8)
    if "antiAir" in w:
        w["antiAir"] = round(w["antiAir"] * k, 6)
    w.update(over)
    return w


def rifle(name: str, re: float, max_range_m: int = 600, **over) -> dict:
    """小銃・自動小銃(汎用の小火器の射程の形。300mで re × PER_RE_300)"""
    base = json.loads(json.dumps(GEN_W["small_arms"]))
    base["bands"][-1]["maxRangeM"] = max_range_m
    return _scaled(base, re * PER_RE_300 / 0.6, name, **over)


def smg(name: str, re_close: float = RE["smg"], **over) -> dict:
    """短機関銃:100mまでは小銃の re_close 倍、200mまでその半分、その先は撃たない(ゲームの見立て)"""
    k = PER_RE_300 / 0.6
    return {
        "name": name,
        "bands": [{"maxRangeM": 100, "power": round(re_close * k, 6)}, {"maxRangeM": 200, "power": round(re_close * k * 0.4, 6)}],
        "effectiveness": dict(GEN_W["small_arms"]["effectiveness"]),
        "indirect": False,
        "ammoPerMin": round(GEN_W["small_arms"]["ammoPerMin"] * re_close * k, 8),
        "suppression": GEN_W["small_arms"].get("suppression", 1),
        "antiAir": 0,
        **over,
    }


def mg(name: str, re: float, tripod: bool = False, **over) -> dict:
    """機関銃(汎用の機関銃の射程の形。300mで re × PER_RE_300)。三脚(重機関銃・汎用機関銃の重機関銃の使い方)は1800mまで届く"""
    base = json.loads(json.dumps(GEN_W["machine_gun"]))
    if tripod:
        base["bands"] = [{"maxRangeM": 300, "power": 2.0}, {"maxRangeM": 600, "power": 1.2}, {"maxRangeM": 1200, "power": 0.5}, {"maxRangeM": 1800, "power": 0.2}]
    return _scaled(base, re * PER_RE_300 / 2.0, name, **over)


# ---- 重い武器:1門・1両あたり ----
# 汎用の編成表の数と実数の比(ゲームの見立て):戦車中隊の戦車砲4 ≒ 戦車16両、駆逐戦車中隊の砲4 ≒ 12両、砲兵中隊の砲4 = 4門
PER_TANK = 4 / 16
PER_TD = 4 / 12
PER_GUN = 1.0
# 牽引の対戦車砲:汎用の at_gun 1 ≒ 対戦車小隊 3門
PER_AT_GUN = 1 / 3
# 対戦車火器(バズーカ・対戦車銃):汎用の rocket_launcher 1 ≒ 中隊の対戦車火器 3つ
PER_AT_WEAPON = 1 / 3

# 砲の威力は1発の重さ(榴弾、kg)の0.75乗で比べる(ゲームの見立て)。基準は105mm榴弾砲の榴弾 14.9kg(M1 105mm、M2A1 の HE M1)
REF_SHELL_KG = 14.9
SHELL_EXP = 0.75


def shell_factor(shell_kg: float) -> float:
    return (shell_kg / REF_SHELL_KG) ** SHELL_EXP


def piece(base_id: str, factor: float, name: str, **over) -> dict:
    """汎用の武器(base_id)を1門・1両あたりに直す(火力と弾薬に factor を掛ける。射程・貫通力は over で書く)"""
    return _scaled(GEN_W[base_id], factor, name, **over)


def howitzer(name: str, shell_kg: float, max_range_m: int, **over) -> dict:
    """野砲・榴弾砲(間接射撃)。1門あたり。威力は1発の重さで、105mm(14.9kg)が汎用の榴弾砲1つ"""
    return piece("howitzer", PER_GUN * shell_factor(shell_kg), name, bands=[{"maxRangeM": max_range_m, "power": round(GEN_W["howitzer"]["bands"][0]["power"] * shell_factor(shell_kg), 6)}], **over)


# 迫撃砲(曲射の直接射撃。大隊・中隊の持つもの):81mm(3.2kg)1門を 0.35 とする(大隊の81mm 6門 ≒ 中隊1つの300mの小火器の半分。ゲームの見立て)
MORTAR_81_POWER = 0.35
MORTAR_81_SHELL_KG = 3.2


def mortar(name: str, shell_kg: float, max_range_m: int, **over) -> dict:
    p = round(MORTAR_81_POWER * (shell_kg / MORTAR_81_SHELL_KG) ** SHELL_EXP, 6)
    return {
        "name": name,
        "bands": [{"maxRangeM": max_range_m, "power": p}],
        "effectiveness": {"soft": 1.0, "armored": 0.15},
        "indirect": False,
        "ammoPerMin": round(0.004 * p / 1.5, 8),
        "suppression": 1.5,
        "antiAir": 0,
        "arcing": True,
        **over,
    }


# 戦車砲の非装甲の目標への威力(榴弾の重さの違い):口径ごとの倍率(ゲームの見立て)。装甲への効き目は貫通力で決まる
TANK_GUN_SOFT = {20: 0.3, 37: 0.5, 45: 0.6, 47: 0.65, 50: 0.7, 57: 0.8, 75: 1.0, 76: 1.0, 85: 1.15, 88: 1.2, 90: 1.2, 122: 1.5}


def tank_gun(name: str, caliber: int, pen: list, far: list, wid: str, td: bool = False, **over) -> dict:
    """戦車砲・突撃砲・駆逐戦車の砲(1両あたり)。pen は (距離m, 貫通mm) の表"""
    base_id = "td_gun" if td else "tank_gun"
    k = (PER_TD if td else PER_TANK) * TANK_GUN_SOFT.get(caliber, 1.0)
    w = piece(base_id, k, name, **over)
    w["bands"] = bands_with_pen(w["bands"], pen, far, wid)
    return w


def at_gun(name: str, caliber: int, pen: list, far: list, wid: str, **over) -> dict:
    """牽引の対戦車砲(1門あたり)"""
    w = piece("at_gun", PER_AT_GUN * TANK_GUN_SOFT.get(caliber, 1.0), name, **over)
    w["bands"] = bands_with_pen(w["bands"], pen, far, wid)
    return w


def bands_with_pen(base: list, pen: list, far_notes: list, wid: str) -> list:
    """距離帯に貫通力の表を重ねる(各帯は遠い端以上でいちばん近い表の値。表より遠い帯は最後の値で TODO)"""
    edges = sorted({b["maxRangeM"] for b in base} | {d for d, _ in pen if d < base[-1]["maxRangeM"]})
    out = []
    for e in edges:
        power = next(b["power"] for b in base if e <= b["maxRangeM"])
        p = next((v for d, v in pen if d >= e), None)
        if p is None:
            p = pen[-1][1]
            if wid not in far_notes:
                far_notes.append(wid)
        if out and out[-1]["power"] == power and out[-1]["penetrationMm"] == p:
            out[-1]["maxRangeM"] = e
        else:
            out.append({"maxRangeM": e, "power": power, "penetrationMm": p})
    return out


def at_weapon(name: str, pen: list, close_m: int, max_m: int, **over) -> dict:
    """対戦車銃・バズーカなど(1つあたり)。汎用の携行対戦車火器の 1/3"""
    k = PER_AT_WEAPON
    return {
        "name": name,
        "bands": [{"maxRangeM": close_m, "power": round(1.0 * k, 6), "penetrationMm": pen[0]}, {"maxRangeM": max_m, "power": round(0.4 * k, 6), "penetrationMm": pen[-1]}],
        "effectiveness": dict(GEN_W["rocket_launcher"]["effectiveness"]),
        "indirect": False,
        "ammoPerMin": round(GEN_W["rocket_launcher"]["ammoPerMin"] * k, 8),
        "suppression": GEN_W["rocket_launcher"].get("suppression", 1),
        "antiAir": 0,
        **over,
    }


# ---- 車両の耐久(1両あたり。乗員の耐久は人員として別に数える)----
# 汎用の戦車中隊の耐久100 ≒ 戦車16両 + 乗員80人 × 0.5 → 1両あたり約4(中戦車)。軽・重はその比(ゲームの見立て)
VEHICLE_HP = {"light_tank": 2.5, "medium_tank": 4.0, "heavy_tank": 6.0, "assault_gun": 3.5, "tank_destroyer": 3.5, "armored_car": 1.5}


# ---- 国ごとのパックを組み立てる道具(装備品・編成表の書き方をそろえる)----
GEN_T = json.loads((ROOT / "data/toe/ww1-korea-generic.json").read_text())["toes"]


def years(a: int, b: int | None = None) -> dict:
    return {"from": a, **({"to": b} if b else {})}


class Pack:
    """1つの国の武器(W)・装備品(E)・編成表(T)。far は表より遠い帯の貫通力を最後の値で埋めた武器の ID"""

    def __init__(self, nation: str):
        self.nation = nation
        self.W: dict = {}
        self.E: dict = {}
        self.T: dict = {}
        self.far: list = []

    def item(self, iid, name, category, years, weapons=(), crew=0, hp=0.0, armor=None, specs=None, desc=None, short=None):
        e = {"name": name, **({"short": short} if short else {}), "nation": self.nation, "category": category, "years": years, "weapons": [{"weapon": w, "count": n} for w, n in weapons], "crew": crew, "hitPoints": hp}
        if armor:
            e["armored"] = True
            e["armorMm"] = armor
        if specs:
            e["specs"] = specs
        if desc:
            e["description"] = desc
        self.E[iid] = e

    @staticmethod
    def el(name, count, personnel, equip, group=None, group_count=None):
        e = {"name": name, "count": count, "personnel": personnel, "equipment": [{"item": i, "count": n} for i, n in equip if n > 0]}
        if group:
            e["group"] = group
        if group_count:
            e["groupCount"] = group_count
        return e

    def _external(self):
        """ほかの国のパックの装備品・武器(ほかの国の装備品を使う編成表のため。例:朝鮮人民軍のソ連製の装備)"""
        if not hasattr(self, "_ext"):
            self._ext = ({}, {})
            for f in sorted((ROOT / "data/weapons").glob("*.json")):
                d = json.loads(f.read_text())
                self._ext[0].update(d.get("equipment", {}))
                self._ext[1].update(d["weapons"])
        return self._ext

    def ammo_rate(self, elements) -> float:
        s = 0.0
        for e in elements:
            for ref in e["equipment"]:
                item = self.E.get(ref["item"]) or self._external()[0][ref["item"]]
                for w in item["weapons"]:
                    ww = self.W.get(w["weapon"]) or self._external()[1][w["weapon"]]
                    if not ww["indirect"]:
                        s += e["count"] * ref["count"] * w["count"] * ww["ammoPerMin"]
        return s

    @staticmethod
    def generic_ammo_rate(toe_id) -> float:
        t = GEN_T[toe_id]
        return sum(e["count"] * r["count"] * GEN_W[r["weapon"]]["ammoPerMin"] for e in t["elements"] for r in e["weapons"] if not GEN_W[r["weapon"]]["indirect"])

    def toe(self, tid, name, base, elements, echelon=None, modifiers=None, branch=None):
        """汎用の編成表(base)の兵科・正面幅・燃料を写し、弾薬の積載は直接射撃の弾薬の消費の比で合わせる(撃ち続けられる時間をそろえる)"""
        g = GEN_T[base]
        sup = dict(g["supply"])
        gr = self.generic_ammo_rate(base)
        if gr > 0:
            sup["ammoCapacityT"] = round(sup["ammoCapacityT"] * self.ammo_rate(elements) / gr, 2)
        t = {"name": name, "branch": branch or g["branch"], "armorRatio": g["armorRatio"], "frontageM": g["frontageM"], "amphibious": False, "supply": sup, "elements": elements}
        sym = dict(g.get("symbol") or {})
        if echelon:
            sym["echelon"] = echelon
        if modifiers is not None:
            sym["modifiers"] = modifiers
        t["symbol"] = sym
        self.T[tid] = t

    def write(self, w_notes: str, t_notes: str, pack_id: str | None = None):
        for w in self.W.values():
            w.setdefault("suppression", 1)
            w.setdefault("antiAir", 0)
        n = pack_id or self.nation
        (ROOT / f"data/weapons/{n}.json").write_text(json.dumps({"id": n, "notes": w_notes, "personnelHitPoints": 0.5, "weapons": self.W, "equipment": self.E}, ensure_ascii=False, indent=2) + "\n")
        (ROOT / f"data/toe/{n}.json").write_text(json.dumps({"id": n, "notes": t_notes, "toes": self.T}, ensure_ascii=False, indent=2) + "\n")
        print("weapons", len(self.W), "equipment", len(self.E), "toes", len(self.T), "far", self.far)
