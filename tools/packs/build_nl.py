#!/usr/bin/env python3
"""
オランダ軍の装備品パックと実数の編成パック(data/weapons/nl.json・data/toe/nl.json)を作る。1940年(黄作戦)。

    python3 tools/packs/build_nl.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
根拠と信頼度は docs/research/equipment-nl.md。この環境では資料を確かめられず、一般に知られた装備の名前だけを使った。
**数・人員・弾の重さ・射程・貫通力はほぼすべて仮置き**(TODO(要裏取り):出典候補は Amersfoort & Kamphuis『Mei 1940』、
オランダ軍事史研究所(NIMH)の資料、Goossens の「waroverholland.nl」)。
艦艇のパック(太平洋1942年)の蘭の艦級とは別(陸だけ)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("nl")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門あたり)
W["nl-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["nl-lmg"] = c.mg("軽機関銃 ルイス M.20", c.RE["lmg"])
# シュヴァルツローゼ M.08:水冷・三脚。発射速度が低いとされ、重機関銃の 0.9 倍(ゲームの見立て)
W["nl-hmg"] = c.mg("重機関銃 シュヴァルツローゼ M.08(三脚)", c.RE["hmg"] * 0.9, tripod=True)
# 47mm 対戦車砲(ベーラー):500m で 40mm・1000m で 28mm の**仮置き**(TODO(要裏取り))
W["nl-47"] = c.at_gun("47mm 対戦車砲(ベーラー)", 47, [(500, 40), (1000, 28)], far, "nl-47")
# 8cm 迫撃砲:ブラントの系統とみなし、仏の 81mm と同じ値(仮置き)
W["nl-mortar81"] = c.mortar("8cm 迫撃砲", 3.12, 3000)
# 7.5cm 野砲(8 Staal。クルップ系):弾 6.5kg・最大 8,000m の**仮置き**
W["nl-75"] = c.howitzer("7.5cm 野砲(8 Staal)", 6.5, 8000)

item = P.item
Y = c.years

item("nl-m95", "マンリッヒャー M.95 小銃", "rifle", Y(1895, 1945), [("nl-rifle", 1)], specs={"口径 mm": 6.5}, short="M.95")
item("nl-lewis", "ルイス M.20 軽機関銃", "lmg", Y(1920, 1945), [("nl-lmg", 1)], crew=2, short="ルイス")
item("nl-schwarzlose", "シュヴァルツローゼ M.08 重機関銃", "hmg", Y(1908, 1945), [("nl-hmg", 1)], crew=4, short="シュヴァルツローゼ")
item("nl-47", "47mm 対戦車砲(ベーラー)", "at_gun", Y(1935, 1940), [("nl-47", 1)], crew=5, specs={"貫通 mm/500m": "40(仮置き)"}, short="47mm 対戦車")
item("nl-mortar81", "8cm 迫撃砲", "mortar", Y(1927, 1945), [("nl-mortar81", 1)], crew=5, short="8cm迫")
item("nl-75", "7.5cm 野砲(8 Staal)", "field_gun", Y(1904, 1940), [("nl-75", 1)], crew=6, specs={"弾 kg": "6.5(仮置き)", "最大射程 m": "8,000(仮置き)"}, short="8 Staal")

el = P.el
toe = P.toe

# 1940年の歩兵連隊:大隊3 ×(小銃中隊3+機関銃中隊)、連隊に迫撃砲・対戦車の小隊。数と人員は**仮置き**
toe(
    "nl-ir-1940",
    "歩兵連隊(オランダ1940)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 150, [("nl-m95", 120)], "連隊本部"),
        el("小銃中隊", 9, 180, [("nl-m95", 160), ("nl-lewis", 6)], "大隊", 3),
        el("機関銃中隊", 3, 150, [("nl-m95", 110), ("nl-schwarzlose", 12)], "大隊", 3),
        el("重火器中隊(8cm・47mm)", 1, 120, [("nl-m95", 90), ("nl-mortar81", 6), ("nl-47", 4)], "連隊直轄"),
    ],
)
toe(
    "nl-art-1940",
    "野砲大隊(オランダ1940・8 Staal)",
    "artillery_battalion",
    [
        el("大隊本部", 1, 50, [("nl-m95", 40)], "大隊本部"),
        el("砲兵中隊(7.5cm)", 3, 110, [("nl-m95", 80), ("nl-75", 4)], "中隊"),
    ],
)

W_NOTES = (
    "オランダ軍の武器(1丁・1門あたり)と装備品の一覧(1940年)。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    f"根拠は docs/research/equipment-nl.md(ほぼすべて仮置き)。TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_nl.py"
)
T_NOTES = "オランダ軍の実数の編成表(1940年)。根拠は docs/research/equipment-nl.md。数はほぼすべて TODO(要裏取り)。作り直しは tools/packs/build_nl.py"
P.write(W_NOTES, T_NOTES)
