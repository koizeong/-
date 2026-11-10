#!/usr/bin/env python3
"""
バルバロッサ作戦・中央軍集団(1941年6月22日〜8月4日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_barbarossa_1941.py

出力: data/campaigns/barbarossa-1941.json

中央軍集団(ボック)の第2装甲集団(グデーリアン)と第3装甲集団(ホート)が、ビャウィストクの突出部を両側から包み(6月28日にミンスクの東で
閉じた)、7月10日からスモレンスクへ進んで27日にその東で再び出会う。7月31日に中央軍集団は守りに移った。
根拠と残りの裏取りは docs/research/barbarossa-1941.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。

部隊の単位:青作戦と同じく、1個の部隊をおおよそ1個師団。装甲師団は戦車連隊と自動車化歩兵連隊の2つ。ソ連の狙撃兵師団は戦力6割(青作戦と同じ見立て)。
編成は生成器の「1942年の東部戦線」で代える(1941年の編成表は国ごとの実数のパックにあるが、生成器の編成にない。TODO)。
1段階は3日(6月22日を1日目として15段階で8月5日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/barbarossa-1941.json"

START = date(1941, 6, 22)
DAYS_PER_STAGE = 3
STAGES = 15


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯54度で約65km、緯度1度は約111km)"""
    return round((lon - 22.0) * 65, 1), round((lat - 51.5) * 111, 1)


REGIONS = [
    # 独の出撃の地
    ("suwalki", "スヴァウキ(第3装甲集団・第9軍)", 54.10, 22.93, "western-farmland", "de", "de"),
    ("biala", "ビャワ・ポドラスカ(第2装甲集団・第4軍)", 52.03, 23.13, "western-farmland", "de", "de"),
    ("ostrow", "オストルフ(独の後方)", 52.80, 21.90, "western-farmland", "de", "de"),
    # 国境とビャウィストクの突出部
    ("grodno", "グロドノ", 53.68, 23.83, "western-farmland", None, "su"),
    ("bialystok", "ビャウィストク", 53.13, 23.16, "western-farmland", None, "su"),
    ("brest", "ブレスト", 52.10, 23.69, "western-farmland", None, "su"),
    ("vilnius", "ヴィリニュス", 54.69, 25.28, "western-farmland", None, "su"),
    ("volkovysk", "ヴォルコヴィスク", 53.16, 24.45, "western-farmland", None, "su"),
    ("lida", "リダ", 53.89, 25.30, "western-farmland", None, "su"),
    ("slonim", "スロニム", 53.09, 25.32, "western-farmland", None, "su"),
    ("pinsk", "ピンスク(プリピャチ)", 52.11, 26.10, "western-farmland", None, "su"),
    ("baranovichi", "バラノヴィチ", 53.13, 26.01, "western-farmland", None, "su"),
    ("molodechno", "モロデチノ", 54.31, 26.85, "western-farmland", None, "su"),
    ("minsk", "ミンスク", 53.90, 27.56, "western-farmland", None, "su"),
    ("bobruisk", "ボブルイスク", 53.14, 29.22, "western-farmland", None, "su"),
    ("borisov", "ボリソフ", 54.23, 28.50, "western-farmland", None, "su"),
    ("polotsk", "ポロツク", 55.49, 28.79, "western-farmland", None, "su"),
    # ドニエプル・ドヴィナの線とスモレンスク
    ("vitebsk", "ヴィテプスク", 55.19, 30.20, "western-farmland", None, "su"),
    ("orsha", "オルシャ", 54.51, 30.42, "western-farmland", None, "su"),
    ("mogilev", "モギリョフ", 53.90, 30.33, "western-farmland", None, "su"),
    ("smolensk", "スモレンスク", 54.78, 32.04, "western-farmland", None, "su"),
    ("yelnya", "エリニャ", 54.57, 33.17, "western-farmland", None, "su"),
    ("roslavl", "ロスラヴリ", 53.95, 32.86, "western-farmland", None, "su"),
    # ソ連の補給の源
    ("vyazma", "ヴャジマ(ソの後方)", 55.21, 34.29, "western-farmland", "su", "su"),
    ("bryansk", "ブリャンスク(ソの後方)", 53.25, 34.37, "western-farmland", "su", "su"),
    ("nevel", "ネヴェリ(ソの後方)", 56.02, 29.92, "western-farmland", "su", "su"),
]

