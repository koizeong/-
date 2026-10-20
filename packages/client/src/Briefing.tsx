import type { ScenarioDetail, ScenarioSummary } from "@brigade/protocol";
import { useEffect, useState } from "react";
import { CustomStartPanel } from "./CustomStart.js";
import type { Game } from "./game.js";
import { MapThumb } from "./MapThumb.js";
import { SIDE_COLORS } from "./MapView.js";

/** 部隊の呼び名(陣営の接頭辞を外す) */
const short = (id: string) => id.replace(/^[a-z]+-/, "");

/**
 * 部隊編成(作戦命令):出撃の前に、任務(勝利条件)・戦場の地図と自軍の初期配置・戦闘序列を見て、
 * 装備編成(差し替え・おまかせ・配属)を決めて出撃する。装備編成のできないシナリオは、そのまま出撃する
 */
export function Briefing({
  game,
  scenario: sc,
  side,
  preset,
  seed,
  onBack,
}: {
  game: Game;
  scenario: ScenarioSummary;
  side: string;
  preset: string;
  seed: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<ScenarioDetail | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const sideIndex = sc.sides.findIndex((x) => x.id === side);
  const sideName = sc.sides[sideIndex]?.name ?? side;
  const color = SIDE_COLORS[sideIndex] ?? "#333";
  const v = sc.victory[side];
  const objName = (id: string) => sc.objectives.find((o) => o.id === id)?.name ?? id;
  const how = { scenarioId: sc.id, side, ...(seed ? { seed: Number(seed) } : {}), ...(preset ? { preset } : {}) };

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ id: sc.id, side, ...(preset ? { preset } : {}) });
    fetch(`/api/scenario?${q.toString()}`)
      .then((r) => r.json() as Promise<ScenarioDetail>)
      .then((d) => live && "map" in d && setDetail(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sc.id, side, preset]);

  // 戦闘序列:上級部隊の木。どの上級部隊にも入っていない部隊は「直轄」
  const units = detail?.units ?? [];
  const formations = Object.entries(detail?.formations ?? {});
  const listed = new Set(formations.flatMap(([, f]) => f.units));
  const unitLine = (id: string) => {
    const u = units.find((x) => x.id === id);
    if (!u) return null;
    return (
      <li key={id} className={hover === id ? "hot" : ""} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
        <span className="unit-id">{short(id)}</span>
        <span className="unit-toe">{u.toeName}</span>
        {u.reinforcementTurn !== undefined && <span className="tag">増援 {u.reinforcementTurn}ターン目</span>}
        {u.airborneFromTurn !== undefined && <span className="tag">空挺降下{u.airborneFromTurn > 1 ? ` ${u.airborneFromTurn}ターン目から` : ""}</span>}
      </li>
    );
  };
  const tree = (parent: string | undefined): JSX.Element[] =>
    formations
      .filter(([, f]) => f.parent === parent)
      .map(([id, f]) => (
        <li key={id}>
          <span className="formation">{f.name}</span>
          <ul>
            {tree(id)}
            {f.units.map(unitLine)}
          </ul>
        </li>
      ));
  const loose = units.filter((u) => !listed.has(u.id));

  return (
    <div className="briefing">
      <div className="order-head">
        <div className="classified">作戦命令</div>
        <h2>{sc.name}</h2>
        <p className="muted">
          {sideName}・{sc.startDate ? `${sc.startDate} から ` : ""}
          {sc.days}日間・{sc.maxTurns}ターン{preset ? `・${sc.presets.find((p) => p.id === preset)?.name ?? preset}` : ""}
        </p>
      </div>

      <div className="briefing-grid">
        <section className="paragraph">
          <h3>一 状況</h3>
          {detail ? <MapThumb detail={detail} color={color} highlight={hover} height={320} /> : <div className="thumb-placeholder">地図を広げています…</div>}
          {sc.description && <p className="brief">{sc.description}</p>}
          <h3>二 任務</h3>
          {v ? (
            <ul className="mission">
              <li>
                <b>決定的勝利</b>:{[v.decisive.required.length ? `${v.decisive.required.map(objName).join("・")}を保持` : "", v.decisive.minWeight > 0 ? `目標の重み ${v.decisive.minWeight} 以上` : ""].filter(Boolean).join("、") || "—"}
              </li>
              <li>
                <b>限定的勝利</b>:{[v.limited.required.length ? `${v.limited.required.map(objName).join("・")}を保持` : "", v.limited.minWeight > 0 ? `目標の重み ${v.limited.minWeight} 以上` : ""].filter(Boolean).join("、") || "—"}
              </li>
              <li className="muted">終わったとき(規定のターン)に保持している目標で決まる</li>
            </ul>
          ) : (
            <p>—</p>
          )}
        </section>

        <section className="paragraph">
          <h3>三 戦闘序列</h3>
          {!detail && <p className="muted">読み込んでいます…</p>}
          <ul className="oob">
            {tree(undefined)}
            {loose.length > 0 && (
              <li>
                <span className="formation">{formations.length > 0 ? "直轄・その他" : sideName}</span>
                <ul>{loose.map((u) => unitLine(u.id))}</ul>
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="paragraph">
        <h3>四 編成と出撃</h3>
        {sc.customizableSides.includes(side) ? (
          <CustomStartPanel
            inline
            scenario={sc}
            side={side}
            allowAiAuto
            {...(preset ? { preset } : {})}
            onStart={(c, aiAuto) => {
              // 何も変えていなければ、装備編成なしで始める(記録にも残さない)
              const changed = Object.keys(c.substitutions).length > 0 || (c.attachments?.length ?? 0) > 0;
              game.start({ ...how, ...(changed ? { custom: c } : {}), ...(aiAuto ? { aiAuto } : {}) });
            }}
          />
        ) : (
          <p className="muted">このシナリオでは装備編成はできません(シナリオの編成のまま出撃します)。</p>
        )}
        <div className="row briefing-actions">
          {!sc.customizableSides.includes(side) && (
            <button className="primary" data-testid="custom-go" onClick={() => game.start(how)}>
              出撃
            </button>
          )}
          <button onClick={onBack} data-testid="briefing-back">
            作戦の選択に戻る
          </button>
        </div>
      </section>
    </div>
  );
}
