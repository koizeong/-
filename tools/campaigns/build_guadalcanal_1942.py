#!/usr/bin/env python3
"""
ガダルカナル島の戦い(1942年8月7日〜1943年2月9日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_guadalcanal_1942.py

出力: data/campaigns/guadalcanal-1942.json

基地航空隊と艦隊が主役の作戦(ユーザー判断 2026-11)。米は8月7日にルンガ岬に上がって飛行場(ヘンダーソン飛行場)を押さえ、
カクタス航空隊を置く。日本はラバウル(第11航空艦隊)から約1000km を飛び、夜の駆逐艦輸送(東京急行)で兵を送り込み、
戦艦の艦砲射撃で飛行場を叩き、空母を出して争う。1段階は7日、27段階。
根拠と残りの裏取りは docs/research/guadalcanal-1942-campaign.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。
師団・連隊の着いた日は要約の日付、隷下の大隊の数・練度・艦隊の顔ぶれの多くは仮置き(TODO(要裏取り))。
部隊の単位は大隊(米海兵大隊・日本の歩兵大隊)。陸の戦術の戦闘は生成器の編成 1942-guadalcanal(ジャングル)。
"""

import json
import sys
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/guadalcanal-1942.json"

START = date(1942, 8, 7)
DAYS_PER_STAGE = 7
END = date(1943, 2, 9)
TOD = "TODO(要裏取り)"


