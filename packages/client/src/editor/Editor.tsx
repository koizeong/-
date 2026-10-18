import type { PacksResponse, SaveResponse } from "@brigade/protocol";
import {
  checkToe,
  checkWeapon,
  parseBranchPack,
  parseRulePack,
  parseToePack,
  parseWeaponPack,
  ToeSchema,
  toeSummary,
  WeaponSchema,
  weaponUsage,
  weaponEffectAgainst,
  type BranchPack,
  type DataIssue,
  type RulePack,
  type Toe,
  type ToePack,
  type ToeSummary,
  type Weapon,
  type WeaponPack,
} from "@brigade/sim-core";
import { useEffect, useMemo, useState } from "react";

/**
 * 編成エディター(mod・シナリオ作者向けの道具)。data/ の編成表と武器を編集し、ゲームと同じ関数で導いた値をその場で見せる。
 * 保存はサーバーが検証してから data/ に書く(localhost から・開発時だけ)。ダウンロードもできる
 */

// 編集中のパックは、スキーマを満たさない途中の値(空欄など)も持つので、型を緩めて扱う
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

interface FileDraft {
  file: string;
  pack: Draft;
  /** 最後に読み込んだ・保存した内容(未保存の変更の判定) */
  saved: string;
}

type Tab = "toe" | "weapons";

const clone = <T,>(x: T): T => structuredClone(x);
const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** よく出るスキーマの誤りの文を日本語に */
const SCHEMA_MESSAGES: [RegExp, string][] = [
  [/^Expected number, received (string|nan)$/i, "数を入れてください"],
  [/^Expected integer, received float$/, "整数にしてください"],
  [/^Number must be greater than 0$/, "0より大きい数にしてください"],
  [/^Number must be greater than or equal to (\S+)$/, "$1以上にしてください"],
  [/^Number must be less than or equal to (\S+)$/, "$1以下にしてください"],
  [/^String must contain at least 1 character\(s\)$/, "空にできません"],
  [/^Array must contain at least 1 element\(s\)$/, "1つ以上必要です"],
  [/^Required$/, "必要です"],
];
const ja = (m: string) => SCHEMA_MESSAGES.reduce((t, [re, to]) => (re.test(t) ? t.replace(re, to) : t), m);

/** スキーマの誤り("toes.x.elements.0.count: ...")を、項目のパスと文に分ける */
function schemaIssues(errors: string[]): DataIssue[] {
  return errors.map((e) => {
    const i = e.indexOf(": ");
    return { level: "error", path: i > 0 ? e.slice(0, i) : "", message: ja(i > 0 ? e.slice(i + 2) : e) };
  });
}

/** prefix の下の誤りだけを、prefix を外したパスで */
function under(issues: DataIssue[], prefix: string): DataIssue[] {
  return issues.filter((x) => x.path === prefix || x.path.startsWith(`${prefix}.`)).map((x) => ({ ...x, path: x.path.slice(prefix.length + 1) }));
}

const hasIssue = (issues: DataIssue[], path: string) => issues.some((x) => x.path === path || x.path.startsWith(`${path}.`));

function NumField({ value, onChange, step = 1, min, issues, path, title }: { value: unknown; onChange: (v: number | "") => void; step?: number; min?: number; issues: DataIssue[]; path: string; title?: string }) {
  return (
    <input
      type="number"
      className={hasIssue(issues, path) ? "err" : ""}
      value={typeof value === "number" ? value : ""}
      step={step}
      {...(min !== undefined ? { min } : {})}
      {...(title ? { title } : {})}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
    />
  );
}

/** 新しいIDを作る(base, base_2, base_3 …) */
function freshId(base: string, taken: Record<string, unknown>): string {
  if (!(base in taken)) return base;
  for (let i = 2; ; i++) if (!(`${base}_${i}` in taken)) return `${base}_${i}`;
}

