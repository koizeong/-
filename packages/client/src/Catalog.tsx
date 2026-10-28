import type { CatalogResponse } from "@brigade/protocol";
import { useState } from "react";
import { EquipmentCard } from "./EquipmentCard.js";
import { CATEGORY_NAMES, CATEGORY_ORDER, EquipmentIcon } from "./EquipmentIcon.js";
import { OrgChart, useCatalog } from "./OrgChart.js";

/** 時期の区切り(装備品の年と重なるものを出す) */
const ERAS: { id: string; name: string; from: number; to: number }[] = [
  { id: "all", name: "すべて", from: 0, to: 9999 },
  { id: "1918", name: "第一次大戦(1918)", from: 1914, to: 1918 },
  { id: "1940", name: "1939〜41年", from: 1939, to: 1941 },
  { id: "1942", name: "1942〜43年", from: 1942, to: 1943 },
  { id: "1944", name: "1944〜45年", from: 1944, to: 1945 },
  { id: "1950", name: "朝鮮戦争(1950〜53)", from: 1950, to: 1953 },
];

/** 編成表の名前の年(「独1939〜41」など)から時期を読む */
function toeYear(name: string): number | null {
  const m = /(19\d\d)/.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * 装備と編制の図鑑:国ごとに、編成表(線図)と装備品(札)を眺める。時期で絞れる
 */
export function CatalogScreen() {
  const cat = useCatalog();
  const [nation, setNation] = useState("de");
  const [mode, setMode] = useState<"toes" | "equipment">("toes");
  const [era, setEra] = useState("all");
  const [toeId, setToeId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  if (!cat) return <p className="muted">図鑑を読み込んでいます…</p>;
  const range = ERAS.find((e) => e.id === era)!;
  const inEra = (from: number, to: number) => from <= range.to && to >= range.from;
  const nations = Object.keys(cat.nations).filter((n) => Object.values(cat.toes).some((t) => t.nation === n && t.real) || Object.values(cat.equipment).some((e) => e.nation === n));
  const toes = Object.entries(cat.toes)
    .filter(([, t]) => t.nation === nation && t.real)
    .filter(([, t]) => {
      const y = toeYear(t.name);
      return era === "all" || y === null || inEra(y, y + 1);
    })
    .sort((a, b) => (toeYear(a[1].name) ?? 0) - (toeYear(b[1].name) ?? 0) || a[1].name.localeCompare(b[1].name, "ja"));
  const items = Object.entries(cat.equipment)
    .filter(([, e]) => e.nation === nation)
    .filter(([, e]) => era === "all" || !e.years || inEra(e.years.from, e.years.to ?? 1953))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a[1].category) - CATEGORY_ORDER.indexOf(b[1].category) || (a[1].years?.from ?? 0) - (b[1].years?.from ?? 0));
  const selToe = toeId && cat.toes[toeId]?.nation === nation ? toeId : (toes[0]?.[0] ?? null);
  const selItem = itemId && cat.equipment[itemId]?.nation === nation ? itemId : (items[0]?.[0] ?? null);

  return (
    <div className="catalog" data-testid="catalog">
      <div className="catalog-bar">
        <div className="tabs">
          {nations.map((n) => (
            <button key={n} className={n === nation ? "on" : ""} onClick={() => setNation(n)} data-testid={`catalog-nation-${n}`}>
              {cat.nations[n]}
            </button>
          ))}
        </div>
        <div className="tabs">
          <button className={mode === "toes" ? "on" : ""} onClick={() => setMode("toes")} data-testid="catalog-mode-toes">
            編制
          </button>
          <button className={mode === "equipment" ? "on" : ""} onClick={() => setMode("equipment")} data-testid="catalog-mode-equipment">
            装備品
          </button>
        </div>
        <label>
          時期{" "}
          <select value={era} onChange={(e) => setEra(e.target.value)} data-testid="catalog-era">
            {ERAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="catalog-body">
        <ul className="catalog-list">
          {mode === "toes"
            ? toes.map(([id, t]) => (
                <li key={id}>
                  <button className={id === selToe ? "on" : ""} onClick={() => setToeId(id)} data-testid={`catalog-toe-${id}`}>
                    {t.name}
                  </button>
                </li>
              ))
            : items.map(([id, e], i) => (
                <li key={id}>
                  {(i === 0 || items[i - 1]![1].category !== e.category) && <h5>{CATEGORY_NAMES[e.category]}</h5>}
                  <button className={id === selItem ? "on" : ""} onClick={() => setItemId(id)} data-testid={`catalog-item-${id}`}>
                    <EquipmentIcon category={e.category} armored={e.armored} size={26} /> {e.name}
                  </button>
                </li>
              ))}
          {(mode === "toes" ? toes : items).length === 0 && <li className="muted">この国・時期のものはまだありません</li>}
        </ul>
        <div className="catalog-detail">
          {mode === "toes" && selToe && (
            <OrgChart
              toeId={selToe}
              cat={cat}
              onItem={(id) => {
                setItemId(id);
                setMode("equipment");
              }}
            />
          )}
          {mode === "equipment" && selItem && (
            <EquipmentCard
              id={selItem}
              cat={cat}
              onToe={(t) => {
                setToeId(t);
                setMode("toes");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** 編成表の線図を、画面の上に重ねて開く(作戦命令の戦闘序列・試合のユニットの欄から) */
export function OrgModal({ toeId, strength, title, onClose }: { toeId: string; strength?: number; title?: string; onClose: () => void }) {
  const cat = useCatalog();
  const [item, setItem] = useState<string | null>(null);
  return (
    <div className="overlay org-modal" onClick={onClose} data-testid="org-modal">
      <div className="card paper" onClick={(e) => e.stopPropagation()}>
        <header className="row">
          <h3>{title ?? "編制"}</h3>
          <button className="x" onClick={onClose} data-testid="org-modal-close">
            閉じる
          </button>
        </header>
        {!cat ? (
          <p className="muted">読み込んでいます…</p>
        ) : item ? (
          <EquipmentCard id={item} cat={cat} onClose={() => setItem(null)} />
        ) : (
          <OrgChart toeId={toeId} cat={cat} {...(strength !== undefined ? { strength } : {})} onItem={setItem} />
        )}
      </div>
    </div>
  );
}

export type { CatalogResponse };
