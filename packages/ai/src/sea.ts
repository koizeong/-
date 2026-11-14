import { distance, type SeaBand, type SeaOrder, type SideView, type SimContext, type SquadronState, type Vec2 } from "@brigade/sim-core";
import { CARRIER_STANDOFF_M, mainApLeft, navigable, RETIRE_BELOW, retreatPoint, searchPoint, SHIP_WEIGHT, torpedoesSpent, UNKNOWN_SHIP_WEIGHT } from "./naval.js";

/**
 * 海戦の戦隊の AI(docs/naval-design.md の7)。戦隊の命令(SeaOrder)を出す。
 * - 戦隊の役割を艦種から決める:空母の部隊・主力(戦艦・重巡)・水雷戦隊(駆逐艦だけ)・護衛(空母の近くの水上の戦隊)
 * - 敵が見えれば、交戦の距離の帯をエンジンに任せる(帯の中で目標を舷側に置く操艦は、ターンの途中もエンジンが続ける)
 * - 主砲が敵より重ければ遠くで(保つ)、軽ければ近くで(詰める)。夜は詰める。水雷戦隊は夜に雷撃の距離へ詰め、撃ったら反転する
 * - 退く:傷ついた・見積もりで負けている・艦を失った・弾と魚雷を使い果たした・引き揚げの刻限。退くときは煙幕を張って全速で離れる
 * - 決めた方針は、条件がはっきり変わるまで続ける(同じ命令を出し直さない。交戦の目標が見えている間は替えない)
 */

type Own = SideView["own"][number];
type Contact = SideView["contacts"][number];

/** 艦種ごとの主砲の弾の重さの目安(kg。敵の主砲の見積もり) */
const TYPICAL_SHELL_KG: Record<string, number> = { battleship: 800, battlecruiser: 600, heavy_cruiser: 120, light_cruiser: 50, destroyer: 25, escort: 15, carrier: 25, light_carrier: 15, auxiliary: 10 };
/** 主砲の重さがこの倍率を超えて勝っていれば、遠くで撃ち合う */
const OUTRANGE_RATIO = 1.5;
/** 敵の艦の群れとみなす広さ(m) */
const GROUP_M = 15000;
/** 見積もりで負けていれば退く(守る側は踏みとどまる割合) */
const OUTGUNNED = 1.0;
const OUTGUNNED_DEFENDING = 0.4;
/** 退く戦隊が、敵からさらに離れる距離(m) */
const RETIRE_STEP_M = 20000;
/** 空母の護衛が、空母を離れて敵を叩きに行く距離の上限(m)と、空母から離れすぎたとみなす距離(m) */
const ESCORT_ENGAGE_M = 50000;
const ESCORT_STATION_M = 10000;
/** 主砲の徹甲弾がこれより少なく、魚雷も撃ち尽くした戦隊は引き揚げる */
const SHELLS_RETIRE_BELOW = 0.25;
/** 敵がこの距離(m)の内に知られていれば戦闘の速力、遠ければ巡航 */
const BATTLE_SPEED_M = 40000;
/** 見失った敵の艦を探しに行く距離の上限(m)と、あきらめる距離(m) */
const HUNT_RANGE_M = 40000;
const HUNT_GIVE_UP_M = 3000;
/** 守る目標からこの距離(m)の内なら、敵が見えるまで持ち場で待つ */
const GUARD_RADIUS_M = 30000;
/** 向かう点を出し直すのは、今の向かう点からこれより離れたときだけ(m) */
const REAIM_M = 3000;
/** 見失った敵の艦を、知っているとみなす古さ(秒) */
const RECENT_S = 5400;

function members(sq: SquadronState, view: SideView): Own[] {
  return sq.ships.flatMap((id) => {
    const u = view.own.find((x) => x.id === id && x.strength > 0);
    return u ? [u] : [];
  });
}

function shipType(u: Own, ctx: SimContext): string {
  return ctx.toes.toes[u.toe]?.ship?.type ?? "";
}

function heaviestShell(ms: readonly Own[], ctx: SimContext): number {
  let kg = 0;
  for (const u of ms) for (const b of ctx.toes.toes[u.toe]?.ship?.batteries ?? []) {
    const w = ctx.weapons.weapons[b.weapon];
    if (w?.naval && !w.torpedo) kg = Math.max(kg, w.naval.shellKg);
  }
  return kg;
}

function torpedoReach(ms: readonly Own[], ctx: SimContext): number {
  let r = 0;
  for (const u of ms) for (const b of ctx.toes.toes[u.toe]?.ship?.batteries ?? []) r = Math.max(r, ctx.weapons.weapons[b.weapon]?.torpedoRun?.rangeM ?? 0);
  return r;
}

function centroid(ms: readonly Own[]): Vec2 {
  return { x: ms.reduce((t, u) => t + u.pos.x, 0) / ms.length, y: ms.reduce((t, u) => t + u.pos.y, 0) / ms.length };
}

