import type { ScenarioDetail, ScenarioSummary, Tutorial } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { Briefing } from "./Briefing.js";
import { Generate } from "./Generate.js";
import { CampaignSection } from "./Campaign.js";
import type { Game, MenuScreen } from "./game.js";
import { MapThumb } from "./MapThumb.js";
import { SIDE_COLORS } from "./MapView.js";
import { OnlineSection } from "./Online.js";
import { listSaves, looksLikeRecord, removeSave, type SaveEntry } from "./saves.js";
import { tierText } from "./victory.js";

/** 勝利条件を短い文に(必須の目標・目標の重み・損耗率) */
/**
 * 開始画面:タイトルから、シナリオ選択・続きから・オンライン対戦・手引きの各画面へ。
 * どの画面から始めるかは game.s.menuScreen(試合を終えて「シナリオ選択へ」で戻るときなど)
 */
export function Menu({ game }: { game: Game }) {
  const [screen, setScreen] = useState<MenuScreen>(game.s.menuScreen);
  const [scenarios, setScenarios] = useState<ScenarioSummary[] | null>(null);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saves, setSaves] = useState<SaveEntry[]>(() => listSaves());

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json() as Promise<ScenarioSummary[]>)
      .then((list) => setScenarios(list.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "") || a.name.localeCompare(b.name, "ja"))))
      .catch(() => setError("シナリオの一覧を読み込めませんでした(サーバーは pnpm dev で起動します)"));
    fetch("/api/tutorials")
      .then((r) => r.json() as Promise<Tutorial[]>)
      .then(setTutorials)
      .catch(() => setTutorials([]));
  }, []);

  const message = error ?? game.s.error;
  const back = (
    <button className="back" onClick={() => setScreen("title")} data-testid="menu-back">
      ← 表紙へ
    </button>
  );

  if (screen === "title") {
    return (
      <div className="paper title-screen">
        <div className="title-sheet">
          <div className="classified">作戦文書</div>
          <h1>旅団戦術シミュレーション</h1>
          <p className="subtitle">第一次世界大戦 〜 朝鮮戦争 ・ 連隊規模の同時進行型作戦</p>
          {message && <p className="note">{message}</p>}
          <nav className="title-menu">
            <button className="primary" onClick={() => setScreen("scenarios")} data-testid="title-new">
              新しく始める
            </button>
            <button onClick={() => setScreen("generate")} data-testid="title-generate">
              戦場を作る(自動生成)
            </button>
            <button onClick={() => setScreen("campaign")} data-testid="title-campaign">
              キャンペーン(作戦)
            </button>
            <button onClick={() => setScreen("continue")} data-testid="title-continue" disabled={saves.length === 0}>
              続きから{saves.length > 0 ? `(${saves.length})` : ""}
            </button>
            <button onClick={() => setScreen("online")} data-testid="title-online">
              オンライン対戦
            </button>
            {tutorials.length > 0 && (
              <button onClick={() => setScreen("tutorials")} data-testid="title-tutorial">
                手引き(はじめての方へ)
              </button>
            )}
            <a className="button" href="/develop.html">
              装備編成(武器の開発・連隊テンプレート)
            </a>
          </nav>
          <p className="colophon">
            <a href="/editor.html">編成エディター</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="paper menu">
      <header className="menu-head">
        {back}
        <h1>{{ scenarios: "作戦の選択", generate: "戦場を作る", campaign: "キャンペーン", continue: "続きから", online: "オンライン対戦", tutorials: "手引き" }[screen]}</h1>
      </header>
      {message && <p className="note">{message}</p>}
      {screen === "scenarios" && (scenarios ? <ScenarioSelect game={game} scenarios={scenarios} /> : !error && <p className="muted">読み込んでいます…</p>)}
      {screen === "generate" && <Generate game={game} />}
      {screen === "campaign" && <CampaignSection game={game} />}
      {screen === "continue" && <Continue game={game} saves={saves} onChange={() => setSaves(listSaves())} onError={setError} />}
      {screen === "online" && scenarios && <OnlineSection game={game} scenarios={scenarios} seed="" />}
      {screen === "tutorials" && (
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
      )}
    </div>
  );
}

/** 続きから:自動で保存した試合と、ファイルから読み込む */
function Continue({ game, saves, onChange, onError }: { game: Game; saves: SaveEntry[]; onChange: () => void; onError: (m: string) => void }) {
  const loadFile = (file: File | undefined) => {
    if (!file) return;
    file
      .text()
      .then((t) => {
        const r = JSON.parse(t) as unknown;
        if (!looksLikeRecord(r)) throw new Error();
        game.start({ resume: r });
      })
      .catch(() => onError("試合の記録として読めないファイルです"));
  };
  return (
    <section>
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
                  onChange();
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
  );
}

/**
 * 作戦の選択:左にシナリオの一覧、右に選んだシナリオの詳細(地図の縮図・説明・陣営ごとの勝利条件)。
 * 陣営を選ぶと、その陣営の初期配置を地図に出す。「この陣営で」で部隊編成(作戦命令)の画面へ進む
 */
