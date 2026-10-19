import type { CustomStart, DevelopmentInfo, ScenarioSummary } from "@brigade/protocol";
import { USER_PREFIX, type CustomBundle } from "@brigade/sim-core";
import { useEffect, useMemo, useState } from "react";
import { applied, budgetOf, loadBundle } from "./custom.js";

/** 送るのは、差し替えに使うテンプレートと、それが載せている開発した武器だけ(ほかの作りかけの物の誤りで始められなくならないように) */
function usedPart(bundle: CustomBundle, subs: Record<string, string>): CustomBundle {
  const templates = Object.fromEntries(Object.entries(bundle.templates).filter(([id]) => Object.values(subs).includes(id)));
  const used = new Set(Object.values(templates).flatMap((t) => t.elements.flatMap((e) => e.weapons.map((w) => w.weapon))));
  const designs = Object.fromEntries(Object.entries(bundle.designs).filter(([id]) => used.has(USER_PREFIX + id)));
  return { version: 1, designs, templates };
}

/**
 * 装備編成して始める:差し替えられる部隊ごとに、自分の連隊テンプレート(同じ兵科のもの)を選ぶ。点数の合計が上限を超えると始められない。
 * 正しいかの最終的な検証はサーバーが行う
 */
export function CustomStartPanel({ scenario, side, onStart, onClose }: { scenario: ScenarioSummary; side: string; onStart: (custom: CustomStart) => void; onClose: () => void }) {
  const [info, setInfo] = useState<DevelopmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<string, string>>({});
  const bundle = useMemo(loadBundle, []);

  useEffect(() => {
    fetch(`/api/development?scenario=${encodeURIComponent(scenario.id)}`)
      .then(async (r) => {
        const body = (await r.json()) as DevelopmentInfo | { error: string };
        if ("error" in body) throw new Error(body.error);
        setInfo(body);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [scenario.id]);

  const a = useMemo(() => (info ? applied(info, bundle) : null), [info, bundle]);
  const budget = useMemo(() => (info ? budgetOf(info, side, bundle, subs) : null), [info, side, bundle, subs]);
  const units = info?.sides[side]?.units ?? [];
  const over = !!budget && budget.used > budget.limit + 1e-9;
  const templateIds = Object.keys(bundle.templates);

  return (
    <div className="custom-start" data-testid="custom-start">
      <h3>
        装備編成して始める:{scenario.name}・{scenario.sides.find((s) => s.id === side)?.name}
      </h3>
      {error && <p className="note">{error}</p>}
      {info && a && (
        <>
          {templateIds.length === 0 && (
            <p className="muted">
              連隊テンプレートがまだありません。<a href={`/develop.html?scenario=${encodeURIComponent(scenario.id)}`}>装備編成の画面</a>で作ってください。
            </p>
          )}
          <table className="victory">
            <tbody>
              {units.map((u) => {
                const orig = a.toes[u.toe]!;
                const usable = templateIds.filter((id) => a.toes[USER_PREFIX + id]?.branch === orig.branch);
                return (
                  <tr key={u.id}>
                    <th>
                      {u.id}
                      {u.reinforcementTurn !== undefined && <small className="muted">(増援 {u.reinforcementTurn}ターン目)</small>}
                    </th>
                    <td>
                      <select
                        value={subs[u.id] ?? ""}
                        data-testid={`sub-${u.id}`}
                        onChange={(e) =>
                          setSubs((s) => {
                            const next = { ...s };
                            if (e.target.value) next[u.id] = e.target.value;
                            else delete next[u.id];
                            return next;
                          })
                        }
                      >
                        <option value="">{orig.name}(元のまま)</option>
                        {usable.map((id) => (
                          <option key={id} value={id}>
                            ★ {bundle.templates[id]!.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {Object.keys(a.errors).some((k) => k.startsWith("template:")) && <p className="muted">誤りのあるテンプレートは選べません(装備編成の画面で直してください)。</p>}
          {budget && (
            <p className={over ? "note" : ""} data-testid="custom-budget">
              点数:{budget.used.toFixed(1)} / {budget.limit.toFixed(1)}
              {over && "(上限を超えています)"}
            </p>
          )}
        </>
      )}
      <div className="row">
        <button className="primary" disabled={!info || over} data-testid="custom-go" onClick={() => onStart({ bundle: usedPart(bundle, subs), substitutions: subs })}>
          この編成で始める
        </button>
        <button onClick={onClose}>やめる</button>
      </div>
    </div>
  );
}
