#!/usr/bin/env python3
"""
朝鮮戦争・釜山円陣から仁川上陸へ(1950年8月4日〜9月29日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_korea_1950.py

出力: data/campaigns/korea-1950.json

朝鮮人民軍は8月5〜24日に4つの方向から釜山円陣を攻め、第4師団は5〜6日の夜に洛東江を渡った。国連軍は円陣を守りながら増援を待ち、
9月15日に第10軍団が仁川に上陸、16日に第8軍が円陣から出て、27日に烏山の近くで仁川から来た部隊と出会う。
根拠と残りの裏取りは docs/research/korea-1950.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。

部隊の単位:1個の部隊をおおよそ1個師団(連隊の編成表で代える)。朝鮮人民軍の師団は多くが定数を大きく割っていた(資料)ので戦力6割(仮置き)。
1段階は4日(8月4日を1日目として14段階で9月28日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/korea-1950.json"

START = date(1950, 8, 4)
DAYS_PER_STAGE = 4
STAGES = 14


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯36度で約90km、緯度1度は約111km)"""
    return round((lon - 126.4) * 90, 1), round((lat - 35.0) * 111, 1)


REGIONS = [
    # 釜山円陣(8月4日)
    ("pusan", "釜山", 35.18, 129.08, "western-farmland", "un", "un"),
    ("masan", "馬山", 35.21, 128.57, "western-farmland", None, "un"),
    ("miryang", "密陽", 35.50, 128.75, "western-farmland", None, "un"),
    ("yongsan", "霊山(洛東江の突出部)", 35.54, 128.43, "western-farmland", None, "un"),
    ("taegu", "大邱", 35.87, 128.60, "western-farmland", "un", "un"),
    ("waegwan", "倭館", 35.99, 128.40, "western-farmland", None, "un"),
    ("yongchon", "永川", 35.97, 128.94, "western-farmland", None, "un"),
    ("kyongju", "慶州", 35.84, 129.21, "western-farmland", None, "un"),
    ("pohang", "浦項", 36.02, 129.37, "western-farmland", None, "un"),
    # 朝鮮人民軍の手にある南の地域
    ("chinju", "晋州", 35.18, 128.08, "western-farmland", None, "kp"),
    ("hyopchon", "陜川", 35.57, 128.17, "western-farmland", None, "kp"),
    ("kimchon", "金泉", 36.12, 128.11, "western-farmland", None, "kp"),
    ("sangju", "尚州", 36.41, 128.16, "western-farmland", None, "kp"),
    ("andong", "安東", 36.57, 128.73, "western-farmland", None, "kp"),
    ("yongdok", "盈徳", 36.42, 129.37, "western-farmland", None, "kp"),
    ("kwangju", "光州", 35.16, 126.85, "western-farmland", None, "kp"),
    ("kunsan", "群山", 35.97, 126.71, "western-farmland", None, "kp"),
    ("taejon", "大田", 36.35, 127.38, "western-farmland", None, "kp"),
    ("chonan", "天安", 36.81, 127.15, "western-farmland", None, "kp"),
    ("osan", "烏山", 37.15, 127.07, "western-farmland", None, "kp"),
    ("suwon", "水原", 37.27, 127.01, "western-farmland", None, "kp"),
    ("wonju", "原州", 37.34, 127.92, "western-farmland", None, "kp"),
    ("inchon", "仁川", 37.46, 126.70, "western-farmland", None, "kp"),
    ("seoul", "ソウル", 37.57, 126.98, "western-farmland", None, "kp"),
    # 朝鮮人民軍の補給の源(38度線の北)
    ("kaesong", "開城(北の補給)", 37.97, 126.55, "western-farmland", "kp", "kp"),
    ("chunchon", "春川(北の補給)", 37.88, 127.73, "western-farmland", "kp", "kp"),
]

