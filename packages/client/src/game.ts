import type { ClientMessage, GameRecord, ModifiersByUnit, MovePreview, OnlineRecord, RoomStatus, ScenarioInfo, ServerMessage, Tutorial, TutorialUntil, TurnOutcome } from "@brigade/protocol";
import { estimateEnemyLoss, type HqCommand, type SideView, type UnitOrder } from "@brigade/sim-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Connection } from "./net.js";
import { putRoom, putSave } from "./saves.js";

export type Phase = "menu" | "connecting" | "lobby" | "planning" | "waiting" | "replay" | "over";

/** 開始画面のうち、どの画面を見せるか(タイトル・シナリオ選択・続きから・オンライン対戦・手引き) */
export type MenuScreen = "title" | "scenarios" | "continue" | "online" | "tutorials";

/** 試合の始め方:新しく始める(シナリオ・陣営・シード)か、記録から続ける */
export type JoinRequest = Omit<Extract<ClientMessage, { type: "join" }>, "type">;

/** オンライン対戦の始め方:部屋を作る・合言葉で入る・鍵で戻る */
export type RoomRequest = Extract<ClientMessage, { type: "createRoom" | "joinRoom" | "rejoinRoom" }>;

/** オンライン対戦の部屋(座った陣営・戻るための鍵・部屋の様子・終わった試合の記録) */
export interface OnlineState {
  code: string;
  token: string;
  side: string;
  scenarioName: string;
  status: RoomStatus | null;
  record: OnlineRecord | null;
}

/** 司令部コマンドの照準(地図を押すと地点が決まる) */
export type Targeting =
  | { kind: "fireMission"; unitId: string }
  | { kind: "airborneDrop"; unitId: string }
  | { kind: "navalGunfire" }
  | { kind: "airRecon" }
  | { kind: "patrol"; unitId: string }
  | { kind: "airStrike"; escort: number }
  | { kind: "interdiction"; escort: number }
  | { kind: "airSuperiority" }
  | { kind: "airDrop" }
  | { kind: "demolishBridge" }
  | { kind: "repairBridge" }
  | null;

/** 1ターン前の自軍のゲージ(このターンの変化を見せるため) */
export type Gauges = { strength: number; morale: number; suppression: number };

/** 戦況の推移(作戦フェイズごと):自軍の損耗率(正確)と、敵の損耗率の見積もり(霧の内側から) */
export interface ProgressPoint {
  turn: number;
  ownLoss: number;
  enemyLoss: number;
}

/** 戦闘の経過(結果の画面に出す主な出来事):目標の持ち主の変化、自軍の部隊を失った、敵の撃破を確かめた */
export interface ChronicleEntry {
  /** 出来事のあったターンの終わりの時刻(試合の始めからの秒) */
  time: number;
  kind: "taken" | "lost" | "unitLost" | "kill";
  text: string;
}

/** 前のターンのビューと新しいビューを比べて、戦闘の経過に足す出来事 */
export function chronicleOf(prev: SideView, next: SideView, info: ScenarioInfo): ChronicleEntry[] {
  const out: ChronicleEntry[] = [];
  const time = next.time;
  const sideName = (id: string) => info.sides.find((x) => x.id === id)?.name ?? id;
  for (const o of info.objectives) {
    const a = prev.objectives[o.id] ?? null;
    const b = next.objectives[o.id] ?? null;
    if (a === b) continue;
    if (b === info.mySide) out.push({ time, kind: "taken", text: `${o.name}を確保した` });
    else if (a === info.mySide) out.push({ time, kind: "lost", text: `${o.name}を${b ? `${sideName(b)}に` : ""}奪われた` });
    else if (b) out.push({ time, kind: "lost", text: `${sideName(b)}が${o.name}を確保した` });
  }
  const still = new Set(next.own.map((u) => u.id));
  for (const u of prev.own) if (!still.has(u.id)) out.push({ time, kind: "unitLost", text: `${u.id.replace(/^[a-z]+-/, "")}(${info.toeNames[u.toe] ?? u.toe})を失った` });
  const killed = new Set(prev.contacts.filter((c) => c.destroyed).map((c) => c.contactId));
  for (const c of next.contacts) {
    if (!c.destroyed || killed.has(c.contactId)) continue;
    out.push({ time, kind: "kill", text: `敵${c.branch ? (info.branchNames[c.branch] ?? "") : ""}の部隊の撃破を確かめた` });
  }
  return out;
}

