#!/usr/bin/env python3
"""
百年戦争(1429年ごろ)の武器と編成表(data/weapons/medieval.json・data/toe/medieval.json)を作る。ルールパックは medieval。

    python3 tools/packs/build_medieval.py

部隊の単位は「隊」(数百〜千人ほどの、領主の手勢・弓兵の隊・守備隊)。キャンペーンでは軍(包囲陣・援軍・守備)を formation にする。
武器の物差しは汎用のパック(ww1-korea-generic)と同じ:要素1つ(100〜200人・耐久50〜60)が「小銃中隊」と同じくらい。
長弓は曲射で300mまで届き、甲冑の兵には効きにくい(装甲の部分への効き目を下げる。重装の兵・騎士は装甲化率0.5)。
弩はゆっくりだが、近い距離で甲冑にもよく効く。騎士の突撃・重装の兵の長柄の斧・槍は 30〜40m の白兵。攻城の砲(ボンバード)は陣地(城壁)に強い。
数値はゲームの手触りのための仮置き。TODO(要裏取り):出典候補は Strickland & Hardy『The Great Warbow』、DeVries & Smith『Medieval Military Technology』、
Curry『The Hundred Years War』、DeVries『Joan of Arc: A Military Leader』、Cooper『The Real Falstaff』。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, ammo, suppression=0.6, soft=1.0, armored=0.6, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": armored}, "indirect": False, "ammoPerMin": ammo, "suppression": suppression}
    d.update(extra)
    return d


WEAPONS = {
    # 射撃(弓兵の束ごと)。長弓は速く遠いが、板金の甲冑には効きにくい
    # (初めは長弓を 100m で 1.0・弩を 0.8 にしたが、AI 同士の生成の戦いでイングランド軍の損耗が 0〜7% にとどまり、ロワール戦役も3戦ともイングランドの決定的勝利だった。
    #  長弓を 0.7 に下げ、弩を 0.9 に上げて甲冑にもよく効くようにした)
    "med_longbow": w("長弓(矢の雨)", [(100, 0.7), (200, 0.45), (300, 0.15)], 0.0008, 0.8, armored=0.3, arcing=True),
    "med_crossbow": w("弩(クロスボウ)", [(100, 0.9), (200, 0.5), (300, 0.15)], 0.0005, 0.6, armored=0.75, arcing=True),
    "med_handgonne": w("手銃・小型の砲(キュルヴリーヌ)", [(100, 0.5)], 0.0006, 0.8, armored=0.8),
    # 白兵
    "med_poleaxe": w("長柄の斧・剣(下馬した重装の兵の白兵)", [(30, 2.5)], 0.0, 0.5, armored=0.8),
    "med_spear": w("槍・ビル(歩兵の白兵)", [(40, 1.2)], 0.0, 0.4, armored=0.4),
    "med_lance": w("騎乗の突撃(槍・剣)", [(40, 4.0)], 0.0, 0.6, armored=0.8),
    "med_light_sword": w("軽騎兵の剣", [(30, 1.5)], 0.0, 0.4, armored=0.3),
    # 攻城の砲(1門ごと)。兵には大して効かないが、城壁・陣地を崩す
    "med_bombard": w("攻城の砲(ボンバード)", [(300, 0.6), (800, 0.3)], 0.02, 1.5, armored=1.0, entrenchmentPierce=0.6),
}


def el(name, count, hp, weapons):
    return {"name": name, "count": count, "hitPoints": hp, "weapons": [{"weapon": k, "count": n} for k, n in weapons]}


def toe(name, branch, nation, frontage, elements, armor=0.0, ammo=8, echelon="battalion"):
    return {"name": name, "branch": branch, "armorRatio": armor, "frontageM": frontage, "supply": {"ammoCapacityT": ammo, "fuelCapacityT": 0, "fuelPerKmT": 0},
            "elements": elements, "symbol": {"echelon": echelon, "modifiers": []}, "nation": nation}


TOES = {
    # ---- イングランド軍:重装の兵は下馬して戦い、長弓兵が多い ----
    "med-en-mat": toe("重装の兵の隊(英・下馬)", "men_at_arms", "en", 400, [el("重装の兵", 4, 60, [("med_poleaxe", 3)])], armor=0.5, ammo=2),
    "med-en-archers": toe("長弓兵の隊(英)", "archers", "en", 500, [el("長弓兵", 4, 50, [("med_longbow", 4), ("med_spear", 1)])], ammo=12),
    "med-en-horse": toe("騎乗の重装の兵(英)", "knights", "en", 300, [el("騎乗の重装の兵", 2, 60, [("med_lance", 3)])], armor=0.5, ammo=1),
    "med-en-garrison": toe("守備隊(英・バスティーユ・城)", "foot", "en", 400, [el("守備兵", 3, 50, [("med_longbow", 1), ("med_spear", 3)])], ammo=8),
    "med-en-siege": toe("攻城の砲(英)", "artillery", "en", 200, [el("砲と砲手", 1, 30, [("med_bombard", 4), ("med_handgonne", 2)])], ammo=20),
    # ---- フランス王太子軍:騎士の騎乗の突撃、弩兵・スコットランド兵・市民兵、ビュロー兄弟の砲 ----
    "med-fr-mat": toe("重装の兵の隊(仏)", "men_at_arms", "fr", 400, [el("重装の兵", 4, 60, [("med_poleaxe", 3)])], armor=0.5, ammo=2),
    "med-fr-knights": toe("騎士の隊(仏・騎乗)", "knights", "fr", 400, [el("騎士と従者", 3, 60, [("med_lance", 4)])], armor=0.5, ammo=1),
    "med-fr-xbow": toe("弩兵の隊(仏)", "archers", "fr", 500, [el("弩兵", 3, 45, [("med_crossbow", 3), ("med_spear", 1)])], ammo=10),
    "med-fr-scots": toe("スコットランド兵の隊", "foot", "fr", 500, [el("スコットランド兵", 4, 55, [("med_longbow", 2), ("med_spear", 2)])], ammo=8),
    "med-fr-militia": toe("市民兵(オルレアン)", "foot", "fr", 500, [el("市民兵", 4, 45, [("med_crossbow", 1), ("med_spear", 3), ("med_handgonne", 1)])], ammo=8),
    "med-fr-light": toe("軽騎兵の隊(仏・ラ・イル)", "light_horse", "fr", 300, [el("軽騎兵", 2, 45, [("med_light_sword", 3)])], ammo=1),
    "med-fr-art": toe("砲兵(仏・ビュロー兄弟)", "artillery", "fr", 200, [el("砲と砲手", 1, 30, [("med_bombard", 3), ("med_handgonne", 3)])], ammo=20),
    # 輜重(輸送の護衛で送り届ける荷車の列。オルレアンへの補給の船団)
    "med-supply-train": toe("補給の荷車の列", "foot", "generic", 300, [el("荷車と護衛", 1, 40, [("med_spear", 1)])], ammo=30),
}

(ROOT / "data/weapons/medieval.json").write_text(json.dumps({"id": "medieval", "notes": "百年戦争の武器(仮置き。tools/packs/build_medieval.py)", "weapons": WEAPONS}, ensure_ascii=False, indent=2) + "\n")
(ROOT / "data/toe/medieval.json").write_text(json.dumps({"id": "medieval", "notes": "百年戦争の編成表(隊。仮置き。tools/packs/build_medieval.py)", "toes": TOES}, ensure_ascii=False, indent=2) + "\n")
print("wrote medieval weapons/toe", len(WEAPONS), len(TOES))
