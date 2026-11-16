#!/usr/bin/env python3
"""
モスクワ前面の戦い(タイフーン作戦とソ連の冬の反攻。1941年10月2日〜1942年1月7日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_moscow_1941.py

出力: data/campaigns/moscow-1941.json

中央軍集団(ボック)の3つの装甲集団(第3・第4・第2)がヴャジマとブリャンスクでソ連の3つの戦線を包み、モジャイスク線を破ってモスクワへ迫る。
秋の泥濘(ラスプーチツァ)で止まった後、11月の凍った地面で北のクリン・カリーニンと南のトゥーラから挟もうとし、12月5日からソ連が反攻に出る。
根拠と残りの裏取りは docs/research/moscow-1941.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:バルバロッサ作戦(build_barbarossa_1941.py)と同じく、1個の部隊をおおよそ1個師団。装甲師団は戦車連隊と自動車化歩兵連隊の2つ。
ソ連の狙撃兵師団は戦力6割。編成は生成器の「1942年の東部戦線」で代える。師団の数・軍の位置・着いた日の多くは TODO(要裏取り)
(出典候補:Glantz『When Titans Clashed』『Barbarossa Derailed』、Stahel『Operation Typhoon』『The Battle for Moscow』、
Zetterling & Frankson『The Drive on Moscow 1941』、ソ連参謀本部『The Battle of Moscow 1941–1942』)。
1段階は5日(10月2日を1日目として20段階で1月10日まで)。
季節(泥濘・凍結・厳寒)は作戦の層では表せない(地域の地形の傾向は固定)。北の森の地域を冬のアルデンヌ、南をステップ、ほかを西欧の農村で代える。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/moscow-1941.json"

START = date(1941, 10, 2)
DAYS_PER_STAGE = 5
STAGES = 20


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯55度で約64km、緯度1度は約111km)"""
    return round((lon - 31.5) * 64, 1), round((lat - 51.0) * 111, 1)


F, W, S = "western-farmland", "ardennes-winter", "steppe"
REGIONS = [
    # 独の出撃の地(9月30日〜10月2日)
    ("smolensk", "スモレンスク(独の後方)", 54.78, 32.04, F, "de", "de", True),
    ("dukhovshchina", "ドゥホフシチナ(第3装甲集団・第9軍)", 55.20, 32.42, W, None, "de", False),
    ("roslavl", "ロスラヴリ(第4装甲集団・第4軍)", 53.95, 32.86, F, "de", "de", True),
    ("pochep", "ポチェプ(第2軍)", 52.93, 33.45, F, None, "de", False),
    ("glukhov", "グルホフ(第2装甲集団)", 51.68, 33.92, S, "de", "de", True),
    # ソ連の西部・予備・ブリャンスク戦線
    ("belyi", "ベールイ", 55.83, 32.94, W, None, "su", False),
    ("yelnya", "エリニャ", 54.57, 33.17, F, None, "su", False),
    ("vyazma", "ヴャジマ", 55.21, 34.29, F, None, "su", True),
    ("bryansk", "ブリャンスク", 53.25, 34.37, W, None, "su", True),
    ("sevsk", "セフスク", 52.15, 34.49, S, None, "su", False),
    ("orel", "オリョール", 52.97, 36.07, S, None, "su", True),
    ("mtsensk", "ムツェンスク", 53.28, 36.57, S, None, "su", False),
    ("rzhev", "ルジェフ", 56.26, 34.33, W, None, "su", False),
    ("yukhnov", "ユフノフ", 54.75, 35.24, F, None, "su", False),
    ("sukhinichi", "スヒニチ", 54.10, 35.35, W, None, "su", False),
    # モジャイスク線とモスクワの前面
    ("kalinin", "カリーニン(トヴェリ)", 56.86, 35.90, W, None, "su", True),
    ("volokolamsk", "ヴォロコラムスク", 56.04, 35.96, W, None, "su", False),
    ("mozhaisk", "モジャイスク(ボロジノ)", 55.50, 36.03, F, None, "su", False),
    ("maloyaroslavets", "マロヤロスラヴェツ", 55.01, 36.46, F, None, "su", False),
    ("kaluga", "カルーガ", 54.53, 36.27, F, None, "su", False),
    ("tula", "トゥーラ", 54.19, 37.62, S, None, "su", True),
    ("klin", "クリン", 56.33, 36.73, W, None, "su", False),
    ("solnechnogorsk", "ソルネチノゴルスク", 56.18, 36.98, W, None, "su", False),
    ("dmitrov", "ドミトロフ(モスクワ・ヴォルガ運河)", 56.34, 37.52, W, None, "su", False),
    ("istra", "イストラ", 55.92, 36.86, W, None, "su", False),
    ("serpukhov", "セルプホフ", 54.92, 37.41, F, None, "su", False),
    ("kashira", "カシラ", 54.83, 38.15, S, None, "su", False),
    ("moscow", "モスクワ", 55.75, 37.62, F, "su", "su", True),
    ("kolomna", "コロムナ(ソの後方)", 55.08, 38.78, F, "su", "su", False),
]

