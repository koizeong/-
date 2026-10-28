# ドイツ軍の装備品と実数の編成(パック de の根拠)

`tools/packs/build_de.py` が `data/weapons/de.json`(武器と装備品の一覧)・`data/toe/de.json`(実数の編成表)を作る。
威力の物差しは `equipment-calibration.md`。戦車・対戦車火器の貫通力と装甲は `weapons-1944-us-de.md`・`weapons-1942-de-su.md` の値をそのまま使った。
調べ方:WebSearch の要約だけ(この環境から Wikipedia・battleorder.org・bayonetstrength.uk などのページは開けなかった)。
信頼度:高=一次資料に近い表・複数の独立した出典が一致/中=二次資料1〜2件/低=フォーラム・ゲームの wiki・読み取りが不確か。

## 1. 装備品

### 小火器・機関銃(小銃換算は `equipment-calibration.md`)

| 品目 | 種類 | 年 | 値 | 根拠・信頼度 |
|---|---|---|---|---|
| Gew 98・Kar 98k | ボルト小銃(1) | 1898〜・1935〜 | — | 年は TODO(要裏取り:広く知られた採用年) |
| G 43 | 半自動小銃(1.5) | 1943〜 | — | 年は TODO |
| StG 44 | 突撃銃(2.5、400mまで) | 1944〜 | 小銃換算はゲームの見立て | 年は TODO |
| MP 18・MP 38/40 | 短機関銃 | 1918・1938〜 | — | 突撃隊が短機関銃を最初に大量に使った(中:[flamesofwar](https://greatwar.flamesofwar.com/?p=614) ほか) |
| MG 08 | 重機関銃(15、三脚) | 1908〜 | — | 重すぎて機動の役に立たず MG 08/15 が作られた(中:[American Rifleman](https://www.americanrifleman.org/content/grim-reapers-the-machine-guns-of-world-war-i)、[Osprey](https://www.ospreypublishing.com/us/german-machine-guns-of-world-war-i-9781472815170/)) |
| MG 08/15 | 軽機関銃(10) | 1917〜 | 18kg強 | 第一次大戦でいちばん多く作られた独の機関銃(中、同上) |
| MG 34 / MG 42 | 汎用機関銃(15 / 16.5)。三脚にすると重機関銃(射程1800m) | 1936〜 / 1942〜 | MG 42 は発射速度が高いので1割増し(ゲームの見立て) | 発射速度の数字は TODO(要裏取り) |
| PzB 39 | 対戦車銃 | 1940〜42 | 30mm/100m・25mm/300m | 中〜低(`weapons-1942-de-su.md`) |
| パンツァーシュレック RPzB 54 | 対戦車ロケット | 1943〜 | 垂直板 約210mm、有効150m | 中(`weapons-1944-us-de.md`) |
| パンツァーファウスト 30 / 60 | 使い捨て対戦車 | 1943〜 / 1944〜 | 140mm/30m・200mm/60m | 高(同上) |

### 迫撃砲・歩兵砲・砲

| 品目 | 弾 | 最大射程 | 根拠・信頼度 |
|---|---|---|---|
| 5cm leGrW 36 | 0.9kg | 520m(766yd とする資料も) | 中:[5 cm Granatwerfer 36](https://en.wikipedia.org/wiki/5_cm_Granatwerfer_36)、[LoneSentry](https://coulthart.lonesentry.com/panzer/german-mortars-ww2-granatwerfer.html) |
| 8cm GrW 34 | 3.5kg | 2,200m(仮置き) | 弾は kz GrW 42 と同じとする記述から(中〜低)。射程は「kz GrW 42(1,100m)の約倍」とする記述からの推定 → TODO(要裏取り) |
| 12cm GrW 42 | — | — | 見つからず入れていない。TODO(要裏取り) |
| 7.5cm leIG 18 | 6kg | 3,550m | 中:[leIG 18](https://www.wikipedia.org/wiki/7.5_cm_leichte_Infantriegeschutz_18)、[LoneSentry](https://3g.lonesentry.com/manuals/german-infantry-weapons/75-mm-light-infantry-howitzer.html) |
| 15cm sIG 33 | 38kg(I Gr 33) | 4,700m | 中:[sIG 33](https://en.wikipedia.org/wiki/15_cm_sIG_33)、[LoneSentry](https://lonesentry.com/manuals/german-infantry-weapons/sig33-15-cm-heavy-infantry-howitzer.html) |
| 10.5cm leFH 18 | 14.8kg | 10,675m | 中〜高:[leFH 18](https://en.wikipedia.org/wiki/10.5_cm_leFH_18)、[TM-E 30-451](https://lonesentry.com/manuals/tme30/ch7sec4sub5.html) |
| 15cm sFH 18 | 約44kg | 13〜15km(低い方の13,000m) | 中(弾)/低(射程):[sFH 18](https://www.wikipedia.com/wiki/150_H_40) |
| 7.7cm FK 16・10.5cm leFH 16 | — | — | 見つからず入れていない(1918年の連隊は砲兵を持たせていない)。TODO(要裏取り:Hogg の砲の事典) |

歩兵砲は連隊の砲なので、間接射撃の武器にすると部隊が砲兵の扱いになる。太平洋のパックと同じく、曲射の直接射撃にした。

### 対戦車砲・戦車砲(貫通力、mm)

| 品目 | 100 | 500 | 1000 | 1500 | 2000 | 根拠・信頼度 |
|---|---|---|---|---|---|---|
| 3.7cm Pak 36 / KwK 36 | 64 | 52 | 40 | 30 | — | **垂直の板**(30°の表は見つからず)。中:[Pak 36](https://en.wikipedia.org/wiki/3.7_cm_Pak_36) |
| 2cm KwK 30 | 35 | 25(400m) | 17(800m) | — | — | KwK 38 の PzGr 39 の値で代えた。低:[tankarchives](https://www.tankarchives.com/2016/12/2-cm-kwk-38-penetration-tables.html) |
| 7.5cm KwK 37 L/24 | 41 | 39 | 35 | — | 30 | 中:[KwK 37](https://en.wikipedia.org/wiki/7.5_cm_KwK_37)(30°で 35/33/30 とする表も) |
| 5cm KwK 38・KwK 39・Pak 38、7.5cm KwK 40 L/43 | | | | | | `weapons-1942-de-su.md` |
| 7.5cm KwK 40 L/48・Pak 40・Pak 39、KwK 42、8.8cm KwK 36・Pak 43 | | | | | | `weapons-1944-us-de.md` |
| 3.7cm KwK 38(t)(38(t)戦車) | — | — | — | — | — | 表が見つからず、Pak 36 の値で代えた。TODO(要裏取り) |

### 戦車・突撃砲・駆逐戦車・装甲車(装甲は実質の厚さ mm)

| 品目 | 前 / 側 / 後 / 砲塔前 / 砲塔側 | 根拠・信頼度 |
|---|---|---|
| II号戦車 C型 | 14 / 14 / 14 / 14 / 14 | A〜C型は14〜14.5mm(中)。前面30mm は D型から |
| 38(t)戦車 | 25 / 15 / 15 / 25 / 15 | A〜D型 8〜30mm、G型の砲塔 25/15/15(ゲームの wiki)。低 |
| III号戦車 F型 | 30 / 30 / 21 / 30 / 30 | 側面30(E〜G)は中、前面・後面は TODO(要裏取り) |
| III号戦車 J・L型 | 50 / 30 / 50 / 50 / 30 | `weapons-1942-de-su.md`(間隔装甲は足さない) |
| IV号戦車 D型 | 30 / 20 / 20 / 30 / 20 | 砲塔前面30(中)、車体は TODO(要裏取り) |
| IV号 F2・H、パンター、ティーガー I、III号突撃砲 G、IV号駆逐戦車、ヘッツァー | | `weapons-1942-de-su.md`・`weapons-1944-us-de.md` |
| Sd.Kfz. 222 | — | 厚さは確かめられず。薄い装甲として装甲の要素にしない |
| Sd.Kfz. 251 | 前14.5・側8 | 薄い装甲として装甲の要素にしない(乗る歩兵と同じく小火器で削れる) |

車両の耐久(乗員は人員として別に数える):軽戦車2.5・中戦車4・パンター5・重戦車6・突撃砲/駆逐戦車3.5・ヘッツァー3・装甲車1.5・半装軌車0.5(ゲームの見立て。`equipment-calibration.md`)。

## 2. 編成表(実数)

| 編成表 | 中身 | 根拠・信頼度 |
|---|---|---|
| 歩兵連隊(1939〜41) | 3個大隊 × (小銃中隊3・機関銃中隊1)、第13中隊(歩兵砲)、第14中隊(対戦車) | 大隊は小銃中隊3と機関銃中隊1(中:[figuren.miniatures.de](https://figuren.miniatures.de/gliederung-1939-deutsches-infanterieregiment.html))。小銃中隊は1937年10月の KStN で 4名+212名、小隊ごとに 5cm 迫撃砲1(中:[bayonetstrength](https://bayonetstrength.uk/GermanArmy/SchutzBn/4.%20KStN%20Schutzen%20Bn%20v3%20Oct1937.pdf))。軽機関銃12・小銃180・短機関銃13・対戦車銃3、機関銃中隊の重機関銃12・8cm 迫撃砲6、第13中隊の軽歩兵砲6・重歩兵砲2、第14中隊の Pak 36 12 は **TODO(要裏取り)**(よく引かれる数を仮置き。出典候補:KStN 131/132/138(1939)、Buchner『Das Handbuch der deutschen Infanterie 1939-1945』) |
| 擲弾兵連隊(1944・44年型歩兵師団) | 2個大隊 × (擲弾兵中隊3・重火器中隊1)、第13中隊、第14中隊(パンツァーシュレック) | 2個大隊(中:[TM-E 30-451](https://3g.lonesentry.com/manuals/tme30/ch2sec6sub2.html))。擲弾兵中隊は KStN 131n(1944年5月):3個小隊、分隊ごとに機関銃1、小隊本部に予備の機関銃1、重機関銃班2(中:battleorder の要約)。第14中隊はパンツァーシュレック 18 × 3個小隊、小隊50名(中:[tacticalnotebook](https://tacticalnotebook.substack.com/p/panzerschreck-company))。第13中隊は1944年に一部の歩兵砲を12cm 迫撃砲に替えた(中)。中隊の人員142・小銃・短機関銃・G 43・パンツァーファウスト18は **TODO(要裏取り)**(パンツァーファウスト18は装甲擲弾兵中隊の1944年6月の割当て) |
| 国民擲弾兵連隊(1944) | 2個大隊 × (擲弾兵中隊3・重火器中隊1)、第13・第14中隊 | 中隊は1944年11月の表で 2名+117名、2個小隊が突撃銃の突撃小隊・1個小隊が小銃小隊(理屈の上の形。実際は半分に満たない)(中:[Volksgrenadier](https://en.wikipedia.org/wiki/Volksgrenadier) ほか)。突撃銃60・小銃40・機関銃6などの数は **TODO(要裏取り:KStN 131V)** |
| 歩兵連隊(1918) | 3個大隊 × (歩兵中隊4・機関銃中隊1) | 人員・機関銃の数はすべて **TODO(要裏取り:Gudmundsson『Stormtroop Tactics』)** |
| 戦車大隊(パンター・IV号、1944) | 中隊17両 × 4 + 本部8 = 76両 | KStN 1177(fG)1944年4月1日(中〜高、`weapons-1944-us-de.md`)。整備・補給の人員は入れていない |
| 戦車大隊(1940) | 軽戦車中隊2・中戦車中隊1 | 両数と内訳は **TODO(要裏取り:Jentz『Panzertruppen』)** |
| 突撃砲旅団(1944) | 3個中隊 × 10 + 本部1 = 31両 | 31両はフォーラム(低)。KStN 446 b(1944年2月)の中隊は StuG 10・StuH 4 の14両(中:[panzerworld](https://panzerworld.com/k-st-n-446-b-1944-02-01-sturmgeschutzbatterie-mot-zu-14-geschutzen))。StuH 42 は入れていない |
| 戦車駆逐大隊(IV号駆逐戦車、1944) | 3個中隊 × 14 + 本部2 | 中隊の両数は **TODO(要裏取り)** |
| 装甲擲弾兵大隊(1944) | 装甲擲弾兵中隊3・重火器中隊1 | 中隊ごとにパンツァーファウスト18(1944年6月の通達、中)。1944年4月・7月の改定で分隊からパンツァーシュレックを外した(中)。人員・機関銃・半装軌車の数は **TODO(要裏取り:KStN 1114(fG))** |
| 砲兵大隊(leFH 18・sFH 18) | 3個中隊 × 4門 | 門数は中。人員は TODO |
| 装甲偵察中隊 | 装甲車小隊3 | 数は TODO |

## 3. 強さの確かめ(`packages/sim-core/test/equipment-packs.test.ts`)

汎用の編成表との比(300mの非装甲への火力、500mの装甲への火力、5,000mの間接射撃)

| 編成表 | 比べる汎用 | 耐久の比 | 火力の比 |
|---|---|---|---|
| 歩兵連隊(1939) | 歩兵連隊 | 1.37 | 1.79(機関銃が多い) |
| 擲弾兵連隊(1944) | 歩兵連隊 | 0.72 | 1.07 |
| 国民擲弾兵連隊(1944) | 歩兵連隊 | 0.62 | 0.92 |
| 戦車大隊(パンター) | 戦車大隊 | 1.73 | 1.59(76両。汎用は約48両) |
| 突撃砲旅団 | 駆逐戦車大隊 | 0.85 | 0.86 |
| 砲兵大隊(leFH 18) | 砲兵大隊 | 1.25 | 0.99 |
