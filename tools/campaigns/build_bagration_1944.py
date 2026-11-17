#!/usr/bin/env python3
"""
バグラチオン作戦(白ロシアの攻勢。1944年6月22日〜7月31日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_bagration_1944.py

出力: data/campaigns/bagration-1944.json

6月22〜23日、第1バルト・第3・第2・第1白ロシア戦線がヴィテプスク・オルシャ・モギリョフ・ボブルイスクで中央軍集団(ブッシュ→モーデル)を攻めた。
ヒトラーが「要塞」として退くのを禁じたヴィテプスク(26日)・ボブルイスク(27〜29日)で軍団ごと包まれ、7月3日にミンスクが落ち、東の第4軍の約10万人が包囲された。
ソ連軍はその後ヴィリニュス(13日)・バラノヴィチ(8日)へ進み、7月18日からは第1白ロシア戦線の左翼がコヴェリからルブリン・ブレストへ攻めた。
根拠と残りの裏取りは docs/research/bagration-1944.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:モスクワ前面・スターリングラードと同じく、1個の部隊をおおよそ1個師団(1944年の国ごとの実数の編成表で代える)。
独の歩兵師団は1944年の擲弾兵連隊の編成表(戦力8割)、装甲師団は IV号の戦車大隊と擲弾兵連隊。ソ連の狙撃兵師団は1944年の狙撃兵連隊(定数を割っていたので戦力6割)、
戦車軍団は T-34-85 の戦車旅団2つ。師団の数・軍の位置・着いた日の多くは TODO(要裏取り)
(出典候補:Zaloga『Bagration 1944』(Osprey)、Glantz & Orenstein『Belorussia 1944: The Soviet General Staff Study』、Dunn『Soviet Blitzkrieg』、
Niepold『Battle for White Russia』、Glantz & House『When Titans Clashed』)。
1段階は4日(6月22日を1日目として10段階で7月31日まで)。白ロシアの森と沼は西欧の農村で代える(TODO:森と沼の地形の傾向)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/bagration-1944.json"

START = date(1944, 6, 22)
DAYS_PER_STAGE = 4
STAGES = 10


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯54度で約65km、緯度1度は約111km)"""
    return round((lon - 23.0) * 65, 1), round((lat - 52.0) * 111, 1)


