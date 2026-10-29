#!/usr/bin/env python3
"""
英連邦軍の装備品パックと実数の編成パック(data/weapons/uk.json・data/toe/uk.json)を作る。

    python3 tools/packs/build_uk.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
1丁・1両あたりの威力は tools/packs/equipment_common.py の物差し(docs/research/equipment-calibration.md)。
根拠と信頼度は docs/research/equipment-uk.md(小火器・ボーイズ・2ポンド砲・3インチ迫撃砲・25ポンド砲の射程は pacific-weapons-1941-45.md の値を流用)。
この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。**仮置き**の値は調査メモに一覧。

ID は「uk-」で始める(太平洋のパックの uk_ と重ならないように)。距離はヤードの表をメートルに直した(500yd = 457m)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("uk")
W, far = P.W, P.far
YD = 0.9144


def yd(table):
    return [(round(d * YD), mm) for d, mm in table]


# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["uk-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["uk-smg"] = c.smg("短機関銃")
W["uk-lmg"] = c.mg("軽機関銃 ブレン", c.RE["lmg"])
W["uk-hmg"] = c.mg("重機関銃 ヴィッカース(三脚・水冷)", c.RE["hmg"], tripod=True)
W["uk-mg-vehicle"] = c.mg("車載機関銃 ベサ", c.RE["lmg"])
# ボーイズ:垂直で 23.2/91m・18.8/460m(中)。ほかの国の対戦車銃と同じく表のまま
W["uk-boys"] = c.at_weapon("対戦車銃 ボーイズ", [23, 19], 91, 460)
# PIAT:75mm(2件)と 100mm(2件)で食い違い → 少ない方の 75mm。有効 105m(115yd。中)
W["uk-piat"] = c.at_weapon("PIAT", [75, 75], 50, 105)
# 迫撃砲:2インチ 弾1.0kg・最大460m は**仮置き**(TODO(要裏取り))。3インチ 弾4.5kg は**仮置き**、射程は1942年の改良後 2,500m(中)
W["uk-mortar2in"] = c.mortar("2インチ迫撃砲", 1.0, 460)
W["uk-mortar3in"] = c.mortar("3インチ迫撃砲", 4.5, 2500)
W["uk-mortar3in-early"] = c.mortar("3インチ迫撃砲(改良前)", 4.5, 1460)
# 対戦車砲(30°の板):2ポンド 53/91m・47/460m・40/910m・34/1400m(低)。6ポンド(APCBC)95/100yd・87/500yd・80/1000yd・74/1500yd(低〜中:2件がほぼ一致)。
# 17ポンド(APCBC)127/600yd・120/1000yd(Osprey。Wikipedia の 140/500m・131/1000m より低い方。中)
PEN2 = [(91, 53), (460, 47), (910, 40), (1400, 34)]
PEN6 = yd([(100, 95), (500, 87), (1000, 80), (1500, 74)])
PEN17 = yd([(600, 127), (1000, 120)])
# 75mm OQF:6ポンド砲を広げて米国の 75mm 弾を撃つ(中)→ 米 75mm M3 の表(M61、30°)を使う
PEN75 = yd([(500, 61), (1000, 56), (1500, 51), (2000, 46)])
W["uk-2pdr"] = c.at_gun("2ポンド対戦車砲", 40, PEN2, far, "uk-2pdr")
W["uk-6pdr"] = c.at_gun("6ポンド対戦車砲", 57, PEN6, far, "uk-6pdr")
W["uk-17pdr"] = c.at_gun("17ポンド対戦車砲", 76, PEN17, far, "uk-17pdr")
W["uk-2pdr-tank"] = c.tank_gun("2ポンド砲(戦車)", 40, PEN2, far, "uk-2pdr-tank")
W["uk-6pdr-tank"] = c.tank_gun("6ポンド砲(クルセーダー III)", 57, PEN6, far, "uk-6pdr-tank")
W["uk-75mm-m2"] = c.tank_gun("75mm(グラント。米の M2/M3 砲)", 75, PEN75, far, "uk-75mm-m2")
W["uk-75mm"] = c.tank_gun("75mm OQF(クロムウェル・チャーチル)", 75, PEN75, far, "uk-75mm")
W["uk-17pdr-tank"] = c.tank_gun("17ポンド砲(ファイアフライ)", 76, PEN17, far, "uk-17pdr-tank")
W["uk-17pdr-td"] = c.tank_gun("17ポンド砲(アキリーズ)", 76, PEN17, far, "uk-17pdr-td", td=True)
# 砲(間接射撃):25ポンド砲 弾11.3kg(名前の通り25ポンド。中)・最大12,253m(中〜高)
W["uk-25pdr"] = c.howitzer("25ポンド砲", 11.3, 12253)

# ---------------------------------------------------------------- 装備品
item = P.item
Y = c.years
HP = c.VEHICLE_HP

item("uk-smle", "リー・エンフィールド No.1 Mk III 小銃", "rifle", Y(1907, 1945), [("uk-rifle", 1)], specs={"口径": ".303", "有効射程 m": 503}, short="SMLE")
item("uk-no4", "リー・エンフィールド No.4 小銃", "rifle", Y(1941, 1953), [("uk-rifle", 1)], specs={"口径": ".303"}, desc="年は TODO(要裏取り)", short="No.4")
item("uk-thompson", "トンプソン短機関銃", "smg", Y(1940, 1943), [("uk-smg", 1)], specs={"口径": ".45"}, desc="ステンが行き渡るまでの米国製", short="トンプソン")
item("uk-sten", "ステン短機関銃", "smg", Y(1941, 1953), [("uk-smg", 1)], specs={"口径 mm": 9}, short="ステン")
item("uk-bren", "ブレン軽機関銃", "lmg", Y(1938, 1953), [("uk-lmg", 1)], crew=2, specs={"発射速度 発/分": "480〜540", "有効射程 m": 550}, desc="小銃分隊ごとに1挺。弾倉式で銃身を替えて撃ち続けられる", short="ブレン")
item("uk-vickers", "ヴィッカース重機関銃", "hmg", Y(1912, 1953), [("uk-hmg", 1)], crew=4, specs={"発射速度 発/分": "450〜500"}, desc="第二次大戦では歩兵大隊ではなく、師団の機関銃大隊が持った", short="ヴィッカース")
item("uk-boys", "ボーイズ対戦車銃", "at_rifle", Y(1937, 1943), [("uk-boys", 1)], crew=2, specs={"貫通 mm/91m(垂直)": 23.2}, short="ボーイズ")
item("uk-piat", "PIAT 対戦車擲弾発射器", "at_launcher", Y(1943, 1950), [("uk-piat", 1)], crew=2, specs={"貫通 mm": "75〜100(異説)", "有効射程 m": 105}, desc="ばねで成形炸薬の弾を撃ち出す。中隊本部に3つで、小隊に1つずつ配る", short="PIAT")
item("uk-mortar2in", "2インチ迫撃砲", "mortar", Y(1938, 1953), [("uk-mortar2in", 1)], crew=2, specs={"弾 kg": "1.0(仮置き)", "最大射程 m": "460(仮置き)"}, desc="小隊本部に1門", short="2インチ迫")
item("uk-mortar3in-early", "3インチ迫撃砲 Mk II(1942年の改良前)", "mortar", Y(1932, 1942), [("uk-mortar3in-early", 1)], crew=6, specs={"弾 kg": "4.5(仮置き)", "最大射程 m": 1460}, short="3インチ迫(初期)")
item("uk-mortar3in", "3インチ迫撃砲(改良後)", "mortar", Y(1942, 1953), [("uk-mortar3in", 1)], crew=6, specs={"弾 kg": "4.5(仮置き)", "最大射程 m": 2500}, short="3インチ迫")
item("uk-2pdr", "2ポンド対戦車砲", "at_gun", Y(1938, 1943), [("uk-2pdr", 1)], crew=5, specs={"貫通 mm/460m": 47}, short="2ポンド砲")
item("uk-6pdr", "6ポンド対戦車砲", "at_gun", Y(1942, 1950), [("uk-6pdr", 1)], crew=6, specs={"貫通 mm/457m": 87}, short="6ポンド砲")
item("uk-17pdr", "17ポンド対戦車砲", "at_gun", Y(1943, 1953), [("uk-17pdr", 1)], crew=7, specs={"貫通 mm/549m": 127}, desc="パンター・ティーガーを正面から相手にできた英軍の砲。徹甲弾の値で、APDS は入れていない", short="17ポンド砲")
item("uk-25pdr", "25ポンド砲", "field_gun", Y(1940, 1953), [("uk-25pdr", 1)], crew=6, specs={"弾 kg": 11.3, "最大射程 m": 12253}, desc="野砲兼榴弾砲。直接照準で対戦車にも使った", short="25ポンド砲")
# 戦車・駆逐戦車(装甲は実質の厚さ mm)
item("uk-matilda2", "マチルダ II 歩兵戦車", "tank", Y(1939, 1942), [("uk-2pdr-tank", 1), ("uk-mg-vehicle", 1)], crew=4, hp=HP["medium_tank"], armor={"front": 78, "side": 65, "rear": 55, "turretFront": 75, "turretSide": 75}, desc="装甲の値は**仮置き**(広く引かれる値。TODO(要裏取り))。1940〜41年はドイツ・イタリアの多くの対戦車砲で抜けなかった", short="マチルダ II")
item("uk-crusader3", "クルセーダー III 巡航戦車", "tank", Y(1942, 1943), [("uk-6pdr-tank", 1), ("uk-mg-vehicle", 1)], crew=3, hp=HP["medium_tank"], armor={"front": 51, "side": 28, "rear": 28, "turretFront": 51, "turretSide": 28}, desc="最大51mm(中:Wikipedia、The Tank Museum)。側面・後面は**仮置き**(TODO(要裏取り))。速いが故障が多かった", short="クルセーダー III")
item("uk-valentine", "ヴァレンタイン歩兵戦車(2ポンド砲)", "tank", Y(1940, 1944), [("uk-2pdr-tank", 1), ("uk-mg-vehicle", 1)], crew=3, hp=HP["medium_tank"], armor={"front": 65, "side": 60, "rear": 60, "turretFront": 65, "turretSide": 60}, desc="前面65mm(中)。側面60は確かめられず**仮置き**(TODO(要裏取り))。ソ連にも多く送られた", short="ヴァレンタイン")
item("uk-grant", "グラント中戦車(M3 の英軍型)", "tank", Y(1942, 1943), [("uk-75mm-m2", 1), ("uk-2pdr-tank", 1), ("uk-mg-vehicle", 2)], crew=6, hp=HP["medium_tank"], armor={"front": 51, "side": 38, "rear": 38, "turretFront": 51, "turretSide": 51}, desc="米の M3 リーの砲塔を英軍向けにしたもの。装甲は M3 リーと同じ。砲塔の 37mm は2ポンド砲とほぼ同じ威力とみなした", short="グラント")
item("uk-cromwell", "クロムウェル巡航戦車", "tank", Y(1944, 1950), [("uk-75mm", 1), ("uk-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 76, "side": 32, "rear": 32, "turretFront": 76, "turretSide": 60}, desc="最大76mm(中)。どの面かと側面・砲塔側面は**仮置き**(TODO(要裏取り))。足が速い", short="クロムウェル")
item("uk-firefly", "シャーマン VC ファイアフライ", "tank", Y(1944, 1945), [("uk-17pdr-tank", 1), ("uk-mg-vehicle", 1)], crew=4, hp=HP["medium_tank"], armor={"front": 91, "side": 38, "rear": 38, "turretFront": 76, "turretSide": 51}, desc="シャーマンに17ポンド砲を積んだもの。小隊(troop)に1両で、残りはクロムウェルやシャーマン。装甲は米の M4 と同じとした", short="ファイアフライ")
item("uk-churchill7", "チャーチル VII 歩兵戦車", "tank", Y(1944, 1950), [("uk-75mm", 1), ("uk-mg-vehicle", 2)], crew=5, hp=HP["heavy_tank"], armor={"front": 152, "side": 95, "rear": 51, "turretFront": 152, "turretSide": 95}, specs={"重量 t": 41}, desc="車体・砲塔の前面152mm、側面95mm(中)。遅いが重装甲で歩兵の直協に使った", short="チャーチル VII")
item("uk-stuart", "スチュアート軽戦車(ハニー)", "tank", Y(1941, 1945), [("uk-2pdr-tank", 1), ("uk-mg-vehicle", 2)], crew=4, hp=HP["light_tank"], armor={"front": 43, "side": 25, "rear": 25, "turretFront": 44, "turretSide": 32}, desc="米国の M5A1。主砲 37mm は 2ポンド砲とほぼ同じ威力とみなした(装甲は米の M5A1 と同じ)", short="スチュアート")
item("uk-achilles", "17ポンド自走砲 アキリーズ", "tank_destroyer", Y(1944, 1945), [("uk-17pdr-td", 1)], crew=5, hp=HP["tank_destroyer"], armor={"front": 66, "side": 19, "rear": 19}, desc="米の M10 に17ポンド砲を積んだもの。装甲は M10 と同じ", short="アキリーズ")
item("uk-carrier", "ユニバーサル・キャリア", "halftrack", Y(1939, 1953), [("uk-lmg", 1)], crew=3, hp=0.5, desc="装甲は 7〜10mm。薄い装甲として装甲の要素にしない。ブレンを積む", short="キャリア")
item("uk-truck", "トラック(3トン)", "truck", Y(1939, 1953), short="トラック")

# ---------------------------------------------------------------- 編成表
el = P.el
toe = P.toe

# 1944年の歩兵大隊(1944年11月の WE II/233/3):845名(36+809。中:bayonetstrength)。ライフル中隊4(5+120名、小隊3、分隊にブレン1、
# 小隊本部に2インチ迫撃砲1、中隊本部に PIAT 3。中)。支援中隊:3インチ迫撃砲6(2門とする資料もある。中〜低)・キャリア13(中)・
# 6ポンド砲6(**未確認**:検索では1941年の2ポンド砲8しか出なかった。TODO(要裏取り))。小銃・ステンの数は TODO
toe(
    "uk-inf-bn-1944",
    "歩兵大隊(英1944)",
    "infantry_battalion",
    [
        el("大隊本部・本部中隊", 1, 120, [("uk-no4", 90), ("uk-sten", 15), ("uk-bren", 2)], "大隊本部"),
        el("ライフル中隊", 4, 125, [("uk-no4", 95), ("uk-sten", 15), ("uk-bren", 9), ("uk-mortar2in", 3), ("uk-piat", 3)], "中隊"),
        el("迫撃砲小隊", 1, 40, [("uk-no4", 30), ("uk-mortar3in", 6), ("uk-carrier", 7)], "支援中隊"),
        el("キャリア小隊", 1, 64, [("uk-no4", 40), ("uk-sten", 13), ("uk-bren", 13), ("uk-mortar2in", 4), ("uk-carrier", 13)], "支援中隊"),
        el("対戦車小隊(6ポンド砲)", 1, 55, [("uk-no4", 45), ("uk-6pdr", 6), ("uk-carrier", 6)], "支援中隊"),
        el("工兵小隊", 1, 22, [("uk-no4", 20)], "支援中隊"),
    ],
)
# 1944年の歩兵旅団(大隊3)。旅団本部の人員は TODO(要裏取り)
bn = P.T["uk-inf-bn-1944"]["elements"]
toe(
    "uk-inf-bde-1944",
    "歩兵旅団(英1944)",
    "infantry_regiment",
    [el("旅団本部・通信", 1, 120, [("uk-no4", 90), ("uk-sten", 20)], "旅団本部")]
    + [{**e, "count": e["count"] * 3, "group": "大隊", "groupCount": 3} for e in bn],
    echelon="brigade",
)
# 1941年の歩兵大隊(マレーの英国の大隊。定数760名。中)。ライフル中隊4、ブレン・ボーイズ・2インチ迫撃砲、3インチ迫撃砲2(本部中隊。中〜低)。
# 中隊の人員・数とキャリアの数は TODO(要裏取り:1941年6月の WE、bayonetstrength)。マレーではブレン・迫撃砲が足りない部隊が多かった
toe(
    "uk-inf-bn-1941",
    "歩兵大隊(英1941)",
    "infantry_battalion",
    [
        el("大隊本部・本部中隊", 1, 160, [("uk-smle", 130), ("uk-thompson", 6), ("uk-bren", 4), ("uk-mortar3in-early", 2), ("uk-carrier", 10)], "大隊本部"),
        el("ライフル中隊", 4, 120, [("uk-smle", 100), ("uk-thompson", 6), ("uk-bren", 9), ("uk-boys", 3), ("uk-mortar2in", 3)], "中隊"),
    ],
)
# 1944年の機甲連隊(クロムウェル・ファイアフライ)。中隊3 ×(小隊4 × 4両=クロムウェル3+ファイアフライ1、中隊本部4)、連隊本部4、偵察小隊スチュアート11。
# ファイアフライが小隊に1両なのは中。両数の内訳は TODO(要裏取り:1944年の WE、Fletcher『The Universal Tank』)
toe(
    "uk-armd-regt-1944",
    "機甲連隊(クロムウェル・英1944)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 30, [("uk-cromwell", 4)], "連隊本部"),
        el("偵察小隊(スチュアート)", 1, 44, [("uk-stuart", 11)], "連隊本部"),
        el("戦車中隊(クロムウェル・ファイアフライ)", 3, 100, [("uk-cromwell", 16), ("uk-firefly", 4)], "中隊"),
    ],
    echelon="regiment",
)
toe(
    "uk-churchill-regt-1944",
    "戦車連隊(チャーチル・英1944)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 30, [("uk-churchill7", 4)], "連隊本部"),
        el("偵察小隊(スチュアート)", 1, 44, [("uk-stuart", 11)], "連隊本部"),
        el("戦車中隊(チャーチル)", 3, 100, [("uk-churchill7", 19)], "中隊"),
    ],
    echelon="regiment",
)
# 1941年の戦車大隊(マチルダ II)。両数は TODO(要裏取り)
toe(
    "uk-matilda-bn-1941",
    "陸軍戦車大隊(マチルダ II・英1941)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("uk-matilda2", 4)], "大隊本部"),
        el("戦車中隊(マチルダ II)", 3, 80, [("uk-matilda2", 16)], "中隊"),
    ],
)
# 1942年の機甲連隊(西方砂漠):グラントの中隊1・クルセーダーの中隊2・連隊本部4。**形も両数も仮置き**(TODO(要裏取り:Joslen『Orders of Battle』、
# Fletcher『The Great Tank Scandal』))
toe(
    "uk-armd-regt-1942",
    "機甲連隊(グラント・クルセーダー・英1942)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 30, [("uk-crusader3", 4)], "連隊本部"),
        el("戦車中隊(グラント)", 1, 100, [("uk-grant", 12)], "中隊"),
        el("戦車中隊(クルセーダー)", 2, 70, [("uk-crusader3", 16)], "中隊"),
    ],
    echelon="regiment",
)
toe(
    "uk-valentine-bn-1942",
    "陸軍戦車大隊(ヴァレンタイン・英1942)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("uk-valentine", 4)], "大隊本部"),
        el("戦車中隊(ヴァレンタイン)", 3, 70, [("uk-valentine", 16)], "中隊"),
    ],
)

# 対戦車連隊(王立砲兵):中隊4。牽引の17ポンド砲中隊2・アキリーズの中隊2(1944年。中隊12門)。分け方・人員は TODO(要裏取り)
toe(
    "uk-atk-regt-1944",
    "対戦車連隊(17ポンド砲・英1944)",
    "tank_destroyer_battalion",
    [
        el("連隊本部", 1, 40, [("uk-no4", 30)], "連隊本部"),
        el("対戦車中隊(17ポンド砲・牽引)", 2, 120, [("uk-no4", 90), ("uk-bren", 4), ("uk-17pdr", 12)], "中隊"),
        el("対戦車中隊(アキリーズ)", 2, 100, [("uk-no4", 60), ("uk-bren", 4), ("uk-achilles", 12)], "中隊"),
    ],
    echelon="regiment",
    modifiers=[],
)
# 野砲連隊(25ポンド砲):中隊3 × 8門=24門(中)。人員は TODO(要裏取り)
toe(
    "uk-field-regt-25pdr",
    "野砲連隊(25ポンド砲・英)",
    "artillery_battalion",
    [
        el("連隊本部・観測", 1, 90, [("uk-no4", 70), ("uk-bren", 2)], "連隊本部"),
        el("砲兵中隊(25ポンド砲)", 3, 190, [("uk-no4", 150), ("uk-bren", 4), ("uk-25pdr", 8)], "中隊"),
    ],
    echelon="regiment",
)

W_NOTES = (
    "英連邦軍の武器(1丁・1門・1両あたり)と装備品の一覧。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "射程・貫通力・装甲・年の根拠は docs/research/equipment-uk.md(検索結果の要約による二次資料。仮置きの値あり)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_uk.py"
)
T_NOTES = (
    "英連邦軍の実数の編成表(人員・装備品で書く)。1941年・1944年。根拠は docs/research/equipment-uk.md。小銃の数・両数の内訳などの多くは "
    "TODO(要裏取り)(War Establishment の原文を確かめていない)。作り直しは tools/packs/build_uk.py"
)
P.write(W_NOTES, T_NOTES)
