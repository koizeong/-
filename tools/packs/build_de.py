#!/usr/bin/env python3
"""
ドイツ軍の装備品パックと実数の編成パック(data/weapons/de.json・data/toe/de.json)を作る。

    python3 tools/packs/build_de.py

汎用のパック(ww1-korea-generic)の後ろに重ねて使う。装備品(小銃・機関銃・迫撃砲・歩兵砲・対戦車砲・砲・戦車・突撃砲・駆逐戦車・装甲車・
半装軌車)を1つずつの品目にし、編成表の要素は人員と装備品の実数で書く(撃つ武器・耐久・装甲は読み込むときに装備品から出す)。
1丁・1両あたりの威力は tools/packs/equipment_common.py の物差し(docs/research/equipment-calibration.md)。
根拠と信頼度は docs/research/equipment-de.md。この環境では資料のページを直接読めず、検索結果の要約だけで組み立てた。
中隊の人員・装備の数の多くは TODO(要裏取り)(KStN の原文を確かめていない)。

ID は「de-」で始める(米独1944年・独ソ1942年のパックの de_ と重ならないように)。
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import equipment_common as c  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
GEN_T = json.loads((ROOT / "data/toe/ww1-korea-generic.json").read_text())["toes"]

far: list = []
W: dict = {}
E: dict = {}

# ---------------------------------------------------------------- 武器(1丁・1門・1両あたり)
W["de-rifle"] = c.rifle("小銃(ボルトアクション)", c.RE["bolt_rifle"])
W["de-semi"] = c.rifle("半自動小銃", c.RE["semi_rifle"])
# 突撃銃(StG 44):半自動小銃と自動小銃の間とみなす(ゲームの見立て)。射程は400mまで
W["de-assault"] = c.rifle("突撃銃", c.RE["assault_rifle"], max_range_m=400)
W["de-smg"] = c.smg("短機関銃")
W["de-lmg-wwi"] = c.mg("軽機関銃(第一次大戦)", c.RE["lmg"])
W["de-gpmg"] = c.mg("汎用機関銃(二脚)", c.RE["gpmg"])
# MG 42:MG 34 より発射速度が高い(毎分1,200発前後と900発前後)。小銃換算を1割増し(ゲームの見立て)
W["de-gpmg42"] = c.mg("汎用機関銃 MG 42(二脚)", c.RE["gpmg"] * 1.1)
W["de-hmg"] = c.mg("重機関銃(三脚)", c.RE["hmg"], tripod=True)
W["de-hmg42"] = c.mg("重機関銃 MG 42(三脚)", c.RE["hmg"] * 1.1, tripod=True)
# 車載の機関銃:視界と射界が限られるので軽機関銃と同じ(ゲームの見立て)
W["de-mg-vehicle"] = c.mg("車載機関銃", c.RE["lmg"])
# 対戦車銃 PzB 39:30mm/100m・25mm/300m(2件で一致、角度は出典で違う。信頼度 中〜低)
W["de-pzb39"] = c.at_weapon("対戦車銃 PzB 39", [30, 25], 100, 300)
# パンツァーシュレック RPzB 54:垂直板で約210mm、有効150m(米軍資料 165yd)(信頼度 中)
W["de-rpzb54"] = c.at_weapon("パンツァーシュレック", [210, 210], 100, 150)
# パンツァーファウスト 30:140mm/30m(klein。TM-E 30-451 と Wikipedia が一致。信頼度 高)。60:200mm/60m(高)
W["de-pzf30"] = c.at_weapon("パンツァーファウスト 30", [140, 140], 20, 30)
W["de-pzf60"] = c.at_weapon("パンツァーファウスト 60", [200, 200], 30, 60)
# 迫撃砲(曲射):5cm leGrW 36 弾0.9kg・最大520m(中)。8cm GrW 34 弾3.5kg(kz GrW 42 と同じ弾とする記述から。中〜低)・
# 射程 TODO(要裏取り):kz GrW 42(1,100m)の「およそ倍」とする記述から 2,200m で仮置き
W["de-legrw36"] = c.mortar("5cm 軽迫撃砲 leGrW 36", 0.9, 520)
W["de-grw34"] = c.mortar("8cm 迫撃砲 GrW 34", 3.5, 2200)
# 歩兵砲:直接・曲射で使う連隊の砲。間接射撃の武器にすると部隊が砲兵の扱いになるので、曲射の直接射撃にする(太平洋のパックと同じ)。
# 7.5cm leIG 18 榴弾6kg・最大3,550m(中)。15cm sIG 33 榴弾38kg・最大4,700m(中)
W["de-leig18"] = c.mortar("7.5cm 軽歩兵砲 leIG 18", 6.0, 3550)
W["de-sig33"] = c.mortar("15cm 重歩兵砲 sIG 33", 38.0, 4700)
W["de-sig33"]["entrenchmentPierce"] = 0.5
# 対戦車砲(30°の板、mm):
# 3.7cm Pak 36:PzGr 39 で 64/100・52/500・40/1000・30/1500(Wikipedia の表は**垂直の板**。30°の表は見つからなかった。信頼度 中)
W["de-pak36"] = c.at_gun("3.7cm 対戦車砲 Pak 36", 37, [(100, 64), (500, 52), (1000, 40), (1500, 30)], far, "de-pak36")
# 5cm Pak 38:同じ L/60 の KwK 39 の値(Pak 38 の表は見つからなかった。信頼度 低〜中)
W["de-pak38"] = c.at_gun("5cm 対戦車砲 Pak 38", 50, [(100, 67), (500, 57), (1000, 44), (1500, 34)], far, "de-pak38")
# 7.5cm Pak 40:PzGr 39 で 106/96/85/74/64(中。weapons-1944-us-de.md)
W["de-pak40"] = c.at_gun("7.5cm 対戦車砲 Pak 40", 75, [(100, 106), (500, 96), (1000, 85), (1500, 74), (2000, 64)], far, "de-pak40")
# 8.8cm Pak 43:PzGr 39/43 で 202/185/165/148/132(1000m 以上は低〜中)
W["de-pak43"] = c.at_gun("8.8cm 対戦車砲 Pak 43", 88, [(100, 202), (500, 185), (1000, 165), (1500, 148), (2000, 132)], far, "de-pak43")
# 戦車砲・突撃砲の砲
W["de-kwk30"] = c.tank_gun("2cm KwK 30(II号戦車)", 20, [(100, 35), (400, 25), (800, 17)], far, "de-kwk30")  # KwK 38 の PzGr 39 の値で代える(TODO)
W["de-kwk36"] = c.tank_gun("3.7cm KwK 36(III号戦車 E〜G)", 37, [(100, 64), (500, 52), (1000, 40), (1500, 30)], far, "de-kwk36")  # Pak 36 と同じ砲
W["de-kwk37"] = c.tank_gun("7.5cm KwK 37 L/24(IV号戦車 D〜F1・III号突撃砲 A〜E)", 75, [(100, 41), (500, 39), (1000, 35), (2000, 30)], far, "de-kwk37")
W["de-kwk38"] = c.tank_gun("5cm KwK 38 L/42(III号戦車 F〜J)", 50, [(100, 53), (500, 43), (1000, 32), (1500, 24)], far, "de-kwk38")
W["de-kwk39"] = c.tank_gun("5cm KwK 39 L/60(III号戦車 J〜M)", 50, [(100, 67), (500, 57), (1000, 44), (1500, 34)], far, "de-kwk39")
W["de-kwk40l43"] = c.tank_gun("7.5cm KwK 40 L/43(IV号戦車 F2・G)", 75, [(500, 96), (1000, 80)], far, "de-kwk40l43")
W["de-kwk40l48"] = c.tank_gun("7.5cm KwK 40 L/48(IV号戦車 H・J)", 75, [(100, 106), (500, 96), (1000, 85), (1500, 74), (2000, 64)], far, "de-kwk40l48")
W["de-kwk42"] = c.tank_gun("7.5cm KwK 42 L/70(パンター)", 75, [(100, 138), (500, 124), (1000, 111), (1500, 99), (2000, 89)], far, "de-kwk42")
W["de-kwk36-88"] = c.tank_gun("8.8cm KwK 36 L/56(ティーガー I)", 88, [(100, 132), (500, 110), (1000, 99), (1500, 91), (2000, 83)], far, "de-kwk36-88")
W["de-stuk40l48"] = c.tank_gun("7.5cm StuK 40 L/48(III号突撃砲 G)", 75, [(100, 106), (500, 96), (1000, 85), (1500, 74), (2000, 64)], far, "de-stuk40l48", td=True)
W["de-pak39"] = c.tank_gun("7.5cm Pak 39 L/48(IV号駆逐戦車・ヘッツァー)", 75, [(100, 106), (500, 96), (1000, 82), (1500, 74), (2000, 64)], far, "de-pak39", td=True)
W["de-pak40sf"] = c.tank_gun("7.5cm Pak 40(マルダー)", 75, [(100, 106), (500, 96), (1000, 85), (1500, 74), (2000, 64)], far, "de-pak40sf", td=True)
# 砲(間接射撃):10.5cm leFH 18 榴弾14.8kg・最大10,675m(中〜高)。15cm sFH 18 榴弾約44kg(中)・射程は出典で13〜15km(低い方の13,000m)
W["de-lefh18"] = c.howitzer("10.5cm 軽野戦榴弾砲 leFH 18", 14.8, 10675)
W["de-sfh18"] = c.howitzer("15cm 重野戦榴弾砲 sFH 18", 44.0, 13000)

for w in W.values():
    w.setdefault("suppression", 1)
    w.setdefault("antiAir", 0)


# ---------------------------------------------------------------- 装備品
def item(iid, name, category, years, weapons=(), crew=0, hp=0.0, armor=None, specs=None, desc=None):
    e = {"name": name, "nation": "de", "category": category, "years": years, "weapons": [{"weapon": w, "count": n} for w, n in weapons], "crew": crew, "hitPoints": hp}
    if armor:
        e["armored"] = True
        e["armorMm"] = armor
    if specs:
        e["specs"] = specs
    if desc:
        e["description"] = desc
    E[iid] = e


Y = lambda a, b=None: {"from": a, **({"to": b} if b else {})}  # noqa: E731

# 小火器(年は TODO(要裏取り):広く知られた採用・配備の年。調査メモに出典候補)
item("de-gew98", "Gew 98 小銃", "rifle", Y(1898, 1918), [("de-rifle", 1)], specs={"口径 mm": 7.92})
item("de-kar98k", "Kar 98k 小銃", "rifle", Y(1935, 1945), [("de-rifle", 1)], specs={"口径 mm": 7.92})
item("de-g43", "G 43 半自動小銃", "rifle", Y(1943, 1945), [("de-semi", 1)], specs={"口径 mm": 7.92})
item("de-stg44", "StG 44 突撃銃", "rifle", Y(1944, 1945), [("de-assault", 1)], specs={"口径 mm": 7.92})
item("de-mp18", "MP 18 短機関銃", "smg", Y(1918, 1918), [("de-smg", 1)], specs={"口径 mm": 9})
item("de-mp40", "MP 38/40 短機関銃", "smg", Y(1938, 1945), [("de-smg", 1)], specs={"口径 mm": 9})
item("de-mg0815", "MG 08/15 軽機関銃", "lmg", Y(1917, 1918), [("de-lmg-wwi", 1)], crew=2, specs={"重量 kg": 18})
item("de-mg08", "MG 08 重機関銃", "hmg", Y(1908, 1918), [("de-hmg", 1)], crew=4)
item("de-mg34", "MG 34 汎用機関銃(軽機関銃として)", "lmg", Y(1936, 1945), [("de-gpmg", 1)], crew=2, specs={"発射速度 発/分": 900})
item("de-mg34s", "MG 34 汎用機関銃(重機関銃として・三脚)", "hmg", Y(1936, 1945), [("de-hmg", 1)], crew=3)
item("de-mg42", "MG 42 汎用機関銃(軽機関銃として)", "lmg", Y(1942, 1945), [("de-gpmg42", 1)], crew=2, specs={"発射速度 発/分": 1200})
item("de-mg42s", "MG 42 汎用機関銃(重機関銃として・三脚)", "hmg", Y(1942, 1945), [("de-hmg42", 1)], crew=3)
item("de-pzb39", "PzB 39 対戦車銃", "at_rifle", Y(1940, 1942), [("de-pzb39", 1)], crew=1, specs={"貫通 mm/100m": 30})
item("de-rpzb54", "RPzB 54 パンツァーシュレック", "at_launcher", Y(1943, 1945), [("de-rpzb54", 1)], crew=2, specs={"貫通 mm": 210, "有効射程 m": 150})
item("de-pzf30", "パンツァーファウスト 30", "at_launcher", Y(1943, 1945), [("de-pzf30", 1)], specs={"貫通 mm": 140, "射程 m": 30})
item("de-pzf60", "パンツァーファウスト 60", "at_launcher", Y(1944, 1945), [("de-pzf60", 1)], specs={"貫通 mm": 200, "射程 m": 60})
# 迫撃砲・歩兵砲
item("de-legrw36", "5cm 軽迫撃砲 leGrW 36", "mortar", Y(1936, 1943), [("de-legrw36", 1)], crew=3, specs={"弾 kg": 0.9, "最大射程 m": 520})
item("de-grw34", "8cm 迫撃砲 GrW 34", "mortar", Y(1934, 1945), [("de-grw34", 1)], crew=6, specs={"弾 kg": 3.5, "最大射程 m": "2,200(TODO)"})
item("de-leig18", "7.5cm 軽歩兵砲 leIG 18", "infantry_gun", Y(1932, 1945), [("de-leig18", 1)], crew=8, specs={"弾 kg": 6, "最大射程 m": 3550})
item("de-sig33", "15cm 重歩兵砲 sIG 33", "infantry_gun", Y(1936, 1945), [("de-sig33", 1)], crew=10, specs={"弾 kg": 38, "最大射程 m": 4700})
# 対戦車砲
item("de-pak36", "3.7cm 対戦車砲 Pak 36", "at_gun", Y(1936, 1942), [("de-pak36", 1)], crew=5, specs={"貫通 mm/500m(垂直)": 52})
item("de-pak38", "5cm 対戦車砲 Pak 38", "at_gun", Y(1941, 1945), [("de-pak38", 1)], crew=5, specs={"貫通 mm/500m": 57})
item("de-pak40", "7.5cm 対戦車砲 Pak 40", "at_gun", Y(1942, 1945), [("de-pak40", 1)], crew=6, specs={"貫通 mm/500m": 96})
item("de-pak43", "8.8cm 対戦車砲 Pak 43", "at_gun", Y(1943, 1945), [("de-pak43", 1)], crew=8, specs={"貫通 mm/500m": 185})
# 砲
item("de-lefh18", "10.5cm 軽野戦榴弾砲 leFH 18", "howitzer", Y(1935, 1945), [("de-lefh18", 1)], crew=8, specs={"弾 kg": 14.8, "最大射程 m": 10675})
item("de-sfh18", "15cm 重野戦榴弾砲 sFH 18", "heavy_artillery", Y(1934, 1945), [("de-sfh18", 1)], crew=12, specs={"弾 kg": 44, "最大射程 m": "13,000〜15,000"})
# 戦車・突撃砲・駆逐戦車(装甲は実質の厚さ mm。根拠は weapons-1944-us-de.md・weapons-1942-de-su.md・equipment-de.md)
HP = c.VEHICLE_HP
item("de-pz2c", "II号戦車 C型", "tank", Y(1937, 1942), [("de-kwk30", 1), ("de-mg-vehicle", 1)], crew=3, hp=HP["light_tank"], armor={"front": 14, "side": 14, "rear": 14, "turretFront": 14, "turretSide": 14}, specs={"重量 t": 8.9})
item("de-pz38t", "38(t)戦車", "tank", Y(1939, 1942), [("de-kwk36", 1), ("de-mg-vehicle", 2)], crew=4, hp=HP["light_tank"], armor={"front": 25, "side": 15, "rear": 15, "turretFront": 25, "turretSide": 15}, desc="主砲は 3.7cm KwK 38(t)。貫通力の表が見つからず、Pak 36 の値で代えた(TODO)")
item("de-pz3f", "III号戦車 F型", "tank", Y(1940, 1942), [("de-kwk36", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 30, "side": 30, "rear": 21, "turretFront": 30, "turretSide": 30}, desc="前面の厚さは TODO(要裏取り)。側面30(E〜G)")
item("de-pz3j", "III号戦車 J型(短砲身)", "tank", Y(1941, 1943), [("de-kwk38", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 50, "side": 30, "rear": 50, "turretFront": 50, "turretSide": 30})
item("de-pz3l", "III号戦車 L型(長砲身)", "tank", Y(1942, 1943), [("de-kwk39", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 50, "side": 30, "rear": 50, "turretFront": 50, "turretSide": 30})
item("de-pz4d", "IV号戦車 D型(短砲身)", "tank", Y(1939, 1942), [("de-kwk37", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 30, "side": 20, "rear": 20, "turretFront": 30, "turretSide": 20}, desc="車体の厚さは TODO(要裏取り)。砲塔前面30")
item("de-pz4f2", "IV号戦車 F2型", "tank", Y(1942, 1943), [("de-kwk40l43", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 50, "side": 30, "rear": 20, "turretFront": 50, "turretSide": 30})
item("de-pz4h", "IV号戦車 H型", "tank", Y(1943, 1945), [("de-kwk40l48", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["medium_tank"], armor={"front": 81, "side": 30, "rear": 20, "turretFront": 51, "turretSide": 30}, specs={"重量 t": 25})
item("de-panther", "V号戦車 パンター A/G型", "tank", Y(1943, 1945), [("de-kwk42", 1), ("de-mg-vehicle", 2)], crew=5, hp=5.0, armor={"front": 139, "side": 40, "rear": 40, "turretFront": 100, "turretSide": 50}, specs={"重量 t": 45})
item("de-tiger1", "VI号戦車 ティーガー I", "tank", Y(1942, 1944), [("de-kwk36-88", 1), ("de-mg-vehicle", 2)], crew=5, hp=HP["heavy_tank"], armor={"front": 100, "side": 60, "rear": 80, "turretFront": 100, "turretSide": 80}, specs={"重量 t": 57})
item("de-stug3g", "III号突撃砲 G型", "assault_gun", Y(1943, 1945), [("de-stuk40l48", 1), ("de-mg-vehicle", 1)], crew=4, hp=HP["assault_gun"], armor={"front": 80, "side": 30, "rear": 30})
item("de-jgpz4", "IV号駆逐戦車(L/48)", "tank_destroyer", Y(1944, 1945), [("de-pak39", 1), ("de-mg-vehicle", 1)], crew=4, hp=HP["tank_destroyer"], armor={"front": 93, "side": 30, "rear": 20})
item("de-hetzer", "38(t)駆逐戦車 ヘッツァー", "tank_destroyer", Y(1944, 1945), [("de-pak39", 1), ("de-mg-vehicle", 1)], crew=4, hp=3.0, armor={"front": 120, "side": 20, "rear": 8})
# 装甲車・半装軌車:薄い装甲の車両は「装甲の要素」にしない(乗る兵と同じく小火器で削れる)
item("de-sdkfz222", "Sd.Kfz. 222 軽装甲車", "armored_car", Y(1937, 1945), [("de-kwk30", 1), ("de-mg-vehicle", 1)], crew=3, hp=c.VEHICLE_HP["armored_car"], desc="装甲の厚さは TODO(要裏取り)。薄い装甲として装甲の要素にしない")
item("de-sdkfz251", "Sd.Kfz. 251 装甲兵員輸送車", "halftrack", Y(1939, 1945), [("de-mg-vehicle", 1)], crew=2, hp=0.5, desc="前面14.5・側面8。薄い装甲として装甲の要素にしない")
item("de-truck", "トラック(オペル・ブリッツなど)", "truck", Y(1937, 1945))


# ---------------------------------------------------------------- 編成表
def el(name, count, personnel, equip, group=None, group_count=None):
    e = {"name": name, "count": count, "personnel": personnel, "equipment": [{"item": i, "count": n} for i, n in equip if n > 0]}
    if group:
        e["group"] = group
    if group_count:
        e["groupCount"] = group_count
    return e


def ammo_rate(elements):
    s = 0.0
    for e in elements:
        for ref in e["equipment"]:
            for w in E[ref["item"]]["weapons"]:
                ww = W[w["weapon"]]
                if not ww["indirect"]:
                    s += e["count"] * ref["count"] * w["count"] * ww["ammoPerMin"]
    return s


def generic_ammo_rate(toe_id):
    t = GEN_T[toe_id]
    gw = json.loads((ROOT / "data/weapons/ww1-korea-generic.json").read_text())["weapons"]
    return sum(e["count"] * r["count"] * gw[r["weapon"]]["ammoPerMin"] for e in t["elements"] for r in e["weapons"] if not gw[r["weapon"]]["indirect"])


def toe(name, base, elements, echelon=None, modifiers=None, branch=None):
    """汎用の編成表(base)の兵科・正面幅・燃料を写し、弾薬の積載は直接射撃の弾薬の消費の比で合わせる(撃ち続けられる時間をそろえる)"""
    g = GEN_T[base]
    sup = dict(g["supply"])
    gr = generic_ammo_rate(base)
    if gr > 0:
        sup["ammoCapacityT"] = round(sup["ammoCapacityT"] * ammo_rate(elements) / gr, 2)
    t = {"name": name, "branch": branch or g["branch"], "armorRatio": g["armorRatio"], "frontageM": g["frontageM"], "amphibious": False, "supply": sup, "elements": elements}
    sym = dict(g.get("symbol") or {})
    if echelon:
        sym["echelon"] = echelon
    if modifiers is not None:
        sym["modifiers"] = modifiers
    t["symbol"] = sym
    return t


T: dict = {}

# 1939〜41年の歩兵連隊(3個大隊)。小銃中隊は 1937年10月の KStN の「4名+212名」(bayonetstrength の写し。信頼度 中)。
# 小隊ごとに 5cm 迫撃砲1(同)。軽機関銃12(4個分隊 × 3個小隊)・小銃・短機関銃・対戦車銃の数は TODO(要裏取り:KStN 131(1939)、Buchner『Das Handbuch der deutschen Infanterie』)。
# 機関銃中隊・第13(歩兵砲)中隊・第14(対戦車)中隊の人員と門数も TODO(よく引かれる数:重機関銃12・8cm 迫撃砲6/中隊、軽歩兵砲6・重歩兵砲2、Pak 36 12)
T["de-ir-1939"] = toe(
    "歩兵連隊(独1939〜41)",
    "infantry_regiment",
    [
        el("連隊本部・通信小隊", 1, 70, [("de-kar98k", 55), ("de-mp40", 10)], "連隊本部"),
        el("小銃中隊", 9, 216, [("de-kar98k", 180), ("de-mp40", 13), ("de-mg34", 12), ("de-legrw36", 3), ("de-pzb39", 3)], "大隊", 3),
        el("機関銃中隊", 3, 200, [("de-kar98k", 160), ("de-mp40", 8), ("de-mg34s", 12), ("de-grw34", 6)], "大隊", 3),
        el("第13中隊(歩兵砲)", 1, 180, [("de-kar98k", 130), ("de-leig18", 6), ("de-sig33", 2)], "連隊直轄"),
        el("第14中隊(対戦車)", 1, 170, [("de-kar98k", 120), ("de-mg34", 4), ("de-pak36", 12)], "連隊直轄"),
    ],
)

# 1944年の擲弾兵連隊(44年型歩兵師団、2個大隊。中)。擲弾兵中隊は KStN 131n(1944年5月):3個小隊、各分隊に機関銃1、
# 小隊本部に予備の機関銃1、重機関銃班2(中)。人員・小銃・短機関銃・パンツァーファウストの数は TODO(要裏取り)。
# 第14中隊は対戦車(パンツァーシュレック 18 × 3個小隊、小隊50名。tacticalnotebook。中)。
# 第13中隊は軽歩兵砲・重歩兵砲(1944年に一部を12cm 迫撃砲に替えた連隊が多い。12cm 迫撃砲は諸元が分からないので入れていない。TODO)
T["de-gr-1944"] = toe(
    "擲弾兵連隊(独1944・44年型歩兵師団)",
    "infantry_regiment",
    [
        el("連隊本部・通信小隊", 1, 60, [("de-kar98k", 45), ("de-mp40", 10)], "連隊本部"),
        el("擲弾兵中隊", 6, 142, [("de-kar98k", 105), ("de-mp40", 16), ("de-g43", 6), ("de-mg42", 12), ("de-mg42s", 2), ("de-pzf30", 18)], "大隊", 2),
        el("重火器中隊", 2, 160, [("de-kar98k", 120), ("de-mp40", 8), ("de-mg42s", 8), ("de-grw34", 6)], "大隊", 2),
        el("第13中隊(歩兵砲)", 1, 170, [("de-kar98k", 120), ("de-leig18", 4), ("de-sig33", 2)], "連隊直轄"),
        el("第14中隊(パンツァーシュレック)", 1, 150, [("de-kar98k", 60), ("de-mp40", 20), ("de-rpzb54", 54)], "連隊直轄"),
    ],
)

# 1944年の国民擲弾兵連隊(2個大隊)。中隊は 1944年11月の表で 2名+117名(中)。2個小隊が突撃銃(StG 44)の突撃小隊、1個小隊が小銃小隊
# (理屈の上の形。実際に StG 44 がそろったのは中隊の半分に満たないとされる。中)。機関銃・突撃銃・パンツァーファウストの数は TODO(要裏取り:KStN 131V)
T["de-vgr-1944"] = toe(
    "国民擲弾兵連隊(独1944)",
    "infantry_regiment",
    [
        el("連隊本部・通信小隊", 1, 50, [("de-kar98k", 35), ("de-mp40", 10)], "連隊本部"),
        el("擲弾兵中隊(突撃小隊2・小銃小隊1)", 6, 119, [("de-stg44", 60), ("de-kar98k", 40), ("de-mg42", 6), ("de-pzf30", 18)], "大隊", 2),
        el("重火器中隊", 2, 140, [("de-kar98k", 100), ("de-mg42s", 6), ("de-grw34", 6)], "大隊", 2),
        el("第13中隊(歩兵砲)", 1, 150, [("de-kar98k", 100), ("de-leig18", 4), ("de-sig33", 2)], "連隊直轄"),
        el("第14中隊(パンツァーシュレック)", 1, 150, [("de-kar98k", 60), ("de-mp40", 20), ("de-rpzb54", 54)], "連隊直轄"),
    ],
)

# 1918年の歩兵連隊(3個大隊 × 4個中隊)。人員・軽機関銃・重機関銃の数はすべて TODO(要裏取り:Gudmundsson『Stormtroop Tactics』、
# 米陸軍『Histories of Two Hundred and Fifty-One Divisions of the German Army』の付録)。突撃隊の短機関銃は1918年に一部だけ
T["de-ir-1918"] = toe(
    "歩兵連隊(独1918)",
    "infantry_regiment",
    [
        el("連隊本部", 1, 60, [("de-gew98", 50)], "連隊本部"),
        el("歩兵中隊", 12, 150, [("de-gew98", 130), ("de-mg0815", 6), ("de-mp18", 2)], "大隊", 3),
        el("機関銃中隊", 3, 120, [("de-gew98", 90), ("de-mg08", 12)], "大隊", 3),
    ],
)

# 1944年の戦車大隊(パンター・IV号)。KStN 1177(fG)1944年4月1日:中隊17両(本部2+5両×3)、大隊76両(17×4+本部8)(中〜高)。
# 乗員5名/両。整備・補給の人員は入れていない(TODO)
T["de-panther-abt-1944"] = toe(
    "戦車大隊(パンター・独1944)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 40, [("de-panther", 8)], "大隊本部"),
        el("戦車中隊(パンター)", 4, 85, [("de-panther", 17)], "中隊"),
    ],
    modifiers=[],
)
T["de-pz4-abt-1944"] = toe(
    "戦車大隊(IV号 H型・独1944)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 40, [("de-pz4h", 8)], "大隊本部"),
        el("戦車中隊(IV号)", 4, 85, [("de-pz4h", 17)], "中隊"),
    ],
)
# 1940年の戦車大隊(軽戦車中隊2・中戦車中隊1)。両数と内訳は TODO(要裏取り:Jentz『Panzertruppen』)。
T["de-pz-abt-1940"] = toe(
    "戦車大隊(II号・III号・IV号・独1940)",
    "tank_battalion",
    [
        el("大隊本部(戦車)", 1, 25, [("de-pz3f", 2), ("de-pz2c", 3)], "大隊本部"),
        el("軽戦車中隊(III号・II号)", 2, 90, [("de-pz3f", 10), ("de-pz2c", 7)], "中隊"),
        el("中戦車中隊(IV号・II号)", 1, 80, [("de-pz4d", 8), ("de-pz2c", 5)], "中隊"),
    ],
)
# 1944年の突撃砲旅団:31両(3個中隊 × 10 + 本部1。フォーラム。KStN 446 b(1944年2月)の中隊は StuG 10・StuH 4 の14両。低〜中)。
# StuH 42(10.5cm)は入れていない(TODO)
T["de-stug-brigade-1944"] = toe(
    "突撃砲旅団(III号突撃砲 G・独1944)",
    "tank_destroyer_battalion",
    [
        el("旅団本部(突撃砲)", 1, 12, [("de-stug3g", 1)], "旅団本部"),
        el("突撃砲中隊", 3, 60, [("de-stug3g", 10)], "中隊"),
    ],
    echelon="battalion",
    modifiers=["armored"],
)
# 1944年の戦車駆逐中隊(IV号駆逐戦車)14両(KStN の中隊の数は TODO(要裏取り))を3つで大隊に
T["de-jgpz-abt-1944"] = toe(
    "戦車駆逐大隊(IV号駆逐戦車・独1944)",
    "tank_destroyer_battalion",
    [
        el("大隊本部", 1, 12, [("de-jgpz4", 2)], "大隊本部"),
        el("戦車駆逐中隊", 3, 60, [("de-jgpz4", 14)], "中隊"),
    ],
    modifiers=["armored"],
)
# 1944年の装甲擲弾兵大隊(半装軌車)。中隊ごとにパンツァーシュレック3・パンツァーファウスト18(1944年6月の通達、中)。
# 1944年4月・7月の freie Gliederung では分隊からパンツァーシュレックを外した(中)→ ここでは入れない。人員・機関銃・半装軌車の数は TODO(要裏取り:KStN 1114(fG))
T["de-pzgr-bn-1944"] = toe(
    "装甲擲弾兵大隊(半装軌車・独1944)",
    "mechanized_infantry_battalion",
    [
        el("大隊本部", 1, 40, [("de-kar98k", 25), ("de-mp40", 10), ("de-sdkfz251", 3)], "大隊本部"),
        el("装甲擲弾兵中隊", 3, 150, [("de-kar98k", 90), ("de-mp40", 25), ("de-stg44", 10), ("de-mg42", 18), ("de-sdkfz251", 17), ("de-pzf30", 18)], "中隊"),
        el("重火器中隊", 1, 160, [("de-kar98k", 110), ("de-mg42s", 4), ("de-grw34", 6), ("de-pak40", 3), ("de-sdkfz251", 18)], "中隊"),
    ],
)
# 砲兵大隊(leFH 18 3個中隊 × 4門、sFH 18 3個中隊 × 4門)。人員は TODO(要裏取り)
T["de-art-abt-lefh18"] = toe(
    "砲兵大隊(leFH 18・独)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 60, [("de-kar98k", 50)], "大隊本部"),
        el("砲兵中隊(10.5cm)", 3, 130, [("de-kar98k", 100), ("de-mg34", 2), ("de-lefh18", 4)], "中隊"),
    ],
)
T["de-art-abt-sfh18"] = toe(
    "重砲兵大隊(sFH 18・独)",
    "artillery_battalion",
    [
        el("大隊本部・観測", 1, 60, [("de-kar98k", 50)], "大隊本部"),
        el("砲兵中隊(15cm)", 3, 150, [("de-kar98k", 110), ("de-mg34", 2), ("de-sfh18", 4)], "中隊"),
    ],
)
# 偵察中隊(装甲車)。数は TODO(要裏取り)
T["de-recon-coy"] = toe(
    "装甲偵察中隊(Sd.Kfz. 222・独)",
    "recon_squadron",
    [
        el("装甲車小隊", 3, 18, [("de-sdkfz222", 6), ("de-mp40", 6)], "小隊"),
    ],
    echelon="company",
)

W_NOTES = (
    "ドイツ軍の武器(1丁・1門・1両あたり)と装備品の一覧。汎用のパックの後ろに重ねて使う。威力の物差しは docs/research/equipment-calibration.md、"
    "射程・貫通力・装甲・年の根拠は docs/research/equipment-de.md(検索結果の要約による二次資料)。"
    f"TODO(要裏取り):表より遠い帯は表の最後の値({'、'.join(far)})。作り直しは tools/packs/build_de.py"
)
T_NOTES = (
    "ドイツ軍の実数の編成表(人員・装備品で書く)。1918年・1939〜41年・1944年。根拠は docs/research/equipment-de.md。中隊の人員・装備の数の多くは "
    "TODO(要裏取り)(KStN の原文を確かめていない)。作り直しは tools/packs/build_de.py"
)
(ROOT / "data/weapons/de.json").write_text(json.dumps({"id": "de", "notes": W_NOTES, "personnelHitPoints": 0.5, "weapons": W, "equipment": E}, ensure_ascii=False, indent=2) + "\n")
(ROOT / "data/toe/de.json").write_text(json.dumps({"id": "de", "notes": T_NOTES, "toes": T}, ensure_ascii=False, indent=2) + "\n")
print("weapons", len(W), "equipment", len(E), "toes", len(T), "far", far)
