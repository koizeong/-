#!/usr/bin/env python3
"""
スターリングラードの包囲(天王星作戦〜冬の嵐作戦〜小土星作戦〜鉄環作戦。1942年11月19日〜1943年2月2日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_uranus_1942.py

出力: data/campaigns/uranus-1942.json

11月19日、南西戦線とドン戦線がセラフィモヴィチとクレツカヤの橋頭堡から第3ルーマニア軍を破り、20日にスターリングラード戦線が南の第4ルーマニア軍を破った。
23日に両翼はカラチ・ソヴェツキーで手をつなぎ、第6軍(パウルス)の約25〜30万人を包んだ(数は出典で差がある)。
12月12日からホトの冬の嵐作戦(第57装甲軍団)がコテリニコヴォから北へ進み、ミシュコヴァ川で止まった(第2親衛軍)。
12月16日からの小土星作戦で中ドンのイタリア第8軍が破られ、タツィンスカヤ・モロゾフスクの空輸の飛行場が脅かされた。
1月10日からの鉄環作戦で包囲の輪を縮め、2月2日に北の包囲陣が降伏した。
根拠と残りの裏取りは docs/research/uranus-1942.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:モスクワ前面・青作戦と同じく、1個の部隊をおおよそ1個師団。装甲師団は戦車連隊と自動車化歩兵連隊の2つ、ソ連の戦車・機械化軍団は戦車旅団。
ルーマニア軍・イタリア軍の師団は、編成表がないので独の歩兵連隊の編成表を未熟・戦力6割で代える(TODO:国ごとの編成表)。
師団の数・軍の位置・着いた日の多くは TODO(要裏取り)
(出典候補:Glantz & House『Endgame at Stalingrad』(全2巻)・『When Titans Clashed』、Beevor『Stalingrad』、
Hayward『Stopping Hitler at Stalingrad』(航空・空輸)、Kehrig『Stalingrad』、Raus『Panzer Operations』(第6装甲師団))。
1段階は5日(11月19日を1日目として16段階で2月2日まで)。
空輸は表していない(第6軍の補給は始めの携行備蓄で代える)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/uranus-1942.json"

START = date(1942, 11, 19)
DAYS_PER_STAGE = 5
STAGES = 16


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯48.5度で約74km、緯度1度は約111km)"""
    return round((lon - 40.0) * 74, 1), round((lat - 47.0) * 111, 1)


S, F = "steppe", "western-farmland"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地
REGIONS = [
    # スターリングラードと包囲の内側
    ("stalingrad", "スターリングラード(市街の廃墟)", 48.71, 44.51, F, None, "de", False),
    ("gumrak", "グムラク・ピトムニク(飛行場)", 48.78, 44.33, S, None, "de", True),
    ("vertyachy", "ドン川の湾曲部(ヴェルチャチー)", 49.05, 43.85, S, None, "de", False),
    ("karpovka", "カルポフカ・マリノフカ", 48.70, 43.98, S, None, "de", False),
    ("kalach", "カラチ・ソヴェツキー(ドンの橋)", 48.69, 43.53, S, None, "de", False),
    # 包囲の外の北西:第3ルーマニア軍とチル川
    ("raspopinskaya", "ラスポピンスカヤ(第3ルーマニア軍の陣地)", 49.40, 42.95, S, None, "de", False),
    ("perelazovsky", "ペレラゾフスキー(第48装甲軍団)", 49.17, 42.55, S, None, "de", False),
    ("surovikino", "スロヴィキノ(チル川下流)", 48.60, 42.85, S, None, "de", False),
    ("nizhne-chirskaya", "ニージネ・チルスカヤ(ドンとチルの合流)", 48.37, 43.10, S, None, "de", False),
    ("chernyshevskaya", "チェルヌィシェフスカヤ(チル川上流・ホリト)", 48.43, 42.23, S, None, "de", False),
    # 包囲の外の南:第4ルーマニア軍とコテリニコヴォへの道
    ("sarpa", "サルパ湖沼地帯(第4ルーマニア軍)", 48.30, 44.55, S, None, "de", False),
    ("abganerovo", "アブガネロヴォ", 48.15, 44.20, S, None, "de", False),
    ("myshkova", "ミシュコヴァ川(ヴェルフネ・クムスキー)", 48.05, 43.80, S, None, "de", False),
    ("kotelnikovo", "コテリニコヴォ(冬の嵐の出撃の地)", 47.63, 43.15, S, "de", "de", False),
    # 後方:空輸の飛行場と中ドン
    ("morozovsk", "モロゾフスク・タツィンスカヤ(空輸の飛行場)", 48.30, 41.60, S, "de", "de", True),
    ("millerovo", "ミレロヴォ", 48.92, 40.40, S, None, "de", False),
    ("boguchar", "ボグチャル(中ドン・イタリア第8軍)", 49.93, 40.55, S, None, "de", False),
    ("rostov", "ロストフ(南方の後方)", 47.23, 39.72, F, "de", "de", True),
    # ソ連軍の地域
    ("serafimovich", "セラフィモヴィチの橋頭堡", 49.58, 42.74, S, None, "su", True),
    ("kletskaya", "クレツカヤの橋頭堡", 49.32, 43.06, S, None, "su", False),
    ("ilovlya", "イロヴリャ・カチャリンスカヤ(ドン戦線)", 49.30, 44.00, S, "su", "su", True),
    ("volga-east", "クラスナヤ・スロボダ(ヴォルガ東岸・第62軍の渡河)", 48.70, 44.60, S, "su", "su", False),
    ("beketovka", "ベケトフカ(第64軍)", 48.60, 44.45, F, None, "su", False),
    ("raigorod", "ライゴロド(ヴォルガの渡河・第51軍)", 48.42, 44.95, S, "su", "su", True),
    ("verkhny-mamon", "ヴェルフニー・マモン(中ドンの橋頭堡)", 50.17, 40.38, S, "su", "su", False),
    ("frolovo", "フロロヴォ(南西戦線の後方)", 49.77, 43.65, S, "su", "su", False),
]

