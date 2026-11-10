import { freeAircraft, type AirForceState, type AirRequest } from "@brigade/sim-core";
import type { ScenarioInfo } from "@brigade/protocol";
import { useState } from "react";
import type { Game } from "./game.js";
import { clockOf } from "./geo.js";
import { unitLabel } from "./names.js";

/**
 * 航空司令部の欄(docs/air-design.md)。航空司令部は別の指揮系統。プレイヤーができるのは要請(1日の枠)だけ:
 * 即応(今すぐ攻撃機が飛び立つ)と予約(攻撃・偵察・空輸。来てほしいターンの始めに飛ぶ)。戦闘機は護衛と迎撃に自動で出る。
 * ほかは見るだけ(飛行隊の出せる機・基地の天候・予報・飛んでいる編隊)
 */

export const AIR_MISSION_NAME: Record<string, string> = {
  support: "攻撃",
  escort: "護衛",
  intercept: "迎撃",
  recon: "偵察",
  airlift: "空輸",
};
export const AIR_REQUEST_NAME: Record<string, string> = { support: "予約の攻撃", onCall: "即応", recon: "予約の偵察", airlift: "予約の空輸" };
const STATUS: Record<AirRequest["status"], string> = { accepted: "飛び立った", scheduled: "予約した", flown: "予約が飛び立った", refused: "断られた", cancelled: "取りやめ" };
type ReserveKind = "support" | "recon" | "airlift";
const ROLE: Record<string, string> = {
  fighter: "戦闘機",
  fighterBomber: "戦闘爆撃機",
  diveBomber: "急降下爆撃機",
  attack: "攻撃機",
  bomber: "爆撃機",
  recon: "偵察機",
  transport: "輸送機",
};

