import type { SeaOrder } from "@brigade/sim-core";
import type { Game } from "./game.js";
import { unitLabel as label } from "./names.js";
import { SPEEDS } from "./Squadron.js";

/**
 * 任務部隊の命令(docs/naval-design.md の13)。一覧の任務部隊の見出しから開く。
 * 配備を命じると隷下の戦隊が基準の戦隊からの持ち場につき、針路・速力は基準の戦隊に、撃ち方は全戦隊に出す。
 * 配備・役割・基準の戦隊は信号で届く(旗旒・発光は遅く、艦隊無線は速い)
 */
export function TaskForceControls({ game, id }: { game: Game; id: string }) {
  const { s } = game;
  const view = s.view!;
  const info = s.info!;
  const rules = info.fleet?.taskForces;
  const tf = view.taskForces?.[id];
  if (!rules || !tf) return null;
  const draft: Partial<SeaOrder> = s.seaOrders[id] ?? {};
  const set = (patch: { [K in keyof SeaOrder]?: SeaOrder[K] | undefined }) => game.setSeaOrder(id, patch);
  const kids = Object.entries(info.formations)
    .filter(([fid, f]) => f.parent === id && view.squadrons?.[fid])
    .map(([fid]) => fid);
  const name = (fid: string) => info.formations[fid]?.name ?? label(fid);
  const disposition = draft.disposition !== undefined ? draft.disposition : (tf.pending?.at(-1)?.disposition ?? tf.disposition ?? null);
  const guide = draft.guide ?? tf.guide;
  const roleOf = (fid: string) => draft.roles?.[fid] ?? tf.roles[fid] ?? tf.members[fid]?.role;
  const roleName = (r: string | undefined) => rules.roles.find((x) => x.id === r)?.name ?? "(艦種から)";
  const guideSq = view.squadrons?.[tf.guide];
  const speed = draft.speed ?? guideSq?.speed;
  const sig = rules.sideSignals[tf.side];
  const delay = (sig?.radio ? rules.signals.radioSec : rules.signals.flagSec) * (view.dark ? rules.signals.nightMultiplier : 1) * (sig?.mixed ? rules.signals.mixedMultiplier : 1);
  const released = tf.disposition ? kids.filter((k) => k !== tf.guide && !tf.members[k] && !view.squadrons?.[k]?.retiring) : [];
  return (
    <div className="controls taskforce" data-testid={`tf-controls-${id}`}>
      <p className="muted">
        任務部隊の命令は信号で届きます({sig?.radio ? "艦隊無線" : "旗旒・発光"}で約 {Math.round(delay / 60) || "1分未満"}
        {Math.round(delay / 60) ? "分" : ""}
        {sig?.mixed ? "。寄り合いの艦隊で遅い" : ""})。届くまで隷下の戦隊は前のまま動きます。
      </p>
      <div className="row">
        配備:
        <button className={disposition === null ? "on" : ""} data-testid="tf-disposition-none" title="持ち場を解く(隷下の戦隊は今の針路のまま、各自の命令で動く)" onClick={() => set({ disposition: null })}>
          なし
        </button>
        {rules.dispositions.map((d) => (
          <button key={d.id} className={disposition === d.id ? "on" : ""} data-testid={`tf-disposition-${d.id}`} onClick={() => set({ disposition: d.id })}>
            {d.name}
          </button>
        ))}
      </div>
      {tf.pending?.length ? <p className="muted">信号を送っている途中(あと {Math.max(1, Math.ceil((tf.pending[0]!.atSec - view.time) / 60))} 分で届く)。</p> : null}
      <div className="row">
        基準の戦隊:
        <select value={guide} data-testid="tf-guide" onChange={(e) => set({ guide: e.target.value })}>
          {kids.map((k) => (
            <option key={k} value={k}>
              {name(k)}
            </option>
          ))}
        </select>
      </div>
      <p className="muted">針路と向かう点は、基準の戦隊を選んで地図で指示します(隷下の戦隊は持ち場のままついてきます)。</p>
      <div className="row">
        速力:
        {SPEEDS.map((x) => (
          <button key={x.id} className={speed === x.id ? "on" : ""} data-testid={`tf-speed-${x.id}`} onClick={() => set({ speed: x.id })}>
            {x.name}
          </button>
        ))}
      </div>
      <div className="row">
        撃ち方(全戦隊):
        <button className={draft.fire === "free" ? "on" : ""} onClick={() => set({ fire: "free" })}>
          撃て
        </button>
        <button className={draft.fire === "hold" ? "on" : ""} onClick={() => set({ fire: "hold" })}>
          待て
        </button>
        <button className={draft.fire === "band" ? "on" : ""} title="交戦の距離の帯に入るまで撃たない(夜の奇襲)" onClick={() => set({ fire: "band" })}>
          帯に入ってから
        </button>
      </div>
      <table className="tf-roles">
        <tbody>
          {kids.map((k) => {
            const m = tf.members[k];
            const state = k === tf.guide ? "基準" : m?.sortie ? "突撃中" : m ? "持ち場" : tf.disposition ? "外れている" : "";
            return (
              <tr key={k} data-testid={`tf-member-${k}`}>
                <td>{name(k)}</td>
                <td className="muted">{state}</td>
                <td>
                  <select
                    value={roleOf(k) ?? ""}
                    title="役割(戦策)。水雷戦隊は敵の艦が見えると持ち場を離れて雷撃し、撃ち終えると戻る"
                    data-testid={`tf-role-${k}`}
                    onChange={(e) => set({ roles: { ...(draft.roles ?? {}), [k]: e.target.value } })}
                  >
                    {!roleOf(k) && <option value="">{roleName(undefined)}</option>}
                    {rules.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {released.length > 0 && (
        <div className="row">
          <button data-testid="tf-join" title="個別に命令して持ち場を外れた戦隊を、持ち場に戻す" onClick={() => set({ join: released })}>
            外れた戦隊を持ち場に戻す({released.map(name).join("・")})
          </button>
        </div>
      )}
      {s.seaOrders[id] && (
        <button className="link" onClick={() => game.clearSeaOrder(id)}>
          この任務部隊への命令を取り消す
        </button>
      )}
    </div>
  );
}