# 結び。主な道路と鉄道を大づかみに。TODO(要裏取り)
LINKS = [
    ("pusan", "masan", "road"),
    ("pusan", "miryang", "rail"),
    ("pusan", "kyongju", "road"),
    ("masan", "chinju", "road"),
    ("masan", "yongsan", "road"),
    ("masan", "miryang", "road"),
    ("miryang", "yongsan", "road"),
    ("miryang", "taegu", "rail"),
    ("yongsan", "hyopchon", "track"),
    ("yongsan", "taegu", "road"),
    ("taegu", "waegwan", "rail"),
    ("taegu", "yongchon", "road"),
    ("waegwan", "kimchon", "rail"),
    ("waegwan", "sangju", "road"),
    ("yongchon", "kyongju", "road"),
    ("yongchon", "andong", "road"),
    ("kyongju", "pohang", "road"),
    ("pohang", "yongdok", "road"),
    ("chinju", "hyopchon", "road"),
    ("chinju", "kwangju", "road"),
    ("hyopchon", "kimchon", "road"),
    ("kimchon", "sangju", "road"),
    ("kimchon", "taejon", "rail"),
    ("sangju", "andong", "road"),
    ("andong", "yongdok", "road"),
    ("andong", "wonju", "road"),
    ("kwangju", "kunsan", "road"),
    ("kunsan", "taejon", "road"),
    ("taejon", "chonan", "rail"),
    ("chonan", "osan", "road"),
    ("osan", "suwon", "road"),
    ("suwon", "seoul", "rail"),
    ("suwon", "inchon", "road"),
    ("inchon", "seoul", "road"),
    ("seoul", "kaesong", "rail"),
    ("seoul", "chunchon", "road"),
    ("wonju", "chunchon", "road"),
    ("wonju", "seoul", "road"),
    ("wonju", "chonan", "track"),
]

US = "us-ir-1950"
US_TK = "us-tank-bn-1950-e8"
KP = "kp-inf-regt-1950"
KP_TK = "kp-tank-regt-1950"
KP_STRENGTH = 0.6


def formation(fid: str, side: str, name: str, region: str, units: list[tuple[str, str]], arrive: date | None = None, training: str | None = None, strength: float | None = None, landing: bool = False):
    t = [("training", training)] if training else []
    s = [("strength", strength)] if strength else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    if landing:
        f["landing"] = True
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t + s) for u, toe in units]
    return f


FORMATIONS = [
    # ---- 国連軍 ----
    # 第25歩兵師団・第5連隊戦闘団・第1臨時海兵旅団:キーン任務部隊として8月7日に反撃(中。Wikipedia『Battle of the Pusan Perimeter』)。
    # ほかの米の師団(第24歩兵・第1騎兵)と韓国軍の師団の番号・位置は TODO(要裏取り)
    formation("un-tfkean", "un", "キーン任務部隊(第25歩兵・第5連隊戦闘団・第1臨時海兵旅団)", "masan", [("25", US), ("5rct", US), ("mar", US)], training="regular"),
    formation("un-us-n", "un", "第8軍の米師団(洛東江の線)", "yongsan", [("d1", US), ("d2", US), ("tk", US_TK)], training="regular"),
    # 韓国軍:9月末に約7万5千人(中)。8月の師団の数・位置は TODO(要裏取り)。ここでは北の線に師団4つ(未熟・戦力7割は仮置き)
    formation("un-rok", "un", "韓国軍(北の線)", "yongchon", [("r1", US), ("r2", US), ("r3", US), ("r4", US)], training="green", strength=0.7),
    # 増援。第2歩兵師団の着いた日は TODO(要裏取り)。ここでは8月20日に釜山
    formation("un-2id", "un", "第2歩兵師団", "pusan", [("2", US)], arrive=date(1950, 8, 20), training="green"),
    # 第10軍団:9月15日に仁川に上陸(中。Wikipedia『Battle of Inchon』・米海軍 H-Gram 054)。第1海兵師団・第7歩兵師団(中)
    formation("un-xcorps", "un", "第10軍団(第1海兵・第7歩兵)", "inchon", [("1mar", US), ("7", US), ("tk", US_TK)], arrive=date(1950, 9, 15), training="veteran", landing=True),
    # ---- 朝鮮人民軍 ----
    # 歩兵師団13・機甲師団1で円陣を攻め、8月5日の戦闘員は約7万人で多くは定数を大きく割っていた(中)。師団の番号・位置は TODO(要裏取り)。
    # 4つの方向(洛東江の突出部・大邱・永川・浦項)と南西(馬山)に分けた
    formation("kp-sw", "kp", "南西の師団(馬山の方面)", "chinju", [("a", KP), ("b", KP), ("c", KP)], training="veteran", strength=KP_STRENGTH),
    # 第4師団:8月5〜6日の夜に洛東江を渡った(第1次洛東江突出部の戦い。中)
    formation("kp-4div", "kp", "第4師団ほか(洛東江の突出部)", "hyopchon", [("4", KP), ("b", KP)], training="veteran", strength=KP_STRENGTH),
    formation("kp-taegu", "kp", "大邱へ向かう師団と機甲師団", "kimchon", [("a", KP), ("b", KP), ("c", KP), ("tk", KP_TK)], training="veteran", strength=KP_STRENGTH),
    formation("kp-n", "kp", "北の師団(尚州・安東)", "sangju", [("a", KP), ("b", KP), ("c", KP)], training="regular", strength=KP_STRENGTH),
    formation("kp-e", "kp", "東海岸の師団(浦項の方面)", "yongdok", [("a", KP), ("b", KP)], training="regular", strength=KP_STRENGTH),
    # 後方の守り(ソウル・仁川):兵力は TODO(要裏取り)。ここでは師団1つ
    formation("kp-seoul", "kp", "ソウルの守り", "seoul", [("a", KP)], training="green", strength=KP_STRENGTH),
]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid: str, mx: float, points: int):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。史実:国連軍は円陣を守り抜き、仁川に上陸してソウルを取り戻した(9月28日)
VICTORY = L(
    [
        (
            "un",
            L(
                [
                    ("conditions", [cond("pusan", "pusan", 3), cond("taegu", "taegu", 2), cond("seoul", "seoul", 4), cond("inchon", "inchon", 2), cond("taejon", "taejon", 2), cond("osan", "osan", 1), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 13), ("requires", ["pusan", "taegu", "seoul"])])),
                    ("limited", L([("minPoints", 6), ("requires", ["pusan"])])),
                ]
            ),
        ),
        (
            "kp",
            L(
                [
                    ("conditions", [cond("pusan", "pusan", 6), cond("taegu", "taegu", 3), cond("masan", "masan", 1), cond("pohang", "pohang", 1), cond("seoul", "seoul", 3), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 9), ("requires", ["pusan"])])),
                    ("limited", L([("minPoints", 5), ("requires", ["seoul"])])),
                ]
            ),
        ),
    ]
)