function progressOf(v: SideView): ProgressPoint {
  return { turn: v.turn, ownLoss: v.ownLoss, enemyLoss: estimateEnemyLoss(v.contacts) };
}

export interface GameState {
  phase: Phase;
  /** 開始画面に戻ったときに見せる画面 */
  menuScreen: MenuScreen;
  info: ScenarioInfo | null;
  view: SideView | null;
  /** 下書き中の命令(ユニットID → 命令) */
  orders: Record<string, UnitOrder>;
  hq: HqCommand[];
  selected: string | null;
  targeting: Targeting;
  /** 直前のターンの結果(再生と出来事の記録に使う) */
  last: TurnOutcome | null;
  /** 再生の進み具合(0〜1) */
  replayProgress: number;
  /** 自軍ユニットにいま効いている補正 */
  modifiers: ModifiersByUnit;
  /** 直前のターンを始めたときの自軍のゲージ(ユニットID → ゲージ) */
  before: Record<string, Gauges>;
  /** 戦況の推移 */
  history: ProgressPoint[];
  /** 戦闘の経過(主な出来事。結果の画面に出す) */
  chronicle: ChronicleEntry[];
  /** 試合を始めた(続きからなら再開した)ときの自軍の部隊(結果の画面で、失った部隊を数える) */
  startOwn: { id: string; toe: string }[];
  /** 試合の記録(セーブデータ) */
  record: GameRecord | null;
  /** 移動の命令の下書きの、経路の見積もり(ユニットID → 見積もりと、その元になった下書きのキー) */
  previews: Record<string, { key: string; preview: MovePreview }>;
  /** 手引き(チュートリアル)と、いま見ている段 */
  tutorial: { def: Tutorial; step: number } | null;
  /** 続きから始めたときの知らせ(再生したターンの数と、データが保存したときと同じか) */
  resumed: { turns: number; sameData: boolean } | null;
  /** オンライン対戦の部屋(人間1人 対 AI なら null) */
  online: OnlineState | null;
  error: string | null;
}

const REPLAY_MS = 6000;

/**
 * 移動のしかた(画面では隊形で選ぶ)。このターンにボタンで選んでいればそれ、なければ今の隊形から決める:
 * 縦隊なら縦隊のまま速く動く(行軍)、展開済み・展開中なら展開のまま動く(戦闘移動)。
 * 前のターンの移動モードは引き継がない(展開している部隊が、目的地を出しただけで縦隊になる誤操作を防ぐ)
 */
export function intendedMode(u: { formation: string }, order: { moveMode?: "march" | "combat" } | undefined): "march" | "combat" {
  return order?.moveMode ?? (u.formation === "column" ? "march" : "combat");
}

/** 中身のある命令か(サーバーの数え方と同じ) */
export function hasContent(o: UnitOrder): boolean {
  return Object.keys(o).some((k) => k !== "unitId" && (o as unknown as Record<string, unknown>)[k] !== undefined);
}

/** URL に試合の指定(?scenario= / ?side=)があれば、開始画面を飛ばしてすぐ始める */
function joinFromUrl(): JoinRequest | null {
  const params = new URLSearchParams(location.search);
  if (!params.get("scenario") && !params.get("side")) return null;
  const seed = params.get("seed");
  return {
    ...(params.get("scenario") ? { scenarioId: params.get("scenario")! } : {}),
    ...(params.get("side") ? { side: params.get("side")! } : {}),
    ...(seed ? { seed: Number(seed) } : {}),
  };
}

/** URL の ?menu= で、開始画面のどの画面から始めるか(e2e と開発用。省略は表紙) */
function menuFromUrl(): MenuScreen {
  const m = new URLSearchParams(location.search).get("menu");
  return m === "scenarios" || m === "continue" || m === "online" || m === "tutorials" ? m : "title";
}

