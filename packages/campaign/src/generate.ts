import { Rng } from "@brigade/sim-core";
import { z } from "zod";
import { CampaignDefSchema, type CampaignDef } from "./schema.js";

/** 自動生成のキャンペーンの決まり(data/generators/campaigns.json) */
export const CampaignGeneratorSchema = z.object({
  description: z.string().optional(),
  sizes: z.record(
    z.string(),
    z.object({
      name: z.string(),
      /** 地域の列の数(奇数。両端が補給の源、真ん中が奪い合う列) */
      columns: z.number().int().min(3).refine((n) => n % 2 === 1, "列の数は奇数にしてください"),
      rows: z.number().int().min(1),
      stages: z.number().int().positive(),
      /** 陣営ごとの師団・旅団の型の並び(eras の formations のキー) */
      formations: z.array(z.string()).min(1),
    }),
  ),
  layout: z.object({ columnKm: z.number().positive(), rowKm: z.number().positive(), jitterKm: z.number().min(0), verticalLinkChance: z.number().min(0).max(1), diagonalLinkChance: z.number().min(0).max(1) }),
  /** 地域の勝利点:真ん中の列・相手の側の地域・相手の補給の源と、損耗比の条件 */
  points: z.object({ middle: z.number().min(0), enemySide: z.number().min(0), enemyBase: z.number().min(0), lossRatio: z.number().min(0) }),
  /** 地形の傾向の重み */
  biomes: z.record(z.string(), z.number().positive()),
  names: z.object({ stems: z.array(z.string()).min(1), suffixes: z.record(z.string(), z.array(z.string()).min(1)), base: z.string() }),
  eras: z.record(
    z.string(),
    z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      daysPerStage: z.number().int().positive(),
      /** 陣営 → 型 → 名前と隷下の部隊(編成表のキー) */
      formations: z.record(z.string(), z.record(z.string(), z.object({ name: z.string(), units: z.array(z.string()).min(1) }))),
    }),
  ),
});
export type CampaignGenerator = z.infer<typeof CampaignGeneratorSchema>;

export interface CampaignSpec {
  size: string;
  era: string;
  seed: number;
}

const ID_PREFIX = "gencamp";

/** 自動生成のキャンペーンの ID(gencamp:大きさ:編成:シード) */
export function campaignSpecId(spec: CampaignSpec): string {
  return `${ID_PREFIX}:${spec.size}:${spec.era}:${spec.seed}`;
}

export function parseCampaignSpecId(id: string): CampaignSpec | null {
  const m = /^gencamp:([a-z0-9-]+):([a-z0-9-]+):(\d{1,9})$/.exec(id);
  return m ? { size: m[1]!, era: m[2]!, seed: Number(m[3]) } : null;
}

/** 重みつきで1つ選ぶ */
function pick<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let r = rng.next() * entries.reduce((t, [, w]) => t + w, 0);
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

/**
 * シードからキャンペーンを作る。地域を columns 列 × rows 行に並べ、西の端の1地域を1つ目の陣営、東の端を2つ目の陣営の補給の源にする。
 * 真ん中の列は誰のものでもなく、そこから西は1つ目、東は2つ目の陣営のもの。結び・地形の傾向・師団・旅団の置き場所は
 * 西半分で決めて東へ鏡写しにする(どちらの陣営にも有利にしない)。sides は編成(era)の陣営の並び
 */