# 航空隊(根拠は docs/research/korea-1950.md「航空隊」)
#  - 極東空軍は8月に1日平均239の航空支援の出撃、出撃の6割より多くが戦場の敵の部隊へ(Air & Space Forces Magazine の要約)。
#    第5空軍が近接支援、第77任務部隊の空母機も円陣を支えた(資料の要約)
#  - 編隊1つ=実機約40機。239 ÷ 3 ≈ 80機の戦闘爆撃機を2編隊(仮置き)、空母機・戦闘機は TODO(要裏取り)。朝鮮人民軍の航空は入れない(TODO)
AIRBASES = ["pusan", "taegu"]
AIR_WINGS = [
    L([("id", "un-5af"), ("side", "un"), ("name", "第5空軍(戦闘爆撃機)"), ("base", "pusan"), ("rangeKm", 400), ("fighters", 0.5), ("strike", 2)]),
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
            ("id", "korea-1950"),
            ("name", "釜山円陣から仁川へ(1950年8〜9月)"),
            (
                "description",
                "朝鮮人民軍が4つの方向から釜山円陣を攻め、国連軍は洛東江の線で持ちこたえる。9月15日に第10軍団が仁川に上陸し、"
                "第8軍が円陣から出て北と南から挟む。1段階は4日、14段階。v0・概略図(師団の番号・位置の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/korea-1950.md。作り直しは tools/campaigns/build_korea_1950.py。部隊1つ≒1個師団。地形の傾向は西欧の農村で代えた(TODO:朝鮮の山地)"),
            ("era", "1950-korea"),
            ("sides", [L([("id", "un"), ("name", "国連軍")]), L([("id", "kp"), ("name", "朝鮮人民軍")])]),
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
                        ("winner", "un"),
                        ("level", "decisive"),
                        ("summary", "国連軍は釜山円陣を守り抜き、9月15日に仁川に上陸、16日に円陣から出て27日に烏山の近くで出会い、28日にソウルを取り戻した。朝鮮人民軍は崩れて北へ退いた"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
