#!/usr/bin/env python3
"""
レイテの戦い(1944年10月20日〜12月26日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_leyte_1944.py

出力: data/campaigns/leyte-1944.json

基地航空隊と艦隊が主役の作戦(ユーザー判断 2026-11。ガダルカナルの次)。米の第6軍が10月20日にレイテ島の東岸に上がり、
日本は捷一号作戦で栗田・西村・志摩・小沢の4つの艦隊を出し(レイテ沖海戦 10月23〜26日)、ルソン・ネグロスの航空隊で叩き、
多号作戦の船団でオルモックへ兵を送り込む。米はタクロバン・ドゥラグの飛行場に第5空軍を置き、12月7日にオルモックへ回り込む。
1段階は4日、17段階(レイテ沖海戦は2段階目)。特攻(神風)は表していない(仕組みがない)。
根拠と残りの裏取りは docs/research/leyte-1944-campaign.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。
艦隊・航空隊の顔ぶれと機数の多くは一般に知られた戦闘序列の概数で、検索の要約で確かめられたものは少ない(TODO(要裏取り))。
部隊の単位は連隊(米の1944年の歩兵連隊、日本の1944年の歩兵連隊。国ごとの実数の編成表)。陸の戦術の戦闘は生成器の編成 1944-leyte。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/leyte-1944.json"

START = date(1944, 10, 20)
DAYS_PER_STAGE = 4
END = date(1944, 12, 26)
TOD = "TODO(要裏取り)"


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。1度≒111km)"""
    return round((lon - 120.0) * 111, 1), round((lat - 5.0) * 111, 1)


# 地域:名前・緯度・経度・地形の傾向・補給の源・始めの持ち主・飛行場・港
# レイテ島の地域は戦いの舞台の町(位置は地図帳の値を丸めたもの。島の中は表示が重ならないよう少しずらした)
REGIONS = [
    ("tacloban", "タクロバン(飛行場)", 11.24, 125.00, "jungle", "us", "us", True, True),
    ("palo", "パロ・赤い丘", 11.12, 124.98, "jungle", None, "us", False, False),
    ("dulag", "ドゥラグ(飛行場)", 10.95, 125.03, "jungle", None, "us", True, False),
    ("burauen", "ブラウエン(飛行場群)", 10.98, 124.86, "jungle", None, "jp", True, False),
    ("dagami", "ダガミ", 11.06, 124.90, "jungle", None, "jp", False, False),
    ("jaro", "ハロ", 11.19, 124.78, "jungle", None, "jp", False, False),
    ("carigara", "カリガラ", 11.30, 124.68, "jungle", None, "jp", False, False),
    ("limon", "リモン・首折り尾根", 11.17, 124.58, "jungle", None, "jp", False, False),
    ("ormoc", "オルモック", 11.00, 124.61, "jungle", "jp", "jp", False, True),
    ("baybay", "バイバイ", 10.68, 124.80, "jungle", None, "jp", False, False),
    ("abuyog", "アブヨグ", 10.75, 125.01, "jungle", None, None, False, False),
    ("palompon", "パロンポン", 11.05, 124.38, "jungle", None, "jp", False, True),
    # 島の外の基地
    ("luzon", "ルソン(マニラ・クラーク)", 14.60, 120.98, "jungle", "jp", "jp", True, True),
    ("negros", "ネグロス(バコロド)", 10.67, 122.95, "jungle", None, "jp", True, False),
    ("morotai", "モロタイ・ウルシー(米の後方)", 4.0, 128.3, "jungle", "us", "us", True, True),
]