export function generateCampaign(spec: CampaignSpec, gen: CampaignGenerator, sides: readonly { id: string; name: string }[], biomes: readonly string[]): CampaignDef {
  const size = gen.sizes[spec.size];
  const era = gen.eras[spec.era];
  if (!size) throw new Error(`大きさ "${spec.size}" がありません`);
  if (!era) throw new Error(`編成 "${spec.era}" にはキャンペーンの決まりがありません`);
  if (sides.length !== 2) throw new Error("陣営は2つにしてください");
  const [A, B] = sides as [{ id: string; name: string }, { id: string; name: string }];
  for (const s of sides) if (!era.formations[s.id]) throw new Error(`陣営 "${s.id}" の師団・旅団の型がありません`);
  const rng = Rng.fromSeed(spec.seed);
  const { columns: C, rows: R } = size;
  const mid = (C - 1) / 2;
  const mirror = (c: number) => C - 1 - c;
  const { layout } = gen;
  const usable = Object.fromEntries(Object.entries(gen.biomes).filter(([b]) => biomes.includes(b)));
  if (Object.keys(usable).length === 0) throw new Error("使える地形の傾向がありません");

  // 地域:両端の列は補給の源の1地域だけ(真ん中の行)
  const baseRow = Math.floor((R - 1) / 2);
  const rowsOf = (c: number) => (c === 0 || c === C - 1 ? [baseRow] : [...Array(R).keys()]);
  const rid = (c: number, r: number) => `r${c}-${r}`;
  const biomeOf = new Map<string, string>();
  const jitter = new Map<string, { dx: number; dy: number }>();
  for (let c = 0; c <= mid; c++) {
    for (const r of rowsOf(c)) {
      const b = pick(rng, usable);
      const j = { dx: rng.spread(layout.jitterKm), dy: rng.spread(layout.jitterKm) };
      biomeOf.set(rid(c, r), b);
      biomeOf.set(rid(mirror(c), r), b);
      jitter.set(rid(c, r), j);
      jitter.set(rid(mirror(c), r), { dx: -j.dx, dy: j.dy });
    }
  }
  // 名前(重ならないように語幹を引く)
  const stems = [...gen.names.stems];
  const takeStem = () => (stems.length ? stems.splice(Math.floor(rng.next() * stems.length), 1)[0]! : `地点${rng.nextUint32() % 1000}`);
  const regions: CampaignDef["regions"] = {};
  const control: Record<string, string | null> = {};
  for (let c = 0; c < C; c++) {
    for (const r of rowsOf(c)) {
      const id = rid(c, r);
      const biome = biomeOf.get(id)!;
      const base = c === 0 ? A : c === C - 1 ? B : null;
      const suffixes = gen.names.suffixes[biome] ?? ["の町"];
      const name = base ? `${base.name}${gen.names.base}` : `${takeStem()}${suffixes[Math.floor(rng.next() * suffixes.length)]!}`;
      const j = jitter.get(id)!;
      regions[id] = { name, x: Math.round((c * layout.columnKm + (base ? 0 : j.dx)) * 10) / 10, y: base ? ((R - 1) / 2) * layout.rowKm : Math.round(((R - 1 - r) * layout.rowKm + j.dy) * 10) / 10, biome, ...(base ? { supply: base.id } : {}) };
      control[id] = c < mid ? A.id : c > mid ? B.id : null;
    }
  }

  // 結び:同じ列の上下(確率)、隣の列の同じ行(道路)・斜め(確率)。補給の源は隣の列の全部と。真ん中の行は鉄道
  const links: CampaignDef["links"] = [];
  const add = (a: string, b: string, kind: "road" | "rail" | "track") => links.push({ a, b, kind });
  for (let c = 1; c <= mid; c++) {
    for (let r = 0; r + 1 < R; r++) {
      if (rng.next() >= layout.verticalLinkChance) continue;
      add(rid(c, r), rid(c, r + 1), "track");
      if (c !== mid) add(rid(mirror(c), r), rid(mirror(c), r + 1), "track");
    }
  }
  for (let c = 0; c < mid; c++) {
    // 列 c と c+1 の間(鏡写しは mirror(c+1) と mirror(c) の間)
    const pair = (a: [number, number], b: [number, number], kind: "road" | "rail" | "track") => {
      add(rid(a[0], a[1]), rid(b[0], b[1]), kind);
      add(rid(mirror(a[0]), a[1]), rid(mirror(b[0]), b[1]), kind);
    };
    if (c === 0) {
      for (const r of rowsOf(1)) pair([0, baseRow], [1, r], r === baseRow ? "rail" : "road");
      continue;
    }
    for (let r = 0; r < R; r++) {
      pair([c, r], [c + 1, r], r === baseRow ? "rail" : "road");
      for (const r2 of [r - 1, r + 1]) if (r2 >= 0 && r2 < R && rng.next() < layout.diagonalLinkChance) pair([c, r], [c + 1, r2], "track");
    }
  }
  // 同じ結びが2つできないように(斜めの結びが行き来で重なることがある)
  const seen = new Set<string>();
  const uniqueLinks = links.filter((l) => {
    const k = [l.a, l.b].sort().join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 師団・旅団:歩兵は前の列(真ん中の手前)、機甲はその後ろ。行は順に散らす。東は鏡写し
  const formations: CampaignDef["formations"] = [];
  const counts: Record<string, Record<string, number>> = {};
  const front = Math.max(1, mid - 1);
  const back = Math.max(1, mid - 2);
  const slot: Record<string, number> = { infantry: 0, other: 0 };
  size.formations.forEach((kind) => {
    const isInf = kind === "infantry";
    const key = isInf ? "infantry" : "other";
    const c = isInf ? front : back;
    const rs = rowsOf(c);
    const r = rs[(slot[key]! + (isInf ? 0 : 1)) % rs.length]!;
    slot[key]!++;
    for (const [side, col] of [
      [A, c],
      [B, mirror(c)],
    ] as const) {
      const t = era.formations[side.id]![kind];
      if (!t) throw new Error(`陣営 "${side.id}" に師団・旅団の型 "${kind}" がありません`);
      const n = (counts[side.id] ??= {})[kind] = (counts[side.id]![kind] ?? 0) + 1;
      const id = `${side.id}-${kind}${n}`;
      formations.push({ id, side: side.id, name: `第${n}${t.name}`, region: rid(col, r), units: t.units.map((toe, i) => ({ id: `${id}-${i + 1}`, toe })) });
    }
  });

  // 勝利の条件:真ん中の列・相手の側の地域・相手の補給の源・損耗比。限定的=真ん中の列を全部、決定的=それに相手の補給の源の分
  const victory: CampaignDef["victory"] = {};
  const midRegions = rowsOf(mid).map((r) => rid(mid, r));
  for (const [side, enemy] of [
    [A, B],
    [B, A],
  ] as const) {
    const enemyRegions = Object.keys(regions).filter((r) => control[r] === enemy.id);
    const conditions: CampaignDef["victory"][string]["conditions"] = [
      ...midRegions.map((r) => ({ id: r, type: "region" as const, region: r, points: gen.points.middle })),
      ...enemyRegions.map((r) => ({ id: r, type: "region" as const, region: r, points: regions[r]!.supply ? gen.points.enemyBase : gen.points.enemySide })),
      { id: "loss", type: "lossRatio" as const, max: 1, points: gen.points.lossRatio },
    ];
    const limited = midRegions.length * gen.points.middle;
    victory[side.id] = { conditions, decisive: { minPoints: limited + gen.points.enemyBase, requires: [] }, limited: { minPoints: limited, requires: [] } };
  }

  return CampaignDefSchema.parse({
    id: campaignSpecId(spec),
    name: `作戦演習・${size.name}(自動生成・${spec.seed})`,
    description: `シード ${spec.seed} から作った架空の作戦。${C}列の地域の真ん中の列を奪い合い、相手の補給基地を狙う。地図と兵力は左右で鏡写し`,
    era: spec.era,
    sides: [A, B],
    calendar: { startDate: era.startDate, daysPerStage: era.daysPerStage, stages: size.stages },
    regions,
    links: uniqueLinks,
    control,
    formations,
    victory,
  });
}