F = "western-farmland"
# 地域:名前、緯度、経度、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 独の前線の「要塞」と後方(中央軍集団)
    ("polotsk", "ポロツク", 55.49, 28.79, None, "de", False),
    ("vitebsk", "ヴィテプスク(要塞)", 55.19, 30.20, None, "de", False),
    ("beshenkovichi", "ベシェンコヴィチ・レペリ", 55.05, 29.45, None, "de", False),
    ("orsha", "オルシャ(要塞)", 54.51, 30.42, None, "de", True),
    ("mogilev", "モギリョフ(要塞)", 53.90, 30.33, None, "de", False),
    ("rogachev", "ロガチョフ・ジュロビン", 53.09, 30.05, None, "de", False),
    ("bobruisk", "ボブルイスク(要塞)", 53.14, 29.22, None, "de", True),
    ("borisov", "ボリソフ(ベレジナ川)", 54.23, 28.50, None, "de", False),
    ("berezino", "ベレジノ(ベレジナ川の渡河)", 53.84, 28.99, None, "de", False),
    ("minsk", "ミンスク", 53.90, 27.56, None, "de", True),
    ("slutsk", "スルツク", 53.03, 27.56, None, "de", False),
    ("molodechno", "モロデチノ", 54.31, 26.85, None, "de", False),
    ("baranovichi", "バラノヴィチ", 53.13, 26.01, None, "de", True),
    ("vilnius", "ヴィリニュス", 54.69, 25.28, "de", "de", True),
    ("lida", "リダ・グロドノ", 53.89, 25.30, "de", "de", False),
    ("pinsk", "ピンスク(プリピャチ沼沢地・第2軍)", 52.11, 26.10, None, "de", False),
    ("brest", "ブレスト・リトフスク", 52.10, 23.70, "de", "de", True),
    # ソ連の出撃の地
    ("gorodok", "ゴロドク・ネヴェリ(第1バルト戦線)", 55.47, 29.99, "su", "su", True),
    ("liozno", "リオズノ(第3白ロシア戦線の北)", 55.03, 30.80, None, "su", False),
    ("krasnoe", "クラスノエ・ドゥブロヴノ(第3白ロシア戦線の南)", 54.55, 31.10, "su", "su", True),
    ("chausy", "チャウスイ(第2白ロシア戦線)", 53.80, 30.97, "su", "su", True),
    ("gomel", "ゴメリ(第1白ロシア戦線の北)", 52.43, 31.00, "su", "su", True),
    ("parichi", "パリチ・オザリチ(第1白ロシア戦線の南)", 52.80, 29.42, None, "su", False),
    ("mozyr", "モズィリ・サルヌイ(プリピャチの南)", 52.05, 29.24, None, "su", False),
    ("kovel", "コヴェリ(第1白ロシア戦線の左翼)", 51.21, 24.71, "su", "su", True),
]
LINKS = [
    ("gorodok", "polotsk", "road"), ("gorodok", "vitebsk", "road"), ("liozno", "vitebsk", "rail"), ("liozno", "krasnoe", "road"),
    ("liozno", "gorodok", "road"), ("krasnoe", "orsha", "rail"), ("krasnoe", "chausy", "road"), ("chausy", "mogilev", "road"),
    ("chausy", "gomel", "road"), ("gomel", "rogachev", "rail"), ("gomel", "parichi", "road"), ("parichi", "bobruisk", "road"),
    ("parichi", "mozyr", "road"), ("mozyr", "pinsk", "track"), ("mozyr", "kovel", "track"),
    ("polotsk", "vitebsk", "rail"), ("polotsk", "beshenkovichi", "road"), ("polotsk", "molodechno", "rail"), ("polotsk", "vilnius", "road"),
    ("vitebsk", "beshenkovichi", "road"), ("vitebsk", "orsha", "rail"), ("beshenkovichi", "borisov", "road"),
    ("orsha", "mogilev", "rail"), ("orsha", "borisov", "rail"), ("mogilev", "berezino", "road"), ("mogilev", "rogachev", "rail"),
    ("rogachev", "bobruisk", "rail"), ("rogachev", "berezino", "track"), ("bobruisk", "berezino", "road"), ("bobruisk", "slutsk", "road"),
    ("bobruisk", "minsk", "rail"), ("borisov", "minsk", "rail"), ("berezino", "minsk", "road"), ("borisov", "berezino", "track"),
    ("borisov", "molodechno", "road"), ("minsk", "molodechno", "rail"), ("minsk", "slutsk", "road"), ("minsk", "baranovichi", "rail"),
    ("slutsk", "baranovichi", "road"), ("slutsk", "pinsk", "track"), ("molodechno", "vilnius", "rail"), ("molodechno", "lida", "rail"),
    ("baranovichi", "lida", "rail"), ("baranovichi", "brest", "rail"), ("baranovichi", "pinsk", "rail"), ("vilnius", "lida", "rail"),
    ("lida", "brest", "road"), ("pinsk", "brest", "rail"), ("kovel", "brest", "rail"),
]
# ヒトラーの「要塞」(独が守るときの塹壕線)。ヴィテプスク・オルシャ・モギリョフ・ボブルイスク。TODO(要裏取り):1944年の陣地の築き具合
FORTIFIED = ["vitebsk", "orsha", "mogilev", "bobruisk"]

GR = "de-gr-1944"
PZ = "de-pz4-abt-1944"
STUG = "de-stug-brigade-1944"
RIFLE = "su-rifle-regt-1944"
TBDE = "su-tank-bde-1944"
SU76 = "su-sp-regt-su76"
RIFLE_STRENGTH = 0.6
GR_STRENGTH = 0.8


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    out = []
    for u, toe in units:
        d = L([("id", f"{fid}-{u}"), ("toe", toe)])
        if training:
            d["training"] = training
        st = strength if strength is not None else (RIFLE_STRENGTH if toe == RIFLE else GR_STRENGTH if toe == GR else None)
        if st:
            d["strength"] = st
        out.append(d)
    f["units"] = out
    return f


