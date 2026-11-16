#!/usr/bin/env python3
"""
中国国民革命軍(国民政府軍)の装備品パックと実数の編成パック(data/weapons/roc.json・data/toe/roc.json)を作る。1944年(大陸打通作戦)。

    python3 tools/packs/build_roc.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。ID は「roc-」で始める
(朝鮮戦争の中国人民志願軍の cn- と分ける)。
根拠と信頼度は docs/research/equipment-roc.md。この環境では資料を確かめられず、一般に知られた装備の名前だけを使った。
**数・人員・弾の重さ・射程はほぼすべて仮置き**(TODO(要裏取り):出典候補は Jowett『Chinese Civil War Armies』、Ness & Shih『Kangzhan: Guide to Chinese Ground Forces 1937–45』、
『抗日戦争正面戦場』、米の『Handbook on Chinese Forces』)。
1944年の国民政府軍の師団は定数に大きく届かず、装備も足りなかったとされる(キャンペーンでは戦力を割り引く)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("roc")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門あたり)
W["roc-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
# ZB vz.26(チェコ)とその国産:弾倉式の軽機関銃
W["roc-lmg"] = c.mg("軽機関銃 ZB vz.26", c.RE["lmg"])
# 二四式重機関銃(マキシムの国産):重機関銃と同じ見立て
W["roc-hmg"] = c.mg("重機関銃 二四式(マキシム)", c.RE["hmg"], tripod=True)
# 82mm 迫撃砲:ブラントの系統とみなし、弾 3.1kg・最大 3,000m の**仮置き**
W["roc-mortar82"] = c.mortar("82mm 迫撃砲", 3.1, 3000)
# 37mm 対戦車砲(Pak 36 の輸入):独の Pak 36 と同じ貫通力の表
W["roc-37"] = c.at_gun("37mm 対戦車砲(独 Pak 36)", 37, [(100, 64), (500, 52), (1000, 40), (1500, 30)], far, "roc-37")
# 75mm 山砲(ボフォース):弾 6.5kg・最大 9,000m の**仮置き**
W["roc-75mtn"] = c.howitzer("75mm 山砲(ボフォース)", 6.5, 9000)

item = P.item
Y = c.years

item("roc-chiang", "中正式小銃・漢陽八八式小銃", "rifle", Y(1935, 1949), [("roc-rifle", 1)], specs={"口径 mm": 7.92}, desc="モーゼルの系統。漢陽八八式は旧い", short="中正式")
item("roc-zb26", "ZB vz.26 軽機関銃", "lmg", Y(1927, 1949), [("roc-lmg", 1)], crew=2, desc="チェコからの輸入と国産", short="ZB26")
item("roc-type24", "二四式重機関銃", "hmg", Y(1935, 1949), [("roc-hmg", 1)], crew=4, desc="マキシムの国産", short="二四式")
item("roc-mortar82", "82mm 迫撃砲", "mortar", Y(1931, 1949), [("roc-mortar82", 1)], crew=5, short="82mm迫")
item("roc-37", "37mm 対戦車砲(Pak 36)", "at_gun", Y(1937, 1945), [("roc-37", 1)], crew=5, desc="ドイツからの輸入", short="37mm 対戦車")
item("roc-75mtn", "75mm 山砲(ボフォース)", "field_gun", Y(1930, 1949), [("roc-75mtn", 1)], crew=6, specs={"弾 kg": "6.5(仮置き)", "最大射程 m": "9,000(仮置き)"}, short="75mm 山砲")

el = P.el
toe = P.toe

# 1944年の歩兵連隊(団):大隊(営)3 ×(小銃中隊3+機関銃中隊)、連隊に迫撃砲中隊・対戦車砲の小隊。数と人員は**仮置き**
toe(
    "roc-ir-1944",
    "歩兵連隊(国民政府軍1944)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 120, [("roc-chiang", 90)], "連隊本部"),
        el("小銃中隊", 9, 150, [("roc-chiang", 120), ("roc-zb26", 6)], "大隊", 3),
        el("機関銃中隊", 3, 110, [("roc-chiang", 80), ("roc-type24", 6)], "大隊", 3),
        el("迫撃砲中隊", 1, 110, [("roc-chiang", 70), ("roc-mortar82", 6)], "連隊直轄"),
        el("対戦車砲の小隊", 1, 50, [("roc-chiang", 30), ("roc-37", 2)], "連隊直轄"),
    ],
)
# 山砲大隊(営):中隊3 × 4門(**仮置き**)
toe(
    "roc-art-1944",
    "山砲大隊(国民政府軍1944・75mm)",
    "artillery_battalion",
    [
        el("大隊本部", 1, 40, [("roc-chiang", 30)], "大隊本部"),
        el("砲兵中隊(75mm 山砲)", 3, 100, [("roc-chiang", 70), ("roc-75mtn", 4)], "中隊"),
    ],
)

W_NOTES = (
    "中国国民革命軍の武器(1丁・1門あたり)と装備品の一覧(1944年)。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    f"根拠は docs/research/equipment-roc.md(ほぼすべて仮置き)。TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_roc.py"
)
T_NOTES = "中国国民革命軍の実数の編成表(1944年)。根拠は docs/research/equipment-roc.md。数はほぼすべて TODO(要裏取り)。作り直しは tools/packs/build_roc.py"
P.write(W_NOTES, T_NOTES)
