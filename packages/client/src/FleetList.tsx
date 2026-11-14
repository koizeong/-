import type { OwnUnitView, SideView } from "@brigade/sim-core";
import type { ScenarioInfo } from "@brigade/protocol";
import { useState } from "react";
import { isAir, isShip, type Game } from "./game.js";
import { unitLabel as label } from "./names.js";

/**
 * 海戦のある試合の自軍の一覧。艦は1隻ずつのユニットだが、ふだんは戦隊ごとに動かすので、一覧も戦隊(任務部隊の下の群)ごとにまとめる。
 * - 戦隊の行を押すと、その戦隊(旗艦)を選ぶ。▸ で艦の一覧(浮力・火災・浸水)を開く。艦を戦隊から離すのは戦隊の欄の「切り離す」
 * - 航空隊は母艦ごと・陸の飛行場ごとにまとめ、いつも見せる(出撃の命令をいちばんよく出すので)
 * - 陸の部隊(島の守備隊など)は最後にまとめる
 */
const AIR_STATUS_SHORT: Record<string, string> = {
  ready: "待機",
  spotting: "発艦待ち",
  outbound: "進撃中",
  attacking: "攻撃中",
  returning: "帰投中",
  rearming: "積み直し",
  cap: "直衛中",
  searching: "索敵中",
};

/** 1つの戦隊(と、そこを離れた艦)の要約 */
function shipNote(u: OwnUnitView): string {
  const h = u.hull;
  const bits: string[] = [`浮力 ${Math.round(u.strength * 100)}%`];
  if (h && h.fire >= 0.05) bits.push("火災");
  if (h && h.floodPort + h.floodStbd >= 0.05) bits.push("浸水");
  if (u.detached) bits.push("離脱");
  return bits.join("・");
}

/** 航空隊の機数(編成表の機数 × 戦力) */
export function aircraftOf(u: OwnUnitView, info: ScenarioInfo): number {
  const full = info.fleet?.airToes[u.toe]?.aircraft ?? 0;
  return Math.round(full * u.strength);
}