/** 試合の状態の初期値(開始画面に戻るときにも使う) */
const fresh = (phase: Phase, menuScreen: MenuScreen = "title"): GameState => ({
  phase,
  menuScreen,
  info: null,
  view: null,
  orders: {},
  hq: [],
  selected: null,
  targeting: null,
  last: null,
  replayProgress: 1,
  modifiers: {},
  before: {},
  history: [],
  chronicle: [],
  startOwn: [],
  record: null,
  resumed: null,
  online: null,
  previews: {},
  tutorial: null,
  error: null,
});

/** 手引きの段の「次へ進む条件」を満たしたか */
export function tutorialDone(until: TutorialUntil, p: GameState): boolean {
  switch (until.type) {
    case "select":
      return p.selected === until.unitId;
    case "order": {
      const v = (p.orders[until.unitId] as Record<string, unknown> | undefined)?.[until.field];
      if (v === undefined || (Array.isArray(v) && v.length === 0)) return false;
      return until.value === undefined || v === until.value;
    }
    case "hq":
      return p.hq.some((c) => c.type === until.command);
    case "turn":
      return p.phase === "planning" && !!p.view && p.view.turn >= until.atLeast;
  }
}

/** 経路の見積もりを頼む下書き:経由点つきの命令だけ。キーが変わったら頼み直す */
function previewRequests(p: GameState): Record<string, { key: string; waypoints: { x: number; y: number }[]; moveMode: "march" | "combat" }> {
  const out: ReturnType<typeof previewRequests> = {};
  for (const o of Object.values(p.orders)) {
    const u = p.view?.own.find((x) => x.id === o.unitId);
    if (!u || !o.waypoints || o.waypoints.length === 0) continue;
    const moveMode = intendedMode(u, o);
    out[o.unitId] = { key: JSON.stringify([o.waypoints, moveMode]), waypoints: o.waypoints, moveMode };
  }
  return out;
}

/** 下書きを変えてから見積もりを頼むまでの待ち(ドラッグ中に何度も頼まない) */
const PREVIEW_DEBOUNCE_MS = 120;

/** 自動保存(ターンを解決するたびに上書き) */
function autosave(record: GameRecord, info: ScenarioInfo, turn: number, finished: boolean) {
  putSave({
    record,
    scenarioName: info.name,
    sideName: info.sides.find((x) => x.id === info.mySide)?.name ?? info.mySide,
    turn,
    maxTurns: info.maxTurns,
    finished,
  });
}

