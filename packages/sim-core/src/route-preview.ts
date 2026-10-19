import type { SimContext } from "./context.js";
import { fatigueSpeedMultiplier } from "./fatigue.js";
import { frontEnds } from "./frontage.js";
import { distance, type Vec2 } from "./geometry.js";
import type { ContactView } from "./intel.js";
import { planRoute, terrainSpeed, type RoutePoint } from "./pathfinding.js";
import { isNightTurn } from "./scenario.js";
import { stanceOf } from "./stance.js";
import { fuelRangeM, mobilityOf } from "./supply.js";
import { trainingOf } from "./training.js";
import { groundSpeedMultiplier } from "./weather.js";
import type { MoveMode, Unit } from "./unit.js";

/**
 * 移動速度(m/秒)。行軍で道路の区間を進むときは道路の倍率、それ以外は今いるセルの地形の倍率。
 * ターンの解決と経路のプレビューで同じ式を使う(phase は ctx.phase)
 */
export function moveSpeedMps(u: Unit, toward: RoutePoint, ctx: SimContext): number {
  const branch = ctx.branches.branches[u.branch]!;
  const modeRatio = u.moveMode === "combat" ? ctx.rules.combatMoveSpeedRatio : 1;
  const ground =
    toward.onRoad && u.moveMode === "march"
      ? ctx.rules.roadSpeedMultiplier
      : terrainSpeed(ctx.terrain.terrainAt(u.pos), mobilityOf(u, ctx), ctx);
  const infiltration = ctx.phase === "night" && u.moveMode === "march" ? ctx.rules.night.infiltration.speedMultiplier : 1;
  // 潰走中は統制を失い、足が鈍る
  const routed = u.routed ? ctx.rules.morale.routedSpeedMultiplier : 1;
  // 地面の状態(ぬかるみ・積雪)
  const soil = groundSpeedMultiplier(ctx, mobilityOf(u, ctx), !!toward.onRoad && u.moveMode === "march");
  return (branch.marchSpeedMpm / 60) * modeRatio * ground * infiltration * routed * soil * fatigueSpeedMultiplier(u, ctx);
}

/** 経路の上の1点(道のりは出発点からの距離 m、時刻は今のターンの始めからの秒) */
export interface PreviewPoint {
  x: number;
  y: number;
  alongM: number;
  atSeconds: number;
}

export interface RoutePreview {
  /** 届かない地点(経路が引けない) */
  reachable: boolean;
  /** 出発点から目的地までの経路(出発点を含む) */
  path: Vec2[];
  totalM: number;
  /** 道路を行軍する区間の割合(0〜1) */
  onRoadShare: number;
  /** 動き出すまでの秒:命令の遅れ(練度)と、縦隊から展開するまでの時間(戦闘移動) */
  startDelay: { orderSeconds: number; deploySeconds: number };
  /** 今のターンを含め、各ターンの終わりにいる位置(到着したターンまで、最大 horizonTurns ターン) */
  turnEnds: (PreviewPoint & { turn: number })[];
  /** 到着する時刻(今のターンの始めから秒)と、そのターン。見通しの範囲で着かなければ null */
  arrival: (PreviewPoint & { turn: number }) | null;
  /** 動けない理由(姿勢が死守・伏撃など) */
  immobile?: string;
  /** 燃料が尽きる地点 */
  fuelOut?: PreviewPoint;
  /** 足が大きく鈍る地形に入る地点(川など) */
  slow: (PreviewPoint & { terrain: string; name: string })[];
  /** 夜のターンで、動かずに過ごすターン(夜は夜間行動命令を出したユニットだけが動く) */
  nightIdleTurns: number[];
}

export interface PreviewOptions {
  /** 何ターン先まで見るか */
  horizonTurns?: number;
  /** 速度倍率がこれ未満の地形を「足が鈍る所」として示す(表示の目安) */
  slowBelow?: number;
}

/**
 * 移動の命令の下書きから、実際の解決と同じ経路・速さで、どこまで進むか・いつ着くかを見積もる。
 * 敵の阻止圏・接敵・燃料の補給・疲労の変化は含めない(阻止圏は zoneWarnings で、知っている敵だけから示す)。
 * 夜のターンは、今のターンが夜なら夜間行動命令として活動時間だけ動き、次からの夜は動かない
 */
