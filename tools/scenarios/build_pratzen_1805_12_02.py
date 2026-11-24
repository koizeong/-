#!/usr/bin/env python3
"""
アウステルリッツの戦い・プラツェン高地 1805年12月2日 のシナリオファイル(v0・概略図。ナポレオン戦争の叩き台)を作る。

    python3 tools/scenarios/build_pratzen_1805_12_02.py

出力: data/scenarios/pratzen-1805-12-02.json

墺露の同盟軍は南の仏の右翼を包もうと、第4縦隊(コロヴラート・ミロラドヴィチ)をプラツェン高地から南へ下ろし始めた。
朝の霧の中、ゴルトバッハの谷に隠れていた仏第4軍団(スルト)のサン=ティレール師団とヴァンダム師団が、霧の晴れた高地へ駆け上がった
(「アウステルリッツの太陽」)。高地の上の同盟軍は縦隊のまま不意を突かれ、南から引き返したカメンスキー旅団とともに戦ったが押し出された。
昼過ぎにロシア近衛(コンスタンチン大公)がシュターレ・ヴィノフラディの北で逆襲し、仏の近衛騎兵(ラップ)がこれを退けた。

ナポレオン戦争の時代ルール(data/rulepacks/napoleonic.json)の叩き台:隊形(横隊・突撃縦隊・散開・方陣)、隊形の密度と縦の深さ、士気で決まる突撃、
散兵の幕、硝煙。部隊は旅団(data/toe/napoleonic.json。数値は仮置き)。

調べ方:この環境では資料を確かめていない。村の位置は地図からのおよその値、旅団の顔ぶれ・位置・着いた時刻はすべて TODO(要裏取り)
(出典候補:Goetz『1805: Austerlitz』、Duffy『Austerlitz 1805』、Castle『Austerlitz 1805: The Fate of Empires』(Osprey)、
Chandler『The Campaigns of Napoleon』、Nafziger の戦闘序列の集成)。根拠と残りの裏取りは docs/research/pratzen-1805-12.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import apply_names, formations, objective, Sketch, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/pratzen-1805-12-02.json"

S = Sketch(origin=(49.135, 16.775), cols=40, rows=32)  # 10km × 8km

# 村と丘(緯度, 経度)。どれも地図からのおよその値(TODO(要裏取り))
PLACES = L(
    [
        ("prace", ("プラツェン(プラツェ)", 49.133, 16.766)),
        ("heights", ("プラツェン高地(プラツキー丘)", 49.128, 16.762)),
        ("vinohrady", ("シュターレ・ヴィノフラディ(古い葡萄畑の丘)", 49.147, 16.786)),
        ("puntowitz", ("プンドヴィッツ(ポニェトヴィツェ)", 49.150, 16.736)),
        ("girzikowitz", ("ギルジコヴィッツ(イージコヴィツェ)", 49.163, 16.751)),
        ("kobelnitz", ("コーベルニッツ(コビルニツェ)", 49.136, 16.731)),
        ("sokolnitz", ("ゾコルニッツ(ソコルニツェ)", 49.114, 16.722)),
        ("blasowitz", ("ブラゾヴィッツ(ブラジョヴィツェ)", 49.167, 16.787)),
        ("krzenowitz", ("クシェノヴィッツ(クシェノヴィツェ)", 49.143, 16.832)),
    ]
)
P = {k: S.at(v[1], v[2]) for k, v in PLACES.items()}

# 地形:プラツェン高地(広い台地)とシュターレ・ヴィノフラディの丘、ゴルトバッハの小川、村
S.terrain("H", "hill")
S.mark(P["heights"], "H", 4)
S.mark(P["vinohrady"], "H", 2)
S.terrain("~", "river")
S.line([S.at(49.168, 16.744), S.at(49.150, 16.738), S.at(49.136, 16.731), S.at(49.114, 16.722), S.at(49.100, 16.718)], "~")
S.terrain("T", "town")
for k in ("prace", "puntowitz", "girzikowitz", "kobelnitz", "sokolnitz", "blasowitz", "krzenowitz"):
    S.mark(P[k], "T", 0)

for k in P:
    S.node(k, P[k])
S.node("w_edge", S.snap((0, P["puntowitz"][1])))  # 仏の後方(ツーランの丘・ブリュンの方)
S.node("e_edge", S.snap((S.width, P["krzenowitz"][1])))  # 同盟の後方(アウステルリッツの町の方)
S.node("ne_edge", S.snap((S.width, P["blasowitz"][1] + 1000)))  # 近衛の来る北東
S.node("s_edge", S.snap((P["sokolnitz"][0] + 2500, 0)))  # 南(第1〜第3縦隊の戦場)
for a, b in [
    ("w_edge", "puntowitz"), ("puntowitz", "girzikowitz"), ("puntowitz", "kobelnitz"), ("kobelnitz", "sokolnitz"), ("puntowitz", "prace"),
    ("kobelnitz", "prace"), ("prace", "heights"), ("prace", "vinohrady"), ("prace", "krzenowitz"), ("krzenowitz", "e_edge"),
    ("vinohrady", "blasowitz"), ("blasowitz", "ne_edge"), ("girzikowitz", "blasowitz"), ("heights", "s_edge"), ("sokolnitz", "s_edge"),
]:
    S.road(a, b)

# 時間:08:00 から 16:00 の8時間(12月2日の日の出は7時半ごろ・日の入りは16時ごろ。霧は9時ごろ晴れた。TODO(要裏取り))。
# ナポレオン戦争のルールパックの陸のターンは15分・小ステップ30秒(ユーザー判断 2026-11)なので32ターン
TURN_SECONDS, STEP_SECONDS = 900, 30
PER_HOUR = 3600 // TURN_SECONDS
MAX_TURNS = 8 * PER_HOUR


def hour_turn(h):
    """8時を1として h 時間目の始めのターン"""
    return (h - 1) * PER_HOUR + 1

LINE, LIGHT, GUARD = "nap-fr-line-bde", "nap-fr-light-bde", "nap-fr-guard-bde"
units = [
    # ===== 仏第4軍団(スルト)。ゴルトバッハの谷に隠れて、東(高地)を向く =====
    # サン=ティレール師団:モラン旅団(第10軽歩兵)・ティエボー旅団(第14・第36戦列)・ヴァレ旅団(第43・第55戦列)と師団砲兵
    unit("fr-sh-morand", "fr", LIGHT, S.offset(P["puntowitz"], 400, -1400), 90, training="veteran"),
    unit("fr-sh-thiebault", "fr", LINE, S.offset(P["puntowitz"], 300, -600), 90, training="veteran"),
    unit("fr-sh-vare", "fr", LINE, S.offset(P["kobelnitz"], 300, -200), 90, training="veteran"),
    unit("fr-sh-art", "fr", "nap-fr-art", S.offset(P["puntowitz"], -300, -1000), 90, training="veteran"),
    # ヴァンダム師団:シネール旅団(第24軽歩兵)・フェレ旅団(第4・第28戦列)・カンドラ旅団(第46・第57戦列)と師団砲兵
    unit("fr-va-schiner", "fr", LIGHT, S.offset(P["girzikowitz"], 500, -700), 90, training="veteran"),
    unit("fr-va-ferey", "fr", LINE, S.offset(P["girzikowitz"], 400, 0), 90, training="veteran"),
    unit("fr-va-candras", "fr", LINE, S.offset(P["puntowitz"], 400, 400), 90, training="veteran"),
    unit("fr-va-art", "fr", "nap-fr-art", S.offset(P["girzikowitz"], -400, -300), 90, training="veteran"),
    # ===== 同盟の第4縦隊(コロヴラート・ミロラドヴィチ)。高地から南へ縦隊で下りようとしている =====
    # ミロラドヴィチの露の歩兵(2旅団)と、コロヴラートの墺の歩兵(新兵の多い大隊。未熟)
    unit("ru-milo-1", "co", "nap-ru-line-bde", S.offset(P["prace"], 0, 500), 180, formation="column", training="regular"),
    unit("ru-milo-2", "co", "nap-ru-line-bde", S.offset(P["prace"], 600, 1200), 180, formation="column", training="regular"),
    unit("at-kolo-1", "co", "nap-at-line-bde", S.offset(P["heights"], 400, -300), 180, formation="column", training="green"),
    unit("at-kolo-2", "co", "nap-at-line-bde", S.offset(P["heights"], 1200, 300), 180, formation="column", training="green"),
    unit("co-art-1", "co", "nap-ru-art", S.offset(P["prace"], 900, 300), 270, training="regular"),
    unit("co-art-2", "co", "nap-at-art", S.offset(P["heights"], 1500, -800), 270, training="green"),
]

# 増援:カメンスキー旅団(第2縦隊から引き返した。10時ごろ南から)、ロシア近衛(コンスタンチン大公。昼ごろ北東から)、
# 仏の近衛(ベシエール・ラップの近衛騎兵。昼過ぎに西から)、ベルナドットの第1軍団のドルーエ師団(昼過ぎに西から)。時刻は TODO(要裏取り)
SE = S.nodes["s_edge"]
NE = S.nodes["ne_edge"]
WE = S.nodes["w_edge"]


def rein(turn, uid, side, toe, node, dx, dy, facing, training=None):
    r = L([("turn", hour_turn(turn)), ("id", uid), ("side", side), ("toe", toe), ("x", node["x"] + dx), ("y", node["y"] + dy), ("facing", facing)])
    if training:
        r["training"] = training
    return r


reinforcements = [
    rein(3, "ru-kamensky", "co", "nap-ru-line-bde", SE, -500, 300, 0, "regular"),
    rein(5, "ru-guard-inf", "co", "nap-ru-guard-bde", NE, -300, -300, 225, "elite"),
    rein(5, "ru-guard-cav", "co", "nap-ru-cuir-bde", NE, -300, 400, 225, "elite"),
    rein(5, "ru-guard-art", "co", "nap-ru-art", NE, -500, -800, 225, "elite"),
    rein(6, "fr-guard-cav", "fr", "nap-fr-lcav-bde", WE, 300, 1200, 90, "elite"),
    rein(6, "fr-guard-hcav", "fr", "nap-fr-cuir-bde", WE, 300, 600, 90, "elite"),
    rein(6, "fr-drouet", "fr", LINE, WE, 300, 1800, 90, "regular"),
]

objectives = [
    objective("heights", "プラツェン高地", P["heights"], 3, "co", 700),
    objective("vinohrady", "シュターレ・ヴィノフラディ", P["vinohrady"], 2, "co", 600),
    objective("prace", "プラツェン村", P["prace"], 1, "co", 400),
    objective("puntowitz", "プンドヴィッツ", P["puntowitz"], 1, "fr", 400),
]

# 概略の地形(森・小さな丘)をシードから敷く(史実の地形ではない)。部隊・目標のまわりは平地のまま
S.fill_terrain(18051202, hill=0.04, forest=0.05, scale_m=1500, keep=[(u["x"], u["y"]) for u in units] + [(o["x"], o["y"]) for o in objectives])

scenario = L(
    [
        ("id", "pratzen-1805-12-02"),
        ("name", "アウステルリッツ・プラツェン高地 1805年12月2日(v0・概略図)"),
        (
            "description",
            "朝の霧の中、ゴルトバッハの谷に隠れたスルトの2個師団が、縦隊で高地を下りかけた墺露の第4縦隊へ駆け上がる。"
            "横隊で撃ち合うか、縦隊で銃剣の突撃に出るか、騎兵が来たら方陣を組めるか。昼にはロシア近衛が逆襲してくる。",
        ),
        (
            "notes",
            "v0。ナポレオン戦争の時代ルールの叩き台(隊形・密度・士気の衝撃・散兵の幕・硝煙)。部隊は旅団、数値は仮置き。村の位置は地図からのおよその値、"
            "旅団の顔ぶれ・位置・時刻は要裏取り。森・小さな丘は概略の自動生成で史実の地形ではない。根拠は docs/research/pratzen-1805-12.md。"
            "作り直しは tools/scenarios/build_pratzen_1805_12_02.py。",
        ),
        ("packs", L([("rules", "napoleonic"), ("branches", "napoleonic"), ("weapons", ["napoleonic"]), ("toe", ["napoleonic"])])),
        ("sides", [L([("id", "fr"), ("name", "フランス大陸軍")]), L([("id", "co"), ("name", "墺露の同盟軍")])]),
        ("time", L([("turnSeconds", TURN_SECONDS), ("stepSeconds", STEP_SECONDS), ("startHour", 8), ("startDate", "1805-12-02")])),
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
                                # 仏:高地とシュターレ・ヴィノフラディを取り、同盟に3割の損害を与えれば決定的(史実)、高地を取れば限定的。急ぎ度 1.0
                                ("fr", L([("decisive", L([("required", ["heights", "vinohrady"]), ("minEnemyLoss", 0.3)])), ("limited", L([("required", ["heights"])])), ("urgency", 1.0)])),
                                # 同盟:高地とシュターレ・ヴィノフラディを守れば決定的、高地を守れば限定的
                                ("co", L([("decisive", L([("required", ["heights", "vinohrady"])])), ("limited", L([("required", ["heights"])]))])),
                            ]
                        ),
                    ),
                    # 指揮ポイント:旅団ごとに命令が要るので、師団長・旅団長の数に合わせて多め(初めは仏4・同盟3にしたが、AI 同士で増援の近衛・カメンスキー旅団に
                    # 命令が回らず、着いたまま動かなかった)。仏は軍団長スルトの下で師団長が独り立ちしていた分を多く(仮置き)
                    ("commandPoints", L([("fr", 7), ("co", 5)])),
                    # 朝の霧は9時ごろ晴れた(アウステルリッツの太陽)。その後は晴れ
                    (
                        "weather",
                        L([("initial", "fog"), ("changeChancePerHour", 0.0), ("minHoursBetweenChanges", 3), ("improveChance", 0.5), ("allowed", ["fog", "clear"]),
                           ("schedule", [L([("turn", hour_turn(2)), ("weather", "clear"), ("allowed", ["clear"])])])]),
                    ),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "fr-w"), ("side", "fr"), ("nodeId", "w_edge"), ("ammoT", 300), ("fuelT", 0)]),
                L([("id", "co-e"), ("side", "co"), ("nodeId", "e_edge"), ("ammoT", 300), ("fuelT", 0)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "fr"),
        ("level", "decisive"),
        ("summary", "仏はプラツェン高地を取り、同盟の第4縦隊とカメンスキー旅団を押し出した。ロシア近衛の逆襲は仏の近衛騎兵に退けられ、同盟軍は中央を割られて南の縦隊が孤立した。"),
    ]
)
apply_names(scenario, {
    "fr-sh-morand": "モラン旅団(第10軽歩兵)",
    "fr-sh-thiebault": "ティエボー旅団(第14・第36戦列)",
    "fr-sh-vare": "ヴァレ旅団(第43・第55戦列)",
    "fr-sh-art": "サン=ティレール師団砲兵",
    "fr-va-schiner": "シネール旅団(第24軽歩兵)",
    "fr-va-ferey": "フェレ旅団(第4・第28戦列)",
    "fr-va-candras": "カンドラ旅団(第46・第57戦列)",
    "fr-va-art": "ヴァンダム師団砲兵",
    "fr-guard-cav": "近衛騎兵(猟騎兵・マムルーク。ラップ)",
    "fr-guard-hcav": "近衛騎兵(騎馬擲弾兵)",
    "fr-drouet": "ドルーエ師団(第1軍団)",
    "ru-milo-1": "ミロラドヴィチの露歩兵 甲",
    "ru-milo-2": "ミロラドヴィチの露歩兵 乙",
    "at-kolo-1": "コロヴラートの墺歩兵 甲",
    "at-kolo-2": "コロヴラートの墺歩兵 乙",
    "co-art-1": "第4縦隊の露砲兵",
    "co-art-2": "第4縦隊の墺砲兵",
    "ru-kamensky": "カメンスキー旅団(第2縦隊から引き返す)",
    "ru-guard-inf": "ロシア近衛歩兵(コンスタンチン大公)",
    "ru-guard-cav": "ロシア近衛騎兵(シュヴァリエ・ギャルド)",
    "ru-guard-art": "ロシア近衛砲兵",
})
scenario["formations"] = formations(
    scenario,
    [
        ("fr-4c", "第4軍団(スルト)", "fr", None, []),
        ("fr-sh", "サン=ティレール師団", "fr", "fr-4c", ["fr-sh-morand", "fr-sh-thiebault", "fr-sh-vare", "fr-sh-art"]),
        ("fr-va", "ヴァンダム師団", "fr", "fr-4c", ["fr-va-schiner", "fr-va-ferey", "fr-va-candras", "fr-va-art"]),
        ("fr-reserve", "近衛と第1軍団", "fr", None, ["fr-guard-cav", "fr-guard-hcav", "fr-drouet"]),
        ("co-4col", "第4縦隊(コロヴラート・ミロラドヴィチ)", "co", None, ["ru-milo-1", "ru-milo-2", "at-kolo-1", "at-kolo-2", "co-art-1", "co-art-2"]),
        ("co-later", "カメンスキー旅団とロシア近衛", "co", None, ["ru-kamensky", "ru-guard-inf", "ru-guard-cav", "ru-guard-art"]),
    ],
)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン)")
