#!/usr/bin/env python3
"""
パックの編成表(中隊規模など、基本のデータにない大きさ)を、基本の国ごとの実数の編成表から切り出して作る。

    python3 mods/ww2-fronts/tools/build_toe.py

出力: mods/ww2-fronts/toe/ww2f-toe-<国>.json

切り出した編成表の携行備蓄・燃料は、もとの編成表を人員の割合で分けたもの。正面幅は大きさに合わせた仮置き。
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
BASE = {f: json.loads((ROOT / f"data/toe/{f}.json").read_text(encoding="utf-8"))["toes"] for f in ["de", "uk", "us", "su", "jp", "it"]}


def carve(src_pack, src, name, picks, echelon, frontage):
    """src の要素から picks(要素の名前 → (数, 装備品の数の倍率))を選んで、新しい編成表にする"""
    t = copy.deepcopy(BASE[src_pack][src])
    total = sum(e["count"] * e["personnel"] for e in t["elements"])
    out = []
    for e in t["elements"]:
        if e["name"] not in picks:
            continue
        n, scale = picks[e["name"]]
        e = copy.deepcopy(e)
        e["count"] = n
        if scale != 1:
            e["personnel"] = round(e["personnel"] * scale)
            for q in e["equipment"]:
                q["count"] = max(1, round(q["count"] * scale))
        out.append(e)
    share = sum(e["count"] * e["personnel"] for e in out) / total
    t["name"] = name
    t["elements"] = out
    t["frontageM"] = frontage
    t["supply"] = {k: (round(v * share, 2) if k != "fuelPerKmT" else round(v * max(share, 0.2), 3)) for k, v in t["supply"].items()}
    t["symbol"] = {"echelon": echelon, "modifiers": t["symbol"]["modifiers"]}
    return t


def compose(src_pack, src, name, elements, echelon, frontage):
    """src の兵科・備蓄の割合を借りて、要素を書き下ろした編成表にする(備蓄は人員の割合で分ける)"""
    t = copy.deepcopy(BASE[src_pack][src])
    total = sum(e["count"] * e["personnel"] for e in t["elements"])
    share = sum(e["count"] * e["personnel"] for e in elements) / total
    t["name"] = name
    t["elements"] = elements
    t["frontageM"] = frontage
    t["supply"] = {k: (round(v * share, 2) if k != "fuelPerKmT" else round(v * max(share, 0.2), 3)) for k, v in t["supply"].items()}
    t["symbol"] = {"echelon": echelon, "modifiers": t["symbol"]["modifiers"]}
    return t


def kv(n, personnel_per=5):
    return {"name": f"重戦車({n}両)", "count": 1, "personnel": n * personnel_per, "equipment": [{"item": "su-kv1", "count": n}], "group": "中隊"}


TOES = {
    # ヴィレル=ボカージュ:第101SS重戦車大隊の第2中隊(動けたのは5〜6両ほど)。中隊14両の 0.43 倍で6両
    "ww2f-de-tiger-coy-1944": carve("de", "de-tiger-abt-1943", "重戦車中隊(ティーガー6両)", {"重戦車中隊(ティーガー)": (1, 0.43)}, "company", 400),
    # 同じ大隊の第1中隊(8両ほど)
    "ww2f-de-tiger-coy8-1944": carve("de", "de-tiger-abt-1943", "重戦車中隊(ティーガー8両)", {"重戦車中隊(ティーガー)": (1, 0.58)}, "company", 400),
    # 英の機甲連隊の戦車中隊1つ(クロムウェル16・ファイアフライ4)
    "ww2f-uk-armd-sqn-1944": carve("uk", "uk-armd-regt-1944", "戦車中隊(クロムウェル・英1944)", {"戦車中隊(クロムウェル・ファイアフライ)": (1, 1)}, "company", 400),
    # 英の歩兵大隊のライフル中隊1つ(自動車化歩兵の中隊の代わり)
    "ww2f-uk-rifle-coy-1944": carve("uk", "uk-inf-bn-1944", "ライフル中隊(英1944)", {"ライフル中隊": (1, 1)}, "company", 300),
    # IV号戦車の中隊2つ(装甲教導師団の反撃の分)
    "ww2f-de-pz4-2coy-1944": carve("de", "de-pz4-abt-1944", "IV号戦車の2個中隊(独1944)", {"戦車中隊(IV号)": (2, 1)}, "company", 500),
    # ラセイニャイ:ソ第2戦車師団の重戦車大隊。KV-1 32両・KV-2 19両とされる(KV-2 は装備品の一覧にないので KV-1 で代えた。TODO(要裏取り))。
    # 大隊本部1両+中隊8両×3 で25両(BT 大隊の備蓄の割合を借りる)
    "ww2f-su-kv-bn-1941": compose("su", "su-bt-tank-bn-1941", "重戦車大隊(KV・ソ1941)", [
        {"name": "大隊本部(戦車)", "count": 1, "personnel": 10, "equipment": [{"item": "su-kv1", "count": 1}], "group": "大隊本部"},
        {"name": "重戦車中隊(KV)", "count": 3, "personnel": 40, "equipment": [{"item": "su-kv1", "count": 8}], "group": "中隊"},
    ], "battalion", 600),
    # 交差点の1両の KV(KV-2 とも KV-1 とも言われる)
    "ww2f-su-kv-single-1941": compose("su", "su-bt-tank-bn-1941", "KV 重戦車1両", [kv(1, 6)], "company", 150),
    # 独の歩兵大隊(1939〜41年の歩兵連隊から、小銃中隊3・機関銃中隊1。狙撃兵(自動車化歩兵)の大隊の代わり)
    "ww2f-de-inf-bn-1941": carve("de", "de-ir-1939", "歩兵大隊(独1939〜41)", {"小銃中隊": (3, 1), "機関銃中隊": (1, 1)}, "battalion", 700),
    # ソの狙撃兵大隊(1941年の狙撃兵連隊から、狙撃兵中隊3・機関銃中隊1・迫撃砲中隊1)
    "ww2f-su-rifle-bn-1941": carve("su", "su-rifle-regt-1941", "狙撃兵大隊(ソ1941)", {"狙撃兵中隊": (3, 1), "機関銃中隊": (1, 1), "迫撃砲中隊(82mm)": (1, 1)}, "battalion", 700),
    # カセリーヌ:米の歩兵大隊(1942〜43年の歩兵連隊から、大隊本部中隊・小銃中隊3・重火器中隊。第19工兵連隊の大隊も歩兵として戦ったのでこれで代えた)
    "ww2f-us-inf-bn-1942": carve("us", "us-ir-1942", "歩兵大隊(米1942〜43)", {"大隊本部中隊(対戦車小隊を含む)": (1, 1), "小銃中隊": (3, 1), "重火器中隊": (1, 1)}, "battalion", 700),
    # M3 リーの戦車中隊1つ(第13機甲連隊の分遣の代わり。TODO(要裏取り))
    "ww2f-us-lee-coy-1942": carve("us", "us-tank-bn-1942-lee", "中戦車中隊(M3 リー・米1942)", {"中戦車中隊(M3 リー)": (1, 1)}, "company", 400),
    # 独の歩兵大隊(1942年の歩兵連隊から。アフリカ装甲擲弾兵連隊の大隊などの代わり)
    "ww2f-de-inf-bn-1942": carve("de", "de-ir-1942", "歩兵大隊(独1942)", {"小銃中隊": (3, 1), "機関銃中隊": (1, 1)}, "battalion", 700),
    # 伊の歩兵大隊(1940年の歩兵連隊から。ベルサリエーリの大隊の代わり)
    "ww2f-it-inf-bn-1940": carve("it", "it-ir-1940", "歩兵大隊(伊1940)", {"小銃中隊": (3, 1), "機関銃中隊": (1, 1)}, "battalion", 700),
}

# 国ごとに別のファイルにする(編成表のパックは、使う武器パックをシナリオがすべて読んでいないと検証で弾かれるため)
for old_file in (PACK / "toe").glob("ww2f-toe*.json"):
    old_file.unlink()
for nation in sorted({k.split("-")[1] for k in TOES}):
    out = PACK / f"toe/ww2f-toe-{nation}.json"
    toes = {k: v for k, v in TOES.items() if k.split("-")[1] == nation}
    out.write_text(
        json.dumps({"id": f"ww2f-toe-{nation}", "notes": "第二次大戦の各戦線のパックの編成表。基本の国ごとの実数の編成表(data/toe)から中隊などを切り出したもの(tools/build_toe.py)。", "toes": toes}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {out}")