/** 陣営の戦隊の命令(変えるところだけ) */
export function squadronOrders(view: SideView, ctx: SimContext): SeaOrder[] {
  const out: SeaOrder[] = [];
  const squadrons = view.squadrons ?? {};
  const night = view.phase === "night" || !!view.dark;
  const enemyShips = view.contacts.filter((c) => c.branch === "naval" && c.currentLevel > 0 && !c.destroyed);
  const recent = view.contacts.filter((c) => c.branch === "naval" && !c.destroyed && (c.currentLevel > 0 || view.time - c.lastSeenTime <= RECENT_S));
  const carriers = Object.entries(squadrons).filter(([, sq]) => members(sq, view).some((u) => ctx.toes.toes[u.toe]?.carrier));
  const withdraw = ctx.scenario.withdrawBy.find((w) => w.side === view.side && view.turn >= w.fromTurn);
  const urgency = ctx.scenario.victory[view.side]?.urgency ?? 0;
  const urgent = urgency > 0 && ctx.scenario.maxTurns - view.turn + 1 <= urgency * ctx.scenario.maxTurns;

  for (const [id, sq] of Object.entries(squadrons).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    // 退避群(落伍艦)は心得で自動で退くので命令しない(命令すると手で指揮する戦隊に戻ってしまう)
    if (sq.retiring) continue;
    const ms = members(sq, view);
    const lead = ms[0];
    if (!lead || (lead.unready && !lead.unready.alarmed)) continue;
    const o: SeaOrder = { squadron: id };
    const set = <K extends keyof SeaOrder>(k: K, v: SeaOrder[K]) => {
      o[k] = v;
    };
    const at = centroid(ms);
    const isCarrier = ms.some((u) => ctx.toes.toes[u.toe]?.carrier);
    const ddOnly = ms.every((u) => shipType(u, ctx) === "destroyer");
    // 夜の奇襲:まだ撃たれていなければ、交戦の帯(夜は近距離)に入るまで撃たない(発砲の光で居場所を明かさず、遠くから当たらない弾を撒かない。サボ島沖)
    const nightFire = night && !ms.some((u) => u.firstHitSec !== undefined) ? "band" : "free";
    if (!ddOnly && !isCarrier && sq.fire !== nightFire) set("fire", nightFire);
    const nearest = [...enemyShips].sort((p, q) => distance(p.pos, at) - distance(q.pos, at) || (p.contactId < q.contactId ? -1 : 1))[0];
    // 守る目標(自陣営の、海の上の目標)
    const guard = ctx.scenario.objectives
      .filter((ob) => view.objectives[ob.id] === view.side && navigable(ob, ctx))
      .sort((p, q) => distance(p, at) - distance(q, at) || (p.id < q.id ? -1 : 1))[0];
    const goal = ctx.scenario.objectives
      .filter((ob) => view.objectives[ob.id] !== view.side && navigable(ob, ctx))
      .sort((p, q) => distance(p, at) - distance(q, at) || (p.id < q.id ? -1 : 1))[0];
    const toward = (p: Vec2) => {
      if (sq.toward && distance(sq.toward, p) <= REAIM_M && !sq.engage) return;
      set("toward", { x: p.x, y: p.y });
      if (sq.engage) set("engage", null);
    };
    const want = (formation: string) => {
      const now = sq.formationChange?.to ?? sq.formation;
      if (now !== formation && formation in (ctx.rules.naval?.formations ?? {})) set("formation", formation);
    };
    const speed = (s: SeaOrder["speed"]) => {
      if (sq.speed !== s) set("speed", s);
    };
    const flag = <K extends "smoke" | "evade">(k: K, v: boolean) => {
      if (sq[k] !== v) set(k, v);
    };

    // 退く理由
    const ourPower = ms.reduce((t, x) => t + x.strength * (SHIP_WEIGHT[shipType(x, ctx)] ?? UNKNOWN_SHIP_WEIGHT), 0);
    const theirPower = nearest ? enemyShips.filter((c) => distance(c.pos, nearest.pos) <= GROUP_M).reduce((t, c) => t + (c.estimatedStrength ?? 1) * (SHIP_WEIGHT[c.shipType ?? ""] ?? UNKNOWN_SHIP_WEIGHT), 0) : 0;
    const formation = Object.values(ctx.formations ?? {}).find((f) => f.units.includes(lead.id));
    const lost = formation ? formation.units.filter((x) => !view.own.some((u) => u.id === x && u.strength > 0) && ctx.toes.toes[ctx.scenario.reinforcements.find((r) => r.id === x)?.toe ?? ""]?.ship === undefined).length : 0;
    const avg = ms.reduce((t, x) => t + x.strength, 0) / ms.length;
    const spentShells = ms.reduce((t, x) => t + mainApLeft(x, ctx), 0) / ms.length < SHELLS_RETIRE_BELOW && ms.every((x) => torpedoesSpent(x, ctx));
    const spentTorpedoes = ddOnly && night && ms.every((x) => torpedoesSpent(x, ctx) || (!!x.torpedoLoad && x.torpedoLoad.readyAt > view.time));
    const weak = avg < RETIRE_BELOW || lost > 0 || spentShells || spentTorpedoes;
    const defending = !!guard;
    const outgunned = !!nearest && ourPower < theirPower * (defending ? OUTGUNNED_DEFENDING : OUTGUNNED);
    const goalPress = urgent && !defending ? goal : undefined;

    if (withdraw) {
      // 引き揚げの刻限:敵がいても引き揚げる
      toward({ x: withdraw.x, y: withdraw.y });
      speed("flank");
      flag("evade", false);
    } else if (isCarrier) {
      want("ring");
      if (nearest && distance(nearest.pos, at) < CARRIER_STANDOFF_M) {
        const p = retreatPoint(at, nearest.pos, RETIRE_STEP_M, ctx);
        if (p) toward(p);
        speed("flank");
      } else speed("cruise");
    } else if (goalPress) {
      // 急ぎ度に追われる攻め手:劣勢でも退かず、目標へ進み続ける(見える敵には撃ちながら)
      want("line_ahead");
      toward({ x: goalPress.x, y: goalPress.y });
      speed("battle");
      flag("smoke", false);
    } else if (nearest && (weak || outgunned)) {
      // 退く:守る側は守る目標へ、そうでなければ敵から離れる。煙幕を張って全速で
      const p = guard && distance(guard, at) > 4000 ? { x: guard.x, y: guard.y } : retreatPoint(at, nearest.pos, RETIRE_STEP_M, ctx);
      if (p) toward(p);
      speed("flank");
      flag("smoke", true);
      flag("evade", false);
    } else if (nearest && (!carriers.length || distance(nearest.pos, at) <= ESCORT_ENGAGE_M)) {
      // 交戦:距離の帯をエンジンに任せる
      want("line_ahead");
      const target = sq.engage && enemyShips.some((c) => c.contactId === sq.engage!.target) ? sq.engage.target : nearest.contactId;
      const theirKg = Math.max(...enemyShips.filter((c) => distance(c.pos, nearest.pos) <= GROUP_M).map((c) => TYPICAL_SHELL_KG[c.shipType ?? ""] ?? 50));
      const ours = heaviestShell(ms, ctx);
      const reach = torpedoReach(ms, ctx);
      let band: SeaBand = night ? "close" : ours >= theirKg * OUTRANGE_RATIO ? "hold" : ours * OUTRANGE_RATIO <= theirKg ? "close" : "hold";
      // 撃てる魚雷がない(撃ち尽くした・次発装填の途中)水雷戦隊は、敵の砲の内に留まらず離れる(史実の雷撃は短い突撃で、撃ったら下がって装填した)
      const loaded = ms.some((x) => !torpedoesSpent(x, ctx) && (!x.torpedoLoad || x.torpedoLoad.readyAt <= view.time));
      if (ddOnly && reach > 0 && !loaded) band = "open";
      else if (ddOnly && reach > 0) {
        // 水雷戦隊:雷撃の距離の帯(射程の3〜5割)へ詰め、撃ったら反転する。夜は撃ち方待て(発砲の光で居場所を明かさない)
        band = { minM: reach * 0.3, maxM: reach * 0.5 };
        if (sq.torpedoes !== "turnAway" && ms.some((x) => !torpedoesSpent(x, ctx))) set("torpedoes", "turnAway");
        if (night && sq.fire !== "hold") set("fire", "hold");
      } else if (sq.fire !== nightFire) set("fire", nightFire);
      const same = sq.engage && sq.engage.target === target && JSON.stringify(sq.engage.band) === JSON.stringify(band);
      if (!same) set("engage", { target, band });
      speed("battle");
      flag("smoke", false);
      flag("evade", false);
    } else {
      flag("smoke", false);
      const hunt = recent
        .filter((c) => c.currentLevel === 0 && distance(c.pos, at) <= HUNT_RANGE_M && distance(c.pos, at) > HUNT_GIVE_UP_M)
        .sort((p, q) => distance(p.pos, at) - distance(q.pos, at) || (p.contactId < q.contactId ? -1 : 1))[0];
      const carrier = carriers.map(([, c]) => members(c, view)[0]).filter((u): u is Own => !!u).sort((p, q) => distance(p.pos, at) - distance(q.pos, at))[0];
      if (carrier) {
        // 空母の護衛:空母のそばにつく
        if (distance(carrier.pos, at) > ESCORT_STATION_M) toward(carrier.pos);
        speed("cruise");
      } else if (weak) {
        // 傷ついた戦隊は探しに出ず、守る目標か、最後に見た敵から離れる
        if (guard) toward(guard);
        else if (hunt) {
          const p = retreatPoint(at, hunt.pos, RETIRE_STEP_M, ctx);
          if (p) toward(p);
        }
      } else if (!defending && hunt) {
        toward(hunt.pos);
        speed(distance(hunt.pos, at) <= BATTLE_SPEED_M ? "battle" : "cruise");
      } else if (goal) {
        want("line_ahead");
        if (distance(goal, at) > goal.radiusM / 2) toward(goal);
        speed("cruise");
      } else if (guard) {
        if (distance(guard, at) > GUARD_RADIUS_M) toward(guard);
      } else {
        const p = searchPoint(lead, view, ctx);
        if (p) toward(p);
        speed("cruise");
      }
    }
    if (Object.keys(o).length > 1) out.push(o);
  }
  return out;
}
