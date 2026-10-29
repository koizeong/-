#!/usr/bin/env python3
"""
ソ連軍の装備品パックと実数の編成パック(data/weapons/su.json・data/toe/su.json)を作る。

    python3 tools/packs/build_su.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
1丁・1両あたりの威力は tools/packs/equipment_common.py の物差し(docs/research/equipment-calibration.md)。
根拠と信頼度は docs/research/equipment-su.md(1942年の車両・対戦車火器は weapons-1942-de-su.md の値を流用)。
この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。ソ連の資料はとくに薄く、**仮置き**の値が多い(調査メモに一覧)。

ID は「su-」で始める(独ソ1942年のパックの su_ と重ならないように)。
貫通力は 30° の板の値にそろえる。0°(垂直)の表しかないものは 0.85 倍して 30° の見当にした(ゲームの見立て。30°の板の実質の厚さは 1/cos30° ≒ 1.15 倍)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("su")
W, far = P.W, P.far
TO30 = 0.85


def to30(table):
    return [(d, round(mm * TO30)) for d, mm in table]


# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["su-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["su-semi"] = c.rifle("半自動小銃", c.RE["semi_rifle"])
W["su-smg"] = c.smg("短機関銃")
W["su-lmg"] = c.mg("軽機関銃 DP", c.RE["lmg"])
W["su-hmg"] = c.mg("重機関銃(三脚・車輪)", c.RE["hmg"], tripod=True)
W["su-mg-vehicle"] = c.mg("車載機関銃 DT", c.RE["lmg"])
# 対戦車銃 PTRD・PTRS(14.5mm):40/100・30/500(垂直とは限らない。低。weapons-1942-de-su.md)
W["su-ptrd"] = c.at_weapon("対戦車銃 14.5mm", [40, 30], 100, 500)
# 迫撃砲:50mm RM-38/40 最大800m(中)・弾は TODO(要裏取り):同じ口径の leGrW 36(0.9kg)とほぼ同じとみなして 0.85kg の仮置き。
# 82mm BM-37 弾3.05kg・最大3,040m(中)。120mm PM-38 弾15.7kg・最大5,700m は**仮置き**(検索で確かめられなかった。TODO(要裏取り))
W["su-mortar50"] = c.mortar("50mm 迫撃砲 RM-40", 0.85, 800)
W["su-mortar82"] = c.mortar("82mm 迫撃砲 BM-37", 3.05, 3040)
W["su-mortar120"] = c.mortar("120mm 迫撃砲 PM-38", 15.7, 5700)
W["su-mortar120"]["entrenchmentPierce"] = 0.3
# 76mm 連隊砲 M1927:榴弾 OF-350 6.2kg・最大4,200m(中)。歩兵砲なので曲射の直接射撃(独の leIG 18 と同じ扱い)
W["su-76-regt"] = c.mortar("76mm 連隊砲 M1927", 6.2, 4200)
# 対戦車砲:45mm 53-K(BR-240)垂直 43/500・35/1000(中〜低。weapons-1942-de-su.md)→ 30° に直す
W["su-45mm"] = c.at_gun("45mm 対戦車砲 53-K", 45, to30([(500, 43), (1000, 35)]), far, "su-45mm")
# 戦車砲:76mm F-34(BR-350A、30°)61/500・55/1000(低〜中。weapons-1942-de-su.md)。
# 85mm D-5T・ZiS-S-53:0° で 123/500・105/1000・98/1500(52-K の表、中)→ 30°。122mm D-25T:196/100・179/500(米国の定義、中〜低)→ 30°
PEN76 = [(500, 61), (1000, 55)]
PEN85 = to30([(500, 123), (1000, 105), (1500, 98)])
W["su-f34"] = c.tank_gun("76mm F-34(T-34)", 76, PEN76, far, "su-f34")
W["su-zis5"] = c.tank_gun("76mm ZiS-5(KV-1)", 76, PEN76, far, "su-zis5")
W["su-20k"] = c.tank_gun("45mm 20-K(T-70)", 45, to30([(500, 43), (1000, 35)]), far, "su-20k")
W["su-85"] = c.tank_gun("85mm ZiS-S-53(T-34-85)", 85, PEN85, far, "su-85")
W["su-d25t"] = c.tank_gun("122mm D-25T(IS-2)", 122, to30([(100, 196), (500, 179)]), far, "su-d25t")
W["su-zis3-sp"] = c.tank_gun("76mm ZiS-3(SU-76M)", 76, PEN76, far, "su-zis3-sp", td=True)
W["su-d5s"] = c.tank_gun("85mm D-5S(SU-85)", 85, PEN85, far, "su-d5s", td=True)
# 砲(間接射撃):76mm ZiS-3 榴弾6.2kg・最大13,290m(中〜高)。122mm M-30 榴弾 OF-462 21.76kg・最大11,800m(中)
W["su-zis3"] = c.howitzer("76mm 師団砲 ZiS-3", 6.2, 13290)
W["su-m30"] = c.howitzer("122mm 榴弾砲 M-30", 21.76, 11800)

# ---------------------------------------------------------------- 装備品
item = P.item
Y = c.years
HP = c.VEHICLE_HP

# 小火器(年は広く知られた採用・配備の年。TODO(要裏取り))
item("su-mosin", "モシン・ナガン M1891/30 小銃", "rifle", Y(1930, 1953), [("su-rifle", 1)], specs={"口径 mm": 7.62}, short="モシン")
item("su-svt40", "SVT-40 半自動小銃", "rifle", Y(1940, 1945), [("su-semi", 1)], specs={"口径 mm": 7.62}, short="SVT-40")
item("su-ppd", "PPD-40 短機関銃", "smg", Y(1940, 1942), [("su-smg", 1)], specs={"口径 mm": 7.62}, short="PPD-40")
item("su-ppsh", "PPSh-41 短機関銃", "smg", Y(1941, 1953), [("su-smg", 1)], specs={"口径 mm": 7.62}, desc="大量に作られ、1944年の狙撃兵中隊は1個小隊を短機関銃の小隊にした", short="PPSh-41")
item("su-dp", "DP 軽機関銃", "lmg", Y(1928, 1953), [("su-lmg", 1)], crew=2, desc="赤軍でいちばん多く使われた軽機関銃", short="DP")
item("su-maxim", "マキシム M1910 重機関銃", "hmg", Y(1910, 1945), [("su-hmg", 1)], crew=4, desc="車輪付きの銃架(ソコロフ銃架)", short="マキシム")
item("su-sg43", "SG-43 重機関銃", "hmg", Y(1943, 1953), [("su-hmg", 1)], crew=3, short="SG-43")
item("su-ptrd", "PTRD-41 対戦車銃", "at_rifle", Y(1941, 1945), [("su-ptrd", 1)], crew=2, specs={"貫通 mm/100m": 40}, short="PTRD")
# 迫撃砲・砲
item("su-mortar50", "50mm 迫撃砲 RM-40", "mortar", Y(1940, 1943), [("su-mortar50", 1)], crew=2, specs={"弾 kg": "0.85(仮置き)", "最大射程 m": 800}, desc="1944年には狙撃兵中隊から外された", short="50mm迫")
item("su-mortar82", "82mm 迫撃砲 BM-37", "mortar", Y(1937, 1953), [("su-mortar82", 1)], crew=5, specs={"弾 kg": 3.05, "最大射程 m": 3040}, short="82mm迫")
item("su-mortar120", "120mm 迫撃砲 PM-38", "mortar", Y(1939, 1953), [("su-mortar120", 1)], crew=6, specs={"弾 kg": "15.7(仮置き)", "最大射程 m": "5,700(仮置き)"}, desc="連隊の重迫撃砲。ドイツ軍が写して 12cm GrW 42 にした", short="120mm迫")
item("su-76-regt", "76mm 連隊砲 M1927", "infantry_gun", Y(1928, 1945), [("su-76-regt", 1)], crew=7, specs={"弾 kg": 6.2, "最大射程 m": 4200}, short="76mm 連隊砲")
item("su-45mm", "45mm 対戦車砲 53-K(1937年型)", "at_gun", Y(1937, 1945), [("su-45mm", 1)], crew=6, specs={"貫通 mm/500m(垂直)": 43}, short="45mm 対戦車")
item("su-zis3", "76mm 師団砲 ZiS-3", "field_gun", Y(1942, 1953), [("su-zis3", 1)], crew=7, specs={"弾 kg": 6.2, "最大射程 m": 13290}, desc="対戦車砲としても使った", short="ZiS-3")
item("su-m30", "122mm 榴弾砲 M-30", "howitzer", Y(1939, 1953), [("su-m30", 1)], crew=8, specs={"弾 kg": 21.76, "最大射程 m": 11800}, short="M-30")
# 戦車・自走砲(装甲は実質の厚さ mm。根拠は weapons-1942-de-su.md と equipment-su.md)
item("su-t26", "T-26 軽戦車(1933年型)", "tank", Y(1933, 1942), [("su-20k", 1), ("su-mg-vehicle", 1)], crew=3, hp=HP["light_tank"], armor={"front": 15, "side": 15, "rear": 15, "turretFront": 15, "turretSide": 15}, specs={"弾数": 122}, desc="1941年の赤軍でいちばん多い戦車。装甲は最大13〜15mm(中〜低)。ゲームの wiki の砲塔前面30は使わない", short="T-26")
item("su-bt7", "BT-7 快速戦車", "tank", Y(1935, 1942), [("su-20k", 1), ("su-mg-vehicle", 1)], crew=3, hp=HP["light_tank"], armor={"front": 20, "side": 13, "rear": 13, "turretFront": 15, "turretSide": 15}, desc="装甲は**仮置き**(13〜20mm の幅の表は列の見出しが読めなかった。TODO(要裏取り:Zaloga『BT Fast Tank』))。足が速い", short="BT-7")
item("su-t70", "T-70 軽戦車", "tank", Y(1942, 1943), [("su-20k", 1), ("su-mg-vehicle", 1)], crew=2, hp=HP["light_tank"], armor={"front": 35, "side": 15, "rear": 15, "turretFront": 50, "turretSide": 35}, desc="車体前面は見つからず 35 の仮置き(weapons-1942-de-su.md)", short="T-70")
item("su-t34", "T-34 中戦車(1942年型)", "tank", Y(1941, 1944), [("su-f34", 1), ("su-mg-vehicle", 2)], crew=4, hp=HP["medium_tank"], armor={"front": 90, "side": 53, "rear": 40, "turretFront": 45, "turretSide": 60}, specs={"重量 t": 28}, short="T-34")
item("su-t34-85", "T-34-85 中戦車", "tank", Y(1944, 1953), [("su-85", 1), ("su-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 90, "side": 53, "rear": 40, "turretFront": 90, "turretSide": 75}, specs={"重量 t": 32}, desc="車体は T-34 と同じ 45mm @ 60°。砲塔 90/75(中〜低)。朝鮮戦争で北朝鮮軍の主力", short="T-34-85")
item("su-kv1", "KV-1 重戦車", "tank", Y(1940, 1943), [("su-zis5", 1), ("su-mg-vehicle", 3)], crew=5, hp=HP["heavy_tank"], armor={"front": 75, "side": 75, "rear": 60, "turretFront": 75, "turretSide": 75}, specs={"重量 t": 45}, short="KV-1")
item("su-is2", "IS-2 重戦車", "tank", Y(1944, 1953), [("su-d25t", 1), ("su-mg-vehicle", 3)], crew=4, hp=HP["heavy_tank"], armor={"front": 120, "side": 90, "rear": 60, "turretFront": 100, "turretSide": 90}, specs={"重量 t": 46}, desc="車体前面 120mm(傾斜は型で違う)。砲塔前面は 100 とした(160 とする資料もある)。側面・後面は TODO(要裏取り)。弾が重く発射速度が遅い", short="IS-2")
item("su-su76m", "SU-76M 自走砲", "assault_gun", Y(1943, 1953), [("su-zis3-sp", 1)], crew=4, hp=2.5, armor={"front": 50, "side": 15, "rear": 15}, desc="前面 25mm @ 60°(実質約50、計算)・側面15〜16。オープントップで歩兵の直協に使った", short="SU-76M")
item("su-su85", "SU-85 駆逐戦車", "tank_destroyer", Y(1943, 1945), [("su-d5s", 1)], crew=4, hp=HP["tank_destroyer"], armor={"front": 90, "side": 53, "rear": 40}, desc="T-34 の車体に固定の戦闘室。装甲は T-34 の車体と同じとみなした(TODO(要裏取り))", short="SU-85")
item("su-truck", "トラック(ZiS-5・スチュードベーカー)", "truck", Y(1934, 1953), short="トラック")

# ---------------------------------------------------------------- 編成表
el = P.el
toe = P.toe

# 1942〜43年の狙撃兵連隊(1942年12月10日の 04/550 の系統。3個大隊)。
# 狙撃兵中隊は 04/551(1942年12月10日):7名+136名=143名、小銃小隊3(1+39名、分隊4)、50mm 迫撃砲2(中:bayonetstrength の表の要約)。マキシム1(中〜低)。
# DP 12(分隊に1)・PPSh の数・大隊の機関銃中隊・迫撃砲中隊・45mm・対戦車銃の数は TODO(要裏取り:04/551 の原文、bayonetstrength『Organization of the Red Army Rifle Battalion 1941 to 1945』)。
# 連隊直轄の 76mm 連隊砲4・45mm 6・120mm 7(中:wargameds の 04/550 の読み)
toe(
    "su-rifle-regt-1942",
    "狙撃兵連隊(ソ1942〜43)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 120, [("su-mosin", 90), ("su-ppsh", 20)], "連隊本部"),
        el("狙撃兵中隊", 9, 143, [("su-mosin", 110), ("su-ppsh", 20), ("su-dp", 12), ("su-maxim", 1), ("su-mortar50", 2)], "大隊", 3),
        el("機関銃中隊", 3, 60, [("su-mosin", 45), ("su-maxim", 9)], "大隊", 3),
        el("迫撃砲中隊(82mm)", 3, 60, [("su-mosin", 45), ("su-mortar82", 9)], "大隊", 3),
        el("対戦車小隊(45mm・対戦車銃)", 3, 40, [("su-mosin", 25), ("su-45mm", 2), ("su-ptrd", 9)], "大隊", 3),
        el("連隊砲中隊(76mm)", 1, 70, [("su-mosin", 45), ("su-76-regt", 4)], "連隊直轄"),
        el("対戦車中隊(45mm)", 1, 60, [("su-mosin", 40), ("su-45mm", 6)], "連隊直轄"),
        el("迫撃砲中隊(120mm)", 1, 80, [("su-mosin", 55), ("su-mortar120", 7)], "連隊直轄"),
        el("対戦車銃中隊", 1, 80, [("su-mosin", 40), ("su-ptrd", 27)], "連隊直轄"),
    ],
)

# 1944年の狙撃兵連隊。1944年の初めに中隊の小銃小隊の1つを短機関銃の小隊にし(中:battleorder)、50mm 迫撃砲を外した(中)。
# 人員・DP・SG-43 の数は TODO(要裏取り:04/551 の1944年の改定)。中隊の人員は1942年と同じとした(実際は欠員が多い)
toe(
    "su-rifle-regt-1944",
    "狙撃兵連隊(ソ1944〜45)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 120, [("su-mosin", 80), ("su-ppsh", 30)], "連隊本部"),
        el("狙撃兵中隊(短機関銃小隊1)", 9, 143, [("su-mosin", 80), ("su-svt40", 5), ("su-ppsh", 50), ("su-dp", 12), ("su-sg43", 1)], "大隊", 3),
        el("機関銃中隊", 3, 60, [("su-mosin", 40), ("su-ppsh", 5), ("su-sg43", 9)], "大隊", 3),
        el("迫撃砲中隊(82mm)", 3, 60, [("su-mosin", 45), ("su-mortar82", 9)], "大隊", 3),
        el("対戦車小隊(45mm・対戦車銃)", 3, 40, [("su-mosin", 25), ("su-45mm", 2), ("su-ptrd", 9)], "大隊", 3),
        el("連隊砲中隊(76mm)", 1, 70, [("su-mosin", 45), ("su-76-regt", 4)], "連隊直轄"),
        el("対戦車中隊(45mm)", 1, 60, [("su-mosin", 40), ("su-45mm", 6)], "連隊直轄"),
        el("迫撃砲中隊(120mm)", 1, 80, [("su-mosin", 55), ("su-mortar120", 7)], "連隊直轄"),
        el("対戦車銃中隊", 1, 80, [("su-mosin", 40), ("su-ptrd", 27)], "連隊直轄"),
    ],
)

# 1942年7月の戦車旅団(010/270):T-34 32・T-70 21・自動車化狙撃兵大隊(低〜中。weapons-1942-de-su.md)。中隊の両数の分け方は TODO
toe(
    "su-tank-bde-1942",
    "戦車旅団(T-34・T-70・ソ1942)",
    "armor_combat_command",
    [
        el("旅団本部(戦車)", 1, 30, [("su-t34", 2)], "旅団本部"),
        el("中戦車中隊(T-34)", 3, 45, [("su-t34", 10)], "戦車大隊"),
        el("軽戦車中隊(T-70)", 2, 30, [("su-t70", 10)], "戦車大隊"),
        el("軽戦車(旅団本部付き)", 1, 2, [("su-t70", 1)], "旅団本部"),
        el("自動車化狙撃兵大隊", 1, 400, [("su-mosin", 250), ("su-ppsh", 80), ("su-dp", 18), ("su-maxim", 4), ("su-mortar82", 6), ("su-ptrd", 18), ("su-truck", 20)], "直轄"),
    ],
)
# 1944年の戦車旅団(T-34-85):戦車大隊3 × 21両+本部2 = 65両(TODO(要裏取り):1943年11月の 010/500。数は広く引かれる値)・自動車化狙撃兵大隊
toe(
    "su-tank-bde-1944",
    "戦車旅団(T-34-85・ソ1944)",
    "armor_combat_command",
    [
        el("旅団本部(戦車)", 1, 30, [("su-t34-85", 2)], "旅団本部"),
        el("戦車大隊(T-34-85)", 3, 110, [("su-t34-85", 21)], "戦車大隊"),
        el("自動車化狙撃兵大隊", 1, 500, [("su-mosin", 250), ("su-ppsh", 180), ("su-dp", 18), ("su-sg43", 4), ("su-mortar82", 6), ("su-ptrd", 18), ("su-truck", 25)], "直轄"),
    ],
    echelon="brigade",
)
# 重戦車連隊(IS-2):21両(中隊4 × 5+連隊長車1。TODO(要裏取り))。親衛重戦車連隊
toe(
    "su-heavy-tank-regt-1944",
    "親衛重戦車連隊(IS-2・ソ1944)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 20, [("su-is2", 1)], "連隊本部"),
        el("重戦車中隊(IS-2)", 4, 22, [("su-is2", 5)], "中隊"),
    ],
    echelon="regiment",
)
# 自走砲連隊(SU-76M):21両(中隊4 × 5+1。TODO(要裏取り))。歩兵師団の直協に使った
toe(
    "su-sp-regt-su76",
    "自走砲連隊(SU-76M・ソ1944)",
    "tank_destroyer_battalion",
    [
        el("連隊本部", 1, 20, [("su-su76m", 1)], "連隊本部"),
        el("自走砲中隊(SU-76M)", 4, 22, [("su-su76m", 5)], "中隊"),
    ],
    echelon="regiment",
    modifiers=["armored"],
)
toe(
    "su-sp-regt-su85",
    "自走砲連隊(SU-85・ソ1944)",
    "tank_destroyer_battalion",
    [
        el("連隊本部", 1, 20, [("su-su85", 1)], "連隊本部"),
        el("自走砲中隊(SU-85)", 4, 22, [("su-su85", 4)], "中隊"),
    ],
    echelon="regiment",
    modifiers=["armored"],
)
# 砲兵大隊:3個中隊 × 4門(人員は TODO(要裏取り))
toe(
    "su-art-bn-zis3",
    "砲兵大隊(ZiS-3・ソ)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 50, [("su-mosin", 40)], "大隊本部"),
        el("砲兵中隊(76mm)", 3, 80, [("su-mosin", 60), ("su-dp", 1), ("su-zis3", 4)], "中隊"),
    ],
)
toe(
    "su-art-bn-m30",
    "榴弾砲大隊(M-30・ソ)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 50, [("su-mosin", 40)], "大隊本部"),
        el("砲兵中隊(122mm)", 3, 95, [("su-mosin", 70), ("su-dp", 1), ("su-m30", 4)], "中隊"),
    ],
)

# ---- 1941年(根拠は equipment-su.md の「1941年」の節)----
# 1941年4月5日の 04/401 の狙撃兵連隊。小銃小隊は分隊ごとに DP 1(小隊に4)、中隊に機関銃小隊があった(7月の縮小版で小隊2・機関銃小隊なしに減った。中:
# Journal of Slavic Military Studies の論文の要約)。中隊の人員・マキシムの数・大隊と連隊の砲の数は TODO(要裏取り:04/401 の原文、
# operationbarbarossa.net の「TOE for Soviet Land Combat Units 1941」)。形は1942年の連隊に合わせた
toe(
    "su-rifle-regt-1941",
    "狙撃兵連隊(ソ1941年4月)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 150, [("su-mosin", 110), ("su-ppd", 10)], "連隊本部"),
        el("狙撃兵中隊", 9, 160, [("su-mosin", 120), ("su-svt40", 15), ("su-ppd", 4), ("su-dp", 12), ("su-maxim", 2), ("su-mortar50", 2)], "大隊", 3),
        el("機関銃中隊", 3, 60, [("su-mosin", 45), ("su-maxim", 9)], "大隊", 3),
        el("迫撃砲中隊(82mm)", 3, 60, [("su-mosin", 45), ("su-mortar82", 6)], "大隊", 3),
        el("対戦車小隊(45mm)", 3, 30, [("su-mosin", 20), ("su-45mm", 2)], "大隊", 3),
        el("連隊砲中隊(76mm)", 1, 70, [("su-mosin", 45), ("su-76-regt", 6)], "連隊直轄"),
        el("対戦車中隊(45mm)", 1, 60, [("su-mosin", 40), ("su-45mm", 6)], "連隊直轄"),
        el("迫撃砲中隊(120mm)", 1, 80, [("su-mosin", 55), ("su-mortar120", 4)], "連隊直轄"),
    ],
)
# 1941年の軽戦車大隊(T-26)。中隊の数・両数は TODO(要裏取り:Zaloga『T-26 Light Tank』、Drig)。中隊10両 × 3+本部1 で置いた
toe(
    "su-lt-tank-bn-1941",
    "軽戦車大隊(T-26・ソ1941)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 10, [("su-t26", 1)], "大隊本部"),
        el("軽戦車中隊(T-26)", 3, 35, [("su-t26", 10)], "中隊"),
    ],
)
toe(
    "su-bt-tank-bn-1941",
    "快速戦車大隊(BT-7・ソ1941)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 10, [("su-bt7", 1)], "大隊本部"),
        el("快速戦車中隊(BT-7)", 3, 35, [("su-bt7", 10)], "中隊"),
    ],
)

W_NOTES = (
    "ソ連軍の武器(1丁・1門・1両あたり)と装備品の一覧。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "射程・貫通力・装甲・年の根拠は docs/research/equipment-su.md(検索結果の要約による二次資料。仮置きの値が多い)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_su.py"
)
T_NOTES = (
    "ソ連軍の実数の編成表(人員・装備品で書く)。1942〜43年・1944〜45年。根拠は docs/research/equipment-su.md。中隊・大隊の装備の数の多くは "
    "TODO(要裏取り)(shtat の原文を確かめていない)。作り直しは tools/packs/build_su.py"
)
P.write(W_NOTES, T_NOTES)
