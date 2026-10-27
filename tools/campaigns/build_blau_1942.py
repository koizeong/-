#!/usr/bin/env python3
"""
青作戦の第1段階(1942年6月28日〜7月24日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_blau_1942.py

出力: data/campaigns/blau-1942.json

南方軍集団がクルスクの東からヴォロネジへ、ハリコフの東からドン川へ、イジュームとスターリノからミレロヴォとロストフへ進んだ作戦の第1段階。
根拠と残りの裏取りは docs/research/blau-1942.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。
地域は主な町を点にした概略図(位置は緯度経度からのおおよその km)、結びの道路・鉄道は大づかみ。軍団・軍の置き場所・師団の数・練度・
ソ連の予備の軍が着く段階の多くは TODO(要裏取り)。

部隊の単位:この作戦は数十個師団が動くので、**1個の部隊(戦術の戦闘に出る駒)をおおよそ1個師団**とする(マレーと違う)。
独の歩兵師団=歩兵連隊の編成表、装甲師団=戦車連隊と狙撃兵連隊の2つ、自動車化歩兵師団=狙撃兵連隊。
ソ連の狙撃兵師団=狙撃兵連隊の編成表、戦車軍団=戦車旅団の2つ。どちらも同じ抽象なので、両軍の比は崩れない。
1段階は3日(6月28日を1日目として9段階で7月24日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/blau-1942.json"

START = date(1942, 6, 28)
END = date(1942, 7, 24)
DAYS_PER_STAGE = 3


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。経度1度は北緯50度で約71km、緯度1度は約111km)"""
    return round((lon - 36.0) * 71, 1), round((lat - 47.0) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主。緯度経度は町の中心のおおよその値(表示に使うだけ)
REGIONS = [
    ("kursk", "クルスク", 51.73, 36.19, "western-farmland", "de", "de"),
    ("kharkov", "ハリコフ", 49.99, 36.23, "western-farmland", "de", "de"),
    ("volchansk", "ヴォルチャンスク", 50.29, 36.94, "steppe", None, "de"),
    ("kupyansk", "クピャンスク", 49.71, 37.60, "steppe", None, "de"),
    ("izyum", "イジューム", 49.21, 37.25, "steppe", None, "de"),
    ("stalino", "スターリノ", 48.00, 37.80, "western-farmland", "de", "de"),
    ("taganrog", "タガンログ", 47.21, 38.94, "steppe", None, "de"),
    ("kastornoye", "カストルノエ", 51.82, 38.13, "steppe", None, "su"),
    ("stary-oskol", "スタールイ・オスコル", 51.30, 37.84, "steppe", None, "su"),
    ("voronezh", "ヴォロネジ", 51.67, 39.20, "western-farmland", None, "su"),
    ("tambov", "タンボフ", 52.72, 41.45, "western-farmland", "su", "su"),
    ("valuyki", "ヴァルイキ", 50.21, 38.10, "steppe", None, "su"),
    ("ostrogozhsk", "オストロゴーシスク", 50.87, 39.08, "steppe", None, "su"),
    ("rossosh", "ロッソシ", 50.20, 39.57, "steppe", None, "su"),
    ("kantemirovka", "カンテミロフカ", 49.70, 39.86, "steppe", None, "su"),
    ("boguchar", "ボグチャル(ドン川)", 49.93, 40.55, "steppe", None, "su"),
    ("lisichansk", "リシチャンスク", 48.90, 38.43, "steppe", None, "su"),
    ("voroshilovgrad", "ヴォロシロフグラード", 48.57, 39.33, "western-farmland", None, "su"),
    ("millerovo", "ミレロヴォ", 48.92, 40.40, "steppe", None, "su"),
    ("kamensk", "カメンスク", 48.32, 40.26, "steppe", None, "su"),
    ("morozovsk", "モロゾフスク", 48.35, 41.83, "steppe", None, "su"),
    ("rostov", "ロストフ", 47.23, 39.72, "western-farmland", None, "su"),
    ("salsk", "サリスク", 46.47, 41.54, "steppe", "su", "su"),
    ("stalingrad", "スターリングラード", 48.70, 44.50, "western-farmland", "su", "su"),
]

# 結び。TODO(要裏取り):1942年の鉄道・道路網(とくにドン川の東の道)
LINKS = [
    ("kursk", "kastornoye", "rail"),
    ("kursk", "stary-oskol", "road"),
    ("kastornoye", "voronezh", "rail"),
    ("kastornoye", "stary-oskol", "track"),
    ("stary-oskol", "voronezh", "road"),
    ("stary-oskol", "valuyki", "rail"),
    ("kursk", "volchansk", "track"),
    ("kharkov", "volchansk", "road"),
    ("volchansk", "valuyki", "road"),
    ("kharkov", "kupyansk", "rail"),
    ("kupyansk", "valuyki", "rail"),
    ("kharkov", "izyum", "road"),
    ("kupyansk", "izyum", "road"),
    ("izyum", "lisichansk", "road"),
    ("izyum", "stalino", "road"),
    ("stalino", "voroshilovgrad", "rail"),
    ("stalino", "taganrog", "rail"),
    ("taganrog", "rostov", "rail"),
    ("valuyki", "ostrogozhsk", "road"),
    ("valuyki", "rossosh", "rail"),
    ("ostrogozhsk", "voronezh", "rail"),
    ("ostrogozhsk", "rossosh", "road"),
    ("rossosh", "kantemirovka", "rail"),
    ("rossosh", "boguchar", "road"),
    ("kupyansk", "kantemirovka", "track"),
    ("lisichansk", "kantemirovka", "track"),
    ("lisichansk", "voroshilovgrad", "road"),
    ("lisichansk", "millerovo", "road"),
    ("kantemirovka", "millerovo", "rail"),
    ("kantemirovka", "boguchar", "road"),
    ("voroshilovgrad", "millerovo", "rail"),
    ("voroshilovgrad", "kamensk", "road"),
    ("millerovo", "kamensk", "rail"),
    ("kamensk", "rostov", "rail"),
    ("kamensk", "morozovsk", "road"),
    ("millerovo", "morozovsk", "track"),
    ("boguchar", "morozovsk", "track"),
    ("morozovsk", "stalingrad", "rail"),
    ("voronezh", "tambov", "rail"),
    ("rostov", "salsk", "rail"),
    ("salsk", "stalingrad", "rail"),
]

INF_DE = "de_infantry_regiment_1942"
PZ = "de_panzer_regiment_1942"
MOT = "de_motorized_infantry_regiment_1942"
ART_DE = "de_artillery_battalion_1942"
RIFLE = "su_rifle_regiment_1942"
TBDE = "su_tank_brigade_1942"
KV = "su_kv_battalion_1942"
AT_SU = "su_antitank_regiment_1942"
ART_SU = "su_artillery_battalion_1942"
# ソ連の狙撃兵師団の充足率(ゲームの見立て)。1942年の狙撃兵師団は独の歩兵師団より定数が小さく、欠員も多かったとされる。
# 同じ編成表で1個師団を表すので、戦力を6割にして釣り合わせる。TODO(要裏取り):shtat 04/200 の定数と、1942年6月の各師団の実数(Glantz)
RIFLE_STRENGTH = 0.6


def formation(fid: str, side: str, name: str, region: str, units: list[tuple[str, str]], arrive: date | None = None, training: str | None = None):
    """units:(ID の後ろ、編成表)の並び"""
    t = [("training", training)] if training else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = [L([("id", f"{fid}-{u}"), ("toe", toe)] + t + ([("strength", RIFLE_STRENGTH)] if toe == RIFLE else [])) for u, toe in units]
    return f


def panzer_div(tag: str):
    return [(f"{tag}pz", PZ), (f"{tag}sch", MOT)]


def infantry(n: int, art: int = 1):
    return [(f"i{i + 1}", INF_DE) for i in range(n)] + [(f"art{i + 1}", ART_DE) for i in range(art)]


def rifle(n: int, tanks: int = 0, art: int = 1, at: int = 0):
    return [(f"r{i + 1}", RIFLE) for i in range(n)] + [(f"tb{i + 1}", TBDE) for i in range(tanks)] + [(f"at{i + 1}", AT_SU) for i in range(at)] + [(f"art{i + 1}", ART_SU) for i in range(art)]


FORMATIONS = [
    # ---- 枢軸軍(南方軍集団) ----
    # 第4装甲軍の第48装甲軍団(ケンプ):第24装甲師団・グロースドイッチュラント自動車化歩兵師団・第16自動車化歩兵師団が先頭(中)
    formation("de-48pzk", "de", "第48装甲軍団", "kursk", panzer_div("24") + [("gd", MOT), ("16mot", MOT)], training="veteran"),
    # 第4装甲軍のもう1つの装甲軍団:第9・第11装甲師団と第3自動車化歩兵師団が緒戦で大きな役割(中)。軍団の名前・組み合わせは TODO(要裏取り)
    formation("de-24pzk", "de", "第4装甲軍の装甲軍団(第9・第11装甲)", "kursk", panzer_div("9") + panzer_div("11") + [("3mot", MOT)], training="veteran"),
    # 第2軍(独)とハンガリー第2軍:ヴォロネジへ向けて進んだ(中)。師団の数は TODO(要裏取り)
    formation("de-2army", "de", "第2軍", "kursk", infantry(5), training="regular"),
    formation("hu-2army", "de", "ハンガリー第2軍", "kursk", infantry(4), training="green"),
    # 第6軍(パウルス):第1次の攻撃の2日後(6月30日)に攻撃を始めた(中)。装甲軍団の組み合わせは TODO(要裏取り)。第3装甲師団は7月15日には
    # 第4装甲軍の下にいた(中)が、始めの所属は確かめていない。ここでは装甲師団2つと自動車化歩兵師団1つ
    formation("de-6army-pz", "de", "第6軍の装甲軍団(第3装甲ほか)", "volchansk", panzer_div("3") + panzer_div("b") + [("motc", MOT)], training="veteran"),
    formation("de-6army", "de", "第6軍", "kupyansk", infantry(6), training="regular"),
    # 第1装甲軍:7月15日にミレロヴォの南で第14装甲師団が第4装甲軍の第3装甲師団と出会った(中)。ほかの師団は TODO(要裏取り)。
    # ここでは装甲師団2つと歩兵師団2つ
    formation("de-1pza", "de", "第1装甲軍(第14装甲ほか)", "izyum", panzer_div("14") + panzer_div("b") + [("i1", INF_DE), ("i2", INF_DE)], training="veteran"),
    # 第17軍:第1装甲軍の側面を守ってドン川へ(中)。師団の数は TODO(要裏取り)
    formation("de-17army", "de", "第17軍", "stalino", infantry(4), training="regular"),
    # 第17軍の南の翼(タガンログの前)。軍団の名前・師団の数は TODO(要裏取り)
    formation("de-17army-s", "de", "第17軍の南翼", "taganrog", infantry(3), training="regular"),
    # ---- ソ連軍 ----
    # ブリャンスク正面軍の南翼(第13軍・第40軍)。第40軍は7月7日にヴォロネジ正面軍の下へ(中)。師団の数・位置は TODO(要裏取り)
    formation("su-40a", "su", "第40軍", "stary-oskol", rifle(5, tanks=1, at=1), training="green"),
    formation("su-13a", "su", "第13軍", "kastornoye", rifle(4, art=1), training="green"),
    # ブリャンスク正面軍の戦車軍団(予備)。数と名前は TODO(要裏取り)
    formation("su-bf-tk", "su", "ブリャンスク正面軍の戦車軍団", "voronezh", [("tb1", TBDE), ("tb2", TBDE), ("tb3", TBDE), ("kv1", KV)]),
    # 第5戦車軍(リジュコフ):ヴォロネジの戦いの初めに反撃を組んだ(中)。着いた日・場所は TODO(要裏取り)。ここでは7月3日にカストルノエ
    formation("su-5ta", "su", "第5戦車軍", "kastornoye", [("tb1", TBDE), ("tb2", TBDE), ("tb3", TBDE), ("tb4", TBDE), ("r1", RIFLE)], arrive=date(1942, 7, 3)),
    # 南西正面軍(第21・第28・第38・第9・第57軍。中)。位置は TODO(要裏取り)
    formation("su-21a", "su", "第21軍", "valuyki", rifle(4, at=1), training="green"),
    formation("su-28a", "su", "第28軍", "ostrogozhsk", rifle(4, tanks=1), training="green"),
    formation("su-38a", "su", "第38軍", "kantemirovka", rifle(4), training="green"),
    formation("su-9a", "su", "第9軍", "lisichansk", rifle(4, at=1), training="green"),
    # 南部正面軍(第37・第12・第18・第56・第24軍。中)
    formation("su-37a", "su", "第37軍", "voroshilovgrad", rifle(4), training="green"),
    formation("su-24a", "su", "第24軍", "millerovo", rifle(3), training="green"),
    formation("su-56a", "su", "第56軍", "rostov", rifle(4, at=1), training="green"),
    formation("su-18a", "su", "第18軍", "kamensk", rifle(3), training="green"),
    # 最高司令部の予備(第5・第7・第1予備軍)が7月に第63・第62・第64軍となり、7月12日にスターリングラード正面軍の芯になった(中)。
    # 第63軍は7月10日編成(中)。ここでは第63軍がボグチャル(ドン川)、第62・第64軍がスターリングラードに着く
    formation("su-63a", "su", "第63軍", "boguchar", rifle(5), arrive=date(1942, 7, 10), training="green"),
    formation("su-62a", "su", "第62軍", "stalingrad", rifle(5, tanks=1), arrive=date(1942, 7, 12), training="green"),
    formation("su-64a", "su", "第64軍", "stalingrad", rifle(5), arrive=date(1942, 7, 12), training="green"),
]


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid: str, mx: float, points: int):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方。史実の数値ではない)。
# 独:ヴォロネジ・ロストフを取り、ソ連軍を包み込んで損耗率で相手の半分以下なら決定的。どちらかを取って点が7以上なら限定的。
# ソ:ヴォロネジとロストフを守れば決定的、どちらかを守って点が6以上なら限定的
VICTORY = L(
    [
        (
            "de",
            L(
                [
                    ("conditions", [cond("voronezh", "voronezh", 4), cond("rostov", "rostov", 4), cond("millerovo", "millerovo", 2), cond("boguchar", "boguchar", 2), cond("kantemirovka", "kantemirovka", 1), loss("encircle", 0.5, 3)]),
                    ("decisive", L([("minPoints", 12), ("requires", ["voronezh", "rostov", "encircle"])])),
                    ("limited", L([("minPoints", 7), ("requires", [])])),
                ]
            ),
        ),
        (
            "su",
            L(
                [
                    ("conditions", [cond("voronezh", "voronezh", 4), cond("rostov", "rostov", 4), cond("millerovo", "millerovo", 1), cond("boguchar", "boguchar", 2), loss("loss", 1, 2)]),
                    ("decisive", L([("minPoints", 10), ("requires", ["voronezh", "rostov"])])),
                    ("limited", L([("minPoints", 6), ("requires", [])])),
                ]
            ),
        ),
    ]
)


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "blau-1942"),
            ("name", "青作戦 第1段階(1942年6月28日〜7月24日)"),
            (
                "description",
                "南方軍集団がクルスクの東からヴォロネジへ、ハリコフの東からドン川へ、イジュームとスターリノからミレロヴォとロストフへ進む。"
                "ソ連軍は包囲を避けて下がりながら、予備の軍をドン川の大湾曲部へ送る。1段階は3日、9段階。v0・概略図(位置と結び、兵力の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/blau-1942.md。作り直しは tools/campaigns/build_blau_1942.py。部隊1つはおおよそ1個師団。制空・天候・燃料不足は表していない"),
            ("era", "1942-ostfront"),
            ("sides", [L([("id", "de"), ("name", "枢軸軍")]), L([("id", "su"), ("name", "ソ連軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stage_of(END))])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "de"),
                        ("level", "limited"),
                        (
                            "summary",
                            "7月6日にヴォロネジの西半分を取り、7月15日にミレロヴォの南で第1・第4装甲軍が手を結んだが、ソ連軍の多くは包囲を抜けて下がった。"
                            "ロストフは7月下旬に落ちた(日付は出典で19〜24日と割れる)。7月23日の総統指令第45号で、南方軍集団はA・Bの2つに分かれ、スターリングラードとコーカサスを同時に目指した",
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
