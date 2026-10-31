import { useState } from "react";
import type { Game, ProgressPoint } from "./game.js";
import { clockOf } from "./geo.js";
import { SIDE_COLORS } from "./MapView.js";
import { downloadOnlineRecord, downloadRecord } from "./saves.js";
import { conditionText } from "./victory.js";
import { unitLabel } from "./names.js";

const LEVEL: Record<string, string> = { decisive: "決定的勝利", limited: "限定的勝利", draw: "引き分け" };
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

/** 自陣営から見た結果の段階(決定的勝利 2 〜 決定的敗北 −2) */
function rankFor(me: string, winner: string | null, level: string): number {
  if (!winner || level === "draw") return 0;
  const k = level === "decisive" ? 2 : 1;
  return winner === me ? k : -k;
}

/**
 * 結果の画面(戦闘詳報):勝敗と、史実の結末との比べ、目標の最終的な持ち主、両軍の損耗とその推移、自軍の部隊の損害、戦闘の経過。
 * 「地図を見る」で閉じて、終わった後の地図を眺められる(右下の札で開き直す)
 */
export function ResultScreen({ game }: { game: Game }) {
  const { s } = game;
  const [hidden, setHidden] = useState(false);
  const r = s.last?.result;
  if (s.phase !== "over" || !r || !s.info || !s.view) return null;
  const info = s.info;
  const view = s.view;
  const me = info.mySide;
  const sideName = (id: string | null) => (id ? (info.sides.find((x) => x.id === id)?.name ?? id) : "—");
  const myIndex = info.sides.findIndex((x) => x.id === me);
  const enemy = info.sides.find((x) => x.id !== me);
  const enemyIndex = info.sides.findIndex((x) => x.id === enemy?.id);

  if (hidden) {
    return (
      <button className="reopen-result" onClick={() => setHidden(false)} data-testid="reopen-result">
        戦闘詳報を開く
      </button>
    );
  }

  const myRank = rankFor(me, r.winner, r.level);
  const verdict = myRank > 0 ? "勝利" : myRank < 0 ? "敗北" : "引き分け";
  const resultText = r.winner ? `${sideName(r.winner)}の${LEVEL[r.level]}` : "引き分け";
  const h = info.historicalOutcome;
  const histRank = h ? rankFor(me, h.winner, h.level) : null;
  const versus = histRank === null ? null : myRank > histRank ? "史実より良い結果" : myRank < histRank ? "史実より悪い結果" : "史実どおりの結果";
  const mine = r.perSide[me];
  const theirs = enemy ? r.perSide[enemy.id] : undefined;
  const myVictory = info.victory[me];
  const end = clockOf(info.startHour, view.time, info.startDate);
  const ownNow = new Map(view.own.map((u) => [u.id, u]));

  return (
    <div className="paper result-screen" data-testid="result-screen">
      <div className="result-sheet">
        <header className="result-head">
          <div className="classified">戦闘詳報</div>
          <h2>{info.name}</h2>
          <p className="muted">
            {sideName(me)}・{end} 終了
          </p>
          <div className={`verdict-stamp ${myRank > 0 ? "win" : myRank < 0 ? "loss" : "draw"}`} data-testid="verdict">
            {verdict}
          </div>
          <p className="result-line">{resultText}</p>
        </header>

        {h && (
          <section className="history-compare">
            <h3>史実との比較</h3>
            <p>
              史実:<b>{h.winner ? `${sideName(h.winner)}の${LEVEL[h.level]}` : "引き分け"}</b>。{h.summary}
            </p>
            <p className={`versus ${myRank > histRank! ? "better" : myRank < histRank! ? "worse" : "same"}`} data-testid="versus-history">
              {versus}
            </p>
          </section>
        )}

        <div className="result-grid">
          <section>
            <h3>目標</h3>
            <table className="ledger">
              <thead>
                <tr>
                  <th>目標</th>
                  <th>重み</th>
                  <th>始め</th>
                  <th>終わり</th>
                </tr>
              </thead>
              <tbody>
                {info.objectives.map((o) => {
                  const now = view.objectives[o.id] ?? null;
                  const changed = now !== (o.initialHolder ?? null);
                  return (
                    <tr key={o.id}>
                      <td style={now ? { boxShadow: `inset 3px 0 0 ${SIDE_COLORS[info.sides.findIndex((x) => x.id === now)] ?? "#333"}` } : undefined}>{o.name}</td>
                      <td className="num">{o.weight}</td>
                      <td>{sideName(o.initialHolder ?? null)}</td>
                      <td>
                        {sideName(now)}
                        {changed && <span className="changed">変化</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <table className="ledger totals">
              <thead>
                <tr>
                  <th></th>
                  <th>勝利点</th>
                  <th>自軍の損耗</th>
                  <th>敵に与えた損耗</th>
                </tr>
              </thead>
              <tbody>
                {[me, ...(enemy ? [enemy.id] : [])].map((id) => {
                  const v = r.perSide[id];
                  if (!v) return null;
                  return (
                    <tr key={id}>
                      <th>{sideName(id)}</th>
                      <td className="num">{Math.round(v.points * 10) / 10}</td>
                      <td className="num">{pct(v.ownLoss)}</td>
                      <td className="num">{pct(v.enemyLoss)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mine && myVictory && mine.conditions.length > 0 && (
              <ul className="conditions" data-testid="result-conditions">
                {mine.conditions.map((c) => {
                  const def = myVictory.conditions.find((x) => x.id === c.id);
                  if (!def) return null;
                  return (
                    <li key={c.id} className={c.met ? "met" : "unmet"}>
                      {c.met ? "✓" : "✗"} {def.secret ? "(秘密)" : ""}
                      {conditionText(def, info.objectives)}
                      {def.points > 0 && <span className="muted">(勝利点 {Math.round(c.points * 10) / 10} / {def.points})</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {theirs && theirs.secrets.length > 0 && (
              <ul className="conditions" data-testid="result-enemy-secrets">
                <li className="muted">敵の秘密の副目標:</li>
                {theirs.secrets.map((def) => {
                  const c = theirs.conditions.find((x) => x.id === def.id);
                  return (
                    <li key={def.id} className={c?.met ? "met" : "unmet"}>
                      {c?.met ? "✓" : "✗"} {conditionText(def, info.objectives)}
                      <span className="muted">(勝利点 {Math.round((c?.points ?? 0) * 10) / 10} / {def.points})</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3>損耗の推移</h3>
            <LossChart
              points={s.history}
              own={{ name: sideName(me), color: SIDE_COLORS[myIndex] ?? "#2f6db5", final: mine?.ownLoss }}
              enemy={{ name: enemy ? sideName(enemy.id) : "敵", color: SIDE_COLORS[enemyIndex] ?? "#c0392b", final: theirs?.ownLoss }}
              label={(turn) => `${turn}ターン目`}
            />
            <p className="muted">敵の線は、戦いの最中に見えていたものからの見積もり(点線)。右端の点は、終わってから明かされた本当の値。</p>
          </section>
        </div>

        <section>
          <h3>自軍の部隊</h3>
          <table className="ledger units">
            <thead>
              <tr>
                <th>部隊</th>
                <th>編成</th>
                <th>戦力</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {[...s.startOwn, ...view.own.filter((u) => !s.startOwn.some((x) => x.id === u.id)).map((u) => ({ id: u.id, toe: u.toe }))].map((u) => {
                const now = ownNow.get(u.id);
                return (
                  <tr key={u.id} className={now ? "" : "gone"}>
                    <td>{unitLabel(u.id)}</td>
                    <td>{info.toeNames[u.toe] ?? u.toe}</td>
                    <td className="num">
                      {now ? (
                        <span className="bar">
                          <span style={{ width: `${Math.round(now.strength * 100)}%` }} />
                          <em>{Math.round(now.strength * 100)}%</em>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{now ? (now.routed ? "潰走" : now.morale < 0.5 ? "動揺" : "健在") : "失われた"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {s.chronicle.length > 0 && (
          <section>
            <h3>戦闘の経過</h3>
            <ol className="chronicle">
              {s.chronicle.map((e, i) => (
                <li key={i} className={e.kind}>
                  <span className="when">{clockOf(info.startHour, e.time, info.startDate)}</span>
                  {e.text}
                </li>
              ))}
            </ol>
            {s.resumed && <p className="muted">続きから再開した試合では、再開した後の出来事だけを載せています。</p>}
          </section>
        )}

        <nav className="result-actions">
          {info.id.startsWith("camp:") ? (
            <button className="primary" onClick={() => game.toMenu("campaign")} data-testid="result-to-campaign">
              作戦地図へ戻る(結果を報告する)
            </button>
          ) : s.online ? (
            s.online.record && (
              <button className="primary" onClick={() => downloadOnlineRecord(s.online!.record, `${info.id}-online-${s.online!.code}`)}>
                試合の記録を書き出す(両陣営の命令)
              </button>
            )
          ) : (
            <>
              <button className="primary" onClick={() => game.start({ scenarioId: info.id, side: me })} data-testid="result-again">
                もう一度
              </button>
              {enemy && (
                <button onClick={() => game.start({ scenarioId: info.id, side: enemy.id })} data-testid="result-swap">
                  {sideName(enemy.id)}で戦う
                </button>
              )}
            </>
          )}
          {!info.id.startsWith("camp:") && (
            <button onClick={() => game.toMenu("scenarios")} data-testid="result-to-scenarios">
              作戦の選択へ
            </button>
          )}
          <button onClick={() => game.toMenu()}>表紙へ</button>
          {!s.online && s.record && <button onClick={() => downloadRecord(s.record!, `${info.id}-${me}-result`)}>記録を書き出す</button>}
          <button onClick={() => setHidden(true)} data-testid="result-map">
            地図を見る
          </button>
        </nav>
      </div>
    </div>
  );
}

/**
 * 損耗の推移の折れ線(1つの軸=損耗率)。自軍は実線、敵は見積もりなので点線。凡例と線の端の名札、
 * 指を置くと縦線とそのターンの値。final があれば右端に本当の値の点を打つ
 */
function LossChart({
  points,
  own,
  enemy,
  label,
}: {
  points: ProgressPoint[];
  own: { name: string; color: string; final: number | undefined };
  enemy: { name: string; color: string; final: number | undefined };
  label: (turn: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="muted">推移を描くには、ターンが足りません。</p>;
  const W = 520;
  const H = 200;
  const pad = { l: 40, r: 48, t: 12, b: 26 };
  const maxV = Math.max(0.05, ...points.flatMap((p) => [p.ownLoss, p.enemyLoss]), own.final ?? 0, enemy.final ?? 0);
  const top = Math.ceil(maxV * 20) / 20; // 5%刻みで切り上げ
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const path = (k: "ownLoss" | "enemyLoss") => points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(top / 0.05) + 1 }, (_, i) => i * 0.05).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  const last = points.length - 1;
  const hp = hover !== null ? points[hover] : null;
  // 線の端の名札が重ならないように、近ければ上下に離す
  let ownLabelY = y(own.final ?? points[last]!.ownLoss) + 4;
  let enemyLabelY = y(enemy.final ?? points[last]!.enemyLoss) + 4;
  if (Math.abs(ownLabelY - enemyLabelY) < 13) {
    const mid = (ownLabelY + enemyLabelY) / 2;
    const ownAbove = ownLabelY <= enemyLabelY;
    ownLabelY = mid + (ownAbove ? -7 : 7);
    enemyLabelY = mid + (ownAbove ? 7 : -7);
  }

  return (
    <div className="loss-chart">
      <div className="chart-legend">
        <span>
          <svg width="22" height="8">
            <line x1="0" y1="4" x2="22" y2="4" stroke={own.color} strokeWidth="2" />
          </svg>
          {own.name}の損耗
        </span>
        <span>
          <svg width="22" height="8">
            <line x1="0" y1="4" x2="22" y2="4" stroke={enemy.color} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          {enemy.name}の損耗(見積もり)
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`損耗の推移:${own.name} ${pct(points[last]!.ownLoss)}、${enemy.name}(見積もり) ${pct(points[last]!.enemyLoss)}`}
        onMouseMove={(e) => {
          const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * last);
          setHover(Math.max(0, Math.min(last, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="tick">
          {label(points[0]!.turn)}
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="tick">
          {label(points[last]!.turn)}
        </text>
        <path d={path("enemyLoss")} fill="none" stroke={enemy.color} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
        <path d={path("ownLoss")} fill="none" stroke={own.color} strokeWidth="2" strokeLinejoin="round" />
        {own.final !== undefined && <circle cx={x(last)} cy={y(own.final)} r="4" fill={own.color} stroke="#f6efdc" strokeWidth="2" />}
        {enemy.final !== undefined && <circle cx={x(last)} cy={y(enemy.final)} r="4" fill={enemy.color} stroke="#f6efdc" strokeWidth="2" />}
        <text x={x(last) + 8} y={ownLabelY} className="end-label">
          {pct(own.final ?? points[last]!.ownLoss)}
        </text>
        <text x={x(last) + 8} y={enemyLabelY} className="end-label">
          {pct(enemy.final ?? points[last]!.enemyLoss)}
        </text>
        {hp && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="crosshair" />
            <circle cx={x(hover)} cy={y(hp.ownLoss)} r="4" fill={own.color} stroke="#f6efdc" strokeWidth="2" />
            <circle cx={x(hover)} cy={y(hp.enemyLoss)} r="4" fill={enemy.color} stroke="#f6efdc" strokeWidth="2" />
          </g>
        )}
      </svg>
      <p className="chart-readout" aria-live="polite">
        {hp ? `${label(hp.turn)}:${own.name} ${pct(hp.ownLoss)}・${enemy.name}(見積もり) ${pct(hp.enemyLoss)}` : " "}
      </p>
    </div>
  );
}
