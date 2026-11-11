import { distanceKm, wingDef } from "./air.js";
import { campaignToes as campaignToesOf, type CampaignBattle, type CampaignEnv, type CampaignState } from "./campaign.js";
import type { CampaignDef } from "./schema.js";

/** 海戦に出る陸の航空隊の、盤上の航空隊のユニット1つ */
export interface LandAirUnit {
  id: string;
  side: string;
  wing: string;
  kind: "fighter" | "strike" | "scout";
  toe: string;
  /** このユニットの機数(編成表の機数 × strength) */
  planes: number;
  strength: number;
  airfield: { name: string; bearingDeg: number; distanceM: number };
}

/**
 * 海戦に出る陸の航空隊を、盤上の航空隊(空母の艦載機と同じ仕組み)のユニットに直す。航空隊の基地は地図の外の飛行場
 * (海域から見た方位と、作戦地図の上の距離)。機数 = 編隊の数 × 1編隊の機数 × 出す割合 を、編成表の機数ごとのユニットに分ける
 * (最後の1つは端数の戦力)。攻撃機のある航空隊には索敵機を1つ足す(機数には数えない)
 */
export function landAirUnits(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv): LandAirUnit[] {
  const n = def.naval;
  if (!n) return [];
  const toes = campaignToesOf(def, env);
  const at = def.regions[battle.region]!;
  const out: LandAirUnit[] = [];
  for (const [side, ids] of Object.entries(battle.air ?? {})) {
    for (const wid of [...ids].sort()) {
      const w = state.wings?.[wid];
      const d = wingDef(def, wid);
      if (!w || !d) continue;
      const share = battle.airShare?.[wid] ?? 1;
      const base = def.regions[w.base]!;
      const deg = (Math.atan2(base.x - at.x, base.y - at.y) * 180) / Math.PI;
      const airfield = { name: base.name, bearingDeg: Math.round((deg + 360) % 360), distanceM: Math.max(1000, Math.round(distanceKm(def, w.base, battle.region) * 1000)) };
      const per = def.rules.air.airOps?.aircraftPerGroup ?? { fighter: n.landAir.aircraftPerGroup, strike: n.landAir.aircraftPerGroup };
      const kinds: ["fighter" | "strike", number][] = [
        ["fighter", w.fighters * share * per.fighter],
        ["strike", w.strike * share * per.strike],
      ];
      for (const [kind, total] of kinds) {
        const toe = d.navalToes?.[kind] ?? n.landAir[kind];
        const size = toes[toe]?.elements.reduce((t, e) => t + e.count, 0) ?? 0;
        if (size <= 0 || total < 0.5) continue;
        const planes = Math.round(total);
        const units = Math.ceil(planes / size);
        for (let i = 0; i < units; i++) {
          const p = Math.min(size, planes - i * size);
          out.push({ id: `${wid}~${kind === "fighter" ? "f" : "a"}${i + 1}`, side, wing: wid, kind, toe, planes: p, strength: Math.round((p / size) * 1000) / 1000, airfield });
        }
      }
      const scout = d.navalToes?.scout ?? n.landAir.scout;
      if (scout && w.strike * share > 0 && toes[scout]) out.push({ id: `${wid}~r1`, side, wing: wid, kind: "scout", toe: scout, planes: 0, strength: 1, airfield });
    }
  }
  return out;
}

/**
 * 海域での戦闘の戦術シナリオ(海戦。海だけの地図)。陣営の並びの先の陣営が西、後の陣営が東から、gapKm 離れて向かい合う。
 * 艦は1隻ずつのユニットで、艦隊の戦隊(艦の squadron)ごとに上級部隊にする。航空隊は母艦に載せて置く。勝敗は敵に与えた損耗(決定的 35%・限定 15%。仮置き)。
 * 天候は晴れのまま(曇ると航空隊が飛べないので、海戦の手触りを保つ)。空母のいない海戦は種で夜に始めることがあり(naval.nightShare)、海の局地のスコールを置く。ID は camp:キャンペーン:段階:海域
 */
