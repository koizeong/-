import { Rng, toeCost, type PackSet, type Toe, type WeaponPack } from "@brigade/sim-core";
import { z } from "zod";
import type { Biome } from "./biome.js";
import { generateMap, type GeneratedMap, type Role } from "./map.js";

/**
 * 自動生成の任務:地図・兵力・配置・目標・勝利条件(秘密の副目標も)を、シナリオファイルの形で作る。
 * シナリオの ID に生成の設定とシードを書くので、ID から同じシナリオを作り直せる(記録・続きから・オンライン対戦)
 */

const RosterSchema = z.array(z.object({ toe: z.string().min(1), min: z.number().int().min(0), max: z.number().int().min(0), weight: z.number().positive() }));
export const GeneratorDataSchema = z.object({
  id: z.string(),
  notes: z.string().optional(),
  rules: z.string(),
  branches: z.string(),
  eras: z.record(
    z.string(),
    z.object({
      name: z.string(),
      weapons: z.union([z.string(), z.array(z.string()).min(1)]),
      toe: z.union([z.string(), z.array(z.string()).min(1)]),
      /** convoy:輸送の護衛で送り届ける部隊の編成表 */
      sides: z.tuple([
        z.object({ id: z.string(), name: z.string(), roster: RosterSchema, convoy: z.string().optional() }),
        z.object({ id: z.string(), name: z.string(), roster: RosterSchema, convoy: z.string().optional() }),
      ]),
    }),
  ),
  missions: z.record(
    z.string(),
    z.object({
      name: z.string(),
      description: z.string(),
      turns: z.number().int().positive(),
      /** 攻める側の兵力(点数)÷ 守る側の兵力。遭遇戦は1 */
      forceRatio: z.number().positive(),
      /** 目標の数 */
      objectives: z.number().int().min(1),
      /** 攻める側の急ぎ度(勝利条件の urgency。AI が遮二無二の突撃をかけ始める時期) */
      attackerUrgency: z.number().min(0).max(1).default(0.5),
      /** 輸送の護衛:待ち伏せる側が始める位置(護送する側の端からの、軸の長さに対する割合)。省略は相手の配置帯 */
      ambushAt: z.number().min(0).max(1).optional(),
      /** 輸送の護衛:待ち伏せる側の機動部隊のうち、道筋のそばに伏せて始める割合と、そのときの姿勢(ルールパックの姿勢) */
      ambushShare: z.number().min(0).max(1).default(0),
      ambushStance: z.string().optional(),
    }),
  ),
  depot: z.object({ ammoT: z.number().min(0), fuelT: z.number().min(0) }),
  startHour: z.number().min(0).lt(24),
  /** 配置帯の奥行き(地図の軸の長さに対する割合) */
  zoneDepth: z.number().positive().max(0.4),
  /** 遭遇戦の目標までの所要時間の差の許容(割合)。これを超える町は目標にしない */
  fairness: z.number().positive(),
});
export type GeneratorData = z.infer<typeof GeneratorDataSchema>;

export type MapSize = "s" | "m" | "l";
export const MAP_SIZES: Record<MapSize, { name: string; widthM: number; heightM: number }> = {
  s: { name: "小", widthM: 10000, heightM: 8000 },
  m: { name: "中", widthM: 14000, heightM: 10000 },
  l: { name: "大", widthM: 20000, heightM: 15000 },
};

export interface ScenarioSpec {
  mission: string;
  biome: string;
  size: MapSize;
  era: string;
  seed: number;
}

const ID_PREFIX = "gen";
/** 生成の設定を書いたシナリオの ID(gen:任務:地形の傾向:大きさ:編成:シード) */
export function specId(s: ScenarioSpec): string {
  return [ID_PREFIX, s.mission, s.biome, s.size, s.era, s.seed].join(":");
}
export function parseSpecId(id: string): ScenarioSpec | null {
  const p = id.split(":");
  if (p.length !== 6 || p[0] !== ID_PREFIX) return null;
  const seed = Number(p[5]);
  if (!(p[3]! in MAP_SIZES) || !Number.isInteger(seed)) return null;
  return { mission: p[1]!, biome: p[2]!, size: p[3] as MapSize, era: p[4]!, seed };
}

