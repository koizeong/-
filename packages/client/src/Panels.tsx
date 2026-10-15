import { estimateEnemyLoss, type TurnEvent, type UnitOrder } from "@brigade/sim-core";
import type { ScenarioInfo } from "@brigade/protocol";
import { intendedMode, type Game } from "./game.js";
import { clockOf } from "./geo.js";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const FORMATION: Record<string, string> = { column: "縦隊", deploying: "展開中", deployed: "展開済み" };
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

/** 勝利条件に損耗率がある(撃滅・漸減・消耗抑制)シナリオで、損耗の見積もりとしきい値を見せる */
function AttritionGauge({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const mine = info.victory[info.mySide];
  if (!mine) return null;
  const levels = ["limited", "decisive"] as const;
  const name = (k: (typeof levels)[number]) => (k === "decisive" ? "決定的" : "限定的");
  const enemyGoal = levels.filter((k) => mine[k].minEnemyLoss !== undefined).map((k) => `${name(k)} ${Math.round(mine[k].minEnemyLoss! * 100)}%以上`);
  const ownGoal = levels.filter((k) => mine[k].maxOwnLoss !== undefined).map((k) => `${name(k)} ${Math.round(mine[k].maxOwnLoss! * 100)}%以下`);
  if (enemyGoal.length === 0 && ownGoal.length === 0) return null;
  return (
    <span title="敵の損耗は、見つけた敵の撃破と推定戦力からの見積もりです(正確な値は試合の終わりに分かります)。自軍の損耗は正確な値です。">
      {enemyGoal.length > 0 && `敵の損耗(見積もり)${Math.round(estimateEnemyLoss(view.contacts) * 100)}%(勝利:${enemyGoal.join("・")})・`}
      自軍の損耗 {Math.round(view.ownLoss * 100)}%{ownGoal.length > 0 && `(勝利:${ownGoal.join("・")})`}
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
      <span>{night ? `夜間フェイズ(${info.night?.hours ?? "?"}時間)` : clockOf(info.startHour, info.turnSeconds, view.turn)}</span>
      <span>天候:{info.weatherNames[view.weather] ?? view.weather}</span>
      <span>霧:{info.fogDensity}</span>
      <span className={cp !== null && commandPointsUsed > cp ? "over" : ""}>
        指揮ポイント {commandPointsUsed} / {cp ?? "∞"}
      </span>
      {(info.air.fighters || info.air.strike || info.air.airlift) && <span title="制空任務を出した分だけ動きます。低いほど空襲・空輸・近接航空支援が迎撃されやすく、効果も落ちます。">制空権 {Math.round(view.airControl * 100)}%</span>}
      <LastStandGauge game={game} />
      <AttritionGauge game={game} />
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
            <label className="row">
              <input type="checkbox" checked={order.deployAfterStop ?? u.deployAfterStop} onChange={(e) => game.setOrder(u.id, { deployAfterStop: e.target.checked })} />
              到着したら展開
            </label>
          )}
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
  const patrolsLeft = (view.patrolsLeft ?? info.patrolsPerDay) - s.hq.filter((c) => c.type === "patrol").length;
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
      {!nextNight && info.air.fighters && (
        <button
          onClick={() => game.addHq({ side: info.mySide, type: "airSuperiority" })}
          disabled={view.airSortiesLeft.airSuperiority - s.hq.filter((c) => c.type === "airSuperiority").length <= 0}
        >
          制空任務(残り {view.airSortiesLeft.airSuperiority - s.hq.filter((c) => c.type === "airSuperiority").length})
        </button>
      )}
      <button
        onClick={() => s.selected && game.setTargeting({ kind: "patrol", unitId: s.selected })}
        disabled={
          !s.selected || patrolsLeft <= 0 || !!view.own.find((u) => u.id === s.selected)?.routed || s.hq.some((c) => c.type === "patrol" && c.unitId === s.selected)
        }
        title={`選んでいる部隊から、${Math.round(info.ranges.patrolRangeM / 1000)}km 以内の地点を探ります。結果はこのターンのうちに出ます(遠いほど遅い)。見つけた敵は兵種まで分かります。範囲に敵がいると斥候が見つかり、小さな損害を受けて位置を知られることがあります。`}
      >
        斥候{s.selected ? `:${label(s.selected)}` : "(ユニットを選んでください)"}(残り {patrolsLeft})
      </button>
      {!nextNight && info.air.recon && (
        <button
          onClick={() => game.setTargeting({ kind: "airRecon" })}
          disabled={view.airSortiesLeft.airRecon - view.airMissions.filter((m) => m.kind === "airRecon").length - s.hq.filter((c) => c.type === "airRecon").length <= 0}
          title="次のターンのどこかの時刻に、選んだ地点のまわりを撮影します。見つけた敵は兵種まで分かり、撮影した時刻の写真(ゴースト)として残ります。森・町・伏撃は写りにくく、制空権が低いと迎撃されます。"
        >
          航空偵察(残り {view.airSortiesLeft.airRecon - view.airMissions.filter((m) => m.kind === "airRecon").length - s.hq.filter((c) => c.type === "airRecon").length})
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
          onClick={() => s.selected && game.addHq({ side: info.mySide, type: "closeAirSupport", unitId: s.selected })}
          disabled={!s.selected || view.airSortiesLeft.airStrike - s.hq.filter((c) => c.type === "airStrike" || c.type === "closeAirSupport").length <= 0}
          title="選んでいる味方の近くの、見えている敵を、このターンのうちに叩きます。制空権が低いと迎撃されやすく、効果も落ちます。"
        >
          近接航空支援{s.selected ? `:${label(s.selected)}` : "(ユニットを選んでください)"}
        </button>
      )}
      <ul className="hq">
        {s.hq.map((c, i) => (
          <li key={i}>
            {c.type === "fireMission"
              ? `砲撃 ${label(c.unitId)}`
              : c.type === "airStrike"
                ? "空襲"
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
    case "encircled":
      return `${u} が包囲されている(士気 ${Math.round(e.morale * 100)}%)`;
    case "surrendered":
      return `${u} が包囲され投降した`;
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
    case "stanceSpent":
      return `${u} の${info.stances.find((x) => x.id === e.stance)?.name ?? e.stance}が息切れ(効果が切れた。別の姿勢に切り替えると、また使える)`;
    default:
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
    if (e.type === "airAborted")
      lines.push(
        `${e.kind === "airStrike" ? "空襲" : e.kind === "airDrop" ? "空輸" : e.kind === "closeAirSupport" ? "近接航空支援" : e.kind === "airborneDrop" ? "空挺降下" : e.kind === "airRecon" ? "航空偵察" : "制空任務"} は天候のため中止`,
      );
    else if (e.type === "airStrike") lines.push("空襲を実施");
    else if (e.type === "airSuperiority") lines.push(`制空任務:制空権 ${Math.round(e.control * 100)}%`);
    else if (e.type === "airIntercepted")
      lines.push(`${e.kind === "airStrike" ? "空襲" : e.kind === "airDrop" ? "空輸" : e.kind === "closeAirSupport" ? "近接航空支援" : e.kind === "airRecon" ? "航空偵察" : e.kind === "airborneDrop" ? "空挺降下" : "制空任務"} が迎撃されて失敗`);
    else if (e.type === "closeAirSupport") lines.push(`近接航空支援が ${label(e.unitId)} の上空に到着`);
    else if (e.type === "navalGunfire") lines.push("艦砲射撃を開始");
    else if (e.type === "patrol")
      lines.push(`${label(e.unitId)} の斥候:${e.found > 0 ? `${e.found} 部隊を発見` : "敵は見つからなかった"}${e.caught ? "(斥候が見つかり、位置を知られた)" : ""}`);
    else if (e.type === "airRecon") lines.push(`航空偵察:${e.found > 0 ? `${e.found} 部隊を発見(写真)` : "敵は見つからなかった"}`);
    else if (e.type === "airborneLanded")
      lines.push(`${label(e.unitId)} が空挺降下${e.intercepted ? "(輸送機が迎撃され、大きく散らばった)" : ""}:戦力 −${Math.round(e.strengthLoss * 100)}%`);
    else if (e.type === "lastStandLost") lines.push(`死守していた ${label(e.unitId)} を失い、全軍の士気が下がった(${Math.round(e.morale * 100)}%)`);
    else if (e.type === "airDrop") lines.push(`空輸を実施(${e.receiver === info.mySide ? "受け取り" : e.receiver ? "敵が回収" : "誰も受け取らず"})`);
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
            {info.sides.find((x) => x.id === side)?.name}:保持した目標の重み {v.heldWeight}・与えた損耗 {Math.round(v.enemyLoss * 100)}%
          </p>
        ))}
        <button onClick={() => location.reload()}>もう一度</button>
      </div>
    </div>
  );
}
