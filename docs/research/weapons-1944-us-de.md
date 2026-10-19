# 1944年 米独の装甲車両と対戦車兵器(武器・編成パック ww2-1944-us-de の根拠)

このメモの値から `data/weapons/ww2-1944-us-de.json`・`data/toe/ww2-1944-us-de.json` を作る(`tools/packs/build_ww2_1944_us_de.py`)。パックに入れたのは被帽徹甲弾の値と車体の実質の装甲厚だけで、幅のある値は低い方を使った。
作成方法:WebSearch(要約つき検索結果)のみ。WebFetch は使えないため、出典ページ本体は直接読んでいない。
**値はすべて検索結果の要約に現れた数字で、推測で埋めたものはない**(ただし「実効厚」の列の一部は、出典の板厚・傾斜から筆者が `厚さ / cos(傾斜)` で計算したもので、その旨を「計算」と明記)。
信頼度:高=一次資料に近い表または複数の独立した出典が一致/中=二次資料(Wikipedia・専門サイト・Osprey等)1〜2件/低=フォーラム・ゲームwiki・要約の読み取りが不確か。

## 0. 前提・約束事

- **板の角度**:特記なければ「垂直から30°傾けた均質圧延装甲(RHA)」(米英式の30°。独式表記では60°に当たる。panther1944.de が明記)。
- **距離の単位に注意**:米軍資料はヤード(yd)、独側(Wikipedia の独砲の表)はメートル。1000 yd ≈ 914 m。下表では出典の単位をそのまま書く。
- **貫徹の判定基準**が国ごとに違う(米:Navy/Army 基準、英:50%成功、独:別基準)。同じ砲でも出典で10〜20%ずれる。
- War Thunder wiki の値は0°(垂直板)かつゲームデータなので、参考扱い(低)。30°の表がない場合のみ比較用に添える。

---

## 1. 砲・対戦車兵器の貫徹力表

### 1-1. 米軍

