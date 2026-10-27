# 1942年 独ソの装甲車両と対戦車兵器(武器・編成パック ww2-1942-de-su の根拠)

このメモの値から `data/weapons/ww2-1942-de-su.json`・`data/toe/ww2-1942-de-su.json` を作る(`tools/packs/build_ww2_1942_de_su.py`)。
作成方法:WebSearch(要約つき検索結果)のみ。ページ本体はこの環境から開けなかった。**値はすべて検索結果の要約に現れた数字**。「計算」と書いた実質の厚さだけは、板厚と傾斜から `厚さ / cos(傾斜)` で出したもの。
約束事は `weapons-1944-us-de.md` と同じ:貫通力は垂直から30°の均質圧延装甲が基本。幅のある値は低い方を使う。War Thunder など ゲームの wiki の値は参考(低)。
信頼度:高=一次資料に近い表または複数の独立した出典が一致/中=二次資料(Wikipedia・専門サイト)1〜2件/低=フォーラム・ゲームの wiki・要約の読み取りが不確か。

## 1. 砲・対戦車兵器の貫通力

| 武器(搭載) | 弾 | 角度 | 100 | 500 | 1000 | 1500 | パックの値 | 出典 | 信頼度 |
|---|---|---|---|---|---|---|---|---|---|
| 5cm KwK 38 L/42(III号 J 前期) | PzGr | 30° | 53 | 43 | 32 | 24 | 表のまま | [5 cm KwK 38 (Wikipedia)](https://en.wikipedia.org/wiki/5_cm_KwK_38)、[panzerworld](https://panzerworld.com/5-cm-kw-k) | 中 |
| 同上 | PzGr 39 | 30° | 55 | 47 | 37 | 28 | 使わない(低い方) | 同上 | 中 |
| 5cm KwK 39 L/60(III号 J 後期・L) | PzGr | 30° | 67 | 57 | 44 | 34 | 表のまま | [5 cm KwK 39 (Wikipedia)](https://en.wikipedia.org/wiki/5_cm_KwK_39) | 中 |
| 同上 | PzGr 39 | 30° | 69 | 59 | 48 | 37 | 使わない(低い方) | Wikipedia のインドネシア語の写し | 低〜中 |
| 7.5cm KwK 40 L/43(IV号 F2)・StuK 40 L/43(III号突撃砲 F) | PzGr 39 | 30° | — | 96 | 80 | — | Pak 39 L/48(106/96/82)・Pak 40(108/96/80)の低い方。L/43 は初速が少し低い | [7.5 cm Pak 39](https://en.wikipedia.org/wiki/7.5_cm_Pak_39)、[7.5 cm Pak 40](https://en.wikipedia.com/wiki/Pak40) | 低 |
| 同上(参考0°) | PzGr 39 | 0° | 135 | 123 | 110 | — | 使わない | [War Thunder wiki](https://wiki.warthunder.com/KwK40_L43_(75_mm)/Ammunition) | 低 |
| 5cm Pak 38 | — | — | — | — | — | — | Pak 38 の表は見つからず、同じ L/60 の砲身の KwK 39 の値 | [5 cm Pak 38](https://en.wikipedia.org/wiki/5_cm_Pak_38) | 低〜中 |
| 3.7cm Pak 36 | PzGr 39 | 90°(米英の50%) | 64 | 52 | 40 | 30 | 入れていない(歩兵連隊は Pak 38 だけにした) | [3.7 cm Pak 36](https://en.wikipedia.org/wiki/3.7_cm_Pak_36) | 中 |
| 対戦車銃 PzB 39(7.92mm) | — | 不明(60°とする出典も) | 30 | 25(300m) | — | — | 30/100・25/300 | [antitank.co.uk](https://antitank.co.uk/german1.htm)、[armedconflicts](https://www.armedconflicts.com/-t30378) | 中〜低 |
| 76mm F-34(T-34)・ZiS-5(KV-1) | BR-350A | 30°(ソ連の75%) | — | 61 | 55 | — | ZiS-3 の表の値(砲身長がほぼ同じ) | [ZiS-3 (Wikipedia)](https://en.wikipedia.org/wiki/76_mm_divisional_gun_M1942_(ZiS-3)) | 低〜中 |
| 同上 | BR-350A | 不明 | — | 69 | 61 | — | 使わない(F-34 の表は列がずれている) | [F-34 (Wikipedia)](https://en.wikipedia.org/wiki/76_mm_tank_gun_M1940_F-34) | 低 |
| 同上(参考0°) | BR-350A | 0° | — | 77 | 69 | — | 使わない | [War Thunder wiki](https://wiki.warthunder.com/F-34_(76_mm)) | 低 |
| 45mm 53-K(1937年型対戦車砲) | BR-240 | 垂直 | — | 43 | 35 | — | 表のまま(Honner) | [45 mm M1937 (Wikipedia)](https://en.wikipedia.org/wiki/45_mm_anti-tank_gun_M1937_(53-K))、[tankarchives](https://www.tankarchives.com/2013/06/soviet-45-mm-at-guns.html) | 中〜低 |
| 同上(別の表) | APBC | 垂直 | — | 53 | 40 | — | 使わない(低い方) | 同上(Punaiset panssarit) | 低 |
| 45mm 20-K(T-70) | — | — | — | — | — | — | 53-K と同じとみなす | [T-70 (War Thunder)](https://old-wiki.warthunder.com/T-70)(ゲームの値「500m より遠くで40〜50mm」) | 低 |
| 20mm TNSh(T-60) | — | — | — | 15 | 7 | — | 15/500(複数)・7/1000(ゲームの wiki) | [T-60 (War Thunder)](https://wiki.warthunder.com/T-60) | 低 |
| 対戦車銃 PTRD(14.5mm) | — | 不明 | 40 | 30 | — | — | 40/100・30/500 | [PTRD-41 (Wikipedia)](https://en.wikipedia.org/wiki/PTRD-41) | 低 |

射程(間接射撃)

| 砲 | 最大射程 | 出典 | 信頼度 |
|---|---|---|---|
| 10.5cm leFH 18 | 10,675m(10,600m とする出典も) | [10.5 cm leFH 18 (Wikipedia)](https://en.wikipedia.org/wiki/10.5_cm_leFH_18) | 中〜高 |
| 76mm ZiS-3 | 13,290m | [ZiS-3 (Wikipedia)](https://en.wikipedia.org/wiki/76_mm_divisional_gun_M1942_(ZiS-3)) | 中〜高 |
| 122mm M-30 | 見つからなかった。ソ連の砲兵大隊は ZiS-3 で代える | — | TODO(要裏取り) |

## 2. 装甲厚

| 車両 | 前面 | 側面 | 後面 | 砲塔前面 | 砲塔側面 | パックの値 | 出典 | 信頼度 |
|---|---|---|---|---|---|---|---|---|
| III号戦車 J/L | 50(J1・L は間隔装甲20を足す) | 30(E〜G の値。J は TODO) | 50 | 50(57 はゲームの wiki) | 30(TODO) | 50/30/50/50/30 | [Panzer III (Wikipedia)](https://en.wikipedia.org/wiki/Panzer_III)、[historyofwar](https://www.historyofwar.org/articles/weapons_panzer_III_ausf_J_42.html)、[tanks-encyclopedia](https://tanks-encyclopedia.com/ww2/nazi_germany/panzer_iii_ausf_g) | 中 |
| IV号戦車 F2 | 50 | 30 | 20(G のゲームの wiki) | 50 | 30 | 50/30/20/50/30 | [tanks-encyclopedia F1](https://tanks-encyclopedia.com/ww2/nazi_germany/panzer_iv_ausf_f1)、[fox3000](https://fox3000.com/pz4.htm) | 中 |
| III号突撃砲 F | 50(1942年10月から30の増加装甲) | 30 | TODO(30 で仮置き) | — | — | 50/30/30 | [historyofwar F/8](https://www.historyofwar.org/articles/weapons_StuG_III_Ausf_F8.html)、[modelingmadness](https://modelingmadness.com/scott/misc/military/previews/dragon/66/6620.htm) | 中 |
| T-34(1942) | 45@60° → 約90(計算) | 40@41° → 約53(計算) | TODO(40 で仮置き) | 45(1941年型。60 とする出典も) | 52@30° → 約60(計算) | 90/53/40/45/60 | [T-34 (Wikipedia)](https://en.wikipedia.org/wiki/T-34)、[military-history.fandom](https://military-history.fandom.com/wiki/T-34_tank) | 中 |
| KV-1 | 75(「全周75」) | 75 | 60(「85〜60」の低い方) | 75 | 75 | 75/75/60/75/75 | [Lone Sentry(当時の情報資料)](https://lonesentry.com/articles/ttt08/tanks-of-the-red-army.html)、[tankarchives](https://www.tankarchives.com/2019/06/1942-lineup-new-players.html) | 中〜低 |
| T-60 | 20〜35(食い違い) | 15 | 15 | — | — | 20/15/15 | [tankarchives](https://www.tankarchives.com/2017/06/t-60-in-difficult-times.html) | 低 |
| T-70 | 見つからず(35 で仮置き) | 15 | 15 | 50 | 35 | 35/15/15/50/35 | [T-70 (Wikipedia)](https://en.wikipedia.org/wiki/T-70) | 低〜中 |

## 3. 編成(パックでの抽象)

- 要素の数と武器の数は汎用の編成表を写した抽象。武器をその国のものに替え、装甲の要素に装甲厚を書いた
- 独の戦車連隊:汎用の戦車連隊(中隊6)を、III号 L/42 が3・III号 L/60 が2・IV号 F2 が1 にした(ゲームの見立て)。TODO(要裏取り):青作戦のころの装甲師団の戦車の内訳(Jentz『Panzertruppen』)
- ソ連の戦車旅団:1942年7月の編制は T-34 32両・軽戦車21両・自動車化狙撃兵大隊(フォーラムの shtat 010/270 の引用。9月の 010/240 は KV 5・T-34 24・T-70 20)。要素は T-34 の中隊3・T-70 の中隊2・自動車化狙撃兵1。重戦車(KV)は独立の部隊になったので、重戦車大隊を別に置く([miniatures.de](https://www.miniatures.de/toe-1942-soviet-tank-corps.html)、[Axis History Forum](https://forum.axishistory.com/viewtopic.php?p=2222115)、信頼度 低〜中)
- 入れていないもの:IV号戦車の短砲身(KwK 37 L/24。表が見つからなかった)、3.7cm Pak 36、45mm M-42、122mm M-30、ティーガー、パンツァーファウスト(1943年〜)
