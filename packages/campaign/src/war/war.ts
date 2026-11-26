import { Rng, type RngState } from "@brigade/sim-core";
import { RESOURCE_KEYS, type Front, type Resources, type UnitTemplate, type WarDef } from "./schema.js";

/**
 * 戦争の状態と1か月の解決(docs/war-design.md の2)。決定論的:乱数は状態に持つシード付きの RNG だけ
 */

export type Posture = "attack" | "defend";

export interface WarUnit {
  id: string;
  template: string;
  side: string;
  strength: number;
  /** いる戦線(null は予備) */
  front: string | null;
  /** 移動中:着く戦線(null は予備)と、着く月(0 始まりの月の番号) */
  moving?: { to: string | null; arrives: number };
}

export interface WarFrontState {
  boundary: number;
  posture: Record<string, Posture>;
  /**
   * 戦役の地図で戦っている(W3):その戦役の時期の終わり(月の番号)まで、この戦線は大まかには解かない。
   * pending の間(戦役の結果がまだ戻らない)は、戦争を進められない
   */
  campaign?: { campaignId: string; until: number; pending: boolean };
}

/** 戦役の地図で戦った戦線の結果(W3) */
export interface CampaignOutcomeReport {
  month: number;
  front: string;
  campaignId: string;
  winner: string | null;
  level: "decisive" | "limited" | "draw";
  moved: number;
  captured: string[];
  losses: Record<string, number>;
}

export interface ResearchState {
  done: string[];
  progress: Record<string, number>;
  /** 研究中の項目(null は研究しない) */
  current: string | null;
  /** 工業力のうち研究に回す割合 */
  share: number;
}

export interface FrontReport {
  front: string;
  open: boolean;
  power: Record<string, number>;
  attacker: string | null;
  ratio: number;
  /** 前線が動いた地域の数(sides[0] から見て正=前進) */
  moved: number;
  captured: string[];
  losses: Record<string, number>;
  /** 燃料が足りず機甲が弱った陣営 */
  noFuel: string[];
}

export interface MonthReport {
  month: number;
  date: string;
  income: Record<string, Resources>;
  fronts: FrontReport[];
  produced: { side: string; template: string; unitId: string }[];
  researched: { side: string; tech: string }[];
  destroyed: string[];
  rejected: { side: string; reason: string }[];
}

export interface WarResult {
  winner: string | null;
  level: "decisive" | "limited" | "draw";
  reason: string;
  vp: Record<string, number>;
}

export interface WarState {
  warId: string;
  /** 解いた月の数(次に解くのは month 番目の月) */
  month: number;
  stock: Record<string, Resources>;
  research: Record<string, ResearchState>;
  units: WarUnit[];
  queue: { side: string; template: string; done: number }[];
  fronts: Record<string, WarFrontState>;
  owners: Record<string, string>;
  rng: RngState;
  nextId: number;
  history: MonthReport[];
  result: WarResult | null;
  /** 世代の中で設計した軍団の型(W4。ID は d1, d2…)。作れるようになる月 availableMonth から buildable に並ぶ */
  designs?: Record<string, WarDesign>;
  /** 戦役の地図で戦った戦役(同じ戦役は1度だけ)と、その結果 */
  fought?: string[];
  campaignResults?: CampaignOutcomeReport[];
}

/** 世代の中で設計した軍団の型(W4) */
export interface WarDesign extends UnitTemplate {
  /** もとにした型 */
  base: string;
  /** 質(世代の上限まで。攻め・守りを上げ、値段・月数・燃料が増える)と、攻め寄り(正)・守り寄り(負)の振り分け */
  quality: number;
  shift: number;
  /** 作れるようになる月 */
  availableMonth: number;
}

/** 設計の注文 */
export interface DesignOrder {
  name: string;
  base: string;
  quality: number;
  shift: number;
}

/** 画面が持つ戦争の記録(サーバーは持たない) */
export interface WarSnapshot {
  warId: string;
  /** 人間の陣営 */
  side: string;
  state: WarState;
}

