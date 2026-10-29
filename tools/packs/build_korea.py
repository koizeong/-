#!/usr/bin/env python3
"""
朝鮮戦争の北側(朝鮮人民軍・中国人民志願軍)の装備品パックと実数の編成パック(data/weapons/korea-north.json・data/toe/korea-north.json)を作る。

    python3 tools/packs/build_korea.py

朝鮮人民軍(kp-)はソ連製の装備なので、装備品はソ連のパック(su.json)のものを使い、編成表だけを書く。
中国人民志願軍(cn-)は、旧日本軍・国民党軍・米国から手に入れた雑多な小火器と、軽い迫撃砲・山砲。装備品をここで書く。
根拠と信頼度は docs/research/equipment-korea.md。資料が薄く、**仮置き**の値が多い。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

P = c.Pack("cn")
W, far = P.W, P.far

# ---------------------------------------------------------------- 武器(中国人民志願軍)
W["cn-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["cn-smg"] = c.smg("短機関銃")
W["cn-lmg"] = c.mg("軽機関銃(弾倉式)", c.RE["lmg"])
W["cn-hmg"] = c.mg("重機関銃(三脚)", c.RE["hmg"], tripod=True)
# 60mm 迫撃砲:米国製・その写し。米の M2 と同じ値(弾1.24kg・最大1,815m。equipment-us.md)
W["cn-mortar60"] = c.mortar("60mm 迫撃砲", 1.24, 1815)
# 75mm 山砲:旧日本軍の四一式・九四式や米の M1A1 の鹵獲(低)。連隊の砲なので曲射の直接射撃。弾・射程は米の M1A1 の値(6.24kg は仮置き・8,790m)
W["cn-75-mtn"] = c.mortar("75mm 山砲(鹵獲)", 6.24, 8790)

item = P.item
Y = c.years
item("cn-rifle", "小銃(中正式・三八式など)", "rifle", Y(1935, 1953), [("cn-rifle", 1)], desc="国民党軍の中正式(モーゼル小銃の写し)、旧日本軍の三八式・九九式など雑多(低)", short="小銃")
item("cn-smg", "短機関銃(トンプソン・PPSh など)", "smg", Y(1940, 1953), [("cn-smg", 1)], desc="米国製の鹵獲品やソ連製。突撃に使った", short="短機関銃")
item("cn-zb26", "ZB vz.26 軽機関銃(とその写し)", "lmg", Y(1927, 1953), [("cn-lmg", 1)], crew=2, desc="チェコ製の軽機関銃。中国で多く写して作った", short="ZB26")
item("cn-type24", "二四式重機関銃(マキシムの写し)", "hmg", Y(1935, 1953), [("cn-hmg", 1)], crew=5, short="二四式重機")
item("cn-mortar60", "60mm 迫撃砲", "mortar", Y(1940, 1953), [("cn-mortar60", 1)], crew=4, specs={"弾 kg": 1.24, "最大射程 m": 1815}, short="60mm迫")
item("cn-75-mtn", "75mm 山砲(鹵獲)", "infantry_gun", Y(1940, 1953), [("cn-75-mtn", 1)], crew=7, specs={"最大射程 m": 8790}, desc="旧日本軍・米軍の山砲の鹵獲。連隊に3門ほど", short="75mm 山砲")

el = P.el
toe = P.toe

# 1950年の志願軍の歩兵連隊:約3,000名、大隊3。連隊に軽機関銃135・重機関銃18・60mm 18・75mm 山砲3(**低**:フォーラムの要約)。
# 中隊は小隊3 ×(分隊3 × 12名)、機関銃小隊(ベルト給弾の機関銃3)、迫撃砲小隊(60mm 2)(**低**:The Miniatures Page)。
# 実際には連隊で 800名・小銃400 しかいなかった例もある(低)。TODO(要裏取り:Appleman『South to the Naktong』、Millett、『抗美援朝戦争史』)
toe(
    "cn-inf-regt-1950",
    "歩兵連隊(中国人民志願軍1950)",
    "infantry_regiment",
    [
        el("連隊本部・直属中隊", 1, 300, [("cn-rifle", 200), ("cn-smg", 30), ("cn-75-mtn", 3)], "連隊本部"),
        el("大隊本部", 3, 60, [("cn-rifle", 40), ("cn-smg", 10)], "大隊", 3),
        el("歩兵中隊", 9, 150, [("cn-rifle", 100), ("cn-smg", 25), ("cn-zb26", 15), ("cn-mortar60", 2)], "大隊", 3),
        el("機関銃中隊", 3, 100, [("cn-rifle", 70), ("cn-type24", 6)], "大隊", 3),
    ],
)

# 1950年6月の朝鮮人民軍の歩兵連隊:2,590名、大隊3(中:Wikipedia『第4師団(朝鮮人民軍)』。師団は 10,381名で、砲兵連隊は 122mm の大隊1・76mm の大隊2)。
# 装備はソ連製。連隊・大隊の火器の数は TODO(要裏取り:Appleman 第2章、米極東軍の情報資料)。ソ連の1944年の狙撃兵連隊の形を縮めた**仮置き**
toe(
    "kp-inf-regt-1950",
    "歩兵連隊(朝鮮人民軍1950)",
    "infantry_regiment",
    [
        el("連隊本部・本部中隊", 1, 140, [("su-mosin", 100), ("su-ppsh", 30)], "連隊本部"),
        el("歩兵中隊", 9, 150, [("su-mosin", 90), ("su-ppsh", 45), ("su-dp", 9), ("su-maxim", 1)], "大隊", 3),
        el("機関銃中隊", 3, 60, [("su-mosin", 40), ("su-ppsh", 5), ("su-sg43", 9)], "大隊", 3),
        el("迫撃砲中隊(82mm)", 3, 60, [("su-mosin", 45), ("su-mortar82", 9)], "大隊", 3),
        el("対戦車小隊(45mm)", 3, 30, [("su-mosin", 20), ("su-45mm", 2), ("su-ptrd", 6)], "大隊", 3),
        el("連隊砲中隊(76mm)", 1, 70, [("su-mosin", 45), ("su-76-regt", 4)], "連隊直轄"),
        el("迫撃砲中隊(120mm)", 1, 80, [("su-mosin", 55), ("su-mortar120", 6)], "連隊直轄"),
    ],
)
# 1950年の朝鮮人民軍の歩兵大隊:上の連隊の大隊1つ分(**仮置き**の形をそのまま3で割った)
_kr = P.T["kp-inf-regt-1950"]["elements"]
toe(
    "kp-inf-bn-1950",
    "歩兵大隊(朝鮮人民軍1950)",
    "infantry_battalion",
    [{**e, "count": e["count"] // 3, "group": "大隊", "groupCount": 1} for e in _kr if e.get("group") == "大隊"],
)

# 第105戦車旅団(1950年6月):T-34-85 の戦車連隊3。1連隊40両とよく引かれる(TODO(要裏取り):Appleman 第2章)。中隊10両 × 4 で置いた
toe(
    "kp-tank-regt-1950",
    "戦車連隊(T-34-85・朝鮮人民軍1950)",
    "tank_battalion",
    [
        el("戦車中隊(T-34-85)", 4, 50, [("su-t34-85", 10)], "中隊"),
    ],
    echelon="regiment",
)

W_NOTES = (
    "朝鮮戦争の北側(中国人民志願軍)の武器と装備品。朝鮮人民軍はソ連のパック(su)の装備品を使う。威力の物差しは docs/research/equipment-calibration.md、"
    "根拠は docs/research/equipment-korea.md(資料が薄く仮置きが多い)。作り直しは tools/packs/build_korea.py"
)
T_NOTES = (
    "朝鮮戦争の北側の実数の編成表(朝鮮人民軍 kp-・中国人民志願軍 cn-)。根拠は docs/research/equipment-korea.md。多くは TODO(要裏取り)。"
    "作り直しは tools/packs/build_korea.py"
)
P.write(W_NOTES, T_NOTES, "korea-north")
