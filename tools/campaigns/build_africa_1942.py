#!/usr/bin/env python3
"""
北アフリカ戦線(ガザラの戦い〜トブルク〜第一次エル・アラメイン。1942年5月26日〜7月27日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_africa_1942.py

出力: data/campaigns/africa-1942.json

ロンメルのアフリカ装甲軍は5月26日にビル・ハケイムの南を回ってガザラ線の後ろへ出た。大釜(コールドロン)の戦いで英の機甲を削り、
6月11日にビル・ハケイムの自由フランス旅団が退き、6月21日にトブルクが落ちた。英第8軍はメルサ・マトルーフから退き、
7月1〜27日の第一次エル・アラメインの戦いで枢軸の前進を止めた。
根拠と残りの裏取りは docs/research/africa-1942.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:大隊・連隊(独の戦車大隊・伊の M13/40 の大隊、英の歩兵大隊・機甲連隊)。国ごとの実数の編成表(de・it・uk)。
英連邦の師団は歩兵大隊3つと野砲連隊、機甲師団は機甲連隊と自動車化歩兵の大隊。自由フランスは仏の1940年の歩兵連隊で代える。
独の歩兵(第90軽師団など)は1942年の歩兵連隊を戦力で割り引く。師団の数・隷下の部隊・着いた日の多くは TODO(要裏取り)
(出典候補:Playfair『The Mediterranean and Middle East』第3巻(英公刊戦史)、Mitcham『Rommel's Desert War』、
Jentz『Tank Combat in North Africa』、Carver『Tobruk』)。
1段階は4日(5月26日を1日目として16段階で7月27日まで)。砂漠は新しい地形の傾向「北アフリカの砂漠」(data/generators/biomes.json の desert)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/africa-1942.json"

START = date(1942, 5, 26)
DAYS_PER_STAGE = 4
END = date(1942, 7, 27)


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯31.5度で約95km、緯度1度は約111km)"""
    return round((lon - 22.0) * 111 * math.cos(math.radians(31.5)), 1), round((lat - 30.0) * 111, 1)


D = "desert"
# 地域:名前、緯度、経度、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 枢軸の後方と出撃の地
    ("derna", "デルナ・マルトゥバ(枢軸の補給と飛行場)", 32.76, 22.64, "de", "de", True),
    ("tmimi", "タミミ・セグナリ(枢軸の前線)", 32.20, 23.05, None, "de", False),
    ("south-flank", "ビル・ハケイムの南の砂漠(回り込みの道)", 31.35, 23.45, None, None, False),
    # ガザラ線(英の陣地の箱と地雷原)
    ("gazala", "ガザラ線(北の陣地の箱)", 32.12, 23.30, None, "uk", False),
    ("bir-hakeim", "ビル・ハケイム(南の陣地の箱)", 31.59, 23.48, None, "uk", False),
    ("knightsbridge", "ナイツブリッジ・大釜(コールドロン)", 31.95, 23.65, None, "uk", False),
    ("el-adem", "エル・アデム(飛行場)", 31.85, 23.92, None, "uk", True),
    ("tobruk", "トブルク(英の補給港)", 32.08, 23.96, "uk", "uk", False),
    # 国境からエジプトへ
    ("border", "国境(バルディア・ソルーム・シディ・オマル)", 31.65, 25.10, None, "uk", False),
    ("mersa-matruh", "メルサ・マトルーフ", 31.35, 27.24, None, "uk", True),
    ("fuka", "フーカ・エル・ダバ", 30.95, 28.15, None, "uk", False),
    ("el-alamein", "エル・アラメイン(海岸の陣地の箱)", 30.83, 28.95, None, "uk", False),
    ("ruweisat", "ルワイサト尾根", 30.84, 29.05, None, "uk", False),
    ("alam-halfa", "アラム・ハルファ・カッタラ低地の縁", 30.60, 28.90, None, "uk", False),
    ("alexandria", "アレクサンドリア(英の補給と飛行場)", 31.20, 29.92, "uk", "uk", True),
]

