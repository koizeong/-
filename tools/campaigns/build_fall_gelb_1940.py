#!/usr/bin/env python3
"""
黄作戦(西方戦役。1940年5月10日〜6月4日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_fall_gelb_1940.py

出力: data/campaigns/fall-gelb-1940.json

B軍集団がオランダ(降下部隊でムールダイクの橋・ロッテルダム・ハーグ)とベルギー(エバン・エマール)に攻め入り、連合軍の左翼(英大陸派遣軍・仏第1・第7軍)を
北へ引き寄せる。その間にA軍集団のクライスト装甲集団がアルデンヌを抜け、5月13日にスダンでムーズ川を渡り、20日にアブヴィルで英仏海峡に着いて
連合軍を北に切り離した(鎌の一撃)。5月21日のアラスの反撃、ダンケルクの撤退(5月26日〜6月4日)。オランダは5月15日、ベルギーは28日に降伏した。
根拠と残りの裏取りは docs/research/fall-gelb-1940.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:ノルマンディー・バルジと同じく、1個の部隊をおおよそ1個師団(連隊の編成表で代える)。装甲師団は戦車大隊と歩兵連隊(6割)の2部隊。
仏の軽機械化師団・機甲師団は戦車大隊の編成表、英の師団は1944年の歩兵旅団の編成表で代える(1940年にない PIAT などを含む。TODO)。
ベルギー・オランダは国ごとの実数の編成表(be・no と同じく仮置きが多い)。陣営は独軍(de)と連合軍(al)。
師団の数・位置・航空隊の機数の多くは TODO(要裏取り)
(出典候補:Frieser『The Blitzkrieg Legend』、Jackson『The Fall of France』、Ellis『The War in France and Flanders』(英公刊戦史)、
Amersfoort & Kamphuis『Mei 1940』、Doughty『The Breaking Point』)。
1段階は2日(5月10日を1日目として13段階で6月4日まで)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/fall-gelb-1940.json"

START = date(1940, 5, 10)
DAYS_PER_STAGE = 2
STAGES = 13


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯50.5度で約71km、緯度1度は約111km)"""
    return round((lon - 1.5) * 111 * math.cos(math.radians(50.5)), 1), round((lat - 49.0) * 111, 1)


