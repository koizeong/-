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
nap["combat"]["assault"] = {**nap["combat"]["assault"], "stances": ["charge", "attack"], "rangeM": 100, "minSuppression": 0.3, "ratioThreshold": 1.3,
                            "defenderStrengthLoss": 0.12, "attackerStrengthLoss": 0.06, "attackerMoraleLoss": 0.15}
# 騎兵の追撃:潰走した歩兵を斬り立てる(軽騎兵がいちばん)
nap["combat"]["pursuitByBranch"] = {"cavalry": 2.5, "light_cavalry": 3.0}
# 縦隊は砲の的(密集した縦深)。潰走した部隊は散り散り
nap["combat"]["formationDamageTaken"] = {"column": 1.6, "deploying": 1.3, "deployed": 1.0}
nap["morale"] = {**nap["morale"], "routRetreatDistanceM": 2000, "shakenBelow": 0.55, "routBelow": 0.3, "rallyAbove": 0.5}
nap["stances"] = {
    "standard": stance("標準"),
    # 銃剣突撃・騎兵の突撃の前の詰め(強襲と同じ扱い)
    "attack": {**BASE["stances"]["attack"], "name": "突撃(銃剣)"},
    "defense": {**BASE["stances"]["defense"], "name": "死守"},
    # 散兵:物陰に伏せて撃つ(軽歩兵の散兵線。伏撃の見つかりにくさを弱めたもの)
    "ambush": {**BASE["stances"]["ambush"], "name": "散兵", "branches": ["light_infantry", "line_infantry"]},
    "reserve": {**BASE["stances"]["reserve"], "name": "予備"},
    # 方陣:騎兵に強く(馬は銃剣の壁に突っ込まない)、動けず、火力は1面だけ。密集しているので歩兵・砲兵の射撃に脆い
    "square": stance("方陣", branches=["line_infantry", "light_infantry"], firepowerMultiplier=0.4, immobile=True, ignoresFacing=True,
                     frontageMultiplier=0.3, shape="ring", encirclementMoraleMultiplier=0.3,
                     damageTakenFromBranch={"cavalry": 0.2, "light_cavalry": 0.2, "artillery": 2.0, "horse_artillery": 2.0, "line_infantry": 1.3, "light_infantry": 1.3},
                     notes="騎兵の突撃に強い(受ける損害0.2倍)が動けず、密集しているので砲兵(2倍)・歩兵(1.3倍)の射撃に脆い"),
    # 騎兵の突撃:勢いは1ターンだけ。崩れた相手・側面に取りつく
    "charge": stance("突撃(騎兵)", branches=["cavalry", "light_cavalry"], entrenchmentCapModifier=-1, firepowerMultiplier=1.6, damageTakenMultiplier=1.2,
                     ammoConsumptionMultiplier=1.0, breakthroughMultiplier=2.0, breakthroughIgnoresDamage=True, fatigueMultiplier=2.0, effectTurns=1,
                     revertWhenSpent=True, moraleDamageTakenMultiplier=0.5, frontageMultiplier=0.6, zoneSpeedMultiplier=1.6, shape="wedge",
                     notes="1ターンだけの突撃。崩れた歩兵・側面に強く、方陣には効かない"),
}
nap["defaultStance"] = "standard"

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
med["combat"]["assault"] = {**med["combat"]["assault"], "stances": ["charge", "attack"], "rangeM": 60, "minSuppression": 0.2, "ratioThreshold": 1.2,
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
