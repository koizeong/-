import type { MonthReport, Posture, UnitTemplate, WarDef, WarDesign, WarOrders, WarResult, WarSnapshot, WarUnit } from "@brigade/campaign";
import { useEffect, useMemo, useState } from "react";
import { SIDE_COLORS } from "./MapView.js";
import { campaignKey, putCampaignSave, setActiveCampaign } from "./campaignSaves.js";
import type { CampaignSnapshot } from "@brigade/campaign";

/**
 * 戦争モード(docs/war-design.md):戦争地図・戦線の力と構え・研究・生産・軍団の配分・月の報告。
 * サーバーは進み具合を持たず、画面がブラウザに残した記録(WarSnapshot)を送って1か月ずつ解いてもらう
 */

type Summary = { id: string; name: string; description?: string; sides: { id: string; name: string }[]; start: string; months: number };
type FrontView = {
  id: string;
  open: boolean;
  opens?: string;
  boundary: number;
  posture: Posture;
  enemyPosture: Posture;
  power: { own: { attack: number; defend: number }; enemy: { attack: number; defend: number } };
  enemyUnits: number;
  campaigns: { campaignId: string; from: string; to: string }[];
  window: { campaignId: string; from: string; to: string } | null;
  campaign?: { campaignId: string; until: number; pending: boolean };
};
type View = {
  date: string;
  month: number;
  months: number;
  result: WarResult | null;
  vp: Record<string, number>;
  stock: { industry: number; manpower: number; fuel: number };
  enemyStock: { industry: number; manpower: number; fuel: number };
  research: { done: string[]; progress: Record<string, number>; current: string | null; share: number };
  researchable: string[];
  buildable: string[];
  queue: { template: string; done: string }[];
  owners: Record<string, string>;
  fronts: FrontView[];
  units: WarUnit[];
  last: MonthReport | null;
  campaignNames: Record<string, string>;
  designCaps: Record<"infantry" | "armor" | "air", number>;
  designs: Record<string, WarDesign & { ready: string }>;
  campaignResults: { month: number; front: string; campaignId: string; winner: string | null; level: string; moved: number; captured: string[]; losses: Record<string, number> }[];
};
type Reply = { snapshot: WarSnapshot; view: View; report?: MonthReport; errors?: string[]; campaign?: CampaignSnapshot; campaignName?: string; sideName?: string };

const SAVE_KEY = "brigade.war.v1";
/** 戦役の地図で戦っている戦線と、その戦役の記録の枠(戦役の画面から戦争へ戻るのに使う) */
const LINK_KEY = "brigade.war.campaign";
type WarLink = { key: string; front: string; campaignName: string };
export const warLink = (): WarLink | null => {
  try {
    const s = localStorage.getItem(LINK_KEY);
    return s ? (JSON.parse(s) as WarLink) : null;
  } catch {
    return null;
  }
};
const setWarLink = (l: WarLink | null) => {
  try {
    if (l) localStorage.setItem(LINK_KEY, JSON.stringify(l));
    else localStorage.removeItem(LINK_KEY);
  } catch {
    /* 保存できなくても遊べる */
  }
};
/** 戦役の画面を開く(戦役の記録の枠を開いた状態で) */
const openCampaign = (key: string) => {
  setActiveCampaign(key);
  window.location.href = "/?menu=campaign";
};
const post = async (path: string, body: unknown): Promise<Reply> => {
  const r = await fetch(path, { method: "POST", body: JSON.stringify(body) });
  const j = (await r.json()) as Reply;
  if (!r.ok) throw new Error(j.errors?.join(" / ") ?? `失敗しました(${r.status})`);
  return j;
};
const loadSave = (): WarSnapshot | null => {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    return s ? (JSON.parse(s) as WarSnapshot) : null;
  } catch {
    return null;
  }
};
const store = (s: WarSnapshot | null) => {
  try {
    if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 保存できなくても遊べる */
  }
};
const r0 = (x: number) => Math.round(x);
const LEVEL: Record<string, string> = { decisive: "決定的勝利", limited: "限定的勝利", draw: "引き分け" };
const KIND: Record<string, string> = { infantry: "歩兵", armor: "機甲", air: "航空" };

