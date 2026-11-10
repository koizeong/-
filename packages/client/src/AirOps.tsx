import type { AirForceState, AirRequest, AirTask } from "@brigade/sim-core";
import type { ScenarioInfo } from "@brigade/protocol";
import { useState } from "react";
import type { Game } from "./game.js";
import { clockOf } from "./geo.js";
import { unitLabel } from "./names.js";

/**
 * 航空司令部の欄(docs/air-design.md・AIR6)。航空司令部は別の指揮系統なので、出撃の割り当ては航空司令部(AI)が決める。
 * プレイヤーができるのは:要請(1日の枠)・制空の哨戒の空域・上空援護の配属・前線の印。ほかは見るだけ(今日の計画・飛行隊・基地の天候・予報)
 */

export const AIR_MISSION_NAME: Record<string, string> = {
  patrol: "制空の哨戒",
  escort: "護衛",
  cover: "上空援護",
  onCall: "即応の待機",
  support: "近接支援",
  interdiction: "阻止攻撃",
  armedRecon: "武装偵察",
  recon: "偵察",
  airlift: "空輸",
};
export const AIR_REQUEST_NAME: Record<string, string> = { support: "事前計画の近接支援", onCall: "即応", recon: "偵察", airlift: "空輸" };
const STATUS: Record<AirRequest["status"], string> = { accepted: "受けた", delayed: "遅れて受けた", refused: "断った", pending: "翌朝の計画を待つ" };
const ROLE: Record<string, string> = {
  fighter: "戦闘機",
  fighterBomber: "戦闘爆撃機",
  diveBomber: "急降下爆撃機",
  attack: "攻撃機",
  bomber: "爆撃機",
  recon: "偵察機",
  transport: "輸送機",
};

function sectorLabel(key: string, info: ScenarioInfo): string {
  const [c, r] = key.split(",").map(Number) as [number, number];
  const { cols, rows } = info.airSectors;
  if (cols === 3 && rows === 3) return (["南", "", "北"][r] ?? "") + (["西", "", "東"][c] ?? "") || "中央";
  return `${c + 1}-${r + 1}`;
}

