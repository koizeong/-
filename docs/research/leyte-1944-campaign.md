# 調査メモ:レイテの戦い(1944年10月20日〜12月26日)のキャンペーン

ユーザー判断(2026-11):基地航空隊と艦隊に焦点を当てたキャンペーンの2つ目(ガダルカナルの次)。
1段階は4日・17段階(レイテ沖海戦 10月23〜26日は2段階目)。特攻(神風)は仕組みがなく表していない。
この環境では資料のページを直接読めず、検索の要約だけで調べた。出典は末尾。艦隊・航空隊の顔ぶれの多くは一般に知られた戦闘序列の概数で、
検索の要約で確かめられたものは少ない(TODO(要裏取り):Morison 第12巻の付録、Cannon『Leyte: The Return to the Philippines』、Prefer『Leyte 1944』)。

## 1. 分かったこと

### 陸
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 上陸 | 10月20日、第6軍(クルーガー)。第10軍団(北)はタクロバンの飛行場とパロ川の間、第24軍団(南)は約24km 南(ドゥラグの近く) | 高 | 米陸軍公刊戦史の要約 |
| 米の増援 | 第32師団 11月14日、第11空挺師団 11月18日、第77師団 11月23日(戦闘序列の要約)。第77師団は12月7日にオルモックの南へ上陸、10日にオルモックを取った | 中 | 戦闘序列の要約、Britannica、米陸軍公刊戦史 |
| 日本の増援 | 9つの船団で第1・第8・第26・第30・第102師団の部隊 約3万4千人をオルモックへ(多号作戦) | 中 | Wikipedia『Battle of Ormoc Bay』の要約 |
| 歩兵第41連隊 | 10月25日に 2,550人(ミンダナオから高速輸送艦)。その後4日で4個大隊 | 中 | 要約 |
| 第1師団 | 11月1日に大半と第26師団の独立歩兵第12連隊がオルモックへ | 中 | 米陸軍公刊戦史の要約 |
| 第102師団 | 3個大隊をパナイから(計画) | 低 | 同上 |
| 第68旅団 | 北(パロンポンの近く)へ上がる計画。上陸の日と兵力は見つからず | 低 | 同上 |

### 海と空
| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 西村部隊 | スリガオ海峡で駆逐艦1隻だけが残った | 高 | 要約(既存の docs/research/surigao-1944-10.md も) |
| 志摩部隊 | 重巡2・軽巡1と駆逐艦7とする要約。残骸を見て引き返した | 中 | 要約 |
| 小沢部隊 | 艦載機は約100機。囮としてハルゼーを北へ誘った | 中 | History of War の要約 |
| 日本の航空 | 10月20〜22日に使えた機:第1航空艦隊 約30・第2航空艦隊 約240・第4航空軍 約173 | 中 | USNI の表の要約 |
| 第49戦闘群 | P-38 がタクロバンへ10月24〜27日(出典で割れる) | 中 | Pacific Wrecks・Wikipedia の要約 |
| 第38任務部隊 | 4つの任務群(38.1〜38.4)。38.1 は給油に出ていた | 中 | 年表の要約 |

