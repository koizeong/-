import type { OwnUnitView, SeaBand, SeaOrder, SeaSpeed } from "@brigade/sim-core";
import { squadronIdOf, type Game } from "./game.js";
import { unitLabel as label } from "./names.js";

/**
 * 海戦の戦隊の命令(docs/naval-design.md の2)。艦を選ぶと、その艦の戦隊に命令する。
 * 海を押すとそこへ向かい、敵の印を押すと交戦の目標になる(距離の帯は下のボタン)
 */
const SPEEDS: { id: SeaSpeed; name: string }[] = [
  { id: "stop", name: "停止" },
  { id: "slow", name: "微速" },
  { id: "cruise", name: "巡航" },
  { id: "battle", name: "戦闘" },
  { id: "flank", name: "全速" },
];
const BANDS: { id: "close" | "hold" | "open"; name: string; title: string }[] = [
  { id: "close", name: "詰める", title: "主砲の射程の15〜30%まで詰める(軽い砲・夜戦・雷撃向き)" },
  { id: "hold", name: "保つ", title: "主砲の射程の40〜55%を保つ" },
  { id: "open", name: "開く", title: "主砲の射程の65〜80%まで離れる(重い砲で遠くから撃つ)" },
];
const COURSES = [0, 45, 90, 135, 180, 225, 270, 315];
const COURSE_NAME: Record<number, string> = { 0: "北", 45: "北東", 90: "東", 135: "南東", 180: "南", 225: "南西", 270: "西", 315: "北西" };
const STOP_REASON: Record<string, string> = {
  newContact: "新しい敵の艦を見つけた",
  torpedoSighted: "雷跡が見えた",
  heavyHit: "艦が大きな損害を受けた",
  shipLost: "艦が沈んだ",
  airAttack: "航空攻撃が始まった",
};

export function stopReasonText(reason: string | undefined): string | null {
  return reason ? (STOP_REASON[reason] ?? reason) : null;
}