# 結び。TODO(要裏取り):1941年の道路と鉄道
LINKS = [
    ("ostrow", "suwalki", "road"),
    ("ostrow", "biala", "road"),
    ("ostrow", "bialystok", "rail"),
    ("suwalki", "grodno", "road"),
    ("suwalki", "vilnius", "road"),
    ("biala", "brest", "rail"),
    ("grodno", "bialystok", "road"),
    ("grodno", "lida", "road"),
    ("grodno", "volkovysk", "road"),
    ("bialystok", "volkovysk", "rail"),
    ("bialystok", "brest", "road"),
    ("brest", "slonim", "road"),
    ("brest", "pinsk", "track"),
    ("vilnius", "lida", "rail"),
    ("vilnius", "molodechno", "rail"),
    ("vilnius", "polotsk", "road"),
    ("volkovysk", "slonim", "road"),
    ("lida", "molodechno", "road"),
    ("lida", "baranovichi", "rail"),
    ("slonim", "baranovichi", "road"),
    ("pinsk", "baranovichi", "track"),
    ("pinsk", "bobruisk", "track"),
    ("baranovichi", "minsk", "rail"),
    ("baranovichi", "bobruisk", "road"),
    ("molodechno", "minsk", "rail"),
    ("molodechno", "polotsk", "road"),
    ("minsk", "borisov", "road"),
    ("minsk", "bobruisk", "road"),
    ("borisov", "orsha", "road"),
    ("borisov", "vitebsk", "road"),
    ("bobruisk", "mogilev", "road"),
    ("polotsk", "vitebsk", "rail"),
    ("polotsk", "nevel", "road"),
    ("vitebsk", "orsha", "rail"),
    ("vitebsk", "smolensk", "road"),
    ("vitebsk", "nevel", "road"),
    ("orsha", "mogilev", "road"),
    ("orsha", "smolensk", "rail"),
    ("mogilev", "roslavl", "road"),
    ("smolensk", "yelnya", "road"),
    ("smolensk", "vyazma", "rail"),
    ("yelnya", "vyazma", "road"),
    ("yelnya", "roslavl", "road"),
    ("roslavl", "bryansk", "rail"),
]

INF_DE = "de_infantry_regiment_1942"
PZ = "de_panzer_regiment_1942"
MOT = "de_motorized_infantry_regiment_1942"
RIFLE = "su_rifle_regiment_1942"
TBDE = "su_tank_brigade_1942"
RIFLE_STRENGTH = 0.6


def formation(fid: str, side: str, name: str, region: str, units: list[tuple[str, str]], arrive: date | None = None, training: str | None = None):
    t = [("training", training)] if training else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t + ([("strength", RIFLE_STRENGTH)] if toe == RIFLE else [])) for u, toe in units]
    return f


def panzer(n: int):
    return [u for i in range(n) for u in ((f"pz{i + 1}", PZ), (f"mot{i + 1}", MOT))]


def infantry(n: int):
    return [(f"i{i + 1}", INF_DE) for i in range(n)]


def rifle(n: int, tanks: int = 0):
    return [(f"r{i + 1}", RIFLE) for i in range(n)] + [(f"tb{i + 1}", TBDE) for i in range(tanks)]


FORMATIONS = [
    # ---- 独軍(中央軍集団)----
    # 第3装甲集団(ホート)・第2装甲集団(グデーリアン)が装甲の先鋒、第9軍・第4軍が歩兵の軍(中。IWM・Warfare History Network)。
    # 師団の数は TODO(要裏取り):ここでは装甲集団ごとに装甲師団3つ・歩兵の軍ごとに歩兵師団6つ(仮置き)
    formation("de-pzg3", "de", "第3装甲集団(ホート)", "suwalki", panzer(3), training="veteran"),
    formation("de-9army", "de", "第9軍", "suwalki", infantry(6), training="veteran"),
    formation("de-pzg2", "de", "第2装甲集団(グデーリアン)", "biala", panzer(3), training="veteran"),
    formation("de-4army", "de", "第4軍", "biala", infantry(6), training="veteran"),
    # ---- ソ連軍(西部戦線・パヴロフ)----
    # 第3・第10・第4軍が国境、第10軍は23日に反撃して失敗した(中。Wikipedia『Battle of Białystok–Minsk』)。師団の数・機械化軍団は TODO(要裏取り)
    formation("su-3a", "su", "第3軍", "grodno", rifle(3), training="green"),
    formation("su-10a", "su", "第10軍(機械化軍団つき)", "bialystok", rifle(4, tanks=2), training="green"),
    formation("su-4a", "su", "第4軍", "brest", rifle(3, tanks=1), training="green"),
    formation("su-13a", "su", "第13軍", "minsk", rifle(3), training="green"),
    # 最高司令部の予備の軍(ドニエプル・ドヴィナの線)。番号・着いた日・場所は TODO(要裏取り)。ここでは7月1日から5日にかけて
    formation("su-res-n", "su", "予備の軍(ヴィテプスク・ポロツク)", "vitebsk", rifle(4, tanks=1), arrive=date(1941, 7, 1), training="green"),
    formation("su-res-c", "su", "予備の軍(オルシャ・スモレンスク)", "orsha", rifle(4, tanks=1), arrive=date(1941, 7, 1), training="green"),
    formation("su-res-s", "su", "予備の軍(モギリョフ)", "mogilev", rifle(4), arrive=date(1941, 7, 4), training="green"),
    formation("su-res-r", "su", "予備の軍(スモレンスクの後ろ)", "vyazma", rifle(4, tanks=1), arrive=date(1941, 7, 10), training="green"),
]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid: str, mx: float, points: int):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。史実:6月28日までにビャウィストク=ミンスクで3個軍を包み32万人以上を捕らえ(IWM)、7月27日にスモレンスクの東で再び包んだ。
# 7月31日に中央軍集団は守りに移った(Warfare History Network)
VICTORY = L(
    [
        (
            "de",
            L(
                [
                    ("conditions", [cond("minsk", "minsk", 3), cond("smolensk", "smolensk", 4), cond("vitebsk", "vitebsk", 2), cond("mogilev", "mogilev", 1), cond("yelnya", "yelnya", 1), loss("encircle", 0.4, 3)]),
                    ("decisive", L([("minPoints", 11), ("requires", ["minsk", "smolensk", "encircle"])])),
                    ("limited", L([("minPoints", 6), ("requires", ["minsk"])])),
                ]
            ),
        ),
        (
            "su",
            L(
                [
                    ("conditions", [cond("smolensk", "smolensk", 4), cond("minsk", "minsk", 3), cond("mogilev", "mogilev", 2), cond("vitebsk", "vitebsk", 1), loss("loss", 1.5, 2)]),
                    ("decisive", L([("minPoints", 9), ("requires", ["smolensk", "minsk"])])),
                    ("limited", L([("minPoints", 4), ("requires", ["smolensk"])])),
                ]
            ),
        ),
    ]
)

