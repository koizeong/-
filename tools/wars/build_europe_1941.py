#!/usr/bin/env python3
"""
戦争モード:欧州の第二次大戦 1941年6月〜1945年5月(v0)の定義を作る(docs/war-design.md)。

    python3 tools/wars/build_europe_1941.py

出力: data/wars/europe-1941.json

枢軸(独・伊)が、東部(北方・中央・南方)・北アフリカ・イタリア(1943年7月から)・西部(1944年6月から)に兵力を分け、
連合(ソ・英・米)は東から押し返し、地中海と西から上がる。1手番は1か月。部隊は軍団(≒3個師団)と航空軍。

合わせ直し(AI 同士で):戦線の広さを超えた軍団も一部(35%)数える(上限で切ると数の差が効かなかった)。ソ連の人的資源を1.5倍に・
歩兵の値段を人的資源寄りから工業力寄りに(連合が人的資源で詰まり、工業力が余っていた)、独の軍団は人的資源を多く(独は人手が足りなかった)。
東部の枢軸の補給0.85(距離)、北アフリカの枢軸の補給0.6・英の歩兵軍団を3に(枢軸が1941年のうちにスエズまで取っていた)。
突破(2地域)の比を4に、祖国の防衛1.3(独が1944年の初めにベルリンまで崩れていた)。
数値はどれもゲームの手触りのための仮置き(地域の資源・軍団の力と値段・始めの軍団の数・系統樹の時期)。TODO(要裏取り):
出典候補は Overy『Why the Allies Won』・Harrison『The Economics of World War II』(工業力・燃料)、Glantz & House『When Titans Clashed』
(東部戦線の兵力)、Müller-Hillebrand『Das Heer 1933-1945』(独軍の師団数)、Playfair『The Mediterranean and Middle East』(北アフリカ)。
地域は大まかな地理だけで、境界は史実の線ではない。
"""

import json
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/wars/europe-1941.json"


def reg(name, owner, i=0, m=0, f=0, vp=0, x=50, y=50, capital=None, schedule=None):
    r = L([("name", name), ("owner", owner), ("yields", L([("industry", i), ("manpower", m), ("fuel", f)])), ("vp", vp), ("mapX", x), ("mapY", y)])
    if capital:
        r["capitalOf"] = capital
    if schedule:
        r["schedule"] = [L([("from", d), ("add", L([("industry", a[0]), ("manpower", a[1]), ("fuel", a[2])]))]) for d, a in schedule]
    return r


