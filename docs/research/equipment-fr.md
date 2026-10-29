# フランス軍の装備品と実数の編成(パック fr の根拠)

`tools/packs/build_fr.py` が `data/weapons/fr.json`・`data/toe/fr.json` を作る。1918年・1940年。
調べ方:WebSearch の要約だけ。**仮置きが多い**。信頼度の書き方は `equipment-de.md` と同じ。

## 1. 装備品

| 品目 | 値 | 根拠・信頼度 |
|---|---|---|
| ルベル M1886・MAS 36 | ボルト小銃(1) | 年・1940年の割合は TODO |
| ショーシャ M1915 | 自動小銃の 3/4(故障が多い。米のパックと同じ見立て) | 中 |
| FM 24/29 | 軽機関銃(10)、分隊に1 | 中:[avalanchepress](https://www.avalanchepress.com/SwallowsInfantry.php) |
| オチキス M1914 | 重機関銃の 0.9 倍(保弾板) | 中 |
| 60mm・81mm ブラント | 米の 60mm M2・81mm M1 と同じ値(米のものはブラントの写し) | 中(写しであること)。値は `equipment-us.md` |
| 25mm 対戦車砲 SA 34 | **仮置き** 40/500m・30/1000m | 「40mm の装甲も抜けた」とする記述だけ(低:[historynet](https://historynet.com/char-b1-bis/) ほか、[25 mm Hotchkiss](https://en.wikipedia.org/wiki/25_mm_Hotchkiss_anti-tank_gun)) |
| 47mm SA 35 | 50/400m(SA 34 は 35/400m)。1000m の40は仮置き | 中〜低:フランスの本の引用([Axis History Forum](https://forum.axishistory.com/viewtopic.php?t=126240)) |
| 37mm SA 38 | **仮置き** 30/500m | TODO |
| 75mm 野砲 Mle 1897 | 榴弾 5.3〜5.4kg・有効 8,500m | 中:[Canon de 75 modèle 1897](https://en.wikipedia.org/wiki/Canon_de_75_mod%C3%A8le_1897) |
| ソミュア S35 | 47mm SA 35、装甲 前面47・砲塔42・側面40(後面は仮置き40) | 中:[SOMUA S35](https://en.wikipedia.org/wiki/SOMUA_S35) |
| ルノー B1 bis | 47mm SA 35、装甲60。車体の 75mm 榴弾砲は表がなく入れていない | 中:[Char B1](https://en.wikipedia.org/wiki/Char_B1) |
| オチキス H39 | 37mm SA 38、装甲40(砲塔45 とする資料も) | 中〜低:[Hotchkiss H35](https://en.wikipedia.org/wiki/Hotchkiss_H35) |

## 2. 編成表

| 編成表 | 中身 | 根拠・信頼度 |
|---|---|---|
| 歩兵連隊(仏1940) `fr-ir-1940` | 約3,090名、FM 24/29 105。大隊=小銃中隊3+支援中隊(オチキス16・25mm 2・60mm 3・81mm 2)、連隊の重火器中隊(25mm 6・81mm 2) | 中:[Lehmann『1939-1940 French Armament』](https://russeurope.hypotheses.org/files/2017/07/A-01-1940-French-Armament.pdf)、[littlewars](http://www.littlewars.se/french1940/oob_di.html)。人員の内訳は TODO |
| 歩兵連隊(仏1918) `fr-ir-1918` | 大隊3 ×(中隊3+機関銃中隊) | 中隊のショーシャ8・機関銃中隊のオチキス8・人員は**仮置き**(TODO(要裏取り)) |
| 騎兵戦車大隊(S35)・戦車大隊(B1 bis)・軽戦車大隊(H39) | 中隊の数・両数 | **仮置き**(TODO(要裏取り):Zaloga『French Tanks of World War II』) |
| 砲兵大隊(75mm) `fr-art-grp-75` | 中隊3 × 4門 | **仮置き** |

## 3. 汎用の編成表との比べ

| 編成表 | 比べる汎用 | 火力の比 | 耐久の比 |
|---|---|---|---|
| 歩兵連隊 1940 | 歩兵連隊(300m) | 1.38 | 1.30 |
| 歩兵連隊 1918 | 同上 | 0.78 | 1.01 |
| 騎兵戦車大隊(S35) | 戦車大隊(500m の対装甲) | 0.57 | 0.71 |
| 戦車大隊(B1 bis) | 同上 | 0.46 | 0.87 |
| 軽戦車大隊(H39) | 同上 | 0.44 | 0.52 |
| 砲兵大隊(75mm) | 砲兵大隊(間接) | 0.46 | 1.17 |

B1 bis の大隊(車体の 75mm を入れていない)と 75mm 野砲の砲兵大隊(弾が軽い)は汎用の半分に届かず、強さの幅のテストから外した(期待挙動のテストで確かめる)。

## 4. 1918年の戦車

| 編成表・装備品 | 中身 | 根拠・信頼度 |
|---|---|---|
| シュナイダー CA1 | 短砲身75mm(弾5.3kg・射程600m は**仮置き**)・機関銃2、装甲11mm | 装甲 11〜11.5mm(のちに 5.5mm の間隔装甲)・13.5t(中:[historyofwar](https://www.historyofwar.org/articles/weapons_schneider_CA1.html)) |
| 戦車中隊群(シュナイダー・仏1918) `fr-ca1-grp-1918` | 中隊3 × 4両 = 12両 | **仮置き**(カンティニーに来た第5戦車大隊の両数は確かめていない) |