# 結び:海岸の道(ヴィア・バルビア)、砂漠の道(トリグ・カプッツォ・トリグ・エル・アブド)、マトルーフからの鉄道
LINKS = [
    ("derna", "tmimi", "road"),
    ("tmimi", "gazala", "road"),
    ("tmimi", "south-flank", "track"),
    ("tmimi", "bir-hakeim", "track"),
    ("south-flank", "bir-hakeim", "track"),
    ("south-flank", "el-adem", "track"),
    ("south-flank", "border", "track"),
    ("gazala", "knightsbridge", "track"),
    ("gazala", "tobruk", "road"),
    ("bir-hakeim", "knightsbridge", "track"),
    ("knightsbridge", "el-adem", "track"),
    ("knightsbridge", "tobruk", "track"),
    ("el-adem", "tobruk", "road"),
    ("el-adem", "border", "track"),
    ("tobruk", "border", "road"),
    ("border", "mersa-matruh", "road"),
    ("mersa-matruh", "fuka", "rail"),
    ("fuka", "el-alamein", "rail"),
    ("fuka", "ruweisat", "track"),
    ("fuka", "alam-halfa", "track"),
    ("el-alamein", "ruweisat", "track"),
    ("ruweisat", "alam-halfa", "track"),
    ("el-alamein", "alexandria", "rail"),
    ("ruweisat", "alexandria", "track"),
    ("alam-halfa", "alexandria", "track"),
]
# 英の陣地の箱と地雷原(英が守るときの塹壕線)。エル・アラメインの線は6月に急いで作った(TODO(要裏取り):陣地の出来上がり)
FORTIFIED = {"gazala": "trench", "bir-hakeim": "trench", "tobruk": "trench", "el-alamein": "trench"}

PZ = "de-pz-abt-1942"
DE_INF = "de-ir-1942"
DE_ART = "de-art-abt-lefh18"
IT_TK = "it-m13-bn-1941"
IT_INF = "it-ir-1940"
UK_INF = "uk-inf-bn-1941"
UK_ARM = "uk-armd-regt-1942"
UK_ART = "uk-field-regt-25pdr"
UK_ITK = "uk-valentine-bn-1942"