export function AirOpsPanel({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info;
  const view = s.view;
  if (!info || !view || !view.airOps || info.airForces.length === 0) return null;
  return (
    <section data-testid="air-ops">
      <h3>航空司令部</h3>
      <p className="muted">
        航空司令部は別の指揮系統です。こちらは要請(1日の枠)を出します。即応は今すぐ攻撃機が飛び立ち、予約は来てほしいターンの始めに飛びます(攻撃・偵察・空輸)。戦闘機は護衛と迎撃に自動で出ます。
      </p>
      {info.airForces.map((f) => {
        const st = view.airOps![f.id];
        return st ? <AirForceBlock key={f.id} game={game} force={f} st={st} /> : null;
      })}
    </section>
  );
}

function AirForceBlock({ game, force, st }: { game: Game; force: ScenarioInfo["airForces"][number]; st: AirForceState }) {
  const { s } = game;
  const info = s.info!;
  const view = s.view!;
  const lead = info.airOpsRules?.preplanLeadTurns ?? 2;
  const [turnAhead, setTurnAhead] = useState(lead);
  const [kind, setKind] = useState<ReserveKind>("support");
  const planning = s.phase === "planning";
  const queued = s.hq.filter((c) => c.type === "airRequest" && c.force === force.id).length;
  const left = st.requestsLeft - queued;
  const selected = view.own.find((u) => u.id === s.selected);
  const weather = (w: string | undefined) => (w ? (info.weatherNames[w] ?? w) : "");
  const flights = st.flights ?? [];
  return (
    <div className="air-force" data-testid={`air-force-${force.id}`}>
      <h4>
        {force.name}{" "}
        <span className="muted">
          要請の残り {left}/{force.requestsPerDay}
          {st.share !== undefined ? `・この戦場に回ってきた機 ${Math.round(st.share * 100)}%` : ""}
        </span>
      </h4>
      <ul className="squadrons">
        {force.squadrons.map((q) => {
          const sq = st.squadrons[q.id];
          const base = force.bases.find((b) => b.id === q.base);
          const bw = st.baseWeather?.[q.base];
          return (
            <li key={q.id}>
              {q.name}({q.toeName}・{ROLE[q.role] ?? q.role}){" "}
              <b>{sq?.aircraft ?? 0}機</b>
              <span data-testid={`air-free-${q.id}`}>(今出せる {freeAircraft(st, q.id, view.time)}機{recovering(st, q.id, view.time) ? `・積み直し ${recovering(st, q.id, view.time)}機` : ""})</span>
              {sq?.lost ? <span className="bad">(失った {sq.lost})</span> : null}
              <span className="muted">
                {" "}
                {base?.name}・{Math.round((base?.distanceM ?? 0) / 1000)}km{bw ? `・基地の天候 ${weather(bw.current)}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {st.forecast && st.forecast.battlefield.length > 0 && (
        <div className="forecast" data-testid={`air-forecast-${force.id}`}>
          <span className="muted">予報(外れることがある):</span>
          {st.forecast.battlefield.slice(0, 9).map((w, i) => {
            const turn = st.forecast!.madeTurn + 1 + i;
            const baseBad = Object.values(st.forecast!.bases).some((b) => b[i] && !isFlyable(b[i]!, info));
            return (
              <span key={i} className={isFlyable(w, info) && !baseBad ? "fc ok" : "fc bad"} title={`${turn}ターン目:戦場 ${weather(w)}${Object.entries(st.forecast!.bases).map(([id, b]) => `・${force.bases.find((x) => x.id === id)?.name ?? id} ${weather(b[i])}`).join("")}`}>
                {turn}:{weather(w)}
              </span>
            );
          })}
        </div>
      )}
      {flights.length > 0 && (
        <ul className="air-plan" data-testid={`air-flights-${force.id}`}>
          {flights.map((f) => (
            <li key={f.id}>
              {AIR_MISSION_NAME[f.mission] ?? f.mission} {f.aircraft}機{" "}
              <span className="muted">{f.phase === "inbound" ? "向かっている" : f.phase === "station" ? "戦場の上" : "帰っている"}</span>
            </li>
          ))}
        </ul>
      )}
      {planning && (
        <>
          <div className="row">
            <button
              disabled={left <= 0}
              data-testid={`air-request-oncall-${force.id}`}
              onClick={() => game.setTargeting({ kind: "airRequest", force: force.id, request: "onCall" })}
              title="今すぐ、出せる攻撃機の編隊が基地から飛び立ちます(戦場に着くのは基地からの行きの時間の後)。地図で叩いてほしい地点を押します。出せる機がなければ断られます"
            >
              即応
            </button>
          </div>
          <div className="row">
            <label title={`予約は、来てほしいターンの ${lead} ターン前までに出します。そのターンの始めに、出せる機があり、昼で、戦場と基地の天候が飛べれば飛びます`}>
              予約{" "}
              <select value={kind} data-testid={`air-reserve-kind-${force.id}`} onChange={(e) => setKind(e.target.value as ReserveKind)}>
                <option value="support">攻撃</option>
                <option value="recon">偵察</option>
                <option value="airlift">空輸</option>
              </select>{" "}
              <select value={turnAhead} onChange={(e) => setTurnAhead(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, k) => k + lead).map((k) => (
                  <option key={k} value={k}>
                    {view.turn + k}ターン目(+{k})
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={left <= 0 || (kind === "airlift" && !selected)}
              data-testid={`air-request-reserve-${force.id}`}
              onClick={() =>
                game.setTargeting({ kind: "airRequest", force: force.id, request: kind, turn: view.turn + turnAhead, ...(kind === "airlift" && selected ? { unitId: selected.id } : {}) })
              }
              title={kind === "airlift" ? "選んでいる部隊へ、地図で押した地点に空輸を落とします" : kind === "recon" ? "地図で撮ってほしい地点を押します。写真は持ち帰って判読してから届きます" : "地図で叩いてほしい地点を押します"}
            >
              予約する{kind === "airlift" ? (selected ? `:${unitLabel(selected.id)}へ` : "(受け取る部隊を選んでください)") : ""}
            </button>
          </div>
        </>
      )}
      {st.requests.length > 0 && (
        <ul className="air-requests" data-testid={`air-requests-${force.id}`}>
          {st.requests.map((r) => (
            <li key={r.id}>
              {AIR_REQUEST_NAME[r.kind]}
              {r.turn !== undefined ? `(${r.turn}ターン目)` : ""}:{STATUS[r.status]}
              {r.reason ? `(${r.reason})` : ""}
              {r.etaSec !== undefined ? `・到着 ${clockOf(info.startHour, r.etaSec, info.startDate)}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isFlyable(w: string, info: ScenarioInfo): boolean {
  // 画面には天候ごとの飛べる・飛べないが来ていないので、名前のない天候は飛べるとみる
  return !(info.noFlyWeather ?? []).includes(w);
}

/** 帰ってきて積み直し中の機数 */
function recovering(st: AirForceState, squadron: string, t: number): number {
  return (st.squadrons[squadron]?.recovering ?? []).filter((r) => r.until > t).reduce((n, r) => n + r.n, 0);
}