# 結び:ミンスク街道(スモレンスク〜ヴャジマ〜モジャイスク〜モスクワ)、ワルシャワ街道(ロスラヴリ〜ユフノフ〜マロヤロスラヴェツ)、
# レニングラード街道(カリーニン〜クリン〜ソルネチノゴルスク〜モスクワ)、オリョール〜トゥーラ〜セルプホフ〜モスクワ、ヴォロコラムスク街道。
# TODO(要裏取り):1941年の道路と鉄道
LINKS = [
    ("smolensk", "dukhovshchina", "road"),
    ("smolensk", "roslavl", "road"),
    ("smolensk", "yelnya", "road"),
    ("smolensk", "vyazma", "rail"),
    ("roslavl", "pochep", "road"),
    ("roslavl", "yelnya", "road"),
    ("roslavl", "yukhnov", "road"),
    ("roslavl", "bryansk", "rail"),
    ("pochep", "bryansk", "rail"),
    ("pochep", "glukhov", "track"),
    ("glukhov", "sevsk", "road"),
    ("dukhovshchina", "belyi", "track"),
    ("dukhovshchina", "vyazma", "road"),
    ("belyi", "rzhev", "road"),
    ("belyi", "vyazma", "track"),
    ("yelnya", "vyazma", "road"),
    ("yelnya", "yukhnov", "road"),
    ("vyazma", "rzhev", "rail"),
    ("vyazma", "mozhaisk", "rail"),
    ("vyazma", "yukhnov", "road"),
    ("bryansk", "sevsk", "road"),
    ("bryansk", "orel", "rail"),
    ("bryansk", "sukhinichi", "rail"),
    ("sevsk", "orel", "road"),
    ("orel", "mtsensk", "rail"),
    ("mtsensk", "tula", "rail"),
    ("yukhnov", "maloyaroslavets", "road"),
    ("yukhnov", "sukhinichi", "road"),
    ("sukhinichi", "kaluga", "rail"),
    ("rzhev", "kalinin", "rail"),
    ("rzhev", "volokolamsk", "road"),
    ("kalinin", "klin", "rail"),
    ("klin", "solnechnogorsk", "rail"),
    ("klin", "dmitrov", "road"),
    ("klin", "volokolamsk", "road"),
    ("solnechnogorsk", "moscow", "rail"),
    ("solnechnogorsk", "istra", "road"),
    ("dmitrov", "moscow", "rail"),
    ("volokolamsk", "istra", "road"),
    ("volokolamsk", "mozhaisk", "road"),
    ("istra", "moscow", "road"),
    ("mozhaisk", "moscow", "rail"),
    ("mozhaisk", "maloyaroslavets", "road"),
    ("maloyaroslavets", "kaluga", "road"),
    ("maloyaroslavets", "serpukhov", "road"),
    ("maloyaroslavets", "moscow", "road"),
    ("kaluga", "tula", "rail"),
    ("tula", "serpukhov", "rail"),
    ("tula", "kashira", "road"),
    ("serpukhov", "moscow", "rail"),
    ("kashira", "kolomna", "rail"),
    ("kashira", "moscow", "rail"),
    ("kolomna", "moscow", "rail"),
]