/** 戦争:一覧から始めるか、ブラウザに残した続きを開く */
export function WarSection() {
  const [list, setList] = useState<Summary[] | null>(null);
  const [snap, setSnap] = useState<WarSnapshot | null>(() => loadSave());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/wars")
      .then((r) => r.json() as Promise<Summary[]>)
      .then((x) => setList(Array.isArray(x) ? x : []))
      .catch(() => setError("戦争の一覧を読み込めませんでした"));
  }, []);
  const start = (warId: string, side: string) => {
    setError(null);
    post("/api/war/start", { warId, side })
      .then((r) => {
        store(r.snapshot);
        setSnap(r.snapshot);
      })
      .catch((e: Error) => setError(e.message));
  };
  if (snap) {
    return (
      <WarBoard
        snapshot={snap}
        onChange={(s) => {
          store(s);
          setSnap(s);
        }}
        onClose={() => setSnap(null)}
        onDiscard={() => {
          store(null);
          setSnap(null);
        }}
      />
    );
  }
  return (
    <div className="war-list">
      {error && <p className="note">{error}</p>}
      {!list && !error && <p className="muted">読み込んでいます…</p>}
      {list?.length === 0 && <p className="muted">戦争がありません(data/wars)。</p>}
      {list?.map((w) => (
        <div key={w.id} className="paper war-card" data-testid={`war-${w.id}`}>
          <h3>{w.name}</h3>
          <p>{w.description}</p>
          <p className="muted">
            {w.start} から {w.months} か月(1手番=1か月)
          </p>
          {w.sides.map((s) => (
            <button key={s.id} onClick={() => start(w.id, s.id)} data-testid={`war-start-${s.id}`}>
              {s.name}で始める
            </button>
          ))}
        </div>
      ))}
      {loadSave() && <p className="muted">続きがあります。</p>}
    </div>
  );
}

