import type { CatalogResponse } from "@brigade/protocol";
import { CATEGORY_NAMES, EquipmentIcon } from "./EquipmentIcon.js";

const years = (y?: { from: number; to?: number | undefined }) => (y ? `${y.from}〜${y.to ?? ""}年` : "");

/** 装甲の厚さの図(上から見た車体と砲塔に、面ごとの厚さ mm) */
function ArmorDiagram({ a }: { a: NonNullable<CatalogResponse["equipment"][string]["armorMm"]> }) {
  return (
    <svg className="armor-diagram" viewBox="0 0 120 150" width={120} height={150}>
      <rect x={30} y={20} width={60} height={110} rx={6} fill="#ece3cc" stroke="#2b2418" />
      {a.turretFront !== undefined && <circle cx={60} cy={62} r={18} fill="#d9cba6" stroke="#2b2418" />}
      {a.turretFront !== undefined && <line x1={60} y1={44} x2={60} y2={6} stroke="#2b2418" strokeWidth={3} />}
      <text x={60} y={16} textAnchor="middle" fontSize={11}>
        前 {a.front}
      </text>
      <text x={8} y={88} fontSize={11}>
        {a.side}
      </text>
      <text x={95} y={88} fontSize={11}>
        側
      </text>
      <text x={60} y={145} textAnchor="middle" fontSize={11}>
        後 {a.rear ?? a.side}
      </text>
      {a.turretFront !== undefined && (
        <text x={60} y={66} textAnchor="middle" fontSize={10}>
          {a.turretFront}/{a.turretSide ?? "?"}
        </text>
      )}
    </svg>
  );
}

/**
 * 装備品の札:種類の絵・国と年・諸元・載せている武器(射程と貫通力)・装甲の図・使っている編成表
 */
export function EquipmentCard({ id, cat, onClose, onToe }: { id: string; cat: CatalogResponse; onClose?: () => void; onToe?: (toeId: string) => void }) {
  const e = cat.equipment[id];
  if (!e) return null;
  return (
    <article className="equipment-card" data-testid="equipment-card">
      <header>
        <EquipmentIcon category={e.category} armored={e.armored} size={96} />
        <div>
          <h3>{e.name}</h3>
          <p className="muted">
            {e.nation ? `${cat.nations[e.nation] ?? e.nation}・` : ""}
            {CATEGORY_NAMES[e.category] ?? e.category}
            {e.years ? `・${years(e.years)}` : ""}
            {e.crew > 0 ? `・操作 ${e.crew}名` : ""}
          </p>
        </div>
        {onClose && (
          <button className="x" onClick={onClose}>
            閉じる
          </button>
        )}
      </header>
      {e.description && <p className="note">{e.description}</p>}
      <div className="card-body">
        <div>
          {Object.keys(e.specs).length > 0 && (
            <table className="specs">
              <tbody>
                {Object.entries(e.specs).map(([k, v]) => (
                  <tr key={k}>
                    <th>{k}</th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {e.weapons.length > 0 && (
            <>
              <h4>武装</h4>
              <ul className="weapon-list">
                {e.weapons.map((w) => {
                  const ww = cat.weapons[w.weapon];
                  const max = ww?.bands[ww.bands.length - 1]?.maxRangeM;
                  const pen = ww?.bands.filter((b) => b.penetrationMm !== undefined);
                  return (
                    <li key={w.weapon}>
                      <b>{ww?.name ?? w.weapon}</b>
                      {w.count > 1 ? ` ×${w.count}` : ""}
                      <span className="muted">
                        {max ? `・射程 ${max.toLocaleString()}m` : ""}
                        {ww?.indirect ? "(間接射撃)" : ww?.arcing ? "(曲射)" : ""}
                      </span>
                      {pen && pen.length > 0 && <div className="pen">貫通 {pen.map((b) => `${b.penetrationMm}mm/${b.maxRangeM}m`).join("・")}</div>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        {e.armorMm && (
          <div>
            <h4>装甲(実質の厚さ mm)</h4>
            <ArmorDiagram a={e.armorMm} />
          </div>
        )}
      </div>
      {e.usedBy.length > 0 && (
        <p className="muted used-by">
          使っている編成:
          {e.usedBy.map((t, i) => (
            <span key={t}>
              {i > 0 && "、"}
              {onToe ? (
                <button className="link" onClick={() => onToe(t)}>
                  {cat.toes[t]?.name ?? t}
                </button>
              ) : (
                (cat.toes[t]?.name ?? t)
              )}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}
