#!/usr/bin/env python3
"""
マーケット・ガーデン作戦:ナイメーヘン 1944年9月17〜20日(米第82空挺師団の担当地域)のシナリオファイル(v0・概略図)を作る。

    python3 tools/scenarios/build_nijmegen_1944_09_17.py

出力: data/scenarios/nijmegen-1944-09-17.json

空挺降下(降下地点をプレイヤーが選ぶ)と、橋(グラーヴェのマース川の橋・マース=ワール運河の橋・ナイメーヘンのワール川の
道路橋と鉄道橋)の奪い合いを遊ぶためのもの。根拠と残りの裏取りは docs/research/nijmegen-1944-09.md。
この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。座標・兵力・時刻の多くは TODO(要裏取り)。
とくに川・運河の線、運河の橋と降下地帯の位置は概略。
"""

import json
import sys
from collections import OrderedDict as L
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PACKS, Sketch, objective, unit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/scenarios/nijmegen-1944-09-17.json"

# 23km × 17km。西はグラーヴェ、東はライヒスヴァルト、南はモーク・プラスモーレン、北はレント(ワール川の北岸)
S = Sketch(origin=(51.81, 5.86), cols=92, rows=68)

# 地点(緯度・経度)。出典と確度は docs/research/nijmegen-1944-09.md
P = L(
    [
        ("waalbrug", S.at(51.8511, 5.8717)),  # ナイメーヘンの道路橋(高)
        ("railbrug", S.at(51.8519, 5.8566)),  # 鉄道橋(高)
        ("grave_bridge", S.at(51.7692, 5.7361)),  # グラーヴェ橋(John S. Thompsonbrug)
        ("nijmegen", S.at(51.8475, 5.8625)),  # ナイメーヘン中心部(高)
        ("hunner", S.at(51.8469, 5.8719)),  # フンネル公園・ファルクホフ(中)
        ("lent", S.at(51.8667, 5.8667)),  # レント(北岸。中)
        ("crossing", S.at(51.8525, 5.8400)),  # ワール川の渡河の出発点(発電所のあたり。De Oversteek 51.8581, 5.8411 の南岸。概略)
        ("groesbeek", S.at(51.783, 5.933)),  # フルースベーク(中)
        ("wyler", S.at(51.8056, 5.9664)),  # ワイラー(中)
        ("mook", S.at(51.750, 5.883)),  # モーク(中)
        ("molenhoek", S.at(51.7661, 5.8739)),  # モレンフック(中)
        ("plasmolen", S.at(51.7494, 5.9239)),  # プラスモーレン(中)
        ("overasselt", S.at(51.7597, 5.7875)),  # オーフェラッセルト(中)
        ("nederasselt", S.at(51.7722, 5.7458)),  # ネーデラッセルト(中)
        ("berg_en_dal", S.at(51.818, 5.920)),  # ベルフ・エン・ダル(低)
        ("hatert", S.at(51.808, 5.825)),  # ハテルト(低)
        ("grave", S.at(51.760, 5.738)),  # グラーヴェの町(橋の南岸。概略)
        ("malden", S.at(51.783, 5.850)),  # マルデン(概略。TODO(要裏取り))
        ("heumen", S.at(51.765, 5.832)),  # ヘウメン(概略。TODO(要裏取り))
        ("beek", S.at(51.830, 5.925)),  # ベーク(概略。TODO(要裏取り))
        # 降下地帯(位置の説明からの概略。TODO(要裏取り):508連隊の戦闘詳報の格子座標、Nordyke の地図)
        ("dz_o", S.at(51.772, 5.790)),  # DZ O:オーフェラッセルトの北(504連隊)
        ("dz_n", S.at(51.768, 5.940)),  # DZ N:フルースベークの南(505連隊)
        ("dz_t", S.at(51.795, 5.955)),  # DZ T:フルースベークの北東、ワイラーの近く(508連隊)
    ]
)

S.terrain("T", "town")
S.terrain("F", "forest")
S.terrain("H", "hill")
S.terrain("W", "large_river")