/** 戦争の盤:地図・戦線・研究・生産・配分・報告 */
function WarBoard({ snapshot, onChange, onClose, onDiscard }: { snapshot: WarSnapshot; onChange: (s: WarSnapshot) => void; onClose: () => void; onDiscard: () => void }) {
  const [def, setDef] = useState<WarDef | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [orders, setOrders] = useState<WarOrders>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/war?id=${encodeURIComponent(snapshot.warId)}`)
      .then((r) => r.json() as Promise<WarDef>)
      .then(setDef)
      .catch(() => setError("戦争の定義を読み込めませんでした"));
    post("/api/war/view", { snapshot })
      .then((r) => setView(r.view))
      .catch((e: Error) => setError(e.message));
  }, [snapshot]);
  if (error) return <p className="note">{error}</p>;
  if (!def || !view) return <p className="muted">戦争地図を広げています…</p>;
  const side = snapshot.side;
  const enemy = def.sides.find((s) => s.id !== side)!.id;
  const sideName = (id: string) => def.sides.find((s) => s.id === id)?.name ?? id;
  const tpl = (id: string): UnitTemplate | undefined => def.templates[id] ?? view.designs[id];
  const tname = (id: string) => tpl(id)?.name ?? id;
  const produce = orders.produce ?? [];
  const moves = orders.moves ?? [];
  const posture = (fid: string) => orders.postures?.[fid] ?? view.fronts.find((f) => f.id === fid)!.posture;
  // 注文した分を差し引いた備蓄(画面の見込み)
  const left = { ...view.stock };
  for (const t of produce) for (const k of ["industry", "manpower", "fuel"] as const) left[k] -= tpl(t)!.cost[k];
  const affordable = (tid: string) => (["industry", "manpower", "fuel"] as const).every((k) => left[k] >= tpl(tid)!.cost[k]);
  const advance = () => {
    setBusy(true);
    setError(null);
    post("/api/war/advance", { snapshot, orders })
      .then((r) => {
        setOrders({});
        onChange(r.snapshot);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const pending = view.fronts.some((f) => f.campaign?.pending);
  const startCampaign = (front: string) => {
    setBusy(true);
    setError(null);
    post("/api/war/campaign/start", { snapshot, front })
      .then((r) => {
        onChange(r.snapshot);
        const saved = putCampaignSave({ name: r.campaignName ?? r.campaign!.campaignId, sideName: r.sideName ?? "", snapshot: r.campaign! });
        setWarLink({ key: saved.key ?? campaignKey(r.campaign!), front, campaignName: r.campaignName ?? "" });
        openCampaign(saved.key);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const destOf = (u: WarUnit) => moves.find((m) => m.unitId === u.id)?.to;
  const groups: { id: string | null; name: string }[] = [{ id: null, name: "予備" }, ...view.fronts.map((f) => ({ id: f.id, name: def.fronts[f.id]!.name }))];

  return (
    <div className="war-board" data-testid="war-board">
      <div className="war-top paper">
        <strong>{def.name}</strong>
        <span>{view.date}</span>
        <span>
          {sideName(side)}:工業力 {r0(view.stock.industry)}・人的資源 {r0(view.stock.manpower)}・燃料 {r0(view.stock.fuel)}
        </span>
        <span>
          勝利点 {sideName(side)} {view.vp[side]} / {sideName(enemy)} {view.vp[enemy]}
        </span>
        <button onClick={onClose}>一覧へ</button>
        <button
          onClick={() => {
            if (confirm("この戦争の記録を消しますか?")) onDiscard();
          }}
        >
          記録を消す
        </button>
      </div>
      {view.result && (
        <div className="paper war-result" data-testid="war-result">
          <h3>
            {view.result.winner ? `${sideName(view.result.winner)}の${LEVEL[view.result.level]}` : "引き分け"}({view.result.reason})
          </h3>
        </div>
      )}
      <div className="war-main">
        <WarMap def={def} view={view} side={side} />
        <div className="war-side">
          <section className="paper">
            <h4>戦線</h4>
            {view.fronts.map((f) => {
              const fd = def.fronts[f.id]!;
              const ownP = posture(f.id) === "attack" ? f.power.own.attack : f.power.own.defend;
              const enP = f.enemyPosture === "attack" ? f.power.enemy.attack : f.power.enemy.defend;
              return (
                <div key={f.id} className="war-front" data-testid={`front-${f.id}`}>
                  <div>
                    <strong>{fd.name}</strong> {!f.open && <span className="muted">({f.opens ?? "閉じている"} から)</span>}
                  </div>
                  <div className="muted">
                    力 自軍 {r0(ownP)} / 敵 {r0(enP)}(敵の軍団 {f.enemyUnits})
                    {f.campaigns.map((c) => (
                      <span key={c.campaignId}> ・戦役の時期:{view.campaignNames[c.campaignId] ?? c.campaignId}({c.from}〜{c.to})</span>
                    ))}
                  </div>
                  {f.window && !f.campaign && (
                    <div>
                      <button onClick={() => startCampaign(f.id)} disabled={busy} data-testid={`war-campaign-${f.id}`} title="この戦線の史実の戦役を戦役の地図で戦う。戦争の戦線の力の比に合わせて、劣る側の始めの戦力を下げる">
                        戦役で戦う:{view.campaignNames[f.window.campaignId] ?? f.window.campaignId}
                      </button>
                    </div>
                  )}
                  {f.campaign && (
                    <div className="note">
                      {f.campaign.pending ? (
                        <>
                          戦役で戦っています({view.campaignNames[f.campaign.campaignId] ?? f.campaign.campaignId})。終えて報告するまで戦争は進みません。{" "}
                          {warLink()?.front === f.id && <button onClick={() => openCampaign(warLink()!.key)}>戦役を開く</button>}
                        </>
                      ) : (
                        <>戦役({view.campaignNames[f.campaign.campaignId] ?? f.campaign.campaignId})の結果を反映済み。時期の終わりまでこの戦線は動きません</>
                      )}
                    </div>
                  )}
                  {f.open && !f.campaign && (
                    <div>
                      {(["defend", "attack"] as const).map((p) => (
                        <button key={p} className={posture(f.id) === p ? "primary" : ""} onClick={() => setOrders({ ...orders, postures: { ...orders.postures, [f.id]: p } })} data-testid={`posture-${f.id}-${p}`}>
                          {p === "attack" ? "攻勢" : "守勢"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
          <section className="paper">
            <h4>研究</h4>
            <div>
              研究に回す工業力{" "}
              <input
                type="range"
                min={0}
                max={def.rules.maxResearchShare}
                step={0.05}
                value={orders.researchShare ?? view.research.share}
                onChange={(e) => setOrders({ ...orders, researchShare: Number(e.target.value) })}
              />{" "}
              {Math.round((orders.researchShare ?? view.research.share) * 100)}%
            </div>
            <div>
              研究中:
              {view.research.current ? `${def.tech[view.research.current]?.name}(${r0(view.research.progress[view.research.current] ?? 0)} / ${def.tech[view.research.current]?.cost})` : "なし"}
            </div>
            {view.researchable.map((t) => (
              <button key={t} className={orders.research === t ? "primary" : ""} onClick={() => setOrders({ ...orders, research: t })} title={def.tech[t]?.notes}>
                {def.tech[t]!.name}({def.tech[t]!.cost})
              </button>
            ))}
            {view.research.done.length > 0 && <div className="muted">済み:{view.research.done.map((t) => def.tech[t]?.name ?? t).join("・")}</div>}
          </section>
          <DesignPanel def={def} view={view} snapshot={snapshot} pending={orders.design} onDesign={(d) => {
              const { design: _old, ...rest } = orders;
              setOrders(d ? { ...rest, design: d } : rest);
            }} />
          <section className="paper">
            <h4>生産</h4>
            {view.buildable.map((t) => {
              const d = tpl(t)!;
              return (
                <button key={t} disabled={!affordable(t)} onClick={() => setOrders({ ...orders, produce: [...produce, t] })} data-testid={`produce-${t}`} title={`攻め ${d.attack}・守り ${d.defense}`}>
                  {d.name}({KIND[d.kind]}・工{d.cost.industry} 人{d.cost.manpower} 燃{d.cost.fuel}・{d.months}か月)
                </button>
              );
            })}
            {produce.length > 0 && (
              <div>
                今月の注文:{produce.map(tname).join("・")} <button onClick={() => setOrders({ ...orders, produce: [] })}>取り消す</button>
              </div>
            )}
            {view.queue.length > 0 && <div className="muted">生産中:{view.queue.map((q) => `${tname(q.template)}(${q.done})`).join("・")}</div>}
          </section>
          <section className="paper">
            <h4>軍団の配分</h4>
            {groups.map((g) => {
              const here = view.units.filter((u) => !u.moving && u.front === g.id);
              if (here.length === 0) return null;
              // 同じ型をまとめ、何個をどこへ送るかを選ぶ
              const byType = new Map<string, WarUnit[]>();
              for (const u of here) byType.set(u.template, [...(byType.get(u.template) ?? []), u]);
              return (
                <details key={g.id ?? "reserve"} className="war-group" open={g.id === null}>
                  <summary>
                    <strong>{g.name}</strong>(軍団 {here.length})
                  </summary>
                  {[...byType.entries()].map(([tid, us]) => {
                    const sending = us.filter((u) => destOf(u) !== undefined);
                    const dest = sending[0] ? destOf(sending[0]) : undefined;
                    const avg = us.reduce((t, u) => t + u.strength, 0) / us.length;
                    const send = (n: number, to: string | null | undefined) => {
                      const ids = new Set(us.map((u) => u.id));
                      const rest = moves.filter((m) => !ids.has(m.unitId));
                      const pick = [...us].sort((a, b) => b.strength - a.strength).slice(0, to === undefined ? 0 : n);
                      setOrders({ ...orders, moves: [...rest, ...pick.map((u) => ({ unitId: u.id, to: to ?? null }))] });
                    };
                    return (
                      <div key={tid} className="war-unit" data-testid={`units-${g.id ?? "reserve"}-${tid}`}>
                        {tname(tid)} ×{us.length}(平均 {Math.round(avg * 100)}%){" "}
                        <select
                          value={dest === undefined ? "" : (dest ?? "reserve")}
                          onChange={(e) => send(Math.max(1, sending.length || 1), e.target.value === "" ? undefined : e.target.value === "reserve" ? null : e.target.value)}
                        >
                          <option value="">送らない</option>
                          {groups
                            .filter((x) => x.id !== g.id)
                            .map((x) => (
                              <option key={x.id ?? "reserve"} value={x.id ?? "reserve"}>
                                → {x.name}
                              </option>
                            ))}
                        </select>
                        {dest !== undefined && (
                          <>
                            {" "}
                            <input type="number" min={1} max={us.length} value={sending.length} onChange={(e) => send(Math.max(1, Math.min(us.length, Number(e.target.value) || 1)), dest)} style={{ width: "3.5em" }} /> 個
                          </>
                        )}
                      </div>
                    );
                  })}
                </details>
              );
            })}
            {view.units.some((u) => u.moving) && (
              <div className="muted">
                移動中:{view.units.filter((u) => u.moving).map((u) => `${tname(u.template)} → ${u.moving!.to ? def.fronts[u.moving!.to]!.name : "予備"}`).join("・")}
              </div>
            )}
          </section>
          <button className="primary" disabled={busy || !!view.result || pending} onClick={advance} data-testid="war-advance">
            {busy ? "解いています…" : pending ? "戦役の結果を待っています" : "月を進める"}
          </button>
          {view.campaignResults.length > 0 && (
            <section className="paper war-log">
              <h4>戦役の結果</h4>
              {view.campaignResults.map((c, i) => (
                <div key={i}>
                  {def.fronts[c.front]?.name}・{view.campaignNames[c.campaignId] ?? c.campaignId}:{c.winner ? `${sideName(c.winner)}の${LEVEL[c.level]}` : "引き分け"}
                  {c.captured.length > 0 && ` → ${c.captured.map((r) => def.regions[r]?.name ?? r).join("・")}`}
                  <span className="muted"> 損耗 {Object.entries(c.losses).map(([sd, x]) => `${sideName(sd)} ${Math.round(x * 100)}%`).join("・")}</span>
                </div>
              ))}
            </section>
          )}
          {view.last && <MonthLog def={def} report={view.last} side={side} tname={tname} />}
        </div>
      </div>
    </div>
  );
}

/** 戦争地図:戦略地域を点で、戦線を線で結び、前線の位置に印 */
function WarMap({ def, view, side }: { def: WarDef; view: View; side: string }) {
  const color = (owner: string) => SIDE_COLORS[def.sides.findIndex((s) => s.id === owner)] ?? "#888";
  const fronts = useMemo(() => view.fronts.map((f) => ({ f, fd: def.fronts[f.id]! })), [def, view]);
  return (
    <svg className="war-map paper" viewBox="0 0 118 100" data-testid="war-map">
      {fronts.map(({ f, fd }) => (
        <g key={f.id} opacity={f.open ? 1 : 0.4}>
          <polyline points={fd.regions.map((r) => `${def.regions[r]!.mapX},${def.regions[r]!.mapY}`).join(" ")} fill="none" stroke="#7a6a4f" strokeWidth={0.4} strokeDasharray={f.open ? undefined : "1 1"} />
          {(() => {
            const a = fd.regions[f.boundary - 1];
            const b = fd.regions[f.boundary];
            if (!a || !b) return null;
            const ra = def.regions[a]!;
            const rb = def.regions[b]!;
            return <circle cx={(ra.mapX + rb.mapX) / 2} cy={(ra.mapY + rb.mapY) / 2} r={1.2} fill={f.posture === "attack" || f.enemyPosture === "attack" ? "#c0392b" : "#555"} />;
          })()}
        </g>
      ))}
      {Object.entries(def.regions).map(([id, r]) => (
        <g key={id}>
          <circle cx={r.mapX} cy={r.mapY} r={r.capitalOf ? 1.8 : 1.2} fill={color(view.owners[id]!)} stroke={r.capitalOf ? "#000" : "none"} strokeWidth={0.3} />
          <text x={r.mapX + 1.6} y={r.mapY + 0.6} fontSize={1.6} fill="#333">
            {r.name.split("(")[0]}
          </text>
        </g>
      ))}
      {def.sides.map((s, i) => (
        <g key={s.id}>
          <circle cx={3 + i * 30} cy={97} r={1.2} fill={color(s.id)} />
          <text x={5 + i * 30} y={97.7} fontSize={2} fill="#333">
            {s.name}
            {s.id === side ? "(自軍)" : ""}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 先月の報告 */
function MonthLog({ def, report, side, tname }: { def: WarDef; report: MonthReport; side: string; tname: (id: string) => string }) {
  const name = (r: string) => def.regions[r]?.name ?? r;
  const sideName = (id: string) => def.sides.find((s) => s.id === id)?.name ?? id;
  return (
    <section className="paper war-log" data-testid="war-log">
      <h4>{report.date} の報告</h4>
      {report.fronts
        .filter((f) => f.open)
        .map((f) => (
          <div key={f.front}>
            {def.fronts[f.front]!.name}:
            {f.attacker ? `${sideName(f.attacker)}の攻勢(力の比 ${f.ratio.toFixed(2)})` : "静か"}
            {f.captured.length > 0 && ` → ${f.captured.map(name).join("・")}を取った`}
            {f.noFuel.length > 0 && `(燃料不足:${f.noFuel.map(sideName).join("・")})`}
            <span className="muted">
              {" "}
              損耗 {Object.entries(f.losses).map(([s, x]) => `${sideName(s)} ${Math.round(x * 100)}%`).join("・")}
            </span>
          </div>
        ))}
      {report.produced.filter((p) => p.side === side).length > 0 && <div>完成:{report.produced.filter((p) => p.side === side).map((p) => tname(p.template)).join("・")}</div>}
      {report.researched.length > 0 && <div>研究:{report.researched.map((r) => `${sideName(r.side)}「${def.tech[r.tech]?.name}」`).join("・")}</div>}
      {report.destroyed.length > 0 && <div className="muted">壊滅した軍団 {report.destroyed.length}</div>}
      {report.rejected.filter((x) => x.side === side).map((x, i) => (
        <div key={i} className="note">
          {x.reason}
        </div>
      ))}
    </section>
  );
}

/**
 * 戦役の画面の終わりに出す「戦争へ戻る」:この戦役の枠が戦争の戦線から始めたものなら、結果を戦争へ報告して戦争の画面へ戻る
 */
export function WarReturn({ saveKey, campaign }: { saveKey: string; campaign: CampaignSnapshot }) {
  const link = warLink();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!link || link.key !== saveKey || !campaign.state.result) return null;
  const report = () => {
    const war = loadSave();
    if (!war) return setError("戦争の記録が見つかりません");
    setBusy(true);
    post("/api/war/campaign/result", { snapshot: war, front: link.front, campaign })
      .then((r) => {
        store(r.snapshot);
        setWarLink(null);
        window.location.href = "/?menu=war";
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      <button className="primary" onClick={report} disabled={busy} data-testid="war-return">
        戦争へ戻る(結果を報告)
      </button>
      {error && <p className="note">{error}</p>}
    </>
  );
}

type DesignPreview = { template: UnitTemplate; price: number } | { errors: string[] };

/**
 * 世代の中の設計(W4):研究した系統樹の項目で上がった世代の上限まで、もとの型の質を上げ、攻め・守りへ振り分ける。
 * 質を上げるほど工業力・月数・燃料が増える。設計に工業力がかかり、2か月後から作れる
 */
function DesignPanel({ def, view, snapshot, pending, onDesign }: { def: WarDef; view: View; snapshot: WarSnapshot; pending: WarOrders["design"]; onDesign: (d: WarOrders["design"] | null) => void }) {
  const bases = view.buildable.filter((t) => def.templates[t] && view.designCaps[def.templates[t]!.kind] > 0);
  const [base, setBase] = useState<string>(bases[0] ?? "");
  const [quality, setQuality] = useState(0);
  const [shift, setShift] = useState(0);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<DesignPreview | null>(null);
  const kind = def.templates[base]?.kind;
  const cap = kind ? view.designCaps[kind] : 0;
  useEffect(() => {
    if (!base) return;
    const order = { name, base, quality: Math.min(quality, cap), shift: kind === "air" ? 0 : shift };
    const timer = setTimeout(() => {
      fetch("/api/war/design/preview", { method: "POST", body: JSON.stringify({ snapshot, design: order }) })
        .then((r) => r.json() as Promise<DesignPreview>)
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 150);
    return () => clearTimeout(timer);
  }, [base, quality, shift, name, cap, kind, snapshot]);
  const own = Object.entries(view.designs);
  return (
    <section className="paper" data-testid="war-design">
      <h4>設計(世代の中の開発)</h4>
      <div className="muted">
        世代の上限(系統樹で上がる):歩兵 {Math.round(view.designCaps.infantry * 100)}%・機甲 {Math.round(view.designCaps.armor * 100)}%・航空 {Math.round(view.designCaps.air * 100)}%
      </div>
      {bases.length === 0 ? (
        <div className="muted">系統樹の項目を研究すると、その種類の型を設計できるようになります。</div>
      ) : (
        <>
          <div>
            もとの型{" "}
            <select value={base} onChange={(e) => setBase(e.target.value)} data-testid="design-base">
              {bases.map((t) => (
                <option key={t} value={t}>
                  {def.templates[t]!.name}
                </option>
              ))}
            </select>{" "}
            名前 <input value={name} placeholder="(改)" onChange={(e) => setName(e.target.value)} style={{ width: "10em" }} />
          </div>
          <div>
            質 <input type="range" min={0} max={cap} step={0.05} value={Math.min(quality, cap)} onChange={(e) => setQuality(Number(e.target.value))} data-testid="design-quality" /> +{Math.round(Math.min(quality, cap) * 100)}%
            {kind !== "air" && (
              <>
                {" "}
                守り ← <input type="range" min={-def.rules.design.maxShift} max={def.rules.design.maxShift} step={0.05} value={shift} onChange={(e) => setShift(Number(e.target.value))} /> → 攻め
              </>
            )}
          </div>
          {preview && "template" in preview && (
            <div className="muted">
              攻め {preview.template.attack.toFixed(1)}・守り {preview.template.defense.toFixed(1)}・工{Math.round(preview.template.cost.industry)} 人{Math.round(preview.template.cost.manpower)} 燃
              {Math.round(preview.template.cost.fuel)}・{preview.template.months}か月・攻勢の燃料 {preview.template.fuelPerAttack.toFixed(1)}(設計に工業力 {Math.round(preview.price)})
            </div>
          )}
          {preview && "errors" in preview && <div className="note">{preview.errors.join(" / ")}</div>}
          <button
            onClick={() => onDesign({ name, base, quality: Math.min(quality, cap), shift: kind === "air" ? 0 : shift })}
            disabled={!preview || !("template" in preview)}
            data-testid="design-order"
          >
            今月、設計する
          </button>
          {pending && (
            <span>
              {" "}
              注文:{pending.name || "(改)"} <button onClick={() => onDesign(null)}>取り消す</button>
            </span>
          )}
        </>
      )}
      {own.length > 0 && (
        <div className="muted">
          設計した型:{own.map(([id, d]) => `${d.name}(${d.ready} から)`).join("・")}
        </div>
      )}
    </section>
  );
}
