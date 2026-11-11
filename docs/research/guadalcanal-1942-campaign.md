# 調査メモ:ガダルカナル島の戦い(1942年8月7日〜1943年2月9日)のキャンペーン

ユーザー判断(2026-11):基地航空隊と艦隊に焦点を当て、陸戦も含むキャンペーンを作る。ガダルカナルを先に、レイテを後に。
期間は8月7日〜2月9日・1段階7日(27段階)。東京急行・飛行場への艦砲射撃・飛行場の争奪の仕組みを入れる。
この環境では資料のページを直接読めず、検索の要約だけで調べた。出典は末尾。多くは TODO(要裏取り)。

## 1. 分かったこと

### 陸
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 米の上陸 | 8月7日、第1海兵師団がルンガ岬とツラギに上がった | 高 | 公刊戦史の要約 |
| 第7海兵連隊 | 9月18日に 4,157人 | 中 | 海兵隊史(NPS)の要約 |
| 第164歩兵連隊 | 10月13日に 2,837人 | 中 | 同上 |
| アメリカル師団の残り | 第182連隊 11月12日、師団司令部と第132連隊 12月8日 | 中 | 戦闘序列の要約、米陸軍公刊戦史 |
| 第2海兵師団 | 第8海兵連隊が11月4日 | 低〜中 | 戦闘序列の要約 |
| 第25歩兵師団 | 第35連隊 12月17日、第27連隊 1月1日、第161連隊 1月4日。1月7日に 12,629人 | 中 | 海兵隊公刊戦史(第9章)の要約 |
| 一木支隊 | 第一梯団 約917人。8月18〜19日にタイボ岬へ駆逐艦で | 中 | 要約(複数) |
| 川口支隊 | 8月29日〜9月7日に駆逐艦と大発で約6,000人(一木支隊の残りを含む)。数は 3,500 とする要約もある | 低〜中 | 同上 |
| 第2師団 | 10月23〜26日にヘンダーソン飛行場を攻めて大損害。第38師団の連隊1つを加えた | 中 | Wikipedia『Battle for Henderson Field』の要約 |
| 第38師団 | 歩兵第228連隊と第229連隊第1大隊を11月5・7・8日に東京急行で。残りと重火器は11月12〜15日の船団で失敗 | 中 | 要約(複数) |
| ケ号作戦 | 1943年1月14日〜2月7日。駆逐艦で 10,652人を撤収(駆逐艦1隻沈没・3隻損傷)。島に送られたのは約3万6千人 | 中 | Wikipedia『Operation Ke』の要約 |

### 航空
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| カクタス航空隊 | 8月20日に F4F 19機(VMF-223)・SBD 12機(VMSB-232)が護衛空母ロング・アイランドから。22日に陸軍の P-400 5機、30日に MAG-23 の後続 | 中〜高 | 米海軍歴史遺産司令部の記事の要約 |
| 10月の機数 | 10月13〜14日夜の砲撃の前に約90機、うち約48機が壊れた | 中 | Wikipedia の要約 |
| 第11航空艦隊 | 8月のラバウルで使える機が約100機(双発の陸攻30・零戦45)とする要約と、陸攻30・戦闘機20とする要約がある | 低 | 要約(2件で食い違う) |
| 第26航空戦隊 | 8月にラバウルへ。三沢空・木更津空の一式陸攻 | 中 | Wikipedia の要約 |
| 第2航空隊 | 8月6日にラバウルへ。九九式艦爆16・零戦(三二型)15 | 中 | Wikipedia『2nd Air Group』の要約 |
| 零戦の航続 | ガダルカナルまで届くのは零戦二一型だけとする要約 | 中 | 同上 |

### 海
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 第二次ソロモン海戦 | 8月24〜25日。龍驤が沈み、エンタープライズが傷ついた | 中 | 要約(複数) |
| ワスプ | 9月15日に伊19の魚雷で沈んだ(潜水艦は表していない) | 高 | 米海軍歴史遺産司令部 |
| 南太平洋海戦 | 10月25〜27日(26日朝)。ホーネットが沈んだ | 中 | 要約(複数) |
| 金剛・榛名の砲撃 | 10月13〜14日夜。14インチ砲弾 約900〜970発。滑走路を傷め、燃料をほぼ焼き、約90機のうち約48機を壊した | 中(数は割れる) | Wikipedia の要約 |
| 夜戦 | サボ島沖(8月9日)・第三次ソロモン(11月13・14〜15日)・タサファロンガ(11月30日)の顔ぶれは既存のシナリオの調べ(docs/research/savo-1942-08.md ほか)から | 中 | 各調査メモ |

見つからなかったこと:ブインの飛行場ができた日、日本の航空隊の時期ごとの機数、空母の航空隊の機数(8月・10月)、両軍の大隊ごとの人数。
出典候補:Frank『Guadalcanal』、Lundstrom『The First Team and the Guadalcanal Campaign』、『戦史叢書 南東方面海軍作戦』『同 南太平洋陸軍作戦』。

