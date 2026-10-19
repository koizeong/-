import type { CustomStart, DevelopmentInfo, ScenarioSummary } from "@brigade/protocol";
import { autoCompose, USER_PREFIX, type BranchPack, type CustomBundle } from "@brigade/sim-core";
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
export function CustomStartPanel({
  scenario,
  side,
  onStart,
  onClose,
  allowAiAuto = false,
  preset,
}: {
  scenario: ScenarioSummary;
  side: string;
  /** 編成の選択(史実の編成など)。差し替えの元の編成表と点数は、これを当てたもの */
  preset?: string;
  /** aiAuto:AIの陣営もおまかせ編成にするなら、その方針 */
  onStart: (custom: CustomStart, aiAuto?: string) => void;
  onClose: () => void;
  /** AIの陣営のおまかせ編成を選べる(人間1人 対 AI の試合だけ) */
  allowAiAuto?: boolean;
}) {
  const [info, setInfo] = useState<DevelopmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subs, setSubs] = useState<Record<string, string>>({});
  /** 自分のテンプレートに、おまかせで組んだもの(ID auto-…)を足したもの */
  const [bundle, setBundle] = useState<CustomBundle>(loadBundle);
  const [style, setStyle] = useState("");
  const [aiAuto, setAiAuto] = useState("");

  useEffect(() => {
    fetch(`/api/development?scenario=${encodeURIComponent(scenario.id)}${preset ? `&preset=${encodeURIComponent(preset)}` : ""}`)
      .then(async (r) => {
        const body = (await r.json()) as DevelopmentInfo | { error: string };
        if ("error" in body) throw new Error(body.error);
        setInfo(body);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [scenario.id, preset]);

  const a = useMemo(() => (info ? applied(info, bundle) : null), [info, bundle]);
  const budget = useMemo(() => (info ? budgetOf(info, side, bundle, subs) : null), [info, side, bundle, subs]);
  const units = info?.sides[side]?.units ?? [];
  const over = !!budget && budget.used > budget.limit + 1e-9;
  const templateIds = Object.keys(bundle.templates);
  const styles = Object.entries(info?.development.autoStyles ?? {});

  /** おまかせ:選んだ方針で、点数の上限の中で組み、差し替えに入れる(乱数なし。同じなら同じ編成) */
  const compose = () => {
    if (!info) return;
    const id = style || styles[0]?.[0];
    const s = info.sides[side];
    if (!id || !s) return;
    const branches: BranchPack = { id: "*", branches: Object.fromEntries(Object.entries(info.branchNames).map(([k, name]) => [k, { name } as BranchPack["branches"][string]])) };
    const r = autoCompose(info.development, info.weapons, info.toes, branches, s.units, s.budgetMultiplier, id);
    if (!r) return;
    setBundle((b) => {
      const keep = (x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith("auto-")));
      return { version: 1, designs: { ...keep(b.designs), ...r.bundle.designs } as CustomBundle["designs"], templates: { ...keep(b.templates), ...r.bundle.templates } as CustomBundle["templates"] };
    });
    setSubs(r.substitutions);
  };

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
          {styles.length > 0 && (
            <div className="row">
              <label>
                おまかせ編成:
                <select value={style || styles[0]![0]} onChange={(e) => setStyle(e.target.value)} data-testid="auto-style">
                  {styles.map(([id, x]) => (
                    <option key={id} value={id} title={x.description}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={compose} data-testid="auto-compose">
                この方針で組む
              </button>
              <span className="muted">{info.development.autoStyles[style || styles[0]![0]]?.description}</span>
            </div>
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
      {allowAiAuto && styles.length > 0 && (
        <label className="row">
          AIの陣営:
          <select value={aiAuto} onChange={(e) => setAiAuto(e.target.value)} data-testid="ai-auto">
            <option value="">元の編成のまま</option>
            {styles.map(([id, x]) => (
              <option key={id} value={id}>
                おまかせ編成({x.name})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row">
        <button className="primary" disabled={!info || over} data-testid="custom-go" onClick={() => onStart({ bundle: usedPart(bundle, subs), substitutions: subs }, aiAuto || undefined)}>
          この編成で始める
        </button>
        <button onClick={onClose}>やめる</button>
      </div>
    </div>
  );
}
