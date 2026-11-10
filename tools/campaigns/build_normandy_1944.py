#!/usr/bin/env python3
"""
ノルマンディーの突破(コブラ作戦〜ファレーズ包囲、1944年7月25日〜8月21日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_normandy_1944.py

出力: data/campaigns/normandy-1944.json

米第1軍の第7軍団がサン=ロー=ペリエ街道の南で第84軍団を破り、第3軍がアヴランシュから広がる。独軍はモルタンで反撃し(リュティヒ作戦)、
カナダ軍・ポーランド軍が北から、米軍が南から挟んでファレーズの包囲を閉じる。連合軍は空を握っている。
根拠と残りの裏取りは docs/research/normandy-1944.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。

部隊の単位:バルジと同じく、1個の部隊をおおよそ1個師団。装甲・機甲師団は2部隊。英連邦・ポーランドの部隊は米の編成表で代える。
1段階は2日(7月25日を1日目として14段階で8月21日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/normandy-1944.json"

START = date(1944, 7, 25)
DAYS_PER_STAGE = 2
STAGES = 14


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。経度1度は北緯49度で約73km、緯度1度は約111km)"""
    return round((lon + 1.8) * 73, 1), round((lat - 48.3) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主
REGIONS = [
    # 連合軍の海岸堡(7月25日)
    ("carentan", "カランタン(米の海岸堡)", 49.30, -1.25, "western-farmland", "us", "us"),
    ("st-lo", "サン=ロー", 49.12, -1.09, "western-farmland", None, "us"),
    ("caumont", "コーモン", 49.09, -0.80, "western-farmland", None, "us"),
    ("bayeux", "バイユー(英の海岸堡)", 49.28, -0.70, "western-farmland", "us", "us"),
    ("caen", "カーン", 49.18, -0.37, "western-farmland", None, "us"),
    ("lessay", "レセー・ペリエ", 49.22, -1.53, "western-farmland", None, "us"),
    # 独軍の線とその後ろ
    ("marigny", "マリニー", 49.10, -1.24, "western-farmland", None, "de"),
    ("coutances", "クータンス", 49.05, -1.44, "western-farmland", None, "de"),
    ("villedieu", "ヴィルデュー", 48.84, -1.22, "western-farmland", None, "de"),
    ("avranches", "アヴランシュ", 48.68, -1.36, "western-farmland", None, "de"),
    ("vire", "ヴィール", 48.84, -0.89, "western-farmland", None, "de"),
    ("mortain", "モルタン", 48.65, -0.94, "western-farmland", None, "de"),
    ("flers", "フレール", 48.75, -0.57, "western-farmland", None, "de"),
    ("domfront", "ドンフロン", 48.59, -0.65, "western-farmland", None, "de"),
    ("falaise", "ファレーズ", 48.89, -0.20, "western-farmland", None, "de"),
    ("argentan", "アルジャンタン", 48.74, -0.02, "western-farmland", None, "de"),
    ("chambois", "シャンボワ・トラン", 48.81, 0.11, "western-farmland", None, "de"),
    ("alencon", "アランソン", 48.43, 0.09, "western-farmland", None, "de"),
    ("le-mans", "ル・マン", 48.00, 0.20, "western-farmland", None, "de"),
    ("rennes", "レンヌ", 48.11, -1.68, "western-farmland", None, "de"),
    # 独軍の補給の源(東)
    ("vimoutiers", "ヴィムティエ・リジュー(独の後方)", 48.93, 0.20, "western-farmland", "de", "de"),
    ("laigle", "レーグル(独の後方)", 48.76, 0.63, "western-farmland", "de", "de"),
]

# 結び。主な道路を大づかみに。TODO(要裏取り)
LINKS = [
    ("carentan", "st-lo", "road"),
    ("carentan", "lessay", "road"),
    ("carentan", "bayeux", "road"),
    ("bayeux", "caumont", "road"),
    ("bayeux", "caen", "road"),
    ("st-lo", "caumont", "road"),
    ("st-lo", "marigny", "road"),
    ("lessay", "coutances", "road"),
    ("lessay", "marigny", "road"),
    ("marigny", "coutances", "road"),
    ("marigny", "villedieu", "road"),
    ("st-lo", "vire", "road"),
    ("caumont", "vire", "road"),
    ("coutances", "villedieu", "road"),
    ("coutances", "avranches", "road"),
    ("villedieu", "avranches", "road"),
    ("villedieu", "vire", "road"),
    ("avranches", "mortain", "road"),
    ("avranches", "rennes", "road"),
    ("vire", "mortain", "road"),
    ("vire", "flers", "road"),
    ("mortain", "domfront", "road"),
    ("flers", "domfront", "road"),
    ("flers", "falaise", "road"),
    ("flers", "argentan", "road"),
    ("caen", "falaise", "road"),
    ("caen", "vimoutiers", "road"),
    ("falaise", "chambois", "road"),
    ("falaise", "argentan", "road"),
    ("argentan", "chambois", "road"),
    ("chambois", "vimoutiers", "road"),
    ("chambois", "laigle", "road"),
    ("argentan", "alencon", "road"),
    ("domfront", "alencon", "road"),
    ("mortain", "le-mans", "track"),
    ("rennes", "le-mans", "road"),
    ("alencon", "le-mans", "road"),
    ("alencon", "laigle", "road"),
]

US_INF = "us_infantry_regiment_1944"
US_ARM = "us_armored_task_force_m4"
VG = "de_volksgrenadier_regiment_1944"
PZ = "de_panzer_regiment_1944"
PZG = "de_panzergrenadier_regiment_1944"


def formation(fid: str, side: str, name: str, region: str, units: list[tuple[str, str]], arrive: date | None = None, training: str | None = None, strength: float | None = None):
    t = [("training", training)] if training else []
    s = [("strength", strength)] if strength else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t + s) for u, toe in units]
    return f