# 海域(艦隊だけが入れる)
SEAS = [
    ("sea-leyte-gulf", "レイテ湾", 10.85, 125.35, "us"),
    ("sea-surigao", "スリガオ海峡", 10.15, 125.40, None),
    ("sea-mindanao", "ミンダナオ海", 9.20, 124.30, "jp"),
    ("sea-camotes", "カモテス海・オルモック湾", 10.70, 124.40, "jp"),
    ("sea-visayan", "ビサヤ海・カリガラ湾", 11.60, 124.00, "jp"),
    ("sea-sibuyan", "シブヤン海", 12.50, 122.60, "jp"),
    ("sea-sanbernardino", "サンベルナルジノ海峡", 12.60, 124.30, None),
    ("sea-samar", "サマール沖", 11.60, 126.20, "us"),
    ("sea-philippine", "フィリピン海(サマールの東)", 12.80, 128.30, "us"),
    ("sea-engano", "エンガノ岬沖", 18.80, 126.00, None),
    ("sea-luzon", "南シナ海(マニラ湾沖)", 14.00, 119.50, "jp"),
    ("sea-sulu", "スールー海", 9.00, 121.50, "jp"),
]
SEA_LINKS = [
    # 海と陸
    ("sea-leyte-gulf", "tacloban"), ("sea-leyte-gulf", "palo"), ("sea-leyte-gulf", "dulag"), ("sea-leyte-gulf", "abuyog"),
    ("sea-camotes", "ormoc"), ("sea-camotes", "baybay"), ("sea-camotes", "palompon"), ("sea-visayan", "carigara"),
    ("sea-luzon", "luzon"), ("sea-philippine", "morotai"), ("sea-sulu", "negros"),
    # 海と海(栗田はシブヤン海からサンベルナルジノ海峡・サマール沖へ、西村・志摩はスールー海・ミンダナオ海からスリガオ海峡へ、
    # 小沢はエンガノ岬沖からハルゼーを北へ誘った。多号作戦の船団はマニラからシブヤン海・ビサヤ海・カモテス海を通ってオルモックへ)
    ("sea-leyte-gulf", "sea-surigao"), ("sea-leyte-gulf", "sea-samar"), ("sea-surigao", "sea-mindanao"), ("sea-mindanao", "sea-sulu"),
    ("sea-mindanao", "sea-camotes"), ("sea-camotes", "sea-visayan"), ("sea-visayan", "sea-sibuyan"), ("sea-sibuyan", "sea-sanbernardino"),
    ("sea-sibuyan", "sea-luzon"), ("sea-sibuyan", "sea-sulu"), ("sea-sanbernardino", "sea-samar"), ("sea-samar", "sea-philippine"),
    ("sea-philippine", "sea-engano"),
]
# レイテ島の中の結び(海岸の道・レイテ谷・オルモック谷・山越えの道)。{TOD}:1944年の道路
LINKS = [
    ("tacloban", "palo", "road"), ("palo", "dulag", "road"), ("dulag", "abuyog", "road"), ("abuyog", "baybay", "track"),
    ("palo", "jaro", "road"), ("dulag", "burauen", "road"), ("burauen", "dagami", "road"), ("dagami", "jaro", "road"),
    ("jaro", "carigara", "road"), ("tacloban", "carigara", "track"), ("carigara", "limon", "road"), ("limon", "ormoc", "road"),
    ("ormoc", "baybay", "road"), ("ormoc", "palompon", "road"),
]
# 島の中央の山脈は師団が越えられなかった(レイテ谷からオルモック谷へは、北のカリガラ〜リモン(首折り尾根)と、
# 南のアブヨグ〜バイバイの山道を回った)。ブラウエン〜オルモック・ダガミ〜リモンの山越えの道は入れない


def unit(uid, toe, training=None, strength=None, **extra):
    u = L([("id", uid), ("toe", toe)])
    if training:
        u["training"] = training
    if strength:
        u["strength"] = strength
    u.update(extra)
    return u


def formation(fid, side, name, region, units, arrive=None, **extra):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    f["units"] = units
    return f