# 戦略地域(地図の位置は 0〜100 の模式)
REGIONS = L([
    # 枢軸の後方と占領地
    # ドイツ本国:1943年1月から総力戦で工業力が上がり、1944年6月から戦略爆撃で下がる(仮置き)
    ("germany", reg("ドイツ本国(ベルリン)", "ax", i=40, m=10, f=3, vp=10, x=50, y=38, capital="ax", schedule=[("1943-01", (12, 0, 0)), ("1944-06", (-12, -2, -1))])),
    ("rhine", reg("ラインラント・ルール", "ax", i=10, m=1, vp=2, x=40, y=40)),
    ("low_countries", reg("ベネルクス", "ax", i=5, m=1, vp=2, x=35, y=36)),
    ("france", reg("フランス", "ax", i=10, m=2, vp=4, x=30, y=46)),
    ("normandy", reg("ノルマンディー・ブルターニュ", "ax", i=1, vp=1, x=24, y=42)),
    ("poland", reg("ポーランド(総督府)", "ax", i=4, m=2, vp=2, x=58, y=38)),
    ("east_prussia", reg("東プロイセン", "ax", i=2, m=1, vp=1, x=60, y=30)),
    ("romania", reg("ルーマニア(プロエシュティ油田)", "ax", i=2, m=2, f=10, vp=2, x=64, y=56)),
    ("north_italy", reg("北イタリア", "ax", i=8, m=3, vp=2, x=44, y=54)),
    ("rome", reg("ローマ・中部イタリア", "ax", i=2, m=2, vp=3, x=47, y=62)),
    ("south_italy", reg("南イタリア", "ax", i=1, m=2, vp=1, x=50, y=68)),
    ("sicily", reg("シチリア", "ax", m=1, vp=1, x=48, y=74)),
    ("tripolitania", reg("トリポリタニア", "ax", vp=1, x=45, y=84)),
    ("cyrenaica", reg("キレナイカ", "ax", vp=1, x=55, y=86)),
    # 連合
    ("uk", reg("英本国", "al", i=25, m=5, vp=8, x=22, y=30)),
    # 米本国:参戦(1941年12月)の後、動員で工業力・人的資源が大きく増える(仮置き)
    ("usa", reg("米本国(レンドリース・参戦後の動員)", "al", i=10, m=2, f=25, x=5, y=40, schedule=[("1942-01", (30, 10, 10)), ("1943-01", (40, 10, 10))])),
    ("algeria", reg("アルジェリア・チュニジア", "al", vp=1, x=40, y=78)),
    ("marmarica", reg("マルマリカ(トブルク)", "al", vp=1, x=62, y=86)),
    ("egypt", reg("エジプト(エル・アラメイン)", "al", i=1, m=1, vp=2, x=70, y=88)),
    ("suez", reg("スエズ・中東の油田", "al", f=8, vp=4, x=80, y=88)),
    ("baltics", reg("バルト三国", "al", i=1, m=1, vp=1, x=66, y=24)),
    ("pskov", reg("プスコフ・ノヴゴロド", "al", m=2, vp=1, x=72, y=20)),
    ("leningrad", reg("レニングラード", "al", i=6, m=5, vp=4, x=76, y=14)),
    ("vologda", reg("ヴォログダ・北ロシア", "al", i=1, m=3, x=84, y=12)),
    ("belorussia", reg("ベラルーシ", "al", i=2, m=5, vp=2, x=68, y=36)),
    ("smolensk", reg("スモレンスク", "al", i=1, m=3, vp=2, x=74, y=34)),
    ("moscow", reg("モスクワ", "al", i=12, m=8, vp=8, x=82, y=30, capital="al")),
    ("gorky", reg("ゴーリキー・ヴォルガ", "al", i=6, m=5, vp=2, x=90, y=28)),
    ("west_ukraine", reg("ウクライナ西部(キエフ)", "al", i=3, m=6, vp=2, x=70, y=48)),
    ("east_ukraine", reg("ウクライナ東部(ハリコフ)", "al", i=6, m=6, vp=2, x=78, y=50)),
    ("donbas", reg("ドンバス", "al", i=10, m=5, vp=3, x=84, y=54)),
    ("stalingrad", reg("スターリングラード", "al", i=4, m=3, vp=3, x=90, y=52)),
    ("caucasus", reg("コーカサスの油田", "al", i=2, m=3, f=20, vp=3, x=92, y=66)),
    # ウラル:疎開した工場が1942年3月から立ち上がる(仮置き)
    ("urals", reg("ウラル(疎開した工場)", "al", i=10, m=9, x=97, y=36, schedule=[("1942-03", (15, 0, 0))])),
])

