# 調査メモ:ナポレオン戦争期の戦列歩兵と、二次大戦期の散兵主体の歩兵の違い(ゲームへの写し方の叩き台)

目的:ナポレオン戦争期の一戦闘のシナリオを叩き台に作り込む前に、今のエンジン(WWI〜朝鮮戦争向け)とどこが違うかを洗い出す。
調べ方:**この環境では Wikipedia・warhistory.org・ibiblio(米軍の教範)にじかにつなげなかった**(ネットワークの設定で許されていない)。
検索結果の要約(二次資料・愛好家のサイト・掲示板を含む)から拾った。数値はどれも「目安」で、TODO(要裏取り)。
出典候補(一次・定評のある二次):Hughes『Firepower: Weapons Effectiveness on the Battlefield 1630–1850』、Nosworthy『With Musket, Cannon and Sword』『Battle Tactics of Napoleon and His Enemies』、
Muir『Tactics and the Experience of Battle in the Age of Napoleon』、Haythornthwaite『Weapons and Equipment of the Napoleonic Wars』、Rowland『The Stress of Battle』、
米陸軍 FM 7-10『Rifle Company, Rifle Regiment』(1942・1944)、Beede & DeBakey の米陸軍の戦傷の統計。

## 1. 違いの要点(比べた表)

| 観点 | ナポレオン戦争の戦列歩兵 | 二次大戦の散兵主体の歩兵 |
|---|---|---|
| 密度 | 大隊(約540〜800人)が3列(英は2列)で正面約110〜160m。1人あたり約56cm(規定) | 小銃中隊(約190人)が数百mに散開。小隊・分隊は遮蔽物ごとに分かれる |
| 有効射程 | マスケットは100m 以下で効く(ヒューズの「直射の距離」は約300ヤード) | 小銃の有効射程は約500ヤード(FM 7-10)。射撃の多くは300ヤード以内、当たりの多くは100ヤード以内とする見方もある |
| 発射の速さ | 戦いの中で毎分2〜4発(調練で7発の例もある) | 自動火器(機関銃・軽機関銃)が火力の中心 |
| 当たり方 | 100発あたりの死傷は3〜5(ヒューズ)。実戦では数百発に1発の推計もある(ヴィットリアで約800発に1人) | 当たりよりも「伏せさせる」制圧が主。死傷の多くは砲・迫撃砲の破片 |
| 何が死傷させたか | マスケットが多く、砲は1〜3割ほど(はっきりした数字は見つからず) | 北西ヨーロッパの米軍で砲(迫撃砲・地雷なども含む)約69%・小火器約23%(Beede & DeBakey の数字の孫引き) |
| 戦いの決まり方 | 撃ち合いのあと銃剣の突撃。白兵まで届くのは稀で、多くはどちらかが崩れて終わる(士気) | 射撃と運動(片方が撃って伏せさせ、片方が近づく)。制圧と側面への回り込み |
| 隊形 | 横隊(火力)・縦隊(移動と突撃)・方陣(騎兵への守り)・散兵(前の幕)を状況で替える | 散開した隊形が当たり前。「隊形の選択」は行軍か展開か程度 |
| 散兵 | 大隊の1個中隊(軽歩兵中隊・ヴォルティジュール)が前に幕を張る。半島戦争では大隊の1割ほどが散兵に。仏は攻撃の前に厚い散兵の幕 | 全員が散兵(遮蔽物を使い、互いに火で援護) |
| 騎兵 | 散兵・崩れた歩兵・横隊の側面には致命的。方陣を組んだ落ち着いた歩兵はまず破れない(破れた例:ガルシア・エルナンデス1812。疲れた・乱れた・質の低い歩兵) | 戦場の騎兵はほぼ消え、偵察・機動の役 |
| 砲兵 | 直接照準。6ポンド砲の実体弾は約550〜725mで効き(最大1,500m)、ぶどう弾は約320〜410m。距離で効き目が急に落ちる(英の試験で200ヤード55発・600ヤード6発の命中) | 間接射撃(観測・計画射撃)が主。死傷の大半 |
| 煙 | 黒色火薬の煙で、撃ち合いが続くと数十mしか見えなくなる | 無煙火薬(煙幕は意図して張る) |

## 2. 今のエンジンにすでにあるもの

- 縦隊と展開(`combat.formationDamageTaken`:縦隊1.6倍・展開1.0倍)、正面の幅と1つの目標を撃てる幅の上限(`frontage`)、向きの倍率(側面・背後)
- 姿勢(`stances`):方陣(火力0.4・動けない・向きなし・騎兵から0.2倍・砲兵から2倍)・突撃(騎兵)・散兵(伏撃の置き換え)。兵科どうしの相性 `damageTakenFromBranch`、騎兵の追撃 `pursuitByBranch`(H0 で足した)
- 肉薄 `combat.assault`(強襲・突撃の姿勢で、弱った敵に取りつくと陣地を奪い合う)
- 制圧と士気のゲージの重み(ナポレオン戦争のルールパックでは2.5倍)、士気の結果(動揺・潰走・立ち直り)
- 条件付き命令(1ユニットに1つ):「騎兵が近づいたら方陣」を前もって決めておける可能性

## 3. 足りないもの(仕組みの変更になるもの)

1. **ターンの長さ**:陸は1ターン1時間。ナポレオン戦争の大隊の戦いは、隊形の替え・騎兵の突撃・撃ち合いが数分で決まる。姿勢を替えるのに1ターン(1時間)かかり、方陣が間に合わない。
   案:ルールパックに陸のターンの長さ(海戦の `naval.turnSeconds` のように)と、姿勢・隊形を替える時間(分)を書けるようにする(15〜20分のターンなど)
