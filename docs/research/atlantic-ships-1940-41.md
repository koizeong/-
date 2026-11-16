# 大西洋・北海 1940〜41年の艦級と航空隊(v0)

ヴェーザー演習作戦(1940年4〜6月、ノルウェー)とデンマーク海峡海戦(1941年5月24日)のための艦級・航空隊のパック。
作り直しは `tools/packs/build_atlantic_ships_1941.py`・`tools/packs/build_atlantic_air_1941.py`。
太平洋1942年のパック(英の 14in・15in・8in・6in・4.7in・4in の砲と 21in 魚雷、KGV 級・レナウン級)の後ろに重ねて使う。

## 値の確かさ

| 項目 | 確かさ |
|---|---|
| 基準排水量・最大速力・主砲の口径と門数・砲塔の配置・発射管の数 | 一般に知られた値の概数(艦級の頁・概説書の要約) |
| 装甲の厚さ(舷側・甲板・砲塔) | 代表の値の概数。甲板は主甲板と装甲甲板を足した概数 |
| 砲の弾の重さ・最大射程 | 一般に知られた値 |
| 発射の速さ・距離ごとの貫通・弾数 | ゲームの物差しによる仮置き |
| 電探の距離・射撃用の電探の効き | 仮置き |
| 航空機の巡航の速さ・爆弾の重さ | 一般に知られた値の概数 |
| 行動半径・1機の耐久・命中の倍率・攻撃力 | ゲームの物差し(ミッドウェー・陸上機1941年のパック)による仮置き |

TODO(要裏取り):出典候補
- Garzke & Dulin『Battleship Bismarck: A Design and Operational History』
- Whitley『German Capital Ships of World War Two』『German Cruisers of World War Two』『Destroyers of World War Two』
- Raven & Roberts『British Battleships of World War Two』、Roberts『The Battlecruiser Hood』
- NavWeaps の各砲(38cm SK C/34・28cm SK C/34・C/28・20.3cm SK C/34・15in Mk I・16in Mk I)と G7a 魚雷の頁
- Haarr『The German Invasion of Norway』『The Battle for Norway』(ノルウェーの海防戦艦、ナルヴィクの海戦)
- Shores ほか『Fledgling Eagles』、Green『Warplanes of the Third Reich』、Thetford『British Naval Aircraft since 1912』

## ゲームの上の決めごと

- ドイツの G7a 魚雷の、当たって爆発する割合は 0.5。1940年のノルウェー沖の「魚雷の危機」(深度の狂い・磁気信管の不具合)を表す仮置き。1941年の値は未定
- ドイッチュラント級装甲艦は重巡の艦種として扱う(地図の印は CA)
- ノルウェーの海防戦艦は戦艦の艦種に入れ、地図の印だけ CD にする。射撃指揮の倍率 0.6(1900年ごろの旧式)は仮置き
- ネルソン級の主砲はすべて艦橋の前にあり、艦尾へは撃てない
- フッドは甲板の装甲が薄く、遠い砲戦で落ちてくる弾に弱い(期待挙動のテスト `packages/sim-core/test/atlantic-packs.test.ts`)
- ウォースパイトの副砲は 6in/45 だが 6in/50 で、アーク・ロイヤルの 4.5in 高角砲は 4.7in/45 で代えた