export function navalBattleFile(def: CampaignDef, state: CampaignState, battle: CampaignBattle, env: CampaignEnv, seed: number): Record<string, unknown> {
  const n = def.naval;
  if (!n) throw new Error("このキャンペーンには海戦の決まり(naval)がありません");
  const era = env.generator.eras[def.era];
  if (!era) throw new Error(`編成 "${def.era}" がありません`);
  const flat = (x: string | string[]) => (Array.isArray(x) ? x : [x]);
  const CELL = 1000;
  const W = Math.round(n.widthKm);
  const H = Math.round(n.heightKm);
  const sideIds = def.sides.map((s) => s.id);
  const midX = (W * CELL) / 2;
  // 夜戦:空母のいない(艦上の航空隊が出ていない)海戦は、種で決まった割合を夜に始める(空母の海戦は昼)。夜は近くから(見えない間合いで)向かい合う
  const hash = (k: number) => {
    let h = (seed ^ Math.imul(k, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const landAir = landAirUnits(def, state, battle, env);
  // 空母か陸の攻撃機のいる海戦・艦隊への空襲は昼に始める
  const carriers = !!battle.airRaid || landAir.some((x) => x.kind === "strike") || sideIds.some((side) => (battle.sides[side]?.units ?? []).some((id) => state.units[id]?.base));
  const night = !carriers && hash(1) < n.nightShare;
  const half = Math.min(night ? n.nightGapKm : n.gapKm, n.widthKm - 10) * 500;
  // 種ごとに、両艦隊の南北の位置を少しずらす(毎回同じ形にならないように)
  const shift = ((seed % 21) - 10) * 1000;
  const units: Record<string, unknown>[] = [];
  // 表示名:艦隊の名前と編成表の名前の頭(「空母の戦隊」など)
  const toes = campaignToesOf(def, env);
  const nameOf = (id: string) => {
    const u = state.units[id]!;
    const f = def.formations.find((x) => x.id === u.formation)?.name ?? u.formation;
    return `${f}・${(toes[u.toe]?.name ?? u.toe).split("(")[0]}`;
  };
  // 戦隊:艦隊(キャンペーンの師団・旅団の形)ごとに、艦の squadron の名前で分ける(省略は艦隊で1つ)。先に書いた艦が旗艦。
  // 戦隊は縦に間を空けて並べ、戦隊の中は旗艦の後ろへ 600m 間隔の一列(単縦陣の持ち場)に置く。航空隊は母艦に載せる
  const formations: Record<string, { name: string; side: string; parent?: string; units: string[] }> = {};
  sideIds.forEach((side, i) => {
    const x0 = i === 0 ? midX - half : midX + half;
    const facing = i === 0 ? 90 : 270;
    const back = i === 0 ? -1 : 1;
    const ids = battle.sides[side]?.units ?? [];
    const groups = new Map<string, { fleet: string; ships: string[] }>();
    for (const id of ids) {
      const u = state.units[id]!;
      if (u.base) continue;
      const key = `${u.formation}:${u.squadron ?? ""}`;
      if (!groups.has(key)) groups.set(key, { fleet: u.formation, ships: [] });
      groups.get(key)!.ships.push(id);
    }
    const list = [...groups.entries()];
    list.forEach(([key, g], k) => {
      const y = (H * CELL) / 2 + (i === 0 ? shift : -shift) + (k - (list.length - 1) / 2) * 8000;
      g.ships.forEach((id, m) => {
        const u = state.units[id]!;
        units.push({ id, side, name: nameOf(id), toe: u.toe, x: x0 + 500 + back * m * 600, y: y + 500, facing, strength: Math.max(0.01, u.strength), morale: u.morale, ammo: u.ammo, fuel: u.fuel, training: u.training });
      });
      const fleetName = def.formations.find((x) => x.id === g.fleet)?.name ?? g.fleet;
      const sq = key.split(":")[1];
      formations[`${g.fleet}:${sq || "main"}`] = { name: sq ? `${fleetName}・${sq}` : fleetName, side, parent: g.fleet, units: g.ships };
      formations[g.fleet] ??= { name: fleetName, side, units: [] };
    });
    for (const id of ids) {
      const u = state.units[id]!;
      if (!u.base) continue;
      const carrier = units.find((x) => x.id === u.base);
      if (!carrier) continue;
      units.push({ id, side, name: nameOf(id), toe: u.toe, x: carrier.x, y: carrier.y, facing, strength: Math.max(0.01, u.strength), morale: u.morale, fuel: u.fuel, training: u.training, air: { baseId: u.base } });
      formations[u.formation]?.units.push(id);
    }
  });
  // スコールは種で置く(決まった種で同じ戦場になる)
  const darkTurns = night ? [{ from: 1, to: Math.max(1, Math.round((n.nightHours * 60) / n.turnMinutes)) }] : [];
  const squalls = Array.from({ length: n.squalls }, (_, i) => ({
    x: Math.round(W * CELL * (0.25 + 0.5 * hash(10 + i * 3))),
    y: Math.round(H * CELL * (0.15 + 0.7 * hash(11 + i * 3))),
    radiusM: Math.round(2500 + 2500 * hash(12 + i * 3)),
  }));
  // 陸の航空隊:地図の外の飛行場から飛ぶ盤上の航空隊(陣営ごとに「陸の航空隊」の上級部隊、航空隊ごとにその下)
  for (const x of landAir) {
    const d = wingDef(def, x.wing)!;
    units.push({ id: x.id, side: x.side, name: `${d.name}${x.kind === "scout" ? "(索敵)" : ""}`, toe: x.toe, facing: 0, strength: x.strength, air: { airfield: x.airfield } });
    const top = `${x.side}~landair`;
    formations[top] ??= { name: "陸の航空隊", side: x.side, units: [] };
    formations[`${x.wing}~wing`] ??= { name: d.name, side: x.side, parent: top, units: [] };
    formations[`${x.wing}~wing`]!.units.push(x.id);
  }
  const region = def.regions[battle.region]!;
  const date = state.history.length ? state.history[state.history.length - 1]!.date : def.calendar.startDate;
  return {
    id: `camp:${def.id}:${state.stage}:${battle.region}`,
    name: `${region.name}の${battle.airRaid ? "空襲" : night ? "夜戦" : "海戦"}`,
    description: `キャンペーン「${def.name}」の段階 ${state.stage} の海戦(${date} ごろ)。${region.name}の制海権を争う。自動で作った海だけの戦場`,
    notes: "キャンペーンの海戦(packages/campaign/src/naval.ts)。配置・勝敗の閾値は仮置き",
    packs: { rules: env.generator.rules, branches: env.generator.branches, weapons: [...flat(era.weapons), ...n.weapons], toe: [...flat(era.toe), ...n.toe] },
    sides: def.sides.map((s) => ({ id: s.id, name: s.name })),
    time: { turnSeconds: n.turnMinutes * 60, stepSeconds: 60, startHour: night ? n.nightStartHour : 6 },
    map: { cellSizeM: CELL, legend: { "~": "sea" }, rows: Array.from({ length: H }, () => "~".repeat(W)) },
    roads: { nodes: {}, edges: [] },
    rules: {
      maxTurns: Math.max(1, Math.round((n.hours * 60) / n.turnMinutes)),
      darkTurns,
      squalls,
      objectives: [],
      victory: Object.fromEntries(
        sideIds.map((s) => [s, { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.35 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.15 } }]),
      ),
      commandPoints: {},
      weather: { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 },
      air: {},
      reinforcements: [],
    },
    units,
    depots: [],
    formations,
  };
}
