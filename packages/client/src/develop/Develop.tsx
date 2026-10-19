import type { DevelopmentInfo, ScenarioSummary } from "@brigade/protocol";
import { designWeapon, toeFire, toeHitPoints, USER_PREFIX, weaponCost, type CustomBundle, type RegimentTemplate, type Toe, type Weapon, type WeaponDesign } from "@brigade/sim-core";
import { useEffect, useMemo, useState } from "react";
import { applied, costOf, downloadBundle, loadBundle, readBundle, saveBundle } from "../custom.js";

/**
 * 装備編成の画面:武器の開発(ルールパックの武器の型から、口径などを動かして自分の武器を作る)と、
 * 連隊テンプレート(元の編成表の要素を、自分の武器と既存の武器で組み直す)。
 * 作ったものはブラウザに保存し、ファイルに書き出せる。試合では開始画面で部隊を差し替えて使う
 */

/** 新しいIDを作る(base1, base2 …) */
function freshId(base: string, taken: Record<string, unknown>): string {
  for (let i = 1; ; i++) if (!(`${base}${i}` in taken)) return `${base}${i}`;
}

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "—");

export function Develop() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [scenarioId, setScenarioId] = useState<string>(() => new URLSearchParams(location.search).get("scenario") ?? "");
  const [info, setInfo] = useState<DevelopmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<CustomBundle>(loadBundle);
  const [tab, setTab] = useState<"designs" | "templates">("designs");
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scenarios")
      .then((r) => r.json() as Promise<ScenarioSummary[]>)
      .then((list) => {
        const ok = list.filter((s) => s.customizableSides.length > 0).sort((a, b) => a.name.localeCompare(b.name, "ja"));
        setScenarios(ok);
        setScenarioId((cur) => (cur && ok.some((s) => s.id === cur) ? cur : (ok[0]?.id ?? "")));
      })
      .catch(() => setError("シナリオの一覧を読み込めませんでした(サーバーは pnpm dev で起動します)"));
  }, []);
  useEffect(() => {
    if (!scenarioId) return;
    fetch(`/api/development?scenario=${encodeURIComponent(scenarioId)}`)
      .then(async (r) => {
        const body = (await r.json()) as DevelopmentInfo | { error: string };
        if ("error" in body) throw new Error(body.error);
        setInfo(body);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [scenarioId]);

  const update = (fn: (b: CustomBundle) => void) => {
    const next = structuredClone(bundle);
    fn(next);
    setBundle(next);
    saveBundle(next);
  };
  const a = useMemo(() => (info ? applied(info, bundle) : null), [info, bundle]);

  const importFile = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((t) => {
      const r = readBundle(t);
      if (!r.ok) return setError(`読み込めません:${r.errors.join(" / ")}`);
      if (!confirm("いまの武器・テンプレートに、ファイルの中身を足しますか?(同じIDは上書き)")) return;
      update((b) => {
        Object.assign(b.designs, r.value.designs);
        Object.assign(b.templates, r.value.templates);
      });
    });
  };

  const entries = tab === "designs" ? bundle.designs : bundle.templates;
  return (
    <div className="editor develop">
      <div className="topbar">
        <b>装備編成(武器の開発・連隊テンプレート)</b>
        <label>
          シナリオ:
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} data-testid="dev-scenario">
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button onClick={() => downloadBundle(bundle)}>ファイルに書き出す</button>
        <label className="file">
          ファイルから読み込む <input type="file" accept=".json,application/json" onChange={(e) => importFile(e.target.files?.[0])} />
        </label>
        <a href="/">ゲームへ戻る</a>
      </div>
      {error && <p className="note">{error}</p>}
      <div className="ed-body">
        <div className="ed-list">
          <div className="tabs">
            <button className={tab === "designs" ? "on" : ""} onClick={() => (setTab("designs"), setSel(null))}>
              武器
            </button>
            <button className={tab === "templates" ? "on" : ""} onClick={() => (setTab("templates"), setSel(null))}>
              テンプレート
            </button>
          </div>
          <ul className="units">
            {Object.entries(entries).map(([id, e]) => (
              <li key={id} className={sel === id ? "sel" : ""} onClick={() => setSel(id)}>
                <span className="entry">
                  {e.name}
                  <small className={a?.errors[`${tab === "designs" ? "design" : "template"}:${id}`] ? "down" : "muted"}>
                    {a?.errors[`${tab === "designs" ? "design" : "template"}:${id}`] ? "誤りあり" : id}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          {info && (
            <div className="row">
              <button
                className="small"
                data-testid={tab === "designs" ? "dev-new-weapon" : "dev-new-template"}
                onClick={() =>
                  update((b) => {
                    if (tab === "designs") {
                      const id = freshId("w", b.designs);
                      const arch = Object.keys(info.development.archetypes)[0]!;
                      b.designs[id] = { name: `新しい${info.development.archetypes[arch]!.name}`, archetype: arch, params: {} };
                      setSel(id);
                    } else {
                      const id = freshId("t", b.templates);
                      const baseToe = Object.keys(info.toes.toes)[0]!;
                      b.templates[id] = { name: "新しい連隊", baseToe, elements: structuredClone(info.toes.toes[baseToe]!.elements) };
                      setSel(id);
                    }
                  })
                }
              >
                + {tab === "designs" ? "武器を開発" : "テンプレートを作る"}
              </button>
              {sel && entries[sel] && (
                <button
                  className="small"
                  onClick={() => {
                    if (!confirm("消しますか?")) return;
                    update((b) => {
                      if (tab === "designs") delete b.designs[sel];
                      else delete b.templates[sel];
                    });
                    setSel(null);
                  }}
                >
                  消す
                </button>
              )}
            </div>
          )}
          <p className="muted">作ったものはこのブラウザに保存されます。試合では、開始画面の「装備編成して始める」で部隊を差し替えて使います。</p>
        </div>
        <div className="ed-main">
          {!info && !error && <p className="muted">読み込んでいます…</p>}
          {info && a && tab === "designs" && sel && bundle.designs[sel] && (
            <DesignForm info={info} design={bundle.designs[sel]} errors={a.errors[`design:${sel}`] ?? []} onChange={(fn) => update((b) => fn(b.designs[sel]!))} />
          )}
          {info && a && tab === "templates" && sel && bundle.templates[sel] && (
            <TemplateForm
              info={info}
              bundle={bundle}
              id={sel}
              tpl={bundle.templates[sel]}
              weapons={a.weapons}
              built={a.toes[USER_PREFIX + sel] ?? null}
              errors={a.errors[`template:${sel}`] ?? []}
              onChange={(fn) => update((b) => fn(b.templates[sel]!))}
            />
          )}
          {info && !sel && <p className="muted">左の一覧から選ぶか、新しく作ってください。</p>}
        </div>
      </div>
    </div>
  );
}

function Issues({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul className="issues">
      {errors.map((e) => (
        <li key={e} className="error">
          {e}
        </li>
      ))}
    </ul>
  );
}

/** 武器の開発:型を選び、値を動かす。性能と点数はルールパックの式から */
function DesignForm({ info, design, errors, onChange }: { info: DevelopmentInfo; design: WeaponDesign; errors: string[]; onChange: (fn: (d: WeaponDesign) => void) => void }) {
  const dev = info.development;
  const arch = dev.archetypes[design.archetype];
  const w = designWeapon(design, dev);
  const ref = designWeapon({ name: "基準", archetype: design.archetype, params: {} }, dev);
  return (
    <div className="form" data-testid="dev-design-form">
      <div className="grid">
        <label className="field">
          名前
          <input value={design.name} onChange={(e) => onChange((d) => (d.name = e.target.value))} />
        </label>
        <label className="field">
          武器の型
          <select
            value={design.archetype}
            onChange={(e) =>
              onChange((d) => {
                // 名前が型の既定のままなら、新しい型の名前に合わせる
                if (d.name === `新しい${dev.archetypes[d.archetype]?.name}`) d.name = `新しい${dev.archetypes[e.target.value]!.name}`;
                d.archetype = e.target.value;
                d.params = {};
              })
            }
          >
            {Object.entries(dev.archetypes).map(([id, x]) => (
              <option key={id} value={id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {arch?.description && <p className="muted">{arch.description}</p>}
      {arch &&
        Object.entries(arch.params).map(([k, p]) => {
          const v = design.params[k] ?? p.default;
          return (
            <label key={k} className="field slider">
              <span>
                {p.name}:<b>{v}</b>
                {p.unit}(範囲 {p.min}〜{p.max}、基準 {p.default})
              </span>
              <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => onChange((d) => (d.params[k] = Number(e.target.value)))} data-testid={`dev-param-${k}`} />
            </label>
          );
        })}
      <Issues errors={errors} />
      {w.ok && ref.ok && <WeaponStats w={w.value} ref0={ref.value} cost={info.development.cost} />}
    </div>
  );
}

function ratio(x: number, base: number) {
  if (base === 0 || x === base) return null;
  const r = x / base;
  return <small className={r > 1 ? "up" : "down"}>({r > 1 ? "+" : ""}{Math.round((r - 1) * 100)}%)</small>;
}

function WeaponStats({ w, ref0, cost }: { w: Weapon; ref0: Weapon; cost: DevelopmentInfo["development"]["cost"] }) {
  return (
    <>
      <h4>性能(基準との比)</h4>
      <table className="stats">
        <tbody>
          <tr>
            <th>点数</th>
            <td data-testid="dev-weapon-cost">
              {fmt(weaponCost(w, cost), 2)} {ratio(weaponCost(w, cost), weaponCost(ref0, cost))}
            </td>
          </tr>
          <tr>
            <th>弾薬の消費(t/分・1門)</th>
            <td>
              {w.ammoPerMin.toFixed(5)} {ratio(w.ammoPerMin, ref0.ammoPerMin)}
            </td>
          </tr>
          <tr>
            <th>制圧のしやすさ</th>
            <td>
              {fmt(w.suppression, 2)} {ratio(w.suppression, ref0.suppression)}
            </td>
          </tr>
          {w.antiAir > 0 && (
            <tr>
              <th>対空</th>
              <td>
                {fmt(w.antiAir, 3)} {ratio(w.antiAir, ref0.antiAir)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="elements">
        <thead>
          <tr>
            <th>この距離まで(m)</th>
            <th>火力</th>
            <th>貫通力(mm)</th>
          </tr>
        </thead>
        <tbody>
          {w.bands.map((b, i) => (
            <tr key={i}>
              <td>
                {b.maxRangeM} {ratio(b.maxRangeM, ref0.bands[i]?.maxRangeM ?? b.maxRangeM)}
              </td>
              <td>
                {b.power} {ratio(b.power, ref0.bands[i]?.power ?? b.power)}
              </td>
              <td>
                {b.penetrationMm ?? "—"} {b.penetrationMm !== undefined && ratio(b.penetrationMm, ref0.bands[i]?.penetrationMm ?? b.penetrationMm)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const ARMOR_FACES = [
  ["front", "車体正面"],
  ["side", "車体側面"],
  ["rear", "車体背面"],
  ["turretFront", "砲塔正面"],
  ["turretSide", "砲塔側面"],
] as const;

/** 連隊テンプレート:元の編成表を選び、要素(中隊など)を組み直す */
function TemplateForm({
  info,
  bundle,
  id,
  tpl,
  weapons,
  built,
  errors,
  onChange,
}: {
  info: DevelopmentInfo;
  bundle: CustomBundle;
  id: string;
  tpl: RegimentTemplate;
  weapons: ReturnType<typeof applied>["weapons"];
  built: Toe | null;
  errors: string[];
  onChange: (fn: (t: RegimentTemplate) => void) => void;
}) {
  const lim = info.development.template;
  const base = info.toes.toes[tpl.baseToe];
  const weaponIds = [...Object.keys(info.weapons.weapons), ...Object.keys(bundle.designs).map((k) => USER_PREFIX + k).filter((k) => k in weapons.weapons)];
  const wName = (k: string) => weapons.weapons[k]?.name ?? k;
  const elementTotal = tpl.elements.reduce((s, e) => s + e.count, 0);
  const fire = (t: Toe, d: number, armor: number) => toeFire(t, weapons, d, armor, false).firepower;
  return (
    <div className="form" data-testid="dev-template-form">
      <div className="grid">
        <label className="field">
          名前
          <input value={tpl.name} onChange={(e) => onChange((t) => (t.name = e.target.value))} />
        </label>
        <label className="field">
          元の編成表(兵科・補給・正面幅を受け継ぐ)
          <select value={tpl.baseToe} onChange={(e) => onChange((t) => (t.baseToe = e.target.value))}>
            {Object.entries(info.toes.toes).map(([k, t]) => (
              <option key={k} value={k}>
                {t.name}({info.branchNames[t.branch] ?? t.branch})
              </option>
            ))}
          </select>
        </label>
      </div>
      {base && (
        <button className="small" onClick={() => confirm("要素を元の編成表のものに戻しますか?") && onChange((t) => (t.elements = structuredClone(base.elements)))}>
          要素を元の編成表に戻す
        </button>
      )}
      <h4>
        要素(数の合計 {elementTotal} / {lim.maxElements}、耐久 {lim.hitPoints.min}〜{lim.hitPoints.max}、武器は1要素 {lim.maxWeaponsPerElement} まで、装甲厚 {lim.maxArmorMm}mm まで)
      </h4>
      <table className="elements">
        <thead>
          <tr>
            <th>名前</th>
            <th>数</th>
            <th>耐久</th>
            <th>装甲</th>
            <th>武器 × 数</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tpl.elements.map((e, i) => (
            <tr key={i}>
              <td>
                <input value={e.name} onChange={(ev) => onChange((t) => (t.elements[i]!.name = ev.target.value))} />
              </td>
              <td>
                <input type="number" min={1} value={e.count} onChange={(ev) => onChange((t) => (t.elements[i]!.count = Math.max(1, Number(ev.target.value) || 1)))} />
              </td>
              <td>
                <input type="number" min={lim.hitPoints.min} max={lim.hitPoints.max} step={10} value={e.hitPoints} onChange={(ev) => onChange((t) => (t.elements[i]!.hitPoints = Number(ev.target.value) || lim.hitPoints.min))} />
              </td>
              <td className="armor-mm">
                <label className="field check">
                  <input
                    type="checkbox"
                    checked={!!e.armored}
                    onChange={(ev) =>
                      onChange((t) => {
                        const el = t.elements[i]!;
                        if (ev.target.checked) el.armored = true;
                        else {
                          delete el.armored;
                          delete el.armorMm;
                        }
                      })
                    }
                  />
                  装甲
                </label>
                {e.armored &&
                  ARMOR_FACES.map(([f, label]) => (
                    <input
                      key={f}
                      type="number"
                      title={`${label}(mm。空欄は${f === "rear" ? "側面と同じ" : f.startsWith("turret") ? "砲塔なし" : "装甲厚を書かない"})`}
                      placeholder={label}
                      min={1}
                      max={lim.maxArmorMm}
                      value={e.armorMm?.[f] ?? ""}
                      onChange={(ev) =>
                        onChange((t) => {
                          const el = t.elements[i]!;
                          const v = ev.target.value === "" ? undefined : Number(ev.target.value);
                          if (v === undefined) {
                            if (f === "front" || f === "side") delete el.armorMm;
                            else if (el.armorMm) delete el.armorMm[f];
                            return;
                          }
                          el.armorMm = { ...el.armorMm, front: el.armorMm?.front ?? v, side: el.armorMm?.side ?? v, [f]: v };
                        })
                      }
                    />
                  ))}
              </td>
              <td>
                {e.weapons.map((r, j) => (
                  <div className="wref" key={j}>
                    <select value={r.weapon} onChange={(ev) => onChange((t) => (t.elements[i]!.weapons[j]!.weapon = ev.target.value))}>
                      {!weaponIds.includes(r.weapon) && <option value={r.weapon}>{r.weapon}(ない武器)</option>}
                      {weaponIds.map((k) => (
                        <option key={k} value={k}>
                          {k.startsWith(USER_PREFIX) ? `★ ${wName(k)}` : wName(k)}
                        </option>
                      ))}
                    </select>
                    ×
                    <input type="number" min={1} value={r.count} onChange={(ev) => onChange((t) => (t.elements[i]!.weapons[j]!.count = Math.max(1, Number(ev.target.value) || 1)))} />
                    <button className="x" onClick={() => onChange((t) => t.elements[i]!.weapons.splice(j, 1))}>
                      ×
                    </button>
                  </div>
                ))}
                <button className="small" onClick={() => onChange((t) => t.elements[i]!.weapons.push({ weapon: weaponIds[0]!, count: 1 }))}>
                  + 武器
                </button>
              </td>
              <td>
                <button className="x" title="この要素を消す" disabled={tpl.elements.length <= 1} onClick={() => onChange((t) => t.elements.splice(i, 1))}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="small" onClick={() => onChange((t) => t.elements.push({ name: "中隊", count: 1, hitPoints: 100, weapons: [] }))}>
        + 要素
      </button>
      <Issues errors={errors} />
      {built && base && (
        <>
          <h4>元の編成表との比較</h4>
          <table className="stats" data-testid="dev-template-stats">
            <tbody>
              <tr>
                <th>点数</th>
                <td data-testid="dev-template-cost">
                  {fmt(costOf(info, weapons, built))} {ratio(costOf(info, weapons, built), costOf(info, weapons, base))}
                </td>
                <td className="muted">元 {fmt(costOf(info, weapons, base))}</td>
              </tr>
              <tr>
                <th>耐久</th>
                <td>
                  {toeHitPoints(built)} {ratio(toeHitPoints(built), toeHitPoints(base))}
                </td>
                <td className="muted">元 {toeHitPoints(base)}</td>
              </tr>
              {[300, 1000].map((d) => (
                <tr key={d}>
                  <th>{d}mの火力(非装甲 / 装甲)</th>
                  <td>
                    {fmt(fire(built, d, 0))} / {fmt(fire(built, d, 1))}
                  </td>
                  <td className="muted">
                    元 {fmt(fire(base, d, 0))} / {fmt(fire(base, d, 1))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">ID:{id}(差し替えには、元の部隊と同じ兵科の部隊にだけ使えます)</p>
        </>
      )}
    </div>
  );
}
