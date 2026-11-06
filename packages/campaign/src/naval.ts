import { battleAirRules } from "./air.js";
import { campaignToes as campaignToesOf, type CampaignBattle, type CampaignEnv, type CampaignState } from "./campaign.js";
import type { CampaignDef } from "./schema.js";

/**
 * 海域での戦闘の戦術シナリオ(海戦。海だけの地図)。陣営の並びの先の陣営が西、後の陣営が東から、gapKm 離れて向かい合う。
 * 艦隊の戦隊は縦に並べ、航空隊は母艦に載せて置く。勝敗は敵に与えた損耗(決定的 35%・限定 15%。仮置き)。
 * 天候は晴れのまま(曇ると航空隊が飛べないので、海戦の手触りを保つ)。ID は camp:キャンペーン:段階:海域
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
  const half = Math.min(n.gapKm, n.widthKm - 10) * 500;
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
  sideIds.forEach((side, i) => {
    const x0 = i === 0 ? midX - half : midX + half;
    const facing = i === 0 ? 90 : 270;
    const ids = battle.sides[side]?.units ?? [];
    const ships = ids.filter((id) => !state.units[id]!.base);
    ships.forEach((id, k) => {
      const u = state.units[id]!;
      const y = (H * CELL) / 2 + (i === 0 ? shift : -shift) + (k - (ships.length - 1) / 2) * 6000;
      units.push({ id, side, name: nameOf(id), toe: u.toe, x: x0 + 500, y: y + 500, facing, strength: Math.max(0.01, u.strength), morale: u.morale, ammo: u.ammo, fuel: u.fuel, training: u.training });
    });
    for (const id of ids) {
      const u = state.units[id]!;
      if (!u.base) continue;
      const carrier = units.find((x) => x.id === u.base);
      if (!carrier) continue;
      units.push({ id, side, name: nameOf(id), toe: u.toe, x: carrier.x, y: carrier.y, facing, strength: Math.max(0.01, u.strength), morale: u.morale, fuel: u.fuel, training: u.training, air: { baseId: u.base } });
    }
  });
  const region = def.regions[battle.region]!;
  const air = battleAirRules(def, state, battle);
  const date = state.history.length ? state.history[state.history.length - 1]!.date : def.calendar.startDate;
  return {
    id: `camp:${def.id}:${state.stage}:${battle.region}`,
    name: `${region.name}の海戦`,
    description: `キャンペーン「${def.name}」の段階 ${state.stage} の海戦(${date} ごろ)。${region.name}の制海権を争う。自動で作った海だけの戦場`,
    notes: "キャンペーンの海戦(packages/campaign/src/naval.ts)。配置・勝敗の閾値は仮置き",
    packs: { rules: env.generator.rules, branches: env.generator.branches, weapons: [...flat(era.weapons), ...n.weapons], toe: [...flat(era.toe), ...n.toe] },
    sides: def.sides.map((s) => ({ id: s.id, name: s.name })),
    time: { turnSeconds: 3600, stepSeconds: 60, startHour: 6 },
    map: { cellSizeM: CELL, legend: { "~": "sea" }, rows: Array.from({ length: H }, () => "~".repeat(W)) },
    roads: { nodes: {}, edges: [] },
    rules: {
      maxTurns: n.turns,
      objectives: [],
      victory: Object.fromEntries(
        sideIds.map((s) => [s, { decisive: { required: [], minWeight: 0, minEnemyLoss: 0.35 }, limited: { required: [], minWeight: 0, minEnemyLoss: 0.15 } }]),
      ),
      commandPoints: {},
      weather: { initial: "clear", changeChancePerHour: 0, minHoursBetweenChanges: 0, improveChance: 0.5 },
      air,
      reinforcements: [],
    },
    units,
    depots: [],
  };
}
