# オリンピック作戦(1945年11月の南九州上陸。計画だけで実行されなかった架空の戦い)キャンペーン v0 の根拠

作り直しは `tools/campaigns/build_olympic_1945.py`(出力 `data/campaigns/olympic-1945.json`)。
この作業環境からは資料の本文を開けず、検索結果の要約で確かめた範囲で置いた。実行されなかったので史実の結末はない(キャンペーンの `historicalOutcome` を置かない)。

## 単位と期間・編成
- 1段階=3日、10段階(10月29日〜11月27日)。上陸の日(X 日)は11月1日=2段階目。部隊1つ≒1個師団
- 生成器の編成「1945年の九州」(`data/generators/missions.json` の `1945-kyushu`):米の1944年の歩兵連隊・1945年の戦車大隊、日本の1944年の歩兵連隊・1945年の戦車連隊(国ごとの実数のパック)
- 上陸はキャンペーンの上陸の増援(`landing`):敵がいなければ上がって押さえ、敵がいれば上がって次の段階に攻め手として戦う(負ければ下がる先がなく壊滅しうる)。
  上陸の3地点は米の補給の源(押さえるとそこから補給が届く)

## 米軍(計画)
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 規模 | 第6軍が12個師団(と予備2個師団)で3か所に上がる。3か所に3個師団ずつ。陸軍9・海兵3 | 中 | [historyofwar.org](https://www.historyofwar.org/articles/wars_downfall2.html)、[USNI『The Invasion That Never Was』](https://www.usni.org/magazines/naval-history-magazine/1995/august/invasion-never-was) |
| 西(串木野) | 第5水陸両用軍団(第2・第3・第5海兵師団) | 中 | [rusinsw.org.au『Operation Olympic』](https://www.rusinsw.org.au/Papers/2018A06.pdf) |
| 航空 | 第5艦隊の航空支援は第1高速空母任務部隊(TF-58)。地上の航空は飛行場ができ次第九州へ移り、のちに支援を引き継ぐ | 中 | [warbirdforum『Olympic vs. Ketsu-Go』](https://www.warbirdforum.com/olympic.htm) |
- TODO(要裏取り):有明湾・宮崎の軍団と師団、後続の3個師団(第9軍団か。11月4日に宮崎に置いた)と予備2個師団(11月7日に有明湾に置いた)の上がる日と場所、
  米の航空と艦砲の数(入れていない)。出典候補:Skates『The Invasion of Japan』、米陸軍の Downfall 計画の文書

## 日本軍(決号作戦)
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 指揮 | 九州の守りは第16方面軍(福岡) | 中 | [irp.fas.org『Estimate of the Enemy Situation』](https://irp.fas.org/eprint/arens/chap3.htm) |
| 兵力 | 米第6軍の8月1日の見積もりで約42万1千人、9個師団か師団相当(のちの見積もりはもっと多い) | 中 | [pahor.at](https://pahor.at/product/the-japanese-plans-for-the-defense-of-kyushu/) の要約 |
| 第40軍 | 南西を3個師団と独立旅団1つで守った | 中 | irp.fas.org |
| 配備 | 有明湾がいちばん上陸されやすいとみて兵力を寄せた。宮崎も上陸の地とみた。深い守りを捨て、輸送船団への特攻と海岸での総力の戦いを選んだ | 中 | [pwencycl.kgbudge.com](http://pwencycl.kgbudge.com/D/o/Downfall.htm)、irp.fas.org |
| 航空 | 航空機は艦隊への特攻に使い切る計画で、地上の部隊の航空支援は予定しなかった(上陸の後に兵に特攻を向ける計画もなかった)。機数の見積もりは2,500〜1万機と大きく割れる | 中 | irp.fas.org『Operation Ketsu-Go』、[米海軍 H-Gram 057](https://www.history.navy.mil/about-us/leadership/director/directors-corner/h-grams/h-gram-057/h-057-1.html) |
- 日本の航空は地上の戦いに入れていない(上の資料のとおり)。特攻は輸送船団への攻撃で、作戦の層には船団がないので表していない(TODO)
- TODO(要裏取り):師団の番号と、有明湾・宮崎・都城への割り振り(今は2・2・1の仮置き)

## 作戦の AI 同士(種1〜3)
- 2026-11-12 に測り直し:**米の決定的3**(勝利点 米15・日本0。損耗 米1〜26%・日本75〜84%。12地域をすべて米が取った)
- 前の結果(日本の決定的2・引き分け1)は、AI が米の1944年の歩兵連隊(`us-ir-1944`。連隊砲中隊の榴弾砲を持つ)を砲兵と取り違えて、戦術の戦闘で米の歩兵が動かなかったときのもの(`packages/ai` の `isArtilleryUnit` で直した。日本の連隊は取り違えを受けていなかった)
- 米の航空と艦砲を入れていないので、地上の兵力だけの比べになっている。架空の作戦で比べる史実の結果がないので、数値は直していない。日本軍の防御(洞窟陣地・特攻・挺身斬り込み)を表す仕組みがないことも、米に偏る原因になりうる(TODO)
