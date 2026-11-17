#!/usr/bin/env python3
"""
朝鮮戦争・中国人民志願軍の第二次攻勢(清川江と長津湖〜興南撤退。1950年11月25日〜12月24日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_korea_winter_1950.py

出力: data/campaigns/korea-winter-1950.json

11月24日に国連軍は「クリスマスまでに帰る」攻勢に出たが、25日夜から志願軍の第13兵団が清川江で第8軍の右翼の韓国第2軍団を破り、
第2歩兵師団は軍隅里から順川への道(「ガントレット」)で大きな損害を受けた。第8軍は平壌を捨て(12月5日)、38度線の南へ退いた。
東では第9兵団が長津湖の柳潭里・下碣隅里・古土里の第1海兵師団と第31連隊戦闘団を囲んだが、海兵は12月6〜11日に興南へ退き、
第10軍団は12月11〜24日に興南から海で撤退した。
根拠と残りの裏取りは docs/research/korea-winter-1950.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:釜山円陣から仁川へ(build_korea_1950.py)と同じく、1個の部隊をおおよそ1個師団(英連邦・トルコの旅団も1つ)。
国連軍の師団は米の1950年の歩兵連隊の編成表で、志願軍の師団は中国の歩兵連隊の編成表2つで代える。師団の数・位置の多くは TODO(要裏取り)
(出典候補:Appleman『Disaster in Korea』『East of Chosin』『Escaping the Trap』、Mossman『Ebb and Flow』(米陸軍公刊戦史)、
Montross & Canzona『The Chosin Reservoir Campaign』(海兵隊公刊戦史)、Roe『The Dragon Strikes』、Shu Guang Zhang『Mao's Military Romanticism』)。
1段階は3日(11月25日を1日目として10段階で12月24日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/korea-winter-1950.json"

START = date(1950, 11, 25)
DAYS_PER_STAGE = 3
STAGES = 10


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯39.5度で約86km、緯度1度は約111km)"""
    return round((lon - 124.5) * 86, 1), round((lat - 37.5) * 111, 1)


F, M = "western-farmland", "mountains"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 西:第8軍(清川江の線)
    ("pakchon", "博川(清川江の西)", 39.73, 125.58, F, None, "un", False),
    ("anju", "安州・新安州(清川江の渡河)", 39.62, 125.66, F, None, "un", False),
    ("kunuri", "軍隅里・价川", 39.62, 125.92, M, None, "un", False),
    ("tokchon", "徳川(韓国第2軍団)", 39.75, 126.31, M, None, "un", False),
    ("sunchon", "順川(ガントレットの南の出口)", 39.43, 125.93, M, None, "un", False),
    ("pyongyang", "平壌", 39.03, 125.75, F, "un", "un", True),
    ("chinnampo", "鎮南浦(港)", 38.73, 125.40, F, "un", "un", False),
    ("sariwon", "沙里院", 38.51, 125.76, F, None, "un", False),
    ("kaesong", "開城(38度線)", 37.97, 126.55, F, None, "un", False),
    ("seoul", "ソウル(金浦の飛行場)", 37.57, 126.98, F, "un", "un", True),
    # 真ん中:第8軍と第10軍団の間の山地
    ("yongwon", "寧遠(第8軍と第10軍団の間の山地)", 39.80, 126.80, M, None, None, False),
    ("yangdok", "陽徳(平壌〜元山の道)", 39.22, 126.62, M, None, None, False),
    # 東:第10軍団(長津湖と東海岸)
    ("yudamni", "柳潭里(長津湖の西)", 40.48, 127.12, M, None, "un", False),
    ("hagaru", "下碣隅里(長津湖の南端・飛行場)", 40.39, 127.25, M, None, "un", False),
    ("koto", "古土里・黄草嶺(水門橋)", 40.29, 127.30, M, None, "un", False),
    ("hamhung", "咸興(連浦の飛行場)", 39.92, 127.54, F, None, "un", True),
    ("hungnam", "興南(港)", 39.83, 127.62, F, "un", "un", False),
    ("wonsan", "元山(港)", 39.15, 127.44, F, "un", "un", False),
    ("pukchong", "北青", 40.00, 128.33, M, None, "un", False),
    ("hyesan", "恵山鎮(鴨緑江。第7歩兵師団)", 41.40, 128.17, M, None, "un", False),
    # 志願軍の地域と補給の源(鴨緑江の渡河)
    ("unsan", "雲山", 40.10, 125.78, M, None, "kp", False),
    ("huichon", "熙川", 40.17, 126.28, M, None, "kp", False),
    ("sakchu", "朔州・新義州(鴨緑江の渡河)", 40.30, 124.90, M, "kp", "kp", False),
    ("kanggye", "江界(北の臨時の首都)", 40.97, 126.60, M, "kp", "kp", False),
    ("changjin", "長津湖の北(第9兵団の集結地)", 40.70, 127.10, M, None, "kp", False),
]