/** 生成の結果:シナリオファイル(buildScenario で読む)と、公平さの見積もり */
export interface GeneratedScenario {
  file: Record<string, unknown>;
  map: GeneratedMap;
  /** 目標ごとの、両軍の配置帯からの所要時間(分)。遭遇戦の公平さの目安 */
  objectiveTimes: { id: string; minutes: [number, number] }[];
}

/** 地形の役割ごとの徒歩の速さ(平地を1。所要時間の見積もり用)。道路はこれに関係なく速い */
const FOOT: Record<Role, number> = { open: 1, wood: 0.5, wood2: 0.8, town: 0.8, hill: 0.7, peak: 0, river: 0.2, bigRiver: 0 };
const ROAD_SPEED = 1.5;

export function generateScenario(spec: ScenarioSpec, data: GeneratorData, biomes: Record<string, Biome>, packs: PackSet): GeneratedScenario {
  const biome = biomes[spec.biome];
  const era = data.eras[spec.era];
  const mission = data.missions[spec.mission];
  if (!biome || !era || !mission) throw new Error(`生成の設定が正しくありません: ${specId(spec)}`);
  const size = MAP_SIZES[spec.size];
  const map = generateMap({ seed: spec.seed, widthM: size.widthM, heightM: size.heightM, cellSizeM: 250, biome });
  // 地図とは別の乱数の流れ(地図を変えずに、兵力・目標だけを決める)
  const rng = Rng.fromSeed((spec.seed * 7919 + 17) >>> 0);
  const cell = map.map.cellSizeM;
  const rows = map.roles.length;
  const cols = map.roles[0]!.length;
  const L = map.axis === "ew" ? size.widthM : size.heightM;
  const P = map.axis === "ew" ? size.heightM : size.widthM;
  /** 軸の上の位置(0 = 陣営0の端、L = 陣営1の端)と、横の位置 */
  const along = (p: { x: number; y: number }) => (map.axis === "ew" ? p.x : p.y);
  const across = (p: { x: number; y: number }) => (map.axis === "ew" ? p.y : p.x);
  const at = (a: number, c: number) => (map.axis === "ew" ? { x: a, y: c } : { x: c, y: a });
  const center = (c: number, r: number) => ({ x: (c + 0.5) * cell, y: (rows - r - 0.5) * cell });
  const cellOf = (p: { x: number; y: number }): [number, number] => [
    Math.min(cols - 1, Math.max(0, Math.floor(p.x / cell))),
    Math.min(rows - 1, Math.max(0, rows - 1 - Math.floor(p.y / cell))),
  ];
  const role = (p: { x: number; y: number }) => {
    const [c, r] = cellOf(p);
    return map.roles[r]![c]!;
  };
  const depth = data.zoneDepth * L;

  // 所要時間の場(配置帯から各マスまで、徒歩・道路で何分か)
  const roadCells = rasterRoads(map, cell, rows, cols);
  const timeFrom = (side: 0 | 1) => travelField(map, roadCells, cell, (c, r) => {
    const a = along(center(c, r));
    return side === 0 ? a <= depth : a >= L - depth;
  });
  const times: [Float64Array, Float64Array] = [timeFrom(0), timeFrom(1)];
  const minutesAt = (p: { x: number; y: number }): [number, number] => {
    const [c, r] = cellOf(p);
    return [times[0][r * cols + c]!, times[1][r * cols + c]!];
  };
  const imbalance = (p: { x: number; y: number }) => {
    const [a, b] = minutesAt(p);
    return !Number.isFinite(a) || !Number.isFinite(b) ? Infinity : Math.abs(a - b) / Math.max(a, b, 1);
  };

  // 目標
  const attacker: 0 | 1 = rng.next() < 0.5 ? 0 : 1;
  const defender: 0 | 1 = attacker === 0 ? 1 : 0;
  const defense = spec.mission === "attack-defense";
  // 輸送の護衛:守る側(defender)が護送する部隊を、自陣営の側の地図の端から反対の端の合流点まで送り届け、攻める側(attacker)が待ち伏せる
  const escort = spec.mission === "escort";
  const objectives: { id: string; name: string; x: number; y: number; radiusM: number; weight: number; initialHolder: string | null }[] = [];
  // 目標どうしは離す(地図の横幅の5分の1以上、2km以上)
  const gap = Math.max(2000, P / 5);
  const spaced = (p: { x: number; y: number }) => objectives.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= gap);
  /** 横の真ん中からのずれ(0〜0.5)。端の目標は奪い合いにならないので避ける */
  const offCenter = (p: { x: number; y: number }) => Math.abs(across(p) / P - 0.5);
  const sideId = (i: 0 | 1) => era.sides[i].id;
  // 守る側の半分:攻める側から見て 0.5〜0.85 の帯
  const inDefenseBand = (p: { x: number; y: number }) => {
    const a = along(p) / L;
    const fromAtt = attacker === 0 ? a : 1 - a;
    return fromAtt >= 0.45 && fromAtt <= 0.85;
  };
  const inMiddle = (p: { x: number; y: number }) => along(p) >= L * 0.25 && along(p) <= L * 0.75;
  const townsBy = [...map.towns].filter((t) => (defense ? inDefenseBand(t) : inMiddle(t)));
  if (defense) townsBy.sort((a, b) => fromAttacker(a) - fromAttacker(b));
  else townsBy.sort((a, b) => imbalance(a) + offCenter(a) * 0.3 - (imbalance(b) + offCenter(b) * 0.3));
  function fromAttacker(p: { x: number; y: number }) {
    const a = along(p) / L;
    return attacker === 0 ? a : 1 - a;
  }
  // 護送:出発点は自陣営の側の地図の横の端、送り届ける先は反対の横の端の近く(自陣営寄り、軸の3割の所)
  const fromSide = (i: 0 | 1, frac: number) => (i === 0 ? frac * L : L - frac * L);
  const convoyStart = at(fromSide(defender, 0.3), P * 0.06);
  if (escort) {
    const want = at(fromSide(defender, 0.3), P * 0.9);
    const town = map.towns
      .filter((t) => across(t) >= P * 0.7 && Math.abs(along(t) - along(want)) <= L * 0.2)
      .sort((a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y))[0];
    const dest = town ?? want;
    objectives.push({ id: "obj1", name: town?.name ?? "合流点", x: dest.x, y: dest.y, radiusM: 600, weight: 0, initialHolder: null });
  }
  for (const t of townsBy) {
    if (objectives.length >= mission.objectives) break;
    if (!defense && imbalance(t) > data.fairness) continue;
    if (!spaced(t)) continue;
    objectives.push({ id: `obj${objectives.length + 1}`, name: t.name, x: t.x, y: t.y, radiusM: 500, weight: 1, initialHolder: null });
  }
  // 町が足りなければ、地形の要所(高地を好む。遭遇戦は両軍から同じくらいの所)を目標にする
  if (objectives.length < mission.objectives) {
    const spots: { p: { x: number; y: number }; score: number }[] = [];
    for (let r = 2; r < rows - 2; r += 2) {
      for (let c = 2; c < cols - 2; c += 2) {
        const p = center(c, r);
        const rl = map.roles[r]![c]!;
        if (rl === "river" || rl === "bigRiver" || rl === "peak") continue;
        if (defense ? !inDefenseBand(p) : !inMiddle(p)) continue;
        if (offCenter(p) > 0.42) continue;
        if (!defense && imbalance(p) > data.fairness) continue;
        const score = (defense ? Math.abs(fromAttacker(p) - 0.6) : imbalance(p)) + offCenter(p) * 0.3 - (rl === "hill" ? 0.08 : 0) + rng.next() * 0.02;
        if (Number.isFinite(score)) spots.push({ p, score });
      }
    }
    spots.sort((a, b) => a.score - b.score);
    for (const s of spots) {
      if (objectives.length >= mission.objectives) break;
      if (!spaced(s.p)) continue;
      const n = objectives.length + 1;
      objectives.push({ id: `obj${n}`, name: role(s.p) === "hill" ? `${n}号高地` : `${n}号地点`, ...s.p, radiusM: 500, weight: 1, initialHolder: null });
    }
  }
  // それでも足りなければ(大河に橋がなく片方から届かない・目標どうしを離せないなど)、真ん中の帯の中で、
  // 遭遇戦は所要時間の差の小さい所、攻撃と防御は攻める側から6割の所を、目標どうしの間を半分まで詰めて選ぶ
  if (objectives.length < mission.objectives) {
    const pool: { p: { x: number; y: number }; score: number }[] = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const p = center(c, r);
        const rl = map.roles[r]![c]!;
        if (rl === "river" || rl === "bigRiver" || rl === "peak" || Math.abs(along(p) - L / 2) > L * 0.3) continue;
        const im = imbalance(p);
        pool.push({ p, score: (defense ? Math.abs(fromAttacker(p) - 0.6) : Number.isFinite(im) ? im : 9) + offCenter(p) * 0.3 });
      }
    }
    pool.sort((x, y) => x.score - y.score);
    for (const { p } of pool) {
      if (objectives.length >= mission.objectives) break;
      if (!objectives.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= gap / 2)) continue;
      const n = objectives.length + 1;
      objectives.push({ id: `obj${n}`, name: role(p) === "hill" ? `${n}号高地` : `${n}号地点`, ...p, radiusM: 500, weight: 1, initialHolder: null });
    }
  }
  // 重み:遭遇戦は両軍からいちばん同じくらいの所、攻撃と防御は攻める側にいちばん近い所(最初にぶつかる要地)を3、ほかは2・1
  objectives.forEach((o, i) => (o.weight = i === 0 ? 3 : i === 1 ? 2 : 1));
  if (defense) for (const o of objectives) o.initialHolder = sideId(defender);

  // 兵力:名簿から数を引き、点数で釣り合わせる(攻撃と防御は、攻める側が守る側の forceRatio 倍)
  const merged = mergePacks(packs, era.weapons, era.toe);
  const costOf = (toe: string) => {
    const t = merged.toes[toe];
    const dev = packs.rules[data.rules]?.development;
    return t && dev ? toeCost(t, merged.weapons, dev.cost) : 1;
  };
  const force: [string[], string[]] = [[], []];
  for (const i of [0, 1] as const) for (const e of era.sides[i].roster) for (let k = intBetween(rng, e.min, e.max); k > 0; k--) force[i].push(e.toe);
  const total = (i: 0 | 1) => force[i].reduce((s, t) => s + costOf(t), 0);
  const pick = (i: 0 | 1) => weighted(era.sides[i].roster, rng).toe;
  if (defense) {
    for (let k = 0; k < 10 && total(attacker) < total(defender) * mission.forceRatio; k++) force[attacker].push(pick(attacker));
  } else {
    for (let k = 0; k < 10; k++) {
      const [a, b] = [total(0), total(1)];
      if (Math.abs(a - b) / Math.max(a, b) <= 0.1) break;
      const poor: 0 | 1 = a < b ? 0 : 1;
      force[poor].push(pick(poor));
    }
  }

  // 配置
  const facing = (i: 0 | 1) => (map.axis === "ew" ? (i === 0 ? 90 : 270) : i === 0 ? 0 : 180);
  const placeable = (p: { x: number; y: number }, vehicle: boolean) => {
    const rl = role(p);
    if (rl === "river" || rl === "bigRiver" || rl === "peak") return false;
    return !vehicle || rl !== "wood" || biome.terrain.wood === "forest";
  };
  /** 近くの置ける所(らせん状に探す) */
  const snap = (p: { x: number; y: number }, vehicle: boolean, ok: (q: { x: number; y: number }) => boolean = () => true) => {
    for (let rad = 0; rad < 40; rad++) {
      for (let k = 0; k < Math.max(1, rad * 8); k++) {
        const ang = (k / Math.max(1, rad * 8)) * Math.PI * 2;
        const q = { x: p.x + Math.cos(ang) * rad * cell * 0.5, y: p.y + Math.sin(ang) * rad * cell * 0.5 };
        if (q.x <= 0 || q.y <= 0 || q.x >= size.widthM || q.y >= size.heightM) continue;
        const [c, r] = cellOf(q);
        const cq = center(c, r);
        if (placeable(cq, vehicle) && ok(cq) && !used.has(`${c},${r}`)) {
          used.add(`${c},${r}`);
          return cq;
        }
      }
    }
    return null;
  };
  const used = new Set<string>();
  const isVehicle = (toe: Toe | undefined) => !!toe && toe.supply.fuelPerKmT > 0;
  const isArtillery = (toe: Toe | undefined) => !!toe && toe.branch === "artillery";
  const units: Record<string, unknown>[] = [];
  const counter = new Map<string, number>();
  for (const i of [0, 1] as const) {
    const side = sideId(i);
    const list = force[i];
    const maneuver = list.filter((t) => !isArtillery(merged.toes[t]));
    const guns = list.filter((t) => isArtillery(merged.toes[t]));
    const homeA = (frac: number) => (i === 0 ? frac * depth : L - frac * depth);
    const holding = defense && i === defender;
    const escorting = escort && i === defender;
    if (escorting) {
      // 護送する部隊:出発点に縦隊で(道路の上が望ましいが、置ける所へ)
      const dest = objectives[0]!;
      const pos = snap(convoyStart, true);
      const conv = era.sides[i].convoy;
      if (pos && conv) units.push({ id: `${side}-convoy`, side, toe: conv, x: Math.round(pos.x), y: Math.round(pos.y), facing: Math.round((Math.atan2(dest.x - pos.x, dest.y - pos.y) * 180) / Math.PI + 360) % 360, formation: "column" });
    }
    maneuver.forEach((toeId, k) => {
      const toe = merged.toes[toeId];
      let target: { x: number; y: number };
      if (escorting) {
        // 護衛:出発点から送り届ける先までの道筋に沿って、敵の側へ少し出して並べる
        const dest = objectives[0]!;
        const f = (k + 1) / (maneuver.length + 1);
        const toEnemy = attacker === 0 ? -1 : 1;
        target = at(along(convoyStart) + (along(dest) - along(convoyStart)) * f + toEnemy * 800, across(convoyStart) + (across(dest) - across(convoyStart)) * f);
      } else if (holding) {
        // 守る側:目標の守備と、目標の前(攻める側の方)に並べる
        const o = objectives[k % objectives.length]!;
        const forward = (attacker === 0 ? -1 : 1) * (k < objectives.length ? 0 : 900);
        target = at(along(o) + forward, across(o) + (k >= objectives.length ? (rng.next() - 0.5) * 2000 : 0));
      } else if (escort && i === attacker && k < Math.round(maneuver.length * mission.ambushShare)) {
        // 伏せる部隊:護送の道筋の中ほどのそば(敵の側へ1.2〜1.8km)に
        const dest = objectives[0]!;
        const n = Math.max(1, Math.round(maneuver.length * mission.ambushShare));
        const f = 0.3 + (0.5 * (k + 0.5)) / n;
        const toUs = attacker === 0 ? -1 : 1;
        target = at(along(convoyStart) + (along(dest) - along(convoyStart)) * f - toUs * (1200 + rng.next() * 600), across(convoyStart) + (across(dest) - across(convoyStart)) * f);
      } else if (escort && i === attacker && mission.ambushAt !== undefined) {
        // 待ち伏せる側:護送の道筋の手前に、横いっぱいに散らして置く
        target = at(fromSide(defender, mission.ambushAt), ((k + 0.5) / maneuver.length) * P);
      } else {
        target = at(homeA(0.6), ((k + 0.5) / maneuver.length) * P);
      }
      const pos = snap(target, isVehicle(toe));
      const lying = escort && i === attacker && k < Math.round(maneuver.length * mission.ambushShare) && mission.ambushStance;
      if (pos)
        units.push(
          unitOf(side, toeId, pos, facing(i), holding ? { formation: "deployed", entrenchment: 1 } : lying ? { formation: "deployed", stance: mission.ambushStance } : spec.mission === "encounter" ? { formation: "column" } : { formation: "deployed" }),
        );
    });
    guns.forEach((toeId, k) => {
      const backA = holding ? along(objectives[0]!) + (attacker === 0 ? 1 : -1) * 3000 : escorting ? along(convoyStart) - (attacker === 0 ? -1 : 1) * 1500 : homeA(0.25);
      const pos = snap(at(backA, ((k + 1) / (guns.length + 1)) * P), true);
      if (pos) units.push(unitOf(side, toeId, pos, facing(i), { formation: "deployed" }));
    });
  }
  function unitOf(side: string, toe: string, pos: { x: number; y: number }, f: number, extra: Record<string, unknown>) {
    const short = toe.replace(/_(regiment|battalion|squadron|brigade|1944|m4|m18|task_force)/g, "").replace(/_/g, "");
    const key = `${side}-${short}`;
    const n = (counter.get(key) ?? 0) + 1;
    counter.set(key, n);
    return { id: `${key}${n}`, side, toe, x: Math.round(pos.x), y: Math.round(pos.y), facing: f, ...extra };
  }

  // 集積所:陣営の端の道路の入口(なければ配置帯の真ん中に近いノード)
  const depots = ([0, 1] as const).map((i) => {
    const entry = map.entries.find((e) => e.side === i);
    const nodeId =
      entry?.nodeId ??
      Object.entries(map.roads.nodes).sort(([, a], [, b]) => Math.abs(along(a) - (i === 0 ? 0 : L)) - Math.abs(along(b) - (i === 0 ? 0 : L)))[0]![0];
    return { id: `${sideId(i)}-depot`, side: sideId(i), nodeId, ammoT: data.depot.ammoT, fuelT: data.depot.fuelT };
  });

  // 勝利条件
  const victory: Record<string, unknown> = {};
  const others = map.towns.filter((t) => !objectives.some((o) => o.name === t.name)).sort((a, b) => imbalance(a) - imbalance(b));
  // 秘密の副目標の候補:目標でないほかの町(両軍に同じくらい近いものから3つ。どちらの陣営の候補にもなる)・敵を削る・損耗を抑える
  const extras = others.slice(0, 3).map((t, k) => ({ id: `extra${k + 1}`, name: t.name, x: t.x, y: t.y, radiusM: 500, weight: 0, initialHolder: null }));
  objectives.push(...extras);
  const secretPool = (_i: 0 | 1) => ({
    count: 1,
    options: [
      { id: "secret-attrition", type: "enemyLoss", min: 0.1, points: 2 },
      { id: "secret-preserve", type: "ownLoss", max: 0.08, points: 2 },
      ...extras.map((o) => ({ id: `secret-${o.id}`, type: "hold", objective: o.id, points: 2, perTurn: true })),
    ],
  });
  const mainObjectives = objectives.filter((o) => !o.id.startsWith("extra"));
  const holdPoints = mainObjectives.reduce((s, o) => s + o.weight * 2, 0);
  if (escort) {
    const dest = mainObjectives[0]!;
    const esc = sideId(defender);
    const amb = sideId(attacker);
    const convoyId = `${esc}-convoy`;
    const conv = era.sides[defender].convoy;
    const convoyBranch = conv ? merged.toes[conv]?.branch : undefined;
    victory[esc] = {
      conditions: [
        { id: "deliver", type: "unitReach", unit: convoyId, objective: dest.id, minStrength: 0.5, points: 6 },
        { id: "loss-ratio", type: "lossRatio", max: 1, points: 2 },
      ],
      decisive: { minPoints: 8, requires: ["deliver"] },
      limited: { minPoints: 0, requires: ["deliver"] },
      urgency: 0.5,
      secretPool: secretPool(defender),
    };
    victory[amb] = {
      conditions: [
        { id: "intercept", type: "unitLoss", unit: convoyId, minLoss: 0.5, points: 6, ...(convoyBranch ? { branch: convoyBranch } : {}) },
        // 送り届ける先を押さえれば、護送を止められる(AI が向かう先にもなる)
        { id: `hold-${dest.id}`, type: "hold", objective: dest.id, points: 2, perTurn: true },
        { id: "loss-ratio", type: "lossRatio", max: 1, points: 2 },
      ],
      decisive: { minPoints: 8, requires: ["intercept"] },
      limited: { minPoints: 0, requires: ["intercept"] },
      urgency: 0.5,
      secretPool: secretPool(attacker),
    };
  } else if (defense) {
    const main = mainObjectives[0]!;
    const att = sideId(attacker);
    const def = sideId(defender);
    victory[att] = {
      conditions: mainObjectives.map((o) => ({ id: `hold-${o.id}`, type: "hold", objective: o.id, points: o.weight * 2 })),
      decisive: { minPoints: holdPoints, requires: [`hold-${main.id}`] },
      limited: { minPoints: 0, requires: [`hold-${main.id}`] },
      urgency: mission.attackerUrgency,
      secretPool: secretPool(attacker),
    };
    victory[def] = {
      conditions: [
        ...mainObjectives.map((o) => ({ id: `hold-${o.id}`, type: "hold", objective: o.id, points: o.weight * 2 })),
        { id: "delay", type: "holdUntil", objective: main.id, turn: Math.ceil(mission.turns * 0.6), points: 2 },
      ],
      decisive: { minPoints: holdPoints + 2, requires: [`hold-${main.id}`, "delay"] },
      limited: { minPoints: 0, requires: [`hold-${main.id}`] },
      urgency: 0,
      secretPool: secretPool(defender),
    };
  } else {
    // 遭遇戦:持っていたターンの分だけ点がたまる。敵より損耗を抑えれば加点。決定的は全体の6割、限定的は3割5分
    const all = holdPoints + 2;
    for (const i of [0, 1] as const) {
      victory[sideId(i)] = {
        conditions: [
          ...mainObjectives.map((o) => ({ id: `hold-${o.id}`, type: "hold", objective: o.id, points: o.weight * 2, perTurn: true })),
          { id: "loss-ratio", type: "lossRatio", max: 1, points: 2 },
        ],
        decisive: { minPoints: round1(all * 0.6) },
        limited: { minPoints: round1(all * 0.35) },
        urgency: 0,
        secretPool: secretPool(i),
      };
    }
  }

  const file = {
    id: specId(spec),
    name: `${mission.name}(${biome.name})`,
    description: `${mission.description}。${era.name}・${size.name}の地図(${size.widthM / 1000}×${size.heightM / 1000}km)・シード ${spec.seed} で自動生成した戦場。${defense ? `${era.sides[attacker].name}が攻め、${era.sides[defender].name}が守る。` : escort ? `${era.sides[defender].name}が護送し、${era.sides[attacker].name}が待ち伏せる。` : ""}`,
    notes: "自動生成(packages/generator)。兵力・配置・勝利条件は生成の決まり(data/generators/missions.json)による仮置き",
    packs: { rules: data.rules, branches: data.branches, weapons: era.weapons, toe: era.toe },
    sides: era.sides.map((s) => ({ id: s.id, name: s.name })),
    time: { turnSeconds: 3600, stepSeconds: 60, startHour: data.startHour },
    map: map.map,
    roads: map.roads,
    rules: {
      maxTurns: mission.turns,
      objectives,
      victory,
      weather: { initial: "clear", changeChancePerHour: 0.05, minHoursBetweenChanges: 3, improveChance: 0.5 },
    },
    units,
    depots,
    customization: Object.fromEntries(era.sides.map((s) => [s.id, { units: "all", budgetMultiplier: 1 }])),
  };
  return { file, map, objectiveTimes: mainObjectives.map((o) => ({ id: o.id, minutes: minutesAt(o).map((m) => Math.round(m)) as [number, number] })) };
}

