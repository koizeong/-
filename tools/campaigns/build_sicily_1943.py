#!/usr/bin/env python3
"""
シチリア島の戦い(ハスキー作戦。1943年7月10日〜8月17日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_sicily_1943.py

出力: data/campaigns/sicily-1943.json

7月10日、米第7軍(パットン)がリカータ・ジェーラ・スコグリッティに、英第8軍(モントゴメリー)がパキーノ・アヴォラに上がった。
空挺(米第82・英第1)は風で散らばった。11日にヘルマン・ゲーリング師団とリヴォルノ師団がジェーラで反撃した。英はカターニア平野(プリモソーレ橋)で
降下猟兵と第29装甲擲弾兵師団に止められ、米はパレルモ(22日)へ回ってから北岸を東へ進んだ。独伊はエトナ山の線で退きながら戦い、
8月11〜17日にメッシーナ海峡を渡って約10万人(独約4万・伊約6万。数は出典で差がある)と車両を本土へ引き揚げた。
根拠と残りの裏取りは docs/research/sicily-1943.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:1個の部隊をおおよそ1個師団(米の師団は1942〜43年の歩兵連隊、英の師団は1944年の歩兵旅団、伊の師団は1940年の歩兵連隊の編成表で代える。
独の装甲・装甲擲弾兵師団は1942年の戦車大隊と歩兵連隊)。師団の数・位置・着いた日の多くは TODO(要裏取り)
(出典候補:Garland & Smyth『Sicily and the Surrender of Italy』(米陸軍公刊戦史)、D'Este『Bitter Victory』、Molony『The Mediterranean and Middle East Vol. V』、
Mitcham & von Stauffenberg『The Battle of Sicily』、Atkinson『The Day of Battle』)。
1段階は3日(7月10日を1日目として13段階で8月17日まで)。海と艦隊は入れない(上陸は上陸の増援、海岸の地域は押さえれば連合の補給の源)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/sicily-1943.json"

START = date(1943, 7, 10)
DAYS_PER_STAGE = 3
STAGES = 13


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯37.5度で約88km、緯度1度は約111km)"""
    return round((lon - 12.5) * 88, 1), round((lat - 36.5) * 111, 1)


F, M = "western-farmland", "mountains"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 上陸の海岸(押さえれば連合の補給の源)
    ("licata", "リカータ(米第3歩兵師団の海岸)", 37.10, 13.94, F, "al", "ax", False),
    ("gela", "ジェーラ(米第1歩兵師団の海岸)", 37.07, 14.25, F, "al", "ax", False),
    ("scoglitti", "スコグリッティ(米第45歩兵師団の海岸)", 36.89, 14.43, F, "al", "ax", False),
    ("pachino", "パキーノ(英第30軍団の海岸)", 36.71, 15.09, F, "al", "ax", True),
    ("avola", "アヴォラ・カッシビレ(英第13軍団の海岸)", 36.95, 15.18, F, "al", "ax", False),
    # 島の東:シラクーサ・アウグスタの港とカターニア平野
    ("syracuse", "シラクーサ(港・ポンテ・グランデ橋)", 37.07, 15.29, F, None, "ax", False),
    ("augusta", "アウグスタ(港)", 37.23, 15.22, F, None, "ax", False),
    ("primosole", "プリモソーレ橋・シメト川", 37.40, 15.06, F, None, "ax", False),
    ("catania", "カターニア・ジェルビーニの飛行場", 37.50, 15.09, F, None, "ax", True),
    # 島の真ん中と山地
    ("niscemi", "ニシェーミ・ポンテ・オリーヴォの飛行場", 37.15, 14.39, F, None, "ax", True),
    ("caltagirone", "カルタジローネ", 37.24, 14.51, M, None, "ax", False),
    ("vizzini", "ヴィッツィーニ", 37.16, 14.75, M, None, "ax", False),
    ("enna", "エンナ・レオンフォルテ", 37.57, 14.28, M, None, "ax", False),
    ("caltanissetta", "カルタニッセッタ", 37.49, 14.06, M, None, "ax", False),
    ("agrigento", "アグリジェント(港)", 37.31, 13.58, F, None, "ax", False),
    # 島の西と北岸
    ("trapani", "トラーパニ・マルサーラ(島の西)", 37.93, 12.60, F, None, "ax", True),
    ("palermo", "パレルモ(港)", 38.12, 13.36, F, None, "ax", True),
    ("nicosia", "ニコジーア・トロイーナ", 37.80, 14.53, M, None, "ax", False),
    ("santo-stefano", "サント・ステファノ(北岸)", 38.03, 14.36, M, None, "ax", False),
    # エトナの線とメッシーナ
    ("adrano", "アドラーノ・チェントゥーリペ(エトナの線)", 37.66, 14.83, M, None, "ax", False),
    ("randazzo", "ランダッツォ(エトナの北)", 37.88, 14.95, M, None, "ax", False),
    ("milazzo", "ミラッツォ(北岸の東)", 38.22, 15.24, F, None, "ax", False),
    ("taormina", "タオルミーナ(東岸の道)", 37.85, 15.28, M, None, "ax", False),
    ("messina", "メッシーナ(海峡を渡る港)", 38.19, 15.55, F, "ax", "ax", False),
    # 本土(メッシーナ海峡の向こう。独伊の補給と航空基地)
    ("calabria", "カラブリア(レッジョ。本土)", 38.11, 15.65, F, "ax", "ax", True),
    # 連合の航空基地(マルタ。陸の結びはない)
    ("malta", "マルタ島(連合の航空基地)", 35.90, 14.45, F, "al", "al", True),
]
LINKS = [
    ("licata", "gela", "road"), ("licata", "agrigento", "road"), ("licata", "caltanissetta", "road"), ("gela", "scoglitti", "road"),
    ("gela", "niscemi", "road"), ("scoglitti", "niscemi", "road"), ("scoglitti", "vizzini", "track"), ("niscemi", "caltagirone", "road"),
    ("caltagirone", "vizzini", "road"), ("caltagirone", "enna", "road"), ("vizzini", "pachino", "track"), ("vizzini", "avola", "road"),
    ("vizzini", "primosole", "road"), ("pachino", "avola", "road"), ("avola", "syracuse", "road"), ("syracuse", "augusta", "road"),
    ("augusta", "primosole", "road"), ("primosole", "catania", "road"), ("catania", "adrano", "road"), ("catania", "taormina", "road"),
    ("adrano", "enna", "road"), ("adrano", "randazzo", "road"), ("adrano", "nicosia", "road"), ("enna", "caltanissetta", "road"),
    ("enna", "nicosia", "road"), ("caltanissetta", "agrigento", "road"), ("caltanissetta", "palermo", "road"), ("agrigento", "trapani", "road"),
    ("trapani", "palermo", "road"), ("palermo", "santo-stefano", "road"), ("santo-stefano", "nicosia", "road"), ("santo-stefano", "milazzo", "road"),
    ("nicosia", "randazzo", "road"), ("randazzo", "milazzo", "road"), ("randazzo", "taormina", "road"), ("milazzo", "messina", "road"),
    ("taormina", "messina", "road"),
    # メッシーナ海峡の渡し(独伊の補給と撤退の道)
    ("messina", "calabria", "track"),
]