# 高地:フルースベークの台地(まわりより約300フィート高い。範囲は概略 TODO(要裏取り))と、モークの南の聖ヤンスベルフの森
S.rect(S.xy(51.760, 5.890), S.xy(51.825, 5.955), "H")
S.rect(S.xy(51.742, 5.890), S.xy(51.760, 5.925), "F")
# ライヒスヴァルト(51km²。高地の東約3マイル。西の縁は概略)
S.rect(S.xy(51.733, 5.985), S.xy(51.800, 6.030), "F")
# ナイメーヘンの市街(1944年の範囲は TODO(要裏取り))
S.rect(S.xy(51.832, 5.835), S.xy(51.852, 5.885), "T")
for k in ["lent", "grave", "groesbeek", "mook", "malden", "heumen", "hatert", "berg_en_dal", "beek", "wyler", "overasselt", "nederasselt", "plasmolen", "molenhoek"]:
    S.mark(P[k], "T")
S.mark(P["groesbeek"], "T", 1)

# ワール川(平均の川幅350〜400m → 2セル)。線は概略 TODO(要裏取り)
S.line(
    [S.xy(51.880, 5.693), S.xy(51.872, 5.760), S.xy(51.864, 5.810), S.xy(51.857, 5.840), S.xy(51.8525, 5.8566), S.xy(51.8515, 5.8717), S.xy(51.853, 5.900), S.xy(51.860, 5.940), S.xy(51.870, 5.990), S.xy(51.876, 6.030)],
    "W",
    0,
)
S.line([S.xy(51.882, 5.693), S.xy(51.874, 5.760), S.xy(51.866, 5.810), S.xy(51.859, 5.840), S.xy(51.8545, 5.8566), S.xy(51.8535, 5.8717), S.xy(51.855, 5.900), S.xy(51.862, 5.940), S.xy(51.872, 5.990), S.xy(51.878, 6.030)], "W", 0)
# マース川(グラーヴェ橋を通り、オーフェラッセルトの南を東へ、モークの西で南へ)。線は概略 TODO(要裏取り)
S.line(
    [S.xy(51.775, 5.693), S.xy(51.7692, 5.7361), S.xy(51.763, 5.758), S.xy(51.751, 5.790), S.xy(51.750, 5.830), S.xy(51.757, 5.855), S.xy(51.758, 5.872), S.xy(51.745, 5.878), S.xy(51.733, 5.879)],
    "W",
    0,
)
# マース=ワール運河(長さ13.5km。南端はヘウメンの閘門、北端はウェールトの閘門)。線と橋の位置は概略 TODO(要裏取り)
# 両端はマース川・ワール川の線の上に置く(すき間があると、橋を通らずに回り込めてしまう)
S.line([S.xy(51.7535, 5.8425), S.xy(51.785, 5.838), S.xy(51.810, 5.828), S.xy(51.830, 5.822), S.xy(51.8645, 5.8115)], "W", 0)

# 道路(概略)。運河・川を横切る区間は橋になる(地図から自動で決まる)
nodes = L(
    [
        ("south_edge", S.at(51.734, 5.740)),  # 南:アイントホーフェン方面(第30軍団の来る道)
        ("grave", P["grave"]),
        ("nederasselt", S.at(51.776, 5.738)),  # グラーヴェ橋の北岸
        ("wijchen_jct", S.at(51.805, 5.790)),
        ("west_edge", S.at(51.808, 5.694)),
        ("honinghutje_w", S.at(51.830, 5.812)),  # 運河の橋10(ホーニングフッチェ)の西
        ("honinghutje_e", S.at(51.830, 5.832)),
        ("hatert_w", S.at(51.810, 5.818)),  # 運河の橋9(ハテルト)の西
        ("hatert_e", S.at(51.810, 5.838)),
        ("malden_w", S.at(51.785, 5.828)),  # 運河の橋8(マルデン)の西
        ("malden", P["malden"]),
        ("overasselt", P["overasselt"]),
        ("heumen_w", S.at(51.763, 5.836)),  # 運河の橋7(ヘウメンの閘門)の西
        ("heumen_e", S.at(51.763, 5.856)),
        ("molenhoek", P["molenhoek"]),
        ("nijmegen", P["nijmegen"]),
        ("hunner", P["hunner"]),
        ("waal_s", S.at(51.848, 5.8717)),  # 道路橋の南のたもと
        ("waal_n", S.at(51.858, 5.8717)),  # 道路橋の北のたもと
        ("rail_s", S.at(51.849, 5.8566)),
        ("rail_n", S.at(51.858, 5.8566)),
        ("lent", P["lent"]),
        ("north_edge", S.at(51.886, 5.870)),  # 北:アルンヘム方面(独第10SS装甲師団が来る)
        ("berg_en_dal", P["berg_en_dal"]),
        ("beek", P["beek"]),
        ("groesbeek", P["groesbeek"]),
        ("wyler", P["wyler"]),
        ("east_edge", S.at(51.808, 6.029)),  # 東:クレーフェ方面
        ("reichswald_edge", S.at(51.770, 6.029)),
        ("mook", P["mook"]),
        ("southeast_edge", S.at(51.734, 5.900)),  # 南東:ヘネップ方面
    ]
)
for k, p in nodes.items():
    S.node(k, p)
