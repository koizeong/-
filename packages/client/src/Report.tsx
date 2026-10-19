import type { Factor, LossBand, SideEngagement, SideStrike, SideView, UnitModifiers } from "@brigade/sim-core";
import type { ScenarioInfo } from "@brigade/protocol";
import type { Game, Gauges, ProgressPoint } from "./game.js";

/**
 * 「いま効いている補正」と「戦闘の進み具合」の表示。
 * プレイヤーの工夫(陣地・側面・予備からの反撃・制空・砲撃)が、数字で返ってくるようにする
 */

const label = (id: string) => id.replace(/^[a-z]+-/, "");
const times = (v: number) => `×${v.toFixed(2)}`;
export const pct1 = (v: number) => (v < 0.001 ? "<0.1%" : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
/** 減った量(「−1.2%」。ごく小さければ「−0.1%未満」) */
export const minus = (v: number) => (v < 0.001 ? "−0.1%未満" : `−${pct1(v)}`);

/** 敵に与えた損害の段階の名前と、目安の値(地図の色分け用。段階の真ん中あたり) */
export const BAND: Record<LossBand, { name: string; mid: number; rank: number }> = {
  slight: { name: "軽微", mid: 0.0015, rank: 0 },
  light: { name: "小", mid: 0.006, rank: 1 },
  moderate: { name: "中", mid: 0.02, rank: 2 },
  heavy: { name: "大", mid: 0.05, rank: 3 },
};

const ASPECT: Record<string, string> = { front: "正面", flank: "側面", rear: "背後" };

/** 敵の呼び名(兵種まで見えていれば兵種) */
export function contactName(contactId: string | null, view: SideView, info: ScenarioInfo): string {
  if (!contactId) return "見えない敵";
  const c = view.contacts.find((x) => x.contactId === contactId);
  const branch = c?.branch ? (info.branchNames[c.branch] ?? "") : "";
  return `敵${branch}(${contactId.replace(/^[^:]*:/, "")})`;
}

/**
 * 倍率の札。良い向きなら緑、悪い向きなら赤。
 * goodAbove:1より大きいのが良い倍率か(火力は大きいほど良い、受ける損害は小さいほど良い)
 */
function Chips({ factors, goodAbove }: { factors: readonly Factor[]; goodAbove: boolean }) {
  if (factors.length === 0) return null;
  return (
    <span className="chips">
      {factors.map((f) => {
        const good = goodAbove ? f.value > 1 : f.value < 1;
        return (
          <span key={f.id + f.label} className={`chip ${good ? "good" : "bad"}`} title={f.directOnly ? "直接射撃にだけかかる" : undefined}>
            {f.label} {times(f.value)}
          </span>
        );
      })}
    </span>
  );
}

const product = (fs: readonly Factor[], indirect = false) => fs.reduce((p, f) => (indirect && f.directOnly ? p : p * f.value), 1);

/** ユニットの欄:火力と受ける損害の倍率を大きく、その内訳を札で */
export function ModifierCard({ mods, strength }: { mods: UnitModifiers | undefined; strength: number }) {
  if (!mods) return null;
  const fire = product(mods.firepower);
  const taken = product(mods.damageTaken);
  const takenIndirect = product(mods.damageTaken, true);
  const tone = (v: number, goodAbove: boolean) => (Math.abs(v - 1) < 0.02 ? "" : (goodAbove ? v > 1 : v < 1) ? "good" : "bad");
  return (
    <div className="mods">
      <div className="mod-row">
        <div className={`big ${tone(fire, true)}`} title="撃つ力にかかっている倍率(戦力は別に掛かる)">
          <small>火力</small>
          {times(fire)}
          <small className="muted">(戦力 {Math.round(strength * 100)}% を掛けて {times(fire * strength)})</small>
        </div>
        <div className={`big ${tone(taken, false)}`} title="撃たれたときに受ける損害の倍率(撃たれる面・夜襲は別)">
          <small>受ける損害</small>
          {times(taken)}
          {Math.abs(takenIndirect - taken) > 0.01 && <small className="muted">(砲爆撃 {times(takenIndirect)})</small>}
        </div>
      </div>
      <Chips factors={mods.firepower} goodAbove />
      <Chips factors={mods.damageTaken} goodAbove={false} />
      {mods.orderDelayMinutes > 0 && <div className="muted">練度が低く、新しい命令は {mods.orderDelayMinutes} 分後から効く(それまでは前の命令のまま)</div>}
      {(mods.armor > 0 || mods.moraleCeiling < 0.995) && (
        <div className="muted">
          {mods.armor > 0 && `装甲化率 ${Math.round(mods.armor * 100)}%(非装甲向けの武器は装甲の部分にほとんど効かない)`}
          {mods.armor > 0 && mods.moraleCeiling < 0.995 && "・"}
          {mods.moraleCeiling < 0.995 && `損耗のため士気は ${Math.round(mods.moraleCeiling * 100)}% までしか戻らない`}
        </div>
      )}
    </div>
  );
}

/** 撃ち合いの相手ごとにまとめる(与えた・受けた) */
export interface Pairing {
  ownId: string;
  contactId: string | null;
  dealt?: LossBand;
  received: number;
  morale: number;
  outFactors: Factor[];
  outAspect?: string;
  inAspect?: string;
}

export function pairings(engagements: readonly SideEngagement[]): Pairing[] {
  const map = new Map<string, Pairing>();
  for (const e of engagements) {
    const key = `${e.ownId}|${e.contactId ?? "?"}`;
    const p = map.get(key) ?? { ownId: e.ownId, contactId: e.contactId, received: 0, morale: 0, outFactors: [] };
    if (e.dir === "out") {
      p.dealt = e.dealt;
      p.outFactors = e.situational;
      p.outAspect = e.aspect;
    } else {
      p.received += e.strength;
      p.morale += e.morale;
      p.inAspect = e.aspect;
    }
    map.set(key, p);
  }
  // 与えた損害が大きい順、同じなら受けた損害が大きい順
  return [...map.values()].sort((a, b) => (b.dealt ? BAND[b.dealt].rank : -1) - (a.dealt ? BAND[a.dealt].rank : -1) || b.received - a.received);
}

/** 撃ち合いの優劣(-1:押されている 〜 +1:押している)と激しさ(与えた目安+受けた) */
export function pairingBalance(p: Pairing): { balance: number; intensity: number } {
  const dealt = p.dealt ? BAND[p.dealt].mid : 0;
  const total = dealt + p.received;
  return { balance: total > 0 ? (dealt - p.received) / total : 0, intensity: total };
}

const STRIKE_NAME: Record<SideStrike["kind"], string> = {
  artillery: "砲撃",
  airStrike: "空襲",
  interdiction: "補給線への攻撃",
  closeAirSupport: "近接航空支援",
  naval: "艦砲射撃",
};

/** 損耗の推移の小さな折れ線(自軍=青、敵の見積もり=赤) */
function Sparkline({ history }: { history: ProgressPoint[] }) {
  if (history.length < 2) return null;
  const w = 280;
  const h = 46;
  const max = Math.max(0.1, ...history.flatMap((p) => [p.ownLoss, p.enemyLoss]));
  const x = (i: number) => 4 + (i / (history.length - 1)) * (w - 8);
  const y = (v: number) => h - 4 - (v / max) * (h - 8);
  const line = (k: "ownLoss" | "enemyLoss") => history.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="損耗の推移">
      <line x1={4} x2={w - 4} y1={h - 4} y2={h - 4} stroke="#ccc" />
      <path d={line("enemyLoss")} fill="none" stroke="#c0392b" strokeWidth={2} />
      <path d={line("ownLoss")} fill="none" stroke="#2f6db5" strokeWidth={2} />
      <text x={w - 4} y={10} textAnchor="end" fontSize={10} fill="#777">
        最大 {Math.round(max * 100)}%
      </text>
    </svg>
  );
}