/** 陣営ごとの1か月の命令 */
export interface WarOrders {
  /** 工業力のうち研究に回す割合(maxResearchShare まで) */
  researchShare?: number;
  /** 研究する項目(null でやめる) */
  research?: string | null;
  /** 注文する型(並んだ順に、払えるだけ) */
  produce?: string[];
  /** 軍団を送る:行き先の戦線(null は予備) */
  moves?: { unitId: string; to: string | null }[];
  /** 戦線の構え */
  postures?: Record<string, Posture>;
  /** 世代の中で軍団の型を設計する(1か月に1つ。W4) */
  design?: DesignOrder;
}

const ZERO: Resources = { industry: 0, manpower: 0, fuel: 0 };

/** 月の番号(0 始まり)の年月 "YYYY-MM" */
export function monthDate(def: WarDef, m: number): string {
  const [y, mo] = def.calendar.start.split("-").map(Number) as [number, number];
  const t = y * 12 + (mo - 1) + m;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** 年月 "YYYY-MM" の月の番号(始めの月が0) */
export function monthIndex(def: WarDef, date: string): number {
  const [y0, m0] = def.calendar.start.split("-").map(Number) as [number, number];
  const [y, m] = date.split("-").map(Number) as [number, number];
  return y * 12 + m - (y0 * 12 + m0);
}

export function startWar(def: WarDef, seed: number): WarState {
  const units: WarUnit[] = [];
  let n = 1;
  for (const f of def.start.forces) {
    const t = def.templates[f.template]!;
    for (let i = 0; i < f.count; i++) units.push({ id: `u${n++}`, template: f.template, side: t.side, strength: f.strength, front: f.front ?? null });
  }
  return {
    warId: def.id,
    month: 0,
    stock: Object.fromEntries(def.sides.map((s) => [s.id, { ...ZERO, ...def.start.stock[s.id] }])),
    research: Object.fromEntries(def.sides.map((s) => [s.id, { done: [...(def.start.researched[s.id] ?? [])], progress: {}, current: null, share: 0.15 }])),
    units,
    queue: [],
    fronts: Object.fromEntries(Object.entries(def.fronts).map(([id, f]) => [id, { boundary: f.boundary, posture: Object.fromEntries(def.sides.map((s) => [s.id, "defend" as Posture])) }])),
    owners: Object.fromEntries(Object.entries(def.regions).map(([id, r]) => [id, r.owner])),
    rng: Rng.fromSeed(seed).getState(),
    nextId: n,
    history: [],
    result: null,
  };
}

/** 戦線が開いているか(月 m に) */
export function frontOpen(def: WarDef, frontId: string, m: number): boolean {
  const f = def.fronts[frontId]!;
  if (f.opens && monthIndex(def, f.opens) > m) return false;
  if (f.closes && monthIndex(def, f.closes) < m) return false;
  return true;
}

/** 月 m の地域の資源(持ち主にとって。奪った地域は capturedYield の割合だけ) */
export function regionYield(def: WarDef, regionId: string, m: number, owner: string): Resources {
  const r = def.regions[regionId]!;
  const date = monthDate(def, m);
  const y = { ...ZERO, ...r.yields };
  for (const s of r.schedule) {
    if (s.from <= date) for (const k of RESOURCE_KEYS) y[k] += s.add[k];
  }
  const k = owner === r.owner ? 1 : CAPTURED_YIELD;
  return { industry: Math.max(0, y.industry * k), manpower: Math.max(0, y.manpower * k), fuel: Math.max(0, y.fuel * k) };
}
/** 奪った地域から入る資源の割合(焦土・住民の非協力) */
export const CAPTURED_YIELD = 0.5;

/** 陣営が今作れる型 */
export function buildable(def: WarDef, state: WarState, side: string): string[] {
  const date = monthDate(def, state.month);
  const done = new Set(state.research[side]?.done ?? []);
  return Object.entries(def.templates)
    .filter(([, t]) => t.side === side && (!t.availableFrom || t.availableFrom <= date) && (!t.requires || done.has(t.requires)))
    .map(([id]) => id)
    .concat(Object.entries(state.designs ?? {}).filter(([, d]) => d.side === side && d.availableMonth <= state.month).map(([id]) => id));
}

/** 陣営が今研究を始められる項目 */
export function researchable(def: WarDef, state: WarState, side: string): string[] {
  const date = monthDate(def, state.month);
  const done = new Set(state.research[side]?.done ?? []);
  return Object.entries(def.tech)
    .filter(([id, t]) => t.side === side && !done.has(id) && t.requires.every((r) => done.has(r)) && (!t.earliest || t.earliest <= date))
    .map(([id]) => id);
}

/** 系統樹で上がった種類ごとの力の倍率 */
export function techBoost(def: WarDef, state: WarState, side: string, kind: UnitTemplate["kind"]): number {
  let k = 1;
  for (const id of state.research[side]?.done ?? []) k *= def.tech[id]?.boost[kind] ?? 1;
  return k;
}

const canPay = (stock: Resources, cost: Resources) => RESOURCE_KEYS.every((k) => stock[k] >= cost[k] - 1e-9);
const pay = (stock: Resources, cost: Resources, k = 1) => {
  for (const r of RESOURCE_KEYS) stock[r] = Math.max(0, stock[r] - cost[r] * k);
};

/** 戦線にいて戦える(移動中でない)陣営の軍団 */
export function unitsAt(state: WarState, front: string, side: string): WarUnit[] {
  return state.units.filter((u) => u.side === side && u.front === front && !u.moving && u.strength > 0);
}

/**
 * 戦線での陣営の力(構えに応じて攻め・守りの値。戦力・系統樹・補給・機甲の倍率・燃料・航空の上乗せ。広さの上限 maxCorps)
 */
export function frontPower(def: WarDef, state: WarState, frontId: string, side: string, posture: Posture, fuelOk = true): number {
  const f = def.fronts[frontId]!;
  const r = def.rules;
  const land: number[] = [];
  let air = 0;
  for (const u of unitsAt(state, frontId, side)) {
    const t = templateOf(def, state, u.template);
    if (t.kind === "air") {
      air += u.strength;
      continue;
    }
    let v = (posture === "attack" ? t.attack : t.defense) * u.strength * techBoost(def, state, side, t.kind);
    if (t.kind === "armor") v *= f.armorMultiplier * (posture === "attack" && !fuelOk ? r.noFuelArmorMultiplier : 1);
    land.push(v);
  }
  land.sort((a, b) => b - a);
  // 広さの目安を超えた軍団は、第2線・予備として一部だけ効く
  const sum = land.reduce((s, x, i) => s + (f.maxCorps && i >= f.maxCorps ? x * r.overCapShare : x), 0);
  const airK = 1 + Math.min(r.airCap, air * r.airSupportPerUnit * techBoost(def, state, side, "air"));
  return sum * airK * (f.supply[side] ?? 1);
}

/** 攻勢の1か月に戦線の軍団が使う燃料 */
export function attackFuel(def: WarDef, state: WarState, frontId: string, side: string): number {
  return unitsAt(state, frontId, side).reduce((s, u) => s + templateOf(def, state, u.template).fuelPerAttack * u.strength, 0);
}

/** 1か月を解く。入力の state は変えない */
export function resolveMonth(def: WarDef, input: WarState, orders: Record<string, WarOrders>): WarState {
  if (input.result) throw new Error("戦争は終わっています");
  const waiting = Object.entries(input.fronts).find(([, f]) => f.campaign?.pending);
  if (waiting) throw new Error(`${def.fronts[waiting[0]]?.name ?? waiting[0]}の戦役の結果がまだです(戦役を終えて報告してください)`);
  const state: WarState = structuredClone(input);
  const m = state.month;
  const rng = Rng.fromState(state.rng);
  const r = def.rules;
  const sides = def.sides.map((s) => s.id);
  const report: MonthReport = { month: m, date: monthDate(def, m), income: {}, fronts: [], produced: [], researched: [], destroyed: [], rejected: [] };

  // 1. 収入
  for (const side of sides) {
    const inc = { ...ZERO };
    for (const [rid, owner] of Object.entries(state.owners)) {
      if (owner !== side) continue;
      const y = regionYield(def, rid, m, side);
      for (const k of RESOURCE_KEYS) inc[k] += y[k];
    }
    report.income[side] = inc;
    for (const k of RESOURCE_KEYS) state.stock[side]![k] += inc[k];
  }

  // 2. 命令:研究の割合と項目・注文・移動・構え
  for (const side of sides) {
    const o = orders[side] ?? {};
    const rs = state.research[side]!;
    if (o.researchShare !== undefined) rs.share = Math.max(0, Math.min(r.maxResearchShare, o.researchShare));
    if (o.research !== undefined) {
      if (o.research === null) rs.current = null;
      else if (researchable(def, state, side).includes(o.research)) rs.current = o.research;
      else report.rejected.push({ side, reason: `研究できない項目です:${o.research}` });
    }
    const can = new Set(buildable(def, state, side));
    for (const tid of o.produce ?? []) {
      const t = templateOrUndef(def, state, tid);
      if (!t || !can.has(tid)) {
        report.rejected.push({ side, reason: `作れない型です:${tid}` });
        continue;
      }
      if (!canPay(state.stock[side]!, t.cost)) {
        report.rejected.push({ side, reason: `資源が足りません:${t.name}` });
        continue;
      }
      pay(state.stock[side]!, t.cost);
      state.queue.push({ side, template: tid, done: m + t.months });
    }
    for (const mv of o.moves ?? []) {
      const u = state.units.find((x) => x.id === mv.unitId && x.side === side);
      if (!u || u.moving) {
        report.rejected.push({ side, reason: `送れない軍団です:${mv.unitId}` });
        continue;
      }
      if (mv.to !== null && !def.fronts[mv.to]) {
        report.rejected.push({ side, reason: `戦線がありません:${mv.to}` });
        continue;
      }
      if (u.front === mv.to) continue;
      u.moving = { to: mv.to, arrives: m + r.transferMonths };
      u.front = null;
    }
    for (const [fid, p] of Object.entries(o.postures ?? {})) if (state.fronts[fid]) state.fronts[fid]!.posture[side] = p;
    // 設計:工業力を払い、設計の月数の後に作れるようになる
    if (o.design) {
      const t = designTemplate(def, state, side, o.design);
      const price = designPrice(def, o.design);
      if (typeof t === "string") report.rejected.push({ side, reason: t });
      else if (state.stock[side]!.industry < price) report.rejected.push({ side, reason: `設計の工業力が足りません(${Math.round(price)})` });
      else {
        state.stock[side]!.industry -= price;
        const did = `d${Object.keys(state.designs ?? {}).length + 1}`;
        (state.designs ??= {})[did] = { ...t, availableMonth: m + def.rules.design.months };
      }
    }
  }

  // 3. 研究:工業力の一部を研究の点に
  for (const side of sides) {
    const rs = state.research[side]!;
    if (!rs.current) continue;
    const spend = report.income[side]!.industry * rs.share;
    state.stock[side]!.industry = Math.max(0, state.stock[side]!.industry - spend);
    rs.progress[rs.current] = (rs.progress[rs.current] ?? 0) + spend * r.researchPerIndustry;
    const tech = def.tech[rs.current]!;
    if (rs.progress[rs.current]! >= tech.cost) {
      rs.done.push(rs.current);
      report.researched.push({ side, tech: rs.current });
      delete rs.progress[rs.current];
      rs.current = null;
    }
  }

  // 4. 着いた軍団・できた軍団
  for (const u of state.units) {
    if (u.moving && u.moving.arrives <= m) {
      u.front = u.moving.to;
      delete u.moving;
    }
  }
  state.queue = state.queue.filter((q) => {
    if (q.done > m) return true;
    const id = `u${state.nextId++}`;
    state.units.push({ id, template: q.template, side: q.side, strength: 1, front: null });
    report.produced.push({ side: q.side, template: q.template, unitId: id });
    return false;
  });

  // 6. 戦線の解決
  for (const fid of Object.keys(def.fronts)) {
    const f = def.fronts[fid]!;
    const fs = state.fronts[fid]!;
    const open = frontOpen(def, fid, m);
    const fr: FrontReport = { front: fid, open, power: {}, attacker: null, ratio: 1, moved: 0, captured: [], losses: {}, noFuel: [] };
    report.fronts.push(fr);
    if (!open) continue;
    // 戦役の地図で戦った戦線は、その戦役の時期の終わりまで大まかには解かない(戦役の結果で動いた)
    if (fs.campaign && fs.campaign.until >= m) continue;
    const [a, b] = sides as [string, string];
    // 燃料:攻勢の陣営は機甲の燃料を払う。足りなければ機甲が弱る
    const fuelOk: Record<string, boolean> = {};
    for (const s of sides) {
      if (fs.posture[s] !== "attack") {
        fuelOk[s] = true;
        continue;
      }
      const need = attackFuel(def, state, fid, s);
      fuelOk[s] = state.stock[s]!.fuel >= need;
      if (!fuelOk[s]) fr.noFuel.push(s);
      state.stock[s]!.fuel = Math.max(0, state.stock[s]!.fuel - need);
    }
    const pa = frontPower(def, state, fid, a, fs.posture[a]!, fuelOk[a]);
    const pb = frontPower(def, state, fid, b, fs.posture[b]!, fuelOk[b]);
    fr.power = { [a]: pa, [b]: pb };
    const attA = fs.posture[a] === "attack";
    const attB = fs.posture[b] === "attack";
    const spread = () => 1 + (rng.next() * 2 - 1) * r.spread;
    if (!attA && !attB) {
      // 静かな戦線:双方とも小さく損耗する
      fr.losses = { [a]: r.attrition * r.quietAttrition * spread(), [b]: r.attrition * r.quietAttrition * spread() };
    } else {
      // 攻める側:両方攻めれば、力の強い側(遭遇戦)。守る側は地形の倍率を受ける
      const attacker = attA && attB ? (pa >= pb ? a : b) : attA ? a : b;
      const defender = attacker === a ? b : a;
      const pAtt = attacker === a ? pa : pb;
      // 守り手が次に失う地域がもとから自分の地域なら、祖国の防衛の倍率
      const nextLost = attacker === a ? f.regions[fs.boundary] : f.regions[fs.boundary - 1];
      const home = nextLost !== undefined && def.regions[nextLost]!.owner === defender ? r.homeDefense : 1;
      const pDef = (attacker === a ? pb : pa) * (attA && attB ? 1 : f.defenseMultiplier) * home;
      const ratio = pDef > 0 ? pAtt / pDef : pAtt > 0 ? 99 : 1;
      fr.attacker = attacker;
      fr.ratio = ratio;
      // 損耗:比が大きいほど守り手が多く、攻め手が少なく失う
      const sq = Math.sqrt(Math.max(0.05, Math.min(20, ratio)));
      fr.losses = { [attacker]: Math.min(0.5, (r.attrition / sq) * spread()), [defender]: Math.min(0.6, r.attrition * sq * spread()) };
      // 前線:比が advanceRatio 以上で1地域、breakthroughRatio 以上で2地域
      const steps = ratio >= r.breakthroughRatio ? 2 : ratio >= r.advanceRatio ? 1 : 0;
      if (steps > 0) {
        const dir = attacker === a ? 1 : -1;
        const before = fs.boundary;
        fs.boundary = Math.max(0, Math.min(f.regions.length, fs.boundary + dir * steps));
        fr.moved = fs.boundary - before;
        const lo = Math.min(before, fs.boundary);
        const hi = Math.max(before, fs.boundary);
        for (let i = lo; i < hi; i++) {
          const rid = f.regions[i]!;
          if (state.owners[rid] !== attacker) {
            state.owners[rid] = attacker;
            fr.captured.push(rid);
          }
        }
      }
    }
    // 損耗を軍団に配る(戦力に比べて同じ割合)
    for (const s of sides) {
      const loss = fr.losses[s] ?? 0;
      for (const u of state.units) {
        if (u.side !== s || u.front !== fid || u.moving) continue;
        u.strength = Math.max(0, u.strength * (1 - loss));
      }
    }
  }
  // 壊滅:戦力1割を切った軍団

  state.units = state.units.filter((u) => {
    if (u.strength >= DESTROYED_BELOW) return true;
    report.destroyed.push(u.id);
    return false;
  });
  // 7. 補充(月の終わり):弱った軍団に人的資源と工業力を足す(戦線の軍団から。戦いの後に届く)
  for (const side of sides) {
    const weak = state.units.filter((u) => u.side === side && u.strength < 1).sort((a, b) => Number(b.front !== null) - Number(a.front !== null) || a.strength - b.strength);
    for (const u of weak) {
      const t = templateOf(def, state, u.template);
      const want = Math.min(1 - u.strength, r.replacementPerMonth);
      const unitCost = { industry: t.cost.industry * r.replacementShare, manpower: t.cost.manpower * r.replacementShare, fuel: 0 };
      const stock = state.stock[side]!;
      const afford = Math.min(want, ...RESOURCE_KEYS.filter((k) => unitCost[k] > 0).map((k) => stock[k] / unitCost[k]));
      if (afford <= 0) continue;
      pay(stock, unitCost, afford);
      u.strength = Math.min(1, u.strength + afford);
    }
  }

  // 前線の動きで後ろに取り残された軍団は予備へ下げる(戦線から地域がなくなった陣営)
  for (const [fid, f] of Object.entries(def.fronts)) {
    const fs = state.fronts[fid]!;
    const [a, b] = sides as [string, string];
    const lost = fs.boundary <= 0 ? a : fs.boundary >= f.regions.length ? b : null;
    if (!lost) continue;
    for (const u of state.units) if (u.side === lost && u.front === fid) u.front = null;
  }

  state.rng = rng.getState();
  state.history.push(report);
  state.month = m + 1;
  state.result = warResult(def, state);
  return state;
}

/** 戦力がこれを切った軍団は壊滅 */
export const DESTROYED_BELOW = 0.1;

/** 陣営ごとの勝利点(持っている地域の vp) */
export function warVp(def: WarDef, state: WarState): Record<string, number> {
  const vp: Record<string, number> = Object.fromEntries(def.sides.map((s) => [s.id, 0]));
  for (const [rid, owner] of Object.entries(state.owners)) vp[owner] = (vp[owner] ?? 0) + (def.regions[rid]?.vp ?? 0);
  return vp;
}

/** 勝敗:首都を取られた陣営の決定的な負け。期限まで続けば勝利点の差 */
export function warResult(def: WarDef, state: WarState): WarResult | null {
  const vp = warVp(def, state);
  for (const [rid, reg] of Object.entries(def.regions)) {
    if (reg.capitalOf && state.owners[rid] !== reg.capitalOf) {
      const winner = state.owners[rid]!;
      return { winner, level: "decisive", reason: `${reg.name}が落ちた`, vp };
    }
  }
  if (state.month < def.calendar.months) return null;
  const [a, b] = def.sides.map((s) => s.id) as [string, string];
  const d = vp[a]! - vp[b]!;
  const winner = d > 0 ? a : d < 0 ? b : null;
  const level = Math.abs(d) >= def.rules.decisiveVp ? "decisive" : Math.abs(d) >= def.rules.limitedVp ? "limited" : "draw";
  return { winner: level === "draw" ? null : winner, level, reason: "期限", vp };
}

/** 今の月に戦役の地図で戦える、戦線の史実の戦役(人間の陣営がその戦役の陣営を持ち、まだ戦っていない)。なければ null */
export function campaignWindow(def: WarDef, state: WarState, frontId: string, side: string): Front["campaigns"][number] | null {
  const f = def.fronts[frontId];
  const fs = state.fronts[frontId];
  if (!f || !fs || !frontOpen(def, frontId, state.month)) return null;
  if (fs.campaign && (fs.campaign.pending || fs.campaign.until >= state.month)) return null;
  const date = monthDate(def, state.month);
  const fought = new Set(state.fought ?? []);
  return f.campaigns.find((c) => c.from <= date && date <= c.to && !fought.has(c.campaignId) && c.sides[side] !== undefined) ?? null;
}

/** 戦線を戦役の地図で戦い始める(結果が戻るまで戦争は進めない) */
export function startFrontCampaign(def: WarDef, input: WarState, frontId: string, side: string): WarState {
  const w = campaignWindow(def, input, frontId, side);
  if (!w) throw new Error("この戦線は今、戦役の地図では戦えません");
  const state: WarState = structuredClone(input);
  state.fronts[frontId]!.campaign = { campaignId: w.campaignId, until: monthIndex(def, w.to), pending: true };
  state.fought = [...(state.fought ?? []), w.campaignId];
  return state;
}

/**
 * 戦争の戦線の力の比を、戦役の始めの師団・旅団の戦力に映す倍率(陣営ごと。弱い側だけを下げる)。
 * 戦役の始めの総戦力の比(史実)より戦争の戦線の比が開いていれば、劣る側の戦力をその分だけ下げる(下限 0.35)
 */
export function campaignStrengthScale(def: WarDef, state: WarState, frontId: string, histTotals: Record<string, number>, sideMap: Record<string, string>): Record<string, number> {
  const [a, b] = def.sides.map((s) => s.id) as [string, string];
  const pa = frontPower(def, state, frontId, a, "defend");
  const pb = frontPower(def, state, frontId, b, "defend");
  const ha = histTotals[sideMap[a] ?? ""] ?? 0;
  const hb = histTotals[sideMap[b] ?? ""] ?? 0;
  const out: Record<string, number> = { [a]: 1, [b]: 1 };
  if (pa <= 0 || pb <= 0 || ha <= 0 || hb <= 0) return out;
  const q = pa / pb / (ha / hb);
  if (q > 1) out[b] = Math.max(MIN_CAMPAIGN_SCALE, 1 / q);
  else out[a] = Math.max(MIN_CAMPAIGN_SCALE, q);
  return out;
}
/** 戦役の始めの戦力を下げる下限 */
export const MIN_CAMPAIGN_SCALE = 0.35;

/**
 * 戦役の結果を戦争へ戻す:勝った陣営へ前線が動き(決定的2地域・限定的1地域)、両陣営の戦線の軍団が戦役の損耗の割合だけ戦力を失う
 */
export function applyCampaignOutcome(
  def: WarDef,
  input: WarState,
  frontId: string,
  outcome: { winner: string | null; level: "decisive" | "limited" | "draw"; losses: Record<string, number> },
): WarState {
  const state: WarState = structuredClone(input);
  const f = def.fronts[frontId]!;
  const fs = state.fronts[frontId]!;
  if (!fs.campaign?.pending) throw new Error("この戦線は戦役の結果を待っていません");
  const [a] = def.sides.map((s) => s.id) as [string, string];
  const steps = outcome.winner === null || outcome.level === "draw" ? 0 : outcome.level === "decisive" ? 2 : 1;
  const before = fs.boundary;
  fs.boundary = Math.max(0, Math.min(f.regions.length, fs.boundary + (outcome.winner === a ? steps : -steps)));
  const captured: string[] = [];
  for (let i = Math.min(before, fs.boundary); i < Math.max(before, fs.boundary); i++) {
    const rid = f.regions[i]!;
    if (outcome.winner && state.owners[rid] !== outcome.winner) {
      state.owners[rid] = outcome.winner;
      captured.push(rid);
    }
  }
  for (const u of state.units) {
    if (u.front !== frontId || u.moving) continue;
    u.strength = Math.max(0, u.strength * (1 - Math.min(0.9, Math.max(0, outcome.losses[u.side] ?? 0))));
  }
  state.units = state.units.filter((u) => u.strength >= DESTROYED_BELOW);
  fs.campaign = { ...fs.campaign, pending: false };
  (state.campaignResults ??= []).push({ month: state.month, front: frontId, campaignId: fs.campaign.campaignId, winner: outcome.winner, level: outcome.level, moved: fs.boundary - before, captured, losses: outcome.losses });
  state.result = warResult(def, state);
  return state;
}

/** 型を引く(定義の型か、設計した型) */
export function templateOf(def: WarDef, state: Pick<WarState, "designs">, id: string): UnitTemplate {
  const t = templateOrUndef(def, state, id);
  if (!t) throw new Error(`型 "${id}" がありません`);
  return t;
}
export function templateOrUndef(def: WarDef, state: Pick<WarState, "designs">, id: string): UnitTemplate | undefined {
  return def.templates[id] ?? state.designs?.[id];
}

/**
 * 世代の上限(W4):種類ごとの設計の質の上限。その種類に効く系統樹の項目(その種類の型を開く・その種類の力を上げる)を
 * 研究した数 × rules.design.qualityPerTech(上限 maxQuality)
 */
export function designCap(def: WarDef, state: WarState, side: string, kind: UnitTemplate["kind"]): number {
  const d = def.rules.design;
  let n = 0;
  for (const id of state.research[side]?.done ?? []) {
    const t = def.tech[id];
    if (!t) continue;
    if ((t.boost[kind] ?? 1) > 1 || t.unlocks.some((u) => def.templates[u]?.kind === kind)) n++;
  }
  return Math.min(d.maxQuality, n * d.qualityPerTech);
}

/** 設計した型の性能と値段(もとの型 × 質と振り分け) */
export function designTemplate(def: WarDef, state: WarState, side: string, o: DesignOrder): Omit<WarDesign, "availableMonth"> | string {
  const d = def.rules.design;
  const base = templateOrUndef(def, state, o.base);
  if (!base || base.side !== side) return `もとにする型がありません:${o.base}`;
  if (!buildable(def, state, side).includes(o.base)) return `まだ作れない型はもとにできません:${base.name}`;
  if ("base" in base) return "設計した型をもとにはできません(定義の型から設計してください)";
  if (base.kind === "air" && o.shift !== 0) return "航空軍は攻め・守りの振り分けができません";
  const cap = designCap(def, state, side, base.kind);
  const q = Math.max(0, Math.min(cap, o.quality));
  const sh = Math.max(-d.maxShift, Math.min(d.maxShift, o.shift));
  if (o.quality > cap + 1e-9) return `この世代の質の上限は ${Math.round(cap * 100)}% です`;
  const name = o.name.trim().slice(0, 40) || `${base.name}(改)`;
  return {
    ...base,
    name,
    base: o.base,
    quality: q,
    shift: sh,
    attack: base.attack * (1 + q + sh),
    defense: base.defense * (1 + q - sh),
    cost: { industry: base.cost.industry * (1 + d.costPerQuality * q), manpower: base.cost.manpower, fuel: base.cost.fuel * (1 + q) },
    months: base.months + Math.ceil(q * d.monthsPerQuality),
    fuelPerAttack: base.fuelPerAttack * (1 + q + Math.max(0, sh)),
    notes: `${base.name}をもとに、質 +${Math.round(q * 100)}%・${sh >= 0 ? "攻め" : "守り"}寄り ${Math.round(Math.abs(sh) * 100)}%`,
  };
}

/** 設計にかかる工業力(試作と生産の準備) */
export function designPrice(def: WarDef, o: Pick<DesignOrder, "quality">): number {
  return def.rules.design.industry * (1 + Math.max(0, o.quality) * 4);
}