US_INF = "us-ir-1942"
US_TK = "us-tank-bn-1944"
US_PIR = "us-pir-1944"
UK_INF = "uk-inf-bde-1944"
UK_ARMD = "uk-armd-regt-1942"
UK_ART = "uk-field-regt-25pdr"
IT = "it-ir-1940"
DE_INF = "de-ir-1942"
DE_PZ = "de-pz-abt-1942"
TIGER = "de-tiger-abt-1943"
FJR = "de-fjr-1944"
DE_ART = "de-art-abt-lefh18"


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None, **extra):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    out = []
    for u, toe in units:
        d = L([("id", f"{fid}-{u}"), ("toe", toe)])
        if training:
            d["training"] = training
        if strength:
            d["strength"] = strength
        out.append(d)
    f["units"] = out
    return f


D1 = date(1943, 7, 10)
# 独伊の撤退(教習作戦。8月11〜17日にメッシーナから海峡を渡った)。撤退の始まりは撤退を決めたころ(8月8日ごろ。TODO(要裏取り):ケッセルリンク・フーベの決定の日)にする。
# 初めは渡り始めた8月11日にしたが、AI 同士で3戦とも撤退の前に枢軸の師団が崩れ、1つも撤退できなかった
EVAC = L([("stage", stage_of(date(1943, 8, 8))), ("from", ["messina", "calabria"])])

