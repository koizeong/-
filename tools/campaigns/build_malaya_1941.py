#!/usr/bin/env python3
"""
マレー作戦(1941年12月8日〜1942年2月15日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_malaya_1941.py

出力: data/campaigns/malaya-1941.json

第25軍(山下奉文中将)がシンゴラ・パタニ・コタバルに上がり、マレー半島を南へ下ってシンガポールを取った作戦。
根拠と残りの裏取りは docs/research/malaya-1941-42.md。この環境では資料のページを直接読めず、検索結果の要約だけで
組み立てた。地域は主な町を点にした概略図(位置は緯度経度からのおおよその km)、結びの道路・鉄道は大づかみ。
師団・旅団の置き場所・隷下の部隊の数・練度・増援の着く段階の多くは TODO(要裏取り)。

1段階は5日(12月8日を1日目として14段階で2月15日まで。7日では幹線の地域の数に対して段階が足りず、AI 同士で日本軍がクアラルンプールまでも届かなかった)。部隊の単位は、日本軍は連隊、英連邦軍は大隊
(1個旅団=歩兵大隊3つ+野砲大隊1つ)。編成表は太平洋のパック(data/toe/ww2-pacific.json)。
日本軍の砲兵は太平洋のパックにないので、汎用の砲兵大隊で代える(TODO(要裏取り):山砲・野砲の編成)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/malaya-1941.json"

START = date(1941, 12, 8)
DAYS_PER_STAGE = 5


def stage_of(d: date) -> int:
    """その日が入る段階(1始まり)"""
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(x は東、y は北。1度≒111km)"""
    return round((lon - 100.0) * 111, 1), round((lat - 1.0) * 111, 1)


# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主
# 緯度経度は町の中心のおおよその値(地名の位置としては中。作戦地図の表示に使うだけ)
REGIONS = [
    ("singora", "シンゴラ(ソンクラー)", 7.20, 100.60, "western-farmland", "jp", "jp"),
    ("patani", "パタニ", 6.87, 101.25, "jungle", None, "jp"),
    ("kota-bharu", "コタバル", 6.13, 102.24, "jungle", None, "uk"),
    ("jitra", "ジットラ・アロースター", 6.27, 100.42, "western-farmland", None, "uk"),
    ("kroh", "クロー", 5.71, 101.00, "jungle", None, "uk"),
    ("gurun", "グルン", 5.82, 100.47, "jungle", None, "uk"),
    ("kuala-krai", "クアラクライ", 5.53, 102.20, "jungle", None, "uk"),
    ("kampar", "カンパル・イポー", 4.30, 101.15, "jungle", None, "uk"),
    ("slim-river", "スリム川", 3.83, 101.40, "jungle", None, "uk"),
    ("kuantan", "クアンタン", 3.80, 103.33, "jungle", None, "uk"),
    ("kuala-lumpur", "クアラルンプール", 3.15, 101.70, "western-farmland", None, "uk"),
    ("gemas", "ゲマス", 2.58, 102.60, "jungle", None, "uk"),
    ("muar", "ムアル・バトゥパハ", 2.04, 102.57, "jungle", None, "uk"),
    ("kluang", "クルアン", 2.03, 103.32, "jungle", None, "uk"),
    ("mersing", "メルシン", 2.43, 103.84, "jungle", None, "uk"),
    ("johor-bahru", "ジョホールバル", 1.46, 103.76, "western-farmland", None, "uk"),
    # シンガポールは表示の重なりを避けて、実際(北緯1.35度)より南に置く
    ("singapore", "シンガポール", 1.05, 103.82, "western-farmland", "uk", "uk"),
]

