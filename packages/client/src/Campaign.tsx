import { DebriefSection } from "./Debrief.js";
import { relaxLayout, shortRegionName } from "./opmapLayout.js";
import type { AirMission, CampaignAirOrder, CampaignSnapshot, CampaignView, StageReport } from "@brigade/campaign";
import type { CampaignDef } from "@brigade/campaign";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "./game.js";
import { SIDE_COLORS } from "./MapView.js";
import { activeCampaign, getCampaignSave, listCampaignSaves, putCampaignSave, removeCampaignSave, setActiveCampaign, type CampaignSave } from "./campaignSaves.js";
import { listSaves, saveKey } from "./saves.js";
import { fetchFleet, TaskOrgModal } from "./TaskOrg.js";
import type { ScenarioDetail } from "@brigade/protocol";

type Summary = { id: string; name: string; description?: string; sides: { id: string; name: string }[]; startDate: string; stages: number; daysPerStage: number; formations: Record<string, number> };
type Detail = Summary & Pick<CampaignDef, "regions" | "links" | "victory" | "control" | "historicalOutcome"> & {
    formationList: { id: string; name: string; side: string }[];
    wingList?: { id: string; name: string; side: string; rangeKm: number; kamikaze?: boolean }[];
    subList?: { id: string; name: string; side: string; rangeKm: number }[];
  };
type Reply = { snapshot: CampaignSnapshot; view: CampaignView; scenarioId?: string; side?: string; report?: StageReport; errors?: string[] };

const post = async (path: string, body: unknown): Promise<Reply> => {
  const r = await fetch(path, { method: "POST", body: JSON.stringify(body) });
  const j = (await r.json()) as Reply;
  if (!r.ok) throw new Error(j.errors?.join(" / ") ?? `失敗しました(${r.status})`);
  return j;
};

const MISSION_NAMES: Record<string, string> = { "attack-defense": "攻撃と防御", encounter: "遭遇戦", naval: "海戦" };
/** 航空隊の任務の名前 */
const AIR_NAMES: Record<AirMission, string> = {
  cap: "上空を守る",
  units: "敵部隊を叩く",
  supply: "補給を叩く",
  airfield: "航空基地を叩く",
  battle: "戦闘に出る",
  rebase: "基地を移る",
};
const SEA_COLOR = "#3f6f9f";
const LEVEL_NAMES: Record<string, string> = { decisive: "決定的勝利", limited: "限定的勝利", draw: "引き分け" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * 戦役:一覧から始めるか、ブラウザに残した続きを開く。試合の画面から戻ったときは、その戦役を開く
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
      .catch(() => setError("戦役の一覧を読み込めませんでした"));
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
                      if (!confirm("この戦役の記録を消しますか?")) return;
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
      {list?.length === 0 && <p className="muted">戦役がありません(data/campaigns)。</p>}
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
      <GeneratedCampaign onStart={start} />
      <details>
        <summary>詳しい設定</summary>
        <label className="seed">
          シード(戦闘の展開の種。空欄ならおまかせ):
          <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
        </label>
      </details>
    </section>
  );
}

type GenOptions = { sizes: { id: string; name: string }[]; eras: { id: string; name: string; sides: { id: string; name: string }[] }[] };

