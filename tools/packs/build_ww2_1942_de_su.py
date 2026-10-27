"""
1942年の独ソ(東部戦線・青作戦のころ)の武器パックと編成パック(data/weapons/ww2-1942-de-su.json・data/toe/ww2-1942-de-su.json)を作る。
汎用のパック(ww1-korea-generic)の後ろに重ねて使う。

方針(米独1944年・太平洋のパックと同じ):
- 火力(距離帯の power)・効き目・編成表の要素の数と武器の数は、汎用の元の武器・編成表を写す(抽象のまま)。
  変えるのは射程・貫通力(mm、垂直から30°の板が基本)・装甲厚(実質の mm)
- 根拠は docs/research/weapons-1942-de-su.md(検索結果の要約による二次資料)。幅のある値は低い方。分からない値は TODO(要裏取り)
- 時代に注意:パンツァーファウスト・パンツァーシュレック(1943年〜)、ティーガー(1942年8月〜、レニングラード方面)、
  T-34 の六角砲塔のうち後期のもの、SU-76・SU-122(1942年12月〜)は入れない
- IV号戦車の短砲身(KwK 37 L/24)は貫通力の表が見つからなかったので入れていない(青作戦では長砲身 F2 と混在)。TODO(要裏取り)

実行:python3 tools/packs/build_ww2_1942_de_su.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEN_W = json.loads((ROOT / "data/weapons/ww1-korea-generic.json").read_text())["weapons"]
GEN_T = json.loads((ROOT / "data/toe/ww1-korea-generic.json").read_text())["toes"]


def bands(base, pen, far_notes, wid):
    """汎用の距離帯に貫通力の表を重ねる(各帯は遠い端以上でいちばん近い表の値。表より遠い帯は最後の値で TODO)"""
    edges = sorted({b["maxRangeM"] for b in base} | {d for d, _ in pen if d < base[-1]["maxRangeM"]})
    out = []
    for e in edges:
        power = next(b["power"] for b in base if e <= b["maxRangeM"])
        p = next((v for d, v in pen if d >= e), None)
        if p is None:
            p = pen[-1][1]
            if wid not in far_notes:
                far_notes.append(wid)
        if out and out[-1]["power"] == power and out[-1]["penetrationMm"] == p:
            out[-1]["maxRangeM"] = e
        else:
            out.append({"maxRangeM": e, "power": power, "penetrationMm": p})
    return out


def copy(base, name, **over):
    w = json.loads(json.dumps(GEN_W[base]))
    w["name"] = name
    w.update(over)
    return w


far = []
weapons = {}

# ---- ドイツ軍 ----
# 5cm KwK 38 L/42(III号戦車 J の前期):PzGr、30°で 53/100・43/500・32/1000(Wikipedia、panzerworld と一致。信頼度 中)
weapons["de_50mm_kwk38"] = copy("tank_gun", "5cm KwK 38 L/42(III号戦車 J)", bands=bands(GEN_W["tank_gun"]["bands"], [(100, 53), (500, 43), (1000, 32), (1500, 24)], far, "de_50mm_kwk38"))
# 5cm KwK 39 L/60(III号戦車 J 後期・L):PzGr、30°で 67/100・57/500・44/1000・34/1500(Wikipedia。PzGr 39 は 69/59/48/37 とする別の表 → 低い方。信頼度 中)
weapons["de_50mm_kwk39"] = copy("tank_gun", "5cm KwK 39 L/60(III号戦車 J・L)", bands=bands(GEN_W["tank_gun"]["bands"], [(100, 67), (500, 57), (1000, 44), (1500, 34)], far, "de_50mm_kwk39"))
# 7.5cm KwK 40 L/43(IV号戦車 F2・G):L/43 の30°の表は見つからなかった。同じ PzGr 39 の Pak 39 L/48(106/96/82)・Pak 40(108/96/80)の低い方
# 96/500・80/1000 を使う(L/43 は初速が少し低いので、実際はもう少し低い。信頼度 低)。TODO(要裏取り):Jentz『Panzer Tracts』No.4
weapons["de_75mm_kwk40"] = copy("tank_gun", "7.5cm KwK 40 L/43(IV号戦車 F2)", bands=bands(GEN_W["tank_gun"]["bands"], [(500, 96), (1000, 80)], far, "de_75mm_kwk40"))
# 7.5cm StuK 40 L/43(III号突撃砲 F):KwK 40 と同じ砲(信頼度 低。同上)
weapons["de_75mm_stuk40"] = copy("td_gun", "7.5cm StuK 40 L/43(III号突撃砲 F)", bands=bands(GEN_W["td_gun"]["bands"], [(500, 96), (1000, 80)], far, "de_75mm_stuk40"))
# 5cm Pak 38:Pak 38 そのものの表は見つからなかった。同じ L/60 の砲身から作った KwK 39 の値を使う(信頼度 低〜中)
weapons["de_50mm_pak38"] = copy("at_gun", "5cm Pak 38", bands=bands(GEN_W["at_gun"]["bands"], [(100, 67), (500, 57), (1000, 44), (1500, 34)], far, "de_50mm_pak38"))
# 対戦車銃 PzB 39(7.92mm):30/100・25/300(2件で一致。角度は出典で違う。信頼度 中〜低)。火力は汎用の携行対戦車火器より弱く(仮置き)
weapons["de_pzb39"] = {
    "name": "対戦車銃 PzB 39",
    "bands": [{"maxRangeM": 100, "power": 0.6, "penetrationMm": 30}, {"maxRangeM": 300, "power": 0.3, "penetrationMm": 25}],
    "effectiveness": {"soft": 0.2, "armored": 1.0},
    "indirect": False,
    "ammoPerMin": 0.0008,
    "suppression": 0.3,
    "antiAir": 0,
}
# 10.5cm leFH 18:最大 10,675m(Wikipedia、ほか1件で一致。信頼度 中〜高)。火力は汎用の榴弾砲と同じ
weapons["de_105mm_lefh18"] = copy("howitzer", "10.5cm leFH 18", bands=[{"maxRangeM": 10675, "power": GEN_W["howitzer"]["bands"][0]["power"]}])

# ---- ソ連軍 ----
# 76mm F-34(T-34)・ZiS-5(KV-1):BR-350A。Wikipedia の F-34 の表は 69/500・61/1000(列がずれて読みにくい)、ZiS-3 の表(ソ連の方式、
# 60°の当たり=垂直から30°、75%貫通)は 61/500・55/1000。砲身長がほぼ同じなので低い方の ZiS-3 の値を使う(信頼度 低〜中)
weapons["su_76mm_f34"] = copy("tank_gun", "76mm F-34(T-34)", bands=bands(GEN_W["tank_gun"]["bands"], [(500, 61), (1000, 55)], far, "su_76mm_f34"))
weapons["su_76mm_zis5"] = copy("tank_gun", "76mm ZiS-5(KV-1)", bands=bands(GEN_W["tank_gun"]["bands"], [(500, 61), (1000, 55)], far, "su_76mm_zis5"))
# 45mm 20-K(T-70):53-K と同じ弾道の戦車砲とみなし、53-K の低い方の値(信頼度 低)。TODO(要裏取り):NII-48 の試験記録
weapons["su_45mm_20k"] = copy("tank_gun", "45mm 20-K(T-70)", bands=bands(GEN_W["tank_gun"]["bands"], [(500, 43), (1000, 35)], far, "su_45mm_20k"))
# 20mm TNSh(T-60):15/500(複数の出典)、7/1000(ゲームの wiki)。信頼度 低
weapons["su_20mm_tnsh"] = copy("tank_gun", "20mm TNSh(T-60)", bands=bands(GEN_W["tank_gun"]["bands"], [(500, 15), (1000, 7)], far, "su_20mm_tnsh"))
# 45mm 対戦車砲 53-K(1937年型):43/500・35/1000(Honner『Guns vs Armour』、別の表は 53/40 → 低い方。信頼度 中〜低)。
# M-42(1942年型)は数がまだ少ないとして入れない。TODO(要裏取り)
weapons["su_45mm_53k"] = copy("at_gun", "45mm対戦車砲 53-K", bands=bands(GEN_W["at_gun"]["bands"], [(500, 43), (1000, 35)], far, "su_45mm_53k"))
# 対戦車銃 PTRD(14.5mm):40/100・30/500(出典1件。信頼度 低)。火力は PzB 39 と同じ(仮置き)
weapons["su_ptrd"] = {
    "name": "対戦車銃 PTRD",
    "bands": [{"maxRangeM": 100, "power": 0.6, "penetrationMm": 40}, {"maxRangeM": 500, "power": 0.3, "penetrationMm": 30}],
    "effectiveness": {"soft": 0.2, "armored": 1.0},
    "indirect": False,
    "ammoPerMin": 0.0008,
    "suppression": 0.3,
    "antiAir": 0,
}
# 76mm 師団砲 ZiS-3:最大 13,290m(Wikipedia、信頼度 中〜高)。間接射撃の火力は口径が小さいので汎用の榴弾砲の8割(仮置き)
weapons["su_76mm_zis3"] = copy("howitzer", "76mm師団砲 ZiS-3", bands=[{"maxRangeM": 13290, "power": round(GEN_W["howitzer"]["bands"][0]["power"] * 0.8, 3)}])

for w in weapons.values():
    w.setdefault("suppression", 1)
    w.setdefault("antiAir", 0)

# ---- 装甲厚(実質、mm) ----
ARMOR = {
    # III号戦車 J:前面50(後面も50)。J1・L は前面と砲塔に20mmの間隔装甲を足した(実質は足さない=低い方)。側面30(E〜G の値。J は TODO(要裏取り))。
    # 砲塔前面50(57 とする出典はゲームの wiki)、砲塔側面30(TODO)。信頼度 中
    "pz3j": {"front": 50, "side": 30, "rear": 50, "turretFront": 50, "turretSide": 30},
    # IV号戦車 F2:前面・砲塔前面50、側面30(F1 から。Wikipedia・fox3000)、後面20(G のゲームの wiki)。信頼度 中
    "pz4f2": {"front": 50, "side": 30, "rear": 20, "turretFront": 50, "turretSide": 30},
    # III号突撃砲 F:前面50(1942年10月から30mmの増加装甲を足した車がある → 足さない)、側面30、後面は TODO(30 で仮置き)。信頼度 中
    "stug3f": {"front": 50, "side": 30, "rear": 30},
    # T-34(1942):車体前面 45mm@60° → 約90(計算)、側面 40mm@41° → 約53(計算)、後面40(TODO(要裏取り))。
    # 砲塔前面45(1941年型。60 とする出典もある → 低い方)、砲塔側面 52mm@30° → 約60(計算)。信頼度 中
    "t34": {"front": 90, "side": 53, "rear": 40, "turretFront": 45, "turretSide": 60},
    # KV-1:「全周75mm」(1942年の情報資料の要約)。「85〜60mm」とする出典もある → 後面は60。信頼度 中〜低
    "kv1": {"front": 75, "side": 75, "rear": 60, "turretFront": 75, "turretSide": 75},
    # T-60:前面20〜35(出典で食い違う → 低い方の20)、側面15。信頼度 低
    "t60": {"front": 20, "side": 15, "rear": 15},
    # T-70:砲塔前面50・砲塔側面35・車体側面15(Wikipedia)。車体前面は見つからなかった → 砲塔側面と同じ35で仮置き(TODO(要裏取り))。信頼度 低〜中
    "t70": {"front": 35, "side": 15, "rear": 15, "turretFront": 50, "turretSide": 35},
}


def swap(toe, mapping, name, extra=None, armor=None):
    t = json.loads(json.dumps(GEN_T[toe]))
    t["name"] = name
    for e in t["elements"]:
        for r in e["weapons"]:
            r["weapon"] = mapping.get(r["weapon"], r["weapon"])
        if e.get("armored") and armor:
            e["armorMm"] = ARMOR[armor]
    for e in extra or []:
        t["elements"].append(e)
    return t


TANK_CO = GEN_T["tank_battalion"]["elements"][0]


def tank_co(name, gun, armor, count):
    """汎用の戦車中隊(戦車砲4・機関銃2)を写して、砲と装甲を替える"""
    e = json.loads(json.dumps(TANK_CO))
    e["name"] = name
    e["count"] = count
    e["weapons"] = [{"weapon": gun, "count": 4}, {"weapon": "machine_gun", "count": 2}]
    e["armorMm"] = ARMOR[armor]
    return e


DE_INF = {"rocket_launcher": "de_pzb39", "at_gun": "de_50mm_pak38"}
SU_INF = {"rocket_launcher": "su_ptrd", "at_gun": "su_45mm_53k"}

toes = {
    # ドイツの歩兵連隊(1942):汎用の連隊の携行対戦車火器を PzB 39 に。連隊の戦車猟兵中隊(Pak 38。3.7cm Pak 36 も混在したが、ここでは Pak 38 だけ)。
    # 定数は TODO(要裏取り):Niehorster の1942年の表、KStN
    "de_infantry_regiment_1942": swap("infantry_regiment", DE_INF, "歩兵連隊(独1942)",
                                      extra=[{"name": "戦車猟兵中隊", "count": 1, "hitPoints": 60, "weapons": [{"weapon": "de_50mm_pak38", "count": 2}]}]),
    # 狙撃兵(自動車化歩兵)連隊(1942年7月に装甲擲弾兵と改称):汎用の装甲擲弾兵連隊の形。車両で動く
    "de_motorized_infantry_regiment_1942": swap("panzergrenadier_regiment", DE_INF, "狙撃兵連隊(装甲師団・独1942)"),
    # 戦車連隊(1942):汎用の戦車連隊の形(中隊6)。III号 L/42 が3、III号 L/60 が2、IV号 F2 が1(混成の割合はゲームの見立て。
    # 青作戦のころの装甲師団の戦車の内訳は TODO(要裏取り):Jentz『Panzertruppen』)
    "de_panzer_regiment_1942": {
        **json.loads(json.dumps(GEN_T["panzer_regiment"])),
        "name": "戦車連隊(III号・IV号・独1942)",
        "elements": [
            tank_co("戦車中隊(III号 J・短砲身)", "de_50mm_kwk38", "pz3j", 3),
            tank_co("戦車中隊(III号 J/L・長砲身)", "de_50mm_kwk39", "pz3j", 2),
            tank_co("戦車中隊(IV号 F2)", "de_75mm_kwk40", "pz4f2", 1),
            json.loads(json.dumps(GEN_T["panzer_regiment"]["elements"][1])),
        ],
    },
    # 突撃砲大隊(III号突撃砲 F):汎用の戦車駆逐大隊の形(中隊3)
    "de_stug_battalion_1942": swap("tank_destroyer_battalion", {"td_gun": "de_75mm_stuk40"}, "突撃砲大隊(III号突撃砲 F・独1942)", armor="stug3f"),
    # 砲兵大隊(leFH 18)
    "de_artillery_battalion_1942": swap("artillery_battalion", {"howitzer": "de_105mm_lefh18"}, "砲兵大隊(leFH 18・独1942)"),
    # ソ連の狙撃兵連隊(1942):汎用の連隊の携行対戦車火器を PTRD に。連隊の対戦車中隊(45mm)。定数は TODO(要裏取り):shtat 04/200 ほか
    "su_rifle_regiment_1942": swap("infantry_regiment", SU_INF, "狙撃兵連隊(ソ1942)",
                                   extra=[{"name": "対戦車中隊(45mm)", "count": 1, "hitPoints": 60, "weapons": [{"weapon": "su_45mm_53k", "count": 2}]}]),
    # 戦車旅団(1942年7月の編制:T-34 32両・軽戦車21両・自動車化狙撃兵大隊。フォーラムの shtat 010/270 の引用、信頼度 低〜中)。
    # 要素は T-34 の中隊3・T-70 の中隊2・自動車化狙撃兵1(両数の比をおおよそ写す)
    "su_tank_brigade_1942": {
        **json.loads(json.dumps(GEN_T["panzer_regiment"])),
        "name": "戦車旅団(T-34・T-70・ソ1942)",
        "elements": [
            tank_co("戦車中隊(T-34)", "su_76mm_f34", "t34", 3),
            tank_co("戦車中隊(T-70)", "su_45mm_20k", "t70", 2),
            {"name": "自動車化狙撃兵中隊", "count": 1, "hitPoints": 100, "weapons": [{"weapon": "small_arms", "count": 4}, {"weapon": "machine_gun", "count": 2}, {"weapon": "su_ptrd", "count": 1}]},
        ],
        "symbol": {"echelon": "brigade", "modifiers": []},
    },
    # 独立重戦車大隊(KV-1。1942年7月から重戦車は独立の部隊に。信頼度 低〜中):汎用の戦車大隊の形
    "su_kv_battalion_1942": swap("tank_battalion", {"tank_gun": "su_76mm_zis5"}, "重戦車大隊(KV-1・ソ1942)", armor="kv1"),
    # 対戦車連隊(45mm):牽引砲の中隊の形(要素3、45mm 各2)。数は仮置き。TODO(要裏取り)
    "su_antitank_regiment_1942": {
        "name": "対戦車連隊(45mm・ソ1942)",
        "branch": "tank_destroyer",
        "armorRatio": 0,
        "frontageM": 600,
        "amphibious": False,
        "supply": {"ammoCapacityT": 10, "fuelCapacityT": 4, "fuelPerKmT": 0.03},
        "elements": [{"name": "対戦車中隊(45mm)", "count": 3, "hitPoints": 40, "weapons": [{"weapon": "su_45mm_53k", "count": 2}]}],
        "symbol": {"echelon": "regiment", "modifiers": []},
    },
    # 砲兵大隊(ZiS-3。122mm 榴弾砲 M-30 の射程は見つからなかったので、師団砲で代える)
    "su_artillery_battalion_1942": swap("artillery_battalion", {"howitzer": "su_76mm_zis3"}, "砲兵大隊(ZiS-3・ソ1942)"),
}

W_NOTES = (
    "1942年の独ソ(東部戦線)の武器。汎用の武器パック ww1-korea-generic の後ろに重ねて使う。射程・貫通力(垂直から30°の板が基本)の根拠と信頼度は "
    "docs/research/weapons-1942-de-su.md(検索結果の要約による二次資料)。独ソで貫通の判定基準が違い(ソ連は75%貫通)、出典で1〜2割ずれる。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。出典候補 Jentz『Panzer Tracts』、Bird & Livingston、NII-48 の試験記録。"
    "作り直しは tools/packs/build_ww2_1942_de_su.py"
)
T_NOTES = (
    "1942年の独ソ(東部戦線)の編成表。要素の数・武器の数は汎用の編成表を写した抽象で、武器をその国のものに替え、装甲の要素に装甲厚を書いた。"
    "根拠は docs/research/weapons-1942-de-su.md。TODO(要裏取り):独の歩兵連隊・戦車連隊の1942年の定数と戦車の内訳、ソ連の狙撃兵連隊(shtat 04/200 ほか)・"
    "対戦車連隊の定数。作り直しは tools/packs/build_ww2_1942_de_su.py"
)
(ROOT / "data/weapons/ww2-1942-de-su.json").write_text(json.dumps({"id": "ww2-1942-de-su", "notes": W_NOTES, "weapons": weapons}, ensure_ascii=False, indent=2) + "\n")
(ROOT / "data/toe/ww2-1942-de-su.json").write_text(json.dumps({"id": "ww2-1942-de-su", "notes": T_NOTES, "toes": toes}, ensure_ascii=False, indent=2) + "\n")
print("weapons", len(weapons), "toes", len(toes), "far", far)