## 2. ゲームでの置き方(`tools/campaigns/build_leyte_1944.py`)
- 地域:レイテ島のタクロバン・パロ・ドゥラグ・ブラウエン・ダガミ・ハロ・カリガラ・リモン(首折り尾根)・オルモック・バイバイ・アブヨグ・パロンポン。島の外はルソン(マニラ・クラーク)・ネグロス(バコロド)・モロタイ(米の後方)
- 島の中央の山脈は越えられない(レイテ谷からオルモック谷へは、北のカリガラ〜リモンと南のアブヨグ〜バイバイを回る)。山越えの道を入れると、米が2段階目にオルモックを取ってしまった
- 海域:レイテ湾・スリガオ海峡・ミンダナオ海・カモテス海(オルモック湾)・ビサヤ海・シブヤン海・サンベルナルジノ海峡・サマール沖・フィリピン海・エンガノ岬沖・南シナ海・スールー海
- 部隊の単位は連隊(米の1944年の歩兵連隊・日本の1944年の歩兵連隊。国ごとの実数の編成表)。騎兵連隊・空挺は近い編成表で代えた
- 多号作戦:日本の増援は express(カモテス海に米の艦隊がいなければ夜に揚がる)。米の航空隊が届けば戦力の15%を失う(仮置き。多くの船団が沈められた)
- 艦級を1944年のパックに足した:大和型・長門型・伊勢型(航空戦艦)・千歳型・阿賀野型・エセックス級・インディペンデンス級・カサブランカ級・アイオワ級・ボルチモア級(装甲・電探は大づかみ)
- 機種のパック `tools/packs/build_pacific_air_1944.py`:F6F・FM-2・SB2C・TBM・零戦五二型・彗星・天山・P-38・B-25・B-24・一式戦・四式戦
- 護衛空母はタフィー3(6隻)と、タフィー1・2(10隻)を6隻にまとめた(ユニットの数を抑えるため)。第38任務部隊は4つの任務群
- 勝利条件(ゲームの決め方):日本はタクロバン(10点)、米はオルモックとパロンポンまで取れば決定的

## 3. AI 同士の結果(v0)
- 種1〜3:米の決定的勝利2・引き分け1。オルモックは7〜11段階目(11月中旬〜下旬)に落ちた(史実は12月10日)
- 直したこと:
  - 米の1944年の歩兵連隊(連隊砲中隊の榴弾砲を持つ)を、作戦の AI が砲兵と取り違えて、戦術の戦闘で1つも命令を出さず止まっていた(`packages/ai` の `isArtilleryUnit`)。兵科が土地を押さえない(`holdingMultiplier` < 1)部隊だけを砲兵とした。米の2個連隊と砲兵で日本の1個連隊を攻める戦術の戦闘は、直す前は6戦全敗(撃ち合いが起きない)、直した後は6戦4勝
  - 米の AI がタクロバンを空けて日本に取られた → 米のタクロバンの勝利点を5に(作戦の AI は勝利点5以上の地域に1つ残す)
  - 空母のある任務群が戦艦でルソンを砲撃し続けた → 空母のある艦隊は艦砲射撃に出さない
- 残る違和感:旧式戦艦の部隊がルソン沖まで出て飛行場を砲撃する。日本の艦隊のレイテ湾への突入は種によって起きる(種2の3段階目にドゥラグを砲撃)

## 出典(検索の要約。ページは直接読めていない)
- Leyte: The Return to the Philippines(米陸軍公刊戦史)https://ibiblio.org/hyperwar/USA/USA-P-Return/index.html(第7・第12・第19・第22章)
- Battle of Leyte order of battle(Wikipedia)https://en.wikipedia.com/wiki/Battle_of_Leyte_order_of_battle
- Battle of Ormoc Bay(Wikipedia)https://en.wikipedia.org/wiki/Battle_of_Ormoc_Bay
- The invasion of the Philippines(Britannica)https://www.Britannica.Com/topic/Pacific-War/The-invasion-of-the-Philippines
- Leyte Gulf: Pacific War's Greatest Battle(USNI Naval History 2009)https://USNI.org/magazines/naval-history-magazine/2009/october/leyte-gulf-pacific-wars-greatest-battle
- Battle of Leyte Gulf(History of War)https://www.historyofwar.org/articles/battles_leyte_gulf.html
- Leyte Gulf order of battle(Wikipedia)https://en.wikipedia.com/wiki/Leyte_Gulf_order_of_battle
- Japanese Operational Idea for Sho-1(Weapons and Warfare)https://weaponsandwarfare.com/?p=21860
- Tacloban Airfield(Pacific Wrecks)https://pacificwrecks.com/airfields/philippines/tacloban/index.html
- 308th Bombardment Wing(Wikipedia)https://en.wikipedia.org/wiki/308th_Bombardment_Wing_(U.S._Army_Air_Forces)
