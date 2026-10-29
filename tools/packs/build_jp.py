#!/usr/bin/env python3
"""
日本陸軍の装備品パックと実数の編成パック(data/weapons/jp.json・data/toe/jp.json)を作る。

    python3 tools/packs/build_jp.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
1丁・1両あたりの威力は tools/packs/equipment_common.py の物差し(docs/research/equipment-calibration.md)。
根拠と信頼度は docs/research/equipment-jp.md(多くは pacific-weapons-1941-45.md の値を流用)。
この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。**仮置き**の値は調査メモに一覧。

ID は「jp-」で始める(太平洋のパックの jp_ と重ならないように)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("jp")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["jp-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["jp-lmg"] = c.mg("軽機関銃(弾倉式)", c.RE["lmg"])
# 九二式重機関銃:毎分450〜500発と遅く、30発の保弾板で給弾(オチキスの系統)。重機関銃の 0.9 倍(米のオチキスと同じ見立て)
W["jp-hmg"] = c.mg("重機関銃 九二式(三脚)", c.RE["hmg"] * 0.9, tripod=True)
W["jp-mg-vehicle"] = c.mg("車載機関銃", c.RE["lmg"])
# 九七式自動砲(20mm):垂直で 30/250m(中)、20/700m(ww2db。低)
W["jp-type97-atr"] = c.at_weapon("九七式自動砲(20mm)", [30, 20], 250, 700)
# 八九式重擲弾筒:八九式榴弾の弾薬 0.79kg(中)・最大670m(中〜高)。曲射の直接射撃(迫撃砲と同じ扱い)
W["jp-knee-mortar"] = c.mortar("八九式重擲弾筒(50mm)", 0.79, 670)
# 九二式歩兵砲(大隊砲):榴弾 4.48kg(中)・最大2,785m(中)。四一式山砲(連隊砲):最大7,022m(中)・弾は**仮置き** 6.0kg
# (同じ 75mm 山砲の米 M48 の 6.24kg に近いとみなした。TODO(要裏取り))。どちらも歩兵の砲なので曲射の直接射撃(独の leIG 18 と同じ扱い)
W["jp-type92-bn-gun"] = c.mortar("九二式歩兵砲(70mm)", 4.48, 2785)
W["jp-type41-mtn"] = c.mortar("四一式山砲(75mm・連隊砲)", 6.0, 7022)
# 速射砲:九四式三十七粍砲 約40/500m・30/1000m(角度不明。低)。一式四十七粍速射砲:一式中戦車の項の戦車砲の値 55/100m・40/500m・30/1000m(中〜低)
# (0°で 67/500m とするゲームの値より低い方)
PEN37 = [(500, 40), (1000, 30)]
PEN47 = [(100, 55), (500, 40), (1000, 30)]
W["jp-type94-37"] = c.at_gun("九四式三十七粍砲", 37, PEN37, far, "jp-type94-37")
W["jp-type1-47"] = c.at_gun("一式機動四十七粍速射砲", 47, PEN47, far, "jp-type1-47")
# 戦車砲:九五式軽戦車の 37mm 36/275m・25/500m(中〜低)。九七式五糎七 約25/1000m(低。短砲身で榴弾が主)。一式四十七粍戦車砲は速射砲と同じ表
W["jp-type94-tank37"] = c.tank_gun("九四式三十七粍戦車砲(九五式軽戦車)", 37, [(275, 36), (500, 25)], far, "jp-type94-tank37")
W["jp-type97-57"] = c.tank_gun("九七式五糎七戦車砲(九七式中戦車)", 57, [(1000, 25)], far, "jp-type97-57")
# 三式七糎半戦車砲(三式中戦車):徹甲弾 6.6kg で 90/100m・65/1000m(historyofwar。tanks-encyclopedia はもっと低い 61〜76mm/685〜1,370m。中〜低)
W["jp-type3-75"] = c.tank_gun("三式七糎半戦車砲(三式中戦車)", 75, [(100, 90), (1000, 65)], far, "jp-type3-75")
W["jp-type1-tank47"] = c.tank_gun("一式四十七粍戦車砲(新砲塔チハ)", 47, PEN47, far, "jp-type1-tank47")

# ---------------------------------------------------------------- 装備品
item = P.item
Y = c.years
HP = c.VEHICLE_HP

item("jp-type38", "三八式歩兵銃", "rifle", Y(1906, 1945), [("jp-rifle", 1)], specs={"口径 mm": 6.5, "有効射程 m": "366〜457"}, short="三八式")
item("jp-type99", "九九式小銃", "rifle", Y(1939, 1945), [("jp-rifle", 1)], specs={"口径 mm": 7.7}, desc="三八式より弾が重い。行き渡らず、終戦まで三八式と混ざった(割合は TODO(要裏取り))", short="九九式")
item("jp-type96-lmg", "九六式軽機関銃", "lmg", Y(1936, 1945), [("jp-lmg", 1)], crew=2, specs={"口径 mm": 6.5, "発射速度 発/分": 550}, short="九六式軽機")
item("jp-type99-lmg", "九九式軽機関銃", "lmg", Y(1939, 1945), [("jp-lmg", 1)], crew=2, specs={"口径 mm": 7.7, "発射速度 発/分": "700〜850"}, short="九九式軽機")
item("jp-type92-hmg", "九二式重機関銃", "hmg", Y(1932, 1945), [("jp-hmg", 1)], crew=6, specs={"口径 mm": 7.7, "発射速度 発/分": "450〜500"}, desc="発射音が遅く、米兵は「キツツキ」と呼んだ", short="九二式重機")
item("jp-type97-atr", "九七式自動砲", "at_rifle", Y(1938, 1945), [("jp-type97-atr", 1)], crew=4, specs={"口径 mm": 20, "貫通 mm/250m(垂直)": 30}, desc="重さ約50kg(防楯つき68kg)", short="九七式自動砲")
item("jp-knee-mortar", "八九式重擲弾筒", "mortar", Y(1929, 1945), [("jp-knee-mortar", 1)], crew=2, specs={"口径 mm": 50, "最大射程 m": 670}, desc="小隊に擲弾筒分隊1個(3筒)。軽く、日本の歩兵の小隊の火力の柱", short="擲弾筒")
item("jp-type92-bn-gun", "九二式歩兵砲", "infantry_gun", Y(1932, 1945), [("jp-type92-bn-gun", 1)], crew=5, specs={"口径 mm": 70, "弾 kg": 4.48, "最大射程 m": 2785}, desc="大隊砲。重さ約212kg で分解して運べた", short="大隊砲")
item("jp-type41-mtn", "四一式山砲", "infantry_gun", Y(1908, 1945), [("jp-type41-mtn", 1)], crew=7, specs={"口径 mm": 75, "弾 kg": "6.0(仮置き)", "最大射程 m": 7022}, desc="九四式山砲に替わったあと、歩兵連隊の連隊砲になった", short="連隊砲")
item("jp-type94-37", "九四式三十七粍砲", "at_gun", Y(1936, 1945), [("jp-type94-37", 1)], crew=11, specs={"貫通 mm/500m": "約40"}, short="37mm 速射砲")
item("jp-type1-47", "一式機動四十七粍速射砲", "at_gun", Y(1942, 1945), [("jp-type1-47", 1)], crew=11, specs={"貫通 mm/500m": 40}, short="47mm 速射砲")
# 戦車(装甲は実質の厚さ mm)
item("jp-hago", "九五式軽戦車(ハ号)", "tank", Y(1936, 1945), [("jp-type94-tank37", 1), ("jp-mg-vehicle", 2)], crew=3, hp=HP["light_tank"], armor={"front": 12, "side": 12, "rear": 12, "turretFront": 12, "turretSide": 12}, specs={"重量 t": 7.4}, desc="装甲 12mm(中〜低。pacific-weapons-1941-45.md)。ボーイズ対戦車銃でも近くなら抜ける", short="九五式軽戦車")
item("jp-chiha", "九七式中戦車(チハ)", "tank", Y(1938, 1945), [("jp-type97-57", 1), ("jp-mg-vehicle", 2)], crew=4, hp=HP["medium_tank"], armor={"front": 25, "side": 20, "rear": 20, "turretFront": 33, "turretSide": 26}, specs={"重量 t": 15}, desc="車体前面25・側面20、砲塔は防盾33・側面26(資料で幅がある。中〜低)。短砲身の57mm は歩兵の支援が主", short="チハ")
item("jp-chiha-kai", "九七式中戦車改(新砲塔チハ)", "tank", Y(1942, 1945), [("jp-type1-tank47", 1), ("jp-mg-vehicle", 2)], crew=4, hp=HP["medium_tank"], armor={"front": 25, "side": 20, "rear": 20, "turretFront": 33, "turretSide": 26}, specs={"重量 t": 15.8}, desc="47mm の長い砲に積み替えた。新しい砲塔の厚さは見つからず、旧い砲塔と同じにした(仮置き)", short="新砲塔チハ")
item("jp-chihe", "一式中戦車(チヘ)", "tank", Y(1943, 1945), [("jp-type1-tank47", 1), ("jp-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 50, "side": 25, "rear": 20, "turretFront": 50, "turretSide": 25}, specs={"重量 t": 17.2}, desc="新砲塔チハと同じ 47mm で、装甲を前面50mm に厚くした(中〜低:ゲームの wiki と一致)。本土決戦のために温存された", short="チヘ")
item("jp-chinu", "三式中戦車(チヌ)", "tank", Y(1944, 1945), [("jp-type3-75", 1), ("jp-mg-vehicle", 1)], crew=5, hp=HP["medium_tank"], armor={"front": 50, "side": 20, "rear": 20, "turretFront": 50, "turretSide": 25}, specs={"重量 t": 18.8}, desc="九〇式野砲を元にした 75mm を積んだ。側面は 20mm と 25mm の資料があり、薄い方。実戦には出なかったとされる(中)", short="チヌ")
item("jp-truck", "九四式六輪自動貨車", "truck", Y(1934, 1945), desc="年・名前は TODO(要裏取り)", short="トラック")

# ---------------------------------------------------------------- 編成表
el = P.el
toe = P.toe

# 1941〜42年の歩兵連隊(3個大隊)。中隊 181名・小銃139・軽機9・擲弾筒9(TM-E 30-480 1944年版の (B) type。中)、
# 大隊は中隊4+機関銃中隊(九二式 12。中〜低)+大隊砲小隊(九二式歩兵砲 2。中)で約1,100名(中)。
# 連隊砲中隊 四一式山砲4・約122名(中。6門とする資料もある)、速射砲中隊 37mm 6(中)。本部・機関銃中隊・大隊砲小隊の人員の内訳は TODO(要裏取り)
toe(
    "jp-inf-regt-1941",
    "歩兵連隊(日本1941〜42)",
    "infantry_regiment",
    [
        el("連隊本部", 1, 150, [("jp-type38", 120)], "連隊本部"),
        el("大隊本部", 3, 60, [("jp-type38", 45)], "大隊", 3),
        el("歩兵中隊", 12, 181, [("jp-type38", 139), ("jp-type96-lmg", 9), ("jp-knee-mortar", 9)], "大隊", 3),
        el("機関銃中隊", 3, 230, [("jp-type38", 150), ("jp-type92-hmg", 12)], "大隊", 3),
        el("大隊砲小隊", 3, 55, [("jp-type38", 40), ("jp-type92-bn-gun", 2)], "大隊", 3),
        el("連隊砲中隊", 1, 122, [("jp-type38", 90), ("jp-type41-mtn", 4)], "連隊直轄"),
        el("速射砲中隊", 1, 110, [("jp-type38", 70), ("jp-type94-37", 6)], "連隊直轄"),
    ],
)
# 1941〜42年の歩兵大隊:1941年の連隊の大隊1つ分(大隊本部・中隊4・機関銃中隊・大隊砲小隊。約1,100名とする資料に近い。中)
_r41 = P.T["jp-inf-regt-1941"]["elements"]
toe(
    "jp-inf-bn-1941",
    "歩兵大隊(日本1941〜42)",
    "infantry_battalion",
    [{**e, "count": e["count"] // 3, "group": "大隊", "groupCount": 1} for e in _r41 if e.get("group") == "大隊"],
)

# 1944年の歩兵連隊:九九式小銃・九九式軽機と一式47mm に替わった形(換わり方の割合と、1944年の定数は TODO(要裏取り))。
# 中隊・大隊の形は1941年と同じとした。九七式自動砲は大隊の対戦車に1〜2挺ずつあったとされる(数は TODO)
toe(
    "jp-inf-regt-1944",
    "歩兵連隊(日本1944)",
    "infantry_regiment",
    [
        el("連隊本部", 1, 150, [("jp-type99", 120)], "連隊本部"),
        el("大隊本部", 3, 60, [("jp-type99", 45), ("jp-type97-atr", 2)], "大隊", 3),
        el("歩兵中隊", 12, 181, [("jp-type99", 139), ("jp-type99-lmg", 9), ("jp-knee-mortar", 9)], "大隊", 3),
        el("機関銃中隊", 3, 230, [("jp-type99", 150), ("jp-type92-hmg", 12)], "大隊", 3),
        el("大隊砲小隊", 3, 55, [("jp-type99", 40), ("jp-type92-bn-gun", 2)], "大隊", 3),
        el("連隊砲中隊", 1, 122, [("jp-type99", 90), ("jp-type41-mtn", 4)], "連隊直轄"),
        el("速射砲中隊", 1, 110, [("jp-type99", 70), ("jp-type1-47", 6)], "連隊直轄"),
    ],
)
# 1941年の戦車連隊:軽戦車中隊1(九五式10)・中戦車中隊3(九七式10+九五式2)(戦車第23連隊の例と TM-E 30-480 の記述B を合わせた形。中〜低)。
# 本部の両数・人員は TODO(要裏取り:Niehorster の戦車団の表、『戦史叢書 マレー進攻作戦』)
toe(
    "jp-tank-regt-1941",
    "戦車連隊(九七式中戦車・日本1941)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 30, [("jp-chiha", 2), ("jp-hago", 1)], "連隊本部"),
        el("軽戦車中隊(九五式)", 1, 50, [("jp-hago", 10)], "中隊"),
        el("中戦車中隊(九七式)", 3, 70, [("jp-chiha", 10), ("jp-hago", 2)], "中隊"),
    ],
    echelon="regiment",
)
toe(
    "jp-tank-regt-1944",
    "戦車連隊(新砲塔チハ・日本1944)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 30, [("jp-chiha-kai", 2), ("jp-hago", 1)], "連隊本部"),
        el("軽戦車中隊(九五式)", 1, 50, [("jp-hago", 10)], "中隊"),
        el("中戦車中隊(新砲塔チハ)", 3, 70, [("jp-chiha-kai", 10), ("jp-hago", 2)], "中隊"),
    ],
    echelon="regiment",
)
# 独立速射砲大隊(一式47mm):中隊3 × 6門(TODO(要裏取り))
toe(
    "jp-at-bn-1944",
    "独立速射砲大隊(一式47mm・日本1944)",
    "tank_destroyer_battalion",
    [
        el("大隊本部", 1, 40, [("jp-type99", 30)], "大隊本部"),
        el("速射砲中隊", 3, 110, [("jp-type99", 70), ("jp-type1-47", 6)], "中隊"),
    ],
    modifiers=[],
)

# 1945年の本土決戦の戦車連隊(三式中戦車・一式中戦車)。中隊・両数の内訳は TODO(要裏取り:『戦史叢書 本土決戦準備』、Zaloga『Japanese Tanks 1939–45』)。
# 1941〜44年の連隊の形(軽戦車中隊1・中戦車中隊3)で置いた**仮置き**
toe(
    "jp-tank-regt-1945",
    "戦車連隊(三式・一式中戦車・日本1945)",
    "tank_battalion",
    [
        el("連隊本部(戦車)", 1, 30, [("jp-chinu", 2), ("jp-hago", 1)], "連隊本部"),
        el("軽戦車中隊(九五式)", 1, 50, [("jp-hago", 10)], "中隊"),
        el("中戦車中隊(三式)", 1, 70, [("jp-chinu", 10), ("jp-hago", 2)], "中隊"),
        el("中戦車中隊(一式)", 2, 70, [("jp-chihe", 10), ("jp-hago", 2)], "中隊"),
    ],
    echelon="regiment",
)

W_NOTES = (
    "日本陸軍の武器(1丁・1門・1両あたり)と装備品の一覧。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "射程・貫通力・装甲・年の根拠は docs/research/equipment-jp.md(検索結果の要約による二次資料。仮置きの値あり)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_jp.py"
)
T_NOTES = (
    "日本陸軍の実数の編成表(人員・装備品で書く)。1941〜42年・1944年。根拠は docs/research/equipment-jp.md。甲・乙の違い、1944年の定数、本部の人員などは "
    "TODO(要裏取り)。作り直しは tools/packs/build_jp.py"
)
P.write(W_NOTES, T_NOTES)