INF_DE = "de_infantry_regiment_1942"
PZ = "de_panzer_regiment_1942"
MOT = "de_motorized_infantry_regiment_1942"
RIFLE = "su_rifle_regiment_1942"
TBDE = "su_tank_brigade_1942"
RIFLE_STRENGTH = 0.6
INF_STRENGTH = 0.9
PZ_STRENGTH = 0.7
# 築城した地域:モジャイスク線(ヴォロコラムスク〜モジャイスク〜マロヤロスラヴェツ)とモスクワの防衛地帯・トゥーラ。
# 10月にはまだ工事の途中だったとされる(TODO(要裏取り))。ソ連が守るときだけ塹壕線(陣地4から)
FORTIFIED = ["volokolamsk", "mozhaisk", "maloyaroslavets", "moscow", "tula"]


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None):
    t = [("training", training)] if training else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    out = []
    for u, toe in units:
        d = L([("id", f"{fid}-{u}"), ("toe", toe)] + t)
        st = strength if strength is not None else (RIFLE_STRENGTH if toe == RIFLE else None)
        if st:
            d["strength"] = st
        out.append(d)
    f["units"] = out
    return f


def panzer(n):
    return [u for i in range(n) for u in ((f"pz{i + 1}", PZ), (f"mot{i + 1}", MOT))]


def infantry(n):
    return [(f"i{i + 1}", INF_DE) for i in range(n)]


def rifle(n, tanks=0):
    return [(f"r{i + 1}", RIFLE) for i in range(n)] + [(f"tb{i + 1}", TBDE) for i in range(tanks)]


