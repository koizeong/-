import { estimateEnemyLoss, isNightTurn, type HqCommand, type TurnEvent, type UnitOrder } from "@brigade/sim-core";
import { useState } from "react";
import type { ScenarioInfo } from "@brigade/protocol";
import { intendedMode, type Game } from "./game.js";
import { clockOf } from "./geo.js";
import { previewLines } from "./preview.js";
import { gaugeDelta, ModifierCard, UnitFights } from "./Report.js";
import { RoomBadge } from "./Online.js";
import { downloadRecord } from "./saves.js";
import { SIDE_COLORS } from "./MapView.js";
import { SymbolIcon } from "./SymbolIcon.js";
import { conditionText, lossGoals } from "./victory.js";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const FORMATION: Record<string, string> = { column: "縦隊", deploying: "展開中", deployed: "展開済み" };
const label = (id: string) => id.replace(/^[a-z]+-/, "");

function Bar({ name, value, bad = false, delta, ceiling }: { name: string; value: number; bad?: boolean; delta?: number | undefined; ceiling?: number | undefined }) {
  // bad = true は「多いほど悪い」ゲージ(制圧・疲労)
  const v = Math.max(0, Math.min(1, value));
  const danger = bad ? v > 0.5 : v < 0.5;
  // 前のターンに減った分を薄い色で残す(多いほど悪いゲージは増えた分)
  const lost = delta !== undefined && !bad && delta < -0.002 ? Math.min(1 - v, -delta) : 0;
  const worse = delta !== undefined && (bad ? delta > 0.005 : delta < -0.002);
  const better = delta !== undefined && (bad ? delta < -0.005 : delta > 0.002);
  return (
    <div className="bar">
      <span>{name}</span>
      <div className="track">
        <div className="fill" style={{ width: pct(v), background: danger ? "#c0392b" : "#3a7d44" }} />
        {lost > 0 && <div className="lost" style={{ left: pct(v), width: pct(lost) }} />}
        {ceiling !== undefined && ceiling < 0.995 && (
          <div className="ceiling" style={{ left: pct(ceiling), width: pct(1 - ceiling) }} title={`損耗のため、休んでも ${pct(ceiling)} までしか戻りません`} />
        )}
      </div>
      <span className="num">
        {pct(v)}
        {worse && <span className="down">{bad ? "▲" : "▼"}{Math.round(Math.abs(delta!) * 100) || "<1"}</span>}
        {better && <span className="up">{bad ? "▼" : "▲"}{Math.round(Math.abs(delta!) * 100) || "<1"}</span>}
      </span>
    </div>
  );
}

