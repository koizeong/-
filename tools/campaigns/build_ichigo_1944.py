#!/usr/bin/env python3
"""
大陸打通作戦(一号作戦。1944年4月17日〜12月10日)のキャンペーンファイル(v0・概略図)を作る。

    python3 tools/campaigns/build_ichigo_1944.py

出力: data/campaigns/ichigo-1944.json

支那派遣軍は、京漢作戦(コ号。第12軍が黄河を渡って4月に鄭州・許昌、5月25日に洛陽)と湘桂作戦(ト号。第11軍が岳州から南へ、
6月18日に長沙、6月下旬〜8月8日に衡陽を攻め落とし、11月10〜11日に桂林・柳州、24日に南寧)で、北京から仏印までの鉄道をつなぎ、
米の第14空軍の飛行場を奪った。国民政府軍は第1・第9・第4戦区で守ったが、衡陽の第10軍(方先覚)のほかは多くが崩れた。
根拠と残りの裏取りは docs/research/ichigo-1944.md。この環境では資料を確かめられず、一般に知られた経過の概略から組み立てた。

部隊の単位:1個の部隊をおおよそ1個師団(連隊の編成表で代える)。日本は1941〜42年の歩兵連隊(中国の戦線)、国民政府軍は1944年の歩兵連隊
(国ごとの実数の編成表 roc。定数に届かず装備も足りなかったので戦力を割り引く)。師団の数・位置・着いた日の多くは TODO(要裏取り)
(出典候補:防衛庁防衛研修所『戦史叢書 一号作戦』(1〜3)、Hara Takeshi「The Ichigō Offensive」(Peattie ほか『The Battle for China』)、
Romanus & Sunderland『Time Runs Out in CBI』(米陸軍公刊戦史)、『抗日戦争正面戦場』)。
1段階は10日(4月17日を1日目として24段階で12月15日まで)。
"""

import json
import math
from collections import OrderedDict as L
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/campaigns/ichigo-1944.json"

START = date(1944, 4, 17)
DAYS_PER_STAGE = 10
END = date(1944, 12, 10)


def stage_of(d: date) -> int:
    return (d - START).days // DAYS_PER_STAGE + 1


def km(lat: float, lon: float) -> tuple[float, float]:
    """緯度経度から、作戦地図の上のおおよその km(経度1度は北緯28度で約98km、緯度1度は約111km)"""
    return round((lon - 106.0) * 111 * math.cos(math.radians(28)), 1), round((lat - 21.0) * 111, 1)