| 砲(搭載車) | 弾種 | 角度 | 100 | 500 | 1000 | 1500 | 2000 | 出典 | 信頼度 |
|---|---|---|---|---|---|---|---|---|---|
| 75 mm M3(M4, M4A3) | M61 APC(被帽徹甲) | 30°、yd | TODO(要裏取り) | 61 mm(2.4in) | 56 mm(2.2in) | 51 mm(2.0in) | 46 mm(1.8in) | Hunnicutt系の表 https://www.theshermantank.com/wp-content/uploads/M3-gun-Data.pdf ;ほぼ同値(60/55/51/46)が https://en.wikipedia.org/wiki/75_mm_gun_M2%E2%80%93M6 (ただし表の行ラベルは M2 L/31) | 中 |
| 同上 | M61(別出典) | 30°、yd | 至近 約79.5 mm | — | 約63 mm | — | — | 1944年英 AORG メモ(75mm 2030 f/s) https://tankandafvnews.com/2015/10/21/from-the-vault-comparison-of-performance-of-75mm-and-76mm-tank-gun-ammo/ | 中 |
| 同上 | M61(別出典) | 30° | — | 約100 mm(600 yd) | 約93 mm | 約82 mm(1600 yd) | — | SHAEF 1944年7月資料の引用(投稿者自身が疑問視) https://community.battlefront.com/topic/940-silly-allied-penetration-data/ | 低 |
| 同上 | M72 AP(徹甲) | 30°、yd | — | 約61 mm(2.4in) | 約53 mm(2.1in) | — | — | https://www.theshermantank.com/wp-content/uploads/M3-gun-Data.pdf | 低(行の読み取りが曖昧) |
| 76 mm M1(M4A1(76)W, M4A3(76)W, M18) | M62 APC | 30°、yd | TODO(要裏取り) | 93 mm(3.7in) | 88 mm(3.5in) | 82 mm(3.2in) | 75 mm(3.0in) | Hunnicutt 由来とされる表(フォーラム) https://community.battlefront.com/topic/20955-some-tungsten-info ; https://cs.finescale.com/fsm/modeling_subjects/f/3/t/8639.aspx?page=2 | 中(独立2件が同値) |
| 同上 | M62A1 | 30°、m | — | 92–96 mm(500 m) | — | — | — | Osprey M18 ページ https://www.ospreypublishing.com/us/discover/osprey-publishing/machine-of-the-month/m18-hellcat | 中 |
| 同上 | M62(英メモ) | 30°、yd | 至近 約108 mm | — | 約90 mm | — | — | https://tankandafvnews.com/2015/10/21/from-the-vault-comparison-of-performance-of-75mm-and-76mm-tank-gun-ammo/ | 中 |
| 同上 | M93 HVAP(T4) | 30°、yd | TODO(要裏取り) | 157 mm(6.2in) | 135 mm(5.3in) | 116 mm(4.6in) | 98 mm(3.9in) | 同上フォーラム2件 | 中〜低(同スレ内に「1000mで175mm」「2000mで124mm」の異説) |
| 同上(参考0°) | M62 / M93 | 0°、m | 146 / 186 | 133 / 167 | 119 / 146 | 106 / 128 | 94 / 112 | War Thunder wiki https://wiki.warthunder.com/M1_(76_mm) | 低 |
| 3-inch M7(M10) | M62 APC | 30° | 76 mm砲 M1 と同じ弾・ほぼ同じ弾道(M62 を 2600 f/s)とされるため上の M62 行を流用可 | | | | 76 mm(1.7in?, 2000 yd 30°と記載) | 3-inch M5 の記事「弾道は76mm M1と本質的に同じ」 https://www.wikipedia.org/wiki/3in_Gun_M5 ;2000yd/30°で76mm の諸元表(要約) | 中(流用)/2000 yd 値は低 |
| 同上 | M62(RHA, 角度記載なし=0°と思われる) | m | 124 mm | — | — | — | 84 mm | https://www.wikipedia.org/wiki/3in_Gun_M5 | 中 |
| 90 mm M3(M36) | M82 APC(初期 2650 f/s) | 30°、yd | TODO(要裏取り) | 120 mm(4.7in) | 112 mm(4.4in) | TODO | TODO | WWII 諸元表 https://www.theshermantank.com/wp-content/uploads/M3-90mm-gun-data.pdf ;Hunnicutt『Pershing』の引用 https://forum.shrapnelgames.com/archive/index.php/t-28958.html | 中 |
| 同上 | M82(後期 2800 f/s) | 30°、yd | — | 129 mm | 122 mm | — | — | 同フォーラム(Hunnicutt 引用) | 低 |
| 同上 | M304 HVAP(T30E16, 3350 f/s) | 30°、yd | TODO | 221 mm(8.7in) | 199 mm(7.9in) | TODO | TODO | 上記 PDF とフォーラム | 中 |
| 同上(参考0°) | M82 / M304 | 0°、m | 182 / — | 169 / 259 | 155 / 234 | 142 / 211 | 130 / 191 | https://old-wiki.warthunder.com/M3_(90_mm) | 低 |
| 57 mm M1 対戦車砲 | M86 APC(2700 f/s) | 30°、yd | — | 約71 mm(2.8in) | 約66 mm(2.6in) | TODO | TODO(表が崩れて読めず) | 1944年7月 兵器局資料の転載 https://www.lonesentry.com/blog/57-mm-gun-m1.html (0°では約99 mm/約89 mm) | 低(表の抽出が崩れている) |
| 同上 | M86 | — | 「1500 yd でパンターの側面・後面を貫徹」 | | | | | 1944年 米軍射撃試験 https://wargaming.info/1998/us-army-1944-firing-test-no2/ | 中(定性的) |

