#!/usr/bin/env python3
"""
米軍の装備品パックと実数の編成パック(data/weapons/us.json・data/toe/us.json)を作る。

    python3 tools/packs/build_us.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
1丁・1両あたりの威力は tools/packs/equipment_common.py の物差し(docs/research/equipment-calibration.md)。
根拠と信頼度は docs/research/equipment-us.md(米独1944年・太平洋の調査メモの値を流用したものは、そちらに出典)。
この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。中隊の小銃・カービンの数などの多くは TODO(要裏取り)。

ID は「us-」で始める(米独1944年のパックの us_ と重ならないように)。距離はヤードの表をメートルに直した(500yd = 457m)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("us")
W, far = P.W, P.far
YD = 0.9144


def yd(table):
    """(ヤード, mm) の表を (m, mm) に"""
    return [(round(d * YD), mm) for d, mm in table]


# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["us-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["us-semi"] = c.rifle("半自動小銃", c.RE["semi_rifle"])
# カービン:小銃より射程が短い(有効 約300m)。帯の形を保つため最後の帯を400mまでにする(ゲームの見立て)
W["us-carbine"] = c.rifle("カービン", c.RE["carbine"], max_range_m=400)
W["us-smg"] = c.smg("短機関銃")
W["us-bar"] = c.rifle("自動小銃 BAR", c.RE["auto_rifle"], max_range_m=600)
# ショーシャ:故障が多いとされる(American Rifleman)。自動小銃の 3/4 とする(ゲームの見立て)
W["us-chauchat"] = c.rifle("軽機関銃 ショーシャ", c.RE["auto_rifle"] * 0.75, max_range_m=600)
# M1919A4:ベルト給弾だが三脚で据えて使い、発射速度は毎分400〜600発(MG 34 は900前後)。弾倉式の軽機関銃の 1.2 倍(ゲームの見立て)
W["us-lmg"] = c.mg("軽機関銃 M1919A4", c.RE["lmg"] * 1.2)
W["us-hmg"] = c.mg("重機関銃 M1917A1(三脚・水冷)", c.RE["hmg"], tripod=True)
# オチキス M1914:保弾板の給弾で持続射撃が劣る。重機関銃の 0.9 倍(ゲームの見立て)
W["us-hotchkiss"] = c.mg("重機関銃 オチキス M1914(三脚)", c.RE["hmg"] * 0.9, tripod=True)
W["us-mg-vehicle"] = c.mg("車載機関銃", c.RE["lmg"])
# M2 12.7mm:車両に1挺。重機関銃と同じ形で 1.2 倍(弾が重い。ゲームの見立て)
W["us-hmg50"] = c.mg("重機関銃 M2 12.7mm(車載)", c.RE["hmg"] * 1.2, tripod=True)
# バズーカ 2.36インチ(M6A1/M6A3):90〜127mm の幅(weapons-1944-us-de.md)→ 100mm。実用 約120yd・照準は300ydまで
W["us-bazooka"] = c.at_weapon("バズーカ 2.36インチ", [100, 100], 110, 275)
# 3.5インチ M20(M28A2):よく引かれる値は 280mm(200mm・100mm の資料もあり。信頼度 低〜中)。有効 約300yd(静止目標)
W["us-bazooka35"] = c.at_weapon("スーパー・バズーカ 3.5インチ", [280, 280], 140, 275)
# 迫撃砲:60mm M2 弾1.24kg(M49A2、射表の 2.73lb。中)・最大1,815m(中)。81mm M1 弾3.12kg(M43A1 軽榴弾。TODO(要裏取り))・最大約3,000m(中)
W["us-mortar60"] = c.mortar("60mm 迫撃砲 M2", 1.24, 1815)
W["us-mortar81"] = c.mortar("81mm 迫撃砲 M1", 3.12, 3000)
# 対戦車砲(30°の板):57mm M1(M86)71/500yd・66/1000yd(低)。37mm M3(M51)53/500yd・46/1000yd(低)
W["us-57mm"] = c.at_gun("57mm 対戦車砲 M1", 57, yd([(500, 71), (1000, 66)]), far, "us-57mm")
W["us-37mm"] = c.at_gun("37mm 対戦車砲 M3", 37, yd([(500, 53), (1000, 46)]), far, "us-37mm")
# 戦車砲(30°の板):75mm M3(M61)61/56/51/46 @ 500〜2000yd(中)。76mm M1(M62)93/88/82/75(中)。90mm M3(M82)120/112(中)。
# 37mm M6 は 37mm M3 と同じ砲。3インチ M7(M10)は 76mm M1 と同じ弾・弾道(中)
PEN75 = yd([(500, 61), (1000, 56), (1500, 51), (2000, 46)])
PEN76 = yd([(500, 93), (1000, 88), (1500, 82), (2000, 75)])
PEN90 = yd([(500, 120), (1000, 112)])
W["us-37mm-m6"] = c.tank_gun("37mm M6(M5A1)", 37, yd([(500, 53), (1000, 46)]), far, "us-37mm-m6")
W["us-75mm-m3"] = c.tank_gun("75mm M3(M4)", 75, PEN75, far, "us-75mm-m3")
W["us-76mm-m1"] = c.tank_gun("76mm M1(M4(76)・M4A3E8)", 76, PEN76, far, "us-76mm-m1")
W["us-90mm-m3"] = c.tank_gun("90mm M3(M26)", 90, PEN90, far, "us-90mm-m3")
W["us-3in-m7"] = c.tank_gun("3インチ M7(M10)", 76, PEN76, far, "us-3in-m7", td=True)
W["us-76mm-m1-td"] = c.tank_gun("76mm M1(M18)", 76, PEN76, far, "us-76mm-m1-td", td=True)
W["us-90mm-m3-td"] = c.tank_gun("90mm M3(M36)", 90, PEN90, far, "us-90mm-m3-td", td=True)
# 砲(間接射撃):105mm M2A1 弾14.97kg・最大11,270m(中)。105mm M3(砲中隊)同じ弾・最大7,600m(中)。
# 75mm M1A1 パック榴弾砲:最大8,790m(中〜高)・弾6.24kg(M48。TODO(要裏取り))。155mm M1:弾43kg・最大14,600m(資料は14,600〜14,784m。中)
# 朝鮮戦争の連隊の火器:4.2インチ迫撃砲 M2 弾11〜13kg の低い方 11kg・最大4,400m(中:Wikipedia)。重迫撃砲中隊の曲射の直接射撃にする。
# 無反動砲:57mm M18 の成形炸薬弾 76mm(垂直)・有効450m(中)、75mm M20 の成形炸薬弾 100mm・有効約366m(400yd。最大6.4km は榴弾。中)
W["us-mortar42"] = c.mortar("4.2インチ迫撃砲 M2", 11.0, 4400)
W["us-mortar42"]["entrenchmentPierce"] = 0.3
W["us-rr57"] = c.at_weapon("57mm 無反動砲 M18", [76, 76], 200, 450)
W["us-rr75"] = c.at_weapon("75mm 無反動砲 M20", [100, 100], 200, 366)
# ストークス 3インチ迫撃砲(1918年の米派遣軍。英のものと同じ:弾4.84kg・最大約732m。中)
W["us-stokes"] = c.mortar("ストークス 3インチ迫撃砲", 4.84, 732)
W["us-105-m2a1"] = c.howitzer("105mm 榴弾砲 M2A1", 14.97, 11270)
W["us-105-m3"] = c.howitzer("105mm 榴弾砲 M3", 14.97, 7600)
W["us-75-pack"] = c.howitzer("75mm 榴弾砲 M1A1(パック)", 6.24, 8790)
W["us-155-m1"] = c.howitzer("155mm 榴弾砲 M1", 43.0, 14600)

# ---------------------------------------------------------------- 装備品
item = P.item
Y = c.years
HP = c.VEHICLE_HP

# 小火器(年は広く知られた採用・配備の年。TODO(要裏取り))
item("us-m1903", "M1903 スプリングフィールド小銃", "rifle", Y(1903, 1945), [("us-rifle", 1)], specs={"口径": ".30-06"}, short="M1903")
item("us-m1917", "M1917 エンフィールド小銃", "rifle", Y(1917, 1918), [("us-rifle", 1)], specs={"口径": ".30-06"}, desc="1918年の米派遣軍の多くはこちらを持った(TODO(要裏取り):割合)", short="M1917")
item("us-m1", "M1 ガーランド半自動小銃", "rifle", Y(1937, 1953), [("us-semi", 1)], specs={"口径": ".30-06", "有効射程 m": 457}, short="M1 ガーランド")
item("us-carbine", "M1 カービン", "rifle", Y(1942, 1953), [("us-carbine", 1)], specs={"口径": ".30 カービン"}, short="M1 カービン")
item("us-thompson", "トンプソン短機関銃", "smg", Y(1938, 1945), [("us-smg", 1)], specs={"口径": ".45"}, short="トンプソン")
item("us-m3smg", "M3 短機関銃(グリースガン)", "smg", Y(1943, 1953), [("us-smg", 1)], specs={"口径": ".45"}, short="M3 SMG")
item("us-bar", "M1918A2 自動小銃(BAR)", "lmg", Y(1918, 1953), [("us-bar", 1)], crew=2, specs={"発射速度 発/分": "300〜650(切替)", "有効射程 m": 550}, desc="分隊の火力の柱。1918年9月にショーシャと替わり始めた", short="BAR")
item("us-chauchat", "ショーシャ M1915 軽機関銃", "lmg", Y(1917, 1918), [("us-chauchat", 1)], crew=2, desc="フランス製。米派遣軍の初期の自動火器で、故障が多いとされる", short="ショーシャ")
item("us-m1919a4", "M1919A4 軽機関銃", "lmg", Y(1940, 1953), [("us-lmg", 1)], crew=3, specs={"発射速度 発/分": "400〜600", "有効射程 m": "1,000〜1,400"}, short="M1919A4")
item("us-m1917a1", "M1917A1 重機関銃(水冷)", "hmg", Y(1936, 1953), [("us-hmg", 1)], crew=4, short="M1917A1")
item("us-hotchkiss", "オチキス M1914 重機関銃", "hmg", Y(1917, 1918), [("us-hotchkiss", 1)], crew=4, desc="フランス製。米派遣軍で約7,000挺。1918年9月からブローニング M1917 が出始めた", short="オチキス")
item("us-m2hb", "M2 重機関銃 12.7mm", "hmg", Y(1933, 1953), [("us-hmg50", 1)], crew=3, short="M2 12.7mm")
item("us-bazooka", "M1A1/M9 バズーカ(2.36インチ)", "at_launcher", Y(1943, 1950), [("us-bazooka", 1)], crew=2, specs={"貫通 mm": "90〜127", "実用射程 m": "約110"}, short="バズーカ")
item("us-bazooka35", "M20 スーパー・バズーカ(3.5インチ)", "at_launcher", Y(1950, 1953), [("us-bazooka35", 1)], crew=2, specs={"貫通 mm": "280(異説あり)", "有効射程 m": "約275"}, desc="1950年7月に朝鮮へ空輸され、T-34-85 を止めた", short="3.5インチ")
# 迫撃砲・対戦車砲・砲
item("us-mortar60", "60mm 迫撃砲 M2", "mortar", Y(1940, 1953), [("us-mortar60", 1)], crew=5, specs={"弾 kg": 1.24, "最大射程 m": 1815}, short="60mm迫")
item("us-mortar81", "81mm 迫撃砲 M1", "mortar", Y(1940, 1953), [("us-mortar81", 1)], crew=8, specs={"弾 kg": "3.12(TODO)", "最大射程 m": 3000}, short="81mm迫")
item("us-mortar42", "4.2インチ迫撃砲 M2", "mortar", Y(1943, 1953), [("us-mortar42", 1)], crew=6, specs={"弾 kg": "11〜13", "最大射程 m": 4400}, desc="化学迫撃砲大隊の砲で、朝鮮戦争では歩兵連隊の重迫撃砲中隊が持った", short="4.2インチ迫")
item("us-m18rr", "57mm 無反動砲 M18", "at_launcher", Y(1945, 1953), [("us-rr57", 1)], crew=2, specs={"貫通 mm(垂直)": 76, "有効射程 m": 450}, desc="肩に載せて撃てる無反動砲。成形炸薬弾は T-34-85 の正面には弱かった", short="57mm 無反動砲")
item("us-m20rr", "75mm 無反動砲 M20", "at_launcher", Y(1945, 1953), [("us-rr75", 1)], crew=3, specs={"貫通 mm": 100, "最大射程 m": "6,400(榴弾)"}, short="75mm 無反動砲")
item("us-stokes", "ストークス 3インチ迫撃砲", "mortar", Y(1917, 1918), [("us-stokes", 1)], crew=5, specs={"弾 kg": 4.84, "最大射程 m": "約730"}, desc="英国製の塹壕迫撃砲。1918年の連隊本部中隊に6門", short="ストークス")
item("us-37mm", "37mm 対戦車砲 M3", "at_gun", Y(1940, 1945), [("us-37mm", 1)], crew=5, specs={"貫通 mm/457m": 53}, desc="1943年からは 57mm に替わった。太平洋ではキャニスター弾で対人にも使った", short="37mm 対戦車")
item("us-57mm", "57mm 対戦車砲 M1", "at_gun", Y(1943, 1950), [("us-57mm", 1)], crew=10, specs={"貫通 mm/457m": 71}, desc="英国の6ポンド砲の米国版", short="57mm 対戦車")
item("us-75-pack", "75mm 榴弾砲 M1A1(パック)", "howitzer", Y(1927, 1953), [("us-75-pack", 1)], crew=6, specs={"弾 kg": "6.24(TODO)", "最大射程 m": 8790}, desc="分解して運べる山砲。空挺・山岳・海兵隊で使った", short="75mm 山砲")
item("us-105-m3", "105mm 榴弾砲 M3", "howitzer", Y(1943, 1945), [("us-105-m3", 1)], crew=8, specs={"弾 kg": 14.97, "最大射程 m": 7600}, desc="短砲身の軽い105mm。歩兵連隊の砲中隊・空挺の砲兵", short="105mm M3")
item("us-105-m2a1", "105mm 榴弾砲 M2A1", "howitzer", Y(1941, 1953), [("us-105-m2a1", 1)], crew=8, specs={"弾 kg": 14.97, "最大射程 m": 11270}, short="105mm M2A1")
item("us-155-m1", "155mm 榴弾砲 M1", "heavy_artillery", Y(1942, 1953), [("us-155-m1", 1)], crew=11, specs={"弾 kg": 43, "最大射程 m": "14,600〜14,784"}, short="155mm M1")
# 戦車・駆逐戦車(装甲は実質の厚さ mm。根拠は weapons-1944-us-de.md と equipment-us.md)
item("us-m3-lee", "M3 リー中戦車", "tank", Y(1941, 1943), [("us-75mm-m3", 1), ("us-37mm-m6", 1), ("us-mg-vehicle", 3)], crew=6, hp=HP["medium_tank"], armor={"front": 51, "side": 38, "rear": 38, "turretFront": 51, "turretSide": 51}, specs={"重量 t": 27}, desc="車体右の張り出しに 75mm(旋回が狭い)、砲塔に 37mm。装甲は前面51・側面38(中:Wikipedia)、砲塔側面は仮置き。75mm は短い M2 砲が多く、貫通力は M3 砲の値より低いはず(TODO(要裏取り))", short="M3 リー")
item("us-m3-stuart", "M3 スチュアート軽戦車", "tank", Y(1941, 1943), [("us-37mm-m6", 1), ("us-mg-vehicle", 3)], crew=4, hp=HP["light_tank"], armor={"front": 43, "side": 25, "rear": 25, "turretFront": 38, "turretSide": 25}, desc="装甲は M5A1 と同じとみなした**仮置き**(TODO(要裏取り))", short="M3 軽戦車")
item("us-m5a1", "M5A1 スチュアート軽戦車", "tank", Y(1943, 1945), [("us-37mm-m6", 1), ("us-mg-vehicle", 2)], crew=4, hp=HP["light_tank"], armor={"front": 43, "side": 25, "rear": 25, "turretFront": 44, "turretSide": 32}, specs={"重量 t": 15}, short="M5A1")
item("us-m4", "M4A3(75)シャーマン中戦車", "tank", Y(1942, 1945), [("us-75mm-m3", 1), ("us-mg-vehicle", 2), ("us-hmg50", 1)], crew=5, hp=HP["medium_tank"], armor={"front": 91, "side": 38, "rear": 38, "turretFront": 76, "turretSide": 51}, specs={"重量 t": 30}, short="M4(75)")
item("us-m4-76", "M4A3(76)W シャーマン中戦車", "tank", Y(1944, 1953), [("us-76mm-m1", 1), ("us-mg-vehicle", 2), ("us-hmg50", 1)], crew=5, hp=HP["medium_tank"], armor={"front": 93, "side": 38, "rear": 38, "turretFront": 64, "turretSide": 64}, desc="砲塔前面は 63.5mm(防盾 88.9mm)", short="M4(76)")
item("us-m4a3e8", "M4A3E8 シャーマン中戦車(イージーエイト)", "tank", Y(1945, 1953), [("us-76mm-m1", 1), ("us-mg-vehicle", 2), ("us-hmg50", 1)], crew=5, hp=HP["medium_tank"], armor={"front": 93, "side": 38, "rear": 38, "turretFront": 64, "turretSide": 64}, desc="朝鮮では高速徹甲弾(HVAP)が多く、T-34-85 とほぼ互角とされる(HVAP の貫通力は TODO(要裏取り)。いまは M62 の値)", short="M4A3E8")
item("us-m26", "M26 パーシング重戦車", "tank", Y(1945, 1953), [("us-90mm-m3", 1), ("us-mg-vehicle", 2), ("us-hmg50", 1)], crew=5, hp=5.0, armor={"front": 147, "side": 51, "rear": 51, "turretFront": 102, "turretSide": 76}, specs={"重量 t": 41.9}, desc="車体前面 102mm @ 46°(実質 約147、計算)。防盾は 114mm(資料で違う)。朝鮮で 90mm の HVAP は T-34-85 を撃ち抜いた(HVAP の値は TODO。いまは M82 の値)", short="M26")
item("us-m10", "M10 戦車駆逐車(3インチ砲)", "tank_destroyer", Y(1942, 1945), [("us-3in-m7", 1), ("us-hmg50", 1)], crew=5, hp=HP["tank_destroyer"], armor={"front": 66, "side": 19, "rear": 19}, desc="オープントップの砲塔", short="M10")
item("us-m18", "M18 ヘルキャット戦車駆逐車", "tank_destroyer", Y(1944, 1945), [("us-76mm-m1-td", 1), ("us-hmg50", 1)], crew=5, hp=3.0, armor={"front": 29, "side": 13, "rear": 13}, desc="装甲を削って最高時速80km 前後の速さを取った", short="M18")
item("us-m36", "M36 ジャクソン戦車駆逐車(90mm)", "tank_destroyer", Y(1944, 1953), [("us-90mm-m3-td", 1), ("us-hmg50", 1)], crew=5, hp=HP["tank_destroyer"], armor={"front": 66, "side": 19, "rear": 19}, desc="車体は M10A1 と同じとみなした(信頼度 低〜中)", short="M36")
# 装甲車・半装軌車:薄い装甲の車両は装甲の要素にしない
item("us-m8", "M8 グレイハウンド装甲車", "armored_car", Y(1943, 1953), [("us-37mm-m6", 1), ("us-mg-vehicle", 1)], crew=4, hp=HP["armored_car"], desc="側面 9.5mm。薄い装甲として装甲の要素にしない", short="M8")
item("us-m3ht", "M3 半装軌車", "halftrack", Y(1941, 1953), [("us-mg-vehicle", 1)], crew=2, hp=0.5, desc="薄い装甲として装甲の要素にしない", short="M3 半装軌")
item("us-truck", "2½トン・トラック", "truck", Y(1941, 1953), short="トラック")
item("us-jeep", "¼トン・トラック(ジープ)", "truck", Y(1941, 1953), short="ジープ")

# ---------------------------------------------------------------- 編成表
el = P.el
toe = P.toe

# 1944年の歩兵連隊(T/O&E 7-11、1944年2月26日)。
# 小銃中隊は T/O&E 7-17(1944年2月26日):6名+187名=193名(Scribd の写し。中)。武器小隊は 60mm 迫撃砲3・M1919A4 2(中)。
# BAR は分隊に1で9(中)。バズーカは中隊本部に 5(1944年6月30日の改定から。それまでは3。中)。M1 とカービンの内訳は TODO(要裏取り:T/O&E 7-17 の装備表)。
# 重火器中隊は T/O&E 7-18:160名(中)、81mm 6(中)、M1917A1 8(1942年の FM 7-15 の機関銃小隊2から。低〜中。TODO)。
# 大隊本部中隊に対戦車小隊(57mm 3)。連隊の対戦車中隊 57mm 9(T/O&E 7-19。中)、砲中隊 105mm M3 6・118名(中)
toe(
    "us-ir-1944",
    "歩兵連隊(米1944)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 110, [("us-m1", 60), ("us-carbine", 40), ("us-bazooka", 5)], "連隊本部"),
        el("大隊本部中隊(対戦車小隊を含む)", 3, 120, [("us-m1", 70), ("us-carbine", 40), ("us-57mm", 3), ("us-bazooka", 8)], "大隊", 3),
        el("小銃中隊", 9, 193, [("us-m1", 140), ("us-carbine", 30), ("us-m1903", 6), ("us-thompson", 6), ("us-bar", 9), ("us-m1919a4", 2), ("us-mortar60", 3), ("us-bazooka", 5)], "大隊", 3),
        el("重火器中隊", 3, 160, [("us-m1", 60), ("us-carbine", 80), ("us-m1917a1", 8), ("us-mortar81", 6), ("us-bazooka", 7)], "大隊", 3),
        el("砲中隊(105mm)", 1, 118, [("us-carbine", 80), ("us-105-m3", 6)], "連隊直轄"),
        el("対戦車中隊(57mm)", 1, 165, [("us-m1", 80), ("us-carbine", 70), ("us-57mm", 9), ("us-bazooka", 9)], "連隊直轄"),
    ],
)

# 1918年の歩兵連隊(米派遣軍。3個大隊 × 4個中隊)。中隊 256名(1918年の海兵隊の中隊 6名+252名から。中)。
# 自動火器はショーシャ(1918年9月から BAR)、重機関銃はオチキス M1914(中)。ショーシャ・オチキスの数は TODO(要裏取り:1918年5月の編制表、
# American Battle Monuments Commission『American Armies and Battlefields in Europe』)。連隊本部中隊のストークス迫撃砲6(中)は入れた。37mm 砲3(中)は、
# 武器の諸元が分からないので入れていない(TODO)
toe(
    "us-ir-1918",
    "歩兵連隊(米1918)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 300, [("us-m1917", 270), ("us-stokes", 6)], "連隊本部"),
        el("小銃中隊", 12, 256, [("us-m1917", 220), ("us-chauchat", 16)], "大隊", 3),
        el("機関銃中隊", 1, 178, [("us-m1917", 120), ("us-hotchkiss", 16)], "連隊直轄"),
    ],
)

# 1944年の戦車大隊(機甲師団、1943年型の軽師団):中戦車中隊3(17両=本部2+5両×3)・軽戦車中隊1(17両)・本部2。中戦車53・軽戦車17(中)。
# M4(105)6両は武器の諸元が足りないので入れていない(TODO)。乗員 5名/両(軽戦車4名)。整備・補給の人員は入れていない(TODO)
toe(
    "us-tank-bn-1944",
    "戦車大隊(M4・米1944)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("us-m4", 2)], "大隊本部"),
        el("中戦車中隊(M4)", 3, 90, [("us-m4", 17)], "中隊"),
        el("軽戦車中隊(M5A1)", 1, 72, [("us-m5a1", 17)], "中隊"),
    ],
)
toe(
    "us-tank-bn-1945",
    "戦車大隊(M4(76)・米1945)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("us-m4-76", 2)], "大隊本部"),
        el("中戦車中隊(M4(76))", 3, 90, [("us-m4-76", 17)], "中隊"),
        el("軽戦車中隊(M5A1)", 1, 72, [("us-m5a1", 17)], "中隊"),
    ],
)
# 1950年の戦車大隊(朝鮮)。中隊22両(本部2+5両×4)・大隊本部3 の 69両は TODO(要裏取り:T/O&E 17-35(1948))
toe(
    "us-tank-bn-1950-m26",
    "戦車大隊(M26・米1950)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("us-m26", 3)], "大隊本部"),
        el("戦車中隊(M26)", 3, 115, [("us-m26", 22)], "中隊"),
    ],
)
toe(
    "us-tank-bn-1950-e8",
    "戦車大隊(M4A3E8・米1950)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("us-m4a3e8", 3)], "大隊本部"),
        el("戦車中隊(M4A3E8)", 3, 115, [("us-m4a3e8", 22)], "中隊"),
    ],
)
# 戦車駆逐大隊(自走):砲中隊3 × 12両=36両(FM 18-5。高)。偵察中隊の M8 の数と人員は TODO(要裏取り:T/O&E 18-25)
for tid, name, veh in [("us-td-bn-m10", "戦車駆逐大隊(M10・米1944)", "us-m10"), ("us-td-bn-m18", "戦車駆逐大隊(M18・米1944)", "us-m18"), ("us-td-bn-m36", "戦車駆逐大隊(M36・米1944)", "us-m36")]:
    toe(
        tid,
        name,
        "tank_destroyer_battalion",
        [
            el("大隊本部・偵察中隊", 1, 120, [("us-carbine", 80), ("us-m8", 6), ("us-m3ht", 6)], "大隊本部"),
            el("砲中隊", 3, 110, [("us-carbine", 60), ("us-m1", 30), ("us-bazooka", 6), (veh, 12)], "中隊"),
        ],
    )
# 1944年の機甲歩兵大隊(1943年9月の T/O&E 7-25):1,001名(bayonetstrength。中)。小銃中隊 251名(T/O&E 7-27。中)・半装軌車20+迫撃砲車3(フォーラム。低)。
# 中隊の機関銃・バズーカ・小銃の数は TODO(要裏取り:T/O&E 7-27 の装備表)。本部中隊の 75mm 自走榴弾砲(M8)は入れていない(TODO)
toe(
    "us-armd-inf-bn-1944",
    "機甲歩兵大隊(半装軌車・米1944)",
    "mechanized_infantry_battalion",
    [
        el("大隊本部・本部中隊", 1, 160, [("us-m1", 60), ("us-carbine", 70), ("us-m1917a1", 6), ("us-mortar81", 3), ("us-m2hb", 6), ("us-m3ht", 14)], "大隊本部"),
        el("機甲歩兵中隊", 3, 251, [("us-m1", 160), ("us-carbine", 40), ("us-m3smg", 30), ("us-bar", 9), ("us-m1919a4", 5), ("us-m2hb", 3), ("us-mortar60", 3), ("us-bazooka", 9), ("us-m3ht", 20)], "中隊"),
        el("勤務中隊", 1, 90, [("us-carbine", 80), ("us-truck", 20)], "直轄"),
    ],
)
# 砲兵大隊:105mm M2A1・155mm M1 とも 3個中隊 × 4門(中)。人員は TODO(要裏取り:T/O&E 6-25・6-35)
toe(
    "us-fa-bn-105",
    "野砲兵大隊(105mm・米)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 120, [("us-carbine", 100), ("us-m2hb", 2)], "大隊本部"),
        el("砲兵中隊(105mm)", 3, 100, [("us-carbine", 80), ("us-m2hb", 1), ("us-105-m2a1", 4)], "中隊"),
    ],
)
toe(
    "us-fa-bn-155",
    "野砲兵大隊(155mm・米)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 120, [("us-carbine", 100), ("us-m2hb", 2)], "大隊本部"),
        el("砲兵中隊(155mm)", 3, 110, [("us-carbine", 90), ("us-m2hb", 1), ("us-155-m1", 4)], "中隊"),
    ],
)
# 騎兵偵察中隊(機械化)。M8 と ジープの数は TODO(要裏取り:T/O&E 2-27)
toe(
    "us-cav-recon-troop",
    "騎兵偵察中隊(M8・米1944)",
    "recon_squadron",
    [
        el("偵察小隊", 3, 30, [("us-m8", 3), ("us-jeep", 6), ("us-carbine", 20), ("us-m1919a4", 2), ("us-mortar60", 1)], "小隊"),
    ],
    echelon="company",
)

# ---- 1942〜43年(根拠は equipment-us.md の「1942〜43年」の節)----
# 1942〜43年の歩兵連隊:小銃中隊は 6名+192名=198名(1942年4月〜43年半ば。中:battleorder)、BAR 9・M1919A4 2・60mm 3、
# 対戦車は小銃擲弾(M1903 に擲弾発射器。中)。大隊本部中隊に 37mm 4(中)。連隊の対戦車中隊の 37mm の数と、砲中隊(1942年4月に加わった。中)の砲は TODO(要裏取り):
# 対戦車中隊は 37mm 9 の仮置き、砲中隊は入れていない
toe(
    "us-ir-1942",
    "歩兵連隊(米1942〜43)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 110, [("us-m1", 60), ("us-carbine", 40)], "連隊本部"),
        el("大隊本部中隊(対戦車小隊を含む)", 3, 120, [("us-m1", 70), ("us-carbine", 40), ("us-37mm", 4)], "大隊", 3),
        el("小銃中隊", 9, 198, [("us-m1", 150), ("us-m1903", 18), ("us-carbine", 15), ("us-thompson", 6), ("us-bar", 9), ("us-m1919a4", 2), ("us-mortar60", 3)], "大隊", 3),
        el("重火器中隊", 3, 160, [("us-m1", 60), ("us-carbine", 80), ("us-m1917a1", 8), ("us-mortar81", 6)], "大隊", 3),
        el("対戦車中隊(37mm)", 1, 160, [("us-m1", 80), ("us-carbine", 60), ("us-37mm", 9)], "連隊直轄"),
    ],
)
# 1942年の中戦車大隊(M3 リー)。中隊17両 × 3+本部2(1943〜44年の大隊の中隊の形を写した仮置き。TODO(要裏取り:1942年の T/O 17-26、北アフリカの第1機甲師団))
toe(
    "us-tank-bn-1942-lee",
    "中戦車大隊(M3 リー・米1942)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 30, [("us-m3-lee", 2)], "大隊本部"),
        el("中戦車中隊(M3 リー)", 3, 110, [("us-m3-lee", 17)], "中隊"),
    ],
)
toe(
    "us-lt-tank-bn-1942",
    "軽戦車大隊(M3 スチュアート・米1942)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 25, [("us-m3-stuart", 2)], "大隊本部"),
        el("軽戦車中隊(M3)", 3, 72, [("us-m3-stuart", 17)], "中隊"),
    ],
)

# ---- 朝鮮戦争(1950年。根拠は equipment-us.md の「1950年」の節)----
# 1950年の歩兵連隊:砲中隊と対戦車中隊をやめ、重迫撃砲中隊(4.2インチ 12。8 とする資料もある)と戦車中隊(148名・22両)を持つ(中:Wikisource『Infantry, Part I』、
# warhistory.org)。大隊は重火器中隊を含めて 917名、小銃中隊 211名(中:同)。75mm 無反動砲は大隊の重火器中隊、57mm 無反動砲は中隊の武器小隊(中〜低)。
# 中隊・重火器中隊の火器の数と、戦車中隊の車種は TODO(要裏取り:T/O&E 7-11N・7-17N(1948))。戦車は M4A3E8 とした
toe(
    "us-ir-1950",
    "歩兵連隊(米1950)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 200, [("us-m1", 100), ("us-carbine", 90), ("us-bazooka35", 6)], "連隊本部"),
        el("大隊本部中隊", 3, 120, [("us-m1", 70), ("us-carbine", 45), ("us-bazooka35", 4)], "大隊", 3),
        el("小銃中隊", 9, 211, [("us-m1", 150), ("us-carbine", 35), ("us-bar", 9), ("us-m1919a4", 2), ("us-mortar60", 3), ("us-m18rr", 3), ("us-bazooka35", 3)], "大隊", 3),
        el("重火器中隊", 3, 164, [("us-m1", 60), ("us-carbine", 90), ("us-m1917a1", 8), ("us-mortar81", 4), ("us-m20rr", 4)], "大隊", 3),
        el("重迫撃砲中隊(4.2インチ)", 1, 190, [("us-m1", 80), ("us-carbine", 100), ("us-mortar42", 12)], "連隊直轄"),
        el("戦車中隊", 1, 148, [("us-m4a3e8", 22)], "連隊直轄"),
    ],
)

# 1950年の歩兵大隊:上の連隊の大隊1つ分(大隊本部中隊・小銃中隊3・重火器中隊。約917名とする資料に近い。中)。
# 連隊の直轄部隊(連隊本部・重迫撃砲中隊・戦車中隊)は別の編成表に分けた(チピョンニのように大隊ごとに陣地を受け持つシナリオのため)
_r50 = P.T["us-ir-1950"]["elements"]
toe(
    "us-inf-bn-1950",
    "歩兵大隊(米1950)",
    "infantry_battalion",
    [{**e, "count": e["count"] // 3, "group": "大隊", "groupCount": 1} for e in _r50 if e.get("group") == "大隊"],
)
toe(
    "us-regt-troops-1950",
    "歩兵連隊の直轄部隊(重迫撃砲・戦車・米1950)",
    "infantry_battalion",
    [e for e in _r50 if e.get("group") != "大隊"],
)

# ---- バストーニュの部隊の大きさの編成表(シナリオの「史実の編成(実数)」で使う。根拠は equipment-us.md の 2節)----
# 1944年の空挺歩兵連隊(T/O&E 7-31):約1,958名(1942年の表。1944年の改定も同じ総数とする資料あり。中〜低)。大隊は 530名(35+495)、
# 小銃中隊3(8+119=127名)・本部中隊(81mm 4)(1944年2月の大隊の表。中)。12月の T/O 7-31T の要約の 60mm 9・81mm 4・軽機関銃35・バズーカ21 は
# 大隊ごとの数と読んだ(60mm が「小隊に1」の大隊の表と合うため。中〜低)。小銃・カービン・短機関銃の内訳は TODO(要裏取り)
toe(
    "us-pir-1944",
    "空挺歩兵連隊(米1944)",
    "airborne_regiment",
    [
        el("連隊本部・本部中隊・勤務中隊", 1, 368, [("us-m1", 200), ("us-carbine", 140), ("us-thompson", 10), ("us-m1919a4", 8)], "連隊本部"),
        el("大隊本部中隊(81mm)", 3, 149, [("us-m1", 70), ("us-carbine", 60), ("us-m1919a4", 5), ("us-mortar81", 4), ("us-bazooka", 3)], "大隊", 3),
        el("小銃中隊", 9, 127, [("us-m1", 85), ("us-carbine", 25), ("us-thompson", 12), ("us-m1919a4", 10), ("us-mortar60", 3), ("us-bazooka", 6)], "大隊", 3),
    ],
)
# 第10機甲師団B戦闘団の任務部隊(デソブリー・チェリー・オハラ):おおよそ戦車中隊1・機甲歩兵中隊1に工兵・衛生・偵察(中:TracesOfWar)。
# デソブリー隊はシャーマン15両(中:warfarehistorynetwork)。工兵小隊の人員と、チェリー・オハラ隊の両数は TODO(要裏取り:CCB の戦闘詳報)
toe(
    "us-armd-team-1944",
    "機甲任務部隊(戦車中隊+機甲歩兵中隊・米1944)",
    "armored_task_force",
    [
        el("中戦車中隊(M4)", 1, 85, [("us-m4", 15)], "戦車"),
        el("機甲歩兵中隊", 1, 251, [("us-m1", 160), ("us-carbine", 40), ("us-m3smg", 30), ("us-bar", 9), ("us-m1919a4", 5), ("us-m2hb", 3), ("us-mortar60", 3), ("us-bazooka", 9), ("us-m3ht", 20)], "歩兵"),
        el("工兵小隊", 1, 40, [("us-m1", 30), ("us-carbine", 8), ("us-bazooka", 2), ("us-m3ht", 3)], "直轄"),
    ],
)
# 機甲師団の戦闘団(第4機甲師団R戦闘団:第37戦車大隊・第53機甲歩兵大隊が基幹。中:Cole『The Ardennes』)。戦車大隊と機甲歩兵大隊を合わせた定数で置く
# (12月26日の実際の両数・人員は定数より少ない。TODO(要裏取り))
_tank = P.T["us-tank-bn-1944"]["elements"]
_aib = P.T["us-armd-inf-bn-1944"]["elements"]
toe(
    "us-cc-1944",
    "機甲師団の戦闘団(戦車大隊+機甲歩兵大隊・米1944)",
    "armor_combat_command",
    [{**e, "group": "戦車大隊"} for e in _tank] + [{**e, "group": "機甲歩兵大隊"} for e in _aib],
)

W_NOTES = (
    "米軍の武器(1丁・1門・1両あたり)と装備品の一覧。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "射程・貫通力・装甲・年の根拠は docs/research/equipment-us.md(検索結果の要約による二次資料)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_us.py"
)
T_NOTES = (
    "米軍の実数の編成表(人員・装備品で書く)。1918年・1944〜45年・1950年。根拠は docs/research/equipment-us.md。中隊の小銃・カービンの数などの多くは "
    "TODO(要裏取り)(T/O&E の装備表の原文を確かめていない)。作り直しは tools/packs/build_us.py"
)
P.write(W_NOTES, T_NOTES)