def panzer(tag: str):
    return [(f"{tag}pz", PZ), (f"{tag}pzg", PZG)]


def armored(tag: str):
    return [(f"{tag}a", US_ARM), (f"{tag}b", US_ARM)]


def inf(*tags: str):
    return [(t, US_INF) for t in tags]


FORMATIONS = [
    # ---- 連合軍 ----
    # 第7軍団(コリンズ):コブラ作戦の主攻。第1・第4・第9・第30歩兵師団と第2・第3機甲師団(中。Wikipedia『Operation Cobra』の戦闘序列の要約。
    # 第9・第30・機甲師団の割り当ては要約が乱れていて確かめきれない)
    formation("us-7corps-inf", "us", "第7軍団(第4・第9・第30歩兵)", "st-lo", inf("4", "9", "30"), training="veteran"),
    formation("us-7corps-exp", "us", "第7軍団の突破部隊(第1歩兵・第2・第3機甲)", "st-lo", inf("1") + armored("2ad") + armored("3ad"), training="veteran"),
    # 第8軍団:西の翼(レセー・ペリエ)。第4機甲師団(中。CGSC『Operation COBRA 4th ARMORED DIVISION』)。ほかの師団は TODO(要裏取り)
    formation("us-8corps", "us", "第8軍団(第4機甲ほか)", "lessay", armored("4ad") + [("i1", US_INF), ("i2", US_INF)], training="regular"),
    # 第19・第5軍団(サン=ローの東・コーモン):師団は TODO(要裏取り)
    formation("us-19-5corps", "us", "第19・第5軍団", "caumont", [("i1", US_INF), ("i2", US_INF), ("i3", US_INF)], training="regular"),
    # 英第2軍(カーンの南):師団は TODO(要裏取り)
    formation("uk-2army", "us", "英第2軍", "caen", armored("ukarm") + [("i1", US_INF), ("i2", US_INF), ("i3", US_INF)], training="veteran"),
    # 第3軍(パットン):8月1日に動き出し、アヴランシュから広がる。軍団・師団は TODO(要裏取り)。ここでは8月1日に海岸堡(カランタン)へ
    formation("us-3army", "us", "第3軍(第15・第20軍団)", "carentan", armored("5ad") + inf("79", "90"), arrive=date(1944, 8, 1), training="regular"),
    # カナダ第2軍団:8月8日にトータライズ作戦(中。Wikipedia『Falaise pocket』の要約)。師団は TODO。
    # ポーランド第1機甲師団(マチェク):19日にシャンボワで米軍と出会い、21日に包囲を閉じた(中。Wikipedia『Battle of Chambois』)
    formation("ca-2corps", "us", "カナダ第2軍団(ポーランド第1機甲ほか)", "caen", armored("pol") + inf("ca2", "ca3"), arrive=date(1944, 8, 7), training="regular"),
    # ---- 独軍 ----
    # 第84軍団(コルティッツ):第243・第91・第77・第265師団の残り、第2SS装甲、第17SS装甲擲弾兵、第5降下猟兵、教導戦車ほか(中)。
    # 教導戦車師団は約2,200人・装甲車両45両しかなかった(中)。ここでは装甲師団を戦力6割、歩兵の師団の残りを5割
    formation("de-84k-pz", "de", "第84軍団の装甲(教導戦車・第2SS・第17SS)", "marigny", panzer("lehr") + panzer("2ss") + [("17ss", PZG)], training="veteran", strength=0.6),
    formation("de-84k-inf", "de", "第84軍団の歩兵(第243・第91・第77・第265の残り、第5降下猟兵)", "coutances", [("243", VG), ("91", VG), ("77", VG), ("265", VG), ("5fj", VG)], training="regular", strength=0.5),
    # 第2降下猟兵軍団・第74軍団などサン=ローの東(ヴィール):師団は TODO(要裏取り)
    formation("de-east", "de", "第7軍の東の軍団(ヴィールの前)", "vire", [("i1", VG), ("i2", VG), ("i3", VG)], training="regular", strength=0.7),
    # 第5装甲軍(西方装甲集団)のカーンの南の装甲師団:第1SS・第12SS・第9SS・第21装甲などは TODO(要裏取り)。ここでは装甲師団2つ
    formation("de-pzgw", "de", "西方装甲集団(カーンの南の装甲師団)", "falaise", panzer("a") + panzer("b") + [("i1", VG)], training="veteran", strength=0.7),
    # リュティヒ作戦(8月7〜13日):第2装甲・第116装甲・第2SS装甲・第1SS装甲の一部がモルタンへ。戦車は200両より少なかった(中)。
    # ここでは第2・第116装甲を8月5日にフレールへ着く反撃の部隊にする(第2SS・第1SS はほかの部隊に含めた)
    formation("de-luttich", "de", "反撃の装甲(第2・第116装甲)", "flers", panzer("2") + panzer("116"), arrive=date(1944, 8, 5), training="veteran", strength=0.7),
]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid: str, mx: float, points: int):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。史実(8月21日):連合軍はアヴランシュ・モルタン・ファレーズ・アルジャンタン・シャンボワ・ル・マンを押さえ、
# 包囲の中に約5万人の独軍を閉じ込めた(中。Wikipedia『Battle of Chambois』)
VICTORY = L(
    [
        (
            "us",
            L(
                [
                    ("conditions", [cond("avranches", "avranches", 3), cond("mortain", "mortain", 2), cond("falaise", "falaise", 2), cond("argentan", "argentan", 2), cond("chambois", "chambois", 3), cond("le-mans", "le-mans", 2), loss("loss", 0.7, 2)]),
                    ("decisive", L([("minPoints", 13), ("requires", ["avranches", "chambois", "loss"])])),
                    ("limited", L([("minPoints", 7), ("requires", ["avranches"])])),
                ]
            ),
        ),
        (
            "de",
            L(
                [
                    ("conditions", [cond("avranches", "avranches", 4), cond("coutances", "coutances", 2), cond("vire", "vire", 1), cond("falaise", "falaise", 2), cond("chambois", "chambois", 2), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 9), ("requires", ["avranches"])])),
                    ("limited", L([("minPoints", 5), ("requires", [])])),
                ]
            ),
        ),
    ]
)