**米 HVAP の1944年末の入手状況**
- 76 mm HVAP は1944年夏の終わり(8月に空輸)から少量届き始めた。M93 の制式名は1945年2月。1944年12月の欧州戦域への到着は 76 mm HVAP 5,000発・3-inch HVAP 5,000発。月1万発の生産に達したのは1944年11月、週2,000発超の到着は1945年1月中旬以降。「1両2〜3発」が行き渡ったのは1945年になってから。一部部隊は12月〜1月にほぼ皆無。出典:https://worldoftanks.com/en/news/history/us-guns-german-armor-part-2/ (Chieftain's Hatch), https://community.battlefront.com/topic/20955-some-tungsten-info , https://forum.axishistory.com/viewtopic.php?p=2311038 。信頼度:中。
- 90 mm HVAP(T30E16/M304)は1945年1月から出回り始めたとの記述(フォーラム)。**バストーニュ(1944年12月)の M36 はほぼ HVAP なしと見るのが妥当だが直接の記録は未確認**。https://forum.axishistory.com/viewtopic.php?p=2311038 , https://en.wikipedia.org/wiki/90_mm_gun_M1/M2/M3 (タングステン弾は常に不足)。信頼度:低〜中。
- 1944年の米射撃試験では、90 mm M82 は炸薬が早期に起爆して30°の厚い板への貫徹が落ちると報告。https://wargaming.info/1998/us-army-1944-firing-test-no1/ 信頼度:中。

**歩兵用対戦車火器(米)**

| 兵器 | 貫徹(垂直板) | 有効射程 | 出典 | 信頼度 |
|---|---|---|---|---|
| 2.36-inch バズーカ M1A1 / M9(M6A1/M6A3 ロケット) | 約90–100 mm(modernfirearms)/約4 in=102 mm(Forgotten Weapons)/最大5 in=127 mm(Britannica)→ **範囲 90–127 mm** | 照準 100–400 yd、理論有効 300 yd、実用は約 120 yd(朝鮮戦争の資料) | https://modernfirearms.net/?p=5439 , https://forgottenweapons.com/the-m9a1-bazooka-now-with-optics-and-quick-takedown , https://britannica.com/technology/bazooka , https://www.koreanwaronline.com/arms/bazooka.htm , https://www.globalsecurity.org/military/systems/ground/m9-bazooka.htm | 中(貫徹)/低〜中(射程) |

### 1-2. ドイツ軍(すべて 30°、メートル)

