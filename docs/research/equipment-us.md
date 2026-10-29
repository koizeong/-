# 米軍の装備品と実数の編成(パック us の根拠)

`tools/packs/build_us.py` が `data/weapons/us.json`(武器と装備品の一覧)・`data/toe/us.json`(実数の編成表)を作る。
威力の物差しは `equipment-calibration.md`。戦車・対戦車火器の貫通力と装甲は `weapons-1944-us-de.md`、迫撃砲・小火器・山砲の諸元は `pacific-weapons-1941-45.md` の値をそのまま使った。
調べ方:WebSearch の要約だけ(この環境から Wikipedia・battleorder.org・bayonetstrength.uk などのページは開けなかった)。
信頼度:高=一次資料に近い表・複数の独立した出典が一致/中=二次資料1〜2件/低=フォーラム・ゲームの wiki・読み取りが不確か。
距離はヤードの表をメートルに直した(500yd = 457m)。

## 1. 装備品

### 小火器・機関銃(小銃換算は `equipment-calibration.md`)

| 品目 | 種類(小銃換算) | 年 | 値・見立て | 根拠・信頼度 |
|---|---|---|---|---|
| M1903・M1917 小銃 | ボルト小銃(1) | 1903〜・1917〜18 | — | 年は TODO(要裏取り:広く知られた採用年)。1918年の派遣軍の M1917 の割合も TODO |
| M1 ガーランド | 半自動小銃(1.5) | 1937〜 | 有効 457m | 中〜高(`pacific-weapons-1941-45.md`) |
| M1 カービン | カービン(1.2) | 1942〜 | 最後の帯を400mまで(帯の形を保つため。ゲームの見立て) | 年は TODO |
| トンプソン・M3 | 短機関銃 | 1938〜・1943〜 | — | 年は TODO |
| BAR M1918A2 | 自動小銃(4) | 1918〜 | 発射速度 300〜650 の切替・有効 550m | 中(`pacific-weapons-1941-45.md`)。1918年9月にショーシャと替わり始めた(中) |
| ショーシャ M1915 | 自動小銃の 3/4(3) | 1917〜18 | 故障が多いとされるので割り引いた(ゲームの見立て) | 中:[American Rifleman](https://americanrifleman.org/articles/2017/10/31/machine-guns-of-the-american-expeditionary-force-in-world-war-i) |
| M1919A4 | 軽機関銃の 1.2 倍(12) | 1940〜 | ベルト給弾だが三脚で据える・毎分400〜600発(MG 34 は 900 前後) | 中(`pacific-weapons-1941-45.md`) |
| M1917A1 | 重機関銃(15、三脚・1800m) | 1936〜 | — | 年は TODO |
| オチキス M1914 | 重機関銃の 0.9 倍 | 1917〜18 | 保弾板の給弾で持続射撃が劣る(ゲームの見立て)。派遣軍で約7,000挺 | 中:American Rifleman(同上) |
| M2 12.7mm | 重機関銃の 1.2 倍(車載) | 1933〜 | 弾が重い(ゲームの見立て) | 年は TODO |
| バズーカ 2.36インチ(M1A1/M9) | 対戦車ロケット | 1943〜 | 100mm(資料の幅 90〜127mm)、実用 約110m・照準は 275m(300yd)まで | 中(貫通)/低〜中(射程)(`weapons-1944-us-de.md`) |
| スーパー・バズーカ 3.5インチ(M20、M28A2) | 対戦車ロケット | 1950〜 | 280mm(よく引かれる値。200mm・100mm とする資料もある)、有効 275m(静止目標 300yd) | 低〜中:[designation-systems](https://www.designation-systems.net/dusrm/app4/m28rocket.html)、[koreanwaronline](https://koreanwaronline.com/history/oz/pending/bazsup.htm)、[modernfirearms](https://modernfirearms.net/en/grenade-launchers/u-s-a-grenade-launchers/m20-super-bazooka-eng/)、[NASM](https://airandspace.si.edu/collection-objects/rocket-anti-tank-35-inch-or-super-bazooka/nasm_A19890587000) |

### 迫撃砲・砲

| 品目 | 弾 | 最大射程 | 根拠・信頼度 |
|---|---|---|---|
| 60mm M2 | 1.24kg(M49A2、射表の 2.73lb) | 1,815m | 中:[M2 mortar](https://en.wikipedia.org/wiki/M2_mortar)・`pacific-weapons-1941-45.md` |
| 81mm M1 | 3.12kg(M43A1 軽榴弾) | 約3,000m | 射程は中。弾の重さは TODO(要裏取り:FM 23-90、TM 9-1260) |
| 75mm M1A1 パック榴弾砲 | 6.24kg(M48) | 8,790m | 射程は中〜高。弾の重さは TODO(要裏取り:TM 9-1901) |
| 105mm M3(砲中隊) | 14.97kg(HE M1) | 7,600m(8,300yd) | 中:[M3 howitzer](https://en.Wikipedia.com/wiki/M3_howitzer)、[GlobalSecurity](https://www.globalsecurity.org/military/systems/ground/m3-105.htm) |
| 105mm M2A1 | 14.97kg | 11,270m(11,160〜11,430 の幅) | 中(`pacific-weapons-1941-45.md`) |
| 155mm M1 | 43kg(M107 は 43.14kg) | 14,600m(14,784m とする資料も) | 中:[dday-overlord](https://www.dday-overlord.com/?p=134377)、[quartermastersection](https://www.quartermastersection.com/american/artillery/274/155mmM1) |
| 4.2インチ迫撃砲・57mm/75mm 無反動砲・M4(105)・M8 自走榴弾砲・37mm M1916 歩兵砲・ストークス迫撃砲 | — | — | 諸元を確かめていないので入れていない。TODO(要裏取り:TM 9-1901、FM 23-80、Hogg の砲の事典) |

### 対戦車砲・戦車砲(貫通力、30°の板、mm)

| 砲 | 457m | 914m | 1,372m | 1,829m | 信頼度 |
|---|---|---|---|---|---|
| 37mm M3・M6(M51) | 53 | 46 | — | — | 低(`pacific-weapons-1941-45.md`) |
| 57mm M1(M86) | 71 | 66 | — | — | 低(`weapons-1944-us-de.md`) |
| 75mm M3(M61) | 61 | 56 | 51 | 46 | 中(同上) |
| 76mm M1・3インチ M7(M62) | 93 | 88 | 82 | 75 | 中(同上。3インチ M7 は同じ弾・弾道) |
| 90mm M3(M82) | 120 | 112 | — | — | 中(同上) |

表より遠い帯は表の最後の値(TODO(要裏取り))。朝鮮の高速徹甲弾(HVAP)は数字が見つからず、M62・M82 の値のまま(76mm HVAP の M4A3E8 は T-34-85 とほぼ互角、90mm HVAP は T-34-85 を撃ち抜いた、という定性的な記述だけ。TODO:Hunnicutt『Pershing』『Sherman』)。

### 車両(装甲は実質の厚さ mm)

| 車両 | 前 | 側 | 後 | 砲塔 前/側 | 根拠・信頼度 |
|---|---|---|---|---|---|
| M5A1 | 43 | 25 | 25 | 44/32 | 低〜中(`weapons-1944-us-de.md`) |
| M4A3(75) | 91 | 38 | 38 | 76/51 | 中(同上) |
| M4A3(76)W・M4A3E8 | 93 | 38 | 38 | 64/64 | 低〜中(同上。砲塔前面 63.5、防盾 88.9) |
| M26 | 147 | 51 | 51 | 102/76 | 中:車体前面 102mm @ 46°(実質は計算)、側面 50〜76 の薄い方、砲塔前面 102(防盾 114、資料で違う)、41.9t([M26 Pershing](https://en.wikipedia.org/wiki/M26_Pershing)、[afvdatabase](https://afvdatabase.com/usa/m26pershing.html)) |
| M10・M36 | 66 | 19 | 19 | — | 中/低〜中(M36 は M10A1 と同じ車体とみなした) |
| M18 | 29 | 13 | 13 | — | 中 |
| M8 装甲車・M3 半装軌車 | — | — | — | — | 薄い装甲として装甲の要素にしない |

車両の耐久:軽戦車 2.5・中戦車 4・M26 5(パンターと同じ)・駆逐戦車 3.5・M18 3(装甲が薄い)・装甲車 1.5・半装軌車 0.5(`equipment-calibration.md`)。

## 2. 編成表

| 編成表 | 中身 | 根拠・信頼度 |
|---|---|---|
| 歩兵連隊(米1944) `us-ir-1944` | 3個大隊 ×(本部中隊・小銃中隊3・重火器中隊)、砲中隊(105mm M3 6・118名)、対戦車中隊(57mm 9)。大隊本部中隊に対戦車小隊(57mm 3)→ 連隊で 57mm 18 | T/O&E 7-11(1944年2月26日)。対戦車は 9+3×3(中:[militaryhistoryvisualized](https://militaryhistoryvisualized.com/us-army-anti-tank-company-tactics-organization-world-war-2/)、[rcocean の大隊表の写し](https://rcocean.blogspot.com/2009/06/us-intantry-battalion-table-of.html))。砲中隊(中) |
| ・小銃中隊 | 193名(6+187)、BAR 9、M1919A4 2、60mm 3、バズーカ 5 | T/O&E 7-17(1944年2月26日)の写し(中:[Scribd](https://www.scribd.com/document/543078786/7-17-26Feb44)、[Heavy weapons platoon](https://en.wikipedia.org/wiki/Heavy_weapons_platoon))。バズーカは1944年6月30日の改定で 3→5(中)。M1・カービン・M1903・短機関銃の内訳は TODO(要裏取り:同じ表の装備の欄) |
| ・重火器中隊 | 160名、81mm 6、M1917A1 8 | T/O&E 7-18(1944年2月26日。目録:[UNT](https://mocat.library.unt.edu/catalog/608-ch1070))。81mm 6 は中。M1917A1 8 は1942年の FM 7-15 の「機関銃小隊2」から(低〜中。TODO) |
| ・本部の人員・小銃の数 | — | TODO(要裏取り)。連隊の総員は合計 2,970名になる(T/O&E 7-11 の総員と比べていない) |
| 歩兵連隊(米1918) `us-ir-1918` | 3個大隊 × 中隊4(256名)、機関銃中隊(オチキス)、ショーシャ | 中隊 256名は1918年の海兵隊の中隊(6+252)から(中)。ショーシャ 16/中隊・オチキス 16 は TODO(要裏取り:1918年5月の編制表、[tacticalnotebook](https://tacticalnotebook.substack.com/p/battalion-an-organizational-study-5b5))。連隊本部中隊の 37mm 砲3・ストークス迫撃砲6(中:[tacticalnotebook](https://tacticalnotebook.substack.com/p/the-american-one-pounder-1918-1923))は諸元がないので入れていない |
| 戦車大隊(M4・米1944/M4(76)・米1945) | 中戦車中隊3(17両)・軽戦車中隊1(M5A1 17両)・本部2 | 中(`weapons-1944-us-de.md`。1943年型の軽師団)。M4(105) 6両は入れていない(TODO)。乗員以外の人員は入れていない |
| 戦車大隊(M26・M4A3E8・米1950) | 中隊3 × 22両・本部3 | TODO(要裏取り:T/O&E 17-35(1948)) |
| 戦車駆逐大隊(M10・M18・M36) | 砲中隊3 × 12両=36両、本部・偵察中隊 | 36両は高(FM 18-5)。偵察中隊の M8・半装軌車の数は TODO(T/O&E 18-25) |
| 機甲歩兵大隊(米1944) | 本部中隊・機甲歩兵中隊3(251名・半装軌車20)・勤務中隊 | 1,001名(1943年9月、中:[bayonetstrength](https://bayonetstrength.uk/USArmy/USArmdInfBn/OrgUSArmdInfBn-headerpg.htm))、中隊 251名(T/O&E 7-27、中)、半装軌車20+迫撃砲車3(フォーラム、低)。機関銃・バズーカの数、本部中隊の 75mm 自走榴弾砲は TODO |
| 野砲兵大隊(105mm・155mm) | 3個中隊 × 4門 | 中。人員は TODO(T/O&E 6-25・6-35) |
| 騎兵偵察中隊(M8) | 偵察小隊3(M8 3・ジープ6) | TODO(要裏取り:T/O&E 2-27) |

## 3. 汎用の編成表との比べ(`packages/sim-core/test/equipment-packs.test.ts`)

| 編成表 | 比べる汎用 | 火力の比 | 耐久の比 | 50m の対装甲の比 |
|---|---|---|---|---|
| 歩兵連隊(米1944) | 歩兵連隊(300m) | 1.68 | 1.38 | 4.43(バズーカ 63・57mm 18) |
| 歩兵連隊(米1918) | 歩兵連隊(300m) | 1.20 | 1.64 | 0.22 |
| 戦車大隊(M4・1944) | 戦車大隊(500m の対装甲) | 1.29 | 1.33 | — |
| 戦車大隊(M26・1950) | 同上 | 1.74 | 1.61 | — |
| 戦車駆逐大隊(M18) | 戦車駆逐大隊(同上) | 1.05 | 1.44 | — |
| 戦車駆逐大隊(M36) | 同上 | 1.25 | 1.51 | — |
| 機甲歩兵大隊(1944) | 機械化歩兵大隊(300m) | 1.89 | 1.50 | 2.10 |
| 野砲兵大隊(105mm) | 砲兵大隊(間接) | 1.00 | 1.17 | — |
| 野砲兵大隊(155mm) | 同上 | 2.21 | 1.25 | — |

実数の部隊は人員が多いぶん汎用より強い(独の歩兵連隊1939年も 1.79・1.37)。シナリオの編成はまだ汎用のまま。史実の編成(`presets.historical`)を実数の編成表に替えるのは、両軍のパックがそろってから `VALIDATE=1` で確かめて決める。

## 4. 残りの裏取り

1. T/O&E 7-17・7-18・7-11・7-19(1944年2月26日)の装備の欄(小銃・カービン・短機関銃の数、M1917A1 の数、連隊の総員)。→ NARA、[militaryresearch.org の写しの目録](https://militaryresearch.org/army_table_notes.htm)。
2. 1918年5月の歩兵連隊の編制表(ショーシャ・オチキスの数、本部中隊)。→ 『Order of Battle of the United States Land Forces in the World War』、Tactical Notebook の連載。
3. 81mm M43A1・75mm M48 の弾の重さ、4.2インチ迫撃砲・無反動砲の諸元。→ TM 9-1901「Artillery Ammunition」、FM 23-90、FM 23-80。
4. 朝鮮の HVAP(76mm M93・90mm M304)の 30° の貫通力、1950年の戦車大隊の両数(T/O&E 17-35)。→ Hunnicutt『Pershing』、Zaloga『Armored Thunderbolt』。

## 5. バストーニュの部隊の大きさの編成表(シナリオの「史実の編成(実数・定数)」)

| 編成表 | 中身 | 根拠・信頼度 |
|---|---|---|
| 空挺歩兵連隊(米1944) `us-pir-1944` | 約1,958名。大隊3 ×(本部中隊=81mm 4・小銃中隊3=127名)。大隊ごとに 60mm 9・81mm 4・軽機関銃35・バズーカ21 | 総数は1942年の T/O 7-31(1944年も同じ総数とする資料あり。中〜低:[Rottman『US WWII Parachute Infantry Regiments』](https://ia801503.us.archive.org/20/items/rottman-us-world-war-ii-parachute-infantry-regiments/vdoc.pub_us-world-war-ii-parachute-infantry-regiments.pdf)、[Feldgrau](https://www.feldgrau.net/forum/viewtopic.php?t=33526))。大隊 530名・中隊 127名は1944年2月の大隊の表(中:[bayonetstrength](https://www.bayonetstrength.uk/USArmy/USParaInfBn/2.%20TO%20Para%20Bn%20Feb1944.pdf))。12月の T/O 7-31T の要約の数(60mm 9 など)を**大隊ごと**と読んだのは解釈(中〜低:[1944年12月16日の要約](https://cgsc.contentdm.oclc.org/digital/api/collection/p15040coll6/id/4421/download))。小銃の内訳は TODO |
| 機甲任務部隊 `us-armd-team-1944` | 中戦車中隊(M4 15)・機甲歩兵中隊・工兵小隊 | 戦車中隊1・機甲歩兵中隊1に工兵・衛生・偵察(中:[TracesOfWar](https://www.tracesofwar.com/articles/3643/Battle-for-Bastogne.htm))、デソブリー隊はシャーマン15両(中:[warfarehistorynetwork](https://warfarehistorynetwork.com/article/siege-of-bastogne-the-battle-for-noville/))。チェリー・オハラ隊の両数は TODO |
| 機甲師団の戦闘団 `us-cc-1944` | 戦車大隊+機甲歩兵大隊(定数) | 第4機甲師団R戦闘団は第37戦車大隊・第53機甲歩兵大隊が基幹(中)。12月26日の実兵力は TODO |
| 第327グライダー歩兵連隊 | — | 実数の編成表は作っていない(1944年12月の3個大隊の形の定数が見つからない)。TODO(要裏取り:T/O&E 7-51) |

## 6. 1942〜43年

| 編成表・装備品 | 中身 | 根拠・信頼度 |
|---|---|---|
| M3 リー | 75mm(車体の張り出し)・37mm(砲塔)、装甲 51/38/38・砲塔51 | 中:[M3 Lee](https://en.wikipedia.org/wiki/M3_Lee)。砲塔側面は仮置き。75mm は短い M2 砲が多いが、表がないので M3 砲の値を使った(高めに出る。TODO(要裏取り)) |
| M3 スチュアート | 37mm、装甲は M5A1 と同じとみなした | **仮置き**。TODO(要裏取り:Zaloga『M3 & M5 Stuart Light Tank』) |
| 歩兵連隊(米1942〜43) `us-ir-1942` | 小銃中隊 198名(BAR 9・M1919A4 2・60mm 3・小銃擲弾)、大隊本部中隊に 37mm 4、連隊の対戦車中隊 37mm 9 | 中隊は 6名+192名(1942年4月〜43年半ば。中:[battleorder](https://www.battleorder.org/usa-riflecoy-1942))、大隊の 37mm 4(中)。対戦車中隊の 9門は**仮置き**、砲中隊(1942年4月に加わった)は砲が分からず入れていない(TODO:T/O&E 7-11・7-19 の1942年版) |
| 中戦車大隊(M3 リー・米1942)・軽戦車大隊(M3・米1942) | 中隊17両 × 3+本部2 | **形も数も仮置き**(1943〜44年の形を写した)。TODO(要裏取り:1942年の T/O 17-26) |

## 7. 1950年(朝鮮戦争)

| 編成表・装備品 | 中身 | 根拠・信頼度 |
|---|---|---|
| 4.2インチ迫撃砲 M2 | 弾 11kg(11〜13kg の低い方)・最大4,400m。陣地への効き目0.3 | 中:[M2 4.2-inch mortar](https://en.wikipedia.org/wiki/M2_4.2-inch_mortar) |
| 57mm 無反動砲 M18 | 成形炸薬 76mm(垂直)・有効450m | 中:[M18 recoilless rifle](https://en.wikipedia.org/wiki/M18_recoilless_rifle) |
| 75mm 無反動砲 M20 | 成形炸薬 100mm・有効約366m(400yd。最大6.4km は榴弾) | 中:[Maps Air Museum](https://mapsairmuseum.org/wp-content/uploads/2024/02/M-20-75mm-Recoilless-Rifle.pdf)、[Forgotten Weapons](https://www.forgottenweapons.com/m20-75mm-recoilless-rifle-when-the-bazooka-just-wont-cut-it/) |
| 歩兵連隊(米1950) `us-ir-1950` | 砲中隊・対戦車中隊をやめ、重迫撃砲中隊(4.2インチ 12)と戦車中隊(148名・22両、M4A3E8)。大隊 917名、小銃中隊 211名(57mm 無反動砲3・60mm 3)、重火器中隊(75mm 無反動砲4・81mm 4・M1917A1 8) | 中:[Wikisource『Infantry, Part I』](https://en.wikisource.org/wiki/Infantry,_Part_I:_Regular_Army_/World_War_II_to_Korea)、[warhistory.org](https://warhistory.org/article/seoul-september-1950-part-iii)。4.2インチは8門とする資料もある。中隊・重火器中隊の火器の数と戦車の車種は TODO(要裏取り:T/O&E 7-11N・7-17N(1948)) |

汎用との比(火力/耐久):2.26/1.60(戦車中隊を持つので大きい)。
