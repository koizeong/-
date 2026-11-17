#!/usr/bin/env python3
"""
クレタ島の戦い(メルクール作戦。1941年5月20日〜6月1日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_crete_1941.py

出力: data/campaigns/crete-1941.json

5月20日朝、第7航空師団の降下猟兵がマレメ・ガラタス(監獄の谷)に、午後にレティムノ・イラクリオンに降りた。どこでも大きな損害を受けたが、
マレメの107高地をニュージーランド第22大隊が夜のうちに捨てたため、21日からマレメの飛行場に第5山岳師団が空輸で降りた。
21〜22日夜の海の船団は英の巡洋艦・駆逐艦に追い返されたが、22日から第8航空軍団が英艦隊を叩き、巡洋艦・駆逐艦を次々に沈めた。
ガラタスの反撃(25日)の後、クレタ島の連合軍(クレフォース。フライバーグ)は南岸のスファキアへ退き、28〜29日にイラクリオン、28日〜6月1日にスファキアから海で撤退した。
根拠と残りの裏取りは docs/research/crete-1941.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:大隊〜連隊。独の降下猟兵連隊は1944年の降下猟兵連隊の編成表を戦力5〜6割で(1941年の連隊は小さく、降下で散らばり重火器が少なかった)、
山岳猟兵連隊は1939年の歩兵連隊の編成表で代える。英連邦の大隊は1941年の英の歩兵大隊、ギリシャ軍の連隊は汎用の歩兵大隊(未熟・戦力5割)で代える。
兵力・位置の多くは TODO(要裏取り)(出典候補:Davin『Crete』(ニュージーランド公刊戦史)、Long『Greece, Crete and Syria』(豪公刊戦史)、
Beevor『Crete: The Battle and the Resistance』、Antill『Crete 1941』(Osprey)、Kurowski『Sprung in die Hölle』、Cunningham『A Sailor's Odyssey』)。
1段階は1日(5月20日を1日目として13段階で6月1日まで)。
"""

import json
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/crete-1941.json"

