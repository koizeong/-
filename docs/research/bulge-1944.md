# バルジの戦い(アルデンヌ攻勢)1944年12月16日〜1945年1月8日 キャンペーン v0 の根拠

作り直しは `tools/campaigns/build_bulge_1944.py`(出力 `data/campaigns/bulge-1944.json`)。
この作業環境からは資料の本文を開けず、検索結果の要約で確かめた範囲で置いた。確かさ:高=複数の資料が一致、中=1つの資料か要約、低=フォーラムなど。

## 単位と期間
- 1段階=2日、12段階(12月16日〜1月8日)。部隊1つ≒1個師団(青作戦と同じ抽象)。独の装甲師団と米の機甲師団は2部隊、ほかの師団は1部隊
- 編成は生成器の「1944年の米独」。英軍の編成表がないので、英第30軍団は米の編成表で代えた

## 独軍(12月16日)
| 部隊 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 第6装甲軍 | 北の主攻。モンシャウからクレヴィンケルの正面。第1SS・第2SS装甲軍団と第67軍団 | 中 | [padresteve](https://padresteve.com/2009/11/17/wacht-am-rhein-the-battle-of-the-bulge/)、Wikipedia『6th Panzer Army』の要約 |
| 第1SS装甲軍団 | 第1SS・第12SS装甲師団。第277国民擲弾兵師団。第12国民擲弾兵・第3降下猟兵師団は TODO | 中/低 | Wikipedia『I SS Panzer Corps』、[feldgrau フォーラム](https://www.feldgrau.net/forum/viewtopic.php?t=4512) |
| 第2SS装甲軍団 | 第2SS・第9SS装甲師団。予備で、12月21日にサン=ヴィットの近くで投入 | 中 | Wikipedia『II SS Panzer Corps』『9th SS Panzer Division』の要約 |
| 第5装甲軍 | 第47・第58装甲軍団と第66軍団。第2装甲師団・教導戦車師団 | 中 | padresteve |
| 第58装甲軍団 | 第116装甲師団・第560国民擲弾兵師団 | 低 | feldgrau フォーラム |
| 第7軍 | 南の翼。第212国民擲弾兵師団がエヒタナハを突いた。第5降下猟兵師団はバストーニュの南 | 中 | [ibiblio『The Ardennes』](https://www.ibiblio.org/hyperwar/USA/USA-E-Ardennes/USA-E-Ardennes-10.html)、docs/research/bastogne-1944-12.md |
| 第15装甲擲弾兵師団 | 24日の夜にバストーニュの北西へ | 中 | docs/research/bastogne-1944-12.md |
- TODO(要裏取り):第67・第66軍団と第7軍の師団の番号、総統護衛旅団・第9装甲・第3装甲擲弾兵師団。出典候補:米陸軍戦史センター『German Army, Battle of the Bulge, 15 December 1944』、Tucker-Jones の戦闘序列

## 連合軍
| 部隊 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 第5軍団 | 第2・第99歩兵師団(13日にロール川のダムへ攻めていた) | 中 | [govinfo『The Battle of the Bulge』](https://www.govinfo.gov/content/pkg/GOVPUB-D101-PURL-gpo46222/pdf/GOVPUB-D101-PURL-gpo46222.pdf) |
| 第8軍団 | 第106歩兵師団(第14騎兵群つき、11日に第2歩兵師団と交代)、第28歩兵師団(第110連隊がクレルヴォー)、第4歩兵師団(エヒタナハ)、第9機甲師団(A戦闘団はエヒタナハ方面、B戦闘団はサン=ヴィットへ) | 中 | govinfo、Wikipedia『Battle of Clervaux』、ibiblio、[Warfare History Network](https://warfarehistorynetwork.com/article/blood-for-time-9th-armored-at-bastogne-and-the-battle-of-the-bulge/) |
| 第7機甲師団 | 攻勢の初日にサン=ヴィットへ送られ、21日まで守った | 中 | [encyclopedia.com](https://www.encyclopedia.com/history/modern-europe/wars-and-battles/battle-bulge)、Wikipedia『Battle of St. Vith』 |
| 第10機甲師団B戦闘団・第101空挺師団 | 18日・19日にバストーニュ | 中 | docs/research/bastogne-1944-12.md |
| 第82空挺師団 | ウェルボモンへ(18日ごろ。資料で割れる) | 中 | [ww2tribute](http://ww2tribute.blogspot.com/2013/11/the-82nd-airborne-in-battle-of-bulge.html) |
| 第30・第1歩兵師団 | 着いた日は TODO(18日に置いた) | 低 | — |
| 第3軍団 | 第4機甲・第26・第80歩兵師団。26日に第4機甲師団がバストーニュへの道を開いた。攻め始めの日は TODO(22日に置いた) | 中 | docs/research/bastogne-1944-12.md |
| 第7軍団 | 第2・第3機甲師団。着いた日・場所は TODO(22日にマルシュ) | 低 | — |
| 着いた日の一覧 | 第84・第75歩兵師団は21日、第11機甲師団は25日、第83・第87歩兵師団と第6機甲師団は26日。第35歩兵師団は日付なし | 中 | [generalstaff.org『1 US Army Battle of the Bulge』](https://www.generalstaff.org/NAF/Pt_I_1943-1945/944ulaa.pdf) |
| 英第30軍団 | 19日にジヴェ・ディナン・ナミュールの橋を守るよう命じられ、24日には押さえていた。22日までに第51・第53歩兵師団と近衛機甲師団がマーストリヒト〜ジヴェでマース川を守った | 中 | [Royal British Legion ブリュッセル支部](https://branches.britishlegion.org.uk/branches/brussels-branch/history/the-british-and-the-battle-of-the-ardennes/)、[Tank Museum](https://tankmuseum.org/article/bulge-allied-support) |
- 増援の着く地域は役割から置いた(TODO(要裏取り))。第35歩兵・第17空挺・英第6空挺師団、第33機甲旅団・第34戦車旅団は日付が分からず入れていない

## 天候(キャンペーンの天候の予定)
- 16日:独空軍は500機を飛ばした。18日:第9空軍は600機以上を飛ばした。19〜21日はひどい天候で、20日は夜の2機のほか飛べなかった。23日が初めての好天(陸軍航空隊博物館の年表、Warfare History Network、米空軍博物館の要約)
- 1月1日:ボーデンプラッテ作戦(何度も延び、初めて飛べた日)(Wikipedia『Operation Bodenplatte』の要約)
- 段階ごとの置き方:1 曇り、2・3 霧、4〜6 晴れ、7・8 曇り(TODO)、9 晴れ、10〜12 曇り(TODO)

## 航空隊
- 連合:第9空軍は中型爆撃機1,111・戦闘機1,502・偵察機217(資料の要約)。21日に第9・第29戦術航空軍団は英第2戦術空軍の指揮へ、22日に第9戦術航空軍団の3個戦闘機群が第19戦術航空軍団へ([陸軍航空隊博物館](https://www.armyaircorpsmuseum.org/december-1944-army-air-forces.cfm))
- 独:16日に500機を飛ばした。17〜27日に戦闘機644機を失い227機が損傷(資料の要約)
- 置き方:編隊1つ=実機約40機。連合の戦闘機1,502を3つの戦術航空軍団に等分(リエージュ・ルクセンブルク)、中型爆撃機はナミュール。独は500機を戦闘機3/4・攻撃機1/4(プリュム)。基地・航続距離・内訳は仮置き。戦術の戦闘へは編隊1つ=戦闘機4機・攻撃機8機

## 独軍の燃料
- 燃料が足りず多くの装甲車両を捨てた。パイパー戦闘団は19日にストゥモンで燃料がほぼ尽き、24日に車両を捨てて徒歩で戻った([army.mil](https://www.army.mil/article/31241/belgians_recall_protecting_their_soil_65_years_ago_during_battle_of_bulge)、[dvidshub](https://www.dvidshub.net/news/printable/517146)、Cole『The Ardennes』第16章の要約)
- キャンペーンの `rules.stockCap`(補給で戻る燃料は4割まで。仮置き)で表した。ただし作戦地図の上の移動は燃料に関係なく、戦術の戦闘でも燃料はあまり減らないので、AI 同士では結果がほとんど変わらなかった

## 作戦の AI 同士(種1〜4)
- 独の決定的3・引き分け1(史実は連合の限定的勝利)。独軍が強く出るのは、1944年の米独の戦術の戦闘そのものが独軍寄りのため(バストーニュ・アラクールと同じ。docs/research/validation.md。ユーザー判断でまだ直さない)