/** 計画の割り当てを、戦場に着くターンごとにまとめる */
function byTurn(plan: readonly AirTask[], turn: number, time: number, turnSeconds: number): Map<number, AirTask[]> {
  const out = new Map<number, AirTask[]>();
  for (const t of plan) {
    if (t.offStationSec <= time) continue;
    // もう戦場に向かっている・上空にいる割り当ては、今のターンにまとめる
    const k = Math.max(turn, turn + Math.floor((t.onStationSec - time) / turnSeconds));
    out.set(k, [...(out.get(k) ?? []), t]);
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

export function AirOpsPanel({ game }: { game: Game }) {
  const { s } = game;
  const info = s.info;
  const view = s.view;
  if (!info || !view || !view.airOps || info.airForces.length === 0) return null;
  return (
    <section data-testid="air-ops">
      <h3>航空司令部</h3>
      <p className="muted">
        航空司令部は別の指揮系統です。その日の出撃は航空司令部が割り当て、こちらは要請(1日の枠)・哨戒の空域・上空援護・前線の印で働きかけます。
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
  const [open, setOpen] = useState(false);
  const [turnAhead, setTurnAhead] = useState((info.airOpsRules?.preplanLeadTurns ?? 2) + 1);
  const planning = s.phase === "planning";
  const queued = s.hq.filter((c) => c.type === "airRequest" && c.force === force.id).length;
  const left = st.requestsLeft - queued;
  const selected = view.own.find((u) => u.id === s.selected);
  const weather = (w: string | undefined) => (w ? (info.weatherNames[w] ?? w) : "");
  const groups = byTurn(st.plan, view.turn, view.time, info.turnSeconds);
  const lead = info.airOpsRules?.preplanLeadTurns ?? 2;
  const pendingPatrol = s.hq.find((c) => c.type === "airPatrol" && c.force === force.id);
  const patrol = pendingPatrol && pendingPatrol.type === "airPatrol" ? pendingPatrol.sectors : st.patrolSectors;
  const { cols, rows } = info.airSectors;
  const togglePatrol = (key: string) => {
    const next = patrol.includes(key) ? patrol.filter((k) => k !== key) : [...patrol, key];
    game.addHq({ side: info.mySide, type: "airPatrol", force: force.id, sectors: next });
  };
  const covered = !!selected && st.cover.includes(selected.id);
  const marked = !!selected?.airMarked;
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
      <button onClick={() => setOpen(!open)}>{open ? "今日の計画を閉じる" : `今日の計画(${st.plan.length}回の出撃)`}</button>
      {open && (
        <ul className="air-plan" data-testid={`air-plan-${force.id}`}>
          {groups.size === 0 && <li className="muted">今日の残りの出撃はありません</li>}
          {[...groups.entries()].map(([turn, tasks]) => (
            <li key={turn}>
              <b>{turn === view.turn ? "今" : `${turn}ターン目`}</b>{" "}
              {summarize(tasks, info).join("・")}
            </li>
          ))}
        </ul>
      )}
      {planning && (
        <>
          <div className="row">
            <label title={`事前計画の近接支援は、来てほしいターンの ${lead} ターン前までに出します。航空司令部が阻止攻撃・武装偵察の編隊を回します(方針で上限あり、遅れることも断ることもある)`}>
              来てほしいターン{" "}
              <select value={turnAhead} onChange={(e) => setTurnAhead(Number(e.target.value))}>
                {Array.from({ length: 8 }, (_, k) => k + lead).map((k) => (
                  <option key={k} value={k}>
                    {view.turn + k}(+{k})
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={left <= 0}
              data-testid={`air-request-support-${force.id}`}
              onClick={() => game.setTargeting({ kind: "airRequest", force: force.id, request: "support", turn: view.turn + turnAhead })}
              title="地図で叩いてほしい地点を押します"
            >
              事前計画の近接支援
            </button>
          </div>
          <div className="row">
            <button
              disabled={left <= 0}
              onClick={() => game.setTargeting({ kind: "airRequest", force: force.id, request: "onCall" })}
              title="その空域で上空待機している即応の編隊を、押した地点へ向けます(今か1時間の内に待機がいる空域だけ)"
            >
              即応
            </button>
            <button disabled={left <= 0} onClick={() => game.setTargeting({ kind: "airRequest", force: force.id, request: "recon" })} title="偵察の編隊を押した地点へ向けます。写真は持ち帰って判読してから届きます">
              偵察
            </button>
            <button
              disabled={left <= 0 || !selected}
              onClick={() => selected && game.setTargeting({ kind: "airRequest", force: force.id, request: "airlift", unitId: selected.id })}
              title="選んでいる部隊に向けて、押した地点へ空輸します"
            >
              空輸{selected ? `:${unitLabel(selected.id)}` : ""}
            </button>
          </div>
          <div className="row">
            <button
              disabled={!selected}
              onClick={() => selected && game.addHq({ side: info.mySide, type: "airCover", force: force.id, unitId: selected.id, on: !covered })}
              title="選んでいる部隊の上空に戦闘機を付けるよう頼みます(次の昼の計画から)"
            >
              上空援護{selected ? `:${unitLabel(selected.id)}${covered ? "を外す" : ""}` : "(部隊を選んでください)"}
            </button>
            <button
              disabled={!selected}
              data-testid="air-mark"
              onClick={() => selected && game.addHq({ side: info.mySide, type: "airMark", unitId: selected.id, on: !marked })}
              title="布板・発煙で前線の印を出します。味方の航空機の誤射・取り違えが減りますが、敵の航空機にも見つかりやすくなります"
            >
              前線の印{selected ? `:${unitLabel(selected.id)}${marked ? "をやめる" : "を出す"}` : ""}
            </button>
          </div>
          <div className="patrol-grid" title="制空の哨戒の空域(次の昼の計画から。何も選ばなければ航空司令部が決める)">
            <span className="muted">哨戒の空域:</span>
            <table>
              <tbody>
                {Array.from({ length: rows }, (_, k) => rows - 1 - k).map((r) => (
                  <tr key={r}>
                    {Array.from({ length: cols }, (_, c) => {
                      const key = `${c},${r}`;
                      return (
                        <td key={key}>
                          <button className={patrol.includes(key) ? "on" : ""} onClick={() => togglePatrol(key)}>
                            {sectorLabel(key, info)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
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

function summarize(tasks: readonly AirTask[], info: ScenarioInfo): string[] {
  const n = new Map<string, number>();
  for (const t of tasks) {
    const key = `${AIR_MISSION_NAME[t.mission] ?? t.mission}${t.sector ? `(${sectorLabel(t.sector, info)})` : ""}${t.requestId ? "・要請" : ""}`;
    n.set(key, (n.get(key) ?? 0) + t.aircraft);
  }
  return [...n.entries()].map(([k, a]) => `${k} ${a}機`);
}