# 海域(艦隊だけが入れる。docs/research/malaya-1941-42.md「海」)。位置は作戦地図の表示のためのおおよその値
SEAS = [
    ("sea-north", "南シナ海(コタバル・パタニ沖)", 6.9, 103.2),
    ("sea-east", "東海岸沖(クアンタン沖)", 3.9, 104.3),
    ("sea-south", "南の近海(エンダウ・シンガポール沖)", 2.0, 104.6),
]
SEA_LINKS = [
    ("singora", "sea-north"),
    ("patani", "sea-north"),
    ("kota-bharu", "sea-north"),
    ("kuantan", "sea-east"),
    ("mersing", "sea-south"),
    ("singapore", "sea-south"),
    ("sea-north", "sea-east"),
    ("sea-east", "sea-south"),
]

# 結び:幹線道路・鉄道・小道。TODO(要裏取り):1941年の道路網(東海岸の道路のつながり、クロー〜グリク道の状態)
LINKS = [
    ("singora", "jitra", "road"),
    ("singora", "patani", "road"),
    ("patani", "kroh", "road"),
    ("patani", "kota-bharu", "track"),
    ("jitra", "gurun", "rail"),
    ("gurun", "kroh", "track"),
    ("gurun", "kampar", "rail"),
    ("kroh", "kampar", "track"),
    ("kampar", "slim-river", "rail"),
    ("slim-river", "kuala-lumpur", "rail"),
    ("kota-bharu", "kuala-krai", "rail"),
    ("kuala-krai", "gemas", "rail"),
    ("kuantan", "kuala-lumpur", "road"),
    ("kuantan", "mersing", "track"),
    ("kuala-lumpur", "gemas", "rail"),
    ("kuala-lumpur", "muar", "road"),
    ("gemas", "muar", "road"),
    ("gemas", "kluang", "rail"),
    ("muar", "kluang", "road"),
    ("muar", "johor-bahru", "road"),
    ("kluang", "johor-bahru", "rail"),
    ("mersing", "kluang", "road"),
    ("mersing", "johor-bahru", "road"),
    ("johor-bahru", "singapore", "rail"),
]


def brigade(fid: str, side: str, name: str, region: str, battalions: list[str], arrive: date | None = None, training: str | None = None, field: bool = True):
    """英連邦軍の旅団:歩兵大隊(名前は ID の後ろに付けるだけ)と、野砲大隊1つ"""
    units = [L([("id", f"{fid}-{b}"), ("toe", "uk_infantry_battalion_1941")] + ([("training", training)] if training else [])) for b in battalions]
    if field:
        units.append(L([("id", f"{fid}-fd"), ("toe", "uk_field_regiment_1941")] + ([("training", training)] if training else [])))
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = units
    return f


def fleet(fid: str, side: str, name: str, region: str, ships: list[tuple[str, str, str]], arrive: date | None = None, training: str | None = None):
    """艦隊:艦は1隻ずつ(id の末尾・艦級・戦隊の名前)"""
    t = [("training", training)] if training else []
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = [L([("id", f"{fid}-{sid}"), ("toe", toe), ("squadron", sq)] + t) for sid, toe, sq in ships]
    return f


