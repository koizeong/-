#!/usr/bin/env python3
"""
航空司令部の試験シナリオ(空の作り直しの手触り確認・画面の確かめ用。史実ではない)を作る。

    python3 tools/scenarios/build_test_air.py

出力: data/scenarios/test-air.json

左右対称の試験シナリオ(test-symmetric)に、両陣営の航空司令部(盤の外の別の指揮系統。docs/air-design.md)を足したもの。
両陣営とも同じ飛行隊(戦闘機16・戦闘爆撃機16・偵察機2)。基地までの距離も同じ(60km)。東軍の基地は東、西軍の基地は西。
3ターン目から昼過ぎまで曇り(飛べない)にして、予報と計画の食い違いが見えるようにしている。機数・距離は試験の値
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/scenarios/test-symmetric.json"
OUT = ROOT / "data/scenarios/test-air.json"


def force(side, name, bearing):
    return {
        "id": f"{side}-af",
        "side": side,
        "name": name,
        "doctrine": {"weights": {"patrol": 2, "escort": 1, "cover": 1, "onCall": 2, "interdiction": 1, "armedRecon": 1, "recon": 1}, "acceptRequests": 0.7},
        "bases": [{"id": "b1", "name": "前進飛行場", "distanceM": 60000, "bearingDeg": bearing}],
        "squadrons": [
            {"id": "fg", "name": "第1戦闘機隊", "toe": "gen_air_fighter", "base": "b1", "aircraft": 16},
            {"id": "fb", "name": "第2戦闘爆撃機隊", "toe": "gen_air_fighter_bomber", "base": "b1", "aircraft": 16},
            {"id": "rc", "name": "偵察機隊", "toe": "gen_air_recon", "base": "b1", "aircraft": 2},
        ],
        "requestsPerDay": 4,
        "notes": "試験の値(史実ではない)",
    }


def main():
    d = json.loads(SRC.read_text())
    d["id"] = "test-air"
    d["name"] = "航空司令部の試験"
    d["description"] = "左右対称の試験シナリオに、両陣営の航空司令部を足したもの。要請・哨戒の空域・上空援護・前線の印・予報を試す。史実ではない。"
    arr = lambda x: x if isinstance(x, list) else [x]
    d["packs"]["weapons"] = arr(d["packs"]["weapons"]) + ["air-generic"]
    d["packs"]["toe"] = arr(d["packs"]["toe"]) + ["air-generic"]
    d["rules"]["weather"] = {
        "initial": "clear",
        "changeChancePerHour": 0,
        "minHoursBetweenChanges": 0,
        "improveChance": 0.5,
        "schedule": [{"turn": 3, "weather": "overcast"}, {"turn": 5, "weather": "clear"}],
    }
    d["rules"].pop("air", None)
    d["rules"]["airForces"] = [force("us", "西軍航空軍", 270), force("de", "東軍航空軍", 90)]
    d.pop("customization", None)
    OUT.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