function ScenarioSelect({ game, scenarios }: { game: Game; scenarios: ScenarioSummary[] }) {
  const [selectedId, setSelectedId] = useState((scenarios.find((x) => x.startDate) ?? scenarios[0])?.id ?? "");
  const sc = scenarios.find((x) => x.id === selectedId) ?? scenarios[0];
  const [sideId, setSideId] = useState<string>("");
  const side = sc?.sides.find((x) => x.id === sideId) ?? sc?.sides[0];
  /** シナリオごとの編成の選択(空は汎用の編成) */
  const [presets, setPresets] = useState<Record<string, string>>({});
  const preset = sc ? (presets[sc.id] ?? "") : "";
  const [seed, setSeed] = useState("");
  const [detail, setDetail] = useState<ScenarioDetail | null>(null);
  /** 部隊編成(作戦命令)の画面に進んだ陣営 */
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (!sc || !side) return;
    let live = true;
    setDetail(null);
    const q = new URLSearchParams({ id: sc.id, side: side.id, ...(preset ? { preset } : {}) });
    fetch(`/api/scenario?${q.toString()}`)
      .then((r) => r.json() as Promise<ScenarioDetail>)
      .then((d) => live && "map" in d && setDetail(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sc?.id, side?.id, preset]);

  if (!sc || !side) return null;
  if (chosen) return <Briefing game={game} scenario={sc} side={chosen} preset={preset} seed={seed} onBack={() => setChosen(null)} />;
  const sideIndex = sc.sides.findIndex((x) => x.id === side.id);

  return (
    <div className="select">
      <div className="scenario-lists">
        {[
          { title: "史実の作戦", list: scenarios.filter((x) => x.startDate) },
          { title: "演習(架空)", list: scenarios.filter((x) => !x.startDate) },
        ]
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <div key={g.title}>
              <h4 className="list-title">{g.title}</h4>
              <ol className="scenario-list">
                {g.list.map((x) => (
                  <li key={x.id}>
                    <button
                      className={x.id === sc.id ? "on" : ""}
                      onClick={() => {
                        setSelectedId(x.id);
                        setSideId("");
                      }}
                      data-testid={`scenario-${x.id}`}
                    >
                      {x.startDate && <span className="date">{x.startDate}</span>}
                      <span className="name">{x.name}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
      </div>

      <article className="dossier">
        <h2>{sc.name}</h2>
        <p className="muted">
          {sc.startDate ? `${sc.startDate} から ` : ""}
          {sc.days}日間・{sc.maxTurns}ターン
        </p>
        <div className="thumb-wrap">{detail ? <MapThumb detail={detail} color={SIDE_COLORS[sideIndex] ?? "#333"} /> : <div className="thumb-placeholder">地図を広げています…</div>}</div>
        {detail && (
          <p className="muted legend-line">
            <span className="swatch" style={{ background: SIDE_COLORS[sideIndex] }} /> {side.name}の初期配置 <span className="swatch hollow" style={{ borderColor: SIDE_COLORS[sideIndex] }} /> 増援{" "}
            <span className="swatch objective" /> 目標(敵の配置は分かっていない)
          </p>
        )}
        {sc.description && <p className="brief">{sc.description}</p>}

        <h3>陣営</h3>
        <table className="victory sides">
          <tbody>
            {sc.sides.map((x, i) => {
              const v = sc.victory[x.id];
              return (
                <tr key={x.id} className={x.id === side.id ? "chosen" : ""} onClick={() => setSideId(x.id)} data-testid={`side-${sc.id}-${x.id}`}>
                  <th>
                    <span className="swatch" style={{ background: SIDE_COLORS[i] }} /> {x.name}
                    <small className="muted">({x.units}部隊)</small>
                  </th>
                  <td>
                    {v ? (
                      <>
                        <div>決定的勝利:{tierText(v, v.decisive, sc.objectives)}</div>
                        <div>限定的勝利:{tierText(v, v.limited, sc.objectives)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="actions">
                    <button
                      className="primary"
                      data-testid={`play-${sc.id}-${x.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSideId(x.id);
                        setChosen(x.id);
                      }}
                    >
                      この陣営で
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="options">
          {sc.presets.length > 0 && (
            <label className="preset" title={sc.presets.find((p) => p.id === preset)?.description ?? "汎用の編成(史実ではない仮置きの武器・編成表)"}>
              編成:
              <select value={preset} onChange={(e) => setPresets((p) => ({ ...p, [sc.id]: e.target.value }))} data-testid={`preset-${sc.id}`}>
                <option value="">汎用の編成</option>
                {sc.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details>
            <summary>詳しい設定</summary>
            <label className="seed">
              シード(空欄ならおまかせ。同じシード・同じ命令なら同じ展開になる):
              <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
            </label>
          </details>
        </div>

      </article>
    </div>
  );
}
