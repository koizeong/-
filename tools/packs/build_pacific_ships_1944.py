#!/usr/bin/env python3
"""
太平洋 1944年の艦級(日本・米)の武器と編成表を作る。1942年のパック(pacific-ships-1942)の後ろに重ねて使う。

    python3 tools/packs/build_pacific_ships_1944.py

出力: data/weapons/pacific-ships-1944.json・data/toe/pacific-ships-1944.json
使い方:シナリオの packs に ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "pacific-ships-1944"] と重ねる。

スリガオ海峡海戦(1944年10月25日)のために足した艦級。諸元(排水量・速力・装甲・砲の数と配置・発射管・電探)はすべて仮置き。
TODO(要裏取り):出典候補は Friedman『U.S. Battleships』『U.S. Cruisers』・『Naval Radar』、Lacroix & Wells『Japanese Cruisers of the Pacific War』、
Skulski『The Battleship Fuso』、NavWeaps の各砲・魚雷の頁。ゲームの値への直し方は 1942年のパック(tools/packs/build_pacific_ships_1942.py)と同じ。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KN = 30.87  # 1ノット(m/分)
TOD = "TODO(要裏取り)"


def w(name, bands, armored=0.7, aa=0.0, ammo=0.0001, suppression=0.5, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": 1.0, "armored": armored}, "indirect": False, "ammoPerMin": ammo, "suppression": suppression, "antiAir": aa}
    d.update(extra)
    return d


def gun(rof, kg, belt, deck):
    return {
        "rofPerMin": rof,
        "shellKg": kg,
        "beltPenetration": [{"rangeM": int(r * 1000), "mm": mm} for r, mm in belt],
        "deckPenetration": [{"rangeM": int(r * 1000), "mm": mm} for r, mm in deck],
    }


# 艦砲の砲戦の諸元(1分あたりの発射・徹甲弾の重さ・距離(km)ごとの舷側と甲板を抜ける厚さ)。TODO(要裏取り):NavWeaps の各砲の頁
NAVAL = {
    "us_16in_45_mk5": gun(1.5, 952, [(5, 600), (10, 500), (15, 410), (20, 330), (25, 270), (30, 220)], [(5, 25), (10, 50), (15, 75), (20, 100), (25, 130), (30, 165)]),
    "us_14in_50": gun(1.5, 680, [(5, 500), (10, 410), (15, 330), (20, 260), (25, 210), (30, 170)], [(5, 25), (10, 40), (15, 60), (20, 80), (25, 105), (30, 135)]),
    "us_14in_45": gun(1.5, 635, [(5, 470), (10, 380), (15, 300), (20, 240), (25, 190)], [(5, 25), (10, 40), (15, 58), (20, 78), (25, 100)]),
    # レイテ沖海戦(1944年10月)のために足した砲。貫通は概数(TODO(要裏取り):NavWeaps)
    "jp_46cm": gun(1.5, 1460, [(5, 700), (10, 610), (15, 530), (20, 460), (25, 400), (30, 350), (40, 260)], [(5, 25), (10, 50), (15, 80), (20, 110), (25, 140), (30, 180), (40, 230)]),
    "jp_41cm": gun(1.6, 1020, [(5, 560), (10, 480), (15, 400), (20, 330), (25, 270), (30, 220)], [(5, 25), (10, 45), (15, 70), (20, 95), (25, 125), (30, 160)]),
    "us_16in_50": gun(2.0, 1225, [(5, 700), (10, 620), (15, 530), (20, 450), (25, 380), (30, 320), (35, 270)], [(5, 20), (10, 45), (15, 75), (20, 110), (25, 145), (30, 185), (35, 220)]),
}

WEAPONS = {
    "us_16in_45_mk5": w("16in/45 砲(コロラド級・1門。徹甲弾 Mk5)", [(10000, 62), (20000, 55), (30000, 36), (32000, 15)], armored=1.0, ammo=0.0003),
    "us_14in_50": w("14in/50 砲(テネシー級・ニューメキシコ級・1門)", [(10000, 52), (20000, 45), (30000, 28), (33000, 12)], armored=1.0, ammo=0.0002),
    "us_14in_45": w("14in/45 砲(ペンシルベニア級・1門)", [(10000, 48), (20000, 42), (30000, 25), (31000, 10)], armored=1.0, ammo=0.0002),
    "jp_46cm": w("46cm/45 砲(大和型・1門)", [(10000, 85), (20000, 75), (30000, 55), (42000, 20)], armored=1.0, ammo=0.0003),
    "jp_41cm": w("41cm/45 砲(長門型・1門)", [(10000, 65), (20000, 58), (30000, 38), (38000, 15)], armored=1.0, ammo=0.0003),
    "us_16in_50": w("16in/50 砲(アイオワ級・1門)", [(10000, 75), (20000, 66), (30000, 46), (38000, 18)], armored=1.0, ammo=0.0003),
    "us_mk15_1944": w("Mk15 魚雷 21in(1944年。不具合を直した後・1射線)", [(4000, 90), (8000, 50), (13000, 20)], armored=1.0, ammo=0.00025, torpedo=True),
    "us_mk13_pt": w("Mk13 魚雷(魚雷艇・1射線)", [(3000, 60), (5500, 30)], armored=1.0, ammo=0.00025, torpedo=True),
}
for k, v in NAVAL.items():
    WEAPONS[k]["naval"] = v

# 走る魚雷:雷速(ノット)・その雷速での射程(m)・炸薬(kg)・当たって爆発する割合。TODO(要裏取り):Newpower『Iron Men and Tin Fish』
TORPEDO_RUN = {
    # 1943年後半に磁気信管・深度・接触信管の不具合を直した後。当たって爆発する割合 0.9 は仮置き
    "us_mk15_1944": (33.5, 9100, 375, 0.9),
    # 魚雷艇は1944年に航空魚雷の Mk13 を積んだ
    "us_mk13_pt": (33.5, 5700, 270, 0.8),
}
for k, (kn, rng_m, kg, rel) in TORPEDO_RUN.items():
    WEAPONS[k]["torpedoRun"] = {"speedMpm": round(kn * KN), "rangeM": rng_m, "warheadKg": kg, "reliability": rel}

SUPPLY = {"ammoCapacityT": 50, "fuelCapacityT": 400, "fuelPerKmT": 0.3}
# 1門あたりの徹甲弾・榴弾。スリガオの米の旧式戦艦は上陸支援の砲撃のために榴弾を多く積み、徹甲弾が少なかった(1門あたり十数発ほどという要約)。TODO(要裏取り)
SHELLS = {"us_16in_45_mk5": (20, 80), "us_14in_50": (20, 80), "us_14in_45": (20, 80), "jp_46cm": (60, 40), "jp_41cm": (60, 40), "us_16in_50": (90, 40)}


def b(weapon, guns, bow, beam, stern):
    d = {"weapon": weapon, "guns": guns, "bow": bow, "beam": beam, "stern": stern}
    if weapon in SHELLS:
        d["apPerGun"], d["hePerGun"] = SHELLS[weapon]
    return d


def ship(name, type_, disp, kn, batteries, aa, belt=0, deck=0, turret=0, note=None, radar=None, reloads=0, fc=None, fc_hit=None, carrier=False):
    hp = round(60 * (disp / 1000) ** 0.85)
    weapons = [{"weapon": x["weapon"], "count": x["guns"]} for x in batteries] + [{"weapon": "naval_aa", "count": 1} for _ in range(aa)]
    t = {
        "name": name,
        "branch": "naval",
        "armorRatio": 0.6 if belt >= 150 else 0.4 if belt >= 75 else 0.2,
        "frontageM": 0,
        "naval": True,
        "speedMpm": round(kn * KN),
        "supply": SUPPLY,
        "elements": [{"name": name, "count": 1, "hitPoints": hp, "weapons": weapons}],
        "ship": {"type": type_, "displacementT": disp, "beltMm": belt, "deckMm": deck, "turretMm": turret, "batteries": batteries},
        "symbol": {"modifiers": []},
    }
    if carrier:
        t["carrier"] = True
    if radar:
        t["radarRangeM"] = radar
    if fc:
        t["fireControlRadar"] = {"rangeM": fc, **({"hitMultiplier": fc_hit} if fc_hit else {})}
    if reloads:
        t["ship"]["torpedoReloads"] = reloads
    if note:
        t["notes"] = note
    return t


# 1942年のパックの武器(jp_14in_45・jp_15cm_50・jp_20cm_50・jp_127_40・jp_127_50・jp_type93・us_5in_38・us_6in_47)を使う
TOES = {
    # ---- 日本海軍 ----
    "jp-bb-fuso": ship("扶桑型戦艦(扶桑・山城)", "battleship", 34700, 24.7,
        [b("jp_14in_45", 12, 4, 12, 4), b("jp_15cm_50", 14, 4, 7, 2), b("jp_127_40", 8, 2, 4, 2)], aa=4, belt=305, deck=100, turret=305,
        note=f"主砲塔6基(前2・中2・後2)。甲板の装甲と1944年の対空機銃・二二号電探は {TOD}", radar=15000),
    "jp-ca-mogami-1944": ship("航空巡洋艦 最上(1944年)", "heavy_cruiser", 12400, 34.7,
        [b("jp_20cm_50", 6, 6, 6, 0), b("jp_127_40", 8, 2, 4, 2), b("jp_type93", 12, 0, 6, 0)], aa=3, belt=100, deck=35, turret=25,
        note=f"後部の主砲塔を外して水上機の甲板にした(主砲は前部の連装3基だけ)。電探は {TOD}", radar=15000, reloads=1),
    # ---- レイテ沖海戦(1944年10月)のために足した艦級。基準排水量・速力・主砲は一般に知られた値の概数、装甲・電探・対空は大づかみ。
    # TODO(要裏取り):出典候補は Skulski『The Battleship Yamato』、Lengerer の日本空母の資料、Friedman『U.S. Aircraft Carriers』『U.S. Battleships』----
    "jp-bb-yamato": ship("大和型戦艦(大和・武蔵)", "battleship", 64000, 27.0,
        [b("jp_46cm", 9, 6, 9, 3), b("jp_15cm_50", 6, 3, 6, 3), b("jp_127_40", 24, 6, 12, 6)], aa=8, belt=410, deck=200, turret=650,
        note=f"副砲は 15.5cm だが 15cm/50 で代える。1944年の増えた対空機銃と二一号・二二号電探は {TOD}", radar=20000),
    "jp-bb-nagato": ship("長門型戦艦(長門)", "battleship", 39100, 25.0,
        [b("jp_41cm", 8, 4, 8, 4), b("jp_14cm_50", 18, 4, 9, 4), b("jp_127_40", 8, 2, 4, 2)], aa=5, belt=305, deck=100, turret=508, note=f"{TOD}", radar=15000),
    "jp-bbcv-ise": ship("伊勢型航空戦艦(伊勢・日向)", "battleship", 35350, 25.3,
        [b("jp_14in_45", 8, 4, 8, 4), b("jp_127_40", 16, 4, 8, 4)], aa=6, belt=299, deck=100, turret=305,
        note=f"後部の主砲塔2基を外して飛行甲板にした。エンガノ岬沖では艦載機を積んでいなかった。{TOD}", radar=15000),
    "jp-cvl-chitose": ship("空母 千歳型(千歳・千代田)", "light_carrier", 11190, 29.0, [b("jp_127_40", 8, 2, 4, 2)], aa=3, carrier=True,
        note="水上機母艦からの改造"),
    "jp-cl-agano": ship("阿賀野型軽巡(能代・矢矧)", "light_cruiser", 6652, 35.0,
        [b("jp_15cm_50", 6, 4, 6, 2), b("jp_type93", 8, 0, 4, 0)], aa=2, belt=60, deck=20, note=f"主砲は 15.2cm/50 だが 15cm/50 で代える。{TOD}", reloads=1),
    "us-cv-essex": ship("エセックス級空母", "carrier", 27100, 32.7, [b("us_5in_38", 12, 4, 8, 4)], aa=8, belt=102, deck=64, carrier=True, radar=30000),
    "us-cvl-independence": ship("インディペンデンス級軽空母", "light_carrier", 11000, 31.6, [b("us_5in_38", 2, 0, 1, 1)], aa=4, belt=127, carrier=True,
        note=f"5in 砲はなく 40mm 機銃だけ。主砲の欄は対空の 5in/38 で代える({TOD})", radar=30000),
    "us-cve-casablanca": ship("カサブランカ級護衛空母", "light_carrier", 7800, 19.0, [b("us_5in_38", 1, 0, 1, 1)], aa=2, carrier=True,
        note="商船の船体で装甲なし。艦尾の 5in/38 1門", radar=25000),
    "us-bb-iowa": ship("アイオワ級戦艦(アイオワ・ニュージャージー)", "battleship", 48110, 33.0,
        [b("us_16in_50", 9, 6, 9, 3), b("us_5in_38", 20, 4, 10, 4)], aa=8, belt=307, deck=150, turret=495, note=f"{TOD}", radar=30000, fc=30000),
    "us-ca-baltimore": ship("ボルチモア級重巡", "heavy_cruiser", 14500, 33.0,
        [b("us_8in_55", 9, 6, 9, 3), b("us_5in_38", 12, 4, 6, 4)], aa=4, belt=152, deck=64, turret=203, note=f"{TOD}", radar=30000, fc=30000),
    # ---- 米海軍(射撃用の電探 Mk8 を積んだ艦は、電探の反応だけの目標にも当たりやすい)----
    "us-bb-colorado": ship("コロラド級戦艦(ウェストバージニア・メリーランド)", "battleship", 32600, 21.0,
        [b("us_16in_45_mk5", 8, 4, 8, 4), b("us_5in_38", 16, 4, 8, 4)], aa=4, belt=343, deck=127, turret=457,
        note=f"ウェストバージニアは真珠湾の後に改装して Mk8 の射撃用電探と 5in/38 を積んだ。メリーランドは旧い Mk3。ここでは改装後でまとめた。{TOD}", radar=30000, fc=30000),
    "us-bb-tennessee": ship("テネシー級戦艦(テネシー・カリフォルニア)", "battleship", 32300, 20.6,
        [b("us_14in_50", 12, 6, 12, 6), b("us_5in_38", 16, 4, 8, 4)], aa=4, belt=343, deck=150, turret=457,
        note=f"真珠湾の後に大改装(甲板の装甲・5in/38・Mk8 の射撃用電探)。{TOD}", radar=30000, fc=30000),
    "us-bb-new-mexico": ship("ニューメキシコ級戦艦(ミシシッピ)", "battleship", 33400, 21.0,
        [b("us_14in_50", 12, 6, 12, 6), b("us_5in_25", 8, 2, 4, 2)], aa=4, belt=343, deck=120, turret=457,
        note=f"射撃用の電探は旧い Mk3(スリガオでは1斉射しか撃てなかった)。{TOD}", radar=25000, fc=18000, fc_hit=0.5),
    "us-bb-pennsylvania": ship("ペンシルベニア級戦艦(ペンシルベニア)", "battleship", 33100, 21.0,
        [b("us_14in_45", 12, 6, 12, 6), b("us_5in_38", 16, 4, 8, 4)], aa=4, belt=343, deck=110, turret=457,
        note=f"射撃用の電探は旧い Mk3(スリガオでは目標を捉えられず撃てなかった)。{TOD}", radar=25000, fc=18000, fc_hit=0.4),
    "us-cl-cleveland": ship("クリーブランド級軽巡(デンバー・コロンビア)", "light_cruiser", 11800, 32.5,
        [b("us_6in_47", 12, 6, 12, 6), b("us_5in_38", 12, 4, 6, 4)], aa=3, belt=127, deck=51, turret=165, note=f"{TOD}", radar=25000, fc=25000),
    "us-dd-fletcher-1944": ship("フレッチャー級駆逐艦(1944年)", "destroyer", 2050, 36.5,
        [b("us_5in_38", 5, 2, 5, 3), b("us_mk15_1944", 10, 0, 10, 0)], aa=1, note=f"Mk15 魚雷は不具合を直した後。{TOD}", radar=20000, fc=15000),
    # 魚雷艇は3隻の小隊を1つのユニットにした(1隻ずつでは数が多すぎる)。艦種は護衛艦の扱い
    "us-pt-section": ship("魚雷艇の小隊(PT ボート3隻)", "escort", 150, 40.0,
        [b("us_mk13_pt", 6, 6, 6, 0)], aa=1, note=f"PT ボート3隻(1隻に魚雷2〜4本)を1ユニットにまとめた。魚雷の数・耐久は {TOD}", radar=10000),
}

weapons = {"id": "pacific-ships-1944", "notes": "太平洋 1944年の艦砲(1門)・魚雷(1射線)。pacific-ships-1942 の後ろに重ねる。数値は仮置き(tools/packs/build_pacific_ships_1944.py)。", "weapons": WEAPONS}
toe = {"id": "pacific-ships-1944", "notes": "太平洋 1944年の艦級(日本・米)。pacific-ships-1942 の後ろに重ねる(1942年の武器を使う)。数値は仮置き(tools/packs/build_pacific_ships_1944.py)。", "toes": TOES}
# 日本の艦級に夜の見張りと探照灯(1942年のパックと同じ値)
for k, t in TOES.items():
    if k.startswith("jp-"):
        t["ship"]["nightLookout"] = 1.8
        t["ship"]["searchlightM"] = 7000 if t["ship"]["type"] != "destroyer" else 5000
(ROOT / "data/weapons/pacific-ships-1944.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/pacific-ships-1944.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote data/weapons/pacific-ships-1944.json, data/toe/pacific-ships-1944.json ({len(TOES)} classes)")