/** このターンの自軍のゲージの変化(前のターンの始めとの差) */
export function gaugeDelta(before: Gauges | undefined, now: Gauges): Gauges | null {
  if (!before) return null;
  return { strength: now.strength - before.strength, morale: now.morale - before.morale, suppression: now.suppression - before.suppression };
}

/** 戦況:このターンの損耗、撃ち合いの相手ごとの結果、砲撃・空襲・制空の結果、損耗の推移 */
export function BattleReport({ game }: { game: Game }) {
  const { s } = game;
  const last = s.last;
  const h = s.history;
  const now = h[h.length - 1];
  const prev = h[h.length - 2];
  return (
    <section className="report" data-testid="battle-report">
      <h3>戦況{last ? `(ターン ${last.turn} の結果)` : ""}</h3>
      {now && (
        <div className="losses">
          <span className="own">
            自軍の損耗 {Math.round(now.ownLoss * 100)}%{prev && now.ownLoss - prev.ownLoss > 0.0005 && <b> (+{pct1(now.ownLoss - prev.ownLoss)})</b>}
          </span>
          <span className="enemy" title="見つけた敵の撃破と推定戦力からの見積もり">
            敵の損耗(見積もり) {Math.round(now.enemyLoss * 100)}%
            {prev && now.enemyLoss - prev.enemyLoss > 0.0005 && <b> (+{pct1(now.enemyLoss - prev.enemyLoss)})</b>}
          </span>
        </div>
      )}
      <Sparkline history={h} />
      {last && (s.phase === "planning" || s.phase === "over") && <TurnResults game={game} />}
      {!last && <p className="muted">ターンを進めると、撃ち合い・砲撃・空襲の結果と、効いた補正がここに出ます。</p>}
      {last && s.phase === "replay" && <p className="muted">再生中…(終わると結果が出ます)</p>}
      {last && s.phase === "waiting" && <p className="muted">解決を待っています…</p>}
    </section>
  );
}

