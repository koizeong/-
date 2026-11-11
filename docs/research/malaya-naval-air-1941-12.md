# 調査メモ:マレー沖海戦(1941年12月10日)と陸上機の航空隊

ユーザー判断(2026-11):海戦の陸上の攻撃隊(陸攻など)も空母の艦載機に準じた仕組みにする。単独のシナリオとして「マレー沖海戦」を作る。
この環境では資料のページを直接読めず、検索の要約だけで調べた。出典は末尾。数値の多くは TODO(要裏取り)。

## 1. 分かったこと

| 項目 | 内容 | 確かさ | 出典 |
|---|---|---|---|
| 日本の兵力 | 第22航空戦隊(松永貞市少将)の元山空・美幌空(九六式陸攻)と鹿屋空(一式陸攻)。85〜99機(数え方で割れる) | 中 | Wikipedia『Sinking of Prince of Wales and Repulse』、navweaps の戦闘序列 |
| 雷装と爆装 | 「雷装 51・爆装 34」と「雷撃 34・水平爆撃 51・索敵 3」の両方の要約がある(どちらかが入れ違っている)。シナリオは前の方 | 低 | 同上、worldwar2database |
| 隊ごとの機数 | 元山空 雷装17・爆装9、美幌空 雷装8・爆装25、鹿屋空 雷装26(一式)という割り振りを使った | 低(割り振りは推定) | pacificeagles『The Defeat of Force Z』の要約(鹿屋空 26機) |
| 基地 | 南部仏印のサイゴン・ツドウム・ソクトラン(隊ごとの基地は要約で割れる) | 低〜中 | fepow.family、worldwar2database |
| 経過 | 11時13分ごろ美幌空の水平爆撃がレパルスに250kg 1発、元山空の雷撃がプリンス・オブ・ウェールズに2発(4発とする要約も)、鹿屋空の雷撃でレパルスに4〜5発、プリンス・オブ・ウェールズに4発。レパルスは12時半ごろ、プリンス・オブ・ウェールズは13時20分ごろ沈んだ | 中(命中の数は割れる) | Wikipedia、pacificeagles |
| 日本の損失 | 3〜4機(元山空1・鹿屋空2〜3、美幌空1機が着陸で全損とする要約も) | 中 | USSBS 尋問 No.77、navweaps |
| 索敵と触接 | 前夜に潜水艦が報告。朝に索敵機が出て、帆足機が10時15分ごろ Z部隊を見つけて触接を続けた | 中 | 要約(複数) |
| 英の戦闘機 | 第453飛行隊(豪)のバッファロー11機は、Z部隊が無線を封止していたため呼ばれず、沈んだ後に着いた | 中 | 要約(複数) |
| 九六式陸攻 | 巡航 約280km/h(G3M1。後期型 295km/h)、爆弾 800kg か魚雷を胴体の下に | 中 | Wikipedia『Mitsubishi G3M』の要約 |
| 一式陸攻 | 巡航 約315km/h、爆弾 1000kg か九一式魚雷1本(約800〜860kg) | 中 | Wikipedia『Mitsubishi G4M』、Pacific Wrecks の要約 |
| エンダウ沖の空襲(1942年1月26日) | ヴィルデビースト(第36・第100飛行隊)12機とハドソン(豪の第1・第8飛行隊)9機、バッファロー・ハリケーンの護衛。戦果は少なく、ヴィルデビーストの損失は5〜13機(波の数え方で割れる) | 中 | Wikipedia『Battle off Endau』の要約 |

見つからなかったこと:両機の行動半径、九一式航空魚雷の改型ごとの炸薬、英の Mk XII 航空魚雷の炸薬と信頼性、サイゴンとクアンタン沖の距離の出典(シナリオでは地図帳の緯度経度から計算した)。

## 2. ゲームでの置き方
- 陸上機のパック `tools/packs/build_pacific_landair_1941.py`:機種ごとの速さ(巡航)・行動半径・1機の耐久・爆弾と魚雷。攻撃力の物差しはミッドウェーの機種にそろえた。水平爆撃は急降下より当たりにくい(`accuracy` 0.2〜0.25。美幌空の水平爆撃でレパルスに1発という要約から)。行動半径(九六式 1100km・一式 1300km・ハドソン 900km・ヴィルデビースト 400km・バッファロー 350km)は仮置き
- シナリオ `tools/scenarios/build_malaya_sea_1941_12_10.py`:地図の真ん中を北緯3.5度・東経104度に置き、マレー半島の東海岸を地図帳の値で概略に描いた。07時に Z部隊はクアンタン沖へ向かう。日本軍は前夜の報告で Z部隊のおおよその位置を知って始める。飛行場は地図の外(サイゴン 北 865km・ツドウム 881km・ソクトラン 712km、センバワン 南 約230km)。勝利条件はゲームの設計(英の損耗 20%・45%、日本の損耗 30%・50%)
- テネドスは前夜に帰されたので入れていない。索敵機の数(3機 × 3)は仮置き
- キャンペーン(マレー作戦):日本の爆撃機の航空隊は海戦では九六式陸攻の雷装、英の Blenheim はハドソン、ハリケーンはバッファローで代用(陸上機のパックにない機種)。TODO(要裏取り):陸軍と海軍の機数の内訳

## 3. AI 同士の結果(種1〜6)
- 日本の決定的勝利2・限定的勝利3・引き分け1。日本の損耗は 1割前後(史実は85機ほどのうち3〜4機。英の戦闘機の上空直衛と対空砲が史実より効いている)
- 鹿屋空は前夜の報告の位置へ真っ先に着いて見つけられず、帰ることがある(史実でも攻撃隊は一度南へ行き過ぎた)。索敵機の触接で、積み直した隊が午後にもう一度出る
- 主力艦1隻あたり魚雷10本ほどで沈むので、史実(レパルスは4〜5本、プリンス・オブ・ウェールズは6本ほど)より沈みにくい。TODO:魚雷の損害の合わせ込み(`naval.damage`・`airGroups.ordnance`)

## 出典(検索の要約。ページは直接読めていない)
- Sinking of Prince of Wales and Repulse(Wikipedia)https://en.wikipedia.org/wiki/Sinking_of_Prince_of_Wales_and_Repulse
- British Forces — Force Z(navweaps)https://navweaps.com/index_oob/OOB_WWII_Pacific/OOB_WWII_Force-Z.php
- INTERROGATION NAV NO. 77(USSBS)https://ibiblio.org/hyperwar/AAF/USSBS/IJO/IJO-77.html
- The Defeat of Force Z(Pacific Eagles)https://pacificeagles.net/the-defeat-of-force-z
- the destruction of force z(World War II Database)https://worldwar2database.com/the-destruction-of-force-z/
- Force Z(FEPOW family)https://www.fepow.family/Research/Serving_Country/Royal_Navy/Force_Z/
- Kanoya Air Group(Wikipedia)https://en.wikipedia.org/wiki/Kanoya_Air_Group
- Mitsubishi G3M(Wikipedia)https://en.wikipedia.org/wiki/Mitsubishi_G3M
- Mitsubishi G4M — tech(Pacific Wrecks)https://img.pacificwrecks.com/aircraft/g4m/tech.html
- Battle off Endau(Wikipedia)https://en.wikipedia.org/wiki/Battle_off_Endau
- Action off Endau(Naval Historical Society of Australia)https://navyhistory.au/action-off-endau/
- 出典候補(未読):『戦史叢書 マレー進攻作戦』、Middlebrook & Mahoney『Battleship』、Shores ほか『Bloody Shambles』
