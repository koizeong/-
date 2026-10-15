import type { ScenarioInfo, ServerMessage, TurnOutcome } from "@brigade/protocol";
import type { HqCommand, SideView, UnitOrder } from "@brigade/sim-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { Connection } from "./net.js";

export type Phase = "connecting" | "planning" | "waiting" | "replay" | "over";

/** 司令部コマンドの照準(地図を押すと地点が決まる) */
export type Targeting = { kind: "fireMission"; unitId: string } | { kind: "airborneDrop"; unitId: string } | { kind: "airStrike" } | { kind: "airDrop" } | null;

export interface GameState {
  phase: Phase;
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
  error: string | null;
}

const REPLAY_MS = 6000;

/** 中身のある命令か(サーバーの数え方と同じ) */
export function hasContent(o: UnitOrder): boolean {
  return Object.keys(o).some((k) => k !== "unitId" && (o as unknown as Record<string, unknown>)[k] !== undefined);
}

export function useGame() {
  const [s, setS] = useState<GameState>({
    phase: "connecting",
    info: null,
    view: null,
    orders: {},
    hq: [],
    selected: null,
    targeting: null,
    last: null,
    replayProgress: 1,
    error: null,
  });
  const conn = useRef<Connection | null>(null);
  const pendingView = useRef<SideView | null>(null);
  // 最新の状態(送信など、副作用のある処理は状態更新関数の外で、ここから読む。
  // 開発モードの React は状態更新関数を2回呼ぶので、中で送信すると2回送ってしまう)
  const latest = useRef(s);
  latest.current = s;

  const onMessage = useCallback((m: ServerMessage) => {
    if (m.type === "welcome") {
      setS((p) => ({ ...p, phase: "planning", info: m.info, view: m.view, error: null }));
    } else if (m.type === "turnResolved") {
      pendingView.current = m.view;
      setS((p) => ({ ...p, phase: "replay", last: m.outcome, replayProgress: 0, orders: {}, hq: [], targeting: null }));
    } else {
      setS((p) => ({ ...p, error: m.message, phase: p.phase === "waiting" ? "planning" : p.phase }));
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const c = new Connection(onMessage, (st) => {
      if (st === "closed") setS((p) => ({ ...p, error: "サーバーとの接続が切れました" }));
    });
    const seed = params.get("seed");
    c.send({
      type: "join",
      ...(params.get("scenario") ? { scenarioId: params.get("scenario")! } : {}),
      ...(params.get("side") ? { side: params.get("side")! } : {}),
      ...(seed ? { seed: Number(seed) } : {}),
    });
    conn.current = c;
    return () => c.close();
  }, [onMessage]);

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
      return { ...p, view, phase: p.last?.result ? "over" : "planning", replayProgress: 1 };
    });
  }, []);

  const commandPointsUsed = Object.values(s.orders).filter(hasContent).length + s.hq.length;

  return {
    s,
    commandPointsUsed,
    select: (id: string | null) => setS((p) => ({ ...p, selected: id, targeting: null })),
    setOrder: (unitId: string, patch: Partial<UnitOrder>) =>
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
  };
}

export type Game = ReturnType<typeof useGame>;