# 航空隊(根拠は docs/research/barbarossa-1941.md「航空隊」)
#  - 独:6月21日に独空軍は全戦線で4,948機、東へ約65%。第2航空艦隊は東へ回した機の半分より多い(資料の要約)。ここでは約1,600機(65% × 4,948 ÷ 2)を仮置き
#  - ソ:西部特別軍管区は6月22日に作戦機1,812機(資料の要約)。西の軍管区の全体では戦闘機が約52%(5,460 / 10,451)
#  - 22日に独は地上で1,489機・空で322機を落としたと主張(全戦線。資料の要約)。キャンペーンでは航空基地への攻撃で表す
#  - 編隊1つ=実機約40機。独の戦闘機・攻撃機の分け方(1/3・2/3)、基地・航続距離は仮置き(TODO(要裏取り))
AIRBASES = ["suwalki", "biala", "bialystok", "minsk", "smolensk"]
AIR_WINGS = [
    L([("id", "de-ii-fk"), ("side", "de"), ("name", "第2航空軍団"), ("base", "biala"), ("rangeKm", 350), ("fighters", 6.7), ("strike", 13.3)]),
    L([("id", "de-viii-fk"), ("side", "de"), ("name", "第8航空軍団"), ("base", "suwalki"), ("rangeKm", 350), ("fighters", 6.7), ("strike", 13.3)]),
    L([("id", "su-wf-front"), ("side", "su"), ("name", "西部戦線の航空隊(国境の航空師団)"), ("base", "bialystok"), ("rangeKm", 300), ("fighters", 15.7), ("strike", 14.5)]),
    L([("id", "su-wf-rear"), ("side", "su"), ("name", "西部戦線の航空隊(後方の航空師団)"), ("base", "minsk"), ("rangeKm", 300), ("fighters", 7.9), ("strike", 7.2)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if rid in AIRBASES:
            r["airbase"] = True
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "barbarossa-1941"),
            ("name", "バルバロッサ作戦・中央軍集団(1941年6〜8月)"),
            (
                "description",
                "中央軍集団の2つの装甲集団がビャウィストクの突出部を両側から包み、ミンスクの東で閉じる。ソ連の予備の軍がドニエプル・ドヴィナの線で"
                "立ちはだかり、スモレンスクで2度目の包囲を争う。1段階は3日、15段階。v0・概略図(師団の数・日付の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/barbarossa-1941.md。作り直しは tools/campaigns/build_barbarossa_1941.py。部隊1つ≒1個師団。編成は1942年の東部戦線で代えた"),
            ("era", "1942-ostfront"),
            ("sides", [L([("id", "de"), ("name", "ドイツ軍")]), L([("id", "su"), ("name", "ソ連軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
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
                        ("summary", "6月28日までにビャウィストク=ミンスクで3個軍を包み、32万人以上を捕らえた。7月27日にスモレンスクの東で再び包んだが、7月31日に中央軍集団は守りに移り、エリニャではソ連の反撃が続いた"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
