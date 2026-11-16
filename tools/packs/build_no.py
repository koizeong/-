#!/usr/bin/env python3
"""
ノルウェー軍の装備品パックと実数の編成パック(data/weapons/no.json・data/toe/no.json)を作る。1940年(ヴェーザー演習作戦)。

    python3 tools/packs/build_no.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
根拠と信頼度は docs/research/equipment-no.md。この環境では資料を確かめられず、一般に知られた装備の名前だけを使った。
**数・人員・弾の重さ・射程はほぼすべて仮置き**(TODO(要裏取り):出典候補は Hovland『Norges forsvar 1940』、
Forsvarsmuseet の展示資料、Haarr『The German Invasion of Norway』『The Battle for Norway』の付録の戦闘序列)。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("no")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門あたり)
W["no-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
# マドセン軽機関銃:弾倉式の軽機関銃とみなす(他国の弾倉式の軽機関銃と同じ見立て)
W["no-lmg"] = c.mg("軽機関銃 マドセン", c.RE["lmg"])
# コルト M/29 重機関銃(水冷・三脚):重機関銃と同じ見立て
W["no-hmg"] = c.mg("重機関銃 コルト M/29(三脚)", c.RE["hmg"], tripod=True)
# 7.5cm 野砲 M/01(エアハルト):弾 6.5kg・最大 7,000m は**仮置き**(TODO(要裏取り))
W["no-75-m01"] = c.howitzer("7.5cm 野砲 M/01", 6.5, 7000)
# 7.5cm 山砲 M/11:弾 6.5kg・最大 6,000m は**仮置き**(TODO(要裏取り))
W["no-75-m11"] = c.howitzer("7.5cm 山砲 M/11", 6.5, 6000)

item = P.item
Y = c.years

item("no-krag", "クラーグ・ヨルゲンセン M/1894 小銃", "rifle", Y(1894, 1945), [("no-rifle", 1)], specs={"口径 mm": 6.5}, short="クラーグ")
item("no-madsen", "マドセン軽機関銃", "lmg", Y(1914, 1945), [("no-lmg", 1)], crew=2, desc="型と年は TODO(要裏取り)", short="マドセン")
item("no-colt29", "コルト M/29 重機関銃", "hmg", Y(1929, 1945), [("no-hmg", 1)], crew=4, desc="コングスベルグで作ったコルト機関銃(TODO(要裏取り))", short="コルト M/29")
item("no-75-m01", "7.5cm 野砲 M/01", "field_gun", Y(1901, 1945), [("no-75-m01", 1)], crew=6, specs={"弾 kg": "6.5(仮置き)", "最大射程 m": "7,000(仮置き)"}, desc="エアハルト社の野砲(TODO(要裏取り))", short="7.5cm 野砲")
item("no-75-m11", "7.5cm 山砲 M/11", "field_gun", Y(1911, 1945), [("no-75-m11", 1)], crew=6, specs={"弾 kg": "6.5(仮置き)", "最大射程 m": "6,000(仮置き)"}, desc="分解して運べる山砲(TODO(要裏取り))", short="7.5cm 山砲")

el = P.el
toe = P.toe

# 1940年の野戦大隊:小銃中隊3+機関銃中隊。動員が乱れ、多くの大隊は定数に届かなかったとされる(数はすべて**仮置き**)。
# 迫撃砲・対戦車砲はほとんど持っていなかったとされる(TODO(要裏取り))
toe(
    "no-inf-bn-1940",
    "歩兵大隊(ノルウェー1940)",
    "infantry_battalion",
    [
        el("大隊本部", 1, 40, [("no-krag", 35)], "大隊本部"),
        el("小銃中隊", 3, 160, [("no-krag", 140), ("no-madsen", 6)], "中隊"),
        el("機関銃中隊", 1, 120, [("no-krag", 80), ("no-colt29", 8)], "中隊"),
    ],
)
# 野砲大隊:中隊3 × 4門(**仮置き**)
toe(
    "no-art-bn-1940",
    "野砲大隊(ノルウェー1940・7.5cm)",
    "artillery_battalion",
    [
        el("大隊本部", 1, 40, [("no-krag", 30)], "大隊本部"),
        el("砲兵中隊(7.5cm 野砲)", 3, 110, [("no-krag", 80), ("no-75-m01", 4)], "中隊"),
    ],
)
# 山砲大隊(北ノルウェーの第6師団):中隊2 × 4門(**仮置き**)
toe(
    "no-mtn-art-bn-1940",
    "山砲大隊(ノルウェー1940・7.5cm)",
    "artillery_battalion",
    [
        el("大隊本部", 1, 40, [("no-krag", 30)], "大隊本部"),
        el("砲兵中隊(7.5cm 山砲)", 2, 110, [("no-krag", 80), ("no-75-m11", 4)], "中隊"),
    ],
)

W_NOTES = (
    "ノルウェー軍の武器(1丁・1門あたり)と装備品の一覧(1940年)。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "根拠は docs/research/equipment-no.md(ほぼすべて仮置き)。作り直しは tools/packs/build_no.py"
)
T_NOTES = "ノルウェー軍の実数の編成表(1940年)。根拠は docs/research/equipment-no.md。数はほぼすべて TODO(要裏取り)。作り直しは tools/packs/build_no.py"
P.write(W_NOTES, T_NOTES)