FORMATIONS = [
    # ===== 枢軸(第6軍。グッツォーニ。独の第14装甲軍団=フーベ)=====
    # 伊の海岸の師団(第206・第207・第208ほか。未熟・戦力5割)
    formation("it-coast-w", "ax", "伊の海岸の師団(リカータ・ジェーラ)", "gela", [("a", IT), ("b", IT)], training="green", strength=0.5),
    formation("it-coast-e", "ax", "伊の海岸の師団(パキーノ・アヴォラ)", "pachino", [("a", IT), ("b", IT)], training="green", strength=0.5),
    formation("it-naval-sy", "ax", "シラクーサ・アウグスタの海軍の守備", "augusta", [("a", IT)], training="green", strength=0.5),
    # 伊の機動の師団:リヴォルノ(ジェーラの反撃)、ナポリ(島の南東)、アオスタ・アッシエッタ(島の西)
    formation("it-livorno", "ax", "リヴォルノ師団", "niscemi", [("a", IT), ("b", IT)], training="regular", strength=0.8),
    formation("it-napoli", "ax", "ナポリ師団", "vizzini", [("a", IT)], training="green", strength=0.7),
    formation("it-west", "ax", "アオスタ・アッシエッタ師団(島の西)", "trapani", [("a", IT), ("b", IT)], training="green", strength=0.7),
    formation("it-palermo", "ax", "パレルモの守備", "palermo", [("a", IT)], training="green", strength=0.5),
    # 独:ヘルマン・ゲーリング装甲師団(ティーガーの中隊つき。カルタジローネ)、第15装甲擲弾兵師団(島の真ん中から西)
    formation("de-hg", "ax", "ヘルマン・ゲーリング装甲師団", "caltagirone", [("pz", DE_PZ), ("tg", TIGER), ("pg", DE_INF), ("art", DE_ART)], training="regular"),
    formation("de-15pzg", "ax", "第15装甲擲弾兵師団", "caltanissetta", [("pg1", DE_INF), ("pg2", DE_INF), ("pz", DE_PZ), ("art", DE_ART)], training="veteran"),
    # 後から:第1降下猟兵師団(7月12〜13日、カターニア平野に降下・空輸)、第29装甲擲弾兵師団(7月18日〜、メッシーナから)
    formation("de-1fj", "ax", "第1降下猟兵師団", "catania", [("fj3", FJR), ("fj4", FJR)], arrive=date(1943, 7, 12), training="veteran", strength=0.6),
    formation("de-29pzg", "ax", "第29装甲擲弾兵師団", "messina", [("pg1", DE_INF), ("pg2", DE_INF), ("pz", DE_PZ)], arrive=date(1943, 7, 18), training="veteran", strength=0.9),
    # ===== 連合(第15軍集団。アレグザンダー)=====
    # 米第7軍(パットン):第3歩兵師団(リカータ)・第1歩兵師団(ジェーラ)・第45歩兵師団(スコグリッティ)・第2機甲師団(予備、11日から)・第82空挺師団
    formation("us-3id", "al", "米第3歩兵師団", "licata", [("3", US_INF), ("tk", US_TK)], D1, training="veteran", landing=True),
    formation("us-1id", "al", "米第1歩兵師団(ビッグ・レッド・ワン)", "gela", [("1", US_INF)], D1, training="veteran", landing=True),
    formation("us-45id", "al", "米第45歩兵師団", "scoglitti", [("45", US_INF)], D1, training="green", landing=True),
    formation("us-82ab", "al", "米第82空挺師団(第505落下傘歩兵連隊。風で散らばった)", "niscemi", [("505", US_PIR)], D1, training="regular", strength=0.4, landing=True),
    formation("us-2ad", "al", "米第2機甲師団", "gela", [("tk1", US_TK), ("tk2", US_TK), ("ai", US_INF)], date(1943, 7, 11), training="regular", landing=True),
    # 英第8軍(モントゴメリー):第13軍団(第5・第50師団)がアヴォラ、第30軍団(第51ハイランド・カナダ第1師団・第231旅団)がパキーノ。第1空挺師団(シラクーサの橋)
    formation("uk-xiii", "al", "英第13軍団(第5・第50歩兵師団)", "avola", [("5", UK_INF), ("50", UK_INF), ("art", UK_ART)], D1, training="veteran", landing=True),
    formation("uk-xxx", "al", "英第30軍団(第51ハイランド・カナダ第1師団)", "pachino", [("51", UK_INF), ("ca1", UK_INF), ("231", UK_INF), ("art", UK_ART)], D1, training="regular", landing=True),
    formation("uk-1ab", "al", "英第1空挺旅団(ポンテ・グランデ橋。グライダーの多くは海に落ちた)", "syracuse", [("1ab", UK_INF)], D1, training="veteran", strength=0.3, landing=True),
    formation("uk-4ab", "al", "英第4機甲旅団", "avola", [("tk1", UK_ARMD), ("tk2", UK_ARMD)], date(1943, 7, 13), training="veteran"),
    # 後から:英第78歩兵師団(7月下旬、カターニアの正面)、米第9歩兵師団(7月下旬、北岸の攻め)
    formation("uk-78", "al", "英第78歩兵師団", "avola", [("78", UK_INF), ("art", UK_ART)], date(1943, 7, 25), training="veteran"),
    formation("us-9id", "al", "米第9歩兵師団", "gela", [("9", US_INF)], date(1943, 7, 28), training="veteran"),
]
# 独の師団と伊の機動の師団はメッシーナから撤退できる(海岸の師団・守備隊は残された)
for _f in FORMATIONS:
    if _f["side"] == "ax" and _f["id"].startswith(("de-", "it-livorno", "it-napoli")):
        _f["withdraw"] = EVAC


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。連合:メッシーナを取り島を押さえれば決定的(史実)、海岸の補給の港(シラクーサ・パレルモ)とカターニアで限定的。
# 枢軸:カターニアとメッシーナを保てば決定的、撤退で独の師団を多く救えば限定的(史実の教習作戦)
VICTORY = L([
    ("al", L([
        ("conditions", [cond("messina", "messina", 6), cond("catania", "catania", 2), cond("syracuse", "syracuse", 2), cond("palermo", "palermo", 2),
                        cond("enna", "enna", 1), cond("augusta", "augusta", 1), loss("loss", 1.5, 2)]),
        ("decisive", L([("minPoints", 13), ("requires", ["messina", "catania"])])),
        ("limited", L([("minPoints", 5), ("requires", ["syracuse"])])),
    ])),
    ("ax", L([
        ("conditions", [cond("messina", "messina", 3), cond("catania", "catania", 3), cond("enna", "enna", 1), cond("palermo", "palermo", 1),
                        # 撤退:撤退できる部隊の戦力の3割(初めは5割にしたが、AI 同士で囲まれたヘルマン・ゲーリング師団が残り、3戦とも届かなかった)
                        L([("id", "evac"), ("type", "withdrawn"), ("min", 0.3), ("points", 3)]), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 9), ("requires", ["messina", "catania"])])),
        ("limited", L([("minPoints", 3), ("requires", ["evac"])])),
    ])),
])

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))。
#  - 連合:北西アフリカ航空軍(テッダー・スパーツ)。マルタ・パンテッレリーア・チュニジアから。約4千機とされる。島の飛行場を取れば前へ出す
#  - 枢軸:第2航空艦隊(リヒトホーフェン)と伊空軍。7月初めの空襲で多くを失い、島の飛行場はすぐに使えなくなった
AIR_WINGS = [
    L([("id", "al-naaf-f"), ("side", "al"), ("name", "北西アフリカ戦術航空軍(戦闘機・戦闘爆撃機)"), ("base", "malta"), ("rangeKm", 400), ("fighters", 8), ("strike", 6)]),
    L([("id", "al-naaf-b"), ("side", "al"), ("name", "北西アフリカ戦略航空軍(爆撃機)"), ("base", "malta"), ("rangeKm", 900), ("fighters", 0), ("strike", 8)]),
    L([("id", "ax-2lf"), ("side", "ax"), ("name", "第2航空艦隊(島の飛行場)"), ("base", "catania"), ("rangeKm", 300), ("fighters", 3), ("strike", 3)]),
    L([("id", "ax-2lf-it"), ("side", "ax"), ("name", "第2航空艦隊と伊空軍(本土)"), ("base", "calabria"), ("rangeKm", 500), ("fighters", 3), ("strike", 4)]),
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
        regions[rid] = r
        control[rid] = owner
    return L([
        ("id", "sicily-1943"),
        ("name", "シチリア島の戦い(1943年7〜8月)"),
        ("description",
         "ハスキー作戦。米第7軍と英第8軍が島の南東の海岸に上がり、独のヘルマン・ゲーリング師団と伊の師団が反撃する。"
         "英はカターニア平野を北へ、米は島の西とパレルモへ回り、エトナ山の線を越えてメッシーナへ。独伊は海峡を渡って引き揚げられるか。"
         "1段階は3日、13段階。v0・概略図(師団の数・日付の多くは要裏取り)"),
        ("notes", "根拠は docs/research/sicily-1943.md。作り直しは tools/campaigns/build_sicily_1943.py。部隊1つ≒1個師団。海と艦隊は入れず、上陸は上陸の増援、"
                  "海岸の地域は押さえれば連合の補給の源。独の師団と伊の機動の師団は8月11日の段階からメッシーナ・カラブリアで予定の撤退"),
        ("era", "1943-sicily"),
        ("sides", [L([("id", "al"), ("name", "連合軍(米・英・カナダ)")]), L([("id", "ax"), ("name", "枢軸軍(独・伊)")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        ("weather", [L([("stage", 1), ("weather", "clear")])]),
        ("seasons", [L([("stage", 1), ("name", "盛夏")])]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("rules", L([
            ("replacementBySide", L([("al", 0.02), ("ax", 0.01)])),
            # 枢軸の燃料・弾薬:海峡の渡しと島の鉄道は連合の空襲で細った(仮置き)
            ("stockCap", L([("ax", L([("ammo", 0.8), ("fuel", 0.6)]))])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_fighter_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "al"),
            ("level", "decisive"),
            ("summary", "連合は38日で島を取った(パレルモ7月22日、カターニア8月5日、メッシーナ8月17日)。7月25日にムッソリーニが失脚した。"
                        "独伊は8月11〜17日にメッシーナ海峡を渡って約10万人と車両約1万両を本土へ引き揚げた(数は出典で差がある)"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
