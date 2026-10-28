import type { CatalogResponse, CatalogToe } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { CATEGORY_NAMES, CATEGORY_ORDER, EquipmentIcon } from "./EquipmentIcon.js";
import { SymbolIcon } from "./SymbolIcon.js";

/** 図鑑のデータ(GET /api/catalog)。一度だけ読んで使い回す */
let cached: Promise<CatalogResponse | null> | null = null;
export function useCatalog(): CatalogResponse | null {
  const [c, setC] = useState<CatalogResponse | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/catalog")
      .then((r) => (r.ok ? (r.json() as Promise<CatalogResponse>) : null))
      .catch(() => null);
    let live = true;
    void cached.then((x) => live && setC(x));
    return () => {
      live = false;
    };
  }, []);
  return c;
}

type Element = CatalogToe["elements"][number];

/** 要素の兵科の印(装備品・武器から見当をつける。表示だけ) */
function elementBranch(e: Element, cat: CatalogResponse): string {
  const cats = new Set((e.equipment ?? []).map((r) => cat.equipment[r.item]?.category));
  if (cats.has("tank")) return "armor";
  if (cats.has("assault_gun") || cats.has("tank_destroyer") || cats.has("at_gun")) return "tank_destroyer";
  if (cats.has("howitzer") || cats.has("heavy_artillery") || cats.has("field_gun")) return "artillery";
  if (cats.has("armored_car")) return "recon";
  if (cats.has("aa_gun")) return "anti_aircraft";
  const w = new Set(e.weapons.map((x) => x.weapon));
  if (!e.equipment) {
    if (w.has("tank_gun")) return "armor";
    if (w.has("td_gun") || (w.has("at_gun") && e.weapons.length === 1)) return "tank_destroyer";
    if (w.has("howitzer")) return "artillery";
  }
  return "infantry";
}

/** 要素の主な装備(装備品の数。抽象の要素は武器の数) */
function holdings(e: Element, cat: CatalogResponse): { id: string; name: string; full?: string; category: string; armored: boolean; count: number }[] {
  if (e.equipment)
    return e.equipment
      .map((r) => ({ id: r.item, name: cat.equipment[r.item]?.short ?? cat.equipment[r.item]?.name ?? r.item, full: cat.equipment[r.item]?.name ?? r.item, category: cat.equipment[r.item]?.category ?? "other", armored: !!cat.equipment[r.item]?.armored, count: r.count }))
      .sort((a, b) => CATEGORY_ORDER.indexOf(b.category) - CATEGORY_ORDER.indexOf(a.category));
  return e.weapons.map((w) => ({ id: w.weapon, name: cat.weapons[w.weapon]?.name ?? w.weapon, category: "other", armored: false, count: w.count }));
}

/** 編成表全体の装備品の合計(種類の順) */
export function toeTotals(toe: CatalogToe, cat: CatalogResponse) {
  const sum = new Map<string, number>();
  let personnel = 0;
  for (const e of toe.elements) {
    personnel += (e.personnel ?? 0) * e.count;
    for (const r of e.equipment ?? []) sum.set(r.item, (sum.get(r.item) ?? 0) + r.count * e.count);
  }
  const items = [...sum]
    .map(([id, count]) => ({ id, count, e: cat.equipment[id]! }))
    .filter((x) => x.e)
    .sort((a, b) => CATEGORY_ORDER.indexOf(b.e.category) - CATEGORY_ORDER.indexOf(a.e.category) || b.count - a.count);
  return { personnel, items };
}

function Chips({ list, onItem, factor = 1 }: { list: ReturnType<typeof holdings>; onItem?: ((id: string) => void) | undefined; factor?: number }) {
  return (
    <ul className="chips">
      {list.map((h) => (
        <li key={h.id} className={onItem && h.category !== "other" ? "link" : ""} onClick={() => onItem && h.category !== "other" && onItem(h.id)} title={`${h.full ?? h.name}(${CATEGORY_NAMES[h.category] ?? ""})`}>
          {h.category !== "other" && <EquipmentIcon category={h.category} armored={h.armored} size={22} />}
          <span className="nm">{h.name}</span>
          <b>{Math.round(h.count * factor)}</b>
        </li>
      ))}
    </ul>
  );
}

