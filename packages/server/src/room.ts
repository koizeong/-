import { decide, DEFAULT_AI, type AiConfig } from "@brigade/ai";
import type { CustomStart, OnlineRecord, RoomStatus, TurnOutcome } from "@brigade/protocol";
import {
  customizeScenarioSides,
  isGameOver,
  replayForSide,
  resolveTurn,
  type GameState,
  type HqCommand,
  type LoadedScenario,
  type PackSet,
  type ParseResult,
  type RejectedHqCommand,
  type RejectedOrder,
  type SideCustomization,
  type UnitOrder,
  viewForSide,
} from "@brigade/sim-core";

/**
 * オンライン対戦の部屋(人間2人、同時入力)。サーバー権威:両者の命令が揃ったら(または制限時間が来たら)sim-core で同時に解決し、
 * それぞれに自陣営のビューと再生データだけを返す(霧)。人間のいない陣営(3陣営以上のシナリオ・切断が長引いた陣営)は AI が受け持つ。
 * 時計は外から渡す(テストで時間を進められるように)。WebSocket から切り離した純粋なクラス
 */

/** 切断した陣営を、この時間戻らなければ AI が引き継ぐ */
export const DISCONNECT_GRACE_MS = 5 * 60 * 1000;
/** 部屋を作るときに選べる1ターンの制限時間(秒。0は制限なし) */
export const TIME_LIMITS = [0, 180, 300] as const;

export interface Seat {
  /** 戻るための鍵(部屋を作った・入ったときに渡す) */
  token: string;
  connected: boolean;
  /** 切断した時刻(つながっていれば null) */
  disconnectedAt: number | null;
  /** AI が受け持っている(切断が長引いた) */
  ai: boolean;
  custom?: CustomStart;
}

export interface RoomEvents {
  /** ある陣営へ、解決したターンの結果を送る */
  resolved(side: string, outcome: TurnOutcome): void;
  /** 部屋の状態が変わった(命令済み・切断・AI の引き継ぎ・締め切り) */
  status(): void;
}

export class Room {
  /** 部屋に入った人間の陣営(作った人・入った人) */
  readonly seats = new Map<string, Seat>();
  private state: GameState | null = null;
  private scenario: LoadedScenario | null = null;
  /** このターンに命令を出し終えた陣営と、その命令 */
  private submitted = new Map<string, { orders: UnitOrder[]; hqCommands: HqCommand[] }>();
  /** このターンの締め切り(制限時間がなければ null) */
  private deadline: number | null = null;
  private readonly turns: OnlineRecord["turns"] = [];

  constructor(
    readonly code: string,
    private readonly base: LoadedScenario,
    private readonly packs: PackSet | undefined,
    readonly seed: number,
    readonly timeLimitSec: number,
    private readonly events: RoomEvents,
    private readonly ai: AiConfig = DEFAULT_AI,
  ) {}

  get scenarioId(): string {
    return this.base.def.id;
  }

  get started(): boolean {
    return this.state !== null;
  }

  get over(): boolean {
    return !!this.state && !!this.scenario && isGameOver(this.state, this.scenario.ctx);
  }

  /** 人間が座れる陣営(シナリオの陣営のうち最初の2つ) */
  get humanSides(): string[] {
    return this.base.def.sides.slice(0, 2).map((s) => s.id);
  }

  /** 空いている陣営 */
  get openSides(): string[] {
    return this.humanSides.filter((s) => !this.seats.has(s));
  }

  /** 陣営に座る。両方が揃ったら試合を始める(装備編成があれば両陣営の分を入れて読み込み直す) */
  sit(side: string, token: string, now: number, custom?: CustomStart): ParseResult<true> {
    if (this.started) return { ok: false, errors: ["試合はもう始まっています"] };
    if (!this.openSides.includes(side)) return { ok: false, errors: [`陣営 "${side}" は空いていません`] };
    this.seats.set(side, { token, connected: true, disconnectedAt: null, ai: false, ...(custom ? { custom } : {}) });
    if (this.openSides.length > 0) return { ok: true, value: true };
    const perSide: Record<string, SideCustomization> = {};
    for (const [s, seat] of this.seats) if (seat.custom) perSide[s] = { bundle: seat.custom.bundle, subs: seat.custom.substitutions };
    let scenario = this.base;
    if (Object.keys(perSide).length > 0) {
      if (!this.packs) return this.unsit(side, ["このサーバーは装備編成を受け付けていません"]);
      const r = customizeScenarioSides(this.base.def, this.packs, perSide);
      if (!r.ok) return this.unsit(side, r.errors);
      scenario = r.value.scenario;
    }
    this.scenario = scenario;
    this.state = scenario.start(this.seed);
    this.startTurn(now);
    return { ok: true, value: true };
  }

  private unsit(side: string, errors: string[]): ParseResult<true> {
    this.seats.delete(side);
    return { ok: false, errors };
  }

  /** 鍵の合う陣営(戻るとき) */
  sideOf(token: string): string | null {
    for (const [s, seat] of this.seats) if (seat.token === token) return s;
    return null;
  }

  /** 戻った。AI が引き継いでいても、人間の操作に戻す */
  reconnect(side: string): void {
    const seat = this.seats.get(side);
    if (!seat) return;
    seat.connected = true;
    seat.disconnectedAt = null;
    seat.ai = false;
    this.events.status();
  }

  disconnect(side: string, now: number): void {
    const seat = this.seats.get(side);
    if (!seat) return;
    seat.connected = false;
    seat.disconnectedAt = now;
    this.events.status();
  }

