# 英連邦軍の装備品と実数の編成(パック uk の根拠)

`tools/packs/build_uk.py` が `data/weapons/uk.json`(武器と装備品の一覧)・`data/toe/uk.json`(実数の編成表)を作る。
威力の物差しは `equipment-calibration.md`。小火器・ボーイズ・2ポンド砲・3インチ迫撃砲・25ポンド砲の射程は `pacific-weapons-1941-45.md` の値をそのまま使った。
調べ方:WebSearch の要約だけ(この環境から Wikipedia・battleorder.org・bayonetstrength.uk などのページは開けなかった)。
信頼度:高=一次資料に近い表・複数の独立した出典が一致/中=二次資料1〜2件/低=フォーラム・ゲームの wiki・読み取りが不確か。
**仮置き**=検索で確かめられず、理由をつけて置いた値。距離はヤードの表をメートルに直した(500yd = 457m)。

## 1. 装備品

### 小火器・機関銃・対戦車火器

| 品目 | 種類(小銃換算) | 年 | 値 | 根拠・信頼度 |
|---|---|---|---|---|
| リー・エンフィールド No.1 Mk III・No.4 | ボルト小銃(1) | 1907〜・1941〜 | 有効 503m | 中(`pacific-weapons-1941-45.md`)。No.4 の年は TODO |
| トンプソン・ステン | 短機関銃 | 1940〜43・1941〜 | — | 年は TODO |
| ブレン | 軽機関銃(10) | 1938〜 | 480〜540 発/分、有効 550m | 中(同上)。分隊に1挺(中:[battleorder](https://www.battleorder.org/uk-rifle-co-1944)) |
| ヴィッカース | 重機関銃(15) | 1912〜 | 450〜500 発/分 | 中(同上)。第二次大戦は師団の機関銃大隊が持つ |
| ボーイズ | 対戦車銃 | 1937〜43 | 垂直 23.2/91m・18.8/460m | 中(同上) |
| PIAT | 対戦車擲弾発射器 | 1943〜 | **75mm**(75 と 100 の2説の少ない方)、有効 105m(115yd) | 中:[PIAT](https://en.wikipedia.org/wiki/PIAT)、[Pegasus Archive](https://www.pegasusarchive.org/arnhem/equip_piat.htm)、[Flames of War](https://www.flamesofwar.com/hobby.aspx?art_id=834) |

### 迫撃砲・砲

| 品目 | 弾 | 最大射程 | 根拠・信頼度 |
|---|---|---|---|
| 2インチ迫撃砲 | **1.0kg(仮置き)** | **460m(仮置き)** | TODO(要裏取り:Small Arms Training Vol.I Pamphlet No.?) |
| 3インチ迫撃砲 | **4.5kg(仮置き)** | 1,460m(Mk II)→ 2,500m(1942年ごろの改良後) | 射程は中(`pacific-weapons-1941-45.md`)。弾は TODO |
| 25ポンド砲 | 11.3kg(名前の通り25ポンド) | 12,253m | 中〜高(同上) |
| 5.5インチ砲・4.2インチ迫撃砲・17ポンド砲の APDS | — | — | 入れていない。TODO(要裏取り:Hogg『British and American Artillery of World War Two』) |

### 対戦車砲・戦車砲(貫通力、30° の板、mm)

| 砲 | 100yd | 500yd | 1000yd | 1500yd | 根拠・信頼度 |
|---|---|---|---|---|---|
| 2ポンド | 53(91m) | 47(460m) | 40(910m) | 34(1,400m) | 低(`pacific-weapons-1941-45.md`) |
| 6ポンド(APCBC) | 95 | 87 | 80 | 74 | 低〜中:[Talk:Ordnance QF 6-pounder](https://en.wikipedia.org/wiki/Talk:Ordnance_QF_6_pounder)(1943年の補給省の覚書の引用)と [Scribd の表](https://www.scribd.com/doc/227228110/WW2-Armour-Penetration)(93/87/80)がほぼ一致 |
| 17ポンド(APCBC) | — | 127(600yd) | 120 | — | 中:[Osprey(アキリーズ)](https://www.ospreypublishing.com/us/discover/osprey-publishing/machine-of-the-month/17-pdr-achilles/)。[Wikipedia](https://en.wikipedia.org/wiki/17-pdr_SP_Achilles) の 140/500m・131/1000m より低い方 |
| 75mm OQF | — | 61 | 56 | 51 | 6ポンド砲を広げて米国の 75mm 弾を撃つ(中:[historyofwar](https://www.historyofwar.org/articles/weapons_churchill_VII.html))→ 米 75mm M3 の表(`equipment-us.md`) |

表より遠い帯は表の最後の値(TODO(要裏取り))。

### 車両(装甲は実質の厚さ mm)

| 車両 | 前 | 側 | 後 | 砲塔 前/側 | 根拠・信頼度 |
|---|---|---|---|---|---|
| マチルダ II | 78 | 65 | 55 | 75/75 | **仮置き**(広く引かれる値。TODO(要裏取り)) |
| クロムウェル | 76 | 32(仮置き) | 32(仮置き) | 76/60(仮置き) | 最大 76mm(中)。どの面か・側面は未確認 |
| シャーマン VC ファイアフライ | 91 | 38 | 38 | 76/51 | 米の M4 と同じとした。小隊に1両(中) |
| チャーチル VII | 152 | 95 | 51 | 152/95 | 中:[Churchill tank](https://en.wikipedia.org/wiki/Churchill_tank)、[Churchill Crocodile](https://en.wikipedia.org/wiki/Churchill_Crocodile) |
| スチュアート | 43 | 25 | 25 | 44/32 | 米の M5A1 と同じ。主砲 37mm は 2ポンド砲とほぼ同じ威力とみなした |
| アキリーズ | 66 | 19 | 19 | — | 米の M10 と同じ |
| ユニバーサル・キャリア | — | — | — | — | 7〜10mm。薄い装甲として装甲の要素にしない |

## 2. 編成表

| 編成表 | 中身 | 根拠・信頼度 |
|---|---|---|
| 歩兵大隊(英1944) `uk-inf-bn-1944` | 845名。ライフル中隊4(125名、ブレン9・2インチ迫撃砲3・PIAT 3)、支援中隊(3インチ迫撃砲6・キャリア小隊13両・6ポンド砲6・工兵小隊) | 845名(36+809)・中隊 5+120 は中([bayonetstrength の 1944年11月の WE](http://www.bayonetstrength.uk/BritishArmy/BritInfBn/7.%20WE%20Inf%20Bn%20Nov1944.pdf))。PIAT・2インチは中。3インチ 6門は中〜低(2門とする資料も)。**6ポンド砲6は未確認**(検索では1941年の2ポンド砲8しか出なかった)。小銃・ステンの数は TODO |
| 歩兵旅団(英1944) `uk-inf-bde-1944` | 大隊3+旅団本部 | 旅団本部の人員は TODO |
| 歩兵大隊(英1941) `uk-inf-bn-1941` | ライフル中隊4(ブレン9・ボーイズ3・2インチ3)、本部中隊に3インチ迫撃砲2(改良前)・キャリア10 | 定数760名(中、`pacific-weapons-1941-45.md`)。数は TODO(要裏取り:1941年6月の WE) |
| 機甲連隊(クロムウェル・英1944) | 中隊3 ×(クロムウェル16・ファイアフライ4)、連隊本部4、偵察小隊スチュアート11 | ファイアフライが小隊に1両は中。両数の内訳は TODO(要裏取り:1944年の WE) |
| 戦車連隊(チャーチル・英1944) | 中隊3 × 19両、連隊本部4、偵察小隊11 | TODO |
| 陸軍戦車大隊(マチルダ II・英1941) | 中隊3 × 16両+本部4 | TODO |
| 対戦車連隊(17ポンド砲・英1944) | 牽引の17ポンド砲中隊2・アキリーズの中隊2(各12門) | 分け方・人員は TODO |
| 野砲連隊(25ポンド砲) | 中隊3 × 8門=24門 | 中。人員は TODO |

英軍の「連隊」は機甲・砲兵では大隊の大きさ(機甲連隊は約60両、野砲連隊は24門)。

## 3. 汎用の編成表との比べ(`packages/sim-core/test/equipment-packs.test.ts`)

| 編成表 | 比べる汎用 | 火力の比 | 耐久の比 | 50m の対装甲の比 |
|---|---|---|---|---|
| 歩兵大隊 1944 | 歩兵大隊(300m) | 1.59 | 1.15 | 2.28 |
| 歩兵旅団 1944 | 歩兵連隊(300m) | 1.62 | 1.20 | 2.28 |
| 歩兵大隊 1941 | 歩兵大隊(300m) | 1.12 | 0.90 | 1.42 |
| 機甲連隊(クロムウェル) | 戦車大隊(500m の対装甲) | 1.56 | 1.43 | — |
| 戦車連隊(チャーチル) | 同上 | 1.50 | 1.76 | — |
| 戦車大隊(マチルダ II) | 同上 | 1.08 | 1.04 | — |
| 対戦車連隊 | 戦車駆逐大隊 | 1.05 | 1.35 | — |
| 野砲連隊(25ポンド砲) | 砲兵大隊(間接) | 1.63 | 1.83 | — |

## 4. 残りの裏取り

1. 1944年11月・1941年6月の歩兵大隊の WE の原文(6ポンド砲・3インチ迫撃砲の数、小銃・ステン)。→ bayonetstrength の PDF(上のリンク)。
2. 2インチ・3インチ迫撃砲の弾の重さと射程。→ Small Arms Training の教範、Hogg。
3. クロムウェル・マチルダ II の面ごとの装甲。→ Fletcher『The Universal Tank』『Matilda Infantry Tank 1938–45』(Osprey)。
4. 1944年の機甲連隊・戦車連隊・対戦車連隊の両数と内訳。→ 1944年の WE、Joslen『Orders of Battle』。
5. 英印軍・豪州軍の違い(マレー・ビルマ)。→ `malaya-1941-42.md`、AWM。

## 5. 1942〜43年(西方砂漠)

| 編成表・装備品 | 中身 | 根拠・信頼度 |
|---|---|---|
| クルセーダー III | 6ポンド砲、装甲 最大51 | 中:[Crusader tank](https://en.wikipedia.org/wiki/Crusader_tank)、[The Tank Museum](https://tankmuseum.org/tank-nuts/tank-collection/crusader-iii/)。側面・後面28は**仮置き** |
| ヴァレンタイン(2ポンド砲) | 装甲 前面65 | 前面は中([tankarchives](https://www.tankarchives.com/2023/04/soviet-armour-for-british-valentine.html)、Wikipedia 8〜65)。側面60は**仮置き** |
| グラント | 米の M3 リーの英軍型。装甲・75mm は M3 リーと同じ | `equipment-us.md` |
| 機甲連隊(英1942) `uk-armd-regt-1942` | グラントの中隊1(12両)・クルセーダーの中隊2(16両)・本部4 | **形も数も仮置き**。TODO(要裏取り:Joslen『Orders of Battle』) |
| 陸軍戦車大隊(ヴァレンタイン・英1942) | 中隊16両 × 3+本部4 | **仮置き** |

## 6. 1918年

| 編成表・装備品 | 中身 | 根拠・信頼度 |
|---|---|---|
| ルイス軽機関銃 | 軽機関銃(10)、47発の円盤弾倉 | 年は TODO |
| 歩兵大隊(英1918) `uk-inf-bn-1918` | 中隊4 × 小隊4、小隊にルイスの班1(大隊16挺) | 1918年4月で16挺、夏から増やして36挺とする資料もある(中:[Great War Forum](https://www.greatwarforum.org/topic/189792-lewis-gun-section-april-1918/)、[Wikipedia](https://en.wikipedia.org/wiki/British_Army_during_the_First_World_War))。爆弾兵の班は1918年にはなくなった(中)。人員は**仮置き**(TODO(要裏取り):[1918年10月31日の WE](https://www.314th.org/Nafziger-Collection-of-Orders-of-Battle/918BQAH.pdf))。旅団のストークス迫撃砲8門は諸元がなく入れていない |
| 機関銃大隊(英1918) `uk-mg-bn-1918` | 中隊4 × ヴィッカース16 = 64挺 | 中(同上)。人員は TODO |

## 7. 1918年の旅団・1950年

| 編成表・装備品 | 中身 | 根拠・信頼度 |
|---|---|---|
| ストークス 3インチ迫撃砲 | 弾 4.84kg・最大約730m(800yd。1,200yd とする資料も) | 中:[Stokes mortar](https://en.wikipedia.org/wiki/Stokes_mortar) ほか |
| 歩兵旅団(英1918) `uk-inf-bde-1918` | 大隊3+迫撃砲中隊(ストークス8) | 中(機関銃は師団の機関銃大隊へ移した) |
| センチュリオン Mk 3・20ポンド砲 | APDS 330mm/910m(垂直)× 0.85 = 280、装甲 前面 76.2 @ 58°(実質 約143)・砲塔152 | 貫通は中([Ordnance QF 20-pounder](https://en.wikipedia.org/wiki/Ordnance_QF_20-pounder))、装甲はゲームの wiki(中〜低)。側面・砲塔側面は**仮置き** |
| 機甲連隊(センチュリオン・英1950) `uk-armd-regt-1950` | 中隊3 × 20+本部4 | **仮置き**(第8軽騎兵連隊が1950年に朝鮮へ) |
