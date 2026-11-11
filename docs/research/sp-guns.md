# 自走砲の呼び分けと運用(突撃砲・駆逐戦車・自走砲兵)

ユーザー判断(2026-11):史実での名称にかかわらず、ゲームの中では次のように呼び分ける。
- **突撃砲**:自走の榴弾砲・歩兵砲としての自走砲。歩兵に付いて、陣地・機関銃座・建物を直接射撃で叩く
- **駆逐戦車**:自走の対戦車砲としての自走砲。敵の戦車を待ち伏せ・迎え撃つ
- 15cm 野戦榴弾砲を積んだフンメルのような、曲射を前提とした自走野砲は、**機動力の高い野砲部隊(自走砲兵)**として扱う案

この環境では資料のページを直接読めず、検索の要約だけで調べた。出典は末尾。機数・編制の細部は TODO(要裏取り)。

## 1. いまのデータの問題

兵科は `infantry`・`armor`・`tank_destroyer`・`artillery`・`recon`・`anti_aircraft` の6つで、突撃砲の兵科はない。

| 編成表 | 名前 | いまの兵科 | 実際の主な使い方 |
|---|---|---|---|
| `de-stug-abt-1942`・`de_stug_battalion_1942` | 突撃砲大隊(III号突撃砲 F・長砲身) | 戦車駆逐 | **両用**。もとは突撃砲(歩兵支援)、長砲身になってからは対戦車にも多く使われた |
| `de-stug-brigade-1944`・`de_assault_gun_brigade_1944` | 突撃砲旅団(III号突撃砲 G) | 戦車駆逐 | **両用**。歩兵支援で生まれたが、長砲身型の多くは防御の対戦車に使われた |
| `de-jgpz-abt-1944`・`de_tank_destroyer_battalion_jgpz4` | 戦車駆逐大隊(IV号駆逐戦車) | 戦車駆逐 | **駆逐戦車**。装甲師団の戦車駆逐大隊。末期は戦車・突撃砲の代わりにも使われた |
| `us-td-bn-m10`・`m18`・`m36`(と ww2-1944-us-de の同名) | 戦車駆逐大隊(M10・M18・M36) | 戦車駆逐 | **駆逐戦車**(教範)。実際は歩兵師団に付けられ、中隊・小隊ずつ歩兵の支援に分け、間接射撃でも多く撃った |
| `su-sp-regt-su76` | 自走砲連隊(SU-76M) | 戦車駆逐 | **突撃砲**。対戦車にはもう力不足で、歩兵支援に回された |
| `su-sp-regt-su85` | 自走砲連隊(SU-85) | 戦車駆逐 | **駆逐戦車**。戦車・機械化軍団の自走砲連隊で対戦車を受け持った |
| `tank_destroyer_battalion` | 戦車駆逐大隊(汎用) | 戦車駆逐 | 駆逐戦車 |
| `de-flak88-bty-1940`・`uk-atk-regt-1944`・`jp-at-bn-1944`・`su_antitank_regiment_1942`・`uk_antitank_battery_1941`・`jp_antitank_battalion_1944` | 8.8cm 高射砲・17ポンド砲・47mm・45mm・2ポンド砲 | 戦車駆逐 | **牽引の対戦車砲**(自走砲ではない)。同じ兵科に混ざっている |

自走砲兵(フンメル・ヴェスペ・M7 プリースト・M12・セクストン)、突撃榴弾砲(StuH 42・ブルムベア・SU-122)、初期の短砲身の III号突撃砲は、まだデータにない。

## 2. 史実の使い方(集中か分散か)

- **III号突撃砲(独)**:マンシュタインの案(1935年)で、歩兵師団への直接射撃の支援として生まれた。大隊(後に旅団)は軍の直轄に置き、歩兵師団へ中隊(6〜7両)ずつ付けて歩兵を支援した。**分散(中隊単位で歩兵に付く)**。長砲身型の多くは防御の対戦車に回り、歩兵支援が足りなくなって、榴弾砲の StuH 42 が作られた
- **米の戦車駆逐大隊**:教範(FM 18-5)は軍団・軍の予備として集めて使い、敵の戦車の撃破だけを目的とし、間接射撃は副次。実際は歩兵師団に付けられ、中隊・小隊ずつ連隊・大隊に分けて歩兵を直接支援した。**分散**。イタリア・ノルマンディーでは間接射撃にも多く使い、ノルマンディーの VII 軍団では撃った弾の87%が間接射撃という数字がある(フォーラムの又引きで要裏取り:出典候補は Combat Studies Institute『Seek, Strike, and Destroy』)
- **SU-76M(ソ)**:歩兵支援の車両として作られ、連隊の牽引砲より守りが固く速い歩兵の支援。師団に連隊(後に大隊)を付け、大隊ごとに歩兵大隊へ。**分散**。1945年6月に狙撃兵師団の定数に入った
- **SU-85(ソ)**:1944年から対戦車を受け持ち、戦車・機械化軍団の自走砲連隊や対戦車旅団に置いた。**集中(連隊単位)**
- **IV号駆逐戦車(独)**:装甲師団の戦車駆逐大隊に2個中隊。**集中(大隊・中隊単位)**。末期は戦車・突撃砲の代わり
- **フンメル・ヴェスペ(独)**:装甲師団の砲兵連隊の自走砲大隊に、ヴェスペ2個中隊とフンメル1個中隊(各6門)。米の M7 プリーストにあたる。**集中(砲兵大隊)**で、曲射で撃つ