F, J = "western-farmland", "jungle"
# 地域:名前、緯度、経度、地形の傾向、補給の源、始めの持ち主、航空基地
REGIONS = [
    # 京漢作戦(河南)
    ("kaifeng", "開封・新郷(北支那方面軍)", 34.80, 114.30, F, "jp", "jp", False),
    ("zhengzhou", "鄭州(黄河の南)", 34.75, 113.65, F, None, "roc", False),
    ("xuchang", "許昌", 34.03, 113.85, F, None, "roc", False),
    ("yancheng", "郾城・漯河", 33.58, 114.02, F, None, "roc", False),
    ("xinyang", "信陽(京漢線の南)", 32.13, 114.07, F, None, "jp", False),
    ("luoyang", "洛陽", 34.62, 112.45, F, None, "roc", False),
    ("lushi", "洛寧・盧氏(西の山地)", 34.05, 111.05, F, None, "roc", False),
    ("xian", "潼関・西安(第1戦区の後方)", 34.50, 110.20, F, "roc", "roc", True),
    # 湘桂作戦(湖南・広西)
    ("wuhan", "武漢(第11軍の後方)", 30.60, 114.30, F, "jp", "jp", True),
    ("yueyang", "岳州(岳陽)", 29.37, 113.10, F, None, "jp", False),
    ("changsha", "長沙", 28.20, 112.97, F, None, "roc", False),
    ("yiyang", "益陽・寧郷(湘江の西)", 28.55, 112.35, F, None, "roc", False),
    ("liuyang", "瀏陽・醴陵", 28.15, 113.60, F, None, "roc", False),
    ("xiangtan", "湘潭・湘郷", 27.85, 112.90, F, None, "roc", False),
    ("hengyang", "衡陽(飛行場)", 26.90, 112.60, F, None, "roc", True),
    ("shaoyang", "邵陽(宝慶)", 27.24, 111.47, F, None, "roc", False),
    ("leiyang", "耒陽・郴州(粤漢線)", 25.80, 113.00, F, None, "roc", False),
    ("suichuan", "遂川・贛州(江西の飛行場)", 26.33, 114.50, F, None, "roc", True),
    ("lingling", "零陵(飛行場)", 26.22, 111.62, F, None, "roc", True),
    ("quanzhou", "全州", 25.93, 111.07, J, None, "roc", False),
    ("guilin", "桂林(飛行場)", 25.27, 110.29, J, None, "roc", True),
    ("liuzhou", "柳州(飛行場)", 24.33, 109.42, J, None, "roc", True),
    ("dushan", "独山(貴陽への道)", 25.83, 107.55, J, None, "roc", False),
    ("guiyang", "貴陽(国民政府の後方)", 26.65, 106.63, J, "roc", "roc", False),
    ("nanning", "南寧", 22.82, 108.32, J, None, "roc", False),
    ("wuzhou", "梧州(西江)", 23.48, 111.30, J, None, "roc", False),
    ("guangzhou", "広州(第23軍)", 23.13, 113.26, J, "jp", "jp", True),
    ("langson", "諒山(仏印の国境)", 21.85, 106.76, J, "jp", "jp", False),
]

LINKS = [
    # 京漢線と隴海線
    ("kaifeng", "zhengzhou", "rail"), ("zhengzhou", "xuchang", "rail"), ("xuchang", "yancheng", "rail"), ("yancheng", "xinyang", "rail"),
    ("zhengzhou", "luoyang", "rail"), ("xuchang", "luoyang", "road"), ("luoyang", "lushi", "track"), ("luoyang", "xian", "rail"), ("lushi", "xian", "track"),
    ("xinyang", "wuhan", "rail"),
    # 粤漢線・湘桂線・黔桂線
    ("wuhan", "yueyang", "rail"), ("yueyang", "changsha", "rail"), ("yueyang", "yiyang", "road"), ("changsha", "yiyang", "road"),
    ("changsha", "liuyang", "road"), ("changsha", "xiangtan", "road"), ("liuyang", "xiangtan", "road"), ("xiangtan", "hengyang", "rail"),
    ("yiyang", "shaoyang", "road"), ("xiangtan", "shaoyang", "road"), ("hengyang", "shaoyang", "road"), ("hengyang", "lingling", "rail"),
    ("hengyang", "leiyang", "rail"), ("leiyang", "guangzhou", "track"), ("leiyang", "suichuan", "track"), ("liuyang", "suichuan", "track"),
    ("lingling", "quanzhou", "rail"), ("shaoyang", "quanzhou", "road"), ("quanzhou", "guilin", "rail"), ("guilin", "liuzhou", "rail"),
    ("liuzhou", "dushan", "rail"), ("dushan", "guiyang", "road"), ("liuzhou", "nanning", "road"), ("guangzhou", "wuzhou", "road"),
    ("wuzhou", "guilin", "track"), ("wuzhou", "liuzhou", "road"), ("nanning", "langson", "road"),
]
# 築城した地域(国民政府軍が守るときの塹壕線):洛陽・衡陽・桂林(TODO(要裏取り):陣地の出来上がり)
FORTIFIED = {"luoyang": "trench", "hengyang": "trench", "guilin": "trench"}

JP = "jp-inf-regt-1941"
JP_TK = "jp-tank-regt-1941"
ART = "artillery_battalion"
ROC = "roc-ir-1944"
ROC_ART = "roc-art-1944"
ROC_STRENGTH = 0.6


