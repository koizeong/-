# CLAUDE.md

## プロジェクト概要
旅団〜連隊規模の同時入力(WEGO)型ターン制戦略シミュレーション。1ターンは1時間(夜は1ターンにまとめる)。オンライン対戦+AI対戦。
データ駆動のゲームエンジンとして作り、武器・編成・シナリオ・時代ルールをmodで追加できる。
第1弾はWWI〜朝鮮戦争、最初のMVPシナリオは「バストーニュ攻防戦(1944年12月19〜26日)」。
仕様の正本は `docs/GDD.md`(企画書)。仕様と実装が食い違う場合は、勝手に決めず確認する。

## 構成(TypeScript モノレポ)
- `packages/sim-core`:ゲームルール。UI・ネットワーク・描画に依存しない純粋なロジック
- `packages/ai`:命令を生成するAI(人間と同じ命令インターフェースを使う)
- `packages/server`:WebSocket、ルーム、霧のフィルタリング
- `packages/client`:ブラウザ描画と命令入力
- `data/`:武器・編成・シナリオ・マップのJSON/YAML(スキーマ検証つき)
- `docs/`:GDD.md ほか

## 設計ルール(必ず守る)
1. **sim-core は決定論的**:乱数は必ずシード付きRNG。`Math.random` と `Date.now` は使わない
2. **サーバー権威**:クライアントは命令を送るだけ。解決はサーバー(sim-core)が行う
3. **霧はサーバー側で処理**:クライアントには、そのプレイヤーに見える情報だけを送る
4. **ゲーム内の単位**:距離はメートル、時間は秒(または分)で持つ。ピクセルやヘクス換算はsim-coreに入れない
5. **データ駆動**:ユニット・武器の数値をコードに直書きしない。ユニット能力は編成表(TO&E)と武器データから導出する
6. **時代依存の処理はルールパックに分離**する。sim-coreの核に特定の時代を前提とした分岐を書かない
7. **戦闘フェイズは1〜2分刻みの小ステップ**で計算し、再生用に位置の軌跡を含むイベントログを返す
8. **損害は3ゲージ**(戦力/制圧/士気)で持つ。補給は「司令部・集積所の備蓄」「ユニットの携行備蓄」「道路グラフ上の補給路」で分ける
9. 命令は1ユニットにつき「目的地(経由点。敵の部隊を目的地にする追撃も含む)・到着後の正面方向・移動モード(行軍/戦闘移動)・条件付き命令1つ」に、別枠の「姿勢」と「停止後に展開」を加えたもの。これ以上増やさない。経由点・移動モード・姿勢は、変更しない限り次ターンも保持する
10. **隊形が攻撃力を決める**:行軍は縦隊(攻撃不可)、戦闘移動は展開したまま。縦隊から展開完了までは1ターン。行軍後に展開するのは「停止後に展開」の指示か接敵のときだけ
11. **陣地レベル(0〜3)**:展開済みで前ターンに動かなかったユニットだけが段階的に上がり、動くと0に戻る(短い並行移動と小さな向きの直しは例外で、陣地を保つ)。上限は地形・兵科・姿勢で変わる(数値はデータで定義し、コードに直書きしない)
12. **姿勢**(標準/強襲/死守/伏撃/予備など)は移動モードとは別の軸。変更には1ターンかかり、切替中のターンは標準扱い。効果量はデータで定義する

## テスト
- テストランナー:vitest
- 単体テストに加え、**期待挙動のテスト**を書く(例:側面攻撃は正面攻撃より損害が大きい/燃料切れの機甲は前進できない/補給路が遮断されると弱体化する/縦隊のまま遭遇すると不利)
- AI同士の自動対戦で、バランスの偏り(一方的な勝率)を検出できるようにする

## 作業の進め方
- 大きな変更は、まず方針を短く提示して確認してから実装する
- 1回の変更は小さく保つ。変更後は必ずテストと型チェックを実行する
- 史実データ(編成・兵力・天候など)は推測で埋めない。不明な値は `TODO(要裏取り)` と書き、出典候補を添える
- パラメーター調整は、数値を変えた理由をコミットメッセージに残す

