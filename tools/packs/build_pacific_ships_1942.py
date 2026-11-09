#!/usr/bin/env python3
"""
太平洋 1942年の艦級(日本・米・豪)の武器と編成表を作る。艦は1隻ずつのユニット(編成表の ship)。

    python3 tools/packs/build_pacific_ships_1942.py

出力: data/weapons/pacific-ships-1942.json・data/toe/pacific-ships-1942.json
使い方:シナリオの packs に ["ww1-korea-generic", "naval-generic", "pacific-ships-1942"] と重ねる(対空機銃 naval_aa は汎用のもの)。

艦級の諸元(排水量・速力・装甲・砲の数と配置・発射管)は、出典候補の数字をもとにした。根拠と確かめの残りは
docs/research/pacific-ships-1942.md。出典候補:
- NavWeaps(navweaps.com)の各砲・魚雷の頁
- Campbell『Naval Weapons of World War Two』(1985)
- Lacroix & Wells『Japanese Cruisers of the Pacific War』(1997)、Jentschura ほか『Warships of the Imperial Japanese Navy 1869–1945』
- Friedman『U.S. Cruisers』『U.S. Destroyers』『U.S. Battleships』、Raven & Roberts『British Cruisers of World War Two』

ゲームの値への直し方(どれも仮置き):
- 耐久(浮力)= 60 ×(基準排水量 千トン)^0.85。駆逐艦 ≒110、重巡 ≒500、戦艦 ≒1200
- 砲の威力は1門あたり。汎用の艦砲(gun_8in など)を物差しにして、弾の重さと発射の速さで上下させた。貫通力は S2 で入れる
- 艦首・片舷・艦尾へ向けられる数は、砲塔・砲架の配置から数えた。舷側の砲廓・両舷の砲架は片舷に半分、艦首・艦尾は配置から
  TODO(要裏取り):砲廓砲・両舷の高角砲の艦首・艦尾への射界は、艦ごとの射界図で確かめる
- 魚雷は走る魚雷(雷速・射程・炸薬・信頼性 torpedoRun)。米の Mk15 は1942年の不発・深度の不具合で、当たって爆発するのは5割(仮置き)。
  日本の重巡・陽炎型・吹雪型は次発装填1回(艦ごとの有無は TODO(要裏取り))。TODO(要裏取り):Newpower『Iron Men and Tin Fish』
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KN = 30.87  # 1ノット(m/分)


def w(name, bands, armored=0.7, aa=0.0, ammo=0.0001, suppression=0.5, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": 1.0, "armored": armored}, "indirect": False, "ammoPerMin": ammo, "suppression": suppression, "antiAir": aa}
    d.update(extra)
    return d


def gun(rof, kg, belt, deck):
    """砲戦の諸元:1分あたりの発射の数(斉射の間隔から)・徹甲弾の重さ・距離(km)ごとの舷側と甲板を抜ける厚さ(mm)。
    TODO(要裏取り):NavWeaps の各砲の頁の貫通の表(ここの値は、その表の大まかな読み取り)"""
    return {
        "rofPerMin": rof,
        "shellKg": kg,
        "beltPenetration": [{"rangeM": int(r * 1000), "mm": mm} for r, mm in belt],
        "deckPenetration": [{"rangeM": int(r * 1000), "mm": mm} for r, mm in deck],
    }


NAVAL = {
    "jp_14in_45": gun(1.5, 673, [(5, 500), (10, 400), (15, 320), (20, 250), (25, 200), (30, 160)], [(5, 30), (10, 40), (15, 55), (20, 75), (25, 100), (30, 130)]),
    "us_16in_45": gun(1.2, 1225, [(5, 700), (10, 580), (15, 480), (20, 390), (25, 310), (30, 250)], [(5, 30), (10, 60), (15, 90), (20, 120), (25, 150), (30, 190)]),
    "jp_20cm_50": gun(2.0, 126, [(5, 280), (10, 200), (15, 145), (20, 105), (25, 80)], [(5, 15), (10, 25), (15, 38), (20, 55), (25, 75)]),
    "us_8in_55": gun(2.0, 118, [(5, 250), (10, 180), (15, 130), (20, 95), (25, 70)], [(5, 15), (10, 25), (15, 38), (20, 55), (25, 75)]),
    "uk_8in_50": gun(2.0, 116, [(5, 240), (10, 170), (15, 125), (20, 90), (25, 65)], [(5, 15), (10, 25), (15, 38), (20, 52), (25, 70)]),
    "us_6in_47": gun(6.0, 59, [(5, 170), (10, 115), (15, 80), (20, 55)], [(5, 10), (10, 20), (15, 35), (20, 50)]),
    "jp_15cm_50": gun(3.0, 45, [(5, 130), (10, 85), (15, 55), (20, 38)], [(5, 8), (10, 15), (15, 25), (20, 36)]),
    "jp_14cm_50": gun(4.0, 38, [(5, 110), (10, 70), (15, 45)], [(5, 8), (10, 14), (15, 22)]),
    "jp_127_50": gun(4.0, 23, [(5, 70), (10, 40), (15, 25)], [(5, 5), (10, 10), (15, 16)]),
    "jp_127_40": gun(5.0, 23, [(5, 60), (10, 35)], [(5, 5), (10, 10)]),
    "jp_12cm_45": gun(5.0, 20, [(5, 60), (10, 35)], [(5, 5), (10, 9)]),
    "us_5in_38": gun(6.0, 25, [(5, 80), (10, 50), (15, 30)], [(5, 5), (10, 11), (15, 18)]),
    "us_5in_25": gun(5.0, 25, [(5, 60), (10, 35)], [(5, 5), (10, 10)]),
    "uk_4in": gun(6.0, 14, [(5, 45), (9, 25)], [(5, 4), (9, 8)]),
    "jp_20cm_casemate": gun(1.5, 110, [(5, 250), (10, 180), (15, 130), (20, 95)], [(5, 14), (10, 23), (15, 35), (20, 50)]),
}

WEAPONS = {
    # 主砲(1門)
    "jp_14in_45": w("36cm/45 砲(金剛型・1門)", [(10000, 50), (20000, 44), (30000, 28), (35000, 12)], armored=1.0, ammo=0.0002),
    "us_16in_45": w("16in/45 砲(ノースカロライナ級・サウスダコタ級・1門)", [(10000, 70), (20000, 62), (30000, 40), (36000, 18)], armored=1.0, ammo=0.0003),
    "jp_20cm_50": w("20cm/50 砲(重巡・1門)", [(10000, 22), (20000, 18), (29000, 9)], ammo=0.0001),
    "us_8in_55": w("8in/55 砲(重巡・1門)", [(10000, 22), (20000, 18), (28000, 9)], ammo=0.0001),
    "uk_8in_50": w("8in/50 Mk VIII 砲(ケント級・1門)", [(10000, 20), (20000, 16), (27000, 8)], ammo=0.0001),
    "us_6in_47": w("6in/47 砲(ブルックリン級・1門。発射が速い)", [(8000, 16), (16000, 11), (23000, 5)], armored=0.45, ammo=0.0001),
    "jp_15cm_50": w("15cm/50 砲(金剛型の副砲・1門)", [(8000, 12), (16000, 8), (21000, 4)], armored=0.4, ammo=0.00008),
    "jp_14cm_50": w("14cm/50 砲(軽巡・1門)", [(8000, 10), (14000, 7), (19000, 3)], armored=0.35, ammo=0.00008),
    "jp_127_50": w("12.7cm/50 三年式砲(駆逐艦・1門)", [(6000, 7), (12000, 5), (18000, 2)], armored=0.25, ammo=0.00008),
    "jp_127_40": w("12.7cm/40 八九式高角砲(1門)", [(6000, 6), (12000, 4), (14000, 1)], armored=0.2, aa=1.0, ammo=0.00008),
    "jp_12cm_45": w("12cm/45 砲(1門)", [(6000, 5), (10000, 3), (16000, 1)], armored=0.2, aa=0.6, ammo=0.00006),
    "us_5in_38": w("5in/38 両用砲(1門)", [(6000, 8), (12000, 6), (16000, 2)], armored=0.25, aa=1.5, ammo=0.00008),
    "us_5in_25": w("5in/25 高角砲(1門)", [(6000, 6), (10000, 3), (13000, 1)], armored=0.2, aa=1.0, ammo=0.00006),
    "uk_4in": w("4in Mk V 高角砲(1門)", [(5000, 4), (9000, 2), (14000, 1)], armored=0.15, aa=0.8, ammo=0.00005),
    "jp_20cm_casemate": w("20cm/50 砲(空母の砲廓・1門)", [(10000, 18), (20000, 14), (24000, 6)], ammo=0.0001),
    # 魚雷(1射線)
    "jp_type93": w("九三式魚雷 61cm(1射線)", [(5000, 120), (12000, 100), (20000, 70)], armored=1.0, ammo=0.00025, torpedo=True),
    "jp_53cm": w("53cm 魚雷(旧式・1射線)", [(4000, 80), (7000, 50)], armored=1.0, ammo=0.0002, torpedo=True),
    "us_mk15": w("Mk15 魚雷 21in(1射線。1942年の不具合で威力6割)", [(4000, 54), (8000, 30), (13000, 12)], armored=1.0, ammo=0.00025, torpedo=True),
    "uk_21in": w("21in Mk VII 魚雷(1射線)", [(4000, 90), (9000, 50)], armored=1.0, ammo=0.00025, torpedo=True),
}

SUPPLY = {"ammoCapacityT": 50, "fuelCapacityT": 400, "fuelPerKmT": 0.3}


# 1門あたりの徹甲弾・榴弾(対地・対空の弾)の数。すべて仮置き。ソルトレイクシティ(ペンサコラ級、8in 10門)はコマンドルスキー諸島沖で徹甲弾806発を
# 撃ち尽くして榴弾26発を撃った(1門あたり徹甲弾 80発ほど。Wikipedia の写しの数字)。TODO(要裏取り):各艦の弾薬庫の定数は Friedman・Lacroix & Wells、
# ソルトレイクシティの数は Lorelli『The Battle of the Komandorski Islands』
SHELLS = {
    "jp_14in_45": (90, 40), "us_16in_45": (100, 30),
    "jp_20cm_50": (110, 40), "us_8in_55": (80, 40), "uk_8in_50": (100, 50), "jp_20cm_casemate": (100, 40),
    "us_6in_47": (150, 100), "jp_15cm_50": (120, 80), "jp_14cm_50": (120, 80),
    "jp_127_50": (150, 150), "jp_127_40": (50, 250), "jp_12cm_45": (100, 150),
    "us_5in_38": (150, 250), "us_5in_25": (50, 250), "uk_4in": (50, 200),
}


def b(weapon, guns, bow, beam, stern):
    d = {"weapon": weapon, "guns": guns, "bow": bow, "beam": beam, "stern": stern}
    if weapon in SHELLS:
        d["apPerGun"], d["hePerGun"] = SHELLS[weapon]
    return d


def ship(name, type_, disp, kn, batteries, aa, belt=0, deck=0, turret=0, carrier=False, note=None, radar=None, reloads=0, fc=None, night_lookout=None):
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
        t["fireControlRadar"] = {"rangeM": fc}
    if reloads:
        t["ship"]["torpedoReloads"] = reloads
    if night_lookout:
        t["ship"]["nightLookout"] = night_lookout
    if radar and not carrier:
        note = f"{note}。{RADAR_NOTE}" if note else RADAR_NOTE
    if note:
        t["notes"] = note
    return t


TOD = "TODO(要裏取り)"

# 日本海軍の夜の見張り:夜戦の訓練を重ねた専門の見張り員と大型の双眼鏡で、暗いときの目視の距離が米艦の 1.8 倍ほど
# (ガダルカナル沖の夜戦で、米艦の目視はほぼ 4.6km 以内、日本の見張りは 8〜10km で見つけた例が多い。サボ島沖では約16km でブルーを見た)。
# 数値は仮置き。TODO(要裏取り):出典候補は Evans & Peattie『Kaigun』、USN Night Combat in 1942、Hornfischer『Neptune's Inferno』
JP_NIGHT_LOOKOUT = 1.8

# 米艦の電探(1942年後半。サボ島沖の8月とガダルカナル沖の11月で艦ごとに違う)。日本の艦は1942年には電探なし(二号一型を積んだ艦は少ない)。
# 対水上の探知距離と射撃用の電探(Mk3・Mk4)の距離は仮置き。TODO(要裏取り):出典候補は Friedman『Naval Radar』、各艦の戦闘報告
RADAR_NOTE = f"電探(捜索用 SC・SG と射撃用 Mk3・Mk4)の有無と距離は1942年後半の仮置き。艦ごとの装備の時期は {TOD}:Friedman『Naval Radar』"

TOES = {
    # ---- 日本海軍 ----
    "jp-bb-kongo": ship("金剛型戦艦", "battleship", 32200, 30.3,
        [b("jp_14in_45", 8, 4, 8, 4), b("jp_15cm_50", 14, 4, 7, 2), b("jp_127_40", 8, 2, 4, 2)], aa=3, belt=203, deck=120, turret=229,
        note=f"1942年の比叡・霧島。副砲の数(14門→後に減らす)と甲板の装甲は {TOD}"),
    "jp-ca-myoko": ship("妙高型重巡", "heavy_cruiser", 13000, 33.9,
        [b("jp_20cm_50", 10, 6, 10, 4), b("jp_127_40", 8, 2, 4, 2), b("jp_type93", 16, 0, 8, 0)], aa=2, belt=102, deck=35, turret=25, reloads=1),
    "jp-ca-takao": ship("高雄型重巡(高雄・愛宕)", "heavy_cruiser", 13400, 34.2,
        [b("jp_20cm_50", 10, 6, 10, 4), b("jp_12cm_45", 4, 1, 2, 1), b("jp_type93", 16, 0, 8, 0)], aa=2, belt=102, deck=35, turret=25, reloads=1),
    "jp-ca-chokai": ship("高雄型重巡(鳥海・摩耶)", "heavy_cruiser", 13400, 34.2,
        [b("jp_20cm_50", 10, 6, 10, 4), b("jp_12cm_45", 4, 1, 2, 1), b("jp_type93", 8, 0, 4, 0)], aa=2, belt=102, deck=35, turret=25,
        note=f"発射管は連装4基のまま(高雄・愛宕は四連装に換装)。{TOD}", reloads=1),
    "jp-ca-furutaka": ship("古鷹型・青葉型重巡", "heavy_cruiser", 8700, 33.0,
        [b("jp_20cm_50", 6, 4, 6, 2), b("jp_12cm_45", 4, 1, 2, 1), b("jp_type93", 8, 0, 4, 0)], aa=1, belt=76, deck=32, turret=25,
        note=f"改装後(連装砲塔3基・四連装発射管2基)。{TOD}", reloads=1),
    "jp-ca-tone": ship("利根型重巡", "heavy_cruiser", 11213, 35.0,
        [b("jp_20cm_50", 8, 8, 8, 0), b("jp_127_40", 8, 2, 4, 2), b("jp_type93", 12, 0, 6, 0)], aa=2, belt=100, deck=35, turret=25,
        note=f"主砲塔4基はすべて前部(後部は水上機の甲板)。艦尾へは撃てない。艦首への射界は {TOD}", reloads=1),
    "jp-cl-tenryu": ship("天龍型軽巡", "light_cruiser", 3230, 33.0,
        [b("jp_14cm_50", 4, 2, 4, 2), b("jp_53cm", 6, 0, 6, 0)], aa=1, belt=51, deck=25,
        note=f"発射管は中心線の三連装2基(旧式の53cm)。砲の射界は {TOD}"),
    "jp-cl-yubari": ship("軽巡 夕張", "light_cruiser", 2890, 35.5,
        [b("jp_14cm_50", 6, 3, 6, 3), b("jp_type93", 4, 0, 4, 0)], aa=1, belt=38, deck=25,
        note=f"魚雷の型(九三式か八年式か)は {TOD}"),
    "jp-cl-5500t": ship("5500トン級軽巡(長良型・川内型)", "light_cruiser", 5170, 35.5,
        [b("jp_14cm_50", 7, 3, 6, 2), b("jp_type93", 8, 0, 4, 0)], aa=1, belt=64, deck=29,
        note=f"九三式への換装の時期は艦ごとに違う。砲の射界は {TOD}"),
    "jp-dd-kamikaze": ship("神風型駆逐艦", "destroyer", 1400, 37.25,
        [b("jp_12cm_45", 4, 1, 4, 2), b("jp_53cm", 6, 0, 6, 0)], aa=1, note=f"サボ島沖の夕凪。射界は {TOD}"),
    "jp-dd-fubuki": ship("吹雪型駆逐艦(特型)", "destroyer", 1750, 35.0,
        [b("jp_127_50", 6, 2, 6, 4), b("jp_type93", 9, 0, 9, 0)], aa=1, note=f"九三式への換装の有無は艦ごとに {TOD}", reloads=1),
    "jp-dd-kagero": ship("陽炎型駆逐艦", "destroyer", 2033, 35.0, [b("jp_127_50", 6, 2, 6, 4), b("jp_type93", 8, 0, 8, 0)], aa=1, reloads=1),
    "jp-cv-akagi": ship("空母 赤城", "carrier", 36500, 31.2,
        [b("jp_20cm_casemate", 6, 1, 3, 2), b("jp_12cm_45", 12, 3, 6, 3)], aa=4, belt=152, deck=79, carrier=True,
        note=f"砲廓の20cm砲の射界は {TOD}"),
    "jp-cv-kaga": ship("空母 加賀", "carrier", 38200, 28.3,
        [b("jp_20cm_casemate", 10, 2, 5, 3), b("jp_127_40", 16, 4, 8, 4)], aa=4, belt=152, deck=38, carrier=True),
    "jp-cv-soryu": ship("空母 蒼龍", "carrier", 15900, 34.5, [b("jp_127_40", 12, 4, 6, 4)], aa=4, belt=46, deck=25, carrier=True),
    "jp-cv-hiryu": ship("空母 飛龍", "carrier", 17300, 34.3, [b("jp_127_40", 12, 4, 6, 4)], aa=4, belt=90, deck=25, carrier=True,
        note=f"舷側の装甲(機関部と弾薬庫で違う)は {TOD}"),
    # ---- 米海軍 ----
    "us-bb-north-carolina": ship("ノースカロライナ級戦艦", "battleship", 35000, 28.0,
        [b("us_16in_45", 9, 6, 9, 3), b("us_5in_38", 20, 4, 10, 4)], aa=4, belt=305, deck=140, turret=406,
        note=f"甲板の装甲(主装甲甲板と上甲板の合計)は {TOD}", radar=30000, fc=30000),
    "us-bb-south-dakota": ship("サウスダコタ級戦艦", "battleship", 35000, 27.5,
        [b("us_16in_45", 9, 6, 9, 3), b("us_5in_38", 16, 4, 8, 4)], aa=4, belt=310, deck=146, turret=457, note=f"甲板の装甲は {TOD}", radar=30000, fc=30000),
    "us-ca-new-orleans": ship("ニューオーリンズ級重巡", "heavy_cruiser", 9950, 32.7,
        [b("us_8in_55", 9, 6, 9, 3), b("us_5in_25", 8, 2, 4, 2)], aa=2, belt=127, deck=57, turret=203, radar=18000, fc=20000),
    "us-ca-northampton": ship("ノーザンプトン級重巡", "heavy_cruiser", 9006, 32.7,
        [b("us_8in_55", 9, 6, 9, 3), b("us_5in_25", 8, 2, 4, 2)], aa=2, belt=76, deck=25, turret=63, note=f"甲板・砲塔の装甲は {TOD}", radar=18000, fc=20000),
    "us-ca-pensacola": ship("ペンサコラ級重巡", "heavy_cruiser", 9100, 32.5,
        [b("us_8in_55", 10, 5, 10, 5), b("us_5in_25", 8, 2, 4, 2)], aa=2, belt=76, deck=25, turret=63,
        note=f"主砲は三連装2基と連装2基(前後に5門ずつ)。高角砲の数と甲板の装甲は {TOD}", radar=18000, fc=20000),
    "us-ca-portland": ship("ポートランド級重巡", "heavy_cruiser", 10258, 32.7,
        [b("us_8in_55", 9, 6, 9, 3), b("us_5in_25", 8, 2, 4, 2)], aa=2, belt=102, deck=54, turret=63,
        note=f"舷側の装甲(弾薬庫 146mm・機関部 64mm ほど)を 102mm にまとめた。{TOD}", radar=18000, fc=20000),
    "us-cl-atlanta": ship("アトランタ級軽巡", "light_cruiser", 6000, 32.5,
        [b("us_5in_38", 16, 6, 14, 6), b("us_mk15", 8, 0, 4, 0)], aa=3, belt=95, deck=32, turret=32, radar=18000, fc=15000),
    "us-cl-brooklyn": ship("ブルックリン級軽巡(セントルイス型)", "light_cruiser", 9700, 32.5,
        [b("us_6in_47", 15, 9, 15, 6), b("us_5in_38", 8, 2, 4, 2)], aa=2, belt=127, deck=52, turret=165,
        note="ヘレナ・セントルイス(5in/38 の連装4基)", radar=25000, fc=20000),
    "us-dd-fletcher": ship("フレッチャー級駆逐艦", "destroyer", 2050, 36.5, [b("us_5in_38", 5, 2, 5, 3), b("us_mk15", 10, 0, 10, 0)], aa=1, radar=20000, fc=15000),
    "us-dd-benson": ship("ベンソン級・グリーブス級駆逐艦", "destroyer", 1620, 37.5, [b("us_5in_38", 4, 2, 4, 2), b("us_mk15", 10, 0, 10, 0)], aa=1,
        note=f"1942年の砲の数(4〜5門)・発射管(5〜10)は艦ごとに {TOD}", radar=12000),
    "us-dd-benham": ship("ベンハム級駆逐艦", "destroyer", 1637, 36.5, [b("us_5in_38", 4, 2, 4, 2), b("us_mk15", 16, 0, 8, 0)], aa=1, radar=12000),
    "us-dd-bagley": ship("バグレー級駆逐艦", "destroyer", 1500, 36.5, [b("us_5in_38", 4, 2, 4, 2), b("us_mk15", 16, 0, 8, 0)], aa=1, radar=12000),
    "us-dd-mahan": ship("マハン級駆逐艦", "destroyer", 1450, 36.5, [b("us_5in_38", 5, 2, 5, 3), b("us_mk15", 12, 0, 8, 0)], aa=1, radar=12000),
    "us-cv-yorktown": ship("ヨークタウン級空母", "carrier", 19800, 32.5, [b("us_5in_38", 8, 2, 4, 2)], aa=4, belt=102, deck=25, carrier=True,
        note=f"CXAM 電探(対水上の探知距離 30km は仮置き。{TOD}:CXAM の対水上の探知距離)", radar=30000),
    # ---- 豪州海軍 ----
    "au-ca-kent": ship("ケント級重巡(キャンベラ)", "heavy_cruiser", 9850, 31.5,
        [b("uk_8in_50", 8, 4, 8, 4), b("uk_4in", 4, 1, 2, 1), b("uk_21in", 8, 0, 4, 0)], aa=1, belt=25, deck=35, turret=25,
        note=f"キャンベラは舷側の装甲の追加を受けていない。発射管の有無は {TOD}"),
}

# 日本の艦級(空母を除く水上艦)に夜の見張りを付ける
for k, t in TOES.items():
    if k.startswith("jp-") and "ship" in t:
        t["ship"]["nightLookout"] = JP_NIGHT_LOOKOUT

for k, v in NAVAL.items():
    WEAPONS[k]["naval"] = v

# 走る魚雷:雷速(ノット)・その雷速での射程(m)・炸薬(kg)・当たって爆発する割合。TODO(要裏取り):NavWeaps の各魚雷の頁、Newpower『Iron Men and Tin Fish』
TORPEDO_RUN = {
    "jp_type93": (48, 20000, 490, 0.9),
    "jp_53cm": (38, 7000, 200, 0.85),
    "us_mk15": (33.5, 9100, 375, 0.5),
    "uk_21in": (33, 14600, 340, 0.85),
}
for k, (kn, rng_m, kg, rel) in TORPEDO_RUN.items():
    WEAPONS[k]["torpedoRun"] = {"speedMpm": round(kn * KN), "rangeM": rng_m, "warheadKg": kg, "reliability": rel}
# 酸素魚雷(九三式)は雷跡がほとんど見えない。0.3 は仮置き。TODO(要裏取り):Evans & Peattie『Kaigun』の酸素魚雷の雷跡
WEAPONS["jp_type93"]["torpedoRun"]["wakeVisibility"] = 0.3

weapons = {"id": "pacific-ships-1942", "notes": "太平洋 1942年の艦砲(1門)・魚雷(1射線)。数値は仮置き(tools/packs/build_pacific_ships_1942.py、根拠は docs/research/pacific-ships-1942.md)。", "weapons": WEAPONS}
toe = {"id": "pacific-ships-1942", "notes": "太平洋 1942年の艦級(日本・米・豪)。1隻ずつのユニット(編成表の ship)。対空機銃は汎用の naval_aa(naval-generic を先に重ねる)。数値は仮置き(tools/packs/build_pacific_ships_1942.py、根拠は docs/research/pacific-ships-1942.md)。", "toes": TOES}

(ROOT / "data/weapons/pacific-ships-1942.json").write_text(json.dumps(weapons, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / "data/toe/pacific-ships-1942.json").write_text(json.dumps(toe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote data/weapons/pacific-ships-1942.json, data/toe/pacific-ships-1942.json ({len(TOES)} classes)")
