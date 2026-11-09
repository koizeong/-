#!/usr/bin/env python3
"""
コヒマの戦い 1944年4月17〜18日 のシナリオファイル(v0・概略図)を作る。

    python3 mods/ww2-fronts/tools/build_kohima_1944_04_17.py

出力: mods/ww2-fronts/scenarios/kohima-1944-04-17.json(--out で変えられる)

インド北東部、ナガ丘陵のコヒマ。4月5日から日本の第31師団に囲まれた守備隊(第4大隊ロイヤル・ウェスト・ケント連隊・アッサム連隊・雑多な守備隊)が、
コヒマの尾根を南から一つずつ奪われ、ギャリソン・ヒルの一帯に押し込まれる。17日にFSD(野戦補給所)とクキ・ピケットが落ち、
18日に西のジョツォマから第161旅団の第1パンジャブ連隊第1大隊が道を開いて入る。包囲の最後の山場の2日。
根拠と残りの裏取りは mods/ww2-fronts/research/kohima-1944-04.md。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/scenarios"))
from historical_commanders import apply as apply_historical_commanders  # noqa: E402
from common import apply_names, formations, objective, output_path, Sketch, unit  # noqa: E402

OUT = output_path(PACK, "scenarios/kohima-1944-04-17.json", "kohima-1944-04-17.json")

# 尾根ひとつの戦いなので 100m のセル。西のジョツォマ(砲兵と救援の旅団)まで入れて 7km × 4km。北が上
# 尾根は東寄り(X だけずらす)。ジョツォマからコヒマまでは約3〜4km とする(TODO(要裏取り))
S = Sketch(origin=(25.67, 94.08), cols=70, rows=40, cell=100)
X = 3000

# 尾根の形・陣地の位置・道は概略(位置を確かめられなかった。TODO(要裏取り):Colvin『Not Ordinary Men』・Rooney『Burma Victory』の付図、
# インド公刊戦史の地図)。尾根は南北に連なり、北から ギャリソン・ヒル、クキ・ピケット、FSD、DIS、ジェイル・ヒル。
# ギャリソン・ヒルの北東に地方長官の官舎とテニスコート。尾根の西をディマプールへの道が通り、西のジョツォマへ道が分かれる
S.terrain("H", "hill")
S.terrain("J", "jungle")
S.terrain("T", "town")
S.rect((0, 0), (S.width, S.height), "J")
S.rect((X + 1700, 1200), (X + 2500, 3000), "H")  # コヒマの尾根
S.rect((X + 2600, 2800), (X + 3600, 3700), "T")  # ナガ村(北東)

GARRISON = S.snap((X + 2100, 2750))
# テニスコート。北東の地方長官の官舎は日本が押さえ、コートをはさんで向き合っていた
TENNIS = S.snap((X + 2300, 2850))
KUKI = S.snap((X + 2050, 2450))
FSD = S.snap((X + 2050, 2150))
DIS = S.snap((X + 2150, 1850))
JAIL = S.snap((X + 2250, 1450))

S.node("w_edge", S.snap((0, 2700)))  # ジョツォマへ
S.node("jotsoma", S.snap((300, 2800)))
S.node("junction", S.snap((X + 1500, 2700)))
S.node("garrison", GARRISON)
S.node("n_edge", S.snap((X + 1500, S.height)))  # ディマプールへ
S.node("s_edge", S.snap((X + 2300, 0)))  # インパールへ
S.node("jail", JAIL)
for a, b in [("w_edge", "jotsoma"), ("jotsoma", "junction"), ("junction", "garrison"), ("junction", "n_edge"), ("garrison", "jail"), ("jail", "s_edge")]:
    S.road(a, b)

# 時間:17日 06:00〜18:00 の12ターン、夜(18:00〜06:00)を1ターン、18日の12ターン。合わせて25ターン
DAY = 12
NIGHT_TURN = DAY + 1
MAX_TURNS = NIGHT_TURN + DAY

units = [
    # 守備隊。12日間の包囲で大きく削られている(第4大隊ロイヤル・ウェスト・ケント連隊は約600名のうち250名以上が負傷とする資料がある)。
    # 戦力・陣地の段階・位置は仮置き(TODO(要裏取り))。インド軍の大隊は英の 1944年の歩兵大隊で代えた
    # 12日間囲まれて全周の陣地を築いていたので、全周防御から始める
    unit("uk-4rwk", "uk", "uk-inf-bn-1944", GARRISON, 180, training="veteran", stance="all_round", entrenchment=3, strength=0.55),
    unit("uk-assam", "uk", "uk-inf-bn-1944", KUKI, 180, stance="all_round", entrenchment=3, strength=0.4),
    unit("uk-gar", "uk", "ww2f-uk-garrison-1944", FSD, 180, training="green", stance="all_round", entrenchment=2, strength=0.6),
    # 第161旅団の砲兵(第24山砲連隊。3.7インチ山砲)は西のジョツォマから守備隊を支えた。25ポンド砲の野砲連隊で代えた
    unit("uk-art", "uk", "uk-field-regt-25pdr", S.snap((300, 3000)), 90, training="veteran"),
    # 第31師団の第58連隊(宮崎)の3個大隊。包囲の間の夜襲で大きく削られている(戦力は仮置き)。日本は投降しない
    unit("jp-58-1", "jp", "ww2f-jp-inf-bn-1944", S.snap((X + 2550, 3150)), 225, training="veteran", strength=0.6),
    unit("jp-58-2", "jp", "ww2f-jp-inf-bn-1944", DIS, 0, training="veteran", stance="defense", entrenchment=2, strength=0.6),
    unit("jp-58-3", "jp", "ww2f-jp-inf-bn-1944", JAIL, 0, training="veteran", stance="defense", entrenchment=2, strength=0.6),
    # 第138連隊の大隊が、ジョツォマとコヒマの間の道を断っていた(8日から)
    unit("jp-138", "jp", "ww2f-jp-inf-bn-1944", S.snap((X + 900, 2700)), 270, training="veteran", stance="defense", entrenchment=2, strength=0.7),
]

# 第161旅団の第1パンジャブ連隊第1大隊が、ジョツォマから道を開いて入る(18日とする資料と15日とする資料がある。TODO(要裏取り))
reinforcements = [
    L([("turn", NIGHT_TURN + 1), ("id", "uk-1pun"), ("side", "uk"), ("toe", "uk-inf-bn-1944"), ("x", S.snap((0, 2700))[0]), ("y", S.snap((0, 2700))[1]), ("facing", 90), ("training", "veteran")]),
]

objectives = [
    objective("garrison", "ギャリソン・ヒル", GARRISON, 3, "uk", 250),
    objective("tennis", "テニスコート", TENNIS, 1, "uk", 150),
    objective("kuki", "クキ・ピケット", KUKI, 1, "uk", 200),
    objective("fsd", "FSD(野戦補給所)", FSD, 1, "uk", 200),
]

scenario = L(
    [
        ("id", "kohima-1944-04-17"),
        ("name", "コヒマ 1944年4月17〜18日(v0・概略図)"),
        (
            "description",
            "インド北東部、ナガ丘陵のコヒマ。12日間囲まれた守備隊は、尾根を南から一つずつ奪われ、ギャリソン・ヒルとテニスコートに押し込まれている。"
            "日本の第58連隊は夜ごとに斬り込んでくる。西のジョツォマから救援の大隊が道を開くまで、ギャリソン・ヒルを守りきれるか。",
        ),
        (
            "notes",
            "v0。100m のセル。尾根・陣地・道の位置は概略で、確かめていない。インド軍の大隊は英の 1944年の歩兵大隊、山砲は25ポンド砲で代えた。"
            "部隊の戦力・陣地の段階は仮置き。日本の山砲・航空・補給の欠乏は表さない。根拠は mods/ww2-fronts/research/kohima-1944-04.md。"
            "作り直しは mods/ww2-fronts/tools/build_kohima_1944_04_17.py。",
        ),
        (
            "packs",
            L(
                [
                    ("rules", "ww1-korea"),
                    ("branches", "ww1-korea"),
                    ("weapons", ["ww1-korea-generic", "uk", "jp"]),
                    ("toe", ["ww1-korea-generic", "uk", "jp", "ww2f-toe-uk", "ww2f-toe-jp"]),
                ]
            ),
        ),
        ("sides", [L([("id", "uk"), ("name", "英印軍")]), L([("id", "jp"), ("name", "日本軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 6), ("startDate", "1944-04-17")])),
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
                                # 英印軍:ギャリソン・ヒルを守りきれば限定的(史実)、テニスコート・クキ・ピケット・FSD も保てば決定的(ゲームの設計)
                                ("uk", L([("decisive", L([("required", ["garrison", "tennis", "kuki", "fsd"])])), ("limited", L([("required", ["garrison"])]))])),
                                # 日本軍:ギャリソン・ヒルを取れば決定的(コヒマを落とす)。テニスコートとクキ・ピケット・FSD を取り、守備隊を半分まで削れば限定的
                                # (史実ではクキ・ピケットと FSD は落ち、テニスコートは5月まで両軍がはさんで向き合った)
                                ("jp", L([("decisive", L([("required", ["garrison"])])), ("limited", L([("required", ["tennis", "kuki", "fsd"]), ("minEnemyLoss", 0.5)])), ("urgency", 0.5)])),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("uk", 4), ("jp", 3)])),
                    ("weather", L([("initial", "overcast"), ("changeChancePerHour", 0.08), ("minHoursBetweenChanges", 3), ("improveChance", 0.4), ("allowed", ["clear", "overcast", "rain"])])),
                    ("night", L([("turn", NIGHT_TURN), ("hours", 12), ("everyTurns", NIGHT_TURN)])),
                    ("noSurrender", ["jp"]),
                    ("reinforcements", reinforcements),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                # 守備隊は囲まれていて、補給は空からの投下(ギャリソン・ヒルに落とした。一部は日本の側に落ちた)。量は仮置き。救援の旅団の集積所は西
                L([("id", "uk-drop"), ("side", "uk"), ("nodeId", "garrison"), ("ammoT", 60), ("fuelT", 5)]),
                L([("id", "uk-w"), ("side", "uk"), ("nodeId", "w_edge"), ("ammoT", 150), ("fuelT", 50)]),
                L([("id", "jp-s"), ("side", "jp"), ("nodeId", "s_edge"), ("ammoT", 60), ("fuelT", 10)]),
            ],
        ),
    ]
)
scenario["historicalOutcome"] = L(
    [
        ("winner", "uk"),
        ("level", "limited"),
        (
            "summary",
            "17日に FSD とクキ・ピケットが落ち、守備隊はギャリソン・ヒルの一帯に押し込まれたが、持ちこたえた。18日に第161旅団が道を開いて入り、"
            "20日に英第2師団の第6旅団が守備を引き継いだ。テニスコートをはさんだ撃ち合いは5月まで続き、第31師団は6月に退いた。",
        ),
    ]
)
apply_names(scenario, {
    "uk-4rwk": "第4大隊ロイヤル・ウェスト・ケント連隊",
    "uk-assam": "第1大隊アッサム連隊",
    "uk-gar": "コヒマの守備隊(シェレ連隊・後方の兵など)",
    "uk-art": "第24山砲連隊(ジョツォマ)",
    "uk-1pun": "第1パンジャブ連隊第1大隊",
    "jp-58-1": "第58連隊 第1大隊",
    "jp-58-2": "第58連隊 第2大隊",
    "jp-58-3": "第58連隊 第3大隊",
    "jp-138": "第138連隊の大隊(道の遮断)",
})
scenario["formations"] = formations(
    scenario,
    [
        ("uk-161", "第161インド旅団", "uk", None, ["uk-art", "uk-1pun"]),
        ("uk-kohima", "コヒマの守備隊(リチャーズ大佐)", "uk", None, ["uk-4rwk", "uk-assam", "uk-gar"]),
        ("jp-31", "第31師団(佐藤)", "jp", None, ["jp-138"]),
        ("jp-58", "第58連隊(宮崎)", "jp", "jp-31", ["jp-58-1", "jp-58-2", "jp-58-3"]),
    ],
)
apply_historical_commanders(scenario)
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT}(規定 {MAX_TURNS} ターン)")
