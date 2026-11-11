#!/usr/bin/env python3
"""
史実の指揮官(調査メモ・検索結果で名前と役職を確かめた人だけ)を、シナリオの commanders に書く。

    python3 tools/scenarios/historical_commanders.py      # data/scenarios・mods の該当シナリオを書き換える

各 build スクリプトも apply() を呼ぶので、作り直しても消えない。
名前は確かめた範囲だけ(名が分からない人は姓だけ)、階級も確かめたものだけ書く(分からなければ省く)。
特性はその人の評判からのゲームの設計で、史実の評価ではない。書かなかった部隊・上級部隊には、架空の指揮官が自動で付く。
出典:各シナリオの調査メモ(docs/research/・mods/ww2-fronts/research/)と、検索結果の要約(ミッドウェーのスプルーアンス・フレッチャー・南雲、
バストーニュのマコーリフ(第101空挺師団の師団長代理)、B 戦闘団のロバーツ大佐)
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def c(cid, name, side, traits, rank=None, unit=None, formation=None, note=None):
    d = {"id": cid, "name": name, "side": side, "traits": traits}
    if rank:
        d["rank"] = rank
    if unit:
        d["unitId"] = unit
    if formation:
        d["formationId"] = formation
    if note:
        d["note"] = note
    return d


BASTOGNE = [
    c("mcauliffe", "アンソニー・マコーリフ", "us", ["tenacious", "inspiring"], rank="准将", formation="us-101abn", note="師団長テイラーの留守に、第101空挺師団を率いた(師団長代理)"),
    c("roberts", "W・L・ロバーツ", "us", ["methodical", "tenacious"], rank="大佐", formation="us-10ad-ccb", note="第10機甲師団B戦闘団の指揮官"),
    c("desobry", "デゾブリー", "us", ["aggressive", "tenacious"], unit="us-team-desobry", note="ノヴィルを守った任務部隊の指揮官"),
    c("cherry", "チェリー", "us", ["tenacious", "observant"], unit="us-team-cherry"),
    c("ohara", "オハラ", "us", ["methodical", "tenacious"], unit="us-team-ohara"),
    c("luttwitz", "リュトヴィッツ", "de", ["aggressive", "mobile"], formation="de-xlvii", note="第47装甲軍団長"),
    c("bayerlein", "バイエルライン", "de", ["aggressive", "observant"], formation="de-lehr", note="装甲教導師団長"),
]

TABLE = {
    "midway-1942-06-04": [
        c("nagumo", "南雲忠一", "jp", ["cautious", "methodical"], rank="中将", formation="jp-kb", note="第一航空艦隊司令長官"),
        c("spruance", "レイモンド・スプルーアンス", "us", ["observant", "methodical"], rank="少将", formation="us-tf16f", note="第16任務部隊(エンタープライズ・ホーネット)"),
        c("fletcher", "フランク・J・フレッチャー", "us", ["cautious", "tenacious"], rank="少将", formation="us-tf17f", note="第17任務部隊(ヨークタウン)。全体の指揮をとり、ヨークタウンが傷ついた後はスプルーアンスに戦術の指揮を譲った"),
    ],
    "malaya-sea-1941-12-10": [
        c("phillips", "トム・フィリップス", "uk", ["reckless"], rank="大将", formation="uk-force-z", note="東洋艦隊司令長官。無線を封止して戦闘機の援護を呼ばなかった。プリンス・オブ・ウェールズとともに戦死"),
        c("matsunaga", "松永貞市", "jp", ["methodical"], rank="少将", formation="jp-22af", note="第22航空戦隊司令官"),
    ],
    "bastogne-1944-12-19": BASTOGNE,
    "bastogne-1944-12": BASTOGNE,
    "edson-ridge-1942-09-12": [
        c("edson", "エドソン", "us", ["tenacious", "inspiring"], rank="中佐", formation="us-edson"),
        c("kawaguchi", "川口清健", "jp", ["aggressive", "reckless"], formation="jp-kawaguchi", note="川口支隊長"),
    ],
    "slim-river-1942-01-07": [
        c("shimada", "島田豊作", "jp", ["aggressive", "mobile"], rank="少佐", unit="jp-shimada", note="島田戦車隊を率いて夜の突進を行った"),
    ],
    "arras-1940-05-21": [
        c("rommel", "ロンメル", "de", ["aggressive", "mobile", "observant"], formation="de-7pz", note="第7装甲師団長。8.8cm 高射砲で急ごしらえの砲列を作った"),
    ],
    "hannut-1940-05-12": [
        c("prioux", "プリウー", "fr", ["methodical", "tenacious"], formation="fr-cc", note="騎兵軍団長"),
        c("hoepner", "ヘプナー", "de", ["aggressive", "mobile"], formation="de-xvi", note="第16自動車化軍団長"),
    ],
    "villers-bocage-1944-06-13": [
        c("erskine", "アースキン", "uk", ["cautious", "methodical"], formation="uk-7ad", note="第7機甲師団長。17時ごろ町からの撤退を命じた"),
        c("hinde", "ウィリアム・ハインド", "uk", ["aggressive", "mobile"], rank="准将", formation="uk-22", note="第22機甲旅団長"),
        c("wittmann", "ミハエル・ヴィットマン", "de", ["aggressive", "observant"], unit="de-101-2", note="第101SS重戦車大隊 第2中隊長"),
    ],
    "raseiniai-1941-06-24": [
        c("raus", "エアハルト・ラウス", "de", ["methodical", "tenacious"], formation="de-raus", note="ラウス戦闘団の指揮官"),
        c("solyankin", "エゴール・ソリャンキン", "su", ["aggressive", "tenacious"], formation="su-2td", note="第2戦車師団長"),
    ],
    "kasserine-1943-02-20": [
        c("stark", "アレクサンダー・スターク", "us", ["tenacious", "cautious"], rank="大佐", formation="us-stark", note="第26連隊戦闘団長。峠の陣地の指揮を任された"),
        c("robinett", "ポール・ロビネット", "us", ["methodical", "observant"], rank="大佐", formation="us-ccb", note="第1機甲師団B戦闘団の指揮官"),
        c("bulowius", "カール・ビューロヴィウス", "de", ["aggressive", "mobile"], rank="少将", formation="de-dak", note="アフリカ軍団戦闘団の指揮官"),
    ],
    "ortona-1943-12-21": [
        c("heidrich", "リヒャルト・ハイドリッヒ", "fj", ["tenacious", "inspiring"], rank="中将", formation="fj-1", note="第1降下猟兵師団長"),
    ],
}


def apply(scenario):
    """シナリオの辞書に、史実の指揮官を書く(なければ何もしない)"""
    if scenario["id"] in TABLE:
        scenario["commanders"] = TABLE[scenario["id"]]
    return scenario


if __name__ == "__main__":
    files = list((ROOT / "data/scenarios").glob("*.json")) + list((ROOT / "mods").glob("*/scenarios/*.json"))
    for f in files:
        s = f.read_text(encoding="utf-8")
        d = json.loads(s)
        if d.get("id") not in TABLE:
            continue
        d["commanders"] = TABLE[d["id"]]
        f.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {f.relative_to(ROOT)}")
    sys.exit(0)
