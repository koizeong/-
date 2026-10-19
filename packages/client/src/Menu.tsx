import type { ScenarioSummary, Tutorial } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { CustomStartPanel } from "./CustomStart.js";
import type { Game } from "./game.js";
import { listSaves, looksLikeRecord, removeSave, type SaveEntry } from "./saves.js";

/** 勝利条件を短い文に(必須の目標・目標の重み・損耗率) */
function victoryText(v: ScenarioSummary["victory"][string]["decisive"], objectives: ScenarioSummary["objectives"]): string {
  const name = (id: string) => objectives.find((o) => o.id === id)?.name ?? id;
  const parts: string[] = [];
  if (v.required.length) parts.push(`${v.required.map(name).join("・")}を保持`);
  if (v.minWeight > 0) parts.push(`目標の重み ${v.minWeight} 以上`);
  if (v.minEnemyLoss !== undefined) parts.push(`敵の損耗 ${Math.round(v.minEnemyLoss * 100)}%以上`);
  if (v.maxOwnLoss !== undefined) parts.push(`自軍の損耗 ${Math.round(v.maxOwnLoss * 100)}%以下`);
  return parts.join("、") || "—";
}

/** 開始画面:続きから・ファイルから読み込む・シナリオと陣営を選んで始める */
export function Menu({ game }: { game: Game }) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState<SaveEntry[]>(() => listSaves());
  const [seed, setSeed] = useState("");
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  /** 装備編成して始める(シナリオと陣営) */
  const [custom, setCustom] = useState<{ scenario: ScenarioSummary; side: string } | null>(null);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json() as Promise<ScenarioSummary[]>)
      .then((list) => setScenarios(list.sort((a, b) => a.name.localeCompare(b.name, "ja"))))
      .catch(() => setError("シナリオの一覧を読み込めませんでした(サーバーは pnpm dev で起動します)"));
    fetch("/api/tutorials")
      .then((r) => r.json() as Promise<Tutorial[]>)
      .then(setTutorials)
      .catch(() => setTutorials([]));
  }, []);

  const loadFile = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then((t) => {
        const r = JSON.parse(t) as unknown;
        if (!looksLikeRecord(r)) throw new Error();
        game.start({ resume: r });
      })
      .catch(() => setError("試合の記録として読めないファイルです"));
  };

  return (
    <div className="menu">
      <header className="menu-head">
        <h1>旅団戦術シミュレーション</h1>
        <a href="/develop.html">装備編成(武器の開発・連隊テンプレート)</a>
        <a href="/editor.html">編成エディター</a>
      </header>
      {(error ?? game.s.error) && <p className="note">{error ?? game.s.error}</p>}

      {tutorials.length > 0 && (
        <section>
          <h2>はじめての方へ</h2>
          <div className="tutorials">
            {tutorials.map((t) => (
              <div key={t.id} className="card">
                <h3>{t.name}</h3>
                {t.description && <p>{t.description}</p>}
                <button className="primary" data-testid={`tutorial-${t.id}`} onClick={() => game.start({ scenarioId: t.scenarioId, side: t.side, seed: t.seed }, t)}>
                  手引きつきで始める
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>続きから</h2>
        {saves.length === 0 && <p className="muted">保存された試合はまだありません。ターンを進めるたびに自動で保存されます。</p>}
        <ul className="saves">
          {saves.map((e) => (
            <li key={e.key}>
              <div>
                <b>{e.scenarioName}</b>・{e.sideName}
                <span className="muted">
                  {" "}
                  {e.finished ? "終了" : `ターン ${Math.min(e.turn, e.maxTurns)} / ${e.maxTurns}`}・{new Date(e.savedAt).toLocaleString("ja-JP")}
                </span>
              </div>
              <div className="row">
                <button className="primary" onClick={() => game.start({ resume: e.record })} data-testid={`resume-${e.key}`}>
                  {e.finished ? "結果を見る" : "続ける"}
                </button>
                <button
                  onClick={() => {
                    if (!confirm("この試合の記録を消しますか?")) return;
                    removeSave(e.key);
                    setSaves(listSaves());
                  }}
                >
                  消す
                </button>
              </div>
            </li>
          ))}
        </ul>
        <label className="file">
          ファイルから読み込む:
          <input type="file" accept=".json,application/json" onChange={(ev) => loadFile(ev.target.files?.[0])} />
        </label>
      </section>

      {custom && (
        <CustomStartPanel
          scenario={custom.scenario}
          side={custom.side}
          onClose={() => setCustom(null)}
          onStart={(c) => game.start({ scenarioId: custom.scenario.id, side: custom.side, ...(seed ? { seed: Number(seed) } : {}), custom: c })}
        />
      )}

      <section>
        <h2>新しく始める</h2>
        <label className="seed">
          シード(空欄ならおまかせ。同じシード・同じ命令なら同じ展開になる):
          <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
        </label>
        {!scenarios && !error && <p className="muted">読み込んでいます…</p>}
        <div className="cards">
          {scenarios?.map((sc) => (
            <article key={sc.id} className="card" data-testid={`scenario-${sc.id}`}>
              <h3>{sc.name}</h3>
              <p className="muted">
                {sc.startDate ? `${sc.startDate} から ` : ""}
                {sc.days}日間・{sc.maxTurns}ターン
              </p>
              {sc.description && <p>{sc.description}</p>}
              <table className="victory">
                <tbody>
                  {sc.sides.map((side) => {
                    const v = sc.victory[side.id];
                    return (
                      <tr key={side.id}>
                        <th>
                          {side.name}
                          <small className="muted">({side.units}部隊)</small>
                        </th>
                        <td>
                          {v ? (
                            <>
                              <div>決定的勝利:{victoryText(v.decisive, sc.objectives)}</div>
                              <div>限定的勝利:{victoryText(v.limited, sc.objectives)}</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            className="primary"
                            data-testid={`play-${sc.id}-${side.id}`}
                            onClick={() => game.start({ scenarioId: sc.id, side: side.id, ...(seed ? { seed: Number(seed) } : {}) })}
                          >
                            {side.name}で遊ぶ
                          </button>
                          {sc.customizableSides.includes(side.id) && (
                            <button data-testid={`custom-${sc.id}-${side.id}`} onClick={() => setCustom({ scenario: sc, side: side.id })}>
                              装備編成して始める
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
