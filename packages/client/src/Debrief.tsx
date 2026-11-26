import type { Debrief, DebriefUnit } from "@brigade/protocol";

const KIND: Record<DebriefUnit["kind"], string> = { land: "陸", sea: "海", air: "空" };
const FATE: Record<DebriefUnit["fate"], string> = {
  active: "健在",
  destroyed: "失われた",
  surrendered: "投降",
  scuttled: "自沈",
  left: "戦場を去った",
  withdrawn: "離脱",
  retreated: "撤退",
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 損耗の棒:加わったときの戦力(薄い)と、終わったときの戦力(濃い) */
function LossBar({ start, end }: { start: number; end: number }) {
  return (
    <span className="bar" title={`加わったとき ${pct(start)} → 終わり ${pct(end)}`}>
      <span className="was" style={{ width: `${Math.round(start * 100)}%` }} />
      <span style={{ width: `${Math.round(end * 100)}%` }} />
    </span>
  );
}

/**
 * 戦闘詳報の部隊の欄:陣営・部門(陸・海・空)ごとの MVP と、敵味方の全部隊の損耗と戦果。
 * MVP は敵に失わせた戦力(相手の編成表の耐久 × 失わせた割合)がいちばん大きい部隊。戦闘詳報と戦役の総括で使う
 */
export function DebriefSection({ debrief, me, sideName, extra }: { debrief: Debrief; me: string; sideName: (id: string) => string; extra?: (u: DebriefUnit) => string | undefined }) {
  const byId = new Map(debrief.units.map((u) => [u.id, u]));
  const sides = [...new Set(debrief.units.map((u) => u.side))].sort((a, b) => (a === me ? -1 : b === me ? 1 : a < b ? -1 : 1));
  return (
    <>
      <section data-testid="debrief-mvp">
        <h3>殊勲の部隊(MVP)</h3>
        {debrief.mvp.length === 0 ? (
          <p className="muted">敵に損害を与えた部隊はありません。</p>
        ) : (
          <div className="mvp-cards">
            {sides.map((side) =>
              debrief.mvp
                .filter((m) => m.side === side)
                .map((m) => {
                  const u = byId.get(m.unitId)!;
                  return (
                    <div key={`${m.side}:${m.kind}`} className={`mvp-card ${side === me ? "own" : "enemy"}`} data-testid={`mvp-${m.side}-${m.kind}`}>
                      <div className="mvp-head">
                        {sideName(side)}・{KIND[m.kind]}
                      </div>
                      <div className="mvp-name">{u.name}</div>
                      <div className="muted">{u.toeName}</div>
                      <div>
                        与えた損害 <b>{u.dealt.toFixed(1)}</b>
                        {u.kills ? `・撃破 ${u.kills}` : ""}
                      </div>
                    </div>
                  );
                }),
            )}
          </div>
        )}
        <p className="muted">与えた損害は、敵に失わせた戦力(相手の耐久 × 失わせた割合)。撃った部隊の分からない損害(盤の外の航空攻撃など)は数えていません。</p>
      </section>
      {sides.map((side) => {
        const list = debrief.units.filter((u) => u.side === side);
        return (
          <section key={side} data-testid={`debrief-units-${side}`}>
            <h3>
              {side === me ? "自軍" : "敵軍"}({sideName(side)})の部隊
            </h3>
            <table className="ledger units">
              <thead>
                <tr>
                  <th>部隊</th>
                  <th></th>
                  <th>編成</th>
                  <th>戦力</th>
                  <th>始め→終わり</th>
                  <th>最後</th>
                  <th>与えた損害</th>
                  <th>撃破</th>
                </tr>
              </thead>
              <tbody>
                {(["land", "sea", "air"] as const).flatMap((kind) =>
                  list
                    .filter((u) => u.kind === kind)
                    .map((u) => {
                      const mvp = debrief.mvp.some((m) => m.unitId === u.id);
                      return (
                        <tr key={u.id} className={u.fate === "active" || u.fate === "left" || u.fate === "withdrawn" ? "" : "gone"}>
                          <td>
                            {mvp ? "★ " : ""}
                            {u.name}
                            {extra?.(u) ? <span className="muted">({extra(u)})</span> : null}
                          </td>
                          <td className="muted">{KIND[u.kind]}</td>
                          <td>{u.toeName}</td>
                          <td className="num">
                            <LossBar start={u.start} end={u.end} />
                          </td>
                          <td className="num">
                            {pct(u.start)}→{pct(u.end)}
                          </td>
                          <td>{FATE[u.fate]}</td>
                          <td className="num">{u.dealt ? u.dealt.toFixed(1) : "—"}</td>
                          <td className="num">{u.kills || "—"}</td>
                        </tr>
                      );
                    }),
                )}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
