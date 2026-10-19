"""
米独1944年の武器パックと編成パック(data/weapons/ww2-1944-us-de.json・data/toe/ww2-1944-us-de.json)を作る。
汎用のパック(ww1-korea-generic)の後ろに重ねて使う(シナリオの packs.weapons/toe を配列にする)。

方針:
- 火力(距離帯の power)・効き目(effectiveness)・編成表の要素の数と武器の数は、汎用のものをそのまま写す。
  変えるのは、武器の貫通力(mm)と、装甲の要素の装甲厚(mm)だけ。貫通力と装甲の差だけを足すため
  (編成表の武器の数は、1両1門ではなく汎用の抽象のまま)
- 貫通力は、垂直から30°の均質圧延鋼板に対する値。各距離帯には、その帯の遠い端以上の距離で
  いちばん近い表の値を使う(遠い端の値=控えめ)。表より遠い帯は表の最後の値を使い、TODO(要裏取り) とする
- 装甲厚は、車体前面上部・側面の板厚を傾斜で割った実質の厚さ(水平射撃)。砲塔は数えない
- 弾は通常の被帽徹甲弾だけ。米76mm・90mmのHVAP、独のPzGr40系は1944年には少なかったので入れない
- 根拠は、調査メモ(検索結果の要約による二次資料)。出典と信頼度は各値の注記。推測で埋めた値はない
  (幅のある値は、低い方を使って TODO(要裏取り) とした)

実行:python3 tools/packs/build_ww2_1944_us_de.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEN_W = json.loads((ROOT / "data/weapons/ww1-korea-generic.json").read_text())["weapons"]
GEN_T = json.loads((ROOT / "data/toe/ww1-korea-generic.json").read_text())["toes"]

YD = 0.9144


def yd(table):
    """ヤードの表 → メートルの表"""
    return [(round(d * YD), p) for d, p in table]


# 貫通力の表(距離m, mm)。出典は調査メモ docs/research/weapons-1944-us-de.md
PEN = {
    # 75mm M3(M4)/ M61 被帽徹甲弾。500/1000/1500/2000yd。Hunnicutt 系の表(theshermantank.com の M3 砲の資料)、Wikipedia もほぼ同値。信頼度:中
    "us_75mm_m3": yd([(500, 61), (1000, 56), (1500, 51), (2000, 46)]),
    # 76mm M1(M4(76)・M18)/ M62 被帽徹甲弾。Hunnicutt 由来とされる表(独立した2件が同値)。信頼度:中
    "us_76mm_m1": yd([(500, 93), (1000, 88), (1500, 82), (2000, 75)]),
    # 3インチ砲 M7(M10)/ M62。76mm M1 と同じ弾・ほぼ同じ弾道とされるので、76mm の表を流用。信頼度:中(流用)
    "us_3in_m7": yd([(500, 93), (1000, 88), (1500, 82), (2000, 75)]),
    # 90mm M3(M36)/ M82 被帽徹甲弾(初期)。500/1000yd のみ。1500yd 以遠は TODO(要裏取り):1945年1月の兵器局「Armor-Piercing Ammunition for Gun, 90-mm, M3」、TM 9-1907
    "us_90mm_m3": yd([(500, 120), (1000, 112)]),
    # 57mm M1 対戦車砲 / M86 被帽徹甲弾。1944年7月の兵器局資料の転載(表が崩れていて読み取りが不確か)。信頼度:低。1500yd 以遠は TODO(要裏取り)
    "us_57mm_m1": yd([(500, 71), (1000, 66)]),
    # 2.36インチ バズーカ(M6A1/M6A3)。資料により 90〜127mm。低い方。TODO(要裏取り):TM 9-294、FM 23-30(1944)
    "us_bazooka": [(300, 90)],
    # 7.5cm KwK40・StuK40・PaK40・PaK39(IV号・III号突撃砲・IV号駆逐戦車・牽引砲)/ PzGr39。100/500/1000/1500/2000m。Wikipedia(1000m は版により 82〜86)。信頼度:中
    "de_75mm_kwk40": [(100, 106), (500, 96), (1000, 85), (1500, 74), (2000, 64)],
    # 7.5cm KwK42(パンター)/ PzGr39/42。Wikipedia と panther1944.de(Panther-Fibel)が一致。信頼度:高
    "de_75mm_kwk42": [(100, 138), (500, 124), (1000, 111), (1500, 99), (2000, 89)],
    # パンツァーシュレック(210〜216mm、有効150m)とパンツァーファウスト(30・60型 200mm、30型小 140mm、有効30〜60m)をまとめて 200mm。
    # Wikipedia、TM-E 30-451(パンツァーファウスト)。信頼度:中〜高
    "de_infantry_at": [(300, 200)],
}


def bands(base, pen, note_far):
    """汎用の距離帯(base)に、貫通力の表(pen)を重ねた距離帯を作る(境目は両方の境目)"""
    edges = sorted({b["maxRangeM"] for b in base} | {d for d, _ in pen if d < base[-1]["maxRangeM"]})
    out = []
    for e in edges:
        power = next(b["power"] for b in base if e <= b["maxRangeM"])
        p = next((v for d, v in pen if d >= e), None)
        if p is None:
            p = pen[-1][1]
            note_far.append(e)
        out.append({"maxRangeM": e, "power": power, "penetrationMm": p})
    # 隣どうしで power も貫通力も同じ帯はまとめる
    merged = []
    for b in out:
        if merged and merged[-1]["power"] == b["power"] and merged[-1]["penetrationMm"] == b["penetrationMm"]:
            merged[-1]["maxRangeM"] = b["maxRangeM"]
        else:
            merged.append(b)
    return merged


# 武器:(ID, 名前, 汎用の元の武器)
WEAPONS = [
    ("us_75mm_m3", "75mm戦車砲 M3(M4)", "tank_gun"),
    ("us_76mm_m1", "76mm砲 M1(M18 駆逐戦車)", "td_gun"),
    ("us_3in_m7", "3インチ砲 M7(M10 駆逐戦車)", "td_gun"),
    ("us_90mm_m3", "90mm砲 M3(M36 駆逐戦車)", "td_gun"),
    ("us_57mm_m1", "57mm対戦車砲 M1", "at_gun"),
    ("us_bazooka", "2.36インチ バズーカ", "rocket_launcher"),
    ("de_75mm_kwk40", "7.5cm KwK40/PaK40(IV号戦車・IV号駆逐戦車・牽引対戦車砲)", "tank_gun"),
    ("de_75mm_kwk42", "7.5cm KwK42(パンター)", "tank_gun"),
    ("de_75mm_pak40", "7.5cm PaK40(牽引対戦車砲)", "at_gun"),
    ("de_75mm_pak39", "7.5cm PaK39(IV号駆逐戦車)", "td_gun"),
    ("de_infantry_at", "パンツァーシュレック・パンツァーファウスト", "rocket_launcher"),
]
PEN["de_75mm_pak40"] = PEN["de_75mm_kwk40"]
PEN["de_75mm_pak39"] = PEN["de_75mm_kwk40"]  # PaK39 L/48 は KwK40 L/48 と同じ弾道(Wikipedia『7.5 cm Pak 39』)

weapons = {}
far_notes = []
for wid, name, base in WEAPONS:
    w = dict(GEN_W[base])
    far = []
    w = {**w, "name": name, "bands": bands(GEN_W[base]["bands"], PEN[wid], far)}
    if far:
        far_notes.append(f"{wid} の {max(d for d, _ in PEN[wid])}m より遠い帯")
    weapons[wid] = w

# 装甲の要素の装甲厚(実質、mm)。前面=車体前面上部、側面=車体側面、背後=車体後面(書かなければ側面と同じ)
ARMOR = {
    # M4(75)前期車体:前面上部 51mm@56° → 約91(計算)、側面38、後面38。theshermantank.com・afvdatabase。信頼度:中
    # (M4A3 後期車体 63.5mm@47° は約93。1944年8月中旬〜9月下旬に欧州に届き始めた)
    "m4": {"front": 91, "side": 38, "rear": 38},
    # M18:前面 12.7mm@64° → 約29(計算)、側面約13。信頼度:中
    "m18": {"front": 29, "side": 13, "rear": 13},
    # M10:前面 38mm@55° → 約66(計算)、側面上部19・下部25(低い方。傾斜角は TODO(要裏取り):Zaloga『M10 and M36 Tank Destroyers』)。信頼度:中
    "m10": {"front": 66, "side": 19, "rear": 19},
    # M36:M10A1 の車体を使うので M10 と同じとみなす。TODO(要裏取り):Zaloga『M10 and M36 Tank Destroyers』。信頼度:低〜中
    "m36": {"front": 66, "side": 19, "rear": 19},
    # IV号戦車 H/J:前面 80mm@約11° → 約81(計算)、側面30、後面20。信頼度:中〜高
    "pz4": {"front": 81, "side": 30, "rear": 20},
    # パンター A/G:前面上部 80mm@55° → 約139(計算)、側面 40〜50(低い方。上部の傾斜角は TODO(要裏取り):Jentz『Panzer Tracts』No.5)、後面40。信頼度:中
    "panther": {"front": 139, "side": 40, "rear": 40},
    # IV号駆逐戦車(L/48):前面 60mm@50° → 約93(計算。1944年5月以降の80mm型は約124)、側面 30〜40(低い方)、後面20。信頼度:中
    "jgpz4": {"front": 93, "side": 30, "rear": 20},
}


def swap(toe, mapping, name, armor=None, split=None):
    """汎用の編成表を写し、武器を置き換え、装甲の要素に装甲厚を書く。split で装甲の要素を2種類に分けられる"""
    t = json.loads(json.dumps(GEN_T[toe]))
    t["name"] = name
    els = []
    for e in t["elements"]:
        for ref in e["weapons"]:
            ref["weapon"] = mapping.get(ref["weapon"], ref["weapon"])
        if e.get("armored") and split:
            # (要素の名前, 数, 武器の置き換え, 装甲)
            for ename, count, wmap, arm in split:
                e2 = json.loads(json.dumps(e))
                e2["name"], e2["count"] = ename, count
                for ref in e2["weapons"]:
                    ref["weapon"] = wmap.get(ref["weapon"], ref["weapon"])
                e2["armorMm"] = ARMOR[arm]
                els.append(e2)
            continue
        if e.get("armored") and armor:
            e["armorMm"] = ARMOR[armor]
        els.append(e)
    t["elements"] = els
    return t


US = {"rocket_launcher": "us_bazooka", "at_gun": "us_57mm_m1"}
DE = {"rocket_launcher": "de_infantry_at", "at_gun": "de_75mm_pak40"}

toes = {
    # 米:第4機甲師団(アラクール)・第10機甲師団(バストーニュ)の任務部隊。戦車は M4(75mm)とみなす(76mm 砲搭載車の割合は TODO(要裏取り):Zaloga『Armored Thunderbolt』)
    "us_armored_task_force_m4": swap("armored_task_force", {**US, "tank_gun": "us_75mm_m3"}, "機甲任務部隊(M4・米1944)", "m4"),
    # 戦車駆逐大隊:M18(第704・第705)、M10(第644)、M36
    "us_tank_destroyer_battalion_m18": swap("tank_destroyer_battalion", {"td_gun": "us_76mm_m1"}, "戦車駆逐大隊(M18・米1944)", "m18"),
    "us_tank_destroyer_battalion_m10": swap("tank_destroyer_battalion", {"td_gun": "us_3in_m7"}, "戦車駆逐大隊(M10・米1944)", "m10"),
    "us_tank_destroyer_battalion_m36": swap("tank_destroyer_battalion", {"td_gun": "us_90mm_m3"}, "戦車駆逐大隊(M36・米1944)", "m36"),
    "us_infantry_regiment_1944": swap("infantry_regiment", US, "歩兵連隊(米1944)"),
    "us_airborne_regiment_1944": swap("airborne_regiment", US, "空挺歩兵連隊(米1944)"),
    "us_glider_infantry_regiment_1944": swap("glider_infantry_regiment", US, "グライダー歩兵連隊(米1944)"),
    # 独:戦車連隊は I大隊がパンター、II大隊がIV号(1944年型の戦車師団・装甲旅団)。汎用の戦車中隊6を半分ずつに分ける。
    # 実際の両数の比は部隊ごとに違う。TODO(要裏取り):Nevenkin『Fire Brigades』、Jentz『Panzertruppen』
    "de_panzer_regiment_1944": swap(
        "panzer_regiment",
        DE,
        "戦車連隊(パンター・IV号・独1944)",
        split=[("戦車中隊(パンター)", 3, {"tank_gun": "de_75mm_kwk42"}, "panther"), ("戦車中隊(IV号)", 3, {"tank_gun": "de_75mm_kwk40"}, "pz4")],
    ),
    "de_panzergrenadier_regiment_1944": swap("panzergrenadier_regiment", DE, "装甲擲弾兵連隊(独1944)"),
    "de_volksgrenadier_regiment_1944": swap("volksgrenadier_regiment", DE, "国民擲弾兵連隊(独1944)"),
    "de_tank_destroyer_battalion_jgpz4": swap("tank_destroyer_battalion", {"td_gun": "de_75mm_pak39"}, "戦車駆逐大隊(IV号駆逐戦車・独1944)", "jgpz4"),
}

W_NOTES = (
    "米独1944年の武器(貫通力つき)。汎用の武器パック ww1-korea-generic の後ろに重ねて使う。火力(power)・効き目・射程の帯は汎用の元の武器"
    "(戦車砲=tank_gun、駆逐戦車の主砲=td_gun、対戦車砲=at_gun、携行対戦車火器=rocket_launcher)と同じで、貫通力(mm、垂直から30°の板)だけを足した。"
    "各帯の貫通力は、その帯の遠い端の距離の値(控えめ)。被帽徹甲弾のみ(HVAP・PzGr40系は1944年には少なかった)。"
    "根拠と信頼度は docs/research/weapons-1944-us-de.md(検索結果の要約による二次資料)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値で仮置き({'、'.join(far_notes)})。米独で貫通の判定基準が違い1〜2割ずれる。"
    "出典候補 Bird & Livingston『WWII Ballistics: Armor and Gunnery』、FM 17-12(1944)、TM 9-1907、Jentz『Panzer Tracts』。"
    "作り直しは tools/packs/build_ww2_1944_us_de.py"
)
T_NOTES = (
    "米独1944年の編成表(装甲厚つき)。汎用の編成パック ww1-korea-generic の後ろに重ねて使う。要素の数・武器の数は汎用の編成表と同じで、"
    "武器を米独の武器に置き換え、装甲の要素に実質の装甲厚(車体前面上部・側面・後面、mm、板厚÷cos(傾斜))を書いた。砲塔は数えない。"
    "根拠と信頼度は docs/research/weapons-1944-us-de.md。TODO(要裏取り):編成表の原文(T/O&E 17-25・18-27、KStN 1114・1177)、"
    "部隊ごとの実際の両数と車種の割合。作り直しは tools/packs/build_ww2_1944_us_de.py"
)

(ROOT / "data/weapons/ww2-1944-us-de.json").write_text(
    json.dumps({"id": "ww2-1944-us-de", "notes": W_NOTES, "weapons": weapons}, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/toe/ww2-1944-us-de.json").write_text(json.dumps({"id": "ww2-1944-us-de", "notes": T_NOTES, "toes": toes}, ensure_ascii=False, indent=2) + "\n")
print("weapons", len(weapons), "toes", len(toes))
