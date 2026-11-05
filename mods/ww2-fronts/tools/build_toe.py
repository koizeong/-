#!/usr/bin/env python3
"""
パックの編成表(中隊規模など、基本のデータにない大きさ)を、基本の国ごとの実数の編成表から切り出して作る。

    python3 mods/ww2-fronts/tools/build_toe.py

出力: mods/ww2-fronts/toe/ww2f-toe.json

切り出した編成表の携行備蓄・燃料は、もとの編成表を人員の割合で分けたもの。正面幅は大きさに合わせた仮置き。
"""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PACK = Path(__file__).resolve().parents[1]
BASE = {f: json.loads((ROOT / f"data/toe/{f}.json").read_text(encoding="utf-8"))["toes"] for f in ["de", "uk", "us", "su", "jp"]}


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
}

out = PACK / "toe/ww2f-toe.json"
out.write_text(
    json.dumps({"id": "ww2f-toe", "notes": "第二次大戦の各戦線のパックの編成表。基本の国ごとの実数の編成表(data/toe)から中隊などを切り出したもの(tools/build_toe.py)。", "toes": TOES}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(f"wrote {out}")