# 航空隊(根拠は docs/research/normandy-1944.md「航空隊」)
#  - 連合軍は空を握っていた。出撃は1日6,000とする資料がある。8月7日のモルタンでは第2戦術空軍のタイフーン10個飛行隊が294出撃(305とも)、
#    第19戦術航空軍団が約400出撃(資料の要約)
#  - 独:第3航空艦隊は6月5日に481機(うち戦闘機100)。その後、西の独空軍は100〜140機ほどに減った(米海軍『The G.A.F. and the Invasion of Normandy』の要約)
#  - 編隊1つ=実機約40機。連合は 6,000 ÷ 3 = 2,000機を、戦闘爆撃機(第9戦術航空軍団・第19戦術航空軍団・英第2戦術空軍)と、それを除いた残りに分ける(内訳は仮置き)。
#    独は140機を戦闘機3/4・攻撃機1/4。基地・航続距離は仮置き(TODO(要裏取り))
AIRBASES = ["carentan", "bayeux", "laigle"]
AIR_WINGS = [
    L([("id", "us-ixtac"), ("side", "us"), ("name", "第9戦術航空軍団"), ("base", "carentan"), ("rangeKm", 250), ("fighters", 6), ("strike", 6)]),
    L([("id", "us-xixtac"), ("side", "us"), ("name", "第19戦術航空軍団"), ("base", "carentan"), ("rangeKm", 250), ("fighters", 6), ("strike", 6), ("arriveStage", stage_of(date(1944, 8, 1)))]),
    L([("id", "uk-2taf"), ("side", "us"), ("name", "英第2戦術空軍(タイフーンほか)"), ("base", "bayeux"), ("rangeKm", 250), ("fighters", 6), ("strike", 8)]),
    L([("id", "de-lf3"), ("side", "de"), ("name", "第3航空艦隊"), ("base", "laigle"), ("rangeKm", 250), ("fighters", 2.6), ("strike", 0.9)]),
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
            ("id", "normandy-1944"),
            ("name", "ノルマンディーの突破(1944年7〜8月)"),
            (
                "description",
                "米第1軍がサン=ローの西で独軍の線を破り(コブラ作戦)、第3軍がアヴランシュから広がる。独軍はモルタンで反撃し、"
                "連合軍はファレーズで独第7軍を包もうとする。連合軍は空を握っている。1段階は2日、14段階。v0・概略図(兵力の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/normandy-1944.md。作り直しは tools/campaigns/build_normandy_1944.py。部隊1つ≒1個師団"),
            ("era", "1944-us-de"),
            ("sides", [L([("id", "us"), ("name", "連合軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            ("rules", L([("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_fighter_bomber")]))]))])),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "us"),
                        ("level", "decisive"),
                        ("summary", "連合軍は7月25日に突破し、アヴランシュから広がった。モルタンの反撃は第30歩兵師団と航空に止められ、8月21日にファレーズの包囲が閉じて約5万人の独軍が閉じ込められた"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