LINKS = [
    ("stalingrad", "gumrak", "rail"), ("stalingrad", "volga-east", "track"), ("stalingrad", "beketovka", "road"), ("stalingrad", "vertyachy", "road"),
    ("gumrak", "karpovka", "rail"), ("gumrak", "vertyachy", "road"), ("karpovka", "kalach", "rail"), ("karpovka", "vertyachy", "track"),
    ("karpovka", "abganerovo", "track"), ("kalach", "vertyachy", "road"), ("kalach", "surovikino", "rail"), ("kalach", "nizhne-chirskaya", "road"),
    ("kalach", "perelazovsky", "road"), ("vertyachy", "kletskaya", "road"), ("vertyachy", "ilovlya", "road"),
    ("raspopinskaya", "kletskaya", "track"), ("raspopinskaya", "serafimovich", "track"), ("raspopinskaya", "perelazovsky", "road"),
    ("perelazovsky", "serafimovich", "road"), ("perelazovsky", "surovikino", "road"), ("perelazovsky", "chernyshevskaya", "road"),
    ("surovikino", "nizhne-chirskaya", "road"), ("surovikino", "chernyshevskaya", "road"), ("surovikino", "morozovsk", "rail"),
    ("nizhne-chirskaya", "myshkova", "track"), ("nizhne-chirskaya", "morozovsk", "road"),
    ("chernyshevskaya", "morozovsk", "road"), ("chernyshevskaya", "millerovo", "road"), ("chernyshevskaya", "serafimovich", "track"),
    ("sarpa", "beketovka", "road"), ("sarpa", "raigorod", "track"), ("sarpa", "abganerovo", "rail"), ("abganerovo", "myshkova", "rail"),
    ("abganerovo", "beketovka", "rail"), ("myshkova", "kotelnikovo", "rail"), ("kotelnikovo", "rostov", "rail"), ("kotelnikovo", "morozovsk", "track"),
    ("morozovsk", "millerovo", "rail"), ("morozovsk", "rostov", "rail"), ("millerovo", "boguchar", "road"), ("millerovo", "rostov", "rail"),
    ("boguchar", "verkhny-mamon", "road"), ("serafimovich", "frolovo", "road"), ("kletskaya", "frolovo", "road"), ("ilovlya", "frolovo", "rail"),
    ("ilovlya", "kletskaya", "road"), ("volga-east", "raigorod", "road"), ("beketovka", "raigorod", "track"),
    ("verkhny-mamon", "chernyshevskaya", "track"),
]
# 築城した地域:スターリングラードの廃墟(独が守るときの塹壕線。3か月の市街戦で地下室・工場の廃墟が要塞になっていた)。
# 初めは坑道陣地(陣地5)にしたが、AI 同士で包囲された市街が最後まで落ちず(3戦で同盟の限定的1・引き分け2)、塹壕線(陣地4)にした
FORTIFIED = {"stalingrad": ("trench", "de")}

