import type { MonthReport, Posture, WarDef, WarOrders, WarResult, WarSnapshot, WarUnit } from "@brigade/campaign";
import { useEffect, useMemo, useState } from "react";
import { SIDE_COLORS } from "./MapView.js";

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
};
type Reply = { snapshot: WarSnapshot; view: View; report?: MonthReport; errors?: string[] };

const SAVE_KEY = "brigade.war.v1";
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
  const tname = (id: string) => def.templates[id]?.name ?? id;
  const produce = orders.produce ?? [];
  const moves = orders.moves ?? [];
  const posture = (fid: string) => orders.postures?.[fid] ?? view.fronts.find((f) => f.id === fid)!.posture;
  // 注文した分を差し引いた備蓄(画面の見込み)
  const left = { ...view.stock };
  for (const t of produce) for (const k of ["industry", "manpower", "fuel"] as const) left[k] -= def.templates[t]!.cost[k];
  const affordable = (tid: string) => (["industry", "manpower", "fuel"] as const).every((k) => left[k] >= def.templates[tid]!.cost[k]);
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
                      <span key={c.campaignId}> ・戦役の時期:{c.campaignId}({c.from}〜{c.to})</span>
                    ))}
                  </div>
                  {f.open && (
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
          <section className="paper">
            <h4>生産</h4>
            {view.buildable.map((t) => {
              const d = def.templates[t]!;
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
          <button className="primary" disabled={busy || !!view.result} onClick={advance} data-testid="war-advance">
            {busy ? "解いています…" : "月を進める"}
          </button>
          {view.last && <MonthLog def={def} report={view.last} side={side} />}
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
function MonthLog({ def, report, side }: { def: WarDef; report: MonthReport; side: string }) {
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
      {report.produced.filter((p) => p.side === side).length > 0 && <div>完成:{report.produced.filter((p) => p.side === side).map((p) => def.templates[p.template]?.name).join("・")}</div>}
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