  /** 時間を進める(サーバーが毎秒呼ぶ):切断が長引いた陣営を AI に引き継ぎ、締め切りが来たら命令のない陣営は命令なしで解決する */
  tick(now: number): void {
    if (!this.started || this.over) return;
    let changed = false;
    for (const seat of this.seats.values()) {
      if (!seat.connected && !seat.ai && seat.disconnectedAt !== null && now - seat.disconnectedAt >= DISCONNECT_GRACE_MS) {
        seat.ai = true;
        changed = true;
      }
    }
    if (changed) this.events.status();
    if (this.deadline !== null && now >= this.deadline) this.resolve(now);
    else if (changed && this.ready()) this.resolve(now);
  }

  /** 命令を出す(ターン終了)。両者が揃えば解決する */
  submit(side: string, turn: number, orders: readonly UnitOrder[], hqCommands: readonly HqCommand[], now: number): void {
    if (!this.state) throw new Error("試合はまだ始まっていません(相手を待っています)");
    if (this.over) throw new Error("試合は終わっています");
    if (turn !== this.state.turn) throw new Error(`今は ${this.state.turn} ターン目です(${turn} ターン目の命令は受け付けません)`);
    if (this.submitted.has(side)) throw new Error("このターンの命令はもう出しています");
    this.submitted.set(side, { orders: structuredClone([...orders]), hqCommands: structuredClone([...hqCommands]) });
    if (this.ready()) this.resolve(now);
    else this.events.status();
  }

  /** 人間が操作している陣営がすべて命令を出した */
  private ready(): boolean {
    for (const [s, seat] of this.seats) if (!seat.ai && !this.submitted.has(s)) return false;
    return true;
  }

  private startTurn(now: number): void {
    this.submitted.clear();
    this.deadline = this.timeLimitSec > 0 ? now + this.timeLimitSec * 1000 : null;
    this.events.status();
  }

  /** 1ターンを解決する。人間の陣営の命令は自陣営のユニット・司令部コマンドだけを通し、ほかの陣営は AI が決める */
  private resolve(now: number): void {
    const state = this.state!;
    const ctx = this.scenario!.ctx;
    const turn = state.turn;
    const allOrders: UnitOrder[] = [];
    const allHq: HqCommand[] = [];
    const forbidden = new Map<string, { orders: RejectedOrder[]; hq: RejectedHqCommand[] }>();
    const record: OnlineRecord["turns"][number] = {};
    for (const side of this.base.def.sides.map((s) => s.id)) {
      const seat = this.seats.get(side);
      const human = seat && !seat.ai ? (this.submitted.get(side) ?? { orders: [], hqCommands: [] }) : null;
      if (!human) {
        const d = decide(viewForSide(state, side), ctx, this.ai, this.seed);
        allOrders.push(...d.orders);
        allHq.push(...d.hqCommands);
        continue;
      }
      record[side] = human;
      const own = new Set(state.units.filter((u) => u.side === side).map((u) => u.id));
      const f = { orders: [] as RejectedOrder[], hq: [] as RejectedHqCommand[] };
      for (const o of human.orders) {
        if (own.has(o.unitId)) allOrders.push(o);
        else f.orders.push({ unitId: o.unitId, reason: "自陣営のユニットではありません" });
      }
      for (const c of human.hqCommands) {
        if (c.side === side) allHq.push(c);
        else f.hq.push({ command: c, reason: "自陣営の司令部コマンドではありません" });
      }
      forbidden.set(side, f);
    }
    this.turns.push(record);
    const r = resolveTurn(state, allOrders, ctx, allHq);
    this.state = r.state;
    for (const side of this.seats.keys()) {
      const own = new Set(state.units.filter((u) => u.side === side).map((u) => u.id));
      const f = forbidden.get(side) ?? { orders: [], hq: [] };
      this.events.resolved(side, {
        turn,
        replay: replayForSide(r, side),
        rejectedOrders: [...f.orders, ...r.rejectedOrders.filter((x) => own.has(x.unitId))],
        rejectedHqCommands: [...f.hq, ...r.rejectedHqCommands.filter((x) => x.command.side === side)],
        result: r.result,
      });
    }
    if (this.over) {
      this.submitted.clear();
      this.deadline = null;
      this.events.status();
    } else this.startTurn(now);
  }

  /** 部屋の様子(両者に送る。命令の中身は見せず、出し終えたかだけ) */
  status(now: number): RoomStatus {
    return {
      code: this.code,
      scenarioId: this.scenarioId,
      started: this.started,
      over: this.over,
      turn: this.state?.turn ?? 0,
      timeLimitSec: this.timeLimitSec,
      remainingSec: this.deadline === null ? null : Math.max(0, Math.ceil((this.deadline - now) / 1000)),
      seats: this.humanSides.map((side) => {
        const seat = this.seats.get(side);
        return {
          side,
          taken: !!seat,
          connected: !!seat?.connected,
          ai: !!seat?.ai,
          submitted: this.submitted.has(side),
        };
      }),
    };
  }

  /** 試合の記録(両陣営の命令)。命令の中身は相手に見せないので、試合が終わってからだけ渡す */
  record(): OnlineRecord | null {
    if (!this.over) return null;
    const custom: Record<string, CustomStart> = {};
    for (const [s, seat] of this.seats) if (seat.custom) custom[s] = seat.custom;
    return { version: 1, kind: "online", scenarioId: this.scenarioId, seed: this.seed, scenarioHash: this.scenario!.hash, turns: structuredClone(this.turns), custom };
  }

  get loaded(): LoadedScenario | null {
    return this.scenario;
  }

  get current(): GameState | null {
    return this.state;
  }

  view(side: string) {
    return this.state ? viewForSide(this.state, side) : null;
  }
}

/** 部屋の合言葉(紛らわしい文字を除いた6文字)。乱数は外から渡す(サーバーの乱数。sim-core の決定論とは関係ない) */
export function roomCode(random: () => number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(random() * chars.length)];
  return s;
}