def jp(fid: str, name: str, region: str, regiments: list[str], tanks: int = 0, artillery: int = 1, arrive: date | None = None, training: str | None = None):
    """日本軍の師団・支隊:歩兵連隊・戦車連隊・砲兵大隊"""
    t = [("training", training)] if training else []
    units = [L([("id", f"{fid}-i{r}"), ("toe", "jp_infantry_regiment_1941")] + t) for r in regiments]
    units += [L([("id", f"{fid}-tk{i + 1}"), ("toe", "jp_tank_regiment_chiha")] + t) for i in range(tanks)]
    units += [L([("id", f"{fid}-art{i + 1}"), ("toe", "artillery_battalion")] + t) for i in range(artillery)]
    f = L([("id", fid), ("side", "jp"), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f["units"] = units
    return f


FORMATIONS = [
    # 日本軍(第25軍)
    # 第5師団:シンゴラ・パタニに上陸(12月8日)。歩兵第11・第21・第41・第42連隊。戦車は第1・第6連隊が配属とされるが、
    # 戦車の部隊・両数は出典で食い違う(TODO(要裏取り):『戦史叢書 マレー進攻作戦』)。中国戦線の経験から古参とする(ゲームの見立て)
    jp("jp-5div", "第5師団", "singora", ["11", "21", "41", "42"], tanks=2, artillery=1, training="veteran"),
    # 佗美支隊:第18師団の歩兵第56連隊が基幹。コタバルに上陸(12月8日)。ここでは隣のパタニから攻める形にする(上陸の表現はまだない)
    jp("jp-takumi", "佗美支隊", "patani", ["56"], artillery=1, training="veteran"),
    # 近衛師団:タイ経由で陸路を南下し、1月のムアルで初めて戦った。着いた日は TODO(要裏取り)。ここでは12月の第3週にシンゴラ
    jp("jp-guards", "近衛師団", "singora", ["3", "4", "5"], tanks=1, artillery=1, arrive=date(1941, 12, 22)),
    # 第18師団の主力:上陸の日・場所は TODO(要裏取り)。ここでは1月の第2週にシンゴラ
    jp("jp-18div", "第18師団(主力)", "singora", ["55", "114"], artillery=1, arrive=date(1942, 1, 12), training="veteran"),
    # 英連邦軍(マラヤ軍)
    # 第11インド師団:北西のジットラ。第6・第15旅団が前、第28旅団(グルカ)は軍団の予備で12月9日に師団へ
    brigade("uk-6bde", "uk", "第6インド旅団", "jitra", ["a", "b", "c"], training="green"),
    brigade("uk-15bde", "uk", "第15インド旅団", "jitra", ["a", "b", "c"], training="green"),
    brigade("uk-28bde", "uk", "第28インド旅団(グルカ)", "gurun", ["a", "b", "c"]),
    # 第9インド師団:東海岸。第8旅団がコタバル、第22旅団がクアンタン
    brigade("uk-8bde", "uk", "第8インド旅団", "kota-bharu", ["dogra", "baluch", "ff"]),
    brigade("uk-22bde", "uk", "第22インド旅団", "kuantan", ["a", "b", "c"]),
    # 第12インド旅団:マラヤ軍の予備(シンガポール)
    brigade("uk-12bde", "uk", "第12インド旅団", "singapore", ["argyll", "hyderabad", "punjab"]),
    # 第8オーストラリア師団:ジョホール。第22旅団はメルシン、第27旅団は TODO(要裏取り:配置)
    brigade("uk-22aus", "uk", "第22オーストラリア旅団", "mersing", ["a", "b", "c"]),
    brigade("uk-27aus", "uk", "第27オーストラリア旅団", "kluang", ["a", "b", "c"]),
    # シンガポール要塞:第1・第2マラヤ旅団(野砲は要塞の砲で、ここでは持たせない)
    brigade("uk-1mal", "uk", "第1マラヤ旅団", "singapore", ["a", "b", "c"], field=False),
    brigade("uk-2mal", "uk", "第2マラヤ旅団", "singapore", ["a", "b", "c"], field=False),
    # 増援(シンガポールに着く):第45インド旅団 1月3日、第18師団の第53旅団 1月13日、第44インド旅団 1月22日(TODO(要裏取り))、
    # 第18師団の残り(第54・第55旅団)1月29日〜2月5日。来たばかりで未熟とする
    brigade("uk-45bde", "uk", "第45インド旅団", "singapore", ["a", "b", "c"], arrive=date(1942, 1, 3), training="green"),
    brigade("uk-53bde", "uk", "第53旅団(第18師団)", "singapore", ["a", "b", "c"], arrive=date(1942, 1, 13), training="green"),
    brigade("uk-44bde", "uk", "第44インド旅団", "singapore", ["a", "b", "c"], arrive=date(1942, 1, 22), training="green"),
    brigade("uk-54bde", "uk", "第54旅団(第18師団)", "singapore", ["a", "b", "c"], arrive=date(1942, 1, 29), training="green"),
    brigade("uk-55bde", "uk", "第55旅団(第18師団)", "singapore", ["a", "b", "c"], arrive=date(1942, 1, 29), training="green"),
    # ---- 艦隊(docs/research/malaya-1941-42.md「海」。検索の要約で確かめた範囲)----
    # Z部隊:戦艦プリンス・オブ・ウェールズ・巡洋戦艦レパルスと駆逐艦4(エレクトラ・エクスプレス・ヴァンパイア・テネドス)。12月8日夕方にシンガポールを出た。
    # テネドスは燃料が少なく途中で帰った(10日の戦いにはいない)。駆逐艦の顔ぶれは出典で食い違う(エンカウンター・ジュピターとする要約もある。TODO(要裏取り))
    fleet("uk-force-z", "uk", "Z部隊", "sea-south", [
        ("pow", "uk-bb-kgv", "主力"), ("repulse", "uk-bc-renown", "主力"),
        ("electra", "uk-dd-e", "駆逐隊"), ("express", "uk-dd-e", "駆逐隊"), ("vampire", "uk-dd-vw", "駆逐隊"), ("tenedos", "uk-dd-s", "駆逐隊"),
    ]),
    # シンガポールの旧式駆逐艦:サネット(1月27日のエンダウ沖でヴァンパイアと出て沈んだ)。ヴァンパイアは Z部隊の中に置く(1隻を2つの艦隊に置けないため)
    fleet("uk-local-dd", "uk", "シンガポールの旧式駆逐艦", "sea-south", [("thanet", "uk-dd-s", "駆逐隊")]),
    # 日本:コタバル上陸の船団の護衛は軽巡 川内と駆逐艦 綾波・磯波・敷波・浦波(要約1件。TODO(要裏取り):『戦史叢書 マレー進攻作戦』)。
    # 遠くからの援護(第2艦隊・金剛型など)は艦の顔ぶれを確かめられず入れていない(TODO)
    fleet("jp-escort", "jp", "上陸船団の護衛(川内と駆逐艦4)", "sea-north", [
        ("sendai", "jp-cl-5500t", "護衛"), ("ayanami", "jp-dd-fubuki", "護衛"), ("isonami", "jp-dd-fubuki", "護衛"), ("shikinami", "jp-dd-fubuki", "護衛"), ("uranami", "jp-dd-fubuki", "護衛"),
    ], training="veteran"),
    # エンダウ上陸(1月26〜27日)の護衛:駆逐艦 吹雪・朝霧・夕霧・白雪(川内も加わったとする要約がある)。上陸した部隊は TODO(要裏取り)で入れていない
    fleet("jp-endau", "jp", "エンダウ上陸の護衛(駆逐艦4)", "sea-south", [
        ("fubuki", "jp-dd-fubuki", "護衛"), ("asagiri", "jp-dd-fubuki", "護衛"), ("yugiri", "jp-dd-fubuki", "護衛"), ("shirayuki", "jp-dd-fubuki", "護衛"),
    ], arrive=date(1942, 1, 26), training="veteran"),
]
# 海を渡って来る増援:シンガポールの増援の船団は南の近海を通り、第18師団(日本)の主力は南シナ海を通ってシンゴラへ来たとみる(TODO(要裏取り):第18師団の上陸の場所)。
# その海域を敵に押さえられている間は着かない
for _f in FORMATIONS:
    if _f["side"] == "uk" and _f.get("arriveStage") and _f["region"] == "singapore":
        _f["via"] = "sea-south"
    if _f["id"] == "jp-18div":
        _f["via"] = "sea-north"


def cond(cid: str, region: str, points: int):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


# 勝利の条件(ゲームの決め方。史実の数値ではない)。日本軍はシンガポールを取れば決定的、クアラルンプールとジョホールバルまでなら限定的。
# 英連邦軍はシンガポールとクアラルンプールを守り切れば決定的、シンガポールだけなら限定的
VICTORY = L(
    [
        (
            "jp",
            L(
                [
                    ("conditions", [cond("singapore", "singapore", 10), cond("johor-bahru", "johor-bahru", 3), cond("kuala-lumpur", "kuala-lumpur", 3), cond("kampar", "kampar", 1), cond("kuantan", "kuantan", 1), L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
                    ("decisive", L([("minPoints", 10), ("requires", ["singapore"])])),
                    ("limited", L([("minPoints", 6), ("requires", [])])),
                ]
            ),
        ),
        (
            "uk",
            L(
                [
                    ("conditions", [cond("singapore", "singapore", 6), cond("kuala-lumpur", "kuala-lumpur", 3), cond("johor-bahru", "johor-bahru", 2), cond("kampar", "kampar", 1), L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])]),
                    ("decisive", L([("minPoints", 9), ("requires", ["singapore", "kuala-lumpur"])])),
                    ("limited", L([("minPoints", 6), ("requires", ["singapore"])])),
                ]
            ),
        ),
    ]
)


# 航空基地と航空隊(根拠は docs/research/malaya-1941-42.md「航空隊」。この作業環境からは本文を開けず、検索の要約で確かめた範囲)
#  - 英連邦:12月7日に第一線機158機・予備88機(cofepow.org.uk)。Buffalo の4個飛行隊(第21・第453(豪)・第243・第488(新))で60〜65機ほど。
#    Blenheim 4個飛行隊47機・Hudson 2個飛行隊24機・Vildebeest 24機(Warfare History Network)。北部の110機は8日の終わりに約50機に減った(RAF Museum)。
#    1月13日の船団でハリケーン約50機(第53旅団と同じ船団。docs/research/malaya-1941-42.md)
#  - 日本:爆撃機250・戦闘機150(Warfare History Network。陸海軍の別は不明)。Wikipedia の要約では約800機
#  - 編隊1つ=12機(rules.air.airOps.aircraftPerGroup。キャンペーンの単位で、ほぼ飛行隊・中隊の大きさ)。航続距離と、基地への割り振りは仮置き(TODO(要裏取り))
#  - 日本の航空隊の基地はシンゴラ(初めは仏印南部から飛んだが、作戦地図にないため。シンゴラの飛行場は上陸の日に押さえた)
AIRBASES = ["singora", "jitra", "gurun", "kota-bharu", "kuantan", "singapore"]
AIR_WINGS = [
    L([("id", "jp-fighters"), ("side", "jp"), ("name", "陸海軍の戦闘機隊"), ("base", "singora"), ("rangeKm", 350), ("fighters", 12.5), ("strike", 0)]),
    L([("id", "jp-bombers"), ("side", "jp"), ("name", "陸海軍の爆撃機隊"), ("base", "singora"), ("rangeKm", 750), ("fighters", 0), ("strike", 20.8)]),
    L([("id", "uk-north-fighters"), ("side", "uk"), ("name", "第21飛行隊(Buffalo)"), ("base", "gurun"), ("rangeKm", 250), ("fighters", 1.2), ("strike", 0)]),
    L([("id", "uk-blenheims"), ("side", "uk"), ("name", "Blenheim の飛行隊"), ("base", "jitra"), ("rangeKm", 500), ("fighters", 0), ("strike", 3.9)]),
    L([("id", "uk-hudsons"), ("side", "uk"), ("name", "Hudson の飛行隊(豪)"), ("base", "kota-bharu"), ("rangeKm", 600), ("fighters", 0), ("strike", 2)]),
    L([("id", "uk-singapore-fighters"), ("side", "uk"), ("name", "シンガポールの戦闘機隊(Buffalo)"), ("base", "singapore"), ("rangeKm", 250), ("fighters", 4), ("strike", 0)]),
    L([("id", "uk-vildebeests"), ("side", "uk"), ("name", "Vildebeest の飛行隊"), ("base", "singapore"), ("rangeKm", 400), ("fighters", 0), ("strike", 2)]),
    L([("id", "uk-hurricanes"), ("side", "uk"), ("name", "ハリケーンの戦闘機隊"), ("base", "singapore"), ("rangeKm", 300), ("fighters", 4.2), ("strike", 0), ("arriveStage", 8)]),
]
# 海戦に出るときの機種(盤上の航空隊。tools/packs/build_pacific_landair_1941.py)。艦を叩く日本の爆撃機は海軍の陸攻(九六式)で表す
# (陸軍の爆撃機は艦を狙わなかったものとして、陸攻の雷装で代表させる。TODO(要裏取り):陸海軍の機数の内訳)。
# Blenheim はハドソンの水平爆撃で、ハリケーンはバッファローで代用する(陸上機のパックにない機種)
NAVAL_TOES = {
    "jp-fighters": {"fighter": "lb-a6m-land-12"},
    "jp-bombers": {"strike": "lb-g3m-torp-12", "scout": "lb-g3m-scout-3"},
    "uk-north-fighters": {"fighter": "lb-buffalo-12"},
    "uk-blenheims": {"strike": "lb-hudson-12"},
    "uk-hudsons": {"strike": "lb-hudson-12", "scout": "lb-hudson-scout-2"},
    "uk-singapore-fighters": {"fighter": "lb-buffalo-12"},
    "uk-vildebeests": {"strike": "lb-vildebeest-12"},
    "uk-hurricanes": {"fighter": "lb-buffalo-12"},
}
for _w in AIR_WINGS:
    _w["navalToes"] = NAVAL_TOES[_w["id"]]


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
    for rid, name, lat, lon in SEAS:
        x, y = km(lat, lon)
        regions[rid] = L([("name", name), ("x", x), ("y", y), ("biome", "western-farmland"), ("sea", True)])
    # 始めの制海:上陸船団の来た南シナ海は日本、シンガポールの近海は英。東海岸沖はどちらでもない
    control["sea-north"] = "jp"
    control["sea-south"] = "uk"
    end = date(1942, 2, 15)
    stages = stage_of(end)
    return L(
        [
            ("id", "malaya-1941"),
            ("name", "マレー作戦(1941年12月〜1942年2月)"),
            (
                "description",
                "第25軍がシンゴラ・パタニ・コタバルに上がり、マレー半島を南へ下ってシンガポールを目指す。英連邦軍は増援を待ちながら、"
                "半島の道路と鉄道に沿って守る。1段階は5日、14段階。v0・概略図(地域の位置と結び、兵力の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/malaya-1941-42.md。作り直しは tools/campaigns/build_malaya_1941.py。海は東海岸沖の3つの海域(Z部隊・上陸船団の護衛・エンダウ)。西海岸の海からの迂回、ペナンは表していない"),
            ("era", "1941-malaya"),
            ("sides", [L([("id", "jp"), ("name", "日本軍")]), L([("id", "uk"), ("name", "英連邦軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stages)])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS] + [L([("a", a), ("b", b), ("kind", "sea")]) for a, b in SEA_LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            # 海戦の艦艇(太平洋1942年の艦級。英の戦艦・巡洋戦艦・旧式駆逐艦を足した)と陸上機(陸攻など。海戦では盤上の航空隊)
            ("naval", L([("weapons", ["naval-generic", "pacific-ships-1942", "pacific-landair-1941"]), ("toe", ["naval-generic", "pacific-ships-1942", "pacific-landair-1941"])])),
            # 陸の戦闘に出した航空隊は、戦術の戦闘の航空司令部として渡す(docs/air-design.md)。日本の攻撃は爆撃機の編成表
            ("rules", L([("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_bomber")]))]))])),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "jp"),
                        ("level", "decisive"),
                        ("summary", "1942年2月15日、シンガポールの英連邦軍が降伏した。作戦はおよそ70日。英連邦軍の損害は13万人を超え(捕虜を含む)、日本軍の損害は1万人に届かなかったとされる(数字は出典で差がある)"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