/** 勝利条件に損耗率がある(撃滅・漸減・消耗抑制)シナリオで、損耗の見積もりとしきい値を見せる */
function AttritionGauge({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const mine = info.victory[info.mySide];
  if (!mine) return null;
  const goals = lossGoals(mine);
  const name = (k: "limited" | "decisive") => (k === "decisive" ? "決定的" : "限定的");
  const enemyGoal = goals.filter((g) => g.enemyMin !== undefined).map((g) => `${name(g.tier)} ${Math.round(g.enemyMin! * 100)}%以上`);
  const ownGoal = goals.filter((g) => g.ownMax !== undefined).map((g) => `${name(g.tier)} ${Math.round(g.ownMax! * 100)}%以下`);
  if (enemyGoal.length === 0 && ownGoal.length === 0) return null;
  return (
    <span title="敵の損耗は、見つけた敵の撃破と推定戦力からの見積もりです(正確な値は試合の終わりに分かります)。自軍の損耗は正確な値です。">
      {enemyGoal.length > 0 && `敵の損耗(見積もり)${Math.round(estimateEnemyLoss(view.contacts) * 100)}%(勝利:${enemyGoal.join("・")})・`}
      自軍の損耗 {Math.round(view.ownLoss * 100)}%{ownGoal.length > 0 && `(勝利:${ownGoal.join("・")})`}
    </span>
  );
}

/** 秘密の副目標(自陣営が引いたもの。中身は札に。敵にもあれば、数だけ) */
function SecretBadge({ game }: { game: Game }) {
  const info = game.s.info!;
  const mine = (info.victory[info.mySide]?.conditions ?? []).filter((c) => c.secret);
  const enemy = Object.entries(info.victory)
    .filter(([s]) => s !== info.mySide)
    .reduce((n, [, v]) => n + (v.secretPool?.count ?? 0) + v.conditions.filter((c) => c.secret).length, 0);
  if (mine.length === 0 && enemy === 0) return null;
  const list = mine.map((c) => `・${conditionText(c, info.objectives)}(勝利点 ${c.points})`).join("\n");
  return (
    <span className="secret-badge" data-testid="secret-badge" title={`${mine.length ? `秘密の副目標(相手には見えない。勝利点を足す)\n${list}` : ""}${enemy ? `\n敵にも秘密の副目標が ${enemy} 個ある(終わったときに分かる)` : ""}`}>
      {mine.length > 0 && `秘密の副目標 ${mine.map((c) => conditionText(c, info.objectives)).join("・")}`}
      {enemy > 0 && `${mine.length ? "・" : ""}敵の秘密 ${enemy}`}
    </span>
  );
}

/** 死守の重み(下書きの死守命令の分も足して見せる) */
function LastStandGauge({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const lastStandIds = new Set(info.stances.filter((x) => x.lastStand).map((x) => x.id));
  const drafted = Object.values(s.orders).filter((o) => {
    const u = view.own.find((x) => x.id === o.unitId);
    return o.stance !== undefined && lastStandIds.has(o.stance) && u && u.stance !== o.stance && u.pendingStance !== o.stance;
  }).length;
  const L = info.lastStand;
  const gauge = view.lastStand + (s.phase === "planning" ? drafted * L.gaugePerOrder : 0);
  if (gauge <= 0) return null;
  const recovery = Math.max(L.moraleRecoveryFloor, 1 - gauge * L.moraleRecoveryPenaltyPerPoint);
  return (
    <span className={recovery < 0.7 ? "over" : ""} title={`死守を命じるたびにたまり、1ターンに ${L.decayPerTurn} ずつ抜けます。重いほど全軍の士気の回復が遅くなります。`}>
      死守の重み {gauge.toFixed(2)}(全軍の士気の回復 −{Math.round((1 - recovery) * 100)}%)
    </span>
  );
}

export function TopBar({ game }: { game: Game }) {
  const { s, commandPointsUsed } = game;
  const info = s.info!;
  const view = s.view!;
  const cp = info.commandPoints;
  const night = view.phase === "night";
  return (
    <header className="topbar">
      <strong>{info.name}</strong>
      <span>
        ターン {Math.min(view.turn, info.maxTurns)} / {info.maxTurns}
      </span>
      <span>{night ? `夜間フェイズ(${info.night?.hours ?? "?"}時間)` : clockOf(info.startHour, view.time, info.startDate)}</span>
      <span>天候:{info.weatherNames[view.weather] ?? view.weather}</span>
      {(view.ground.mud >= 0.05 || view.ground.snow >= 0.05) && (
        <span title="地面の状態(雨でぬかるみ、雪で積雪がたまり、晴れると少しずつ戻る)。道路以外の移動、とくに車両が遅くなる。道路の行軍はあまり落ちない">
          地面:{[view.ground.mud >= 0.05 ? `ぬかるみ ${Math.round(view.ground.mud * 100)}%` : "", view.ground.snow >= 0.05 ? `積雪 ${Math.round(view.ground.snow * 100)}%` : ""].filter(Boolean).join("・")}
        </span>
      )}
      <span>霧:{info.fogDensity}</span>
      <span className={cp !== null && commandPointsUsed > cp ? "over" : ""} data-testid="command-points">
        指揮ポイント {commandPointsUsed} / {cp ?? "∞"}
      </span>
      {(info.air.fighters || info.air.strike) && (
        <span title="空域ごとの制空権の平均(空域ごとの値は地図に出ます)。制空任務を出した空域だけ動きます。低い空域ほど空襲・空輸・近接航空支援が迎撃されやすく、効果も落ちます。">
          制空権 平均 {Math.round((view.airControl.reduce((a, b) => a + b, 0) / Math.max(1, view.airControl.length)) * 100)}%
        </span>
      )}
      <LastStandGauge game={game} />
      {s.online && (
        <>
          <span title="オンライン対戦の部屋の合言葉">部屋 {s.online.code}</span>
          <RoomBadge status={s.online.status} mySide={info.mySide} sideName={(id) => info.sides.find((x) => x.id === id)?.name ?? id} />
        </>
      )}
      {s.record && (
        <button title="試合の記録をファイルに書き出す(ターンを進めるたびに、ブラウザにも自動で保存しています)" onClick={() => downloadRecord(s.record!, `${info.id}-${info.mySide}-t${view.turn}`)}>
          保存
        </button>
      )}
      <button onClick={() => game.toMenu()} title="表紙へ(試合は自動で保存してあり、「続きから」で再開できます)" data-testid="to-menu">
        表紙へ
      </button>
      <AttritionGauge game={game} />
      <SecretBadge game={game} />
      <span className="spacer" />
      {s.phase === "planning" && (
        <button className="primary" onClick={game.endTurn} data-testid="end-turn">
          ターン終了
        </button>
      )}
      {s.phase === "waiting" && <span data-testid="waiting">{s.online ? "相手の命令を待っています…" : "解決中…"}</span>}
      {s.phase === "replay" && <button onClick={game.skipReplay}>再生を飛ばす</button>}
    </header>
  );
}

export function UnitList({ game }: { game: Game }) {
  const { s } = game;
  return (
    <section>
      <h3>自軍</h3>
      <ul className="units">
        {[...s.view!.own].sort((a, b) => (a.id < b.id ? -1 : 1)).map((u) => (
          <li key={u.id} className={s.selected === u.id ? "sel" : ""} onClick={() => game.select(u.id)} data-testid={`unit-${u.id}`}>
            <span>{label(u.id)}</span>
            <span className="muted">
              {pct(u.strength)} {u.routed ? "潰走" : FORMATION[u.formation]}
              {s.orders[u.id] ? " ●" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UnitPanel({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const u = s.view!.own.find((x) => x.id === s.selected);
  if (!u) return <section className="muted">ユニットを選ぶと、状態と命令が出ます。</section>;
  const order: UnitOrder = s.orders[u.id] ?? { unitId: u.id };
  const mode = intendedMode(u, s.orders[u.id]);
  const hasDest = (order.waypoints ?? u.route).length > 0;
  const stance = order.stance ?? u.pendingStance ?? u.stance;
  const planning = s.phase === "planning";
  const night = s.view!.phase === "night";
  const depot = s.view!.depots[0];
  const rest = depot ? info.roads.nodes[depot.nodeId] : undefined;
  const conditional = order.conditional !== undefined ? order.conditional : u.conditional;
  const condKey = !conditional ? "none" : conditional.when.type === "enemyDetected" ? "enemy" : "loss";
  const setCond = (k: string) => {
    if (k === "none") return game.setOrder(u.id, { conditional: null });
    if (!rest) return;
    const then = { waypoints: [{ x: rest.x, y: rest.y }], moveMode: "march" as const };
    game.setOrder(u.id, {
      conditional: k === "enemy" ? { when: { type: "enemyDetected", withinM: 1500 }, then } : { when: { type: "strengthBelow", threshold: 0.5 }, then },
    });
  };
  return (
    <section data-testid="unit-panel">
      <h3>
        <SymbolIcon symbols={info.symbols} branch={u.branch} toe={u.toe} color={SIDE_COLORS[Math.max(0, info.sides.findIndex((x) => x.id === info.mySide))] ?? "#333"} size={0.8} />
        {label(u.id)} <span className="muted">{info.toeNames[u.toe]}</span>
      </h3>
      {(() => {
        const d = s.phase === "planning" ? gaugeDelta(s.before[u.id], u) : null;
        return (
          <>
            <Bar name="戦力" value={u.strength} delta={d?.strength} />
            <Bar name="士気" value={u.morale} delta={d?.morale} ceiling={s.modifiers[u.id]?.moraleCeiling} />
            <Bar name="制圧" value={u.suppression} bad delta={d?.suppression} />
          </>
        );
      })()}
      <Bar name="疲労" value={u.fatigue} bad />
      <Bar name="弾薬" value={u.ammo} />
      {u.fuel < 1 || info.branchNames[u.branch] !== "歩兵" ? <Bar name="燃料" value={u.fuel} /> : null}
      <p className="muted">
        {FORMATION[u.formation]}・陣地 {u.entrenchment}・{u.supplied ? "補給あり" : "補給切れ"}
        {u.routed ? "・潰走中" : ""}
        {(order.pursue !== undefined ? order.pursue : (u.pursuing ?? null)) !== null ? "・追撃中" : ""}
      </p>
      <ModifierCard mods={s.modifiers[u.id]} strength={u.strength} />
      <UnitFights game={game} unitId={u.id} />
      {u.encircledTurns > 0 && (
        <p className="note">包囲されています({u.encircledTurns}ターン目)。士気が回復せず、士気か弾薬が尽きると死守していても投降します。</p>
      )}
      {planning && !u.routed && (
        <div className="controls">
          {night && <p className="note">夜は、目的地を指定したユニットだけが動きます(縦隊=浸透移動、展開=夜襲)。夜間行動は士気を大きく削ります。</p>}
          {(() => {
            // 死守・伏撃の間は動けない(姿勢を動ける姿勢に変える命令と一緒なら動ける)
            const cur = info.stances.find((x) => x.id === (u.pendingStance === null ? u.stance : info.defaultStance));
            const next = info.stances.find((x) => x.id === (s.orders[u.id]?.stance ?? u.pendingStance ?? u.stance));
            if (cur?.immobile && next?.immobile) return <p className="note">{cur.name}の間は移動できません。動かすには姿勢も変えてください。</p>;
            if (next?.lastStand && !cur?.lastStand) return <p className="note">死守:潰走せず踏みとどまりますが、崩れると戦力を大きく失います。命じるたびに「死守の重み」がたまり、全軍の士気の回復が遅くなります。</p>;
            return null;
          })()}
          <div className="row">
            隊形:
            <button
              className={mode === "march" ? "on" : ""}
              data-testid="formation-column"
              title="縦隊:速く動けるが撃てない。展開していた部隊は、次に動くときに縦隊になる"
              onClick={() => game.setOrder(u.id, { moveMode: "march", deployAfterStop: false })}
            >
              {night ? "縦隊(浸透移動)" : "縦隊"}
            </button>
            <button
              className={mode === "combat" ? "on" : ""}
              data-testid="formation-deploy"
              title="展開:遅いが戦える。縦隊からはその場で展開し(1ターン)、目的地があれば展開してから進む"
              onClick={() => game.setOrder(u.id, { moveMode: "combat", deployAfterStop: u.formation === "column" ? true : undefined })}
            >
              {night ? "展開(夜襲)" : "展開"}
            </button>
          </div>
          <p className="muted">
            {mode === "march"
              ? u.formation === "column"
                ? "縦隊で動きます(速いが撃てない)。"
                : "次に動くときに縦隊になります(それまでは展開のまま)。"
              : u.formation === "column"
                ? `その場で展開します(1ターン)${hasDest ? "。展開してから目的地へ進みます" : ""}。`
                : "展開のまま動きます(遅いが戦える)。"}
          </p>
          {(() => {
            const pv = order.waypoints?.length ? s.previews[u.id]?.preview : undefined;
            if (!order.waypoints?.length) return null;
            if (!pv) return <p className="muted preview">経路を見積もっています…</p>;
            const clock = (sec: number) => clockOf(info.startHour, s.view!.time + sec, info.startDate);
            return (
              <ul className="preview" data-testid="route-preview">
                {previewLines(pv, s.view!.turn, clock).map((l, i) => (
                  <li key={i} className={l.tone ?? ""}>
                    {l.text}
                  </li>
                ))}
              </ul>
            );
          })()}
          <div className="row">
            姿勢:
            <select value={stance} onChange={(e) => game.setOrder(u.id, { stance: e.target.value })} data-testid="stance">
              {info.stances
                .filter((st) => !st.branches || st.branches.includes(u.branch) || st.id === stance)
                .map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            {u.pendingStance && <span className="muted">(切替中)</span>}
            {(() => {
              const st = info.stances.find((x) => x.id === u.stance);
              if (u.pendingStance || st?.effectTurns === undefined) return null;
              const left = st.effectTurns - u.stanceTurns;
              return left > 0 ? (
                <span className="muted">(あと {left} ターン)</span>
              ) : (
                <span className="note" title={`${st.name}の効果が切れました。別の姿勢に切り替えると、また使えます`}>
                  息切れ
                </span>
              );
            })()}
          </div>
          {mode === "march" && (
            <label className="row" data-testid="deploy-after-stop">
              <input type="checkbox" checked={order.deployAfterStop ?? u.deployAfterStop} onChange={(e) => game.setOrder(u.id, { deployAfterStop: e.target.checked })} />
              到着したら展開
            </label>
          )}
          <div className="row">
            条件付き:
            <select value={condKey} onChange={(e) => setCond(e.target.value)} data-testid="conditional">
              <option value="none">なし</option>
              <option value="enemy">敵が1.5km以内 → 集積所へ後退</option>
              <option value="loss">戦力50%未満 → 集積所へ後退</option>
            </select>
          </div>
          <div className="row">
            <button onClick={() => game.setOrder(u.id, { waypoints: [] })}>停止</button>
            <button onClick={() => game.clearOrder(u.id)}>命令を取り消す</button>
          </div>
          <p className="muted">地図を押すと目的地、押したままドラッグで到着後の向き。Shift を押しながらで経由点を追加。敵の印を押すと追撃(その敵を追い続ける)。</p>
        </div>
      )}
    </section>
  );
}

function airKindName(kind: string): string {
  return (
    { airStrike: "空襲", airDrop: "空輸", closeAirSupport: "近接航空支援", airborneDrop: "空挺降下", airRecon: "航空偵察", interdiction: "補給線への攻撃", airSuperiority: "制空任務" }[kind] ?? kind
  );
}

/** 空域のキー("列,行")を、地図での位置の名前に(北西・中央など。3×3 以外は「列-行」) */
function sectorName(key: string, info: ScenarioInfo): string {
  const [c, r] = key.split(",").map(Number) as [number, number];
  const { cols, rows } = info.airSectors;
  if (cols === 3 && rows === 3) return (["南", "", "北"][r] ?? "") + (["西", "", "東"][c] ?? "") || "中央";
  return `${c + 1}-${r + 1}`;
}

/** 任務が使う出撃枠(サーバーの数え方と同じ) */
function airCost(kind: string, escort = 0): { fighter: number; attack: number; transport: number } {
  if (kind === "airSuperiority" || kind === "airRecon") return { fighter: 1, attack: 0, transport: 0 };
  if (kind === "airDrop") return { fighter: 0, attack: 0, transport: 1 };
  if (kind === "airStrike" || kind === "interdiction" || kind === "closeAirSupport") return { fighter: escort, attack: 1, transport: 0 };
  return { fighter: 0, attack: 0, transport: 0 };
}

export function HqPanel({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const [escort, setEscort] = useState(0);
  if (s.phase !== "planning") return null;
  // 出撃枠の残り:その日の枠から、予約済み・下書きの任務が使う分を引く
  const left = { ...view.airSortiesLeft };
  const spend = (kind: string, e?: number) => {
    const c = airCost(kind, e);
    left.fighter -= c.fighter;
    left.attack -= c.attack;
    left.transport -= c.transport;
  };
  for (const m of view.airMissions) spend(m.kind, m.escort);
  for (const c of s.hq) spend(c.type, "escort" in c ? (c as { escort?: number }).escort : undefined);
  const esc = Math.min(escort, Math.max(0, left.fighter));
  const hasAir = info.air.fighters || info.air.strike || info.air.airlift;
  const nextNight = isNightTurn({ night: info.night }, view.turn + 1);
  const artillery = view.own.filter((u) => info.artilleryRanges[u.id] && !u.routed);
  const patrolsLeft = (view.patrolsLeft ?? info.patrolsPerDay) - s.hq.filter((c) => c.type === "patrol").length;
  return (
    <section>
      <h3>司令部</h3>
      {nextNight && <p className="note">次のターンは夜です。砲撃・航空は使えません。</p>}
      {!nextNight &&
        artillery.map((u) => {
          // 前のターンに撃たれた砲兵は、撃ち返されている間は砲撃できない(対砲兵戦)
          const pinned = info.fireBlockedUnderFire && !!u.underFire;
          return (
            <button
              key={u.id}
              onClick={() => game.setTargeting({ kind: "fireMission", unitId: u.id })}
              disabled={u.formation !== "deployed" || pinned}
              title={pinned ? "前のターンに攻撃を受けたため、砲撃できません" : undefined}
              data-testid={`fire-mission-${u.id}`}
            >
              砲撃:{label(u.id)}(射程 {Math.round(info.artilleryRanges[u.id]! / 1000)}km){pinned ? "・攻撃を受けている" : ""}
            </button>
          );
        })}
      {!nextNight && hasAir && (
        <div className="air">
          <p className="muted">
            {info.air.fighters && `戦闘機 ${view.airGroups.fighters.toFixed(1)}編隊・残り ${left.fighter}回`}
            {info.air.strike && ` / 攻撃機 ${view.airGroups.attack.toFixed(1)}編隊・残り ${left.attack}回`}
            {info.air.airlift && ` / 輸送 残り ${left.transport}回`}
          </p>
          {info.air.fighters && info.air.strike && (
            <label title="空襲・補給線への攻撃・近接航空支援に付ける護衛の戦闘機。多いほど迎撃されにくいが、戦闘機の出撃枠を使う(制空任務に回せる分が減る)">
              護衛{" "}
              <select value={esc} onChange={(e) => setEscort(Number(e.target.value))}>
                {Array.from({ length: Math.max(0, Math.min(3, left.fighter)) + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          {info.air.strike && (
            <button
              onClick={() => game.setTargeting({ kind: "airStrike", escort: esc })}
              disabled={left.attack <= 0}
              title="次のターンに、選んだ地点のまわりを叩きます(誤射あり)。その空域の制空権が低いと迎撃されやすく、対空砲を持つ部隊のまわりでは攻撃機を失い効果も落ちます。"
            >
              空襲(攻撃機1{esc ? `+護衛${esc}` : ""})
            </button>
          )}
          {info.air.strike && (
            <button
              onClick={() => game.setTargeting({ kind: "interdiction", escort: esc })}
              disabled={left.attack <= 0}
              title={`次のターンに、選んだ地点のまわり ${Math.round(info.ranges.interdictionRadiusM / 1000 * 10) / 10}km の道路を叩きます。しばらくの間、そこを通る敵の補給が減り、行軍中の敵の縦隊にも損害を与えます(翌日に効く)。`}
            >
              補給線への攻撃(攻撃機1{esc ? `+護衛${esc}` : ""})
            </button>
          )}
          {info.air.fighters && (
            <button
              onClick={() => game.setTargeting({ kind: "airSuperiority" })}
              disabled={left.fighter <= 0}
              title="次のターンに、選んだ空域の制空権を取りに行きます。同じ空域に敵の戦闘機がいれば空戦になり、双方が編隊を失います(敵がどこに出したかは分かりません)。"
            >
              制空任務(戦闘機1・空域を選ぶ)
            </button>
          )}
          {info.air.airlift && (
            <button onClick={() => game.setTargeting({ kind: "airDrop" })} disabled={left.transport <= 0}>
              空輸(輸送1)
            </button>
          )}
        </div>
      )}
      <button
        onClick={() => s.selected && game.setTargeting({ kind: "patrol", unitId: s.selected })}
        disabled={
          !s.selected || patrolsLeft <= 0 || !!view.own.find((u) => u.id === s.selected)?.routed || s.hq.some((c) => c.type === "patrol" && c.unitId === s.selected)
        }
        title={`選んでいる部隊から、押した地点の方向へ扇形(長さ ${Math.round(info.ranges.patrolRangeM / 1000)}km・左右 ${info.ranges.patrolHalfAngleDeg} 度)に探ります。結果はこのターンのうちに出ます。何もつかめずに戻ってくることもあります。見つけた敵は兵種まで分かります。範囲に敵がいると斥候が見つかり、小さな損害を受けて位置を知られることがあります。`}
      >
        斥候{s.selected ? `:${label(s.selected)}` : "(ユニットを選んでください)"}(残り {patrolsLeft})
      </button>
      {!nextNight && info.air.fighters && (
        <button
          onClick={() => game.setTargeting({ kind: "airRecon" })}
          disabled={left.fighter <= 0}
          title="次のターンのどこかの時刻に、選んだ地点のまわりを撮影します(戦闘機の出撃枠を使う)。見つけた敵は兵種まで分かり、撮影した時刻の写真(ゴースト)として残ります。森・町・伏撃は写りにくく、制空権が低いと迎撃されます。"
        >
          航空偵察(戦闘機1)
        </button>
      )}
      {!nextNight && info.naval && (
        <button
          onClick={() => game.setTargeting({ kind: "navalGunfire" })}
          disabled={view.navalLeft - view.navalMissions.length - s.hq.filter((c) => c.type === "navalGunfire").length <= 0}
          title={`次のターンに1ターンかけて着弾します。海から ${Math.round(info.naval.rangeFromSeaM / 1000)}km 以内にだけ届きます(誤射あり)。`}
        >
          艦砲射撃(残り {view.navalLeft - view.navalMissions.length - s.hq.filter((c) => c.type === "navalGunfire").length})
        </button>
      )}
      {!nextNight &&
        info.airborne
          .filter((a) => view.airborneReady.includes(a.id) && !s.hq.some((c) => c.type === "airborneDrop" && c.unitId === a.id))
          .map((a) => (
            <button
              key={a.id}
              onClick={() => game.setTargeting({ kind: "airborneDrop", unitId: a.id })}
              disabled={view.turn + 1 < a.availableFromTurn}
              title="次のターンの始めに、選んだ地点のまわりに散らばって降ります。降りたターンは展開途中です。制空権が低いと輸送機が迎撃され、大きく散らばり損害も増えます。"
            >
              空挺降下:{label(a.id)}({a.toeName}){view.turn + 1 < a.availableFromTurn ? `・${a.availableFromTurn}ターン目から` : ""}
            </button>
          ))}
      {view.phase === "day" && info.air.strike && (
        <button
          onClick={() => s.selected && game.addHq({ side: info.mySide, type: "closeAirSupport", unitId: s.selected, ...(esc ? { escort: esc } : {}) } as HqCommand)}
          disabled={!s.selected || left.attack <= 0}
          title="選んでいる味方の近くの、見えている敵を、このターンのうちに叩きます(攻撃機の出撃枠を使う)。その空域の制空権が低いと迎撃されやすく、効果も落ちます。"
        >
          近接航空支援{s.selected ? `:${label(s.selected)}` : "(ユニットを選んでください)"}{esc ? `(護衛${esc})` : ""}
        </button>
      )}
      {info.bridges.length > 0 && (
        <div className="row">
          <button
            onClick={() => game.setTargeting({ kind: "demolishBridge" })}
            title={`押した橋を、このターンの終わりに爆破します(成功 ${Math.round(info.bridgeRules.demolitionSuccess * 100)}%)。橋から ${info.bridgeRules.workRangeM / 1000}km 以内に自軍の部隊が要ります。落ちた橋は次のターンから行軍にも補給路にも使えません。夜も頼めます。`}
          >
            橋の爆破
          </button>
          <button
            onClick={() => game.setTargeting({ kind: "repairBridge" })}
            title={`押した壊れた橋を直します(${info.bridgeRules.repairHours}時間)。橋から ${info.bridgeRules.workRangeM / 1000}km 以内に自軍がいて、${info.bridgeRules.repairClearM / 1000}km 以内に敵がいないあいだだけ進みます。夜も頼めます。`}
          >
            橋の修理
          </button>
        </div>
      )}
      <ul className="hq">
        {s.hq.map((c, i) => (
          <li key={i}>
            {c.type === "fireMission"
              ? `砲撃 ${label(c.unitId)}`
              : c.type === "airStrike"
                ? `空襲${c.escort ? `(護衛${c.escort})` : ""}`
                : c.type === "interdiction"
                  ? `補給線への攻撃${c.escort ? `(護衛${c.escort})` : ""}`
                : c.type === "airDrop"
                  ? "空輸"
                  : c.type === "airSuperiority"
                    ? "制空任務"
                    : c.type === "airborneDrop"
                      ? `空挺降下 ${label(c.unitId)}`
                      : c.type === "navalGunfire"
                        ? "艦砲射撃"
                        : c.type === "airRecon"
                          ? "航空偵察"
                          : c.type === "patrol"
                            ? `斥候 ${label(c.unitId)}(このターン)`
                            : c.type === "demolishBridge"
                              ? `橋の爆破 ${bridgeName(c.bridgeId, info)}(このターンの終わり)`
                              : c.type === "repairBridge"
                                ? `橋の修理 ${bridgeName(c.bridgeId, info)}`
                                : `近接航空支援 ${label(c.unitId)}(このターン)`}
            <button onClick={() => game.removeHq(i)}>×</button>
          </li>
        ))}
      </ul>
      <p className="muted">要請は次のターンに実行されます(近接航空支援だけはこのターンのうちに飛来します)。</p>
    </section>
  );
}

function describe(e: TurnEvent, info: ScenarioInfo): string | null {
  const u = label(e.unitId);
  switch (e.type) {
    case "arrived":
      return `${u} が目的地に到着`;
    case "contact":
      return `${u} が敵と接触`;
    case "conditionalTriggered":
      return `${u} の条件付き命令が発動`;
    case "routed":
      return `${u} が潰走`;
    case "rallied":
      return `${u} が立ち直った`;
    case "overrun":
      return `${u} が取りつかれたまま崩れ、逃げ遅れ・捕虜を出した`;
    case "encircled":
      return `${u} が包囲されている(士気 ${Math.round(e.morale * 100)}%)`;
    case "surrendered":
      return `${u} が包囲され投降した`;
    case "destroyed":
      return `${u} が壊滅`;
    case "outOfFuel":
      return `${u} が燃料切れで動けない`;
    case "fireHalted":
      return `${u} が撃たれ、砲撃をやめた`;
    case "blocked":
      return `${u} が敵の阻止圏で止められた`;
    case "breakthrough":
      return `${u} が敵の阻止圏を突破`;
    case "breached":
      return `${u} の阻止圏が突破された`;
    case "depotCaptured":
      return `${u} が敵の集積所を奪取`;
    case "supplyStatus":
      return e.supplied ? `${u} の補給路が回復` : `${u} の補給路が断たれた`;
    case "reinforced":
      return `${u} が増援として到着`;
    case "withdrawn":
      return `${u} が別の方面へ転用され、戦場を去った`;
    case "nightStrain":
      return `${u} が夜間行動で消耗(士気 ${Math.round(e.morale * 100)}%)`;
    case "stanceSpent":
      return `${u} の${info.stances.find((x) => x.id === e.stance)?.name ?? e.stance}が息切れ(効果が切れた。別の姿勢に切り替えると、また使える)`;
    default:
      return null;
  }
}

/** 橋の名前:両端の道路ノードの名前(なければ1.5km以内のいちばん近い目標の名前、それもなければID)を「〜」でつなぐ */
function bridgeName(id: string, info: ScenarioInfo): string {
  const [a, b] = id.split("~");
  const n = (x: string | undefined) => {
    const node = x ? info.roads.nodes[x] : undefined;
    if (!node) return x ?? "?";
    if (node.name) return node.name;
    const o = info.objectives
      .map((o) => ({ o, d: Math.hypot(o.x - node.x, o.y - node.y) }))
      .filter((v) => v.d <= 1500)
      .sort((p, q) => p.d - q.d)[0]?.o;
    return o?.name.replace(/(.*)/, "") ?? x!;
  };
  return `橋(${n(a)}〜${n(b)})`;
}

export function EventLog({ game }: { game: Game }) {
  const { s } = game;
  const last = s.last;
  if (!last) return null;
  const info = s.info!;
  const lines: string[] = [];
  for (const r of last.rejectedOrders) lines.push(`命令が通らなかった:${label(r.unitId)}(${r.reason})`);
  for (const r of last.rejectedHqCommands) lines.push(`司令部コマンドが通らなかった:${r.reason}`);
  for (const e of last.replay.publicEvents) {
    if (e.type === "objectiveCaptured") {
      const o = info.objectives.find((x) => x.id === e.objectiveId);
      const side = info.sides.find((x) => x.id === e.to);
      lines.push(`${o?.name ?? e.objectiveId} を ${side?.name ?? e.to} が確保`);
    } else if (e.type === "weatherChanged") lines.push(`天候が変わった:${info.weatherNames[e.to] ?? e.to}`);
    else if (e.type === "bridgeDestroyed") lines.push(`${bridgeName(e.bridgeId, info)} が落ちた(${e.by === "airStrike" ? "空襲" : "爆破"})。次のターンから通れない`);
    else lines.push(`${bridgeName(e.bridgeId, info)} の修理が終わった。次のターンから通れる`);
  }
  for (const e of last.replay.hqEvents) {
    if (e.type === "airAborted")
      lines.push(
        `${airKindName(e.kind)} は天候のため中止`,
      );
    else if (e.type === "airStrike") lines.push("空襲を実施");
    else if (e.type === "airSuperiority") lines.push(`制空任務(空域 ${sectorName(e.sector, info)}):制空権 ${Math.round(e.control * 100)}%`);
    else if (e.type === "dogfight") lines.push(`空戦(空域 ${sectorName(e.sector, info)}):戦闘機 ${e.lostGroups.toFixed(2)}編隊を失った`);
    else if (e.type === "flak") lines.push(`${airKindName(e.kind)} が対空砲に撃たれ、攻撃機 ${e.lostGroups.toFixed(2)}編隊を失った`);
    else if (e.type === "interdiction") lines.push("補給線への攻撃を実施");
    else if (e.type === "airIntercepted")
      lines.push(`${airKindName(e.kind)} が迎撃されて失敗`);
    else if (e.type === "closeAirSupport") lines.push(`近接航空支援が ${label(e.unitId)} の上空に到着`);
    else if (e.type === "navalGunfire") lines.push("艦砲射撃を開始");
    else if (e.type === "patrol")
      lines.push(`${label(e.unitId)} の斥候:${e.failed ? "何もつかめずに戻った" : e.found > 0 ? `${e.found} 部隊を発見` : "敵は見つからなかった"}${e.caught ? "(斥候が見つかり、位置を知られた)" : ""}`);
    else if (e.type === "airRecon") lines.push(`航空偵察:${e.found > 0 ? `${e.found} 部隊を発見(写真)` : "敵は見つからなかった"}`);
    else if (e.type === "airborneLanded")
      lines.push(`${label(e.unitId)} が空挺降下${e.intercepted ? "(輸送機が迎撃され、大きく散らばった)" : ""}:戦力 −${Math.round(e.strengthLoss * 100)}%`);
    else if (e.type === "lastStandLost") lines.push(`死守していた ${label(e.unitId)} を失い、全軍の士気が下がった(${Math.round(e.morale * 100)}%)`);
    else if (e.type === "airDrop") lines.push(`空輸を実施(${e.receiver === info.mySide ? "受け取り" : e.receiver ? "敵が回収" : "誰も受け取らず"})`);
    else if (e.type === "bridgeDemolition") lines.push(`${bridgeName(e.bridgeId, info)} の爆破:${e.success ? "成功" : e.reason ? `できなかった(${e.reason})` : "失敗"}`);
    else if (e.type === "bridgeRepairStarted") lines.push(`${bridgeName(e.bridgeId, info)} の修理を始めた`);
    else if (e.type === "batteryLocated") lines.push("敵の砲兵が砲撃を始め、その位置を標定した(地図の砲兵の印。砲撃の目標にできる)");
  }
  for (const e of last.replay.events) {
    const d = describe(e, info);
    if (d) lines.push(d);
  }
  return (
    <section>
      <h3>ターン {last.turn} の出来事</h3>
      <ul className="log">
        {lines.length === 0 && <li className="muted">特になし</li>}
        {lines.slice(0, 40).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