def division(fid, side, name, region, regiments, artillery=1, tanks=0, arrive=None, training=None, toe=None, **extra):
    """師団:歩兵連隊(米 us-ir-1944・日本 jp-inf-regt-1944)・戦車大隊・砲兵大隊"""
    inf = toe or ("us-ir-1944" if side == "us" else "jp-inf-regt-1944")
    us = [unit(f"{fid}-{r}", inf, training) for r in regiments]
    us += [unit(f"{fid}-tk{i + 1}", "us-tank-bn-1944", training) for i in range(tanks)]
    us += [unit(f"{fid}-art{i + 1}", "artillery_battalion", training) for i in range(artillery)]
    return formation(fid, side, name, region, us, arrive, **extra)


def fleet(fid, side, name, region, ships, air=None, arrive=None, training=None):
    us = [unit(f"{fid}-{sid}", toe, training, squadron=sq) for sid, toe, sq in ships]
    us += [unit(f"{fid}-{sid}", toe, training, base=f"{fid}-{cv}") for sid, toe, cv in (air or [])]
    return formation(fid, side, name, region, us, arrive)


def essex(cv):
    """エセックス級の航空群(戦闘機・艦爆・艦攻。{TOD}:各艦の10月の機数)"""
    return [(f"{cv}-vf", "pa44-f6f-36", cv), (f"{cv}-vb", "pa44-sb2c-24", cv), (f"{cv}-vt", "pa44-tbm-18", cv)]


def cvl(cv):
    """インディペンデンス級の航空群"""
    return [(f"{cv}-vf", "pa44-f6f-24", cv), (f"{cv}-vt", "pa44-tbm-9", cv)]


def cve(cv):
    """護衛空母の航空群(FM-2 と TBM)"""
    return [(f"{cv}-vc", "pa44-fm2-16", cv), (f"{cv}-vt", "pa44-tbm-12", cv)]


DD_US = "us-dd-fletcher-1944"
DD_JP = "jp-dd-kagero"

