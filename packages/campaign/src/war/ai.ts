import { RESOURCE_KEYS, type WarDef } from "./schema.js";
import { attackFuel, buildable, frontOpen, frontPower, monthIndex, researchable, unitsAt, type Posture, type WarOrders, type WarState } from "./war.js";

/**
 * 戦争の AI(陣営ごとの1か月の命令)。戦争の層は霧なし(両陣営の軍団の数と力を知っている)。
 * - 研究:工業力の2割を、いちばん安い次の項目へ(型を開く項目を先に)
 * - 生産:備蓄の2割を残して、機甲1:歩兵2・陸5に航空1の割合で、力あたりの値段の安い型から
 * - 配分:予備の軍団を、足りない戦線(開いている・2か月のうちに開く)へ。余っている戦線から足りない戦線へ1か月に2つまで
 * - 構え:攻めの力が守りの力 × 地形の倍率 × advanceRatio を超え、燃料が足りる戦線は攻勢
 */
export function warOrders(def: WarDef, state: WarState, side: string): WarOrders {
  const r = def.rules;
  const enemy = def.sides.find((s) => s.id !== side)!.id;
  const out: WarOrders = { researchShare: Math.min(r.maxResearchShare, 0.2), produce: [], moves: [], postures: {} };

  // 研究
  const rs = state.research[side]!;
  if (!rs.current) {
    const can = researchable(def, state, side).sort((a, b) => Number(def.tech[b]!.unlocks.length > 0) - Number(def.tech[a]!.unlocks.length > 0) || def.tech[a]!.cost - def.tech[b]!.cost || (a < b ? -1 : 1));
    if (can[0]) out.research = can[0];
  }

  // 生産:最良の型(力の和 ÷ 値段)を種類ごとに選び、足りない種類から
  const stock = { ...state.stock[side]! };
  const types = buildable(def, state, side);
  const value = (tid: string) => {
    const t = def.templates[tid]!;
    const price = t.cost.industry + t.cost.manpower * 0.5 + t.cost.fuel * 0.5 + 1;
    return (t.attack + t.defense + (t.kind === "air" ? 4 : 0)) / price;
  };
  const best = (kind: string) => types.filter((t) => def.templates[t]!.kind === kind).sort((a, b) => value(b) - value(a) || (a < b ? -1 : 1))[0];
  const mine = state.units.filter((u) => u.side === side);
  const count = (kind: string) => mine.filter((u) => def.templates[u.template]!.kind === kind).length + state.queue.filter((q) => q.side === side && def.templates[q.template]!.kind === kind).length;
  const keep = Object.fromEntries(RESOURCE_KEYS.map((k) => [k, state.stock[side]![k] * 0.2]));
  for (let i = 0; i < 12; i++) {
    const inf = count("infantry");
    const arm = count("armor");
    const air = count("air");
    const kind = air * 5 < inf + arm ? "air" : arm * 2 < inf ? "armor" : "infantry";
    const tid = best(kind) ?? best("infantry");
    if (!tid) break;
    const t = def.templates[tid]!;
    if (!RESOURCE_KEYS.every((k) => stock[k] - t.cost[k] >= keep[k]! || t.cost[k] === 0)) break;
    for (const k of RESOURCE_KEYS) stock[k] -= t.cost[k];
    out.produce!.push(tid);
    state = { ...state, queue: [...state.queue, { side, template: tid, done: state.month + t.months }] };
  }

  // 配分:戦線ごとの不足(敵の攻めの力 × 1.2 − 自分の守りの力)。2か月のうちに開く戦線も数える
  const soon = (fid: string) => frontOpen(def, fid, state.month) || (def.fronts[fid]!.opens !== undefined && monthIndex(def, def.fronts[fid]!.opens!) <= state.month + 2);
  const fronts = Object.keys(def.fronts).filter((fid) => soon(fid) && !frontClosedSoon(def, fid, state.month));
  const need = new Map(
    fronts.map((fid) => {
      const mineP = frontPower(def, state, fid, side, "defend");
      const theirs = frontPower(def, state, fid, enemy, "attack") * 1.2;
      const opening = !frontOpen(def, fid, state.month);
      // 開く前の戦線は、敵がいなくても守備隊を置く(上陸に備える。開く戦線の広さの3分の1)
      const garrison = opening ? (def.fronts[fid]!.maxCorps ?? 6) / 3 : 0;
      return [fid, Math.max(theirs - mineP, garrison * 8 - mineP)] as const;
    }),
  );
  const reserves = mine.filter((u) => u.front === null && !u.moving && def.templates[u.template]!.kind !== "air");
  const moves = out.moves!;
  const power = (uid: string) => {
    const u = mine.find((x) => x.id === uid)!;
    const t = def.templates[u.template]!;
    return t.defense * u.strength;
  };
  for (const u of reserves) {
    const target = [...need.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    // 不足がなければ、いちばん大きな戦線(攻めに使う)
    const fid = target && target[1] > 0 ? target[0] : fronts.sort((a, b) => frontPower(def, state, b, enemy, "defend") - frontPower(def, state, a, enemy, "defend") || (a < b ? -1 : 1))[0];
    if (!fid) break;
    moves.push({ unitId: u.id, to: fid });
    need.set(fid, (need.get(fid) ?? 0) - power(u.id));
  }
  // 航空軍:いちばん敵の力の大きな開いた戦線へ
  for (const u of mine.filter((x) => x.front === null && !x.moving && def.templates[x.template]!.kind === "air")) {
    const fid = fronts.filter((f) => frontOpen(def, f, state.month)).sort((a, b) => frontPower(def, state, b, enemy, "attack") - frontPower(def, state, a, enemy, "attack") || (a < b ? -1 : 1))[0];
    if (fid) moves.push({ unitId: u.id, to: fid });
  }
  // 余っている戦線から、足りない戦線へ(1か月に2つまで)
  let shifted = 0;
  for (const [fid, n] of [...need.entries()].sort((a, b) => b[1] - a[1])) {
    if (n <= 0 || shifted >= 2) break;
    for (const [src, m] of [...need.entries()].sort((a, b) => a[1] - b[1])) {
      if (m >= -15 || src === fid || shifted >= 2) continue;
      const u = unitsAt(state, src, side).filter((x) => def.templates[x.template]!.kind !== "air").sort((a, b) => power(b.id) - power(a.id))[0];
      if (!u || moves.some((x) => x.unitId === u.id)) continue;
      moves.push({ unitId: u.id, to: fid });
      need.set(src, m + power(u.id));
      shifted++;
    }
  }

  // 構え
  let fuel = state.stock[side]!.fuel;
  for (const fid of Object.keys(def.fronts)) {
    if (!frontOpen(def, fid, state.month)) continue;
    const f = def.fronts[fid]!;
    const att = frontPower(def, state, fid, side, "attack");
    const fs = state.fronts[fid]!;
    const nextLost = side === def.sides[0].id ? f.regions[fs.boundary] : f.regions[fs.boundary - 1];
    const home = nextLost !== undefined && def.regions[nextLost]!.owner === enemy ? r.homeDefense : 1;
    const def_ = frontPower(def, state, fid, enemy, "defend") * f.defenseMultiplier * home;
    const fuelNeed = attackFuel(def, state, fid, side);
    let p: Posture = att >= def_ * r.advanceRatio * 1.05 && att > 0 && fuel >= fuelNeed ? "attack" : "defend";
    if (p === "attack") fuel -= fuelNeed;
    out.postures![fid] = p;
  }
  return out;
}

function frontClosedSoon(def: WarDef, fid: string, m: number): boolean {
  const c = def.fronts[fid]!.closes;
  return c !== undefined && monthIndex(def, c) < m;
}