FRONTS = L([
    ("east_north", L([("name", "東部戦線・北方"), ("supply", L([("ax", 0.85)])), ("regions", ["east_prussia", "baltics", "pskov", "leningrad", "vologda"]), ("boundary", 1),
                      ("defenseMultiplier", 1.2), ("armorMultiplier", 0.8), ("maxCorps", 12),
                      ("campaigns", []), ("mapAxis", "horizontal")])),
    ("east_center", L([("name", "東部戦線・中央"), ("supply", L([("ax", 0.85)])), ("regions", ["germany", "poland", "belorussia", "smolensk", "moscow", "gorky"]), ("boundary", 2),
                       ("armorMultiplier", 1.1), ("maxCorps", 18),
                       ("campaigns", [L([("campaignId", "barbarossa-1941"), ("from", "1941-06"), ("to", "1941-08")]),
                                      L([("campaignId", "moscow-1941"), ("from", "1941-10"), ("to", "1942-01")]),
                                      L([("campaignId", "bagration-1944"), ("from", "1944-06"), ("to", "1944-08")])]),
                       ("mapAxis", "horizontal")])),
    ("east_south", L([("name", "東部戦線・南方"), ("supply", L([("ax", 0.85)])), ("regions", ["romania", "west_ukraine", "east_ukraine", "donbas", "stalingrad", "caucasus"]), ("boundary", 1),
                      ("armorMultiplier", 1.2), ("maxCorps", 18),
                      ("campaigns", [L([("campaignId", "blau-1942"), ("from", "1942-06"), ("to", "1942-08")]),
                                     L([("campaignId", "uranus-1942"), ("from", "1942-11"), ("to", "1943-02")])]),
                      ("mapAxis", "horizontal")])),
    # 北アフリカ:枢軸は地中海を渡る補給で弱い(0.7)
    ("africa", L([("name", "北アフリカ"), ("regions", ["tripolitania", "cyrenaica", "marmarica", "egypt", "suez"]), ("boundary", 2),
                  ("armorMultiplier", 1.3), ("maxCorps", 6), ("supply", L([("ax", 0.6)])),
                  ("campaigns", [L([("campaignId", "africa-1942"), ("from", "1942-05"), ("to", "1942-07")])]),
                  ("mapAxis", "horizontal")])),
    # イタリア:1943年7月のシチリア上陸から。山がちで守りやすく、機甲が効かない
    ("italy", L([("name", "イタリア"), ("regions", ["north_italy", "rome", "south_italy", "sicily", "algeria"]), ("boundary", 4), ("opens", "1943-07"),
                 ("defenseMultiplier", 1.5), ("armorMultiplier", 0.6), ("maxCorps", 8),
                 ("campaigns", [L([("campaignId", "sicily-1943"), ("from", "1943-07"), ("to", "1943-08")]),
                                L([("campaignId", "italy-1944"), ("from", "1944-01"), ("to", "1944-06")])]),
                 ("mapAxis", "vertical")])),
    # 西部:1944年6月のノルマンディー上陸から。開く前の守備隊はそのまま戦う
    ("west", L([("name", "西部戦線"), ("regions", ["germany", "rhine", "low_countries", "france", "normandy", "uk"]), ("boundary", 5), ("opens", "1944-06"),
                ("armorMultiplier", 0.9), ("maxCorps", 16),
                ("campaigns", [L([("campaignId", "normandy-1944"), ("from", "1944-07"), ("to", "1944-08")]),
                               L([("campaignId", "bulge-1944"), ("from", "1944-12"), ("to", "1945-01")])]),
                ("mapAxis", "horizontal")])),
])


def tpl(name, side, kind, atk, dfn, i, m, f=0, months=3, fuel=0.0, requires=None, available=None, toe=None, notes=None):
    t = L([("name", name), ("side", side), ("kind", kind), ("attack", atk), ("defense", dfn),
           ("cost", L([("industry", i), ("manpower", m), ("fuel", f)])), ("months", months), ("fuelPerAttack", fuel)])
    if requires:
        t["requires"] = requires
    if available:
        t["availableFrom"] = available
    if toe:
        t["toe"] = toe
    if notes:
        t["notes"] = notes
    return t


