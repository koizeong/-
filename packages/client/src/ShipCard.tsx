import type { CatalogResponse } from "@brigade/protocol";

/** 艦種の名前と、一覧の並び */
export const SHIP_TYPE_NAMES: Record<string, string> = {
  carrier: "空母",
  light_carrier: "軽空母",
  battleship: "戦艦",
  battlecruiser: "巡洋戦艦",
  heavy_cruiser: "重巡洋艦",
  light_cruiser: "軽巡洋艦",
  destroyer: "駆逐艦",
  escort: "護衛艦",
  auxiliary: "補助艦艇",
};
export const SHIP_TYPE_ORDER = Object.keys(SHIP_TYPE_NAMES);
const ABBR: Record<string, string> = { carrier: "CV", light_carrier: "CVL", battleship: "BB", battlecruiser: "BC", heavy_cruiser: "CA", light_cruiser: "CL", destroyer: "DD", escort: "DE", auxiliary: "AUX" };
export const shipAbbr = (s: { type: string; abbr?: string }) => s.abbr ?? ABBR[s.type] ?? "";

/**
 * 艦の横からの影絵(艦種ごとの船体の長さ・高さと、主砲の基数の砲塔)。図鑑の札と一覧に使う。寸法は艦種の目安で、艦級ごとの正しい形ではない
 */
export function ShipSilhouette({ ship, cat, width = 240 }: { ship: CatalogResponse["ships"][string]; cat: CatalogResponse; width?: number }) {
  const big = ["battleship", "battlecruiser", "carrier"].includes(ship.type);
  const len = big ? 220 : ship.type.includes("cruiser") || ship.type === "light_carrier" ? 190 : 150;
  const x0 = (240 - len) / 2;
  const deck = 34;
  const flat = ship.type === "carrier" || ship.type === "light_carrier";
  // 主砲:砲戦の武器で、いちばん重い弾の群れ。基数は mounts か、2門ずつ
  const main = ship.batteries
    .filter((b) => cat.weapons[b.weapon]?.naval)
    .sort((a, b) => (cat.weapons[b.weapon]!.naval!.shellKg ?? 0) - (cat.weapons[a.weapon]!.naval!.shellKg ?? 0))[0];
  const mounts = main ? (main.mounts ?? Math.max(1, Math.ceil(main.guns / 2))) : 0;
  const fore = Math.ceil(mounts / 2);
  const aft = mounts - fore;
  const turret = (x: number, k: number) => (
    <g key={`t${k}`}>
      <rect x={x - 7} y={deck - 7} width={14} height={7} rx={2} fill="#4a3f2e" />
      <line x1={x + (k < fore ? 5 : -5)} y1={deck - 4} x2={x + (k < fore ? 17 : -17)} y2={deck - 5} stroke="#4a3f2e" strokeWidth={2} />
    </g>
  );
  return (
    <svg className="ship-silhouette" viewBox="0 0 240 60" width={width} height={(width * 60) / 240} aria-label={`${SHIP_TYPE_NAMES[ship.type] ?? ship.type}の影絵`}>
      <line x1={0} y1={46} x2={240} y2={46} stroke="#8fa9b8" strokeWidth={1} />
      <path d={`M${x0} ${deck} L${x0 + len} ${deck} L${x0 + len - 10} 48 L${x0 + 12} 48 Z`} fill="#6e6250" />
      {flat ? (
        <>
          <rect x={x0 - 4} y={deck - 8} width={len + 8} height={6} fill="#5b513f" />
          <rect x={x0 + len * 0.62} y={deck - 20} width={14} height={12} fill="#4a3f2e" />
        </>
      ) : (
        <>
          <rect x={x0 + len * 0.38} y={deck - (big ? 22 : 16)} width={len * 0.16} height={big ? 22 : 16} fill="#5b513f" />
          <rect x={x0 + len * 0.5} y={deck - (big ? 30 : 22)} width={6} height={big ? 10 : 8} fill="#4a3f2e" />
          {Array.from({ length: fore }, (_, k) => turret(x0 + len * 0.82 - k * 18, k))}
          {Array.from({ length: aft }, (_, k) => turret(x0 + len * 0.16 + k * 18, fore + k))}
        </>
      )}
    </svg>
  );
}