def formation(fid, side, name, region, units, arrive=None, training=None):
    f = L([("id", fid), ("side", side), ("name", name), ("region", region)])
    if arrive:
        f["arriveStage"] = stage_of(arrive)
    out = []
    for u in units:
        uid, toe, *rest = u
        d = L([("id", f"{fid}-{uid}"), ("toe", toe)])
        if training:
            d["training"] = training
        st = rest[0] if rest else (ROC_STRENGTH if toe == ROC else None)
        if st:
            d["strength"] = st
        out.append(d)
    f["units"] = out
    return f


def jp_divs(*divs, art=1, tanks=0):
    return [(f"d{d}", JP) for d in divs] + [(f"tk{i + 1}", JP_TK) for i in range(tanks)] + [(f"art{i + 1}", ART) for i in range(art)]


def roc_divs(n, art=0, tag="d"):
    return [(f"{tag}{i + 1}", ROC) for i in range(n)] + [(f"art{i + 1}", ROC_ART) for i in range(art)]


FORMATIONS = [
    # ---- 日本軍(支那派遣軍 畑俊六)----
    # 京漢作戦:第12軍(内山英太郎)。第37・第62・第110師団、戦車第3師団ほか。TODO(要裏取り):参加した師団・旅団
    formation("jp-12army", "jp", "第12軍(京漢作戦)", "kaifeng", jp_divs("37", "62", "110", tanks=2), training="veteran"),
    # 湘桂作戦:第11軍(横山勇)。第3・第13・第34・第40・第58・第68・第116師団ほか。TODO(要裏取り)
    formation("jp-11army-a", "jp", "第11軍の第1線(第3・第13・第34・第40師団)", "yueyang", jp_divs("3", "13", "34", "40"), training="veteran"),
    formation("jp-11army-b", "jp", "第11軍の第2線(第58・第68・第116師団)", "yueyang", jp_divs("58", "68", "116"), training="veteran"),
    # 第23軍(広州。第22・第104師団):西江を遡って梧州・桂林へ
    formation("jp-23army", "jp", "第23軍(第22・第104師団)", "guangzhou", jp_divs("22", "104"), training="regular"),
    # 後から:第27師団など(8〜9月)。仏印の第21師団の一部が12月に南寧へ。TODO(要裏取り)
    formation("jp-reinf", "jp", "第11軍の増援(第27師団ほか)", "wuhan", jp_divs("27", "37b", art=0), arrive=date(1944, 8, 15), training="regular"),
    # ---- 国民政府軍 ----
    # 第1戦区(蔣鼎文・湯恩伯):河南。書類の上では数十万とされるが、定数に届かず、農民の反乱にも苦しんだ。TODO(要裏取り):軍・師団の配置
    formation("roc-1wa-n", "roc", "第1戦区(鄭州)", "zhengzhou", roc_divs(4, art=1), training="green"),
    formation("roc-1wa-c", "roc", "第1戦区(許昌)", "xuchang", roc_divs(3), training="green"),
    formation("roc-1wa-l", "roc", "第1戦区(洛陽の守備)", "luoyang", roc_divs(4, art=1), training="green"),
    formation("roc-1wa-r", "roc", "第1戦区の予備(湯恩伯)", "lushi", roc_divs(4), training="green"),
    # 第9戦区(薛岳):湖南。長沙(第4軍)・衡陽(第10軍 方先覚。古参とする)ほか
    formation("roc-9wa-cs", "roc", "第9戦区(長沙)", "changsha", roc_divs(4, art=1), training="green"),
    formation("roc-9wa-ly", "roc", "第9戦区(瀏陽・醴陵)", "liuyang", roc_divs(3), training="green"),
    formation("roc-9wa-yy", "roc", "第9戦区(益陽・寧郷)", "yiyang", roc_divs(3), training="green"),
    formation("roc-9wa-xt", "roc", "第9戦区(湘潭)", "xiangtan", roc_divs(3), training="green"),
    formation("roc-10army", "roc", "第10軍(方先覚。衡陽の守備)", "hengyang", [("d1", ROC, 0.8), ("d2", ROC, 0.8), ("d3", ROC, 0.8), ("art", ROC_ART)], training="regular"),
    # 第4戦区(張発奎):広西。桂林・柳州・梧州・南寧
    formation("roc-4wa-gl", "roc", "第4戦区(桂林の守備)", "guilin", roc_divs(4, art=1), training="green"),
    formation("roc-4wa-lz", "roc", "第4戦区(柳州)", "liuzhou", roc_divs(3), training="green"),
    formation("roc-4wa-wz", "roc", "第4戦区(梧州)", "wuzhou", roc_divs(2), training="green"),
    formation("roc-4wa-nn", "roc", "第4戦区(南寧)", "nanning", roc_divs(2), training="green"),
    # 後から:衡陽の救援に来た軍(7月。第6戦区・第9戦区から)、貴陽を守るために回した軍(11〜12月。ビルマ・西北から)。TODO(要裏取り)
    formation("roc-relief", "roc", "衡陽の救援の軍", "shaoyang", roc_divs(4), arrive=date(1944, 7, 10), training="green"),
    formation("roc-guiyang", "roc", "貴陽の守りの軍", "guiyang", roc_divs(4, art=1), arrive=date(1944, 11, 15), training="regular"),
]


