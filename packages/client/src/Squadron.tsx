import { onRoute, routeTarget } from "./escape.js";
import type { OwnUnitView, SeaBand, SeaOrder, SeaReaction, SeaSpeed } from "@brigade/sim-core";
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
  { id: "hold", name: "保つ", title: "主砲の射程の55〜75%を保つ(昼の巡洋艦戦の距離)" },
  { id: "open", name: "開く", title: "主砲の射程の80〜95%まで離れる(重い砲で遠くから撃つ)" },
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

/** 戦隊の反応の選びかた(条件付きの命令。発動すると消え、ターンは止まらない) */
const REACTIONS: { id: string; name: string; make: (km: number) => SeaReaction | null }[] = [
  { id: "none", name: "なし", make: () => null },
  { id: "engage", name: "敵の艦が見えたら交戦(保つ)", make: (km) => ({ when: { type: "enemyShipSeen", withinM: km * 1000 }, then: "engage", band: "hold" }) },
  { id: "engageClose", name: "敵の艦が見えたら交戦(詰める)", make: (km) => ({ when: { type: "enemyShipSeen", withinM: km * 1000 }, then: "engage", band: "close" }) },
  { id: "torpedo", name: "敵の艦が見えたら詰めて雷撃して反転", make: (km) => ({ when: { type: "enemyShipSeen", withinM: km * 1000 }, then: "torpedoAttack" }) },
  { id: "withdraw", name: "敵の艦が見えたら退避(全速で離れる)", make: (km) => ({ when: { type: "enemyShipSeen", withinM: km * 1000 }, then: "withdraw" }) },
  { id: "damaged", name: "浮力5割を下回る艦が出たら退避", make: () => ({ when: { type: "shipDamaged", below: 0.5 }, then: "withdraw" }) },
];