TEMPLATES = L([
    ("ax_inf41", tpl("歩兵軍団(1941)", "ax", "infantry", 6, 8, 12, 8, months=3, fuel=0.5, toe=["de-ir-1939"])),
    ("ax_pz41", tpl("装甲軍団(III号・IV号短砲身)", "ax", "armor", 14, 9, 25, 5, 2, months=4, fuel=3)),
    ("ax_inf43", tpl("歩兵軍団(MG42・1943年の師団)", "ax", "infantry", 7, 10, 13, 8, months=3, fuel=0.5, requires="ax_t_mg42", toe=["de-ir-1942"])),
    ("ax_pz43", tpl("装甲軍団(パンター・ティーガー)", "ax", "armor", 18, 12, 32, 5, 2, months=5, fuel=4, requires="ax_t_panther")),
    ("ax_ita", tpl("イタリア歩兵軍団", "ax", "infantry", 3, 5, 6, 5, months=2, fuel=0.3, toe=["it-ir-1940"])),
    ("ax_air", tpl("航空軍(ドイツ空軍)", "ax", "air", 0, 0, 20, 2, 3, months=4)),
    ("su_rifle41", tpl("狙撃兵軍団(1941)", "al", "infantry", 4, 5, 8, 7, months=2, fuel=0.3)),
    ("su_tank41", tpl("機械化軍団(T-26・BT)", "al", "armor", 8, 5, 14, 3, 1, months=3, fuel=2)),
    ("su_tank43", tpl("戦車軍団(T-34)", "al", "armor", 13, 8, 16, 3, 1, months=3, fuel=2.5, requires="su_t_t34mass")),
    ("su_guards", tpl("親衛狙撃兵軍団", "al", "infantry", 7, 9, 10, 6, months=2, fuel=0.4, requires="su_t_deep")),
    ("su_tank44", tpl("戦車軍団(T-34-85)", "al", "armor", 16, 10, 18, 3, 1, months=3, fuel=3, requires="su_t_t3485")),
    ("su_air", tpl("航空軍(ソ連空軍)", "al", "air", 0, 0, 12, 2, 2, months=3)),
    ("uk_inf", tpl("英歩兵軍団", "al", "infantry", 6, 8, 14, 5, months=3, fuel=0.8)),
    ("uk_arm", tpl("英機甲軍団", "al", "armor", 10, 7, 22, 3, 1, months=4, fuel=3)),
    ("us_inf", tpl("米歩兵軍団", "al", "infantry", 7, 8, 15, 5, months=4, fuel=0.8, available="1942-01", toe=["us-ir-1944"])),
    ("us_arm", tpl("米機甲軍団", "al", "armor", 13, 8, 26, 3, 1, months=5, fuel=4, available="1942-01")),
    ("al_air", tpl("航空軍(英米の戦術空軍)", "al", "air", 0, 0, 18, 1, 3, months=3)),
])

TECH = L([
    ("ax_t_longpz", L([("name", "長砲身のIV号戦車"), ("side", "ax"), ("cost", 60), ("earliest", "1942-03"), ("boost", L([("armor", 1.1)]))])),
    ("ax_t_mg42", L([("name", "MG42と1943年の歩兵師団"), ("side", "ax"), ("cost", 60), ("earliest", "1942-06"), ("unlocks", ["ax_inf43"])])),
    ("ax_t_panther", L([("name", "パンター・ティーガー"), ("side", "ax"), ("cost", 120), ("requires", ["ax_t_longpz"]), ("earliest", "1943-01"), ("unlocks", ["ax_pz43"])])),
    ("ax_t_faust", L([("name", "パンツァーファウスト"), ("side", "ax"), ("cost", 50), ("earliest", "1943-09"), ("boost", L([("infantry", 1.1)]))])),
    ("ax_t_jet", L([("name", "ジェット戦闘機"), ("side", "ax"), ("cost", 150), ("earliest", "1944-06"), ("boost", L([("air", 1.3)]))])),
    ("su_t_t34mass", L([("name", "T-34の大量生産"), ("side", "al"), ("cost", 50), ("earliest", "1942-03"), ("unlocks", ["su_tank43"])])),
    ("su_t_deep", L([("name", "縦深作戦の立て直し(親衛)"), ("side", "al"), ("cost", 70), ("earliest", "1942-09"), ("unlocks", ["su_guards"]), ("boost", L([("armor", 1.05)]))])),
    ("su_t_t3485", L([("name", "T-34-85"), ("side", "al"), ("cost", 90), ("requires", ["su_t_t34mass"]), ("earliest", "1944-01"), ("unlocks", ["su_tank44"])])),
    ("al_t_radar", L([("name", "電探と戦術空軍"), ("side", "al"), ("cost", 60), ("earliest", "1942-06"), ("boost", L([("air", 1.3)]))])),
    ("al_t_m476", L([("name", "M4(76)と戦車駆逐大隊"), ("side", "al"), ("cost", 80), ("earliest", "1944-01"), ("boost", L([("armor", 1.1)]))])),
])