| 砲(搭載車) | 弾種 | 100 m | 500 m | 1000 m | 1500 m | 2000 m | 出典 | 信頼度 |
|---|---|---|---|---|---|---|---|---|
| 7.5 cm KwK 40 L/48 / StuK 40 / PaK 40(Pz IV H/J, StuG III G, Jagdpanzer IV(L/48の Pak 39), 牽引 PaK 40) | PzGr 39(APCBC) | 106 | 96 | 85(版により82–86) | 74(〜75) | 64 | https://en.wikipedia.org/wiki/7.5_cm_KwK_40 ; https://en.wikipedia.org/wiki/7.5_cm_Pak_39 (Bergström 2014 引用、1000 m=82) | 中 |
| 同上 | PzGr 40(APCR、タングステン芯) | 143 | 120 | 97 | 77 | TODO(表に値なし) | https://en.wikipedia.org/wiki/7.5_cm_KwK_40 ;PaK 40 で「500 yd で115 mm」 https://lovettartillery.com/7,5cm_Panzer_Abwehr_Kanone_PAK_1940.html ;「500 m 115 mm/1800 m 80 mm」 https://en.rcamuseum.com/7-5cm-pak-40-german/ | 中 |
| 7.5 cm KwK 42 L/70(パンター) | PzGr 39/42(APCBC, 925–935 m/s) | 138 | 124 | 111–112 | 99 | 89 | https://en.wikipedia.org/wiki/7.5_cm_KwK_42 ;Panther-Fibel 由来 https://www.panther1944.de/index.php/en/sdkfz-171-pzkpfwg-panther/technology/75-cm-kwk-42-munition | 高(独立2件一致) |
| 同上 | PzGr 40/42(APCR, 1120–1130 m/s) | 194 | 174 | 149 | 127 | 106 | 中文 Wikipedia(Jentz 引用) https://zh.wikipedia.com/wiki/7.5%E5%8E%98%E7%B1%B3KwK_42%E7%A0%B2 ;panther1944.de | 中 |
| 8.8 cm KwK 36 L/56(ティーガー I) | PzGr 39(APCBC, 773–780 m/s) | 132 | 110 | 99 | 91 | 83 | https://en.wikipedia.org/wiki/8.8_cm_KwK_36 (フィンランドの教範表) ; https://kaweah.freedombox.rocks/kiwix/wikipedia_en_all_maxi_2023-10/KwK_36 | 中 |
| 同上 | PzGr 40(APCR, 930 m/s) | 171 | 156 | 138 | 123 | 110 | https://en.wikipedia.org/wiki/8.8_cm_KwK_36 ;100 m 171 は https://ffden-2.phys.uaf.edu/webproj/212_spring_2017/John_Schnering/Schnering_John/3KwK36.htm も同値 | 中 |
| 8.8 cm KwK 43 / PaK 43 L/71(ティーガー II, ナースホルン, ヤークトパンター, 牽引 PaK 43) | PzGr 39/43(APCBC, 1000 m/s) | 202 | 185 | 165 | 148 | 132 | 100/500 m は https://en.wikipedia.org/wiki/8.8_cm_KwK_43 (30°と明記)、1000–2000 m は https://panzerworld.com/8-8-cm-kw-k-43-l-71 (角度ラベルが要約に出ず) | 中(1000 m 以上は低〜中) |
| 同上 | PzGr 40/43(APCR, 1130 m/s) | 238 | 217 | 193 | 171 | 153 | https://panzerworld.com/8-8-cm-kw-k-43-l-71 (角度ラベル未確認) | 低〜中。Pak 43 の記事は「40/43 は極度に不足」 https://en.wikipedia.org/wiki/8.8_cm_Pak_43 |

**独 APCR(PzGr 40 系)の1944年の入手状況**
- 1944年2月の弾薬割当(Panzerworld):対戦車中隊(10両)で 7.5 cm PzGr 40 が100発に対し PzGr 39 が400発、14両中隊で190発対510発。StuG III 中隊は190発/266発。→ **1両あたりおよそ10〜19発(全体の約2〜3割)**(筆者の割り算)。https://panzerworld.com/german-ammunition-loadouts 信頼度:中。
- 8.8 cm PzGr 40/43 は極度に不足、PzGr 39/43 と榴弾は概ね入手可。https://en.wikipedia.org/wiki/8.8_cm_Pak_43 信頼度:中。

**歩兵用対戦車火器(独)**

| 兵器 | 貫徹 | 有効射程 | 出典 | 信頼度 |
|---|---|---|---|---|
| Panzerschreck RPzB 54(RPzBGr 4322) | 垂直板 約210–216 mm(modernfirearms 210、米軍資料 8.5 in)/60°の板で160 mm(業者の解説) | 150 m(米軍資料 165 yd、実戦はもっと近いことが多い) | https://en.wikipedia.org/wiki/Panzerschreck , https://modernfirearms.net/en/grenade-launchers/germany-grenade-launchers/offenrohr-panzerschreck-eng/ , https://www.ima-usa.com/original-german-wwii-panzerschreck-rpzb-54-anti-tank-rocket-launcher.html | 中(射程は高) |
| Panzerfaust 30 klein | 140 mm(異説 140–160、150) | 30 m | https://en.wikipedia.org/wiki/Panzerfaust , https://www.lonesentry.com/manuals/tme30/ch7sec2sub7.html (TM-E 30-451), https://www.armedconflicts.com/-t9272 | 高(TM-E 30-451 と Wikipedia が一致) |
| Panzerfaust 30(gross) | 200 mm | 30 m | 同上 | 高 |
| Panzerfaust 60 | 200 mm(TM-E 30-451:「30 と同じ」) | 60 m | 同上 | 高 |