for a, b, cap in [
    ("south_edge", "grave", 200),
    ("grave", "nederasselt", 200),  # グラーヴェ橋
    ("nederasselt", "wijchen_jct", 200),
    ("wijchen_jct", "west_edge", 100),
    ("wijchen_jct", "honinghutje_w", 200),
    ("honinghutje_w", "honinghutje_e", 200),  # 橋10
    ("honinghutje_e", "nijmegen", 200),
    ("wijchen_jct", "hatert_w", 100),
    ("hatert_w", "hatert_e", 100),  # 橋9
    ("hatert_e", "nijmegen", 100),
    ("wijchen_jct", "malden_w", 100),
    ("malden_w", "malden", 100),  # 橋8
    ("malden", "nijmegen", 100),
    ("nederasselt", "overasselt", 100),
    ("overasselt", "heumen_w", 100),
    ("heumen_w", "heumen_e", 100),  # 橋7(19日に近衛擲弾兵の戦車が通った)
    ("heumen_e", "molenhoek", 100),
    ("molenhoek", "malden", 100),
    ("molenhoek", "mook", 100),
    ("mook", "southeast_edge", 100),
    ("mook", "groesbeek", 100),
    ("nijmegen", "hunner", 200),
    ("hunner", "waal_s", 200),
    ("waal_s", "waal_n", 200),  # 道路橋
    ("waal_n", "lent", 200),
    ("lent", "north_edge", 200),
    ("nijmegen", "rail_s", 50),
    ("rail_s", "rail_n", 50),  # 鉄道橋(道路として扱う。輸送力は小さく)
    ("rail_n", "lent", 50),
    ("nijmegen", "berg_en_dal", 100),
    ("berg_en_dal", "groesbeek", 100),
    ("berg_en_dal", "beek", 100),
    ("beek", "wyler", 100),
    ("groesbeek", "wyler", 100),
    ("wyler", "east_edge", 100),
    ("groesbeek", "reichswald_edge", 100),
]:
    S.road(a, b, cap)

# 時間:17日 12:00 から(1ターン目に降下を命じると、2ターン目の始め 13:00 に降りる。史実の降下は 13:06〜13:28)。
# 昼は 07:00〜20:00 の13ターン、夜は 20:00〜07:00 の11時間を1ターン。20日 20:00 で終わる(道路橋の奪取は19:00ごろ)。
# 日の出・日の入り(北緯51.81度、UTC+2):17日 07:14/19:47、20日 07:19/19:40(NOAA の式で計算。史料ではない)。
# 資料の時刻が UTC+2(英国の二重夏時間・独の夏時間)かは TODO(要裏取り)
FIRST_DAY_TURNS = 8  # 12:00〜20:00
DAY_TURNS = 13
PER_DAY = DAY_TURNS + 1
NIGHT1 = FIRST_DAY_TURNS + 1


def at_hour(day, hour):
    """17日を day=1 として、その日の hour 時に始まるターン(昼だけ)"""
    if day == 1:
        return hour - 12 + 1
    return NIGHT1 + 1 + (day - 2) * PER_DAY + (hour - 7)


MAX_TURNS = at_hour(4, 19)  # 20日 19:00〜20:00 のターンまで


def rf(turn, uid, side, toe, p, facing, **extra):
    r = L([("turn", turn), ("id", uid), ("side", side), ("toe", toe), ("x", p[0]), ("y", p[1]), ("facing", facing)])
    r.update(extra)
    return r


