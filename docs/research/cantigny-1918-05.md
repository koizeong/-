# カンティニーの戦い 1918年5月28日(シナリオ cantigny-1918-05-28 の根拠)

`tools/scenarios/build_cantigny_1918_05_28.py` が `data/scenarios/cantigny-1918-05-28.json` を作る。v0・概略図。
部隊は国ごとの実数の編成表(定数。`equipment-us.md`・`equipment-de.md`・`equipment-fr.md`)をそのまま使う。調べ方:WebSearch の要約だけ。

## 1. 地図

| 村 | 緯度・経度 | 出典 |
|---|---|---|
| カンティニー | 49.6628, 2.4924 | [uswarmemorials](https://uswarmemorials.org/html/site_details.php?SiteID=27)(Wikipedia は 49.664, 2.493) |
| ヴィレール=トゥルネル | 49.6542, 2.4644 | [Wikipedia](https://en.wikipedia.org/wiki/Villers-Tournelle) |
| フォンテーヌ=ス=モンディディエ | 49.657, 2.517 | [cartesfrance](https://www.cartesfrance.fr/carte-france-ville/plan_80326_Fontaine-sous-Montdidier.html) |
| メニル=サン=ジョルジュ | 49.6399, 2.5229 | france-voyage |

塹壕線・高地・ベラシーズ農場・モンディディエは入れていない(TODO(要裏取り):米第1師団の戦闘詳報の地図、ABMC『American Armies and Battlefields in Europe』)。

## 2. 部隊

| 部隊 | 編成表 | 根拠・信頼度 |
|---|---|---|
| 米第28歩兵連隊 | `us-ir-1918` | 中:[Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Cantigny)、[First Division Museum](https://www.fdmuseum.org/collection/online-exhibits/battle-of-cantigny/) |
| 仏第5戦車大隊のシュナイダー | `fr-ca1-grp-1918`(12両は**仮置き**) | 機関銃座を潰すのが役目(中:[worldwar1.com](http://www.worldwar1.com/dbc/cantigny.htm))。CA1 は装甲約11mm・短砲身75mm(中:[historyofwar](https://www.historyofwar.org/articles/weapons_schneider_CA1.html)) |
| 米第1野砲旅団と仏の砲 | `fr-art-grp-75` を2(75mm Mle 1897) | 1時間の準備砲撃(中)。386門とする話は確かめられず、門数は TODO |
| 独第82予備師団 | 村の守備 `de-ir-1918` の戦力0.4・陣地レベル2(**仮置き**)、逆襲 `de-ir-1918` を 08:30(戦力0.4)と 17:10 | 08:30 の小さな逆襲、17:10 の大きな逆襲、終日の砲撃(中:Wikipedia)。連隊の番号(第271・272予備歩兵連隊とする話)は確かめていない |
| 独の砲兵 | `de-art-abt-1918` を2(FK 16) | 門数は TODO |

火炎放射器の班(仏)は武器の物差しがないので入れていない。

## 3. 時間・勝利条件・結末

- 06:00〜22:00 の16ターン。05:45 から1時間の準備砲撃、06:45 に歩兵が出た(中)。
- 米軍:村とヴィレール=トゥルネルを保てば限定的、村を保ち独軍に3割の損害で決定的。急ぎ度1.0(時刻の決まった攻撃)。独軍:村を保てば限定的、さらにヴィレール=トゥルネルを取れば決定的(ゲームの設計)。
- 史実:30分で村を取り、仏の火炎放射器の班と地下室を掃討した。その後の数日で7回の逆襲をしのいだ。独第82予備師団は初日に1,408名を失った(worldwar1.com)。米の損害は戦死199を含む1,603名とする資料と、第28連隊で将校45・兵1,022 とする資料がある。

## 4. AI 同士の対戦(8戦)

| 配置 | 結果 |
|---|---|
| 守備は連隊全部、米の急ぎ度0.6 | 独7・米1(米がほとんど攻めない) |
| 守備を連隊の戦力0.4に、米の急ぎ度を1.0に | 独5・米3 |

## 5. 残りの裏取り

1. 両軍の陣地・出発線、村にいた独の大隊の数。
2. 準備砲撃の門数、仏の戦車の両数、火炎放射器の班。
3. 独第82予備師団の連隊の番号と逆襲の大きさ。→ 米第1師団の公刊史、ドイツの連隊史。