function reactionKey(r: SeaReaction | undefined | null): string {
  if (!r) return "none";
  if (r.when.type === "shipDamaged") return "damaged";
  if (r.then === "withdraw") return "withdraw";
  if (r.then === "torpedoAttack") return "torpedo";
  return r.band === "close" ? "engageClose" : "engage";
}

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
        <button className={fire === "band" ? "on" : ""} title="交戦の距離の帯に入るまで撃たない(撃ってきて位置の分かった艦には撃ち返す)。夜の奇襲向き" onClick={() => set({ fire: "band" })}>
          帯に入ってから
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
      {(() => {
        const cur = draft.reaction === null ? null : (draft.reaction ?? sq.reaction ?? null);
        const km = cur && cur.when.type === "enemyShipSeen" ? Math.round(cur.when.withinM / 1000) : 20;
        const key = reactionKey(cur);
        return (
          <div className="row" title="ターンの途中で条件を満たすと、その場で命令を変えます(1つだけ。発動すると消える)">
            反応:
            <select value={key} data-testid="sea-reaction" onChange={(e) => set({ reaction: REACTIONS.find((x) => x.id === e.target.value)!.make(km) })}>
              {REACTIONS.filter((x) => hasTubes || x.id !== "torpedo").map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {cur && cur.when.type === "enemyShipSeen" && (
              <label>
                <input type="number" min={2} max={60} value={km} style={{ width: "4em" }} data-testid="sea-reaction-km" onChange={(e) => set({ reaction: REACTIONS.find((x) => x.id === key)!.make(Math.max(2, Number(e.target.value) || 20)) })} />
                km の内
              </label>
            )}
          </div>
        );
      })()}
      <p className="muted">海を押すとそこへ向かい、敵の印を押すと交戦の目標になります。帯の中では、敵を舷側に置くように自動で操艦します。ターンは止まらないので、敵が現れたときの動きは「反応」で決めておきます。</p>
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
      {sq.retiring && (
        <div className="note" data-testid="sea-retiring">
          退避中:落伍艦の心得で、命令しなくても脱出路(なければ敵から離れる向き)へ全速で退き、着けば戦場を去ります(負けにはなりません)。
          <button
            data-testid="sea-take-command"
            title="この艦(戦隊)を手で指揮する戦隊に戻します。以後は退避群から外れ、命令どおりに動きます"
            onClick={() => set({ speed })}
          >
            手で指揮する
          </button>
        </div>
      )}
      {!sq.retiring && ships.some((x) => fleet.shipToes[x.toe]?.type === "destroyer") && ships.some((x) => ["battleship", "battlecruiser", "heavy_cruiser", "light_cruiser", "carrier", "light_carrier"].includes(fleet.shipToes[x.toe]?.type ?? "")) && (
        <label className="row" title="戦艦・巡洋艦・空母が落伍したら、この戦隊の駆逐艦を1隻付けて一緒に退かせます(戦列は細ります)">
          <input type="checkbox" data-testid="sea-escort-cripples" checked={draft.escortCripples ?? sq.escortCripples ?? false} onChange={(e) => set({ escortCripples: e.target.checked })} />
          落伍した主力艦に駆逐艦を付ける
        </label>
      )}
      {(() => {
        // 自沈:大破したか動けない艦(残りの戦力は敵の戦果に数えない)
        const below = fleet.scuttleBelow ?? 0.25;
        const wrecks = ships.filter((x) => x.strength < below);
        if (wrecks.length === 0) return null;
        const chosen = draft.scuttle ?? [];
        return (
          <div className="row">
            自沈:
            {wrecks.map((x) => (
              <button
                key={x.id}
                data-testid={`sea-scuttle-${x.id}`}
                className={chosen.includes(x.id) ? "on" : ""}
                title="ターンの終わりに味方の手で沈めます。残っていた戦力は敵の戦果(損耗)に数えません"
                onClick={() => set({ scuttle: chosen.includes(x.id) ? chosen.filter((d) => d !== x.id) : [...chosen, x.id] })}
              >
                {label(x.id)}
              </button>
            ))}
          </div>
        );
      })()}
      {(() => {
        // 脱出路(自陣営の後ろの地図の端):全速で向かう・端に着いた艦(と載っている航空隊)を撤退させる。撤退した陣営は負けになる
        const info = s.info!;
        const open = info.escape.routes.filter((e) => view.turn >= e.fromTurn);
        const lead = ships[0];
        if (open.length === 0 || !lead) return null;
        const route = open[0]!;
        const clear = (x: OwnUnitView) => !view.contacts.some((c) => !c.destroyed && c.currentLevel > 0 && Math.hypot(c.pos.x - x.pos.x, c.pos.y - x.pos.y) <= info.escape.enemyClearM);
        const ready = ships.filter((x) => onRoute(route, x.pos, info) && clear(x) && !s.hq.some((c) => c.type === "retreat" && c.unitId === x.id));
        const retreatAll = () => {
          for (const x of ready) {
            game.addHq({ side: info.mySide, type: "retreat", unitId: x.id });
            for (const g of view.own) if (g.air?.baseId === x.id && (g.air.status === "ready" || g.air.status === "rearming") && g.strength > 0) game.addHq({ side: info.mySide, type: "retreat", unitId: g.id });
          }
        };
        return (
          <div className="row">
            脱出:
            <button data-testid="sea-escape-go" title="全速で脱出路(自陣営の後ろの地図の端)へ向かう(撃ち合いはやめる)" onClick={() => set({ toward: routeTarget(route, lead.pos, info), course: undefined, follow: undefined, speed: "flank", engage: null })}>
              脱出路へ
            </button>
            <button
              data-testid="sea-retreat"
              disabled={ready.length === 0}
              title={`脱出路(端から ${((route.depthM ?? info.escape.radiusM) / 1000).toFixed(0)}km)の上にいて、${(info.escape.enemyClearM / 1000).toFixed(1)}km 以内に敵のいない艦は、このターンの終わりに戦場を去ります(載っている航空隊も一緒に)。1隻でも撤退すると、この海戦は相手の決定的勝利になります。`}
              onClick={retreatAll}
            >
              撤退({ready.length}隻)
            </button>
          </div>
        );
      })()}
      {parent && view.squadrons?.[parent] && (
        <button data-testid="sea-rejoin" onClick={() => game.setSeaOrder(parent, { rejoin: [...(s.seaOrders[parent]?.rejoin ?? []), id] })}>
          元の戦隊に戻す
        </button>
      )}
    </div>
  );
}
