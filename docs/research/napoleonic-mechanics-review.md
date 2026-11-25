# 調査メモ:ナポレオン戦争の戦闘を二次大戦の戦闘と分けて表すための改善案(アウステルリッツ再開の前に)

ユーザーの指摘(2026-11):展開した戦列歩兵は密集した隊形で、機動は遅く、回頭は事実上できない。射撃の間隔は長く、命中率を弾幕で補う思想。
戦いは戦力ではなく士気の削り合いになる。こうした二次大戦との違いを調べ、Master of Command を参考に改善案を出す。

調べ方:Master of Command の攻略・評(Steam のガイド・レビュー・MoC Wiki)はこの環境から直接読めず(ネットワークで許されていない)、検索の要約だけ。
史実の数値は二次資料の要約で、どれも TODO(要裏取り)。出典候補:Nosworthy『Battle Tactics of Napoleon and His Enemies』、Muir『Tactics and the Experience of Battle in the Age of Napoleon』(「士気と結束」の章)、
Hughes『Firepower』、各国の教練規定(仏1791年の操典、英ダンダス、普1812年)。前の調査は `napoleonic-vs-ww2-infantry.md`。

## 1. Master of Command(検索の要約から分かったこと)

- 勝ちは敵の士気をこちらより先に崩すことで決まる(士気がいちばん大事な数値)。ただし数秒で崩れるほど脆くはない
- 隊形:動くときは縦隊、戦うときは2列・1列の横隊へ。薄い横隊は士気の罰があり、重歩兵・騎兵に突撃されたときに効く
- 射撃は斉射か各個射撃かをプレイヤーが選び、撃つ時も選ぶ。弾の種類(散弾にした弾など)と弾薬の消費がある
- 側面から撃たれた横隊は士気の罰と大きな損害。側面を突く部隊は強い・速い・士気の高い部隊がよく、士官が付いていればなおよい
- 士官は旅団への強い効き目(士気・指揮の範囲)で、撃たれて死ぬことがある。指揮の範囲を広げる・狭める技能がある
- 野砲は味方の頭越しに撃てる支援で、人数と士気を削る
- プレイヤーの不満:垣根・柵に頼る戦い方が強すぎる、縦隊の突撃が横隊を破らず横隊に包まれる

## 2. 今の作り(ナポレオン戦争のルールパック・プラツェン高地)

| 項目 | 今 |
|---|---|
| ターン | 1ターン1時間・小ステップ1分(陸の決まり。プラツェン高地は8ターン) |
| 隊形 | 姿勢で表す:横隊・突撃縦隊・散開・方陣・突撃(騎兵)。切替は分単位(方陣3分・ほか5分)。密度・縦の深さで砲の効き目が変わる(N1・N2・N7) |
| 機動 | 戦闘移動は行軍の速さの半分(歩兵 35m/分)。展開した部隊の旋回は帯の真ん中を軸にこの速さで回る(150m の横隊の90度は約3.4分)。大きな向き直しは陣地を失うだけ |
| 射撃 | マスケットは50m で1.0・100m で0.6・200m で0.15。1分ごとに連続で撃つ(装填の間隔・最初の斉射・撃ち方の選択はない)。弾薬はほぼ尽きない(毎分0.06%) |
| 損害 | ゲージの重み 戦力0.12・制圧2.5・士気2.5(士気の削り合いは一部入っている)。士気の結果(動揺0.55・潰走0.3・立ち直り0.5) |
| 突撃 | 士気で決まる衝撃(N3):守り手が踏みとどまるか。方陣は騎兵に強い |
| 散兵・煙 | 散兵の幕(N4)・黒色火薬の煙(N5) |
| 側面 | 向きの倍率(側面1.5・背後2.0)は損害だけ。士気への効き目・支援の有無はない |
| 指揮 | 指揮官の特性と戦死(陸海空共通)。指揮の範囲・命令の伝達の遅れはない |

## 3. 二次大戦との違いと改善案

優先度:◎ 今回の指摘の核心・○ あると違いがはっきりする・△ 後回し可。どれもナポレオン戦争のルールパックの値で効かせ、WWI〜朝鮮戦争のルールパックは変えない(設計ルール6)。

### A. 時間の刻み(◎・設計ルールの変更なのでユーザー判断)
- 違い:騎兵の突撃は1分で届き、方陣・横隊の替えは数分、撃ち合いは十数分で決まる。1時間のターンでは、これらがみな「次の決断の前に終わる」。
  Master of Command は止められる実時間で、いつでも隊形・撃ち方を替えられる
