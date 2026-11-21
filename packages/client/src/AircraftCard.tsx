import type { CatalogResponse } from "@brigade/protocol";

/** 航空機の役割の名前と、一覧の並び */
export const AIR_ROLE_NAMES: Record<string, string> = {
  fighter: "戦闘機",
  fighterBomber: "戦闘爆撃機",
  strike: "攻撃機(爆撃・雷撃)",
  diveBomber: "急降下爆撃機",
  attack: "襲撃機",
  bomber: "爆撃機",
  scout: "索敵機",
  recon: "偵察機",
  transport: "輸送機",
};
export const AIR_ROLE_ORDER = Object.keys(AIR_ROLE_NAMES);

/** 上から見た機の影絵(役割の目安:戦闘機は小さく、爆撃機・攻撃機は翼が長く、多発機はエンジンを描く)。機種ごとの正しい形ではない */
export function AircraftSilhouette({ role, size = 96 }: { role: string; size?: number }) {
  const heavy = role === "bomber" || role === "transport";
  const span = heavy ? 88 : role === "fighter" ? 64 : 74;
  const len = heavy ? 64 : role === "fighter" ? 50 : 58;
  const cx = 50;
  const top = 50 - len / 2;
  return (
    <svg className="aircraft-silhouette" viewBox="0 0 100 100" width={size} height={size} aria-label={`${AIR_ROLE_NAMES[role] ?? role}の影絵`}>
      <ellipse cx={cx} cy={50} rx={heavy ? 5 : 4} ry={len / 2} fill="#4a3f2e" />
      <path d={`M${cx - span / 2} ${top + len * 0.42} L${cx + span / 2} ${top + len * 0.42} L${cx + span / 2 - 4} ${top + len * 0.55} L${cx - span / 2 + 4} ${top + len * 0.55} Z`} fill="#5b513f" />
      <path d={`M${cx - span / 6} ${top + len - 6} L${cx + span / 6} ${top + len - 6} L${cx + span / 7} ${top + len - 1} L${cx - span / 7} ${top + len - 1} Z`} fill="#5b513f" />
      {heavy &&
        [-0.32, -0.16, 0.16, 0.32].map((k) => <rect key={k} x={cx + span * k - 2.5} y={top + len * 0.34} width={5} height={10} rx={1.5} fill="#2f281d" />)}
    </svg>
  );
}

/**
 * 航空機の札:影絵・国と年・役割・巡航の速さ・行動半径・見張りの距離・1機の耐久・武装(爆弾・魚雷の重さ、抜ける甲板の厚さ、射程)・この機種の航空隊の機数
 */
export function AircraftCard({ id, cat }: { id: string; cat: CatalogResponse }) {
  const a = cat.aircraft?.[id];
  if (!a) return null;
  const specs: [string, string][] = [
    ["役割", AIR_ROLE_NAMES[a.role] ?? a.role],
    ["巡航の速さ", `${a.speedKmh.toLocaleString()}km/時`],
    ["行動半径", `${a.radiusKm.toLocaleString()}km`],
    ...(a.visionKm ? ([["見張りの距離", `${a.visionKm}km`]] as [string, string][]) : []),
    ["1機の耐久", `${a.hitPoints}`],
    ["航空隊の機数", a.groups.map((g) => `${g.aircraft}機`).join("・")],
  ];
  return (
    <article className="equipment-card aircraft-card" data-testid="aircraft-card">
      <header>
        <AircraftSilhouette role={a.role} size={96} />
        <div>
          <h3>{a.name}</h3>
          <p className="muted">
            {cat.nations[a.nation] ?? a.nation}
            {a.year ? `・${a.year}年のデータ` : ""}
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
          <h4>1機の武装</h4>
          <ul className="weapon-list">
            {a.weapons.map((wid) => {
              const w = cat.weapons[wid];
              const o = w?.airOrdnance;
              const max = w?.bands[w.bands.length - 1]?.maxRangeM;
              return (
                <li key={wid}>
                  <b>{w?.name ?? wid}</b>
                  <span className="muted">
                    {o
                      ? `・${o.kind === "torpedo" ? "魚雷(炸薬)" : "爆弾"} ${o.kg}kg${o.deckPenetrationMm ? `・甲板を ${o.deckPenetrationMm}mm 抜ける` : ""}${o.accuracy !== 1 ? `・命中の倍率 ×${o.accuracy}` : ""}`
                      : max
                        ? `・射程 ${max.toLocaleString()}m`
                        : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {a.loadouts && (
            <>
              <h4>選べる兵装(積み替え)</h4>
              <ul className="weapon-list" data-testid="aircraft-loadouts">
                {a.loadouts.map((l, i) => (
                  <li key={l.name}>
                    <b>{l.name}</b>
                    <span className="muted">
                      ・{l.weapons.map((w) => cat.weapons[w]?.name ?? w).join("・")}
                      {i === 0 ? "・はじめの兵装" : ""}・積み替え {l.minutes}分
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted">母艦・飛行場で待機・積み直し中の隊を、隊まるごと積み替えられます。積み替えの間は出られず、空母は爆弾が当たると誘爆しやすくなります。</p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
