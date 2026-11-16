#!/usr/bin/env python3
"""
ヴェーザー演習作戦(ノルウェーの戦い。1940年4月9日〜6月10日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_weserubung_1940.py

出力: data/campaigns/weserubung-1940.json

4月9日、独軍はオスロ・クリスチャンサン・スタヴァンゲル・ベルゲン・トロンハイム・ナルヴィクに海と空から同時に上がった。
ノルウェー軍は動員の乱れの中で内陸へ下がって戦い、英仏ポーランドの連合軍はナムソス・オンダルスネス・ハーシュタに上がった。
南の連合軍は5月初めに引き揚げ、北ではナルヴィクを5月28日に取り返したが、西方の戦況で6月8日までに引き揚げ、ノルウェー軍は6月10日に降伏した。
海ではナルヴィクの2度の海戦(4月10日・13日)、ロフォーテン沖のレナウン対シャルンホルスト・グナイゼナウ(4月9日)、
ベルゲンのケーニヒスベルクの撃沈(4月10日、スクア)、ユノー作戦のグローリアスの撃沈(6月8日)。

根拠と残りの裏取りは docs/research/weserubung-1940.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。
地域は主な町を点にした概略図(位置は緯度経度からのおおよその km)、結びの道路・鉄道は大づかみ。
師団・旅団の隷下の部隊の数・練度・着いた日・航空隊の機数の多くは TODO(要裏取り)
(出典候補:Haarr『The German Invasion of Norway』『The Battle for Norway』『The Gathering Storm』、
Derry『The Campaign in Norway』(英公刊戦史)、Hovland『Norges forsvar 1940』、Kersaudy『Norway 1940』)。

1段階は4日(4月9日を1日目として16段階で6月10日まで)。部隊の単位は、独軍は連隊、連合軍は大隊(仏・ポーランドは半旅団・旅団を連隊1つ)。
陣営は独軍(de)と連合軍(al。ノルウェー・英・仏・ポーランド)。編成表は国ごとの実数の編成表(de・uk・fr・no)。
山岳猟兵連隊の編成表はないので、1939年の歩兵連隊で代える(TODO(要裏取り):山岳猟兵連隊の編成)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/weserubung-1940.json"

START = date(1940, 4, 9)
DAYS_PER_STAGE = 4


def stage_of(d: date) -> int:
    """その日が入る段階(1始まり)"""
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。経度1度は北緯63度の値 ≒ 50km、緯度1度 ≒ 111km)"""
    return round((lon - 5.0) * 111 * math.cos(math.radians(63)), 1), round((lat - 58.0) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地、港。山の地域は「山岳」、谷と森は「冬のアルデンヌ」(雪は季節の地面で)
F, W, M = "western-farmland", "ardennes-winter", "mountains"
REGIONS = [
    # 独軍が4月9日に押さえた港と飛行場
    ("oslo", "オスロ(フォルネブ)", 59.91, 10.75, F, "de", "de", True, True),
    ("kristiansand", "クリスチャンサン", 58.15, 8.00, F, "de", "de", True, True),
    ("stavanger", "スタヴァンゲル(ソラ飛行場)", 58.97, 5.73, F, "de", "de", True, False),
    ("bergen", "ベルゲン", 60.39, 5.32, W, None, "de", False, True),
    ("trondheim", "トロンハイム(ヴェルネス飛行場)", 63.43, 10.39, F, "de", "de", True, True),
    ("narvik", "ナルヴィク", 68.44, 17.43, M, None, "de", False, True),
    ("bjornfjell", "ビョルンフェル(スウェーデン国境の鉄道)", 68.43, 18.10, M, None, "de", False, False),
    # ノルウェー軍の動員地と内陸の谷
    ("ostfold", "エストフォル(ハルデン・フレドリクスタ)", 59.20, 11.20, F, None, "al", False, False),
    ("evje", "セテスダール(エヴィエ)", 58.59, 7.80, W, None, "al", False, False),
    ("honefoss", "ヘーネフォス", 60.17, 10.25, W, None, "al", False, False),
    ("hamar", "ハーマル・エルヴェルム", 60.80, 11.10, W, "al", "al", False, False),
    ("rena", "エステルダール(レーナ)", 61.13, 11.37, W, None, "al", False, False),
    ("lillehammer", "リレハンメル(グドブランスダール)", 61.11, 10.47, W, None, "al", False, False),
    ("voss", "ヴォス", 60.63, 6.42, M, "al", "al", False, False),
    ("dombas", "ドンボース(レシャスコーグの凍った湖)", 62.07, 9.12, M, None, "al", True, False),
    ("andalsnes", "オンダルスネス", 62.57, 7.69, M, "al", "al", False, True),
    ("roros", "ローロス・ストーレン", 62.57, 11.38, M, None, "al", False, False),
    ("steinkjer", "シュタインシェール・ヴェルダール", 64.01, 11.49, W, None, "al", False, False),
    ("namsos", "ナムソス", 64.47, 11.50, W, "al", "al", False, True),
    ("grong", "グロング(ナムダール)", 64.46, 12.31, M, None, "al", False, False),
    ("mosjoen", "モショーエン", 65.84, 13.20, M, None, "al", False, False),
    ("mo", "モー・イ・ラーナ", 66.31, 14.14, M, None, "al", False, False),
    ("bodo", "ボードー", 67.28, 14.40, M, None, "al", True, True),
    ("fauske", "フォウスケ(スルイテルマ)", 67.26, 15.39, M, None, "al", False, False),
    ("gratangen", "グラタンゲン・ビェルクヴィク", 68.65, 17.55, M, None, "al", False, False),
    ("harstad", "ハーシュタ(バルドゥフォス飛行場)", 68.80, 16.54, W, "al", "al", True, True),
    # 連合軍の後ろの根拠地(スカパ・フローとハットストンの飛行場)。陸の結びはなく、海からだけ
    ("orkney", "オークニー諸島(スカパ・フロー)", 58.98, -2.96, F, "al", "al", True, True),
]
# ハーシュタ・オンダルスネス・ナムソスは海からの補給の港(面する海域を敵に押さえられると働かない)。クリスチャンサンはスカゲラク。
# オスロへの補給と増援はカテガットを通って来た(作戦地図の外。機雷原と独空軍に守られ、英の艦隊は入らなかった)ので、海に左右されないとする。
# (AI 同士で、英の本国艦隊が1段階目にスカゲラクを取ってオスロの補給と増援を最後まで止めてしまったため)
SUPPLY_VIA = {"harstad": "sea-andfjord", "andalsnes": "sea-norwegian", "namsos": "sea-norwegian", "kristiansand": "sea-skagerrak"}

# 海域(艦隊だけが入れる)。位置は作戦地図の表示のためのおおよその値
SEAS = [
    ("sea-skagerrak", "スカゲラク(オスロ・クリスチャンサン沖)", 58.20, 9.80),
    ("sea-north", "北海(ベルゲン・スタヴァンゲル沖)", 60.00, 2.50),
    ("sea-norwegian", "ノルウェー海(トロンハイム・オンダルスネス・ナムソス沖)", 64.00, 7.00),
    ("sea-vestfjord", "ヴェストフィヨルド・ロフォーテン沖", 67.90, 13.30),
    # ハーシュタはヒンノイ島の北のヴォーグスフィヨルド・アンドフィヨルドに面し、連合軍の船団はヴェストフィヨルドを通らず外洋から来た
    # (AI 同士で、ナルヴィクの駆逐艦がヴェストフィヨルドに居座ってハーシュタの増援と補給を最後まで止めてしまったため分けた)
    ("sea-andfjord", "アンドフィヨルド・ヴォーグスフィヨルド(ハーシュタ沖)", 69.40, 16.20),
]
SEA_LINKS = [
    ("oslo", "sea-skagerrak"),
    ("kristiansand", "sea-skagerrak"),
    ("stavanger", "sea-north"),
    ("bergen", "sea-north"),
    ("orkney", "sea-north"),
    ("andalsnes", "sea-norwegian"),
    ("trondheim", "sea-norwegian"),
    ("namsos", "sea-norwegian"),
    ("bodo", "sea-vestfjord"),
    ("narvik", "sea-vestfjord"),
    ("harstad", "sea-andfjord"),
    ("sea-skagerrak", "sea-north"),
    ("sea-north", "sea-norwegian"),
    ("sea-norwegian", "sea-vestfjord"),
    ("sea-norwegian", "sea-andfjord"),
    ("sea-vestfjord", "sea-andfjord"),
]

# 結び:鉄道(ドヴレ線・ローロス線・ベルゲン線・オフォーテン線)・道路・小道。TODO(要裏取り):1940年の道路の状態、雪の山越え
LINKS = [
    ("oslo", "ostfold", "rail"),
    ("oslo", "honefoss", "rail"),
    ("oslo", "hamar", "rail"),
    ("oslo", "kristiansand", "road"),
    ("kristiansand", "evje", "road"),
    ("evje", "stavanger", "track"),
    ("kristiansand", "stavanger", "road"),
    ("stavanger", "bergen", "track"),
    ("bergen", "voss", "rail"),
    ("voss", "honefoss", "rail"),
    ("honefoss", "lillehammer", "road"),
    ("hamar", "lillehammer", "rail"),
    ("hamar", "rena", "rail"),
    ("lillehammer", "dombas", "rail"),
    ("dombas", "andalsnes", "rail"),
    ("dombas", "trondheim", "rail"),
    ("rena", "roros", "rail"),
    ("roros", "trondheim", "rail"),
    ("trondheim", "steinkjer", "rail"),
    ("steinkjer", "namsos", "rail"),
    ("steinkjer", "grong", "road"),
    ("namsos", "grong", "road"),
    ("grong", "mosjoen", "track"),
    ("mosjoen", "mo", "track"),
    ("mo", "bodo", "track"),
    ("mo", "fauske", "track"),
    ("bodo", "fauske", "road"),
    ("fauske", "narvik", "track"),
    ("narvik", "gratangen", "road"),
    ("narvik", "bjornfjell", "rail"),
    ("bjornfjell", "gratangen", "track"),
    ("gratangen", "harstad", "track"),
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


def german(fid, name, region, regiments, artillery=1, tanks=0, arrive=None, training=None, strength=None, **extra):
    """独軍の師団・戦闘団:歩兵連隊(山岳猟兵連隊も1939年の歩兵連隊で代える)・砲兵大隊・戦車大隊"""
    us = [unit(f"{fid}-ir{i + 1}", "de-ir-1939", training, strength) for i in range(regiments)]
    us += [unit(f"{fid}-art{i + 1}", "de-art-abt-lefh18", training) for i in range(artillery)]
    us += [unit(f"{fid}-pz{i + 1}", "de-pz-abt-1940", training, 0.5) for i in range(tanks)]
    return formation(fid, "de", name, region, us, arrive, **extra)


def norwegian(fid, name, region, battalions, artillery=1, mountain=False, training="green", strength=None):
    """ノルウェー軍の師団・旅団:歩兵大隊と野砲・山砲の大隊"""
    us = [unit(f"{fid}-bn{i + 1}", "no-inf-bn-1940", training, strength) for i in range(battalions)]
    art = "no-mtn-art-bn-1940" if mountain else "no-art-bn-1940"
    us += [unit(f"{fid}-art{i + 1}", art, training) for i in range(artillery)]
    return formation(fid, "al", name, region, us)


# 予定の撤退(formations の withdraw):中部の連合軍は5月1〜3日にオンダルスネス・ナムソスから、北の連合軍は6月4〜8日(アルファベット作戦)にハーシュタ・ナルヴィクから引き揚げた
SOUTH_EXIT = L([("stage", stage_of(date(1940, 4, 29))), ("from", ["andalsnes", "namsos"])])
NORTH_EXIT = L([("stage", stage_of(date(1940, 6, 2))), ("from", ["harstad", "narvik"])])


def british(fid, name, region, battalions, arrive, via, training=None, landing=False, withdraw=None):
    """英の旅団:歩兵大隊(1940年の大隊は1941年の編成表で代える。野砲・対戦車砲はほとんど持って来られなかった)"""
    us = [unit(f"{fid}-{b}", "uk-inf-bn-1941", training) for b in battalions]
    return formation(fid, "al", name, region, us, arrive, via=via, **({"landing": True} if landing else {}), **({"withdraw": withdraw} if withdraw else {}))


def french(fid, name, region, strength, arrive, via, training=None, withdraw=None):
    """仏・ポーランドの半旅団・旅団:1940年の歩兵連隊1つ(大隊の数を戦力で合わせる)"""
    return formation(fid, "al", name, region, [unit(f"{fid}-1", "fr-ir-1940", training, strength)], arrive, via=via, **({"withdraw": withdraw} if withdraw else {}))


def fleet(fid, side, name, region, ships, air=None, arrive=None, training=None):
    """艦隊:艦は1隻ずつ(id の末尾・艦級・戦隊の名前)。air は母艦に載せる航空隊(id の末尾・編成表・母艦の id の末尾)"""
    us = [unit(f"{fid}-{sid}", toe, training, squadron=sq) for sid, toe, sq in ships]
    us += [unit(f"{fid}-{sid}", toe, training, base=f"{fid}-{cv}") for sid, toe, cv in (air or [])]
    return formation(fid, side, name, region, us, arrive)


D34, D36 = "de-dd-1934", "de-dd-1936"
FORMATIONS = [
    # ===== 独軍(陸)=====
    # 第163歩兵師団(エンゲルブレヒト):ブリュッヒャーが4月9日にドレーバク海峡で沈められたあと、オスロは空から降りた部隊(第324歩兵連隊)で取った。
    # TODO(要裏取り):オスロに入った兵力の内訳
    german("de-163", "第163歩兵師団(オスロ)", "oslo", 2, training="regular"),
    # クリスチャンサンとスタヴァンゲル:第163・第69師団の一部と降下猟兵(ソラ飛行場)。それぞれ連隊1つの6割とする(仮置き)
    german("de-krs", "クリスチャンサンの上陸部隊", "kristiansand", 1, artillery=0, strength=0.6),
    german("de-svg", "スタヴァンゲルの空挺・空輸部隊(第69師団の一部)", "stavanger", 1, artillery=0, strength=0.6),
    # 第69歩兵師団の第159歩兵連隊:ベルゲン(ケルン・ケーニヒスベルクで運ばれた)
    german("de-69", "第69歩兵師団(ベルゲン)", "bergen", 1, artillery=0, strength=0.8),
    # 第3山岳師団の第138山岳猟兵連隊:トロンハイム(ヒッパーと駆逐艦4で運ばれた。約1,700人)
    german("de-138", "第138山岳猟兵連隊(トロンハイム)", "trondheim", 1, artillery=0, training="veteran", strength=0.6),
    # 第3山岳師団の第139山岳猟兵連隊(ディートル):ナルヴィク(駆逐艦10で約2,000人)。のちに沈んだ駆逐艦の乗員約2,600人が加わった
    german("de-dietl", "ディートル部隊(第139山岳猟兵連隊)", "narvik", 1, artillery=0, training="veteran", strength=0.7),
    formation("de-navy", "de", "駆逐艦の乗員の大隊(ナルヴィク)", "bjornfjell", [unit("de-navy-1", "infantry_battalion", "green", 0.8)]),
    # 後から来た師団(海と空で):第196歩兵師団 4月中旬、第181歩兵師団 4月下旬(トロンハイムへ空輸も)、第214歩兵師団(南西)、
    # 第2山岳師団 5月初め(トロンハイムからナルヴィクの救援へ北上)、第40特別戦車大隊(I号・II号・NbFz。4月中旬)
    # オスロへはカテガットを通る(海に左右されない)。クリスチャンサンへはスカゲラクを通る。TODO(要裏取り):着いた日と港、連隊の数
    german("de-196", "第196歩兵師団", "oslo", 3, arrive=date(1940, 4, 13)),
    german("de-181", "第181歩兵師団", "oslo", 2, arrive=date(1940, 4, 21)),
    german("de-214", "第214歩兵師団", "kristiansand", 2, arrive=date(1940, 4, 17), via="sea-skagerrak"),
    german("de-pz40", "第40特別戦車大隊", "oslo", 0, artillery=0, tanks=1, arrive=date(1940, 4, 17)),
    german("de-2geb", "第2山岳師団", "oslo", 2, arrive=date(1940, 5, 1), training="veteran"),
    # ===== 連合軍(陸)=====
    # ノルウェー軍:6個師団。4月9日に動員を始めたが、多くの動員所を独軍に押さえられ、大隊は定数に届かなかった。
    # 大隊の数・置き場所は TODO(要裏取り:Hovland)。第6師団(フライシャー。北ノルウェー)は冬の訓練を積み、比べてよく戦った
    norwegian("no-1div", "第1師団(エストフォル)", "ostfold", 2, strength=0.7),
    norwegian("no-2div", "第2師団(オスロの北)", "hamar", 3, strength=0.7),
    norwegian("no-2div-w", "第2師団の一部(ヘーネフォス)", "honefoss", 2, artillery=0, strength=0.6),
    norwegian("no-3div", "第3師団(セテスダール)", "evje", 2, artillery=0, strength=0.6),
    norwegian("no-4div", "第4師団(ヴォス)", "voss", 4, strength=0.8),
    norwegian("no-5div", "第5師団(トロンデラーグ)", "steinkjer", 3, strength=0.7),
    norwegian("no-5div-e", "第5師団の一部(エステルダール)", "rena", 2, artillery=0, strength=0.6),
    norwegian("no-6div", "第6師団(フライシャー)", "gratangen", 6, artillery=1, mountain=True, training="regular"),
    # 英:第24近衛旅団(ハーシュタ 4月15日)、第146旅団(ナムソス 4月16〜17日。国防義勇軍)、第148旅団(オンダルスネス 4月18日。国防義勇軍)、
    # 第15旅団(オンダルスネス 4月23日。フランスから回された正規の旅団)。TODO(要裏取り):上陸の日
    british("uk-24gds", "第24近衛旅団", "harstad", ["ig", "sg", "swb"], date(1940, 4, 15), "sea-andfjord", training="regular", withdraw=NORTH_EXIT),
    british("uk-146", "第146旅団(モーリス部隊)", "namsos", ["a", "b", "c"], date(1940, 4, 16), "sea-norwegian", training="green", withdraw=SOUTH_EXIT),
    british("uk-148", "第148旅団(シックル部隊)", "andalsnes", ["a", "b"], date(1940, 4, 18), "sea-norwegian", training="green", withdraw=SOUTH_EXIT),
    british("uk-15", "第15旅団", "andalsnes", ["a", "b", "c"], date(1940, 4, 23), "sea-norwegian", training="regular", withdraw=SOUTH_EXIT),
    # 仏:第5山岳猟兵半旅団(ナムソス 4月19日)、第27山岳猟兵半旅団(ハーシュタ 4月28日)、第13外人部隊半旅団(5月6日)、
    # ポーランド:独立ポトハレ山岳旅団(5月9日)。戦力は連隊1つに対する大隊の数の比(仮置き)
    french("fr-5dbca", "第5山岳猟兵半旅団", "namsos", 1.0, date(1940, 4, 19), "sea-norwegian", training="regular", withdraw=SOUTH_EXIT),
    french("fr-27dbca", "第27山岳猟兵半旅団", "harstad", 1.0, date(1940, 4, 28), "sea-andfjord", training="regular", withdraw=NORTH_EXIT),
    french("fr-13dble", "第13外人部隊半旅団", "harstad", 0.67, date(1940, 5, 6), "sea-andfjord", training="veteran", withdraw=NORTH_EXIT),
    french("pl-podhale", "独立ポトハレ山岳旅団(ポーランド)", "harstad", 1.0, date(1940, 5, 9), "sea-andfjord", training="regular", withdraw=NORTH_EXIT),
    # ===== 艦隊 =====
    # 独:第1群(ナルヴィク):駆逐艦10(ボンテ代将)。1936型5(Z17〜Z19・Z21・Z22)と1934A型5(Z2・Z9・Z11〜Z13)。
    # 4月10日の第一次ナルヴィク海戦で2隻を失い、残りは13日の第二次海戦で全滅した。燃料の補給が遅れて港に留まった
    fleet("de-g1", "de", "第1群(ナルヴィクの駆逐艦)", "sea-vestfjord", [
        ("z21", D36, "第1群"), ("z17", D36, "第1群"), ("z18", D36, "第1群"), ("z19", D36, "第1群"), ("z22", D36, "第1群"),
        ("z2", D34, "第1群"), ("z9", D34, "第1群"), ("z11", D34, "第1群"), ("z12", D34, "第1群"), ("z13", D34, "第1群"),
    ], training="regular"),
    # 戦艦シャルンホルスト・グナイゼナウ(リュッチェンス):4月9日朝、ロフォーテン沖でレナウンと撃ち合った
    fleet("de-bs", "de", "戦艦の戦隊(シャルンホルスト・グナイゼナウ)", "sea-norwegian", [
        ("scharnhorst", "de-bb-scharnhorst", "戦艦"), ("gneisenau", "de-bb-scharnhorst", "戦艦"),
    ], training="regular"),
    # 第2群(トロンハイム):重巡ヒッパーと駆逐艦4(Z5・Z6・Z8・Z16)
    fleet("de-g2", "de", "第2群(ヒッパーと駆逐艦4)", "sea-norwegian", [
        ("hipper", "de-ca-hipper", "第2群"), ("z5", D34, "第2群"), ("z6", D34, "第2群"), ("z8", D34, "第2群"), ("z16", D34, "第2群"),
    ], training="regular"),
    # 第3群(ベルゲン):軽巡ケルン・ケーニヒスベルク(ケーニヒスベルクは港で砲台に撃たれ、4月10日にスクアに沈められた)
    fleet("de-g3", "de", "第3群(ケルン・ケーニヒスベルク)", "sea-north", [
        ("koeln", "de-cl-koenigsberg", "第3群"), ("koenigsberg", "de-cl-koenigsberg", "第3群"),
    ], training="regular"),
    # 第5群(オスロ):重巡ブリュッヒャーは4月9日にドレーバク海峡で沈んだので入れない。装甲艦リュッツォウ(4月11日に潜水艦の魚雷で大破)
    fleet("de-g5", "de", "第5群(リュッツォウ)", "sea-skagerrak", [("luetzow", "de-ca-deutschland", "第5群")], training="regular"),
    # 英(連合):第2駆逐隊(ウォーバートン=リー):ハーディ・ハンター・ハヴォック・ホットスパー・ホスタイル。4月10日朝にナルヴィクを襲った
    fleet("uk-2df", "al", "第2駆逐隊(ウォーバートン=リー)", "sea-vestfjord", [
        ("hardy", "uk-dd-gh", "第2駆逐隊"), ("hunter", "uk-dd-gh", "第2駆逐隊"), ("havock", "uk-dd-gh", "第2駆逐隊"), ("hotspur", "uk-dd-gh", "第2駆逐隊"), ("hostile", "uk-dd-gh", "第2駆逐隊"),
    ], training="regular"),
    # 巡洋戦艦レナウン(ホイットワース):4月9日にロフォーテン沖でグナイゼナウに命中弾を与えた。護衛の駆逐艦の顔ぶれは TODO(要裏取り)
    fleet("uk-renown", "al", "巡洋戦艦レナウンの戦隊", "sea-norwegian", [
        ("renown", "uk-bc-renown", "レナウン"), ("d1", "uk-dd-gh", "駆逐隊"), ("d2", "uk-dd-gh", "駆逐隊"),
    ], training="regular"),
    # 本国艦隊(フォーブス):戦艦ロドネー・ヴァリアント、巡洋艦、駆逐艦。巡洋艦・駆逐艦の顔ぶれは TODO(要裏取り)
    fleet("uk-home", "al", "本国艦隊(フォーブス)", "sea-north", [
        ("rodney", "uk-bb-nelson", "戦艦"), ("valiant", "uk-bb-qe", "戦艦"),
        ("sheffield", "uk-cl-town", "巡洋艦"), ("glasgow", "uk-cl-town", "巡洋艦"), ("suffolk", "uk-ca-county", "巡洋艦"),
        ("cossack", "uk-dd-tribal", "駆逐隊"), ("eskimo", "uk-dd-tribal", "駆逐隊"), ("bedouin", "uk-dd-tribal", "駆逐隊"), ("punjabi", "uk-dd-tribal", "駆逐隊"),
    ], training="regular"),
    # 第二次ナルヴィク海戦(4月13日):戦艦ウォースパイトと駆逐艦9。ここでは本国艦隊のトライバル級を除いた5隻を足す(TODO(要裏取り))
    fleet("uk-warspite", "al", "ウォースパイトの戦隊", "sea-north", [
        ("warspite", "uk-bb-qe", "ウォースパイト"), ("hero", "uk-dd-gh", "駆逐隊"), ("icarus", "uk-dd-gh", "駆逐隊"), ("forester", "uk-dd-gh", "駆逐隊"), ("foxhound", "uk-dd-gh", "駆逐隊"), ("kimberley", "uk-dd-gh", "駆逐隊"),
    ], arrive=date(1940, 4, 11), training="regular"),
    # 空母:アーク・ロイヤルとグローリアス(4月下旬に戻り、5月〜6月はナルヴィクの援護)。グローリアスは6月8日、
    # 駆逐艦アーデント・アカスタとともにシャルンホルスト・グナイゼナウに沈められた。艦載機の数は TODO(要裏取り)
    fleet("uk-cv", "al", "空母部隊(アーク・ロイヤル・グローリアス)", "sea-north", [
        ("arkroyal", "uk-cv-arkroyal", "空母"), ("glorious", "uk-cv-glorious", "空母"),
        ("ardent", "uk-dd-gh", "駆逐隊"), ("acasta", "uk-dd-gh", "駆逐隊"), ("highlander", "uk-dd-gh", "駆逐隊"),
    ], air=[
        ("ark-vb", "at-skua-12", "arkroyal"), ("ark-vt", "at-swordfish-12", "arkroyal"),
        ("glo-vf", "at-gladiator-9", "glorious"), ("glo-vt", "at-swordfish-9", "glorious"),
    ], arrive=date(1940, 4, 24), training="regular"),
]

# 航空基地と航空隊(編隊1つ=12機。rules.air.airOps.aircraftPerGroup)。根拠は docs/research/weserubung-1940.md「航空隊」(機数はすべて TODO(要裏取り))
#  - 独:第10航空軍団(ガイスラー)。He 111(KG 26・KG 4)・Ju 88(KG 30)・Ju 87(StG 1)・Bf 110(ZG 76)・Bf 109(JG 77 の一部)。
#    初めはドイツ・デンマークから飛び、すぐにオスロ・フォルネブ、スタヴァンゲル・ソラ、トロンハイム・ヴェルネスへ進んだ
#  - 連合:英海軍航空隊のスクア(オークニーのハットストン)、英空軍の爆撃機(スコットランド。ここではオークニーに置く)、
#    第263飛行隊のグラディエーター(4月24日にレシャスコーグの凍った湖、5月下旬にバルドゥフォス)、第46飛行隊のハリケーン(5月26日にバルドゥフォス)
AIR_WINGS = [
    L([("id", "de-kg26"), ("side", "de"), ("name", "第26爆撃航空団(He 111)"), ("base", "oslo"), ("rangeKm", 1000), ("fighters", 0), ("strike", 4)]),
    L([("id", "de-kg30"), ("side", "de"), ("name", "第30爆撃航空団(Ju 88)"), ("base", "stavanger"), ("rangeKm", 900), ("fighters", 0), ("strike", 3)]),
    L([("id", "de-zg76"), ("side", "de"), ("name", "第76駆逐航空団(Bf 110)"), ("base", "stavanger"), ("rangeKm", 500), ("fighters", 2), ("strike", 0)]),
    L([("id", "de-jg77"), ("side", "de"), ("name", "第77戦闘航空団の一部(Bf 109)"), ("base", "oslo"), ("rangeKm", 250), ("fighters", 1.5), ("strike", 0)]),
    L([("id", "de-stg1"), ("side", "de"), ("name", "第1急降下爆撃航空団(Ju 87)"), ("base", "trondheim"), ("rangeKm", 300), ("fighters", 0), ("strike", 2), ("arriveStage", stage_of(date(1940, 4, 17)))]),
    L([("id", "al-hatston"), ("side", "al"), ("name", "英海軍航空隊のスクア(ハットストン)"), ("base", "orkney"), ("rangeKm", 550), ("fighters", 0), ("strike", 1.5)]),
    L([("id", "al-raf"), ("side", "al"), ("name", "英空軍の爆撃機(ウェリントン・ハンプデン・ブレニム)"), ("base", "orkney"), ("rangeKm", 800), ("fighters", 0), ("strike", 2)]),
    L([("id", "al-263-lesja"), ("side", "al"), ("name", "第263飛行隊(グラディエーター。レシャスコーグ)"), ("base", "dombas"), ("rangeKm", 200), ("fighters", 1.5), ("strike", 0), ("arriveStage", stage_of(date(1940, 4, 24)))]),
    L([("id", "al-bardufoss"), ("side", "al"), ("name", "第263・第46飛行隊(グラディエーター・ハリケーン。バルドゥフォス)"), ("base", "harstad"), ("rangeKm", 250), ("fighters", 3), ("strike", 0), ("arriveStage", stage_of(date(1940, 5, 22)))]),
]
# 海戦に出るときの機種(盤上の航空隊。tools/packs/build_atlantic_air_1941.py)
NAVAL_TOES = {
    "de-kg26": {"strike": "at-he111-12", "scout": "at-de-scout"},
    "de-kg30": {"strike": "at-ju88-12"},
    "de-zg76": {"fighter": "at-bf110-12"},
    "de-jg77": {"fighter": "at-bf109-12"},
    "de-stg1": {"strike": "at-ju87-12"},
    "al-hatston": {"strike": "at-skua-12", "scout": "at-uk-scout"},
    "al-raf": {"strike": "at-blenheim-12"},
    "al-263-lesja": {"fighter": "at-gladiator-12"},
    "al-bardufoss": {"fighter": "at-hurricane-12"},
}
for _w in AIR_WINGS:
    _w["navalToes"] = NAVAL_TOES[_w["id"]]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


LOSS = L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])
# 勝利の条件(ゲームの決め方。史実の数値ではない)。独軍は鉱石の積み出し港ナルヴィクとトロンハイムを押さえれば決定的、
# 連合軍はナルヴィクとトロンハイムを押さえれば決定的、ナルヴィクかトロンハイムとハーシュタなら限定的
VICTORY = L(
    [
        (
            "de",
            L(
                [
                    ("conditions", [cond("narvik", "narvik", 4), cond("trondheim", "trondheim", 4), cond("oslo", "oslo", 3), cond("bergen", "bergen", 2),
                                    cond("hamar", "hamar", 1), cond("andalsnes", "andalsnes", 1), cond("namsos", "namsos", 1), cond("harstad", "harstad", 2), LOSS]),
                    ("decisive", L([("minPoints", 14), ("requires", ["narvik", "trondheim"])])),
                    ("limited", L([("minPoints", 9), ("requires", ["trondheim"])])),
                ]
            ),
        ),
        (
            "al",
            L(
                [
                    # 撤退:英仏ポーランドの部隊の戦力の6割以上を引き揚げれば2点(史実はほぼ全部を引き揚げた)
                    ("conditions", [cond("narvik", "narvik", 4), cond("trondheim", "trondheim", 4), cond("harstad", "harstad", 2), cond("bergen", "bergen", 2), cond("hamar", "hamar", 1),
                                    L([("id", "evac"), ("type", "withdrawn"), ("min", 0.6), ("points", 2)]), LOSS]),
                    ("decisive", L([("minPoints", 10), ("requires", ["narvik", "trondheim"])])),
                    ("limited", L([("minPoints", 6), ("requires", ["harstad"])])),
                ]
            ),
        ),
    ]
)