# 連合軍(米第82空挺師団と英近衛機甲師団。1つの陣営にまとめる)
# 空挺部隊はマップの外で待機し、司令部コマンド「空挺降下」でプレイヤーが選んだ地点へ降りる
airborne = [
    # 第1次輸送(17日):C-47 482機・約7,250名。504連隊は DZ O、505連隊は DZ N、508連隊は DZ T に降りた
    L([("id", "us-504-pir"), ("side", "us"), ("toe", "airborne_regiment"), ("availableFromTurn", 1)]),
    L([("id", "us-505-pir"), ("side", "us"), ("toe", "airborne_regiment"), ("availableFromTurn", 1)]),
    L([("id", "us-508-pir"), ("side", "us"), ("toe", "airborne_regiment"), ("availableFromTurn", 1)]),
    # 第376落下傘野砲大隊(75mm山砲12門)。17日に落下傘で降りた
    L([("id", "us-376-pfab"), ("side", "us"), ("toe", "artillery_battalion"), ("availableFromTurn", 1)]),
    # 第2次輸送(18日):グライダー約450機の便で、第456・第319・第320野砲大隊と第80空挺対空・対戦車大隊。
    # 霧で約4時間遅れ、14時ごろに着いた(日時は出典が弱い。TODO(要裏取り))
    L([("id", "us-82-divarty"), ("side", "us"), ("toe", "artillery_group"), ("availableFromTurn", at_hour(2, 13))]),
    L([("id", "us-80-aaat"), ("side", "us"), ("toe", "tank_destroyer_battalion"), ("availableFromTurn", at_hour(2, 13))]),
]

# 独軍の初めの配置。どれも汎用の編成で、兵力・位置は TODO(要裏取り)
units = [
    # 戦闘団ヘンケ(約750名。補充大隊・降下猟兵の教導部隊・下士官学校の中隊など)がナイメーヘンの橋を守っていた
    unit("de-kg-henke", "de", "infantry_battalion", P["hunner"], 180, training="green"),
    # 道路橋の南の 88mm・20mm 高射砲
    unit("de-henke-flak", "de", "aa_battalion", S.offset(P["hunner"], -600, 300), 180, training="green"),
    # グラーヴェ橋の南の高射砲陣地の守備(小規模。0.3 は仮置き)
    unit("de-grave-guard", "de", "infantry_battalion", S.offset(nodes["nederasselt"], 0, -300), 0, training="green", strength=0.3),
    # 運河の橋の守備(小規模。どの橋にいたかは TODO(要裏取り))
    unit("de-canal-guard", "de", "infantry_battalion", S.offset(nodes["hatert_e"], 300, 0), 270, training="green", strength=0.3),
]

