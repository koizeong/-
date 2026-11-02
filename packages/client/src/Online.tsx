import type { CustomStart, RoomStatus, ScenarioSummary } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { CustomStartPanel } from "./CustomStart.js";
import { desktop, type HostingStatus } from "./desktop.js";
import type { Game } from "./game.js";
import { listRooms, removeRoom, type RoomEntry } from "./saves.js";

/** 1ターンの制限時間の選択肢(秒。0は制限なし。サーバーの TIME_LIMITS と同じ) */
const TIME_LIMITS = [
  [0, "なし"],
  [180, "3分"],
  [300, "5分"],
] as const;

/**
 * 開始画面のオンライン対戦:部屋を作る(シナリオ・陣営・制限時間)、合言葉で入る、前に入った部屋に戻る。
 * 装備編成を使うなら、座る前に差し替えを選ぶ(自分の陣営の分だけ。相手の編成は霧の外で見えない)
 */
export function OnlineSection({ game, scenarios, seed }: { game: Game; scenarios: ScenarioSummary[]; seed: string }) {
  const [scenarioId, setScenarioId] = useState("");
  const [side, setSide] = useState("");
  const [timeLimit, setTimeLimit] = useState(0);
  /** 編成の選択(部屋ごと。両陣営に同じ) */
  const [preset, setPreset] = useState("");
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<RoomEntry[]>(listRooms);
  const [error, setError] = useState<string | null>(null);
  /** 装備編成を選んでいる途中(部屋を作る・入る) */
  const [custom, setCustom] = useState<{ scenario: ScenarioSummary; side: string; preset?: string; then: (c: CustomStart) => void } | null>(null);

  const sc = scenarios.find((x) => x.id === scenarioId) ?? scenarios[0];
  const mySide = side && sc?.sides.some((x) => x.id === side) ? side : sc?.sides[0]?.id;
  const myPreset = preset && sc?.presets.some((p) => p.id === preset) ? preset : "";
  const create = (c?: CustomStart) =>
    sc &&
    mySide &&
    game.start({ type: "createRoom", scenarioId: sc.id, side: mySide, timeLimitSec: timeLimit, ...(seed ? { seed: Number(seed) } : {}), ...(c ? { custom: c } : {}), ...(myPreset ? { preset: myPreset } : {}) });
  const join = (c?: CustomStart) => game.start({ type: "joinRoom", code: code.trim().toUpperCase(), ...(c ? { custom: c } : {}) });
  /** 入る前に、部屋のシナリオと空いている陣営を聞いて、装備編成を選ぶ */
  const joinWithCustom = () => {
    fetch(`/api/room?code=${encodeURIComponent(code.trim())}`)
      .then(async (r) => {
        const body = (await r.json()) as { scenarioId: string; openSide: string | null; preset?: string } | { error: string };
        if ("error" in body) throw new Error(body.error);
        const s = scenarios.find((x) => x.id === body.scenarioId);
        if (!s || !body.openSide) throw new Error("この部屋は満員です");
        if (!s.customizableSides.includes(body.openSide)) throw new Error("この部屋のシナリオ・陣営では装備編成を使えません");
        setCustom({ scenario: s, side: body.openSide, ...(body.preset ? { preset: body.preset } : {}), then: join });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <section>
      <h2>オンライン対戦</h2>
      <p className="muted">同じネットワークの2台で遊べます。部屋を作って合言葉を相手に伝え、相手が合言葉で入ると始まります。両者がターン終了を押すと、同時に解決します。</p>
      {desktop && <DesktopConnect />}
      {error && <p className="note">{error}</p>}
      <div className="online">
        <div className="card">
          <h3>部屋を作る</h3>
          <label className="field">
            シナリオ
            <select value={sc?.id ?? ""} onChange={(e) => setScenarioId(e.target.value)} data-testid="online-scenario">
              {scenarios.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            自分の陣営
            <select value={mySide ?? ""} onChange={(e) => setSide(e.target.value)} data-testid="online-side">
              {sc?.sides.slice(0, 2).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          {sc && sc.presets.length > 0 && (
            <label className="field">
              編成(両陣営に同じ)
              <select value={myPreset} onChange={(e) => setPreset(e.target.value)} data-testid="online-preset">
                <option value="">汎用の編成</option>
                {sc.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            1ターンの制限時間(過ぎたら命令なしで進む)
            <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} data-testid="online-time">
              {TIME_LIMITS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="primary" onClick={() => create()} data-testid="online-create">
              部屋を作る
            </button>
            {sc && mySide && sc.customizableSides.includes(mySide) && (
              <button onClick={() => setCustom({ scenario: sc, side: mySide, ...(myPreset ? { preset: myPreset } : {}), then: create })}>装備編成して作る</button>
            )}
          </div>
        </div>
        <div className="card">
          <h3>合言葉で入る</h3>
          <label className="field">
            合言葉
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={6} placeholder="例 K7P2QX" data-testid="online-code" />
          </label>
          <div className="row">
            <button className="primary" disabled={code.length < 6} onClick={() => join()} data-testid="online-join">
              入る
            </button>
            <button disabled={code.length < 6} onClick={joinWithCustom}>
              装備編成して入る
            </button>
          </div>
        </div>
        {rooms.length > 0 && (
          <div className="card">
            <h3>部屋に戻る</h3>
            <p className="muted">接続が切れても、5分以内に戻れば続けられます(過ぎるとAIが引き継ぎ、戻れば取り戻せます)。</p>
            <ul className="saves">
              {rooms.map((r) => (
                <li key={r.code}>
                  <div>
                    <b>{r.code}</b> {r.scenarioName}
                  </div>
                  <div className="row">
                    <button className="primary" onClick={() => game.start({ type: "rejoinRoom", code: r.code, token: r.token })} data-testid={`rejoin-${r.code}`}>
                      戻る
                    </button>
                    <button
                      onClick={() => {
                        removeRoom(r.code);
                        setRooms(listRooms());
                      }}
                    >
                      消す
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {custom && (
        <CustomStartPanel
          scenario={custom.scenario}
          side={custom.side}
          {...(custom.preset ? { preset: custom.preset } : {})}
          onClose={() => setCustom(null)}
          onStart={(c) => {
            setCustom(null);
            custom.then(c);
          }}
        />
      )}
    </section>
  );
}

/** 部屋の待合:合言葉を見せて、相手が入るのを待つ */
export function Lobby({ game }: { game: Game }) {
  const o = game.s.online;
  return (
    <div className="paper menu lobby">
      <h1>オンライン対戦</h1>
      {game.s.error && <p className="note">{game.s.error}</p>}
      {!o && <p className="muted">部屋に入っています…</p>}
      {o && (
        <>
          <p>{o.scenarioName}</p>
          <p>
            合言葉:
            <b className="room-code" data-testid="room-code">
              {o.code}
            </b>
          </p>
          <p className="muted">相手にこの合言葉を伝えてください。相手が入ると、試合が始まります。</p>
        </>
      )}
      <button onClick={() => game.toMenu()}>開始画面へ</button>
    </div>
  );
}

/** 上の帯に出す、相手の様子と残り時間 */
export function RoomBadge({ status, mySide, sideName }: { status: RoomStatus | null; mySide: string; sideName: (id: string) => string }) {
  if (!status) return null;
  const others = status.seats.filter((x) => x.side !== mySide);
  return (
    <span className="room-badge" data-testid="room-status">
      {others.map((x) => (
        <span key={x.side}>
          {sideName(x.side)}:{x.ai ? "AIが代行中" : !x.connected ? "切断中" : x.submitted ? "命令済み" : "考え中"}
        </span>
      ))}
      {status.remainingSec !== null && !status.over && (
        <span className={status.remainingSec <= 30 ? "over" : ""}>
          残り {Math.floor(status.remainingSec / 60)}:{String(status.remainingSec % 60).padStart(2, "0")}
        </span>
      )}
    </span>
  );
}

/**
 * デスクトップ版のつなぎ方:部屋の主は「対戦を受け付ける」を入れて自分のアドレスを相手に伝え、
 * 入る側はそのアドレスで部屋の主のゲームへつなぐ(その先は、部屋を作る・合言葉で入るのいつもの流れ)
 */
function DesktopConnect() {
  const [status, setStatus] = useState<(HostingStatus & { remote?: boolean }) | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    desktop?.hostingStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  if (!desktop || !status) return null;
  if (status.remote)
    return (
      <div className="card desktop-connect" data-testid="desktop-remote">
        <h3>ほかの PC の部屋につないでいます({location.host})</h3>
        <p className="muted">部屋の主の PC のゲームを使っています。部屋を作る・合言葉で入るで対戦を始めてください。</p>
        <button onClick={() => desktop?.goHome()}>自分の PC に戻る</button>
      </div>
    );
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus({ ...status, ...(await desktop!.setHosting(!status.hosting)) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    setBusy(true);
    setError(null);
    const r = await desktop!.connect(address);
    setBusy(false);
    if (!r.ok) setError(r.error ?? "つながりませんでした");
  };
  return (
    <div className="online desktop-connect" data-testid="desktop-connect">
      <div className="card">
        <h3>部屋の主になる</h3>
        <label className="row">
          <input type="checkbox" checked={status.hosting} disabled={busy} onChange={toggle} data-testid="desktop-hosting" />
          対戦を受け付ける
        </label>
        {status.hosting ? (
          <>
            <p>相手に伝えるアドレス:</p>
            <ul data-testid="desktop-addresses">
              {status.addresses.map((a) => (
                <li key={a}>
                  <b>{a}</b>
                  {status.port !== 47320 ? `:${status.port}` : ""}
                  <span className="muted">{a.startsWith("100.") ? "(Tailscale)" : a.startsWith("192.168.") || a.startsWith("10.") ? "(同じ Wi-Fi・LAN)" : ""}</span>
                </li>
              ))}
            </ul>
            <p className="muted">伝えたら、下の「部屋を作る」で部屋を作り、合言葉も伝えてください。初めて受け付けるとき、Windows のファイアウォールの確認が出たら「アクセスを許可する」を押します。</p>
          </>
        ) : (
          <p className="muted">入れると、同じ Wi-Fi か Tailscale でつながった相手が、あなたの PC のゲームに入れるようになります。</p>
        )}
      </div>
      <div className="card">
        <h3>ほかの PC の部屋に入る</h3>
        <label className="field">
          部屋の主のアドレス
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例:192.168.1.23 / 100.64.0.5" data-testid="desktop-address" />
        </label>
        <button className="primary" disabled={busy || !address.trim()} onClick={connect} data-testid="desktop-join">
          つなぐ
        </button>
        <p className="muted">つないだら、部屋の主から聞いた合言葉で「合言葉で入る」を押してください。</p>
      </div>
      {error && <p className="note">{error}</p>}
    </div>
  );
}