LINKS = [
    ("pakchon", "anju", "road"), ("pakchon", "unsan", "road"), ("pakchon", "sakchu", "road"), ("anju", "kunuri", "road"),
    ("anju", "pyongyang", "rail"), ("anju", "sunchon", "road"), ("kunuri", "tokchon", "road"), ("kunuri", "sunchon", "road"),
    ("kunuri", "unsan", "track"), ("kunuri", "huichon", "road"), ("tokchon", "yongwon", "road"), ("tokchon", "huichon", "track"),
    ("tokchon", "sunchon", "track"), ("sunchon", "pyongyang", "rail"), ("pyongyang", "chinnampo", "rail"), ("pyongyang", "sariwon", "rail"),
    ("pyongyang", "yangdok", "road"), ("sariwon", "kaesong", "rail"), ("kaesong", "seoul", "rail"), ("chinnampo", "sariwon", "road"),
    ("yongwon", "yangdok", "track"), ("yongwon", "yudamni", "track"), ("yongwon", "huichon", "track"), ("yangdok", "wonsan", "road"),
    ("unsan", "huichon", "road"), ("unsan", "sakchu", "road"), ("huichon", "kanggye", "road"), ("kanggye", "changjin", "track"),
    ("changjin", "yudamni", "track"), ("changjin", "hagaru", "track"), ("yudamni", "hagaru", "road"), ("hagaru", "koto", "road"),
    ("koto", "hamhung", "road"), ("hamhung", "hungnam", "rail"), ("hamhung", "pukchong", "road"), ("hamhung", "wonsan", "rail"),
    ("pukchong", "hyesan", "road"), ("wonsan", "seoul", "rail"), ("kanggye", "hyesan", "track"), ("sakchu", "kanggye", "track"),
]

US = "us-ir-1950"
US_TK = "us-tank-bn-1950-e8"
ART = "artillery_battalion"
CN = "cn-inf-regt-1950"
KP = "kp-inf-regt-1950"
# 撤退の段階:興南からの海の撤退は12月11〜24日。12月13日の段階から、興南にいる第10軍団の部隊は戦力を保ったまま去る
EVAC = stage_of(date(1950, 12, 13))


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None, withdraw=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    if withdraw:
        f["withdraw"] = L([("stage", withdraw[0]), ("from", withdraw[1])])
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


def army(n, prefix="d"):
    """志願軍の軍(3個師団)を n 個。師団1つを中国の歩兵連隊の編成表2つで代える
    (初めは師団1つを1つにしたが、編成表の耐久が米の連隊の約6割で、AI 同士で国連軍の戦力が志願軍の約2倍になり、3戦とも国連軍の決定的勝利だった。
     史実の兵の数は志願軍が国連軍の約1.5倍とされる。TODO(要裏取り))"""
    return [(f"{prefix}{i + 1}{r}", CN) for i in range(3 * n) for r in "abc"]


X_EVAC = (EVAC, ["hungnam"])