def cond(cid, region, points):
    return L([("id", cid), ("type", "region"), ("region", region), ("points", points)])


def loss(cid, mx, points):
    return L([("id", cid), ("type", "lossRatio"), ("max", mx), ("points", points)])


# 勝利の条件(ゲームの決め方)。日本:洛陽・衡陽・桂林・柳州を取れば決定的(大陸の鉄道と米の飛行場。史実)、長沙と衡陽なら限定的。
# 国民政府軍:長沙と衡陽を守れば決定的、桂林を守れば限定的
VICTORY = L(
    [
        ("jp", L([
            ("conditions", [cond("luoyang", "luoyang", 3), cond("changsha", "changsha", 3), cond("hengyang", "hengyang", 4), cond("guilin", "guilin", 4), cond("liuzhou", "liuzhou", 3),
                            cond("nanning", "nanning", 2), cond("lingling", "lingling", 1), cond("suichuan", "suichuan", 1), loss("loss", 0.5, 2)]),
            ("decisive", L([("minPoints", 18), ("requires", ["luoyang", "hengyang", "guilin", "liuzhou"])])),
            ("limited", L([("minPoints", 8), ("requires", ["changsha", "hengyang"])])),
        ])),
        ("roc", L([
            # 衡陽・桂林は5点:作戦の AI は勝利点5以上の地域に1つ残す
            ("conditions", [cond("hengyang", "hengyang", 5), cond("guilin", "guilin", 5), cond("changsha", "changsha", 3), cond("luoyang", "luoyang", 3), cond("liuzhou", "liuzhou", 2), loss("loss", 2.0, 2)]),
            ("decisive", L([("minPoints", 13), ("requires", ["changsha", "hengyang"])])),
            ("limited", L([("minPoints", 6), ("requires", ["guilin"])])),
        ])),
    ]
)

