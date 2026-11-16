#!/usr/bin/env python3
"""
イタリアの防衛線(グスタフ線・アンツィオ〜ローマ。1944年1月17日〜6月5日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_italy_1944.py

出力: data/campaigns/italy-1944.json

ケッセルリンクの独第10軍はガリリアーノ川・ラピド川・カッシーノの山々にグスタフ線を築いて、ローマへの国道6号(リーリ谷)を塞いだ。
米第5軍(クラーク)は1月17〜20日にガリリアーノ・ラピド川を攻め、22日に米第6軍団をアンツィオに上げて後ろへ回ろうとしたが、独第14軍に囲まれた。
カッシーノは1〜5月に4度攻められ、5月11日のディアデム作戦で仏海外派遣軍団がアウルンチ山地を抜け、ポーランド軍がモンテ・カッシーノを取った。
5月23日にアンツィオから出て、6月4日にローマに入った。
根拠と残りの裏取りは docs/research/italy-1944.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:ノルマンディー・バルジと同じく、1個の部隊をおおよそ1個師団。装甲・機甲師団は2部隊。英連邦・仏・ポーランドの部隊は米の編成表で代える。
編成は生成器の「1944年の米独」。師団の数・位置・着いた日の多くは TODO(要裏取り)
(出典候補:Blumenson『Salerno to Cassino』・Fisher『Cassino to the Alps』(米陸軍公刊戦史)、Molony『The Mediterranean and Middle East』第5・6巻(英公刊戦史)、
Ellis『Cassino: The Hollow Victory』、D'Este『Fatal Decision: Anzio and the Battle for Rome』)。
1段階は7日(1月17日を1日目として21段階で6月12日まで)。山地は冬のアルデンヌ(深い森と起伏)で代える(山の地形の傾向はない)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/italy-1944.json"

START = date(1944, 1, 17)
DAYS_PER_STAGE = 7
STAGES = 21


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯41.5度で約83km、緯度1度は約111km)"""
    return round((lon - 12.0) * 83, 1), round((lat - 40.5) * 111, 1)


F, M = "western-farmland", "ardennes-winter"
REGIONS = [
    # 連合軍の後方と、冬の線の跡(1月の連合軍の線)
    ("naples", "ナポリ(連合の補給港)", 40.85, 14.27, F, "us", "us"),
    ("foggia", "フォッジャ(飛行場群)", 41.46, 15.55, F, "us", "us"),
    ("mignano", "ミニャーノ・サン・ピエトロ(国道6号)", 41.40, 13.98, M, None, "us"),
    ("venafro", "ヴェナフロ(仏海外派遣軍団)", 41.48, 14.05, M, None, "us"),
    ("minturno-s", "ガリリアーノ川の南(英第10軍団)", 41.22, 13.85, F, None, "us"),
    ("ortona", "オルトーナ(アドリア海側の英第8軍)", 42.35, 14.40, F, "us", "us"),
    # グスタフ線
    ("cassino", "カッシーノとモンテ・カッシーノ", 41.49, 13.83, M, None, "de"),
    ("rapido", "ラピド川(サンタンジェロ)", 41.43, 13.80, F, None, "de"),
    ("garigliano", "ガリリアーノ川(ミントゥルノ・カステルフォルテ)", 41.27, 13.75, F, None, "de"),
    ("belmonte", "カッシーノの北の山々(ベルモンテ・アティナ)", 41.62, 13.85, M, None, "de"),
    ("aurunci", "アウルンチ山地(アウソニア・ペトレッラ山)", 41.33, 13.63, M, None, "de"),
    # ヒトラー線(ゼンガー線)とローマまで
    ("liri", "リーリ谷(ポンテコルヴォ・ピエディモンテ)", 41.47, 13.67, F, None, "de"),
    ("formia", "フォルミア・ガエータ(国道7号)", 41.26, 13.60, F, None, "de"),
    ("fondi", "フォンディ・テッラチーナ", 41.33, 13.30, M, None, "de"),
    ("frosinone", "フロジノーネ(国道6号)", 41.64, 13.34, F, None, "de"),
    ("pescara", "ペスカーラ・キエーティ(アドリア海側)", 42.46, 14.21, F, None, "de"),
    ("avezzano", "アヴェッツァーノ(国道5号)", 42.03, 13.43, M, None, "de"),
    ("valmontone", "ヴァルモントーネ(国道6号)", 41.78, 12.92, F, None, "de"),
    ("cisterna", "チステルナ", 41.59, 12.83, F, None, "de"),
    ("aprilia", "アプリリア・カンポレオーネ(工場)", 41.60, 12.65, F, None, "de"),
    ("anzio", "アンツィオ・ネットゥーノ", 41.45, 12.62, F, None, "de"),
    ("alban", "アルバーノ丘陵", 41.73, 12.66, M, None, "de"),
    ("rome", "ローマ", 41.90, 12.50, F, "de", "de"),
    ("viterbo", "ヴィテルボ(独の後方)", 42.42, 12.10, F, "de", "de"),
]