2. **隊形の軸**:今の隊形は行軍の縦隊か展開かだけで、横隊・突撃縦隊・方陣・散兵の別がない(方陣と散兵は姿勢で代えている)。
   案:ルールパックで隊形を定義(火力・受ける損害を武器の種類ごと・速さ・替える時間・突撃の力・騎兵への強さ・向き)。WWI〜朝鮮戦争のルールパックは今の2つのまま
3. **密度と受ける損害**:密集した隊形は砲(とくに実体弾・ぶどう弾)にもろく、散開した部隊はもろくない。今は縦隊の倍率だけ。
   案:隊形の「密度」を持ち、間接・直接の砲火の受ける損害に掛ける(二次大戦の散開した歩兵にも効く)
4. **突撃の決まり方(士気の衝撃)**:銃剣・騎兵の突撃は、近づく間に守り手が崩れるかどうかで決まる(白兵まで届くのは稀)。今の肉薄は戦力比と制圧で決まる。
   案:突撃が近づいたら守り手の士気で判定(踏みとどまれば突撃側が撃たれて退く、崩れれば守り手が潰走)。騎兵は方陣には止められ、横隊の側面・散兵・崩れた部隊は蹴散らす
5. **散兵の幕**:大隊の一部が前に出て、敵の密集した隊形を削り、味方の隊形を隠す。今は大隊まるごとが散兵の姿勢になるだけ。
   案(軽め):散兵の力を大隊の性質に持たせ(編成表の要素の一部)、前にいる間は相手の密集した隊形に追加の損害・味方への射撃を少し減らす
6. **煙**:撃ち合いが続く所は見通しが落ち、射撃の効き目も落ちる。
   案:地点ごとの煙の量(撃った量でたまり、風で消える)を見通しと命中に掛ける(演出の煙を、ルールの煙にする)
7. **砲兵の直接照準**:実体弾は列を貫いて縦に並んだ隊形ほど多く当たる、ぶどう弾は近いほど効く。今の武器の距離帯である程度は書けるが、「縦の深さ」は表せない

## 4. 叩き台のシナリオの候補

| 候補 | 規模 | 見どころ |
|---|---|---|
| カトル・ブラ(1815年6月16日) | 両軍2〜3万、数時間 | 歩兵の方陣と騎兵の突撃、森と農場、援軍が次々に着く |
| マイダ(1806年7月4日) | 両軍5千ほど、短い | 英の2列の横隊 対 仏の縦隊。数部隊で隊形の違いを試せる |
| アウステルリッツのプラツェン高地(1805年12月2日) | 師団どうし | 霧の中の縦隊の攻撃。キャンペーンとつながる |

最初の叩き台は、隊形の違いを少ない部隊で確かめられるマイダが扱いやすい。騎兵と方陣まで試すならカトル・ブラ。

## 出典(検索の要約で見たもの。じかに読めていない)

- [Musketry Effectiveness on the Early 19th Century Battlefield(Palouse Wargaming Journal)](https://palousewargamingjournal.blogspot.com/2012/12/musketry-effectiveness-on-early.html)
- [Napoleonic Era Infantry Combat vs. Modern Combat(Military History Visualized)](https://militaryhistoryvisualized.com/tag/muskets)
- [Book review: Firepower(HistoryNet)](https://historynet.com/book-review-firepower-weapons-effectiveness-on-the-battlefield-16301850-major-general-bp-hughes-mh/)
- [Napoleonic tactics(Wikipedia)](https://en.wikipedia.org/wiki/Napoleonic_tactics)
- [Battalion line, column, and square(balagan.info)](https://balagan.info/battalion-line-column-and-square-tactical-formations-during-the-napoleonic-wars)
- [The Art of Musketry in the Napoleonic Wars(WDS)](https://wargameds.com/blogs/news/the-art-of-musketry-in-wds-napoleonic-warfare)
- [Voltigeur(Wikipedia)](https://en.wikipedia.org/wiki/Voltigeur)
- [The Napoleonic Skirmish Line(warhistory.org)](https://warhistory.org/2015/10/29/the-napoleonic-skirmish-line/)
- [Battle of García Hernández(Wikipedia)](https://en.wikipedia.org/wiki/Battle_of_Garc%C3%ADa_Hern%C3%A1ndez)、[Garcia Hernandez(napoleonguide)](https://napoleonguide.com/battle_garcia.htm)
- [Artillery ranges(napoleonguide)](https://napoleonguide.com/artillery_ranges.htm)、[6-pounder Field Gun: The Waterloo Gun(Royal Artillery Museum)](https://www.royalartillerymuseum.com/our-collection/waterloo-gun)
- [WWII US Army and its Tactics II(warhistory.org)](https://warhistory.org/article/wwii-us-army-and-its-tactics-ii?amp=1)
- [FM 7-10 Rifle Company, Rifle Regiment 1942(ibiblio)](https://ibiblio.org/hyperwar/USA/ref/FM/FM7-10/index.html)
- [Artillery does not cause 90% of casualties(Battlefront forum。Beede & DeBakey の孫引き)](https://community.battlefront.com/topic/26362-artillery-does-not-cause-90-of-casualties)
- [Dupuy's Verities: The Effects of Firepower in Combat(Dupuy Institute)](https://dupuyinstitute.org/2019/04/15/dupuys-verities-the-effects-of-firepower-in-combat/)
- [David Rowland's Stress of Battle(blog)](https://wargamingco.blogspot.com/2019/11/david-rowlands-stress-of-battle.html)