F, W = "western-farmland", "ardennes-winter"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 独の出撃の地
    ("emmerich", "ニーダーライン(第18軍の出撃地)", 51.83, 6.25, F, "de", "de", True),
    ("aachen", "アーヘン(第6軍の出撃地)", 50.78, 6.08, F, "de", "de", True),
    ("eifel", "アイフェル(A軍集団・クライスト装甲集団)", 50.25, 6.60, W, "de", "de", True),
    # オランダ
    ("ijssel", "アイセル線(ズトフェン・デーフェンター)", 52.20, 6.15, F, None, "al", False),
    ("grebbe", "グレッベ線", 51.97, 5.60, F, None, "al", False),
    ("peel", "ペール・ラーム線", 51.55, 5.80, F, None, "al", False),
    ("moerdijk", "ムールダイクの橋・ドルトレヒト", 51.70, 4.63, F, None, "al", False),
    ("rotterdam", "ロッテルダム", 51.92, 4.48, F, None, "al", False),
    ("hague", "ハーグ・ホラント要塞", 52.08, 4.31, F, "al", "al", False),
    ("zeeland", "ゼーラント", 51.50, 3.80, F, None, "al", False),
    # ベルギー
    ("maastricht", "マーストリヒト", 50.85, 5.69, F, None, "al", False),
    ("albert-canal", "アルベール運河・エバン・エマール", 51.00, 5.50, F, None, "al", False),
    ("liege", "リエージュ要塞", 50.63, 5.57, W, None, "al", False),
    ("hannut", "アニュー・ジャンブルー峡谷", 50.67, 5.08, F, None, "al", False),
    ("dyle", "ディール線(ルーヴァン・ワーヴル)", 50.88, 4.70, F, None, "al", False),
    ("gembloux", "ジャンブルー", 50.56, 4.69, F, None, "al", False),
    ("namur", "ナミュール要塞", 50.47, 4.87, W, None, "al", False),
    ("antwerp", "アントウェルペン(国家要塞)", 51.22, 4.40, F, "al", "al", False),
    ("brussels", "ブリュッセル", 50.85, 4.35, F, None, "al", False),
    ("ghent", "ガン・リス川", 51.05, 3.72, F, None, "al", False),
    # ベルギーのアルデンヌは始めから独の地域にする:アルデンヌ猟兵と仏の騎兵は5月10〜12日に下がり、装甲の先頭は12日にムーズ川に着いた。
    # (初めは連合軍の地域にしてアルデンヌ猟兵を置いたが、AI 同士で仏第2・第9軍がアルデンヌへ出て遭遇戦になり、独が森で負け続けた)
    ("ardennes-be", "ベルギーのアルデンヌ(ヌフシャトー・バストーニュ)", 49.95, 5.40, W, None, "de", False),
    # フランス
    ("sedan", "スダン(ムーズ川)", 49.70, 4.94, W, None, "al", False),
    ("dinant", "ディナン(ムーズ川)", 50.26, 4.91, W, None, "al", False),
    ("montherme", "モンテルメ(ムーズ川)", 49.88, 4.73, W, None, "al", False),
    ("montcornet", "モンコルネ・ラン", 49.69, 4.02, F, None, "al", False),
    ("saint-quentin", "サン・カンタン", 49.85, 3.29, F, None, "al", False),
    ("cambrai", "カンブレー・モーブージュ", 50.18, 3.23, F, None, "al", False),
    ("arras", "アラス", 50.29, 2.78, F, None, "al", False),
    ("amiens", "アミアン(ソンム川)", 49.89, 2.30, F, None, "al", False),
    ("abbeville", "アブヴィル(英仏海峡)", 50.10, 1.83, F, None, "al", False),
    ("lille", "リール", 50.63, 3.06, F, None, "al", True),
    ("dunkirk", "ダンケルク", 51.03, 2.37, F, "al", "al", False),
    ("calais", "カレー・ブローニュ", 50.85, 1.75, F, "al", "al", False),
    ("reims", "ランス(仏の後方)", 49.25, 4.03, F, "al", "al", True),
]

LINKS = [
    ("emmerich", "ijssel", "road"), ("ijssel", "grebbe", "road"), ("grebbe", "hague", "rail"),
    ("emmerich", "peel", "road"), ("peel", "moerdijk", "road"), ("moerdijk", "rotterdam", "road"), ("rotterdam", "hague", "road"),
    ("moerdijk", "antwerp", "road"), ("antwerp", "zeeland", "road"), ("peel", "maastricht", "rail"),
    ("aachen", "maastricht", "road"), ("maastricht", "albert-canal", "road"), ("aachen", "liege", "road"),
    ("albert-canal", "hannut", "road"), ("liege", "hannut", "road"), ("hannut", "gembloux", "road"),
    ("albert-canal", "dyle", "road"), ("dyle", "brussels", "road"), ("gembloux", "dyle", "road"), ("gembloux", "namur", "road"),
    ("liege", "namur", "rail"), ("namur", "dinant", "road"), ("namur", "cambrai", "road"),
    ("brussels", "antwerp", "rail"), ("brussels", "ghent", "rail"), ("antwerp", "ghent", "road"),
    ("ghent", "lille", "road"), ("ghent", "dunkirk", "road"), ("brussels", "lille", "road"),
    ("eifel", "ardennes-be", "track"), ("aachen", "ardennes-be", "track"), ("liege", "ardennes-be", "road"),
    ("ardennes-be", "dinant", "track"), ("ardennes-be", "sedan", "road"), ("ardennes-be", "montherme", "track"),
    ("sedan", "montcornet", "road"), ("montherme", "montcornet", "road"), ("dinant", "montcornet", "track"), ("dinant", "cambrai", "road"),
    ("sedan", "reims", "road"), ("montcornet", "reims", "road"), ("montcornet", "saint-quentin", "road"),
    ("saint-quentin", "cambrai", "road"), ("saint-quentin", "amiens", "road"), ("cambrai", "arras", "road"), ("cambrai", "lille", "road"),
    ("arras", "lille", "rail"), ("arras", "amiens", "road"), ("amiens", "abbeville", "road"), ("abbeville", "calais", "road"),
    ("calais", "dunkirk", "road"), ("dunkirk", "lille", "road"), ("reims", "amiens", "rail"), ("calais", "arras", "road"),
]
# 築城した地域(連合軍が守るときの塹壕線):グレッベ線・アルベール運河・リエージュ・ナミュールの要塞・アントウェルペン(TODO(要裏取り):出来上がり)
FORTIFIED = {"grebbe": "trench", "albert-canal": "trench", "liege": "trench", "namur": "trench", "antwerp": "trench"}