E = nodes
reinforcements = [
    # 18日 06:30:第406師団(寄せ集めの郷土防衛兵など。コルプス・フェルト)がライヒスヴァルト・ワイラー方面から降着地帯を攻めた。
    # 戦闘団ゲーベルがモーク→ヘウメン、ベッカー・フュルステンベルク・グレシックがワイラー・ベーク・フルースベーク方面。兵力は不明 TODO(要裏取り)
    rf(at_hour(2, 7), "de-406-goebel", "de", "volksgrenadier_battalion", E["southeast_edge"], 0, training="green"),
    rf(at_hour(2, 7), "de-406-becker", "de", "volksgrenadier_battalion", E["east_edge"], 270, training="green"),
    rf(at_hour(2, 7), "de-406-fuerstenberg", "de", "volksgrenadier_battalion", E["reichswald_edge"], 270, training="green"),
    rf(at_hour(2, 8), "de-406-greschick", "de", "volksgrenadier_battalion", S.offset(E["east_edge"], 0, 1500), 270, training="green"),
    # 第10SS装甲師団(フルンツベルク):パンネルデンの渡しで南へ回った。戦闘団オイリング(約500名)は18日夜〜19日にフンネル公園へ
    # (出典で日付が食い違う)。戦闘団ラインホルトは北岸のレントを受け持った。兵力は TODO(要裏取り)
    rf(NIGHT1 + PER_DAY, "de-10ss-euling", "de", "mechanized_infantry_battalion", E["north_edge"], 180, training="veteran"),
    rf(at_hour(3, 7), "de-10ss-reinhold", "de", "mechanized_infantry_battalion", E["north_edge"], 180, training="veteran"),
    rf(at_hour(3, 7), "de-10ss-art", "de", "artillery_battalion", S.offset(E["north_edge"], 1500, 0), 180, training="veteran"),
    # 20日:第2降下猟兵軍団(マインドル)がモーク・ベーク方面を攻めた。規模と位置は TODO(要裏取り)
    rf(at_hour(4, 7), "de-ii-fj-a", "de", "infantry_regiment", E["southeast_edge"], 0),
    rf(at_hour(4, 7), "de-ii-fj-b", "de", "infantry_regiment", E["east_edge"], 270),
    # 19日 08:20:近衛騎兵の装甲車がグラーヴェ橋に着いた。近衛擲弾兵の戦車は10:00ごろ(ヘウメンの閘門橋を通って北上)
    rf(at_hour(3, 8), "gb-hcr", "us", "recon_squadron", E["south_edge"], 0, training="veteran"),
    rf(at_hour(3, 10), "gb-grenadier", "us", "armor_combat_command", E["south_edge"], 0, training="veteran"),
    # 近衛機甲師団のほかの群(どの群がいつナイメーヘンへ来たかは TODO(要裏取り))
    rf(at_hour(3, 14), "gb-irish", "us", "armor_combat_command", E["south_edge"], 0, training="veteran"),
    # 20日:折りたたみの強襲ボート(26隻)が届き、504連隊第3大隊(クック少佐)が15:00に渡河した。
    # ボートを持つ大隊として、渡河の出発点に置く(504連隊とは別の部隊として数える。v0 の簡略化)
    rf(at_hour(4, 13), "us-504-3-boats", "us", "assault_boat_battalion", P["crossing"], 0, training="veteran"),
]

objectives = [
    # 目標の中心は陸の上に置く(橋の真ん中=川のセルには部隊が行けない)。グラーヴェ橋は北のたもと
    objective("grave_bridge", "グラーヴェ橋(北のたもと)", nodes["nederasselt"], 2, "de", radius=800),
    objective("heumen", "ヘウメンの閘門橋", nodes["heumen_e"], 1, "de"),
    objective("honinghutje", "ホーニングフッチェの橋", nodes["honinghutje_e"], 1, "de"),
    objective("groesbeek", "フルースベークの高地", P["groesbeek"], 2, None, radius=800),
    objective("berg_en_dal", "ベルフ・エン・ダル", P["berg_en_dal"], 1, None),
    objective("mook", "モーク", P["mook"], 1, None),
    objective("nijmegen_bridge", "ナイメーヘンの道路橋(南のたもと)", nodes["waal_s"], 3, "de", radius=600),
    objective("lent", "レント(北のたもと)", nodes["waal_n"], 2, "de", radius=700),
]