/**
 * 艦艇の札:影絵・国と年・艦種・諸元(排水量・速力・装甲・電探・夜の見張り・探照灯・水偵)・兵装(艦首・片舷・艦尾へ向けられる数、射程・貫通力・魚雷の雷速)
 */
export function ShipCard({ id, cat }: { id: string; cat: CatalogResponse }) {
  const s = cat.ships[id];
  if (!s) return null;
  const km = (m: number) => `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}km`;
  const specs: [string, string][] = [
    ["艦種", `${SHIP_TYPE_NAMES[s.type] ?? s.type}(${shipAbbr(s)})`],
    ...(s.displacementT ? ([["排水量", `${s.displacementT.toLocaleString()}トン`]] as [string, string][]) : []),
    ["最大速力", `${s.speedKn}ノット`],
    ["装甲", `舷側 ${s.beltMm}mm・甲板 ${s.deckMm}mm・砲塔 ${s.turretMm}mm`],
    ...(s.radarRangeM ? ([["見張りの電探", `探知 ${km(s.radarRangeM)}`]] as [string, string][]) : []),
    ...(s.fireControlRadarM ? ([["射撃用の電探", `${km(s.fireControlRadarM)}まで`]] as [string, string][]) : []),
    ...(s.nightLookout !== 1 ? ([["夜の見張り", `見つける距離 ×${s.nightLookout}`]] as [string, string][]) : []),
    ...(s.searchlightM ? ([["探照灯", `${km(s.searchlightM)}まで照らす`]] as [string, string][]) : []),
    ...(s.floatplanes ? ([["水上偵察機", `${s.floatplanes.name.replace(/[(（]\d+機[)）]$/, "")}${s.floatplanes.aircraft ? `(${s.floatplanes.aircraft}機)` : ""}`]] as [string, string][]) : []),
    ...(s.carrier ? ([["航空隊", "載せて発着艦できる"]] as [string, string][]) : []),
    ...(s.torpedoReloads ? ([["魚雷の次発装填", `${s.torpedoReloads}斉射分`]] as [string, string][]) : []),
  ];
  return (
    <article className="equipment-card ship-card" data-testid="ship-card">
      <header>
        <ShipSilhouette ship={s} cat={cat} width={200} />
        <div>
          <h3>{s.name}</h3>
          <p className="muted">
            {cat.nations[s.nation] ?? s.nation}
            {s.year ? `・${s.year}年のデータ` : ""}
          </p>
        </div>
      </header>
      <div className="card-body">
        <table className="specs">
          <tbody>
            {specs.map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <h4>兵装</h4>
          <table className="ledger ship-batteries">
            <thead>
              <tr>
                <th>武器</th>
                <th>門数</th>
                <th>艦首</th>
                <th>片舷</th>
                <th>艦尾</th>
                <th>性能</th>
              </tr>
            </thead>
            <tbody>
              {s.batteries.map((b) => {
                const w = cat.weapons[b.weapon];
                const max = w?.bands[w.bands.length - 1]?.maxRangeM;
                const pen = w?.naval?.beltPenetration;
                return (
                  <tr key={b.weapon}>
                    <td>{w?.name ?? b.weapon}</td>
                    <td className="num">
                      {b.guns}
                      {b.mounts ? `(${b.mounts}基)` : ""}
                    </td>
                    <td className="num">{b.bow}</td>
                    <td className="num">{b.beam}</td>
                    <td className="num">{b.stern}</td>
                    <td className="muted">
                      {w?.torpedoRun
                        ? `魚雷・射程 ${km(w.torpedoRun.rangeM)}・${w.torpedoRun.speedKn}ノット・炸薬 ${w.torpedoRun.warheadKg}kg`
                        : `${max ? `射程 ${km(max)}` : ""}${w?.naval ? `・弾 ${w.naval.shellKg}kg・毎分${w.naval.rofPerMin}発` : ""}${pen && pen.length ? `・舷側貫通 ${pen.map((p) => `${p.mm}mm/${km(p.rangeM)}`).join("・")}` : ""}`}
                      {b.apPerGun !== undefined ? `・1門 徹甲${b.apPerGun}発` : ""}
                      {b.hePerGun !== undefined ? `・榴弾${b.hePerGun}発` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted">艦首・片舷・艦尾は、その向きの敵に向けられる門数(発射管は本数)。</p>
        </div>
      </div>
    </article>
  );
}