def force(template, front, count, strength=1.0):
    f = L([("template", template), ("count", count), ("strength", strength)])
    if front:
        f["front"] = front
    return f


# 始めの軍団(1941年6月)。数は仮置き(TODO(要裏取り):Glantz & House・Müller-Hillebrand)。
# ソ連の軍団は奇襲を受けて戦力0.6から(動員と展開が済んでいない)
FORCES = [
    force("ax_inf41", "east_north", 6), force("ax_pz41", "east_north", 2), force("ax_air", "east_north", 1),
    force("ax_inf41", "east_center", 9), force("ax_pz41", "east_center", 4), force("ax_air", "east_center", 2),
    force("ax_inf41", "east_south", 6), force("ax_ita", "east_south", 2), force("ax_pz41", "east_south", 2), force("ax_air", "east_south", 1),
    force("ax_pz41", "africa", 1), force("ax_ita", "africa", 2),
    force("ax_ita", "italy", 3),
    force("ax_inf41", "west", 5),
    force("su_rifle41", "east_north", 8, 0.6), force("su_tank41", "east_north", 1, 0.6),
    force("su_rifle41", "east_center", 12, 0.6), force("su_tank41", "east_center", 3, 0.6), force("su_air", "east_center", 1, 0.6),
    force("su_rifle41", "east_south", 12, 0.6), force("su_tank41", "east_south", 4, 0.6), force("su_air", "east_south", 1, 0.6),
    force("su_rifle41", None, 6),
    force("uk_inf", "africa", 3), force("uk_arm", "africa", 1),
    force("uk_inf", None, 3), force("al_air", None, 1),
]

war = L([
    ("id", "europe-1941"),
    ("name", "欧州の第二次大戦 1941〜45(v0)"),
    ("description", "1941年6月のバルバロッサ作戦から1945年5月まで。枢軸は東部・北アフリカ・イタリア・西部に兵力を分け、連合は東から押し返し、地中海と西から上がる。"
                    "1か月ごとに資源を集め、研究し、軍団を作り、戦線へ送る。"),
    ("notes", "v0。地域の資源・軍団の力と値段・始めの軍団の数・系統樹の時期はすべて仮置き。作り直しは tools/wars/build_europe_1941.py、設計は docs/war-design.md"),
    ("sides", [L([("id", "ax"), ("name", "枢軸(独・伊)")]), L([("id", "al"), ("name", "連合(ソ・英・米)")])]),
    ("calendar", L([("start", "1941-06"), ("months", 48)])),
    ("regions", REGIONS),
    ("fronts", FRONTS),
    ("templates", TEMPLATES),
    ("tech", TECH),
    ("start", L([
        ("forces", FORCES),
        ("stock", L([("ax", L([("industry", 60), ("manpower", 30), ("fuel", 40)])), ("al", L([("industry", 60), ("manpower", 60), ("fuel", 60)]))])),
        ("researched", L([("ax", []), ("al", [])])),
    ])),
    ("rules", L([("transferMonths", 1), ("overCapShare", 0.25), ("breakthroughRatio", 4), ("homeDefense", 1.3)])),
])
OUT.write_text(json.dumps(war, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}")