# 結び:国道6号(ナポリ〜ミニャーノ〜カッシーノ〜リーリ谷〜フロジノーネ〜ヴァルモントーネ〜ローマ)、国道7号(ガリリアーノ〜フォルミア〜フォンディ〜テッラチーナ〜チステルナ)、
# 国道5号(ペスカーラ〜アヴェッツァーノ〜ローマ)、アンツィオ〜アプリリア〜アルバーノ。山越えは小道。TODO(要裏取り):1944年の道路
LINKS = [
    ("naples", "mignano", "road"),
    ("naples", "venafro", "road"),
    ("naples", "minturno-s", "road"),
    ("naples", "foggia", "road"),
    ("foggia", "ortona", "road"),
    ("mignano", "venafro", "road"),
    ("mignano", "rapido", "road"),
    ("mignano", "minturno-s", "road"),
    ("venafro", "cassino", "track"),
    ("venafro", "belmonte", "track"),
    ("ortona", "pescara", "road"),
    ("ortona", "venafro", "track"),
    ("minturno-s", "garigliano", "road"),
    ("rapido", "cassino", "road"),
    ("rapido", "liri", "road"),
    ("rapido", "garigliano", "track"),
    ("cassino", "belmonte", "track"),
    ("cassino", "liri", "road"),
    ("garigliano", "aurunci", "track"),
    ("garigliano", "formia", "road"),
    ("aurunci", "liri", "track"),
    ("aurunci", "fondi", "track"),
    ("formia", "fondi", "road"),
    ("belmonte", "frosinone", "track"),
    ("liri", "frosinone", "road"),
    ("fondi", "frosinone", "track"),
    ("fondi", "cisterna", "road"),
    ("frosinone", "valmontone", "road"),
    ("frosinone", "avezzano", "track"),
    ("pescara", "avezzano", "road"),
    ("avezzano", "rome", "road"),
    ("valmontone", "cisterna", "road"),
    ("valmontone", "alban", "road"),
    ("valmontone", "rome", "road"),
    ("cisterna", "anzio", "road"),
    ("cisterna", "aprilia", "road"),
    ("anzio", "aprilia", "road"),
    ("aprilia", "alban", "road"),
    ("alban", "rome", "road"),
    ("rome", "viterbo", "road"),
    ("pescara", "viterbo", "track"),
]
# グスタフ線とヒトラー線(独が守るときだけの塹壕線)。TODO(要裏取り):線の位置と工事の進み。
# 初めはカッシーノを坑道陣地、ガリリアーノ川・北の山々も塹壕線にしたが、AI 同士で連合軍が最後までどこも抜けず(3戦とも独の勝ち)、
# 史実で1月に英第10軍団が渡ったガリリアーノ川と、仏軍が抜けた北の山々を外し、カッシーノも塹壕線にした
FORTIFIED = {"cassino": "trench", "rapido": "trench", "liri": "trench"}

US_INF = "us_infantry_regiment_1944"
US_ARM = "us_armored_task_force_m4"
VG = "de_volksgrenadier_regiment_1944"
PZ = "de_panzer_regiment_1944"
PZG = "de_panzergrenadier_regiment_1944"


def formation(fid, side, name, region, units, arrive=None, training=None, strength=None, **extra):
    t = [("training", training)] if training else []
    s = [("strength", strength)] if strength else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t + s) for u, toe in units]
    return f


def panzer(tag):
    return [(f"{tag}pz", PZ), (f"{tag}pzg", PZG)]


def armored(tag):
    return [(f"{tag}a", US_ARM), (f"{tag}b", US_ARM)]


def inf(*tags):
    return [(t, US_INF) for t in tags]


def de_inf(*tags):
    return [(t, VG) for t in tags]