DE_INF = "de-ir-1939"
PZ = "de-pz-abt-1940"
PZ38 = "de-pz-abt-1940-38t"
DE_ART = "de-art-abt-lefh18"
FJ = "de-fjr-1944"
FR_INF = "fr-ir-1940"
FR_ART = "fr-art-grp-75"
S35 = "fr-s35-sqn-grp-1940"
B1 = "fr-b1-bn-1940"
H39 = "fr-h39-bn-1940"
BE_INF = "be-ir-1940"
BE_ART = "be-art-grp-1940"
NL_INF = "nl-ir-1940"
NL_ART = "nl-art-1940"
UK_DIV = "uk-inf-bde-1944"


def formation(fid, side, name, region, units, arrive=None, training=None, **extra):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    out = []
    for u in units:
        uid, toe, *rest = u
        d = L([("id", f"{fid}-{uid}"), ("toe", toe)])
        if training:
            d["training"] = training
        if rest:
            d["strength"] = rest[0]
        out.append(d)
    f["units"] = out
    return f


# 予定の撤退(ダイナモ作戦):5月26日から、ダンケルクにいる英大陸派遣軍は撤退できる。仏第1・第7軍の一部も5月29日から
DYNAMO = L([("stage", stage_of(date(1940, 5, 26))), ("from", ["dunkirk"])])
DYNAMO_FR = L([("stage", stage_of(date(1940, 5, 29))), ("from", ["dunkirk"])])


def panzer(*tags, czech=()):
    """装甲師団:戦車大隊(38(t) の師団は 38(t) の大隊)と歩兵連隊(狙撃兵旅団。6割)"""
    out = []
    for t in tags:
        out += [(f"{t}pz", PZ38 if t in czech else PZ), (f"{t}sr", DE_INF, 0.6)]
    return out