INF_DE = "de_infantry_regiment_1942"
PZ = "de_panzer_regiment_1942"
MOT = "de_motorized_infantry_regiment_1942"
RIFLE = "su_rifle_regiment_1942"
TBDE = "su_tank_brigade_1942"
RIFLE_STRENGTH = 0.6


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None, ammo=None, fuel=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    out = []
    for u, toe in units:
        d = L([("id", f"{fid}-{u}"), ("toe", toe)])
        if training:
            d["training"] = training
        st = strength if strength is not None else (RIFLE_STRENGTH if toe == RIFLE else None)
        if st:
            d["strength"] = st
        if ammo is not None:
            d["ammo"] = ammo
        if fuel is not None:
            d["fuel"] = fuel
        out.append(d)
    f["units"] = out
    return f


def panzer(n):
    return [u for i in range(n) for u in ((f"pz{i + 1}", PZ), (f"mot{i + 1}", MOT))]


def infantry(n, prefix="i"):
    return [(f"{prefix}{i + 1}", INF_DE) for i in range(n)]


def rifle(n, tanks=0):
    return [(f"r{i + 1}", RIFLE) for i in range(n)] + [(f"tb{i + 1}", TBDE) for i in range(tanks)]


# 第6軍の携行備蓄:秋の市街戦で使い果たし、燃料が特に乏しかった(仮置き。TODO(要裏取り))
SIXTH = dict(ammo=0.5, fuel=0.3)