const intBetween = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng.next() * (hi - lo + 1));
const round1 = (x: number) => Math.round(x * 10) / 10;

function weighted<T extends { weight: number }>(list: readonly T[], rng: Rng): T {
  const sum = list.reduce((s, e) => s + e.weight, 0);
  let x = rng.next() * sum;
  for (const e of list) if ((x -= e.weight) <= 0) return e;
  return list[list.length - 1]!;
}

/** シナリオの packs と同じ重ね方で、武器・編成表を合わせる(後のパックが前を上書き) */
function mergePacks(packs: PackSet, weapons: string | string[], toe: string | string[]): { weapons: WeaponPack; toes: Record<string, Toe> } {
  const ws = (Array.isArray(weapons) ? weapons : [weapons]).map((id) => packs.weapons[id]).filter((p) => p !== undefined);
  const ts = (Array.isArray(toe) ? toe : [toe]).map((id) => packs.toes[id]).filter((p) => p !== undefined);
  return {
    weapons: { id: "merged", weapons: Object.assign({}, ...ws.map((p) => p.weapons)) },
    toes: Object.assign({}, ...ts.map((p) => p.toes)),
  };
}

/** 道路の通るマス(区間を細かくたどる) */
function rasterRoads(map: GeneratedMap, cell: number, rows: number, cols: number): Set<number> {
  const out = new Set<number>();
  for (const e of map.roads.edges) {
    const a = map.roads.nodes[e.from]!;
    const b = map.roads.nodes[e.to]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell / 3)));
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const y = a.y + ((b.y - a.y) * i) / n;
      const c = Math.min(cols - 1, Math.floor(x / cell));
      const r = Math.min(rows - 1, rows - 1 - Math.floor(y / cell));
      out.add(r * cols + c);
    }
  }
  return out;
}

