#!/usr/bin/env python3
"""
クルスク北部戦線・ポヌイリ 1943年7月7〜9日 のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_ponyri_1943_07_07.py

出力: data/scenarios/ponyri-1943-07-07.json

航空戦を楽しめる史実の戦い(独の第6航空艦隊とソ連の第16航空軍が取り合った)として、クルスクの北部戦線から切り出した。
根拠と残りの裏取りは docs/research/ponyri-1943-07.md。
地図の座標・部隊の位置・兵力の多くは資料で確かめられていない(TODO(要裏取り))。この環境では資料のページを直接読めず、
検索結果の抜粋だけで組み立てた。とくに村・丘の座標は、ポヌイリ駅を中心にした概略の相対位置。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import real_presets, PACKS, Sketch, objective, unit  # noqa: E402
from common import formations  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/ponyri-1943-07-07.json"

# ポヌイリ駅を中心に置く。座標(北緯52.307・東経36.295)は TODO(要裏取り):出典候補 ru.wikipedia「Поныри」、GeoNames
S = Sketch(origin=(52.307, 36.295), cols=64, rows=56)  # 16km × 14km
STATION = S.snap((S.width / 2, S.height / 2))


def at(dx, dy):
    """駅からの相対位置(m)。どれも概略で TODO(要裏取り)"""
    return S.offset(STATION, dx, dy)


P = L(
    [
        # ポヌイリ駅(オリョール〜クルスク鉄道の駅。集団農場の集荷・分配の拠点)
        ("station", at(0, 0)),
        # ポヌイリ第1(村の北の部分)。7日に何度も持ち主が変わった。駅から北へ約1.5km は TODO(要裏取り)
        ("ponyri_north", at(0, 1500)),
        # 253.5高地:戦場の東を見下ろす。森と果樹園。駅から東南東へ約3.5km は TODO(要裏取り)
        ("hill2535", at(3000, -1500)),
        # 「5月1日」国営農場:駅の東。位置は TODO(要裏取り)
        ("may1", at(2500, 500)),
        # 239.8高地:9日に独軍が奪った。駅から北東へ約3km は TODO(要裏取り)
        ("hill2398", at(2000, 2500)),
    ]
)

S.terrain("T", "town")
S.terrain("F", "forest")
S.terrain("H", "hill")
# ポヌイリは鉄道に沿って南北に細長い村。広がりは TODO(要裏取り)
S.line([P["station"], P["ponyri_north"]], "T", 1)
S.mark(P["station"], "T", 2)
S.mark(P["may1"], "T")
S.mark(P["hill2535"], "H", 2)
S.mark(P["hill2398"], "H", 1)
# 253.5高地の森と果樹園(概略)
S.rect(S.offset(P["hill2535"], -800, -1200), S.offset(P["hill2535"], 1200, 0), "F")
# 西のベレゾヴイ・ログの森(第9装甲師団が7日に一部を奪った)。広がりは TODO(要裏取り)
S.rect(at(-5500, -2000), at(-2500, 1500), "F")

# 道路(概略):北のマロアルハンゲリスク方面〜ポヌイリ第1〜駅〜南のクルスク方面、駅〜西のオリホヴァトカ方面、駅〜5月1日〜東
for k in P:
    S.node(k, P[k])
S.node("north_edge", S.snap((STATION[0] + 1500, S.height)))  # 独軍の後方(マロアルハンゲリスク〜グラズノフカ方面)
S.node("south_edge", S.snap((STATION[0], 0)))  # ソ連軍の後方(クルスク方面)
S.node("west_edge", S.snap((0, STATION[1] - 1000)))  # オリホヴァトカ・テプロエ方面
S.node("east_edge", S.snap((S.width, STATION[1] + 500)))  # マロアルハンゲリスク方面(第13軍の右翼)
for a, b in [
    ("north_edge", "ponyri_north"),
    ("ponyri_north", "station"),
    ("station", "south_edge"),
    ("station", "west_edge"),
    ("station", "may1"),
    ("may1", "east_edge"),
    ("may1", "hill2398"),
    ("station", "hill2535"),
]:
    S.road(a, b)

# 時間:7日05:00 から。昼は 20:00 まで(1時間ごと)、夜は 20:00〜翌05:00 の9時間を1ターン。9日 20:00 で終わる。
# 日の出 約03:30・日の入り 約20:30(北緯52度・7月上旬、当時のモスクワ時間)は概算で TODO(要裏取り)
DAY_TURNS = 15
PER_DAY = DAY_TURNS + 1
NIGHT1 = DAY_TURNS + 1
MAX_TURNS = DAY_TURNS * 3 + 2

# 部隊。独第41装甲軍団の一部(第292・第86歩兵師団、第18装甲師団、重駆逐戦車・突撃戦車)と、ソ連第13軍第29狙撃兵軍団の第307狙撃兵師団ほか。
# どれも汎用の編成で表す。位置・戦力・練度は TODO(要裏取り)
units = [
    # 第292歩兵師団:7日、第507擲弾兵連隊(ハーネ大佐)がポヌイリの北、第508(ツィールホルト大佐)が南を攻めた
    unit("de-292-507", "de", "infantry_regiment", at(-800, 3200), 180),
    unit("de-292-508", "de", "infantry_regiment", at(800, 3200), 180),
    unit("de-292-509", "de", "infantry_regiment", at(0, 5200), 180),
    # 第86歩兵師団:第292と並んでポヌイリを攻めた。連隊の番号と位置は TODO(要裏取り)
    unit("de-86-a", "de", "infantry_regiment", at(2600, 3600), 200),
    unit("de-86-b", "de", "infantry_regiment", at(4200, 3200), 200),
    # 第654重駆逐戦車大隊(フェルディナント約45両)と第216突撃戦車大隊(ブルムベア約45両)。数は資料で食い違う(TODO(要裏取り))
    unit("de-654-jg", "de", "tank_destroyer_battalion", at(1500, 4600), 180, "column"),
    unit("de-216-stpz", "de", "tank_battalion", at(-600, 4600), 180, "column"),
    # 第18装甲師団:第18戦車大隊が第292歩兵師団の予備。装甲擲弾兵は後方(TODO(要裏取り))
    unit("de-18pz-pz", "de", "tank_battalion", at(0, 6000), 180, "column"),
    unit("de-18pz-pg", "de", "panzergrenadier_regiment", at(-1800, 6200), 180, "column"),
    # 砲兵と対空砲(規模と位置は TODO(要裏取り))
    unit("de-arty-1", "de", "artillery_group", at(-1500, 8500), 180),
    unit("de-arty-2", "de", "artillery_group", at(2000, 8500), 180),
    unit("de-flak", "de", "aa_battalion", at(500, 6800), 180),
    # ソ連第307狙撃兵師団(エンシン少将):第1019・第1021・第1023狙撃兵連隊。春から陣地を築いていた → 陣地3
    unit("su-307-1019", "su", "infantry_regiment", at(0, 0), 0, entrenchment=3),
    unit("su-307-1021", "su", "infantry_regiment", P["ponyri_north"], 0, entrenchment=2),
    unit("su-307-1023", "su", "infantry_regiment", P["hill2535"], 0, entrenchment=3),
    # 前線にいた第81狙撃兵師団(6日までの戦いで消耗。0.6 は仮置き)
    unit("su-81-rd", "su", "infantry_regiment", P["may1"], 20, entrenchment=2, strength=0.6),
    unit("su-81-rd-2", "su", "infantry_regiment", P["hill2398"], 20, entrenchment=2, strength=0.6),
    # 第13対戦車砲兵旅団・第129独立戦車旅団(ウォーゲームのシナリオに出てくる名前。史実の配置は TODO(要裏取り))
    unit("su-13-atb", "su", "tank_destroyer_battalion", at(1000, 400), 20, entrenchment=2),
    unit("su-129-tbr", "su", "armored_task_force", at(1500, -1200), 20),
    # 砲兵(第13軍・第4砲兵突破軍団の一部。規模は TODO(要裏取り))と対空砲
    unit("su-arty-1", "su", "artillery_group", at(-2000, -6000), 0),
    unit("su-arty-2", "su", "artillery_group", at(2000, -6000), 0),
    unit("su-aa", "su", "aa_battalion", at(0, -3000), 0),
]

reinforcements = [
    # ソ連第3戦車軍団(第51・第103戦車旅団、第57自動車化狙撃兵旅団)がポヌイリへ。到着の時刻は TODO(要裏取り)
    L([("turn", 3), ("id", "su-3tc-51"), ("side", "su"), ("toe", "armor_combat_command"), ("x", at(-1000, -6800)[0]), ("y", at(-1000, -6800)[1]), ("facing", 0)]),
    L([("turn", 5), ("id", "su-3tc-103"), ("side", "su"), ("toe", "armor_combat_command"), ("x", at(2500, -6800)[0]), ("y", at(2500, -6800)[1]), ("facing", 0)]),
    # 第6親衛狙撃兵師団:9日に第307と反撃してポヌイリを取り返した(資料の抜粋による)。到着は8日朝とした(TODO(要裏取り))
    L([("turn", NIGHT1 + 1), ("id", "su-6gd-a"), ("side", "su"), ("toe", "infantry_regiment"), ("x", at(-500, -6500)[0]), ("y", at(-500, -6500)[1]), ("facing", 0)]),
    L([("turn", NIGHT1 + 1), ("id", "su-6gd-b"), ("side", "su"), ("toe", "infantry_regiment"), ("x", at(1500, -6500)[0]), ("y", at(1500, -6500)[1]), ("facing", 0)]),
    # 独第9装甲師団:7日にベレゾヴイ・ログの森とポヌイリの西を攻めた。戦車連隊で表す(TODO(要裏取り))
    L([("turn", 2), ("id", "de-9pz"), ("side", "de"), ("toe", "panzer_regiment"), ("x", at(-4000, 6500)[0]), ("y", at(-4000, 6500)[1]), ("facing", 180)]),
    # 9日:第78突撃師団の第508擲弾兵連隊が、フェルディナント6両とともに239.8・253.5高地を攻めた(資料の抜粋による。TODO(要裏取り))
    L([("turn", 2 * PER_DAY + 1), ("id", "de-78-508"), ("side", "de"), ("toe", "infantry_regiment"), ("x", at(5500, 4500)[0]), ("y", at(5500, 4500)[1]), ("facing", 210)]),
]

objectives = [
    objective("station", "ポヌイリ駅", P["station"], 3, "su", radius=700),
    objective("ponyri_north", "ポヌイリ第1(村の北)", P["ponyri_north"], 1, "su"),
    objective("hill2535", "253.5高地", P["hill2535"], 2, "su"),
    objective("may1", "「5月1日」国営農場", P["may1"], 1, "su"),
    objective("hill2398", "239.8高地", P["hill2398"], 1, "su"),
]

scenario = L(
    [
        ("id", "ponyri-1943-07-07"),
        ("name", "ポヌイリ 1943年7月7〜9日(クルスク北部戦線・v0・概略図)"),
        (
            "description",
            "ツィタデレ作戦の北部戦線。独第9軍の第41装甲軍団が、鉄道の駅ポヌイリと253.5高地に陣取るソ連第307狙撃兵師団に攻めかかる。"
            "空では独の第6航空艦隊とソ連の第16航空軍が制空権を取り合う。史実では村は何度も持ち主が変わり、独軍は駅と253.5高地を落とせなかった。",
        ),
        (
            "notes",
            "v0・概略図。地図の座標、部隊の位置・戦力・練度、航空戦力の編隊の数、天候は TODO(要裏取り)(資料のページを直接読めず、"
            "検索結果の抜粋で組み立てた)。地雷原(フェルディナントの損失の多くは地雷による)はまだ作っていないので、陣地の硬さで表す。"
            "汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。根拠は docs/research/ponyri-1943-07.md。"
            "作り直しは tools/scenarios/build_ponyri_1943_07_07.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "su"), ("name", "ソ連軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 5), ("startDate", "1943-07-07")])),
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
                                # 史実の結末:ソ連軍が駅と253.5高地を保った(独軍は村の一部と239.8高地を奪った)→ ソ連の限定的勝利
                                ("su", L([("decisive", L([("required", ["station", "hill2535", "ponyri_north"]), ("minEnemyLoss", 0.3)])), ("limited", L([("required", ["station", "hill2535"])]))])),
                                # 急ぎ度:ツィタデレ作戦は南北から挟んでクルスクで手をつなぐ時刻表に縛られていた → 0.7(TODO(要裏取り))
                                ("de", L([("decisive", L([("required", ["station", "hill2535"])])), ("limited", L([("required", ["station"])])), ("urgency", 0.7)])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("su", 6), ("de", 7)])),
                    # 7月上旬は晴れが多く、ときどき雷雨(14日の報道で独側が天候のせいにした)。細かい天候は TODO(要裏取り)
                    ("weather", L([("initial", "clear"), ("changeChancePerHour", 0.04), ("minHoursBetweenChanges", 3), ("improveChance", 0.7), ("allowed", ["clear", "overcast"])])),
                    (
                        "air",
                        L(
                            [
                                # 独の第6航空艦隊(リッター・フォン・グライム):開始時は優勢。9日に戦力の半分を南部戦線へ移した(この v0 ではまだ表せない)。
                                # 編隊の数は TODO(要裏取り):出典候補 Bergström『Kursk: The Air Battle』、Glantz & House『The Battle of Kursk』
                                ("de", L([("strike", L([("groups", 4), ("replacementPerDay", 0.5), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)])), ("fighters", L([("groups", 3), ("replacementPerDay", 0.5)]))])),
                                # ソ連の第16航空軍(ルデンコ):Il-2 を8機ずつ波状に投入した。補充は独より厚いとした(TODO(要裏取り))
                                ("su", L([("strike", L([("groups", 5), ("replacementPerDay", 1.0), ("weapon", "ground_attack_aircraft"), ("count", 8), ("strikeMinutes", 10)])), ("fighters", L([("groups", 4), ("replacementPerDay", 1.0)]))])),
                            ]
                        ),
                    ),
                    ("night", L([("turn", NIGHT1), ("hours", 9), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "de-north"), ("side", "de"), ("nodeId", "north_edge"), ("ammoT", 1200), ("fuelT", 400)]),
                L([("id", "su-south"), ("side", "su"), ("nodeId", "south_edge"), ("ammoT", 1500), ("fuelT", 400)]),
                L([("id", "su-west"), ("side", "su"), ("nodeId", "west_edge"), ("ammoT", 500), ("fuelT", 150)]),
            ],
        ),
    ]
)

# 史実の結末(結果の画面で、プレイヤーの結果と比べる)。勝ち方の段階は、このシナリオの勝利条件に当てはめたもの
scenario["historicalOutcome"] = L([("winner", "su"), ("level", "limited"), ("summary", "村は何度も持ち主が変わったが、ソ連軍が駅と253.5高地を保った(独軍は村の一部と239.8高地を奪った)。")])
# 史実の編成(実数・定数):独の歩兵連隊は1942年の歩兵連隊、第18装甲師団の戦車大隊は1942年の戦車大隊、ソ連の狙撃兵連隊は1942〜43年、
# 戦車旅団は1942年の旅団(T-34・T-70)。フェルディナントの第654大隊・ブルムベアの第216大隊・第9装甲師団の戦車連隊・第18装甲師団の擲弾兵連隊・
# 第13対戦車旅団・砲兵・高射砲は1943年の実数の編成表がなく元のまま(TODO)
_all = scenario["units"] + scenario["rules"].get("reinforcements", [])
scenario["presets"] = L([("real", real_presets(
    scenario,
    {
        **{u["id"]: "de-ir-1942" for u in _all if u["side"] == "de" and u["toe"] == "infantry_regiment"},
        **{u["id"]: "su-rifle-regt-1942" for u in _all if u["side"] == "su" and u["toe"] == "infantry_regiment"},
        **{u["id"]: "su-tank-bde-1942" for u in _all if u["side"] == "su" and u["toe"] in ("armor_combat_command", "armored_task_force")},
        "de-18pz-pz": "de-pz-abt-1942",
    },
    "",
    ["ww1-korea-generic", "de", "su"],
    defaults=False,
))])
# 上級部隊(まとめた命令・作戦命令の戦闘序列の木。所属は上のコメントと調査メモによる)
scenario["formations"] = formations(
    scenario,
    [
        # 第41装甲軍団の一部(上のコメント)。第9装甲師団・第78突撃師団・砲兵の所属は確かめていないので木に入れない
        ("de-xli", "第41装甲軍団", "de", None, ["de-654-jg", "de-216-stpz"]),
        ("de-292", "第292歩兵師団", "de", "de-xli", ["de-292-507", "de-292-508", "de-292-509"]),
        ("de-86", "第86歩兵師団", "de", "de-xli", ["de-86-a", "de-86-b"]),
        ("de-18pz", "第18装甲師団", "de", "de-xli", ["de-18pz-pz", "de-18pz-pg"]),
        ("su-307", "第307狙撃兵師団", "su", None, ["su-307-1019", "su-307-1021", "su-307-1023"]),
        ("su-81", "第81狙撃兵師団", "su", None, ["su-81-rd", "su-81-rd-2"]),
        ("su-3tc", "第3戦車軍団", "su", None, ["su-3tc-51", "su-3tc-103"]),
        ("su-6gd", "第6親衛狙撃兵師団", "su", None, ["su-6gd-a", "su-6gd-b"]),
    ],
)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