FORMATIONS = [
    # ---- 独軍(中央軍集団・ボック)----
    # 10月初めに約190万人・戦車約1,000両(数は出典で差がある)。装甲師団14・自動車化師団8を含む約78個師団とされる。
    # ここでは装甲集団ごとに装甲師団3〜4、軍ごとに歩兵師団4〜6(仮置き。TODO(要裏取り))。6月からの戦いで戦力が落ち、補充も少なかった
    # (装甲師団の連隊を戦力0.7、歩兵師団を0.9。仮置き。AI 同士で、1.0 では独軍が11月初めにモスクワを取り、0.8・0.6 では1段階目にヴャジマで負けて動けなくなった)
    formation("de-pzg3", "de", "第3装甲集団(ホート→ラインハルト)", "dukhovshchina", panzer(3), training="veteran", strength=PZ_STRENGTH),
    formation("de-9army", "de", "第9軍(シュトラウス)", "dukhovshchina", infantry(6), training="veteran", strength=INF_STRENGTH),
    formation("de-pzg4", "de", "第4装甲集団(ヘプナー)", "roslavl", panzer(4), training="veteran", strength=PZ_STRENGTH),
    formation("de-4army", "de", "第4軍(クルーゲ)", "roslavl", infantry(6), training="veteran", strength=INF_STRENGTH),
    formation("de-2army", "de", "第2軍(ヴァイクス)", "pochep", infantry(4), training="veteran", strength=INF_STRENGTH),
    formation("de-pzg2", "de", "第2装甲集団(グデーリアン)", "glukhov", panzer(3), training="veteran", strength=PZ_STRENGTH),
    # ---- ソ連軍 ----
    # 西部戦線(コーネフ。第22・第29・第30・第19・第16・第20軍)、予備戦線(ブジョーンヌイ。前線に第24・第43軍、後ろに第31・第32・第33・第49軍)、
    # ブリャンスク戦線(エリョーメンコ。第50・第3・第13軍と作戦集団イェルマコフ)。合わせて約125万人とされる(TODO(要裏取り))
    formation("su-wf-n", "su", "西部戦線(第22・第29・第30軍)", "belyi", rifle(4), training="green"),
    formation("su-wf-c", "su", "西部戦線(第19・第16・第20軍)", "vyazma", rifle(5, tanks=1), training="green"),
    formation("su-rf", "su", "予備戦線(第24・第43軍)", "yelnya", rifle(4), training="green"),
    formation("su-rf-2", "su", "予備戦線の第2線(第31・第32・第33・第49軍)", "yukhnov", rifle(4), training="green"),
    formation("su-bf", "su", "ブリャンスク戦線(第50・第3・第13軍)", "bryansk", rifle(5, tanks=1), training="green"),
    formation("su-yermakov", "su", "作戦集団イェルマコフ", "sevsk", rifle(2), training="green"),
    # 後から:モジャイスク線の第5軍(10月中旬)、ムツェンスクのカトゥコフの第4戦車旅団と第1親衛狙撃兵軍団(10月4〜6日)、
    # カリーニン戦線(10月17日)、極東・シベリアの師団(10月下旬から)、反攻の予備(第1打撃軍・第20軍・第10軍。11月下旬〜12月初め)。
    # 日付・場所・師団の数は TODO(要裏取り)
    formation("su-katukov", "su", "第1親衛狙撃兵軍団・第4戦車旅団(カトゥコフ)", "mtsensk", rifle(1, tanks=1), arrive=date(1941, 10, 4), training="regular"),
    formation("su-5a", "su", "第5軍(モジャイスク線)", "mozhaisk", rifle(3, tanks=1), arrive=date(1941, 10, 10), training="green"),
    formation("su-mzh", "su", "モジャイスク線の予備(第16軍の再建ほか)", "volokolamsk", rifle(3), arrive=date(1941, 10, 12), training="green"),
    formation("su-kf", "su", "カリーニン戦線(第22・第29・第31軍の残り)", "kalinin", rifle(3), arrive=date(1941, 10, 17), training="green"),
    formation("su-far-east", "su", "極東・シベリアの師団", "moscow", rifle(4, tanks=1), arrive=date(1941, 10, 27), training="regular"),
    formation("su-tula", "su", "トゥーラの守備隊と第50軍の再建", "tula", rifle(3), arrive=date(1941, 10, 22), training="green"),
    formation("su-1shock", "su", "第1打撃軍", "dmitrov", rifle(4, tanks=1), arrive=date(1941, 11, 29), training="regular"),
    formation("su-20a", "su", "第20軍", "moscow", rifle(3, tanks=1), arrive=date(1941, 11, 29), training="regular"),
    formation("su-10a", "su", "第10軍", "kolomna", rifle(5), arrive=date(1941, 12, 1), training="regular"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。史実:10月7日にヴャジマ、10月上旬にブリャンスクで包み、約60万人以上を捕らえたとされる(数は出典で差がある)。
# 10月14日にカリーニン、11月23日にクリン。トゥーラは落ちず、11月末にモスクワまで約30km。12月5日からの反攻で12月16日にカリーニン、
# 12月15日にクリン、12月30日にカルーガを取り返した
VICTORY = L(
    [
        (
            "de",
            L(
                [
                    ("conditions", [cond("moscow", "moscow", 10), cond("tula", "tula", 3), cond("kalinin", "kalinin", 2), cond("vyazma", "vyazma", 2),
                                    cond("bryansk", "bryansk", 2), cond("mozhaisk", "mozhaisk", 2), cond("orel", "orel", 1), cond("kaluga", "kaluga", 1), loss("encircle", 0.5, 3)]),
                    ("decisive", L([("minPoints", 15), ("requires", ["moscow"])])),
                    ("limited", L([("minPoints", 11), ("requires", ["mozhaisk", "kalinin"])])),
                ]
            ),
        ),
        (
            "su",
            L(
                [
                    ("conditions", [cond("moscow", "moscow", 10), cond("tula", "tula", 3), cond("kalinin", "kalinin", 2), cond("mozhaisk", "mozhaisk", 2),
                                    cond("klin", "klin", 1), cond("kaluga", "kaluga", 1), cond("vyazma", "vyazma", 2), loss("loss", 2.0, 2)]),
                    ("decisive", L([("minPoints", 18), ("requires", ["moscow", "tula", "kalinin", "mozhaisk"])])),
                    ("limited", L([("minPoints", 10), ("requires", ["moscow"])])),
                ]
            ),
        ),
    ]
)

# 航空隊(編隊1つ=実機約40機。根拠は docs/research/moscow-1941.md「航空隊」。数はすべて TODO(要裏取り))
#  - 独:第2航空艦隊(ケッセルリンク)。第2・第8航空軍団。10月初めに約1,000機とされる(仮置き)。11月に第2航空軍団と艦隊の司令部が地中海へ移った(作戦の層では抜けを表せない)
#  - ソ:西部・予備・ブリャンスク戦線の航空隊とモスクワの防空(第6戦闘航空軍団)。10月初めに数百機とされ、12月の反攻までに増えた(仮置き)
AIR_WINGS = [
    L([("id", "de-ii-fk"), ("side", "de"), ("name", "第2航空軍団"), ("base", "roslavl"), ("rangeKm", 350), ("fighters", 4), ("strike", 8)]),
    L([("id", "de-viii-fk"), ("side", "de"), ("name", "第8航空軍団"), ("base", "smolensk"), ("rangeKm", 350), ("fighters", 4), ("strike", 8)]),
    L([("id", "su-front-air"), ("side", "su"), ("name", "西部・予備戦線の航空隊"), ("base", "vyazma"), ("rangeKm", 300), ("fighters", 4), ("strike", 3)]),
    L([("id", "su-bryansk-air"), ("side", "su"), ("name", "ブリャンスク戦線の航空隊"), ("base", "orel"), ("rangeKm", 300), ("fighters", 2), ("strike", 2)]),
    L([("id", "su-6iak"), ("side", "su"), ("name", "第6戦闘航空軍団(モスクワの防空)"), ("base", "moscow"), ("rangeKm", 250), ("fighters", 6), ("strike", 0)]),
    L([("id", "su-reserve-air"), ("side", "su"), ("name", "反攻の航空隊(最高司令部の予備)"), ("base", "moscow"), ("rangeKm", 300), ("fighters", 4), ("strike", 4), ("arriveStage", stage_of(date(1941, 12, 1)))]),
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
            r["fortified"] = L([("works", "trench"), ("side", "su")])
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "moscow-1941"),
            ("name", "モスクワ前面の戦い(1941年10月〜1942年1月)"),
            (
                "description",
                "タイフーン作戦。中央軍集団の3つの装甲集団がヴャジマとブリャンスクでソ連の3つの戦線を包み、モジャイスク線を破ってモスクワへ迫る。"
                "極東の師団と反攻の予備が着くまで、ソ連はトゥーラとモスクワの前面を持ちこたえられるか。1段階は5日、20段階。v0・概略図(師団の数・日付の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/moscow-1941.md。作り直しは tools/campaigns/build_moscow_1941.py。部隊1つ≒1個師団。編成は1942年の東部戦線で代えた。泥濘・厳寒の季節の移り変わりは表していない(独軍の補給の苦しさは備蓄の上限で代える)"),
            ("era", "1942-ostfront"),
            ("sides", [L([("id", "de"), ("name", "ドイツ軍")]), L([("id", "su"), ("name", "ソ連軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            # 10月半ばからの秋の雨、11月の曇り、12月の雪(仮置き)
            ("weather", [L([("stage", 1), ("weather", "clear")]), L([("stage", 3), ("weather", "rain")]), L([("stage", 7), ("weather", "overcast")]), L([("stage", 13), ("weather", "snow")]), L([("stage", 16), ("weather", "overcast")])]),
            # 季節:10月半ば〜11月上旬の泥濘(ラスプーチツァ)、11月中旬の凍結(道が固まり、独軍が再び進んだ)、12月の厳寒と深い雪。地面の度合いは仮置き
            ("seasons", [
                L([("stage", 1), ("name", "秋")]),
                L([("stage", 3), ("name", "泥濘(ラスプーチツァ)"), ("ground", L([("mud", 0.8)]))]),
                L([("stage", 9), ("name", "凍結"), ("ground", L([("snow", 0.3)]))]),
                L([("stage", 13), ("name", "厳寒"), ("ground", L([("snow", 0.8)]))]),
            ]),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            (
                "rules",
                L(
                    [
                        # 独軍の燃料・弾薬:ロシアの広軌の鉄道を直すのが遅れ、10月半ばからの泥濘で道路の輸送も止まった(備蓄の戻りを燃料6割・弾薬8割まで。仮置き。
                        # 初めの7割・8割では AI 同士で独軍が11月初めにモスクワを取ってしまった)
                        ("stockCap", L([("de", L([("ammo", 0.8), ("fuel", 0.6)]))])),
                        # 補充:独は東部戦線の補充が追いつかず(10月〜12月に失った兵の一部しか届かなかったとされる)、ソは新しい師団を次々に送った(仮置き)
                        ("replacementBySide", L([("de", 0.02), ("su", 0.06)])),
                        ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_dive_bomber")]))])),
                    ]
                ),
            ),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "su"),
                        ("level", "limited"),
                        (
                            "summary",
                            "独軍はヴャジマ・ブリャンスクの包囲で大勝し、カリーニン・クリン・カルーガを取ってモスクワの約30kmまで迫ったが、トゥーラとモスクワは落ちなかった。"
                            "12月5〜6日からのソ連の反攻で、カリーニン・クリン・カルーガを取り返し、独軍を100〜250km押し戻した(モジャイスクは1月20日)",
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