---

## 2. 車両の装甲表

表記:厚さ mm @ 垂直からの傾斜角。「実効厚(水平射撃)」は `厚さ ÷ cos(傾斜)`。出典に実効厚の記載がある場合は「出典」、ない場合は「計算」。

### 2-1. 米軍

| 車両 | 車体前面上部 | 砲塔前面 | 車体側面 | 砲塔側面 | 後面 | 実効厚 前/側 | 出典 | 信頼度 |
|---|---|---|---|---|---|---|---|---|
| M4 / M4A3(75)前期車体 | 51 @ 56° | 76(防盾は別、TODO) | 38(垂直) | 51(M4A1 1942 の値)| 38 | 前 約91(計算)/側 38 | https://www.theshermantank.com/?p=172 , https://rmsothebys.com/auctions/lc14/lots/r0043-m4a3-75-sherman-medium-tank/ , https://afvdatabase.com/usa/m4sherman.html , https://wiki.warthunder.com/unit/us_m4_sherman ;War Thunder 記事「実効約80 mm」 https://warthunder.com/en/news/2988-vehicle-profile-m4-sherman-en | 中 |
| M4A3(75)W 後期(大ハッチ)車体 | 63.5 @ 47° | 76 | 38 | TODO | 38 | 前 約93(計算)/側 38 | https://www.theshermantank.com/sherman/armor-yeah-the-sherman-had-it-and-it-was-better-than-the-german-armor-of-comparable-weight/ ;47°車体の欧州到着は1944年8月中旬〜9月下旬 https://forum.axishistory.com/viewtopic.php?p=2191974 | 中 |
| M4A3E2 ジャンボ | 101.6(63.5+38.1増加装甲)@ 47° | 152(防盾は別、TODO) | 76(38+38) | 152 | TODO | 前 約149(計算)/側 76 | https://tankhistoria.com/wwii/m4a3e2/ , https://archive.armorama.com/forums/35765/index.htm | 中 |
| M4A1(76)W | 63.5 @ 47°(War Thunder は鋳造で 40–62°) | 63.5、防盾 88.9 | 38.1 | 63.5 | 38 | 前 約93(計算、47°として)/側 38 | https://wiki.warthunder.com/M4A1_(76)_W | 低〜中(ゲームwikiのみ) |
| M10(3-inch GMC) | 38 @ 55°(下部 51) | 防盾 57 | 上部 19/下部 25 | 25(+増加装甲取付ボルト) | 上部 19/下部 25 | 前 約66(計算)/側 19–25(傾斜角 TODO) | https://en.wikipedia.org/wiki/M10_tank_destroyer , https://www.afvdatabase.com/usa/3ingmcm10.html , https://wiki.warthunder.com/unit/us_m10 | 中 |
| M18 ヘルキャット | 12.7 @ 64°/53°/38°/24°(複数面) | 25.4 @ 23° | 12.7 @ 23°/0° | 12.7 @ 20° | 12.7 | 前 約29(64°面、計算)/側 約13 | https://www.armedconflicts.com/16777- , https://warthunder.com/en/news/3772-profile-m18-gun-motor-carriage-hellcat-en , https://modelingmadness.com/review/misc/vehicles/us/tanks/stew18.htm | 中 |
| M36 ジャクソン | M10A1 車体を流用(M10 と同じと見られる:38 @ 55°)。tanks-encyclopedia は 38–108 @ 0–56° と幅で記載 | 76 @ 0° | M10A1 と同じ(19/25 と見られる) | 31.8 @ 5°(オープントップ) | TODO | 前 約66(M10 と同じとして計算)/側 19–25 | https://afvdatabase.com/usa/90mmgmcm36.html (M10A1 車体)、https://tanks-encyclopedia.com/category/ww2-us-tank-destroyers/ 、Wikipedia 9.5–50.8 mm https://en.wikipedia.org/wiki/M36_tank_destroyer | 低〜中 |
| M5A1 スチュアート | 28.5 @ 49°(下部 63.5 @ 33–37°) | 44.4、防盾 50.8 | 25–28 | 32–38(諸説) | 25 | 前 約43(計算)/側 25–28 | https://wiki.warthunder.com/unit/us_m5a1_stuart , https://rmsothebys.com/auctions/lc14/lots/r0080-m5-stuart-tank/ | 低〜中 |
| M8 グレイハウンド装甲車 | 13–19(傾斜、角度 TODO) | TODO(19 前後と思われるが未確認) | 9.5 | TODO | 9.5 | 前 TODO/側 9.5 | https://en.wikipedia.org/wiki/M8_Greyhound | 中(車体のみ) |