## 3. ゲームでの扱いの案

ゲームの部隊はほぼ大隊・連隊の大きさなので、「分散」は戦いの前の**配属**(中隊を歩兵の部隊に付ける。今は機甲・戦車駆逐の中隊を歩兵へ、1部隊に3つまで)で表し、「集中」は大隊・連隊のまま1つのユニットで動かす。

| 兵科(案) | 呼び名 | 撃ち方 | 配属 | 当てはめる部隊 |
|---|---|---|---|---|
| `assault_gun` | 突撃砲 | 直接射撃。榴弾が強く、陣地に強い(武器の `entrenchmentPierce`)。強襲・肉薄で歩兵を支える | 歩兵へ中隊ずつ配属するのが基本 | III号突撃砲(F・G)、SU-76M、のちに StuH 42・ブルムベア・SU-122 |
| `tank_destroyer` | 駆逐戦車 | 直接射撃。対戦車が主。伏撃が得意 | 集中が基本。米の戦車駆逐大隊は配属もできる(史実の分散) | IV号駆逐戦車、SU-85、M10・M18・M36、汎用 |
| `antitank`(新) | 対戦車砲(牽引) | 直接射撃。対戦車。展開に時間がかかり、遅い | なし(歩兵連隊の中の対戦車砲は編成表の要素のまま) | 8.8cm 高射砲・17ポンド砲・47mm・45mm・2ポンド砲 |
| `sp_artillery`(新) | 自走砲兵 | 砲兵と同じ曲射(司令部コマンドの砲撃)。展開が速く、撃ったら動いて対砲兵戦を避けやすい | なし | フンメル・ヴェスペ・M7 プリースト・セクストンなど(新しく足す) |

どの兵科の決まり(展開の速さ・配属できるか・地図の記号・AI の使い方)も、兵科パックとルールパックのデータに書く。

**両用の扱い**:III号突撃砲(長砲身)は、撃ち合いの強さを武器のデータ(75mm L/48 の貫通力と榴弾の力)のまま持たせれば、対戦車でも戦える。兵科は突撃砲にしておき、AI は「歩兵の攻撃を支える」を先に、敵の戦車が来れば撃ち合う。

## 4. 決めてほしいこと

1. 牽引の対戦車砲を、新しい兵科「対戦車砲」に分けるか(分けなければ、駆逐戦車の兵科に牽引砲が混ざったまま)
2. 米の戦車駆逐大隊に、間接射撃(砲撃)を副次の役目として許すか
3. 自走砲兵として、どの車両を足すか(フンメル・ヴェスペ・M7・セクストン・M12 など)
4. 突撃榴弾砲(StuH 42・ブルムベア・SU-122)と短砲身の III号突撃砲も、突撃砲として足すか

## 出典(検索の要約。ページは直接読めていない)
- Sturmgeschütz III(Wikipedia)https://en.wikipedia.org/wiki/Sturmgesch%C3%BCtz_III
- Assault Artillery – History & Organization of Assault Gun Units(Military History Visualized)https://militaryhistoryvisualized.com/?p=373
- Sturmartillerie(GlobalSecurity)https://www.globalsecurity.org/military/world/europe/history/de-stug.htm
- Tank destroyer battalion (United States)(Wikipedia)https://en.wikipedia.org/wiki/Tank_destroyer_battalion_(United_States)
- FM 18-5(ibiblio)https://ibiblio.org/hyperwar/USA/ref/FM/PDFs/FM18-5.PDF
- The Chieftain's Hatch: TDs Hold Anzio https://worldoftanks.com/en/news/history/Anzio3/
- SU-76 manual(Tank Archives)https://www.tankarchives.com/2015/07/su-76-manual.html
- SU-76(Wikipedia)https://www.Wikipedia.com/wiki/SU-76
- Sd.Kfz.124 Wespe(Tanks Encyclopedia)https://www.tanks-encyclopedia.com/ww2/germany/Sd.Kfz-124_Wespe.php
- German WWII Self-Propelled Artillery(warhistory.org)https://warhistory.org/@msw/article/german-wwii-self-propelled-artillery
- Jagdpanzer IV(historyofwar.org)https://www.historyofwar.org/articles/weapons_jagdpanzer_IV.html
- Assault guns as tank hunters(Tactical Notebook)https://tacticalnotebook.substack.com/p/assault-guns-as-tank-hunters
