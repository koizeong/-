#!/usr/bin/env python3
"""
フランス軍の装備品パックと実数の編成パック(data/weapons/fr.json・data/toe/fr.json)を作る。1918年・1940年。

    python3 tools/packs/build_fr.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
根拠と信頼度は docs/research/equipment-fr.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。**仮置き**の値が多い。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("fr")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["fr-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
# ショーシャ:故障が多いとされる。自動小銃の 3/4(米のパックと同じ見立て)
W["fr-chauchat"] = c.rifle("軽機関銃 ショーシャ", c.RE["auto_rifle"] * 0.75, max_range_m=600)
W["fr-fm2429"] = c.mg("軽機関銃 FM 24/29", c.RE["lmg"])
# オチキス M1914:保弾板の給弾で持続射撃が劣る。重機関銃の 0.9 倍(米・日のパックと同じ見立て)
W["fr-hotchkiss"] = c.mg("重機関銃 オチキス M1914(三脚)", c.RE["hmg"] * 0.9, tripod=True)
W["fr-mg-vehicle"] = c.mg("車載機関銃", c.RE["lmg"])
# 迫撃砲:米の 60mm M2・81mm M1 はブラントの迫撃砲の写し(中)→ 同じ値(60mm 1.24kg・1,815m、81mm 3.12kg(TODO)・3,000m)
W["fr-mortar60"] = c.mortar("60mm 迫撃砲 ブラント Mle 1935", 1.24, 1815)
W["fr-mortar81"] = c.mortar("81mm 迫撃砲 ブラント Mle 27/31", 3.12, 3000)
# 25mm 対戦車砲 SA 34:「40mm の装甲も抜けた」とする記述だけ(低)→ 40/500m・30/1000m の**仮置き**
W["fr-25mm"] = c.at_gun("25mm 対戦車砲 SA 34", 37, [(500, 40), (1000, 30)], far, "fr-25mm")
# 47mm 戦車砲 SA 35:400m で 50mm(フランスの試験。中〜低)。SA 34 は 35/400m。37mm SA 38 は表がなく 30/500m の**仮置き**
W["fr-47-sa35"] = c.tank_gun("47mm SA 35(S35・B1 bis)", 47, [(400, 50), (1000, 40)], far, "fr-47-sa35")
W["fr-37-sa38"] = c.tank_gun("37mm SA 38(H39)", 37, [(500, 30)], far, "fr-37-sa38")
# シュナイダー CA1 の短砲身 75mm(ブロックハウス砲):榴弾を近くに撃つ。弾は Mle 1897 と同じ 5.3kg・射程 600m とした**仮置き**(TODO(要裏取り))
W["fr-75-short"] = c.mortar("75mm 短砲身(シュナイダー CA1)", 5.3, 600)
# 75mm 野砲 Mle 1897:榴弾 5.3〜5.4kg・有効 8,500m(中:Wikipedia)
W["fr-75-1897"] = c.howitzer("75mm 野砲 Mle 1897", 5.3, 8500)

item = P.item
Y = c.years
HP = c.VEHICLE_HP

item("fr-lebel", "ルベル M1886 小銃", "rifle", Y(1887, 1940), [("fr-rifle", 1)], specs={"口径 mm": 8}, desc="年は TODO(要裏取り)", short="ルベル")
item("fr-mas36", "MAS 36 小銃", "rifle", Y(1937, 1953), [("fr-rifle", 1)], specs={"口径 mm": 7.5}, desc="1940年にはまだ行き渡っておらず、ルベル・ベルティエが多かった(割合は TODO)", short="MAS 36")
item("fr-chauchat", "ショーシャ M1915 軽機関銃", "lmg", Y(1916, 1918), [("fr-chauchat", 1)], crew=2, short="ショーシャ")
item("fr-fm2429", "FM 24/29 軽機関銃", "lmg", Y(1929, 1953), [("fr-fm2429", 1)], crew=2, desc="分隊に1挺", short="FM 24/29")
item("fr-hotchkiss", "オチキス M1914 重機関銃", "hmg", Y(1914, 1945), [("fr-hotchkiss", 1)], crew=4, short="オチキス")
item("fr-mortar60", "60mm 迫撃砲 ブラント Mle 1935", "mortar", Y(1935, 1945), [("fr-mortar60", 1)], crew=4, desc="米の 60mm M2 の元になった", short="60mm迫")
item("fr-mortar81", "81mm 迫撃砲 ブラント Mle 27/31", "mortar", Y(1931, 1945), [("fr-mortar81", 1)], crew=6, desc="米の 81mm M1 など、多くの国が写した", short="81mm迫")
item("fr-25mm", "25mm 対戦車砲 SA 34", "at_gun", Y(1934, 1940), [("fr-25mm", 1)], crew=6, desc="軽い対戦車砲。貫通力は**仮置き**", short="25mm 対戦車")
item("fr-75-1897", "75mm 野砲 Mle 1897", "field_gun", Y(1898, 1945), [("fr-75-1897", 1)], crew=6, specs={"弾 kg": "5.3〜5.4", "有効射程 m": 8500}, desc="初めての本格的な速射野砲。米軍も使った", short="75mm 野砲")
item("fr-ca1", "シュナイダー CA1 戦車", "tank", Y(1917, 1918), [("fr-75-short", 1), ("fr-mg-vehicle", 2)], crew=6, hp=HP["light_tank"], armor={"front": 11, "side": 11, "rear": 11}, specs={"重量 t": 13.5}, desc="フランス初の戦車。装甲 11〜11.5mm(のちに 5.5mm の間隔装甲を足した。中:historyofwar)。右前の張り出しに短砲身の 75mm。主な役目は機関銃座を潰すこと", short="CA1")
item("fr-s35", "ソミュア S35 騎兵戦車", "tank", Y(1936, 1940), [("fr-47-sa35", 1), ("fr-mg-vehicle", 1)], crew=3, hp=HP["medium_tank"], armor={"front": 47, "side": 40, "rear": 40, "turretFront": 42, "turretSide": 40}, specs={"重量 t": 19.5}, desc="前面47・砲塔前面42・側面40(中:Wikipedia)。後面は**仮置き**。1人用の砲塔で、車長が砲も扱った", short="S35")
item("fr-b1bis", "ルノー B1 bis 重戦車", "tank", Y(1937, 1940), [("fr-47-sa35", 1), ("fr-mg-vehicle", 2)], crew=4, hp=HP["heavy_tank"], armor={"front": 60, "side": 60, "rear": 60, "turretFront": 60, "turretSide": 60}, specs={"重量 t": 31}, desc="装甲60mm(中)。車体の 75mm 榴弾砲は表がないので入れていない(TODO)", short="B1 bis")
item("fr-h39", "オチキス H39 軽戦車", "tank", Y(1939, 1940), [("fr-37-sa38", 1), ("fr-mg-vehicle", 1)], crew=2, hp=HP["light_tank"], armor={"front": 40, "side": 40, "rear": 40, "turretFront": 40, "turretSide": 40}, desc="装甲40mm(砲塔45 とする資料もある。中〜低)。37mm SA 38 の貫通力は**仮置き**", short="H39")

el = P.el
toe = P.toe

# 1940年の歩兵連隊:約3,090名(中:Lehmann『1939-1940 French Armament』)、軽機関銃 FM 24/29 105(同)。大隊=小銃中隊3+支援中隊(オチキス16・25mm 2・60mm 3・81mm 2)(中)。
# 連隊の重火器中隊=25mm 6(3門の小隊2)・81mm 2(中:littlewars)。小銃中隊は分隊に FM 1 で9とした。人員は TODO(要裏取り)
toe(
    "fr-ir-1940",
    "歩兵連隊(仏1940)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 250, [("fr-mas36", 100), ("fr-lebel", 120)], "連隊本部"),
        el("小銃中隊", 9, 190, [("fr-mas36", 70), ("fr-lebel", 100), ("fr-fm2429", 9)], "大隊", 3),
        el("支援中隊", 3, 230, [("fr-lebel", 180), ("fr-fm2429", 8), ("fr-hotchkiss", 16), ("fr-25mm", 2), ("fr-mortar60", 3), ("fr-mortar81", 2)], "大隊", 3),
        el("重火器中隊", 1, 150, [("fr-lebel", 120), ("fr-25mm", 6), ("fr-mortar81", 2)], "連隊直轄"),
    ],
)
# 1918年の歩兵連隊:3個大隊 × 中隊4+機関銃中隊。中隊のショーシャ8・機関銃中隊のオチキス8は**仮置き**(TODO(要裏取り):
# 1918年の編制表、Bruce『Machine Guns of World War I』)。小銃擲弾(VB)・37mm 歩兵砲は入れていない
toe(
    "fr-ir-1918",
    "歩兵連隊(仏1918)",
    "infantry_regiment",
    [
        el("連隊本部", 1, 150, [("fr-lebel", 130)], "連隊本部"),
        el("歩兵中隊", 9, 190, [("fr-lebel", 170), ("fr-chauchat", 8)], "大隊", 3),
        el("機関銃中隊", 3, 110, [("fr-lebel", 90), ("fr-hotchkiss", 8)], "大隊", 3),
    ],
)
# 1918年の戦車大隊の一部(カンティニーに来た第5戦車大隊のシュナイダー)。両数12は確かめられず**仮置き**(TODO(要裏取り))
toe(
    "fr-ca1-grp-1918",
    "戦車中隊群(シュナイダー CA1・仏1918)",
    "tank_battalion",
    [el("戦車中隊(シュナイダー)", 3, 30, [("fr-ca1", 4)], "中隊")],
)

# 1940年の戦車:中隊の数・両数は**仮置き**(TODO(要裏取り):Zaloga『French Tanks of World War II』、littlewars の戦闘序列)
toe(
    "fr-s35-sqn-grp-1940",
    "騎兵戦車大隊(S35・仏1940)",
    "tank_battalion",
    [
        el("本部(戦車)", 1, 15, [("fr-s35", 2)], "本部"),
        el("戦車中隊(S35)", 2, 60, [("fr-s35", 20)], "中隊"),
    ],
)
toe(
    "fr-b1-bn-1940",
    "戦車大隊(B1 bis・仏1940)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 15, [("fr-b1bis", 1)], "大隊本部"),
        el("戦車中隊(B1 bis)", 3, 50, [("fr-b1bis", 11)], "中隊"),
    ],
)
toe(
    "fr-h39-bn-1940",
    "軽戦車大隊(H39・仏1940)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 15, [("fr-h39", 3)], "大隊本部"),
        el("軽戦車中隊(H39)", 3, 40, [("fr-h39", 13)], "中隊"),
    ],
)
# 75mm 野砲の砲兵大隊(groupe):中隊3 × 4門(**仮置き**。TODO(要裏取り))
toe(
    "fr-art-grp-75",
    "砲兵大隊(75mm Mle 1897・仏)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 60, [("fr-lebel", 50)], "大隊本部"),
        el("砲兵中隊(75mm)", 3, 120, [("fr-lebel", 90), ("fr-75-1897", 4)], "中隊"),
    ],
)

W_NOTES = (
    "フランス軍の武器(1丁・1門・1両あたり)と装備品の一覧(1918年・1940年)。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "根拠は docs/research/equipment-fr.md(仮置きが多い)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_fr.py"
)
T_NOTES = "フランス軍の実数の編成表(1918年・1940年)。根拠は docs/research/equipment-fr.md。多くは TODO(要裏取り)。作り直しは tools/packs/build_fr.py"
P.write(W_NOTES, T_NOTES)