### 2-2. ドイツ軍

| 車両 | 車体前面上部 | 砲塔前面 | 車体側面 | 砲塔側面 | 後面 | 実効厚 前/側 | 出典 | 信頼度 |
|---|---|---|---|---|---|---|---|---|
| IV号戦車 H型 | 80(1943年6月から一枚板。初期は 50+30 ボルト留め)@ 約11°。上部の斜め板は 20 | 50 @ 約11° | 30(+シュルツェン 5) | 30 | 車体 20/砲塔 30 | 前 約81(計算)/側 30 | https://www.historyofwar.org/articles/weapons_panzer_IV_ausf_H.html , https://tanks-encyclopedia.com/ww2/nazi_germany/panzer_iv_ausf_h , https://wiki.warthunder.com/Pz.IV_H | 中〜高 |
| IV号戦車 J型 | 80 @ 11° | 50 @ 11° | 30(車体シュルツェンは省かれることがあった) | 30 | 20 | 前 約81(計算)/側 30 | https://en.wikipedia.org/wiki/Panzer_IV , https://wiki.warthunder.com/Pz.IV_J | 中 |
| パンター A型 / G型 | 80 @ 55°(下部 60 @ 54°) | 砲塔前面 110(A型、出典1件)/G型 100、防盾 100(鋳造、120 説あり) | 40(下部、垂直)/50(G型の上部、A型は 40)。傾斜角 TODO | 45 @ 25° | 40 | 前 約139(計算)/側 40–50+(傾斜で増える。TODO) | https://tanks-encyclopedia.com/ww2/germany/panzer-v_panther.php , https://old-wiki.warthunder.com/Panther_G , https://www.armedconflicts.com/-t520 | 中(前面は高、側面上部の傾斜は TODO) |
| ティーガー I | 100(ほぼ垂直) | 100、防盾 110–200(諸説) | 上部(張り出し)80/下部 60 | 80 | 80 | 前 約100/側 60–80 | https://en.wikipedia.org/wiki/Tiger_I , https://www.miniatures.de/panzergranate/pzgr31e.html | 高 |
| III号突撃砲 G型 | 80(1943年5月から一枚板)、戦闘室前面 80 | 防盾 80(後期は鋳造「ザウコップ」) | 30(+シュルツェン 5) | 戦闘室側面 30 | 30(中央部 50 説) | 前 約80/側 30 | https://www.historyofwar.org/articles/weapons_StuG_III_Ausf_G.html , https://old-wiki.warthunder.com/StuG_III_G , https://www.armedconflicts.com/-t538 | 中〜高 |
| IV号駆逐戦車(L/48) | 60 @ 50°(1944年5月/車台番号320301から 80) | (固定戦闘室=前面上部と同じ) | 車体 30/戦闘室 40 | — | 車体 20/戦闘室 30 | 前 約93(60 mm)/約124(80 mm)(計算)/側 30–40 | https://www.historyofwar.org/articles/weapons_jagdpanzer_IV.html , https://origin.armedconflicts.com/topic/view/6414 , https://wiki.warthunder.com/Jagdpanzer_IV | 中 |
| ヘッツァー(38(t)駆逐戦車) | 60 @ 60°(下部 60 @ 40°) | (固定戦闘室) | 20(傾斜、角度 TODO) | — | 8(戦闘室)/10(車体) | 前 約120(出典に明記)/側 20+ | https://en.wikipedia.org/wiki/Hetzer , https://www.historyofwar.org/articles/weapons_jagdpanzer38t_hetzer.html , https://wiki.warthunder.com/Hetzer | 中〜高 |
| Sd.Kfz. 251(装甲兵員輸送車) | 14.5 | — | 8(V字に傾斜。C型で 35°) | — | 8 | 前 14.5/側 8(+傾斜) | https://en.wikipedia.org/wiki/Sd.Kfz._251 , https://rmsothebys.com/auctions/mm12/lots/r1078-194041-hanomag-spw-ausf-c-sdkfz-2511 | 中 |