export function FleetUnitList({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((p) => ({ ...p, [k]: !p[k] }));
  const own = [...view.own].filter((u) => u.strength > 0).sort((a, b) => (a.id < b.id ? -1 : 1));
  const byId = new Map(own.map((u) => [u.id, u]));
  const squadrons = Object.entries(view.squadrons ?? {}).filter(([, sq]) => sq.side === info.mySide && sq.ships.some((x) => byId.has(x)));
  const inSquadron = new Set(squadrons.flatMap(([, sq]) => sq.ships));
  const ships = own.filter((u) => isShip(u));
  const air = own.filter((u) => isAir(u));
  const land = own.filter((u) => !isShip(u) && !isAir(u));
  // 戦隊がないとき(前の仕組みの試合)は、上級部隊ごとにまとめる
  const loose = ships.filter((u) => !inSquadron.has(u.id));
  // 上級部隊の木:戦隊の親(任務部隊)ごとに見出しを置く
  const parentOf = (fid: string) => info.formations[fid]?.parent;
  const groups = new Map<string, [string, SideView["squadrons"] extends infer T ? (T extends Record<string, infer V> ? V : never) : never][]>();
  // 退避群(落伍艦の心得で自動で退く艦)は、陣営で1つの折りたたんだ欄にまとめる
  const retiring = squadrons.filter(([, sq]) => sq.retiring);
  for (const [id, sq] of squadrons) {
    if (sq.retiring) continue;
    // 戦隊を離れた艦(上級部隊ではない、1隻の戦隊)は「戦隊を離れた艦」にまとめる
    const top = info.formations[id] ? (parentOf(id) ?? "") : "~detached";
    groups.set(top, [...(groups.get(top) ?? []), [id, sq]]);
  }
  const retiringShips = retiring.flatMap(([, sq]) => sq.ships.map((x) => byId.get(x)).filter((x): x is OwnUnitView => !!x));
  const airByBase = new Map<string, OwnUnitView[]>();
  for (const u of air) {
    const key = u.air?.baseId ?? (u.air?.airfield ? `field:${u.air.airfield.name}` : "land");
    airByBase.set(key, [...(airByBase.get(key) ?? []), u]);
  }
  const selectedSquadron = squadrons.find(([, sq]) => s.selected !== null && sq.ships.includes(s.selected))?.[0];
  return (
    <section data-testid="fleet-list">
      <h3>自軍</h3>
      {[...groups.entries()].map(([top, list]) => (
        <div key={top || "none"} className="fleet-group">
          {top && <div className="fleet-head">{top === "~detached" ? "戦隊を離れた艦" : (info.formations[top]?.name ?? label(top))}</div>}
          <ul className="units">
            {list.map(([id, sq]) => {
              const alive = sq.ships.map((x) => byId.get(x)).filter((x): x is OwnUnitView => !!x);
              const flag = alive[0];
              if (!flag) return null;
              const name = info.formations[id]?.name ?? label(id);
              const hurt = alive.filter((x) => x.strength < 0.7).length;
              return (
                <li key={id} className={`fleet-sq ${selectedSquadron === id ? "sel" : ""}`} data-testid={`fleet-sq-${id}`}>
                  <div className="fleet-row" onClick={() => game.select(flag.id)} title="押すと、この戦隊に命令します">
                    <button
                      className="link fold"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(id);
                      }}
                      title="艦の一覧を開く・閉じる"
                      data-testid={`fleet-fold-${id}`}
                    >
                      {open[id] ? "▾" : "▸"}
                    </button>
                    <span>{name}</span>
                    <span className="muted">
                      {alive.length}隻{hurt ? `(損傷 ${hurt})` : ""}
                      {s.seaOrders[id] ? " ●" : ""}
                    </span>
                  </div>
                  {open[id] && (
                    <ul className="units ships">
                      {alive.map((u) => (
                        <li key={u.id} className={s.selected === u.id ? "sel" : ""} onClick={() => game.select(u.id)} data-testid={`unit-${u.id}`}>
                          <span>{label(u.id)}</span>
                          <span className="muted">{shipNote(u)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {retiringShips.length > 0 && (
        <div className="fleet-group retiring" data-testid="fleet-retiring">
          <div className="fleet-head fleet-row" onClick={() => toggle("~retiring")} title="落伍・戦列を離れた艦。落伍艦の心得で、命令しなくても脱出路(なければ敵から離れる向き)へ退き、着けば戦場を去ります(負けにはなりません)。艦を選んで命令すると、手で指揮する戦隊に戻ります">
            <button className="link fold" data-testid="fleet-fold-retiring">
              {open["~retiring"] ? "▾" : "▸"}
            </button>
            <span>退避中</span>
            <span className="muted">{retiringShips.length}隻(心得で自動)</span>
          </div>
          {open["~retiring"] && (
            <ul className="units ships">
              {retiringShips.map((u) => (
                <li key={u.id} className={s.selected === u.id ? "sel" : ""} onClick={() => game.select(u.id)} data-testid={`unit-${u.id}`}>
                  <span>{label(u.id)}</span>
                  <span className="muted">{shipNote(u)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {loose.length > 0 && (
        <ul className="units">
          {loose.map((u) => (
            <li key={u.id} className={s.selected === u.id ? "sel" : ""} onClick={() => game.select(u.id)} data-testid={`unit-${u.id}`}>
              <span>{label(u.id)}</span>
              <span className="muted">{shipNote(u)}</span>
            </li>
          ))}
        </ul>
      )}
      {air.length > 0 && (
        <div className="fleet-group" data-testid="fleet-air">
          <div className="fleet-head">航空隊</div>
          {[...airByBase.entries()].map(([base, list]) => (
            <div key={base}>
              <div className="muted fleet-base">{base === "land" ? "陸の飛行場" : base.startsWith("field:") ? fieldLabel(list[0]!) : `${label(base)}${byId.has(base) ? "" : "(沈没)"}`}</div>
              <ul className="units">
                {list.map((u) => (
                  <li key={u.id} className={s.selected === u.id ? "sel" : ""} onClick={() => game.select(u.id)} data-testid={`unit-${u.id}`}>
                    <span>{label(u.id)}</span>
                    <span className="muted">
                      {aircraftOf(u, info)}機・{AIR_STATUS_SHORT[u.air?.status ?? "ready"] ?? ""}
                      {s.orders[u.id] ? " ●" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {land.length > 0 && (
        <div className="fleet-group">
          <div className="fleet-head">陸の部隊</div>
          <ul className="units">
            {land.map((u) => (
              <li key={u.id} className={s.selected === u.id ? "sel" : ""} onClick={() => game.select(u.id)} data-testid={`unit-${u.id}`}>
                <span>{label(u.id)}</span>
                <span className="muted">
                  {Math.round(u.strength * 100)}%{s.orders[u.id] ? " ●" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 出す機数の下書き(航空隊ID → 機数)。命令を出す前に決めておき、地図を押して命令を作るときに添える */
export const airSendDraft = new Map<string, number>();

/** 時刻の表示(試合の始めからの秒 → 時:分) */
type Clock = (sec: number) => string;

/** 直衛で守るものの位置:部隊か、戦隊・任務部隊の隷下の空母(なければ最初の艦)。サーバーの capAnchor と同じ決め方 */
export function capAnchorPos(over: string, view: SideView, info: ScenarioInfo): { x: number; y: number } | undefined {
  const direct = view.own.find((x) => x.id === over && x.strength > 0);
  if (direct) return direct.pos;
  if (!info.formations[over]) return undefined;
  const members = new Set<string>();
  const visit = (id: string, d: number) => {
    const f = info.formations[id];
    if (!f || d > 16) return;
    for (const u of f.units) members.add(u);
    for (const [cid, c] of Object.entries(info.formations)) if (c.parent === id) visit(cid, d + 1);
  };
  visit(over, 0);
  const ships = view.own.filter((x) => members.has(x.id) && x.strength > 0 && isShip(x) && !x.detached);
  return (ships.find((x) => info.fleet?.shipToes[x.toe]?.carrier) ?? ships[0])?.pos;
}

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
/** 地図の外の飛行場の見出し(名前・方角・距離) */
export function fieldLabel(u: OwnUnitView): string {
  const f = u.air?.airfield;
  if (!f) return "陸の飛行場";
  return `${f.name}(地図の外・${DIRS[Math.round((((f.bearingDeg % 360) + 360) % 360) / 45) % 8]} ${Math.round(f.distanceM / 1000)}km)`;
}

/** 航空隊の基地の位置(母艦か陸の飛行場) */
function basePosOf(u: OwnUnitView, view: SideView): { x: number; y: number } | undefined {
  const a = u.air;
  if (!a) return undefined;
  if (a.baseId !== undefined) return view.own.find((x) => x.id === a.baseId && x.strength > 0)?.pos;
  return a.basePos;
}

export interface SortiePlan {
  kind: "strike" | "cap" | "search";
  from: { x: number; y: number };
  to: { x: number; y: number };
  home: { x: number; y: number };
  launchAt: number;
  arriveAt: number;
  leaveAt: number;
  homeAt: number;
  readyAt: number;
  /** 行動半径を越える */
  outOfRange: boolean;
  /** 陸の飛行場から(発艦ではなく離陸) */
  land: boolean;
}

/**
 * 航空隊の出撃の見込み(下書きの命令か、飛んでいる今の任務)。sim-core の airSortieTimes と同じ式で、基地はいまの位置のままとみる
 */
export function sortiePlan(u: OwnUnitView, order: { air?: { kind: string; target?: string; over?: string; point?: { x: number; y: number } } } | undefined, view: SideView, info: ScenarioInfo): SortiePlan | null {
  const fleet = info.fleet;
  const spec = fleet?.airToes[u.toe];
  const a = u.air;
  if (!fleet || !spec || !a) return null;
  const home = basePosOf(u, view);
  if (!home) return null;
  const speed = (spec.speedMpm ?? 3000) / 60;
  const strikeMin = fleet.strikeMinutes ?? 10;
  const capMin = fleet.capMinutes ?? 120;
  const turn = fleet.turnaroundMinutes;
  const now = view.time;
  const o = order?.air;
  const airborne = ["outbound", "attacking", "cap", "searching"].includes(a.status);
  let kind: SortiePlan["kind"];
  let to: { x: number; y: number } | undefined;
  if (o && o.kind !== "return") {
    kind = o.kind as SortiePlan["kind"];
    to = o.kind === "strike" ? view.contacts.find((c) => c.contactId === o.target)?.pos : o.kind === "cap" ? capAnchorPos(o.over!, view, info) : o.point;
  } else if (airborne) {
    kind = a.status === "cap" ? "cap" : a.status === "searching" ? "search" : "strike";
    to = a.status === "cap" ? (a.overId ? capAnchorPos(a.overId, view, info) : undefined) : a.point;
  } else return null;
  if (!to) return null;
  const from = airborne ? u.pos : home;
  const launchWait = airborne ? 0 : a.status === "spotting" ? (a.launchInSec ?? 0) : (fleet.launchMinutes ?? 0) * 60;
  const launchAt = now + launchWait;
  const arriveAt = a.status === "attacking" ? now : launchAt + Math.hypot(to.x - from.x, to.y - from.y) / speed;
  const leaveAt =
    kind === "strike" ? (a.status === "attacking" ? now + (a.attackLeftSec ?? 0) : arriveAt + strikeMin * 60) : kind === "cap" ? (a.status === "cap" && a.untilSec !== undefined ? a.untilSec : arriveAt + capMin * 60) : arriveAt;
  const homeAt = leaveAt + Math.hypot(home.x - to.x, home.y - to.y) / speed;
  return { kind, from, to, home, launchAt, arriveAt, leaveAt, homeAt, readyAt: homeAt + turn * 60, outOfRange: Math.hypot(to.x - home.x, to.y - home.y) > spec.radiusM, land: a.baseId === undefined };
}

/** 見込みの文 */
export function sortieLines(p: SortiePlan, clock: Clock, status: string): string[] {
  const out: string[] = [];
  if (status === "ready" || status === "spotting") out.push(`${p.land ? "離陸" : "発艦"} ${clock(p.launchAt)}`);
  if (status !== "attacking" && status !== "cap") out.push(`${p.kind === "cap" ? "直衛の位置に着く" : p.kind === "search" ? "索敵の地点に着く" : "目標に着く"} ${clock(p.arriveAt)}`);
  if (p.kind === "strike") out.push(`攻撃を終えて引き返す ${clock(p.leaveAt)}`);
  if (p.kind === "cap") out.push(`燃料の限りで引き返す ${clock(p.leaveAt)}`);
  out.push(`帰着 ${clock(p.homeAt)}`);
  out.push(`積み直しが済み再出撃できる ${clock(p.readyAt)}`);
  return out;
}

/** 艦の欄(陸の隊形・陣地・補給・制圧・疲労は艦にないので出さない) */
export function ShipStatus({ u }: { u: OwnUnitView }) {
  const h = u.hull;
  const flood = h ? h.floodPort + h.floodStbd : 0;
  const kt = u.speedMps !== undefined ? Math.round((u.speedMps * 3600) / 1852) : undefined;
  return (
    <div className="ship-status" data-testid="ship-status">
      <Gauge name="浮力" value={u.strength} />
      <Gauge name="士気" value={u.morale} />
      <p className="muted">
        {kt !== undefined ? `速力 ${kt}ノット` : ""}
        {h && h.fire >= 0.02 ? `・火災 ${Math.round(h.fire * 100)}%` : ""}
        {h && flood >= 0.02 ? `・浸水 ${Math.round(flood * 100)}%` : ""}
        {u.detached ? "・戦隊を離れている" : ""}
      </p>
    </div>
  );
}

function Gauge({ name, value, text }: { name: string; value: number; text?: string }) {
  return (
    <div className="bar">
      <span>{name}</span>
      <div className="track">
        <div className="fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: value < 0.5 ? "#c0392b" : "#3a7d44" }} />
      </div>
      <span className="num">{text ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}

const AIR_ROLE: Record<string, string> = { fighter: "戦闘機", strike: "攻撃機", scout: "索敵機" };
const AIR_STATUS: Record<string, string> = {
  ready: "待機(発進できる)",
  spotting: "甲板に並べて発艦を待っている",
  outbound: "目標へ向かっている",
  attacking: "攻撃中",
  returning: "帰投中",
  rearming: "積み直し中",
  cap: "上空直衛",
  searching: "索敵中",
};

/** 航空隊の欄:機数・今の様子・出撃の見込み・命令(出す機数・直衛の戦隊・帰投) */
export function AirGroupControls({ game, u, clock }: { game: Game; u: OwnUnitView; clock: Clock }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const fleet = info.fleet!;
  const spec = fleet.airToes[u.toe]!;
  const a = u.air!;
  const order = s.orders[u.id];
  const mission = order?.air;
  const planning = s.phase === "planning";
  const now = aircraftOf(u, info);
  const send = mission && mission.kind !== "return" ? (mission.aircraft ?? now) : now;
  const plan = sortiePlan(u, order, view, info);
  const setSend = (n: number) => {
    const v = Math.max(1, Math.min(now, Math.round(n)));
    if (mission && mission.kind !== "return") game.setOrder(u.id, { air: { ...mission, ...(v < now ? { aircraft: v } : { aircraft: undefined }) } as never });
    else {
      if (v < now) airSendDraft.set(u.id, v);
      else airSendDraft.delete(u.id);
      setDraftSend(v);
    }
  };
  const [draftSend, setDraftSend] = useState<number | undefined>(airSendDraft.get(u.id));
  const want = draftSend !== undefined && draftSend < now ? draftSend : undefined;
  const withSend = <T extends object>(o: T) => (mission && mission.kind !== "return" && mission.aircraft !== undefined ? { ...o, aircraft: mission.aircraft } : want !== undefined ? { ...o, aircraft: want } : o);
  // 直衛に出せる戦隊・任務部隊(自陣営の艦の上級部隊)
  const squadronIds = Object.entries(view.squadrons ?? {}).filter(([, sq]) => sq.side === info.mySide).map(([id]) => id);
  const tops = [...new Set(squadronIds.map((id) => info.formations[id]?.parent).filter((x): x is string => !!x))];
  const capChoices = [...tops, ...squadronIds].filter((id) => info.formations[id] && capAnchorPos(id, view, info));
  const capNow = mission?.kind === "cap" ? mission.over : a.status === "cap" ? a.overId : undefined;
  return (
    <div className="controls" data-testid="air-controls">
      <Gauge name="機数" value={u.strength} text={`${now}/${spec.aircraft ?? "?"}機`} />
      <p>
        {AIR_ROLE[spec.role]}・行動半径 {Math.round(spec.radiusM / 1000)}km・{AIR_STATUS[a.status] ?? a.status}
        {a.status === "rearming" && a.readyAt !== undefined ? `(再出撃できる ${clock(a.readyAt)})` : ""}
        {a.status === "cap" && capNow ? `(${info.formations[capNow]?.name ?? label(capNow)}の上)` : ""}
      </p>
      {plan && (
        <div className={plan.outOfRange ? "note warn" : "note"} data-testid="air-plan">
          {mission && mission.kind !== "return" ? `命令:${mission.kind === "strike" ? "攻撃" : mission.kind === "cap" ? "上空直衛" : "索敵"}${mission.aircraft !== undefined ? `(${mission.aircraft}機を分けて出す。残りは待機)` : ""}` : "いまの任務"}
          {plan.outOfRange && "・行動半径の外です(弾かれます)"}
          <ul>
            {sortieLines(plan, clock, a.status).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {mission && (
            <button className="link" onClick={() => game.setOrder(u.id, { air: undefined })}>
              取り消す
            </button>
          )}
        </div>
      )}
      {planning && a.status === "ready" && (
        <>
          <label className="row" title="待機中の隊から何機を出すか。残りは待機を続け、分けた隊は帰って積み直すと元の隊に戻ります">
            出す機数
            <input type="range" min={1} max={now} value={Math.min(send, want ?? send)} onChange={(e) => setSend(Number(e.target.value))} data-testid="air-send" />
            <b>{Math.min(send, want ?? send)}機</b>
            {Math.min(send, want ?? send) < now ? <span className="muted">(残り {now - Math.min(send, want ?? send)}機は待機)</span> : null}
          </label>
          <p className="muted">{spec.role === "scout" ? "海を押すと、そこを索敵します。" : "敵の印を押すと攻撃、海を押すと索敵。"}行き先は地図に線で出ます。</p>
          {spec.role === "fighter" && capChoices.length > 0 && (
            <div className="row">
              上空直衛:
              {capChoices.map((id) => (
                <button key={id} className={capNow === id ? "on" : ""} data-testid={`cap-${id}`} onClick={() => game.setOrder(u.id, { air: withSend({ kind: "cap", over: id }) as never })}>
                  {info.formations[id]?.name ?? label(id)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {planning && spec.role !== "scout" && <AirReaction game={game} u={u} capChoices={capChoices} send={want} />}
      {planning && a.status !== "ready" && a.status !== "rearming" && (
        <button data-testid="air-return" onClick={() => game.setOrder(u.id, { air: { kind: "return" } })}>
          帰投
        </button>
      )}
    </div>
  );
}

/**
 * 航空隊の反応(条件付きの命令。ターンを止めずに、敵に反応する。1つだけ・発動すると消える):
 * 戦闘機は「敵機が基地から○km に来たら、戦隊の上空直衛に上がる」、攻撃機は「敵の空母を見分けたら、そこへ攻撃に出る」。
 * 積み直し中なら、済んでから出る。出す機数は上で決めた機数(決めていなければ全部)
 */
function AirReaction({ game, u, capChoices, send }: { game: Game; u: OwnUnitView; capChoices: string[]; send: number | undefined }) {
  const { s } = game;
  const info = s.info!;
  const spec = info.fleet!.airToes[u.toe]!;
  const draft = s.orders[u.id]?.conditional;
  const cur = draft === null ? null : (draft ?? u.conditional ?? null);
  const extra = send !== undefined ? { aircraft: send } : {};
  if (spec.role === "fighter") {
    const on = cur?.when.type === "enemyAirNear";
    const km = on && cur!.when.type === "enemyAirNear" ? Math.round(cur!.when.withinM / 1000) : 40;
    const over = on && cur!.then.air?.kind === "cap" ? cur!.then.air.over : capChoices.find((id) => info.formations[id]?.units.some((x) => x === u.air?.baseId)) ?? capChoices[0];
    const setIt = (km2: number, over2: string | undefined) =>
      game.setOrder(u.id, { conditional: over2 ? { when: { type: "enemyAirNear", withinM: km2 * 1000 }, then: { air: { kind: "cap", over: over2, ...extra } } } : null });
    return (
      <div className="row" data-testid="air-reaction" title="ターンの途中で敵の航空隊が近づいたら、その場で迎撃に上がります(1度だけ)">
        <label>
          <input type="checkbox" checked={on} data-testid="air-reaction-intercept" onChange={(e) => (e.target.checked ? setIt(km, over) : game.setOrder(u.id, { conditional: null }))} />
          敵機が
        </label>
        <input type="number" min={5} max={150} value={km} style={{ width: "4em" }} onChange={(e) => setIt(Math.max(5, Number(e.target.value) || 40), over)} disabled={!on} />
        km に来たら迎撃:
        <select value={over ?? ""} onChange={(e) => setIt(km, e.target.value)} disabled={!on}>
          {capChoices.map((id) => (
            <option key={id} value={id}>
              {info.formations[id]?.name ?? label(id)}の上
            </option>
          ))}
        </select>
      </div>
    );
  }
  const on = cur?.when.type === "enemyCarrierSeen";
  return (
    <label className="row" data-testid="air-reaction" title="索敵などで敵の空母を見分けたら、その場でその空母へ攻撃に出ます(1度だけ。行動半径の内)">
      <input
        type="checkbox"
        checked={on}
        data-testid="air-reaction-strike"
        onChange={(e) => game.setOrder(u.id, { conditional: e.target.checked ? { when: { type: "enemyCarrierSeen" }, then: { air: { kind: "strike", target: "auto", ...extra } } } : null })}
      />
      敵の空母を見つけたら攻撃に出る{send !== undefined ? `(${send}機)` : ""}
    </label>
  );
}