FORMATIONS = [
    # ===== 米軍(陸。第6軍 クルーガー)=====
    # 10月20日:第10軍団(北。第1騎兵師団・第24師団)がタクロバン〜パロ、第24軍団(南。第7師団・第96師団)がドゥラグの近く。
    # 騎兵連隊は歩兵連隊より小さいが、歩兵連隊の編成表で代える({TOD}:第1騎兵師団の編成)
    division("us-1cav", "us", "第1騎兵師団", "tacloban", ["5c", "7c", "8c"], artillery=1),
    division("us-24div", "us", "第24歩兵師団", "palo", ["19", "34"], artillery=1),
    division("us-7div", "us", "第7歩兵師団", "dulag", ["17", "32", "184"], artillery=1, tanks=1),
    division("us-96div", "us", "第96歩兵師団", "dulag", ["381", "382", "383"], artillery=1, training="green"),
    # 増援:第32師団 11月14日、第11空挺師団 11月18日、第77師団 11月23日(12月7日にオルモックの南へ上陸)。日付は戦闘序列の要約
    division("us-32div", "us", "第32歩兵師団", "tacloban", ["126", "127", "128"], arrive=date(1944, 11, 14), via="sea-leyte-gulf"),
    division("us-11abn", "us", "第11空挺師団", "dulag", ["511", "187"], artillery=1, arrive=date(1944, 11, 18), toe="us-pir-1944", via="sea-leyte-gulf"),
    division("us-77div", "us", "第77歩兵師団", "dulag", ["305", "306", "307"], arrive=date(1944, 11, 23), via="sea-leyte-gulf"),
    # ===== 日本軍(陸。第35軍 鈴木)=====
    # 第16師団(牧野):上陸の時にレイテにいた(歩兵第9・第20・第33連隊)。{TOD}:配置
    division("jp-16div", "jp", "第16師団", "dagami", ["9", "20"], artillery=1, training="regular"),
    division("jp-16div-33", "jp", "第16師団(歩兵第33連隊)", "jaro", ["33"], artillery=0, training="regular"),
    # 多号作戦の増援(オルモックへ。全部で約3万4千人、第1・第8・第26・第30・第102師団の部隊を9つの船団で)。
    # 10月25日:第30師団の歩兵第41連隊 2,550人(ミンダナオから高速輸送艦で)。11月1日:第1師団の大半と第26師団の独立歩兵第12連隊。
    # 第26師団の主力は11月の船団で多くを失った。第102師団の3個大隊はパナイから。第68旅団は12月(パロンポンの近く)。{TOD}:日付と兵力
    division("jp-41", "jp", "歩兵第41連隊(第30師団)", "ormoc", ["41"], artillery=0, arrive=date(1944, 10, 25), express=True, via="sea-camotes"),
    # 多号作戦の船団も夜にオルモック湾へ入って揚げたので、東京急行と同じく express(カモテス海に米の艦隊がいれば着かない)
    division("jp-1div", "jp", "第1師団", "ormoc", ["1", "49", "57"], artillery=1, arrive=date(1944, 11, 1), express=True, via="sea-camotes", training="veteran"),
    division("jp-26div", "jp", "第26師団", "ormoc", ["12i", "11", "13"], artillery=1, arrive=date(1944, 11, 9), express=True, via="sea-camotes"),
    division("jp-102div", "jp", "第102師団(3個大隊)", "ormoc", ["77"], artillery=0, arrive=date(1944, 11, 5), express=True, via="sea-camotes"),
    division("jp-68bde", "jp", "第68旅団", "palompon", ["126"], artillery=1, arrive=date(1944, 12, 7), express=True, via="sea-camotes"),
    # ===== 米の艦隊 =====
    # 第7艦隊(キンケイド)の支援部隊(オルデンドルフ):旧式戦艦6・巡洋艦・駆逐艦・魚雷艇(既存のシナリオ surigao-1944-10-25 の顔ぶれから)
    fleet("us-tg772", "us", "第77.2任務群(オルデンドルフ)", "sea-leyte-gulf", [
        ("west-virginia", "us-bb-colorado", "戦艦"), ("maryland", "us-bb-colorado", "戦艦"), ("tennessee", "us-bb-tennessee", "戦艦"),
        ("california", "us-bb-tennessee", "戦艦"), ("mississippi", "us-bb-new-mexico", "戦艦"), ("pennsylvania", "us-bb-pennsylvania", "戦艦"),
        ("louisville", "us-ca-northampton", "巡洋艦"), ("portland", "us-ca-portland", "巡洋艦"), ("minneapolis", "us-ca-new-orleans", "巡洋艦"),
        ("denver", "us-cl-cleveland", "巡洋艦"), ("columbia", "us-cl-cleveland", "巡洋艦"),
        ("dd1", DD_US, "駆逐艦"), ("dd2", DD_US, "駆逐艦"), ("dd3", DD_US, "駆逐艦"), ("dd4", DD_US, "駆逐艦"),
        ("pt1", "us-pt-section", "魚雷艇"), ("pt2", "us-pt-section", "魚雷艇"),
    ], training="veteran"),
    # 護衛空母の部隊(タフィー3。スプレイグ):護衛空母6・駆逐艦3・護衛駆逐艦4(護衛駆逐艦は駆逐艦で代える)
    fleet("us-taffy3", "us", "タフィー3(護衛空母6)", "sea-samar", [
        ("fanshaw-bay", "us-cve-casablanca", "護衛空母"), ("st-lo", "us-cve-casablanca", "護衛空母"), ("white-plains", "us-cve-casablanca", "護衛空母"),
        ("kalinin-bay", "us-cve-casablanca", "護衛空母"), ("kitkun-bay", "us-cve-casablanca", "護衛空母"), ("gambier-bay", "us-cve-casablanca", "護衛空母"),
        ("hoel", DD_US, "駆逐艦"), ("heermann", DD_US, "駆逐艦"), ("johnston", DD_US, "駆逐艦"), ("de1", DD_US, "駆逐艦"),
    ], air=cve("fanshaw-bay") + cve("st-lo") + cve("white-plains") + cve("kalinin-bay") + cve("kitkun-bay") + cve("gambier-bay")),
    # タフィー1・2(護衛空母10)は数を抑えて6隻にまとめた(ユニットの数を抑えるため。{TOD})
    fleet("us-taffy12", "us", "タフィー1・2(護衛空母。6隻にまとめた)", "sea-leyte-gulf", [
        (f"cve{i}", "us-cve-casablanca", "護衛空母") for i in range(1, 7)
    ] + [("dd1", DD_US, "駆逐艦"), ("dd2", DD_US, "駆逐艦"), ("dd3", DD_US, "駆逐艦")], air=[x for i in range(1, 7) for x in cve(f"cve{i}")]),
    # 第3艦隊(ハルゼー)の第38任務部隊。4つの任務群のうち、10月24〜25日に間に合った3つ(第38.1任務群は給油に出ていて25日に戻った)。
    # 空母と護衛の割り振りは一般に知られた戦闘序列の概数({TOD}:Morison 第12巻の付録)
    fleet("us-tg382", "us", "第38.2任務群(ボーガン)", "sea-philippine", [
        ("intrepid", "us-cv-essex", "空母"), ("cabot", "us-cvl-independence", "空母"), ("independence", "us-cvl-independence", "空母"),
        ("iowa", "us-bb-iowa", "戦艦"), ("new-jersey", "us-bb-iowa", "戦艦"), ("biloxi", "us-cl-cleveland", "戦艦"),
        ("dd1", DD_US, "空母"), ("dd2", DD_US, "空母"), ("dd3", DD_US, "戦艦"), ("dd4", DD_US, "戦艦"),
    ], air=essex("intrepid") + cvl("cabot") + cvl("independence"), training="veteran"),
    fleet("us-tg383", "us", "第38.3任務群(シャーマン)", "sea-philippine", [
        ("essex", "us-cv-essex", "空母"), ("lexington", "us-cv-essex", "空母"), ("princeton", "us-cvl-independence", "空母"), ("langley", "us-cvl-independence", "空母"),
        ("washington", "us-bb-north-carolina", "戦艦"), ("massachusetts", "us-bb-south-dakota", "戦艦"), ("santa-fe", "us-cl-cleveland", "戦艦"),
        ("dd1", DD_US, "空母"), ("dd2", DD_US, "空母"), ("dd3", DD_US, "戦艦"),
    ], air=essex("essex") + essex("lexington") + cvl("princeton") + cvl("langley"), training="veteran"),
    fleet("us-tg384", "us", "第38.4任務群(デヴィソン)", "sea-philippine", [
        ("franklin", "us-cv-essex", "空母"), ("enterprise", "us-cv-yorktown", "空母"), ("san-jacinto", "us-cvl-independence", "空母"), ("belleau-wood", "us-cvl-independence", "空母"),
        ("alabama", "us-bb-south-dakota", "戦艦"), ("wichita", "us-ca-new-orleans", "戦艦"),
        ("dd1", DD_US, "空母"), ("dd2", DD_US, "空母"), ("dd3", DD_US, "戦艦"),
    ], air=essex("franklin") + essex("enterprise") + cvl("san-jacinto") + cvl("belleau-wood"), training="veteran"),
    fleet("us-tg381", "us", "第38.1任務群(マケイン)", "sea-philippine", [
        ("wasp", "us-cv-essex", "空母"), ("hornet", "us-cv-essex", "空母"), ("hancock", "us-cv-essex", "空母"), ("monterey", "us-cvl-independence", "空母"),
        ("chester", "us-ca-northampton", "空母"), ("dd1", DD_US, "空母"), ("dd2", DD_US, "空母"),
    ], air=essex("wasp") + essex("hornet") + essex("hancock") + cvl("monterey"), arrive=date(1944, 10, 25), training="veteran"),
    # 12月のオルモック湾の駆逐艦(多号作戦の船団を沈めた)。{TOD}:顔ぶれ
    fleet("us-ormoc-dd", "us", "オルモック湾の駆逐隊", "sea-leyte-gulf", [(f"dd{i}", DD_US, "駆逐隊") for i in range(1, 5)], arrive=date(1944, 11, 28)),
    # ===== 日本の艦隊(捷一号作戦)=====
    # 第一遊撃部隊(栗田):大和・武蔵・長門・金剛・榛名、重巡10、軽巡2、駆逐艦(15隻を8隻に)。熊野・鈴谷(最上型)は妙高型で代える({TOD})
    fleet("jp-kurita", "jp", "第一遊撃部隊(栗田)", "sea-sibuyan", [
        ("yamato", "jp-bb-yamato", "第1戦隊"), ("musashi", "jp-bb-yamato", "第1戦隊"), ("nagato", "jp-bb-nagato", "第1戦隊"),
        ("kongo", "jp-bb-kongo", "第3戦隊"), ("haruna", "jp-bb-kongo", "第3戦隊"),
        ("atago", "jp-ca-takao", "第4戦隊"), ("takao", "jp-ca-takao", "第4戦隊"), ("maya", "jp-ca-chokai", "第4戦隊"), ("chokai", "jp-ca-chokai", "第4戦隊"),
        ("myoko", "jp-ca-myoko", "第5戦隊"), ("haguro", "jp-ca-myoko", "第5戦隊"), ("kumano", "jp-ca-myoko", "第7戦隊"), ("suzuya", "jp-ca-myoko", "第7戦隊"),
        ("tone", "jp-ca-tone", "第7戦隊"), ("chikuma", "jp-ca-tone", "第7戦隊"),
        ("noshiro", "jp-cl-agano", "第2水雷戦隊"), ("yahagi", "jp-cl-agano", "第10戦隊"),
    ] + [(f"dd{i}", DD_JP, "第2水雷戦隊" if i <= 4 else "第10戦隊") for i in range(1, 9)], training="veteran"),
    # 第一遊撃部隊 第三部隊(西村):山城・扶桑・最上・駆逐艦4(既存のシナリオ surigao-1944-10-25 の顔ぶれから)
    fleet("jp-nishimura", "jp", "第三部隊(西村)", "sea-mindanao", [
        ("yamashiro", "jp-bb-fuso", "第2戦隊"), ("fuso", "jp-bb-fuso", "第2戦隊"), ("mogami", "jp-ca-mogami-1944", "第2戦隊"),
        ("michishio", DD_JP, "第4駆逐隊"), ("asagumo", DD_JP, "第4駆逐隊"), ("yamagumo", DD_JP, "第4駆逐隊"), ("shigure", DD_JP, "第4駆逐隊"),
    ], training="veteran"),
    # 第二遊撃部隊(志摩):重巡2・軽巡1・駆逐艦(7隻とする要約。4隻にした)
    fleet("jp-shima", "jp", "第二遊撃部隊(志摩)", "sea-sulu", [
        ("nachi", "jp-ca-myoko", "第21戦隊"), ("ashigara", "jp-ca-myoko", "第21戦隊"), ("abukuma", "jp-cl-5500t", "第1水雷戦隊"),
    ] + [(f"dd{i}", DD_JP, "第1水雷戦隊") for i in range(1, 5)], training="veteran"),
    # 機動部隊本隊(小沢):瑞鶴・瑞鳳・千歳・千代田と伊勢・日向。艦載機は約100機とする要約。囮としてハルゼーを北へ誘った
    fleet("jp-ozawa", "jp", "機動部隊本隊(小沢)", "sea-engano", [
        ("zuikaku", "jp-cv-shokaku", "第3航空戦隊"), ("zuiho", "jp-cvl-zuiho", "第3航空戦隊"), ("chitose", "jp-cvl-chitose", "第3航空戦隊"), ("chiyoda", "jp-cvl-chitose", "第3航空戦隊"),
        ("ise", "jp-bbcv-ise", "第4航空戦隊"), ("hyuga", "jp-bbcv-ise", "第4航空戦隊"),
        ("oyodo", "jp-cl-agano", "護衛"), ("tama", "jp-cl-5500t", "護衛"), ("isuzu", "jp-cl-5500t", "護衛"), ("dd1", DD_JP, "護衛"), ("dd2", DD_JP, "護衛"),
    ], air=[("zuikaku-vf", "pa44-a6m5-24", "zuikaku"), ("zuikaku-vb", "pa44-d4y-12", "zuikaku"), ("zuikaku-vt", "pa44-b6n-12", "zuikaku"),
            ("zuiho-vf", "pa44-a6m5-12", "zuiho"), ("chitose-vf", "pa44-a6m5-12", "chitose"), ("chiyoda-vf", "pa44-a6m5-12", "chiyoda"),
            ("scout", "pa44-jp-scout", "zuikaku")], training="green"),
    # 多号作戦の船団の護衛(駆逐艦)。{TOD}:船団ごとの顔ぶれ
    fleet("jp-ta-escort", "jp", "多号作戦の船団の護衛", "sea-camotes", [(f"dd{i}", DD_JP, "護衛") for i in range(1, 5)], arrive=date(1944, 10, 31)),
]