def inf(n, extra=()):
    return [(f"i{i + 1}", GR) for i in range(n)] + list(extra)


def panzer(n):
    return [u for i in range(n) for u in ((f"pz{i + 1}", PZ), (f"pg{i + 1}", GR))]


def rifle(n, tanks=0, sp=0):
    return [(f"r{i + 1}", RIFLE) for i in range(n)] + [(f"tb{i + 1}", TBDE) for i in range(tanks)] + [(f"sp{i + 1}", SU76) for i in range(sp)]


FORMATIONS = [
    # ===== 独軍(中央軍集団)=====
    # 第3装甲軍(ラインハルト):第53軍団がヴィテプスクの要塞(4個師団)、第9軍団が北、第6軍団が南
    formation("de-liii", "de", "第53軍団(ヴィテプスクの要塞)", "vitebsk", inf(4), training="regular"),
    formation("de-ix", "de", "第9軍団", "polotsk", inf(2), training="regular"),
    formation("de-vi", "de", "第6軍団", "beshenkovichi", inf(3, [("sg", STUG)]), training="regular"),
    # 第4軍(ティッペルスキルヒ):第27軍団がオルシャ、第39装甲軍団(フェルトヘルンハレ)・第12軍団がモギリョフ
    formation("de-xxvii", "de", "第27軍団(オルシャ)", "orsha", inf(3, [("sg", STUG)]), training="veteran"),
    formation("de-xxxix", "de", "第39装甲軍団・第12軍団(モギリョフ)", "mogilev", inf(5, [("pz", PZ)]), training="regular"),
    # 第9軍(ヨルダン):第35軍団がロガチョフ、第41装甲軍団と第20装甲師団がボブルイスク
    formation("de-xxxv", "de", "第35軍団(ロガチョフ)", "rogachev", inf(4), training="regular"),
    formation("de-xli", "de", "第41装甲軍団と第20装甲師団(ボブルイスク)", "bobruisk", inf(3) + panzer(1), training="regular"),
    # 後方の守りと警備の師団
    formation("de-minsk", "de", "ミンスクの警備の師団", "minsk", inf(2), training="green", strength=0.6),
    formation("de-vilnius", "de", "ヴィリニュスの守備", "vilnius", inf(1), training="green", strength=0.6),
    # 第2軍(プリピャチ沼沢地の南。攻勢の主な正面の外)
    formation("de-2a", "de", "第2軍", "pinsk", inf(4), training="regular"),
    formation("de-brest", "de", "ブレストの守備", "brest", inf(1), training="green", strength=0.6),
    # 後から:北ウクライナ軍集団から回された装甲師団(第5装甲は6月26日ボリソフ、第12装甲は28日ボブルイスクの西、第4装甲は7月初めバラノヴィチ)
    formation("de-5pz", "de", "第5装甲師団(ティーガーの大隊つき)", "borisov", panzer(1) + [("tg", "de-tiger-abt-1943")], arrive=date(1944, 6, 26), training="veteran"),
    formation("de-12pz", "de", "第12装甲師団", "slutsk", panzer(1), arrive=date(1944, 6, 28), training="regular"),
    formation("de-4pz", "de", "第4装甲師団", "baranovichi", panzer(1), arrive=date(1944, 7, 2), training="veteran"),
    formation("de-reserve", "de", "東プロイセン・ポーランドからの補充の師団", "lida", inf(3), arrive=date(1944, 7, 6), training="green", strength=0.7),
    # ===== ソ連軍 =====
    # 第1バルト戦線(バグラミャン):第6親衛軍・第43軍、第1戦車軍団
    formation("su-1bf", "su", "第1バルト戦線(第6親衛軍・第43軍・第1戦車軍団)", "gorodok", rifle(7, tanks=2), training="regular"),
    # 第3白ロシア戦線(チェルニャホフスキー):第39軍・第5軍(北)、第11親衛軍・第31軍(南)、第5親衛戦車軍、騎兵機械化集団(オスリコフスキー)
    formation("su-3bf-n", "su", "第3白ロシア戦線の北(第39軍・第5軍)", "liozno", rifle(7, tanks=1, sp=1), training="regular"),
    formation("su-3bf-s", "su", "第3白ロシア戦線の南(第11親衛軍・第31軍)", "krasnoe", rifle(7, tanks=1, sp=1), training="regular"),
    formation("su-5gta", "su", "第5親衛戦車軍(ロトミストロフ)", "krasnoe", rifle(1, tanks=4), training="veteran"),
    formation("su-oslik", "su", "騎兵機械化集団(オスリコフスキー)", "liozno", rifle(1, tanks=2), training="regular"),
    # 第2白ロシア戦線(ザハロフ):第33・第49・第50軍
    formation("su-2bf", "su", "第2白ロシア戦線(第33・第49・第50軍)", "chausy", rifle(8, sp=1), training="regular"),
    # 第1白ロシア戦線の右翼(ロコソフスキー):北の群(第3軍・第48軍・第9戦車軍団)、南の群(第65軍・第28軍・第1親衛戦車軍団・騎兵機械化集団(プリーエフ))
    formation("su-1bel-n", "su", "第1白ロシア戦線の北の群(第3軍・第48軍・第9戦車軍団)", "gomel", rifle(8, tanks=2), training="regular"),
    formation("su-1bel-s", "su", "第1白ロシア戦線の南の群(第65軍・第28軍・第1親衛戦車軍団)", "parichi", rifle(7, tanks=2, sp=1), training="regular"),
    formation("su-pliev", "su", "騎兵機械化集団(プリーエフ)", "parichi", rifle(1, tanks=2), training="veteran"),
    formation("su-61a", "su", "第61軍(プリピャチの南)", "mozyr", rifle(3), training="regular"),
    # 後から:第1白ロシア戦線の左翼(ルブリン・ブレスト作戦。7月18日、コヴェリから。第8親衛軍・第47軍・第2戦車軍ほか)、
    # 第2親衛軍・第51軍(第1バルト戦線の増強。7月上旬)。日付・場所・師団の数は TODO(要裏取り)
    formation("su-1bel-l", "su", "第1白ロシア戦線の左翼(第8親衛軍・第47軍・第2戦車軍)", "kovel", rifle(8, tanks=4, sp=1), arrive=date(1944, 7, 18), training="veteran"),
    formation("su-2ga", "su", "第2親衛軍・第51軍(第1バルト戦線の増強)", "gorodok", rifle(6, tanks=1), arrive=date(1944, 7, 4), training="regular"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。ソ:要塞を落としてミンスクを取れば決定的(史実)、ヴィテプスクかボブルイスクで限定的。
# 独:ミンスクと要塞を2つ以上保てば決定的、ミンスクを保てば限定的
VICTORY = L([
    ("su", L([
        ("conditions", [cond("vitebsk", "vitebsk", 2), cond("orsha", "orsha", 1), cond("mogilev", "mogilev", 1), cond("bobruisk", "bobruisk", 2),
                        cond("minsk", "minsk", 5), cond("vilnius", "vilnius", 2), cond("baranovichi", "baranovichi", 1), cond("brest", "brest", 2), loss("loss", 2.0, 2)]),
        ("decisive", L([("minPoints", 14), ("requires", ["minsk", "vitebsk", "bobruisk"])])),
        ("limited", L([("minPoints", 5), ("requires", [])])),
    ])),
    ("de", L([
        ("conditions", [cond("minsk", "minsk", 5), cond("vitebsk", "vitebsk", 2), cond("bobruisk", "bobruisk", 2), cond("orsha", "orsha", 1),
                        cond("mogilev", "mogilev", 1), cond("vilnius", "vilnius", 1), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 11), ("requires", ["minsk", "vitebsk", "bobruisk"])])),
        ("limited", L([("minPoints", 7), ("requires", ["minsk"])])),
    ])),
])

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))。
#  - 独:第6航空艦隊(グライム)。6月には多くの戦闘機を本土の防空とノルマンディーへ回していた
#  - ソ:第3航空軍(第1バルト)・第1航空軍(第3白ロシア)・第4航空軍(第2白ロシア)・第16航空軍(第1白ロシア)と長距離航空軍。合わせて約5千機とされる
AIR_WINGS = [
    L([("id", "de-6lf"), ("side", "de"), ("name", "第6航空艦隊"), ("base", "minsk"), ("rangeKm", 350), ("fighters", 1.5), ("strike", 2)]),
    L([("id", "de-6lf-s"), ("side", "de"), ("name", "第6航空艦隊の一部(ボブルイスク)"), ("base", "bobruisk"), ("rangeKm", 300), ("fighters", 1), ("strike", 1)]),
    L([("id", "su-3va"), ("side", "su"), ("name", "第3航空軍"), ("base", "gorodok"), ("rangeKm", 300), ("fighters", 5), ("strike", 6)]),
    L([("id", "su-1va"), ("side", "su"), ("name", "第1航空軍"), ("base", "krasnoe"), ("rangeKm", 300), ("fighters", 6), ("strike", 8)]),
    L([("id", "su-4va"), ("side", "su"), ("name", "第4航空軍"), ("base", "chausy"), ("rangeKm", 300), ("fighters", 3), ("strike", 4)]),
    L([("id", "su-16va"), ("side", "su"), ("name", "第16航空軍"), ("base", "gomel"), ("rangeKm", 300), ("fighters", 6), ("strike", 8)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, supply, owner, airbase in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", F)])
        if supply:
            r["supply"] = supply
        if airbase:
            r["airbase"] = True
        if rid in FORTIFIED:
            r["fortified"] = L([("works", "trench"), ("side", "de")])
        regions[rid] = r
        control[rid] = owner
    return L([
        ("id", "bagration-1944"),
        ("name", "バグラチオン作戦(1944年6〜7月)"),
        ("description",
         "白ロシアの攻勢。ソ連の4つの戦線が中央軍集団の「要塞」ヴィテプスク・オルシャ・モギリョフ・ボブルイスクを同時に攻め、ベレジナ川を越えてミンスクへ迫る。"
         "独軍は退かずに要塞を守るか、装甲師団の救援が間に合うか。1段階は4日、10段階。v0・概略図(師団の数・日付の多くは要裏取り)"),
        ("notes", "根拠は docs/research/bagration-1944.md。作り直しは tools/campaigns/build_bagration_1944.py。部隊1つ≒1個師団(1944年の国ごとの実数の編成表)。"
                  "パルチザンの鉄道の破壊は、独の備蓄の上限で代える。白ロシアの森と沼は西欧の農村で代えた"),
        ("era", "1944-ostfront"),
        ("sides", [L([("id", "de"), ("name", "ドイツ軍(中央軍集団)")]), L([("id", "su"), ("name", "ソ連軍")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        ("weather", [L([("stage", 1), ("weather", "clear")]), L([("stage", 4), ("weather", "overcast")]), L([("stage", 6), ("weather", "clear")])]),
        ("seasons", [L([("stage", 1), ("name", "夏")])]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("rules", L([
            # 補充:独は東部戦線に回す兵が乏しかった。ソは予備から送った(仮置き)
            ("replacementBySide", L([("de", 0.01), ("su", 0.03)])),
            # 独の燃料・弾薬:6月19〜20日夜からのパルチザンの鉄道の破壊(1万か所を超えたとされる)で輸送が乱れた(仮置き)
            ("stockCap", L([("de", L([("ammo", 0.8), ("fuel", 0.6)]))])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_dive_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "su"),
            ("level", "decisive"),
            ("summary", "6月26日にヴィテプスク、27〜29日にボブルイスクで軍団ごと包まれ、オルシャ・モギリョフも落ちた。7月3日にミンスクが落ち、東の第4軍の約10万人が包囲された。"
                        "中央軍集団は約28個師団を失い(数は出典で差がある)、ソ連軍は7月13日にヴィリニュス、28日にブレストを取った"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