function download(file: string, pack: Draft) {
  const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Editor() {
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<RulePack | null>(null);
  const [branches, setBranches] = useState<BranchPack | null>(null);
  const [toeFiles, setToeFiles] = useState<FileDraft[]>([]);
  const [weaponFiles, setWeaponFiles] = useState<FileDraft[]>([]);
  const [tab, setTab] = useState<Tab>("toe");
  const [fileIdx, setFileIdx] = useState<Record<Tab, number>>({ toe: 0, weapons: 0 });
  const [selected, setSelected] = useState<Record<Tab, string | null>>({ toe: null, weapons: null });
  const [compareId, setCompareId] = useState<string>("");
  const [status, setStatus] = useState<{ ok: boolean; lines: string[] } | null>(null);

  useEffect(() => {
    fetch("/api/packs")
      .then((r) => r.json() as Promise<PacksResponse>)
      .then((p) => {
        const r = parseRulePack(p.rules[0]?.pack);
        if (!r.ok) throw new Error(`ルールパックが読めません: ${r.errors[0]}`);
        // 兵科は全パックを1つにまとめる(編成表はどの兵科パックの兵科も指せる)
        const bs = p.branches.map((b) => parseBranchPack(b.pack)).flatMap((b) => (b.ok ? [b.value] : []));
        setRules(r.value);
        setBranches({ id: "*", branches: Object.assign({}, ...bs.map((b) => b.branches)) });
        const draft = (f: { file: string; pack: unknown }): FileDraft => ({ file: f.file, pack: clone(f.pack), saved: JSON.stringify(f.pack) });
        setToeFiles(p.toe.map(draft));
        setWeaponFiles(p.weapons.map(draft));
      })
      .catch((e: unknown) => setError(`読み込めませんでした(pnpm dev でサーバーを起動してください): ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  const dirty = [...toeFiles, ...weaponFiles].some((f) => JSON.stringify(f.pack) !== f.saved);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // 全武器パックの武器(1つずつ検証し、通ったものだけ。編成表の導出値に使う)
  const weapons: WeaponPack = useMemo(() => {
    const all: Record<string, Weapon> = {};
    for (const f of weaponFiles)
      for (const [id, w] of Object.entries((f.pack?.weapons ?? {}) as Record<string, unknown>)) {
        const r = WeaponSchema.safeParse(w);
        if (r.success) all[id] = r.data;
      }
    return { id: "*", weapons: all };
  }, [weaponFiles]);

  // 全編成表(比較・武器の使われ方に使う)
  const allToes = useMemo(() => {
    const out: { file: string; id: string; toe: Toe }[] = [];
    for (const f of toeFiles)
      for (const [id, t] of Object.entries((f.pack?.toes ?? {}) as Record<string, unknown>)) {
        const r = ToeSchema.safeParse(t);
        if (r.success) out.push({ file: f.file, id, toe: r.data });
      }
    return out;
  }, [toeFiles]);

  if (error) return <div className="loading">{error}</div>;
  if (!rules || !branches) return <div className="loading">読み込んでいます…</div>;

  const files = tab === "toe" ? toeFiles : weaponFiles;
  const setFiles = tab === "toe" ? setToeFiles : setWeaponFiles;
  const fi = Math.min(fileIdx[tab], Math.max(0, files.length - 1));
  const current = files[fi];
  const entriesKey = tab === "toe" ? "toes" : "weapons";
  const entries: Record<string, Draft> = current?.pack?.[entriesKey] ?? {};
  const ids = Object.keys(entries);
  const sel = selected[tab] && selected[tab]! in entries ? selected[tab]! : (ids[0] ?? null);

  /** 開いているパックを書き換える */
  const update = (fn: (pack: Draft) => void) =>
    setFiles((fs) =>
      fs.map((f, i) => {
        if (i !== fi) return f;
        const pack = clone(f.pack);
        fn(pack);
        return { ...f, pack };
      }),
    );
  const updateEntry = (fn: (e: Draft) => void) => update((p) => fn(p[entriesKey][sel!]));

  const parsed = current ? (tab === "toe" ? parseToePack(current.pack) : parseWeaponPack(current.pack)) : null;
  const packIssues = parsed && !parsed.ok ? schemaIssues(parsed.errors) : [];

  const usedBy = (weaponId: string) => weaponUsage(weaponId, toeFiles.map((f) => ({ id: f.file, toes: f.pack?.toes ?? {} }) as ToePack));

  const addEntry = () => {
    const id = freshId(tab === "toe" ? "new_toe" : "new_weapon", entries);
    const firstBranch = Object.keys(branches.branches)[0] ?? "infantry";
    const firstWeapon = Object.keys(weapons.weapons)[0] ?? "small_arms";
    update((p) => {
      p[entriesKey] ??= {};
      p[entriesKey][id] =
        tab === "toe"
          ? {
              name: "新しい編成",
              branch: firstBranch,
              armorRatio: 0,
              frontageM: 1000,
              supply: { ammoCapacityT: 20, fuelCapacityT: 0, fuelPerKmT: 0 },
              elements: [{ name: "中隊", count: 3, hitPoints: 100, weapons: [{ weapon: firstWeapon, count: 1 }] }],
            }
          : { name: "新しい武器", bands: [{ maxRangeM: 500, power: 1 }], effectiveness: { soft: 1, armored: 0 }, indirect: false, ammoPerMin: 0.001, suppression: 1, antiAir: 0 };
    });
    setSelected((s) => ({ ...s, [tab]: id }));
  };
  const duplicate = () => {
    if (!sel) return;
    const id = freshId(`${sel}_copy`, entries);
    update((p) => {
      p[entriesKey][id] = clone(p[entriesKey][sel]);
      p[entriesKey][id].name = `${p[entriesKey][id].name ?? sel}(複製)`;
    });
    setSelected((s) => ({ ...s, [tab]: id }));
  };
  const remove = () => {
    if (!sel) return;
    if (tab === "weapons") {
      const u = usedBy(sel);
      const names = u.slice(0, 4).map((x) => x.toe).join("・") + (u.length > 4 ? ` ほか${u.length - 4}つ` : "");
      if (u.length) return setStatus({ ok: false, lines: [`武器 ${sel} は ${names} が使っているので消せません。先に編成表から外してください`] });
    }
    if (!confirm(`${sel} を消しますか?(保存するまでファイルは変わりません)`)) return;
    update((p) => delete p[entriesKey][sel]);
    setSelected((s) => ({ ...s, [tab]: null }));
  };
  const rename = (next: string) => {
    if (!sel || !next || next === sel || next in entries || !/^[a-z0-9_]+$/.test(next)) return;
    if (tab === "weapons" && usedBy(sel).length) return setStatus({ ok: false, lines: [`武器 ${sel} は編成表が使っているので、IDを変えられません(名前は変えられます)`] });
    update((p) => {
      // 並び順を保ったまま、キーだけを変える
      p[entriesKey] = Object.fromEntries(Object.entries(p[entriesKey]).map(([k, v]) => [k === sel ? next : k, v]));
    });
    setSelected((s) => ({ ...s, [tab]: next }));
  };

  const save = async () => {
    if (!current) return;
    setStatus(null);
    const r = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: tab, file: current.file, pack: current.pack }) });
    const body = (await r.json()) as SaveResponse;
    if (body.ok) {
      setFiles((fs) => fs.map((f, i) => (i === fi ? { ...f, saved: JSON.stringify(f.pack) } : f)));
      setStatus({ ok: true, lines: [`data/${tab}/${current.file} に保存しました。これから始める試合から使われます`] });
    } else setStatus({ ok: false, lines: body.errors });
  };
  const fileDirty = current ? JSON.stringify(current.pack) !== current.saved : false;
  const blocking = packIssues.length > 0 || (tab === "toe" && allToeIssues(current?.pack, weapons, branches).some((x) => x.level === "error"));

  return (
    <div className="editor">
      <header className="topbar">
        <b>編成エディター</b>
        <span className="muted">史実の編成は推測で埋めず、分からない値は notes に TODO(要裏取り) と出典の候補を書いてください</span>
        <span className="spacer" />
        <a href="/">ゲームへ</a>
      </header>
      <div className="ed-body">
        <nav className="ed-list">
          <div className="tabs">
            <button className={tab === "toe" ? "on" : ""} onClick={() => setTab("toe")}>
              編成表
            </button>
            <button className={tab === "weapons" ? "on" : ""} onClick={() => setTab("weapons")}>
              武器
            </button>
          </div>
          {files.length > 1 && (
            <select value={fi} onChange={(e) => setFileIdx((x) => ({ ...x, [tab]: Number(e.target.value) }))}>
              {files.map((f, i) => (
                <option key={f.file} value={i}>
                  {f.file}
                </option>
              ))}
            </select>
          )}
          <div className="muted">
            {current?.file}
            {fileDirty && <b className="dirty"> ●未保存</b>}
          </div>
          <ul className="units">
            {ids.map((id) => {
              const bad = hasIssue(packIssues, `${entriesKey}.${id}`) || (tab === "toe" && issuesOfToe(entries[id], weapons, branches).some((x) => x.level === "error"));
              return (
                <li key={id} className={id === sel ? "sel" : ""} onClick={() => setSelected((s) => ({ ...s, [tab]: id }))} data-testid={`entry-${id}`}>
                  <span className="entry">
                    <span>
                      {bad && <span className="bad-text">● </span>}
                      {entries[id]?.name ?? id}
                    </span>
                    <small className="muted">{id}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="row">
            <button onClick={addEntry}>新規</button>
            <button onClick={duplicate} disabled={!sel}>
              複製
            </button>
            <button onClick={remove} disabled={!sel}>
              削除
            </button>
          </div>
          {current && (
            <label className="field">
              パックのメモ(notes。仮置きの値・TODO(要裏取り)・出典の候補を書く)
              <textarea rows={6} value={current.pack?.notes ?? ""} onChange={(e) => update((p) => (e.target.value ? (p.notes = e.target.value) : delete p.notes))} />
            </label>
          )}
        </nav>
        <main className="ed-main">
          {sel && entries[sel] ? (
            tab === "toe" ? (
              <ToeForm
                id={sel}
                toe={entries[sel]}
                branches={branches}
                weapons={weapons}
                issues={[...under(packIssues, `toes.${sel}`), ...issuesOfToe(entries[sel], weapons, branches)]}
                onChange={updateEntry}
                onRename={rename}
              />
            ) : (
              <WeaponForm id={sel} weapon={entries[sel]} issues={under(packIssues, `weapons.${sel}`)} usedBy={usedBy(sel).map((x) => x.toe)} onChange={updateEntry} onRename={rename} />
            )
          ) : (
            <p className="muted">左の一覧から選ぶか、「新規」で作ってください。</p>
          )}
        </main>
        <aside className="ed-side">
          {sel && entries[sel] && tab === "toe" && (
            <ToeStats
              toe={entries[sel]}
              saved={savedEntry(current, "toes", sel)}
              weapons={weapons}
              branches={branches}
              rules={rules}
              compareId={compareId}
              setCompareId={setCompareId}
              allToes={allToes.filter((x) => !(x.id === sel && x.file === current?.file))}
            />
          )}
          {sel && entries[sel] && tab === "weapons" && <WeaponStats weapon={entries[sel]} />}
          <section>
            <h3>保存</h3>
            {packIssues.length > 0 && (
              <ul className="issues">
                {packIssues.slice(0, 12).map((x, i) => (
                  <li key={i} className="error">
                    {x.path}:{x.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="row">
              <button className="primary" onClick={save} disabled={!fileDirty || blocking} data-testid="save" title={blocking ? "誤り(赤)を直すと保存できます" : ""}>
                data/ に保存
              </button>
              <button onClick={() => current && download(current.file, current.pack)} disabled={!current}>
                JSONを書き出す
              </button>
            </div>
            {status && (
              <ul className={`issues ${status.ok ? "okmsg" : ""}`}>
                {status.lines.map((l, i) => (
                  <li key={i} className={status.ok ? "" : "error"}>
                    {l}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** 保存してある(読み込んだ)ときの中身。まだ保存していない新しいものは null */
function savedEntry(f: FileDraft | undefined, key: string, id: string): Draft | null {
  if (!f) return null;
  const saved = JSON.parse(f.saved)?.[key]?.[id];
  return saved === undefined ? null : saved;
}

/** 編成表1つの参照と整合の誤り(スキーマを満たしていなければ、スキーマの誤りの方に任せる) */
function issuesOfToe(draft: Draft, weapons: WeaponPack, branches: BranchPack): DataIssue[] {
  const r = ToeSchema.safeParse(draft);
  return r.success ? checkToe(r.data, weapons, branches) : [];
}

function allToeIssues(pack: Draft, weapons: WeaponPack, branches: BranchPack): DataIssue[] {
  return Object.values((pack?.toes ?? {}) as Record<string, Draft>).flatMap((t) => issuesOfToe(t, weapons, branches));
}

function IssueList({ issues }: { issues: DataIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issues">
      {issues.map((x, i) => (
        <li key={i} className={x.level}>
          {x.level === "error" ? "誤り" : "注意"}:{x.message}
          {x.path && <span className="muted">({x.path})</span>}
        </li>
      ))}
    </ul>
  );
}

function IdField({ id, onRename }: { id: string; onRename: (next: string) => void }) {
  const [v, setV] = useState(id);
  useEffect(() => setV(id), [id]);
  return (
    <label className="field">
      ID
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onRename(v.trim())} title="英小文字・数字・_ だけ。シナリオから参照する名前なので、使われているものを変えるとシナリオが読めなくなります" />
    </label>
  );
}

function ToeForm({ id, toe, branches, weapons, issues, onChange, onRename }: { id: string; toe: Draft; branches: BranchPack; weapons: WeaponPack; issues: DataIssue[]; onChange: (fn: (t: Draft) => void) => void; onRename: (next: string) => void }) {
  const weaponIds = Object.keys(weapons.weapons);
  return (
    <div className="form">
      <h3>編成表</h3>
      <div className="grid">
        <IdField id={id} onRename={onRename} />
        <label className="field">
          名前
          <input className={hasIssue(issues, "name") ? "err" : ""} value={toe.name ?? ""} onChange={(e) => onChange((t) => (t.name = e.target.value))} />
        </label>
        <label className="field">
          兵科
          <select className={hasIssue(issues, "branch") ? "err" : ""} value={toe.branch ?? ""} onChange={(e) => onChange((t) => (t.branch = e.target.value))}>
            {!(toe.branch in branches.branches) && <option value={toe.branch}>{toe.branch}(ない兵科)</option>}
            {Object.entries(branches.branches).map(([k, b]) => (
              <option key={k} value={k}>
                {b.name}({k})
              </option>
            ))}
          </select>
        </label>
        <label className="field" title="0〜1。撃たれたときに、武器の装甲への効果がこの割合で効く">
          装甲化率
          <NumField value={toe.armorRatio} step={0.05} min={0} issues={issues} path="armorRatio" onChange={(v) => onChange((t) => (t.armorRatio = v))} />
        </label>
        <label className="field" title="展開したときに受け持つ横幅(m)。阻止圏・戦闘正面幅に効く">
          正面幅(m)
          <NumField value={toe.frontageM ?? 0} step={100} min={0} issues={issues} path="frontageM" onChange={(v) => onChange((t) => (t.frontageM = v))} />
        </label>
        <label className="field">
          弾薬の携行(t)
          <NumField value={toe.supply?.ammoCapacityT} step={5} min={0} issues={issues} path="supply.ammoCapacityT" onChange={(v) => onChange((t) => (t.supply.ammoCapacityT = v))} />
        </label>
        <label className="field">
          燃料の携行(t)
          <NumField value={toe.supply?.fuelCapacityT} step={5} min={0} issues={issues} path="supply.fuelCapacityT" onChange={(v) => onChange((t) => (t.supply.fuelCapacityT = v))} />
        </label>
        <label className="field" title="移動1kmあたりの燃料消費(t)。0なら燃料を使わない(徒歩)">
          燃費(t/km)
          <NumField value={toe.supply?.fuelPerKmT} step={0.05} min={0} issues={issues} path="supply.fuelPerKmT" onChange={(v) => onChange((t) => (t.supply.fuelPerKmT = v))} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={!!toe.amphibious} onChange={(e) => onChange((t) => (e.target.checked ? (t.amphibious = true) : delete t.amphibious))} />
          揚陸能力(川・海を渡れる)
        </label>
      </div>
      <h4>要素(中隊・小隊など)</h4>
      <table className="elements">
        <thead>
          <tr>
            <th>名前</th>
            <th title="この要素の数">数</th>
            <th title="1要素あたりの耐久(損害ポイント)">耐久</th>
            <th>武器 × 数(1要素あたり)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(toe.elements ?? []).map((e: Draft, i: number) => (
            <tr key={i}>
              <td>
                <input className={hasIssue(issues, `elements.${i}.name`) ? "err" : ""} value={e.name ?? ""} onChange={(ev) => onChange((t) => (t.elements[i].name = ev.target.value))} />
              </td>
              <td>
                <NumField value={e.count} min={1} issues={issues} path={`elements.${i}.count`} onChange={(v) => onChange((t) => (t.elements[i].count = v))} />
              </td>
              <td>
                <NumField value={e.hitPoints} step={10} min={1} issues={issues} path={`elements.${i}.hitPoints`} onChange={(v) => onChange((t) => (t.elements[i].hitPoints = v))} />
              </td>
              <td>
                {(e.weapons ?? []).map((w: Draft, j: number) => (
                  <div className="wref" key={j}>
                    <select className={hasIssue(issues, `elements.${i}.weapons.${j}`) ? "err" : ""} value={w.weapon} onChange={(ev) => onChange((t) => (t.elements[i].weapons[j].weapon = ev.target.value))}>
                      {!weaponIds.includes(w.weapon) && <option value={w.weapon}>{w.weapon}(ない武器)</option>}
                      {weaponIds.map((k) => (
                        <option key={k} value={k}>
                          {weapons.weapons[k]!.name}
                        </option>
                      ))}
                    </select>
                    ×
                    <NumField value={w.count} min={1} issues={issues} path={`elements.${i}.weapons.${j}.count`} onChange={(v) => onChange((t) => (t.elements[i].weapons[j].count = v))} />
                    <button className="x" title="この武器を外す" onClick={() => onChange((t) => t.elements[i].weapons.splice(j, 1))}>
                      ×
                    </button>
                  </div>
                ))}
                <button className="small" onClick={() => onChange((t) => t.elements[i].weapons.push({ weapon: weaponIds[0], count: 1 }))}>
                  + 武器
                </button>
              </td>
              <td>
                <button className="x" title="この要素を消す" onClick={() => onChange((t) => t.elements.splice(i, 1))}>
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
      <IssueList issues={issues} />
    </div>
  );
}

/** 距離ごとの火力の折れ線(実線=非装甲の目標、破線=装甲の目標。比較は灰色) */
function FireChart({ series, maxRange }: { series: { label: string; color: string; points: { distanceM: number; soft: number; armored: number }[] }[]; maxRange: number }) {
  const w = 300;
  const h = 150;
  const pad = { l: 34, r: 8, t: 8, b: 22 };
  const maxY = Math.max(0.001, ...series.flatMap((s) => s.points.flatMap((p) => [p.soft, p.armored])));
  const x = (d: number) => pad.l + (d / maxRange) * (w - pad.l - pad.r);
  const y = (v: number) => h - pad.b - (v / maxY) * (h - pad.t - pad.b);
  const path = (pts: { distanceM: number; v: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.distanceM).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const km = maxRange >= 2000;
  return (
    <svg width={w} height={h} className="chart" role="img" aria-label="距離ごとの火力">
      <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke="#bbb" />
      <line x1={pad.l} x2={pad.l} y1={pad.t} y2={h - pad.b} stroke="#bbb" />
      <text x={pad.l - 4} y={pad.t + 8} textAnchor="end" fontSize={10} fill="#777">
        {fmt(maxY, maxY < 10 ? 1 : 0)}
      </text>
      <text x={w - pad.r} y={h - 6} textAnchor="end" fontSize={10} fill="#777">
        {km ? `${fmt(maxRange / 1000)}km` : `${Math.round(maxRange)}m`}
      </text>
      <text x={pad.l} y={h - 6} fontSize={10} fill="#777">
        0
      </text>
      {series.map((s) => (
        <g key={s.label}>
          <path d={path(s.points.map((p) => ({ distanceM: p.distanceM, v: p.soft })))} fill="none" stroke={s.color} strokeWidth={2} />
          <path d={path(s.points.map((p) => ({ distanceM: p.distanceM, v: p.armored })))} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="5 3" />
        </g>
      ))}
    </svg>
  );
}

/** 比較の差(%)の表示 */
function Delta({ a, b, better = "up" }: { a: number | null; b: number | null | undefined; better?: "up" | "down" }) {
  if (a === null || b === null || b === undefined || b === 0) return null;
  const d = (a - b) / Math.abs(b);
  if (Math.abs(d) < 0.005) return <span className="muted"> ±0%</span>;
  const good = better === "up" ? d > 0 : d < 0;
  return (
    <span className={good ? "up" : "down"}>
      {" "}
      {d > 0 ? "+" : ""}
      {Math.round(d * 100)}%
    </span>
  );
}

const peak = (s: ToeSummary, k: "direct" | "indirect", armor: "soft" | "armored") => Math.max(0, ...s[k].curve.map((p) => p[armor]));

/** 比べる相手の選択肢:保存してある自分(編集の効き目を見る) */
const SAVED = "__saved__";

function ToeStats({ toe, saved, weapons, branches, rules, compareId, setCompareId, allToes }: { toe: Draft; saved: Draft | null; weapons: WeaponPack; branches: BranchPack; rules: RulePack; compareId: string; setCompareId: (id: string) => void; allToes: { file: string; id: string; toe: Toe }[] }) {
  const parsed = ToeSchema.safeParse(toe);
  const s = parsed.success ? toeSummary(parsed.data, weapons, branches, rules) : null;
  const savedParsed = saved ? ToeSchema.safeParse(saved) : null;
  const other = compareId === SAVED ? (savedParsed?.success ? { toe: savedParsed.data } : undefined) : allToes.find((x) => `${x.file}:${x.id}` === compareId);
  const o = other ? toeSummary(other.toe, weapons, branches, rules) : null;
  if (!s) return <section className="muted">誤りを直すと、導き出される値が出ます。</section>;
  const rows: [string, number | null, number | null | undefined, string, ("up" | "down")?][] = [
    ["耐久(満員)", s.hitPoints, o?.hitPoints, ""],
    ["直接射撃の最大火力(非装甲)", peak(s, "direct", "soft"), o && peak(o, "direct", "soft"), "/分"],
    ["直接射撃の最大火力(装甲)", peak(s, "direct", "armored"), o && peak(o, "direct", "armored"), "/分"],
    ["直接射撃の最大射程", s.direct.maxRangeM, o?.direct.maxRangeM, "m"],
    ["制圧のしやすさ", s.direct.suppression, o?.direct.suppression, "×"],
    ["弾薬の持ち(直接射撃)", s.direct.ammoMinutes, o?.direct.ammoMinutes, "分"],
    ["間接射撃の最大火力", peak(s, "indirect", "soft"), o && peak(o, "indirect", "soft"), "/分"],
    ["間接射撃の最大射程", s.indirect.maxRangeM, o?.indirect.maxRangeM, "m"],
    ["弾薬の持ち(間接射撃)", s.indirect.ammoMinutes, o?.indirect.ammoMinutes, "分"],
    ["対空", s.antiAir, o?.antiAir, ""],
    ["行軍速度", s.marchKmh, o?.marchKmh, "km/時"],
    ["展開したままの速度", s.deployedKmh, o?.deployedKmh, "km/時"],
    ["燃料で進める距離", s.fuelRangeKm, o?.fuelRangeKm, "km"],
  ];
  const range = Math.max(s.direct.maxRangeM, o?.direct.maxRangeM ?? 0);
  const iRange = Math.max(s.indirect.maxRangeM, o?.indirect.maxRangeM ?? 0);
  return (
    <section>
      <h3>導き出される値(満員のとき)</h3>
      <label className="field">
        比べる編成表
        <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
          <option value="">なし</option>
          {saved && <option value={SAVED}>保存してある内容(編集前)</option>}
          {allToes.map((x) => (
            <option key={`${x.file}:${x.id}`} value={`${x.file}:${x.id}`}>
              {x.toe.name}({x.id})
            </option>
          ))}
        </select>
      </label>
      <table className="stats">
        <tbody>
          {rows
            .filter(([, a, b]) => (a !== null && a !== 0) || (b !== null && b !== undefined && b !== 0))
            .map(([name, a, b, unit, better]) => (
              <tr key={name}>
                <th>{name}</th>
                <td>
                  {a === null ? "—" : fmt(a, a >= 100 ? 0 : a >= 10 ? 1 : 2)}
                  {unit && <small> {unit}</small>}
                  <Delta a={a} b={b} {...(better ? { better } : {})} />
                </td>
                {o && <td className="muted">{b === null || b === undefined ? "—" : fmt(b, b >= 100 ? 0 : b >= 10 ? 1 : 2)}</td>}
              </tr>
            ))}
        </tbody>
      </table>
      {range > 0 && (
        <>
          <h4>直接射撃:距離ごとの火力</h4>
          <FireChart
            maxRange={range}
            series={[{ label: "this", color: "#2f6db5", points: s.direct.curve }, ...(o && o.direct.maxRangeM > 0 ? [{ label: "other", color: "#aaa", points: o.direct.curve }] : [])]}
          />
        </>
      )}
      {iRange > 0 && (
        <>
          <h4>間接射撃:距離ごとの火力</h4>
          <FireChart
            maxRange={iRange}
            series={[{ label: "this", color: "#b35c00", points: s.indirect.curve }, ...(o && o.indirect.maxRangeM > 0 ? [{ label: "other", color: "#aaa", points: o.indirect.curve }] : [])]}
          />
        </>
      )}
      <p className="muted">実線=非装甲の目標、破線=装甲の目標{o ? "、灰色=比べる編成表" : ""}。火力は損害ポイント/分(戦力・補正をかける前)。</p>
    </section>
  );
}

function WeaponForm({ id, weapon, issues, usedBy, onChange, onRename }: { id: string; weapon: Draft; issues: DataIssue[]; usedBy: string[]; onChange: (fn: (w: Draft) => void) => void; onRename: (next: string) => void }) {
  const parsed = WeaponSchema.safeParse(weapon);
  const all = [...issues, ...(parsed.success ? checkWeapon(parsed.data) : [])];
  return (
    <div className="form">
      <h3>武器</h3>
      <div className="grid">
        <IdField id={id} onRename={onRename} />
        <label className="field">
          名前
          <input className={hasIssue(all, "name") ? "err" : ""} value={weapon.name ?? ""} onChange={(e) => onChange((w) => (w.name = e.target.value))} />
        </label>
        <label className="field" title="非装甲の目標への効果の倍率">
          効果(非装甲)
          <NumField value={weapon.effectiveness?.soft} step={0.05} min={0} issues={all} path="effectiveness.soft" onChange={(v) => onChange((w) => (w.effectiveness.soft = v))} />
        </label>
        <label className="field" title="装甲の目標への効果の倍率">
          効果(装甲)
          <NumField value={weapon.effectiveness?.armored} step={0.05} min={0} issues={all} path="effectiveness.armored" onChange={(v) => onChange((w) => (w.effectiveness.armored = v))} />
        </label>
        <label className="field" title="殺傷力に対する、制圧への効きの倍率(機関銃・砲兵は大きく、戦車砲は小さい)">
          制圧のしやすさ
          <NumField value={weapon.suppression ?? 1} step={0.05} min={0} issues={all} path="suppression" onChange={(v) => onChange((w) => (w.suppression = v))} />
        </label>
        <label className="field" title="撃っている間の弾薬消費(トン/分、1門・1挺あたり)">
          弾薬消費(t/分)
          <NumField value={weapon.ammoPerMin} step={0.0005} min={0} issues={all} path="ammoPerMin" onChange={(v) => onChange((w) => (w.ammoPerMin = v))} />
        </label>
        <label className="field" title="航空機に対する力(対空砲を持つ部隊のまわりで空襲すると、機を失い効果が下がる)">
          対空
          <NumField value={weapon.antiAir ?? 0} step={0.01} min={0} issues={all} path="antiAir" onChange={(v) => onChange((w) => (w.antiAir = v))} />
        </label>
        <label className="field check">
          <input type="checkbox" checked={!!weapon.indirect} onChange={(e) => onChange((w) => (w.indirect = e.target.checked))} />
          間接射撃(砲兵など。直接射撃の撃ち合いでは撃たない)
        </label>
      </div>
      <h4>射程帯(近い順。その距離まで、その火力)</h4>
      <table className="elements">
        <thead>
          <tr>
            <th>この距離まで(m)</th>
            <th>火力(損害ポイント/分)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(weapon.bands ?? []).map((b: Draft, i: number) => (
            <tr key={i}>
              <td>
                <NumField value={b.maxRangeM} step={50} min={1} issues={all} path={`bands.${i}.maxRangeM`} onChange={(v) => onChange((w) => (w.bands[i].maxRangeM = v))} />
              </td>
              <td>
                <NumField value={b.power} step={0.1} min={0} issues={all} path={`bands.${i}.power`} onChange={(v) => onChange((w) => (w.bands[i].power = v))} />
              </td>
              <td>
                <button className="x" title="この射程帯を消す" onClick={() => onChange((w) => w.bands.splice(i, 1))} disabled={(weapon.bands ?? []).length <= 1}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="small"
        onClick={() =>
          onChange((w) => {
            const last = w.bands[w.bands.length - 1];
            w.bands.push({ maxRangeM: (Number(last?.maxRangeM) || 0) + 500, power: Number(last?.power) / 2 || 0.5 });
          })
        }
      >
        + 射程帯
      </button>
      <p className="muted">使っている編成表:{usedBy.length ? usedBy.join("・") : "なし"}</p>
      <IssueList issues={all} />
    </div>
  );
}

function WeaponStats({ weapon }: { weapon: Draft }) {
  const parsed = WeaponSchema.safeParse(weapon);
  if (!parsed.success) return <section className="muted">誤りを直すと、距離ごとの火力が出ます。</section>;
  const w = parsed.data;
  const max = w.bands[w.bands.length - 1]!.maxRangeM;
  // 射程帯の切れ目で段になる線(1門・1挺あたり)
  const points = w.bands.flatMap((b, i) => {
    const from = i === 0 ? 1 : w.bands[i - 1]!.maxRangeM + 1;
    const at = (d: number) => ({ distanceM: d, soft: b.power * weaponEffectAgainst(w, 0), armored: b.power * weaponEffectAgainst(w, 1) });
    return [at(from), at(b.maxRangeM)];
  });
  return (
    <section>
      <h3>距離ごとの火力(1門・1挺あたり)</h3>
      <FireChart maxRange={max} series={[{ label: "this", color: w.indirect ? "#b35c00" : "#2f6db5", points }]} />
      <p className="muted">実線=非装甲の目標、破線=装甲の目標。編成表の火力は、これに要素の数と武器の数をかけた合計です。</p>
    </section>
  );
}
