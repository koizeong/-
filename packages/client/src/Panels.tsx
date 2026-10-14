import type { TurnEvent, UnitOrder } from "@brigade/sim-core";
import type { Game } from "./game.js";
import { clockOf } from "./geo.js";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const FORMATION: Record<string, string> = { column: "縦隊", deploying: "展開中", deployed: "展開済み" };
const MODE: Record<string, string> = { march: "行軍", combat: "戦闘移動" };
const label = (id: string) => id.replace(/^[a-z]+-/, "");

function Bar({ name, value, bad = false }: { name: string; value: number; bad?: boolean }) {
  // bad = true は「多いほど悪い」ゲージ(制圧・疲労)
  const v = Math.max(0, Math.min(1, value));
  const danger = bad ? v > 0.5 : v < 0.5;
  return (
    <div className="bar">
      <span>{name}</span>
      <div className="track">
        <div className="fill" style={{ width: pct(v), background: danger ? "#c0392b" : "#3a7d44" }} />
      </div>
      <span className="num">{pct(v)}</span>
    </div>
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
      <span>{night ? `夜間フェイズ(${info.night?.hours ?? "?"}時間)` : clockOf(info.startHour, info.turnSeconds, view.turn)}</span>
      <span>天候:{info.weatherNames[view.weather] ?? view.weather}</span>
      <span>霧:{info.fogDensity}</span>
      <span className={cp !== null && commandPointsUsed > cp ? "over" : ""}>
        指揮ポイント {commandPointsUsed} / {cp ?? "∞"}
      </span>
      <span className="spacer" />
      {s.phase === "planning" && (
        <button className="primary" onClick={game.endTurn} data-testid="end-turn">
          ターン終了
        </button>
      )}
      {s.phase === "waiting" && <span>解決中…</span>}
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
  const mode = order.moveMode ?? u.moveMode;
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
    <section>
      <h3>
        {label(u.id)} <span className="muted">{info.toeNames[u.toe]}</span>
      </h3>
      <Bar name="戦力" value={u.strength} />
      <Bar name="士気" value={u.morale} />
      <Bar name="制圧" value={u.suppression} bad />
      <Bar name="疲労" value={u.fatigue} bad />
      <Bar name="弾薬" value={u.ammo} />
      {u.fuel < 1 || info.branchNames[u.branch] !== "歩兵" ? <Bar name="燃料" value={u.fuel} /> : null}
      <p className="muted">
        {FORMATION[u.formation]}・陣地 {u.entrenchment}・{u.supplied ? "補給あり" : "補給切れ"}
        {u.routed ? "・潰走中" : ""}
      </p>
      {planning && !u.routed && (
        <div className="controls">
          {night && <p className="note">夜は、目的地を指定したユニットだけが動きます(行軍=浸透移動、戦闘移動=夜襲)。夜間行動は士気を大きく削ります。</p>}
          <div className="row">
            移動:
            {(["march", "combat"] as const).map((m) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => game.setOrder(u.id, { moveMode: m })}>
                {night ? (m === "march" ? "浸透移動" : "夜襲") : MODE[m]}
              </button>
            ))}
          </div>
          <div className="row">
            姿勢:
            <select value={stance} onChange={(e) => game.setOrder(u.id, { stance: e.target.value })}>
              {info.stances.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            {u.pendingStance && <span className="muted">(切替中)</span>}
          </div>
          <label className="row">
            <input type="checkbox" checked={order.deployAfterStop ?? u.deployAfterStop} onChange={(e) => game.setOrder(u.id, { deployAfterStop: e.target.checked })} />
            停止後に展開
          </label>
          <div className="row">
            条件付き:
            <select value={condKey} onChange={(e) => setCond(e.target.value)}>
              <option value="none">なし</option>
              <option value="enemy">敵が1.5km以内 → 集積所へ後退</option>
              <option value="loss">戦力50%未満 → 集積所へ後退</option>
            </select>
          </div>
          <div className="row">
            <button onClick={() => game.setOrder(u.id, { waypoints: [] })}>停止</button>
            <button onClick={() => game.clearOrder(u.id)}>命令を取り消す</button>
          </div>
          <p className="muted">地図を押すと目的地、押したままドラッグで到着後の向き。Shift を押しながらで経由点を追加。</p>
        </div>
      )}
    </section>
  );
}