## MVPの範囲外(今は作らない)
将校育成、空爆の詳細、modのスクリプト対応、補給車列の個別ユニット化
(装備編成=武器の開発・連隊テンプレートと、オンライン対戦と、キャンペーン(戦闘の結果が次の戦闘に響く作戦の層。部隊の経験による練度の上昇は入れ、将校育成は入れない)は、ユーザー判断で範囲に入れた。どちらも作成済み(おまかせ編成も)。オンライン対戦のインターネットへの公開・アカウント・ランク戦・観戦は未作成)

## コマンド
- `pnpm install`:依存のインストール
- `pnpm test`:全パッケージのテスト(vitest)
- `pnpm typecheck`:全パッケージの型チェック
- `pnpm dev`:ゲームサーバー(ws://localhost:8787)とクライアント(http://localhost:5173)をまとめて起動。開くと表紙(新しく始める・戦場を作る(自動生成)・キャンペーン・続きから・オンライン対戦・手引き・装備と編制(図鑑)・装備編成)。URL に `?scenario=<id>&side=<陣営>&seed=<数>` を付けると開始画面を飛ばす。`?menu=scenarios|generate|campaign|catalog|continue|online|tutorials` でその画面から開く
- `LAN=1 pnpm dev`:同じネットワークのほかのマシンからも開けるように起動する(オンライン対戦。http://<このマシンのIP>:5173)。編成エディターの保存は localhost からだけ
- `pnpm build`:クライアントのビルド
- 編成エディター:`pnpm dev` を起動して http://localhost:5173/editor.html(data/ の編成表・武器を編集し、検証してから保存)
- 地図の生成:`pnpm dev` を起動して http://localhost:5173/generator.html(地形の傾向・大きさ・向き・シードを選んで、自動生成の地図を見比べる)
- `node scripts/e2e-smoke.mjs`:画面を通した動作確認(pnpm dev で起動した状態で。ユニットを選んで命令し、1ターン進めてスクリーンショットを撮る)
- `node scripts/e2e-tutorial.mjs`:手引きを画面で最後まで進める確認(pnpm dev で起動した状態で)
- 装備編成:`pnpm dev` を起動して http://localhost:5173/develop.html(武器の開発・連隊テンプレート。ブラウザに保存、ファイルに書き出し)。開始画面の「装備編成して始める」で部隊を差し替える
- `node scripts/e2e-online.mjs`:オンライン対戦を2つのブラウザで通す確認(部屋を作る → 合言葉で入る → 同時にターン終了 → 切断して戻る。pnpm dev で起動した状態で)
- `node scripts/e2e-flow.mjs`:ゲームの流れを画面で通す確認(表紙 → 作戦の選択 → 部隊編成 → 出撃 → 最後のターン → 結果の画面 → 作戦の選択へ。pnpm dev で起動した状態で)
- `node scripts/e2e-generate.mjs`:戦場を作る(自動生成)を画面で通す確認(任務・地形を選ぶ → 作り直す → 陣営 → 作戦命令 → 出撃 → 2ターン。pnpm dev で起動した状態で)
- `node scripts/e2e-campaign.mjs`:キャンペーンを画面で通す確認(始める → 作戦地図で命令 → 確定 → 戦闘を指揮して1ターン → 作戦地図へ → 次の段階へ。pnpm dev で起動した状態で)
- `node scripts/e2e-campaign-gen.mjs`:自動生成のキャンペーンを画面で通す確認(作戦を作る → 作り直す → 始める → 命令 → 確定 → 次の段階へ を2回。pnpm dev で起動した状態で)
- `node scripts/e2e-attach.mjs`:配属を画面で通す確認(作戦の選択 → 戦車中隊を歩兵連隊に配属 → 出撃 → 地図の印とユニットの欄の内訳 → 1ターン。pnpm dev で起動した状態で)
- `node scripts/e2e-catalog.mjs`:装備と編制(図鑑)を画面で通す確認(表紙 → 装備と編制 → ドイツ軍の線図 → 装備品の札 → 時期で絞る → 作戦命令の戦闘序列から線図。pnpm dev で起動した状態で)
- `node scripts/e2e-develop.mjs`:装備編成を画面で通す確認(武器を開発 → テンプレート → 差し替えて開始 → 1ターン。pnpm dev で起動した状態で)

## 現状
- 作成済み:`packages/sim-core`(シード付き乱数、幾何、向き判定、データのスキーマ検証、ユニット・命令・1ターンの解決[移動・隊形・陣地・姿勢・探知・条件付き命令・接敵による展開・直接射撃・阻止圏と突破判定(攻める相手への肉薄は150mまで判定なし。装甲の部隊に対しては阻止する側の対装甲の力で阻止の力を割り引く `breakthrough.antiArmor`)・包囲と投降(籠城の限界。投降しない陣営 `rules.noSurrender`)・兵科専用の姿勢(ルールパックの姿勢の `branches`。機甲の突撃隊形・歩兵の全周防御。正面幅・阻止圏の中の速さ・向きの倍率なし・包囲の士気・地図の形 `shape`)・携行備蓄の消費・補給路からの補給と集積所の奪取・士気の結果(動揺/潰走/立ち直り)・撃破・道路と地形からの経路の自動生成]、目標地点と勝利条件の判定(勝利点制:条件=目標の保持(ターンごとにたまる点も)・期限までの保持・敵の損耗・自軍の損耗・損耗比・護送 `unitReach`・撃破 `unitLoss`・突破 `exitShare`、段階=勝利点の下限と満たすべき条件。旧い書き方は読み込み時に読み替え `legacyVictory`。目標の保持の記録 `objectiveLog`。秘密の副目標=条件の `secret` と候補 `secretPool` から始めに引く `drawSecrets`、相手には `publicVictory`)、指揮ポイント、天候の推移、司令部コマンド(砲撃・空襲・空輸・制空任務・近接航空支援・補給線への攻撃・空挺降下・艦砲射撃・航空偵察・斥候)と航空戦(戦闘機・攻撃機の編隊と出撃枠、損耗の持ち越し、護衛、空域ごとの制空権と空戦、対空砲)、揚陸能力、夜間フェイズ(浸透移動・夜襲)と増援、複数日のシナリオ(夜の繰り返し・毎朝の回数のリセット・天候の予定・戦場からの離脱)、陣地は動かずにいた時間で築く、観測射撃、対砲兵戦(砲撃すると確率で位置を標定される・前のターンに撃たれた砲兵は砲撃を要請できず、砲撃中に撃たれると残りの砲撃をやめる `combat.counterBattery`)、部隊の練度(未熟・標準・古参・精鋭)、動く部隊は見つかりやすい、地形ごとの通行(徒歩・車両、川・大河・峻険な高地)、天候と移動(雨・雪と、ためていく地面の状態=ぬかるみ・積雪。道路以外の車両がいちばん遅くなる。`weather.ts` の `advanceGround`・`groundSpeedMultiplier`)、橋の破壊・修理(水を横切る道路の区間が橋。司令部コマンドの爆破・修理、空襲で落ちる。壊れた橋は道路網と補給路から外す `bridges.ts`)、高地の補正、見通し(LOS)、射線(間の部隊にふさがれた分だけ直接射撃が届かない)、疲労、武器と編成表からの火力の導出(編成表の要素は人員・装備品の実数でも書ける:武器パックの装備品の一覧 `equipment` から撃つ武器・耐久・装甲を出す `resolveElement`。耐久 = 人員 × `personnelHitPoints` + 車両の耐久。1丁・1両あたりの威力の物差しは `docs/research/equipment-calibration.md`・`tools/packs/equipment_common.py`)、貫通力と装甲厚(武器の距離帯の `penetrationMm` と編成表の要素の `armorMm`。どちらもあるときだけ 貫通力÷装甲 で効き目が決まる。砲塔・面の倍率は `combat.penetration`)、武器の性質(陣地に強い `entrenchmentPierce`、曲射 `arcing`)、護衛(歩兵と同じ部隊の装甲の部分は近くで受ける損害が減る `combat.escort`)、霧のフィルタ `viewForSide` / `replayForSide`、シナリオファイルの読み込み `buildScenario` と内容のハッシュ、装備編成 `development.ts`(点数 `weaponCost`/`toeCost`、武器の開発 `designWeapon`、連隊テンプレート `buildTemplate`、持ち込み `applyBundle`、おまかせ編成 `autoCompose` = `autocompose.ts`。方針は `development.autoStyles`)と部隊の差し替え `customizeScenario`、配属 `Attachment`(戦いの前に機甲・戦車駆逐の中隊を歩兵の部隊へ。ルールパックの `development.attachment`。配属した要素は `attachedFrom` を持ち、試合の情報の `attachments` で地図の記号の右上の小さな記号とユニットの欄の内訳・残りに出す)、上級部隊の木(シナリオの `formations`)、編成の選択 `presetScenario`(シナリオの `presets`)(シナリオの `customization`。ルールパックの `development` に式・上限・武器の型))
- データ:`data/rulepacks/ww1-korea.json`(時代ルール)、`data/branches/ww1-korea.json`(兵科。行軍速度は仮置き)、`data/weapons/ww1-korea-generic.json`・`data/toe/ww1-korea-generic.json`(史実ではない汎用の武器・編成。数値は仮置き)、`data/weapons/ww2-1944-us-de.json`・`data/toe/ww2-1944-us-de.json`(米独1944年の武器・編成。汎用に貫通力と装甲厚を足したもの。汎用の後ろに重ねて使う=シナリオの packs を配列に。根拠は `docs/research/weapons-1944-us-de.md`、作り直しは `tools/packs/build_ww2_1944_us_de.py`。シナリオの既定の編成には入れず、編成の選択「史実の編成」(シナリオの `presets.historical`。バストーニュ・クリンケルト・アラクール・カランタン。作り直しは各 build スクリプトと `tools/scenarios/common.py` の `historical_presets`)で選べる。アラクールでは独軍寄りになる。`docs/research/validation.md`)、`data/scenarios/test-symmetric.json`(左右対称の試験シナリオ。AIのバランス検出用)、`data/scenarios/decisive-battle.json`(決戦:同じ地図で、互いに敵の損耗率を勝利条件にしたもの)、`data/scenarios/attrition-vs-preservation.json`(同じ地図で、東軍は漸減・西軍は中央の町の保持と消耗抑制。東軍は機甲が1部隊多い)、`data/scenarios/bastogne-1944-12-19.json`(バストーニュ12月19日 v0・概略図。根拠と残りの裏取りは `docs/research/bastogne-1944-12-19.md`、作り直しは `tools/scenarios/build_bastogne_1944_12_19.py`)、`data/scenarios/bastogne-1944-12.json`(バストーニュ攻防戦 12月19〜26日の8日間 v0。既定のシナリオ。昼8ターン+夜1ターンの繰り返し、23日に晴れて空輸、増援・転用・26日の救援。根拠は `docs/research/bastogne-1944-12.md`、作り直しは `tools/scenarios/build_bastogne_1944_12.py`)。史実との比較と補正値の根拠は `docs/research/wwii-calibration.md`。`data/scenarios/ponyri-1943-07-07.json`(クルスク北部戦線・ポヌイリ 7月7〜9日 v0・概略図。両陣営に航空戦力があり、航空戦を楽しむためのもの。根拠は `docs/research/ponyri-1943-07.md`、作り直しは `tools/scenarios/build_ponyri_1943_07_07.py`)。`data/scenarios/nijmegen-1944-09-17.json`(マーケット・ガーデン作戦・ナイメーヘン 9月17〜20日 v0・概略図。空挺降下の地点を選び、グラーヴェ・運河・ワール川の橋を奪い合う。根拠は `docs/research/nijmegen-1944-09.md`、作り直しは `tools/scenarios/build_nijmegen_1944_09_17.py`)。`data/scenarios/inchon-1950-09-15.json`(仁川上陸 9月15〜17日 v0・概略図。揚陸能力のある部隊が海から上がる。干潟は揚陸能力のある部隊だけが遅く通れる海(潮の満ち引きは表さない簡略版)。根拠は `docs/research/inchon-1950-09.md`、作り直しは `tools/scenarios/build_inchon_1950_09_15.py`)。太平洋・マレー(1941〜45年)の武器・編成 `data/weapons/ww2-pacific.json`・`data/toe/ww2-pacific.json`(日本・英連邦・米海兵隊。汎用と米独1944年の後ろに重ねる。根拠は `docs/research/pacific-weapons-1941-45.md`、作り直しは `tools/packs/build_ww2_pacific.py`)と、それを使うシナリオ(v0・概略図。兵力・位置の多くは TODO(要裏取り))。国ごとの装備品と実数の編成表(人員・装備品で書く。1丁・1両あたりの武器と装備品の一覧):ドイツ軍 `data/weapons/de.json`・`data/toe/de.json`(1918年・1939〜41年・1944年の歩兵連隊、戦車大隊、突撃砲旅団、駆逐戦車大隊、装甲擲弾兵大隊、砲兵大隊。根拠は `docs/research/equipment-de.md`、作り直しは `tools/packs/build_de.py`。強さの確かめは `packages/sim-core/test/equipment-packs.test.ts`)。米軍 `data/weapons/us.json`・`data/toe/us.json`(1918年・1944〜45年・1950年の歩兵連隊、戦車大隊(M4・M4(76)・M26・M4A3E8)、戦車駆逐大隊(M10・M18・M36)、機甲歩兵大隊、野砲兵大隊(105mm・155mm)、騎兵偵察中隊。根拠は `docs/research/equipment-us.md`、作り直しは `tools/packs/build_us.py`)。ソ連軍 `data/weapons/su.json`・`data/toe/su.json`(1942〜43年・1944〜45年の狙撃兵連隊、戦車旅団(T-34・T-34-85)、親衛重戦車連隊(IS-2)、自走砲連隊(SU-76M・SU-85)、砲兵大隊(ZiS-3・M-30)。資料が薄く仮置きが多い。根拠は `docs/research/equipment-su.md`、作り直しは `tools/packs/build_su.py`)。英連邦軍 `data/weapons/uk.json`・`data/toe/uk.json`(1941年・1944年の歩兵大隊・旅団、機甲連隊(クロムウェル・ファイアフライ)、戦車連隊(チャーチル)、マチルダ II の大隊、対戦車連隊(17ポンド砲)、野砲連隊(25ポンド砲)。根拠は `docs/research/equipment-uk.md`、作り直しは `tools/packs/build_uk.py`)。日本陸軍 `data/weapons/jp.json`・`data/toe/jp.json`(1941〜42年・1944年の歩兵連隊、戦車連隊(九七式・新砲塔チハ)、独立速射砲大隊。根拠は `docs/research/equipment-jp.md`、作り直しは `tools/packs/build_jp.py`)。国ごとの build スクリプトは共通の `equipment_common.Pack` で書く。1942年の独ソ(東部戦線)の武器・編成 `data/weapons/ww2-1942-de-su.json`・`data/toe/ww2-1942-de-su.json`(III号・IV号 F2・III号突撃砲・T-34・KV-1・T-60/T-70・Pak 38・45mm・対戦車銃。汎用の後ろに重ねる。根拠は `docs/research/weapons-1942-de-su.md`、作り直しは `tools/packs/build_ww2_1942_de_su.py`。生成器の編成 `1942-ostfront`):`data/scenarios/slim-river-1942-01-07.json`(スリム川。島田戦車隊の突進。夜明けまでは暗い時間。AI 同士では日本軍が道路橋まで届かない)、`edson-ridge-1942-09-12.json`(エドソンの丘。2晩の夜襲を暗い時間 `darkTurns` で1時間ごとに解く)、`iwo-suribachi-1945-02-19.json`(硫黄島・摺鉢山。要塞化した山腹の地形、日本軍は投降しない `rules.noSurrender`)。作り直しは `tools/scenarios/build_slim_river_1942_01_07.py` ほか、根拠は `docs/research/slim-river-1942-01.md`・`edson-ridge-1942-09.md`・`iwo-suribachi-1945-02.md`、結果は `docs/research/validation.md`。設定値の妥当性を別の戦いで確かめる検証用シナリオ(v0・概略図):`data/scenarios/krinkelt-rocherath-1944-12-17.json`・`arracourt-1944-09-19.json`・`carentan-1944-06-12.json`(集計は `VALIDATE=1 npx vitest run packages/ai/test/validation.test.ts`、結果と原因は `docs/research/validation.md`)
- sim-core に未実装:司令部と隷下の階層、補給優先度、セルごとの細かい標高(今は地形の種類で決まる)
- 作成済み:`packages/ai`(効用ベースのAI `decide`。前線と翼の見積もり `frontLine`(回り込みに部隊を回して片翼包囲を防ぐ)、装甲の先鋒(攻める側の戦車は取った目標の守備を近くの歩兵に任せて次へ進む)、AI同士の対戦 `runMatch` / `runSeries`、偏りの判定 `imbalance`)
- 作成済み:`packages/generator`(自動生成マップ。シードから起伏・川・森・町・道路を作る `generateMap`。地形の傾向は `data/generators/biomes.json`=西欧の農村・冬のアルデンヌ・ステップ・ジャングル。サーバーの `GET /api/generate/biomes`・`/api/generate/map`。任務の生成 `generateScenario`:任務(遭遇戦・攻撃と防御・輸送の護衛・突破)・地形の傾向・大きさ・編成(汎用・1944年の米独)・シードから、兵力(名簿から引いて点数で釣り合わせる)・配置・目標(遭遇戦は両軍からの所要時間の差が小さい所)・勝利条件・秘密の副目標の候補まで作る。決まりは `data/generators/missions.json`。シナリオの ID `gen:任務:地形:大きさ:編成:シード` から同じ戦場を作り直す=サーバーの `generatedScenario`(記録・続きから・オンライン対戦は ID だけで済む)、`/api/generate/options`・`/api/generate/summary`。開始画面の「戦場を作る」 `Generate.tsx`。偶然の条件のカード(夜明けの攻撃・朝霧・雨・雪原・ぬかるみ・片方だけの航空支援・塹壕線・弾薬不足・遅れる部隊。1戦に0〜2枚、不利な側に1部隊の埋め合わせ。`missions.json` の `cards`))
- 作成中:`packages/campaign`(キャンペーン=作戦の層。地域を点と線でつないだ作戦地図 `data/campaigns/*.json`(スキーマ `CampaignDefSchema`)の上で師団・旅団を動かし、同じ地域に両陣営が入れば戦闘(もとからいた側が守る=攻撃と防御、両方が入れば遭遇戦)。戦闘は地域の地形の傾向で生成器が戦術シナリオを作り、部隊は戦力・士気・携行備蓄・練度を持ち越す `battleScenario`。指揮しない戦闘は戦術の AI 同士で解く `autoResolve`。結果の反映 `resolveStage`:勝った攻め手が地域を取り、負けた側は下がる(下がる先がなければ壊滅)、決定的に負けた側は追加の損害、勝った部隊は経験で練度が上がる、補給の源からつながる部隊は補充・回復。作戦の AI `campaignOrders`。勝敗は地域と損耗比の勝利点 `evaluateCampaign`。試験用 `data/campaigns/exercise-river.json`。進み具合 `CampaignSnapshot`(サーバーは持たず、画面が送る。命令の確定 `commitOrders`・指揮する戦闘の選択 `chooseBattle`(1段階に1つ)・その戦術シナリオ `playedScenario`・段階を進める `advanceSnapshot`・画面に出す様子 `campaignView`)。サーバーの口 `/api/campaigns`・`/api/campaign/*`(`packages/server/src/campaign.ts`。指揮した戦闘の結果は試合の記録を再生して出す)、画面 `Campaign.tsx`(作戦地図・命令・戦闘の選択・段階の結果・勝敗。ブラウザ保存 `campaignSaves.ts`)。自動生成のキャンペーン `generateCampaign`(ID `gencamp:大きさ:編成:シード`。列に並べた地域の真ん中を奪い合い、左右で鏡写し。決まりは `data/generators/campaigns.json`、サーバーの `findCampaign`・`/api/campaigns/options`、画面の「作戦を作る」)。増援 `arriveStage`。史実:マレー作戦 v0 `data/campaigns/malaya-1941.json`(根拠は `docs/research/malaya-1941-42.md`、作り直しは `tools/campaigns/build_malaya_1941.py`。戦術の戦闘は生成器の編成 `1941-malaya`)。青作戦の第1段階 v0 `data/campaigns/blau-1942.json`(根拠は `docs/research/blau-1942.md`、作り直しは `tools/campaigns/build_blau_1942.py`。部隊1つ≒1個師団)。バルバロッサ作戦は未作成)
- 作成済み:`packages/protocol`(サーバーとクライアントのメッセージの型と、クライアントから届く命令の検証)
- 作成済み:`packages/server`(人間1人 対 AI の試合 `Match`、オンライン対戦の部屋 `Room`(人間2人の同時入力、制限時間、切断から5分でAIが引き継ぎ、鍵で戻る、両陣営の装備編成 `customizeScenarioSides`、終わってから両陣営の記録 `OnlineRecord`。WebSocket の createRoom/joinRoom/rejoinRoom、`GET /api/room`)、WebSocket サーバー、data/ の読み込み(手引き `loadTutorials` も)、編成エディターの HTTP の口 `/api/packs`・`/api/save`)
- 作成済み:`packages/client`(Vite + React + Canvas。開始画面は作戦地図・軍の書類風(`.paper`)で、表紙 → 作戦の選択(史実の作戦・演習の一覧、地図の縮図 `MapThumb.tsx` と自軍の初期配置 `/api/scenario`、陣営ごとの勝利条件、編成の選択)→ 部隊編成(作戦命令 `Briefing.tsx`:状況=地図と自軍の初期配置・任務=勝利条件・戦闘序列=上級部隊の木と増援・空挺、装備編成のできるシナリオは差し替え・おまかせ・配属を埋め込み、出撃)・続きから(ファイルの読み込みも)・オンライン対戦・手引き。試合の後は結果の画面(戦闘詳報 `Result.tsx`:勝敗の判子、史実の結末との比べ=シナリオの `historicalOutcome`、目標の最終的な持ち主、両軍の損耗と推移のグラフ、自軍の部隊の損害、戦闘の経過)から、もう一度・陣営を替えて・作戦の選択へ・表紙へ、手引き(チュートリアル。`data/tutorials/*.json` に段ごとの説明・光らせる部品・地図の印・次へ進む条件を書く。サーバーが参照まで検証して `/api/tutorials` で配り、地図の上の札で案内する。今は `bastogne-basics` = バストーニュ12月19日の1ターン目で基本の操作)、セーブ(試合の記録 `GameRecord` = シナリオ・陣営・シード・毎ターンの命令。ターンごとにブラウザへ自動保存、ファイルへの書き出し。サーバーが記録を再生して続きから再開 `Match.resume`)、マップ表示・命令入力(移動モードは隊形のボタン「縦隊」「展開」で選ぶ。目的地だけなら今の隊形のまま動く)・司令部コマンド・再生・出来事の記録・勝敗。効いている補正と戦況の表示(ユニットの火力・受ける損害の倍率と内訳の札、ゲージの変化、撃ち合い・砲爆撃・制空の結果、損耗の推移、地図の撃ち合いの優劣の線)。ユニットは NATO 式の兵科記号(`symbols.ts`。自軍=長方形・敵=菱形・正体不明=四つ葉の枠、兵科の印は兵科パックの `symbol`、規模と重ねる印=空挺・機械化・装甲・水陸両用は編成表の `symbol`。縦隊は小さく連なり、展開中は点線。縮図・戦闘序列・ユニットの欄にも `SymbolIcon.tsx`)。演出(`flavor.ts`。地図の「演出」で切り替え、ルールには関わらない):再生中の航空機(空襲・近接支援・補給線攻撃の攻撃機、制空任務と空戦の戦闘機・撃墜、航空偵察、空挺降下・空輸の輸送機と落下傘、対空砲火)、着弾の煙、発砲の閃光、燃える残骸、雨・雪・霧・曇り、地面の積雪・ぬかるみ、夜と暗い時間の暗さ(発砲・着弾・照明弾で明るく抜ける)。試しに入れた表示:砲撃・空襲の着弾と照準の印、交戦中の線、再生中の曳光・被弾・出来事の文字、ゲージの棒と状態の札、選んだユニットの阻止圏と射程、凡例、自軍の補給路と集積所。経路の見積もり(移動の下書きを出すと、サーバーが実際と同じ経路・速さで計算した道筋・このターンに進む所・ターンごとの到達点・到着時刻・止まりそうな所[知っている敵の阻止圏・川・燃料切れ]を地図とユニットの欄に出す。sim-core の `previewMove` / `zoneWarnings`)。地図の操作:ホイール/2本指・右/中ドラッグ・矢印キー/WASD でスクロール、Ctrl+ホイール/ピンチ・+/- キー・ボタンで拡大縮小。細部は後で詰める)
- 作成済み:装備編成の画面(`packages/client/develop.html`。武器の開発=型と値のスライダー・性能と点数、連隊テンプレート=元の編成表の要素を組み直す・元との比較。ブラウザ保存 `custom.ts`、書き出し・読み込み。開始画面の差し替えと点数・おまかせ編成の方針・AIの陣営のおまかせ `CustomStart.tsx`、部隊の階層と配属 `Attach.tsx`。サーバーは `GET /api/development`、join の `custom`・`aiAuto`・`preset`、記録の `custom`・`aiAuto`・`preset`。開始画面のシナリオの札で編成の選択)
- 作成済み:装備と編制(図鑑)の画面(表紙の「装備と編制」 `Catalog.tsx`:国・時期で絞り、編成表の線図 `OrgChart.tsx`=部隊 → 所属(本部・大隊×数・直轄)→ 中隊の箱、人員と主な装備の数、主要装備の合計。装備品の札 `EquipmentCard.tsx`=種類の絵 `EquipmentIcon.tsx`・国と年・諸元・武装の射程と貫通力・装甲の図・使っている編成。作戦命令の戦闘序列と試合のユニットの欄から線図を開く `OrgModal`。サーバーの `GET /api/catalog` `catalog.ts`)
- 作成済み:編成エディター(`packages/client/editor.html`。編成表と武器の編集、導出値 `toeSummary` と比較、誤りの表示 `checkToe`/`checkWeapon`、検証つきの保存)
- 作成済み:オンライン対戦の画面(開始画面の「オンライン対戦」で部屋を作る・合言葉で入る・部屋に戻る `Online.tsx`、待合、上の帯に相手の様子と残り時間)
- 未作成:兵科・ルールパック・シナリオのエディター、オンライン対戦のインターネット公開