---

## 3. 編成(1944年)

| 部隊 | 内容 | 出典 | 信頼度 |
|---|---|---|---|
| 米 機甲師団の戦車大隊(1943年型の軽師団) | 大隊本部中隊・中戦車中隊3・軽戦車中隊1・整備中隊・衛生班。**中戦車 53両(M4、3個中隊)+軽戦車 17両(M5、1個中隊)+M4(105) 6両**。中戦車中隊は17両(本部2+小隊5両×3)、別に M4(105) 1両。軽戦車中隊は本部2+5両×3=17。師団に戦車大隊3個。 | https://5ad.org/flags/flags.html , https://www.battleorder.org/us-army-medium-tanks-ww2 , https://www.battleorder.org/us-army-light-tanks-ww2 , https://militaryhistoryvisualized.com/?p=284 | 中(二次資料。一次は T/O&E 17-25、Stanton『Order of Battle』) |
| 米 戦車駆逐大隊(自走) | 本部中隊・偵察中隊・砲中隊3・衛生班。砲中隊は4両小隊×3=12両、**大隊で 36両**(M10/M18/M36)。小隊は2両の砲分隊×2。T/O 18-25/18-27(1944年3月15日)。 | FM 18-5 https://ibiblio.org/hyperwar/USA/ref/FM/PDFs/FM18-5.PDF , https://en.wikipedia.org/wiki/Tank_destroyer_battalion_(United_States) , https://community.battlefront.com/topic/94712-tank-destroyer-organization/ , https://mocat.library.unt.edu/catalog/593-ch1392 | 高(FM 18-5 が明記) |
| 独 戦車連隊(1944年型戦車師団) | I大隊=パンター、II大隊=IV号。各大隊は本部中隊・整備中隊・戦車中隊4。1943年11月の KStN 1177 は **中隊22両(大隊 約96両)**。1944年4月1日の KStN 1177(fG)で **中隊17両(本部2+5両×3)、大隊76両(17×4+本部8)**。1944年11月1日版では **中隊14両**(大隊64両)。師団全体の定数は約168両との記述。実際の充足はたいてい定数を下回る。 | https://www.panther1944.de/index.php/en/sdkfz-171-pzkpfwg-panther/truppenteile/panther-unit-histories/46-kstn-nr-1177-fgvom-141944 , https://www.wwiidaybyday.com/kstn/kstn1177fg1nov44.htm , https://blog.sturmpanzer.com/panzer-division-44-organization-chart-and-kstn-list/ , https://feldgrau.net/forum/viewtopic.php?t=32471 , https://panzerworld.com/panzer-division-1944 | 中〜高 |
| 独 装甲擲弾兵大隊の対戦車火器 | 1944年6月21日の通達:**擲弾兵中隊ごとに Panzerschreck 3、Panzerfaust 18(基本割当)**。1944年11月の KStN では中隊に Panzerschreck 2人組×3(1943年11月の1/3)。1944年3月2日の調達指示は「戦車・装甲擲弾兵師団には Panzerschreck を配らない(歩兵師団は130)」。1944年4/7月の freie Gliederung では装甲擲弾兵分隊から Panzerschreck を外し、大隊の重対戦車小隊は戦車駆逐部隊へ移された(大隊の対戦車力は実質対戦車地雷のみ、との記述)。PaK 40 / Sd.Kfz. 251/22 の大隊内配備数は TODO(要裏取り)。 | https://www.battleorder.org/post/german-armored-panzergrenadier-squad-july-1944 | 中(1出典。一次は KStN 1114(fG) 等、H.Dv. 298/3a(1944年8月)) |

