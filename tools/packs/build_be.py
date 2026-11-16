#!/usr/bin/env python3
"""
ベルギー軍の装備品パックと実数の編成パック(data/weapons/be.json・data/toe/be.json)を作る。1940年(黄作戦)。

    python3 tools/packs/build_be.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
根拠と信頼度は docs/research/equipment-be.md。この環境では資料を確かめられず、一般に知られた装備の名前だけを使った。
**数・人員・弾の重さ・射程・貫通力はほぼすべて仮置き**(TODO(要裏取り):出典候補は Bodart ほか『Les armes de l'armée belge 1940』、
ベルギー王立軍事博物館の資料、Zaloga『Blitzkrieg: Armour Camouflage and Markings』、Jowett『The Belgian Army 1940』)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("be")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門あたり)
W["be-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
# FM 30:ブローニング自動小銃(BAR)を元にした軽機関銃。自動小銃と同じ見立て
W["be-fm30"] = c.rifle("軽機関銃 FM 30(ブローニングの系統)", c.RE["auto_rifle"], max_range_m=600)
# マキシム M/1908 重機関銃(水冷・三脚):重機関銃と同じ見立て
W["be-hmg"] = c.mg("重機関銃 マキシム M/1908(三脚)", c.RE["hmg"], tripod=True)
# 47mm 対戦車砲 FRC Mod.31:当時としてはよく抜けたとされる。500m で 40mm・1000m で 30mm の**仮置き**(TODO(要裏取り))
W["be-47"] = c.at_gun("47mm 対戦車砲 FRC Mod.31", 47, [(500, 40), (1000, 30)], far, "be-47")
# 76mm 歩兵砲 FRC:弾 3kg・最大 4,000m の**仮置き**(曲射の直接射撃)
W["be-76frc"] = c.mortar("76mm 歩兵砲 FRC", 3.0, 4000)
# 75mm 野砲(クルップ系 M1905 など):弾 6.5kg・最大 8,000m の**仮置き**
W["be-75"] = c.howitzer("75mm 野砲", 6.5, 8000)

item = P.item
Y = c.years

item("be-mauser", "モーゼル M1889・M1935 小銃", "rifle", Y(1889, 1945), [("be-rifle", 1)], specs={"口径 mm": 7.65}, short="モーゼル")
item("be-fm30", "FM 30 軽機関銃", "lmg", Y(1930, 1945), [("be-fm30", 1)], crew=2, desc="ブローニング自動小銃の系統(TODO(要裏取り))", short="FM 30")
item("be-maxim08", "マキシム M/1908 重機関銃", "hmg", Y(1908, 1945), [("be-hmg", 1)], crew=4, short="マキシム")
item("be-47", "47mm 対戦車砲 FRC Mod.31", "at_gun", Y(1931, 1940), [("be-47", 1)], crew=5, specs={"貫通 mm/500m": "40(仮置き)"}, short="47mm 対戦車")
item("be-76frc", "76mm 歩兵砲 FRC", "infantry_gun", Y(1932, 1940), [("be-76frc", 1)], crew=5, specs={"弾 kg": "3(仮置き)", "最大射程 m": "4,000(仮置き)"}, short="76mm 歩兵砲")
item("be-75", "75mm 野砲", "field_gun", Y(1905, 1940), [("be-75", 1)], crew=6, specs={"弾 kg": "6.5(仮置き)", "最大射程 m": "8,000(仮置き)"}, short="75mm 野砲")

el = P.el
toe = P.toe

# 1940年の歩兵連隊:大隊3 ×(小銃中隊3+機関銃中隊)、連隊に重火器中隊(47mm・76mm)。数と人員は**仮置き**
toe(
    "be-ir-1940",
    "歩兵連隊(ベルギー1940)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 150, [("be-mauser", 120)], "連隊本部"),
        el("小銃中隊", 9, 180, [("be-mauser", 155), ("be-fm30", 9)], "大隊", 3),
        el("機関銃中隊", 3, 150, [("be-mauser", 110), ("be-maxim08", 12)], "大隊", 3),
        el("重火器中隊(47mm・76mm)", 1, 160, [("be-mauser", 120), ("be-47", 6), ("be-76frc", 4)], "連隊直轄"),
    ],
)
# 野砲大隊:中隊3 × 4門(**仮置き**)
toe(
    "be-art-grp-1940",
    "野砲大隊(ベルギー1940・75mm)",
    "artillery_battalion",
    [
        el("大隊本部", 1, 50, [("be-mauser", 40)], "大隊本部"),
        el("砲兵中隊(75mm)", 3, 110, [("be-mauser", 80), ("be-75", 4)], "中隊"),
    ],
)

W_NOTES = (
    "ベルギー軍の武器(1丁・1門あたり)と装備品の一覧(1940年)。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    f"根拠は docs/research/equipment-be.md(ほぼすべて仮置き)。TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_be.py"
)
T_NOTES = "ベルギー軍の実数の編成表(1940年)。根拠は docs/research/equipment-be.md。数はほぼすべて TODO(要裏取り)。作り直しは tools/packs/build_be.py"
P.write(W_NOTES, T_NOTES)