def formation(fid, side, name, region, units, arrive=None, training=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
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


FORMATIONS = [
    # ---- 枢軸(アフリカ装甲軍 ロンメル)----
    # ドイツ・アフリカ軍団:第15・第21装甲師団(戦車連隊は2個大隊ずつ。5月26日に III号・IV号・II号で約330両とされる)と第90軽師団。TODO(要裏取り):両数と隷下
    formation("de-15pz", "de", "第15装甲師団", "tmimi", [("pz1", PZ), ("pz2", PZ), ("i1", DE_INF, 0.5), ("art", DE_ART)], training="veteran"),
    formation("de-21pz", "de", "第21装甲師団", "tmimi", [("pz1", PZ), ("pz2", PZ), ("i1", DE_INF, 0.5), ("art", DE_ART)], training="veteran"),
    formation("de-90le", "de", "第90軽師団", "tmimi", [("i1", DE_INF, 0.6), ("i2", DE_INF, 0.6), ("art", DE_ART)], training="veteran"),
    # 伊第20自動車化軍団:アリエテ機甲師団(M13/40)・トリエステ自動車化師団
    formation("it-ariete", "de", "アリエテ機甲師団", "tmimi", [("tk1", IT_TK), ("tk2", IT_TK), ("i1", IT_INF, 0.5)], training="regular"),
    formation("it-trieste", "de", "トリエステ自動車化師団", "tmimi", [("i1", IT_INF, 0.7), ("tk1", IT_TK, 0.5)], training="regular"),
    # 伊第10・第21軍団の歩兵師団(パヴィア・ブレシア・トレント・サブラタ。ガザラ線の正面)
    formation("it-inf", "de", "伊第10・第21軍団の歩兵", "tmimi", [("i1", IT_INF), ("i2", IT_INF), ("i3", IT_INF), ("art", DE_ART)], training="green"),
    # 増援:リットリオ機甲師団(6月下旬)。TODO(要裏取り)
    formation("it-littorio", "de", "リットリオ機甲師団", "derna", [("tk1", IT_TK), ("tk2", IT_TK)], arrive=date(1942, 6, 22), training="green"),
    # ---- 英連邦(第8軍 リッチー→オーキンレック)----
    # 第13軍団:南ア第1師団・第50師団がガザラ線の陣地の箱、南ア第2師団がトブルク、第1・第32陸軍戦車旅団(ヴァレンタイン・マチルダ)
    formation("uk-1sa", "uk", "南ア第1師団", "gazala", [("i1", UK_INF), ("i2", UK_INF), ("i3", UK_INF), ("art", UK_ART)], training="regular"),
    formation("uk-50", "uk", "第50師団と第1陸軍戦車旅団", "gazala", [("i1", UK_INF), ("i2", UK_INF), ("i3", UK_INF), ("tk1", UK_ITK), ("tk2", UK_ITK), ("art", UK_ART)], training="regular"),
    formation("uk-2sa", "uk", "南ア第2師団(トブルクの守備)と第32陸軍戦車旅団", "tobruk", [("i1", UK_INF), ("i2", UK_INF), ("i3", UK_INF), ("tk1", UK_ITK), ("tk2", UK_ITK), ("art", UK_ART)], training="green"),
    # 第30軍団:第1機甲師団(第2・第22機甲旅団、第201近衛旅団)・第7機甲師団(第4機甲旅団・第7自動車化旅団・第3インド自動車化旅団)。
    # 英の戦車は約850両で枢軸の約560両より多かったとされる(TODO(要裏取り))。初めは機甲連隊を第1機甲師団3・第7機甲師団2・陸軍戦車旅団の大隊1ずつにしたが、
    # AI 同士で2段階目(5月末)にトブルクが落ち、アレクサンドリアまで取られる種もあったので、第1機甲師団4・第7機甲師団3・陸軍戦車旅団の大隊2ずつに増やした
    # (第1機甲師団を5にして枢軸の燃料を6割にすると、英の決定的勝利ばかりになった)
    formation("uk-1ad", "uk", "第1機甲師団", "knightsbridge", [("a1", UK_ARM), ("a2", UK_ARM), ("a3", UK_ARM), ("a4", UK_ARM), ("gds", UK_INF), ("art", UK_ART)], training="regular"),
    formation("uk-7ad", "uk", "第7機甲師団", "el-adem", [("a1", UK_ARM), ("a2", UK_ARM), ("a3", UK_ARM), ("m1", UK_INF), ("m2", UK_INF), ("art", UK_ART)], training="regular"),
    # 自由フランス第1旅団(ケーニグ):ビル・ハケイムの陣地の箱。仏の1940年の歩兵連隊を戦力6割で代える(約3,700人)
    formation("ff-1bde", "uk", "自由フランス第1旅団(ケーニグ)", "bir-hakeim", [("i1", "fr-ir-1940", 0.6), ("art", UK_ART)], training="veteran"),
    # 増援:第10インド師団(6月上旬に国境へ)、第2ニュージーランド師団(シリアから。6月下旬にメルサ・マトルーフ)、
    # 第9オーストラリア師団(7月上旬にエル・アラメイン)。TODO(要裏取り):着いた日と場所
    formation("uk-10ind", "uk", "第10インド師団", "border", [("i1", UK_INF), ("i2", UK_INF), ("i3", UK_INF), ("art", UK_ART)], arrive=date(1942, 6, 7), training="regular"),
    formation("uk-2nz", "uk", "第2ニュージーランド師団", "mersa-matruh", [("i1", UK_INF), ("i2", UK_INF), ("i3", UK_INF), ("art", UK_ART)], arrive=date(1942, 6, 21), training="veteran"),
    formation("uk-9aus", "uk", "第9オーストラリア師団", "el-alamein", [("i1", UK_INF), ("i2", UK_INF), ("i3", UK_INF), ("art", UK_ART)], arrive=date(1942, 7, 3), training="veteran"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。枢軸はトブルクを取れば限定的(史実)、エル・アラメインも抜けば決定的。
# 英連邦はトブルクを守れば限定的、ガザラ線も守れば決定的
VICTORY = L(
    [
        ("de", L([
            ("conditions", [cond("tobruk", "tobruk", 6), cond("mersa-matruh", "mersa-matruh", 2), cond("el-alamein", "el-alamein", 4), cond("alexandria", "alexandria", 6),
                            cond("bir-hakeim", "bir-hakeim", 1), cond("gazala", "gazala", 1), loss("loss", 1, 2)]),
            ("decisive", L([("minPoints", 14), ("requires", ["tobruk", "el-alamein"])])),
            ("limited", L([("minPoints", 8), ("requires", ["tobruk"])])),
        ])),
        ("uk", L([
            ("conditions", [cond("tobruk", "tobruk", 5), cond("gazala", "gazala", 3), cond("el-alamein", "el-alamein", 3), cond("alexandria", "alexandria", 3), cond("bir-hakeim", "bir-hakeim", 1), loss("loss", 1, 2)]),
            ("decisive", L([("minPoints", 12), ("requires", ["tobruk", "gazala"])])),
            ("limited", L([("minPoints", 8), ("requires", ["tobruk"])])),
        ])),
    ]
)

# 航空隊(編隊1つ=実機約40機。数はすべて TODO(要裏取り))
#  - 英:西部砂漠空軍(コニンガム。ハリケーン・キティホーク・ボストン)と、エジプトの爆撃機(ウェリントン)
#  - 枢軸:アフリカ航空指揮官(Bf 109・Ju 87)と伊の空軍(MC.202 など)。6月のビル・ハケイムに Ju 87 が繰り返し来た
AIR_WINGS = [
    L([("id", "uk-wdaf"), ("side", "uk"), ("name", "西部砂漠空軍"), ("base", "el-adem"), ("rangeKm", 300), ("fighters", 4), ("strike", 3)]),
    L([("id", "uk-205grp"), ("side", "uk"), ("name", "第205飛行群(ウェリントン)"), ("base", "alexandria"), ("rangeKm", 900), ("fighters", 0), ("strike", 2)]),
    L([("id", "de-fliegerfuehrer"), ("side", "de"), ("name", "アフリカ航空指揮官(Bf 109・Ju 87)"), ("base", "derna"), ("rangeKm", 350), ("fighters", 3), ("strike", 3)]),
    L([("id", "it-5squadra"), ("side", "de"), ("name", "伊第5航空艦隊"), ("base", "derna"), ("rangeKm", 350), ("fighters", 2), ("strike", 1)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, supply, owner, airbase in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", D)])
        if supply:
            r["supply"] = supply
        if airbase:
            r["airbase"] = True
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "uk")])
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "africa-1942"),
            ("name", "北アフリカ戦線(ガザラ〜エル・アラメイン。1942年5〜7月)"),
            (
                "description",
                "ロンメルのアフリカ装甲軍がビル・ハケイムの南を回ってガザラ線の後ろへ出る。英第8軍は陣地の箱と機甲で迎え撃ち、トブルクを守れるか。"
                "トブルクが落ちれば、エジプトのエル・アラメインが最後の線になる。1段階は4日、16段階。v0・概略図(兵力の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/africa-1942.md。作り直しは tools/campaigns/build_africa_1942.py。部隊は大隊・連隊。地中海の海と船団(マルタ)、枢軸の補給線の長さは表していない(枢軸の燃料の足りなさは備蓄の上限で代える)"),
            ("era", "1942-africa"),
            ("sides", [L([("id", "de"), ("name", "枢軸軍")]), L([("id", "uk"), ("name", "英連邦軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stage_of(END))])),
            ("weather", [L([("stage", 1), ("weather", "clear")])]),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            (
                "rules",
                L(
                    [
                        # 枢軸の燃料:トリポリ・ベンガジからの長い補給線と、マルタからの船団への攻撃で燃料がいつも足りなかった(備蓄の戻りを7割まで。仮置き)
                        ("stockCap", L([("de", L([("ammo", 0.9), ("fuel", 0.7)]))])),
                        ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 4), ("strike", 8)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_dive_bomber")]))])),
                    ]
                ),
            ),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "de"),
                        ("level", "limited"),
                        ("summary", "ガザラの戦いで英の機甲は大きく削られ、6月11日にビル・ハケイムの自由フランス旅団が退き、6月21日にトブルクが落ちて約3万3千人が捕虜になった。"
                                    "ロンメルは元帥になってエジプトへ追ったが、7月の第一次エル・アラメインの戦いで止められた"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
