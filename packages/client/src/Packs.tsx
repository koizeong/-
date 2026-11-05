import type { ModPackInfo, ScenarioSummary } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { desktop } from "./desktop.js";

/**
 * シナリオパック:mods のフォルダから読み込んだパックの一覧(名前・版・作者・中身・誤り)。
 * 誤りのあるパックは丸ごと読み込まない(サーバーの mods.ts)。デスクトップ版ではフォルダを開いて、起動し直せる
 */
export function PacksScreen({ scenarios }: { scenarios: ScenarioSummary[] | null }) {
  const [packs, setPacks] = useState<ModPackInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mods")
      .then((r) => r.json() as Promise<ModPackInfo[]>)
      .then(setPacks)
      .catch(() => setError("パックの一覧を読み込めませんでした"));
  }, []);

  const nameOf = (id: string) => scenarios?.find((s) => s.id === id)?.name ?? id;

  return (
    <section className="packs">
      <p className="muted">
        シナリオパックは、シナリオ・キャンペーン・手引き・武器と編成表をまとめたフォルダです。mods のフォルダに置いて起動し直すと読み込みます。
        作り方は docs/modding.md にあります。
      </p>
      {desktop && (
        <div className="row">
          <button onClick={() => desktop!.openModsFolder().then(setFolder)} data-testid="packs-open">
            パックのフォルダを開く
          </button>
          <button onClick={() => desktop!.restart()} data-testid="packs-restart">
            起動し直す(読み込み直す)
          </button>
          {folder && <span className="muted">{folder}</span>}
        </div>
      )}
      {error && <p className="note">{error}</p>}
      {packs && packs.length === 0 && <p className="muted">読み込んだパックはありません。</p>}
      <ul className="pack-list">
        {packs?.map((p) => (
          <li key={p.folder} className={`card${p.ok ? "" : " broken"}`} data-testid={`pack-${p.id}`}>
            <h3>
              {p.name} <small className="muted">版 {p.version}</small>
              {!p.ok && <span className="stamp-small">読み込めません</span>}
            </h3>
            <p className="muted">
              {p.author ? `作者:${p.author}・` : ""}フォルダ:{p.folder}
            </p>
            {p.description && <p>{p.description}</p>}
            {p.ok && (
              <ul className="pack-contents">
                {p.scenarios.length > 0 && <li>シナリオ {p.scenarios.length}:{p.scenarios.map(nameOf).join("・")}</li>}
                {p.campaigns.length > 0 && <li>キャンペーン {p.campaigns.length}:{p.campaigns.join("・")}</li>}
                {p.tutorials.length > 0 && <li>手引き {p.tutorials.length}</li>}
              </ul>
            )}
            {p.errors.length > 0 && (
              <details open={!p.ok}>
                <summary>{p.ok ? "知らせ" : "誤り"}({p.errors.length})</summary>
                <ul className="pack-errors">
                  {p.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