START = date(1941, 5, 20)
DAYS_PER_STAGE = 1
STAGES = 13


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯35.5度で約91km、緯度1度は約111km)"""
    return round((lon - 23.0) * 91, 1), round((lat - 35.0) * 111, 1)


F, M = "western-farmland", "mountains"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地、港
REGIONS = [
    ("kastelli", "カステリ・キサモス", 35.50, 23.64, M, None, "al", False, True),
    # マレメの飛行場:独が押さえれば空輸の補給の源になる(5月21日からの第5山岳師団の空輸)
    ("maleme", "マレメの飛行場と107高地", 35.53, 23.83, F, "de", "al", True, False),
    ("galatas", "ガラタス・監獄の谷", 35.48, 23.96, M, None, "al", False, False),
    ("chania", "ハニア・スダ湾(クレフォースの司令部と港)", 35.50, 24.07, F, "al", "al", False, True),
    ("georgioupolis", "ゲオルギウポリス", 35.36, 24.26, F, None, "al", False, False),
    ("rethymno", "レティムノの飛行場", 35.37, 24.47, F, None, "al", True, False),
    ("heraklion", "イラクリオンの飛行場と港", 35.34, 25.13, F, "al", "al", True, True),
    ("askifou", "アスキフの高原(南への山道)", 35.29, 24.19, M, None, "al", False, False),
    ("sphakia", "スファキア(南岸の撤退の浜)", 35.20, 24.14, M, None, "al", False, True),
    # 独の出撃の地(ギリシャ本土の飛行場。島とは海だけでつながる)
    ("attica", "アッティカ・ペロポネソスの飛行場(第8航空軍団)", 37.90, 23.10, F, "de", "de", True, True),
]
LINKS = [
    ("kastelli", "maleme", "road"), ("maleme", "galatas", "road"), ("galatas", "chania", "road"), ("chania", "georgioupolis", "road"),
    ("chania", "askifou", "track"), ("georgioupolis", "askifou", "track"), ("georgioupolis", "rethymno", "road"), ("rethymno", "heraklion", "road"),
    ("askifou", "sphakia", "track"), ("galatas", "askifou", "track"),
]
# 港の補給の源は海を押さえている間だけ(英艦隊が昼に北の海に居られなくなると、ハニア・イラクリオンへの補給が細る)
SUPPLY_VIA = {"chania": "sea-crete", "heraklion": "sea-crete"}
SEAS = [
    ("sea-crete", "クレタ島の北の海(エーゲ海の南)", 35.90, 24.40),
    ("sea-kythera", "キティラ海峡(西の入口)", 36.10, 23.00),
    ("sea-kasos", "カソス海峡とクレタの南(東の入口・アレクサンドリアへ)", 35.00, 26.20),
]
SEA_LINKS = [
    ("kastelli", "sea-crete"), ("maleme", "sea-crete"), ("chania", "sea-crete"), ("rethymno", "sea-crete"), ("heraklion", "sea-crete"),
    ("attica", "sea-kythera"), ("sea-crete", "sea-kythera"), ("sea-crete", "sea-kasos"), ("sphakia", "sea-kasos"), ("heraklion", "sea-kasos"),
]

FJR = "de-fjr-1944"
GEB = "de-ir-1939"
PZ = "de-pz-abt-1940"
BN = "uk-inf-bn-1941"
GR = "infantry_battalion"
MATILDA = "uk-matilda-bn-1941"
ART = "artillery_battalion"


def unit(uid, toe, training=None, strength=None, **extra):
    u = L([("id", uid), ("toe", toe)])
    if training:
        u["training"] = training
    if strength:
        u["strength"] = strength
    u.update(extra)
    return u


def formation(fid, side, name, region, units, arrive=None, **extra):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    f.update(extra)
    f["units"] = units
    return f


def battalions(fid, names, toe=BN, training="regular", strength=None):
    return [unit(f"{fid}-{n}", toe, training, strength) for n in names]


def fleet(fid, side, name, region, ships, arrive=None, training="regular"):
    return formation(fid, side, name, region, [unit(f"{fid}-{sid}", toe, training, squadron=sq) for sid, toe, sq in ships], arrive)


# 撤退:イラクリオンは5月28〜29日夜、スファキアは28日夜〜6月1日(約1万8千人が引き揚げ、約1万2千人が残された。数は出典で差がある)
# (撤退の始まりは、フライバーグが撤退を求めて許された5月27日にする。初めは船が着いた28日にしたが、AI 同士でスファキアがその前に落ち、1人も撤退できなかった)
EVAC = L([("stage", stage_of(date(1941, 5, 27))), ("from", ["sphakia", "heraklion"])])
DAY1 = date(1941, 5, 20)

FORMATIONS = [
    # ===== 独軍(第11航空軍団。シュトゥデント)=====
    # 西の群(マインドル):突撃連隊(4個大隊)がマレメへ。降下猟兵は散らばり、武器のコンテナを取りに行くまで小銃と拳銃だけだった
    # (初めは戦力5〜6割にしたが、AI 同士で3戦とも独の決定的勝利で、独の損耗が5〜10%にとどまった。降りた日に約3分の1が死傷・行方不明になったとされるので、
    #  降下の損害を引いた戦力3.5〜4.5割にした。TODO(要裏取り):5月20日の連隊ごとの損害)
    formation("de-sturm", "de", "空挺突撃連隊(マレメ)", "maleme", [unit("de-sturm-1", FJR, "veteran", 0.45)], DAY1, landing=True),
    # 中央の群:第3降下猟兵連隊(ハイトリッヒ)が監獄の谷へ、第2降下猟兵連隊(シュトゥルム)が午後にレティムノへ
    formation("de-fjr3", "de", "第3降下猟兵連隊(監獄の谷)", "galatas", [unit("de-fjr3-1", FJR, "veteran", 0.45)], DAY1, landing=True),
    formation("de-fjr2", "de", "第2降下猟兵連隊(レティムノ)", "rethymno", [unit("de-fjr2-1", FJR, "veteran", 0.35)], DAY1, landing=True),
    # 東の群:第1降下猟兵連隊(ブロイアー)が午後にイラクリオンへ
    formation("de-fjr1", "de", "第1降下猟兵連隊(イラクリオン)", "heraklion", [unit("de-fjr1-1", FJR, "veteran", 0.4)], DAY1, landing=True),
    # 第5山岳師団(リンゲル):5月21日からマレメの飛行場に空輸で降りた(飛行場は砲撃の下で、多くの Ju 52 が壊れた)
    formation("de-5geb-1", "de", "第5山岳師団(第100山岳猟兵連隊)", "maleme", [unit("de-5geb-1-1", GEB, "veteran", 0.8)], date(1941, 5, 21), landing=True),
    formation("de-5geb-2", "de", "第5山岳師団(第85山岳猟兵連隊)", "maleme", [unit("de-5geb-2-1", GEB, "veteran", 0.8), unit("de-5geb-2-2", ART, "veteran", 0.5)], date(1941, 5, 22), landing=True),
    formation("de-5geb-3", "de", "第6山岳師団の第141山岳猟兵連隊", "maleme", [unit("de-5geb-3-1", GEB, "veteran", 0.8)], date(1941, 5, 24), landing=True),
    # 海の船団(第5山岳師団の一部と第5装甲師団の戦車中隊。21〜22日夜に英艦隊に追い返され、戦車は28日ごろカステリに上がった)。北の海を押さえられている間は着かない
    formation("de-convoy", "de", "海の船団(山岳猟兵の大隊と戦車)", "kastelli", [unit("de-convoy-1", GEB, "regular", 0.4), unit("de-convoy-2", PZ, "regular", 0.3)],
              date(1941, 5, 22), via="sea-crete", landing=True),
    # ===== 連合軍(クレフォース。フライバーグ)=====
    # ニュージーランド第2師団(パティック):第5旅団がマレメ(第22・第21・第23・第28マオリ大隊)、第10旅団がガラタス(NZ の急造の大隊とギリシャ軍)、第4旅団が予備
    # (ニュージーランド・豪の大隊はギリシャの戦いを経た古参で、重火器をギリシャに置いてきた。初めは標準の練度にしたが、上の降下の損害とあわせて古参・戦力8割にした)
    formation("nz-5bde", "al", "ニュージーランド第5旅団(マレメ)", "maleme", battalions("nz-5bde", ["22", "21", "23", "28"], training="veteran", strength=0.8)),
    formation("nz-10bde", "al", "ニュージーランド第10旅団とギリシャ軍(ガラタス)", "galatas",
              battalions("nz-10bde", ["div-cav", "comp"], training="green", strength=0.7) + battalions("nz-10bde", ["gr6", "gr8"], GR, "green", 0.5)),
    formation("nz-4bde", "al", "ニュージーランド第4旅団(予備)", "chania", battalions("nz-4bde", ["18", "19", "20"], training="veteran", strength=0.8)),
    # スダ湾の守り(英の海軍基地防衛部隊・豪の砲兵の歩兵・ウェールズ連隊)
    formation("uk-suda", "al", "スダ湾の守り(ウェールズ連隊・海軍基地防衛部隊)", "chania",
              battalions("uk-suda", ["welch"]) + battalions("uk-suda", ["mnbdo", "rangers"], training="green", strength=0.6) + [unit("uk-suda-art", ART, "regular", 0.5)]),
    # 豪第19旅団(ヴェイジー):レティムノに第2/1・第2/11大隊とギリシャ軍、ゲオルギウポリスに第2/7・第2/8大隊
    formation("au-rethymno", "al", "豪第19旅団の一部とギリシャ軍(レティムノ)", "rethymno",
              battalions("au-rethymno", ["2-1", "2-11"], training="veteran") + battalions("au-rethymno", ["gr4", "gr5"], GR, "green", 0.5)),
    formation("au-19bde", "al", "豪第19旅団(ゲオルギウポリス)", "georgioupolis", battalions("au-19bde", ["2-7", "2-8"], training="veteran", strength=0.8)),
    # 英第14旅団(チャペル):イラクリオンにブラックウォッチ・レスター・ヨーク&ランカスター・アーガイル(5月下旬)と豪第2/4大隊、ギリシャ軍、戦車わずか
    formation("uk-14bde", "al", "英第14旅団(イラクリオン)", "heraklion",
              battalions("uk-14bde", ["blackwatch", "leicester", "yorklancs", "2-4"]) + battalions("uk-14bde", ["gr3", "gr7"], GR, "green", 0.5) + [unit("uk-14bde-tk", MATILDA, "regular", 0.2)]),
    # レイフォース(コマンド。5月24〜27日にスダ湾に上がり、撤退の後衛になった)。北の海を押さえられている間は着かない
    formation("uk-layforce", "al", "レイフォース(コマンド)", "chania", battalions("uk-layforce", ["a", "d"], training="veteran", strength=0.7),
              date(1941, 5, 24), via="sea-crete", withdraw=EVAC),
    # ===== 英艦隊(カニンガム。地中海艦隊)=====
    # C部隊・D部隊(巡洋艦と駆逐艦。北の海で夜に船団を追い返した)。ダイドー級・フィジー級・グロスターは艦級がないので、タウン級で代える(TODO:艦級)
    fleet("uk-force-d", "al", "D部隊(グレニー。巡洋艦と駆逐艦)", "sea-crete", [
        ("dido", "uk-cl-town", "巡洋艦"), ("orion", "uk-cl-town", "巡洋艦"), ("ajax", "uk-cl-town", "巡洋艦"),
        ("janus", "uk-dd-gh", "駆逐隊"), ("kimberley", "uk-dd-gh", "駆逐隊"), ("hasty", "uk-dd-gh", "駆逐隊"), ("hereward", "uk-dd-gh", "駆逐隊"),
    ]),
    fleet("uk-force-c", "al", "C部隊(キング。巡洋艦と駆逐艦)", "sea-kasos", [
        ("naiad", "uk-cl-town", "巡洋艦"), ("perth", "uk-cl-town", "巡洋艦"), ("calcutta", "uk-cl-town", "巡洋艦"),
        ("kandahar", "uk-dd-tribal", "駆逐隊"), ("nubian", "uk-dd-tribal", "駆逐隊"), ("kingston", "uk-dd-gh", "駆逐隊"), ("juno", "uk-dd-gh", "駆逐隊"),
    ]),
    # A1部隊(戦艦ウォースパイト・ヴァリアントと駆逐艦。キティラ海峡の西で援護した)
    fleet("uk-force-a1", "al", "A1部隊(戦艦ウォースパイト・ヴァリアント)", "sea-kythera", [
        ("warspite", "uk-bb-qe", "戦艦"), ("valiant", "uk-bb-qe", "戦艦"),
        ("griffin", "uk-dd-gh", "駆逐隊"), ("greyhound", "uk-dd-gh", "駆逐隊"), ("decoy", "uk-dd-gh", "駆逐隊"), ("hero", "uk-dd-gh", "駆逐隊"),
    ]),
]
# ニュージーランド・豪・英の陸の部隊は、スファキアかイラクリオンから撤退できる(ギリシャ軍の大隊も同じ formation なので一緒に数える)
for _f in FORMATIONS:
    if _f["side"] == "al" and _f["region"] not in ("sea-crete", "sea-kasos", "sea-kythera") and "withdraw" not in _f:
        _f["withdraw"] = EVAC

# 航空隊(編隊1つ=12機。rules.air.airOps.aircraftPerGroup)。第8航空軍団(リヒトホーフェン)は約600機の作戦機を持っていたとされる(TODO(要裏取り))。
# 連合軍の航空は5月19日に島から引き揚げ、エジプトからはほとんど届かなかったので入れない
AIR_WINGS = [
    L([("id", "de-stg2"), ("side", "de"), ("name", "第2急降下爆撃航空団(Ju 87)"), ("base", "attica"), ("rangeKm", 400), ("fighters", 0), ("strike", 8)]),
    L([("id", "de-lg1"), ("side", "de"), ("name", "第1教導航空団(Ju 88)"), ("base", "attica"), ("rangeKm", 800), ("fighters", 0), ("strike", 4)]),
    L([("id", "de-kg2"), ("side", "de"), ("name", "第2爆撃航空団(Do 17。He 111 で代える)"), ("base", "attica"), ("rangeKm", 800), ("fighters", 0), ("strike", 3)]),
    L([("id", "de-jg77"), ("side", "de"), ("name", "第77戦闘航空団(Bf 109)"), ("base", "attica"), ("rangeKm", 400), ("fighters", 6), ("strike", 0)]),
    L([("id", "de-zg26"), ("side", "de"), ("name", "第26駆逐航空団(Bf 110)"), ("base", "attica"), ("rangeKm", 600), ("fighters", 4), ("strike", 0)]),
]
NAVAL_TOES = {
    "de-stg2": {"strike": "at-ju87-12"},
    "de-lg1": {"strike": "at-ju88-12", "scout": "at-de-scout"},
    "de-kg2": {"strike": "at-he111-12"},
    "de-jg77": {"fighter": "at-bf109-12"},
    "de-zg26": {"fighter": "at-bf110-12"},
}
for _w in AIR_WINGS:
    _w["navalToes"] = NAVAL_TOES[_w["id"]]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


LOSS = L([("id", "loss"), ("type", "lossRatio"), ("max", 1), ("points", 2)])
# 勝利の条件(ゲームの決め方)。独:マレメ・ハニア(スダ湾)・イラクリオンを取れば決定的(史実)、マレメの空の橋頭堡を保てば限定的。
# 連合:マレメとハニアを守れば決定的、ハニアを守るか、撤退で多くを救えば限定的
VICTORY = L([
    ("de", L([
        ("conditions", [cond("maleme", "maleme", 3), cond("chania", "chania", 4), cond("rethymno", "rethymno", 2), cond("heraklion", "heraklion", 3),
                        cond("sphakia", "sphakia", 1), cond("sea", "sea-crete", 1), LOSS]),
        ("decisive", L([("minPoints", 12), ("requires", ["maleme", "chania", "heraklion"])])),
        ("limited", L([("minPoints", 5), ("requires", ["maleme"])])),
    ])),
    ("al", L([
        ("conditions", [cond("maleme", "maleme", 3), cond("chania", "chania", 4), cond("rethymno", "rethymno", 1), cond("heraklion", "heraklion", 2),
                        L([("id", "evac"), ("type", "withdrawn"), ("min", 0.5), ("points", 2)]), LOSS]),
        ("decisive", L([("minPoints", 10), ("requires", ["maleme", "chania"])])),
        ("limited", L([("minPoints", 4), ("requires", [])])),
    ])),
])


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase, port in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if rid in SUPPLY_VIA:
            r["supplyVia"] = SUPPLY_VIA[rid]
        if airbase:
            r["airbase"] = True
        if port:
            r["port"] = True
        regions[rid] = r
        control[rid] = owner
    for rid, name, lat, lon in SEAS:
        x, y = km(lat, lon)
        regions[rid] = L([("name", name), ("x", x), ("y", y), ("biome", "western-farmland"), ("sea", True)])
    # 始めの制海:クレタの北の海とカソス海峡は英の地中海艦隊。キティラ海峡はどちらでもない
    control["sea-crete"] = "al"
    control["sea-kasos"] = "al"
    return L([
        ("id", "crete-1941"),
        ("name", "クレタ島の戦い(1941年5月)"),
        ("description",
         "メルクール作戦。独の降下猟兵がマレメ・監獄の谷・レティムノ・イラクリオンに降り、ニュージーランド・豪・英・ギリシャの守備隊と戦う。"
         "マレメの飛行場を取れば、山岳猟兵を空輸で送り込める。英艦隊は夜に海の船団を追い返せるが、昼は第8航空軍団に叩かれる。"
         "1段階は1日、13段階。v0・概略図(兵力と位置の多くは要裏取り)"),
        ("notes", "根拠は docs/research/crete-1941.md。作り直しは tools/campaigns/build_crete_1941.py。降下・空輸は上陸の増援で、マレメの飛行場は独が押さえれば補給の源。"
                  "スファキア・イラクリオンからの撤退は予定の撤退。英の巡洋艦はタウン級で代えた"),
        ("era", "1940-norway"),
        ("sides", [L([("id", "de"), ("name", "ドイツ軍")]), L([("id", "al"), ("name", "連合軍(ニュージーランド・豪・英・ギリシャ)")])]),
        ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", STAGES)])),
        ("weather", [L([("stage", 1), ("weather", "clear")])]),
        ("regions", regions),
        ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS] + [L([("a", a), ("b", b), ("kind", "sea")]) for a, b in SEA_LINKS]),
        ("control", control),
        ("formations", FORMATIONS),
        ("airWings", AIR_WINGS),
        ("naval", L([
            ("weapons", ["naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"]),
            ("toe", ["naval-generic", "pacific-ships-1942", "atlantic-ships-1941", "atlantic-air-1941"]),
        ])),
        ("rules", L([
            # 補充はほとんどない(1段階1日)。降下猟兵の弾薬は投下のコンテナ頼みで乏しかった(備蓄の戻りを弾薬6割まで。仮置き)
            ("replacementPerStage", 0.0),
            ("stockCap", L([("de", L([("ammo", 0.6), ("fuel", 1)]))])),
            ("maxUnitsPerBattle", 10),
            ("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_dive_bomber")]))])),
        ])),
        ("historicalOutcome", L([
            ("winner", "de"),
            ("level", "decisive"),
            ("summary", "独軍はマレメの飛行場を取って空輸で増強し、ハニア・スダ湾・レティムノ・イラクリオンを取った。連合軍は約1万8千人を撤退させ、約1万2千人が捕虜になった。"
                        "英海軍は巡洋艦3・駆逐艦6を失った。降下猟兵は約4千人の死者・行方不明を出し、独はこの後、大きな空挺作戦をしなくなった"),
        ])),
        ("victory", VICTORY),
    ])


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