def stage_of(d: date) -> int:
    """その日が入る段階(1始まり)"""
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度(南緯は負)から、作戦地図の上のおおよその km(x は東、y は北。1度≒111km)"""
    return round((lon - 150.0) * 111, 1), round((lat + 20.0) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地、港
# ガダルカナル島の地域は戦いの舞台の地名(位置は地図帳の値を丸めたもの。島の中の位置は表示が重ならないよう少しずらした)
REGIONS = [
    ("lunga", "ルンガ岬(ヘンダーソン飛行場)", -9.43, 160.05, "jungle", None, "us", True, False),
    ("koli", "コリ岬・テナル川", -9.40, 160.22, "jungle", None, None, False, False),
    ("taivu", "タイボ岬", -9.30, 160.42, "jungle", None, None, False, False),
    ("austen", "アウステン山・ムカデ高地", -9.58, 160.02, "jungle", None, None, False, False),
    ("matanikau", "マタニカウ川", -9.43, 159.90, "jungle", None, "jp", False, False),
    ("kokumbona", "コクンボナ", -9.38, 159.75, "jungle", None, "jp", False, False),
    ("esperance", "エスペランス岬・カミンボ", -9.25, 159.58, "jungle", None, "jp", False, False),
    ("tulagi", "ツラギ", -9.08, 160.15, "jungle", None, "us", False, True),
    # 島の外の基地。補給の源で港
    ("rabaul", "ラバウル", -4.20, 152.20, "jungle", "jp", "jp", True, True),
    ("shortland", "ショートランド・ブイン", -6.85, 155.75, "jungle", "jp", "jp", True, True),
    ("espiritu", "エスピリトゥサント", -15.50, 167.20, "jungle", "us", "us", True, True),
]

# 海域(艦隊だけが入れる)。位置は表示のためのおおよその値
SEAS = [
    ("sea-ironbottom", "鉄底海峡(サボ島・ルンガ沖)", -9.10, 159.90, None),
    ("sea-slot", "スロット(ニュージョージア海峡)", -8.10, 158.30, "jp"),
    ("sea-bougainville", "ブーゲンビル沖・ショートランド泊地", -6.60, 156.00, "jp"),
    ("sea-rabaul", "ソロモン海北部(ラバウル沖)", -5.30, 153.60, "jp"),
    ("sea-east", "ソロモン東方(スチュワート諸島沖)", -7.80, 162.60, None),
    ("sea-indispensable", "インディスペンサブル海峡", -9.90, 160.90, "us"),
    ("sea-santacruz", "サンタクルーズ諸島沖", -10.60, 165.00, "us"),
    ("sea-coral", "珊瑚海(エスピリトゥサント沖)", -13.80, 163.40, "us"),
]
SEA_LINKS = [
    # 海と陸(艦隊が面する地域。港・艦砲射撃・上陸)
    ("sea-ironbottom", "lunga"), ("sea-ironbottom", "koli"), ("sea-ironbottom", "taivu"), ("sea-ironbottom", "matanikau"),
    ("sea-ironbottom", "kokumbona"), ("sea-ironbottom", "esperance"), ("sea-ironbottom", "tulagi"),
    ("sea-bougainville", "shortland"), ("sea-rabaul", "rabaul"), ("sea-coral", "espiritu"), ("sea-indispensable", "taivu"),
    # 海と海
    ("sea-ironbottom", "sea-slot"), ("sea-ironbottom", "sea-indispensable"), ("sea-slot", "sea-bougainville"), ("sea-bougainville", "sea-rabaul"),
    ("sea-bougainville", "sea-east"), ("sea-east", "sea-indispensable"), ("sea-east", "sea-santacruz"), ("sea-indispensable", "sea-coral"),
    ("sea-santacruz", "sea-coral"),
]
# ガダルカナル島の中の結び(海岸沿いの小道と、川口支隊が通ったジャングルの道)。{TOD}:道の名前とつながり
LINKS = [
    ("esperance", "kokumbona", "track"),
    ("kokumbona", "matanikau", "track"),
    ("matanikau", "lunga", "road"),
    ("lunga", "koli", "road"),
    ("koli", "taivu", "track"),
    ("lunga", "austen", "track"),
    ("austen", "matanikau", "track"),
    ("austen", "koli", "track"),
]


def unit(uid: str, toe: str, training: str | None = None, strength: float | None = None, **extra):
    u = L([("id", uid), ("toe", toe)])
    if training:
        u["training"] = training
    if strength:
        u["strength"] = strength
    u.update(extra)
    return u


def formation(fid: str, side: str, name: str, region: str, units: list, arrive: date | None = None, **extra):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    f["units"] = units
    return f


def marines(fid: str, name: str, region: str, battalions: int, artillery: int = 0, arrive: date | None = None, training: str | None = None, toe: str = "usmc_infantry_battalion_1942", **extra):
    """米の連隊・師団:大隊(陸軍の連隊も海兵大隊の編成表で代える。{TOD}:米陸軍1942年の歩兵大隊の編成表)と 75mm 榴弾砲の大隊"""
    us = [unit(f"{fid}-{i + 1}", toe, training) for i in range(battalions)]
    us += [unit(f"{fid}-art{i + 1}", "usmc_pack_howitzer_battalion", training) for i in range(artillery)]
    return formation(fid, "us", name, region, us, arrive, **extra)


def japanese(fid: str, name: str, region: str, battalions: int, artillery: int = 0, arrive: date | None = None, training: str | None = "veteran", light: bool = True, **extra):
    """日本の支隊・師団:歩兵大隊(東京急行で運べた軽装の大隊)と砲兵大隊"""
    toe = "jp_infantry_battalion_1942_light" if light else "jp_infantry_battalion_1941"
    us = [unit(f"{fid}-{i + 1}", toe, training) for i in range(battalions)]
    us += [unit(f"{fid}-art{i + 1}", "artillery_battalion", training) for i in range(artillery)]
    return formation(fid, "jp", name, region, us, arrive, **extra)


def fleet(fid: str, side: str, name: str, region: str, ships: list, air: list | None = None, arrive: date | None = None, training: str | None = None):
    """艦隊:艦は1隻ずつ(id の末尾・艦級・戦隊の名前)。air は母艦に載せる航空隊(id の末尾・編成表・母艦の id の末尾)"""
    us = [unit(f"{fid}-{sid}", toe, training, squadron=sq) for sid, toe, sq in ships]
    us += [unit(f"{fid}-{sid}", toe, training, base=f"{fid}-{cv}") for sid, toe, cv in (air or [])]
    return formation(fid, side, name, region, us, arrive)


def carrier_air(cv: str, side: str) -> list:
    """母艦1隻の航空隊(ミッドウェーの機種の編成表で代える)。{TOD}:各艦の8月・10月の機数(Lundstrom『The First Team and the Guadalcanal Campaign』)"""
    if side == "jp":
        return [(f"{cv}-vf", "mw-a6m-18", cv), (f"{cv}-vb", "mw-d3a-18", cv), (f"{cv}-vt", "mw-b5n-18", cv)]
    # 米の雷撃機は8月には TBF アヴェンジャーに替わっていたが、機種の編成表がないので TBD で代える({TOD})
    return [(f"{cv}-vf", "mw-f4f-27", cv), (f"{cv}-vb", "mw-sbd-18", cv), (f"{cv}-vt", "mw-tbd-13", cv)]


FORMATIONS = [
    # ===== 米軍(陸)=====
    # 第1海兵師団:8月7日にルンガ岬(第1・第5海兵連隊)とツラギ(第1突撃大隊・第1落下傘大隊・第5海兵連隊第2大隊)に上がった。
    # 大隊の数は連隊3個大隊 × 2 と第11海兵連隊(砲兵)の一部。{TOD}:上陸時の兵力(約1万1千)の内訳
    marines("us-1mar", "第1海兵師団(ルンガ)", "lunga", 6, artillery=2),
    marines("us-tulagi", "ツラギの海兵部隊", "tulagi", 2, training="veteran"),
    # 増援:第7海兵連隊 9月18日(4,157人)、第164歩兵連隊 10月13日(2,837人)、第2海兵師団の第8海兵連隊 11月4日、
    # 第182歩兵連隊 11月12日、第132歩兵連隊 12月8日、第25歩兵師団 12月17日(第35連隊)〜1月4日(第27・第161連隊)
    marines("us-7mar", "第7海兵連隊", "lunga", 3, artillery=1, arrive=date(1942, 9, 18), via="sea-indispensable"),
    marines("us-164", "第164歩兵連隊(アメリカル師団)", "lunga", 3, arrive=date(1942, 10, 13), training="green", via="sea-indispensable"),
    marines("us-8mar", "第8海兵連隊(第2海兵師団)", "lunga", 3, artillery=1, arrive=date(1942, 11, 4), via="sea-indispensable"),
    marines("us-182", "第182歩兵連隊(アメリカル師団)", "lunga", 3, arrive=date(1942, 11, 12), training="green", via="sea-indispensable"),
    marines("us-132", "第132歩兵連隊(アメリカル師団)", "lunga", 3, arrive=date(1942, 12, 8), training="green", via="sea-indispensable"),
    marines("us-25div-a", "第25歩兵師団(第35連隊)", "lunga", 3, artillery=1, arrive=date(1942, 12, 17), training="green", via="sea-indispensable"),
    marines("us-25div-b", "第25歩兵師団(第27・第161連隊)", "lunga", 6, artillery=1, arrive=date(1943, 1, 1), training="green", via="sea-indispensable"),
    # ===== 日本軍(陸)=====
    # 始めの守備隊:海軍の設営隊と警備隊(大半は設営の工員)。{TOD}:人数と武装
    formation("jp-garrison", "jp", "海軍の警備隊・設営隊", "kokumbona", [unit("jp-garrison-1", "jp_infantry_battalion_1942_light", "green", 0.5)]),
    # 一木支隊の第一梯団(約917人):8月18日夜にタイボ岬へ駆逐艦で上陸
    japanese("jp-ichiki", "一木支隊(第一梯団)", "taivu", 1, arrive=date(1942, 8, 18), express=True, landing=True, via="sea-slot"),
    # 川口支隊(第35旅団。一木支隊の第二梯団を含む):8月29日〜9月7日に駆逐艦と大発で約6千人。主力はタイボ岬、岡部隊は西のカミンボ
    japanese("jp-kawaguchi", "川口支隊(主力)", "taivu", 4, arrive=date(1942, 8, 31), express=True, landing=True, via="sea-slot"),
    japanese("jp-oka", "川口支隊(岡部隊)", "esperance", 2, arrive=date(1942, 9, 4), express=True, via="sea-slot"),
    # 第2師団(仙台):9月〜10月に東京急行と10月14〜15日の高速船団で上がり、10月23〜26日にヘンダーソン飛行場を攻めた。
    # 第38師団の連隊1つを加えたとされる。{TOD}:上がった大隊の数・重火器
    japanese("jp-2div", "第2師団", "esperance", 6, artillery=1, arrive=date(1942, 10, 9), express=True, via="sea-slot"),
    japanese("jp-2div-convoy", "第2師団(高速船団の重火器)", "esperance", 1, artillery=2, arrive=date(1942, 10, 14), light=False, via="sea-slot"),
    # 第38師団:歩兵第228連隊と第229連隊第1大隊を11月5・7・8日に東京急行で上げた。残り(重火器)は11月12〜15日の船団で送ろうとして失敗した
    japanese("jp-38div", "第38師団(東京急行で上がった部隊)", "esperance", 4, arrive=date(1942, 11, 5), express=True, via="sea-slot"),
    japanese("jp-38div-convoy", "第38師団(主力の船団)", "esperance", 3, artillery=2, arrive=date(1942, 11, 13), light=False, via="sea-slot"),
    # ===== 艦隊 =====
    # 米の空母部隊(第61任務部隊・フレッチャー):サラトガ・エンタープライズ・ワスプ。8月7日の上陸を南から援護した。
    # 護衛の艦の割り振りは仮置き({TOD}:Lundstrom、Frank『Guadalcanal』の戦闘序列)
    fleet("us-tf11", "us", "第11任務部隊(サラトガ)", "sea-coral",
          [("saratoga", "us-cv-lexington", "空母"), ("minneapolis", "us-ca-new-orleans", "空母"), ("new-orleans", "us-ca-new-orleans", "空母"),
           ("dd1", "us-dd-mahan", "空母"), ("dd2", "us-dd-mahan", "空母"), ("dd3", "us-dd-benham", "空母")],
          carrier_air("saratoga", "us")),
    fleet("us-tf16", "us", "第16任務部隊(エンタープライズ)", "sea-coral",
          [("enterprise", "us-cv-yorktown", "空母"), ("north-carolina", "us-bb-north-carolina", "空母"), ("portland", "us-ca-portland", "空母"),
           ("atlanta", "us-cl-atlanta", "空母"), ("dd1", "us-dd-benham", "空母"), ("dd2", "us-dd-benham", "空母")],
          carrier_air("enterprise", "us"), training="veteran"),
    fleet("us-tf18", "us", "第18任務部隊(ワスプ)", "sea-santacruz",
          [("wasp", "us-cv-wasp", "空母"), ("san-francisco", "us-ca-new-orleans", "空母"), ("salt-lake-city", "us-ca-pensacola", "空母"),
           ("dd1", "us-dd-benson", "空母"), ("dd2", "us-dd-benson", "空母")],
          carrier_air("wasp", "us")),
    # 上陸船団の護衛(クラッチリー):8月9日未明のサボ島沖海戦で崩れた(既存のシナリオ savo-1942-08-09 の顔ぶれから)
    fleet("us-crutchley", "us", "上陸船団の護衛(クラッチリー)", "sea-ironbottom",
          [("canberra", "au-ca-kent", "南方部隊"), ("chicago", "us-ca-northampton", "南方部隊"), ("bagley", "us-dd-bagley", "南方部隊"), ("patterson", "us-dd-bagley", "南方部隊"),
           ("vincennes", "us-ca-new-orleans", "北方部隊"), ("quincy", "us-ca-new-orleans", "北方部隊"), ("astoria", "us-ca-new-orleans", "北方部隊"),
           ("helm", "us-dd-bagley", "北方部隊"), ("wilson", "us-dd-bagley", "北方部隊")]),
    # ホーネット(第17任務部隊):8月下旬に南太平洋へ。{TOD}:着いた日
    fleet("us-tf17", "us", "第17任務部隊(ホーネット)", "sea-coral",
          [("hornet", "us-cv-yorktown", "空母"), ("northampton", "us-ca-northampton", "空母"), ("pensacola", "us-ca-pensacola", "空母"),
           ("dd1", "us-dd-benham", "空母"), ("dd2", "us-dd-benham", "空母")],
          carrier_air("hornet", "us"), arrive=date(1942, 8, 29)),
    # 11月の巡洋艦部隊(キャラハン・スコット):11月13日未明の第三次ソロモン海戦 第1夜。{TOD}:駆逐艦の艦級
    fleet("us-tf67", "us", "第67任務部隊(キャラハン・スコット)", "sea-indispensable",
          [("san-francisco2", "us-ca-new-orleans", "巡洋艦"), ("portland2", "us-ca-portland", "巡洋艦"), ("helena", "us-cl-brooklyn", "巡洋艦"),
           ("atlanta2", "us-cl-atlanta", "巡洋艦"), ("juneau", "us-cl-atlanta", "巡洋艦"),
           ("dd1", "us-dd-benham", "駆逐艦"), ("dd2", "us-dd-fletcher", "駆逐艦"), ("dd3", "us-dd-mahan", "駆逐艦"), ("dd4", "us-dd-benson", "駆逐艦")],
          arrive=date(1942, 11, 11)),
    # 第64任務部隊(リー):ワシントン・サウスダコタ。11月14〜15日夜の第2夜(既存のシナリオ guadalcanal-1942-11-14 の顔ぶれから)
    fleet("us-tf64", "us", "第64任務部隊(リー)", "sea-coral",
          [("washington", "us-bb-north-carolina", "戦艦"), ("south-dakota", "us-bb-south-dakota", "戦艦"),
           ("walke", "us-dd-benham", "戦艦"), ("benham", "us-dd-benham", "戦艦"), ("preston", "us-dd-mahan", "戦艦"), ("gwin", "us-dd-benson", "戦艦")],
          arrive=date(1942, 11, 13)),
    # 11月30日のタサファロンガ沖海戦の米巡洋艦部隊(ライト。既存のシナリオ tassafaronga-1942-11-30 の顔ぶれから)
    fleet("us-tf67b", "us", "第67任務部隊(ライト)", "sea-indispensable",
          [("minneapolis2", "us-ca-new-orleans", "巡洋艦"), ("new-orleans2", "us-ca-new-orleans", "巡洋艦"), ("pensacola2", "us-ca-pensacola", "巡洋艦"),
           ("honolulu", "us-cl-brooklyn", "巡洋艦"), ("northampton2", "us-ca-northampton", "巡洋艦"),
           ("dd1", "us-dd-fletcher", "駆逐艦"), ("dd2", "us-dd-benham", "駆逐艦"), ("dd3", "us-dd-mahan", "駆逐艦")],
          arrive=date(1942, 11, 27)),
    # 日本の第8艦隊(三川):8月9日未明のサボ島沖海戦(既存のシナリオ savo-1942-08-09 の顔ぶれから)
    fleet("jp-mikawa", "jp", "第8艦隊(三川)", "sea-bougainville",
          [("chokai", "jp-ca-chokai", "第8艦隊"), ("aoba", "jp-ca-furutaka", "第6戦隊"), ("kako", "jp-ca-furutaka", "第6戦隊"), ("kinugasa", "jp-ca-furutaka", "第6戦隊"),
           ("furutaka", "jp-ca-furutaka", "第6戦隊"), ("tenryu", "jp-cl-tenryu", "第18戦隊"), ("yubari", "jp-cl-yubari", "第18戦隊"), ("yunagi", "jp-dd-kamikaze", "第18戦隊")],
          training="elite"),
    # 第2水雷戦隊(田中):東京急行の護衛。{TOD}:時期ごとの駆逐艦の顔ぶれ
    fleet("jp-tanaka", "jp", "第2水雷戦隊(田中)", "sea-bougainville",
          [("jintsu", "jp-cl-5500t", "第2水雷戦隊"), ("dd1", "jp-dd-kagero", "第2水雷戦隊"), ("dd2", "jp-dd-kagero", "第2水雷戦隊"),
           ("dd3", "jp-dd-kagero", "第2水雷戦隊"), ("dd4", "jp-dd-fubuki", "第2水雷戦隊"), ("dd5", "jp-dd-fubuki", "第2水雷戦隊")],
          arrive=date(1942, 8, 14), training="elite"),
    # 機動部隊(南雲):翔鶴・瑞鶴と別動の龍驤。8月24〜25日の第二次ソロモン海戦。護衛は仮置き
    fleet("jp-kido", "jp", "第3艦隊(南雲)", "sea-east",
          [("shokaku", "jp-cv-shokaku", "第1航空戦隊"), ("zuikaku", "jp-cv-shokaku", "第1航空戦隊"), ("dd1", "jp-dd-kagero", "第1航空戦隊"), ("dd2", "jp-dd-kagero", "第1航空戦隊"),
           ("ryujo", "jp-cvl-ryujo", "別動隊"), ("tone", "jp-ca-tone", "別動隊"), ("dd3", "jp-dd-fubuki", "別動隊")],
          carrier_air("shokaku", "jp") + carrier_air("zuikaku", "jp") + [("ryujo-vf", "mw-a6m-18", "ryujo"), ("ryujo-vt", "mw-b5n-land-18", "ryujo")],
          arrive=date(1942, 8, 21), training="elite"),
    # 10月13〜14日夜にヘンダーソン飛行場を砲撃した金剛・榛名(栗田)
    fleet("jp-kurita", "jp", "第3戦隊(栗田。金剛・榛名)", "sea-slot",
          [("kongo", "jp-bb-kongo", "第3戦隊"), ("haruna", "jp-bb-kongo", "第3戦隊"), ("isuzu", "jp-cl-5500t", "第3戦隊"),
           ("dd1", "jp-dd-kagero", "第3戦隊"), ("dd2", "jp-dd-kagero", "第3戦隊")],
          arrive=date(1942, 10, 12), training="veteran"),
    # 第2航空戦隊(隼鷹・飛鷹)と瑞鳳:10月26日の南太平洋海戦。{TOD}:飛鷹は故障で戻ったとされる
    fleet("jp-kakuta", "jp", "第2航空戦隊(角田)と瑞鳳", "sea-east",
          [("junyo", "jp-cv-junyo", "第2航空戦隊"), ("zuiho", "jp-cvl-zuiho", "第2航空戦隊"), ("dd1", "jp-dd-kagero", "第2航空戦隊"), ("dd2", "jp-dd-kagero", "第2航空戦隊")],
          carrier_air("junyo", "jp") + [("zuiho-vf", "mw-a6m-18", "zuiho"), ("zuiho-vt", "mw-b5n-18", "zuiho")],
          arrive=date(1942, 10, 19), training="veteran"),
    # 挺身攻撃隊(阿部。比叡・霧島):11月13日未明に飛行場を砲撃しようとしてキャラハンの部隊と撃ち合った({TOD}:駆逐艦の顔ぶれ)
    fleet("jp-abe", "jp", "挺身攻撃隊(阿部。比叡・霧島)", "sea-slot",
          [("hiei", "jp-bb-kongo", "第11戦隊"), ("kirishima", "jp-bb-kongo", "第11戦隊"), ("nagara", "jp-cl-5500t", "第10戦隊"),
           ("dd1", "jp-dd-kagero", "第10戦隊"), ("dd2", "jp-dd-kagero", "第10戦隊"), ("dd3", "jp-dd-fubuki", "第10戦隊"), ("dd4", "jp-dd-fubuki", "第10戦隊")],
          arrive=date(1942, 11, 11), training="veteran"),
]
# 海を渡る増援の通り道:米の船団はエスピリトゥサントからインディスペンサブル海峡(ルンガ水道)を通って昼に着き、
# 日本の東京急行・船団はショートランドからスロットを下って夜に着く。
# 東京急行の部隊は小さく、スロットに敵の艦隊がいなければ夜に着く(rules.nightExpress)。船団(express なし)は、スロットを米に押さえられていれば着かない


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


# 勝利の条件(ゲームの決め方)。飛行場(ルンガ)が要。日本軍はルンガを取れば決定的、マタニカウ川から西を保てば限定的。
# 米軍はルンガを保ち、島の西端(エスペランス岬)まで取れば決定的(史実:2月に日本軍が撤収)、ルンガを保てば限定的
VICTORY = L(
    [
        (
            "jp",
            L(
                [
                    ("conditions", [cond("lunga", "lunga", 10), cond("kokumbona", "kokumbona", 2), cond("esperance", "esperance", 2), cond("matanikau", "matanikau", 1), cond("tulagi", "tulagi", 1), L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
                    ("decisive", L([("minPoints", 10), ("requires", ["lunga"])])),
                    ("limited", L([("minPoints", 5), ("requires", ["kokumbona"])])),
                ]
            ),
        ),
        (
            "us",
            L(
                [
                    ("conditions", [cond("lunga", "lunga", 6), cond("esperance", "esperance", 3), cond("kokumbona", "kokumbona", 2), cond("tulagi", "tulagi", 1), L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
                    ("decisive", L([("minPoints", 11), ("requires", ["lunga", "esperance"])])),
                    ("limited", L([("minPoints", 6), ("requires", ["lunga"])])),
                ]
            ),
        ),
    ]
)

# 航空隊(編隊1つ=12機。rules.air.airOps.aircraftPerGroup)。根拠は docs/research/guadalcanal-1942-campaign.md「航空」
#  - カクタス航空隊:8月20日に F4F 19機(VMF-223)と SBD 12機(VMSB-232)。22日に陸軍の P-400 5機、30日に MAG-23 の後続。
#    10月13〜14日の砲撃の前は約90機。2つ目の航空隊(9月)の数は仮置き({TOD}:時期ごとの機数)
#  - エスピリトゥサントの B-17(第11爆撃群)。{TOD}:機数
#  - 第11航空艦隊(ラバウル):8月に使える機が約100機(陸攻30・零戦45)とする要約と、陸攻30・戦闘機20とする要約がある。
#    8月下旬に第26航空戦隊(三沢空・木更津空の一式陸攻)が来た。ブインの飛行場は10月から({TOD}:完成の日と機数)
AIR_WINGS = [
    L([("id", "us-cactus"), ("side", "us"), ("name", "カクタス航空隊(MAG-23)"), ("base", "lunga"), ("rangeKm", 400), ("fighters", 1.6), ("strike", 1.0), ("arriveStage", stage_of(date(1942, 8, 20))),
       ("navalToes", L([("fighter", "lb-f4f-12"), ("strike", "lb-sbd-12")]))]),
    L([("id", "us-cactus2"), ("side", "us"), ("name", "カクタス航空隊(後続の海兵・海軍・陸軍の飛行隊)"), ("base", "lunga"), ("rangeKm", 400), ("fighters", 2.0), ("strike", 2.0), ("arriveStage", stage_of(date(1942, 9, 10))),
       ("navalToes", L([("fighter", "lb-f4f-12"), ("strike", "lb-sbd-12")]))]),
    # 10月13〜14日の砲撃の後と11月に、後続の飛行隊(VMF-121・VMSB-141 ほか)が補われた。{TOD}:飛行隊ごとの着いた日と機数
    L([("id", "us-cactus3"), ("side", "us"), ("name", "カクタス航空隊(10月の後続)"), ("base", "lunga"), ("rangeKm", 400), ("fighters", 1.5), ("strike", 1.5), ("arriveStage", stage_of(date(1942, 10, 16))),
       ("navalToes", L([("fighter", "lb-f4f-12"), ("strike", "lb-sbd-12")]))]),
    L([("id", "us-cactus4"), ("side", "us"), ("name", "カクタス航空隊(11月の後続)"), ("base", "lunga"), ("rangeKm", 400), ("fighters", 1.5), ("strike", 1.5), ("arriveStage", stage_of(date(1942, 11, 12))),
       ("navalToes", L([("fighter", "lb-f4f-12"), ("strike", "lb-sbd-12")]))]),
    L([("id", "us-b17"), ("side", "us"), ("name", "第11爆撃群(B-17)"), ("base", "espiritu"), ("rangeKm", 1600), ("fighters", 0), ("strike", 1.5),
       ("navalToes", L([("strike", "lb-b17-12")]))]),
    L([("id", "jp-11af-f"), ("side", "jp"), ("name", "第11航空艦隊 戦闘機隊(台南空ほか)"), ("base", "rabaul"), ("rangeKm", 1100), ("fighters", 3.75), ("strike", 0),
       ("navalToes", L([("fighter", "lb-a6m-land-12")]))]),
    L([("id", "jp-11af-b"), ("side", "jp"), ("name", "第11航空艦隊 陸攻隊(第25航空戦隊)"), ("base", "rabaul"), ("rangeKm", 1300), ("fighters", 0), ("strike", 2.5),
       ("navalToes", L([("strike", "lb-g4m-torp-12"), ("scout", "lb-g3m-scout-3")]))]),
    L([("id", "jp-26af"), ("side", "jp"), ("name", "第26航空戦隊(三沢空・木更津空の一式陸攻)"), ("base", "rabaul"), ("rangeKm", 1300), ("fighters", 0), ("strike", 2.5), ("arriveStage", stage_of(date(1942, 8, 25))),
       ("navalToes", L([("strike", "lb-g4m-bomb-12")]))]),
    L([("id", "jp-buin"), ("side", "jp"), ("name", "ブインの戦闘機隊"), ("base", "shortland"), ("rangeKm", 700), ("fighters", 2.0), ("strike", 0), ("arriveStage", stage_of(date(1942, 10, 8))),
       ("navalToes", L([("fighter", "lb-a6m-land-12")]))]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase, port in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if airbase:
            r["airbase"] = True
        if port:
            r["port"] = True
        regions[rid] = r
        control[rid] = owner
    for rid, name, lat, lon, owner in SEAS:
        x, y = km(lat, lon)
        regions[rid] = L([("name", name), ("x", x), ("y", y), ("biome", "jungle"), ("sea", True)])
        control[rid] = owner
    # 港の補給の源は、面した海域を敵に押さえられると働かない
    regions["rabaul"]["supplyVia"] = "sea-rabaul"
    regions["shortland"]["supplyVia"] = "sea-bougainville"
    regions["espiritu"]["supplyVia"] = "sea-coral"
    stages = stage_of(END)
    return L(
        [
            ("id", "guadalcanal-1942"),
            ("name", "ガダルカナル島の戦い(1942年8月〜1943年2月)"),
            (
                "description",
                "米海兵隊がルンガ岬の飛行場を押さえ、カクタス航空隊が昼の海を握る。日本軍はラバウルから陸攻と零戦を飛ばし、"
                "夜の駆逐艦輸送(東京急行)で兵を送り、戦艦で飛行場を撃ち、空母を出して奪い返しを図る。1段階は7日、27段階。v0・概略図",
            ),
            (
                "notes",
                "根拠は docs/research/guadalcanal-1942-campaign.md。作り直しは tools/campaigns/build_guadalcanal_1942.py。"
                "第1海兵師団の12月の引き揚げ、潜水艦(ワスプ・サラトガの被雷)、ニューギニアの戦いは表していない。艦隊の顔ぶれの多くは仮置き",
            ),
            ("era", "1942-guadalcanal"),
            ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "jp"), ("name", "日本軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stages)])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS] + [L([("a", a), ("b", b), ("kind", "sea")]) for a, b in SEA_LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            (
                "naval",
                L(
                    [
                        ("weapons", ["naval-generic", "pacific-ships-1942", "pacific-landair-1941", "midway-1942"]),
                        ("toe", ["naval-generic", "pacific-ships-1942", "pacific-landair-1941", "midway-1942"]),
                    ]
                ),
            ),
            (
                "rules",
                L(
                    [
                        # 東京急行:敵の航空隊の届く海域を通れば戦力の1割を失い、補給は4割だけ届く(仮置き。ガダルカナルの日本軍の飢えを表す)
                        ("nightExpress", L([("jp", L([("loss", 0.1), ("supplyShare", 0.4)]))])),
                        ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_bomber")]))])),
                    ]
                ),
            ),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "us"),
                        ("level", "decisive"),
                        ("summary", "米軍は飛行場を守り抜き、日本軍は1943年2月1〜7日のケ号作戦で駆逐艦により約1万652人を島から撤収した。島に送られた約3万6千人の多くが戦死・病死・餓死した"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}", file=sys.stdout)