---

## 4. 主な TODO(要裏取り)と出典候補

1. **米砲の100 m(100 yd)値**:75 mm M61・76 mm M62/M93・90 mm M82/M304 の至近値。→ FM 17-12 Tank Gunnery(1944年7月)の貫徹表(LoneSentry の転載 https://lonesentry.com/blog/armor-penetration-tables.html は数値が抽出できず)、TM 9-1907「Ballistic Data, Performance of Ammunition」、Hunnicutt『Sherman』『Pershing』付録。
2. **90 mm M82/M304 の 1500・2000 yd(30°)**:→ 兵器局「Armor-Piercing Ammunition for Gun, 90-mm, M3」(1945年1月) https://www.lonesentry.com/manuals/90-mm-ammunition/index.html に30°曲線がある、TM 9-1907、Bird & Livingston『WWII Ballistics: Armor and Gunnery』。
3. **57 mm M1(M86)の 1500・2000 yd**:LoneSentry の表が崩れて読めず。→ 原資料(1944年7月 兵器局概要)、Chamberlain & Gander『Anti-Tank Weapons』。
4. **7.5 cm PzGr 40 の 2000 m**、**8.8 cm KwK 43 の 1000 m 以上と PzGr 40/43 の角度ラベル**:→ Jentz『Panzer Tracts』No.?(砲の章)、Jentz『Germany's Tiger Tanks』、Bird & Livingston。
5. **米国判定基準と独判定基準の換算**:同じ表の中で米・独の値を直接比べると誤差が出る。→ Bird & Livingston で一本化した値を取るのが望ましい。
6. **車両**:パンター側面上部の傾斜角(A型40 @ 40°?、G型50 @ 29°?は**未確認**のため表に入れていない)と砲塔前面 110 の真偽、M4 の砲塔防盾厚、M36 の車体装甲(M10A1 と同一かどうか)、M8 の砲塔装甲、M5A1 の砲塔側面、ヘッツァー・Sd.Kfz.251 の側面傾斜角。→ Jentz & Doyle『Panzer Tracts』No.5(パンター)・No.4(IV号)・No.9(駆逐戦車)、Hunnicutt『Sherman』『Stuart』『Armored Car』、Zaloga『M10 and M36 Tank Destroyers』(Osprey New Vanguard 57)、Zaloga『M18 Hellcat』、TM 9-731B(M4)。
7. **編成**:米戦車大隊・戦車駆逐大隊の T/O&E 原文(T/O&E 17-25、18-25/18-27)、独 KStN 1114/1171/1177 の原文。バストーニュに関わる個別部隊(第10機甲師団 CCB、第9機甲師団 CCR、第705戦車駆逐大隊=M18、第609戦車駆逐大隊、第2戦車師団・装甲教導師団・第26国民擲弾兵師団など)の**実数**は別途必要。→ `docs/research/bastogne-1944-12.md` の出典(Cole『The Ardennes』、Marshall『Bastogne: The First Eight Days』、Nevenkin『Fire Brigades』、Zetterling『Normandy 1944』の手法)。
8. **1944年12月の HVAP/APCR 携行数**:米 76 mm HVAP は「ほぼ皆無〜1両数発」、90 mm HVAP は1945年1月からとされるが一次資料未確認。→ ETO 兵器部の補給報告、Zaloga『Armored Thunderbolt』。