export function useGame() {
  const [s, setS] = useState<GameState>(() => fresh(joinFromUrl() ? "connecting" : "menu", menuFromUrl()));
  const conn = useRef<Connection | null>(null);
  const pendingView = useRef<SideView | null>(null);
  const pendingModifiers = useRef<ModifiersByUnit | null>(null);
  /** ユニットごとに最後に頼んだ見積もり */
  const previewSent = useRef(new Map<string, { requestId: number; key: string }>());
  const nextRequestId = useRef(1);
  // 最新の状態(送信など、副作用のある処理は状態更新関数の外で、ここから読む。
  // 開発モードの React は状態更新関数を2回呼ぶので、中で送信すると2回送ってしまう)
  const latest = useRef(s);
  latest.current = s;

  const onMessage = useCallback((m: ServerMessage) => {
    if (m.type === "welcome") {
      if (m.record) autosave(m.record, m.info, m.view.turn, !!m.last?.result);
      setS((p) => ({
        ...p,
        phase: m.last?.result ? "over" : "planning",
        info: m.info,
        view: m.view,
        modifiers: m.modifiers,
        history: [progressOf(m.view)],
        chronicle: [],
        startOwn: m.view.own.map((u) => ({ id: u.id, toe: u.toe })),
        record: m.record ?? null,
        resumed: m.resumed ?? null,
        last: m.last ?? null,
        error: null,
      }));
    } else if (m.type === "turnResolved") {
      previewSent.current.clear();
      pendingView.current = m.view;
      pendingModifiers.current = m.modifiers;
      const info = latest.current.info;
      if (info && m.record) autosave(m.record, info, m.view.turn, !!m.outcome.result);
      setS((p) => ({
        ...p,
        record: m.record ?? null,
        chronicle: p.view && p.info ? [...p.chronicle, ...chronicleOf(p.view, m.view, p.info)] : p.chronicle,
        phase: "replay",
        last: m.outcome,
        replayProgress: 0,
        orders: {},
        hq: [],
        targeting: null,
        previews: {},
        before: Object.fromEntries((p.view?.own ?? []).map((u) => [u.id, { strength: u.strength, morale: u.morale, suppression: u.suppression }])),
      }));
    } else if (m.type === "preview") {
      // 頼んだ後に下書きが変わっていたら、古い見積もりは捨てる
      const sent = previewSent.current.get(m.unitId);
      if (!sent || sent.requestId !== m.requestId || !m.preview) return;
      const preview = m.preview;
      setS((p) => ({ ...p, previews: { ...p.previews, [m.unitId]: { key: sent.key, preview } } }));
    } else if (m.type === "roomJoined") {
      // 戻るための鍵をブラウザに残す(切断しても開始画面の「部屋に戻る」で戻れる)
      putRoom({ code: m.code, token: m.token, side: m.side, scenarioName: m.scenarioName });
      setS((p) => ({ ...p, phase: p.phase === "connecting" ? "lobby" : p.phase, online: { code: m.code, token: m.token, side: m.side, scenarioName: m.scenarioName, status: null, record: null } }));
    } else if (m.type === "roomStatus") {
      setS((p) => (p.online ? { ...p, online: { ...p.online, status: m.status } } : p));
    } else if (m.type === "roomRecord") {
      setS((p) => (p.online ? { ...p, online: { ...p.online, record: m.record } } : p));
    } else {
      setS((p) => ({ ...p, error: m.message, phase: p.phase === "waiting" ? "planning" : p.phase === "connecting" && p.online === null && p.info === null ? p.phase : p.phase }));
    }
  }, []);

  /** 試合を始める(新しく、記録から、またはオンライン対戦の部屋)。前の接続は閉じる */
  const start = useCallback(
    (join: JoinRequest | RoomRequest, tutorial: Tutorial | null = null) => {
      const old = conn.current;
      conn.current = null;
      old?.close();
      const c = new Connection(onMessage, (st) => {
        // 自分で閉じた接続(開始画面へ戻る・別の試合を始める)は知らせない
        if (st === "closed" && conn.current === c)
          setS((p) => ({ ...p, error: p.online ? "サーバーとの接続が切れました。開始画面の「部屋に戻る」で戻れます" : "サーバーとの接続が切れました" }));
      });
      conn.current = c;
      c.send("type" in join ? join : { type: "join", ...join });
      previewSent.current.clear();
      setS({ ...fresh("connecting"), tutorial: tutorial ? { def: tutorial, step: 0 } : null });
    },
    [onMessage],
  );

  // URL に試合の指定があれば、すぐ始める
  useEffect(() => {
    const join = joinFromUrl();
    if (join) start(join);
    return () => {
      const c = conn.current;
      conn.current = null;
      c?.close();
    };
  }, [start]);

  /** 開始画面へ戻る(試合は自動保存してある) */
  /** 開始画面へ戻る(screen:見せる画面。省略はタイトル) */
  const toMenu = useCallback((screen: MenuScreen = "title") => {
    const c = conn.current;
    conn.current = null;
    c?.close();
    previewSent.current.clear();
    setS(fresh("menu", screen));
  }, []);

  // 再生のアニメーション。終わったら新しいビューで次の作戦フェイズへ
  useEffect(() => {
    if (s.phase !== "replay") return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / REPLAY_MS);
      setS((p) => (p.phase === "replay" ? { ...p, replayProgress: t } : p));
      if (t < 1) raf = requestAnimationFrame(tick);
      else finishReplay();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s.phase]);

  const finishReplay = useCallback(() => {
    setS((p) => {
      if (p.phase !== "replay") return p;
      const view = pendingView.current ?? p.view;
      const history = view && !p.history.some((h) => h.turn === view.turn) ? [...p.history, progressOf(view)] : p.history;
      return { ...p, view, modifiers: pendingModifiers.current ?? p.modifiers, history, phase: p.last?.result ? "over" : "planning", replayProgress: 1 };
    });
  }, []);

  // 経路の見積もり:下書きが変わったら(少し待って)サーバーに頼む。下書きが消えたユニットの見積もりは消す
  useEffect(() => {
    if (s.phase !== "planning") return;
    const want = previewRequests(s);
    const stale = Object.keys(s.previews).filter((id) => want[id]?.key !== s.previews[id]!.key);
    if (stale.length) {
      setS((p) => {
        const previews = { ...p.previews };
        for (const id of stale) delete previews[id];
        return { ...p, previews };
      });
    }
    for (const id of [...previewSent.current.keys()]) if (!want[id]) previewSent.current.delete(id);
    const timer = setTimeout(() => {
      for (const [unitId, r] of Object.entries(want)) {
        if (previewSent.current.get(unitId)?.key === r.key) continue;
        const requestId = nextRequestId.current++;
        previewSent.current.set(unitId, { requestId, key: r.key });
        conn.current?.send({ type: "preview", requestId, unitId, waypoints: r.waypoints, moveMode: r.moveMode });
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [s.phase, s.orders, s.view]);

  // 手引き:いまの段の条件を満たしたら、次の段へ進む
  useEffect(() => {
    const t = s.tutorial;
    const until = t?.def.steps[t.step]?.until;
    if (!t || !until || t.step >= t.def.steps.length - 1 || !tutorialDone(until, s)) return;
    setS((p) => (p.tutorial === t ? { ...p, tutorial: { ...t, step: t.step + 1 } } : p));
  }, [s]);

  const commandPointsUsed = Object.values(s.orders).filter(hasContent).length + s.hq.length;

  return {
    s,
    start,
    toMenu,
    commandPointsUsed,
    select: (id: string | null) => setS((p) => ({ ...p, selected: id, targeting: null })),
    setOrder: (unitId: string, patch: { [K in keyof UnitOrder]?: UnitOrder[K] | undefined }) =>
      setS((p) => {
        const next = { ...(p.orders[unitId] ?? { unitId }), ...patch } as UnitOrder;
        for (const k of Object.keys(next) as (keyof UnitOrder)[]) if (next[k] === undefined) delete next[k];
        return { ...p, orders: { ...p.orders, [unitId]: next } };
      }),
    clearOrder: (unitId: string) =>
      setS((p) => {
        const { [unitId]: _removed, ...rest } = p.orders;
        return { ...p, orders: rest };
      }),
    setTargeting: (t: Targeting) => setS((p) => ({ ...p, targeting: t })),
    addHq: (c: HqCommand) =>
      setS((p) => ({
        ...p,
        targeting: null,
        // 同じ砲兵への砲撃・同じ部隊への近接航空支援は1つまで(置き換える)
        hq: [
          ...p.hq.filter(
            (x) =>
              !(c.type === "fireMission" && x.type === "fireMission" && x.unitId === c.unitId) &&
              !(c.type === "closeAirSupport" && x.type === "closeAirSupport" && x.unitId === c.unitId),
          ),
          c,
        ],
      })),
    removeHq: (i: number) => setS((p) => ({ ...p, hq: p.hq.filter((_, k) => k !== i) })),
    endTurn: () => {
      const p = latest.current;
      if (p.phase !== "planning" || !p.view) return;
      conn.current?.send({ type: "submitTurn", turn: p.view.turn, orders: Object.values(p.orders).filter(hasContent), hqCommands: p.hq });
      setS((q) => ({ ...q, phase: "waiting", error: null, selected: null, targeting: null }));
    },
    skipReplay: finishReplay,
    dismissError: () => setS((p) => ({ ...p, error: null })),
    tutorialStep: (delta: number) =>
      setS((p) => (p.tutorial ? { ...p, tutorial: { ...p.tutorial, step: Math.max(0, Math.min(p.tutorial.def.steps.length - 1, p.tutorial.step + delta)) } } : p)),
    closeTutorial: () => setS((p) => ({ ...p, tutorial: null })),
  };
}

export type Game = ReturnType<typeof useGame>;