export function previewMove(
  unit: Unit,
  order: { waypoints: readonly Vec2[]; moveMode?: MoveMode },
  turn: number,
  ctx: SimContext,
  opts: PreviewOptions = {},
): RoutePreview {
  const horizon = opts.horizonTurns ?? 12;
  const slowBelow = opts.slowBelow ?? 0.35;
  const u: Unit = { ...unit, pos: { ...unit.pos }, moveMode: order.moveMode ?? unit.moveMode };
  const mobility = mobilityOf(u, ctx);
  const route = planRoute(u.pos, order.waypoints, u.moveMode, ctx, mobility);
  const empty: RoutePreview = {
    reachable: false,
    path: [{ ...unit.pos }],
    totalM: 0,
    onRoadShare: 0,
    startDelay: { orderSeconds: 0, deploySeconds: 0 },
    turnEnds: [],
    arrival: null,
    slow: [],
    nightIdleTurns: [],
  };
  if (!route) return empty;

  const path: Vec2[] = [{ ...u.pos }, ...route.map((p) => ({ x: p.x, y: p.y }))];
  let totalM = 0;
  let roadM = 0;
  let prev: Vec2 = u.pos;
  for (const p of route) {
    const d = distance(prev, p);
    totalM += d;
    if (p.onRoad && u.moveMode === "march") roadM += d;
    prev = p;
  }

  const firstNight = isNightTurn(ctx.scenario, turn);
  const orderSeconds = firstNight ? 0 : trainingOf(u, ctx.rules).orderDelayMinutes * 60;
  // 戦闘移動は展開した隊形のまま動く:縦隊・展開中なら、その場で展開しきってから動き出す
  const deployNeed = ctx.turnSeconds;
  const deploySeconds =
    u.moveMode === "combat" && u.formation !== "deployed" ? Math.max(0, deployNeed - (u.formation === "deploying" ? u.deployProgressSec : 0)) : 0;
  const result: RoutePreview = {
    ...empty,
    reachable: true,
    path,
    totalM,
    onRoadShare: totalM > 0 ? roadM / totalM : 0,
    startDelay: { orderSeconds, deploySeconds },
  };
  // 切替中のターンは標準扱い(stanceOf がそう返す)
  if (stanceOf(u, ctx.rules).immobile) {
    result.immobile = stanceOf(u, ctx.rules).name;
    return result;
  }
  if (totalM === 0) {
    result.arrival = { x: u.pos.x, y: u.pos.y, alongM: 0, atSeconds: 0, turn };
    return result;
  }

  let fuelLeft = fuelRangeM(u, ctx);
  let idx = 0;
  let along = 0;
  let elapsed = 0;
  let deployLeft = deploySeconds;
  let lastTerrainSlow: string | null = null;
  const checkStepM = Math.max(10, ctx.terrain.cellSizeM / 4);
  const point = (atSeconds: number): PreviewPoint => ({ x: u.pos.x, y: u.pos.y, alongM: along, atSeconds });

  for (let k = 0; k < horizon && turn + k <= ctx.scenario.maxTurns; k++) {
    const t = turn + k;
    const night = isNightTurn(ctx.scenario, t);
    const turnLen = night ? ctx.scenario.night!.hours * 3600 : ctx.turnSeconds;
    // 夜は、夜間行動命令(今のターンに出した命令)だけが活動時間のあいだ動く
    const activeLen = night ? (k === 0 ? Math.min(turnLen, ctx.rules.night.activeHours * 3600) : 0) : turnLen;
    if (night && k > 0) result.nightIdleTurns.push(t);
    const stepCtx: SimContext = { ...ctx, phase: night ? "night" : "day" };
    let tIn = k === 0 ? orderSeconds : 0;
    // 展開はその場で進む(夜でも進む)
    const deployUse = Math.min(deployLeft, turnLen - tIn);
    deployLeft -= deployUse;
    tIn += deployUse;
    while (tIn < activeLen && idx < route.length && fuelLeft > 0 && deployLeft <= 0) {
      const target = route[idx]!;
      const d = distance(u.pos, target);
      const speed = moveSpeedMps(u, target, stepCtx);
      if (speed <= 0) break;
      // 足が鈍る地形に入った所
      const roadMarch = target.onRoad && u.moveMode === "march";
      const here = ctx.terrain.terrainAt(u.pos);
      const slowHere = !roadMarch && terrainSpeed(here, mobility, ctx) < slowBelow ? here : null;
      if (slowHere && slowHere !== lastTerrainSlow) result.slow.push({ ...point(elapsed + tIn), terrain: here, name: ctx.rules.terrain[here]!.name });
      lastTerrainSlow = slowHere;
      const len = Math.min(d, checkStepM);
      const go = Math.min(len, (activeLen - tIn) * speed, fuelLeft);
      if (go >= d) {
        u.pos = { x: target.x, y: target.y };
        idx++;
      } else if (d > 0) {
        u.pos = { x: u.pos.x + ((target.x - u.pos.x) * go) / d, y: u.pos.y + ((target.y - u.pos.y) * go) / d };
      }
      along += go;
      fuelLeft -= go;
      tIn += go / speed;
      if (go < len) break;
    }
    if (idx >= route.length && !result.arrival) {
      result.arrival = { ...point(elapsed + Math.min(tIn, turnLen)), turn: t };
    }
    if (fuelLeft <= 0 && !result.fuelOut && idx < route.length) result.fuelOut = point(elapsed + tIn);
    result.turnEnds.push({ ...point(elapsed + turnLen), turn: t });
    elapsed += turnLen;
    if (result.arrival || result.fuelOut) break;
  }
  return result;
}