- 案:ルールパックに陸のターンの長さを書けるようにし(海戦の `naval.turnSeconds` と同じ考え)、ナポレオン戦争は15分・小ステップ30秒にする。
  条件付き命令(騎兵が来たら方陣)はそのまま使える。設計ルール「1ターン1時間」の例外になる

### B. 横隊の機動:遅く、回れない(◎)
- 違い:横隊は整列(dress)を保ちながら進むので遅く(教練の普通の歩調は毎分75〜80歩=約50m/分、整列し直す止まりを入れると実際はそれより遅い)、
  向きを変えるには片翼を軸に外の翼が大きく弧を描く(150m の横隊の90度の旋回で外の翼は約240m)。射撃を受けながらの大きな旋回は事実上できず、
  向きを大きく変えるときは縦隊にしてから展開し直した。二次大戦の散開した歩兵は、各自が向きを変えるだけ
- 案:
  1. 姿勢(隊形)ごとに戦闘移動の速さの倍率と旋回の決まりを持つ:横隊は片翼を軸に回る(今の真ん中を軸の倍の道のり)・ゆっくり、縦隊は向きをすぐ変えられる、散開はすぐ、方陣は向きなし
  2. 横隊で一度に回れるのは45度まで。それより大きく向きを変える命令は「縦隊になって回り、横隊に戻る」を自動で行う(その間は縦隊の弱さ)
  3. 撃たれている間の旋回は乱れ(下の C)を生む
- 数値の目安:横隊の戦闘移動 約30m/分、縦隊 約50m/分、外の翼の旋回 約30m/分。TODO(要裏取り):仏1791年の操典・英ダンダスの旋回(conversion)の規定

### C. 隊形の秩序(整列・乱れ)(◎)
- 違い:戦列の強さは整列していること。森・村・垣根・川を越える・急いで動く・突撃する・撃たれて大きな損害を受けると乱れ、乱れた横隊は撃っても当たらず、
  騎兵に弱く、止まって整列し直すまで数分かかる。二次大戦の歩兵には「整列」がない
- 案:ユニットに「乱れ」(0〜1)を持たせ(ナポレオン戦争のルールパックだけで使う)、地形の `disorder`(森・村・垣根・川を越えると増える)、
  速く動く・突撃・大きな損害で増え、止まっていれば分ごとに減る。乱れは射撃・突撃の踏みとどまり・騎兵への強さを下げる。
  Master of Command の柵・垣根の強さへの不満も、越えると乱れることで和らぐ

### D. 射撃:長い装填・最初の斉射・撃ち方・弾薬(◎)
- 違い:戦いの中で撃ち続けられるのは毎分2〜3発ほど。装填済みで待った最初の斉射がいちばん効き、統制のとれた部隊は近くまで撃たずに待った
  (ウェリントンの反斜面から50ヤード以内の斉射)。弾は1人40〜60発で、撃ち合いが30分も続けば尽きる。
  当たりは低く(100発で死傷3〜5の推計、実戦ではもっと低い)、弾幕の量で補う
- 案:
  1. 斉射の間隔:武器に「装填の秒」(マスケット20〜30秒)を持たせ、小ステップごとの連続した射撃ではなく、間隔ごとの斉射で損害を与える(再生でも一斉の煙と閃光)
  2. 最初の斉射:装填済みの最初の斉射は効き目を大きく(例 1.5〜2倍)。撃ち合いが続くと装填の乱れで下がる
  3. 撃ち方(射撃を始める距離):今の姿勢の軸の中で「射撃の統制」として、練度で自動にする(古参・精鋭は100m 以内まで待って最初の斉射、未熟は遠くから撃ち始めて弾と最初の斉射を無駄にする)。
     プレイヤーが選ぶなら、条件付き命令「敵がXm に来たら撃て」を足す(命令の数を増やさない範囲)
  4. 弾薬:携行弾薬を「1人60発」相当にし(今の `ammoPerMin` を20〜30分で尽きる値に)、尽きると撃てず士気が下がる。弾薬車(集積所)から補給

### E. 損害は士気の削り合い(◎)
- 違い:撃ち合いで実際に死傷するのは大隊の数%でも、大隊は士気が崩れて退く。損害よりも「撃たれ続けること」「近くで撃たれること」「味方が崩れるのを見ること」が効く。
  二次大戦は制圧(伏せさせる)と死傷で決まる
