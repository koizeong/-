import type { DevelopmentInfo } from "@brigade/protocol";
import type { Toe } from "@brigade/sim-core";

export type AttachmentDraft = { from: string; element: number; to: string };

/**
 * 部隊の階層と配属(戦いの前):上級部隊の木に陣営の部隊を並べ、機甲・戦車駆逐の部隊の中隊を、歩兵の部隊に付ける(中隊単位)。
 * 付けた中隊は、その部隊の編成表の要素になって一緒に動き撃ち合う(歩兵連隊に突撃砲中隊を付けて火力を底上げするなど)。
 * 戦いの途中で付け替えることはない。正しいかの最終的な検証はサーバーが行う
 */
export function AttachPanel({
  info,
  side,
  toeOf,
  attachments,
  onChange,
}: {
  info: DevelopmentInfo;
  side: string;
  /** 部隊のいまの編成表(差し替えの後) */
  toeOf: (unitId: string) => Toe | undefined;
  attachments: AttachmentDraft[];
  onChange: (next: AttachmentDraft[]) => void;
}) {
  const rule = info.development.attachment;
  const units = (info.sides[side]?.units ?? []).filter((u) => u.reinforcementTurn === undefined);
  if (!rule || units.length === 0) return null;
  const branchOf = (id: string) => toeOf(id)?.branch ?? "";
  const hosts = units.filter((u) => rule.toBranches.includes(branchOf(u.id)));
  const sources = units.filter((u) => rule.fromBranches.includes(branchOf(u.id)));
  if (hosts.length === 0 || sources.length === 0) return null;
  const used = (from: string, element: number) => attachments.filter((a) => a.from === from && a.element === element).length;
  const perHost = (to: string) => attachments.filter((a) => a.to === to).length;
  const name = (id: string) => `${id}(${toeOf(id)?.name ?? "?"})`;

  // 上級部隊の木(陣営の分)。どの上級部隊にも入っていない部隊は「直轄・その他」
  const fs = Object.entries(info.formations).filter(([, f]) => f.side === side);
  const listed = new Set(fs.flatMap(([, f]) => f.units));
  const children = (parent: string | undefined) => fs.filter(([, f]) => f.parent === parent);
  const unitRow = (id: string) => {
    const t = toeOf(id);
    if (!t || !units.some((u) => u.id === id)) return null;
    const isSource = sources.some((u) => u.id === id);
    const mine = attachments.map((a, i) => ({ a, i })).filter(({ a }) => a.to === id);
    return (
      <li key={id}>
        <b>{name(id)}</b>
        {isSource && (
          <ul>
            {t.elements.map((e, ei) => {
              const left = e.count - used(id, ei);
              return (
                <li key={ei}>
                  {e.name} 残り {left}/{e.count}
                  {left > 0 && (
                    <select
                      value=""
                      data-testid={`attach-${id}-${ei}`}
                      onChange={(ev) => ev.target.value && onChange([...attachments, { from: id, element: ei, to: ev.target.value }])}
                    >
                      <option value="">1個中隊を配属…</option>
                      {hosts
                        .filter((h) => perHost(h.id) < rule.maxPerHost)
                        .map((h) => (
                          <option key={h.id} value={h.id}>
                            {name(h.id)}へ
                          </option>
                        ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {mine.length > 0 && (
          <ul className="attached">
            {mine.map(({ a, i }) => (
              <li key={i}>
                配属:{toeOf(a.from)?.elements[a.element]?.name ?? "?"}({a.from}から)
                <button className="x" onClick={() => onChange(attachments.filter((_, k) => k !== i))}>
                  外す
                </button>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };
  const tree = (parent: string | undefined) =>
    children(parent).map(([fid, f]) => (
      <li key={fid}>
        <span className="formation">{f.name}</span>
        <ul>
          {f.units.map(unitRow)}
          {tree(fid)}
        </ul>
      </li>
    ));
  const others = units.filter((u) => !listed.has(u.id));
  return (
    <section className="attach" data-testid="attach-panel">
      <h4>部隊の階層と配属</h4>
      <p className="muted">
        機甲・戦車駆逐の部隊の中隊を、歩兵の部隊に付けられます(1部隊に{rule.maxPerHost}個中隊まで。戦いの途中では付け替えません)。付けた中隊は歩兵の足で一緒に動き、歩兵が近くで護衛します。
      </p>
      <ul className="tree">
        {tree(undefined)}
        {others.length > 0 && (
          <li>
            <span className="formation">直轄・その他</span>
            <ul>{others.map((u) => unitRow(u.id))}</ul>
          </li>
        )}
      </ul>
    </section>
  );
}
