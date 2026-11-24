#!/usr/bin/env python3
"""
時代の違う戦い(ナポレオン戦争・百年戦争)のルールパックと兵科のパックを作る(ユーザー判断 2026-11:データ+小さな仕組み)。

    python3 tools/rulepacks/build_period_rulepacks.py

出力: data/rulepacks/napoleonic.json・medieval.json、data/branches/napoleonic.json・medieval.json

WWI〜朝鮮戦争のルールパック(data/rulepacks/ww1-korea.json)を元に、時代で違う所だけを書き換える(書き換えた理由は各所のコメント)。
航空・海戦・航空司令部の決まりは使わない(航空の決まりはスキーマで要るので残すが、航空隊を持つ部隊がいない)。
数値はどれもゲームの手触りのための仮置き。TODO(要裏取り):出典候補は Nosworthy『With Musket, Cannon and Sword』、Muir『Tactics and the Experience of
Battle in the Age of Napoleon』、Hughes『Firepower』(ナポレオン戦争)、Strickland & Hardy『The Great Warbow』、Rogers『War Cruel and Sharp』、
DeVries『Infantry Warfare in the Early Fourteenth Century』(百年戦争)。
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = json.loads((ROOT / "data/rulepacks/ww1-korea.json").read_text())

STANCE_KEYS = ["name", "entrenchmentCapModifier", "visionMultiplier", "signatureMultiplier", "estimateErrorMultiplier", "firepowerMultiplier", "damageTakenMultiplier", "ammoConsumptionMultiplier"]


def stance(name, **kw):
    s = {"name": name, "entrenchmentCapModifier": 0, "visionMultiplier": 1.0, "signatureMultiplier": 1.0, "estimateErrorMultiplier": 1.0, "firepowerMultiplier": 1.0, "damageTakenMultiplier": 1.0, "ammoConsumptionMultiplier": 1.0}
    s.update(kw)
    return s


def common(rp, rid, name, notes):
    rp = copy.deepcopy(rp)
    rp["id"] = rid
    rp["name"] = name
    rp["notes"] = notes
    # 航空司令部・盤上の航空隊・海戦は使わない
    for k in ("airOps", "airGroups", "naval"):
        rp.pop(k, None)
    # 無線のない時代:接敵の距離は近く、霧(見えない所の敵)は濃い
    rp["contactRangeM"] = 600
    rp["fog"]["default"] = "heavy"
    # 機関銃・砲弾の制圧の代わりに、損害は士気に効く(密集隊形の崩れ)。制圧の比重を下げ、士気の比重を上げる
    rp["combat"]["gaugeWeights"] = {"strength": 0.12, "suppression": 2.5, "morale": 2.5}
    rp["combat"]["directFireMoraleMultiplier"] = 2.5
    # 装甲・貫通・護衛・射線の高さは使わない(武器に貫通力がなく、装甲の部隊もない)
    rp["combat"].pop("escort", None)
    # 間接射撃の砲撃・空襲はない(大砲は直接照準)。前もって築いた陣地は野戦築城まで
    rp["entrenchment"]["fieldMaxLevel"] = 2
    rp["roadSpeedMultiplier"] = 1.3
    return rp


# ---------------------------------------------------------------- ナポレオン戦争(1805年ごろ)
nap = common(BASE, "napoleonic", "ナポレオン戦争(1792〜1815年)",
             "ナポレオン戦争の時代ルール(ユーザー判断で足した。tools/rulepacks/build_period_rulepacks.py)。マスケットの戦列・縦隊・方陣、騎兵の突撃と追撃、直接照準の大砲。数値は仮置き")
# 突撃(銃剣・騎兵の突撃)は今の肉薄で表す。距離は短く、崩れかけた相手(制圧・動揺)に取りつく。騎兵は騎兵の突撃を先に使う(AI は兵科の取れる最初の姿勢)
# 突撃は約200mから(騎兵の最後の襲歩・銃剣の突撃の駆け足。阻止圏の判定のない肉薄の距離 closeAssaultM=150m より外で判定する。
# 初めは100mにしたが、肉薄の距離の内の突破の判定で止められ、騎兵が方陣に届かなかった)
nap["combat"]["assault"] = {**nap["combat"]["assault"], "stances": ["charge", "attack"], "rangeM": 200, "minSuppression": 0.3, "ratioThreshold": 1.3,
                            "defenderStrengthLoss": 0.12, "attackerStrengthLoss": 0.06, "attackerMoraleLoss": 0.15}
# 士気の衝撃(docs/research/napoleonic-vs-ww2-infantry.md の3の4):銃剣・騎兵の突撃は白兵まで届くことが稀で、近づく間に守り手が崩れるかで決まる。
# 守り手の落ち着き(士気・制圧・隊形・突かれた面)と攻め手の勢い(士気・隊形・力の比)から踏みとどまる見込みを出す。数値は仮置き
# (鋭さは初め2にしたが、方陣が騎兵に踏みとどまる見込みが86%にとどまった。方陣は落ち着いていればまず破れないので3に)
SHOCK = {"sharpness": 3.0, "suppressionWeight": 0.5, "flankMultiplier": 0.5, "rearMultiplier": 0.35, "ratioExponent": 0.5, "repulsedMoraleLoss": 0.25}
nap["combat"]["assault"]["shock"] = SHOCK
# 黒色火薬の硝煙(docs/research/napoleonic-vs-ww2-infantry.md の3の6):撃ち続けると数十mしか見えなくなる。撃っている間の煙はおよそ0.6〜0.7で釣り合い、
# 火力を約4分の1、探知の距離を約3分の1下げる。撃つのをやめると10分ほどで大方晴れる(数値は仮置き)
nap["combat"]["smoke"] = {"perMinute": 0.06, "decayPerMin": 0.1, "hitPenalty": 0.4, "visionPenalty": 0.5}
# 散兵の幕(同じく3の5):散兵の要素(編成表の skirmishers)を持つ部隊は、横隊・突撃縦隊・死守・予備のとき本隊の前に幕を張り、100mより遠くからの射撃を
# 引き受ける。幕は散兵の要素が耐久の1割で満ち(半島戦争では大隊の約1割が散兵に出た)、受ける損害を最大4割減らす。幕どうしは打ち消し合い、騎兵には効かない
nap["combat"]["skirmishScreen"] = {"stances": ["standard", "attack", "defense", "reserve"], "closeM": 100, "maxReduction": 0.4, "fullShare": 0.1,
                                    "ignoredBy": ["cavalry", "light_cavalry"]}
# 騎兵の追撃:潰走した歩兵を斬り立てる(軽騎兵がいちばん)
nap["combat"]["pursuitByBranch"] = {"cavalry": 2.5, "light_cavalry": 3.0}
# 縦隊は砲の的(密集した縦深)。潰走した部隊は散り散り
nap["combat"]["formationDamageTaken"] = {"column": 1.6, "deploying": 1.3, "deployed": 1.0}
nap["morale"] = {**nap["morale"], "routRetreatDistanceM": 2000, "shakenBelow": 0.55, "routBelow": 0.3, "rallyAbove": 0.5}
# 隊形(ユーザー判断 2026-11。docs/research/napoleonic-vs-ww2-infantry.md):姿勢を隊形として使い、切替はターンの途中で分単位(changeMinutes)。
# 切替の間は既定の姿勢(横隊)として扱う。密度 density・縦の深さ depth は、撃つ武器の densityEffect・depthEffect の割合だけ受ける損害に掛かる
# (ぶどう弾は方陣・縦隊に、実体弾は縦隊に多く当たる。散開した散兵には効きにくい)。数値は仮置き
nap["stances"] = {
    # 横隊:3列(英は2列)で並び、大隊のほぼ全員が撃てる。動きは遅く、側面・騎兵に脆い
    "standard": stance("横隊", changeMinutes=5,
                       notes="大隊のほぼ全員が撃てる(火力1.0)。側面と騎兵に脆い"),
    # 突撃縦隊:先頭の中隊しか撃てないが、速く動けて勢いで押し込む(銃剣の突撃)。縦に深いので実体弾にもろい
    "attack": {**BASE["stances"]["attack"], "name": "突撃縦隊", "firepowerMultiplier": 0.4, "damageTakenMultiplier": 1.0, "effectTurns": 2,
               "breakthroughMultiplier": 1.8, "zoneSpeedMultiplier": 1.4, "frontageMultiplier": 0.35, "moraleDamageTakenMultiplier": 0.6,
               "density": 1.8, "depth": 3.0, "changeMinutes": 5, "shape": "wedge", "shockMultiplier": 1.1,
               "notes": "先頭しか撃てない(火力0.4)が、速く動いて銃剣で押し込む。密集し縦に深いので、ぶどう弾・実体弾に脆い"},
    "defense": {**BASE["stances"]["defense"], "name": "死守", "changeMinutes": 5},
    # 散開(散兵):物陰に散って撃つ。砲・射撃に強いが、騎兵に蹴散らされ、密集した隊形を止める力はない
    "ambush": {**BASE["stances"]["ambush"], "name": "散開(散兵)", "branches": ["light_infantry", "line_infantry"], "immobile": False,
               "signatureMultiplier": 0.5, "openingFireMultiplier": 1.0, "revealOnFire": False, "firepowerMultiplier": 0.6, "frontageMultiplier": 1.5,
               "density": 0.3, "depth": 0.7, "changeMinutes": 3, "damageTakenFromBranch": {"cavalry": 2.5, "light_cavalry": 3.0},
               "shockResistFromBranch": {"cavalry": 0.3, "light_cavalry": 0.3},
               "notes": "物陰に散って撃つ(火力0.6)。砲と射撃に強いが、騎兵に蹴散らされる(2.5〜3倍)"},
    "reserve": {**BASE["stances"]["reserve"], "name": "予備", "changeMinutes": 5},
    # 方陣:騎兵に強く(馬は銃剣の壁に突っ込まない)、動けず、火力は1面だけ。密集しているので砲・射撃に脆い(密度2)
    "square": stance("方陣", branches=["line_infantry", "light_infantry"], firepowerMultiplier=0.4, immobile=True, ignoresFacing=True,
                     frontageMultiplier=0.3, shape="ring", encirclementMoraleMultiplier=0.3, density=2.0, depth=1.5, changeMinutes=3,
                     damageTakenFromBranch={"cavalry": 0.2, "light_cavalry": 0.2}, shockResistFromBranch={"cavalry": 4.0, "light_cavalry": 4.0},
                     notes="騎兵の突撃に強い(受ける損害0.2倍)が動けず、密集しているのでぶどう弾・実体弾・射撃に脆い"),
    # 騎兵の突撃:勢いは1ターンだけ。崩れた相手・側面に取りつく
    "charge": stance("突撃(騎兵)", branches=["cavalry", "light_cavalry"], entrenchmentCapModifier=-1, firepowerMultiplier=1.6, damageTakenMultiplier=1.2,
                     ammoConsumptionMultiplier=1.0, breakthroughMultiplier=2.0, breakthroughIgnoresDamage=True, fatigueMultiplier=2.0, effectTurns=1,
                     revertWhenSpent=True, moraleDamageTakenMultiplier=0.5, frontageMultiplier=0.6, zoneSpeedMultiplier=1.6, shape="wedge", changeMinutes=2,
                     density=1.5, shockMultiplier=1.3,
                     notes="1ターンだけの突撃。崩れた歩兵・側面・散兵に強く、方陣には効かない"),
}
nap["defaultStance"] = "standard"

# ---- 線形戦術の違い(ユーザー判断 2026-11。docs/research/napoleonic-mechanics-review.md の A〜E)。数値はどれも仮置き ----
# A:陸のターンは15分・小ステップ30秒(騎兵の突撃は1分で届き、隊形の替えは数分、撃ち合いは十数分で決まる。1時間のターンでは決断の前に終わる)。
# 縦隊から横隊への展開は5分(大隊の展開は数分。1ターン=15分では長すぎる)
nap["time"] = {"turnSeconds": 900, "stepSeconds": 30, "deploySeconds": 300}
# B:横隊は整列を保つので遅い(普通の歩調は毎分75〜80歩=約50mだが、整列し直す止まりを入れて戦闘移動の 35m/分 × 0.85 ≒ 30m/分)。
# 旋回は翼の端が 0.8 倍の速さで、一度に45度まで。それより大きく向きを変える(回れ右も)ときは縦隊に崩して展開し直す=正面の変換(10分・乱れる)。
# 突撃縦隊・予備(大隊の縦隊)・散兵は向きをすぐ変えられ、速い(縦隊 約50m/分)。
# TODO(要裏取り):旋回・正面の変換の時間は仏1791年の操典・英ダンダスの規定(出典候補は Nosworthy『With Musket, Cannon and Sword』)
# 旅団の横隊は大隊ごとに回る(半径は大隊2つ分の 250m まで)。45度の旋回に約8分
LINE_WHEEL = {"maxDeg": 45, "changeFrontMinutes": 10, "speedMultiplier": 0.8, "radiusM": 250}
nap["stances"]["standard"].update({"moveSpeedMultiplier": 0.85, "wheel": LINE_WHEEL})
nap["stances"]["defense"].update({"moveSpeedMultiplier": 0.85, "wheel": LINE_WHEEL})
nap["stances"]["attack"].update({"moveSpeedMultiplier": 1.4, "pivotsFreely": True})
nap["stances"]["reserve"].update({"moveSpeedMultiplier": 1.2, "pivotsFreely": True})
nap["stances"]["ambush"].update({"moveSpeedMultiplier": 1.2, "pivotsFreely": True})
# C:隊形の秩序。展開した隊形で森・村・川・丘を越える、正面の変換、突撃、損害で乱れ、止まって20分ほどで整列し直す(撃たれていれば3割の速さ)。
# 乱れ1で火力が半分、突撃に踏みとどまる落ち着きが半分、受ける損害が3割増し
nap["cohesion"] = {"terrainPer100m": {"forest": 0.25, "town": 0.3, "river": 0.5, "large_river": 0.8, "hill": 0.04, "plantation": 0.15, "trench": 0.3},
                   "changeFront": 0.25, "assaultAttacker": 0.3, "assaultRepulsed": 0.2, "lossMultiplier": 3.0,
                   "recoveryPerMin": 0.05, "underFireRecoveryMultiplier": 0.3, "firepowerPenalty": 0.5, "shockPenalty": 0.5, "damageTakenIncrease": 0.3}
# D:斉射。装填して待った最初の斉射は1.8倍(撃ち合いが続くと装填が乱れ、早撃ち・不発が増える)。5分撃たずに待てば込め直して最初の斉射に戻る。
# 撃ち始める距離は練度で:未熟200m(遠くから撃って弾と最初の斉射を無駄にする)・標準120m・古参100m・精鋭70m(ウェリントンの50ヤードの斉射)
nap["combat"]["volley"] = {"firstVolleyMultiplier": 1.8, "restoreMinutes": 5, "openFireM": {"green": 200, "regular": 120, "veteran": 100, "elite": 70}}
# E:士気の削り合い。撃ち合いで死傷するのは大隊の数%でも、士気が崩れて退く。戦力への重みを 0.12 から 0.07 に下げ(マスケットの近い距離の
# 斉射は士気への打撃を武器の距離帯の moraleEffect で大きくする)。士気は撃たれていない間だけ戻る(前から)
nap["combat"]["gaugeWeights"] = {"strength": 0.07, "suppression": 2.5, "morale": 2.5}

# 指揮官の名前:フランス・オーストリア・ロシア(架空の名前。時代らしい響きのもの)、階級は当時の呼び方
names = copy.deepcopy(BASE["commanders"]["names"])
names["nations"]["fr"] = {"style": "western", "family": ["ルフェーヴル", "デュボワ", "ベルナール", "モロー", "ロラン", "ジラール", "ボネ", "ルブラン", "ガルニエ", "フォンテーヌ", "ショーヴァン", "マルシャン", "デュラン", "ルクレール", "ベルトラン", "ペラン"],
                         "given": ["ジャン", "ピエール", "ルイ", "フランソワ", "ジャック", "アントワーヌ", "ミシェル", "エティエンヌ", "ニコラ", "ジョゼフ", "シャルル", "オーギュスタン"]}
names["nations"]["at"] = {"style": "western", "family": ["フォン・ヴァルデック", "フォン・ハーゲン", "ケルナー", "フォン・ローゼンベルク", "シュタイナー", "フォン・ブラウン", "ホーファー", "フォン・リヒテンシュタイン", "グラーフ", "ヴィンター", "フォン・マイヤーハイム", "ポラック"],
                         "given": ["ヨハン", "カール", "ヨーゼフ", "フランツ", "フェルディナント", "アントン", "マクシミリアン", "ルートヴィヒ", "レオポルト", "ミヒャエル"]}
names["nations"]["ru"] = {"style": "western", "family": ["ヴォルコンスキー", "オルロフ", "ドルゴルーコフ", "ラエフスキー", "トゥチコフ", "コノヴニーツィン", "オストロフスキー", "ザハロフ", "ベロゼルスキー", "サヴィン", "ガリツィン", "ミロノフ"],
                         "given": ["ピョートル", "アレクサンドル", "ニコライ", "ドミトリー", "ミハイル", "イヴァン", "セルゲイ", "パーヴェル", "ヴァシーリー", "アンドレイ"]}
names["aliases"] = {**names["aliases"], "co": "at"}
names["ranks"]["land"] = {"company": "大尉", "battalion": "少佐", "regiment": "大佐", "brigade": "旅団長(准将)", "division": "師団長(少将)", "corps": "軍団長(中将)", "army": "元帥"}
nap["commanders"] = {**BASE["commanders"], "names": names}

# ---------------------------------------------------------------- 百年戦争(1429年ごろ)
med = common(BASE, "medieval", "百年戦争(1337〜1453年)",
             "百年戦争の時代ルール(ユーザー判断で足した。tools/rulepacks/build_period_rulepacks.py)。長弓・弩の曲射、下馬した重装の兵と騎士の突撃、攻城の砲、杭の陣地。数値は仮置き")
# 突撃は約200mから(ナポレオン戦争と同じく、肉薄の距離 closeAssaultM=150m の内の突破の判定で止められないように)
med["combat"]["assault"] = {**med["combat"]["assault"], "stances": ["charge", "attack"], "rangeM": 200, "minSuppression": 0.2, "ratioThreshold": 1.2,
                            "defenderStrengthLoss": 0.15, "attackerStrengthLoss": 0.08, "attackerMoraleLoss": 0.15}
med["combat"]["pursuitByBranch"] = {"knights": 2.5, "light_horse": 3.0}
med["combat"]["formationDamageTaken"] = {"column": 1.4, "deploying": 1.2, "deployed": 1.0}
# 甲冑の時代:殺された者より、崩れて逃げる・捕虜になる者が多い(士気の比重をさらに上げる)
med["combat"]["gaugeWeights"] = {"strength": 0.1, "suppression": 2.0, "morale": 3.0}
med["morale"] = {**med["morale"], "routRetreatDistanceM": 1500, "shakenBelow": 0.55, "routBelow": 0.3, "rallyAbove": 0.55, "overrunStrengthLoss": 0.25}
med["stances"] = {
    "standard": stance("標準"),
    "attack": {**BASE["stances"]["attack"], "name": "突撃"},
    "defense": {**BASE["stances"]["defense"], "name": "死守"},
    # 伏兵(輸送の護衛の任務で待ち伏せる側が使う。森・生垣に潜む弓兵・歩兵)
    "ambush": {**BASE["stances"]["ambush"], "name": "伏兵", "branches": ["archers", "foot", "men_at_arms"]},
    "reserve": {**BASE["stances"]["reserve"], "name": "予備"},
    # 杭を打った弓兵:騎士の突撃に強い(馬が杭に突っ込めない)が、動けない
    "stakes": stance("杭を打つ", branches=["archers"], entrenchmentCapModifier=1, immobile=True, firepowerMultiplier=1.1,
                     damageTakenFromBranch={"knights": 0.3, "light_horse": 0.3},
                     notes="尖らせた杭を前に打つ(アジャンクール)。騎士・騎兵から受ける損害0.3倍。動けない"),
    # 騎士の突撃
    "charge": stance("突撃(騎乗)", branches=["knights", "light_horse"], entrenchmentCapModifier=-1, firepowerMultiplier=1.8, damageTakenMultiplier=1.2,
                     breakthroughMultiplier=2.0, breakthroughIgnoresDamage=True, fatigueMultiplier=2.0, effectTurns=1, revertWhenSpent=True,
                     moraleDamageTakenMultiplier=0.5, frontageMultiplier=0.6, zoneSpeedMultiplier=1.6, shape="wedge",
                     notes="1ターンだけの騎乗の突撃。崩れた相手・側面と弓兵に強く、杭を打った弓兵・槍の壁には効かない"),
    # 槍の密集(シルトロン):騎乗の突撃に強い
    "schiltron": stance("槍の密集", branches=["men_at_arms", "foot"], immobile=True, ignoresFacing=True, firepowerMultiplier=0.6, frontageMultiplier=0.4, shape="ring",
                        damageTakenFromBranch={"knights": 0.4, "light_horse": 0.4, "archers": 1.5}, notes="騎乗の突撃に強い(0.4倍)が、弓に脆い(1.5倍)"),
}
# 士気の衝撃(ナポレオン戦争と同じ式):騎乗の突撃は杭を打った弓兵・槍の密集に止められ、崩れた相手・側面には強い
med["combat"]["assault"]["shock"] = SHOCK
med["stances"]["charge"]["shockMultiplier"] = 1.3
med["stances"]["stakes"]["shockResistFromBranch"] = {"knights": 4.0, "light_horse": 4.0}
med["stances"]["schiltron"]["shockResistFromBranch"] = {"knights": 3.0, "light_horse": 3.0}
med["defaultStance"] = "standard"
mnames = copy.deepcopy(BASE["commanders"]["names"])
mnames["nations"]["en"] = {"style": "western", "family": ["グレイ", "ハンガーフォード", "ラムリー", "フィッツウォルター", "ウェントワース", "ラドクリフ", "ブラウン", "スコット", "ハリントン", "モーブレー", "パーシー", "ネヴィル"],
                           "given": ["ジョン", "トマス", "ウィリアム", "リチャード", "ロバート", "ヘンリー", "ウォルター", "ハンフリー", "エドマンド", "ラルフ"]}
mnames["nations"]["fr"] = {"style": "western", "family": ["ド・ロレ", "ド・ブイユ", "ド・ラヴァル", "ド・ブロス", "ド・ガルラン", "ド・ヴィエンヌ", "ド・ラ・トゥール", "ド・ショーモン", "ル・ブラン", "ダンジェ", "ド・モンモランシー", "ド・ヴァンドーム"],
                           "given": ["ジャン", "ピエール", "ギヨーム", "ルイ", "ジャック", "ロベール", "エティエンヌ", "ギー", "アンブロワーズ", "シャルル"]}
mnames["ranks"]["land"] = {"company": "隊長", "battalion": "隊長", "regiment": "騎士隊長", "brigade": "将", "division": "将", "corps": "総帥", "army": "総帥"}
med["commanders"] = {**BASE["commanders"], "names": mnames}

BRANCHES = {
    "napoleonic": {
        "id": "napoleonic",
        "notes": "ナポレオン戦争の兵科。行軍の速さは道のおおよその値(歩兵1時間4km強・騎兵8km)の仮置き",
        "branches": {
            "line_infantry": {"name": "戦列歩兵", "marchSpeedMpm": 70, "entrenchmentCapModifier": 0, "visionMultiplier": 1.0, "symbol": "infantry"},
            "light_infantry": {"name": "軽歩兵", "marchSpeedMpm": 75, "entrenchmentCapModifier": 0, "visionMultiplier": 1.2, "symbol": "infantry"},
            "cavalry": {"name": "騎兵(胸甲騎兵・竜騎兵)", "marchSpeedMpm": 130, "entrenchmentCapModifier": -2, "visionMultiplier": 1.2, "holdingMultiplier": 0.6, "symbol": "recon"},
            "light_cavalry": {"name": "軽騎兵(猟騎兵・驃騎兵・コサック)", "marchSpeedMpm": 150, "entrenchmentCapModifier": -2, "visionMultiplier": 1.6, "holdingMultiplier": 0.4, "symbol": "recon"},
            # 砲は直接照準(間接射撃の武器を持たない)。砲兵は前車から外して据えるのに時間がかかり、砲手はむき出し
            "artillery": {"name": "徒歩砲兵", "marchSpeedMpm": 60, "entrenchmentCapModifier": 0, "visionMultiplier": 1.0, "holdingMultiplier": 0.3, "directDamageTakenMultiplier": 1.5, "deployMultiplier": 0.5, "symbol": "artillery"},
            "horse_artillery": {"name": "騎砲兵", "marchSpeedMpm": 110, "entrenchmentCapModifier": 0, "visionMultiplier": 1.0, "holdingMultiplier": 0.3, "directDamageTakenMultiplier": 1.5, "deployMultiplier": 0.3, "symbol": "artillery"},
        },
    },
    "medieval": {
        "id": "medieval",
        "notes": "百年戦争の兵科。行軍の速さは仮置き(騎行の騎兵は速いが、軍勢は荷車と徒歩に合わせて遅い)",
        "branches": {
            "men_at_arms": {"name": "重装の兵(下馬)", "marchSpeedMpm": 55, "entrenchmentCapModifier": 0, "visionMultiplier": 1.0, "symbol": "infantry"},
            "archers": {"name": "弓兵(長弓・弩)", "marchSpeedMpm": 65, "entrenchmentCapModifier": 0, "visionMultiplier": 1.1, "holdingMultiplier": 0.6, "symbol": "infantry"},
            "foot": {"name": "歩兵(槍・民兵)", "marchSpeedMpm": 60, "entrenchmentCapModifier": 0, "visionMultiplier": 1.0, "symbol": "infantry"},
            "knights": {"name": "騎士(騎乗の重装の兵)", "marchSpeedMpm": 110, "entrenchmentCapModifier": -2, "visionMultiplier": 1.2, "holdingMultiplier": 0.6, "symbol": "recon"},
            "light_horse": {"name": "軽騎兵(騎乗の弓兵・斥候)", "marchSpeedMpm": 140, "entrenchmentCapModifier": -2, "visionMultiplier": 1.6, "holdingMultiplier": 0.4, "symbol": "recon"},
            "artillery": {"name": "攻城の砲(ボンバード)", "marchSpeedMpm": 25, "entrenchmentCapModifier": 1, "visionMultiplier": 1.0, "holdingMultiplier": 0.2, "directDamageTakenMultiplier": 1.5, "deployMultiplier": 1.0, "symbol": "artillery"},
        },
    },
}

for rp in (nap, med):
    (ROOT / f"data/rulepacks/{rp['id']}.json").write_text(json.dumps(rp, ensure_ascii=False, indent=2) + "\n")
for bid, bp in BRANCHES.items():
    (ROOT / f"data/branches/{bid}.json").write_text(json.dumps(bp, ensure_ascii=False, indent=2) + "\n")
print("wrote napoleonic / medieval rulepacks and branches")