- 案:
  1. マスケットの射撃は戦力をあまり削らず(今の0.12の重みを半分ほどに)、士気を削る(距離が近いほど士気への打撃を大きく。50m の斉射は士気を大きく削る)
  2. 撃たれていない間だけ士気が戻る(今は止まっていれば戻る)
  3. 戦力が大きく減る前に潰走する(潰走の閾値はそのまま、士気の減りを大きく)

### F. 側面・支援・波及(○)
- 違い:横隊は側面がいちばん弱く、側面を撃たれると士気がすぐ崩れる。後ろに第2線(支援)がいる・隣に味方の大隊がいると踏みとどまり、
  近くの大隊が潰走すると周りも崩れやすい(Master of Command も側面射撃で士気の罰)
- 案:側面・背後からの射撃は損害の倍率に加えて士気の打撃を大きく。後ろ300m 以内の味方(第2線)・隣の味方で士気の減りを和らげ、
  近く(500m)の味方の潰走で士気の打撃。今の `morale.depthRecoveryBonus`(縦深の回復)を「支援」として広げる

### G. 騎兵の消耗と突撃のあと(○)
- 違い:突撃した騎兵は馬が疲れて乱れ、追撃に走りすぎて敵の予備に討たれることが多い。立て直すのに時間がかかる
- 案:突撃(姿勢)を使うと疲労と乱れ(C)が大きく増え、しばらく突撃できない。勝った騎兵は自動で追撃し、命令が届きにくい(今の `pursuitByBranch` を延ばす)

### H. 指揮の範囲と伝令(○〜△)
- 違い:命令は副官が馬で運び、遠い部隊ほど遅れて届く。旅団長・師団長の近くにいる部隊は立ち直りやすい(Master of Command の士官の指揮の範囲)
- 案:上級部隊の指揮官からの距離で、命令が届くまでの分(海戦の信号の遅れと同じ作り)と、士気の回復の倍率を変える。
  指揮官が倒れると隷下が動揺。指揮官の位置は上級部隊の部隊の重心(司令部の駒は作らない)

### I. 砲兵(△)
- 違い:砲を外す・積むのに数分(騎砲は速い)、引き綱で動かせばゆっくり撃ちながら動ける。高みからは味方の頭越しに撃てる
- 案:砲兵の展開・撤収の分を兵科に(今は `deployMultiplier` だけ)。高地にいる砲は自軍の部隊越しに撃てる(射線の例外)

### J. 垣根・壁・建物(△)
- 案:地形に垣根・石垣・農場(建物)を足し、隠れ(受ける損害)と越えると乱れ(C)を持たせる。村・農場は守る大隊の拠点

## 4. 進め方の提案

1. A(ターン15分)を決める:決断の場面が増えないと、B〜F の違いが遊びに出にくい
2. ◎の B・C・D・E を入れて、プラツェン高地で AI 同士と人の手で確かめる(横隊と縦隊の使い分け・最初の斉射・士気の崩れ方)
3. ○の F・G・H、△の I・J は、アウステルリッツの戦役(キャンペーン)の戦闘で足りなさが見えてから

## 出典(検索の要約で見たもの。じかに読めていない)