/** 戦役を作る(自動生成):大きさ・編成・地図のシードを選んで、戦役地図を見比べてから陣営を選ぶ */
function GeneratedCampaign({ onStart }: { onStart: (c: Summary, side: string) => void }) {
  const [opts, setOpts] = useState<GenOptions | null>(null);
  const [size, setSize] = useState("s");
  const [era, setEra] = useState("generic");
  const [mapSeed, setMapSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [detail, setDetail] = useState<Detail | null>(null);
  const id = `gencamp:${size}:${era}:${mapSeed}`;
  useEffect(() => {
    fetch("/api/campaigns/options")
      .then((r) => r.json() as Promise<GenOptions>)
      .then(setOpts)
      .catch(() => setOpts(null));
  }, []);
  useEffect(() => {
    let live = true;
    setDetail(null);
    fetch(`/api/campaign?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Detail>) : null))
      .then((d) => live && setDetail(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  if (!opts || opts.sizes.length === 0) return null;
  return (
    <div className="card campaign-card generated">
      <h3>戦役を作る(自動生成)</h3>
      <div className="row">
        <label>
          大きさ{" "}
          <select value={size} onChange={(e) => setSize(e.target.value)} data-testid="gencamp-size">
            {opts.sizes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          編成{" "}
          <select value={era} onChange={(e) => setEra(e.target.value)} data-testid="gencamp-era">
            {opts.eras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          地図のシード <input value={mapSeed} onChange={(e) => setMapSeed(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} inputMode="numeric" data-testid="gencamp-seed" size={8} />
        </label>
        <button onClick={() => setMapSeed(Math.floor(Math.random() * 1_000_000))} data-testid="gencamp-reroll">
          作り直す
        </button>
      </div>
      {detail ? (
        <>
          <MiniOpMap detail={detail} />
          {detail.description && <p className="muted">{detail.description}</p>}
          <div className="row">
            {detail.sides.map((s, i) => (
              <button key={s.id} className="primary" data-testid={`gencamp-start-${s.id}`} onClick={() => onStart(detail, s.id)}>
                <span className="swatch" style={{ background: SIDE_COLORS[i] }} /> {s.name}({detail.formations[s.id] ?? 0}個師団・旅団)で始める
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">戦役地図を作っています…</p>
      )}
    </div>
  );
}

/** 戦役地図の縮図(地域の持ち主・補給の源・結び) */
function MiniOpMap({ detail }: { detail: Detail }) {
  const xs = Object.values(detail.regions).map((r) => r.mapX ?? r.x);
  const ys = Object.values(detail.regions).map((r) => r.mapY ?? r.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 420;
  const P = 16;
  const k = (W - 2 * P) / Math.max(1, x1 - x0);
  const H = Math.max(80, (y1 - y0) * k + 2 * P);
  const at = (r: string) => ({ x: P + ((detail.regions[r]!.mapX ?? detail.regions[r]!.x) - x0) * k, y: H - P - ((detail.regions[r]!.mapY ?? detail.regions[r]!.y) - y0) * k });
  const sideIndex = (s: string) => detail.sides.findIndex((x) => x.id === s);
  const owner = (r: string) => detail.control[r] ?? null;
  return (
    <svg className="opmap mini" viewBox={`0 0 ${W} ${H}`} data-testid="gencamp-map">
      {detail.links.map((l, i) => (
        <line key={i} x1={at(l.a).x} y1={at(l.a).y} x2={at(l.b).x} y2={at(l.b).y} stroke="#6b5d45" strokeWidth={l.kind === "rail" ? 3 : 1.5} strokeDasharray={l.kind === "track" ? "4 4" : undefined} />
      ))}
      {Object.entries(detail.regions).map(([id, r]) => {
        const o = owner(id);
        const i = o ? sideIndex(o) : -1;
        return (
          <g key={id}>
            <circle cx={at(id).x} cy={at(id).y} r={8} fill={i >= 0 ? SIDE_COLORS[i] : "#bbb"} fillOpacity={0.4} stroke={i >= 0 ? SIDE_COLORS[i] : "#888"} />
            {r.supply && <rect x={at(id).x - 4} y={at(id).y - 4} width={8} height={8} fill={SIDE_COLORS[sideIndex(r.supply)]} />}
            <title>{r.name}</title>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * 戦役の段階:戦役地図で師団・旅団の動く先を決めて確定し、起きる戦闘から1つを選んで指揮する(残りは AI 同士で解く)。
 * 戦闘を終えて戻ったら、結果を報告して次の段階へ
 */
function CampaignPlay({ game, save, onClose }: { game: Game; save: CampaignSave; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [cur, setCur] = useState<CampaignSave>(save);
  const [view, setView] = useState<CampaignView | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** 艦隊の、飛行場への艦砲射撃の目標(艦隊 → 地域) */
  const [bombards, setBombards] = useState<Record<string, string>>({});
  const [airDrafts, setAirDrafts] = useState<Record<string, { mission: AirMission; region?: string; share?: number }>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<StageReport | null>(null);
  /** 海戦を指揮する前の任務部隊の編成(作戦命令)の小窓 */
  const [fleetPrep, setFleetPrep] = useState<{ scenarioId: string; seed: number; fleet: NonNullable<ScenarioDetail["fleet"]> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const snap = cur.snapshot;
  const me = snap.side;

  useEffect(() => {
    fetch(`/api/campaign?id=${encodeURIComponent(snap.campaignId)}`)
      .then((r) => r.json() as Promise<Detail>)
      .then(setDetail)
      .catch(() => setError("戦役地図を読み込めませんでした"));
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
      const ids = [...new Set([...Object.keys(drafts), ...Object.keys(bombards)])];
      const orders = ids.map((formation) => {
        const to = drafts[formation] ?? view?.formations.find((f) => f.id === formation)?.region ?? formation;
        const target = bombards[formation];
        return { formation, to, ...(target && bombardTargets(to).includes(target) ? { bombard: target } : {}) };
      });
      update(await post("/api/campaign/orders", { snapshot: snap, orders }));
      setDrafts({});
      setBombards({});
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
  const commitAirOrders = () =>
    call("航空の命令を確定しています…", async () => {
      const air: CampaignAirOrder[] = Object.entries(airDrafts)
        .filter(([, o]) => o.mission === "cap" || o.region)
        .map(([wing, o]) => ({ wing, mission: o.mission, ...(o.mission !== "cap" && o.region ? { region: o.region } : {}), ...(o.mission === "battle" && o.share !== undefined && o.share < 1 ? { share: o.share } : {}) }));
      update(await post("/api/campaign/air", { snapshot: snap, air }));
      setAirDrafts({});
    });
  const play = (battleId: string) =>
    call("戦場を用意しています…", async () => {
      const r = await post("/api/campaign/battle", { snapshot: snap, battleId });
      const seed = cur.battle && snap.battleId === battleId ? cur.battle.seed : Math.floor(Math.random() * 2 ** 31);
      const battle = { scenarioId: r.scenarioId!, seed };
      update(r, battle);
      setActiveCampaign(cur.key);
      const rec = listSaves().find((e) => e.key === saveKey({ scenarioId: battle.scenarioId, side: me, seed }));
      if (rec) return game.start({ resume: rec.record });
      // 海戦で、組める戦隊があれば、出撃の前に任務部隊の編成を決める
      const fleet = await fetchFleet(battle.scenarioId, me).catch(() => null);
      if (fleet) setFleetPrep({ scenarioId: battle.scenarioId, seed, fleet });
      else game.start({ scenarioId: battle.scenarioId, side: me, seed });
    });

  if (!detail || !view) {
    return (
      <section>
        <button className="back" onClick={onClose}>
          ← 戦役の一覧へ
        </button>
        {error ? <p className="note">{error}</p> : <p className="muted">戦役地図を広げています…</p>}
      </section>
    );
  }

  const sideIndex = (s: string) => detail.sides.findIndex((x) => x.id === s);
  const sideName = (s: string | null) => (s ? (detail.sides.find((x) => x.id === s)?.name ?? s) : "—");
  const regionName = (r: string) => detail.regions[r]?.name ?? r;
  const fname = (f: string) => detail.formationList.find((x) => x.id === f)?.name ?? f;
  const isSea = (r: string) => !!detail.regions[r]?.sea;
  // 陸の師団・旅団は陸の地域へ、艦隊は海域へだけ動ける
  const neighbors = (r: string) => detail.links.flatMap((l) => (l.a === r ? [l.b] : l.b === r ? [l.a] : [])).filter((n) => isSea(n) === isSea(r));
  /** 海域 r に面した、敵の飛行場の地域(艦砲射撃できる所) */
  const bombardTargets = (r: string) =>
    isSea(r)
      ? detail.links
          .flatMap((l) => (l.a === r ? [l.b] : l.b === r ? [l.a] : []))
          .filter((n) => !isSea(n) && detail.regions[n]?.airbase && snap.state.control[n] != null && snap.state.control[n] !== me)
      : [];
  const wname = (w: string) => detail.wingList?.find((x) => x.id === w)?.name ?? w;
  const sname = (g: string) => detail.subList?.find((x) => x.id === g)?.name ?? g;
  const ownWings = view.wings.filter((w) => w.side === me);
  /** 航空隊の任務ごとの、選べる地域 */
  const airTargets = (w: (typeof view.wings)[number], mission: AirMission): string[] => {
    const pos = view.plan?.positions ?? {};
    const enemyAt = (r: string) => view.formations.some((f) => f.side !== me && (pos[f.id] ?? f.region) === r);
    if (mission === "cap") return [];
    if (mission === "battle") return (view.plan?.battles ?? []).filter((b) => (b.sides[me]?.units ?? 0) > 0 && w.reach.includes(b.region)).map((b) => b.region);
    if (mission === "airfield") return w.reach.filter((r) => detail.regions[r]?.airbase && snap.state.control[r] !== me);
    if (mission === "rebase") return w.reach.filter((r) => detail.regions[r]?.airbase && snap.state.control[r] === me && r !== w.base);
    return w.reach.filter(enemyAt);
  };
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
      {showSummary && view.summary && (
        <div className="paper result-screen" data-testid="campaign-summary">
          <div className="result-sheet">
            <header className="result-head">
              <h2>戦役の総括</h2>
              <p className="muted">戦闘に出た敵味方の全部隊。戦力は初めて戦闘に出たときと今。与えた損害は戦術の戦闘で敵に失わせた戦力の合計。</p>
            </header>
            <DebriefSection debrief={view.summary} me={me} sideName={sideName} extra={(u) => `戦闘 ${(u as { battles?: number }).battles ?? 0}回`} />
            <nav className="result-actions">
              <button className="primary" onClick={() => setShowSummary(false)} data-testid="campaign-summary-close">
                閉じる
              </button>
            </nav>
          </div>
        </div>
      )}
      {fleetPrep && (
        <TaskOrgModal
          fleet={fleetPrep.fleet}
          onClose={() => setFleetPrep(null)}
          onStart={(org) => {
            const p = fleetPrep;
            setFleetPrep(null);
            game.start({ scenarioId: p.scenarioId, side: me, seed: p.seed, ...(org ? { taskOrg: org } : {}) });
          }}
        />
      )}
      <header className="campaign-head">
        <button className="back" onClick={onClose} data-testid="campaign-close">
          ← 戦役の一覧へ
        </button>
        <h2>{detail.name}</h2>
        <span className="muted">
          {result ? "終了" : `第${view.stage}段階 / ${view.stages}・${view.date}`}・{sideName(me)}を指揮
        </span>
        {!result && (
          <span className="campaign-left" data-testid="campaign-left" title="いまの段階を含めた、終わりまでの段階の数と日数">
            残り {view.stages - view.stage + 1} 段階(あと {(view.stages - view.stage + 1) * detail.daysPerStage} 日)
            {view.season ? `・${view.season}` : ""}
            {view.weather ? `・天候 ${view.weather.name}${view.weather.flyable ? "" : "(航空機は飛べない)"}` : ""}
          </span>
        )}
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
          {!result && view.formations.some((f) => f.intel) && (
            <p className="muted" data-testid="campaign-intel-note">
              敵の位置・戦力は偵察の報告に基づく推定です(幅で出し、ときどき誤報が混じります)。点線の薄い印は前の段階に見た古い情報。見えるのは自軍のいる地域とその隣、自陣営の地域、航空隊の届く地域です。
            </p>
          )}
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
                {(last.air ?? []).map((a, i) => (
                  <li key={`air-${i}`} className={a.side === me ? "" : "muted"}>
                    {sideName(a.side)}の{wname(a.wing)}:{a.kamikaze ? "特攻" : AIR_NAMES[a.mission]}
                    {a.region ? `(${regionName(a.region)})` : ""}
                    {a.effect?.strength ? `・敵の戦力 −${pct(a.effect.strength)}` : ""}
                    {a.effect?.stock ? `・敵の備蓄 −${pct(a.effect.stock)}・補充 −${pct(a.effect.cut ?? 0)}` : ""}
                    {a.effect?.destroyed ? `・地上で ${a.effect.destroyed.toFixed(1)} 編隊を壊した` : ""}
                    {a.kills ? `・${a.kills.toFixed(1)} 編隊を迎え撃った` : ""}
                    {a.lost.fighters + a.lost.strike > 0 ? <span className="muted">(失った編隊 {(a.lost.fighters + a.lost.strike).toFixed(1)})</span> : null}
                  </li>
                ))}
                {(last.airUpkeep?.rebased ?? []).map((r) => (
                  <li key={`rb-${r.wing}`}>
                    {wname(r.wing)}が{regionName(r.to)}へ基地を移した
                  </li>
                ))}
                {(last.airUpkeep?.destroyed ?? []).map((w) => (
                  <li key={`wd-${w}`} className="bad-text">
                    {wname(w)}が失われた
                  </li>
                ))}
                {(last.submarines ?? []).map((x, i) => (
                  <li key={`sub-${i}`} className={x.side === me ? "" : "bad-text"}>
                    {sideName(x.side)}の{sname(x.group)}が{regionName(x.region)}で{fname(x.formation)}を雷撃した(命中 {x.hits}
                    {x.sunk.length ? `・${x.sunk.length}隻を沈めた` : ""}
                    {x.lostBoats ? `・潜水艦 ${x.lostBoats}隻を失った` : ""})
                  </li>
                ))}
                {(last.convoyAttacks ?? []).map((x, i) => (
                  <li key={`cv-${i}`}>
                    {fname(x.formation)}は渡る途中で{x.by === "submarine" ? "潜水艦" : "特攻"}に襲われた(戦力 −{pct(x.loss)})
                  </li>
                ))}
                {(last.bombardments ?? []).map((b) => (
                  <li key={`bb-${b.formation}`}>
                    {fname(b.formation)}が{regionName(b.region)}の飛行場を艦砲射撃した(航空隊の {pct(b.share)}・{b.groups.toFixed(1)} 編隊を壊した)
                  </li>
                ))}
                {(last.expressed ?? []).map((x) => (
                  <li key={`ex-${x.formation}`}>
                    {fname(x.formation)}が夜の輸送(東京急行)で着いた{x.loss > 0 ? `(空襲で戦力 −${pct(x.loss)})` : ""}
                  </li>
                ))}
                {(last.delayed ?? []).map((f) => (
                  <li key={`dl-${f}`} className="bad-text">
                    {fname(f)}は、渡る海域を押さえられて着かなかった
                  </li>
                ))}
                {(last.withdrawn ?? []).map((w) => (
                  <li key={`wd-f-${w.formation}`}>
                    {fname(w.formation)}が{regionName(w.region)}から撤退した(戦力を保って戦場を去った)
                  </li>
                ))}
                {(last.arrivals ?? []).map((a) => (
                  <li key={a.formation}>
                    増援:{fname(a.formation)}が{regionName(a.region)}に着いた
                  </li>
                ))}
                {last.destroyed.map((f) => (
                  <li key={f} className="bad-text">
                    {fname(f)}が包囲されて壊滅した
                  </li>
                ))}
                {last.battles.length + last.captures.length + last.destroyed.length + (last.arrivals?.length ?? 0) + (last.withdrawn?.length ?? 0) === 0 && <li className="muted">大きな動きはなかった</li>}
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
              {detail.historicalOutcome && (
                <p className="historical">
                  史実:{detail.historicalOutcome.winner ? `${sideName(detail.historicalOutcome.winner)}の${LEVEL_NAMES[detail.historicalOutcome.level]}` : "引き分け"}。{detail.historicalOutcome.summary}
                </p>
              )}
              {view.summary && (
                <button className="primary" onClick={() => setShowSummary(true)} data-testid="campaign-summary-open">
                  総括を見る(全部隊の損耗と殊勲の部隊)
                </button>
              )}
              <button onClick={onClose}>戦役の一覧へ</button>
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
                      {f.naval ? (f.inPort ? "艦隊(港で修理・補給)・" : "艦隊・") : ""}
                      {regionName(f.region)}・戦力 {f.power}
                      {f.firepower !== undefined ? `・火力 ${f.firepower}` : ""}
                      {f.supplied ? "" : "・補給なし"}
                      {f.withdraw ? `・${view.stage >= f.withdraw.stage ? "撤退中" : `撤退は${f.withdraw.date}から`}(${f.withdraw.from.map(regionName).join("・")}で去る)` : ""}
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
                    {f.naval && bombardTargets(drafts[f.id] ?? f.region).length > 0 && (
                      <label className="muted" title="段階の終わりまでこの海域に残れば、夜に飛行場を撃って敵の航空隊を壊し、その段階の補充を止める(戦艦・巡洋艦の数で効き目が決まる)">
                        {" "}
                        飛行場を砲撃:
                        <select
                          value={bombards[f.id] ?? ""}
                          data-testid={`campaign-bombard-${f.id}`}
                          onChange={(e) =>
                            setBombards((b) => {
                              const n = { ...b };
                              if (e.target.value) n[f.id] = e.target.value;
                              else delete n[f.id];
                              return n;
                            })
                          }
                        >
                          <option value="">しない</option>
                          {bombardTargets(drafts[f.id] ?? f.region).map((r) => (
                            <option key={r} value={r}>
                              {regionName(r)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
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
              {view.reinforcements.length > 0 && (
                <p className="muted" data-testid="campaign-reinforcements">
                  増援の予定:
                  {view.reinforcements
                    .map((r) => `${r.name}(第${r.stage}段階・${r.date}・${regionName(r.region)}${r.via ? `・${regionName(r.via)}を渡る` : ""}${r.delayed ? "・海域を押さえられて遅れている" : ""})`)
                    .join("、")}
                </p>
              )}
              <button className="primary" disabled={!!busy} onClick={() => confirm("この命令で確定しますか?(確定したら変えられません)") && commit()} data-testid="campaign-commit">
                命令を確定する
              </button>
            </section>
          ) : (
            <section>
              {view.airPending && (
                <div className="air-orders" data-testid="campaign-air">
                  <h3>航空の命令</h3>
                  <p className="muted">
                    航空隊ごとに任務を選びます(選ばなければ上空を守り、届く範囲に来た敵の航空隊を迎え撃ちます)。「戦闘に出る」を選んだ航空隊は、その戦闘で司令部コマンドの空襲・近接支援・制空任務などに使えます。
                  </p>
                  <ul className="wings">
                    {ownWings.map((w) => {
                      const d = airDrafts[w.id] ?? { mission: "cap" as AirMission };
                      const missions = (Object.keys(AIR_NAMES) as AirMission[]).filter((m) => m === "cap" || ((m === "battle" || m === "rebase" || w.strike > 0) && airTargets(w, m).length > 0));
                      const targets = airTargets(w, d.mission);
                      return (
                        <li key={w.id}>
                          <b>{w.name}</b>
                          <span className="muted">
                            {" "}
                            {regionName(w.base)}・戦闘機 {w.fighters.toFixed(1)}/{w.maxFighters}・攻撃機 {w.strike.toFixed(1)}/{w.maxStrike}・航続 {w.rangeKm}km
                          </span>
                          <select
                            value={d.mission}
                            data-testid={`campaign-air-mission-${w.id}`}
                            onChange={(e) => {
                              const m = e.target.value as AirMission;
                              const t = airTargets(w, m);
                              setAirDrafts((a) => ({ ...a, [w.id]: { mission: m, ...(t[0] ? { region: t[0] } : {}) } }));
                            }}
                          >
                            {missions.map((m) => (
                              <option key={m} value={m}>
                                {AIR_NAMES[m]}
                              </option>
                            ))}
                          </select>
                          {d.mission !== "cap" && (
                            <select value={d.region ?? ""} data-testid={`campaign-air-region-${w.id}`} onChange={(e) => setAirDrafts((a) => ({ ...a, [w.id]: { mission: d.mission, region: e.target.value, ...(d.share !== undefined ? { share: d.share } : {}) } }))}>
                              {targets.map((r) => (
                                <option key={r} value={r}>
                                  {regionName(r)}
                                </option>
                              ))}
                            </select>
                          )}
                          {d.mission === "battle" && (
                            <select
                              value={d.share ?? 1}
                              data-testid={`campaign-air-share-${w.id}`}
                              title="戦闘に出す割合。出さなかった分は、その戦闘で失いません"
                              onChange={(e) => setAirDrafts((a) => ({ ...a, [w.id]: { ...d, share: Number(e.target.value) } }))}
                            >
                              {[1, 0.75, 0.5, 0.25].map((x) => (
                                <option key={x} value={x}>
                                  {x === 1 ? "全部" : `${Math.round(x * 100)}%`}
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <button className="primary" disabled={!!busy} onClick={commitAirOrders} data-testid="campaign-air-commit">
                    航空の命令を確定する
                  </button>
                </div>
              )}
              <h3>この段階の戦闘</h3>
              {view.plan && view.plan.battles.length === 0 && <p className="muted">戦闘は起きません。</p>}
              <ul className="battles">
                {view.plan?.battles.map((b) => (
                  <li key={b.id} className={b.id === snap.battleId ? "on" : ""}>
                    <div>
                      <b>{regionName(b.region)}</b>({b.airRaid ? "艦隊への空襲" : MISSION_NAMES[b.mission]}
                      {b.attacker ? `・${sideName(b.attacker)}が攻撃` : ""})
                    </div>
                    <div className="muted">
                      {detail.sides
                        .map((s) => {
                          const x = b.sides[s.id];
                          const pw = x?.powerRange ? `${x.powerRange[0]}〜${x.powerRange[1]}(推定)` : `${x?.power ?? 0}`;
                          return `${s.name}:${(x?.formations ?? []).map(fname).join("・")}(戦力 ${pw}${x?.firepower !== undefined ? `・火力 ${x.firepower}${x.powerRange ? "(推定)" : ""}` : ""})`;
                        })
                        .join(" 対 ")}
                    </div>
                    {Object.keys(b.air).length > 0 && (
                      <div className="muted" data-testid={`campaign-battle-air-${b.id}`}>
                        航空:{Object.entries(b.air).map(([s, ws]) => `${sideName(s)} ${ws.map(wname).join("・")}`).join(" / ")}
                      </div>
                    )}
                    {b.playable && (!snap.battleId || snap.battleId === b.id) && (
                      <button className="primary" disabled={!!busy || view.airPending} title={view.airPending ? "先に航空の命令を確定してください" : undefined} onClick={() => play(b.id)} data-testid={`campaign-play-${b.id}`}>
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
 * 戦役地図:地域(持ち主の色・補給の源・勝利点)、結び(鉄道は二重線・小道は点線)、師団・旅団の札、
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
  const { pos: basePos, H } = useMemo(() => {
    const xs = Object.values(detail.regions).map((r) => r.mapX ?? r.x);
    const ys = Object.values(detail.regions).map((r) => r.mapY ?? r.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // 横幅に合わせる。縦長の戦役地図(マレー半島など)は、高さを横幅の1.6倍まで伸ばして描く
    const k = (W - 2 * PAD) / Math.max(1, x1 - x0, ((y1 - y0) * (W - 2 * PAD)) / (W * 1.6 - 2 * PAD));
    const h0 = Math.max(320, (y1 - y0) * k + 2 * PAD);
    // 集まった地域の丸・名前が重ならないよう、描く位置をほどく(並びはおおむね保ち、足りなければ地図を高くする)
    const laid = relaxLayout(
      Object.entries(detail.regions).map(([id, r]) => ({
        id,
        x: PAD + ((r.mapX ?? r.x) - x0) * k,
        y: h0 - PAD - ((r.mapY ?? r.y) - y0) * k,
        label: shortRegionName(r.name).length + 3,
      })),
      W,
      PAD,
    );
    return { pos: (r: string) => laid.pos[r]!, H: Math.max(320, laid.height) };
  }, [detail]);
  // 拡大縮小とスクロール:地域の位置だけを広げ、丸・札・文字の大きさは変えない(重なった地域の名前が拡大するとほどける)
  const { zoom, svgRef, handlers, setZoom } = useMapZoom(W, H);
  const pos = (r: string) => {
    const p = basePos(r);
    return { x: p.x * zoom.z + zoom.x, y: p.y * zoom.z + zoom.y };
  };
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
  const sea = (r: string) => !!detail.regions[r]?.sea;
  const reachable = at ? new Set([at, ...detail.links.flatMap((l) => (l.a === at ? [l.b] : l.b === at ? [l.a] : [])).filter((r) => sea(r) === sea(at))]) : null;
  // 航空の命令(自陣営の分と、確定した後は相手の分も):基地から任務の地域への細い点線
  const airLines = Object.entries(view.plan?.air ?? {}).flatMap(([side, list]) =>
    list.flatMap((o) => {
      const w = view.wings.find((x) => x.id === o.wing);
      return w && o.region && o.region !== w.base ? [{ key: `${side}-${o.wing}`, from: w.base, to: o.region, side }] : [];
    }),
  );

  return (
    <div className="opmap-wrap">
    <svg className="opmap" viewBox={`0 0 ${W} ${H}`} data-testid="campaign-map" ref={svgRef} {...handlers}>
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
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={l.kind === "sea" ? SEA_COLOR : "#6b5d45"}
              strokeWidth={l.kind === "rail" ? 5 : 3}
              strokeDasharray={l.kind === "track" ? "6 6" : l.kind === "sea" ? "2 6" : undefined}
              opacity={0.7}
            />
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
      {airLines.map((l) => {
        const a = pos(l.from);
        const b = pos(l.to);
        return <line key={l.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SIDE_COLORS[sideIndex(l.side)]} strokeWidth={1.5} strokeDasharray="3 4" opacity={0.9} />;
      })}
      {Object.entries(detail.regions).map(([id, r]) => {
        const p = pos(id);
        const owner = control[id];
        const i = owner ? sideIndex(owner) : -1;
        const target = reachable?.has(id);
        // 海域は波の色の角の丸い四角(持ち主=制海権の色の縁)、陸の地域は丸
        return (
          <g key={id} className={`region${target ? " target" : ""}`} onClick={() => onRegion(id)} data-testid={`campaign-region-${id}`}>
            {r.sea ? (
              <rect x={p.x - 34} y={p.y - 22} width={68} height={44} rx={14} fill={SEA_COLOR} fillOpacity={0.25} stroke={i >= 0 ? SIDE_COLORS[i] : SEA_COLOR} strokeWidth={target ? 4 : 2} />
            ) : (
              <circle cx={p.x} cy={p.y} r={26} fill={i >= 0 ? SIDE_COLORS[i] : "#bbb"} fillOpacity={0.28} stroke={i >= 0 ? SIDE_COLORS[i] : "#888"} strokeWidth={target ? 4 : 2} />
            )}
            {supplyOf(id) && <rect x={p.x - 7} y={p.y - 7} width={14} height={14} fill={SIDE_COLORS[sideIndex(supplyOf(id)!)]} />}
            {r.supplyVia && (
              <text x={p.x + 12} y={p.y + 5} fontSize={13}>
                ⚓<title>港の補給の源({detail.regions[r.supplyVia]?.name ?? r.supplyVia}を敵に押さえられると働かない)</title>
              </text>
            )}
            {r.airbase && (
              <text x={p.x - 26} y={p.y + 5} fontSize={14}>
                ✈<title>航空基地</title>
              </text>
            )}
            {battles.has(id) && (
              <text x={p.x} y={p.y + 8} textAnchor="middle" fontSize={24}>
                ⚔
              </text>
            )}
            <text x={p.x} y={p.y + 44} textAnchor="middle" fontSize={15} fill="#2b2418">
              {shortRegionName(r.name)}
              {points[id] ? ` ★${points[id]}` : ""}
              <title>{r.name}</title>
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
            <g key={f.id} className="formation-chip" onClick={() => onFormation(f.id)} data-testid={`campaign-chip-${f.id}`} opacity={f.intel?.seen === "stale" ? 0.55 : 1}>
              <rect
                x={x}
                y={y}
                width={58}
                height={19}
                rx={2}
                fill={f.id === selected ? "#fff6c8" : "#f5eedb"}
                stroke={SIDE_COLORS[i]}
                strokeWidth={f.side === mine ? 2.5 : 1.5}
                strokeDasharray={f.intel?.seen === "stale" ? "4 3" : undefined}
              />
              <text x={x + 29} y={y + 14} textAnchor="middle" fontSize={11} fill={SIDE_COLORS[i]}>
                {f.naval ? "⚓" : ""}
                {f.name.length > 6 ? f.name.slice(0, f.naval ? 5 : 6) : f.name}
              </text>
              <title>
                {f.intel
                  ? `${f.name}(報告)・戦力 ${f.intel.powerRange[0]}〜${f.intel.powerRange[1]}${f.intel.firepowerRange ? `・火力 ${f.intel.firepowerRange[0]}〜${f.intel.firepowerRange[1]}` : ""}・${f.intel.seen === "stale" ? `第${f.intel.stage}段階の古い情報` : "今の段階の情報"}`
                  : `${f.name}・戦力 ${f.power}${f.firepower !== undefined ? `・火力 ${f.firepower}` : ""}${f.supplied ? "" : "・補給なし"}`}
              </title>
            </g>
          );
        });
      })}
      {Object.keys(detail.regions).map((id) => {
        const p = pos(id);
        const here = view.wings.filter((w) => w.base === id);
        return here.map((w, k) => {
          const i = sideIndex(w.side);
          const x = p.x - 60 + (k % 2) * 62;
          const y = p.y + 50 + Math.floor(k / 2) * 18;
          return (
            <g key={w.id} data-testid={`campaign-wing-${w.id}`}>
              <rect x={x} y={y} width={58} height={16} rx={8} fill="#eef3f8" stroke={SIDE_COLORS[i]} strokeWidth={w.side === mine ? 2 : 1} />
              <text x={x + 29} y={y + 12} textAnchor="middle" fontSize={10} fill={SIDE_COLORS[i]}>
                ✈{w.fighters.toFixed(1)}/{w.strike.toFixed(1)}
              </text>
              <title>
                {w.name}・戦闘機 {w.fighters.toFixed(1)}・攻撃機 {w.strike.toFixed(1)} 編隊・航続 {w.rangeKm}km
              </title>
            </g>
          );
        });
      })}
    </svg>
      <div className="opmap-zoom">
        <button type="button" onClick={() => setZoom(1.5)} title="拡大(Ctrl+ホイール・ピンチでも)" data-testid="campaign-zoom-in">＋</button>
        <button type="button" onClick={() => setZoom(1 / 1.5)} title="縮小" data-testid="campaign-zoom-out">−</button>
        <button type="button" onClick={() => setZoom(0)} title="全体を見る" data-testid="campaign-zoom-fit">全体</button>
        {zoom.z > 1 && <span className="muted">×{zoom.z.toFixed(1)}・ドラッグかホイールで動かす</span>}
      </div>
    </div>
  );
}

const ZOOM_MAX = 6;

/**
 * 戦役地図の拡大縮小とスクロール(倍率 z と、拡大した地図のずらし x・y。どれも SVG の座標)。
 * Ctrl+ホイール・2本指のピンチ・ボタンで拡大縮小、拡大中はホイール・ドラッグでスクロール。ドラッグの後のクリックは地域・札に届けない
 */
function useMapZoom(W: number, H: number) {
  const [zoom, setZoomState] = useState({ z: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const clamp = (v: { z: number; x: number; y: number }) => {
    const z = Math.min(ZOOM_MAX, Math.max(1, v.z));
    return { z, x: Math.min(0, Math.max(W - W * z, v.x)), y: Math.min(0, Math.max(H - H * z, v.y)) };
  };
  /** 画面の点を SVG の座標に */
  const toSvg = (cx: number, cy: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width > 0 ? { x: ((cx - r.left) * W) / r.width, y: ((cy - r.top) * H) / r.height } : { x: W / 2, y: H / 2 };
  };
  /** 点 (px, py) を動かさずに倍率を f 倍に */
  const zoomAt = (f: number, px: number, py: number) =>
    setZoomState((v) => {
      const z = Math.min(ZOOM_MAX, Math.max(1, v.z * f));
      return clamp({ z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z });
    });
  // ホイール:Ctrl(トラックパッドのピンチも Ctrl つきで届く)は拡大縮小、拡大中はスクロール。ページのスクロールを止めるため passive でない聞き手で
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const p = toSvg(e.clientX, e.clientY);
        zoomAt(Math.exp(-e.deltaY * 0.002), p.x, p.y);
        return;
      }
      // 拡大していないときは、ページのスクロールに任せる
      if (zoomRef.current.z <= 1) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const k = W / Math.max(1, r.width);
      setZoomState((v) => clamp({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX) * k, y: v.y - (e.shiftKey ? 0 : e.deltaY) * k }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  // ドラッグ(1本指・マウス)でスクロール、2本指でピンチ
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; pinch: number | null }>({ moved: false, pinch: null });
  const handlers = {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 1) drag.current = { moved: false, pinch: null };
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        drag.current.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    },
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const last = pointers.current.get(e.pointerId);
      if (!last) return;
      const now = { x: e.clientX, y: e.clientY };
      pointers.current.set(e.pointerId, now);
      if (pointers.current.size === 2 && drag.current.pinch) {
        const [a, b] = [...pointers.current.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mid = toSvg((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        zoomAt(d / drag.current.pinch, mid.x, mid.y);
        drag.current.pinch = d;
        drag.current.moved = true;
        return;
      }
      const dx = now.x - last.x;
      const dy = now.y - last.y;
      if (zoomRef.current.z <= 1 || dx === 0 && dy === 0) return;
      const r = svgRef.current?.getBoundingClientRect();
      const k = r ? W / Math.max(1, r.width) : 1;
      drag.current.moved = true;
      setZoomState((v) => clamp({ ...v, x: v.x + dx * k, y: v.y + dy * k }));
    },
    onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) drag.current.pinch = null;
    },
    onPointerCancel: (e: React.PointerEvent<SVGSVGElement>) => {
      pointers.current.delete(e.pointerId);
    },
    // ドラッグ・ピンチの後のクリックは、地域・札の選択にしない
    onClickCapture: (e: React.MouseEvent<SVGSVGElement>) => {
      if (drag.current.moved) {
        e.stopPropagation();
        drag.current.moved = false;
      }
    },
  };
  /** ボタン:f 倍(0 は全体を見る)。真ん中を中心に */
  const setZoom = (f: number) => (f === 0 ? setZoomState({ z: 1, x: 0, y: 0 }) : zoomAt(f, W / 2, H / 2));
  return { zoom, svgRef, handlers, setZoom };
}
