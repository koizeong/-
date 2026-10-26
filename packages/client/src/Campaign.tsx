import type { CampaignSnapshot, CampaignView, StageReport } from "@brigade/campaign";
import type { CampaignDef } from "@brigade/campaign";
import { useEffect, useMemo, useState } from "react";
import type { Game } from "./game.js";
import { SIDE_COLORS } from "./MapView.js";
import { activeCampaign, getCampaignSave, listCampaignSaves, putCampaignSave, removeCampaignSave, setActiveCampaign, type CampaignSave } from "./campaignSaves.js";
import { listSaves, saveKey } from "./saves.js";

type Summary = { id: string; name: string; description?: string; sides: { id: string; name: string }[]; startDate: string; stages: number; daysPerStage: number; formations: Record<string, number> };
type Detail = Summary & Pick<CampaignDef, "regions" | "links" | "victory"> & { formationList: { id: string; name: string; side: string }[] };
type Reply = { snapshot: CampaignSnapshot; view: CampaignView; scenarioId?: string; side?: string; report?: StageReport; errors?: string[] };

const post = async (path: string, body: unknown): Promise<Reply> => {
  const r = await fetch(path, { method: "POST", body: JSON.stringify(body) });
  const j = (await r.json()) as Reply;
  if (!r.ok) throw new Error(j.errors?.join(" / ") ?? `失敗しました(${r.status})`);
  return j;
};