## 2. ゲームでの置き方(`tools/campaigns/build_guadalcanal_1942.py`)
- 地域:ガダルカナル島はルンガ岬(ヘンダーソン飛行場)・コリ岬・タイボ岬・アウステン山・マタニカウ川・コクンボナ・エスペランス岬の7つと、ツラギ。島の外はラバウル・ショートランド(ブイン)・エスピリトゥサント(補給の源・港・飛行場)
- 海域:鉄底海峡・スロット・ブーゲンビル沖・ラバウル沖・ソロモン東方・インディスペンサブル海峡・サンタクルーズ諸島沖・珊瑚海。米の船団はインディスペンサブル海峡、日本の東京急行・船団はスロットを通る(`via`)
- 部隊の単位は大隊(米海兵大隊、日本の軽装の歩兵大隊)。米陸軍の連隊も海兵大隊の編成表で代えた(TODO:米陸軍1942年の大隊の編成表)。第1海兵師団の12月の引き揚げは表していない
- 東京急行:日本の小さな増援は `express`。スロットに米の艦隊がいなければ夜に着き、米の航空隊が届けば戦力の1割を失う。補給も4割だけ届く(`rules.nightExpress`。数は仮置き)。船団(第2師団の重火器、第38師団の主力)は express なし
- 飛行場への艦砲射撃:命令の `bombard`。重みは戦艦 0.25(金剛・榛名で約半分を壊した要約から)。日本の栗田部隊(10月)・阿部部隊(11月)を史実の時期に置いた
- 空母:サラトガ・エンタープライズ・ワスプ・ホーネット、翔鶴・瑞鶴・龍驤・隼鷹・瑞鳳の艦級を太平洋1942年のパックに足した(装甲は大づかみ)。航空隊はミッドウェーの機種の編成表で代え、米の雷撃機は TBD のまま(8月には TBF に替わっていた。TODO)
- 航空隊:カクタス航空隊(8月20日)と後続(9月・10月・11月。数は仮置き)、B-17、第11航空艦隊の戦闘機隊と陸攻隊、第26航空戦隊、ブインの戦闘機隊(10月)。編隊1つ=12機。海戦では盤上の航空隊(F4F・SBD・B-17・零戦・一式陸攻を陸上機のパックに足した)
- 勝利条件(ゲームの決め方):ルンガ(10点・日本の決定的勝利に要る)、米はエスペランス岬まで取れば決定的

## 3. AI 同士の結果(v0)
- 種1:引き分け(米は限定的・日本も限定的。日本は10〜11月にマタニカウ川から西を取り返し、ルンガへ2度攻めて退けられた)。種2:米の決定的勝利(史実どおり)
- 10段階目(10月中旬)に栗田部隊がルンガの飛行場を砲撃し、カクタス航空隊の編隊を大きく削った(史実の時期と合う)
- 直したこと:米の AI が1段階目に第1海兵師団を前に出して飛行場を空けた → 勝利点5以上の地域には師団・旅団を1つ残す(作戦の AI の `KEY_POINTS`)。カクタス航空隊がエスピリトゥサントへ下がった後、戦闘の行動半径(400km)が縛りで戻れなかった → 基地を移るのは回航で航続の 2.5 倍まで(`rules.air.ferryFactor`)。米の増援が鉄底海峡に居座る日本の艦隊に10段階も止められた → 航路を史実に合わせた(上)
- 残る違和感:米の艦隊がラバウル沖まで出て砲撃することがある(基地の陸上機の脅威を AI が見ていない)。海戦の引き分けが多い

## 出典(検索の要約。ページは直接読めていない)
- Battle of Guadalcanal order of battle(Wikipedia の写し)https://ipfs.aleph.im/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki/Battle_of_Guadalcanal_order_of_battle.html
- FIRST OFFENSIVE: The Marine Campaign for Guadalcanal(NPS)https://npshistory.com/publications/wapa/npswapa/extContent/usmc/pcn-190-003117-00/sec5.htm
- Chapter 9: Final Period(海兵隊公刊戦史)https://ibiblio.org/hyperwar/USMC/I/USMC-I-VI-9.html
- Guadalcanal: The First Offensive, Chapter IX(米陸軍公刊戦史)https://www.ibiblio.org/hyperwar/USA/USA-P-Guadalcanal/USA-P-Guadalcanal-9.html
- Battle of the Tenaru(Wikipedia)https://wikipedia.com/wiki/Battle_of_Tenaru
- Battle for Henderson Field(Wikipedia)https://en.wikipedia.com/wiki/Battle_of_Henderson_Field
- Birth of Guadalcanal's Cactus Air Force(NHHC)https://history.navy.mil/content/history/museums/nnam/education/articles/history-up-close/birth-of-guadalcanals-cactus-air-force.html
- 2nd Air Group(Wikipedia)https://wikipedia.com/wiki/2nd_Air_Group
- 6th Air Group(Wikipedia)https://Www.Wikipedia.org/wiki/6th_Air_Group
- Wasp (CV-7)(NHHC)https://history.navy.mil/browse-by-topic/ships/aircraft-carriers/uss-wasp.html
- Battle of the Eastern Solomons(Military Wiki)https://military-history.fandom.com/wiki/Battle_of_the_Eastern_Solomons
- Operation Ke(Wikipedia)https://en.Wikipedia.com/wiki/Operation_Ke
- Henderson Field (Guadalcanal)(Wikipedia)https://EN.wikipedia.com/wiki/Henderson_Field_(Guadalcanal)
- NIDS の日本側の研究(防衛研究所)https://www.nids.mod.go.jp/english/event/forum/pdf/2013/07.pdf