function TurnResults({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const rp = s.last!.replay;
  const pairs = pairings(rp.engagements ?? []);
  const strikes = rp.strikes ?? [];
  const air = rp.hqEvents.filter((e) => e.type === "airSuperiority" || e.type === "dogfight" || e.type === "airIntercepted" || e.type === "flak");
  if (pairs.length === 0 && strikes.length === 0 && air.length === 0) return <p className="muted">このターンは撃ち合い・砲爆撃はありませんでした。</p>;
  const name = (id: string | null) => contactName(id, view, info);
  return (
    <>
      {pairs.length > 0 && (
        <>
          <h4>撃ち合い</h4>
          <ul className="fights">
            {pairs.slice(0, 12).map((p) => {
              const { balance } = pairingBalance(p);
              return (
                <li key={`${p.ownId}|${p.contactId}`} className={balance > 0.2 ? "win" : balance < -0.2 ? "lose" : "even"} onClick={() => game.select(p.ownId)}>
                  <div>
                    <b>{label(p.ownId)}</b> ⇄ {name(p.contactId)}
                  </div>
                  <div className="nums">
                    <span>与 {p.dealt ? BAND[p.dealt].name : "—"}</span>
                    <span>受 {p.received > 0 ? minus(p.received) : "—"}</span>
                    {p.morale > 0.005 && <span className="muted">士気 {minus(p.morale)}</span>}
                  </div>
                  {p.outFactors.length > 0 && <Chips factors={p.outFactors.filter((f) => f.id !== "aspect" || f.value !== 1)} goodAbove />}
                  {p.inAspect && p.inAspect !== "front" && <span className="chip bad">{ASPECT[p.inAspect]}から撃たれた</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {strikes.length > 0 && (
        <>
          <h4>砲撃・航空</h4>
          <ul className="fights">
            {strikes.map((x, i) => {
              const total = x.ownHits.reduce((t, h) => t + h.strength, 0);
              return (
                <li key={i} className={x.own ? (x.enemyHits.length > 0 ? "win" : "even") : "lose"} onClick={() => x.unitId && game.select(x.unitId)}>
                  <div>
                    <b>{x.own ? "" : "敵の"}{STRIKE_NAME[x.kind]}</b>
                    {x.own && x.unitId ? `(${label(x.unitId)})` : ""}
                  </div>
                  {x.own && (
                    <div className="nums">
                      {x.enemyHits.length > 0 ? x.enemyHits.map((h) => <span key={h.contactId}>{name(h.contactId)}:{BAND[h.dealt].name}</span>) : <span className="muted">{x.unobservedHits ? "見えている敵には当たらず" : "効果なし(着弾範囲に部隊がいなかった)"}</span>}
                      {x.unobservedHits && <span className="muted">見えない目標にも着弾</span>}
                    </div>
                  )}
                  {x.ownHits.length > 0 && (
                    <div className="nums">
                      {x.ownHits.map((h) => (
                        <span key={h.unitId} className="bad-text">
                          {x.own ? "誤射:" : ""}
                          {label(h.unitId)} {minus(h.strength)}
                        </span>
                      ))}
                      {!x.own && x.ownHits.length > 1 && <span className="muted">計 {minus(total)}</span>}
                    </div>
                  )}
                  <Chips factors={x.effect} goodAbove />
                </li>
              );
            })}
          </ul>
        </>
      )}
      {air.length > 0 && (
        <>
          <h4>制空</h4>
          <ul className="log">
            {air.map((e, i) => (
              <li key={i}>
                {e.type === "airSuperiority" && `制空任務:空域 ${sectorLabel(e.sector, info)} の制空権 ${Math.round(e.control * 100)}%(出していない空域は基準の割合)`}
                {e.type === "dogfight" && `空戦(空域 ${sectorLabel(e.sector, info)}):戦闘機 ${e.lostGroups.toFixed(2)} 編隊を失った`}
                {e.type === "airIntercepted" && `${STRIKE_NAME[e.kind as SideStrike["kind"]] ?? "航空任務"}が迎撃されて失敗`}
                {e.type === "flak" && `対空砲で攻撃機 ${e.lostGroups.toFixed(2)} 編隊を失った`}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function sectorLabel(key: string, info: ScenarioInfo): string {
  const [c, r] = key.split(",").map(Number) as [number, number];
  const { cols, rows } = info.airSectors;
  if (cols === 3 && rows === 3) return (["南", "", "北"][r] ?? "") + (["西", "", "東"][c] ?? "") || "中央";
  return `${c + 1}-${r + 1}`;
}

/** ユニットの欄:このユニットのこのターンの撃ち合い */
export function UnitFights({ game, unitId }: { game: Game; unitId: string }) {
  const { s } = game;
  if (!s.last || s.phase !== "planning") return null;
  const pairs = pairings((s.last.replay.engagements ?? []).filter((e) => e.ownId === unitId));
  const hitBy = (s.last.replay.strikes ?? []).flatMap((x) => x.ownHits.filter((h) => h.unitId === unitId).map((h) => ({ kind: x.kind, own: x.own, strength: h.strength })));
  if (pairs.length === 0 && hitBy.length === 0) return null;
  return (
    <div className="unit-fights">
      <h4>前のターンの撃ち合い</h4>
      <ul className="fights">
        {pairs.map((p) => (
          <li key={p.contactId ?? "?"} className={pairingBalance(p).balance > 0.2 ? "win" : pairingBalance(p).balance < -0.2 ? "lose" : "even"}>
            <div>⇄ {contactName(p.contactId, s.view!, s.info!)}</div>
            <div className="nums">
              <span>与 {p.dealt ? BAND[p.dealt].name : "—"}</span>
              <span>受 {p.received > 0 ? minus(p.received) : "—"}</span>
            </div>
            <Chips factors={p.outFactors} goodAbove />
            {p.inAspect && p.inAspect !== "front" && <span className="chip bad">{ASPECT[p.inAspect]}から撃たれた</span>}
          </li>
        ))}
        {hitBy.map((h, i) => (
          <li key={`s${i}`} className="lose">
            {h.own ? "味方の" : "敵の"}
            {STRIKE_NAME[h.kind]}で {minus(h.strength)}
          </li>
        ))}
      </ul>
    </div>
  );
}
