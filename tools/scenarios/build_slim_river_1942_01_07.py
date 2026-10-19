#!/usr/bin/env python3
"""
スリム川の戦い(マレー作戦)1942年1月7日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_slim_river_1942_01_07.py

出力: data/scenarios/slim-river-1942-01-07.json

島田戦車隊が夜明け前の大雨の中を幹線道路に沿って一直線に突進し、トロラクの陣地を抜けて、08:30ごろスリム川の道路橋を
無傷で取った戦い。根拠と残りの裏取りは docs/research/slim-river-1942-01.md。この環境では資料のページを直接読めず、
検索結果の要約だけで組み立てた。地名の位置(道路橋・カンポン・スリム・トロラクの陣地)、両軍の兵力の多くは TODO(要裏取り)。

時刻は英側の記録(マラヤ時間 GMT+7:30)に合わせる。日本側の資料(東京時間 GMT+9)は1時間30分進んでいる。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import Sketch, formations, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/slim-river-1942-01-07.json"

PACKS_PACIFIC = L(
    [
        ("rules", "ww1-korea"),
        ("branches", "ww1-korea"),
        ("weapons", ["ww1-korea-generic", "ww2-1944-us-de", "ww2-pacific"]),
        ("toe", ["ww1-korea-generic", "ww2-1944-us-de", "ww2-pacific"]),
    ]
)

# 16.5km × 19km。北はトロラクの北(マイル標60の手前)、南は道路橋の南のタンジョン・マリム方面
S = Sketch(origin=(3.845, 101.425), cols=66, rows=76)

P = L(
    [
        ("mile61", S.at(3.912, 101.374)),  # 4/19 ハイデラバードの路上障害(マイル標61付近。推定 TODO(要裏取り))
        ("mile62", S.at(3.900, 101.377)),  # 5/2 パンジャブ(マイル標61〜62。推定)
        ("trolak", S.at(3.887, 101.380)),  # トロラク(今の町。中)
        ("cluny", S.at(3.862, 101.390)),  # クルーニー・ゴム園(推定)
        ("kslim", S.at(3.836, 101.401)),  # カンポン・スリム/鉄道橋の付近(今のスリム・リバーの町の位置で代える。推定)
        ("road_bridge", S.at(3.822, 101.465)),  # スリム川の道路橋(位置は見つからなかった。推定 TODO(要裏取り))
        ("gun155", S.at(3.787, 101.470)),  # 第155野戦砲兵連隊:道路橋の南約4km(推定)
    ]
)

S.legend["."] = "jungle"  # 既定はジャングル(道路から外れにくい)
S.terrain("P", "plantation")
S.terrain("T", "town")
S.terrain("R", "river")
S.terrain("O", "plain")

# クルーニー・ゴム園(トロラクから鉄道橋まで約5マイルの開けた土地。範囲は推定)
S.rect(S.xy(3.840, 101.372), S.xy(3.884, 101.412), "P")
# トロラク村とカンポン・スリム
S.mark(P["trolak"], "T", 0)
S.mark(P["kslim"], "T", 1)
# スリム川:西から流れてきてカンポン・スリムの南を通り、上流(東)へ。道路は北岸に沿って東へ約6マイル進み、道路橋で渡る(線は推定 TODO(要裏取り))
RIVER = [S.xy(3.828, 101.352), S.xy(3.829, 101.400), S.xy(3.824, 101.430), S.xy(3.821, 101.465), S.xy(3.826, 101.497)]
S.line(RIVER, "R", 0)
# 道路橋の南の開けた所(砲兵の陣地。推定)
S.mark(P["gun155"], "O", 1)

nodes = L(
    [
        ("north_edge", S.at(3.928, 101.371)),
        ("mile61", P["mile61"]),
        ("mile62", P["mile62"]),
        ("trolak", P["trolak"]),
        ("cluny", P["cluny"]),
        ("kslim", P["kslim"]),
        ("river_road", S.at(3.832, 101.430)),
        ("bridge_n", S.at(3.828, 101.462)),
        ("bridge_s", S.at(3.815, 101.467)),
        ("gun155", P["gun155"]),
        ("south_edge", S.at(3.763, 101.478)),  # タンジョン・マリム方面
    ]
)
# 道路沿いの1マス(250m)は切り開かれた土地(ゴム園・集落・道路わきの空き地)として扱う。ジャングルのままだと、展開した車両が
# 道路の上でもジャングルの速さ(0.05倍)でしか進めず、戦車が道路に沿って突進した史実を表せない(戦闘移動は道路の倍率を使わないため)
for a, b in [("north_edge", "mile61"), ("mile61", "mile62"), ("mile62", "trolak"), ("kslim", "river_road"), ("river_road", "bridge_n"), ("bridge_s", "gun155"), ("gun155", "south_edge")]:
    S.line([nodes[a], nodes[b]], "P", 0)
S.line(RIVER, "R", 0)  # 橋の区間は川のまま
for k, p in nodes.items():
    S.node(k, p)
for a, b in [
    ("north_edge", "mile61"),
    ("mile61", "mile62"),
    ("mile62", "trolak"),
    ("trolak", "cluny"),
    ("cluny", "kslim"),
    ("kslim", "river_road"),
    ("river_road", "bridge_n"),
    ("bridge_n", "bridge_s"),  # スリム川の道路橋(川を横切る区間 → 橋として扱われる。爆破の用意があった)
    ("bridge_s", "gun155"),
    ("gun155", "south_edge"),
]:
    S.road(a, b, 150)

# 時間:7日 03:00 から(03:30 に砲撃と戦車の攻撃)。日の出 06:53・日の入り 18:47(マラヤ時間。調査メモの計算)。
# 03:00〜07:00 は暗い時間(1時間ごとに解くが見通しは夜と同じ。航空は使えない)。19:00 で終わる
MAX_TURNS = 16
DARK = [L([("from", 1), ("to", 4)])]


def rf(turn, uid, side, toe, p, facing, **extra):
    r = L([("turn", turn), ("id", uid), ("side", side), ("toe", toe), ("x", p[0]), ("y", p[1]), ("facing", facing)])
    r.update(extra)
    return r


# 英連邦軍:開戦からの撤退で疲れ切り、雨に濡れていた。大隊の兵力は分からない(定数より大きく減っていた)。
# 戦力0.6・疲労0.5は仮置き TODO(要裏取り:Kirby『The War Against Japan, Vol. I』、各大隊の戦闘日誌 WO 172)
WORN = dict(strength=0.6, fatigue=0.5)
units = [
    # 第12インド旅団(スチュワート中佐が旅団長代理)
    unit("uk-4-19-hyd", "uk", "uk_infantry_battalion_1941", P["mile61"], 0, entrenchment=2, **WORN),  # 対戦車火器なし(編成表の速射砲・ボーイズはそのまま。TODO)
    unit("uk-5-2-pun", "uk", "uk_infantry_battalion_1941", P["mile62"], 0, entrenchment=2, **WORN),
    unit("uk-2-argyll", "uk", "uk_infantry_battalion_1941", S.offset(P["trolak"], 250, 0), 0, entrenchment=1, training="veteran", **WORN),
    unit("uk-5-14-pun", "uk", "uk_infantry_battalion_1941", P["kslim"], 0, entrenchment=1, **WORN),  # 旅団の予備
    # 第28インド旅団(グルカ):道路を行軍していたところを戦車に撃たれた。どの大隊が道路の上にいたかは出典で食い違う(TODO)
    unit("uk-2-1-gr", "uk", "uk_infantry_battalion_1941", nodes["river_road"], 270, formation="column", strength=0.7, fatigue=0.4),
    unit("uk-2-2-gr", "uk", "uk_infantry_battalion_1941", S.offset(nodes["river_road"], 1500, 0), 270, formation="column", strength=0.7, fatigue=0.4),
    unit("uk-2-9-gr", "uk", "uk_infantry_battalion_1941", nodes["bridge_n"], 270, formation="column", strength=0.7, fatigue=0.4),
    # 第28旅団の対戦車中隊:第12旅団へ送られたが、前進中に戦車と出会い、砲を下ろす前に撃破された
    unit("uk-28-at", "uk", "uk_antitank_battery_1941", S.offset(P["kslim"], 0, -250), 0, formation="column"),
    # 砲兵:第137野戦砲兵連隊(2個中隊が橋の手前で撃たれた)、第155野戦砲兵連隊(4.5インチ榴弾砲。直接照準で先頭の戦車を止めた)
    unit("uk-137-fd", "uk", "uk_field_regiment_1941", S.offset(P["kslim"], 750, -250), 0, entrenchment=1),
    unit("uk-155-fd", "uk", "uk_field_regiment_1941", P["gun155"], 0, entrenchment=1),  # 4.5インチ榴弾砲(編成表は25ポンド砲で代える。TODO)
    # 日本軍:安藤支隊(歩兵第42連隊が基幹)と島田戦車隊(戦車第6連隊の一部。九七式中戦車 約17両+九五式軽戦車 約3両)
    # 戦車は連隊の編成表の6割で表す(仮置き。両数は出典で15〜30両と食い違う TODO(要裏取り):島田豊作『サムライ戦車隊長』)
    unit("jp-shimada", "jp", "jp_tank_regiment_chiha", S.offset(nodes["north_edge"], 0, -250), 180, formation="column", strength=0.6, training="veteran"),
    unit("jp-42", "jp", "jp_infantry_regiment_1941", S.offset(nodes["north_edge"], 500, -500), 180, training="veteran"),
    # 突撃の前の迫撃砲と砲の射撃(門数・部隊名は不明 TODO)
    unit("jp-arty", "jp", "artillery_battalion", nodes["north_edge"], 180),
]

reinforcements = [
    # 歩兵の本隊が橋へ着いた時刻は分からない(TODO)。続く歩兵(歩兵第21旅団の後続)を昼に北から入れる(時刻は仮置き)
    rf(8, "jp-42-2", "jp", "jp_infantry_battalion_1941", nodes["north_edge"], 180),
]

objectives = [
    objective("trolak", "トロラク", P["trolak"], 1, "uk"),
    objective("kslim", "カンポン・スリム", P["kslim"], 2, "uk", radius=700),
    objective("road_bridge", "スリム川の道路橋", nodes["bridge_n"], 3, "uk"),
]

scenario = L(
    [
        ("id", "slim-river-1942-01-07"),
        ("name", "スリム川の戦い 1942年1月7日(マレー作戦・v0・概略図)"),
        (
            "description",
            "夜明け前の大雨の中、島田戦車隊がジャングルの中の幹線道路を一直線に突進する。トロラクの陣地を抜け、ゴム園を走り、"
            "道路を行軍中のグルカの大隊を蹴散らして、スリム川の道路橋を爆破される前に取れるか。英連邦軍には対戦車火器がほとんどなく、"
            "止められるのは野戦砲の直接照準だけ。史実では08:30ごろ橋を無傷で取り、第11インド師団は事実上壊滅した。",
        ),
        (
            "notes",
            "v0・概略図。道路橋・カンポン・スリム・トロラクの陣地の位置、川と道路の線形、両軍の兵力は TODO(要裏取り)"
            "(資料のページを直接読めず、検索結果の要約で組み立てた)。時刻は英側(マラヤ時間 GMT+7:30)。鉄道と鉄道橋は表していない。"
            "英連邦軍の大隊の戦力0.6・疲労0.5、戦車隊を連隊の6割とする値、勝利条件・指揮ポイント・補給量は仮置き。"
            "根拠は docs/research/slim-river-1942-01.md。作り直しは tools/scenarios/build_slim_river_1942_01_07.py。",
        ),
        ("packs", PACKS_PACIFIC),
        ("sides", [L([("id", "jp"), ("name", "日本軍(第5師団・安藤支隊)")]), L([("id", "uk"), ("name", "英連邦軍(第11インド師団)")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 3), ("startDate", "1942-01-07")])),
        ("map", S.map()),
        ("roads", S.roads()),
        (
            "rules",
            L(
                [
                    ("maxTurns", MAX_TURNS),
                    ("objectives", objectives),
                    (
                        "victory",
                        L(
                            [
                                # 史実:道路橋を無傷で取り、南への退路を断った → 日本軍の決定的勝利
                                ("jp", L([("decisive", L([("required", ["road_bridge", "kslim"])])), ("limited", L([("required", ["kslim"])])), ("urgency", 0.8)])),
                                # 英連邦軍はトロラクの陣地を保てば勝ち(トロラクだけを取られたら引き分け)。AI 同士では日本軍が道路橋まで届かず、
                                # 道路橋だけで英連邦軍の勝ちにすると、10戦すべてが英連邦軍の勝ちになった(docs/research/validation.md)
                                ("uk", L([("decisive", L([("required", ["trolak", "kslim", "road_bridge"])])), ("limited", L([("required", ["trolak"])]))])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("jp", 5), ("uk", 4)])),
                    # 攻撃の時は大雨(北東モンスーン)。その後の天候は分からないので、雨・曇り・晴れの間で移ろわせる(TODO(要裏取り))
                    ("weather", L([("initial", "rain"), ("changeChancePerHour", 0.1), ("minHoursBetweenChanges", 3), ("improveChance", 0.6), ("allowed", ["rain", "overcast", "clear"])])),
                    # 日本軍はほぼ完全な制空権を持っていた。当日の出撃は確かめられていない(編隊の数は仮置き TODO(要裏取り))
                    ("air", L([("jp", L([("strike", L([("groups", 2), ("replacementPerDay", 0.5), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)]))]))])),
                    ("darkTurns", DARK),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "jp-north"), ("side", "jp"), ("nodeId", "north_edge"), ("ammoT", 400), ("fuelT", 150)]),
                L([("id", "uk-south"), ("side", "uk"), ("nodeId", "south_edge"), ("ammoT", 500), ("fuelT", 150)]),
            ],
        ),
    ]
)

scenario["formations"] = formations(
    scenario,
    [
        ("jp-5div", "第5師団", "jp", None, ["jp-arty"]),
        ("jp-ando", "安藤支隊(歩兵第42連隊)", "jp", "jp-5div", ["jp-42", "jp-42-2", "jp-shimada"]),
        ("uk-11div", "第11インド師団", "uk", None, ["uk-137-fd", "uk-155-fd"]),
        ("uk-12bde", "第12インド旅団", "uk", "uk-11div", ["uk-4-19-hyd", "uk-5-2-pun", "uk-2-argyll", "uk-5-14-pun"]),
        ("uk-28bde", "第28インド旅団(グルカ)", "uk", "uk-11div", ["uk-2-1-gr", "uk-2-2-gr", "uk-2-9-gr", "uk-28-at"]),
    ],
)
scenario["customization"] = L([("jp", L([("units", "all"), ("budgetMultiplier", 1.0)])), ("uk", L([("units", "all"), ("budgetMultiplier", 1.0)]))])

OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