/** 経路の上で、知っている敵の阻止圏に入る所 */
export interface ZoneWarning {
  contactId: string;
  /** 阻止圏に入る最初の点 */
  at: PreviewPoint;
}

/**
 * 経路が、知っている敵(見えている・最後に見た位置)の阻止圏に入る所を示す。霧の内側の情報(ContactView)だけを使う。
 * 正面幅が分かっている敵は帯、分からない敵は点から zoneRadiusM。潰走・撃破を確かめた敵、縦隊と分かっている敵は数えない
 */
export function zoneWarnings(preview: RoutePreview, contacts: readonly ContactView[], ctx: SimContext): ZoneWarning[] {
  if (!preview.reachable || preview.path.length < 2) return [];
  const R = ctx.rules.breakthrough.zoneRadiusM;
  const live = contacts.filter((c) => !c.destroyed && !c.routed && c.formation !== "column" && c.formation !== "deploying");
  if (live.length === 0) return [];
  const step = R / 4;
  const timeAt = (alongM: number) => interpolateTime(preview, alongM);
  const out: ZoneWarning[] = [];
  for (const c of live) {
    const [p0, p1] = frontEnds({ pos: c.pos, facing: c.facing ?? 0, width: c.frontageM ?? 0 });
    let along = 0;
    let hit: PreviewPoint | null = null;
    for (let i = 1; i < preview.path.length && !hit; i++) {
      const a = preview.path[i - 1]!;
      const b = preview.path[i]!;
      const d = distance(a, b);
      const n = Math.max(1, Math.ceil(d / step));
      for (let j = 0; j <= n; j++) {
        const q = { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n };
        // 出発点がすでに阻止圏の中なら(接敵中)、知らせない
        if (i === 1 && j === 0) {
          if (segmentDistance(q, p0, p1) < R) break;
          continue;
        }
        if (segmentDistance(q, p0, p1) < R) {
          const al = along + (d * j) / n;
          hit = { x: q.x, y: q.y, alongM: al, atSeconds: timeAt(al) };
          break;
        }
      }
      along += d;
    }
    if (hit) out.push({ contactId: c.contactId, at: hit });
  }
  return out.sort((p, q) => p.at.alongM - q.at.alongM);
}

/** 道のり alongM の地点を通る時刻(ターンの終わりの位置から線形に補う。見通しの外は NaN) */
function interpolateTime(p: RoutePreview, alongM: number): number {
  let prevAlong = 0;
  let prevT = p.startDelay.orderSeconds + p.startDelay.deploySeconds;
  const marks = [...p.turnEnds];
  if (p.arrival) marks.splice(0, marks.length, ...p.turnEnds.filter((m) => m.turn < p.arrival!.turn), p.arrival);
  for (const m of marks) {
    if (alongM <= m.alongM) {
      const span = m.alongM - prevAlong;
      return span > 0 ? prevT + ((m.atSeconds - prevT) * (alongM - prevAlong)) / span : prevT;
    }
    // 次のターンの始めから動き出す(そのターンの終わりの時刻ではなく)
    prevAlong = m.alongM;
    prevT = m.atSeconds;
  }
  return Number.NaN;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return distance(p, { x: a.x + dx * k, y: a.y + dy * k });
}
