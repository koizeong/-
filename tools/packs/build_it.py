#!/usr/bin/env python3
"""
イタリア軍の装備品パックと実数の編成パック(data/weapons/it.json・data/toe/it.json)を作る。1940〜43年(北アフリカ)。

    python3 tools/packs/build_it.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。書き方は build_de.py と同じ(equipment_common.Pack)。
根拠と信頼度は docs/research/equipment-it.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。**仮置きが特に多い**。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("it")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["it-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
# ブレダ M30:20発の固定弾倉で故障が多いとされる。軽機関銃の 0.8 倍(ゲームの見立て。TODO(要裏取り))
W["it-lmg"] = c.mg("軽機関銃 ブレダ M30", c.RE["lmg"] * 0.8)
# ブレダ M37:20発の保弾板。重機関銃の 0.9 倍(オチキスと同じ見立て)
W["it-hmg"] = c.mg("重機関銃 ブレダ M37(三脚)", c.RE["hmg"] * 0.9, tripod=True)
W["it-mg-vehicle"] = c.mg("車載機関銃", c.RE["lmg"])
# 45mm ブリクシア:弾0.46kg・最大約540m は**仮置き**(TODO(要裏取り))。81mm mod.35 はブラントの系統とみなし米の 81mm と同じ値(3.12kg・3,000m)
W["it-mortar45"] = c.mortar("45mm 迫撃砲 ブリクシア mod.35", 0.46, 540)
W["it-mortar81"] = c.mortar("81mm 迫撃砲 mod.35", 3.12, 3000)
# 47/32:500m で約45mm(中:2件が一致。角度は不明)。1000m の32は**仮置き**
PEN47 = [(500, 45), (1000, 32)]
W["it-47-32"] = c.at_gun("47/32 対戦車砲 mod.35", 47, PEN47, far, "it-47-32")
W["it-47-32-tank"] = c.tank_gun("47/32 戦車砲(M13/40)", 47, PEN47, far, "it-47-32-tank")
# 65/17 歩兵砲:弾4.2kg・最大6,800m は**仮置き**(TODO(要裏取り))。連隊の砲なので曲射の直接射撃
W["it-65-17"] = c.mortar("65/17 歩兵砲 mod.13", 4.2, 6800)

item = P.item
Y = c.years
HP = c.VEHICLE_HP

item("it-carcano", "カルカノ M91 小銃", "rifle", Y(1891, 1945), [("it-rifle", 1)], specs={"口径 mm": "6.5 / 7.35"}, short="カルカノ")
item("it-breda30", "ブレダ M30 軽機関銃", "lmg", Y(1930, 1945), [("it-lmg", 1)], crew=2, desc="20発の固定弾倉。故障が多いとされる(TODO(要裏取り))", short="ブレダ M30")
item("it-breda37", "ブレダ M37 重機関銃", "hmg", Y(1937, 1945), [("it-hmg", 1)], crew=4, short="ブレダ M37")
item("it-mortar45", "45mm 迫撃砲 ブリクシア mod.35", "mortar", Y(1935, 1945), [("it-mortar45", 1)], crew=2, specs={"弾 kg": "0.46(仮置き)", "最大射程 m": "540(仮置き)"}, short="45mm迫")
item("it-mortar81", "81mm 迫撃砲 mod.35", "mortar", Y(1935, 1945), [("it-mortar81", 1)], crew=6, short="81mm迫")
item("it-47-32", "47/32 対戦車砲 mod.35", "at_gun", Y(1935, 1945), [("it-47-32", 1)], crew=5, specs={"貫通 mm/500m": "約45"}, short="47/32")
item("it-65-17", "65/17 歩兵砲 mod.13", "infantry_gun", Y(1913, 1945), [("it-65-17", 1)], crew=6, specs={"弾 kg": "4.2(仮置き)", "最大射程 m": "6,800(仮置き)"}, desc="もとは山砲。連隊の支援火器の中隊にあった", short="65/17")
item("it-m13", "M13/40 中戦車", "tank", Y(1940, 1942), [("it-47-32-tank", 1), ("it-mg-vehicle", 3)], crew=4, hp=HP["medium_tank"], armor={"front": 30, "side": 25, "rear": 25, "turretFront": 42, "turretSide": 25}, specs={"重量 t": "13〜14", "弾数": 104}, desc="前面30・砲塔前面42・側面25(中:2件が一致)。後面・砲塔側面は**仮置き**", short="M13/40")

el = P.el
toe = P.toe

# 1940年の歩兵連隊(二単位師団):大隊3 ×(小銃中隊3+機関銃中隊)、連隊に迫撃砲中隊(81mm 9)・対戦車中隊(47/32 8=4門の小隊2)・
# 支援火器の中隊(65/17 4)。機関銃中隊にブレダ M37 と 45mm(中:Wikipedia の師団の記事)。迫撃砲・対戦車の数は Scribd の資料(低)。
# 中隊のブレダ M30・45mm・M37 の数と人員はすべて**仮置き**(TODO(要裏取り):1940年の編制表、Jowett『The Italian Army 1940–45』)
toe(
    "it-ir-1940",
    "歩兵連隊(伊1940)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 150, [("it-carcano", 130)], "連隊本部"),
        el("小銃中隊", 9, 170, [("it-carcano", 150), ("it-breda30", 6), ("it-mortar45", 3)], "大隊", 3),
        el("機関銃中隊", 3, 150, [("it-carcano", 110), ("it-breda37", 12)], "大隊", 3),
        el("迫撃砲中隊(81mm)", 1, 150, [("it-carcano", 110), ("it-mortar81", 9)], "連隊直轄"),
        el("対戦車中隊(47/32)", 1, 100, [("it-carcano", 70), ("it-47-32", 8)], "連隊直轄"),
        el("支援火器中隊(65/17)", 1, 100, [("it-carcano", 75), ("it-65-17", 4)], "連隊直轄"),
    ],
)
# 1941年の戦車大隊(M13/40):中隊16両 × 3+本部1 の**仮置き**(TODO(要裏取り):アリエテ師団の戦闘序列)
toe(
    "it-m13-bn-1941",
    "戦車大隊(M13/40・伊1941)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 15, [("it-m13", 1)], "大隊本部"),
        el("戦車中隊(M13/40)", 3, 60, [("it-m13", 16)], "中隊"),
    ],
)

W_NOTES = (
    "イタリア軍の武器(1丁・1門・1両あたり)と装備品の一覧(1940〜43年)。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "根拠は docs/research/equipment-it.md(仮置きが特に多い)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_it.py"
)
T_NOTES = "イタリア軍の実数の編成表(1940〜41年)。根拠は docs/research/equipment-it.md。多くは TODO(要裏取り)。作り直しは tools/packs/build_it.py"
P.write(W_NOTES, T_NOTES)