FORMATIONS = [
    # ===== 国連軍 =====
    # 第8軍(ウォーカー)。第1軍団(第24歩兵・韓国第1・英第27旅団)、第9軍団(第2・第25歩兵・トルコ旅団)、韓国第2軍団(第6・第7・第8)、予備の第1騎兵
    # (米の師団は11月には定数を割り、韓国の補充の兵(KATUSA)と新しい補充の兵で埋め、「クリスマスまでに帰る」と気が緩んでいた。初めは満の戦力・標準の練度にしたが、
    #  AI 同士で3戦とも国連軍の決定的勝利だったので、第8軍の米の師団を戦力8割・未熟、韓国軍を6割にした。TODO(要裏取り):11月下旬の師団ごとの人員)
    formation("un-i", "un", "第1軍団(第24歩兵・韓国第1・英第27旅団)", "pakchon", [("24", US), ("rok1", US), ("27bde", US), ("art", ART)], training="green", strength=0.8),
    formation("un-ix", "un", "第9軍団(第2・第25歩兵・トルコ旅団)", "kunuri", [("2", US), ("25", US), ("tk", US_TK), ("turk", US), ("art", ART)], training="green", strength=0.8),
    formation("un-rok2", "un", "韓国第2軍団(第6・第7・第8師団)", "tokchon", [("6", US), ("7", US), ("8", US)], training="green", strength=0.6),
    formation("un-1cav", "un", "第1騎兵師団(第8軍の予備)", "sunchon", [("1cav", US), ("tk", US_TK)], training="regular", strength=0.8),
    formation("un-pyongyang", "un", "平壌の後方の部隊と英第29旅団", "pyongyang", [("29bde", US), ("rear", US)], training="green", strength=0.8),
    # 第10軍団(アーモンド)。第1海兵師団(第5・第7海兵連隊は柳潭里、第1海兵連隊は下碣隅里・古土里)、第31連隊戦闘団(長津湖の東)、
    # 第7歩兵師団の残り(恵山鎮)、第3歩兵師団(元山・咸興)、韓国第1軍団(首都・第3師団。東海岸の北)。興南から海で撤退する
    formation("un-1mar-n", "un", "第1海兵師団(第5・第7海兵連隊。柳潭里)", "yudamni", [("5mar", US), ("7mar", US), ("art", ART)], training="veteran", withdraw=X_EVAC),
    formation("un-1mar-s", "un", "第1海兵師団(第1海兵連隊)と第31連隊戦闘団", "hagaru", [("1mar", US), ("rct31", US)], training="regular", withdraw=X_EVAC),
    formation("un-koto", "un", "古土里の守備(第1海兵連隊の一部)", "koto", [("koto", US)], training="veteran", strength=0.6, withdraw=X_EVAC),
    formation("un-7id", "un", "第7歩兵師団(恵山鎮)", "hyesan", [("17", US), ("32", US)], training="regular", withdraw=X_EVAC),
    formation("un-3id", "un", "第3歩兵師団", "hamhung", [("7", US), ("15", US), ("65", US), ("tk", US_TK)], training="green", withdraw=X_EVAC),
    formation("un-rok1", "un", "韓国第1軍団(首都・第3師団)", "pukchong", [("cap", US), ("3", US)], training="green", strength=0.6, withdraw=X_EVAC),
    # ===== 中国人民志願軍と朝鮮人民軍 =====
    # 第13兵団(西):第38・第39・第40・第42・第50・第66軍。第38・第42軍が韓国第2軍団を破って第8軍の右翼の後ろへ回った
    # (軍1つ=師団3つ。冬の装備と補給が乏しく戦力9割。仮置き)
    # (初めは2つの軍を1つの formation にしたが、作戦の AI は地域の最初の formation を守りに残すので、志願軍が1つの地域から攻めに出られなかった。軍ごとに分けた)
    # 第38軍は徳川・軍隅里の戦いで「万歳軍」と呼ばれた(精鋭)
    formation("cn-38", "kp", "第38軍", "huichon", army(1), training="elite", strength=0.9),
    formation("cn-42", "kp", "第42軍", "huichon", army(1), training="veteran", strength=0.9),
    formation("cn-39", "kp", "第39軍", "unsan", army(1), training="veteran", strength=0.9),
    formation("cn-40", "kp", "第40軍", "unsan", army(1), training="veteran", strength=0.9),
    formation("cn-50", "kp", "第50軍", "sakchu", army(1), training="veteran", strength=0.9),
    formation("cn-66", "kp", "第66軍", "sakchu", army(1), training="veteran", strength=0.9),
    # 第9兵団(東):第20・第27軍が長津湖を囲み、第26軍が遅れて着いた。凍傷で大きく減った(戦力7割。仮置き)
    formation("cn-20", "kp", "第20軍(第9兵団)", "changjin", army(1), training="regular", strength=0.7),
    formation("cn-27", "kp", "第27軍(第9兵団)", "changjin", army(1), training="regular", strength=0.7),
    formation("cn-26", "kp", "第26軍(第9兵団の第2梯団)", "kanggye", army(1), arrive=date(1950, 12, 1), training="regular", strength=0.7),
    # 朝鮮人民軍の再建した部隊(山地の遊撃・第2戦線)
    formation("kp-2front", "kp", "朝鮮人民軍の第2戦線の部隊(山地)", "yongwon", [("a", KP), ("b", KP)], training="green", strength=0.5),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。志願軍:平壌を取り返し、国連軍を清川江・長津湖から追えば決定的(史実)、清川江か長津湖の片方なら限定的。
# 国連軍:平壌と清川江の線を守れば決定的、第10軍団を興南から撤退させ(6割)、ソウルを守れば限定的
VICTORY = L([
    ("kp", L([
        ("conditions", [cond("pyongyang", "pyongyang", 5), cond("kunuri", "kunuri", 2), cond("anju", "anju", 1), cond("hagaru", "hagaru", 2),
                        cond("hamhung", "hamhung", 2), cond("hungnam", "hungnam", 1), cond("wonsan", "wonsan", 1), loss("loss", 1.5, 2)]),
        ("decisive", L([("minPoints", 11), ("requires", ["pyongyang", "kunuri", "hagaru"])])),
        ("limited", L([("minPoints", 5), ("requires", [])])),
    ])),
    ("un", L([
        ("conditions", [cond("pyongyang", "pyongyang", 5), cond("seoul", "seoul", 3), cond("kunuri", "kunuri", 2), cond("hamhung", "hamhung", 2),
                        L([("id", "evac"), ("type", "withdrawn"), ("min", 0.6), ("points", 3)]), loss("loss", 1.0, 2)]),
        ("decisive", L([("minPoints", 12), ("requires", ["pyongyang", "kunuri"])])),
        ("limited", L([("minPoints", 6), ("requires", ["seoul"])])),
    ])),
])

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))。志願軍の航空は入れない(MiG-15 は鴨緑江の近くだけ)
AIR_WINGS = [
    L([("id", "un-5af"), ("side", "un"), ("name", "第5空軍(戦闘爆撃機)"), ("base", "seoul"), ("rangeKm", 500), ("fighters", 0.5), ("strike", 3)]),
    L([("id", "un-5af-n"), ("side", "un"), ("name", "第5空軍の前進の飛行隊(平壌)"), ("base", "pyongyang"), ("rangeKm", 300), ("fighters", 0.5), ("strike", 1)]),
    L([("id", "un-1maw"), ("side", "un"), ("name", "第1海兵航空団(連浦)"), ("base", "hamhung"), ("rangeKm", 250), ("fighters", 0.5), ("strike", 2)]),
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
        ("id", "korea-winter-1950"),
        ("name", "清川江と長津湖(1950年11〜12月)"),
        ("description",
         "中国人民志願軍の第二次攻勢。第13兵団が清川江で第8軍の右翼を破り、第9兵団が長津湖で第1海兵師団を囲む。"
         "第8軍は軍隅里から順川への道を抜けて退けるか、第10軍団は興南まで戦い抜いて海へ出られるか。1段階は3日、10段階。v0・概略図(師団の位置の多くは要裏取り)"),
        ("notes", "根拠は docs/research/korea-winter-1950.md。作り直しは tools/campaigns/build_korea_winter_1950.py。部隊1つ≒1個師団(志願軍の軍は3つ)。"
                  "第10軍団は12月13日の段階から興南で撤退できる(予定の撤退)。地形の傾向は山地と西欧の農村、季節は厳冬"),
        ("era", "1950-korea"),
        ("sides", [L([("id", "un"), ("name", "国連軍")]), L([("id", "kp"), ("name", "中国人民志願軍と朝鮮人民軍")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        ("weather", [L([("stage", 1), ("weather", "overcast")]), L([("stage", 2), ("weather", "snow")]), L([("stage", 4), ("weather", "clear")]),
                     L([("stage", 5), ("weather", "snow")]), L([("stage", 7), ("weather", "clear")])]),
        # 季節:11月末からシベリアの寒気(零下30度に下がった)。地面の積雪は仮置き
        ("seasons", [L([("stage", 1), ("name", "厳冬"), ("ground", L([("snow", 0.6)]))])]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("rules", L([
            # 補充:国連軍は日本からの補充の兵が少なく、志願軍は後続の軍と新兵(仮置き)
            # (初めは国連軍も3%にしたが、損耗より補充が多く損耗比が負になったので1%に)
            ("replacementBySide", L([("un", 0.01), ("kp", 0.03)])),
            # 志願軍の弾薬:徒歩とわずかな車両で運び、昼は空襲を避けた(備蓄の戻りを弾薬6割まで。仮置き)
            ("stockCap", L([("kp", L([("ammo", 0.6), ("fuel", 1)]))])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_fighter_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "kp"),
            ("level", "decisive"),
            ("summary", "第8軍は清川江から退き、第2歩兵師団は軍隅里から順川への道で約4,500人を失った。12月5日に平壌を捨て、12月下旬には38度線の南へ。"
                        "第1海兵師団は柳潭里・下碣隅里・古土里から興南へ戦い抜き、第10軍団の約10万人と民間人約9万人は12月24日までに興南から海で撤退した"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