# 潜水艦の群れ(作戦の層で自動で動く。ユーザー判断)。隻数・届く距離は TODO(要裏取り:Haarr『The German Invasion of Norway』の付録)。
# 英の潜水艦はカールスルーエを沈め(4月9日、トルーアント)、リュッツォウを大破させた(4月11日、スピアフィッシュ)。
# 独のUボートは磁気信管・深度の不具合で魚雷がほとんど当たらなかった(魚雷の危機)ので、当たりにくさ 0.15(仮置き)
SUBMARINES = [
    L([("id", "uk-subs"), ("side", "al"), ("name", "英の潜水艦(本国艦隊の潜水戦隊)"), ("base", "orkney"), ("rangeKm", 1500), ("boats", 6)]),
    L([("id", "de-uboats"), ("side", "de"), ("name", "独のUボート(ハルトムート作戦)"), ("base", "oslo"), ("rangeKm", 2500), ("boats", 8), ("effectiveness", 0.15)]),
]

def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase, port in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if rid in SUPPLY_VIA:
            r["supplyVia"] = SUPPLY_VIA[rid]
        if airbase:
            r["airbase"] = True
        if port:
            r["port"] = True
        regions[rid] = r
        control[rid] = owner
    for rid, name, lat, lon in SEAS:
        x, y = km(lat, lon)
        regions[rid] = L([("name", name), ("x", x), ("y", y), ("biome", "western-farmland"), ("sea", True)])
    # 始めの制海:スカゲラクは独、北海とアンドフィヨルドは英の本国艦隊。ノルウェー海・ヴェストフィヨルドはどちらでもない
    control["sea-skagerrak"] = "de"
    control["sea-north"] = "al"
    control["sea-andfjord"] = "al"
    end = date(1940, 6, 10)
    return L(
        [
            ("id", "weserubung-1940"),
            ("name", "ヴェーザー演習作戦(1940年4月〜6月)"),
            (
                "description",
                "4月9日、独軍はノルウェーの6つの港に海と空から同時に上がった。ノルウェー軍は動員の乱れの中で内陸の谷へ下がって戦い、"
                "英仏ポーランドの連合軍はナムソス・オンダルスネス・ハーシュタに上がる。鉄鉱石の積み出し港ナルヴィクと、"
                "中部の要トロンハイムを巡って、陸と海と空で争う。1段階は4日、16段階。v0・概略図(地域の位置と結び、兵力の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/weserubung-1940.md。作り直しは tools/campaigns/build_weserubung_1940.py。ブリュッヒャー(4月9日にドレーバク海峡で沈没)・カールスルーエ(9日夜に潜水艦で沈没)とノルウェーの海防戦艦(9日にナルヴィクで沈没)は入れていない。潜水艦は表していない"),
            ("era", "1940-norway"),
            ("sides", [L([("id", "de"), ("name", "ドイツ軍")]), L([("id", "al"), ("name", "連合軍(ノルウェー・英・仏・ポーランド)")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stage_of(end))])),
            # 季節:4月は内陸の谷と山に雪が深く残り、5月に雪解けのぬかるみ、6月は乾く(地面の度合いは仮置き)
            ("seasons", [
                L([("stage", 1), ("name", "雪の残る4月"), ("ground", L([("snow", 0.7)]))]),
                L([("stage", 6), ("name", "雪解け"), ("ground", L([("mud", 0.5), ("snow", 0.2)]))]),
                L([("stage", 12), ("name", "初夏")]),
            ]),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS] + [L([("a", a), ("b", b), ("kind", "sea")]) for a, b in SEA_LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            ("submarines", SUBMARINES),
            # 海戦の艦艇(大西洋 1940〜41年の艦級。英の巡洋戦艦レナウンなどは太平洋1942年の艦級)と航空隊(大西洋 1940〜41年)
            (
                "naval",
                L(
                    [
                        ("weapons", ["naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"]),
                        ("toe", ["naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"]),
                    ]
                ),
            ),
            ("rules", L([("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_bomber")]))]))])),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "de"),
                        ("level", "decisive"),
                        (
                            "summary",
                            "連合軍は5月2〜3日にオンダルスネス・ナムソスから引き揚げ、北では5月28日にナルヴィクを取り返したが、フランスの戦況で6月8日までにハーシュタから引き揚げた。"
                            "ノルウェー軍は6月10日に降伏し、国王と政府は英国へ移った。独海軍は重巡ブリュッヒャー・軽巡2・駆逐艦10を失い、英海軍は空母グローリアス・巡洋艦2・駆逐艦7ほかを失った(数は出典で差がある)",
                        ),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