# 航空隊(編隊1つ=12機。数はすべて TODO(要裏取り))
#  - 米の第14空軍(シェンノート):桂林・柳州・衡陽・零陵・遂川の飛行場(P-40・P-51・B-25)。日本の目的の1つはこの飛行場を奪うことだった
#  - 日本の第5航空軍:武漢・広州
AIR_WINGS = [
    L([("id", "us-14af-gl"), ("side", "roc"), ("name", "米第14空軍(桂林・柳州)"), ("base", "guilin"), ("rangeKm", 700), ("fighters", 3), ("strike", 2)]),
    L([("id", "us-14af-hy"), ("side", "roc"), ("name", "米第14空軍(衡陽・零陵)"), ("base", "hengyang"), ("rangeKm", 600), ("fighters", 2), ("strike", 1)]),
    L([("id", "us-14af-sc"), ("side", "roc"), ("name", "米第14空軍(遂川)"), ("base", "suichuan"), ("rangeKm", 600), ("fighters", 1), ("strike", 1)]),
    L([("id", "roc-caf"), ("side", "roc"), ("name", "中国空軍・中米混成航空団(西安)"), ("base", "xian"), ("rangeKm", 500), ("fighters", 1), ("strike", 1)]),
    L([("id", "jp-5aa-wh"), ("side", "jp"), ("name", "第5航空軍(武漢)"), ("base", "wuhan"), ("rangeKm", 600), ("fighters", 3), ("strike", 2)]),
    L([("id", "jp-5aa-gz"), ("side", "jp"), ("name", "第5航空軍(広州)"), ("base", "guangzhou"), ("rangeKm", 600), ("fighters", 1), ("strike", 1)]),
]


def build():
    regions = L()
    control = L()
    for rid, name, lat, lon, biome, supply, owner, airbase in REGIONS:
        x, y = km(lat, lon)
        r = L([("name", name), ("x", x), ("y", y), ("biome", biome)])
        if supply:
            r["supply"] = supply
        if airbase:
            r["airbase"] = True
        if rid in FORTIFIED:
            r["fortified"] = L([("works", FORTIFIED[rid]), ("side", "roc")])
        regions[rid] = r
        control[rid] = owner
    return L(
        [
            ("id", "ichigo-1944"),
            ("name", "大陸打通作戦(一号作戦。1944年4〜12月)"),
            (
                "description",
                "支那派遣軍が河南(京漢作戦)と湖南・広西(湘桂作戦)で攻勢に出て、北京から仏印までの鉄道をつなぎ、米の第14空軍の飛行場を奪おうとする。"
                "国民政府軍は長沙・衡陽・桂林で食い止められるか。1段階は10日、24段階。v0・概略図(師団の数・位置の多くは要裏取り)",
            ),
            ("notes", "根拠は docs/research/ichigo-1944.md。作り直しは tools/campaigns/build_ichigo_1944.py。部隊1つ≒1個師団。国民政府軍の編成表は仮置きが多い。中国共産党の軍、農民の反乱、B-29(成都)は表していない"),
            ("era", "1944-china"),
            ("sides", [L([("id", "jp"), ("name", "日本軍")]), L([("id", "roc"), ("name", "国民政府軍")])]),
            ("calendar", L([("startDate", START.isoformat()), ("daysPerStage", DAYS_PER_STAGE), ("stages", stage_of(END))])),
            ("regions", regions),
            ("links", [L([("a", a), ("b", b), ("kind", k)]) for a, b, k in LINKS]),
            ("control", control),
            ("formations", FORMATIONS),
            ("airWings", AIR_WINGS),
            ("rules", L([("air", L([("airOps", L([("aircraftPerGroup", L([("fighter", 12), ("strike", 12)])), ("fighterToe", "gen_air_fighter"), ("strikeToe", "gen_air_bomber")]))]))])),
            (
                "historicalOutcome",
                L(
                    [
                        ("winner", "jp"),
                        ("level", "decisive"),
                        ("summary", "京漢作戦で5月25日に洛陽、湘桂作戦で6月18日に長沙を取った。衡陽の第10軍は約47日持ちこたえて8月8日に降った。"
                                    "11月10〜11日に桂林・柳州、24日に南寧を取り、12月10日に仏印の部隊とつながった。米の第14空軍は東の飛行場の多くを失ったが、"
                                    "日本軍も補給が続かず、貴陽の手前の独山で止まった"),
                    ]
                ),
            ),
            ("victory", VICTORY),
        ]
    )


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"書き出し: {OUT.relative_to(ROOT)}")