/** 始まりのマス(複数)から各マスまでの所要時間(分。徒歩 60m/分、道路は 1.5 倍) */
function travelField(map: GeneratedMap, roads: Set<number>, cell: number, start: (c: number, r: number) => boolean): Float64Array {
  const rows = map.roles.length;
  const cols = map.roles[0]!.length;
  const speed = (i: number) => (roads.has(i) ? ROAD_SPEED : FOOT[map.roles[Math.floor(i / cols)]![i % cols]!]) * 60;
  const dist = new Float64Array(rows * cols).fill(Infinity);
  const queue: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (start(c, r) && speed(r * cols + c) > 0) {
    dist[r * cols + c] = 0;
    queue.push([0, r * cols + c]);
  }
  // 単純な優先度つきの探索(地図は数千マスなので、並べ替えで足りる)
  queue.sort((a, b) => a[0] - b[0]);
  const heap = new BinaryHeap(queue);
  while (heap.size > 0) {
    const [d, i] = heap.pop()!;
    if (d > dist[i]!) continue;
    const c = i % cols;
    const r = Math.floor(i / cols);
    // 8方向(道路は斜めにマスをたどるので、斜めにつながる道路のマスも渡れるように)
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      const v = (speed(i) + speed(j)) / 2;
      if (speed(j) <= 0 || v <= 0) continue;
      const nd = d + ((dc && dr ? Math.SQRT2 : 1) * cell) / v;
      if (nd < dist[j]!) {
        dist[j] = nd;
        heap.push([nd, j]);
      }
    }
  }
  return dist;
}

class BinaryHeap {
  private a: [number, number][] = [];
  constructor(init: [number, number][]) {
    for (const x of init) this.push(x);
  }
  get size() {
    return this.a.length;
  }
  push(x: [number, number]) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}
