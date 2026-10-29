# 朝鮮戦争の北側の装備品と実数の編成(パック korea-north の根拠)

`tools/packs/build_korea.py` が `data/weapons/korea-north.json`・`data/toe/korea-north.json` を作る。
朝鮮人民軍(ID は kp-)はソ連製の装備なので、ソ連のパック(`equipment-su.md`)の装備品を使い、編成表だけを書いた。中国人民志願軍(cn-)は装備品もここで書いた。
調べ方:WebSearch の要約だけ。**資料が薄く、仮置きが多い**。信頼度の書き方は `equipment-de.md` と同じ。

## 1. 中国人民志願軍の装備品

| 品目 | 種類(小銃換算) | 根拠・信頼度 |
|---|---|---|
| 小銃(中正式・三八式など) | ボルト小銃(1) | 国民党軍・旧日本軍から手に入れた雑多な小銃(低) |
| 短機関銃(トンプソン・PPSh など) | 短機関銃 | 低 |
| ZB vz.26 とその写し | 軽機関銃(10) | 低 |
| 二四式重機関銃(マキシムの写し) | 重機関銃(15) | 低 |
| 60mm 迫撃砲 | 米の M2 と同じ値(1.24kg・1,815m) | 米国製とその写し。中隊に3門の迫撃砲小隊とする資料と、2門とする資料がある(低:[Warlord Games](https://warlord-community.warlordgames.com/korean-war-chinese-peoples-volunteer-army/)、[The Miniatures Page](http://theminiaturespage.com/boards/msg.mv?id=261869)) |
| 75mm 山砲(鹵獲) | 米の M1A1 の値(弾 6.24kg は仮置き・8,790m) | 旧日本軍・米軍の山砲の鹵獲。連隊に3門(低) |

## 2. 編成表

| 編成表 | 中身 | 根拠・信頼度 |
|---|---|---|
| 歩兵連隊(中国人民志願軍1950) `cn-inf-regt-1950` | 約3,000名、大隊3 ×(歩兵中隊3=150名・軽機関銃15・60mm 2+機関銃中隊=重機関銃6)、連隊本部に75mm 山砲3 | 連隊 約3,000名・軽機関銃135・重機関銃18・60mm 18・75mm 山砲3(**低**:[CivFanatics のフォーラム](https://forums.civfanatics.com/threads/the-korean-war-the-peoples-liberation-army-1950.104638/))。連隊で 800名・小銃400 しかなかった例もある(低:[military-history.fandom](https://military-history.fandom.com/wiki/People's_Volunteer_Army))。中隊・本部の人員は仮置きで、表の合計は 2,130名(約3,000名に届かない)。TODO |
| 歩兵連隊(朝鮮人民軍1950) `kp-inf-regt-1950` | 2,590名、大隊3。ソ連の1944年の狙撃兵連隊の形を縮めた**仮置き** | 連隊 2,590名・師団 10,381名、師団の砲兵連隊は 122mm の大隊1・76mm の大隊2(中:[第4師団(朝鮮人民軍)](https://en.wikipedia.org/wiki/4th_Division_(North_Korea)))。全体は [Appleman 第2章](https://www.koreanwaronline.com/history/Appleman/Chapter2.htm)。連隊・大隊の火器の数と人員の内訳は TODO で、表の合計は 約2,090名(2,590名に届かない) |
| 戦車連隊(T-34-85・朝鮮人民軍1950) `kp-tank-regt-1950` | 中隊10両 × 4 = 40両 | 第105戦車旅団の連隊3。1連隊40両はよく引かれる値だが、ここでは確かめていない(TODO(要裏取り)) |

## 3. 汎用の編成表との比べ

| 編成表 | 比べる汎用 | 火力の比 | 耐久の比 | 50m の対装甲の比 |
|---|---|---|---|---|
| 志願軍の歩兵連隊 | 歩兵連隊(300m) | 1.04 | 0.99 | 0.24 |
| 朝鮮人民軍の歩兵連隊 | 同上 | 1.17 | 0.97 | 1.19 |
| 朝鮮人民軍の戦車連隊 | 戦車大隊(500m の対装甲) | 0.96 | 0.79 | — |

志願軍の連隊は対戦車火器をほとんど持たない(肉薄攻撃の爆薬は物差しがないので入れていない)。米の1950年の歩兵連隊とは 300m の対装甲の火力で3倍以上違う(期待挙動のテスト)。

## 4. 残りの裏取り

1. 朝鮮人民軍の1950年6月の師団・連隊の装備の表。→ Appleman『South to the Naktong, North to the Yalu』第2章、米極東軍の『Order of Battle Information, North Korean Army』。
2. 志願軍の1950年の軍・師団・連隊の編制と装備。→ Millett『The War for Korea』、『抗美援朝戦争史』、Shrader『Communist Logistics in the Korean War』。
3. 第105戦車旅団の連隊ごとの両数。

## 5. 歩兵大隊

`kp-inf-bn-1950`:上の歩兵連隊(**仮置き**)の大隊1つ分。仁川の「史実の編成(実数)」で使う。