/** 1つの要素(中隊など)の箱 */
function ElementBox({ e, cat, per, onItem }: { e: Element; cat: CatalogResponse; per: number; onItem?: ((id: string) => void) | undefined }) {
  return (
    <div className={`org-box${e.attachedFrom ? " attached" : ""}`}>
      <div className="org-head">
        <SymbolIcon symbols={{ branches: cat.symbols.branches, toes: {} }} branch={elementBranch(e, cat)} color="#5b7a99" size={0.6} />
        <span className="org-name">
          {e.name}
          {per > 1 && <span className="times">×{per}</span>}
        </span>
      </div>
      {e.personnel !== undefined && <div className="org-men">{e.personnel}名</div>}
      <Chips list={holdings(e, cat)} onItem={onItem} />
    </div>
  );
}

/**
 * 線図の編制表(組織図)。いちばん上に部隊、その下に所属(本部・大隊・直轄)ごとの箱、その下に中隊の箱を線でつなぐ。
 * 各箱に人員と主な装備の数。装備を押すと onItem(装備品の札を開く)
 */
export function OrgChart({ toeId, cat, strength, onItem }: { toeId: string; cat: CatalogResponse; strength?: number; onItem?: (id: string) => void }) {
  const toe = cat.toes[toeId];
  if (!toe) return <p className="muted">編成表 {toeId} がありません</p>;
  const totals = toeTotals(toe, cat);
  // 所属ごとにまとめる(書かなければ「直轄」)。groupCount があれば、その数の大隊の箱を並べる
  const groups = new Map<string, { count: number; elements: Element[] }>();
  for (const e of toe.elements) {
    const g = e.group ?? (e.attachedFrom ? "配属" : "直轄");
    const cur = groups.get(g) ?? { count: e.groupCount ?? 1, elements: [] };
    cur.count = Math.max(cur.count, e.groupCount ?? 1);
    cur.elements.push(e);
    groups.set(g, cur);
  }
  const echelon = cat.symbols.toes[toeId]?.echelon;
  const subEchelon = echelon === "regiment" || echelon === "brigade" ? "battalion" : "company";
  return (
    <div className="orgchart" data-testid="orgchart">
      <div className="org-top">
        <SymbolIcon symbols={cat.symbols} branch={toe.branch} toe={toeId} color="#2f6db5" size={1.1} />
        <div>
          <div className="org-title">{toe.name}</div>
          <div className="muted">
            {cat.nations[toe.nation] ?? toe.nation}・{cat.branchNames[toe.branch] ?? toe.branch}
            {totals.personnel > 0 && `・人員 ${totals.personnel.toLocaleString()}名`}
            {strength !== undefined && strength < 0.999 && `(いまの戦力 ${Math.round(strength * 100)}% ≒ ${Math.round(totals.personnel * strength).toLocaleString()}名)`}
            {!toe.real && "・抽象の編成表(装備は武器の数)"}
          </div>
        </div>
      </div>
      {totals.items.length > 0 && (
        <div className="org-totals">
          <h4>主要装備</h4>
          <Chips list={totals.items.map((x) => ({ id: x.id, name: x.e.short ?? x.e.name, full: x.e.name, category: x.e.category, armored: x.e.armored, count: x.count }))} onItem={onItem} factor={strength ?? 1} />
        </div>
      )}
      <ul className="org-tree org-level">
        <li className="org-node">
          <span className="org-root-dot" />
          <ul className="org-level">
            {[...groups].map(([g, { count, elements }]) => (
              <li key={g} className="org-node">
                <div className="org-group">
                  <SymbolIcon symbols={{ branches: cat.symbols.branches, toes: { x: { echelon: count > 1 || g.includes("大隊") ? subEchelon : "company", modifiers: [] } } }} branch={toe.branch} toe="x" color="#2f6db5" size={0.7} />
                  <b>{g}</b>
                  {count > 1 && <span className="times">×{count}</span>}
                </div>
                <ul className="org-level">
                  {elements.map((e, i) => (
                    <li key={i} className="org-node">
                      <ElementBox e={e} cat={cat} per={Math.round(e.count / count)} onItem={onItem} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </div>
  );
}