FORMATIONS = [
    # ---- 独軍 ----
    # B軍集団(ボック):第18軍(オランダ。第9装甲師団と歩兵)、第6軍(ベルギー。第16自動車化軍団=第3・第4装甲師団と歩兵)
    formation("de-18army", "de", "第18軍(キュヒラー)", "emmerich", panzer("9") + [("i1", DE_INF), ("i2", DE_INF), ("i3", DE_INF), ("art", DE_ART)], training="regular"),
    # 第7航空師団・第22空輸師団:5月10日にムールダイク・ドルトレヒト・ロッテルダムの橋と、ハーグの飛行場に降りた(ハーグでは失敗)。降下猟兵連隊(1944年)で代える
    formation("de-fj", "de", "降下部隊(第7航空師団・第22空輸師団)", "moerdijk", [("fj1", FJ, 0.7), ("fj2", FJ, 0.5)], arrive=START, training="veteran", landing=True),
    formation("de-6army", "de", "第6軍(ライヒェナウ)と第16自動車化軍団", "aachen", panzer("3", "4") + [("i1", DE_INF), ("i2", DE_INF), ("i3", DE_INF), ("i4", DE_INF), ("art", DE_ART)], training="veteran"),
    # A軍集団(ルントシュテット):クライスト装甲集団(第19軍団 グデーリアン=第1・第2・第10装甲、第41軍団 ラインハルト=第6・第8装甲)、
    # 第15軍団(ホート=第5・第7装甲)、第4・第12・第16軍の歩兵
    # 同じ地域から攻めるとき、戦闘に出る部隊は ID の順に選ばれる(1つの戦闘に8部隊まで)。初めは歩兵の軍団の ID が先で、
    # AI 同士でアルデンヌの戦闘に歩兵ばかりが出て負け続けたので、歩兵の ID を de-inf-… にして装甲の軍団を先にした
    formation("de-guderian", "de", "第19自動車化軍団(グデーリアン)", "eifel", panzer("1", "2", "10") + [("gd", DE_INF)], training="veteran"),
    formation("de-reinhardt", "de", "第41自動車化軍団(ラインハルト)", "eifel", panzer("6", "8", czech=("6", "8")), training="veteran"),
    formation("de-hoth", "de", "第15自動車化軍団(ホート。ロンメルの第7装甲)", "eifel", panzer("5", "7", czech=("7",)), training="veteran"),
    formation("de-inf-a", "de", "第4・第12軍の歩兵", "eifel", [("i1", DE_INF), ("i2", DE_INF), ("i3", DE_INF), ("i4", DE_INF), ("i5", DE_INF), ("art", DE_ART)], training="regular"),
    formation("de-inf-b", "de", "第16軍・第2軍の歩兵(後から)", "eifel", [("i1", DE_INF), ("i2", DE_INF), ("i3", DE_INF), ("i4", DE_INF), ("art", DE_ART)], arrive=date(1940, 5, 14), training="regular"),
    # ---- 連合軍 ----
    # オランダ軍(ヴィンケルマン):第2・第4軍団がグレッベ線、第3軍団がペール・ラーム線、軽師団・ホラント要塞の守備
    formation("nl-ijssel", "al", "アイセル線の大隊群", "ijssel", [("i1", NL_INF, 0.5)], training="green"),
    formation("nl-grebbe", "al", "オランダ第2・第4軍団(グレッベ線)", "grebbe", [("i1", NL_INF), ("i2", NL_INF), ("i3", NL_INF), ("art", NL_ART)], training="green"),
    formation("nl-peel", "al", "オランダ第3軍団(ペール・ラーム線)", "peel", [("i1", NL_INF), ("i2", NL_INF), ("art", NL_ART)], training="green"),
    formation("nl-fortress", "al", "ホラント要塞の守備と第1軍団", "hague", [("i1", NL_INF), ("i2", NL_INF), ("art", NL_ART)], training="green"),
    formation("nl-light", "al", "オランダ軽師団", "rotterdam", [("i1", NL_INF, 0.7)], training="green"),
    # ベルギー軍:第1軍団がアルベール運河、第3軍団がリエージュ要塞、予備はアントウェルペン(アルデンヌ猟兵は入れない)
    formation("be-albert", "al", "ベルギー第1軍団(アルベール運河)", "albert-canal", [("i1", BE_INF), ("i2", BE_INF), ("i3", BE_INF), ("art", BE_ART)], training="green"),
    formation("be-liege", "al", "ベルギー第3軍団(リエージュ要塞)", "liege", [("i1", BE_INF), ("i2", BE_INF), ("art", BE_ART)], training="regular"),
    formation("be-namur", "al", "ベルギー第7軍団(ナミュール要塞)", "namur", [("i1", BE_INF), ("i2", BE_INF)], training="green"),
    formation("be-reserve", "al", "ベルギー軍の予備(アントウェルペン)", "antwerp", [("i1", BE_INF), ("i2", BE_INF), ("i3", BE_INF), ("i4", BE_INF), ("art", BE_ART)], training="green"),
    # 仏第7軍(ジロー):ブレダへ急ぐ。仏第1軍(ブランシャール)と騎兵軍団(プリウー。第2・第3軽機械化師団=アニューの戦い)はジャンブルーへ
    formation("fr-7army", "al", "仏第7軍(ジロー。第1軽機械化師団つき)", "ghent", [("i1", FR_INF), ("i2", FR_INF), ("i3", FR_INF), ("i4", FR_INF), ("dlm", S35), ("art", FR_ART)], training="regular", withdraw=DYNAMO_FR),
    formation("fr-1army", "al", "仏第1軍(ブランシャール)", "cambrai", [("i1", FR_INF), ("i2", FR_INF), ("i3", FR_INF), ("i4", FR_INF), ("i5", FR_INF), ("art", FR_ART)], training="regular", withdraw=DYNAMO_FR),
    formation("fr-cav", "al", "騎兵軍団(第2・第3軽機械化師団)", "hannut", [("s1", S35), ("s2", S35), ("h1", H39), ("h2", H39)], training="regular"),
    # 仏第9軍(コラプ):ムーズ川のディナン〜モンテルメ。第2軍(ンツィジェール):スダン。B 級の予備役の師団が多かった(未熟)
    formation("fr-9army", "al", "仏第9軍(コラプ)", "dinant", [("i1", FR_INF), ("i2", FR_INF), ("i3", FR_INF), ("art", FR_ART)], training="green"),
    formation("fr-9army-s", "al", "仏第9軍の南翼(第102要塞師団)", "montherme", [("i1", FR_INF, 0.7)], training="green"),
    formation("fr-2army", "al", "仏第2軍(ンツィジェール。第55・第71師団)", "sedan", [("i1", FR_INF), ("i2", FR_INF), ("i3", FR_INF), ("art", FR_ART)], training="green"),
    # 英大陸派遣軍(ゴート):9個師団。ディール線(ルーヴァン)へ。第1陸軍戦車旅団(マチルダ。5月21日のアラスの反撃)
    formation("uk-bef", "al", "英大陸派遣軍(第1・第2軍団)", "lille", [("d1", UK_DIV), ("d2", UK_DIV), ("d3", UK_DIV), ("d4", UK_DIV), ("d5", UK_DIV), ("tk1", "uk-4rtr-1940"), ("tk2", "uk-7rtr-1940")], training="regular", withdraw=DYNAMO),
    formation("uk-bef-3", "al", "英大陸派遣軍(第3軍団)", "lille", [("d1", UK_DIV), ("d2", UK_DIV), ("d3", UK_DIV)], training="regular", withdraw=DYNAMO),
    # 仏の予備:第1〜第3機甲師団(B1 bis)、第4機甲師団(ド・ゴール。5月17日のモンコルネ)、ソンム川の新しい軍(5月下旬)
    formation("fr-dcr", "al", "仏第1〜第3機甲師団", "reims", [("b1", B1), ("b2", B1), ("h1", H39), ("i1", FR_INF, 0.5)], training="regular"),
    formation("fr-4dcr", "al", "仏第4機甲師団(ド・ゴール)", "reims", [("b1", B1), ("h1", H39)], arrive=date(1940, 5, 16), training="green"),
    formation("fr-somme", "al", "ソンム川の仏第6・第7軍", "amiens", [("i1", FR_INF), ("i2", FR_INF), ("i3", FR_INF), ("i4", FR_INF), ("art", FR_ART)], arrive=date(1940, 5, 22), training="regular"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。独:英仏海峡(アブヴィル)まで出て、ダンケルクとハーグを取れば決定的(史実)、アブヴィルなら限定的。
# 連合軍:スダンとアブヴィルを守れば決定的、ダンケルクと(ブリュッセルかアントウェルペン)を保てば限定的
VICTORY = L(
    [
        ("de", L([
            ("conditions", [cond("abbeville", "abbeville", 4), cond("dunkirk", "dunkirk", 3), cond("hague", "hague", 3), cond("brussels", "brussels", 2), cond("antwerp", "antwerp", 2),
                            cond("lille", "lille", 2), cond("sedan", "sedan", 1), loss("loss", 0.5, 3)]),
            ("decisive", L([("minPoints", 15), ("requires", ["abbeville", "dunkirk", "hague"])])),
            ("limited", L([("minPoints", 8), ("requires", ["abbeville"])])),
        ])),
        ("al", L([
            # スダンは5点:作戦の AI は勝利点5以上の地域に1つ残す(初めは3点で、仏の AI が1段階目に第2・第9軍をアルデンヌへ出してスダンを空けた)
            # 撤退:撤退できる英仏の部隊の戦力の4割以上をダンケルクから引き揚げれば3点(史実は約34万人)
            ("conditions", [cond("abbeville", "abbeville", 3), cond("sedan", "sedan", 5), cond("dunkirk", "dunkirk", 2), cond("brussels", "brussels", 2), cond("antwerp", "antwerp", 2),
                            cond("hague", "hague", 2), L([("id", "dynamo"), ("type", "withdrawn"), ("min", 0.4), ("points", 3)]), loss("loss", 1.0, 2)]),
            ("decisive", L([("minPoints", 12), ("requires", ["abbeville", "sedan"])])),
            ("limited", L([("minPoints", 6), ("requires", ["dunkirk"])])),
        ])),
    ]
)

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))
#  - 独:第2航空艦隊(B軍集団)・第3航空艦隊(A軍集団。第8航空軍団の急降下爆撃機がスダンの渡河を支えた)
#  - 連合:仏空軍(北東の作戦地域)、英の前進航空攻撃部隊(バトル・ブレニム。5月14日のスダンの橋への攻撃で大きく失った)・空軍の派遣部隊(ハリケーン)、
#    ダンケルクの上空は英本土の戦闘機軍団(5月26日から)
AIR_WINGS = [
    L([("id", "de-lf2"), ("side", "de"), ("name", "第2航空艦隊(ケッセルリンク)"), ("base", "emmerich"), ("rangeKm", 350), ("fighters", 6), ("strike", 9)]),
    L([("id", "de-lf3"), ("side", "de"), ("name", "第3航空艦隊(シュペルレ)と第8航空軍団"), ("base", "eifel"), ("rangeKm", 350), ("fighters", 7), ("strike", 11)]),
    L([("id", "fr-zoan"), ("side", "al"), ("name", "仏空軍(北東の作戦地域)"), ("base", "reims"), ("rangeKm", 300), ("fighters", 5), ("strike", 3)]),
    L([("id", "uk-aasf"), ("side", "al"), ("name", "英の前進航空攻撃部隊(バトル・ブレニム)"), ("base", "reims"), ("rangeKm", 400), ("fighters", 1), ("strike", 3)]),
    L([("id", "uk-air-component"), ("side", "al"), ("name", "英大陸派遣軍の空軍派遣部隊(ハリケーン)"), ("base", "lille"), ("rangeKm", 250), ("fighters", 2), ("strike", 1)]),
    L([("id", "uk-fighter-command"), ("side", "al"), ("name", "英本土の戦闘機軍団(ダンケルクの上空)"), ("base", "calais"), ("rangeKm", 200), ("fighters", 4), ("strike", 0), ("arriveStage", stage_of(date(1940, 5, 26)))]),
]
AIRBASES_EXTRA = ["calais"]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if airbase or rid in AIRBASES_EXTRA:
            r["airbase"] = True
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "al")])
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "fall-gelb-1940"),
            ("name", "黄作戦(西方戦役。1940年5〜6月)"),
            (
                "description",
                "B軍集団がオランダとベルギーに攻め入って連合軍の左翼を北へ引き寄せ、その間にクライスト装甲集団がアルデンヌを抜けてスダンでムーズ川を渡る。"
                "英仏海峡まで鎌を振り切れるか、連合軍は穴を塞いでダンケルクを守れるか。1段階は2日、13段階。v0・概略図(師団の数・位置の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/fall-gelb-1940.md。作り直しは tools/campaigns/build_fall_gelb_1940.py。部隊1つ≒1個師団。ベルギー・オランダの編成表は仮置き。マジノ線・ダンケルクの撤退の船・空挺のハーグの失敗は表していない"),
            ("era", "1940-west"),
            ("sides", [L([("id", "de"), ("name", "ドイツ軍")]), L([("id", "al"), ("name", "連合軍(仏・英・ベルギー・オランダ)")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            ("weather", [L([("stage", 1), ("weather", "clear")])]),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            ("rules", L([("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_dive_bomber")]))]))])),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "de"),
                        ("level", "decisive"),
                        ("summary", "5月13日にスダンでムーズ川を渡ったクライスト装甲集団は、20日にアブヴィルで英仏海峡に着いて連合軍を北と南に分けた。"
                                    "オランダは5月15日、ベルギーは28日に降伏し、英仏の約34万人がダンケルクから撤退した(6月4日まで)。6月5日から赤作戦でフランスの南へ進んだ"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
