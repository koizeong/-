import { existsSync, readdirSync, readFileSync } from "node:fs";
import { BiomePackSchema, type Biome } from "@brigade/generator";
import { TutorialSchema, type Tutorial } from "@brigade/protocol";
import { join } from "node:path";
import {
  buildScenario,
  parseBranchPack,
  parseRulePack,
  parseToePack,
  parseWeaponPack,
  type LoadedScenario,
  type PackSet,
  type ParseResult,
} from "@brigade/sim-core";

/**
 * data/ 以下のパックとシナリオを読む(ファイルの読み込みはサーバー側の役目。sim-core は読まない)。
 * overrides:data/ からの相対パス(例 "toe/x.json")→ 中身。ファイルの代わりに使う(編成エディターの保存前の検証用。新しいファイルも足せる)
 */
export function loadDataDir(dataDir: string, overrides: Record<string, unknown> = {}): { packs: PackSet; scenarios: Map<string, LoadedScenario> } {
  const rel = (path: string) => path.slice(join(dataDir).length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
  const json = (path: string): unknown => (rel(path) in overrides ? overrides[rel(path)] : JSON.parse(readFileSync(path, "utf-8")));
  const list = (sub: string) =>
    [
      ...new Set([
        ...readdirSync(join(dataDir, sub)).filter((f) => f.endsWith(".json")),
        ...Object.keys(overrides)
          .filter((k) => k.startsWith(`${sub}/`))
          .map((k) => k.slice(sub.length + 1)),
      ]),
    ]
      .sort()
      .map((f) => join(dataDir, sub, f));
  const load = <T extends { id: string }>(sub: string, parse: (x: unknown) => ParseResult<T>): Record<string, T> => {
    const out: Record<string, T> = {};
    for (const path of list(sub)) {
      const r = parse(json(path));
      if (!r.ok) throw new Error(`${path}:\n${r.errors.join("\n")}`);
      out[r.value.id] = r.value;
    }
    return out;
  };
  const packs: PackSet = {
    rules: load("rulepacks", parseRulePack),
    branches: load("branches", parseBranchPack),
    weapons: load("weapons", parseWeaponPack),
    toes: load("toe", parseToePack),
  };
  const scenarios = new Map<string, LoadedScenario>();
  for (const path of list("scenarios")) {
    const r = buildScenario(json(path), packs);
    if (!r.ok) throw new Error(`${path}:\n${r.errors.join("\n")}`);
    scenarios.set(r.value.def.id, r.value);
  }
  return { packs, scenarios };
}

/**
 * data/tutorials 以下の手引きを読む(なければ空)。形式に加えて、指しているシナリオ・陣営・ユニットがあるか、
 * 地図の印が地図の中かを確かめる。壊れていれば、どこが・なぜかを書いて例外にする
 */
export function loadTutorials(dataDir: string, scenarios: ReadonlyMap<string, LoadedScenario>): Tutorial[] {
  const dir = join(dataDir, "tutorials");
  if (!existsSync(dir)) return [];
  const out: Tutorial[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const path = join(dir, f);
    const r = TutorialSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
    if (!r.success) throw new Error(`${path}:\n${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
    const t = r.data;
    const errors: string[] = [];
    const sc = scenarios.get(t.scenarioId);
    if (!sc) errors.push(`scenarioId: シナリオ "${t.scenarioId}" がありません`);
    else {
      if (!sc.def.sides.some((x) => x.id === t.side)) errors.push(`side: 陣営 "${t.side}" はシナリオ "${t.scenarioId}" にありません`);
      const own = new Set(sc.units.filter((u) => u.side === t.side).map((u) => u.id));
      t.steps.forEach((st, i) => {
        if (st.until && "unitId" in st.until && !own.has(st.until.unitId)) errors.push(`steps.${i}.until.unitId: "${st.until.unitId}" は陣営 "${t.side}" の初めからいるユニットではありません`);
        const { widthM, heightM } = sc.ctx.terrain;
        if (st.mark && (st.mark.x < 0 || st.mark.y < 0 || st.mark.x > widthM || st.mark.y > heightM)) errors.push(`steps.${i}.mark: 地図の外です`);
      });
    }
    if (errors.length) throw new Error(`${path}:\n${errors.join("\n")}`);
    out.push(t);
  }
  return out;
}

/** data/generators/biomes.json の地形の傾向(自動生成マップ)。なければ空 */
export function loadBiomes(dataDir: string): Record<string, Biome> {
  const path = join(dataDir, "generators", "biomes.json");
  if (!existsSync(path)) return {};
  const r = BiomePackSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
  if (!r.success) throw new Error(`${path}:\n${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return r.data.biomes;
}