export function HqPanel({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  if (s.phase !== "planning") return null;
  const nextNight = info.night?.turn === view.turn + 1;
  const artillery = view.own.filter((u) => info.artilleryRanges[u.id] && !u.routed);
  return (
    <section>
      <h3>司令部</h3>
      {nextNight && <p className="note">次のターンは夜です。砲撃・航空は使えません。</p>}
      {!nextNight &&
        artillery.map((u) => (
          <button key={u.id} onClick={() => game.setTargeting({ kind: "fireMission", unitId: u.id })} disabled={u.formation !== "deployed"}>
            砲撃:{label(u.id)}(射程 {Math.round(info.artilleryRanges[u.id]! / 1000)}km)
          </button>
        ))}
      {!nextNight && info.air.strike && (
        <button onClick={() => game.setTargeting({ kind: "airStrike" })} disabled={view.airSortiesLeft.airStrike <= 0}>
          空襲(残り {view.airSortiesLeft.airStrike})
        </button>
      )}
      {!nextNight && info.air.airlift && (
        <button onClick={() => game.setTargeting({ kind: "airDrop" })} disabled={view.airSortiesLeft.airDrop <= 0}>
          空輸(残り {view.airSortiesLeft.airDrop})
        </button>
      )}
      <ul className="hq">
        {s.hq.map((c, i) => (
          <li key={i}>
            {c.type === "fireMission" ? `砲撃 ${label(c.unitId)}` : c.type === "airStrike" ? "空襲" : "空輸"}
            <button onClick={() => game.removeHq(i)}>×</button>
          </li>
        ))}
      </ul>
      <p className="muted">要請は次のターンに実行されます。</p>
    </section>
  );
}

function describe(e: TurnEvent, mySide: string): string | null {
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
    case "destroyed":
      return `${u} が壊滅`;
    case "outOfFuel":
      return `${u} が燃料切れで動けない`;
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
    case "nightStrain":
      return `${u} が夜間行動で消耗(士気 ${Math.round(e.morale * 100)}%)`;
    default:
      void mySide;
      return null;
  }
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
    } else lines.push(`天候が変わった:${info.weatherNames[e.to] ?? e.to}`);
  }
  for (const e of last.replay.hqEvents) {
    if (e.type === "airAborted") lines.push(`${e.kind === "airStrike" ? "空襲" : "空輸"} は天候のため中止`);
    else if (e.type === "airStrike") lines.push("空襲を実施");
    else lines.push(`空輸を実施(${e.receiver === info.mySide ? "受け取り" : e.receiver ? "敵が回収" : "誰も受け取らず"})`);
  }
  for (const e of last.replay.events) {
    const d = describe(e, info.mySide);
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

export function ResultOverlay({ game }: { game: Game }) {
  const { s } = game;
  const r = s.last?.result;
  if (s.phase !== "over" || !r) return null;
  const info = s.info!;
  const winner = info.sides.find((x) => x.id === r.winner)?.name;
  const level = r.level === "decisive" ? "決定的勝利" : r.level === "limited" ? "限定的勝利" : "引き分け";
  return (
    <div className="overlay">
      <div className="card">
        <h2>{r.winner ? `${winner} の${level}` : level}</h2>
        {Object.entries(r.perSide).map(([side, v]) => (
          <p key={side}>
            {info.sides.find((x) => x.id === side)?.name}:保持した目標の重み {v.heldWeight}
          </p>
        ))}
        <button onClick={() => location.reload()}>もう一度</button>
      </div>
    </div>
  );
}