scenario = L(
    [
        ("id", "nijmegen-1944-09-17"),
        ("name", "ナイメーヘン 1944年9月17〜20日(マーケット・ガーデン作戦・v0・概略図)"),
        (
            "description",
            "マーケット・ガーデン作戦の第82空挺師団の担当地域。17日の午後、空挺部隊を降ろす地点を選び、グラーヴェ橋とマース=ワール運河の橋、"
            "フルースベークの高地を押さえ、ナイメーヘンのワール川の橋を目指す。18日からは独軍がライヒスヴァルトから降着地帯を攻め、"
            "北からは第10SS装甲師団が橋に入る。19日に英近衛機甲師団が南から着き、20日には強襲ボートでワール川を渡れる。"
            "史実では20日の19時ごろに道路橋を取った。",
        ),
        (
            "notes",
            "v0・概略図。川・運河の線、運河の橋と降下地帯の位置、両軍の兵力と到着の日時の多くは TODO(要裏取り)(資料のページを直接読めず、"
            "検索結果の要約で組み立てた)。連合軍(米第82空挺師団・英近衛機甲師団)は1つの陣営。強襲ボートの大隊は504連隊とは別の部隊として数える(簡略化)。"
            "米軍の集積所は第30軍団の補給を表す南の端に置いた(19日まで補給がつながらなかったことは表せていない)。"
            "汎用編成・勝利条件・指揮ポイント・補給量は史実ではない仮置き。根拠は docs/research/nijmegen-1944-09.md。"
            "作り直しは tools/scenarios/build_nijmegen_1944_09_17.py。",
        ),
        ("packs", PACKS),
        ("sides", [L([("id", "us"), ("name", "連合軍")]), L([("id", "de"), ("name", "ドイツ軍")])]),
        ("time", L([("turnSeconds", 3600), ("stepSeconds", 60), ("startHour", 12), ("startDate", "1944-09-17")])),
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
                                # 史実の結末(20日夕方):連合軍がグラーヴェ橋・運河の橋・高地・道路橋とレントを押さえた。
                                # 担当地域の任務は果たしたので、史実どおりなら連合軍の決定的勝利。道路橋を取れなければ限定的勝利まで
                                (
                                    "us",
                                    L(
                                        [
                                            ("decisive", L([("required", ["grave_bridge", "heumen", "groesbeek", "nijmegen_bridge", "lent"])])),
                                            ("limited", L([("required", ["grave_bridge", "groesbeek", "nijmegen_bridge"])])),
                                            # 急ぎ度:アルンヘムの第1空挺師団へ急いでつなぐ必要があった
                                            ("urgency", 0.8),
                                        ]
                                    ),
                                ),
                                # 独軍:ナイメーヘンの道路橋を渡さなければ限定的勝利、グラーヴェ橋も保てば(回廊を断てば)決定的勝利
                                (
                                    "de",
                                    L(
                                        [
                                            ("decisive", L([("required", ["nijmegen_bridge", "grave_bridge"])])),
                                            ("limited", L([("required", ["nijmegen_bridge"])])),
                                            ("urgency", 0.3),
                                        ]
                                    ),
                                ),
                            ]
                        ),
                    ),
                    ("commandPoints", L([("us", 6), ("de", 6)])),
                    # 17日は好天。18日はイギリスの飛行場の霧で第2次輸送が遅れた(降下の待機で表す)。19日はイギリスで低い雲と雨で
                    # 82空挺への空輸は中止。20日は不明。現地の天候は TODO(要裏取り):KNMI の気象記録
                    (
                        "weather",
                        L(
                            [
                                ("initial", "clear"),
                                ("changeChancePerHour", 0.0),
                                ("minHoursBetweenChanges", 3),
                                ("improveChance", 0.5),
                                ("schedule", [L([("turn", at_hour(3, 7)), ("weather", "overcast"), ("allowed", ["overcast"])])]),
                            ]
                        ),
                    ),
                    # 空輸:18日の第2次輸送で補給物資も落とした。量と回数は仮置き TODO(要裏取り)
                    ("air", L([("us", L([("airlift", L([("sortiesPerDay", 2), ("ammoT", 40), ("fuelT", 5)]))]))])),
                    ("night", L([("turn", NIGHT1), ("hours", 11), ("everyTurns", PER_DAY)])),
                    ("reinforcements", reinforcements),
                    ("airborne", airborne),
                ]
            ),
        ),
        ("units", units),
        (
            "depots",
            [
                L([("id", "us-xxx-corps"), ("side", "us"), ("nodeId", "south_edge"), ("ammoT", 600), ("fuelT", 300)]),
                L([("id", "de-north"), ("side", "de"), ("nodeId", "north_edge"), ("ammoT", 500), ("fuelT", 200)]),
                L([("id", "de-east"), ("side", "de"), ("nodeId", "east_edge"), ("ammoT", 500), ("fuelT", 100)]),
            ],
        ),
    ]
)

# 史実の結末(結果の画面で、プレイヤーの結果と比べる)。勝ち方の段階は、このシナリオの勝利条件に当てはめたもの
scenario["historicalOutcome"] = L([("winner", "us"), ("level", "decisive"), ("summary", "20日夕方までに、グラーヴェ橋・運河の橋・フルースベークの高地と、ナイメーヘンの道路橋・レントを押さえた。")])
OUT.write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if __name__ == "__main__":
    print(f"wrote {OUT.relative_to(ROOT)}(規定 {MAX_TURNS} ターン、夜は {NIGHT1} ターン目から {PER_DAY} ターンごと)")
