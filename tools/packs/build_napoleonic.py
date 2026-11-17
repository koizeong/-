#!/usr/bin/env python3
"""
ナポレオン戦争(1805年ごろ)の武器と編成表(data/weapons/napoleonic.json・data/toe/napoleonic.json)を作る。ルールパックは napoleonic。

    python3 tools/packs/build_napoleonic.py

部隊の単位は旅団(歩兵旅団=大隊4〜6、騎兵旅団=連隊2、砲兵=中隊2)。キャンペーンでは軍団・師団を師団・旅団の集まり(formation)にする。
武器の威力は汎用のパック(ww1-korea-generic)の物差し:大隊の要素1つ(約700人・耐久100)が「小銃中隊」と同じ耐久で、
マスケットは小火器より射程が短く当たりにくい(有効100m前後、最大200m)。大砲は直接照準で、300m までのぶどう弾がいちばん強く、
球形弾は 800〜1,500m まで届く。騎兵のサーベル・槍、歩兵の銃剣は 30〜40m の白兵(肉薄の距離)だけで効く。
数値はゲームの手触りのための仮置き。国ごとの違い(仏の散兵の多さ、墺の大きな大隊、露の小さな大隊と銃剣)はゲームの見立て。
TODO(要裏取り):出典候補は Nafziger の戦闘序列の集成、Haythornthwaite『Weapons & Equipment of the Napoleonic Wars』、
Hughes『Firepower: Weapons Effectiveness on the Battlefield, 1630–1850』、Goetz『1805: Austerlitz』。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def w(name, bands, ammo, suppression=0.6, soft=1.0, **extra):
    d = {"name": name, "bands": [{"maxRangeM": r, "power": p} for r, p in bands], "effectiveness": {"soft": soft, "armored": 0.02}, "indirect": False, "ammoPerMin": ammo, "suppression": suppression}
    d.update(extra)
    return d


WEAPONS = {
    # 歩兵(大隊の4分の1の、中隊の束ごと)
    "nap_musket": w("マスケット(滑腔の燧発銃)", [(50, 1.0), (100, 0.6), (200, 0.15)], 0.0006, 0.7),
    "nap_rifle": w("散兵の射撃(選抜歩兵・猟兵・ライフル)", [(100, 0.6), (200, 0.35), (300, 0.1)], 0.0005, 0.5),
    "nap_bayonet": w("銃剣(白兵)", [(30, 1.2)], 0.0, 0.3),
    # 騎兵(連隊の4分の1ごと)
    "nap_sabre_heavy": w("重騎兵のサーベル・パラッシュ(白兵)", [(30, 3.0)], 0.0, 0.5),
    "nap_sabre_light": w("軽騎兵のサーベル(白兵)", [(30, 2.2)], 0.0, 0.5),
    "nap_lance": w("槍(コサック・槍騎兵。白兵)", [(40, 2.5)], 0.0, 0.5),
    "nap_carbine": w("騎兵の騎銃・拳銃", [(100, 0.3)], 0.0002, 0.3),
    # 大砲(1門ごと)。300m まではぶどう弾
    "nap_gun_6pdr": w("6・8ポンド野砲(ぶどう弾・球形弾)", [(300, 1.2), (800, 0.5), (1200, 0.2)], 0.008, 1.2),
    "nap_gun_12pdr": w("12ポンド陣地砲(ぶどう弾・球形弾)", [(300, 1.6), (900, 0.7), (1500, 0.3)], 0.012, 1.4),
    "nap_howitzer": w("榴弾砲(6インチ・ユニコーン)", [(1200, 0.6)], 0.01, 1.5, arcing=True),
}


def el(name, count, hp, weapons, group=None):
    e = {"name": name, "count": count, "hitPoints": hp, "weapons": [{"weapon": k, "count": n} for k, n in weapons]}
    if group:
        e["group"] = group
    return e


def toe(name, branch, nation, frontage, elements, ammo=20, echelon="brigade"):
    return {"name": name, "branch": branch, "armorRatio": 0, "frontageM": frontage, "supply": {"ammoCapacityT": ammo, "fuelCapacityT": 0, "fuelPerKmT": 0},
            "elements": elements, "symbol": {"echelon": echelon, "modifiers": []}, "nation": nation}


TOES = {
    # ---- フランス大陸軍:大隊は約700人、選抜中隊・軽歩兵の散兵が多い ----
    "nap-fr-line-bde": toe("戦列歩兵旅団(仏1805)", "line_infantry", "fr", 1200,
                           [el("戦列大隊", 5, 100, [("nap_musket", 4), ("nap_bayonet", 2)], "大隊"), el("選抜中隊(散兵)", 1, 40, [("nap_rifle", 2), ("nap_bayonet", 1)], "直轄")]),
    "nap-fr-light-bde": toe("軽歩兵旅団(仏1805)", "light_infantry", "fr", 1200,
                            [el("軽歩兵大隊", 5, 95, [("nap_musket", 3), ("nap_rifle", 2), ("nap_bayonet", 2)], "大隊")]),
    "nap-fr-guard-bde": toe("近衛歩兵旅団(仏1805)", "line_infantry", "fr", 1000,
                            [el("近衛擲弾兵・猟兵大隊", 4, 110, [("nap_musket", 4), ("nap_bayonet", 3)], "大隊")]),
    "nap-fr-cuir-bde": toe("胸甲騎兵旅団(仏1805)", "cavalry", "fr", 600, [el("胸甲騎兵連隊", 2, 70, [("nap_sabre_heavy", 4)], "連隊")], ammo=4),
    "nap-fr-drag-bde": toe("竜騎兵旅団(仏1805)", "cavalry", "fr", 600, [el("竜騎兵連隊", 2, 70, [("nap_sabre_heavy", 3), ("nap_carbine", 2)], "連隊")], ammo=6),
    "nap-fr-lcav-bde": toe("軽騎兵旅団(仏1805・猟騎兵・驃騎兵)", "light_cavalry", "fr", 600, [el("軽騎兵連隊", 2, 60, [("nap_sabre_light", 3), ("nap_carbine", 1)], "連隊")], ammo=4),
    "nap-fr-art": toe("師団砲兵(仏1805・8ポンド)", "artillery", "fr", 300, [el("徒歩砲兵中隊", 2, 40, [("nap_gun_6pdr", 6), ("nap_howitzer", 2)], "中隊")], ammo=30, echelon="battalion"),
    "nap-fr-horse-art": toe("騎砲兵(仏1805)", "horse_artillery", "fr", 300, [el("騎砲兵中隊", 1, 35, [("nap_gun_6pdr", 6)], "中隊")], ammo=15, echelon="battalion"),
    "nap-fr-res-art": toe("予備砲兵(仏1805・12ポンド)", "artillery", "fr", 300, [el("12ポンド砲中隊", 2, 45, [("nap_gun_12pdr", 6), ("nap_howitzer", 2)], "中隊")], ammo=40, echelon="battalion"),
    # ---- オーストリア軍:大隊が大きく(約800人)、散兵が少ない(国境歩兵だけ) ----
    "nap-at-line-bde": toe("戦列歩兵旅団(墺1805)", "line_infantry", "at", 1300, [el("戦列大隊", 6, 105, [("nap_musket", 4), ("nap_bayonet", 2)], "大隊")]),
    "nap-at-grenz-bde": toe("国境歩兵旅団(墺1805・グレンツ)", "light_infantry", "at", 1000, [el("国境歩兵大隊", 4, 90, [("nap_musket", 3), ("nap_rifle", 2), ("nap_bayonet", 1)], "大隊")]),
    "nap-at-cav-bde": toe("重騎兵旅団(墺1805・胸甲騎兵・竜騎兵)", "cavalry", "at", 600, [el("騎兵連隊", 2, 70, [("nap_sabre_heavy", 4)], "連隊")], ammo=4),
    "nap-at-lcav-bde": toe("軽騎兵旅団(墺1805・驃騎兵・シュヴォーレジェ)", "light_cavalry", "at", 600, [el("軽騎兵連隊", 2, 60, [("nap_sabre_light", 3), ("nap_carbine", 1)], "連隊")], ammo=4),
    "nap-at-art": toe("旅団砲兵(墺1805・6ポンド)", "artillery", "at", 300, [el("砲兵中隊", 2, 40, [("nap_gun_6pdr", 6), ("nap_howitzer", 2)], "中隊")], ammo=30, echelon="battalion"),
    # ---- ロシア軍:大隊は小さく(約550人)、銃剣を重んじる。砲は重い ----
    "nap-ru-line-bde": toe("歩兵旅団(露1805・マスケット銃兵・擲弾兵)", "line_infantry", "ru", 1100, [el("歩兵大隊", 6, 80, [("nap_musket", 3), ("nap_bayonet", 3)], "大隊")]),
    "nap-ru-jager-bde": toe("猟兵旅団(露1805)", "light_infantry", "ru", 1000, [el("猟兵大隊", 4, 80, [("nap_musket", 3), ("nap_rifle", 2), ("nap_bayonet", 2)], "大隊")]),
    "nap-ru-guard-bde": toe("近衛歩兵旅団(露1805)", "line_infantry", "ru", 1000, [el("近衛大隊", 4, 100, [("nap_musket", 4), ("nap_bayonet", 3)], "大隊")]),
    "nap-ru-cuir-bde": toe("胸甲騎兵旅団(露1805)", "cavalry", "ru", 600, [el("胸甲騎兵・竜騎兵連隊", 2, 70, [("nap_sabre_heavy", 4)], "連隊")], ammo=4),
    "nap-ru-cossack-bde": toe("コサック旅団(露1805)", "light_cavalry", "ru", 700, [el("コサック連隊", 2, 55, [("nap_lance", 3)], "連隊")], ammo=2),
    "nap-ru-art": toe("陣地砲兵(露1805・12ポンド)", "artillery", "ru", 300, [el("陣地砲兵中隊", 2, 45, [("nap_gun_12pdr", 6), ("nap_howitzer", 2)], "中隊")], ammo=40, echelon="battalion"),
    # 輜重(輸送の護衛で送り届ける荷馬車の列)
    "nap-supply-train": toe("輜重隊(荷馬車)", "line_infantry", "generic", 400, [el("荷馬車の列と護衛", 1, 40, [("nap_musket", 1)])], ammo=60, echelon="battalion"),
}

(ROOT / "data/weapons/napoleonic.json").write_text(json.dumps({"id": "napoleonic", "notes": "ナポレオン戦争の武器(仮置き。tools/packs/build_napoleonic.py)", "weapons": WEAPONS}, ensure_ascii=False, indent=2) + "\n")
(ROOT / "data/toe/napoleonic.json").write_text(json.dumps({"id": "napoleonic", "notes": "ナポレオン戦争の編成表(旅団。仮置き。tools/packs/build_napoleonic.py)", "toes": TOES}, ensure_ascii=False, indent=2) + "\n")
print("wrote napoleonic weapons/toe", len(WEAPONS), len(TOES))