# 航空隊(編隊1つ=12機)。根拠は docs/research/leyte-1944-campaign.md「航空」
#  - 10月20〜22日に使えた機:第1航空艦隊 約30・第2航空艦隊 約240・第4航空軍 約173(USNI の表の要約)
#  - 米の第5空軍:第49戦闘群の P-38 が10月24〜27日にタクロバンへ(日付は出典で割れる)。B-25 は11月({TOD})。モロタイの B-24({TOD}:機数)
AIR_WINGS = [
    L([("id", "jp-1af"), ("side", "jp"), ("name", "第1航空艦隊(大西)"), ("base", "luzon"), ("rangeKm", 900), ("fighters", 1.5), ("strike", 1.0),
       ("navalToes", L([("fighter", "pa44-a6m5-12"), ("strike", "pa44-d4y-12")]))]),
    L([("id", "jp-2af-f"), ("side", "jp"), ("name", "第2航空艦隊(福留)戦闘機隊"), ("base", "luzon"), ("rangeKm", 900), ("fighters", 9.0), ("strike", 0),
       ("navalToes", L([("fighter", "pa44-a6m5-12")]))]),
    L([("id", "jp-2af-b"), ("side", "jp"), ("name", "第2航空艦隊(福留)攻撃隊"), ("base", "luzon"), ("rangeKm", 1200), ("fighters", 0), ("strike", 11.0),
       ("navalToes", L([("strike", "lb-g4m-torp-12"), ("scout", "lb-g3m-scout-3")]))]),
    L([("id", "jp-4aa"), ("side", "jp"), ("name", "第4航空軍(富永)"), ("base", "negros"), ("rangeKm", 600), ("fighters", 9.0), ("strike", 5.5),
       ("navalToes", L([("fighter", "pa44-ki43-12"), ("strike", "pa44-d4y-12")]))]),
    L([("id", "us-5af-f"), ("side", "us"), ("name", "第5空軍 第49戦闘群(P-38)"), ("base", "tacloban"), ("rangeKm", 700), ("fighters", 2.5), ("strike", 0), ("arriveStage", stage_of(date(1944, 10, 27))),
       ("navalToes", L([("fighter", "pa44-p38-12")]))]),
    L([("id", "us-5af-b"), ("side", "us"), ("name", "第5空軍 爆撃隊(B-25)"), ("base", "tacloban"), ("rangeKm", 700), ("fighters", 0), ("strike", 2.0), ("arriveStage", stage_of(date(1944, 11, 10))),
       ("navalToes", L([("strike", "pa44-b25-12")]))]),
    L([("id", "us-far-b24"), ("side", "us"), ("name", "極東空軍の重爆(B-24。モロタイ)"), ("base", "morotai"), ("rangeKm", 1500), ("fighters", 0), ("strike", 2.0),
       ("navalToes", L([("strike", "pa44-b24-12")]))]),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


# 勝利の条件(ゲームの決め方)。日本軍はレイテ湾に入って上陸の拠点(タクロバン)を取り返せば決定的、オルモックを保てば限定的。
# 米軍はオルモックとパロンポン(日本の最後の港)まで取れば決定的(史実:12月25日にパロンポンを取った)、タクロバン・ドゥラグを保てば限定的
VICTORY = L([
    ("jp", L([
        ("conditions", [cond("tacloban", "tacloban", 10), cond("leyte-gulf", "sea-leyte-gulf", 3), cond("ormoc", "ormoc", 3), cond("palompon", "palompon", 1), cond("burauen", "burauen", 1),
                        L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
        ("decisive", L([("minPoints", 10), ("requires", ["tacloban"])])),
        ("limited", L([("minPoints", 4), ("requires", ["ormoc"])])),
    ])),
    ("us", L([
        # タクロバン(揚陸の拠点・飛行場)は5点:作戦の AI が空けない(勝利点5以上の地域に1つ残す)
        ("conditions", [cond("tacloban", "tacloban", 5), cond("dulag", "dulag", 2), cond("ormoc", "ormoc", 4), cond("palompon", "palompon", 2), cond("carigara", "carigara", 1),
                        L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
        ("decisive", L([("minPoints", 12), ("requires", ["tacloban", "ormoc", "palompon"])])),
        ("limited", L([("minPoints", 6), ("requires", ["tacloban"])])),
    ])),
])


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
    # 港の補給の源は、面した海域を敵に押さえられると働かない(タクロバンは海岸の揚陸の拠点、オルモックは多号作戦の港)
    regions["tacloban"]["supplyVia"] = "sea-leyte-gulf"
    regions["ormoc"]["supplyVia"] = "sea-camotes"
    regions["luzon"]["supplyVia"] = "sea-luzon"
    regions["morotai"]["supplyVia"] = "sea-philippine"
    return L([
        ("id", "leyte-1944"),
        ("name", "レイテの戦い(1944年10月〜12月)"),
        ("description",
         "米の第6軍がレイテ島の東岸に上がる。日本は捷一号作戦で4つの艦隊を出してレイテ湾へ突入を図り、ルソンとネグロスの航空隊で叩き、"
         "多号作戦の船団でオルモックへ兵を送り込む。米は飛行場を開いて第5空軍を置き、オルモックとパロンポンを目指す。1段階は4日、17段階。v0・概略図"),
        ("notes",
         "根拠は docs/research/leyte-1944-campaign.md。作り直しは tools/campaigns/build_leyte_1944.py。特攻(神風)、12月6日の空挺による飛行場への攻撃、"
         "サマール島・ミンドロ島は表していない。護衛空母はタフィー1・2を6隻にまとめた。艦隊と航空隊の顔ぶれの多くは仮置き"),
        ("era", "1944-leyte"),
        ("sides", [L([("id", "us"), ("name", "米軍")]), L([("id", "jp"), ("name", "日本軍")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stage_of(END))])),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS] + [L([("a", a), ("b", b), ("kind", "sea")]) for a, b in SEA_LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("naval", L([
            ("weapons", ["naval-generic", "pacific-ships-1942", "pacific-ships-1944", "pacific-landair-1941", "midway-1942", "pacific-air-1944"]),
            ("toe", ["naval-generic", "pacific-ships-1942", "pacific-ships-1944", "pacific-landair-1941", "midway-1942", "pacific-air-1944"]),
        ])),
        ("rules", L([
            # 多号作戦:オルモック湾の米の航空隊の届く海域を通れば戦力の15%を失い(多くの船団が沈められた)、補給は4割だけ届く(仮置き)
            ("nightExpress", L([("jp", L([("loss", 0.15), ("supplyShare", 0.4)]))])),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "us"),
            ("level", "decisive"),
            ("summary", "レイテ沖海戦で日本は武蔵・山城・扶桑・瑞鶴ほか多くの艦を失い、栗田はレイテ湾の手前で引き返した。米は12月7日にオルモックの南へ上がり、"
                        "10日にオルモック、25日にパロンポンを取った。日本の第35軍は島の西部に追い込まれた"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
