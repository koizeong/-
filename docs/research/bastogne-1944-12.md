# バストーニュ攻防戦 1944年12月19〜26日 研究メモ(8日間版 v0)

- シナリオ:`data/scenarios/bastogne-1944-12.json`
- 作り直し:`python3 tools/scenarios/build_bastogne_1944_12.py`
- 地図・目標・19日朝の部隊は1日版と同じ。根拠は `docs/research/bastogne-1944-12-19.md`。

ここに書くのは、8日間に起きた出来事(天候・増援・転用・空輸・救援)の根拠と、残っている裏取り。

## 資料の状況

1日版と同じく、使えたのは Web 検索の要約(二次資料)だけで、一次資料での裏取りはしていない。

一次資料の候補:
- Cole『The Ardennes: Battle of the Bulge』第19・20・23章
- Marshall『Bastogne: The First Eight Days』
- Rapport & Northwood『Rendezvous with Destiny』

## 時間

- 昼は 08:30〜16:30 の16ターン(30分ずつ)、夜は 16:30〜翌08:30 の16時間を1ターン。1日 = 17ターン
- 19日の朝(1ターン目)から26日の 16:30(135ターン目)まで
- 救援部隊が包囲の中と連絡したのは26日の16時50分ごろ
- TODO(要裏取り):12月のバストーニュの日の出・日の入りと、当時の時刻帯(連合軍と独軍で時刻帯が違う)

## 天候

- 19〜22日:霧と曇りで、連合軍の航空は飛べない(ゲームでも航空は使えない)
- 23日:晴れて空輸と対地攻撃が始まった(23日の朝から「晴れ」に固定)
- 出典
  - Mildenhall AFB『A look at air power in the Battle of the Bulge』https://www.mildenhall.af.mil/News/Article-Display/Article/272453/a-look-at-air-power-in-the-battle-of-the-bulge/
  - army.mil『Air Borne to the Airborne』https://www.army.mil/article/6753/air_borne_to_the_airborne
- TODO(要裏取り):日ごとの細かい天候。24〜26日が晴れ続きだったか

## 空輸と航空支援(米軍)

- 23日の空輸:C-47 260機で334トン
- 23〜27日の合計:850トンまたは1,200トン(資料により違う)
- ゲームでの空輸:1日4回 × 弾薬80トン・燃料5トン(仮置き)
- 対地攻撃:晴れてからの5日間で第9空軍は8,608出撃(アルデンヌ全体)
  - バストーニュ周辺に回った分は TODO(要裏取り)
  - ゲームでは空襲4回・制空任務4回・航空偵察2回(1日、仮置き)
- 独軍の航空:24日夜にバストーニュの町を爆撃したとされるが、ゲームには入れていない(TODO)

## 増援と転用(日時・位置・編成は TODO(要裏取り))

| 部隊 | ゲームでの扱い | 根拠 |
|---|---|---|
| 独 第26国民擲弾兵師団 第39・第78擲弾兵連隊 | 20日の朝に東の端から増援 | 師団は3個連隊(39・77・78)。1日版は第77だけ。到着の日時と方向は未確認 |
| 独 第2装甲師団(2部隊) | 21日の朝に転用で離脱 | ノヴィルを取った後、北を回ってマース川方面へ(20〜21日) |
| 独 教導戦車師団の戦車連隊 | 22日の朝に転用で離脱 | 第902連隊を残して西(サン=チュベール方面)へ(21〜22日) |
| 独 第15装甲擲弾兵師団 マウケ戦闘団(第115装甲擲弾兵連隊と戦車約18両) | 24日の夜に北西の端から増援 | 25日05時30分にシャン・エムルールを攻撃。戦線が背後で閉じて戦車はほぼ全滅(historynet『Close Call Near Bastogne』 https://historynet.com/close-call-near-bastogne/ ) |
| 米 第4機甲師団 R戦闘団 | 26日の朝に南の端から増援 | アスノワを抜け、16時50分ごろ包囲の中と連絡(Europe Remembers『Breakthrough at Assenois』 https://www.europeremembers.com/pois/1153/breakthrough-at-assenois-and-fortress-boggess ) |

## 補給

- 包囲の中では、23日までに弾薬がほぼ尽き、残りは戦車への対処用に取っておかれた
- 砲兵は、歩兵から直接の要請があったときだけ撃つよう制限された
- 出典:https://eucmh.com/2022/09/27/101st-airborne-division-defense-of-bastogne-mitchell/2/
- ゲームでの補給:集積所の量は1日版と同じ仮置き
- TODO(要裏取り):包囲の前後の弾薬量、砲1門あたりの1日の制限発数

## ゲームの設計として置いたもの(史実ではない)

- 勝利条件・指揮ポイント:1日版と同じ
  - 米軍:バストーニュ市街 + 周辺の町の重みの保持で限定的勝利
  - 独軍:市街の確保で決定的勝利
- 汎用編成:史実のTO&Eではない