const MISSION_NAMES: Record<string, string> = { "attack-defense": "攻撃と防御", encounter: "遭遇戦" };
const LEVEL_NAMES: Record<string, string> = { decisive: "決定的勝利", limited: "限定的勝利", draw: "引き分け" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * キャンペーン:一覧から始めるか、ブラウザに残した続きを開く。試合の画面から戻ったときは、そのキャンペーンを開く
 */
export function CampaignSection({ game }: { game: Game }) {
  const [list, setList] = useState<Summary[] | null>(null);
  const [saves, setSaves] = useState<CampaignSave[]>(() => listCampaignSaves());
  const [open, setOpen] = useState<CampaignSave | null>(() => {
    const k = activeCampaign();
    return k ? (getCampaignSave(k) ?? null) : null;
  });
  const [seed, setSeed] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => r.json() as Promise<Summary[]>)
      .then(setList)
      .catch(() => setError("キャンペーンの一覧を読み込めませんでした"));
  }, []);

  if (open)
    return (
      <CampaignPlay
        game={game}
        save={open}
        onClose={() => {
          setActiveCampaign(null);
          setSaves(listCampaignSaves());
          setOpen(null);
        }}
      />
    );

  const start = (c: Summary, side: string) => {
    setError(null);
    post("/api/campaign/start", { campaignId: c.id, side, ...(seed ? { seed: Number(seed) } : {}) })
      .then((r) => {
        const saved = putCampaignSave({ name: c.name, sideName: c.sides.find((s) => s.id === side)?.name ?? side, snapshot: r.snapshot });
        setActiveCampaign(saved.key);
        setOpen(saved);
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <section className="campaigns">
      {error && <p className="note">{error}</p>}
      {saves.length > 0 && (
        <>
          <h3>続きから</h3>
          <ul className="saves">
            {saves.map((e) => (
              <li key={e.key}>
                <div>
                  <b>{e.name}</b>・{e.sideName}
                  <span className="muted">
                    {" "}
                    {e.snapshot.state.result ? "終了" : `第${e.snapshot.state.stage}段階`}・{new Date(e.savedAt).toLocaleString("ja-JP")}
                  </span>
                </div>
                <div className="row">
                  <button
                    className="primary"
                    data-testid={`campaign-resume-${e.key}`}
                    onClick={() => {
                      setActiveCampaign(e.key);
                      setOpen(e);
                    }}
                  >
                    {e.snapshot.state.result ? "結果を見る" : "続ける"}
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm("このキャンペーンの記録を消しますか?")) return;
                      removeCampaignSave(e.key);
                      setSaves(listCampaignSaves());
                    }}
                  >
                    消す
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>新しく始める</h3>
      {!list && !error && <p className="muted">読み込んでいます…</p>}
      {list?.length === 0 && <p className="muted">キャンペーンがありません(data/campaigns)。</p>}
      {list?.map((c) => (
        <div key={c.id} className="card campaign-card">
          <h3>{c.name}</h3>
          <p className="muted">
            {c.startDate} から・{c.stages}段階(1段階 {c.daysPerStage}日)
          </p>
          {c.description && <p>{c.description}</p>}
          <div className="row">
            {c.sides.map((s, i) => (
              <button key={s.id} className="primary" data-testid={`campaign-start-${c.id}-${s.id}`} onClick={() => start(c, s.id)}>
                <span className="swatch" style={{ background: SIDE_COLORS[i] }} /> {s.name}({c.formations[s.id] ?? 0}個師団・旅団)で始める
              </button>
            ))}
          </div>
        </div>
      ))}
      <details>
        <summary>詳しい設定</summary>
        <label className="seed">
          シード(空欄ならおまかせ):
          <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
        </label>
      </details>
    </section>
  );
}

/**
 * キャンペーンの段階:作戦地図で師団・旅団の動く先を決めて確定し、起きる戦闘から1つを選んで指揮する(残りは AI 同士で解く)。
 * 戦闘を終えて戻ったら、結果を報告して次の段階へ
 */
function CampaignPlay({ game, save, onClose }: { game: Game; save: CampaignSave; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cur, setCur] = useState<CampaignSave>(save);
  const [view, setView] = useState<CampaignView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<StageReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snap = cur.snapshot;
  const me = snap.side;

  useEffect(() => {
    fetch(`/api/campaign?id=${encodeURIComponent(snap.campaignId)}`)
      .then((r) => r.json() as Promise<Detail>)
      .then(setDetail)
      .catch(() => setError("作戦地図を読み込めませんでした"));
    post("/api/campaign/view", { snapshot: snap })
      .then((r) => setView(r.view))
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (r: Reply, battle?: CampaignSave["battle"]) => {
    const next = putCampaignSave({ name: cur.name, sideName: cur.sideName, snapshot: r.snapshot, ...(battle ? { battle } : {}) });
    setCur(next);
    setView(r.view);
  };
  const call = (label: string, f: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    f()
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  };

  /** 指揮している戦闘の記録(ブラウザに自動保存されたもの) */
  const battleRecord = cur.battle ? listSaves().find((e) => e.key === saveKey({ scenarioId: cur.battle!.scenarioId, side: me, seed: cur.battle!.seed })) : undefined;

  const commit = () =>
    call("命令を確定しています…", async () => {
      const orders = Object.entries(drafts).map(([formation, to]) => ({ formation, to }));
      update(await post("/api/campaign/orders", { snapshot: snap, orders }));
      setDrafts({});
      setSelected(null);
    });
  const advance = (withRecord: boolean) =>
    call("戦闘を解いています…(指揮しない戦闘は AI 同士で戦います)", async () => {
      const r = await post("/api/campaign/advance", { snapshot: snap, ...(withRecord && battleRecord ? { record: battleRecord.record } : {}) });
      const next = putCampaignSave({ name: cur.name, sideName: cur.sideName, snapshot: r.snapshot });
      setCur(next);
      setView(r.view);
      setReport(r.report ?? null);
    });
  const play = (battleId: string) =>
    call("戦場を用意しています…", async () => {
      const r = await post("/api/campaign/battle", { snapshot: snap, battleId });
      const seed = cur.battle && snap.battleId === battleId ? cur.battle.seed : Math.floor(Math.random() * 2 ** 31);
      const battle = { scenarioId: r.scenarioId!, seed };
      update(r, battle);
      setActiveCampaign(cur.key);
      const rec = listSaves().find((e) => e.key === saveKey({ scenarioId: battle.scenarioId, side: me, seed }));
      if (rec) game.start({ resume: rec.record });
      else game.start({ scenarioId: battle.scenarioId, side: me, seed });
    });

  if (!detail || !view) {
    return (
      <section>
        <button className="back" onClick={onClose}>
          ← キャンペーンの一覧へ
        </button>
        {error ? <p className="note">{error}</p> : <p className="muted">作戦地図を広げています…</p>}
      </section>
    );
  }

  const sideIndex = (s: string) => detail.sides.findIndex((x) => x.id === s);
  const sideName = (s: string | null) => (s ? (detail.sides.find((x) => x.id === s)?.name ?? s) : "—");
  const regionName = (r: string) => detail.regions[r]?.name ?? r;
  const fname = (f: string) => detail.formationList.find((x) => x.id === f)?.name ?? f;
  const neighbors = (r: string) => detail.links.flatMap((l) => (l.a === r ? [l.b] : l.b === r ? [l.a] : []));
  const own = view.formations.filter((f) => f.side === me);
  const committed = !!snap.orders;
  const result = snap.state.result;
  const last = report ?? snap.state.history[snap.state.history.length - 1] ?? null;
  const chosen = view.plan?.battles.find((b) => b.id === snap.battleId);

  const clickRegion = (r: string) => {
    if (committed || !selected) return;
    const f = view.formations.find((x) => x.id === selected);
    if (!f || (r !== f.region && !neighbors(f.region).includes(r))) return;
    setDrafts((d) => {
      const n = { ...d };
      if (r === f.region) delete n[selected];
      else n[selected] = r;
      return n;
    });
  };

  return (
    <div className="campaign">
      <header className="campaign-head">
        <button className="back" onClick={onClose} data-testid="campaign-close">
          ← キャンペーンの一覧へ
        </button>
        <h2>{detail.name}</h2>
        <span className="muted">
          {result ? "終了" : `第${view.stage}段階 / ${view.stages}・${view.date}`}・{sideName(me)}を指揮
        </span>
        <span className="score">
          {detail.sides.map((s, i) => (
            <span key={s.id}>
              <span className="swatch" style={{ background: SIDE_COLORS[i] }} /> {s.name} {view.score[s.id]?.points ?? 0}点・損耗 {pct(view.score[s.id]?.lossRatio ?? 0)}
            </span>
          ))}
        </span>
      </header>
      {error && <p className="note">{error}</p>}
      {busy && <p className="note busy">{busy}</p>}
      <div className="campaign-body">
        <OpMap
          detail={detail}
          view={view}
          snap={snap}
          drafts={drafts}
          selected={selected}
          onRegion={clickRegion}
          onFormation={(f) => !committed && view.formations.find((x) => x.id === f)?.side === me && setSelected(f === selected ? null : f)}
          sideIndex={sideIndex}
        />
        <aside className="campaign-side">
          {last && (
            <section className="stage-report" data-testid="campaign-report">
              <h3>第{last.stage}段階の結果({last.date})</h3>
              <ul>
                {last.battles.map((b) => (
                  <li key={b.id}>
                    {regionName(b.region)}の戦い({MISSION_NAMES[b.mission] ?? b.mission}
                    {b.attacker ? `・${sideName(b.attacker)}が攻撃` : ""}
                    {b.played ? "・指揮" : ""}):<b>{b.winner ? `${sideName(b.winner)}の${LEVEL_NAMES[b.level]}` : "引き分け"}</b>
                    <span className="muted">
                      {" "}
                      損害 {detail.sides.map((s) => `${s.name} ${Math.round(b.losses[s.id] ?? 0)}`).join("・")}
                    </span>
                  </li>
                ))}
                {last.captures.map((c) => (
                  <li key={c.region}>
                    {sideName(c.side)}が{regionName(c.region)}を戦わずに押さえた
                  </li>
                ))}
                {last.destroyed.map((f) => (
                  <li key={f} className="bad-text">
                    {fname(f)}が包囲されて壊滅した
                  </li>
                ))}
                {last.battles.length + last.captures.length + last.destroyed.length === 0 && <li className="muted">大きな動きはなかった</li>}
              </ul>
            </section>
          )}

          {result ? (
            <section className="campaign-result" data-testid="campaign-result">
              <div className={`stamp ${result.winner === me ? "win" : result.winner ? "lose" : "draw"}`}>{result.winner ? `${sideName(result.winner)}の${LEVEL_NAMES[result.level]}` : "引き分け"}</div>
              <table className="victory">
                <tbody>
                  {detail.sides.map((s) => {
                    const p = result.perSide[s.id];
                    return (
                      <tr key={s.id}>
                        <th>{s.name}</th>
                        <td>
                          {p?.points ?? 0}点・損耗 {pct(p?.lossRatio ?? 0)}・{p?.level === "decisive" ? "決定的" : p?.level === "limited" ? "限定的" : "届かず"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button onClick={onClose}>キャンペーンの一覧へ</button>
            </section>
          ) : !committed ? (
            <section>
              <h3>命令</h3>
              <p className="muted">師団・旅団を選び、地図でつながった地域を押すと動く先になります(もう一度今の地域を押すと取り消し)。敵のいる地域へ入れば戦闘になります。</p>
              <ul className="formations">
                {own.map((f) => (
                  <li key={f.id} className={f.id === selected ? "on" : ""}>
                    <button className="link" onClick={() => setSelected(f.id === selected ? null : f.id)} data-testid={`campaign-formation-${f.id}`}>
                      <b>{f.name}</b>
                    </button>
                    <span className="muted">
                      {" "}
                      {regionName(f.region)}・戦力 {f.power}
                      {f.supplied ? "" : "・補給なし"}
                    </span>
                    <select
                      value={drafts[f.id] ?? f.region}
                      data-testid={`campaign-order-${f.id}`}
                      onChange={(e) =>
                        setDrafts((d) => {
                          const n = { ...d };
                          if (e.target.value === f.region) delete n[f.id];
                          else n[f.id] = e.target.value;
                          return n;
                        })
                      }
                    >
                      <option value={f.region}>とどまる({regionName(f.region)})</option>
                      {neighbors(f.region).map((r) => (
                        <option key={r} value={r}>
                          → {regionName(r)}
                          {view.formations.some((x) => x.region === r && x.side !== me) ? "(敵)" : ""}
                        </option>
                      ))}
                    </select>
                    <details>
                      <summary className="muted">隷下の部隊</summary>
                      <ul className="units">
                        {f.units.map((u) => (
                          <li key={u.id}>
                            {u.toeName}:戦力 {pct(u.strength)}・士気 {pct(u.morale)}・弾薬 {pct(u.ammo)}・{u.training}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
              <button className="primary" disabled={!!busy} onClick={() => confirm("この命令で確定しますか?(確定したら変えられません)") && commit()} data-testid="campaign-commit">
                命令を確定する
              </button>
            </section>
          ) : (
            <section>
              <h3>この段階の戦闘</h3>
              {view.plan && view.plan.battles.length === 0 && <p className="muted">戦闘は起きません。</p>}
              <ul className="battles">
                {view.plan?.battles.map((b) => (
                  <li key={b.id} className={b.id === snap.battleId ? "on" : ""}>
                    <div>
                      <b>{regionName(b.region)}</b>({MISSION_NAMES[b.mission]}
                      {b.attacker ? `・${sideName(b.attacker)}が攻撃` : ""})
                    </div>
                    <div className="muted">
                      {detail.sides.map((s) => `${s.name}:${(b.sides[s.id]?.formations ?? []).map(fname).join("・")}(戦力 ${b.sides[s.id]?.power ?? 0})`).join(" 対 ")}
                    </div>
                    {b.playable && (!snap.battleId || snap.battleId === b.id) && (
                      <button className="primary" disabled={!!busy} onClick={() => play(b.id)} data-testid={`campaign-play-${b.id}`}>
                        {snap.battleId === b.id ? (battleRecord?.finished ? "結果を見る" : "指揮を続ける") : "この戦闘を指揮する"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {view.plan && view.plan.captures.length > 0 && (
                <p className="muted">戦わずに押さえる地域:{view.plan.captures.map((c) => `${regionName(c.region)}(${sideName(c.side)})`).join("・")}</p>
              )}
              {chosen && battleRecord?.finished ? (
                <button className="primary" disabled={!!busy} onClick={() => advance(true)} data-testid="campaign-advance">
                  戦闘の結果を報告して次の段階へ
                </button>
              ) : (
                <button
                  disabled={!!busy}
                  onClick={() => (!chosen || confirm("指揮している戦闘は、ここから AI 同士で最後まで戦います。よろしいですか?")) && advance(!!chosen)}
                  data-testid="campaign-advance"
                >
                  {chosen ? "残りを AI に任せて次の段階へ" : view.plan?.battles.some((b) => b.playable) ? "指揮せずに次の段階へ(すべて AI に任せる)" : "次の段階へ"}
                </button>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * 作戦地図:地域(持ち主の色・補給の源・勝利点)、結び(鉄道は二重線・小道は点線)、師団・旅団の札、
 * 下書きの命令(矢印)と、確定した後の両陣営の動き・戦闘の印。x は東、y は北(km)
 */
function OpMap({
  detail,
  view,
  snap,
  drafts,
  selected,
  onRegion,
  onFormation,
  sideIndex,
}: {
  detail: Detail;
  view: CampaignView;
  snap: CampaignSnapshot;
  drafts: Record<string, string>;
  selected: string | null;
  onRegion: (r: string) => void;
  onFormation: (f: string) => void;
  sideIndex: (s: string) => number;
}) {
  const W = 900;
  const PAD = 70;
  const { pos, H } = useMemo(() => {
    const xs = Object.values(detail.regions).map((r) => r.x);
    const ys = Object.values(detail.regions).map((r) => r.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = (W - 2 * PAD) / Math.max(1, x1 - x0, (y1 - y0) * 1.4);
    const h = Math.max(320, (y1 - y0) * k + 2 * PAD);
    return { pos: (r: string) => ({ x: PAD + (detail.regions[r]!.x - x0) * k, y: h - PAD - (detail.regions[r]!.y - y0) * k }), H: h };
  }, [detail]);
  const control = snap.state.control;
  const mine = snap.side;
  const points = Object.fromEntries((detail.victory[mine]?.conditions ?? []).flatMap((c) => (c.type === "region" ? [[c.region, c.points]] : [])));
  const moves: { f: string; from: string; to: string; side: string; draft: boolean }[] = [];
  for (const f of view.formations) {
    const to = view.plan ? view.plan.positions[f.id] : drafts[f.id];
    if (to && to !== f.region) moves.push({ f: f.id, from: f.region, to, side: f.side, draft: !view.plan });
  }
  const battles = new Set(view.plan?.battles.map((b) => b.region) ?? []);
  const supplyOf = (r: string) => detail.regions[r]?.supply;
  const at = selected ? view.formations.find((f) => f.id === selected)?.region : undefined;
  const reachable = at ? new Set([at, ...detail.links.flatMap((l) => (l.a === at ? [l.b] : l.b === at ? [l.a] : []))]) : null;

  return (
    <svg className="opmap" viewBox={`0 0 ${W} ${H}`} data-testid="campaign-map">
      <defs>
        {[0, 1].map((i) => (
          <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={SIDE_COLORS[i]} />
          </marker>
        ))}
      </defs>
      {detail.links.map((l, i) => {
        const a = pos(l.a);
        const b = pos(l.b);
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#6b5d45" strokeWidth={l.kind === "rail" ? 5 : 3} strokeDasharray={l.kind === "track" ? "6 6" : undefined} opacity={0.7} />
            {l.kind === "rail" && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ece3cc" strokeWidth={2} strokeDasharray="8 8" />}
          </g>
        );
      })}
      {moves.map((m) => {
        const a = pos(m.from);
        const b = pos(m.to);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        const i = sideIndex(m.side);
        return (
          <line
            key={m.f}
            x1={a.x + (dx / d) * 30}
            y1={a.y + (dy / d) * 30}
            x2={b.x - (dx / d) * 34}
            y2={b.y - (dy / d) * 34}
            stroke={SIDE_COLORS[i]}
            strokeWidth={4}
            strokeDasharray={m.draft ? "10 6" : undefined}
            markerEnd={`url(#arrow-${i})`}
          />
        );
      })}
      {Object.entries(detail.regions).map(([id, r]) => {
        const p = pos(id);
        const owner = control[id];
        const i = owner ? sideIndex(owner) : -1;
        const target = reachable?.has(id);
        return (
          <g key={id} className={`region${target ? " target" : ""}`} onClick={() => onRegion(id)} data-testid={`campaign-region-${id}`}>
            <circle cx={p.x} cy={p.y} r={26} fill={i >= 0 ? SIDE_COLORS[i] : "#bbb"} fillOpacity={0.28} stroke={i >= 0 ? SIDE_COLORS[i] : "#888"} strokeWidth={target ? 4 : 2} />
            {supplyOf(id) && <rect x={p.x - 7} y={p.y - 7} width={14} height={14} fill={SIDE_COLORS[sideIndex(supplyOf(id)!)]} />}
            {battles.has(id) && (
              <text x={p.x} y={p.y + 8} textAnchor="middle" fontSize={24}>
                ⚔
              </text>
            )}
            <text x={p.x} y={p.y + 44} textAnchor="middle" fontSize={15} fill="#2b2418">
              {r.name}
              {points[id] ? ` ★${points[id]}` : ""}
            </text>
          </g>
        );
      })}
      {Object.keys(detail.regions).map((id) => {
        const p = pos(id);
        const here = view.formations.filter((f) => f.region === id);
        return here.map((f, k) => {
          const i = sideIndex(f.side);
          const x = p.x - 60 + (k % 2) * 62;
          const y = p.y - 62 - Math.floor(k / 2) * 22;
          return (
            <g key={f.id} className="formation-chip" onClick={() => onFormation(f.id)} data-testid={`campaign-chip-${f.id}`}>
              <rect x={x} y={y} width={58} height={19} rx={2} fill={f.id === selected ? "#fff6c8" : "#f5eedb"} stroke={SIDE_COLORS[i]} strokeWidth={f.side === mine ? 2.5 : 1.5} />
              <text x={x + 29} y={y + 14} textAnchor="middle" fontSize={11} fill={SIDE_COLORS[i]}>
                {f.name.length > 6 ? f.name.slice(0, 6) : f.name}
              </text>
              <title>
                {f.name}・戦力 {f.power}
                {f.supplied ? "" : "・補給なし"}
              </title>
            </g>
          );
        });
      })}
    </svg>
  );
}