FORMATIONS = [
    # ===== 独軍と同盟軍(B軍集団→ドン軍集団)=====
    # 第6軍(パウルス):約20個師団。市街戦で歩兵が大きく減っていた(戦力6〜7割。仮置き)
    # (初めは市街に6個師団・戦力6割を置いたが、作戦の AI は1つの地域から1.3倍の戦力でしか攻めないので、市街は最後まで攻められなかった。
    #  市街の師団は秋の戦いで特に減っていたので、市街に4個師団・5割5分、残りの2個を包囲陣の西のグムラクに置いた)
    formation("de-6a-city", "de", "第6軍の市街の師団(第51軍団)", "stalingrad", infantry(4), training="veteran", strength=0.55, **SIXTH),
    formation("de-6a-west", "de", "第6軍の西の師団(第51軍団の一部)", "gumrak", infantry(2), training="veteran", strength=0.6, **SIXTH),
    formation("de-6a-north", "de", "第6軍の北の師団(第8・第11軍団)", "vertyachy", infantry(4), training="veteran", strength=0.7, **SIXTH),
    formation("de-6a-pz", "de", "第14装甲軍団(第14・第16・第24装甲師団の残り)", "gumrak", panzer(2), training="veteran", strength=0.5, **SIXTH),
    formation("de-4pz-iv", "de", "第4装甲軍の第4軍団", "karpovka", infantry(2), training="regular", strength=0.7, **SIXTH),
    # 第3ルーマニア軍(ドゥミトレスク)と第48装甲軍団(第22装甲師団・ルーマニア第1機甲師団)。編成表は独の歩兵連隊を未熟・6割で代える
    formation("ro-3a", "de", "第3ルーマニア軍", "raspopinskaya", infantry(5, "ro"), training="green", strength=0.6),
    formation("de-xlviii-pz", "de", "第48装甲軍団(第22装甲師団・ルーマニア第1機甲師団)", "perelazovsky", panzer(1) + [("ro1", INF_DE)], training="green", strength=0.5),
    # 第4ルーマニア軍(コンスタンティネスク)
    formation("ro-4a", "de", "第4ルーマニア軍", "sarpa", infantry(4, "ro"), training="green", strength=0.6),
    # カラチの橋を守っていた後方の部隊(わずか)
    formation("de-kalach", "de", "カラチの橋の守備(後方の部隊)", "kalach", infantry(1), training="green", strength=0.5),
    # 後から:ホリト支隊とチル川の急造の守り(11月下旬〜12月)、第11装甲師団(12月初め、チル川)
    formation("de-hollidt", "de", "ホリト支隊(チル川上流)", "chernyshevskaya", infantry(3), arrive=date(1942, 11, 26), training="regular", strength=0.8),
    formation("de-11pz", "de", "第48装甲軍団の立て直し(第11装甲師団)", "surovikino", panzer(1), arrive=date(1942, 12, 4), training="veteran", strength=0.9),
    # 冬の嵐作戦(ホト。第57装甲軍団):第6装甲師団(フランスから、ほぼ満の戦力)・第23装甲師団(12月初め)、第17装甲師団(12月中旬)
    formation("de-lvii-pz", "de", "第57装甲軍団(第6・第23装甲師団)", "kotelnikovo", panzer(2), arrive=date(1942, 12, 4), training="veteran", strength=0.85),
    formation("de-17pz", "de", "第17装甲師団", "kotelnikovo", panzer(1), arrive=date(1942, 12, 14), training="veteran", strength=0.6),
    # 中ドン:イタリア第8軍(編成表は独の歩兵連隊を未熟・6割で代える)
    formation("it-8a", "de", "イタリア第8軍(中ドン)", "boguchar", infantry(5, "it"), training="green", strength=0.6),
    formation("de-rostov", "de", "ロストフの後方の部隊", "rostov", infantry(1), training="green", strength=0.6),
    # ===== ソ連軍 =====
    # 南西戦線(ヴァトゥーチン):第5戦車軍(第1・第26戦車軍団・第8騎兵軍団)と第21軍(第4戦車軍団)
    formation("su-5ta", "su", "第5戦車軍(セラフィモヴィチ)", "serafimovich", rifle(4, tanks=3), training="regular"),
    formation("su-21a", "su", "第21軍(クレツカヤ)", "kletskaya", rifle(4, tanks=2), training="regular"),
    # ドン戦線(ロコソフスキー):第65・第24・第66軍
    formation("su-don", "su", "ドン戦線(第65・第24・第66軍)", "ilovlya", rifle(6, tanks=1), training="regular"),
    # スターリングラード戦線(エリョーメンコ):第62軍(市街の端に追い詰められていた)・第64軍・第57軍(第13戦車軍団)・第51軍(第4機械化軍団)
    formation("su-62a", "su", "第62軍(チュイコフ。ヴォルガ岸の橋頭堡)", "volga-east", rifle(3), training="veteran", strength=0.4),
    formation("su-64a", "su", "第64軍・第57軍(第13戦車軍団)", "beketovka", rifle(4, tanks=1), training="regular"),
    formation("su-51a", "su", "第51軍(第4機械化軍団)", "raigorod", rifle(3, tanks=2), training="regular"),
    # 後から:第2親衛軍(12月中旬にミシュコヴァ川へ。冬の嵐を止めた)、小土星作戦の第1親衛軍・第6軍(12月16日、中ドン)、
    # 第3親衛軍(12月、チル川上流)。日付・場所・師団の数は TODO(要裏取り)
    formation("su-2ga", "su", "第2親衛軍(マリノフスキー)", "ilovlya", rifle(5, tanks=2), arrive=date(1942, 12, 9), training="regular", strength=0.9),
    formation("su-1ga", "su", "第1親衛軍・第6軍(小土星作戦)", "verkhny-mamon", rifle(6, tanks=3), arrive=date(1942, 12, 14), training="regular"),
    formation("su-3ga", "su", "第3親衛軍(チル川上流)", "serafimovich", rifle(4, tanks=1), arrive=date(1942, 12, 14), training="regular"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。ソ:カラチで手をつなぎ(包囲)、スターリングラードを取り返せば決定的(史実)、包囲だけなら限定的。
# 独:スターリングラードを保ち、包囲の輪を破れば(カラチかミシュコヴァ・アブガネロヴォの回廊)決定的、市街を保てば限定的
VICTORY = L([
    ("su", L([
        ("conditions", [cond("stalingrad", "stalingrad", 6), cond("kalach", "kalach", 4), cond("gumrak", "gumrak", 2), cond("abganerovo", "abganerovo", 1),
                        cond("kotelnikovo", "kotelnikovo", 2), cond("morozovsk", "morozovsk", 2), cond("millerovo", "millerovo", 1), loss("loss", 1.5, 2)]),
        ("decisive", L([("minPoints", 14), ("requires", ["stalingrad", "kalach"])])),
        ("limited", L([("minPoints", 6), ("requires", ["kalach"])])),
    ])),
    ("de", L([
        ("conditions", [cond("stalingrad", "stalingrad", 6), cond("kalach", "kalach", 3), cond("abganerovo", "abganerovo", 2), cond("morozovsk", "morozovsk", 2),
                        cond("rostov", "rostov", 2), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 13), ("requires", ["stalingrad", "kalach"])])),
        # (初めは市街だけの8点で限定的にしたが、包囲されたまま廃墟を持っていれば引き分けになった。史実では包囲の中に残っても負けなので、
        #  回廊か後方の飛行場もあわせて11点に上げた)
        ("limited", L([("minPoints", 11), ("requires", ["stalingrad"])])),
    ])),
])

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))
#  - 独:第4航空艦隊(リヒトホーフェン)の第8航空軍団。多くの機は空輸に回った(空輸は表していないので攻撃機を少なめに)
#  - ソ:第17航空軍(南西戦線)・第16航空軍(ドン戦線)・第8航空軍(スターリングラード戦線)
AIR_WINGS = [
    L([("id", "de-viii-fk"), ("side", "de"), ("name", "第8航空軍団"), ("base", "morozovsk"), ("rangeKm", 350), ("fighters", 3), ("strike", 4)]),
    L([("id", "de-pitomnik"), ("side", "de"), ("name", "ピトムニクの戦闘機(包囲の中)"), ("base", "gumrak"), ("rangeKm", 200), ("fighters", 1), ("strike", 0)]),
    L([("id", "su-17va"), ("side", "su"), ("name", "第17航空軍"), ("base", "serafimovich"), ("rangeKm", 300), ("fighters", 2), ("strike", 3)]),
    L([("id", "su-16va"), ("side", "su"), ("name", "第16航空軍"), ("base", "ilovlya"), ("rangeKm", 300), ("fighters", 3), ("strike", 3)]),
    L([("id", "su-8va"), ("side", "su"), ("name", "第8航空軍"), ("base", "raigorod"), ("rangeKm", 300), ("fighters", 2), ("strike", 3)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if airbase:
            r["airbase"] = True
        if rid in FORTIFIED:
            works, side = FORTIFIED[rid]
            r["fortified"] = L([("works", works), ("side", side)])
        regions[rid] = r
        control[rid] = owner
    return L([
        ("id", "uranus-1942"),
        ("name", "スターリングラードの包囲(1942年11月〜1943年2月)"),
        ("description",
         "天王星作戦。ソ連の南西・ドン・スターリングラードの3つの戦線が、第6軍の両翼を守るルーマニア軍を破ってカラチで手をつなぐ。"
         "ホトの冬の嵐作戦は包囲の輪へ届くか、小土星作戦は空輸の飛行場を奪えるか。1段階は5日、16段階。v0・概略図(師団の数・日付の多くは要裏取り)"),
        ("notes", "根拠は docs/research/uranus-1942.md。作り直しは tools/campaigns/build_uranus_1942.py。部隊1つ≒1個師団。編成は1942年の東部戦線で代え、"
                  "ルーマニア軍・イタリア軍は独の歩兵を未熟・戦力6割で代えた。空輸は表していない(第6軍の補給は始めの携行備蓄で代える)"),
        ("era", "1942-ostfront"),
        ("sides", [L([("id", "de"), ("name", "ドイツ軍と同盟軍")]), L([("id", "su"), ("name", "ソ連軍")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        # 11月19日の霧と雪、12月の厳寒と吹雪、1月の晴れた厳寒(仮置き)
        ("weather", [L([("stage", 1), ("weather", "fog")]), L([("stage", 2), ("weather", "overcast")]), L([("stage", 5), ("weather", "snow")]),
                     L([("stage", 8), ("weather", "clear")]), L([("stage", 11), ("weather", "snow")]), L([("stage", 13), ("weather", "clear")])]),
        ("seasons", [
            L([("stage", 1), ("name", "初冬"), ("ground", L([("snow", 0.3)]))]),
            L([("stage", 5), ("name", "厳寒"), ("ground", L([("snow", 0.7)]))]),
        ]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("rules", L([
            # 補充:独は包囲の第6軍に届かず、東部戦線全体でも乏しかった。ソは予備の軍を次々に送った(仮置き)
            ("replacementBySide", L([("de", 0.02), ("su", 0.04)])),
            # 独の燃料:鉄道の終点から遠く、冬で道路の輸送が落ちた(仮置き)
            ("stockCap", L([("de", L([("ammo", 0.8), ("fuel", 0.6)]))])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_dive_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "su"),
            ("level", "decisive"),
            ("summary", "11月23日にカラチ・ソヴェツキーで包囲が閉じた。冬の嵐作戦は12月19日ごろミシュコヴァ川で止まり、第6軍は外へ出なかった。"
                        "小土星作戦で12月24日にタツィンスカヤの飛行場が襲われ、1月10日からの鉄環作戦でピトムニク・グムラクを失い、"
                        "1月31日に南の包囲陣(パウルス)、2月2日に北の包囲陣が降伏した"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
