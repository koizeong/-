#!/usr/bin/env python3
"""
大西洋・北海 1940〜41年の艦級(ドイツ・イギリス・ノルウェー)の武器と編成表を作る。太平洋1942年のパック(pacific-ships-1942)の後ろに重ねて使う
(英の 14in・15in・8in・6in・4.7in・4in の砲と 21in 魚雷はそちらのものを使う)。

    python3 tools/packs/build_atlantic_ships_1941.py

出力: data/weapons/atlantic-ships-1941.json・data/toe/atlantic-ships-1941.json
使い方:シナリオの packs に ["ww1-korea-generic", "naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"] と重ねる。

ヴェーザー演習作戦(1940年4〜6月、ノルウェー)とデンマーク海峡海戦(1941年5月24日)のための艦級。
基準排水量・速力・主砲の数と配置・発射管の数は、一般に知られた値の概数。装甲・電探・射撃の速さ・貫通・弾数は大づかみの仮置き。
TODO(要裏取り):出典候補は Garzke & Dulin『Battleship Bismarck: A Design and Operational History』、Whitley『German Capital Ships of World War Two』
『German Cruisers of World War Two』『Destroyers of World War Two』、Raven & Roberts『British Battleships of World War Two』、
Roberts『The Battlecruiser Hood』、NavWeaps の各砲・魚雷の頁、Haarr『The German Invasion of Norway』『The Battle for Norway』。
ゲームの値への直し方は 1942年のパック(tools/packs/build_pacific_ships_1942.py)と同じ。
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


# 艦砲の砲戦の諸元(1分あたりの発射・徹甲弾の重さ kg・距離(km)ごとの舷側と甲板を抜ける厚さ mm)。
# 弾の重さと最大射程は一般に知られた値、発射の速さ(実際の斉射の間隔からの値)と貫通は概数。TODO(要裏取り):NavWeaps の各砲の頁
NAVAL = {
    # ---- ドイツ ----
    "de_38cm_52": gun(2.3, 800, [(5, 600), (10, 510), (15, 420), (20, 350), (25, 290), (30, 240), (35, 200)], [(5, 25), (10, 45), (15, 70), (20, 95), (25, 125), (30, 155), (35, 185)]),
    "de_28cm_54": gun(3.0, 330, [(5, 450), (10, 370), (15, 300), (20, 245), (25, 200), (30, 165)], [(5, 15), (10, 30), (15, 45), (20, 65), (25, 85), (30, 110)]),
    "de_28cm_52": gun(2.5, 300, [(5, 420), (10, 340), (15, 275), (20, 225), (25, 180), (30, 145)], [(5, 15), (10, 28), (15, 42), (20, 60), (25, 80), (30, 100)]),
    "de_203_60": gun(3.5, 122, [(5, 290), (10, 210), (15, 155), (20, 115), (25, 88), (30, 68)], [(5, 12), (10, 22), (15, 36), (20, 52), (25, 70), (30, 90)]),
    "de_15cm_55": gun(5.0, 45, [(5, 130), (10, 85), (15, 58), (20, 40)], [(5, 8), (10, 16), (15, 26), (20, 38)]),
    "de_15cm_60": gun(5.0, 45, [(5, 135), (10, 90), (15, 60), (20, 42)], [(5, 8), (10, 16), (15, 26), (20, 38)]),
    "de_127_45": gun(6.0, 28, [(5, 75), (10, 45), (15, 27)], [(5, 5), (10, 10), (15, 16)]),
    "de_105_65": gun(8.0, 15, [(5, 55), (10, 30), (15, 18)], [(5, 4), (10, 8), (15, 12)]),
    # ---- イギリス(ネルソン級)・ノルウェー(海防戦艦) ----
    "uk_16in_45": gun(1.3, 929, [(5, 560), (10, 470), (15, 385), (20, 310), (25, 250), (30, 200)], [(5, 30), (10, 48), (15, 68), (20, 92), (25, 120), (30, 150)]),
    "no_21cm_44": gun(2.0, 140, [(5, 230), (10, 150), (15, 100)], [(5, 10), (10, 20), (15, 32)]),
    "no_15cm_46": gun(4.0, 45, [(5, 110), (10, 70), (15, 45)], [(5, 7), (10, 14), (15, 22)]),
}

WEAPONS = {
    "de_38cm_52": w("38cm SK C/34 砲(ビスマルク級・1門)", [(10000, 60), (20000, 52), (30000, 34), (36500, 14)], armored=1.0, ammo=0.0003),
    "de_28cm_54": w("28cm SK C/34 砲(シャルンホルスト級・1門)", [(10000, 38), (20000, 32), (30000, 20), (40000, 8)], armored=1.0, ammo=0.0002),
    "de_28cm_52": w("28cm SK C/28 砲(ドイッチュラント級・1門)", [(10000, 36), (20000, 30), (30000, 18), (36000, 7)], armored=1.0, ammo=0.0002),
    "de_203_60": w("20.3cm SK C/34 砲(アドミラル・ヒッパー級・1門)", [(10000, 22), (20000, 18), (30000, 9), (33500, 4)], ammo=0.0001),
    "de_15cm_55": w("15cm SK C/28 砲(戦艦・装甲艦の副砲・1門)", [(8000, 14), (16000, 10), (23000, 5)], armored=0.45, ammo=0.0001),
    "de_15cm_60": w("15cm SK C/25 砲(ケーニヒスベルク級・1門)", [(8000, 14), (16000, 10), (25000, 5)], armored=0.45, ammo=0.0001),
    "de_127_45": w("12.7cm SK C/34 砲(駆逐艦・1門)", [(6000, 8), (12000, 5), (17000, 2)], armored=0.25, ammo=0.00008),
    "de_105_65": w("10.5cm SK C/33 高角砲(1門)", [(6000, 5), (12000, 3), (17000, 1)], armored=0.2, aa=1.5, ammo=0.00008),
    "de_g7a": w("G7a 魚雷 53.3cm(1射線)", [(3000, 90), (7000, 45)], armored=1.0, ammo=0.00025, torpedo=True),
    "uk_16in_45": w("16in/45 Mk I 砲(ネルソン級・1門)", [(10000, 60), (20000, 52), (30000, 32), (35000, 12)], armored=1.0, ammo=0.0002),
    "no_21cm_44": w("21cm/44 砲(ノルウェーの海防戦艦・1門)", [(8000, 22), (14000, 14), (19000, 6)], armored=0.8, ammo=0.0001),
    "no_15cm_46": w("15cm/46 砲(ノルウェーの海防戦艦の副砲・1門)", [(8000, 12), (14000, 7)], armored=0.4, ammo=0.0001),
}
for k, v in NAVAL.items():
    WEAPONS[k]["naval"] = v

# 走る魚雷:雷速(ノット)・その雷速での射程(m)・炸薬(kg)・当たって爆発する割合。
# 1940年のノルウェー沖では、ドイツの魚雷の深度の狂いと磁気信管の不具合(魚雷の危機)で、不発・早発が多かった。0.5 は仮置き。
# 1941年(信管を直した後)は TODO(要裏取り):出典候補は Rössler『The U-Boat』、Haarr『The Battle for Norway』
TORPEDO_RUN = {
    "de_g7a": (40, 7500, 280, 0.5),
}
for k, (kn, rng_m, kg, rel) in TORPEDO_RUN.items():
    WEAPONS[k]["torpedoRun"] = {"speedMpm": round(kn * KN), "rangeM": rng_m, "warheadKg": kg, "reliability": rel}

SUPPLY = {"ammoCapacityT": 50, "fuelCapacityT": 400, "fuelPerKmT": 0.3}
# 1門あたりの徹甲弾・榴弾(大づかみ。TODO(要裏取り))
SHELLS = {
    "de_38cm_52": (110, 40), "de_28cm_54": (120, 60), "de_28cm_52": (110, 60), "de_203_60": (120, 60), "de_15cm_55": (100, 100), "de_15cm_60": (120, 80),
    "de_127_45": (120, 120), "de_105_65": (50, 300), "uk_16in_45": (100, 40), "no_21cm_44": (60, 40), "no_15cm_46": (80, 80),
}


def b(weapon, guns, bow, beam, stern, mounts=None):
    d = {"weapon": weapon, "guns": guns, "bow": bow, "beam": beam, "stern": stern}
    if mounts:
        d["mounts"] = mounts
    if weapon in SHELLS:
        d["apPerGun"], d["hePerGun"] = SHELLS[weapon]
    return d


def ship(name, type_, disp, kn, batteries, aa, belt=0, deck=0, turret=0, note=None, radar=None, fc=None, fc_hit=None, carrier=False, floatplanes=None, reloads=0, nation=None):
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
    if floatplanes:
        t["ship"]["floatplanes"] = {"toe": floatplanes}
    if reloads:
        t["ship"]["torpedoReloads"] = reloads
    if note:
        t["notes"] = note
    return t


TOES = {
    # ---- ドイツ海軍 ----
    # ビスマルク:38cm 連装4基(前2・後2)、15cm 連装6基(両舷3基ずつ)、10.5cm 連装8基。FuMO 23 の電探(見張りと測距)。アラド Ar 196 を4機
    "de-bb-bismarck": ship("ビスマルク級戦艦(ビスマルク)", "battleship", 41700, 30.0,
        [b("de_38cm_52", 8, 4, 8, 4, mounts=4), b("de_15cm_55", 12, 4, 6, 4, mounts=6), b("de_105_65", 16, 4, 8, 4, mounts=8)], aa=6, belt=320, deck=100, turret=360,
        note=f"甲板は主甲板と装甲甲板の合計の概数、電探の距離と射撃用の電探の効きは {TOD}", radar=25000, fc=22000, floatplanes="fp-de-4"),
    # シャルンホルスト・グナイゼナウ:28cm 三連装3基(前2・後1)、15cm 連装4基・単装4基、10.5cm 連装7基、53.3cm 三連装2基(1941年に追加)
    "de-bb-scharnhorst": ship("シャルンホルスト級戦艦(シャルンホルスト・グナイゼナウ)", "battleship", 32100, 31.0,
        [b("de_28cm_54", 9, 6, 9, 3, mounts=3), b("de_15cm_55", 12, 4, 6, 4, mounts=8), b("de_105_65", 14, 4, 7, 4, mounts=7)], aa=5, belt=350, deck=95, turret=360,
        note=f"1940年4月(ヴェーザー演習作戦)の姿。発射管は1941年の追加のため入れていない。{TOD}", radar=20000, fc=18000, floatplanes="fp-de-3"),
    # アドミラル・ヒッパー級(ヒッパー・ブリュッヒャー・プリンツ・オイゲン):20.3cm 連装4基(前2・後2)、10.5cm 連装6基、53.3cm 三連装4基
    "de-ca-hipper": ship("アドミラル・ヒッパー級重巡(ヒッパー・ブリュッヒャー・プリンツ・オイゲン)", "heavy_cruiser", 14250, 32.0,
        [b("de_203_60", 8, 4, 8, 4, mounts=4), b("de_105_65", 12, 4, 6, 4, mounts=6), b("de_g7a", 12, 0, 6, 0, mounts=4)], aa=4, belt=80, deck=30, turret=160,
        note=f"プリンツ・オイゲンは排水量がやや大きい(同じ艦級にまとめた)。{TOD}", radar=22000, fc=20000, floatplanes="fp-de-3"),
    # ドイッチュラント級装甲艦(リュッツォウ=もとドイッチュラント・アドミラル・シェーア):28cm 三連装2基(前1・後1)、15cm 単装8基、53.3cm 四連装2基
    "de-ca-deutschland": ship("ドイッチュラント級装甲艦(リュッツォウ・アドミラル・シェーア)", "heavy_cruiser", 11700, 28.0,
        [b("de_28cm_52", 6, 3, 6, 3, mounts=2), b("de_15cm_55", 8, 2, 4, 2, mounts=8), b("de_g7a", 8, 0, 4, 0, mounts=2)], aa=3, belt=80, deck=45, turret=140,
        note=f"巡洋艦の艦種として扱う(装甲艦・ポケット戦艦)。ディーゼルで航続が長い。{TOD}", radar=18000, floatplanes="fp-de-2"),
    # ケーニヒスベルク級軽巡(ケーニヒスベルク・カールスルーエ・ケルン):15cm 三連装3基(前1・後2)、53.3cm 三連装4基
    "de-cl-koenigsberg": ship("ケーニヒスベルク級軽巡(ケーニヒスベルク・カールスルーエ・ケルン)", "light_cruiser", 6650, 32.0,
        [b("de_15cm_60", 9, 3, 9, 6, mounts=3), b("de_g7a", 12, 0, 6, 0, mounts=4)], aa=2, belt=50, deck=20, turret=30,
        note=f"{TOD}", floatplanes="fp-de-1"),
    # 1934・1934A 型駆逐艦(Z1〜Z16):12.7cm 単装5基、53.3cm 四連装2基
    "de-dd-1934": ship("1934・1934A 型駆逐艦(Z1〜Z16)", "destroyer", 2200, 36.0,
        [b("de_127_45", 5, 2, 5, 3, mounts=5), b("de_g7a", 8, 0, 8, 0, mounts=2)], aa=1,
        note=f"機関の故障が多く、実際の速力は落ちることがあった。{TOD}"),
    # 1936 型駆逐艦(Z17〜Z22。ナルヴィクの駆逐艦):12.7cm 単装5基、53.3cm 四連装2基
    "de-dd-1936": ship("1936 型駆逐艦(Z17〜Z22)", "destroyer", 2400, 36.0,
        [b("de_127_45", 5, 2, 5, 3, mounts=5), b("de_g7a", 8, 0, 8, 0, mounts=2)], aa=1, note=f"{TOD}"),
    # ---- イギリス海軍(1942年のパックの英の砲・魚雷を使う) ----
    # フッド:15in 連装4基(前2・後2)、4in 連装7基、21in 発射管4門。1941年に Type 284 の射撃用の電探(要約)
    "uk-bc-hood": ship("巡洋戦艦 フッド", "battlecruiser", 42670, 29.0,
        [b("uk_15in_42", 8, 4, 8, 4, mounts=4), b("uk_4in", 14, 4, 7, 4, mounts=7), b("uk_21in", 4, 0, 2, 0)], aa=4, belt=305, deck=76, turret=381,
        note=f"甲板の装甲が薄い(遠い砲戦で落ちてくる弾に弱い)。1941年の速力(船体が重くなって落ちた)と電探は {TOD}", fc=20000),
    # キング・ジョージ5世級(プリンス・オブ・ウェールズ・キング・ジョージ5世)は 1942年のパックの uk-bb-kgv を使う
    # ネルソン級(ネルソン・ロドネー):16in 三連装3基(すべて前)、6in 連装6基、4.7in 高角砲6門
    "uk-bb-nelson": ship("ネルソン級戦艦(ネルソン・ロドネー)", "battleship", 33300, 23.0,
        [b("uk_16in_45", 9, 9, 9, 0, mounts=3), b("uk_6in_50", 12, 4, 6, 4, mounts=6), b("uk_47in_45", 6, 2, 3, 2)], aa=3, belt=356, deck=160, turret=406,
        note=f"主砲はすべて艦橋の前(艦尾へは撃てない)。{TOD}", fc=20000),
    # クイーン・エリザベス級(ウォースパイト。改装後):15in 連装4基(前2・後2)、6in 単装8門、4in 連装4基。第2次ナルヴィク海戦
    "uk-bb-qe": ship("クイーン・エリザベス級戦艦(ウォースパイト)", "battleship", 31300, 23.5,
        [b("uk_15in_42", 8, 4, 8, 4, mounts=4), b("uk_6in_50", 8, 2, 4, 2, mounts=8), b("uk_4in", 8, 2, 4, 2, mounts=4)], aa=3, belt=330, deck=102, turret=330,
        note=f"副砲は 6in/45 だが 6in/50 で代える。艦載機(ソードフィッシュ)は戦隊の航空隊として置く。{TOD}", floatplanes="fp-uk-1"),
    # カウンティ級重巡(ケント・ロンドン・ノーフォーク級。サフォーク・ノーフォークはデンマーク海峡でビスマルクを触接)
    "uk-ca-county": ship("カウンティ級重巡(サフォーク・ノーフォーク ほか)", "heavy_cruiser", 9900, 31.5,
        [b("uk_8in_50", 8, 4, 8, 4, mounts=4), b("uk_4in", 8, 2, 4, 2, mounts=4), b("uk_21in", 8, 0, 4, 0)], aa=2, belt=114, deck=37, turret=25,
        note=f"艦級ごとの装甲の違いは1つにまとめた。サフォークの Type 284・ノーフォークの Type 286 の電探は {TOD}", radar=12000, floatplanes="fp-uk-1"),
    # タウン級軽巡(サウサンプトン・グラスゴー・シェフィールド ほか):6in 三連装4基
    "uk-cl-town": ship("タウン級軽巡(シェフィールド・グラスゴー ほか)", "light_cruiser", 9100, 32.0,
        [b("uk_6in_50", 12, 6, 12, 6, mounts=4), b("uk_4in", 8, 2, 4, 2, mounts=4), b("uk_21in", 6, 0, 3, 0)], aa=2, belt=114, deck=32, turret=25,
        note=f"主砲は 6in/50 Mk XXIII(1942年のパックと同じ砲)。シェフィールドは早くから Type 79 の電探を積んだ。{TOD}", radar=15000, floatplanes="fp-uk-2"),
    # トライバル級駆逐艦:4.7in 連装4基、21in 四連装1基
    "uk-dd-tribal": ship("トライバル級駆逐艦", "destroyer", 1870, 36.0,
        [b("uk_47in_45", 8, 4, 8, 4, mounts=4), b("uk_21in", 4, 0, 4, 0)], aa=1, note=f"{TOD}"),
    # G・H 級駆逐艦(ハーディ・ハヴォック ほか。第1次ナルヴィク海戦):4.7in 単装4基、21in 四連装2基
    "uk-dd-gh": ship("G・H 級駆逐艦(ハーディ・ハヴォック ほか)", "destroyer", 1340, 36.0,
        [b("uk_47in_45", 4, 2, 4, 2, mounts=4), b("uk_21in", 8, 0, 8, 0)], aa=1, note=f"{TOD}"),
    # 空母 グローリアス(カレイジャス級):4.7in 高角砲16門。1940年6月8日にシャルンホルスト・グナイゼナウに沈められた
    "uk-cv-glorious": ship("空母 グローリアス", "carrier", 22500, 30.0, [b("uk_47in_45", 16, 4, 8, 4)], aa=3, belt=76, deck=25, carrier=True,
        note=f"艦載機はシーグラディエーター・ソードフィッシュ・ハリケーン(撤退の便で積んだ)。{TOD}"),
    # 空母 アーク・ロイヤル:4.5in 連装8基
    "uk-cv-arkroyal": ship("空母 アーク・ロイヤル", "carrier", 22000, 30.0, [b("uk_47in_45", 16, 4, 8, 4)], aa=4, belt=114, deck=76, carrier=True,
        note=f"高角砲は 4.5in だが 4.7in/45 で代える。{TOD}"),
    # ---- ノルウェー海軍 ----
    # 海防戦艦 ノルゲ・エイズヴォル(ナルヴィクでドイツの駆逐艦に沈められた):21cm 単装2基(前1・後1)、15cm 単装6基
    "no-cd-norge": ship("海防戦艦 ノルゲ級(ノルゲ・エイズヴォル)", "battleship", 4166, 16.5,
        [b("no_21cm_44", 2, 1, 2, 1, mounts=2), b("no_15cm_46", 6, 2, 3, 2, mounts=6)], aa=1, belt=152, deck=0, turret=203,
        note=f"艦種は戦艦の欄に入れる(海防戦艦。地図の印は CD)。1900年ごろの旧式で、射撃指揮は古い。{TOD}"),
}
TOES["no-cd-norge"]["ship"]["abbr"] = "CD"
TOES["no-cd-norge"]["ship"]["fireControl"] = 0.6

# ---- 艦載の水上偵察機(ドイツはアラド Ar 196、英はウォーラス・ソードフィッシュの水上機)。機の性能はゲームの仮置き ----
# TODO(要裏取り):出典候補は Green『Warplanes of the Third Reich』、Thetford『British Naval Aircraft since 1912』
def floatplane(name, n, speed, radius, nation):
    return {
        "name": f"{name}({n}機)", "branch": "air_group", "armorRatio": 0, "frontageM": 0,
        "supply": {"ammoCapacityT": 1, "fuelCapacityT": 0, "fuelPerKmT": 0},
        "air": {"role": "scout", "speedMpm": speed, "radiusM": radius, "visionM": 40000},
        "elements": [{"name": "機", "count": n, "hitPoints": 2, "weapons": [{"weapon": "gunner_mg", "count": 1}]}],
        "symbol": {"echelon": "company", "modifiers": []},
        "nation": nation,
    }


for n in (1, 2, 3, 4):
    TOES[f"fp-de-{n}"] = floatplane("艦載の水上偵察機(アラド Ar 196)", n, 4200, 400000, "de")
for n in (1, 2):
    TOES[f"fp-uk-{n}"] = floatplane("艦載の水上偵察機(ウォーラス)", n, 2700, 250000, "uk")

NATION = {"de": "de", "uk": "uk", "no": "no"}
for k, t in TOES.items():
    t.setdefault("nation", NATION[k.split("-")[0]] if not k.startswith("fp-") else t.get("nation"))

weapons = {"id": "atlantic-ships-1941", "notes": "大西洋・北海 1940〜41年の艦砲・魚雷(ドイツ・イギリスのネルソン級・ノルウェー)。数値は仮置き(tools/packs/build_atlantic_ships_1941.py)。", "weapons": WEAPONS}
toe = {"id": "atlantic-ships-1941", "notes": "大西洋・北海 1940〜41年の艦級(ドイツ・イギリス・ノルウェー)。pacific-ships-1942 の後ろに重ねる。数値は仮置き(tools/packs/build_atlantic_ships_1941.py)。", "toes": TOES}
(ROOT / "data/weapons/atlantic-ships-1941.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/atlantic-ships-1941.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote data/weapons/atlantic-ships-1941.json, data/toe/atlantic-ships-1941.json ({sum(1 for t in TOES.values() if 'ship' in t)} classes)")
