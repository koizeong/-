"""
太平洋・マレー(1941〜45年)の武器パックと編成パック(data/weapons/ww2-pacific.json・data/toe/ww2-pacific.json)を作る。
汎用のパック(ww1-korea-generic)と米独1944年のパック(ww2-1944-us-de)の後ろに重ねて使う。

方針(米独1944年のパックと同じ):
- 火力(距離帯の power)・効き目・編成表の要素の数と武器の数は、汎用の元の武器・編成表を写す(抽象のまま)。
  変えるのは射程・貫通力(mm)・装甲厚(mm)と、武器の性質(曲射・陣地に強い)
- 汎用に元のない武器(擲弾筒・迫撃砲・火炎放射器・対戦車銃)の火力は仮置き
- 根拠は docs/research/pacific-weapons-1941-45.md(検索結果の要約による二次資料)。信頼度が低い値はそう書く。
  幅のある値は低い方。分からない値は TODO(要裏取り)
- 時代に注意:刺突爆雷(1944年〜)・新砲塔チハ(1942年〜)・M9 バズーカ(1943年12月〜)はマレー・ガダルカナルに入れない

実行:python3 tools/packs/build_ww2_pacific.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEN_W = json.loads((ROOT / "data/weapons/ww1-korea-generic.json").read_text())["weapons"]
GEN_T = json.loads((ROOT / "data/toe/ww1-korea-generic.json").read_text())["toes"]
YD = 0.9144


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

# ---- 日本陸軍 ----
# 八九式重擲弾筒:八九式榴弾で最大670m・有効120m(Wikipedia・TM-E 30-480、信頼度 中〜高)。曲射(間の部隊にさえぎられない)。火力は仮置き
weapons["jp_type89_discharger"] = {
    "name": "八九式重擲弾筒",
    "bands": [{"maxRangeM": 120, "power": 1.0}, {"maxRangeM": 670, "power": 0.5}],
    "effectiveness": {"soft": 1.0, "armored": 0.05},
    "indirect": False,
    "ammoPerMin": 0.0015,
    "suppression": 1.2,
    "antiAir": 0,
    "arcing": True,
}
# 九二式歩兵砲(大隊砲、70mm):最大2,785m・有効約1,370m(米情報資料)。曲射の直接射撃として、有効射程まで。火力は仮置き
weapons["jp_type92_battalion_gun"] = {
    "name": "九二式歩兵砲(大隊砲)",
    "bands": [{"maxRangeM": 1370, "power": 2.0}],
    "effectiveness": {"soft": 1.0, "armored": 0.3},
    "indirect": False,
    "ammoPerMin": 0.004,
    "suppression": 1.4,
    "antiAir": 0,
    "arcing": True,
}
# 九四式三十七粍砲(速射砲):約40mm/500m・約30mm/1,000m(valka.cz、信頼度 低)。TODO(要裏取り):陸軍技術本部の試験記録、TM-E 30-480 第9章
weapons["jp_type94_37mm"] = copy("at_gun", "九四式三十七粍砲(速射砲)", bands=bands(GEN_W["at_gun"]["bands"], [(500, 40), (1000, 30)], far, "jp_type94_37mm"))
# 一式機動四十七粍速射砲:40mm/500m・30mm/1,000m(Wikipedia 一式中戦車の項の戦車砲、信頼度 中〜低。出典で30〜67mm/500mと食い違う)。
# 1942年〜(マレー・ガダルカナルには入れない)。TODO(要裏取り):米軍の鹵獲試験、CINCPAC Bulletin 152-45
weapons["jp_type1_47mm"] = copy("at_gun", "一式機動四十七粍速射砲", bands=bands(GEN_W["at_gun"]["bands"], [(500, 40), (1000, 30)], far, "jp_type1_47mm"))
# 九七式五糎七戦車砲(チハ、短砲身):約25mm/1,000m(信頼度 低)。榴弾が主。TODO(要裏取り)
weapons["jp_type97_57mm"] = copy("tank_gun", "九七式五糎七戦車砲(九七式中戦車)", bands=bands(GEN_W["tank_gun"]["bands"], [(1000, 25)], far, "jp_type97_57mm"))
# 九四式三十七粍戦車砲(九五式軽戦車):36mm/275m(Wikipedia、信頼度 中〜低)、約25mm/500m(信頼度 低)
weapons["jp_type94_37mm_tank"] = copy("tank_gun", "九四式三十七粍戦車砲(九五式軽戦車)", bands=bands(GEN_W["tank_gun"]["bands"], [(275, 36), (500, 25)], far, "jp_type94_37mm_tank"))
# 九三式・一〇〇式火炎放射器:射程23〜27m(米情報資料・Wikipedia、信頼度 中〜高)。工兵の装備で歩兵連隊の定数には入らない可能性 → 編成表には入れない
weapons["jp_type100_flamethrower"] = {
    "name": "一〇〇式火炎放射器",
    "bands": [{"maxRangeM": 23, "power": 2.0}],
    "effectiveness": {"soft": 1.0, "armored": 0.3},
    "indirect": False,
    "ammoPerMin": 0.002,
    "suppression": 1.5,
    "antiAir": 0,
    "entrenchmentPierce": 0.8,
}

# ---- 英連邦(1941〜42年) ----
# ボーイズ対戦車銃:23.2mm/91m・18.8mm/460m(垂直、Wikipedia、信頼度 中)。推奨100ヤード。火力は仮置き(汎用の携行対戦車火器より弱く)
weapons["uk_boys_atr"] = {
    "name": "ボーイズ対戦車銃",
    "bands": [{"maxRangeM": 91, "power": 0.6, "penetrationMm": 23}, {"maxRangeM": 460, "power": 0.3, "penetrationMm": 19}],
    "effectiveness": {"soft": 0.2, "armored": 1.0},
    "indirect": False,
    "ammoPerMin": 0.0008,
    "suppression": 0.3,
    "antiAir": 0,
}
# 2ポンド対戦車砲:30°で 47mm/460m・40mm/910m・34mm/1,400m(収集家のフォーラム、信頼度 低)。1941〜42年は AP 弾。TODO(要裏取り):Bird & Livingston
weapons["uk_2pdr"] = copy("at_gun", "2ポンド対戦車砲", bands=bands(GEN_W["at_gun"]["bands"], [(460, 47), (910, 40), (1400, 34)], far, "uk_2pdr"))
# 3インチ迫撃砲 Mk II:1941〜42年は最大1,600ヤード(1,460m。長射程化は1942年ごろ、信頼度 中)。曲射の直接射撃。火力は仮置き
weapons["uk_3in_mortar"] = {
    "name": "3インチ迫撃砲",
    "bands": [{"maxRangeM": 1460, "power": 1.5}],
    "effectiveness": {"soft": 1.0, "armored": 0.2},
    "indirect": False,
    "ammoPerMin": 0.004,
    "suppression": 1.5,
    "antiAir": 0,
    "arcing": True,
}
# 25ポンド砲:最大10,515m(スーパーチャージなし。12,253mはあり。信頼度 中〜高)。火力は汎用の榴弾砲と同じ
weapons["uk_25pdr"] = copy("howitzer", "25ポンド砲", bands=[{"maxRangeM": 10515, "power": GEN_W["howitzer"]["bands"][0]["power"]}])

# ---- 米海兵隊 ----
# M2火炎放射器:液体燃料20ヤード・増粘燃料40ヤード(37m)。F編制で大隊に27挺(HyperWar の編制表、信頼度 高)
weapons["usmc_m2_flamethrower"] = {
    "name": "M2火炎放射器",
    "bands": [{"maxRangeM": round(40 * YD), "power": 2.0}],
    "effectiveness": {"soft": 1.0, "armored": 0.3},
    "indirect": False,
    "ammoPerMin": 0.002,
    "suppression": 1.5,
    "antiAir": 0,
    "entrenchmentPierce": 0.8,
}
# バズーカ M1A1:貫通 76〜100mm(低い方。信頼度 中〜低)、実用150ヤード(137m)。1943年〜の海兵隊。火力は汎用の携行対戦車火器と同じ
weapons["usmc_bazooka"] = copy("rocket_launcher", "バズーカ M1A1", bands=[{"maxRangeM": 137, "power": 1.0, "penetrationMm": 76}, {"maxRangeM": 300, "power": 0.4, "penetrationMm": 76}])
# 60mm 迫撃砲 M2:最大1,815m(信頼度 中)。81mm 迫撃砲 M1:最大約3,000m(信頼度 中)。曲射の直接射撃。火力は仮置き
weapons["us_60mm_mortar"] = {
    "name": "60mm迫撃砲 M2",
    "bands": [{"maxRangeM": 1815, "power": 1.0}],
    "effectiveness": {"soft": 1.0, "armored": 0.1},
    "indirect": False,
    "ammoPerMin": 0.002,
    "suppression": 1.3,
    "antiAir": 0,
    "arcing": True,
}
weapons["us_81mm_mortar"] = {
    "name": "81mm迫撃砲 M1",
    "bands": [{"maxRangeM": 3000, "power": 1.6}],
    "effectiveness": {"soft": 1.0, "armored": 0.2},
    "indirect": False,
    "ammoPerMin": 0.004,
    "suppression": 1.5,
    "antiAir": 0,
    "arcing": True,
}
# 75mm 榴弾砲 M1(パックハウザー):最大約8,790m(信頼度 中〜高)。火力は汎用の榴弾砲の8割(仮置き。口径が小さい)
weapons["us_75mm_pack"] = copy("howitzer", "75mm榴弾砲 M1(パックハウザー)", bands=[{"maxRangeM": 8790, "power": round(GEN_W["howitzer"]["bands"][0]["power"] * 0.8, 3)}])
# 37mm 対戦車砲 M3:30°で 53mm/457m・46mm/914m(フォーラム、信頼度 低)。太平洋ではキャニスター弾で対人に多用(効き目の soft を汎用より上げる。仮置き)
weapons["us_37mm_m3"] = copy("at_gun", "37mm対戦車砲 M3", bands=bands(GEN_W["at_gun"]["bands"], [(457, 53), (914, 46)], far, "us_37mm_m3"), effectiveness={"soft": 0.6, "armored": 1.0})

for w in weapons.values():
    w.setdefault("suppression", 1)
    w.setdefault("antiAir", 0)

# ---- 装甲厚(実質、mm) ----
ARMOR = {
    # 九七式中戦車(旧砲塔):前面15〜25(防盾25)、側面25(Wikipedia ほか、信頼度 中。食い違いあり → 前面は低い方の範囲の上=25 ではなく、資料の「最大25」をそのまま)
    # TODO(要裏取り):TM-E 30-480 Section IV、Zaloga『Japanese Tanks 1939–45』
    "chiha": {"front": 25, "side": 25, "rear": 20, "turretFront": 25, "turretSide": 25},
    # 九五式軽戦車:12(ゲームの値。信頼度 低)。TODO(要裏取り)
    "hago": {"front": 12, "side": 12, "rear": 12},
    # M4A2:前面 51mm@56° → 約91(1944年の M4 と同じ計算)、側面38、砲塔前面76・側面51(信頼度 中〜低)
    "m4a2": {"front": 91, "side": 38, "rear": 38, "turretFront": 76, "turretSide": 51},
    # ユニバーサル・キャリア Mk I:前面 約10、側面 約7(信頼度 中)
    "carrier": {"front": 10, "side": 7, "rear": 7},
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


JP = {"rocket_launcher": "jp_type89_discharger", "at_gun": "jp_type94_37mm"}


def BN_GUN(n):
    """大隊砲小隊(九二式歩兵砲2門)。数は武器の数の抽象(汎用の編成表に合わせて1個大隊あたり1)"""
    return {"name": "大隊砲小隊", "count": n, "hitPoints": 30, "weapons": [{"weapon": "jp_type92_battalion_gun", "count": 1}]}
toes = {
    # 日本の歩兵連隊・大隊(1941〜42年):中隊は小銃139・軽機9・擲弾筒9(TM-E 30-480 1944年版、信頼度 中)。汎用の小銃中隊の携行対戦車火器を擲弾筒に、
    # 重火器中隊(大隊の機関銃中隊)に大隊砲を足す(大隊砲小隊2門)。連隊に速射砲中隊(37mm 6門。3個小隊×2門)。連隊砲(四一式山砲 4門)は入れていない
    # (間接射撃の武器を持つと砲兵の扱いになるため。TODO)。甲・乙の正確な定数は TODO(要裏取り):Niehorster の1941年12月8日の表、TM 30-480(1941)
    "jp_infantry_regiment_1941": swap(
        "infantry_regiment",
        JP,
        "歩兵連隊(日本1941)",
        extra=[{"name": "速射砲中隊", "count": 1, "hitPoints": 60, "weapons": [{"weapon": "jp_type94_37mm", "count": 2}]}, BN_GUN(3)],
    ),
    "jp_infantry_battalion_1941": swap("infantry_battalion", JP, "歩兵大隊(日本1941)", extra=[BN_GUN(1)]),
    # ガダルカナルの川口支隊の大隊:山砲・大隊砲・速射砲はジャングルを越える途中でほとんど置いてきた(Miller『Guadalcanal: The First Offensive』第5章)。
    # 大隊砲を持たない形。docs/research/edson-ridge-1942-09.md
    "jp_infantry_battalion_1942_light": swap("infantry_battalion", JP, "歩兵大隊(日本1942・砲なし)"),
    # 1944〜45年の大隊(硫黄島):速射砲を一式47mmに。刺突爆雷は入れていない(効き目の値が不明)。守備隊の正確な編成は TODO(要裏取り)
    "jp_infantry_battalion_1944": swap("infantry_battalion", {**JP, "at_gun": "jp_type1_47mm"}, "歩兵大隊(日本1944)",
                                       extra=[BN_GUN(1), {"name": "速射砲小隊", "count": 1, "hitPoints": 40, "weapons": [{"weapon": "jp_type1_47mm", "count": 1}]}]),
    # 独立速射砲大隊(一式47mm):牽引砲の中隊の形(要素3、47mm 各1)。硫黄島の独立速射砲第10大隊など。中隊・門数は TODO(要裏取り:『戦史叢書』、Hyperwar の日本軍戦闘序列)
    "jp_antitank_battalion_1944": {
        "name": "独立速射砲大隊(一式47mm・日本1944)",
        "branch": "tank_destroyer",
        "armorRatio": 0,
        "frontageM": 400,
        "amphibious": False,
        "supply": {"ammoCapacityT": 8, "fuelCapacityT": 2, "fuelPerKmT": 0.02},
        "elements": [{"name": "速射砲中隊", "count": 3, "hitPoints": 40, "weapons": [{"weapon": "jp_type1_47mm", "count": 1}]}],
        "symbol": {"echelon": "battalion", "modifiers": []},
    },
    # 戦車連隊(九七式中戦車):汎用の戦車大隊の形(中隊3)。スリム川の島田戦車隊(九七式 約17・九五式 3)は、この編成表の戦力を下げて置く
    # TODO(要裏取り):第3戦車団の連隊ごとの中隊数・両数(Niehorster、『戦史叢書 マレー進攻作戦』)
    "jp_tank_regiment_chiha": swap("tank_battalion", {**JP, "tank_gun": "jp_type97_57mm"}, "戦車連隊(九七式中戦車・日本1941)", armor="chiha"),
    # 英連邦の歩兵大隊(1941年):汎用の大隊に、ボーイズ対戦車銃と3インチ迫撃砲。大隊の定数は TODO(要裏取り):bayonetstrength.uk の1941年6月の表
    "uk_infantry_battalion_1941": swap("infantry_battalion", {"rocket_launcher": "uk_boys_atr"}, "歩兵大隊(英連邦1941)"),
    # 対戦車中隊(2ポンド砲):汎用の駆逐大隊の形を写さず、牽引砲の中隊として(要素1、2ポンド砲4)。数は仮置き
    "uk_antitank_battery_1941": {
        "name": "対戦車中隊(2ポンド砲・英連邦1941)",
        "branch": "tank_destroyer",
        "armorRatio": 0,
        "frontageM": 300,
        "amphibious": False,
        "supply": {"ammoCapacityT": 8, "fuelCapacityT": 4, "fuelPerKmT": 0.02},
        "elements": [{"name": "2ポンド砲小隊", "count": 3, "hitPoints": 40, "weapons": [{"weapon": "uk_2pdr", "count": 1}]}],
        "symbol": {"echelon": "company", "modifiers": []},
    },
    # 野砲大隊(25ポンド砲):汎用の砲兵大隊の榴弾砲を25ポンド砲に
    "uk_field_regiment_1941": swap("artillery_battalion", {"howitzer": "uk_25pdr"}, "野砲大隊(25ポンド砲・英連邦1941)"),
    # 米海兵隊 D編制(1942年)の大隊:バズーカはまだない。中隊に60mm迫撃砲、武器中隊に81mm迫撃砲(D編制、battleorder・HyperWar 付録I、信頼度 中〜高)
    "usmc_infantry_battalion_1942": swap("infantry_battalion", {"rocket_launcher": "us_60mm_mortar"}, "海兵大隊(D編制1942)",
                                         extra=[{"name": "81mm迫撃砲小隊", "count": 1, "hitPoints": 40, "weapons": [{"weapon": "us_81mm_mortar", "count": 1}]}]),
    # 米海兵隊 F編制(1944年)の大隊:火炎放射器27/大隊・BAR 81/大隊(HyperWar の F編制の表、信頼度 高)。中隊の本部が火炎放射器・ロケット発射器を持つ
    "usmc_infantry_battalion_1944": swap("infantry_battalion", {"rocket_launcher": "usmc_bazooka"}, "海兵大隊(F編制1944)",
                                         extra=[{"name": "火炎放射・爆破班", "count": 3, "hitPoints": 20, "weapons": [{"weapon": "usmc_m2_flamethrower", "count": 3}]},
                                                {"name": "81mm迫撃砲小隊", "count": 1, "hitPoints": 40, "weapons": [{"weapon": "us_81mm_mortar", "count": 1}]}]),
    # 米海兵の戦車中隊(F編制、M4 15両):汎用の機甲任務部隊の戦車中隊を写す(戦車中隊1、随伴の機甲歩兵はない)
    "usmc_tank_company_1944": {
        **json.loads(json.dumps(GEN_T["armored_task_force"])),
        "name": "戦車中隊(M4A2・海兵1944)",
        "elements": [
            {**json.loads(json.dumps(GEN_T["armored_task_force"]["elements"][0])), "name": "戦車中隊(M4A2)",
             "weapons": [{"weapon": "us_75mm_m3", "count": 4}, {"weapon": "machine_gun", "count": 2}], "armorMm": ARMOR["m4a2"]},
        ],
        "symbol": {"echelon": "company", "modifiers": []},
    },
    # 海兵の砲兵大隊(75mm パックハウザー)
    "usmc_pack_howitzer_battalion": swap("artillery_battalion", {"howitzer": "us_75mm_pack"}, "砲兵大隊(75mm榴弾砲・海兵)"),
}

# 汎用の大隊の形を写した連隊は、地図の記号の規模を連隊に(表示だけ)
toes["jp_tank_regiment_chiha"]["symbol"] = {"echelon": "regiment", "modifiers": []}

W_NOTES = (
    "太平洋・マレー(1941〜45年)の武器(日本・英連邦・米海兵隊)。汎用の武器パック ww1-korea-generic と米独1944年のパック ww2-1944-us-de の後ろに重ねて使う。"
    "射程・貫通力の根拠と信頼度は docs/research/pacific-weapons-1941-45.md(検索結果の要約による二次資料)。日本・英の対戦車砲の貫通力は信頼度が低い(出典で2倍ほど違う)。"
    "汎用に元のない武器(擲弾筒・迫撃砲・火炎放射器・対戦車銃)の火力は仮置き。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。出典候補 Bird & Livingston、米軍の鹵獲試験、TM-E 30-480。作り直しは tools/packs/build_ww2_pacific.py"
)
T_NOTES = (
    "太平洋・マレー(1941〜45年)の編成表(日本・英連邦・米海兵隊)。要素の数・武器の数は汎用の編成表を写した抽象で、武器をその国のものに替え、"
    "装甲の要素に装甲厚を書いた。根拠は docs/research/pacific-weapons-1941-45.md。TODO(要裏取り):日本の甲・乙の1941年の定数、英印の大隊の1941年の定数、"
    "海兵隊 D/E 編制の戦車大隊。作り直しは tools/packs/build_ww2_pacific.py"
)
(ROOT / "data/weapons/ww2-pacific.json").write_text(json.dumps({"id": "ww2-pacific", "notes": W_NOTES, "weapons": weapons}, ensure_ascii=False, indent=2) + "\n")
(ROOT / "data/toe/ww2-pacific.json").write_text(json.dumps({"id": "ww2-pacific", "notes": T_NOTES, "toes": toes}, ensure_ascii=False, indent=2) + "\n")
print("weapons", len(weapons), "toes", len(toes))
