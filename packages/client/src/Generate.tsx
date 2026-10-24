import type { ScenarioDetail, ScenarioSummary } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { Briefing } from "./Briefing.js";
import type { Game } from "./game.js";
import { MapThumb } from "./MapThumb.js";
import { SIDE_COLORS } from "./MapView.js";
import { tierText } from "./victory.js";

type Option = { id: string; name: string; description?: string };
type Options = { missions: Option[]; eras: Option[]; sizes: (Option & { widthM: number; heightM: number })[]; biomes: Option[] };

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

/**
 * 戦場を作る(自動生成):任務・地形の傾向・地図の大きさ・編成・シードを選んで戦場を作り、陣営を選んで作戦命令へ進む。
 * 作った戦場は ID(gen:…)で表され、サーバーが同じ ID から同じ戦場を作り直す(続きから・オンライン対戦もそのまま使える)
 */
export function Generate({ game }: { game: Game }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [mission, setMission] = useState("encounter");
  const [biome, setBiome] = useState("western-farmland");
  const [size, setSize] = useState("m");
  const [era, setEra] = useState("generic");
  const [seed, setSeed] = useState(randomSeed);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [sideId, setSideId] = useState("");
  const [detail, setDetail] = useState<ScenarioDetail | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = `gen:${mission}:${biome}:${size}:${era}:${seed}`;

  useEffect(() => {
    fetch("/api/generate/options")
      .then((r) => r.json() as Promise<Options>)
      .then(setOpts)
      .catch(() => setError("サーバーにつながりません"));
  }, []);

  useEffect(() => {
    let live = true;
    setSummary(null);
    fetch(`/api/generate/summary?id=${encodeURIComponent(id)}`)
      .then((r) => r.json() as Promise<ScenarioSummary & { error?: string }>)
      .then((s) => {
        if (!live) return;
        if (s.error) setError(s.error);
        else {
          setError(null);
          setSummary(s);
        }
      })
      .catch(() => live && setError("戦場を作れませんでした"));
    return () => {
      live = false;
    };
  }, [id]);

  const side = summary?.sides.find((x) => x.id === sideId) ?? summary?.sides[0];
  useEffect(() => {
    if (!summary || !side) return;
    let live = true;
    setDetail(null);
    fetch(`/api/scenario?${new URLSearchParams({ id: summary.id, side: side.id }).toString()}`)
      .then((r) => r.json() as Promise<ScenarioDetail>)
      .then((d) => live && "map" in d && setDetail(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [summary?.id, side?.id]);

  if (chosen && summary) return <Briefing game={game} scenario={summary} side={chosen} preset="" seed="" onBack={() => setChosen(null)} />;
  const sel = (label: string, value: string, set: (v: string) => void, list: Option[] | undefined, testid: string) => (
    <label>
      {label}{" "}
      <select value={value} onChange={(e) => set(e.target.value)} data-testid={testid}>
        {(list ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  const sideIndex = summary && side ? summary.sides.findIndex((x) => x.id === side.id) : 0;

  return (
    <div className="generate">
      <div className="gen-controls">
        {sel("任務", mission, setMission, opts?.missions, "gen-mission")}
        {sel("地形", biome, setBiome, opts?.biomes, "gen-biome")}
        {sel("大きさ", size, setSize, opts?.sizes.map((z) => ({ ...z, name: `${z.name}(${z.widthM / 1000}×${z.heightM / 1000}km)` })), "gen-size")}
        {sel("編成", era, setEra, opts?.eras, "gen-era")}
        <label>
          シード <input value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} inputMode="numeric" style={{ width: 90 }} data-testid="gen-seed" />
        </label>
        <button onClick={() => setSeed(randomSeed())} data-testid="gen-reroll">
          作り直す
        </button>
      </div>
      <p className="muted">{opts?.missions.find((m) => m.id === mission)?.description}</p>
      {error && <p className="error">{error}</p>}
      {summary && side && (
        <article className="dossier">
          <h2>{summary.name}</h2>
          <p className="muted">{summary.maxTurns}ターン</p>
          <div className="thumb-wrap">{detail ? <MapThumb detail={detail} color={SIDE_COLORS[sideIndex] ?? "#333"} /> : <div className="thumb-placeholder">地図を広げています…</div>}</div>
          {summary.description && <p className="brief">{summary.description}</p>}
          <h3>陣営</h3>
          <table className="victory sides">
            <tbody>
              {summary.sides.map((x, i) => {
                const v = summary.victory[x.id];
                return (
                  <tr key={x.id} className={x.id === side.id ? "chosen" : ""} onClick={() => setSideId(x.id)}>
                    <th>
                      <span className="swatch" style={{ background: SIDE_COLORS[i] }} /> {x.name}
                      <small className="muted">({x.units}部隊)</small>
                    </th>
                    <td>
                      {v && (
                        <>
                          <div>決定的勝利:{tierText(v, v.decisive, summary.objectives)}</div>
                          <div>限定的勝利:{tierText(v, v.limited, summary.objectives)}</div>
                          {v.secretPool && <div className="muted">秘密の副目標を {v.secretPool.count} 個引く</div>}
                        </>
                      )}
                    </td>
                    <td className="actions">
                      <button
                        className="primary"
                        data-testid={`gen-play-${x.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
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
        </article>
      )}
    </div>
  );
}