- [Master of Command Guide(Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3613270440)
- [A Guide to Linear Warfare Tactics(Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3595364872)
- [A Basic Guide to Unit Usage and Factions(Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3594434716)
- [Master of Command review(Barrel Drill)](https://www.barreldrill.com/master-of-command-review/)
- [Bold Campaigner: Master of Command reviewed(Tally Ho Corner)](https://tallyhocorner.com/2025/11/bold-campaigner-master-of-command-review/)
- [Officer Skills(Master of Command Wiki)](https://mocwiki.com/officer-skills/)
- [Column vs Line not well simulated(Steam の掲示板)](https://steamcommunity.com/app/2878450/discussions/0/601919346587240471/)
- [The real problem with Master of Command is the fence / hedge meta(Steam の掲示板)](https://steamcommunity.com/app/2878450/discussions/0/659341490666008519/)
- [Napoleonic tactics(Wikipedia)](https://en.wikipedia.org/wiki/Napoleonic_tactics)、[Infantry square(Wikipedia)](https://en.wikipedia.org/wiki/Infantry_square)
- [Battalion line, column, and square(balagan.info)](https://balagan.info/battalion-line-column-and-square-tactical-formations-during-the-napoleonic-wars)
- [Musketry Effectiveness on the Early 19th Century Battlefield(Palouse Wargaming Journal)](https://palousewargamingjournal.blogspot.com/2012/12/musketry-effectiveness-on-early.html)
- [Tactics and the Experience of Battle in the Age of Napoleon(Yale UP)](https://yalebooks.yale.edu/book/9780300082708/tactics-and-experience-battle-age-napoleon)
- [歩調の表(lexnet.dk)](https://lexnet.dk/wargames/belleall/uk/dh-tab03.htm)、[William S. Smith to Alexander Hamilton, 1800(歩調と旋回の歩調)](https://founders.archives.gov/documents/Hamilton/01-24-02-0289)
- [Ammunition supply in the Napoleonic Wars(historyrise)](https://historyrise.com/article/ammunition-supply-in-the-context-of-the-napoleonic-wars/)、[Cartridge box(Wikipedia)](https://www.wikipedia.org/wiki/Cartridge_box)

## 5. 入れたもの(ユーザー判断 2026-11:15分のターンと A〜E)

| | 仕組み(sim-core) | ナポレオン戦争のルールパックの値(仮置き) |
|---|---|---|
| A | ルールパックの `time`(陸のターンの長さ・小ステップ・展開の秒)。合わないシナリオは読み込まない(`scenarioFile.ts`)。生成器は1時間のターンで作ってから直す(`mission.ts` の `rescaleTurns`:昼の1時間=4ターン、夜は1ターン、増援・暗い時間・期限も置き換え) | 15分・30秒・展開5分。プラツェン高地は32ターン |
| B | 姿勢の `moveSpeedMultiplier`(展開したままの速さ)・`pivotsFreely`(向きをすぐ変える)・`wheel`(一度に旋回できる角度・旋回の速さと半径・それを超えると正面の変換)。正面の変換は縦隊に崩して展開し直す=展開中の隊形で、出来事 `changeFront` | 横隊・死守 0.85倍(約30m/分)・45度まで・半径250m・0.8倍の速さ(45度に約8分)・正面の変換10分。突撃縦隊1.4倍・予備と散兵1.2倍で、向きをすぐ変える |
| C | ルールパックの `cohesion` とユニットの `disorder`(`linear.ts`):展開した隊形で地形を越える・正面の変換・突撃・損害で増え、止まっていれば戻る。火力・受ける損害・突撃の落ち着き(守り手・攻め手とも)に効く | 100mあたり 森0.25・村0.3・川0.5・大河0.8、正面の変換0.25、突撃0.3(撃退されれば+0.2)、損害×3。1分に0.05戻る(撃たれていれば3割)。乱れ1で火力半分・落ち着き半分・受ける損害3割増し |
| D | ルールパックの `combat.volley` と武器の `volley`:装填して待った最初の斉射の倍率(撃つと乱れ、撃たずに待てば戻る。ユニットの `volleyFiredAt`)、練度ごとの撃ち始める距離(遠ければ斉射の武器は撃たず、弾も使わない) | 最初の斉射1.8倍・5分で戻る・撃ち始め 未熟200m・標準120m・古参100m・精鋭70m。マスケットの弾は撃ち続けて約25分で尽きる(`ammoPerMin` 0.036) |
| E | 武器の距離帯の `moraleEffect`(士気への打撃の倍率) | マスケット 50m 2倍・100m 1.4倍。ゲージの重みの戦力 0.12 → 0.07。士気は撃たれていない間だけ戻る(前から) |

画面:ユニットの欄に「隊形の乱れ」の棒、補正の札に「隊形の乱れ」「最初の斉射」、出来事に「正面を変える」。
試験:`packages/sim-core/test/napoleonic-linear.test.ts`(期待挙動14)、`packages/generator/test/mission.test.ts`(15分の戦場)。

### AI 同士(プラツェン高地・6戦)

| 版 | 結果 | 損耗の平均 |
|---|---|---|
| 前(1時間のターン) | 同盟の限定的4・仏の限定的2 | 同盟10%・仏5% |
| 15分のターンと A〜E | 同盟の決定的5・仏の限定的1 | 同盟6%・仏1% |

- 新しい仕組みは働いている(正面の変換は1戦に30〜90回、乱れは森・村で1まで上がる、肉薄・潰走も起きる)。弾が尽きた部隊はいない(撃ち合いの距離まで詰める場面が少ない)
- **仏が高地まで届かなくなった**。横隊のまま(30m/分)前進し、向きを変えるたびに正面の変換で10分止まるため。歩兵が 200m の内にいるのはターンの終わりの1割ほど。
  次に詰めること:AI が遠くでは突撃縦隊(縦隊)で動き、近づいてから横隊に展開する(線形戦術の基本)、向きの大きな変更を減らす
- 生成器の戦場(遭遇戦・攻撃と防御 各3戦)とウルム〜アウステルリッツ戦役(引き分け)は最後まで解ける

## 6. 操典と戦列歩兵の運用から深掘りしたこと(ユーザー判断 2026-11)

### 調べたこと(二次資料の要約。どれも TODO(要裏取り))

- **操典**:仏は1791年8月1日の歩兵操典(Règlement concernant l'exercice et les manœuvres de l'infanterie)が1815年以後まで使われた。英はダンダスの18の運動(1792年に義務化)。
  普通の歩調は仏 毎分76歩・速足100歩(1歩65cm)。縦隊から横隊への展開の時間は資料で確かめられなかった(出典候補:操典の本文、Colin『La tactique et la discipline dans les armées de la Révolution』の「横隊の運動」の章)
- **撃ち方**:操典には小隊・半中隊ごとの斉射(feu de peloton)、大隊の斉射、2列の射撃(feu de deux rangs=各自が撃つ)がある。実戦では最初の斉射のあと、
  各自がそれぞれの速さで撃つ射撃に崩れるのが普通だった(七年戦争の末には普軍も大隊の斉射+各自の速射)。英の小隊の斉射は片翼から順に撃ち、斉射が大隊の帯を転がるように走った
- **命中**:射撃場の試験では大隊ほどの的に 75歩で6割・150歩で4割・225歩で2割5分ほど(出典のはっきりしない数。Scharnhorst『Über die Wirkung des Feuergewehrs』1813 の 80〜81頁が候補)。戦場ではずっと低い
- **燧石と不発**:燧石は約20発ごとに替え、不発は6.5発に1発ほど(1834年の英の推計と言われるが一次資料は未確認)。汚れで不発が増える
- **雨**:カッツバッハ(1813年8月26日)は大雨でマスケットが撃てず、白兵と騎兵・砲兵で決まった(Maude 1908 による。ドレスデンの湿った燧石と混同しないこと)
- **第2線と潰走の波及**:第1線と第2線の間は100〜400歩。崩れた第1線の大隊は第2線へ逃げ込んでそれを乱し、逃げる味方を見ただけで第2線が崩れることもあった。
  戦いの目的は敵の全滅ではなく、士気と結束を崩して潰走させること
- **混合隊形(ordre mixte)**:横隊と縦隊を組み合わせた仏の隊形。縦隊で寄って横隊に展開するのが基本の流れ

### 入れたこと

| | 仕組み | ナポレオン戦争のルールパックの値(仮置き) |
|---|---|---|
| 撃ち合いの続き | `combat.volley.sustainedByTraining`:最初の斉射の後の効きは練度で決まる(操典どおりの小隊ごとの斉射を保つか、ばらばらの射撃に崩れるか)。`controlledTraining` の練度は再生でそろった斉射 | 未熟0.65・標準0.8・古参0.95・精鋭1.05。古参・精鋭はそろった斉射 |
| 銃身の汚れ・燧石 | `foulingPerMin`・`foulingFloor`(撃ち続けた分だけ落ち、撃たずに5分待てば戻る。ユニットの `firingSinceSec`) | 1分1.2%・下限0.65 |
| 雨 | `weatherMultiplier`(斉射の武器の効き。ターンの天候 ctx.weather) | 雨0.35・雪0.6 |
| 踏みとどまる横隊 | `shockSteadyMultiplier`:装填して待った守り手は突撃を近い距離の斉射で迎え、落ち着きが上がる(斉射を使う) | 1.4 |
| 側面の射撃 | `combat.flankMoraleMultiplier`(撃たれた面ごとの士気の打撃) | 側面1.5・背後2 |
| 第2線の支援 | `morale.support`:後ろ rearM の内に崩れていない味方がいれば士気の打撃が小さい | 400m・0.8倍 |
| 潰走の波及 | `morale.routContagion`:潰走した部隊の近くの味方は士気を失う | 500m・0.08 |
| AI の接近の隊形 | 姿勢の `approach`:敵が接敵の距離(600m)より遠い間はこの隊形(予備・大隊の縦隊)で寄り、近づいて横隊に展開する | 予備 |
| AI の追撃 | 追撃の得意な兵科を決めたルールパック(`combat.pursuitByBranch`)では、ほかの兵科の追撃の点を4分の1に(歩兵が潰走した敵を地図の端まで追わない) | — |
| AI の囲まれかけの見積もり | 敵が寄ってこられる距離の見込みを、ターンの長さに比べて縮める(1時間で1000m → 15分で250m)。15分のターンで、旅団が1ターンおきに「囲まれかけ」と見て下がっていた | — |

再生の演出(`flavor.ts` の `drawVolleys`。ターンの結果の射撃 `Shot` の `style`・`widthM`・`facing` を霧を通した再生に渡す):
- 最初の斉射:帯の全体がいっせいに大きく光り、厚い硝煙の帯が前に立つ
- そろった斉射:光が帯の片端から順に走る(英の小隊の斉射のような、転がる斉射)
- ばらばらの射撃:帯のあちこちで小さな光がまばらにまたたき、薄い煙
- 大砲:砲の数だけの閃光と濃い煙。350m の内はぶどう弾が扇に散り、遠ければ球形弾が2度跳ねて(土煙)目標を抜ける
- 硝煙は膨らみながら風下へ流れ、7分ほど残る

試験:`napoleonic-linear.test.ts`(期待挙動を8足した)、`packages/ai/test/napoleonic-approach.test.ts`。

### AI 同士

| | プラツェン高地(6戦) | 自動生成の戦場(遭遇戦・攻撃と防御 各3戦) |
|---|---|---|
| 5の版 | 同盟の決定的5・仏の限定的1(損耗 同盟6%・仏1%) | — |
| 6の版 | 同盟の決定的4・限定的2(損耗 同盟6%・仏2%)。歩兵が 200m の内にいる割合は1割 → 1.5割 | 攻撃と防御は仏の決定的2・同盟の決定的1、損耗20〜55%。遭遇戦は損耗が小さい |

- 縦隊で寄って展開するようになり、撃ち合いの距離まで詰める場面は増えた。仏の旅団が下がる・地図の端まで追う動きは減った
- **プラツェン高地は、仏がまだ高地を取れない**。仏の AI は高地を取りに行くより、近くの見えている敵と撃ち合う方を選ぶ(取る点の小ささ)。シナリオの目標の重みと、
  AI の攻めの段取り(総攻撃の集結)の合わせ込みが次の課題。史実(仏の決定的)とは離れたまま

### 出典(6。検索の要約で見たもの)

- [Règlement concernant l'exercice et les manœuvres de l'infanterie du 1er août 1791(Internet Archive)](https://archive.org/details/rglementconcer12fran)
- [Colin『La tactique et la discipline dans les armées de la Révolution』(austerlitz.org)](https://www.austerlitz.org/download/Colin.Tactique.pdf)
- [The French Revolution(Britannica の戦術の項)](https://www.britannica.com/topic/tactics/The-French-Revolution)
- [The hollow square(ケンブリッジ大学図書館の展示。ダンダスの18の運動)](https://exhibitions.lib.cam.ac.uk/waterloo/?p=76)
- [Volley fire(Wikipedia)](https://www.wikipedia.org/wiki/Volley_fire)
- [The accuracy of Prussian muskets(The Tactical Notebook)](https://tacticalnotebook.substack.com/p/the-accuracy-of-prussian-muskets)
- [Brown Bess(historyofwar.org)](https://www.historyofwar.org/articles/weapons_brown_bess.html)
- [Misfire Rate(civilwartalk の掲示板。1834年の推計の出どころは未確認)](https://civilwartalk.com/threads/misfire-rate.222197/)
- [Battle of the Katzbach(Wikipedia)](https://en.wikipedia.com/wiki/Battle_of_Katzbach)
- [Infantry tactics(napoleonistyka の写し。第2線の間隔と潰走の波及)](https://www.napolun.com/mirror/napoleonistyka.atspace.com/infantry_tactics_4.htm)
- [Mixed Order(Wikipedia)](https://en.wikipedia.org/wiki/Mixed_Order)
