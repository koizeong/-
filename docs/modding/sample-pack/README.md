# 見本のパック

シナリオパックの作り方の見本(`docs/modding.md`)。遊ぶときは、このフォルダを `mods/` の下に写してください。

- `pack.json`:名札
- `toe/sample-toe.json`:汎用の歩兵大隊の小銃中隊を4個にした「軽歩兵大隊(見本)」
- `scenarios/sample-river.json`:川を渡って東岸の丘を取りに行く、架空の小さな戦い(6km × 4km・10ターン)。西軍の第1大隊が上の編成表を使う

確かめ:`pnpm pack:check docs/modding/sample-pack --ai 10`(AI 同士で西軍 60%・東軍 40% ほど)
