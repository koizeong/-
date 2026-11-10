# ノルマンディーの突破(コブラ作戦〜ファレーズ包囲)1944年7月25日〜8月21日 キャンペーン v0 の根拠

作り直しは `tools/campaigns/build_normandy_1944.py`(出力 `data/campaigns/normandy-1944.json`)。
この作業環境からは資料の本文を開けず、検索結果の要約で確かめた範囲で置いた。確かさ:高=複数の資料が一致、中=1つの資料か要約、低=フォーラムなど。

## 単位と期間
- 1段階=2日、14段階(7月25日〜8月21日)。部隊1つ≒1個師団、装甲・機甲師団は2部隊。英連邦・ポーランドの部隊は米の編成表で代えた

## 地上
| 部隊 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 第7軍団 | コブラ作戦の主攻(7月25日、集中した爆撃から)。第1・第4・第9・第30歩兵師団と第2・第3機甲師団 | 中(割り当ての一部は確かめきれない) | Wikipedia『Operation Cobra』、[military-history.fandom『Operation Cobra order of battle』](https://military-history.fandom.com/wiki/Operation_Cobra_order_of_battle) |
| 第8軍団 | 第4機甲師団 | 中 | CGSC『Operation COBRA 4th ARMORED DIVISION』 |
| 第84軍団 | 第243・第91・第77・第265師団の残り、第2SS装甲、第17SS装甲擲弾兵、第5降下猟兵、教導戦車ほか。教導戦車師団は約2,200人・装甲車両45両 | 中 | Wikipedia『Operation Cobra』の要約 |
| リュティヒ作戦 | 8月7〜13日。第2・第1SS・第2SS装甲師団が先頭、第116装甲師団も。戦車は200両より少なかった。第30歩兵師団(314高地)が止めた | 中 | Wikipedia『Operation Lüttich』、[ibiblio『Breakout and Pursuit』第24章](https://www.ibiblio.org/hyperwar/USA/USA-E-Breakout/USA-E-Breakout-24.html)、[DTIC](https://apps.dtic.mil/sti/tr/pdf/ADA147218.pdf) |
| ファレーズの包囲 | 独軍は17日から退き始め、19日にシャンボワで連合軍が出会い、21日にポーランド第1機甲師団が閉じた(約5万人) | 中 | Wikipedia『Falaise pocket』『Battle of Chambois』 |
| トータライズ作戦 | 8月8日(カナダ第2軍団) | 中 | Wikipedia『Falaise pocket』の要約 |
- TODO(要裏取り):第8・第19・第5軍団と英第2軍・カナダ第2軍団・第3軍の師団、独の東の軍団と西方装甲集団の師団、パットンの第3軍の動き出し(8月1日に置いた)。出典候補:Blumenson『Breakout and Pursuit』(米陸軍公刊戦史)、Stacey『The Victory Campaign』(カナダ公刊戦史)
- 装甲師団は戦力6割、第84軍団の歩兵の師団の残りは5割、ほかの独軍は7割にした(7月までの損耗。割合は仮置き)

## 航空隊
- 連合軍の出撃は1日6,000とする資料がある。8月7日のモルタンでは英第2戦術空軍のタイフーン10個飛行隊が294出撃(305とも)、第19戦術航空軍団が約400出撃
  ([dday-overlord](https://www.dday-overlord.com/en/battle-of-normandy/cities/mortain)、[mikesresearch](https://mikesresearch.com/2021/08/01/mortain-1944/) の要約)
- 独:第3航空艦隊は6月5日に481機(うち戦闘機100)。その後、西の独空軍は100〜140機ほどに減った([米海軍『The G.A.F. and the Invasion of Normandy』](https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/g/gaf-invasion-normandy.html))
- 置き方:編隊1つ=実機約40機。連合は第9・第19戦術航空軍団(第19は8月1日から)と英第2戦術空軍で、戦闘機・攻撃機の編隊は仮置き。独は140機を戦闘機3/4・攻撃機1/4。基地・航続距離は仮置き

## 作戦の AI 同士(種1〜3)
- 連合の決定的3(史実どおり)。ただ独軍が9〜13段階で押さえる地域をほとんど失い、史実(21日まで包囲の中で持ちこたえた)より早い