export function SquadronControls({ game, u }: { game: Game; u: OwnUnitView }) {
  const { s } = game;
  const view = s.view!;
  const fleet = s.info!.fleet!;
  const id = squadronIdOf(u.id, view);
  if (!id) return null;
  const sq = view.squadrons![id]!;
  const draft: Partial<SeaOrder> = s.seaOrders[id] ?? {};
  const set = (patch: { [K in keyof SeaOrder]?: SeaOrder[K] | undefined }) => game.setSeaOrder(id, patch);
  const speed = draft.speed ?? sq.speed;
  const turn = draft.turn ?? sq.turnMode;
  const formation = draft.formation ?? sq.formationChange?.to ?? sq.formation;
  const engage = draft.engage === null ? undefined : (draft.engage ?? sq.engage);
  const band = engage && typeof engage.band === "string" ? engage.band : undefined;
  const fire = draft.fire ?? sq.fire;
  const torpedoes = draft.torpedoes ?? sq.torpedoes;
  const smoke = draft.smoke ?? sq.smoke;
  const evade = draft.evade ?? sq.evade;
  const course = draft.course ?? (draft.toward || sq.toward ? undefined : sq.course);
  const ships = sq.ships.map((x) => view.own.find((o) => o.id === x)).filter((x): x is OwnUnitView => !!x && x.strength > 0);
  const targetName = (cid: string) => view.contacts.find((c) => c.contactId === cid)?.shipType ?? "敵の艦";
  const parent = sq.parent;
  const hasTubes = ships.some((x) => fleet.shipToes[x.toe]?.torpedoes);
  return (
    <div className="controls" data-testid="squadron-controls">
      <p className="muted">
        戦隊:{ships.length}隻{sq.inLine ? "・単縦陣で先頭の航跡をたどる" : "・梯陣(一斉回頭の後)"}
        {draft.toward || sq.toward ? "・向かう点へ" : course !== undefined ? `・針路 ${Math.round(course)}°` : ""}
      </p>
      <div className="row">
        針路:
        {COURSES.map((c) => (
          <button key={c} className={course !== undefined && Math.round(course) === c ? "on" : ""} data-testid={`sea-course-${c}`} onClick={() => set({ course: c, toward: undefined, follow: undefined })}>
            {COURSE_NAME[c]}
          </button>
        ))}
      </div>
      <div className="row">
        回頭:
        <button className={turn === "succession" ? "on" : ""} data-testid="sea-turn-succession" title="先頭の回頭点で順に曲がる(単縦陣のまま)" onClick={() => set({ turn: "succession" })}>
          逐次
        </button>
        <button className={turn === "together" ? "on" : ""} data-testid="sea-turn-together" title="全艦が同時に曲がる(列は斜めの梯陣になる)" onClick={() => set({ turn: "together" })}>
          一斉
        </button>
      </div>
      <div className="row">
        速力:
        {SPEEDS.map((x) => (
          <button key={x.id} className={speed === x.id ? "on" : ""} data-testid={`sea-speed-${x.id}`} onClick={() => set({ speed: x.id })}>
            {x.name}
          </button>
        ))}
      </div>
      <div className="row">
        陣形:
        {fleet.formations.map((f) => (
          <button key={f.id} className={formation === f.id ? "on" : ""} data-testid={`naval-${f.id}`} onClick={() => set({ formation: f.id })}>
            {f.name}
          </button>
        ))}
      </div>
      {sq.formationChange && <p className="muted">陣形を変えている途中(あと {Math.ceil(sq.formationChange.leftSec / 60)} 分)。</p>}
      <div className="row">
        交戦:{engage ? `${targetName(engage.target)}と` : "なし(敵の印を押す)"}
        {engage &&
          BANDS.map((b) => (
            <button key={b.id} className={band === b.id ? "on" : ""} title={b.title} data-testid={`sea-band-${b.id}`} onClick={() => set({ engage: { target: engage.target, band: b.id as SeaBand } })}>
              {b.name}
            </button>
          ))}
        {engage && (
          <button className="link" onClick={() => set({ engage: null })}>
            やめる
          </button>
        )}
      </div>
      <div className="row">
        撃ち方:
        <button className={fire === "free" ? "on" : ""} onClick={() => set({ fire: "free" })}>
          撃て
        </button>
        <button className={fire === "hold" ? "on" : ""} title="撃ってきて位置の分かった艦にだけ撃ち返す(発砲の光で居場所を明かさない)" onClick={() => set({ fire: "hold" })}>
          待て
        </button>
      </div>
      {hasTubes && (
        <div className="row">
          雷撃:
          <button className={torpedoes === "free" ? "on" : ""} onClick={() => set({ torpedoes: "free" })}>
            自由
          </button>
          <button className={torpedoes === "hold" ? "on" : ""} onClick={() => set({ torpedoes: "hold" })}>
            待て
          </button>
          <button className={torpedoes === "turnAway" ? "on" : ""} data-testid="sea-torpedo-turnaway" title="魚雷の射程の半分から撃ち、撃ったら一斉回頭で敵から離れる" onClick={() => set({ torpedoes: "turnAway" })}>
            撃ったら反転
          </button>
        </div>
      )}
      <div className="row">
        <button className={smoke ? "on" : ""} title="煙幕を張る(後ろに雲が残り、雲の向こうは目で見えない)" onClick={() => set({ smoke: !smoke })}>
          煙幕
        </button>
        <button className={evade ? "on" : ""} title="之字運動(敵の射撃の解を乱すが、自分の射撃の解も乱れ、少し遅くなる)" onClick={() => set({ evade: !evade })}>
          回避運動
        </button>
      </div>
      <p className="muted">海を押すとそこへ向かい、敵の印を押すと交戦の目標になります。帯の中では、敵を舷側に置くように自動で操艦します。</p>
      {ships.length > 1 && (
        <div className="row">
          切り離す:
          {ships.slice(1).map((x) => (
            <button key={x.id} data-testid={`sea-detach-${x.id}`} className={draft.detach?.includes(x.id) ? "on" : ""} onClick={() => set({ detach: draft.detach?.includes(x.id) ? draft.detach.filter((d) => d !== x.id) : [...(draft.detach ?? []), x.id] })}>
              {label(x.id)}
            </button>
          ))}
        </div>
      )}
      {parent && view.squadrons?.[parent] && (
        <button data-testid="sea-rejoin" onClick={() => game.setSeaOrder(parent, { rejoin: [...(s.seaOrders[parent]?.rejoin ?? []), id] })}>
          元の戦隊に戻す
        </button>
      )}
    </div>
  );
}