FORMATIONS = [
    # ---- 連合軍(第15軍集団 アレグザンダー)----
    # 米第5軍:米第2軍団(第34・第36歩兵師団)、英第10軍団(第5・第46・第56師団)、仏海外派遣軍団(モロッコ第2・アルジェリア第3師団。冬は山地で戦った)
    formation("us-2corps", "us", "米第2軍団(第34・第36歩兵)", "mignano", inf("34", "36"), training="regular"),
    formation("uk-10corps", "us", "英第10軍団(第5・第46・第56師団)", "minturno-s", inf("5", "46", "56"), training="regular"),
    formation("fr-cef", "us", "仏海外派遣軍団(モロッコ第2・アルジェリア第3)", "venafro", inf("2dim", "3dia"), training="veteran"),
    # 米第6軍団(ルーカス→トラスコット):1月22日にアンツィオに上陸(米第3歩兵師団・英第1師団・レンジャー・空挺)。
    # 後から米第45歩兵師団・第1機甲師団・英第56師団(2月)、米第34・第36歩兵師団(5月)
    formation("us-6corps", "us", "米第6軍団(米第3歩兵・英第1師団)", "anzio", inf("3", "uk1"), arrive=date(1944, 1, 22), training="regular", landing=True),
    formation("us-6corps-b", "us", "米第6軍団の増援(第45歩兵・第1機甲)", "anzio", inf("45") + armored("1ad"), arrive=date(1944, 1, 30), training="regular"),
    # ニュージーランド軍団(第2ニュージーランド・第4インド師団。2〜3月のカッシーノ)
    formation("nz-corps", "us", "ニュージーランド軍団(第2ニュージーランド・第4インド)", "mignano", inf("2nz", "4ind"), arrive=date(1944, 2, 3), training="veteran"),
    # 英第8軍(リース):アドリア海側の英第5軍団・カナダ第1軍団。5月のディアデム作戦の前に、第13軍団・カナダ第1軍団・ポーランド第2軍団がカッシーノ前面へ移った
    formation("uk-8army", "us", "英第8軍(アドリア海側)", "ortona", inf("ca1", "8ind") + armored("ca5"), training="regular"),
    formation("pl-2corps", "us", "ポーランド第2軍団(アンデルス)", "venafro", inf("3cr", "5kre"), arrive=date(1944, 4, 1), training="veteran"),
    formation("uk-13corps", "us", "英第13軍団(第4・第78・第8インド・第6機甲)", "mignano", inf("4", "78") + armored("6ad"), arrive=date(1944, 4, 15), training="regular"),
    # 米第85・第88歩兵師団(3〜4月に着いた新しい師団)
    formation("us-2corps-b", "us", "米第2軍団の新しい師団(第85・第88歩兵)", "minturno-s", inf("85", "88"), arrive=date(1944, 4, 1), training="green"),
    # ---- 独軍(南西方面軍 ケッセルリンク)----
    # 第10軍(フィーティングホフ)の第14装甲軍団(グスタフ線の南半分)・第51山岳軍団(北の山)。師団の数・名前の割り振りは TODO(要裏取り)
    formation("de-14pzk", "de", "第14装甲軍団(第15装甲擲弾兵・第94歩兵・第44歩兵)", "garigliano", de_inf("94", "44") + [("15pzg", PZG)], training="veteran", strength=0.8),
    formation("de-cassino", "de", "カッシーノの守備(第44歩兵の一部・第1降下猟兵)", "cassino", de_inf("1fj", "44b"), training="veteran"),
    formation("de-51mtn", "de", "第51山岳軍団(第5山岳・第305歩兵ほか)", "belmonte", de_inf("5geb", "305"), training="regular", strength=0.8),
    formation("de-rapido", "de", "ラピド川の守備(第15装甲擲弾兵師団の一部)", "rapido", [("15pzgb", PZG)], training="veteran", strength=0.8),
    formation("de-76pzk", "de", "第76装甲軍団(アドリア海側。第1降下猟兵の一部・第65・第334歩兵)", "pescara", de_inf("65", "334"), training="regular", strength=0.8),
    # 予備:第29装甲擲弾兵師団・第90装甲擲弾兵師団(1月にグスタフ線の後ろ)、ヘルマン・ゲーリング師団(ローマの近く)
    formation("de-res", "de", "第10軍の予備(第29・第90装甲擲弾兵)", "liri", [("29pzg", PZG), ("90pzg", PZG)], training="veteran", strength=0.8),
    formation("de-hg", "de", "ヘルマン・ゲーリング装甲師団", "valmontone", panzer("hg"), training="veteran", strength=0.8),
    # 第14軍(マッケンゼン):アンツィオを囲むため、北イタリア・フランス・ユーゴスラビアから集めた(第3装甲擲弾兵・第65・第715歩兵・第26装甲・第4降下猟兵ほか)
    formation("de-14army", "de", "第14軍(マッケンゼン。アンツィオの包囲)", "rome", panzer("26pz") + de_inf("3pzg", "715", "4fj"), arrive=date(1944, 1, 26), training="regular", strength=0.9),
    formation("de-14army-b", "de", "第14軍の増援(第362・第114猟兵ほか)", "viterbo", de_inf("362", "114"), arrive=date(1944, 2, 12), training="regular", strength=0.9),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。連合軍はローマを取ってカッシーノを抜けば決定的(史実)、カッシーノかリーリ谷を抜ければ限定的。
# 独軍はグスタフ線(カッシーノ・リーリ谷)とローマを保ち、アンツィオを取り返せば決定的、ローマとカッシーノを保てば限定的
VICTORY = L(
    [
        ("us", L([
            ("conditions", [cond("rome", "rome", 8), cond("cassino", "cassino", 3), cond("liri", "liri", 2), cond("valmontone", "valmontone", 2),
                            cond("anzio", "anzio", 2), cond("frosinone", "frosinone", 1), cond("pescara", "pescara", 1), loss("loss", 1.2, 2)]),
            ("decisive", L([("minPoints", 15), ("requires", ["rome", "cassino"])])),
            ("limited", L([("minPoints", 6), ("requires", ["anzio"])])),
        ])),
        ("de", L([
            ("conditions", [cond("rome", "rome", 6), cond("cassino", "cassino", 4), cond("liri", "liri", 2), cond("anzio", "anzio", 3), cond("valmontone", "valmontone", 1), loss("loss", 1.0, 2)]),
            ("decisive", L([("minPoints", 14), ("requires", ["rome", "cassino", "anzio"])])),
            ("limited", L([("minPoints", 10), ("requires", ["rome", "cassino"])])),
        ])),
    ]
)

# 航空隊(編隊1つ=実機約40機。根拠は docs/research/italy-1944.md「航空隊」。数はすべて TODO(要裏取り))
#  - 連合:地中海連合空軍(エーカー)の戦術空軍(米第12空軍・英砂漠空軍)が空を握っていた。ストラングル作戦(3〜5月)で補給線を叩いた
#  - 独:第2航空艦隊(イタリア)は数百機。アンツィオの船団と海岸堡を叩いた
AIRBASES = ["naples", "foggia", "rome", "viterbo"]
AIR_WINGS = [
    L([("id", "us-12tac"), ("side", "us"), ("name", "米第12戦術航空軍団"), ("base", "naples"), ("rangeKm", 300), ("fighters", 5), ("strike", 6)]),
    L([("id", "uk-daf"), ("side", "us"), ("name", "英砂漠空軍"), ("base", "foggia"), ("rangeKm", 300), ("fighters", 4), ("strike", 4)]),
    L([("id", "us-masaf"), ("side", "us"), ("name", "地中海連合戦略空軍の中型爆撃機(ストラングル作戦)"), ("base", "foggia"), ("rangeKm", 600), ("fighters", 0), ("strike", 5)]),
    L([("id", "de-lf2"), ("side", "de"), ("name", "第2航空艦隊(イタリア)"), ("base", "rome"), ("rangeKm", 300), ("fighters", 2), ("strike", 2)]),
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
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "de")])
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "italy-1944"),
            ("name", "イタリアの防衛線(グスタフ線〜ローマ。1944年1〜6月)"),
            (
                "description",
                "ケッセルリンクのグスタフ線がカッシーノの山々で国道6号を塞ぐ。連合軍はラピド川とガリリアーノ川を攻め、アンツィオに上がって後ろへ回るが、"
                "独第14軍に囲まれる。カッシーノを抜いてローマへ届くか。1段階は7日、21段階。v0・概略図(師団の数・位置の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/italy-1944.md。作り直しは tools/campaigns/build_italy_1944.py。部隊1つ≒1個師団。山地は冬のアルデンヌで代えた。アンツィオへの上陸は海域を通さず上陸の増援で表した"),
            ("era", "1944-us-de"),
            ("sides", [L([("id", "us"), ("name", "連合軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
            # 1〜3月は冬の雨と雪、4月から乾く(仮置き)
            ("weather", [L([("stage", 1), ("weather", "rain")]), L([("stage", 4), ("weather", "snow")]), L([("stage", 7), ("weather", "rain")]), L([("stage", 12), ("weather", "clear")])]),
            # 季節:1〜2月の冬(雨と雪で谷はぬかるみ、山は雪)、3月の雨、4月からの乾いた春(地面の度合いは仮置き)
            ("seasons", [
                # (初めは冬のぬかるみ 0.6・雪 0.2 にしたが、AI 同士で連合が谷を進めず独の決定的勝利が増えたので緩めた)
                L([("stage", 1), ("name", "冬(ぬかるみ)"), ("ground", L([("mud", 0.4), ("snow", 0.1)]))]),
                L([("stage", 7), ("name", "早春(雨)"), ("ground", L([("mud", 0.25)]))]),
                L([("stage", 12), ("name", "春")]),
            ]),
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
                        ("summary", "カッシーノは1〜5月に4度攻められ、5月18日にポーランド軍が修道院の廃墟を取った。仏海外派遣軍団はアウルンチ山地を抜き、5月23日にアンツィオから出た米第6軍団は、"
                                    "クラークの命令でヴァルモントーネではなくローマへ向かい、6月4日にローマに入った。独第10軍は包囲を逃れて北へ下がった"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
